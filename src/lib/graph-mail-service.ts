import { Client } from '@microsoft/microsoft-graph-client';
import { EmailConfig } from '@prisma/client';

// Get access token using client credentials flow
async function getAccessToken(config: EmailConfig): Promise<string> {
  const tokenUrl = `https://login.microsoftonline.com/${config.msTenantId}/oauth2/v2.0/token`;

  const params = new URLSearchParams({
    client_id: config.msClientId,
    client_secret: config.msClientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });

  try {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(`Token request failed: ${data.error_description || data.error}`);
    }

    return data.access_token;
  } catch (error) {
    console.error('Error getting access token:', error);
    throw error;
  }
}

// Get Graph client with access token
async function getGraphClient(config: EmailConfig): Promise<Client> {
  const accessToken = await getAccessToken(config);

  // The Graph SDK automatically adds "Bearer" prefix, so we just pass the token
  return Client.init({
    authProvider: (done) => {
      done(null, accessToken);
    },
  });
}

export interface SendMailOptions {
  to: string | string[];
  subject: string;
  body?: string;
  htmlBody?: string;
  cc?: string | string[];
  bcc?: string | string[];
}

export class GraphMailService {
  // Send email using Microsoft Graph API
  static async sendMail(config: EmailConfig, options: SendMailOptions): Promise<any> {
    try {
      const client = await getGraphClient(config);

      // Prepare recipients
      const toRecipients = Array.isArray(options.to)
        ? options.to.map((email) => ({ emailAddress: { address: email } }))
        : [{ emailAddress: { address: options.to } }];

      const ccRecipients = options.cc
        ? Array.isArray(options.cc)
          ? options.cc.map((email) => ({ emailAddress: { address: email } }))
          : [{ emailAddress: { address: options.cc } }]
        : undefined;

      const bccRecipients = options.bcc
        ? Array.isArray(options.bcc)
          ? options.bcc.map((email) => ({ emailAddress: { address: email } }))
          : [{ emailAddress: { address: options.bcc } }]
        : undefined;

      // Prepare message
      const message: any = {
        message: {
          subject: options.subject,
          body: {
            contentType: options.htmlBody ? 'HTML' : 'Text',
            content: options.htmlBody || options.body || '',
          },
          toRecipients,
          ...(ccRecipients && { ccRecipients }),
          ...(bccRecipients && { bccRecipients }),
        },
      };

      // Use the fromEmail as the sender (user must have permission to send as this address)
      const sendMailUrl = `/users/${config.fromEmail}/sendMail`;

      const result = await client.api(sendMailUrl).post(message);

      return result;
    } catch (error) {
      console.error('Error sending email via Graph API:', error);
      throw error;
    }
  }

  // Validate configuration by attempting to get a token
  static async validateConfig(config: EmailConfig): Promise<{ valid: boolean; error?: string }> {
    try {
      await getAccessToken(config);
      return { valid: true };
    } catch (error: any) {
      return {
        valid: false,
        error: error.message || 'Failed to validate configuration',
      };
    }
  }
}
