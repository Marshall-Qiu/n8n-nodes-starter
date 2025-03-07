import { IAuthenticateGeneric, ICredentialType, INodeProperties } from 'n8n-workflow';

export class CanalFlowApi implements ICredentialType {
	name = 'CanalFlowApi';
	displayName = 'Canal Flow API';
	// Uses the link to this tutorial as an example
	// Replace with your own docs links when building your own nodes
	documentationUrl =
		'https://docs.n8n.io/integrations/creating-nodes/build/declarative-style-node/';
	properties: INodeProperties[] = [
		{
			displayName: 'Username',
			name: 'username',
			type: 'string',
			default: '',
		},
		{
			displayName: 'Password',
			name: 'password',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
		},
	];
	authenticate = {
		type: 'generic',
		properties: {
			auth: {
				// basic auth ref: https://docs.n8n.io/integrations/creating-nodes/build/reference/credentials-files/#properties_1
				username: '={{$credentials.username}}',
				password: '={{$credentials.password}}',
			},
		},
	} as IAuthenticateGeneric;
}
