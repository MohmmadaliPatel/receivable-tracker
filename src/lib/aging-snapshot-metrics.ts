import { prisma } from './prisma';
import {
  getBucketSortDaysFromMaxDaysField,
  lineAmountForAgingLineItem,
} from './aging-bucket-utils';

function invoiceKey(companyCode: string, documentNo: string | null | undefined): string | null {
  const doc = String(documentNo ?? '').trim();
  if (!doc) return null;
  return `${String(companyCode).trim()}-${doc}`;
}

type KeyAgg = { amount: number; maxDaysBucket: string; customerCode: string };

type LineForAgg = {
  companyCode: string;
  documentNo: string;
  customerCode: string;
  maxDaysBucket: string | null;
  totalBalance: string | null;
};

/**
 * Build per-invoice key map (one row = one key; if duplicate key, sum amounts).
 * Customer concentration uses `customerCode` (sold-to / AR customer), not company code.
 */
function aggregateByInvoiceKey(
  items: LineForAgg[]
): { byKey: Map<string, KeyAgg>; total: number; customerSums: Map<string, number> } {
  const byKey = new Map<string, KeyAgg>();
  const customerSums = new Map<string, number>();
  let total = 0;

  for (const it of items) {
    const k = invoiceKey(it.companyCode, it.documentNo);
    const amount = lineAmountForAgingLineItem(it.maxDaysBucket, it.totalBalance);
    if (amount <= 0) continue;
    total += amount;
    const cust = String(it.customerCode || '').trim();
    customerSums.set(cust || '_unknown', (customerSums.get(cust || '_unknown') ?? 0) + amount);

    if (k) {
      const existing = byKey.get(k);
      if (existing) {
        existing.amount += amount;
      } else {
        byKey.set(k, {
          amount,
          maxDaysBucket: it.maxDaysBucket || '',
          customerCode: it.customerCode,
        });
      }
    }
  }

  return { byKey, total, customerSums };
}

const OVER_90_CUTOFF = 90;

export type SnapshotMetricsJson = {
  newInvoiceCount: number;
  clearedInvoiceCount: number;
  newOpenAmount: number;
  clearedFromPriorAmount: number;
  deltaOutstandingVsPrior: number;
  previousTotalOutstanding: number;
  comparedToImportId: string | null;
  newCustomerCount: number;
  customersDroppedCount: number;
  agingRisk: {
    amountOver90Days: number;
    pctOutstandingOver90: number;
    top5CustomerConcentrationPct: number;
  };
  /** Non-excluded file rows (same as open + zero-balance lines). */
  totalLineCount: number;
  /** Distinct customer code values (AR sold-to) among non-excluded lines. */
  customerDistinctByCode: number;
  /** Distinct (customerCode + customerName) pairs (name variants count separately). */
  customerDistinctByCodeAndName: number;
};

/**
 * Count distinct customers in current map not in previous set, and customers only in previous.
 * Uses customerCode (companyCode in AR export is often company).
 */
function customerMovement(
  currentCustomerSums: Map<string, number>,
  previousCustomerSums: Map<string, number>
) {
  const currentKeys = new Set(currentCustomerSums.keys());
  const prevKeys = new Set(previousCustomerSums.keys());
  let newCustomerCount = 0;
  for (const c of currentKeys) {
    if (!prevKeys.has(c)) newCustomerCount++;
  }
  let customersDropped = 0;
  for (const c of prevKeys) {
    if (!currentKeys.has(c)) customersDropped++;
  }
  return { newCustomerCount, customersDroppedCount: customersDropped };
}

/**
 * After a new import is saved, diff vs the immediately previous snapshot and persist KPIs.
 * Run before retention deletes older imports.
 */
