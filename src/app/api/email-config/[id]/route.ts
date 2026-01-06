import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/simple-auth';
import { EmailConfigService } from '@/lib/email-config-service';
import { GraphMailService } from '@/lib/graph-mail-service';
import { cronService } from '@/lib/cron-service';
import { cookies } from 'next/headers';

// Helper to get authenticated user
async function getAuthenticatedUser() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token')?.value;

  if (!sessionToken) {
    return null;
  }

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
    const config = await EmailConfigService.getConfigById(id, user.userId);

    if (!config) {
      return NextResponse.json({ error: 'Configuration not found' }, { status: 404 });
    }

    return NextResponse.json({ config });
  } catch (error) {
    console.error('Error fetching email config:', error);
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
    const { name, type, msTenantId, msClientId, msClientSecret, fromEmail, isActive, cronEnabled, cronIntervalMinutes, reminderEnabled, reminderDurationHours, reminderDurationUnit } = body;

    const config = await EmailConfigService.updateConfig(id, user.userId, {
      ...(name && { name }),
      ...(type && { type }),
      ...(msTenantId && { msTenantId }),
      ...(msClientId && { msClientId }),
      ...(msClientSecret && { msClientSecret }),
      ...(fromEmail && { fromEmail }),
      ...(isActive !== undefined && { isActive }),
      ...(cronEnabled !== undefined && { cronEnabled }),
      ...(cronIntervalMinutes !== undefined && { cronIntervalMinutes }),
      ...(reminderEnabled !== undefined && { reminderEnabled }),
      ...(reminderDurationHours !== undefined && { reminderDurationHours }),
      ...(reminderDurationUnit !== undefined && { reminderDurationUnit }),
    });

    // Reload cron jobs after config update
    try {
      if (config.isActive && config.cronEnabled) {
        await cronService.startJobForConfig(config.id);
      } else {
        cronService.stopJobForConfig(config.id);
      }
    } catch (error) {
      console.error('Error reloading cron job:', error);
    }

    return NextResponse.json({ config });
  } catch (error) {
    console.error('Error updating email config:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
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
    await EmailConfigService.deleteConfig(id, user.userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting email config:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
