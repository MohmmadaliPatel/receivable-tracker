import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/simple-auth';
import { prisma } from '@/lib/prisma';
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

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Confirm action from request body
    const body = await request.json();
    if (body.confirm !== 'DELETE_ALL_DATA') {
      return NextResponse.json(
        { error: 'Confirmation required. Send { "confirm": "DELETE_ALL_DATA" }' },
        { status: 400 }
      );
    }

    console.log('🗑️  [Truncate] Starting data truncation...');

    // Delete in order to respect foreign key constraints
    // 1. Delete EmailReply first (depends on EmailTracking)
    const deletedReplies = await prisma.emailReply.deleteMany({});
    console.log(`✅ [Truncate] Deleted ${deletedReplies.count} email replies`);

    // 2. Delete EmailTracking (depends on Sender and EmailConfig)
    const deletedTrackings = await prisma.emailTracking.deleteMany({});
    console.log(`✅ [Truncate] Deleted ${deletedTrackings.count} email trackings`);

    // 3. Delete ForwardingRule (depends on Sender)
    const deletedRules = await prisma.forwardingRule.deleteMany({});
    console.log(`✅ [Truncate] Deleted ${deletedRules.count} forwarding rules`);

    // 4. Delete Sender (depends on User)
    const deletedSenders = await prisma.sender.deleteMany({});
    console.log(`✅ [Truncate] Deleted ${deletedSenders.count} senders`);

    // 5. Delete Forwarder (depends on User)
    const deletedForwarders = await prisma.forwarder.deleteMany({});
    console.log(`✅ [Truncate] Deleted ${deletedForwarders.count} forwarders`);

    // 6. Delete Email (standalone, no dependencies)
    const deletedEmails = await prisma.email.deleteMany({});
    console.log(`✅ [Truncate] Deleted ${deletedEmails.count} emails`);

    const summary = {
      emailReplies: deletedReplies.count,
      emailTrackings: deletedTrackings.count,
      forwardingRules: deletedRules.count,
      senders: deletedSenders.count,
      forwarders: deletedForwarders.count,
      emails: deletedEmails.count,
    };

    console.log('✅ [Truncate] Data truncation completed:', summary);

    return NextResponse.json({
      success: true,
      message: 'Data truncated successfully',
      deleted: summary,
    });
  } catch (error: any) {
    console.error('❌ [Truncate] Error truncating data:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

