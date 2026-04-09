import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/simple-auth';
import { checkRepliesForConfirmations, debugInboxScan } from '@/lib/confirmation-service';

async function getAuthenticatedUser() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token')?.value;
  if (!sessionToken) return null;
  return await getSession(sessionToken);
}

// POST /api/confirmations/check-replies — manual or cron-triggered reply check
export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const repliesFound = await checkRepliesForConfirmations();

  return NextResponse.json({ success: true, repliesFound });
}

// GET /api/confirmations/check-replies?since=ISO — diagnostic: show raw inbox messages
export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const since = request.nextUrl.searchParams.get('since');
  const result = await debugInboxScan(since || undefined);
  return NextResponse.json(result);
}