export async function computeAndPersistSnapshotMetrics(
  userId: string,
  newImportId: string
): Promise<void> {
  const recent = await prisma.agingImport.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 2,
    select: { id: true },
  });
  const previousImportId = recent.length > 1 ? recent[1]!.id : null;

  const [currentLines, previousLines] = await Promise.all([
    prisma.agingLineItem.findMany({
      where: { importId: newImportId, userId, excluded: false },
      select: {
        companyCode: true,
        documentNo: true,
        customerCode: true,
        customerName: true,
        maxDaysBucket: true,
        totalBalance: true,
      },
    }),
    previousImportId
      ? prisma.agingLineItem.findMany({
          where: { importId: previousImportId, userId, excluded: false },
          select: {
            companyCode: true,
            documentNo: true,
            customerCode: true,
            maxDaysBucket: true,
            totalBalance: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const currentAgg = aggregateByInvoiceKey(currentLines);
  const previousAgg = aggregateByInvoiceKey(previousLines);

  const openInvoiceCount = currentLines.filter(
    (l) => lineAmountForAgingLineItem(l.maxDaysBucket, l.totalBalance) > 0
  ).length;
  const totalOutstandingAtImport = currentAgg.total;

  const keysCur = new Set(currentAgg.byKey.keys());
  const keysPrev = new Set(previousAgg.byKey.keys());
  const onlyInCurrent = new Set([...keysCur].filter((k) => !keysPrev.has(k)));
  const onlyInPrevious = new Set([...keysPrev].filter((k) => !keysCur.has(k)));

  let newOpenAmount = 0;
  for (const k of onlyInCurrent) {
    newOpenAmount += currentAgg.byKey.get(k)!.amount;
  }
  let clearedFromPriorAmount = 0;
  for (const k of onlyInPrevious) {
    clearedFromPriorAmount += previousAgg.byKey.get(k)!.amount;
  }

  const deltaOutstandingVsPrior = previousImportId
    ? totalOutstandingAtImport - previousAgg.total
    : 0;
  const { newCustomerCount, customersDroppedCount } = customerMovement(
    currentAgg.customerSums,
    previousAgg.customerSums
  );

  let amountOver90 = 0;
  for (const it of currentLines) {
    const a = lineAmountForAgingLineItem(it.maxDaysBucket, it.totalBalance);
    if (a <= 0) continue;
    const d = getBucketSortDaysFromMaxDaysField(it.maxDaysBucket);
    if (d > OVER_90_CUTOFF) amountOver90 += a;
  }
  const pctOver90 =
    totalOutstandingAtImport > 0
      ? (100 * amountOver90) / totalOutstandingAtImport
      : 0;

  const customerTotals = [...currentAgg.customerSums.entries()]
    .map(([code, amt]) => ({ code, amt }))
    .sort((a, b) => b.amt - a.amt);
  const top5 = customerTotals.slice(0, 5);
  const top5Sum = top5.reduce((s, x) => s + x.amt, 0);
  const top5Pct =
    totalOutstandingAtImport > 0 ? (100 * top5Sum) / totalOutstandingAtImport : 0;

  const byCode = new Set(
    currentLines
      .map((l) => String(l.customerCode ?? '').trim())
      .filter((c) => c.length > 0),
  );
  const pairSet = new Set(
    currentLines.map(
      (l) =>
        `${String(l.customerCode ?? '').trim()}\t${String(l.customerName ?? '').trim()}`,
    ),
  );
  const totalLineCount = currentLines.length;
  const customerDistinctByCode = byCode.size;
  const customerDistinctByCodeAndName = pairSet.size;

  const metricsJson: SnapshotMetricsJson = {
    newInvoiceCount: onlyInCurrent.size,
    clearedInvoiceCount: onlyInPrevious.size,
    newOpenAmount,
    clearedFromPriorAmount,
    deltaOutstandingVsPrior,
    previousTotalOutstanding: previousImportId ? previousAgg.total : 0,
    comparedToImportId: previousImportId,
    newCustomerCount,
    customersDroppedCount,
    agingRisk: {
      amountOver90Days: amountOver90,
      pctOutstandingOver90: Math.round(pctOver90 * 10) / 10,
      top5CustomerConcentrationPct: Math.round(top5Pct * 10) / 10,
    },
    totalLineCount,
    customerDistinctByCode,
    customerDistinctByCodeAndName,
  };

  await prisma.agingImport.update({
    where: { id: newImportId },
    data: {
      openInvoiceCount,
      totalOutstandingAtImport,
      comparedToImportId: previousImportId,
      kpiGeneratedAt: new Date(),
      metricsJson: JSON.stringify(metricsJson),
    },
  });
}
