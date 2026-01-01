import { Client } from '@microsoft/microsoft-graph-client';
import { EmailConfig } from '@prisma/client';
import { EmailFetchService } from './email-fetch-service';

// Get access token using client credentials flow
async function getAccessToken(config: EmailConfig): Promise<string> {
  const tokenUrl = `https://login.microsoftonline.com/${config.msTenantId}/oauth2/v2.0/token`;

  const params = new URLSearchParams({
    client_id: config.msClientId,
    client_secret: config.msClientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });

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
}

// Get Graph client
async function getGraphClient(config: EmailConfig): Promise<Client> {
  const accessToken = await getAccessToken(config);

  // The Graph SDK automatically adds "Bearer" prefix, so we just pass the token
  return Client.init({
    authProvider: (done) => {
      done(null, accessToken);
    },
  });
}

export interface ForwardEmailOptions {
  originalMessageId: string;
  forwardTo: string | string[];
  includeOriginalBody?: boolean;
  customMessage?: string;
}

export class EmailForwardService {
  // Forward an email with attachments
  static async forwardEmail(
    config: EmailConfig,
    options: ForwardEmailOptions
  ): Promise<{ messageId: string }> {
    try {
      // First, get the original email with attachments
      const originalEmail = await EmailFetchService.getEmailById(config, options.originalMessageId);

      const client = await getGraphClient(config);

      // Prepare forward recipients
      const forwardToArray = Array.isArray(options.forwardTo) ? options.forwardTo : [options.forwardTo];
      const toRecipients = forwardToArray.map((email) => ({
        emailAddress: { address: email },
      }));

      // Build forward message body
      let forwardBody = '';
      if (options.customMessage) {
        forwardBody += `<p>${options.customMessage.replace(/\n/g, '<br>')}</p><hr/>`;
      }

      if (options.includeOriginalBody !== false) {
        forwardBody += `<div style="border-left: 3px solid #ccc; padding-left: 10px; margin-top: 10px;">`;
        forwardBody += `<p><strong>From:</strong> ${originalEmail.from?.emailAddress.address}</p>`;
        forwardBody += `<p><strong>Date:</strong> ${new Date(originalEmail.receivedDateTime).toLocaleString()}</p>`;
        forwardBody += `<p><strong>Subject:</strong> ${originalEmail.subject || '(No Subject)'}</p>`;
        forwardBody += `<hr/>`;
        forwardBody += originalEmail.body?.content || originalEmail.bodyPreview || '';
        forwardBody += `</div>`;
      }

      // Prepare message object
      const message: any = {
        message: {
          subject: `Fwd: ${originalEmail.subject || '(No Subject)'}`,
          body: {
            contentType: 'HTML',
            content: forwardBody,
          },
          toRecipients,
        },
      };

      // Add attachments if they exist
      if (originalEmail.attachments && originalEmail.attachments.length > 0) {
        message.message.attachments = await Promise.all(
          originalEmail.attachments.map(async (attachment) => {
            // Download attachment content
            const attachmentContent = await EmailFetchService.downloadAttachment(
              config,
              options.originalMessageId,
              attachment.id
            );

            // Convert to base64 if it's a buffer
            let contentBytes: string;
            if (Buffer.isBuffer(attachmentContent)) {
              contentBytes = attachmentContent.toString('base64');
            } else if (typeof attachmentContent === 'string') {
              contentBytes = Buffer.from(attachmentContent).toString('base64');
            } else {
              contentBytes = Buffer.from(JSON.stringify(attachmentContent)).toString('base64');
            }

            return {
              '@odata.type': '#microsoft.graph.fileAttachment',
              name: attachment.name,
              contentType: attachment.contentType,
              contentBytes: contentBytes,
            };
          })
        );
      }

      // Send the forward using sendMail endpoint
      await client.api(`/users/${config.fromEmail}/sendMail`).post({
        message: message.message,
      });

      // Wait a moment for the message to be sent and appear in sent items
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Get the sent message ID by searching for the most recent sent message with the subject
      // Note: sendMail doesn't return message ID directly, so we search for it in sent items
      try {
        const accessToken = await getAccessToken(config);
        const searchSubject = `Fwd: ${originalEmail.subject || '(No Subject)'}`;
        
        // Search in sent items folder
        const sentMessagesUrl = `https://graph.microsoft.com/v1.0/users/${config.fromEmail}/mailFolders/sentItems/messages?$filter=subject eq '${encodeURIComponent(searchSubject)}'&$orderby=sentDateTime desc&$top=1&$select=id,subject,sentDateTime`;
        
        console.log('🔍 [Forward] Searching for sent message with subject:', searchSubject);
        
        const sentResponse = await fetch(sentMessagesUrl, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        });

        if (sentResponse.ok) {
          const sentData = await sentResponse.json();
          console.log('📬 [Forward] Sent messages found:', sentData.value?.length || 0);
          
          if (sentData.value && sentData.value.length > 0) {
            const messageId = sentData.value[0].id;
            console.log('✅ [Forward] Found forwarded message ID:', messageId);
            return { messageId };
          }
        } else {
          const errorData = await sentResponse.json().catch(() => ({}));
          console.warn('⚠️ [Forward] Failed to search sent messages:', sentResponse.status, errorData);
        }
        
        // Try alternative: search in all messages with a time-based filter
        const now = new Date();
        const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
        const timeFilter = `sentDateTime ge ${fiveMinutesAgo.toISOString()}`;
        const altUrl = `https://graph.microsoft.com/v1.0/users/${config.fromEmail}/messages?$filter=${encodeURIComponent(timeFilter)} and subject eq '${encodeURIComponent(searchSubject)}'&$orderby=sentDateTime desc&$top=1&$select=id,subject,sentDateTime`;
        
        console.log('🔍 [Forward] Trying alternative search...');
        const altResponse = await fetch(altUrl, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        });
        
        if (altResponse.ok) {
          const altData = await altResponse.json();
          if (altData.value && altData.value.length > 0) {
            const messageId = altData.value[0].id;
            console.log('✅ [Forward] Found forwarded message ID (alternative):', messageId);
            return { messageId };
          }
        }
      } catch (error) {
        console.error('❌ [Forward] Error finding forwarded message ID:', error);
      }
      
      console.warn('⚠️ [Forward] Could not find forwarded message ID, using placeholder');
      return { messageId: 'forwarded' }; // Fallback if we can't find the message ID
    } catch (error) {
      console.error('Error forwarding email:', error);
      throw error;
    }
  }
}
