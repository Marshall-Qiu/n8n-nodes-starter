import { ICredentialType, INodeProperties } from 'n8n-workflow';

export class QuidMonitorAccount implements ICredentialType {
	name = 'QuidMonitorAccount';
	displayName = 'Quid Monitor Account';
	// Uses the link to this tutorial as an example
	// Replace with your own docs links when building your own nodes
	documentationUrl = 'https://docs.n8n.io/';
	properties: INodeProperties[] = [
		{
			displayName: 'Quid Monitor Email',
			name: 'email',
			type: 'string',
			default: '',
			required: true,
			description: 'Enter your monitor account, need to be end with @netbase.com',
		},
		{
			displayName: 'Password',
			name: 'password',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			required: true,
			description: 'Enter your monitor password',
		},
	];
}
