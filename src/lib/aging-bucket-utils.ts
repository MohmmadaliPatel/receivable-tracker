/** All 10 AR ageing buckets in ascending severity (matches import logic). */
export const AGING_BUCKETS_IN_ORDER: readonly string[] = [
  'Not due',
  '0 - 30 days',
  '31 - 90 days',
  '91 - 180 days',
  '181 - 365 days',
  '366 - 730 days',
  '731 - 1095 days',
  '1096 - 1460 days',
  '1461 - 1845 days',
  'Above 1845 days',
];

/**
 * Get the numeric days from bucket label for sorting.
 */
export function getBucketDays(bucket: string): number {
  const bucketDays: Record<string, number> = {
    'Not due': 0,
    '0 - 30 days': 15,
    '31 - 90 days': 60,
    '91 - 180 days': 135,
    '181 - 365 days': 273,
    '366 - 730 days': 548,
    '731 - 1095 days': 913,
    '1096 - 1460 days': 1278,
    '1461 - 1845 days': 1653,
    'Above 1845 days': 2000,
  };
  return bucketDays[bucket] || 0;
}

/**
 * For Excel cells that store a long label (e.g. "(181 - 365 days: 37,524.00)")
 * or any string containing a known bucket phrase, return a sortable severity score.
 * Falls back to substring match against {@link AGING_BUCKETS_IN_ORDER} (longest first).
 */
export function getBucketSortDaysFromMaxDaysField(s: string | null | undefined): number {
  if (s == null) return 0;
  const t = String(s).trim();
  if (t === '' || t === '—') return 0;
  const exact = getBucketDays(t);
  if (exact > 0) return exact;
  const byLen = [...AGING_BUCKETS_IN_ORDER].sort((a, b) => b.length - a.length);
  for (const b of byLen) {
    if (t.includes(b)) return getBucketDays(b);
  }
  return 0;
}

/**
 * Parse cells like "(181 - 365 days: 37,524.00)" into a display bucket (181 - 365 days)
 * and the amount in that bucket (37524). If there is no "label: amount" form, the whole
 * string is the label and amount is null (caller uses total balance).
 */
export function parseMaxDaysBucketCell(raw: string | null | undefined): {
  displayLabel: string;
  amountInBucket: number | null;
} {
  if (raw == null) {
    return { displayLabel: '—', amountInBucket: null };
  }
  const s = String(raw).trim();
  if (!s) {
    return { displayLabel: '—', amountInBucket: null };
  }
  const idx = s.indexOf(':');
  if (idx === -1) {
    return { displayLabel: s, amountInBucket: null };
  }
  const left = s.slice(0, idx).replace(/^\(/, '').trim();
  const right = s.slice(idx + 1).replace(/\)\s*$/, '').trim();
  const n = parseFloat(String(right).replace(/,/g, ''));
  if (Number.isFinite(n) && left.length > 0) {
    return { displayLabel: left, amountInBucket: n };
  }
  return { displayLabel: s, amountInBucket: null };
}

function parseAmountString(s: string | null | undefined): number {
  if (s == null || s === '') return 0;
  const n = parseFloat(String(s).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** Prefer amount from maxDaysBucket when given as "… : 37,524.00"; else use total balance. */
export function lineAmountForAgingLineItem(
  maxDaysBucket: string | null | undefined,
  totalBalance: string | null | undefined,
): number {
  const { amountInBucket } = parseMaxDaysBucketCell(maxDaysBucket);
  if (amountInBucket != null) return amountInBucket;
  return parseAmountString(totalBalance);
}
