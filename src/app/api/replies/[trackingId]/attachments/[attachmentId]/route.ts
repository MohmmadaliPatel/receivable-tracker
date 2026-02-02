import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/simple-auth';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { EmailConfigService } from '@/lib/email-config-service';
import { EmailFetchService } from '@/lib/email-fetch-service';

async function getAuthenticatedUser() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token')?.value;
  if (!sessionToken) return null;
  return await getSession(sessionToken);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ trackingId: string; attachmentId: string }> }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { trackingId, attachmentId } = await params;

    // Get the email tracking record
    const tracking = await prisma.emailTracking.findFirst({
      where: {
        id: trackingId,
        userId: user.userId,
      },
    });

    if (!tracking) {
      return NextResponse.json({ error: 'Email tracking not found' }, { status: 404 });
    }

    // Get the reply that contains this attachment
    const reply = await prisma.emailReply.findFirst({
      where: {
        emailTrackingId: trackingId,
        attachmentIds: {
          contains: attachmentId,
        },
      },
    });

    if (!reply) {
      return NextResponse.json({ error: 'Reply or attachment not found' }, { status: 404 });
    }

    // Get the email config
    const config = await EmailConfigService.getActiveConfig(user.userId);
    if (!config) {
      return NextResponse.json({ error: 'No active email configuration' }, { status: 404 });
    }

    // Download the attachment
    const attachmentBuffer = await EmailFetchService.downloadAttachment(
      config,
      reply.messageId,
      attachmentId
    );

    // Get attachment metadata
    const attachmentInfo = reply.attachmentIds
      ? JSON.parse(reply.attachmentIds).find((att: any) => att.id === attachmentId)
      : null;

    const fileName = attachmentInfo?.name || 'attachment';
    const contentType = attachmentInfo?.contentType || 'application/octet-stream';

    // Return the file - convert Buffer to Uint8Array for NextResponse
    return new NextResponse(new Uint8Array(attachmentBuffer), {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error('Error downloading attachment:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

