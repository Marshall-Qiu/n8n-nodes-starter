// @ts-nocheck
import { IExecuteFunctions } from 'n8n-core';

import {
	IDataObject,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';
import * as k8s from '@kubernetes/client-node';
import { Storage } from '@google-cloud/storage';
import {
	S3Client,
	ListObjectsV2Command,
	STSClient,
	PutObjectCommand,
	GetObjectCommand,
} from '@aws-sdk/client-s3';
import zlib from 'zlib';
import * as tar from 'tar';
import { Readable } from 'stream';

const kc = new k8s.KubeConfig();
kc.loadFromDefault();
const watch = new k8s.Watch(kc);

async function extractTgzBuffer(buffer) {
	return new Promise((resolve, reject) => {
		// Create readable stream from buffer
		const bufferStream = Readable.from(buffer);
		let fileContent = '';

		// Create extraction pipeline
		bufferStream
			.pipe(zlib.createGunzip())
			.pipe(
				tar.x({
					onentry: (entry) => {
						entry.on('data', (chunk) => {
							fileContent += chunk.toString();
						});
					},
				}),
			)
			.on('error', reject)
			.on('finish', () => {
				resolve(fileContent);
			});
	});
}

async function uploadOssObjects({ buffer, destFileName, credentials }) {
	const s3Client = new S3Client({
		endpoint: 'https://oss-us-east-1.aliyuncs.com',
		region: 'us-east-1',
		credentials: {
			accessKeyId: credentials.accessKeyId,
			secretAccessKey: credentials.accessKeySecret,
		},
	});

	const uploadCommand = new PutObjectCommand({
		Bucket: 'workbench-artifacts',
		Key: destFileName,
		Body: buffer,
	});
	const uploadResponse = await s3Client.send(uploadCommand);
	console.log('Oss uploaded', uploadResponse);

	const getCommand = new GetObjectCommand({
		Bucket: 'workbench-artifacts',
		Key: destFileName,
	});

	const response = await s3Client.send(getCommand);
	const chunks = [];
	for await (const chunk of response.Body) {
		chunks.push(chunk);
	}
	const downloadedBuffer = Buffer.concat(chunks);
	console.log('Oss get content', downloadedBuffer);
}

// a script to parse task's input schema converted to arguments format
const transformOutputParameters = (parameters) => {
	return parameters?.reduce((acc, item) => {
		const name = item.name;
		const value = item.value;

		return {
			...acc,
			[name]: {
				name,
				value,
			},
		};
	}, {});
};

export class QuidQuestions implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Quid Questions',
		name: 'quid-questions',
		icon: 'file:ask-quid-logo.svg',
		group: ['transform'],
		version: 1,
		description: 'Quid Questions',
		defaults: {
			name: 'Quid Questions',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'QuidMonitorAccount',
				required: true,
				description: 'Quid Monitor Account credentials',
			},
		],
		properties: [
			{
				displayName: 'Prompt',
				name: 'prompt',
				type: 'string',
				typeOptions: {
					rows: 4,
				},
				default: '',
				required: true,
				description: 'The prompt text for the question',
			},
			{
				displayName: 'Assistant Type',
				name: 'assistantType',
				type: 'options',
				options: [
					{
						name: 'Topic Datasets Assistant',
						value: 'topic-datasets-assistant',
						description: 'For asking topic related questions',
					},
					{
						name: 'Broad Social Datasets Assistant',
						value: 'broad-social-datasets-assistant',
						description: 'For asking real-time news and social related questions',
					},
				],
				default: 'topic-datasets-assistant',
				required: true,
				description: 'Choose the assistant to use',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData = [];

		// When starting workflow

		for (let i = 0; i < items.length; i++) {
			const prompt = this.getNodeParameter('prompt', i) as string;
			const assistantType = this.getNodeParameter('assistantType', i) as string;

			const monitorAccountCredentials = await this.getCredentials('QuidMonitorAccount');

			// Create Execution
			const anonymousExecutionRequestBody = {
				workspace: 'marshall',
				name: 'gpt-chat',
				description: '',
				gitRepo: '',
				retryConfig: 'DEFAULT',
				inputs: {
					parameters: [],
					artifacts: [],
				},
				outputs: {
					artifacts: [
						{
							name: 'raw-result',
							from: '{{ steps.gpt-chat.outputs.artifacts.raw-result }}',
						},
						{
							name: 'answer-markdown',
							from: '{{ steps.gpt-chat.outputs.artifacts.answer-markdown }}',
						},
						{
							name: 'answer-html',
							from: '{{ steps.gpt-chat.outputs.artifacts.answer-html }}',
						},
					],
				},
				steps: [
					[
						{
							name: 'gpt-chat',
							task: 'WORKFLOW_TEMPLATE.quid-questions.main-askquid[ask]',
							arguments: {
								parameters: [
									{
										name: 'user-context',
										value: {
											name: monitorAccountCredentials.email,
											email: monitorAccountCredentials.email,
											accessible_applications: ['QuidMonitor', 'QuidDiscover'],
										},
									},
									{
										name: 'prompt',
										value: prompt,
									},
									{
										name: 'assistant-settings',
										value: {
											key: assistantType,
										},
									},
								],
							},
						},
					],
				],
			};

			const credentials = await this.getCredentials('QuidMonitorAccount');
			const options = {
				headers: {
					Accept: 'application/json',
					'Content-Type': 'application/json',
					Authorization: `Basic ${Buffer.from(
						`${credentials.email}:${credentials.password}`,
					).toString('base64')}`,
				},
				method: 'POST',
				body: anonymousExecutionRequestBody,
				uri: 'https://canal-flow-api.dev-spark.ali-netbase.com/workspace/marshall/anonymous/execution',
				json: true,
			};

			const anonymousExecutionCreationResponse = await this.helpers.request(options);

			console.log('anonymousExecutionCreationResponse', anonymousExecutionCreationResponse);

			const workflowName = anonymousExecutionCreationResponse.id;
			// due to anonymous execution will not create execution object we need to watch workflow directly
			console.log('execution created successfully', {
				id: anonymousExecutionCreationResponse.id,
				workflowUid: anonymousExecutionCreationResponse.workflowUid,
			});

			// Watch Workflow Condition Until Completed
			/*
				TODO:
					- consider use polling instead of watch to wait for execution to complete ?
					- add timeout setting for waiting
			*/
			let isCompleted = false;
			let outputArtifacts;
			let workflowId;
			const req = await watch.watch(
				'/apis/argoproj.io/v1alpha1/namespaces/canal-flow/workflows',
				// optional query parameters can go here.
				{
					fieldSelector: `metadata.name=${workflowName}`,
				},
				// callback is called for each received object.
				async (type, apiObj, watchObj) => {
					const objectCondition = watchObj?.object?.status?.phase;

					isCompleted =
						objectCondition === 'Succeeded' ||
						objectCondition === 'Failed' ||
						objectCondition === 'Error';

					// output parameters and artifacts
					if (isCompleted) {
						workflowId = watchObj?.object?.metadata?.uid;
						const workflowName = watchObj?.object?.metadata?.name;
						const nodeOutputs = watchObj?.object?.status?.nodes?.[`${workflowName}`]?.outputs;

						// Handle both parameters and artifacts
						const outputParameters = nodeOutputs?.parameters || [];
						outputArtifacts = nodeOutputs?.artifacts || [];

						req.abort();
						console.log('Workflow Completed In Callback');
					}
				},
				// done callback is called if the watch terminates normally
				(err) => {
					console.error('Execute function error:', err);
				},
			);

			// hold to wait for the execution to complete, check every 2 seconds
			while (!isCompleted) {
				await new Promise((resolve) => setTimeout(resolve, 2000));
			}

			const binaryData: IDataObject = {};
			const jsonData: IDataObject = {};

			// Get credentials for API request
			const authHeader = `Basic ${Buffer.from(
				`${credentials.email}:${credentials.password}`,
			).toString('base64')}`;

			for (const artifact of outputArtifacts) {
				const artifactUrl = `https://canal-flow-argo-api.dev-spark.ali-netbase.com/artifacts-by-uid/${workflowId}/${workflowName}/${artifact.name}`;

				console.log('requesting artifact', artifactUrl);

				// Make request to get artifact, return binary data
				const response = await this.helpers.request({
					method: 'GET',
					uri: artifactUrl,
					headers: {
						Authorization: authHeader,
					},
					resolveWithFullResponse: true,
					encoding: null,
				});

				// Get proper mimeType based on the artifact name
				let mimeType = response.headers['content-type'] || 'application/octet-stream';
				if (artifact.name.includes('markdown')) {
					mimeType = 'text/markdown';
				} else if (artifact.name.includes('html')) {
					mimeType = 'text/html';
				} else if (artifact.name.includes('raw-result')) {
					mimeType = 'application/json';
				}

				const contentDisposition = response.headers['content-disposition'];
				const fileNameMatch = contentDisposition?.match(/filename="(.+)"/);
				const extension = fileNameMatch?.[1]?.split('.').pop();
				const fileName = fileNameMatch?.[1] || `${artifact.name}${extension}`;

				// TODO try to decompress the response.body
				if (extension === 'tgz') {
					const decompressedData = await extractTgzBuffer(response.body);
					jsonData[artifact.name] = decompressedData.toString();
				} else {
					jsonData[artifact.name] = response.body.toString();
				}

				// Correct order: data, fileName, mimeType
				binaryData[artifact.name] = await this.helpers.prepareBinaryData(
					response.body,
					fileName,
					mimeType,
				);
			}

			console.log('binaryData', binaryData);

			returnData.push({
				json: Object.keys(jsonData).length ? jsonData : undefined,
				binary: Object.keys(binaryData).length ? binaryData : undefined,
			});

			console.log('Workflow Completed');
		}
		console.log('final returnData', returnData);

		return [returnData];
	}
}
