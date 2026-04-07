import { prisma } from './prisma';
import { GraphMailService, MailAttachment } from './graph-mail-service';
import { EmailConfigService } from './email-config-service';
import * as fs from 'fs';
import * as path from 'path';
import { EmailConfig } from '@prisma/client';

export const CATEGORIES = [
  'Bank Balances and FDs',
  'Borrowings',
  'Trade Receivables',
  'Trade Payables',
  'Other Receivables',
  'Other Payables',
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CONFIRMATION_STATUSES = {
  NOT_SENT: 'not_sent',
  SENT: 'sent',
  FOLLOWUP_SENT: 'followup_sent',
  RESPONSE_RECEIVED: 'response_received',
} as const;

// Build the balance confirmation body text based on category
function getBalanceRequestText(category: string): string {
  if (category === 'Bank Balances and FDs') {
    return 'Balance of all Bank Accounts held with you (including Escrow accounts), Balance of all Fixed Deposits held with you (including details of any lien on such FDs), FD interest accrued, FD interest income and any other balances or other outstanding instruments such as Letter of Credits, Bank Guarantees, cash credits, etc as at and for the year ended 31 March 2026';
  }
  if (category === 'Borrowings') {
    return 'Amount of Borrowings principal outstanding and interest outstanding, if any as at 31 March 2026';
  }
  return 'Amount Outstanding as at 31 March 2026 as per your books whether receivable / payable by you';
}

// Generate the email subject for a confirmation record
export function generateEmailSubject(entityName: string): string {
  return `${entityName}: Balance Confirmations for the year ending 31 March 2026`;
}

// Generate the plain text email body
export function generateEmailBody(entityName: string, category: string): string {
  const balanceRequest = getBalanceRequestText(category);
  return `Dear Sir/Ma'am,

We hope this email finds you well.

We are the statutory auditors of ${entityName} (hereinafter referred to as the "Client"). We are currently conducting the statutory audit of the Client's financial statements for the year ended 31 March 2026 in accordance with the Standards on Auditing issued by the Institute of Chartered Accountants of India (ICAI).

We are attaching herewith authority letter from the Client authorising us to obtain the confirmations from you.

As part of our audit procedures, we are required to obtain independent external confirmations of certain balances recorded in the books of account of the Client for the year ending 31 March 2026. In this regard, we kindly request you to confirm the following balance(s) with us:

${balanceRequest}

This request is being made solely for the purpose of our audit and does not constitute any acknowledgement or admission of liability on the part of either party. This is not a request for payment please do not send your remittance to the auditors. This is a standard procedure to ensure the accuracy of the financial records.

Your prompt response will assist us in completing our audit in a timely manner.

Regards,
Audit Team,
HSDR & Associates`;
}

// Generate the HTML email body
export function generateEmailHtml(entityName: string, category: string): string {
  const balanceRequest = getBalanceRequestText(category);
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6; }
    .container { max-width: 700px; margin: 0 auto; padding: 20px; }
    .balance-request { background: #f5f5f5; padding: 12px 16px; border-left: 4px solid #2563eb; margin: 16px 0; }
    .signature { margin-top: 24px; color: #555; }
  </style>
</head>
<body>
  <div class="container">
    <p>Dear Sir/Ma'am,</p>
    <p>We hope this email finds you well.</p>
    <p>We are the statutory auditors of <strong>${entityName}</strong> (hereinafter referred to as the "Client"). We are currently conducting the statutory audit of the Client's financial statements for the year ended 31 March 2026 in accordance with the Standards on Auditing issued by the Institute of Chartered Accountants of India (ICAI).</p>
    <p>We are attaching herewith authority letter from the Client authorising us to obtain the confirmations from you.</p>
    <p>As part of our audit procedures, we are required to obtain independent external confirmations of certain balances recorded in the books of account of the Client for the year ending 31 March 2026. In this regard, we kindly request you to confirm the following balance(s) with us:</p>
    <div class="balance-request">${balanceRequest}</div>
    <p>This request is being made solely for the purpose of our audit and does not constitute any acknowledgement or admission of liability on the part of either party. This is not a request for payment please do not send your remittance to the auditors. This is a standard procedure to ensure the accuracy of the financial records.</p>
    <p>Your prompt response will assist us in completing our audit in a timely manner.</p>
    <div class="signature">
      <p>Regards,<br>Audit Team,<br><strong>HSDR &amp; Associates</strong></p>
    </div>
  </div>
</body>
</html>`;
}

// Generate the follow-up HTML email body
export function generateFollowupEmailHtml(entityName: string, category: string, originalSentAt: Date): string {
  const originalDate = originalSentAt.toLocaleDateString('en-IN', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6; }
    .container { max-width: 700px; margin: 0 auto; padding: 20px; }
    .highlight { background: #fff3cd; padding: 10px 14px; border-left: 4px solid #f59e0b; margin: 16px 0; }
    .signature { margin-top: 24px; color: #555; }
  </style>
</head>
<body>
  <div class="container">
    <p>Dear Sir/Ma'am,</p>
    <p>We hope this email finds you well.</p>
    <p>This is a gentle follow-up to our earlier email dated <strong>${originalDate}</strong> requesting confirmation of balances for <strong>${entityName}</strong> for the year ended 31 March 2026.</p>
    <div class="highlight">
      <strong>Category:</strong> ${category}<br>
      <strong>Entity:</strong> ${entityName}
    </div>
    <p>We would appreciate if you could kindly provide the confirmation at the earliest, as it is critical for timely completion of the statutory audit.</p>
    <p>If you have already responded, please ignore this follow-up. If you have any queries, please feel free to reach out to us.</p>
    <div class="signature">
      <p>Regards,<br>Audit Team,<br><strong>HSDR &amp; Associates</strong></p>
    </div>
  </div>
</body>
</html>`;
}

// Sanitize a string to be safe for use as a file/folder name
function sanitizePath(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 100);
}

// Get the base path for email saves
export function getEmailBasePath(basePath: string = 'emails'): string {
  // If it's an absolute path, use it as-is; otherwise resolve relative to project root
  if (path.isAbsolute(basePath)) {
    return basePath;
  }
  return path.join(process.cwd(), basePath);
}

// Build folder paths for an entity+category pair
export function buildFolderPaths(entityName: string, category: string, basePath: string = 'emails') {
  const base = getEmailBasePath(basePath);
  const entityFolder = sanitizePath(entityName);
  const categoryFolder = sanitizePath(category);
  const sentFolder = path.join(base, entityFolder, categoryFolder, 'Emails Sent');
  const responsesFolder = path.join(base, entityFolder, categoryFolder, 'Responses Received');
  const sentRelative = path.join(basePath, entityFolder, categoryFolder, 'Emails Sent');
  const responsesRelative = path.join(basePath, entityFolder, categoryFolder, 'Responses Received');
  return { sentFolder, responsesFolder, sentRelative, responsesRelative };
}

// Ensure a directory exists
function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// Generate a timestamp prefix for filenames
function timestampPrefix(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}_${hh}-${mm}`;
}

// Save an HTML email to the "Emails Sent" folder
export function saveEmailToSentFolder(
  entityName: string,
  category: string,
  bankName: string,
  subject: string,
  htmlContent: string,
  basePath: string = 'emails'
): { filePath: string; relativePath: string } {
  const { sentFolder, sentRelative } = buildFolderPaths(entityName, category, basePath);
  ensureDir(sentFolder);
  const safeName = sanitizePath(bankName || 'email');
  const filename = `${timestampPrefix()}_${safeName}.html`;
  const fullPath = path.join(sentFolder, filename);
  const fullHtml = wrapEmailHtml(subject, htmlContent, {
    entityName, category, bankName, type: 'sent',
  });
  fs.writeFileSync(fullPath, fullHtml, 'utf-8');
  return { filePath: fullPath, relativePath: path.join(sentRelative, filename) };
}

// Save an HTML email to the "Responses Received" folder
export function saveEmailToResponsesFolder(
  entityName: string,
  category: string,
  fromEmail: string,
  subject: string,
  htmlContent: string,
  basePath: string = 'emails'
): { filePath: string; relativePath: string } {
  const { responsesFolder, responsesRelative } = buildFolderPaths(entityName, category, basePath);
  ensureDir(responsesFolder);
  const safeName = sanitizePath(fromEmail || 'response');
  const filename = `${timestampPrefix()}_${safeName}.html`;
  const fullPath = path.join(responsesFolder, filename);
  const fullHtml = wrapEmailHtml(subject, htmlContent, {
    entityName, category, fromEmail, type: 'received',
  });
  fs.writeFileSync(fullPath, fullHtml, 'utf-8');
  return { filePath: fullPath, relativePath: path.join(responsesRelative, filename) };
}

// Wrap raw email body in a full styled HTML document for saving
function wrapEmailHtml(
  subject: string,
  body: string,
  meta: { entityName: string; category: string; bankName?: string; fromEmail?: string; type: 'sent' | 'received' }
): string {
  const typeLabel = meta.type === 'sent' ? 'Email Sent' : 'Response Received';
  const typeColor = meta.type === 'sent' ? '#2563eb' : '#16a34a';
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${subject}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 0; background: #f9fafb; }
    .header { background: ${typeColor}; color: white; padding: 16px 24px; }
    .header h1 { margin: 0; font-size: 18px; }
    .header .meta { font-size: 12px; opacity: 0.85; margin-top: 4px; }
    .content { background: white; margin: 20px; padding: 24px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .subject-line { font-size: 16px; font-weight: bold; color: #111; margin-bottom: 16px; border-bottom: 1px solid #e5e7eb; padding-bottom: 12px; }
    @media print { body { background: white; } .header { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>${typeLabel}</h1>
    <div class="meta">
      Entity: ${meta.entityName} &nbsp;|&nbsp; Category: ${meta.category}
      ${meta.bankName ? `&nbsp;|&nbsp; Bank/Party: ${meta.bankName}` : ''}
      ${meta.fromEmail ? `&nbsp;|&nbsp; From: ${meta.fromEmail}` : ''}
    </div>
  </div>
  <div class="content">
    <div class="subject-line">Subject: ${subject}</div>
    ${body}
  </div>
</body>
</html>`;
}

