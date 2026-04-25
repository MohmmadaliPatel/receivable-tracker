import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { getCurrentUser } from '@/lib/simple-auth';
import { prisma } from '@/lib/prisma';

function esc(v: unknown): string {
  if (v === null || v === undefined) return '""';
  const s = String(v).replace(/"/g, '""');
  return `"${s}"`;
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
  const q = (searchParams.get('q') || '').trim().toLowerCase();
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  const importId = (searchParams.get('importId') || '').trim() || null;
  const fromD = dateFrom ? new Date(dateFrom) : null;
  const toD = dateTo ? new Date(dateTo) : null;
  const toEnd = toD
    ? new Date(toD.getFullYear(), toD.getMonth(), toD.getDate(), 23, 59, 59, 999)
    : null;

  if (importId) {
    const owned = await prisma.agingImport.findFirst({
      where: { id: importId, userId: user.id },
      select: { id: true },
    });
    if (!owned) {
      return NextResponse.json({ error: 'Ageing import not found' }, { status: 404 });
    }
  }

  const andClauses: Prisma.EmailWhereInput[] = [
    {
      OR: [{ emailConfig: { userId: user.id } }, { userId: user.id }],
    },
  ];
  if (importId) {
    andClauses.push({ agingImportId: importId });
  }
  if (status) {
    andClauses.push({ status });
  }
  if (fromD || toEnd) {
    andClauses.push({
      sentAt: {
        ...(fromD ? { gte: fromD } : {}),
        ...(toEnd ? { lte: toEnd } : {}),
      },
    });
  }
  if (q) {
    andClauses.push({
      OR: [
        { to: { contains: q } },
        { subject: { contains: q } },
        { errorMessage: { contains: q } },
      ],
    });
  }
  const where: Prisma.EmailWhereInput = { AND: andClauses };

  try {
    if (format === 'csv') {
      const take = 500_000;
      const list = await prisma.email.findMany({
        where,
        include: { emailConfig: { select: { name: true, fromEmail: true } } },
        orderBy: { sentAt: 'desc' },
        take,
      });
      const cols = [
        'To',
        'Subject',
        'Status',
        'Error',
        'Config',
        'From (mailbox)',
        'Sent at',
        'Record id',
      ];
      const lines = list.map((e) =>
        [
          e.to,
          e.subject || '',
          e.status,
          e.errorMessage || '',
          e.emailConfig?.name || '',
          e.emailConfig?.fromEmail || '',
          e.sentAt.toISOString(),
          e.id,
        ]
          .map(esc)
          .join(','),
      );
      const csv = [cols.map(esc).join(','), ...lines].join('\n');
      return new NextResponse(`\uFEFF${csv}`, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="graph-emails-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    const [total, list] = await Promise.all([
      prisma.email.count({ where }),
      prisma.email.findMany({
        where,
        include: { emailConfig: { select: { name: true, fromEmail: true } } },
        orderBy: { sentAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return NextResponse.json({
      rows: list,
      total,
      page,
      pageSize,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
