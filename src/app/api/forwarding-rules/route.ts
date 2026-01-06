import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/simple-auth';
import { ForwardingRuleService } from '@/lib/forwarding-rule-service';
import { cookies } from 'next/headers';

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

    const rules = await ForwardingRuleService.getRulesByUserId(user.userId);
    return NextResponse.json({ rules });
  } catch (error) {
    console.error('Error fetching forwarding rules:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { senderId, forwardToEmails, isActive, autoForward, subjectFilter } = body;

    if (!senderId || !forwardToEmails) {
      return NextResponse.json(
        { error: 'senderId and forwardToEmails are required' },
        { status: 400 }
      );
    }

    const rule = await ForwardingRuleService.upsertRule(
      senderId,
      user.userId,
      forwardToEmails,
      { isActive, autoForward, subjectFilter }
    );

    return NextResponse.json({ rule }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating forwarding rule:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
