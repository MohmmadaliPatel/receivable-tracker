import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/simple-auth';
import { getOrCreateSettings, updateSettings } from '@/lib/confirmation-service';

async function getAuthenticatedUser() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token')?.value;
  if (!sessionToken) return null;
  return await getSession(sessionToken);
}

// GET /api/settings
export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const settings = await getOrCreateSettings(user.userId);
  return NextResponse.json({ settings });
}

// PUT /api/settings
export async function PUT(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { autoReplyCheck, replyCheckIntervalMinutes, emailSaveBasePath } = body;

  const settings = await updateSettings(user.userId, {
    ...(autoReplyCheck !== undefined && { autoReplyCheck }),
    ...(replyCheckIntervalMinutes !== undefined && { replyCheckIntervalMinutes }),
    ...(emailSaveBasePath !== undefined && { emailSaveBasePath }),
  });

  return NextResponse.json({ settings });
}
