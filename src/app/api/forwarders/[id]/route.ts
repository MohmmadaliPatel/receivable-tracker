import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/simple-auth';
import { ForwarderService } from '@/lib/forwarder-service';
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
    const forwarder = await ForwarderService.getForwarderById(id, user.userId);

    if (!forwarder) {
      return NextResponse.json({ error: 'Forwarder not found' }, { status: 404 });
    }

    return NextResponse.json({ forwarder });
  } catch (error) {
    console.error('Error fetching forwarder:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
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
    const { email, name, subject, isActive } = body;

    const forwarder = await ForwarderService.updateForwarder(id, user.userId, {
      ...(email && { email }),
      ...(name !== undefined && { name }),
      ...(subject !== undefined && { subject }),
      ...(isActive !== undefined && { isActive }),
    });

    return NextResponse.json({ forwarder });
  } catch (error: any) {
    console.error('Error updating forwarder:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
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
    await ForwarderService.deleteForwarder(id, user.userId);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting forwarder:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}



