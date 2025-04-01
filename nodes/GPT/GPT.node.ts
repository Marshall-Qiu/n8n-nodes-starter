// @ts-nocheck
import { IExecuteFunctions } from 'n8n-core';
import * as tar from 'tar';

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

const kc = new k8s.KubeConfig();
kc.loadFromDefault();
const watch = new k8s.Watch(kc);

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

// Helper function to get file extension from mime type
function getFileExtension(mimeType: string): string {
	const mimeToExt: { [key: string]: string } = {
		'text/plain': '.txt',
		'application/json': '.json',
		'application/pdf': '.pdf',
		'image/jpeg': '.jpg',
		'image/png': '.png',
		// Add more as needed
	};
	return mimeToExt[mimeType] || '';
}

export class GPT implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Chat GPT',
		name: 'gpt',
		icon: 'file:search.svg',
		group: ['transform'],
		version: 1,
		description: 'Chat GPT',
		defaults: {
			name: 'Chat GPT',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'OssServiceAccount',
				required: true,
				description: 'Oss Service account credentials',
			},
			{
				name: 'CanalFlowApi',
				required: true,
				description: 'Canal Flow API credentials',
			},
		],
		properties: [
			{
				displayName: 'System Prompt File Name',
				name: 'systemPromptFile',
				type: 'string',
				default: 'system-prompt.txt',
				required: true,
				description: 'The file of contain the input',
			},
			{
				displayName: 'User Prompt File Name',
				name: 'userPromptFile',
				type: 'string',
				default: 'user-prompt.txt',
				required: true,
				description: 'The file of contain the input',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData = [];

		// When starting workflow

		for (let i = 0; i < items.length; i++) {
			let responseData;
			const systemPromptFile = this.getNodeParameter('systemPromptFile', i) as string;
			const userPromptFile = this.getNodeParameter('userPromptFile', i) as string;
			console.log('systemPromptFile', systemPromptFile);
			console.log('userPromptFile', userPromptFile);

			console.log('items', JSON.stringify(items, null, 2));
			const binaryData = items[i].binary;
			if (binaryData) {
				for (const propertyName of Object.keys(binaryData)) {
					const binaryFile = items[i].binary[propertyName];
					const buffer = await this.helpers.getBinaryDataBuffer(i, propertyName);

					// Now you can use the buffer with your existing uploadOssObjects function
					const credentials = await this.getCredentials('OssServiceAccount');
					await uploadOssObjects({
						buffer,
						destFileName: binaryFile.fileName || 'default-name',
						credentials,
					});
				}
			}

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
							name: 'message',
							from: '{{ steps.gpt-chat.outputs.artifacts.message }}',
						},
						{
							name: 'response',
							from: '{{ steps.gpt-chat.outputs.artifacts.response }}',
						},
					],
				},
				steps: [
					[
						{
							name: 'download-system-prompt-from-oss',
							task: 'WORKFLOW_TEMPLATE.canal-flow.cloud-storage-transferrer[download]',
							arguments: {
								parameters: [
									{
										name: 'storageConfig',
										value: {
											s3: {
												endpoint: 'oss-us-east-1.aliyuncs.com',
												bucket: 'workbench-artifacts',
												key: systemPromptFile,
												region: 'us-east-1',
												insecure: false,
												accessKeySecret: {
													name: 'automate-oss-service-account-access-key',
													key: 'ACCESS_KEY_ID',
												},
												secretKeySecret: {
													name: 'automate-oss-service-account-access-key',
													key: 'SECRET_ACCESS_KEY',
												},
											},
										},
									},
								],
							},
						},
						{
							name: 'download-user-prompt-from-oss',
							task: 'WORKFLOW_TEMPLATE.canal-flow.cloud-storage-transferrer[download]',
							arguments: {
								parameters: [
									{
										name: 'storageConfig',
										value: {
											s3: {
												endpoint: 'oss-us-east-1.aliyuncs.com',
												bucket: 'workbench-artifacts',
												key: userPromptFile,
												region: 'us-east-1',
												insecure: false,
												accessKeySecret: {
													name: 'automate-oss-service-account-access-key',
													key: 'ACCESS_KEY_ID',
												},
												secretKeySecret: {
													name: 'automate-oss-service-account-access-key',
													key: 'SECRET_ACCESS_KEY',
												},
											},
										},
									},
								],
							},
						},
					],
					[
						{
							name: 'gpt-chat',
							task: 'WORKFLOW_TEMPLATE.quid-questions.main-gpt[completion]',
							arguments: {
								artifacts: [
									{
										name: 'system-prompt',
										from: '{{ steps.download-system-prompt-from-oss.outputs.artifacts.result }}',
									},
									{
										name: 'user-prompt',
										from: '{{ steps.download-user-prompt-from-oss.outputs.artifacts.result }}',
									},
								],
							},
						},
					],
				],
			};

			const credentials = await this.getCredentials('CanalFlowApi');
			const options = {
				headers: {
					Accept: 'application/json',
					'Content-Type': 'application/json',
					Authorization: `Basic ${Buffer.from(
						`${credentials.username}:${credentials.password}`,
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
			const req = await watch.watch(
				'/apis/argoproj.io/v1alpha1/namespaces/canal-flow/workflows',
				// optional query parameters can go here.
				{
					fieldSelector: `metadata.name=${workflowName}`,
				},
				// callback is called for each received object.
				async (type, apiObj, watchObj) => {
					console.log('watchObj', watchObj);
					const objectCondition = watchObj?.object?.status?.phase;

					isCompleted =
						objectCondition === 'Succeeded' ||
						objectCondition === 'Failed' ||
						objectCondition === 'Error';

					// output parameters and artifacts
					if (isCompleted) {
						console.log('workflow completed', JSON.stringify(watchObj.object, null, 2));

						const workflowId = watchObj?.object?.metadata?.uid;
						const nodeOutputs = watchObj?.object?.status?.nodes?.[`${workflowName}`]?.outputs;

						// Handle both parameters and artifacts
						const outputParameters = nodeOutputs?.parameters || [];
						const outputArtifacts = nodeOutputs?.artifacts || [];

						const binaryData: IDataObject = {};
						const jsonData: IDataObject = {};

						// Get credentials for API request
						const authHeader = `Basic ${Buffer.from(
							`${credentials.username}:${credentials.password}`,
						).toString('base64')}`;

						for (const artifact of outputArtifacts) {
							try {
								const artifactUrl = `https://canal-flow-api.dev-spark.ali-netbase.com/execution/${workflowId}/artifact/${artifact.name}`;

								console.log('requesting artifact', artifactUrl);

								// Make request to get artifact
								const response = await this.helpers.request({
									method: 'GET',
									uri: artifactUrl,
									headers: {
										Authorization: authHeader,
									},
								});

								// Get content type from response headers
								const contentType = response.headers['content-type'] || 'application/octet-stream';

								// Convert response to buffer
								const buffer = Buffer.from(response.body);

								console.log('buffer', buffer, artifact.name);

								// Prepare binary data
								binaryData[artifact.name] = await this.helpers.prepareBinaryData(
									buffer,
									`${artifact.name}${getFileExtension(contentType)}`,
									contentType,
								);
							} catch (error) {
								console.error(`Failed to fetch artifact ${artifact.name}:`, error);
							}
						}

						returnData.push({
							json: transformOutputParameters(outputParameters),
							binary: Object.keys(binaryData).length ? binaryData : undefined,
						});

						req.abort();
					}
				},
				// done callback is called if the watch terminates normally
				(err) => {
					console.log(err);
					req.abort();
				},
			);

			// hold to wait for the execution to complete, check every 2 seconds
			while (!isCompleted) {
				await new Promise((resolve) => setTimeout(resolve, 2000));
			}
		}

		return [returnData];
	}
}
