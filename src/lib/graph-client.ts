import { Client } from '@microsoft/microsoft-graph-client';

export function getGraphClient(accessToken: string): Client {
  return Client.init({
    authProvider: (done) => {
      // Ensure the token is properly formatted as Bearer token
      const bearerToken = accessToken.startsWith('Bearer ') ? accessToken : `Bearer ${accessToken}`;
      done(null, bearerToken);
    },
  });
}

export interface EmailFilter {
  fromDate?: Date;
  toDate?: Date;
  senders?: string[];
  limit?: number;
}

export interface EmailData {
  id: string;
  subject?: string;
  sender: {
    emailAddress: {
      address: string;
      name?: string;
    };
  };
  toRecipients?: Array<{
    emailAddress: {
      address: string;
      name?: string;
    };
  }>;
  body?: {
    content: string;
    contentType: string;
  };
  bodyPreview?: string;
  receivedDateTime: string;
  isRead: boolean;
  hasAttachments: boolean;
  attachments?: Array<{
    id: string;
    name: string;
    contentType: string;
    size: number;
  }>;
}
