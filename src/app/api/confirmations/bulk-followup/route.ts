import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/simple-auth';
import { listConfirmationRecords, sendFollowup, CONFIRMATION_STATUSES } from '@/lib/confirmation-service';

async function getAuthenticatedUser() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token')?.value;
  if (!sessionToken) return null;
  return await getSession(sessionToken);
}

// POST /api/confirmations/bulk-followup
// Sends follow-up emails in bulk to all records that have been sent but not yet responded
export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { entityNames, categories } = body;

  // Only target records that are "sent" or "followup_sent" (no response yet)
  const records = await listConfirmationRecords({
    entityName: entityNames?.length ? entityNames : undefined,
    category: categories?.length ? categories : undefined,
    status: [CONFIRMATION_STATUSES.SENT, CONFIRMATION_STATUSES.FOLLOWUP_SENT],
  });

  if (records.length === 0) {
    return NextResponse.json({ success: true, sent: 0, failed: 0, results: [] });
  }

  const results: Array<{ id: string; entityName: string; category: string; success: boolean; error?: string }> = [];
  let sent = 0;
  let failed = 0;

  for (const record of records) {
    const result = await sendFollowup(record.id, user.userId);
    results.push({
      id: record.id,
      entityName: record.entityName,
      category: record.category,
      success: result.success,
      error: result.error,
    });
    if (result.success) sent++;
    else failed++;
  }

  return NextResponse.json({ success: true, sent, failed, total: records.length, results });
}
