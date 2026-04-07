import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/simple-auth';
import { listConfirmationRecords, sendConfirmation, CONFIRMATION_STATUSES } from '@/lib/confirmation-service';

async function getAuthenticatedUser() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token')?.value;
  if (!sessionToken) return null;
  return await getSession(sessionToken);
}

// POST /api/confirmations/bulk-send
export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { entityNames, categories, configId, includeNotSentOnly = true } = body;

  // Fetch matching records
  const statusFilter = includeNotSentOnly
    ? [CONFIRMATION_STATUSES.NOT_SENT]
    : [CONFIRMATION_STATUSES.NOT_SENT, CONFIRMATION_STATUSES.SENT, CONFIRMATION_STATUSES.FOLLOWUP_SENT];

  const records = await listConfirmationRecords({
    userId: user.userId,
    entityName: entityNames?.length ? entityNames : undefined,
    category: categories?.length ? categories : undefined,
    status: statusFilter,
  });

  if (records.length === 0) {
    return NextResponse.json({ success: true, sent: 0, failed: 0, results: [] });
  }

  const results: Array<{ id: string; entityName: string; category: string; success: boolean; error?: string }> = [];
  let sent = 0;
  let failed = 0;

  for (const record of records) {
    const result = await sendConfirmation(record.id, user.userId, configId);
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
