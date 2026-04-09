import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/simple-auth';
import { listConfirmationRecords, sendConfirmation, CONFIRMATION_STATUSES } from '@/lib/confirmation-service';
import { prisma } from '@/lib/prisma';

const DAILY_EMAIL_LIMIT = 100;

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
  const { entityNames, categories, configId, includeNotSentOnly = true, recordEdits, categoryBodies } = body;

  // Check daily limit
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const sentToday = await prisma.confirmationRecord.count({
    where: { sentAt: { gte: todayStart } },
  });

  const statusFilter = includeNotSentOnly
    ? [CONFIRMATION_STATUSES.NOT_SENT]
    : [CONFIRMATION_STATUSES.NOT_SENT, CONFIRMATION_STATUSES.SENT, CONFIRMATION_STATUSES.FOLLOWUP_SENT];

  const records = await listConfirmationRecords({
    entityName: entityNames?.length ? entityNames : undefined,
    category: categories?.length ? categories : undefined,
    status: statusFilter,
  });

  if (records.length === 0) {
    return NextResponse.json({ success: true, sent: 0, failed: 0, results: [] });
  }

  // Apply edit overrides and filter by recordEdits if provided
  const editMap = new Map<string, { emailTo?: string; emailCc?: string; remarks?: string }>();
  if (Array.isArray(recordEdits)) {
    for (const edit of recordEdits) {
      if (edit.id) editMap.set(edit.id, edit);
    }
  }

  // If recordEdits provided, only send those records
  const toSend = editMap.size > 0
    ? records.filter((r) => editMap.has(r.id))
    : records;

  const remaining = DAILY_EMAIL_LIMIT - sentToday;
  if (toSend.length > remaining) {
    return NextResponse.json(
      { error: `Daily email limit reached. ${remaining} emails remaining today (limit: ${DAILY_EMAIL_LIMIT}).` },
      { status: 429 }
    );
  }

  // Apply edits to records before sending
  for (const record of toSend) {
    const edit = editMap.get(record.id);
    if (edit) {
      await prisma.confirmationRecord.update({
        where: { id: record.id },
        data: {
          ...(edit.emailTo && { emailTo: edit.emailTo }),
          ...(edit.emailCc !== undefined && { emailCc: edit.emailCc || null }),
          ...(edit.remarks !== undefined && { remarks: edit.remarks || null }),
        },
      });
    }
  }

  const results: Array<{ id: string; entityName: string; category: string; success: boolean; error?: string }> = [];
  let sent = 0;
  let failed = 0;

  for (const record of toSend) {
    const customBody = categoryBodies?.[record.category] || undefined;
    const result = await sendConfirmation(record.id, user.userId, configId, customBody);
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

  return NextResponse.json({ success: true, sent, failed, total: toSend.length, results });
}
