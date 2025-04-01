// @ts-nocheck

import type { INodeType, INodeTypeDescription } from 'n8n-workflow';

export class GetArtifact implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Get Artifact',
		name: 'getArtifact',
		icon: 'file:search.svg',
		group: ['transform'],
		version: 1,
		subtitle: 'Get Artifact',
		description: 'Get data from CanalFlow API',
		defaults: {
			name: 'Get Artifact default',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'CanalFlowApi',
				required: true,
			},
		],
		requestDefaults: {
			baseURL: 'https://canal-flow-api.dev-spark.ali-netbase.com',
			headers: {
				Accept: '*/*',
				'Content-Type': 'application/json',
				'Accept-Encoding': 'identity',
			},
		},
		properties: [
			{
				displayName: 'Execution UID',
				name: 'executionUid',
				type: 'string',
				default: '',
				placeholder: 'honolulu',
				required: true,
				description: 'The execution uid to get the artifact for',
				routing: {
					request: {
						url: '=/execution/{{$value}}/artifact/my-outputs',
					},
				},
			},
		],
	};
}
