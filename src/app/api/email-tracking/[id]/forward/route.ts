import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/simple-auth';
import { EmailConfigService } from '@/lib/email-config-service';
import { EmailForwardService } from '@/lib/email-forward-service';
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
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the email tracking record
    const tracking = await prisma.emailTracking.findFirst({
      where: {
        id: params.id,
        userId: user.userId,
      },
    });

    if (!tracking) {
      return NextResponse.json({ error: 'Email tracking not found' }, { status: 404 });
    }

    // Get active email config
    const config = await EmailConfigService.getActiveConfig(user.userId);
    if (!config) {
      return NextResponse.json(
        { error: 'No active email configuration found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { forwardTo, customMessage, includeOriginalBody } = body;

    if (!forwardTo) {
      return NextResponse.json({ error: 'forwardTo is required' }, { status: 400 });
    }

    // Forward the email
    const forwardResult = await EmailForwardService.forwardEmail(config, {
      originalMessageId: tracking.originalMessageId,
      forwardTo,
      customMessage,
      includeOriginalBody,
    });

    console.log('📝 [Manual Forward] Forward result messageId:', forwardResult.messageId);

    // Mark as forwarded
    await EmailTrackingService.markAsForwarded(
      tracking.id,
      forwardTo,
      forwardResult.messageId
    );
    
    console.log('✅ [Manual Forward] Email marked as forwarded with messageId:', forwardResult.messageId);

    return NextResponse.json({
      success: true,
      message: 'Email forwarded successfully',
    });
  } catch (error: any) {
    console.error('Error forwarding email:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
