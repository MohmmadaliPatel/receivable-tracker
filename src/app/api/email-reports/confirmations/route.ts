import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { getCurrentUser } from '@/lib/simple-auth';
import { prisma } from '@/lib/prisma';

function esc(v: unknown): string {
  if (v === null || v === undefined) return '""';
  const s = String(v).replace(/"/g, '""');
  return `"${s}"`;
}

function fmtDt(d: Date | null): string {
  if (!d) return '';
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const format = searchParams.get('format');
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(searchParams.get('pageSize') || '25', 10) || 25));
  const status = (searchParams.get('status') || '').trim() || null;
  const category = (searchParams.get('category') || '').trim() || null;
  const q = (searchParams.get('q') || '').trim();
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  const fromD = dateFrom ? new Date(dateFrom) : null;
  const toD = dateTo ? new Date(dateTo) : null;
  const toEnd = toD
    ? new Date(toD.getFullYear(), toD.getMonth(), toD.getDate(), 23, 59, 59, 999)
    : null;
  const onField = (searchParams.get('dateOn') || 'created').toLowerCase() === 'sent' ? 'sent' : 'created';

  const andClauses: Prisma.ConfirmationRecordWhereInput[] = [{ userId: user.id }];
  if (status) {
    andClauses.push({ status });
  }
  if (category) {
    andClauses.push({ category });
  }
  if (fromD || toEnd) {
    const r: { gte?: Date; lte?: Date } = {};
    if (fromD) r.gte = fromD;
    if (toEnd) r.lte = toEnd;
    andClauses.push(
      onField === 'sent' ? { sentAt: r } : { createdAt: r }
    );
  }
  if (q) {
    andClauses.push({
      OR: [
        { entityName: { contains: q } },
        { category: { contains: q } },
        { emailTo: { contains: q } },
        { bankName: { contains: q } },
        { remarks: { contains: q } },
      ],
    });
  }
  const where: Prisma.ConfirmationRecordWhereInput = { AND: andClauses };

  try {
    if (format === 'csv') {
      const list = await prisma.confirmationRecord.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }],
        take: 100_000,
      });
      const cols = [
        'Entity',
        'Category',
        'Bank/Party',
        'Email To',
        'Email CC',
        'Status',
        'Sent at',
        'Follow-up count',
        'Response at',
        'From (response)',
        'Remarks',
        'Created',
        'Id',
      ];
      const lines = list.map((r) =>
        [
          r.entityName,
          r.category,
          r.bankName || '',
          r.emailTo,
          r.emailCc || '',
          r.status,
          fmtDt(r.sentAt),
          r.followupCount,
          fmtDt(r.responseReceivedAt),
          r.responseFromEmail || '',
          (r.remarks || '').replace(/\r?\n/g, ' ').slice(0, 2000),
          fmtDt(r.createdAt),
          r.id,
        ]
          .map(esc)
          .join(','),
      );
      const csv = [cols.map(esc).join(','), ...lines].join('\n');
      return new NextResponse(`\uFEFF${csv}`, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="confirmations-email-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    const [total, list] = await Promise.all([
      prisma.confirmationRecord.count({ where }),
      prisma.confirmationRecord.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const catGroups = await prisma.confirmationRecord.groupBy({
      by: ['category'],
      where: { userId: user.id },
    });

    return NextResponse.json({
      rows: list,
      total,
      page,
      pageSize,
      filterOptions: {
        categories: catGroups
          .map((c) => c.category)
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b)),
        statuses: ['not_sent', 'sent', 'followup_sent', 'response_received'],
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
