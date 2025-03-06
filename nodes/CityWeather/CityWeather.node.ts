// @ts-nocheck

import type { INodeType, INodeTypeDescription } from 'n8n-workflow';

export class CityWeather implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'City Weather',
		name: 'cityWeather',
		icon: 'file:search.svg',
		group: ['transform'],
		version: 1,
		subtitle: 'Get City Weather',
		description: 'Get data from OpenWeatherMap API',
		defaults: {
			name: 'City Weather default',
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
				'https://canal-flow-api.dev-spark.ali-netbase.com/workspace/marshall/canaltask/a-deal',
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
							request: {
								qs: {
									lang: '=${{value}}',
								},
							},
						},
					},
				],
			},
		],
	};
}
