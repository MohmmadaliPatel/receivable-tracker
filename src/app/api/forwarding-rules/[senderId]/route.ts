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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ senderId: string }> }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { senderId } = await params;
    const rule = await ForwardingRuleService.getRuleBySenderId(senderId, user.userId);
    return NextResponse.json({ rule });
  } catch (error) {
    console.error('Error fetching forwarding rule:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ senderId: string }> }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { senderId } = await params;
    await ForwardingRuleService.deleteRule(senderId, user.userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting forwarding rule:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

