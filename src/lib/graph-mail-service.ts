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

export interface MailAttachment {
  name: string;
  contentBytes: string; // base64 encoded
  contentType: string;
}

export interface SendMailOptions {
  to: string | string[];
  subject: string;
  body?: string;
  htmlBody?: string;
  cc?: string | string[];
  bcc?: string | string[];
  attachments?: MailAttachment[];
  saveToSentItems?: boolean;
}

/** Graph sendMail does not return a message id; we create a draft, send it, and return the id. */
export class GraphMailService {
  static async sendMail(
    config: EmailConfig,
    options: SendMailOptions,
  ): Promise<{ id: string }> {
    try {
      const accessToken = await GraphMailService.getAccessToken(config);
      const userPrincipal = encodeURIComponent(config.fromEmail);

      const toRecipients = Array.isArray(options.to)
        ? options.to.map((email) => ({ emailAddress: { address: email } }))
        : [{ emailAddress: { address: options.to } }];

      const ccRecipients = options.cc
        ? (Array.isArray(options.cc) ? options.cc : [options.cc]).map((email) => ({
            emailAddress: { address: email },
          }))
        : undefined;

      const bccRecipients = options.bcc
        ? (Array.isArray(options.bcc) ? options.bcc : [options.bcc]).map((email) => ({
            emailAddress: { address: email },
          }))
        : undefined;

      const graphAttachments = options.attachments?.map((a) => ({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: a.name,
        contentType: a.contentType,
        contentBytes: a.contentBytes,
      }));

      const message: Record<string, unknown> = {
        subject: options.subject,
        body: {
          contentType: options.htmlBody ? 'HTML' : 'Text',
          content: options.htmlBody || options.body || '',
        },
        toRecipients,
        ...(ccRecipients && { ccRecipients }),
        ...(bccRecipients && { bccRecipients }),
        ...(graphAttachments?.length && { attachments: graphAttachments }),
      };

      const createRes = await fetch(
        `https://graph.microsoft.com/v1.0/users/${userPrincipal}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(message),
        },
      );
      if (!createRes.ok) {
        const err = await createRes.text();
        throw new Error(`Create message failed (${createRes.status}): ${err}`);
      }
      const created = (await createRes.json()) as { id?: string };
      const messageId = created.id;
      if (!messageId) {
        throw new Error('Graph create message returned no id');
      }

      const idSeg = GraphMailService.messageIdPathSegment(messageId);
      const sendRes = await fetch(
        `https://graph.microsoft.com/v1.0/users/${userPrincipal}/messages/${idSeg}/send`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      if (!sendRes.ok) {
        const err = await sendRes.text();
        throw new Error(`Send message failed (${sendRes.status}): ${err}`);
      }
      return { id: messageId };
    } catch (error) {
      console.error('Error sending email via Graph API:', error);
      throw error;
    }
  }

  // Get access token (exported for use in other services)
  static async getAccessToken(config: EmailConfig): Promise<string> {
    const tokenUrl = `https://login.microsoftonline.com/${config.msTenantId}/oauth2/v2.0/token`;
    const params = new URLSearchParams({
      client_id: config.msClientId,
      client_secret: config.msClientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    });
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(`Token request failed: ${data.error_description || data.error}`);
    return data.access_token;
  }

  /** URL-segment safe Graph message id (ids may include +, /, =). */
  private static messageIdPathSegment(id: string): string {
    return encodeURIComponent(id.trim());
  }

  // Send a threaded reply to an existing message.
  // Uses Graph's createReply + PATCH + send flow so the follow-up appears in the same thread.
  static async replyToMessage(
    config: EmailConfig,
    originalMessageId: string,
    options: Omit<SendMailOptions, 'subject'>,
  ): Promise<string> {
    const mid = originalMessageId.trim();
    if (!mid) {
      throw new Error('Cannot reply: missing message id for the initial send. Send the initial again for this ageing file.');
    }
    const accessToken = await GraphMailService.getAccessToken(config);
    const userPrincipal = encodeURIComponent(config.fromEmail);
    const idSeg = GraphMailService.messageIdPathSegment(mid);

    // Step 1 – create a reply draft (copies To/Subject/conversationId from the original)
    const createRes = await fetch(
      `https://graph.microsoft.com/v1.0/users/${userPrincipal}/messages/${idSeg}/createReply`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      }
    );
    if (!createRes.ok) {
      const err = await createRes.text();
      throw new Error(`createReply failed (${createRes.status}): ${err}`);
    }
    const draft = await createRes.json();
    const draftId: string = draft.id;

    // Step 2 – PATCH the draft: set custom body, CC recipients, and attachments
    const toRecipients = Array.isArray(options.to)
      ? options.to.map((a) => ({ emailAddress: { address: a } }))
      : [{ emailAddress: { address: options.to } }];

    const ccRecipients = options.cc
      ? (Array.isArray(options.cc) ? options.cc : [options.cc]).map((a) => ({ emailAddress: { address: a } }))
      : undefined;

    const graphAttachments = options.attachments?.map((a) => ({
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: a.name,
      contentType: a.contentType,
      contentBytes: a.contentBytes,
    }));

    const patchBody: any = {
      toRecipients,
      body: {
        contentType: options.htmlBody ? 'HTML' : 'Text',
        content: options.htmlBody || options.body || '',
      },
      ...(ccRecipients && { ccRecipients }),
      ...(graphAttachments?.length && { attachments: graphAttachments }),
    };

    const draftSeg = GraphMailService.messageIdPathSegment(draftId);
    const patchRes = await fetch(
      `https://graph.microsoft.com/v1.0/users/${userPrincipal}/messages/${draftSeg}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(patchBody),
      }
    );
    if (!patchRes.ok) {
      const err = await patchRes.text();
      throw new Error(`PATCH draft failed (${patchRes.status}): ${err}`);
    }

    // Step 3 – send the draft
    const sendRes = await fetch(
      `https://graph.microsoft.com/v1.0/users/${userPrincipal}/messages/${draftSeg}/send`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    if (!sendRes.ok) {
      const err = await sendRes.text();
      throw new Error(`Send draft failed (${sendRes.status}): ${err}`);
    }
    return draftId;
  }

  /** Raw RFC 822 MIME for the message (save as .eml). Requires Mail.Read on the mailbox. */
  static async getMessageMimeValue(config: EmailConfig, messageId: string): Promise<Buffer | null> {
    try {
      const accessToken = await GraphMailService.getAccessToken(config);
      const userPrincipal = encodeURIComponent(config.fromEmail);
      const mid = encodeURIComponent(messageId);
      const url = `https://graph.microsoft.com/v1.0/users/${userPrincipal}/messages/${mid}/$value`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!res.ok) {
        const err = await res.text();
        console.error(`[Graph] getMessageMimeValue HTTP ${res.status}:`, err.substring(0, 500));
        return null;
      }
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      console.error('[Graph] getMessageMimeValue:', e);
      return null;
    }
  }

  // Validate configuration by attempting to get a token
  static async validateConfig(config: EmailConfig): Promise<{ valid: boolean; error?: string }> {
    try {
      await GraphMailService.getAccessToken(config);
      return { valid: true };
    } catch (error: any) {
      return {
        valid: false,
        error: error.message || 'Failed to validate configuration',
      };
    }
  }
}