// Read a saved email file (for viewing in the UI)
export function readEmailFile(filePath: string): string | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

export interface ConfirmationFilter {
  userId: string;
  entityName?: string | string[];
  category?: string | string[];
  status?: string | string[];
  search?: string;
}

// List confirmation records with optional filters
export async function listConfirmationRecords(filter: ConfirmationFilter) {
  const where: any = { userId: filter.userId };

  if (filter.entityName) {
    where.entityName = Array.isArray(filter.entityName)
      ? { in: filter.entityName }
      : filter.entityName;
  }
  if (filter.category) {
    where.category = Array.isArray(filter.category)
      ? { in: filter.category }
      : filter.category;
  }
  if (filter.status) {
    where.status = Array.isArray(filter.status)
      ? { in: filter.status }
      : filter.status;
  }
  if (filter.search) {
    where.OR = [
      { entityName: { contains: filter.search } },
      { bankName: { contains: filter.search } },
      { emailTo: { contains: filter.search } },
      { accountNumber: { contains: filter.search } },
    ];
  }

  return prisma.confirmationRecord.findMany({
    where,
    orderBy: [{ entityName: 'asc' }, { category: 'asc' }],
  });
}

// Build file attachments array from a record's attachment path
function buildAttachments(attachmentPath: string | null, attachmentName: string | null): MailAttachment[] {
  if (!attachmentPath || !attachmentName) return [];
  try {
    const fileBuffer = fs.readFileSync(attachmentPath);
    const ext = path.extname(attachmentName).toLowerCase();
    const contentTypeMap: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
    return [{
      name: attachmentName,
      contentBytes: fileBuffer.toString('base64'),
      contentType: contentTypeMap[ext] || 'application/octet-stream',
    }];
  } catch {
    console.warn(`[Confirmation] Could not read attachment at ${attachmentPath}`);
    return [];
  }
}

