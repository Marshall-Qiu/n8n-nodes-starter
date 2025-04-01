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
		displayName: 'Ask Quid Questions',
		name: 'quidQuestions',
		icon: 'file:search.svg',
		group: ['transform'],
		version: 1,
		description: 'Ask Quid Questions',
		defaults: {
			name: 'Ask Quid Questions',
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
				displayName: 'Email Settings',
				name: 'emailSettings',
				type: 'fixedCollection',
				placeholder: 'Add Email Setting',
				default: {},
				options: [
					{
						name: 'value',
						displayName: 'Value',
						values: [
							{
								displayName: 'Recipients',
								name: 'recipients',
								type: 'string',
								typeOptions: {
									multipleValues: true,
								},
								default: [],
								required: true,
								description: 'List of email recipients',
							},
							{
								displayName: 'Subject',
								name: 'subject',
								type: 'string',
								default: '',
								required: true,
								description: 'Email subject',
							},
						],
					},
				],
			},
			{
				displayName: 'Questions',
				name: 'questions',
				type: 'fixedCollection',
				placeholder: 'Add Question',
				default: {},
				typeOptions: {
					multipleValues: true,
				},
				options: [
					{
						name: 'value',
						displayName: 'Value',
						values: [
							{
								displayName: 'Title',
								name: 'title',
								type: 'string',
								default: '',
								required: true,
								description: 'Title of the question',
							},
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
								displayName: 'Assistant Settings',
								name: 'assistant-settings',
								type: 'collection',
								default: {},
								required: true,
								description: 'Assistant settings configuration',
								placeholder: 'Choose your assistant', // will display add button to add key
								options: [
									{
										displayName: 'Key',
										name: 'key',
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
										description: 'Choose the assistant to use',
									},
								],
							},
						],
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData = [];

		for (let i = 0; i < items.length; i++) {
			let responseData;
			const emailSettings = this.getNodeParameter('emailSettings', i) as IDataObject;
			const questions = this.getNodeParameter('questions', i) as IDataObject;
			console.log('emailSettings', emailSettings.value);
			console.log('questions', JSON.stringify(questions.value, null, 2));

			const monitorAccountCredentials = await this.getCredentials('QuidMonitorAccount');
			console.log('monitorAccountCredentials', monitorAccountCredentials);
			// Create Execution
			const anonymousExecutionRequestBody = {
				workspace: 'marshall',
				name: 'ask-quid-questions',
				description: '',
				gitRepo: '',
				retryConfig: 'DEFAULT',
				inputs: {
					parameters: [],
					artifacts: [],
				},
				outputs: {
					parameters: [],
					artifacts: [],
				},
				steps: [
					[
						{
							name: 'ask-quid-questions',
							task: 'CANAL_TASK.quid-questions.main',
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
										name: 'email-settings',
										value: emailSettings.value,
									},
									{
										name: 'questions',
										value: questions.value,
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
