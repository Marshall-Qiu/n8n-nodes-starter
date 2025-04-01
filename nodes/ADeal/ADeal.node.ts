// @ts-nocheck

import type { INodeType, INodeTypeDescription } from 'n8n-workflow';

export class ADeal implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'A Deal',
		name: 'aDeal',
		icon: 'file:search.svg',
		group: ['transform'],
		version: 1,
		subtitle: 'Get A Deal',
		description: 'Get data from A Deal',
		defaults: {
			name: 'A Deal default',
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
			baseURL:
				'https://canal-flow-api.dev-spark.ali-netbase.com/workspace/marshall/canaltask/a-deal/execution',
			method: 'POST',
			body: {
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
							data: '',
						},
						at: '',
					},
				],
			},
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
			},
		},
		properties: [
			{
				displayName: 'City',
				name: 'city',
				type: 'string',
				default: '',
				placeholder: 'honolulu',
				required: true,
				description: 'The city to get the weather for',
				routing: {
					request: {
						qs: {
							q: '=${{value}}',
						},
					},
				},
			},

			{
				displayName: 'Additional Fields',
				name: 'additionalFields',
				type: 'collection',
				default: {},
				placeholder: 'Add Field',
				options: [
					{
						displayName: 'Format',
						name: 'format',
						type: 'options',
						noDataExpression: true,
						options: [
							{
								name: 'Imperial',
								value: 'imperial',
								description: 'Fahrenheit | miles/hour',
							},
							{
								name: 'Metric',
								value: 'metric',
								description: 'Celsius | meter/sec',
							},
							{
								name: 'Scientific',
								value: 'standard',
								description: 'Kelvin | meter/sec',
							},
						],
						default: 'metric',
						description: 'The format of the weather data',
						routing: {
							request: {
								qs: {
									format: '=${{value}}',
								},
							},
						},
					},
					{
						displayName: 'Language',
						name: 'language',
						type: 'string',
						default: '',
						placeholder: 'en',
						description:
							'The two letter language code to get your output in (eg. en, es, de, etc.).',
						routing: {
							request: {},
						},
					},
				],
			},
		],
	};
}