// After sending, search Sent Items to capture both the message ID and conversationId.
// conversationId is what we use to find replies later.
async function fetchSentMessage(
  config: EmailConfig,
  subject: string,
  _sentAfter: Date
): Promise<{ messageId: string; conversationId: string } | null> {
  try {
    const accessToken = await GraphMailService.getAccessToken(config);
    const userPrincipal = encodeURIComponent(config.fromEmail);

    // Use $search scoped to SentItems — avoids InefficientFilter errors that occur with
    // combined $filter on subject + sentDateTime.  $search cannot be combined with $orderby,
    // so we sort client-side.
    const searchTerm = subject.replace(/"/g, '').substring(0, 80);
    const url = `https://graph.microsoft.com/v1.0/users/${userPrincipal}/mailFolders/SentItems/messages`
      + `?$search="subject:${searchTerm}"`
      + `&$top=5&$select=id,conversationId,subject,sentDateTime`;

    console.log('[Confirmation] fetchSentMessage $search URL:', url);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error(`[Confirmation] fetchSentMessage HTTP ${res.status}:`, errBody);
      return null;
    }

    const data = await res.json();
    const messages: any[] = data.value || [];

    // Pick the most recent one whose subject exactly matches
    const exactMatch = messages.find((m: any) => m.subject === subject);
    const msg = exactMatch || messages[0];

    if (!msg) {
      console.warn('[Confirmation] fetchSentMessage: no message found in SentItems for subject:', subject);
      return null;
    }

    console.log('[Confirmation] Captured sent message — id:', msg.id, 'conversationId:', msg.conversationId, 'subject:', msg.subject);
    return { messageId: msg.id, conversationId: msg.conversationId };
  } catch (err) {
    console.error('[Confirmation] fetchSentMessage exception:', err);
    return null;
  }
}

