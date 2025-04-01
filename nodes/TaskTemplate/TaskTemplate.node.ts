// @ts-nocheck
import { IExecuteFunctions } from 'n8n-core';

import { IDataObject, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';
import * as k8s from '@kubernetes/client-node';
// The n8n project uses CommonJS, but the latest k8s client version only supports ESM.
// TypeScript will convert imports to CommonJS which causes errors.
// Therefore, we downgraded the k8s client to version 18.1.0, the last version that supports CommonJS.
// wait for new node js version to support commonjs import esm

const kc = new k8s.KubeConfig();
kc.loadFromDefault();
const k8sCustomObjectsApi = kc.makeApiClient(k8s.CustomObjectsApi);

// a script to parse task's input schema converted to arguments format
const taskArgs = {
	parameters: [
		{
			name: 'capacity',
			value: 10,
		},
		{
			name: 'string-type-parameter',
			value: '[{ "productName": "apple-sider", "value": 40, "weight": 7 }]',
		},
		{
			name: 'enum-type-parameter',
			value: 'd',
		},
		{
			name: 'products',
			value: [
				{
					productName: 'apple-sider',
					value: 40,
					weight: 5,
				},
			],
		},
		{
			name: 'emoji',
			value: '(◕◞౪◟◕‵)',
		},
		{
			name: 'city',
			value: {
				mayor: {
					age: 27,
					name: 'taipei',
				},
				test: '',
			},
		},
	],
	artifacts: [
		{
			name: 'test-artifact',
			raw: {
				data: 'test',
			},
			at: '',
		},
	],
};

export class TaskTemplate implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Task Template',
		name: 'taskTemplate',
		icon: 'file:search.svg',
		group: ['transform'],
		version: 1,
		description: 'Trigger a new execution',
		defaults: {
			name: 'Task Template',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [],
		properties: [
			{
				// if we decide encapsulate the task into a node we can remove this input
				displayName: 'Task Name',
				name: 'taskName',
				type: 'string',
				required: true,
				default: 'CANAL_TASK.marshall.a-deal',
				placeholder: 'CANAL_TASK.marshall.a-deal',
			},
			{
				displayName: 'Arguments',
				name: 'arguments',
				type: 'json',
				required: true,
				default: JSON.stringify(taskArgs, null, 2),
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData = [];

		for (let i = 0; i < items.length; i++) {
			let responseData;
			const taskName = this.getNodeParameter('taskName', i) as string;
			const args = this.getNodeParameter('arguments', i) as IDataObject;

			const execution = {
				apiVersion: 'netbasequid.canalflow/v1',
				kind: 'Execution',
				metadata: {
					namespace: 'canal-flow',
					labels: {},
					generateName: 'marshall.mqiu-quid-com-a-deal',
				},
				spec: {
					task: taskName, // a script to fillout the name of the task
					arguments: JSON.parse(args),
					ignoreSchemaValidation: false,
					activeDeadlineSeconds: 7200,
				},
			};

			try {
				responseData = await k8sCustomObjectsApi.createNamespacedCustomObject(
					'netbasequid.canalflow', // group
					'v1', // version
					'canal-flow', // namespace
					'executions', // plural
					execution,
				);
				returnData.push(responseData);
			} catch (error: any) {
				throw new Error(
					`K8s API Error: ${error.message}\nStatus: ${error.status}\nBody: ${JSON.stringify(
						error.body,
						null,
						2,
					)}`,
				);
			}
		}

		return [this.helpers.returnJsonArray(returnData)];
	}
}
