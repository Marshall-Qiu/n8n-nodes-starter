import { ICredentialType, INodeProperties } from 'n8n-workflow';

export class OssServiceAccount implements ICredentialType {
	name = 'OssServiceAccount';
	displayName = 'Oss Service Account';
	documentationUrl = 'https://help.aliyun.com/document_detail/37861.html';
	properties: INodeProperties[] = [
		{
			displayName: 'Access Key ID',
			name: 'accessKeyId',
			type: 'string',
			default: '',
			required: true,
			description: 'Oss Access Key ID',
		},
		{
			displayName: 'Access Key Secret',
			name: 'accessKeySecret',
			type: 'string',
			default: '',
			required: true,
			typeOptions: {
				password: true,
			},
			description: 'Oss Access Key Secret',
		},
	];
}

// aws S3 api is compatible with aliyun oss