// Send a confirmation email for a record
export async function sendConfirmation(
  recordId: string,
  userId: string,
  configId?: string
): Promise<{ success: boolean; error?: string }> {
  const record = await prisma.confirmationRecord.findFirst({
    where: { id: recordId, userId },
  });
  if (!record) return { success: false, error: 'Record not found' };

  const config = configId
    ? await EmailConfigService.getConfigById(configId, userId)
    : await EmailConfigService.getActiveConfig(userId);
  if (!config) return { success: false, error: 'No active email configuration found' };

  const settings = await getOrCreateSettings(userId);
  const subject = generateEmailSubject(record.entityName);
  const htmlBody = generateEmailHtml(record.entityName, record.category);

  const toList = record.emailTo.split(',').map((e) => e.trim()).filter(Boolean);
  const ccList = record.emailCc
    ? record.emailCc.split(',').map((e) => e.trim()).filter(Boolean)
    : undefined;

  // Build file attachments
  const attachments = buildAttachments(record.attachmentPath, record.attachmentName);

  const sendTime = new Date();

  try {
    await GraphMailService.sendMail(config, {
      to: toList,
      subject,
      htmlBody,
      cc: ccList,
      attachments,
      saveToSentItems: true,
    });

    // Fetch the sent message details — we store conversationId in sentMessageId
    // so we can find all replies in the same thread later.
    await new Promise((r) => setTimeout(r, 2500));
    const sentMsg = await fetchSentMessage(config, subject, sendTime);

    // Save to folder
    const { filePath } = saveEmailToSentFolder(
      record.entityName,
      record.category,
      record.bankName || 'email',
      subject,
      htmlBody,
      settings.emailSaveBasePath
    );

    const { sentRelative, responsesRelative } = buildFolderPaths(
      record.entityName,
      record.category,
      settings.emailSaveBasePath
    );

    await prisma.confirmationRecord.update({
      where: { id: recordId },
      data: {
        status: CONFIRMATION_STATUSES.SENT,
        sentAt: sendTime,
        // Store conversationId so reply detection can find all thread replies
        sentMessageId: sentMsg?.conversationId ?? sentMsg?.messageId ?? undefined,
        sentEmailFilePath: filePath,
        emailsSentFolderPath: sentRelative,
        responsesFolderPath: responsesRelative,
        emailConfigId: config.id,
      },
    });

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to send email' };
  }
}

