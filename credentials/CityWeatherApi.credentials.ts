import { IAuthenticateGeneric, ICredentialType, INodeProperties } from 'n8n-workflow';

export class CityWeatherApi implements ICredentialType {
	name = 'CityWeatherApi';
	displayName = 'City Weather API';
	// Uses the link to this tutorial as an example
	// Replace with your own docs links when building your own nodes
	documentationUrl =
		'https://docs.n8n.io/integrations/creating-nodes/build/declarative-style-node/';
	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			default: '',
		},
	];
	authenticate = {
		type: 'generic',
		properties: {
			qs: {
				appid: '={{$credentials.apiKey}}',
			},
		},
	} as IAuthenticateGeneric;
}
