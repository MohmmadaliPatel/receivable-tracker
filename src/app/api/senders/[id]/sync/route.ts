import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/simple-auth';
import { SenderService } from '@/lib/sender-service';
import { EmailConfigService } from '@/lib/email-config-service';
import { EmailTrackingService } from '@/lib/email-tracking-service';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';

async function getAuthenticatedUser() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token')?.value;
  if (!sessionToken) return null;
  return await getSession(sessionToken);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const sender = await SenderService.getSenderById(id, user.userId);
    if (!sender) {
      return NextResponse.json({ error: 'Sender not found' }, { status: 404 });
    }

    // Get active email config
    const config = await EmailConfigService.getActiveConfig();
    if (!config) {
      return NextResponse.json(
        { error: 'No active email configuration found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const limit = body.limit || 50;
    const autoForward = body.autoForward !== false; // Default to true

    // Sync emails for this sender
    const result = await EmailTrackingService.syncEmailsForSender(
      sender.email,
      sender.id,
      config,
      user.userId,
      limit,
      autoForward
    );

    // After syncing, check for replies to all forwarded emails for this user
    try {
      const forwardedEmails = await prisma.emailTracking.findMany({
        where: {
          userId: user.userId,
          emailConfigId: config.id,
          isForwarded: true,
          forwardMessageId: {
            not: null,
          },
        },
      });

      console.log(`💬 [Sync] Checking replies for ${forwardedEmails.length} forwarded emails`);

      for (const emailTracking of forwardedEmails) {
        if (emailTracking.forwardMessageId && emailTracking.forwardMessageId !== 'forwarded') {
          try {
            await EmailTrackingService.checkForReplies(
              emailTracking.id,
              config,
              emailTracking.forwardMessageId
            );
          } catch (error) {
            console.error(`❌ [Sync] Error checking replies for email ${emailTracking.id}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('❌ [Sync] Error checking replies:', error);
      // Don't fail the sync if reply checking fails
    }

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error('Error syncing emails:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}


