import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/simple-auth';
import { EmailConfigService } from '@/lib/email-config-service';
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

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const configs = await EmailConfigService.getConfigsByUserId(user.userId);

    return NextResponse.json({ configs });
  } catch (error) {
    console.error('Error fetching email configs:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, type, msTenantId, msClientId, msClientSecret, fromEmail, isActive, cronEnabled, cronIntervalMinutes } = body;

    // Validate required fields
    if (!name || !msTenantId || !msClientId || !msClientSecret || !fromEmail) {
      return NextResponse.json(
        { error: 'Missing required fields: name, msTenantId, msClientId, msClientSecret, fromEmail' },
        { status: 400 }
      );
    }

    const config = await EmailConfigService.createConfig(user.userId, {
      name,
      type: type || 'graph',
      msTenantId,
      msClientId,
      msClientSecret,
      fromEmail,
      isActive,
      cronEnabled: cronEnabled || false,
      cronIntervalMinutes: cronIntervalMinutes || 10,
    });

    return NextResponse.json({ config }, { status: 201 });
  } catch (error) {
    console.error('Error creating email config:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
