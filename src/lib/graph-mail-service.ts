import { EmailConfig } from '@prisma/client';
import { graphMessageIdForCreateReply } from '@/lib/graph-message-id';
import { parseEmailAddresses } from '@/lib/email-parser';

/** Comma- or list-style strings must become one Graph recipient per address (not a single bad address). */
function normalizeAddressList(v: string | string[] | undefined): string[] {
  if (v == null) return [];
  if (Array.isArray(v)) {
    return [...new Set(v.flatMap((e) => parseEmailAddresses(String(e))))];
  }
  return parseEmailAddresses(String(v));
}

function odataStringLiteral(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

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

/** Result of sending a follow-up in-thread; `resolvedOriginalId` is set when a stale id was backfilled from Sent Items. */
export type GraphReplyToMessageResult = {
  replyDraftId: string;
  resolvedOriginalId?: string;
};

/** Graph sendMail does not return a message id; we create a draft, send it, and return the id. */
export class GraphMailService {
  /** Outlook: prefer immutable ids so the same id works after draft → Sent Items. */
  private static graphMessageRequestHeaders(
    accessToken: string,
    opts?: { withJsonContentType?: boolean }
  ): Record<string, string> {
    const h: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      Prefer: 'IdType="ImmutableId"',
    };
    if (opts?.withJsonContentType) {
      h['Content-Type'] = 'application/json';
    }
    return h;
  }

  static async sendMail(
    config: EmailConfig,
    options: SendMailOptions,
  ): Promise<{ id: string }> {
    try {
      const accessToken = await GraphMailService.getAccessToken(config);
      const userPrincipal = encodeURIComponent(config.fromEmail);

      const toList = normalizeAddressList(options.to);
      if (toList.length === 0) {
        throw new Error('No valid To recipient address.');
      }
      const toRecipients = toList.map((email) => ({ emailAddress: { address: email } }));

      const ccList = options.cc != null && options.cc !== '' ? normalizeAddressList(options.cc) : [];
      const ccRecipients =
        ccList.length > 0
          ? ccList.map((email) => ({
              emailAddress: { address: email },
            }))
          : undefined;

      const bccList = options.bcc != null && options.bcc !== '' ? normalizeAddressList(options.bcc) : [];
      const bccRecipients =
        bccList.length > 0
          ? bccList.map((email) => ({
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
          headers: GraphMailService.graphMessageRequestHeaders(accessToken, { withJsonContentType: true }),
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
          headers: GraphMailService.graphMessageRequestHeaders(accessToken),
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

  /**
   * After a 404 on createReply, find the most recent sent message to `toEmail` in Sent Items
   * and return its id (immutable when Prefer is used on GET).
   */
  private static async findRecentSentMessageIdForRecipient(
    accessToken: string,
    userPrincipal: string,
    toEmail: string,
  ): Promise<string | null> {
    const emailLower = toEmail.trim().toLowerCase();
    if (!emailLower) return null;
    const lit = odataStringLiteral(emailLower);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const cutIso = cutoff.toISOString();
    const filter = `toRecipients/any(t:t/emailAddress/address eq ${lit}) and sentDateTime ge ${cutIso}`;

    const params = new URLSearchParams({
      $select: 'id',
      $filter: filter,
      $top: '5',
      $orderby: 'sentDateTime desc',
    });

    const url = `https://graph.microsoft.com/v1.0/users/${userPrincipal}/mailFolders('SentItems')/messages?${params.toString()}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: GraphMailService.graphMessageRequestHeaders(accessToken),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error('[Graph] Sent Items search failed:', res.status, err.substring(0, 400));
      return null;
    }
    const data = (await res.json()) as { value?: { id?: string }[] };
    const first = data.value?.[0]?.id;
    return first?.trim() ? first.trim() : null;
  }

  /**
   * Create reply draft, PATCH, send. Returns the *follow-up* draft id (last step's draft, now sent) — see replyToMessage.
   * Side effect: throws with createReply / PATCH / send errors.
   */
  private static async runCreateReplyAndSend(
    accessToken: string,
    userPrincipal: string,
    messageId: string,
    options: Omit<SendMailOptions, 'subject'>,
  ): Promise<string> {
    const idSeg = GraphMailService.messageIdPathSegment(messageId);
    const createRes = await fetch(
      `https://graph.microsoft.com/v1.0/users/${userPrincipal}/messages/${idSeg}/createReply`,
      {
        method: 'POST',
        headers: GraphMailService.graphMessageRequestHeaders(accessToken, { withJsonContentType: true }),
        body: JSON.stringify({}),
      },
    );
    if (!createRes.ok) {
      const err = await createRes.text();
      const e = new Error(`createReply failed (${createRes.status}): ${err}`);
      (e as Error & { statusCode?: number }).statusCode = createRes.status;
      throw e;
    }
    const draft = (await createRes.json()) as { id: string };
    const draftId: string = draft.id;

    const toList = normalizeAddressList(options.to);
    if (toList.length === 0) {
      throw new Error('No valid To recipient address for the follow-up reply.');
    }
    const toRecipients = toList.map((a) => ({ emailAddress: { address: a } }));

    const ccList = options.cc != null && options.cc !== '' ? normalizeAddressList(options.cc) : [];
    const ccRecipients =
      ccList.length > 0 ? ccList.map((a) => ({ emailAddress: { address: a } })) : undefined;

    const graphAttachments = options.attachments?.map((a) => ({
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: a.name,
      contentType: a.contentType,
      contentBytes: a.contentBytes,
    }));

    const patchBody: Record<string, unknown> = {
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
        headers: GraphMailService.graphMessageRequestHeaders(accessToken, { withJsonContentType: true }),
        body: JSON.stringify(patchBody),
      },
    );
    if (!patchRes.ok) {
      const err = await patchRes.text();
      throw new Error(`PATCH draft failed (${patchRes.status}): ${err}`);
    }

    const sendRes = await fetch(
      `https://graph.microsoft.com/v1.0/users/${userPrincipal}/messages/${draftSeg}/send`,
      {
        method: 'POST',
        headers: GraphMailService.graphMessageRequestHeaders(accessToken),
      },
    );
    if (!sendRes.ok) {
      const err = await sendRes.text();
      throw new Error(`Send draft failed (${sendRes.status}): ${err}`);
    }
    return draftId;
  }

  // Send a threaded reply to an existing message.
  // Uses Graph's createReply + PATCH + send flow so the follow-up appears in the same thread.
  static async replyToMessage(
    config: EmailConfig,
    originalMessageId: string,
    options: Omit<SendMailOptions, 'subject'>,
  ): Promise<GraphReplyToMessageResult> {
    const mid = graphMessageIdForCreateReply(originalMessageId);
    if (!mid) {
      throw new Error('Cannot reply: missing message id for the initial send. Send the initial again for this ageing file.');
    }
    const accessToken = await GraphMailService.getAccessToken(config);
    const userPrincipal = encodeURIComponent(config.fromEmail);

    const toList = normalizeAddressList(options.to);
    const primaryTo = toList[0] ?? '';

    let resolvedOriginalId: string | undefined;
    let threadRoot = mid;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const replyDraftId = await GraphMailService.runCreateReplyAndSend(
          accessToken,
          userPrincipal,
          threadRoot,
          options,
        );
        return { replyDraftId, ...(resolvedOriginalId && { resolvedOriginalId }) };
      } catch (e) {
        const errObj = e as Error & { statusCode?: number };
        const msg = e instanceof Error ? e.message : String(e);
        const is404 =
          errObj.statusCode === 404 || msg.includes(' 404:') || msg.includes('(404):') || msg.includes('ErrorItemNotFound');
        if (attempt === 0 && is404 && primaryTo) {
          const found = await GraphMailService.findRecentSentMessageIdForRecipient(
            accessToken,
            userPrincipal,
            primaryTo,
          );
          if (found && found !== threadRoot) {
            resolvedOriginalId = found;
            threadRoot = found;
            continue;
          }
        }
        throw e;
      }
    }
    throw new Error('createReply: exceeded retry');
  }

  /** Raw RFC 822 MIME for the message (save as .eml). Requires Mail.Read on the mailbox. */
  static async getMessageMimeValue(config: EmailConfig, messageId: string): Promise<Buffer | null> {
    try {
      const accessToken = await GraphMailService.getAccessToken(config);
      const userPrincipal = encodeURIComponent(config.fromEmail);
      const mid = encodeURIComponent(messageId);
      const url = `https://graph.microsoft.com/v1.0/users/${userPrincipal}/messages/${mid}/$value`;
      const res = await fetch(url, { headers: GraphMailService.graphMessageRequestHeaders(accessToken) });
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
