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

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all forwarded emails for this user
    const forwardedEmails = await prisma.emailTracking.findMany({
      where: {
        userId: user.userId,
        isForwarded: true,
      },
      include: {
        recipient: {
          select: {
            email: true,
            name: true,
          },
        },
        emailConfig: {
          select: {
            fromEmail: true,
          },
        },
      },
      orderBy: {
        forwardedAt: 'desc',
      },
    });

    return NextResponse.json({ emails: forwardedEmails });
  } catch (error) {
    console.error('Error fetching forwarded emails:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

