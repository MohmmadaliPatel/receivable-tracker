import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { EmailFetchService } from '@/lib/email-fetch-service';
import { getCurrentUser } from '@/lib/simple-auth';

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get email config
    const emailConfig = await prisma.emailConfig.findFirst({
      where: { userId: user.id, isActive: true },
    });

    if (!emailConfig) {
      return NextResponse.json(
        { error: 'No active email configuration found.' },
        { status: 400 }
      );
    }

    // Get all outstanding chases with sent messages but no response
    const chases = await prisma.invoiceChase.findMany({
      where: {
        userId: user.id,
        sentMessageId: { not: null },
        lastResponseAt: null,
      },
    });

    if (chases.length === 0) {
      return NextResponse.json({
        checked: 0,
        repliesFound: 0,
        message: 'No outstanding emails to check',
      });
    }

    let repliesFound = 0;

    for (const chase of chases) {
      if (!chase.sentMessageId) continue;

      try {
        // Get replies to the original message
        const replies = await EmailFetchService.getRepliesToMessage(
          emailConfig,
          chase.sentMessageId,
        );

        if (replies && replies.length > 0) {
          // Get the most recent reply
          const latestReply = replies[0];

          // Parse existing responses
          let responses: unknown[] = [];
          if (chase.responsesJson) {
            try {
              responses = JSON.parse(chase.responsesJson);
            } catch {
              responses = [];
            }
          }

          // Check if we already recorded this reply
          const alreadyRecorded = responses.some(
            (r: any) => r.messageId === latestReply.id
          );

          if (!alreadyRecorded) {
            // Add to responses array
            responses.push({
              messageId: latestReply.id,
              receivedAt: latestReply.receivedDateTime || new Date().toISOString(),
              subject: latestReply.subject,
              fromEmail: latestReply.from?.emailAddress?.address,
              fromName: latestReply.from?.emailAddress?.name,
              bodyPreview: latestReply.bodyPreview,
            });

            // Update chase with response
            await prisma.invoiceChase.update({
              where: {
                userId_invoiceKey: {
                  userId: user.id,
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
        console.warn(`[Check Replies] Error checking chase ${chase.invoiceKey}:`, error);
        // Continue with other chases
      }
    }

    return NextResponse.json({
      checked: chases.length,
      repliesFound,
    });
  } catch (error) {
    console.error('[Check Replies] Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to check replies';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
