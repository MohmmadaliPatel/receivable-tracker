import { prisma } from '@/lib/prisma';
import {
  getBucketSortDaysFromMaxDaysField,
  lineAmountForAgingLineItem,
  parseMaxDaysBucketCell,
} from '@/lib/aging-bucket-utils';
import {
  type CustomerEmailLookupIndex,
  buildCustomerEmailLookupIndex,
  hasResolvableRecipientForAgingLine,
} from '@/lib/customer-email-directory';
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

function displayChaseStatus(c: InvoiceChase | null): string {
  if (!c) return '—';
  if (c.lastResponseAt) return 'responded';
  if (c.lastAgingSendFailedAt) return 'send_failed';
  if (c.bouncedAt) return 'bounced';
  return c.status;
}

export type ReceivablesEmailReportRow = {
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
  /** No recipient after Customer emails directory + sheet fallback (same rules as bulk send). */
  missingEmail: boolean;
  sheetEmailTo: string;
  emailToChase: string | null;
  bouncedAt: string | null;
  bounceDetail: string | null;
};

const FACET_CAP = 500;

export function parseRepeatOrCsv(searchParams: URLSearchParams, name: string): string[] {
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

function toRow(item: LineWithChase, emailIndex: CustomerEmailLookupIndex): ReceivablesEmailReportRow {
  const c = item.invoiceChase;
  const key = `${item.companyCode}-${item.documentNo}`;
  const resolvable = hasResolvableRecipientForAgingLine(emailIndex, item, 'name');
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
    status: displayChaseStatus(c),
    hasResponse: c != null && c.lastResponseAt != null,
    missingEmail: !resolvable,
    sheetEmailTo: item.emailTo || '',
    emailToChase: c?.emailTo ?? null,
    bouncedAt: c?.bouncedAt ? c.bouncedAt.toISOString() : null,
    bounceDetail: c?.bounceDetail ?? null,
  };
}

export type ReceivablesEmailReportResult = {
  importName: string | null;
  importAt: Date | null;
  filterOptions: {
    status: string[];
    bucket: string[];
    documentNo: string[];
    customerName: string[];
    customerCode: string[];
    companyName: string[];
    amount: string[];
    emailsSent: string[];
    lastSent: string[];
  };
  rows: ReceivablesEmailReportRow[];
  total: number;
  page: number;
  pageSize: number;
  availableCompanies: { companyCode: string; companyName: string }[];
  availableBuckets: string[];
};

