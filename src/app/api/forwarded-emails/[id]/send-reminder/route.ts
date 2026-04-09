import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/simple-auth';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { EmailConfigService } from '@/lib/email-config-service';
import { GraphMailService } from '@/lib/graph-mail-service';

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

    // Get the email tracking record
    const tracking = await prisma.emailTracking.findFirst({
      where: {
        id: id,
        userId: user.userId,
        isForwarded: true,
      },
      include: {
        sender: true,
        emailConfig: true,
      },
    });

    if (!tracking) {
      return NextResponse.json({ error: 'Email tracking not found' }, { status: 404 });
    }

    // Check if reminder has already been sent
    if (tracking.reminderSent) {
      return NextResponse.json(
        { error: 'Reminder has already been sent for this email' },
        { status: 400 }
      );
    }

    if (!tracking.forwardedTo) {
      return NextResponse.json({ error: 'No forward-to email found' }, { status: 400 });
    }

    // Get active email config
    const config = tracking.emailConfig || await EmailConfigService.getActiveConfig();
    if (!config) {
      return NextResponse.json(
        { error: 'No active email configuration found' },
        { status: 404 }
      );
    }

    // Check if reminder is enabled
    if (!config.reminderEnabled) {
      return NextResponse.json(
        { error: 'Reminder emails are not enabled for this configuration' },
        { status: 400 }
      );
    }

    // Atomically update the record to mark reminder as being sent
    // This prevents duplicate sends if the endpoint is called multiple times
    const updateResult = await prisma.emailTracking.updateMany({
      where: { 
        id: tracking.id,
        reminderSent: false, // CRITICAL: Only update if NOT already sent
      },
      data: {
        status: 'reminder_sent',
        reminderSent: true,
        reminderSentAt: new Date(),
      } as any,
    });

    // If no rows were updated, it means reminder was already sent (race condition)
    if (updateResult.count === 0) {
      return NextResponse.json(
        { error: 'Reminder has already been sent for this email (concurrent request)' },
        { status: 400 }
      );
    }

    // Verify the update was successful
    const updatedTracking = await prisma.emailTracking.findUnique({
      where: { id: tracking.id },
      select: { reminderSent: true },
    });

    if (!updatedTracking || !updatedTracking.reminderSent) {
      return NextResponse.json(
        { error: 'Failed to mark reminder as sent' },
        { status: 500 }
      );
    }

    // Send reminder email to all forwarded-to addresses
    const forwardToEmails = tracking.forwardedTo.split(',').map(e => e.trim()).filter(e => e);
    const reminderSubject = 'Reminder';
    const reminderBody = `This is a reminder regarding the forwarded email:\n\nSubject: ${tracking.originalSubject || '(No Subject)'}\nFrom: ${tracking.originalFromName || tracking.originalFromEmail}\nOriginal Date: ${new Date(tracking.originalReceivedAt).toLocaleString()}\n\nPlease respond if you have any questions or concerns.`;

    try {
      for (const email of forwardToEmails) {
        await GraphMailService.sendMail(config, {
          to: email,
          subject: reminderSubject,
          body: reminderBody,
        });
      }

      return NextResponse.json({
        success: true,
        message: `Reminder email sent to ${forwardToEmails.length} recipient(s)`,
      });
    } catch (error: any) {
      console.error('Error sending reminder email:', error);
      return NextResponse.json(
        { error: error.message || 'Failed to send reminder email' },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Error sending reminder:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

