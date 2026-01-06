import { Client } from '@microsoft/microsoft-graph-client';
import { EmailConfig } from '@prisma/client';
import fs from 'fs';
import path from 'path';

// Get access token using client credentials flow
async function getAccessToken(config: EmailConfig): Promise<string> {
  const tokenUrl = `https://login.microsoftonline.com/${config.msTenantId}/oauth2/v2.0/token`;

  const params = new URLSearchParams({
    client_id: config.msClientId,
    client_secret: config.msClientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });

  console.log('🔐 [Token] Requesting access token');
  console.log('🔐 [Token] Token URL:', tokenUrl);
  console.log('🔐 [Token] Client ID:', config.msClientId);
  console.log('🔐 [Token] Tenant ID:', config.msTenantId);
  console.log('🔐 [Token] Client Secret:', config.msClientSecret ? '***' + config.msClientSecret.slice(-4) : 'MISSING');

  try {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });

    console.log('🔐 [Token] Response status:', response.status, response.statusText);

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ [Token] Token request failed:', {
        status: response.status,
        statusText: response.statusText,
        error: data.error,
        error_description: data.error_description,
        error_codes: data.error_codes,
        correlation_id: data.correlation_id,
        fullResponse: data,
      });
      throw new Error(`Token request failed: ${data.error_description || data.error || 'Unknown error'}`);
    }

    if (!data.access_token) {
      console.error('❌ [Token] No access token in response:', data);
      throw new Error('No access token received from token endpoint');
    }

    console.log('✅ [Token] Access token obtained successfully');
    console.log('🔑 [Token] Token type:', data.token_type);
    console.log('🔑 [Token] Expires in:', data.expires_in, 'seconds');
    console.log('🔑 [Token] Token preview:', data.access_token.substring(0, 30) + '...');

    return data.access_token;
  } catch (error: any) {
    console.error('❌ [Token] Error getting access token:', {
      message: error.message,
      stack: error.stack,
    });
    if (error.message) {
      throw error;
    }
    throw new Error(`Failed to get access token: ${error.message || 'Unknown error'}`);
  }
}

// Note: We're using direct fetch API instead of Graph SDK to avoid token formatting issues
// This function is kept for backward compatibility but not used
async function getGraphClient(config: EmailConfig): Promise<Client> {
  const accessToken = await getAccessToken(config);

  return Client.init({
    authProvider: (done) => {
      done(null, accessToken);
    },
  });
}

