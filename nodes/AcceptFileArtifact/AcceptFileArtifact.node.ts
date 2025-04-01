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

async function uploadAndListOssObjects({ buffer, destFileName, credentials }) {
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

	const listCommand = new ListObjectsV2Command({
		Bucket: 'workbench-artifacts',
	});
	const listResponse = await s3Client.send(listCommand);

	console.log('Oss list content', listResponse);
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

// The n8n project uses CommonJS, but the latest k8s client version only supports ESM.
// TypeScript will convert imports to CommonJS which causes errors.
// Therefore, we downgraded the k8s client to version 18.1.0, the last version that supports CommonJS.
// wait for new node js version to support commonjs import esm

// TODO:
// - study how to use oss bucket, since company already using oss bucket

const kc = new k8s.KubeConfig();
kc.loadFromDefault();
const k8sCustomObjectsApi = kc.makeApiClient(k8s.CustomObjectsApi);
const watch = new k8s.Watch(kc);

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

export class AcceptFileArtifact implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Accept File Artifact',
		name: 'acceptFileArtifact',
		icon: 'file:search.svg',
		group: ['transform'],
		version: 1,
		description: 'Accept a file artifact from previous node',
		defaults: {
			name: 'Accept File Artifact',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'OssServiceAccount',
				required: true,
				description: 'Oss Service account credentials',
			},
		],
		properties: [
			{
				// if we decide encapsulate the task into a node we can remove this input
				displayName: 'Task Name',
				name: 'taskName',
				type: 'string',
				required: true,
				default: 'WORKFLOW_TEMPLATE.marshall.test-artifact[main]',
				placeholder: 'WORKFLOW_TEMPLATE.marshall.test-artifact[main]',
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
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData = [];

		console.log('items', items, items[0].binary.data);

		for (let i = 0; i < items.length; i++) {
			let responseData;
			const useFileAsInput = this.getNodeParameter('useFileAsInput', i) as boolean;
			const taskName = this.getNodeParameter('taskName', i) as string;
			const fileName = this.getNodeParameter('fileName', i) as string;

			// Handle binary data if enabled
			if (useFileAsInput && items[i].binary) {
				// Convert each binary property to an artifact with raw content
				for (const [key, binaryData] of Object.entries(items[i].binary)) {
					console.log('binaryData', binaryData.data);
					const buffer = Buffer.from(binaryData.data, 'base64');

					// if the oss bucket we use for saving workflow template's artifact is same as the n8n host pv
					// user can upload the file to oss bucket and the node input can be only the file name
					// We need to add a extra layer logic for ask workflowTemplate to get the artifact from cloud storage,
					// when user contribute a workflow template if they want to integrate with n8n they need to add that
					// extra logic in the workflow template, otherwise the workflowtemplate can only use raw.data

					// TODO: handle decompression of the file, or define the rule on fileExtension

					const credentials = await this.getCredentials('OssServiceAccount');
					await uploadAndListOssObjects({
						buffer,
						destFileName: fileName,
						credentials,
					});
				}
			}

			const execution = {
				apiVersion: 'netbasequid.canalflow/v1',
				kind: 'Execution',
				metadata: {
					namespace: 'canal-flow',
					labels: {},
					generateName: 'marshall.test-artifact',
				},
				spec: {
					task: taskName, // a script to fillout the name of the task
					arguments: {
						parameters: [
							{
								name: 'fileName',
								value: fileName,
							},
						],
					},
					ignoreSchemaValidation: true,
					activeDeadlineSeconds: 7200,
				},
			};

			// Create Execution
			try {
				responseData = await k8sCustomObjectsApi.createNamespacedCustomObject(
					'netbasequid.canalflow', // group
					'v1', // version
					'canal-flow', // namespace
					'executions', // plural
					execution,
				);
			} catch (error: any) {
				throw new Error(
					`K8s API Error: ${error.message}\nStatus: ${error.status}\nBody: ${JSON.stringify(
						error.body,
						null,
						2,
					)}`,
				);
			}

			const executionName = responseData.body.metadata.name;

			console.log('executionName', executionName);

			let isCompleted = false;

			/* 
			TODO: 
				- consider use polling instead of watch to wait for execution to complete ?
				- add timeout setting for waiting
			*/
			// Watch Execution Condition Until Completed
			const req = await watch.watch(
				'/apis/netbasequid.canalflow/v1/namespaces/canal-flow/executions',
				// optional query parameters can go here.
				{
					fieldSelector: `metadata.name=${executionName}`,
				},
				// callback is called for each received object.
				(type, apiObj, watchObj) => {
					const objectCondition = watchObj?.object?.status?.conditions?.find(
						(condition) => condition.type === 'Completed',
					);

					isCompleted = objectCondition?.status === 'true';

					// output parameters and artifacts
					if (isCompleted) {
						returnData.push(
							transformOutputParameters(watchObj?.object?.status?.outputs?.parameters),
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
