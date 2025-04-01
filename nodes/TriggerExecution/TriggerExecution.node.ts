//@ts-nocheck
import { IExecuteFunctions } from 'n8n-core';

import { IDataObject, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';

import { OptionsWithUri } from 'request';

import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import * as yaml from 'js-yaml';
import * as k8s from '@kubernetes/client-node';
// The n8n project uses CommonJS, but the latest k8s client version only supports ESM.
// TypeScript will convert imports to CommonJS which causes errors.
// Therefore, we downgraded the k8s client to version 18.1.0, the last version that supports CommonJS.
// wait for new node js version to support commonjs import esm

const kc = new k8s.KubeConfig();
kc.loadFromDefault();

console.log('kc', kc);

// Get kubeconfig path
const kubeconfigPath = join(homedir(), '.kube', 'config');

// Read and parse
const kubeconfig = yaml.load(readFileSync(kubeconfigPath, 'utf8')) as any;

// Get current context
const currentContext = kubeconfig['current-context'];
const contexts = kubeconfig.contexts.find((ctx: any) => ctx.name === currentContext);
const userContext = contexts.context.user;

// Get token from user
const user = kubeconfig.users.find((u: any) => u.name === userContext);
const token = user.user.token;

export class TriggerExecution implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Trigger Execution',
		name: 'triggerExecution',
		icon: 'file:search.svg',
		group: ['transform'],
		version: 1,
		description: 'Trigger a new execution',
		defaults: {
			name: 'Trigger Execution',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [],
		properties: [
			{ displayName: 'Task Name', name: 'taskName', type: 'string', required: true, default: '' },
			{ displayName: 'Arguments', name: 'arguments', type: 'json', required: true, default: '' },
		],
	};
	// The execute method will go here
	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		let responseData;
		const returnData = [];
		const taskName = this.getNodeParameter('taskName', 0) as string;
		const args = this.getNodeParameter('arguments', 1) as IDataObject;

		console.log('token', token);

		// get k8s credential from local kubeConfig

		// For each item, make an API call to create a contact
		// for (let i = 0; i < items.length; i++) {
		// 	if (resource === 'contact') {
		// 		if (operation === 'create') {
		// 			// Get email input
		// 			const email = this.getNodeParameter('email', i) as string;
		// 			// Get additional fields input
		// 			const additionalFields = this.getNodeParameter('additionalFields', i) as IDataObject;
		// 			const data: IDataObject = {
		// 				email,
		// 			};

		// 			Object.assign(data, additionalFields);

		// 			// Make HTTP request according to https://sendgrid.com/docs/api-reference/
		console.log('args', JSON.parse(args));
		const options: OptionsWithUri = {
			headers: {
				Accept: 'application/json',
				Authorization: `Bearer ${token}`,
			},
			method: 'POST',
			body: JSON.parse(args),
			uri: `https://dev-cattle.netbase.com/k8s/clusters/c-zmfzb/apis/netbasequid.canalflow/v1/namespaces/canal-flow/executions`,
			json: true,
		};

		responseData = await this.helpers.request(options);
		returnData.push(responseData);
		// 	}
		// }
		// Map data to n8n data structure
		return [this.helpers.returnJsonArray(returnData)];
	}
}
