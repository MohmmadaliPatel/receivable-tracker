import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/simple-auth';
import {
  getBucketSortDaysFromMaxDaysField,
  lineAmountForAgingLineItem,
  parseMaxDaysBucketCell,
} from '@/lib/aging-bucket-utils';
import type { InvoiceChase, AgingLineItem } from '@prisma/client';

type LineWithChase = AgingLineItem & { invoiceChase: InvoiceChase | null };

/** Bucket label for display (e.g. "181 - 365 days" from "(181 - 365 days: 37,524.00)"). */
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

export type InvoicesViewRow = {
  invoiceKey: string;
  documentNo: string;
  customerName: string;
  customerCode: string;
  companyCode: string;
  companyName: string;
  bucket: string;
  amount: number;
  emailsSent: number;
  lastSentAt: string | null;
  status: string;
  hasResponse: boolean;
};

const FACET_CAP = 500;

/** Prefer repeated `name=` params (values may contain commas); else single CSV. */
function parseRepeatOrCsv(searchParams: URLSearchParams, name: string): string[] {
  const all = searchParams.getAll(name).map((s) => s.trim()).filter((s) => s.length > 0);
  if (all.length > 0) return all;
  const raw = searchParams.get(name);
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function customerLabel(r: { customerName: string; customerCode: string }): string {
  const n = (r.customerName || '').trim();
  return n ? `${n} (${r.customerCode})` : r.customerCode;
}

function companyLabel(r: { companyName: string; companyCode: string }): string {
  const n = (r.companyName || '').trim();
  return n ? `${n} (${r.companyCode})` : r.companyCode;
}

function amountBandId(amount: number): string {
  if (amount < 100_000) return 'u1';
  if (amount < 500_000) return '1_5';
  if (amount < 1_000_000) return '5_10';
  return '10p';
}

const AMOUNT_FILTER_LABELS: Record<string, string> = {
  u1: 'Under ₹1,00,000',
  '1_5': '₹1,00,000 – ₹4,99,999',
  '5_10': '₹5,00,000 – ₹9,99,999',
  '10p': '₹10,00,000+',
};

function lastSentBand(iso: string | null): string {
  if (!iso) return 'none';
  const days = (Date.now() - new Date(iso).getTime()) / 864e5;
  if (days < 0) return 'd0_7';
  if (days <= 7) return 'd0_7';
  if (days <= 30) return 'd8_30';
  return 'd31p';
}

const LAST_SENT_LABELS: Record<string, string> = {
  none: 'No email sent / no date',
  d0_7: 'Last 7 days',
  d8_30: '8–30 days ago',
  d31p: '31+ days ago',
};

function emailBandString(e: number): string {
  if (e === 0) return '0';
  if (e === 1) return '1';
  if (e === 2) return '2';
  if (e === 3) return '3';
  return '4+';
}

const LEGACY_SORT = ['value_desc', 'bucket_desc', 'emails_desc', 'recent'] as const;
type LegacySortKey = (typeof LEGACY_SORT)[number];

const SORT_FIELDS = [
  'documentNo',
  'customerName',
  'customerCode',
  'companyName',
  'bucket',
  'amount',
  'emailsSent',
  'lastSent',
  'status',
] as const;
type SortField = (typeof SORT_FIELDS)[number];

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const bucketList = parseRepeatOrCsv(searchParams, 'bucket');
    const companyList = parseRepeatOrCsv(searchParams, 'company');
    const documentNoList = parseRepeatOrCsv(searchParams, 'documentNo');
    const customerNameList = parseRepeatOrCsv(searchParams, 'customerName');
    const customerCodeList = [
      ...new Set([
        ...parseRepeatOrCsv(searchParams, 'customerCode'),
        ...parseRepeatOrCsv(searchParams, 'customer'),
      ]),
    ];
    const emailsSentList = parseRepeatOrCsv(searchParams, 'emailsSent');
    const amountList = parseRepeatOrCsv(searchParams, 'amount');
    const lastSentList = parseRepeatOrCsv(searchParams, 'lastSent');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '25', 10) || 25));
    const sortParam = searchParams.get('sort') || 'value_desc';
    const legacySort: LegacySortKey = (LEGACY_SORT as readonly string[]).includes(sortParam)
      ? (sortParam as LegacySortKey)
      : 'value_desc';

    const sortFieldParam = searchParams.get('sortField')?.trim() || null;
    const sortField: SortField | null = (SORT_FIELDS as readonly string[]).includes(sortFieldParam || '')
      ? (sortFieldParam as SortField)
      : null;
    const sortOrder: 'asc' | 'desc' = searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc';

    const statusFilterList = parseRepeatOrCsv(searchParams, 'status');
    const statusSet = statusFilterList.length > 0 ? new Set(statusFilterList) : null;

    const latestImport = await prisma.agingImport.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });

    if (!latestImport) {
      return NextResponse.json({
        rows: [],
        total: 0,
        page: 1,
        pageSize,
        availableBuckets: [] as string[],
        availableCompanies: [] as { companyCode: string; companyName: string }[],
        filterOptions: {
          status: [] as string[],
          bucket: [] as string[],
          documentNo: [] as string[],
          customerName: [] as string[],
          companyName: [] as string[],
          amount: Object.values(AMOUNT_FILTER_LABELS),
          emailsSent: ['0', '1', '2', '3', '4+'],
          lastSent: Object.values(LAST_SENT_LABELS),
        },
        aggregates: {
          byBucket: [] as { bucket: string; count: number; amount: number }[],
          byCustomer: [] as { customerName: string; customerCode: string; count: number; amount: number }[],
          byEmailCount: [] as { emailsSent: string; count: number; amount: number }[],
        },
        top10Spotlight: [] as InvoicesViewRow[],
      });
    }

    const baseWhere = {
      importId: latestImport.id,
      userId: user.id,
      excluded: false as const,
    };

    const lineItemsUnfiltered = await prisma.agingLineItem.findMany({
      where: baseWhere,
      include: { invoiceChase: true },
    });

    const companyByCode = new Map<string, string>();
    for (const it of lineItemsUnfiltered) {
      if (!companyByCode.has(it.companyCode)) {
        companyByCode.set(it.companyCode, it.companyName || '');
      }
    }
    const availableCompanies = Array.from(companyByCode.entries())
      .map(([companyCode, companyName]) => ({ companyCode, companyName }))
      .sort(
        (a, b) => a.companyName.localeCompare(b.companyName) || a.companyCode.localeCompare(b.companyCode),
      );

    const toRow = (item: LineWithChase): InvoicesViewRow => {
      const c = item.invoiceChase;
      const key = `${item.companyCode}-${item.documentNo}`;
      return {
        invoiceKey: key,
        documentNo: item.documentNo,
        customerName: item.customerName,
        customerCode: item.customerCode,
        companyCode: item.companyCode,
        companyName: item.companyName,
        bucket: bucketForItem(item),
        amount: lineAmountForAgingLineItem(item.maxDaysBucket, item.totalBalance),
        emailsSent: emailsForChase(c),
        lastSentAt: lastSentIso(c),
        status: c?.status ?? '—',
        hasResponse: c != null && c.lastResponseAt != null,
      };
    };

    const allRows = lineItemsUnfiltered.map(toRow);

    const availableBuckets = [...new Set(lineItemsUnfiltered.map(bucketForItem))].sort(
      (a, b) => getBucketSortDaysFromMaxDaysField(a) - getBucketSortDaysFromMaxDaysField(b),
    );

    // Spotlight: full latest import (ignores company filter), sort farthest bucket then value
    const allRowsUnfiltered = lineItemsUnfiltered.map(toRow);
    const top10SpotlightRows: InvoicesViewRow[] = [...allRowsUnfiltered]
      .sort((a, b) => {
        const d =
          getBucketSortDaysFromMaxDaysField(b.bucket) - getBucketSortDaysFromMaxDaysField(a.bucket);
        if (d !== 0) return d;
        return b.amount - a.amount;
      })
      .slice(0, 10);

    const selectedBuckets = bucketList.length > 0 ? new Set(bucketList) : null;
    const documentNoSet = documentNoList.length > 0 ? new Set(documentNoList) : null;
    const customerNameSet = customerNameList.length > 0 ? new Set(customerNameList) : null;
    const customerCodeSet = customerCodeList.length > 0 ? new Set(customerCodeList) : null;
    const companyNameSet = companyList.length > 0 ? new Set(companyList) : null;
    const emailsSentSet = emailsSentList.length > 0 ? new Set(emailsSentList) : null;
    const amountSet = amountList.length > 0 ? new Set(amountList) : null;
    const lastSentSet = lastSentList.length > 0 ? new Set(lastSentList) : null;

    const passesFilters = (r: InvoicesViewRow) => {
      if (selectedBuckets && selectedBuckets.size > 0 && !selectedBuckets.has(r.bucket)) {
        return false;
      }
      if (documentNoSet && documentNoSet.size > 0 && !documentNoSet.has(r.documentNo)) {
        return false;
      }
      if (customerNameSet && customerNameSet.size > 0 && !customerNameSet.has(customerLabel(r))) {
        return false;
      }
      if (customerCodeSet && customerCodeSet.size > 0 && !customerCodeSet.has(r.customerCode)) {
        return false;
      }
      if (companyNameSet && companyNameSet.size > 0) {
        // Query may send full label "Name (code)" (from table facets) or just company code (deep links)
        const ok = [...companyNameSet].some(
          (v) => v === companyLabel(r) || v === r.companyCode,
        );
        if (!ok) return false;
      }
      if (statusSet && statusSet.size > 0 && !statusSet.has(r.status)) {
        return false;
      }
      if (emailsSentSet && emailsSentSet.size > 0 && !emailsSentSet.has(emailBandString(r.emailsSent))) {
        return false;
      }
      if (amountSet && amountSet.size > 0) {
        const al = AMOUNT_FILTER_LABELS[amountBandId(r.amount)];
        if (!al || !amountSet.has(al)) return false;
      }
      if (lastSentSet && lastSentSet.size > 0) {
        const ll = LAST_SENT_LABELS[lastSentBand(r.lastSentAt)];
        if (!ll || !lastSentSet.has(ll)) return false;
      }
      return true;
    };

    const filtered = allRows.filter(passesFilters);

    const sortFn = (a: InvoicesViewRow, b: InvoicesViewRow) => {
      if (sortField) {
        const inv = sortOrder === 'asc' ? 1 : -1;
        const cmp = (x: number) => (sortOrder === 'asc' ? x : -x);
        if (sortField === 'documentNo') {
          return cmp(a.documentNo.localeCompare(b.documentNo, undefined, { sensitivity: 'base' }));
        }
        if (sortField === 'customerName') {
          return cmp(a.customerName.localeCompare(b.customerName, undefined, { sensitivity: 'base' }));
        }
        if (sortField === 'customerCode') {
          return cmp(a.customerCode.localeCompare(b.customerCode, undefined, { sensitivity: 'base' }));
        }
        if (sortField === 'companyName') {
          return cmp(a.companyName.localeCompare(b.companyName, undefined, { sensitivity: 'base' }));
        }
        if (sortField === 'bucket') {
          const da = getBucketSortDaysFromMaxDaysField(a.bucket);
          const db = getBucketSortDaysFromMaxDaysField(b.bucket);
          return (da - db) * inv;
        }
        if (sortField === 'amount') {
          return (a.amount - b.amount) * inv;
        }
        if (sortField === 'emailsSent') {
          return (a.emailsSent - b.emailsSent) * inv;
        }
        if (sortField === 'lastSent') {
          const ta = a.lastSentAt ? new Date(a.lastSentAt).getTime() : 0;
          const tb = b.lastSentAt ? new Date(b.lastSentAt).getTime() : 0;
          return (ta - tb) * inv;
        }
        if (sortField === 'status') {
          return cmp(a.status.localeCompare(b.status, undefined, { sensitivity: 'base' }));
        }
        return 0;
      }
      if (legacySort === 'value_desc') return b.amount - a.amount;
      if (legacySort === 'bucket_desc') {
        const d =
          getBucketSortDaysFromMaxDaysField(b.bucket) - getBucketSortDaysFromMaxDaysField(a.bucket);
        if (d !== 0) return d;
        return b.amount - a.amount;
      }
      if (legacySort === 'emails_desc') {
        const d = b.emailsSent - a.emailsSent;
        if (d !== 0) return d;
        return b.amount - a.amount;
      }
      const ta = a.lastSentAt ? new Date(a.lastSentAt).getTime() : 0;
      const tb = b.lastSentAt ? new Date(b.lastSentAt).getTime() : 0;
      if (ta !== tb) return tb - ta;
      return b.amount - a.amount;
    };

    const sorted = [...filtered].sort(sortFn);
    const total = sorted.length;
    const start = (page - 1) * pageSize;
    const rows = sorted.slice(start, start + pageSize);

    // Aggregates on filtered set
    const byBucketMap = new Map<string, { count: number; amount: number }>();
    const customerAgg = new Map<string, { customerName: string; customerCode: string; count: number; amount: number }>();
    const byEmail = new Map<string, { count: number; amount: number }>([
      ['0', { count: 0, amount: 0 }],
      ['1', { count: 0, amount: 0 }],
      ['2', { count: 0, amount: 0 }],
      ['3', { count: 0, amount: 0 }],
      ['4+', { count: 0, amount: 0 }],
    ]);

    for (const r of filtered) {
      const b = r.bucket;
      if (!byBucketMap.has(b)) {
        byBucketMap.set(b, { count: 0, amount: 0 });
      }
      const curB = byBucketMap.get(b)!;
      curB.count += 1;
      curB.amount += r.amount;
      byBucketMap.set(b, curB);

      const ckey = `${r.customerCode}::${r.customerName}`;
      if (!customerAgg.has(ckey)) {
        customerAgg.set(ckey, {
          customerName: r.customerName,
          customerCode: r.customerCode,
          count: 0,
          amount: 0,
        });
      }
      const c = customerAgg.get(ckey)!;
      c.count += 1;
      c.amount += r.amount;

      const e = r.emailsSent;
      const ek = e === 0 ? '0' : e === 1 ? '1' : e === 2 ? '2' : e === 3 ? '3' : '4+';
      const eg = byEmail.get(ek)!;
      eg.count += 1;
      eg.amount += r.amount;
    }

    const byBucket = Array.from(byBucketMap.entries())
      .map(([bucket, v]) => ({ bucket, count: v.count, amount: v.amount }))
      .filter((x) => x.count > 0)
      .sort(
        (a, b) =>
          getBucketSortDaysFromMaxDaysField(a.bucket) - getBucketSortDaysFromMaxDaysField(b.bucket),
      );

    const byCustomer = Array.from(customerAgg.values())
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 20);

    const byEmailCount = (['0', '1', '2', '3', '4+'] as const).map((k) => ({
      emailsSent: k,
      ...byEmail.get(k)!,
    }));

    const docNos = [...new Set(allRowsUnfiltered.map((r) => r.documentNo))].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' }),
    );
    const customers = [
      ...new Set(allRowsUnfiltered.map((r) => customerLabel(r))),
    ].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    const companies = [
      ...new Set(allRowsUnfiltered.map((r) => companyLabel(r))),
    ].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

    const filterOptions = {
      status: [...new Set(allRowsUnfiltered.map((r) => r.status))].filter(Boolean).sort(),
      bucket: availableBuckets,
      documentNo: docNos.slice(0, FACET_CAP),
      customerName: customers.slice(0, FACET_CAP),
      companyName: companies.slice(0, FACET_CAP),
      amount: Object.keys(AMOUNT_FILTER_LABELS).map((k) => AMOUNT_FILTER_LABELS[k]!),
      emailsSent: ['0', '1', '2', '3', '4+'],
      lastSent: Object.keys(LAST_SENT_LABELS).map((k) => LAST_SENT_LABELS[k]!),
    };

    return NextResponse.json({
      importName: latestImport.fileName,
      importAt: latestImport.createdAt,
      availableBuckets,
      availableCompanies,
      filterOptions,
      rows,
      total,
      page,
      pageSize,
      aggregates: { byBucket, byCustomer, byEmailCount },
      top10Spotlight: top10SpotlightRows,
    });
  } catch (error) {
    console.error('[invoices-view]', error);
    const message = error instanceof Error ? error.message : 'Failed to load';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