// Send a follow-up email for a record
export async function sendFollowup(
  recordId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const record = await prisma.confirmationRecord.findFirst({
    where: { id: recordId, userId },
  });
  if (!record) return { success: false, error: 'Record not found' };
  if (record.status === CONFIRMATION_STATUSES.RESPONSE_RECEIVED) {
    return { success: false, error: 'Response already received for this record' };
  }
  if (record.status === CONFIRMATION_STATUSES.NOT_SENT) {
    return { success: false, error: 'Original email has not been sent yet' };
  }

  const config = record.emailConfigId
    ? await EmailConfigService.getConfigById(record.emailConfigId, userId)
    : await EmailConfigService.getActiveConfig(userId);
  if (!config) return { success: false, error: 'No active email configuration found' };

  const settings = await getOrCreateSettings(userId);
  const subject = `Follow-up: ${generateEmailSubject(record.entityName)}`;
  const htmlBody = generateFollowupEmailHtml(
    record.entityName,
    record.category,
    record.sentAt || new Date()
  );

  const toList = record.emailTo.split(',').map((e) => e.trim()).filter(Boolean);
  const ccList = record.emailCc
    ? record.emailCc.split(',').map((e) => e.trim()).filter(Boolean)
    : undefined;

  // Include authority letter attachment in follow-up as well
  const attachments = buildAttachments(record.attachmentPath, record.attachmentName);

  const sendTime = new Date();

  try {
    await GraphMailService.sendMail(config, {
      to: toList,
      subject,
      htmlBody,
      cc: ccList,
      attachments,
      saveToSentItems: true,
    });

    // Capture follow-up message details
    await new Promise((r) => setTimeout(r, 2500));
    const followupMsg = await fetchSentMessage(config, subject, sendTime);

    const { filePath } = saveEmailToSentFolder(
      record.entityName,
      record.category,
      record.bankName || 'followup',
      subject,
      htmlBody,
      settings.emailSaveBasePath
    );

    await prisma.confirmationRecord.update({
      where: { id: recordId },
      data: {
        status: CONFIRMATION_STATUSES.FOLLOWUP_SENT,
        followupSentAt: sendTime,
        followupMessageId: followupMsg?.conversationId ?? followupMsg?.messageId ?? undefined,
        followupEmailFilePath: filePath,
      },
    });

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to send follow-up' };
  }
}

// Determine whether a message was sent by the mailbox owner.
// Graph sometimes returns from.emailAddress.address as an internal X500 path
// (e.g. /O=EXCHANGELABS/OU=.../CN=HARDIK) instead of the SMTP address.
function isFromSelf(msg: any, fromEmail: string): boolean {
  const addr = (msg.from?.emailAddress?.address || '').toLowerCase();
  const name = (msg.from?.emailAddress?.name || '').toLowerCase();
  const self = fromEmail.toLowerCase();
  const selfLocal = self.split('@')[0];

  if (addr === self) return true;
  // X500 / internal routing address — check if it contains the mailbox local part
  if (addr.startsWith('/o=') && addr.includes(selfLocal)) return true;
  // Sometimes sender field is populated differently
  if (msg.sender?.emailAddress?.address?.toLowerCase() === self) return true;
  // Display name matching as last resort (e.g. "Hardik Savla" vs "hardiksavla@hsdr.in")
  if (name && name.includes(selfLocal)) return true;
  return false;
}