export async function getReceivablesEmailReport(
  userId: string,
  searchParams: URLSearchParams
): Promise<ReceivablesEmailReportResult> {
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

  const missingEmailParam = searchParams.get('missingEmail');
  const missingEmailFilter: 'any' | 'true' | 'false' | null =
    missingEmailParam === 'true' || missingEmailParam === '1'
      ? 'true'
      : missingEmailParam === 'false' || missingEmailParam === '0'
        ? 'false'
        : null;

  const bouncedParam = searchParams.get('bounced');
  const bouncedFilter: 'any' | 'true' | 'false' | null =
    bouncedParam === 'true' || bouncedParam === '1'
      ? 'true'
      : bouncedParam === 'false' || bouncedParam === '0'
        ? 'false'
        : null;

  const latestImport = await prisma.agingImport.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });

  if (!latestImport) {
    return {
      importName: null,
      importAt: null,
      filterOptions: {
        status: [],
        bucket: [],
        documentNo: [],
        customerName: [],
        customerCode: [],
        companyName: [],
        amount: Object.values(AMOUNT_FILTER_LABELS),
        emailsSent: ['0', '1', '2', '3', '4+'],
        lastSent: Object.values(LAST_SENT_LABELS),
      },
      rows: [],
      total: 0,
      page: 1,
      pageSize,
      availableCompanies: [],
      availableBuckets: [],
    };
  }

  const baseWhere = {
    importId: latestImport.id,
    userId,
    excluded: false as const,
  };

  const lineItemsUnfiltered = await prisma.agingLineItem.findMany({
    where: baseWhere,
    include: { invoiceChase: true },
  });

  const emailIndex = await buildCustomerEmailLookupIndex(userId);

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

  const allRows = lineItemsUnfiltered.map((it) => toRow(it, emailIndex));

  const availableBuckets = [...new Set(lineItemsUnfiltered.map(bucketForItem))].sort(
    (a, b) => getBucketSortDaysFromMaxDaysField(a) - getBucketSortDaysFromMaxDaysField(b),
  );

  const allRowsUnfiltered = allRows;
  const selectedBuckets = bucketList.length > 0 ? new Set(bucketList) : null;
  const documentNoSet = documentNoList.length > 0 ? new Set(documentNoList) : null;
  const customerNameSet = customerNameList.length > 0 ? new Set(customerNameList) : null;
  const customerCodeSet = customerCodeList.length > 0 ? new Set(customerCodeList) : null;
  const companyNameSet = companyList.length > 0 ? new Set(companyList) : null;
  const emailsSentSet = emailsSentList.length > 0 ? new Set(emailsSentList) : null;
  const amountSet = amountList.length > 0 ? new Set(amountList) : null;
  const lastSentSet = lastSentList.length > 0 ? new Set(lastSentList) : null;

  const passesFilters = (r: ReceivablesEmailReportRow) => {
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
    if (missingEmailFilter === 'true' && !r.missingEmail) {
      return false;
    }
    if (missingEmailFilter === 'false' && r.missingEmail) {
      return false;
    }
    if (bouncedFilter === 'true' && !r.bouncedAt) {
      return false;
    }
    if (bouncedFilter === 'false' && r.bouncedAt) {
      return false;
    }
    return true;
  };

  const filtered = allRows.filter(passesFilters);

  const sortFn = (a: ReceivablesEmailReportRow, b: ReceivablesEmailReportRow) => {
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

  const docNos = [...new Set(allRowsUnfiltered.map((r) => r.documentNo))].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' }),
  );
  const customers = [
    ...new Set(allRowsUnfiltered.map((r) => customerLabel(r))),
  ].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  const customerCodes = [...new Set(allRowsUnfiltered.map((r) => r.customerCode))]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  const companies = [
    ...new Set(allRowsUnfiltered.map((r) => companyLabel(r))),
  ].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

  const filterOptions = {
    status: [...new Set(allRowsUnfiltered.map((r) => r.status))].filter(Boolean).sort(),
    bucket: availableBuckets,
    documentNo: docNos.slice(0, FACET_CAP),
    customerName: customers.slice(0, FACET_CAP),
    customerCode: customerCodes.slice(0, FACET_CAP),
    companyName: companies.slice(0, FACET_CAP),
    amount: Object.keys(AMOUNT_FILTER_LABELS).map((k) => AMOUNT_FILTER_LABELS[k]!),
    emailsSent: ['0', '1', '2', '3', '4+'],
    lastSent: Object.keys(LAST_SENT_LABELS).map((k) => LAST_SENT_LABELS[k]!),
  };

  return {
    importName: latestImport.fileName,
    importAt: latestImport.createdAt,
    filterOptions,
    rows,
    total,
    page,
    pageSize,
    availableCompanies,
    availableBuckets,
  };
}

function esc(v: unknown): string {
  if (v === null || v === undefined) return '""';
  const s = String(v).replace(/"/g, '""');
  return `"${s}"`;
}

export function receivablesReportToCsv(
  allFilteredSortedRows: ReceivablesEmailReportRow[],
): string {
  const cols = [
    'Invoice key',
    'Document no.',
    'Customer name',
    'Customer code',
    'Company',
    'Bucket',
    'Amount',
    'Emails sent (total)',
    'Last sent',
    'Chase status',
    'Has response',
    'Missing recipient (no directory or sheet To)',
    'Sheet email (To)',
    'Chase email (To)',
    'Bounced at',
    'Bounce detail',
  ];
  const lines = allFilteredSortedRows.map((r) =>
    [
      r.invoiceKey,
      r.documentNo,
      r.customerName,
      r.customerCode,
      `${r.companyName} (${r.companyCode})`,
      r.bucket,
      r.amount,
      r.emailsSent,
      r.lastSentAt || '',
      r.status,
      r.hasResponse ? 'Yes' : 'No',
      r.missingEmail ? 'Yes' : 'No',
      r.sheetEmailTo,
      r.emailToChase || '',
      r.bouncedAt || '',
      r.bounceDetail || '',
    ]
      .map(esc)
      .join(','),
  );
  return [cols.map(esc).join(','), ...lines].join('\n');
}

/** Full filtered+sorted list for CSV export (no pagination). */
export async function getReceivablesEmailReportAllRows(
  userId: string,
  searchParams: URLSearchParams,
): Promise<ReceivablesEmailReportRow[]> {
  const sp = new URLSearchParams(searchParams);
  sp.set('page', '1');
  sp.set('pageSize', '2000000');
  return (await getReceivablesEmailReport(userId, sp)).rows;
}
