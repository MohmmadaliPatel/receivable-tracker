import { prisma } from './prisma';
import { EmailFetchService } from './email-fetch-service';
import type { EmailConfig } from '@prisma/client';

/**
 * Scans Graph for replies to ageing invoice chase threads. Used by API and cron.
 */
export async function runAgingCheckRepliesForUser(
  userId: string
): Promise<{ checked: number; repliesFound: number }> {
  const emailConfig = await prisma.emailConfig.findFirst({
    where: { userId, isActive: true },
  });

  if (!emailConfig) {
    return { checked: 0, repliesFound: 0 };
  }

  return runAgingCheckRepliesWithConfig(userId, emailConfig);
}

export async function runAgingCheckRepliesWithConfig(
  userId: string,
  emailConfig: EmailConfig
): Promise<{ checked: number; repliesFound: number }> {
  const chases = await prisma.invoiceChase.findMany({
    where: {
      userId,
      sentMessageId: { not: null },
      lastResponseAt: null,
    },
  });

  if (chases.length === 0) {
    return { checked: 0, repliesFound: 0 };
  }

  let repliesFound = 0;

  for (const chase of chases) {
    if (!chase.sentMessageId) continue;

    try {
      const replies = await EmailFetchService.getRepliesToMessage(
        emailConfig,
        chase.sentMessageId
      );

      if (replies && replies.length > 0) {
        const latestReply = replies[0]!;

        let responses: unknown[] = [];
        if (chase.responsesJson) {
          try {
            responses = JSON.parse(chase.responsesJson);
          } catch {
            responses = [];
          }
        }

        const alreadyRecorded = (responses as { messageId?: string }[]).some(
          (r) => r.messageId === latestReply.id
        );

        if (!alreadyRecorded) {
          responses.push({
            messageId: latestReply.id,
            receivedAt: latestReply.receivedDateTime || new Date().toISOString(),
            subject: latestReply.subject,
            fromEmail: latestReply.from?.emailAddress?.address,
            fromName: latestReply.from?.emailAddress?.name,
            bodyPreview: latestReply.bodyPreview,
          });

          await prisma.invoiceChase.update({
            where: {
              userId_invoiceKey: {
                userId,
                invoiceKey: chase.invoiceKey,
              },
            },
            data: {
              lastResponseAt: new Date(latestReply.receivedDateTime || Date.now()),
              responseMessageId: latestReply.id,
              responseSubject: latestReply.subject,
              responsePreview: latestReply.bodyPreview,
              responsesJson: JSON.stringify(responses),
              status: 'responded',
            },
          });

          repliesFound++;
        }
      }
    } catch (error) {
      console.warn(`[Aging check replies] Error checking chase ${chase.invoiceKey}:`, error);
    }
  }

  return { checked: chases.length, repliesFound };
}
