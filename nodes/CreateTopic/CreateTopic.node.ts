// @ts-nocheck
import { IExecuteFunctions } from 'n8n-core';
import * as tar from 'tar';

import { IDataObject, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';
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

// async function uploadFromMemory(credentials: any, contents: Buffer, destFileName: string) {
// 	const storage = new Storage({
// 		credentials: JSON.parse(credentials.serviceAccount as string),
// 	});
// 	if (!storage) {
// 		throw new Error('Storage not initialized');
// 	}
// 	await storage.bucket('marshall-n8n').file(destFileName).save(contents);
// 	console.log(`${destFileName} with contents ${contents} uploaded to marshall-n8n.`);
// }

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

export class CreateTopic implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Create Topic',
		name: 'createTopic',
		icon: 'file:search.svg',
		group: ['transform'],
		version: 1,
		description: 'Create a new Monitor Topic with boolean query',
		defaults: {
			name: 'Create Topic',
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
				name: 'QuidMonitorAccount',
				required: true,
				description: 'Quid Monitor Account credentials',
			},
		],
		properties: [
			{
				displayName: 'Monitor Topic Name',
				name: 'monitorTopicName',
				type: 'string',
				default: '',
				required: true,
				description: 'Name of the topic to monitor',
			},
			{
				displayName: 'Use File As Input',
				name: 'useFileAsInput',
				type: 'boolean',
				default: false,
				description: 'Whether to use the file as input for the execution',
			},
			{
				displayName: 'File Name',
				name: 'fileName',
				type: 'string',
				default: 'test-artifact',
				required: true,
				displayOptions: {
					show: {
						useFileAsInput: [true],
					},
				},
				description: 'The file of contain the input',
			},
			{
				displayName: 'Boolean Query',
				name: 'booleanQuery',
				type: 'string',
				typeOptions: {
					rows: 4,
				},
				default: '',
				required: true,
				displayOptions: {
					show: {
						useFileAsInput: [false],
					},
				},
				description: 'The boolean query to create the topic',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData = [];

		for (let i = 0; i < items.length; i++) {
			let responseData;
			const monitorTopicName = this.getNodeParameter('monitorTopicName', i) as string;
			const useFileAsInput = this.getNodeParameter('useFileAsInput', i) as boolean;
			const fileName = useFileAsInput ? (this.getNodeParameter('fileName', i) as string) : '';
			const booleanQuery = useFileAsInput
				? ''
				: (this.getNodeParameter('booleanQuery', i) as string);

			// Handle binary data if useFileAsInput enabled
			if (useFileAsInput && items[i].binary) {
				// Convert each binary property to an artifact with raw content
				// items[i].binary is an object, when there are multiple files we need to specify which file to use
				for (const [_, binaryData] of Object.entries(items[i].binary)) {
					const buffer = Buffer.from(binaryData.data, 'base64');

					const credentials = await this.getCredentials('OssServiceAccount');
					await uploadOssObjects({
						buffer,
						destFileName: fileName,
						credentials,
					});
				}
			}

			console.log('monitorTopicName', monitorTopicName);

			const monitorAccountCredentials = await this.getCredentials('QuidMonitorAccount');

			// Create Execution
			const anonymousExecutionRequestBody = {
				workspace: 'marshall',
				name: 'test-create-topic',
				description: '',
				gitRepo: '',
				retryConfig: 'DEFAULT',
				inputs: {
					parameters: [],
					artifacts: [],
				},
				outputs: {
					parameters: [
						{
							name: 'topicId',
							type: 'string',
							valueFrom: {
								parameter: '{{ steps.create-boolean-topic.outputs.parameters.topicId }}',
							},
						},
						{
							name: 'topicUrl',
							type: 'string',
							valueFrom: {
								parameter: '{{ steps.create-boolean-topic.outputs.parameters.topicUrl }}',
							},
						},
					],
					artifacts: [],
				},
				steps: [
					[
						{
							name: 'download-artifact-from-oss',
							task: 'WORKFLOW_TEMPLATE.canal-flow.cloud-storage-transferrer[download]',
							arguments: {
								parameters: [
									{
										name: 'storageConfig',
										value: {
											s3: {
												endpoint: 'oss-us-east-1.aliyuncs.com',
												bucket: 'workbench-artifacts',
												key: fileName,
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
							name: 'create-boolean-topic',
							task: 'CANAL_TASK.monitor-analysis.create-boolean-topic',
							arguments: {
								parameters: [
									{
										name: 'userEmail',
										value: monitorAccountCredentials.email,
									},
									{
										name: 'name',
										value: monitorTopicName,
									},
								],
								artifacts: useFileAsInput
									? [
											{
												name: 'booleanQuery',
												from: '{{ steps.download-artifact-from-oss.outputs.artifacts.result }}',
											},
									  ]
									: [
											{
												name: 'booleanQuery',
												raw: {
													data: booleanQuery,
												},
											},
									  ],
							},
						},
					],
				],
			};

			const options = {
				headers: {
					Accept: 'application/json',
					'Content-Type': 'application/json',
					Authorization: `Basic ${Buffer.from(
						`${monitorAccountCredentials.email}:${monitorAccountCredentials.password}`,
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
				(type, apiObj, watchObj) => {
					console.log('watchObj', watchObj);
					const objectCondition = watchObj?.object?.status?.phase;

					isCompleted =
						objectCondition === 'Succeeded' ||
						objectCondition === 'Failed' ||
						objectCondition === 'Error';

					// output parameters and artifacts
					if (isCompleted) {
						console.log(
							'workflow completed',
							workflowName,
							watchObj?.object?.status?.nodes,
							watchObj?.object?.status?.nodes?.[`${workflowName}`]?.outputs?.parameters,
						);
						returnData.push(
							transformOutputParameters(
								watchObj?.object?.status?.nodes?.[`${workflowName}`]?.outputs?.parameters,
							),
						);
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

		return [this.helpers.returnJsonArray(returnData)];
	}
}

/*
TODO:
- [x] inputs artifacts
- [] make the node able to output artifacts, when there is one or multiple one
- [x] improve the interface of the node, inputs and outputs
- [x] if the output is a array, the expression drag and drop will not work
    eg. the output is [{ name: "productCombination", value: "abc"}]
		drag and drop will be {{ $json..name }} but it should be {{ $json.first().name }}

		in conclusion, the output should be a object, can have best UX
*/
