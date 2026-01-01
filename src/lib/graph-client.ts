import { Client } from '@microsoft/microsoft-graph-client';

export function getGraphClient(accessToken: string): Client {
  return Client.init({
    authProvider: (done) => {
      // The Graph SDK automatically adds "Bearer" prefix, so we just pass the token
      // Remove "Bearer" if it's already present to avoid double prefixing
      const token = accessToken.startsWith('Bearer ') ? accessToken.substring(7) : accessToken;
      done(null, token);
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