export interface GraphEmail {
  id: string;
  subject?: string;
  body?: {
    content: string;
    contentType: string;
  };
  bodyPreview?: string;
  from?: {
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
  receivedDateTime: string;
  hasAttachments: boolean;
  attachments?: Array<{
    id: string;
    name: string;
    contentType: string;
    size: number;
  }>;
}

export class EmailFetchService {
  // Fetch emails sent to a specific sender
  static async fetchEmailsForSender(
    config: EmailConfig,
    senderEmail: string,
    limit: number = 50
  ): Promise<GraphEmail[]> {
    try {
      console.log('📧 [Email Fetch] Starting email fetch process');
      console.log('📧 [Email Fetch] Parameters:', {
        fromEmail: config.fromEmail,
        senderEmail: senderEmail,
        limit: limit,
        tenantId: config.msTenantId,
        clientId: config.msClientId,
      });

      const accessToken = await getAccessToken(config);
      console.log('✅ [Email Fetch] Access token obtained successfully');
      console.log('🔑 [Email Fetch] Token preview:', accessToken.substring(0, 20) + '...');

      // Microsoft Graph API filter syntax for sender emails
      // Properly escape the email address
      const escapedEmail = senderEmail.replace(/'/g, "''");
      
      // Build the filter - try simpler approach first, then filter client-side if needed
      const select = 'id,subject,body,bodyPreview,from,toRecipients,receivedDateTime,hasAttachments';
      const orderBy = 'receivedDateTime desc';
      
      // Build URL - fetch recent messages and filter client-side for better compatibility
      const baseUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(config.fromEmail)}/messages`;
      const params = new URLSearchParams({
        '$select': select,
        '$orderby': orderBy,
        '$top': (limit * 2).toString(), // Fetch more to account for filtering
      });
      
      const url = `${baseUrl}?${params.toString()}`;
      console.log('🌐 [Email Fetch] Request URL:', url);
      console.log('🌐 [Email Fetch] Request params:', {
        select,
        orderBy,
        top: limit * 2,
      });
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      console.log('📡 [Email Fetch] Response status:', response.status, response.statusText);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('❌ [Email Fetch] Graph API Error Details:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData,
          url: url,
          headers: Object.fromEntries(response.headers.entries()),
        });
        throw new Error(`Graph API error: ${response.status} - ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();
      console.log('📦 [Email Fetch] Response data summary:', {
        totalEmailsFetched: data.value?.length || 0,
        hasNextLink: !!data['@odata.nextLink'],
        hasDeltaLink: !!data['@odata.deltaLink'],
        odataContext: data['@odata.context'],
      });

      let emails: GraphEmail[] = data.value || [];
      console.log('📬 [Email Fetch] Raw emails fetched:', emails.length);
      
      // Log detailed information about all fetched emails
      if (emails.length > 0) {
        console.log('📋 [Email Fetch] Sample email structure (first email):', JSON.stringify({
          id: emails[0].id,
          subject: emails[0].subject,
          from: emails[0].from,
          toRecipients: emails[0].toRecipients,
          toRecipientsCount: emails[0].toRecipients?.length || 0,
          receivedDateTime: emails[0].receivedDateTime,
        }, null, 2));
        
        // Log ALL recipient emails from ALL fetched emails
        console.log('👥 [Email Fetch] ALL recipient emails in fetched emails:');
        emails.forEach((email, idx) => {
          const recipients = email.toRecipients || [];
          const recipientAddresses = recipients.map((r: any) => r.emailAddress?.address).filter(Boolean);
          const ccRecipients = (email as any).ccRecipients || [];
          const ccAddresses = ccRecipients.map((r: any) => r.emailAddress?.address).filter(Boolean);
          const bccRecipients = (email as any).bccRecipients || [];
          const bccAddresses = bccRecipients.map((r: any) => r.emailAddress?.address).filter(Boolean);
          
          console.log(`  Email ${idx + 1} [${email.subject || '(No Subject)'}]:`, {
            to: recipientAddresses,
            cc: ccAddresses.length > 0 ? ccAddresses : 'none',
            bcc: bccAddresses.length > 0 ? bccAddresses : 'none',
            from: email.from?.emailAddress?.address,
            receivedDateTime: email.receivedDateTime,
          });
        });
        
        // Log unique recipient addresses found
        const allRecipientAddresses = new Set<string>();
        emails.forEach((email) => {
          const recipients = email.toRecipients || [];
          recipients.forEach((r: any) => {
            if (r.emailAddress?.address) {
              allRecipientAddresses.add(r.emailAddress.address.toLowerCase());
            }
          });
        });
        console.log('📊 [Email Fetch] Unique recipient addresses found:', Array.from(allRecipientAddresses));
        console.log('🔍 [Email Fetch] Looking for sender:', senderEmail.toLowerCase());
        console.log('🔍 [Email Fetch] Match found?', allRecipientAddresses.has(senderEmail.toLowerCase()));
      } else {
        console.warn('⚠️  [Email Fetch] No emails were returned from the API!');
        console.warn('⚠️  [Email Fetch] This could mean:');
        console.warn('   - The mailbox is empty');
        console.warn('   - The fromEmail does not have access to the mailbox');
        console.warn('   - There are no messages in the mailbox');
      }
      
      // Filter client-side for emails sent to the sender
      // This is more reliable than OData filter with 'any' operator
      console.log('🔍 [Email Fetch] Filtering emails for sender:', senderEmail);
      const beforeFilterCount = emails.length;
      const emailData: any[] = [];
      emails = emails.filter((email) => {
        const recipients = email.toRecipients || [];

        // Check direct recipients
        const matchesRecipient = recipients.some(
          (r: any) => r.emailAddress?.address?.toLowerCase() === senderEmail.toLowerCase()
        );

        // ALSO check if the sender (from.address) matches the senderEmail
        const fromAddress = email.from?.emailAddress?.address?.toLowerCase();
        const matchesSender = fromAddress === senderEmail.toLowerCase();

        const matches = matchesRecipient || matchesSender;

        if (!matches && recipients.length > 0) {
          // Log non-matching emails for debugging
          const recipientAddresses = recipients.map((r: any) => r.emailAddress?.address).filter(Boolean);
          console.log(`  ⚠️  Email "${email.subject}" sent to:`, recipientAddresses, 'from:', fromAddress, 'does not match:', senderEmail);
          emailData.push({
            id: email.id,
            subject: email.subject,
            from: email.from,
            toRecipients: email.toRecipients,
            toRecipientsCount: email.toRecipients?.length || 0,
            receivedDateTime: email.receivedDateTime,
          });
        }

        return matches;
      }).slice(0, limit); // Limit to requested amount

      // INSERT_YOUR_CODE
      // Save the emailData array to a text file for debugging/auditing
      try {
        const fs = require('fs');
        const path = require('path');
        const debugLogsDir = path.join(process.cwd(), 'logs');
        if (!fs.existsSync(debugLogsDir)) {
          fs.mkdirSync(debugLogsDir, { recursive: true });
        }
        const debugFilePath = path.join(debugLogsDir, 'filtered-emails-debug.txt');
        const timestamp = new Date().toISOString();
        const fileContents =
          `================= ${timestamp} =================\n` +
          `Sender: ${senderEmail}\n` +
          `Total non-matching emails: ${emailData.length}\n` +
          JSON.stringify(emailData, null, 2) +
          '\n\n';

        fs.appendFileSync(debugFilePath, fileContents, 'utf8');
        console.log('📝 [Email Fetch Debug] Non-matching sender emails written to:', debugFilePath);
      } catch (err) {
        console.error('❌ [Email Fetch Debug] Failed to write debug email data to file:', err);
      }
      
      console.log('✅ [Email Fetch] Filtering complete:', {
        beforeFilter: beforeFilterCount,
        afterFilter: emails.length,
        senderEmail: senderEmail,
      });
      
      if (emails.length === 0 && beforeFilterCount > 0) {
        console.warn('⚠️  [Email Fetch] No emails matched the sender filter!');
        console.warn('⚠️  [Email Fetch] This might mean:');
        console.warn('   - The sender email does not match exactly (case-sensitive comparison)');
        console.warn('   - The emails are in CC or BCC instead of To');
        console.warn('   - The sender email format is different');
      }

      // Fetch attachments for emails that have them
      console.log('📎 [Email Fetch] Fetching attachments for', emails.filter(e => e.hasAttachments).length, 'emails');
      const emailsWithAttachments = await Promise.all(
        emails.map(async (email) => {
          if (email.hasAttachments) {
            try {
              const attachmentsUrl = `https://graph.microsoft.com/v1.0/users/${config.fromEmail}/messages/${email.id}/attachments`;
              console.log(`  📎 Fetching attachments for email: ${email.id} (${email.subject || 'No Subject'})`);
              
              const attachmentsResponse = await fetch(attachmentsUrl, {
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                  'Content-Type': 'application/json',
                },
              });

              if (attachmentsResponse.ok) {
                const attachmentsData = await attachmentsResponse.json();
                email.attachments = attachmentsData.value?.map((att: any) => ({
                  id: att.id,
                  name: att.name,
                  contentType: att.contentType,
                  size: att.size,
                }));
                console.log(`  ✅ Fetched ${email.attachments?.length || 0} attachments for email: ${email.id}`);
              } else {
                console.warn(`  ⚠️  Failed to fetch attachments for email ${email.id}:`, attachmentsResponse.status, attachmentsResponse.statusText);
              }
            } catch (err) {
              console.error(`  ❌ Error fetching attachments for email ${email.id}:`, err);
            }
          }
          return email;
        })
      );

      console.log('🎉 [Email Fetch] Final result:', {
        totalEmails: emailsWithAttachments.length,
        emailsWithAttachments: emailsWithAttachments.filter(e => e.attachments && e.attachments.length > 0).length,
        senderEmail: senderEmail,
      });

      console.log('📧 [Email Fetch] ============================================');
      console.log('📧 [Email Fetch] SUMMARY:');
      console.log('📧 [Email Fetch] Fetching from mailbox:', config.fromEmail);
      console.log('📧 [Email Fetch] Looking for emails sent to:', senderEmail);
      console.log('📧 [Email Fetch] Total emails fetched from API:', data.value?.length || 0);
      console.log('📧 [Email Fetch] Emails matching sender:', emailsWithAttachments.length);
      console.log('📧 [Email Fetch] ============================================');

      return emailsWithAttachments;
    } catch (error: any) {
      console.error('❌ [Email Fetch] Error fetching emails:', {
        message: error.message,
        stack: error.stack,
        senderEmail: senderEmail,
        fromEmail: config.fromEmail,
      });
      throw error;
    }
  }

