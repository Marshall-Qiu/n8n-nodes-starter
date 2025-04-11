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

export class UploadFileToOSS implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Upload File To OSS',
		name: 'uploadFileToOSS',
		icon: 'file:search.svg',
		group: ['transform'],
		version: 1,
		description: 'Create a new Monitor Topic with boolean query',
		defaults: {
			name: 'Upload File To OSS',
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
		properties: [],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData = [];

		for (let i = 0; i < items.length; i++) {
			// Handle binary data if useFileAsInput enabled
			if (items[i].binary && Object.keys(items[i].binary).length > 0) {
				// Convert each binary property to an artifact with raw content
				// items[i].binary is an object, when there are multiple files we need to specify which file to use
				for (const [_, binaryData] of Object.entries(items[i].binary)) {
					const buffer = Buffer.from(binaryData.data, 'base64');
					const fileName = binaryData.fileName;

					const credentials = await this.getCredentials('OssServiceAccount');
					await uploadOssObjects({
						buffer,
						destFileName: fileName,
						credentials,
					});

					returnData.push({ fileName, success: true });
				}
			}
		}

		return [
			this.helpers.returnJsonArray(
				returnData.length > 0 ? returnData : [{ json: { message: 'No files uploaded' } }],
			),
		]; // we must return a item or it will break the chain of accessing the output
	}
}
