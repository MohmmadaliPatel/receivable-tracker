import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/simple-auth';
import { prisma } from '@/lib/prisma';

async function getAuthenticatedUser() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token')?.value;
  if (!sessionToken) return null;
  return await getSession(sessionToken);
}

const DAILY_EMAIL_LIMIT = 100;

// GET /api/confirmations/email-limit — how many emails sent today
export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const sentToday = await prisma.confirmationRecord.count({
    where: { sentAt: { gte: todayStart } },
  });

  return NextResponse.json({
    used: sentToday,
    remaining: Math.max(0, DAILY_EMAIL_LIMIT - sentToday),
    limit: DAILY_EMAIL_LIMIT,
  });
}
