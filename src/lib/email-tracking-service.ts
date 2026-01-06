import { prisma } from './prisma';
import { EmailFetchService, GraphEmail } from './email-fetch-service';
import { EmailConfig } from '@prisma/client';
import fs from 'fs';
import path from 'path';

export class EmailTrackingService {
  // Log email to text file for testing
  static async logEmailToFile(graphEmail: GraphEmail, senderEmail: string) {
    try {
      const logDir = path.join(process.cwd(), 'logs');
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      const logFile = path.join(logDir, 'received-emails.txt');
      const timestamp = new Date().toISOString();
      const logEntry = `
================================================================================
Timestamp: ${timestamp}
Email ID: ${graphEmail.id}
Subject: ${graphEmail.subject || '(No Subject)'}
From: ${graphEmail.from?.emailAddress.name || ''} <${graphEmail.from?.emailAddress.address || ''}>
To: ${graphEmail.toRecipients?.map((r: any) => r.emailAddress?.address).join(', ') || 'N/A'}
Received: ${graphEmail.receivedDateTime}
Has Attachments: ${graphEmail.hasAttachments ? 'Yes' : 'No'}
Sender Being Tracked: ${senderEmail}
Body Preview: ${graphEmail.bodyPreview || 'N/A'}
================================================================================
`;

      fs.appendFileSync(logFile, logEntry, 'utf8');
      console.log(`📝 [Email Log] Email logged to: ${logFile}`);
    } catch (error) {
      console.error('❌ [Email Log] Error logging email to file:', error);
      // Don't fail the tracking if file logging fails
    }
  }

  // Track a new email (store in database)
  static async trackEmail(
    senderId: string,
    emailConfigId: string,
    userId: string,
    graphEmail: GraphEmail
  ) {
    // Check if already tracked
    const existing = await prisma.emailTracking.findUnique({
      where: { originalMessageId: graphEmail.id },
    });

    if (existing) {
      return existing;
    }

    // Extract sender email from toRecipients
    const senderEmail = graphEmail.toRecipients?.[0]?.emailAddress.address || '';

    // Log email to file for testing
    await this.logEmailToFile(graphEmail, senderEmail);

    return prisma.emailTracking.create({
      data: {
        senderId,
        emailConfigId,
        userId,
        originalMessageId: graphEmail.id,
        originalSubject: graphEmail.subject,
        originalBody: graphEmail.body?.contentType === 'text' ? graphEmail.body.content : undefined,
        originalHtmlBody: graphEmail.body?.contentType === 'HTML' ? graphEmail.body.content : graphEmail.bodyPreview,
        originalFromEmail: graphEmail.from?.emailAddress.address || '',
        originalFromName: graphEmail.from?.emailAddress.name,
        originalReceivedAt: new Date(graphEmail.receivedDateTime),
        hasAttachments: graphEmail.hasAttachments || false,
        attachmentIds: graphEmail.attachments
          ? JSON.stringify(graphEmail.attachments.map((a) => a.id))
          : null,
      },
    });
  }

  // Mark email as forwarded
  static async markAsForwarded(
    trackingId: string,
    forwardedTo: string | string[],
    forwardMessageId?: string,
    autoForwarded: boolean = false
  ) {
    const forwardedToString = Array.isArray(forwardedTo) ? forwardedTo.join(', ') : forwardedTo;

    return prisma.emailTracking.update({
      where: { id: trackingId },
      data: {
        isForwarded: true,
        forwardedTo: forwardedToString,
        forwardedAt: new Date(),
        forwardMessageId: forwardMessageId || null,
        autoForwarded,
        status: 'forwarded',
      },
    });
  }

  // Mark email as having replies
  static async markAsReplied(trackingId: string, replyCount: number = 1) {
    const tracking = await prisma.emailTracking.findUnique({
      where: { id: trackingId },
    });

    return prisma.emailTracking.update({
      where: { id: trackingId },
      data: {
        hasReplies: true,
        replyCount: (tracking?.replyCount || 0) + replyCount,
        lastReplyAt: new Date(),
        status: 'replied',
      },
    });
  }