// Check Graph inbox for replies to sent confirmations
export async function checkRepliesForConfirmations(userId: string): Promise<number> {
  const pendingRecords = await prisma.confirmationRecord.findMany({
    where: {
      userId,
      status: { in: [CONFIRMATION_STATUSES.SENT, CONFIRMATION_STATUSES.FOLLOWUP_SENT] },
      sentAt: { not: null },
    },
  });

  if (pendingRecords.length === 0) {
    console.log('[Confirmation] No pending records to check for replies.');
    return 0;
  }

  const config = await EmailConfigService.getActiveConfig(userId);
  if (!config) {
    console.error('[Confirmation] No active email config found for reply check.');
    return 0;
  }

  const settings = await getOrCreateSettings(userId);
  let repliesFound = 0;

  let accessToken: string;
  try {
    accessToken = await GraphMailService.getAccessToken(config);
  } catch (err) {
    console.error('[Confirmation] Failed to get access token for reply check:', err);
    return 0;
  }

  const userPrincipal = encodeURIComponent(config.fromEmail);

  // Pre-fetch recent INBOX messages since the earliest sent date.
  // IMPORTANT: scope to Inbox folder only — searching across all folders picks up
  // our own Sent Items which then bypasses the self-sender filter.
  const earliestSentAt = pendingRecords.reduce((earliest, r) => {
    const d = r.sentAt ? new Date(r.sentAt) : new Date();
    return d < earliest ? d : earliest;
  }, new Date());

  const windowIso = earliestSentAt.toISOString();

  let inboxMessages: any[] = [];
  try {
    const inboxUrl = `https://graph.microsoft.com/v1.0/users/${userPrincipal}/mailFolders/Inbox/messages`
      + `?$filter=receivedDateTime ge ${windowIso}`
      + `&$orderby=receivedDateTime desc&$top=100`
      + `&$select=id,subject,from,sender,receivedDateTime,bodyPreview,hasAttachments,conversationId`;

    console.log('[Confirmation] Fetching inbox messages since', windowIso);
    const inboxRes = await fetch(inboxUrl, { headers: { Authorization: `Bearer ${accessToken}` } });

    if (!inboxRes.ok) {
      const errBody = await inboxRes.text();
      console.error(`[Confirmation] Inbox fetch HTTP ${inboxRes.status}:`, errBody);
    } else {
      const inboxData = await inboxRes.json();
      inboxMessages = inboxData.value || [];
      console.log(`[Confirmation] Found ${inboxMessages.length} inbox message(s) since ${windowIso}`);

      // Log first few for debugging
      inboxMessages.slice(0, 5).forEach((m: any, i: number) => {
        console.log(`  [${i}] subject="${m.subject}" from="${m.from?.emailAddress?.address}" convId=${m.conversationId?.substring(0, 20)}...`);
      });
    }
  } catch (err) {
    console.error('[Confirmation] Error fetching inbox messages:', err);
  }

  for (const record of pendingRecords) {
    try {
      const sentAt = record.sentAt ? new Date(record.sentAt) : new Date(0);
      const baseSubject = generateEmailSubject(record.entityName);
      const entityNameLower = record.entityName.toLowerCase();

      // Common filter: must be after sentAt, must NOT be from self, must not be already captured.
      const isValidReply = (m: any) => {
        if (new Date(m.receivedDateTime) <= sentAt) return false;
        if (isFromSelf(m, config.fromEmail)) return false;
        if (record.responseMessageId === m.id) return false;
        return true;
      };

      const sortNewestFirst = (a: any, b: any) =>
        new Date(b.receivedDateTime).getTime() - new Date(a.receivedDateTime).getTime();

      let replyMsg: any = null;

      // ---------- Strategy 1: match by conversationId ----------
      if (record.sentMessageId) {
        const conversationId = record.sentMessageId;
        const matches = inboxMessages.filter((m: any) => m.conversationId === conversationId && isValidReply(m));
        matches.sort(sortNewestFirst);
        if (matches.length > 0) {
          replyMsg = matches[0];
          console.log(`[Confirmation] Strategy 1 hit for "${record.entityName}": conversationId match`);
        }
      }

      // ---------- Strategy 2: match by subject keyword in pre-fetched inbox ----------
      if (!replyMsg) {
        const matches = inboxMessages.filter((m: any) => {
          const subj = (m.subject || '').toLowerCase();
          return (subj.includes(entityNameLower) || subj.includes(baseSubject.toLowerCase())) && isValidReply(m);
        });
        matches.sort(sortNewestFirst);
        if (matches.length > 0) {
          replyMsg = matches[0];
          console.log(`[Confirmation] Strategy 2 hit for "${record.entityName}": inbox subject match from ${replyMsg.from?.emailAddress?.address}`);
        }
      }

      // ---------- Strategy 3: $search scoped to INBOX ONLY ----------
      // $search cannot use $orderby — we sort client-side.
      if (!replyMsg) {
        const searchKeyword = record.entityName.replace(/"/g, '').substring(0, 50);
        // Scope to Inbox folder specifically to avoid matching Sent Items
        const searchUrl = `https://graph.microsoft.com/v1.0/users/${userPrincipal}/mailFolders/Inbox/messages`
          + `?$search="subject:${searchKeyword}"`
          + `&$top=25`
          + `&$select=id,subject,from,sender,receivedDateTime,bodyPreview,hasAttachments,conversationId`;

        console.log(`[Confirmation] Strategy 3 $search Inbox for "${record.entityName}"`);
        const searchRes = await fetch(searchUrl, { headers: { Authorization: `Bearer ${accessToken}` } });

        if (searchRes.ok) {
          const searchData = await searchRes.json();
          const candidates = (searchData.value || []).filter(isValidReply);
          candidates.sort(sortNewestFirst);
          if (candidates.length > 0) {
            replyMsg = candidates[0];
            console.log(`[Confirmation] Strategy 3 hit for "${record.entityName}" from ${replyMsg.from?.emailAddress?.address}`);
          }
        } else {
          const errBody = await searchRes.text();
          console.warn(`[Confirmation] Strategy 3 HTTP ${searchRes.status}:`, errBody);
        }
      }

      if (!replyMsg) {
        console.log(`[Confirmation] No reply found for "${record.entityName}" / ${record.category}`);
        continue;
      }

      // ---------- Fetch full message details: body, uniqueBody, attachments ----------
      let bodyContent = replyMsg.bodyPreview || '';       // full thread body (saved to file)
      let bodyContentType = 'text';
      let uniqueBodyHtml: string | undefined;             // reply-only HTML (shown inline in UI)
      let uniqueBodyText: string | undefined;             // reply-only plain text
      let hasAttachments = !!replyMsg.hasAttachments;
      let attachmentsJson: string | undefined;

      // The sender SMTP address — resolve from the full message (may differ from pre-fetch)
      let fromEmail = replyMsg.from?.emailAddress?.address || '';
      let fromName = replyMsg.from?.emailAddress?.name || '';

      try {
        const fullMsgRes = await fetch(
          `https://graph.microsoft.com/v1.0/users/${userPrincipal}/messages/${replyMsg.id}?$select=body,uniqueBody,from,sender,subject,receivedDateTime,hasAttachments`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (fullMsgRes.ok) {
          const fullMsg = await fullMsgRes.json();
          hasAttachments = !!fullMsg.hasAttachments;

          // Prefer sender.emailAddress (SMTP) over from.emailAddress (which can be X500)
          const senderAddr = fullMsg.sender?.emailAddress?.address || '';
          const senderName = fullMsg.sender?.emailAddress?.name || '';
          const fromAddr = fullMsg.from?.emailAddress?.address || '';
          const fromDisplayName = fullMsg.from?.emailAddress?.name || '';

          if (senderAddr && senderAddr.includes('@')) {
            fromEmail = senderAddr;
            fromName = senderName || fromDisplayName;
          } else if (fromAddr && fromAddr.includes('@')) {
            fromEmail = fromAddr;
            fromName = fromDisplayName;
          } else {
            fromEmail = senderAddr || fromAddr;
            fromName = senderName || fromDisplayName;
          }

          console.log(`[Confirmation] Full message from: ${fromName} <${fromEmail}>`);

          // Full body (thread) → saved to disk so the file has the complete email trail
          const fullBody = fullMsg.body?.content?.trim();
          if (fullBody) {
            bodyContent = fullBody;
            bodyContentType = fullMsg.body?.contentType || 'html';
          }

          // uniqueBody (reply-only text) → stored in DB for the inline Response tab display
          const uniqueContent = fullMsg.uniqueBody?.content?.trim();
          if (uniqueContent && uniqueContent.length > 0) {
            const uIsHtml = (fullMsg.uniqueBody?.contentType || '').toLowerCase() === 'html';
            if (uIsHtml) uniqueBodyHtml = uniqueContent;
            else uniqueBodyText = uniqueContent;
          }
        }
      } catch (err) {
        console.warn('[Confirmation] Failed to fetch full message body:', err);
      }

      // ---------- Fetch attachment metadata list ----------
      if (hasAttachments) {
        try {
          const attRes = await fetch(
            `https://graph.microsoft.com/v1.0/users/${userPrincipal}/messages/${replyMsg.id}/attachments?$select=id,name,contentType,size`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          if (attRes.ok) {
            const attData = await attRes.json();
            const list = (attData.value || []).map((a: any) => ({
              id: a.id, name: a.name, contentType: a.contentType, size: a.size,
            }));
            attachmentsJson = JSON.stringify(list);
          }
        } catch {
          // best-effort
        }
      }

      // ---------- Save to folder and update DB ----------
      // Full thread body → saved to disk (complete email trail in the HTML file)
      // uniqueBody → stored in DB for the inline Response tab display in the UI
      const { filePath } = saveEmailToResponsesFolder(
        record.entityName, record.category,
        fromEmail || 'unknown', replyMsg.subject || '',
        bodyContent, settings.emailSaveBasePath
      );

      const isBodyHtml = bodyContentType.toLowerCase() === 'html';

      // For DB inline display: prefer uniqueBody if captured, else fall back to full body
      const dbHtml = uniqueBodyHtml ?? (isBodyHtml ? bodyContent : undefined);
      const dbText = uniqueBodyText ?? (!isBodyHtml ? bodyContent : undefined);

      await prisma.confirmationRecord.update({
        where: { id: record.id },
        data: {
          status: CONFIRMATION_STATUSES.RESPONSE_RECEIVED,
          responseReceivedAt: new Date(replyMsg.receivedDateTime),
          responseMessageId: replyMsg.id,
          responseSubject: replyMsg.subject,
          responseBody: dbText,
          responseHtmlBody: dbHtml,
          responseFromEmail: fromEmail,
          responseFromName: fromName,
          responseEmailFilePath: filePath,
          responseHasAttachments: hasAttachments,
          responseAttachmentsJson: attachmentsJson,
        },
      });

      repliesFound++;
      console.log(`[Confirmation] Reply captured for "${record.entityName}" / ${record.category} from ${fromName} <${fromEmail}>`);
    } catch (err) {
      console.error(`[Confirmation] Error checking reply for record ${record.id}:`, err);
    }
  }

  return repliesFound;
}

// Get or create AppSettings for a user
export async function getOrCreateSettings(userId: string) {
  let settings = await prisma.appSettings.findUnique({ where: { userId } });
  if (!settings) {
    settings = await prisma.appSettings.create({
      data: { userId },
    });
  }
  return settings;
}

// Update AppSettings for a user
export async function updateSettings(userId: string, data: {
  autoReplyCheck?: boolean;
  replyCheckIntervalMinutes?: number;
  emailSaveBasePath?: string;
}) {
  return prisma.appSettings.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
}

// Diagnostic: fetch raw inbox messages visible to the reply-check logic
export async function debugInboxScan(userId: string, since?: string): Promise<{
  error?: string;
  pendingRecords: Array<{ id: string; entityName: string; status: string; sentAt: string | null; sentMessageId: string | null }>;
  inboxMessages: Array<{ id: string; subject: string; from: string; receivedDateTime: string; conversationId: string }>;
}> {
  const pendingRecords = await prisma.confirmationRecord.findMany({
    where: {
      userId,
      status: { in: [CONFIRMATION_STATUSES.SENT, CONFIRMATION_STATUSES.FOLLOWUP_SENT] },
      sentAt: { not: null },
    },
    select: { id: true, entityName: true, status: true, sentAt: true, sentMessageId: true },
  });

  const config = await EmailConfigService.getActiveConfig(userId);
  if (!config) return { error: 'No active email config', pendingRecords: pendingRecords.map(r => ({ ...r, sentAt: r.sentAt?.toISOString() ?? null })), inboxMessages: [] };

  let accessToken: string;
  try {
    accessToken = await GraphMailService.getAccessToken(config);
  } catch (err: any) {
    return { error: `Token error: ${err.message}`, pendingRecords: pendingRecords.map(r => ({ ...r, sentAt: r.sentAt?.toISOString() ?? null })), inboxMessages: [] };
  }

  const windowIso = since || (pendingRecords.reduce((earliest, r) => {
    const d = r.sentAt ? new Date(r.sentAt) : new Date();
    return d < earliest ? d : earliest;
  }, new Date())).toISOString();

  const inboxUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(config.fromEmail)}/mailFolders/Inbox/messages`
    + `?$filter=receivedDateTime ge ${windowIso}`
    + `&$orderby=receivedDateTime desc&$top=50`
    + `&$select=id,subject,from,sender,receivedDateTime,conversationId`;

  const res = await fetch(inboxUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    const errBody = await res.text();
    return { error: `Inbox fetch ${res.status}: ${errBody}`, pendingRecords: pendingRecords.map(r => ({ ...r, sentAt: r.sentAt?.toISOString() ?? null })), inboxMessages: [] };
  }

  const data = await res.json();
  const inboxMessages = (data.value || []).map((m: any) => ({
    id: m.id,
    subject: m.subject,
    from: m.from?.emailAddress?.address || '',
    fromName: m.from?.emailAddress?.name || '',
    sender: m.sender?.emailAddress?.address || '',
    receivedDateTime: m.receivedDateTime,
    conversationId: m.conversationId,
  }));

  return {
    pendingRecords: pendingRecords.map(r => ({ ...r, sentAt: r.sentAt?.toISOString() ?? null })),
    inboxMessages,
  };
}

// Get distinct entity names for a user (for filter dropdowns)
export async function getEntityNames(userId: string): Promise<string[]> {
  const records = await prisma.confirmationRecord.findMany({
    where: { userId },
    select: { entityName: true },
    distinct: ['entityName'],
    orderBy: { entityName: 'asc' },
  });
  return records.map((r) => r.entityName);
}
