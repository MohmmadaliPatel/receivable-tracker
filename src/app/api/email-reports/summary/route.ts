import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/simple-auth';
import { prisma } from '@/lib/prisma';
import { buildCustomerEmailLookupIndex, hasResolvableRecipientForAgingLine } from '@/lib/customer-email-directory';

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  const fromD = dateFrom ? new Date(dateFrom) : null;
  const toD = dateTo ? new Date(dateTo) : null;
  const toEnd = toD
    ? new Date(toD.getFullYear(), toD.getMonth(), toD.getDate(), 23, 59, 59, 999)
    : null;

  try {
    const latestImport = await prisma.agingImport.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });

    type ReceivablesSummary = {
      importName: string | null;
      lineCount: number;
      missingRecipient: number;
      withRecipient: number;
      byChaseStatus: Record<string, number>;
    };

    let receivables: ReceivablesSummary = {
      importName: null,
      lineCount: 0,
      missingRecipient: 0,
      withRecipient: 0,
      byChaseStatus: {},
    };

    if (latestImport) {
      receivables.importName = latestImport.fileName;
      const items = await prisma.agingLineItem.findMany({
        where: { userId: user.id, importId: latestImport.id, excluded: false },
        include: { invoiceChase: true },
      });
      receivables.lineCount = items.length;
      const emailIndex = await buildCustomerEmailLookupIndex(user.id);
      const byChaseStatus: Record<string, number> = {};
      let missing = 0;
      for (const it of items) {
        if (!hasResolvableRecipientForAgingLine(emailIndex, it, 'name')) {
          missing++;
        }
        const c = it.invoiceChase;
        const statusKey = c ? c.status : 'no_chase';
        byChaseStatus[statusKey] = (byChaseStatus[statusKey] || 0) + 1;
      }
      receivables.missingRecipient = missing;
      receivables.withRecipient = items.length - missing;
      receivables.byChaseStatus = byChaseStatus;
    }

    const emailWhere: { emailConfig: { userId: string }; sentAt?: { gte?: Date; lte?: Date } } = {
      emailConfig: { userId: user.id },
    };
    if (fromD || toEnd) {
      emailWhere.sentAt = {};
      if (fromD) (emailWhere.sentAt as { gte?: Date }).gte = fromD;
      if (toEnd) (emailWhere.sentAt as { lte?: Date }).lte = toEnd;
    }

    const [graphSent, graphFailed, confAll] = await Promise.all([
      prisma.email.count({ where: { ...emailWhere, status: 'sent' } }),
      prisma.email.count({ where: { ...emailWhere, status: 'failed' } }),
      prisma.confirmationRecord.findMany({
        where: { userId: user.id },
        select: { status: true },
      }),
    ]);

    const confirmationByStatus: Record<string, number> = {};
    for (const r of confAll) {
      confirmationByStatus[r.status] = (confirmationByStatus[r.status] || 0) + 1;
    }

    return NextResponse.json({
      receivables,
      sendLog: { sent: graphSent, failed: graphFailed, total: graphSent + graphFailed },
      confirmations: { total: confAll.length, byStatus: confirmationByStatus },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
