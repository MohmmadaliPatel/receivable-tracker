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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const rule = await ForwardingRuleService.getRuleById(id, user.userId);
    if (!rule) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }
    return NextResponse.json({ rule });
  } catch (error) {
    console.error('Error fetching forwarding rule:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { forwardToEmails, subjectFilter, isActive, autoForward } = body;

    const rule = await ForwardingRuleService.updateRule(id, user.userId, {
      forwardToEmails,
      subjectFilter,
      isActive,
      autoForward,
    });

    return NextResponse.json({ rule });
  } catch (error: any) {
    console.error('Error updating forwarding rule:', error);
    if (error.code === 'P2025') {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    await ForwardingRuleService.deleteRule(id, user.userId);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting forwarding rule:', error);
    if (error.code === 'P2025') {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}


