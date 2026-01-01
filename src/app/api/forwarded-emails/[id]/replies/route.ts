import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/simple-auth';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';

async function getAuthenticatedUser() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token')?.value;
  if (!sessionToken) return null;
  return await getSession(sessionToken);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Await params before accessing properties
    const { id } = await params;

    // Get the email tracking record with saved replies (only from database)
    const tracking = await prisma.emailTracking.findFirst({
      where: {
        id: id,
        userId: user.userId,
      },
      include: {
        replies: {
          orderBy: {
            receivedAt: 'desc',
          },
        },
      },
    });

    if (!tracking) {
      return NextResponse.json({ error: 'Email tracking not found' }, { status: 404 });
    }

    // Return only saved replies from database
    const savedReplies = tracking.replies.map((reply) => ({
      id: reply.messageId,
      subject: reply.subject,
      body: reply.htmlBody || reply.body,
      bodyPreview: reply.bodyPreview,
      from: {
        emailAddress: {
          address: reply.fromEmail,
          name: reply.fromName,
        },
      },
      receivedDateTime: reply.receivedAt.toISOString(),
      hasAttachments: reply.hasAttachments,
      attachments: reply.attachmentIds ? JSON.parse(reply.attachmentIds) : [],
    }));

    return NextResponse.json({ replies: savedReplies });
  } catch (error) {
    console.error('Error fetching replies:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