  // Check for replies to a forwarded message and save them
  static async checkForReplies(trackingId: string, config: EmailConfig, forwardMessageId: string) {
    try {
      console.log(`💬 [Replies Check] Checking for replies for forwarded message ID: ${forwardMessageId}`);
      const replies = await EmailFetchService.getRepliesToMessage(config, forwardMessageId);
      
      if (replies.length > 0) {
        console.log(`✅ [Replies Check] Found ${replies.length} replies for ${forwardMessageId}`);
        
        // Save each reply to the database
        const tracking = await prisma.emailTracking.findUnique({
          where: { id: trackingId },
        });
        
        if (!tracking) {
          console.error(`❌ [Replies Check] Tracking not found: ${trackingId}`);
          return;
        }
        
        // Get existing reply message IDs to avoid duplicates
        const existingReplies = await prisma.emailReply.findMany({
          where: { emailTrackingId: trackingId },
          select: { messageId: true },
        });
        const existingMessageIds = new Set(existingReplies.map(r => r.messageId));
        
        // Save new replies
        let newReplyCount = 0;
        for (const reply of replies) {
          if (!existingMessageIds.has(reply.id)) {
            // Fetch attachments if any
            let attachmentInfo: any[] = [];
            if (reply.hasAttachments && reply.attachments) {
              attachmentInfo = reply.attachments.map((att: any) => ({
                id: att.id,
                name: att.name,
                contentType: att.contentType,
                size: att.size,
              }));
            } else if (reply.hasAttachments) {
              // Fetch attachments if not already included
              try {
                const fullReply = await EmailFetchService.getEmailById(config, reply.id);
                if (fullReply.attachments) {
                  attachmentInfo = fullReply.attachments.map((att: any) => ({
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
            
            await prisma.emailReply.create({
              data: {
                emailTrackingId: trackingId,
                messageId: reply.id,
                subject: reply.subject,
                body: reply.body?.contentType === 'text' ? reply.body.content : undefined,
                htmlBody: reply.body?.contentType === 'HTML' ? reply.body.content : reply.bodyPreview,
                bodyPreview: reply.bodyPreview,
                fromEmail: reply.from?.emailAddress.address || '',
                fromName: reply.from?.emailAddress.name,
                receivedAt: new Date(reply.receivedDateTime),
                hasAttachments: reply.hasAttachments || false,
                attachmentIds: attachmentInfo.length > 0 ? JSON.stringify(attachmentInfo) : null,
                userId: tracking.userId,
                emailConfigId: tracking.emailConfigId,
              },
            });
            newReplyCount++;
          }
        }
        
        if (newReplyCount > 0) {
          await this.markAsReplied(trackingId, newReplyCount);
          console.log(`✅ [Replies Check] Saved ${newReplyCount} new replies to database`);
        } else {
          console.log(`ℹ️  [Replies Check] All replies already saved`);
        }
      } else {
        console.log(`No replies found for ${forwardMessageId}`);
      }
    } catch (error) {
      console.error(`❌ [Replies Check] Error checking for replies for ${forwardMessageId}:`, error);
    }
  }

  // Sync emails for a sender (fetch from Graph API and track)
  static async syncEmailsForSender(
    senderEmail: string,
    senderId: string,
    config: EmailConfig,
    userId: string,
    limit: number = 50,
    autoForward: boolean = false
  ) {
    try {
      // Fetch emails from Graph API
      const graphEmails = await EmailFetchService.fetchEmailsForSender(config, senderEmail, limit);

      // Track each email
      const trackedEmails = await Promise.all(
        graphEmails.map(async (email) => {
          const tracked = await this.trackEmail(senderId, config.id, userId, email);
          
          // Auto-forward if enabled and not already forwarded
          // Use atomic check-and-update to prevent duplicate forwarding
          if (autoForward && tracked) {
            try {
              // Atomic check: Only proceed if email is NOT already forwarded
              // This prevents race conditions when multiple cron jobs run simultaneously
              const currentTracking = await prisma.emailTracking.findUnique({
                where: { id: tracked.id },
                select: { isForwarded: true },
              });

              if (currentTracking?.isForwarded) {
                console.log(`⏭️  [Auto-Forward] Email ${tracked.id} already forwarded, skipping`);
                // Still check for replies if already forwarded
                if (tracked.forwardMessageId) {
                  await this.checkForReplies(tracked.id, config, tracked.forwardMessageId);
                }
                return tracked;
              }

              const { ForwardingRuleService } = await import('./forwarding-rule-service');
              const { EmailForwardService } = await import('./email-forward-service');
              
              const rules = await ForwardingRuleService.getRulesBySenderId(senderId, userId);
              
              // Collect all forward-to emails from matching rules (to forward to all at once)
              const allForwardToEmails = new Set<string>();
              let shouldForward = false;
              
              // Check all active rules for this sender
              for (const rule of rules) {
                if (rule.isActive && rule.autoForward && rule.forwardToEmails) {
                  // CRITICAL: Only forward emails received AFTER the rule was created
                  // This prevents forwarding old emails when a new rule is created
                  const ruleCreatedAt = new Date(rule.createdAt);
                  const emailReceivedAt = new Date(email.receivedDateTime);
                  
                  if (emailReceivedAt < ruleCreatedAt) {
                    console.log(`⏭️  [Auto-Forward] Email received before rule was created (${emailReceivedAt.toISOString()} < ${ruleCreatedAt.toISOString()}), skipping`);
                    continue; // Skip this rule, try next one
                  }
                  
                  // Check subject filter if provided (partial match, case-insensitive)
                  let ruleMatches = true;
                  if (rule.subjectFilter && rule.subjectFilter.trim()) {
                    const emailSubject = email.subject || '';
                    const subjectFilter = rule.subjectFilter.trim().toLowerCase();
                    ruleMatches = emailSubject.toLowerCase().includes(subjectFilter);
                    
                    console.log(`🔍 [Auto-Forward] Subject filter check:`, {
                      emailSubject: emailSubject,
                      subjectFilter: rule.subjectFilter,
                      matches: ruleMatches,
                    });
                  }
                  
                  if (ruleMatches) {
                    shouldForward = true;
                    // Add all forward-to emails from this rule
                    const forwardToArray = rule.forwardToEmails.split(',').map(e => e.trim()).filter(e => e);
                    forwardToArray.forEach(email => allForwardToEmails.add(email));
                  }
                }
              }
              
              // Forward to all collected emails at once (prevents duplicate sends)
              if (shouldForward && allForwardToEmails.size > 0) {
                const forwardToArray = Array.from(allForwardToEmails);
                
                // Double-check: Atomically mark as forwarding to prevent concurrent sends
                const updateResult = await prisma.emailTracking.updateMany({
                  where: {
                    id: tracked.id,
                    isForwarded: false, // CRITICAL: Only update if NOT already forwarded
                  },
                  data: {
                    isForwarded: true,
                    forwardedAt: new Date(),
                    autoForwarded: true,
                    status: 'forwarded',
                  } as any,
                });

                // If no rows were updated, another process already forwarded it
                if (updateResult.count === 0) {
                  console.log(`⏭️  [Auto-Forward] Email ${tracked.id} already forwarded by another process, skipping`);
                  // Still check for replies
                  const updatedTracking = await prisma.emailTracking.findUnique({
                    where: { id: tracked.id },
                    select: { forwardMessageId: true },
                  });
                  if (updatedTracking?.forwardMessageId) {
                    await this.checkForReplies(tracked.id, config, updatedTracking.forwardMessageId);
                  }
                  return tracked;
                }

                console.log(`📤 [Auto-Forward] Forwarding email "${email.subject}" to:`, forwardToArray);
                const forwardResult = await EmailForwardService.forwardEmail(config, {
                  originalMessageId: email.id,
                  forwardTo: forwardToArray,
                  includeOriginalBody: true,
                });
                
                console.log(`📝 [Auto-Forward] Forward result messageId:`, forwardResult.messageId);
                
                // Update with forward message ID and forward-to emails
                await this.markAsForwarded(tracked.id, forwardToArray.join(', '), forwardResult.messageId, true);
                console.log(`✅ [Auto-Forward] Email forwarded successfully with messageId: ${forwardResult.messageId}`);
                
                // Check for replies after forwarding (with a delay to allow email to be sent)
                if (forwardResult.messageId && forwardResult.messageId !== 'forwarded') {
                  setTimeout(async () => {
                    await this.checkForReplies(tracked.id, config, forwardResult.messageId);
                  }, 5000); // Wait 5 seconds before checking for replies
                }
              }
            } catch (forwardError) {
              console.error('❌ [Auto-Forward] Error auto-forwarding email:', forwardError);
              // Reset forwarding flag if forwarding failed (so it can be retried)
              try {
                await prisma.emailTracking.updateMany({
                  where: { id: tracked.id },
                  data: {
                    isForwarded: false,
                    forwardedAt: null,
                    autoForwarded: false,
                    status: 'received',
                  } as any,
                });
              } catch (resetError) {
                console.error('❌ [Auto-Forward] Error resetting forwarding flag:', resetError);
              }
              // Don't fail the sync if forwarding fails
            }
          } else if (tracked && tracked.isForwarded) {
            console.log(`⏭️  [Auto-Forward] Email already forwarded, skipping`);
            // Still check for replies if already forwarded
            if (tracked.forwardMessageId) {
              await this.checkForReplies(tracked.id, config, tracked.forwardMessageId);
            }
          }
          
          return tracked;
        })
      );

      return {
        fetched: graphEmails.length,
        tracked: trackedEmails.length,
        emails: trackedEmails,
      };
    } catch (error) {
      console.error('Error syncing emails:', error);
      throw error;
    }
  }

  // Get tracking statistics for a sender
  static async getTrackingStats(senderId: string) {
    const allTrackings = await prisma.emailTracking.findMany({
      where: { senderId },
    });

    return {
      total: allTrackings.length,
      received: allTrackings.filter((e) => e.status === 'received').length,
      forwarded: allTrackings.filter((e) => e.isForwarded).length,
      withReplies: allTrackings.filter((e) => e.hasReplies).length,
      withAttachments: allTrackings.filter((e) => e.hasAttachments).length,
    };
  }
}
