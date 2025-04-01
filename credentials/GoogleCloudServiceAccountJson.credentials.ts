import { ICredentialType, INodeProperties } from 'n8n-workflow';

export class GoogleCloudServiceAccountJson implements ICredentialType {
	name = 'GoogleCloudServiceAccountJson';
	displayName = 'Google Cloud Service Account JSON';
	documentationUrl = 'https://cloud.google.com/docs/authentication/getting-started';
	properties: INodeProperties[] = [
		{
			displayName: 'Service Account',
			name: 'serviceAccount',
			type: 'json',
			typeOptions: {
				alwaysOpenEditWindow: true,
			},
			default: '',
			required: true,
			description: 'GCP Service account credentials JSON',
		},
	];
}

// aws S3 api is compatible with aliyun oss
