import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { EmailService } from '@/lib/email-service';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const syncStatus = await EmailService.getEmailSyncStatus(session.user.id);

    return NextResponse.json({
      success: true,
      data: syncStatus,
    });
  } catch (error) {
    console.error('Error getting sync status:', error);
    return NextResponse.json(
      { error: 'Failed to get sync status' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    await EmailService.resetEmailSync(session.user.id);

    return NextResponse.json({
      success: true,
      message: 'Email sync reset successfully',
    });
  } catch (error) {
    console.error('Error resetting sync:', error);
    return NextResponse.json(
      { error: 'Failed to reset sync' },
      { status: 500 }
    );
  }
}
