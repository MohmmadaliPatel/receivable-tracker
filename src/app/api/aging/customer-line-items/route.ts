import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/simple-auth';
import { lineAmountForAgingLineItem, parseMaxDaysBucketCell } from '@/lib/aging-bucket-utils';
import type { InvoiceChase, AgingLineItem } from '@prisma/client';

type LineWithChase = AgingLineItem & { invoiceChase: InvoiceChase | null };

function bucketForItem(item: AgingLineItem): string {
  const { displayLabel } = parseMaxDaysBucketCell(item.maxDaysBucket);
  return displayLabel;
}

function emailsForChase(c: InvoiceChase | null): number {
  if (!c) return 0;
  return (c.emailCount || 0) + (c.followupCount || 0);
}

function lastSentIso(c: InvoiceChase | null): string | null {
  if (!c) return null;
  const t = [c.sentAt, c.lastFollowupAt].filter(Boolean) as Date[];
  if (t.length === 0) return null;
  const d = new Date(Math.max(...t.map((dt) => dt.getTime())));
  return d.toISOString();
}

export type CustomerLineItemRow = {
  invoiceKey: string;
  documentNo: string;
  customerName: string;
  customerCode: string;
  bucket: string;
  amount: number;
  emailsSent: number;
  lastSentAt: string | null;
  status: string;
  hasResponse: boolean;
};

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const customerCode = (request.nextUrl.searchParams.get('customerCode') || '').trim();
    if (!customerCode) {
      return NextResponse.json({ error: 'customerCode is required' }, { status: 400 });
    }

    const latestImport = await prisma.agingImport.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });

    if (!latestImport) {
      return NextResponse.json({
        importName: null,
        importAt: null,
        rows: [] as CustomerLineItemRow[],
      });
    }

    const lineItems: LineWithChase[] = await prisma.agingLineItem.findMany({
      where: {
        importId: latestImport.id,
        userId: user.id,
        excluded: false,
        customerCode,
      },
      include: { invoiceChase: true },
      orderBy: [{ documentNo: 'asc' }],
    });

    const rows: CustomerLineItemRow[] = lineItems.map((item) => {
      const c = item.invoiceChase;
      return {
        invoiceKey: `${item.companyCode}-${item.documentNo}`,
        documentNo: item.documentNo,
        customerName: item.customerName,
        customerCode: item.customerCode,
        bucket: bucketForItem(item),
        amount: lineAmountForAgingLineItem(item.maxDaysBucket, item.totalBalance),
        emailsSent: emailsForChase(c),
        lastSentAt: lastSentIso(c),
        status: c?.status ?? '—',
        hasResponse: c != null && c.lastResponseAt != null,
      };
    });

    return NextResponse.json({
      importName: latestImport.fileName,
      importAt: latestImport.createdAt,
      rows,
    });
  } catch (error) {
    console.error('[customer-line-items]', error);
    const message = error instanceof Error ? error.message : 'Failed to load';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