  // Get email details by ID
  static async getEmailById(config: EmailConfig, messageId: string): Promise<GraphEmail> {
    try {
      const accessToken = await getAccessToken(config);

      const select = 'id,subject,body,bodyPreview,from,toRecipients,receivedDateTime,hasAttachments';
      const url = `https://graph.microsoft.com/v1.0/users/${config.fromEmail}/messages/${messageId}?$select=${select}`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Graph API error: ${response.status} - ${errorData.error?.message || response.statusText}`);
      }

      const email: GraphEmail = await response.json();

      // Fetch attachments if exists
      if (email.hasAttachments) {
        try {
          const attachmentsUrl = `https://graph.microsoft.com/v1.0/users/${config.fromEmail}/messages/${messageId}/attachments`;
          const attachmentsResponse = await fetch(attachmentsUrl, {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          });

          if (attachmentsResponse.ok) {
            const attachmentsData = await attachmentsResponse.json();
            email.attachments = attachmentsData.value?.map((att: any) => ({
              id: att.id,
              name: att.name,
              contentType: att.contentType,
              size: att.size,
            }));
          }
        } catch (err) {
          console.error(`Error fetching attachments:`, err);
        }
      }

      return email;
    } catch (error) {
      console.error('Error fetching email by ID:', error);
      throw error;
    }
  }

  // Get replies to a forwarded message
  static async getRepliesToMessage(config: EmailConfig, forwardMessageId: string): Promise<GraphEmail[]> {
    try {
      console.log('💬 [Replies] Fetching replies for message:', forwardMessageId);
      const accessToken = await getAccessToken(config);

      // Get the forwarded message to find its conversation ID and other details
      const forwardMessageUrl = `https://graph.microsoft.com/v1.0/users/${config.fromEmail}/messages/${forwardMessageId}?$select=id,subject,conversationId,parentFolderId,sentDateTime`;
      const forwardResponse = await fetch(forwardMessageUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!forwardResponse.ok) {
        const errorData = await forwardResponse.json().catch(() => ({}));
        console.error('❌ [Replies] Failed to get forwarded message:', forwardResponse.status, errorData);
        return [];
      }

      const forwardMessage = await forwardResponse.json();
      console.log('📧 [Replies] Forwarded message details:', {
        id: forwardMessage.id,
        subject: forwardMessage.subject,
        conversationId: forwardMessage.conversationId,
        sentDateTime: forwardMessage.sentDateTime,
      });

      const conversationId = forwardMessage.conversationId;

      if (!conversationId) {
        console.warn('⚠️ [Replies] No conversationId found for forwarded message');
        return [];
      }

      // Note: Filtering by conversationId causes "InefficientFilter" error
      // So we'll fetch recent messages and filter client-side by conversationId
      const select = 'id,subject,body,bodyPreview,from,toRecipients,receivedDateTime,hasAttachments,conversationId';
      
      // Fetch attachments for replies
      const fetchAttachmentsForReplies = async (replies: GraphEmail[]) => {
        return Promise.all(
          replies.map(async (reply) => {
            if (reply.hasAttachments) {
              try {
                const attachmentsUrl = `https://graph.microsoft.com/v1.0/users/${config.fromEmail}/messages/${reply.id}/attachments`;
                const attachmentsResponse = await fetch(attachmentsUrl, {
                  headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                  },
                });

                if (attachmentsResponse.ok) {
                  const attachmentsData = await attachmentsResponse.json();
                  reply.attachments = attachmentsData.value?.map((att: any) => ({
                    id: att.id,
                    name: att.name,
                    contentType: att.contentType,
                    size: att.size,
                  }));
                }
              } catch (err) {
                console.error(`Error fetching attachments for reply ${reply.id}:`, err);
              }
            }
            return reply;
          })
        );
      };
      
      // Fetch recent messages from inbox (where replies would be received)
      // Get messages from the last 7 days to limit the search
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const dateFilter = `receivedDateTime ge ${sevenDaysAgo.toISOString()}`;
      
      console.log('🔍 [Replies] Fetching recent messages from inbox (last 7 days)...');
      const inboxUrl = `https://graph.microsoft.com/v1.0/users/${config.fromEmail}/mailFolders/inbox/messages?$filter=${encodeURIComponent(dateFilter)}&$select=${select}&$orderby=receivedDateTime desc&$top=200`;
      
      let allMessages: any[] = [];
      
      const inboxResponse = await fetch(inboxUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (inboxResponse.ok) {
        const inboxData = await inboxResponse.json();
        console.log('✅ [Replies] Found recent messages in inbox:', inboxData.value?.length || 0);
        allMessages = inboxData.value || [];
      } else {
        const errorData = await inboxResponse.json().catch(() => ({}));
        console.warn('⚠️ [Replies] Inbox search failed:', inboxResponse.status, errorData);
        
        // Fallback: fetch without date filter
        console.log('🔄 [Replies] Trying without date filter...');
        const fallbackUrl = `https://graph.microsoft.com/v1.0/users/${config.fromEmail}/mailFolders/inbox/messages?$select=${select}&$orderby=receivedDateTime desc&$top=200`;
        const fallbackResponse = await fetch(fallbackUrl, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        });
        
        if (fallbackResponse.ok) {
          const fallbackData = await fallbackResponse.json();
          console.log('✅ [Replies] Found messages (fallback):', fallbackData.value?.length || 0);
          allMessages = fallbackData.value || [];
        }
      }

      console.log('📬 [Replies] Total messages fetched:', allMessages.length);
      
      // Log all fetched messages to file
      try {
        const logDir = path.join(process.cwd(), 'logs');
        if (!fs.existsSync(logDir)) {
          fs.mkdirSync(logDir, { recursive: true });
        }

        const logFile = path.join(logDir, 'recent-messages-for-replies.txt');
        const timestamp = new Date().toISOString();
        const logEntry = `
================================================================================
Timestamp: ${timestamp}
Forwarded Message ID: ${forwardMessageId}
Conversation ID: ${conversationId}
Total Messages Fetched: ${allMessages.length}
================================================================================
`;

        let messagesLog = logEntry;
        allMessages.forEach((msg, index) => {
          messagesLog += `
Message ${index + 1}:
  ID: ${msg.id}
  Subject: ${msg.subject || '(No Subject)'}
  From: ${msg.from?.emailAddress?.name || ''} <${msg.from?.emailAddress?.address || ''}>
  To: ${msg.toRecipients?.map((r: any) => r.emailAddress?.address).join(', ') || 'N/A'}
  Received: ${msg.receivedDateTime || 'N/A'}
  Conversation ID: ${msg.conversationId || 'N/A'}
  Matches Conversation: ${msg.conversationId === conversationId ? 'YES' : 'NO'}
  Has Attachments: ${msg.hasAttachments ? 'Yes' : 'No'}
  Body Preview: ${msg.bodyPreview || 'N/A'}
---
`;
        });

        fs.appendFileSync(logFile, messagesLog, 'utf8');
        console.log(`📝 [Replies] All fetched messages logged to: ${logFile}`);
      } catch (error) {
        console.error('❌ [Replies] Error logging messages to file:', error);
        // Don't fail if file logging fails
      }
      
      // Filter by conversationId client-side
      const conversationMessages = allMessages.filter((msg: any) => msg.conversationId === conversationId);
      console.log('🔍 [Replies] Messages in same conversation:', conversationMessages.length);
      
      // Filter out the original forwarded message and filter by date client-side
      let replies = conversationMessages.filter((msg: any) => {
        // Exclude the forwarded message itself
        if (msg.id === forwardMessageId) {
          return false;
        }
        
        // Filter by date: only include messages received after the forwarded message was sent
        if (forwardMessage.sentDateTime && msg.receivedDateTime) {
          const sentDate = new Date(forwardMessage.sentDateTime);
          const receivedDate = new Date(msg.receivedDateTime);
          return receivedDate > sentDate;
        }
        
        return true;
      });
      
      console.log('📬 [Replies] Filtered replies count (after date filter):', replies.length);
      
      // Fetch attachments for all replies
      if (replies.length > 0) {
        replies = await fetchAttachmentsForReplies(replies);
      }
      
      return replies;
    } catch (error) {
      console.error('❌ [Replies] Error fetching replies:', error);
      return [];
    }
  }

  // Download attachment content
  static async downloadAttachment(config: EmailConfig, messageId: string, attachmentId: string): Promise<Buffer> {
    try {
      const accessToken = await getAccessToken(config);

      // Use fetch directly to get binary data
      const response = await fetch(
        `https://graph.microsoft.com/v1.0/users/${config.fromEmail}/messages/${messageId}/attachments/${attachmentId}/$value`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to download attachment: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      console.error('Error downloading attachment:', error);
      throw error;
    }
  }
}
