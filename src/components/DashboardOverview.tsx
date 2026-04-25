'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Info } from 'lucide-react';
import Link from 'next/link';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { getBucketSortDaysFromMaxDaysField } from '@/lib/aging-bucket-utils';
import CustomerLineItemsModal from '@/components/CustomerLineItemsModal';
import { MultiSelect } from '@/components/ui/MultiSelect';

interface CustomerRow {
  key: string;
  customerName: string;
  customerCode: string;
  invoiceCount: number;
  outstandingAmount: number;
  withResponse: number;
}

interface CompanyRow {
  companyCode: string;
  companyName: string;
  invoiceCount: number;
  outstandingAmount: number;
  emailsSent: number;
  responses: number;
}

type BucketRow = { bucket: string; invoiceCount: number; outstandingAmount: number };
type ChasedByEmail = { emailsSent: string; invoiceCount: number; outstandingAmount: number };
type ChasedByBucket = {
  bucket: string;
  invoiceCount: number;
  outstandingAmount: number;
  topCustomers: { customerName: string; invoiceCount: number }[];
};

type SnapshotMetricsShape = {
  newInvoiceCount?: number;
  clearedInvoiceCount?: number;
  newOpenAmount?: number;
  clearedFromPriorAmount?: number;
  deltaOutstandingVsPrior?: number;
  previousTotalOutstanding?: number;
  newCustomerCount?: number;
  customersDroppedCount?: number;
  totalLineCount?: number;
  customerDistinctByCode?: number;
  customerDistinctByName?: number;
  /** @deprecated old snapshots only; not shown in UI */
  customerDistinctByCodeAndName?: number;
  agingRisk?: {
    amountOver90Days?: number;
    pctOutstandingOver90?: number;
    top5CustomerConcentrationPct?: number;
  };
};

type SnapshotKpiApi = {
  latest: {
    importId: string;
    fileName: string;
    createdAt: string;
    snapshotDate: string | null;
    openInvoiceCount: number | null;
    customerCount: number | null;
    storedRowCount: number | null;
    totalOutstandingAtImport: number | null;
    comparedToImportId: string | null;
    kpiGeneratedAt: string | null;
    metrics: Record<string, unknown> | null;
  };
  history: Array<{
    importId: string;
    fileName: string;
    createdAt: string;
    totalOutstandingAtImport: number | null;
    openInvoiceCount: number | null;
    customerCount: number | null;
    deltaVsPrior: number | null;
  }>;
} | null;

interface AgingStats {
  hasImport: boolean;
  importName?: string;
  importAt?: string;
  companyCodeFilter?: string | null;
  customerSummary?: CustomerRow[];
  companyBreakdown?: CompanyRow[];
  bucketBreakdown?: BucketRow[];
  chasedBreakdown?: { byEmails: ChasedByEmail[]; byBucket: ChasedByBucket[] };
  snapshotKpi?: SnapshotKpiApi;
  latestImportReceivablesStats?: {
    lineCountNonExcluded: number;
    lineCountExcluded: number;
    customerDistinctByCode: number;
    customerDistinctByName: number;
    storedRowCount: number | null;
  } | null;
}

function formatInr(n: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n);
}

/** Compact rupee labels for the X axis (very large receivable amounts). */
function formatAxisInr(n: number): string {
  if (n == null || !Number.isFinite(n)) return '';
  const abs = Math.abs(n);
  if (abs >= 1e7) return `₹${(n / 1e7).toFixed(1)} Cr`;
  if (abs >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`;
  if (abs >= 1e3) return `₹${(n / 1e3).toFixed(0)} k`;
  return `₹${n.toFixed(0)}`;
}

const BUCKET_BAR_FILLS = [
  '#0f172a',
  '#1e293b',
  '#334155',
  '#475569',
  '#64748b',
  '#94a3b8',
];

function UnclearedByBucketChart({ rows }: { rows: BucketRow[] }) {
  const data = useMemo(
    () =>
      [...rows]
        .filter((r) => r.outstandingAmount > 0)
        .sort(
          (a, b) =>
            getBucketSortDaysFromMaxDaysField(b.bucket) - getBucketSortDaysFromMaxDaysField(a.bucket),
        ),
    [rows],
  );

  if (data.length === 0) return null;

  const chartHeight = Math.min(Math.max(240, 32 * data.length + 100), 720);

  return (
    <div className="w-full min-w-0 max-w-full rounded-lg border border-gray-200/90 bg-white p-3 sm:p-4">
      <p className="text-[11px] text-gray-500 mb-2">
        Bar length shows outstanding (₹). Hover a bar for full amount and invoice count.
      </p>
      <div className="w-full" style={{ height: chartHeight }}>
        <ResponsiveContainer width="100%" height="100%" minHeight={chartHeight}>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
            barCategoryGap="12%"
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200" horizontal={false} />
            <XAxis
              type="number"
              dataKey="outstandingAmount"
              tickFormatter={formatAxisInr}
              tick={{ fontSize: 11, fill: '#6b7280' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="bucket"
              width={100}
              tickFormatter={(v: string) => (v && v.length > 22 ? `${v.slice(0, 20)}…` : v)}
              tick={{ fontSize: 11, fill: '#374151' }}
              axisLine={false}
              tickLine={false}
              interval={0}
            />
            <Tooltip
              cursor={{ fill: 'rgba(15, 23, 42, 0.04)' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload as BucketRow;
                return (
                  <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-md max-w-sm">
                    <p className="font-medium text-gray-900 break-words">{row.bucket}</p>
                    <p className="text-slate-800 tabular-nums font-semibold mt-1">
                      {formatInr(row.outstandingAmount)}
                    </p>
                    <p className="text-gray-500 text-xs mt-0.5">
                      {row.invoiceCount.toLocaleString()} invoices
                    </p>
                  </div>
                );
              }}
            />
            <Bar dataKey="outstandingAmount" radius={[0, 4, 4, 0]} maxBarSize={36} isAnimationActive>
              {data.map((_, i) => (
                <Cell
                  key={`cell-${i}`}
                  fill={BUCKET_BAR_FILLS[i % BUCKET_BAR_FILLS.length]}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

type ChasedToggle = 'emails' | 'bucket';

export default function DashboardOverview() {
  const [aging, setAging] = useState<AgingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [chasedView, setChasedView] = useState<ChasedToggle>('emails');
  const [lineItemsModal, setLineItemsModal] = useState<{
    customerCode: string;
    customerName: string;
  } | null>(null);
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [riskInfoOpen, setRiskInfoOpen] = useState(false);

  const loadAnalytics = useCallback(async (companyCode: string) => {
    setLoading(true);
    try {
      const qs = companyCode ? `?companyCode=${encodeURIComponent(companyCode)}` : '';
      const res = await fetch(`/api/aging/analytics${qs}`);
      if (res.ok) {
        const data = await res.json();
        setAging(data);
        // Populate company list from breakdown (always unfiltered)
        if (Array.isArray(data.companyBreakdown)) {
          setCompanies(data.companyBreakdown);
        }
      }
    } catch (e) {
      console.error('Dashboard load', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAnalytics(selectedCompany);
  }, [loadAnalytics, selectedCompany]);

  if (loading) {
    return (
      <div className="flex flex-1 min-h-0 items-center justify-center text-gray-500 bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-7 w-7 border-2 border-gray-200 border-t-slate-800 rounded-full animate-spin" />
          <p className="text-sm">Loading</p>
        </div>
      </div>
    );
  }

  const companyTableRows = (aging?.companyBreakdown || []).slice(0, 20);

  const m = (aging?.snapshotKpi?.latest?.metrics as SnapshotMetricsShape | null | undefined) || {};
  const receiv = aging?.latestImportReceivablesStats;
  const totalInvoicesInReceivables =
    typeof m.totalLineCount === 'number' ? m.totalLineCount : receiv?.lineCountNonExcluded;
  const distinctCustomersByCode =
    typeof m.customerDistinctByCode === 'number' ? m.customerDistinctByCode : receiv?.customerDistinctByCode;
  const distinctCustomersByName =
    typeof m.customerDistinctByName === 'number' ? m.customerDistinctByName : receiv?.customerDistinctByName;
  const risk = m.agingRisk;
  const hasKpi = !!(
    aging?.snapshotKpi?.latest &&
    (aging.snapshotKpi.latest.totalOutstandingAtImport != null ||
      aging.snapshotKpi.latest.metrics)
  );

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full min-w-0">
      <div className="px-6 py-4 border-b border-gray-200 bg-white shrink-0">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto bg-gray-50">
        <div className="w-full min-w-0 max-w-6xl mx-auto px-6 py-4 space-y-8">
      <div className="rounded-lg border border-gray-200/90 bg-white p-4 sm:p-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between w-full min-w-0 max-w-full">
        <div className="min-w-0 flex-1">
          {aging?.hasImport && aging.importName && (
            <p className="text-sm text-gray-500 break-words">
              Latest import: <span className="text-gray-800 font-medium">{aging.importName}</span>
              {aging.importAt && (
                <span className="text-gray-400"> · {new Date(aging.importAt).toLocaleString()}</span>
              )}
            </p>
          )}
          {!aging?.hasImport && (
            <p className="text-sm text-gray-500">Upload an ageing file to see metrics.</p>
          )}
        </div>

        {companies.length > 0 && (
          <div className="w-full sm:w-72 sm:max-w-[min(20rem,100%)] shrink-0 min-w-0 z-10 relative">
            <MultiSelect
              label="Filter by company"
              placeholder="All companies..."
              options={companies.map((c) => ({
                value: c.companyCode,
                label: c.companyName ? `${c.companyName} (${c.companyCode})` : c.companyCode,
              }))}
              value={companies
                .filter((c) => selectedCompany.split(',').includes(c.companyCode))
                .map((c) => ({
                  value: c.companyCode,
                  label: c.companyName ? `${c.companyName} (${c.companyCode})` : c.companyCode,
                }))}
              onChange={(selected) => {
                const values = Array.isArray(selected) ? selected.map((s: any) => s.value) : [];
                setSelectedCompany(values.join(','));
              }}
            />
          </div>
        )}
      </div>

      {aging?.hasImport && !hasKpi && (
        <div className="rounded-lg border border-amber-100 bg-amber-50/50 px-4 py-3 text-sm text-amber-900">
          Upload a new ageing file to generate period comparison metrics (or wait for the next
          import). Existing imports from before this update have no stored KPIs.
        </div>
      )}

      {aging?.hasImport && hasKpi && aging.snapshotKpi && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800 uppercase tracking-wide">
            Last snapshot (vs previous file)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 mb-4">
            Compares the latest uploaded ageing report to the one before it. New / cleared = open
            invoice lines with document no. (excluded lines omitted).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 mb-4">
            <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
              <p className="text-xs text-slate-500">Total outstanding (this file)</p>
              <p className="text-lg font-semibold text-slate-900 tabular-nums">
                {aging.snapshotKpi.latest.totalOutstandingAtImport != null
                  ? formatInr(aging.snapshotKpi.latest.totalOutstandingAtImport)
                  : '—'}
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
              <p className="text-xs text-slate-500">Total invoices / Open (positive amount)</p>
              <p className="text-lg font-semibold text-slate-900">
                {totalInvoicesInReceivables != null
                  ? totalInvoicesInReceivables.toLocaleString()
                  : '—'}{' '}
                <span className="text-slate-400 font-normal">/</span>{' '}
                {aging.snapshotKpi.latest.openInvoiceCount != null
                  ? aging.snapshotKpi.latest.openInvoiceCount.toLocaleString()
                  : '—'}
              </p>
              {receiv && receiv.storedRowCount != null && (
                <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
                  Uploaded file: {receiv.storedRowCount.toLocaleString()} row(s) · In receivables:{' '}
                  {receiv.lineCountNonExcluded.toLocaleString()} · Excluded:{' '}
                  {receiv.lineCountExcluded.toLocaleString()}
                </p>
              )}
            </div>
            <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
              <p className="text-xs text-slate-500">By customer code / By customer name</p>
              <p className="text-[10px] text-slate-400 font-medium mt-0.5 uppercase tracking-wide">After excluded</p>
              <p className="text-lg font-semibold text-slate-900 mt-1">
                {distinctCustomersByCode != null
                  ? distinctCustomersByCode.toLocaleString()
                  : '—'}{' '}
                <span className="text-slate-400 font-normal">/</span>{' '}
                {distinctCustomersByName != null
                  ? distinctCustomersByName.toLocaleString()
                  : '—'}
              </p>
            </div>
            <div className="rounded-lg bg-emerald-50/80 border border-emerald-100 p-3">
              <p className="text-xs text-emerald-800">New invoices (in current, not in prior)</p>
              <p className="text-lg font-semibold text-emerald-900">
                {m.newInvoiceCount ?? 0}
                {m.newOpenAmount != null && (
                  <span className="text-sm font-normal text-emerald-800 ml-1">
                    ({formatInr(m.newOpenAmount)})
                  </span>
                )}
              </p>
            </div>
            <div className="rounded-lg bg-amber-50/80 border border-amber-100 p-3">
              <p className="text-xs text-amber-900">Cleared (in prior, not in current)</p>
              <p className="text-lg font-semibold text-amber-950">
                {m.clearedInvoiceCount ?? 0}
                {m.clearedFromPriorAmount != null && (
                  <span className="text-sm font-normal text-amber-900 ml-1">
                    (was {formatInr(m.clearedFromPriorAmount)})
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
            <div className="rounded-lg border border-slate-100 p-3 text-sm">
              <span className="text-slate-500">Net change vs previous total</span>
              <p
                className={`font-semibold tabular-nums ${
                  (m.deltaOutstandingVsPrior ?? 0) > 0
                    ? 'text-red-700'
                    : (m.deltaOutstandingVsPrior ?? 0) < 0
                      ? 'text-emerald-700'
                      : 'text-slate-800'
                }`}
              >
                {m.deltaOutstandingVsPrior != null
                  ? `${m.deltaOutstandingVsPrior > 0 ? '+' : ''}${formatInr(m.deltaOutstandingVsPrior)}`
                  : '—'}
              </p>
            </div>
            <div className="rounded-lg border border-slate-100 p-3 text-sm">
              <span className="text-slate-500">Customers (new / dropped)</span>
              <p className="font-semibold text-slate-800">
                +{m.newCustomerCount ?? 0} new · −{m.customersDroppedCount ?? 0} dropped
              </p>
            </div>
            {risk && (
              <div className="rounded-lg border border-slate-100 p-3 text-sm col-span-1 sm:col-span-2 lg:col-span-1">
                <div className="group/risk relative">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-slate-500">Risk: over 90d (amount) · top-5 (by code)</span>
                    <button
                      type="button"
                      onClick={() => setRiskInfoOpen((v) => !v)}
                      className="shrink-0 rounded-full p-0.5 text-slate-400 outline-none ring-offset-1 hover:text-slate-600 focus-visible:ring-2 focus-visible:ring-slate-400"
                      aria-expanded={riskInfoOpen}
                      aria-label="What these risk metrics mean. Hover the label on desktop, or tap the icon for details on mobile."
                    >
                      <Info className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>
                  <div
                    role="tooltip"
                    className="hidden md:block pointer-events-auto absolute left-0 top-full z-40 mt-0.5 w-[min(18rem,calc(100vw-2.5rem))] scale-95 transform rounded-md border border-slate-200 bg-white p-2.5 text-left text-[11px] text-slate-600 shadow-lg opacity-0 transition-[opacity,transform] duration-150 [transition-delay:50ms] group-hover/risk:scale-100 group-hover/risk:opacity-100 group-focus-within/risk:scale-100 group-focus-within/risk:opacity-100"
                  >
                    <p>
                      <span className="font-medium text-slate-700">Over 90d</span> — Portion of
                      total <em>open</em> amount in aging buckets <em>older than 90 days</em> (how
                      much of the receivable is &ldquo;old&rdquo; by your bucket rules).
                    </p>
                    <p className="mt-2">
                      <span className="font-medium text-slate-700">Top-5 share</span> — Of total
                      open amount, the fraction owed by the <em>largest five customers</em> (by
                      customer code). Shows concentration: how much sits with a few accounts.
                    </p>
                  </div>
                </div>
                {riskInfoOpen && (
                  <div
                    id="dashboard-risk-explanation-inline"
                    className="md:hidden mt-1.5 rounded-md border border-slate-200 bg-slate-50/80 p-2.5 text-[11px] text-slate-600 leading-relaxed"
                    role="region"
                    aria-label="Risk metrics explained"
                  >
                    <p>
                      <span className="font-medium text-slate-700">Over 90d</span> — Portion of
                      total <em>open</em> amount in aging buckets <em>older than 90 days</em> (how
                      much of the receivable is &ldquo;old&rdquo; by your bucket rules).
                    </p>
                    <p className="mt-2">
                      <span className="font-medium text-slate-700">Top-5 share</span> — Of total
                      open amount, the fraction owed by the <em>largest five customers</em> (by
                      customer code). Shows concentration: how much sits with a few accounts.
                    </p>
                  </div>
                )}
                <p className="font-semibold text-slate-800 mt-0.5">
                  {typeof risk.pctOutstandingOver90 === 'number'
                    ? `${risk.pctOutstandingOver90}% in over-90d buckets`
                    : '—'}
                  {typeof risk.top5CustomerConcentrationPct === 'number' && (
                    <span className="text-slate-600 font-normal">
                      {' '}
                      · {risk.top5CustomerConcentrationPct}% in top-5 share
                    </span>
                  )}
                </p>
              </div>
            )}
          </div>
          {aging.snapshotKpi.history.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-2">
                Recent imports
              </h3>
              <div className="overflow-x-auto border border-slate-100 rounded-lg">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 text-xs">
                      <th className="px-3 py-2">File</th>
                      <th className="px-3 py-2">Uploaded</th>
                      <th className="px-3 py-2 text-right">Outstanding</th>
                      <th className="px-3 py-2 text-right">Δ vs prior</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aging.snapshotKpi.history.map((h) => (
                      <tr key={h.importId} className="border-t border-slate-100">
                        <td className="px-3 py-2 text-slate-800 max-w-[12rem] truncate" title={h.fileName}>
                          {h.fileName}
                        </td>
                        <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                          {new Date(h.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-800">
                          {h.totalOutstandingAtImport != null
                            ? formatInr(h.totalOutstandingAtImport)
                            : '—'}
                        </td>
                        <td
                          className={`px-3 py-2 text-right tabular-nums font-medium ${
                            h.deltaVsPrior == null
                              ? 'text-slate-400'
                              : h.deltaVsPrior > 0
                                ? 'text-red-600'
                                : h.deltaVsPrior < 0
                                  ? 'text-emerald-600'
                                  : 'text-slate-700'
                          }`}
                        >
                          {h.deltaVsPrior != null
                            ? `${h.deltaVsPrior > 0 ? '+' : ''}${formatInr(h.deltaVsPrior)}`
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {(aging?.bucketBreakdown?.length ?? 0) > 0 && (
        <div>
          <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-gray-500 mb-3">
            Uncleared by ageing bucket
          </h2>
          <UnclearedByBucketChart rows={aging?.bucketBreakdown || []} />
        </div>
      )}

      {(aging?.chasedBreakdown && (aging.chasedBreakdown.byEmails.some((e) => e.invoiceCount > 0) ||
        aging.chasedBreakdown.byBucket.some((b) => b.invoiceCount > 0))) && (
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-gray-500">
              Chased invoices (1+ emails)
            </h2>
            <div className="inline-flex rounded-full border border-gray-200/90 bg-white p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setChasedView('emails')}
                className={
                  chasedView === 'emails'
                    ? 'rounded-full bg-slate-800 text-white px-3 py-1'
                    : 'px-3 py-1 text-gray-600 hover:text-gray-900'
                }
              >
                By email count
              </button>
              <button
                type="button"
                onClick={() => setChasedView('bucket')}
                className={
                  chasedView === 'bucket'
                    ? 'rounded-full bg-slate-800 text-white px-3 py-1'
                    : 'px-3 py-1 text-gray-600 hover:text-gray-900'
                }
              >
                By bucket
              </button>
            </div>
          </div>
          <div className="w-full min-w-0 max-w-full rounded-lg border border-gray-200/90 bg-white overflow-hidden">
            {chasedView === 'emails' ? (
              <table className="w-full min-w-0 table-fixed text-sm text-left break-words">
                <thead>
                  <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide">
                    <th className="px-3 sm:px-4 py-3 font-medium w-1/3">Emails sent</th>
                    <th className="px-3 sm:px-4 py-3 font-medium text-right w-1/3">Invoices</th>
                    <th className="px-3 sm:px-4 py-3 font-medium text-right w-1/3">Outstanding (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {(aging.chasedBreakdown.byEmails || []).map((e) => (
                    <tr
                      key={e.emailsSent}
                      className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60"
                    >
                      <td className="px-3 sm:px-4 py-3 text-gray-900 font-medium">
                        {e.emailsSent === '4+' ? '4+' : e.emailsSent}
                      </td>
                      <td className="px-3 sm:px-4 py-3 text-right tabular-nums text-gray-800">
                        {e.invoiceCount}
                      </td>
                      <td className="px-3 sm:px-4 py-3 text-right tabular-nums text-gray-900 break-all sm:break-normal">
                        {formatInr(e.outstandingAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full min-w-0 table-fixed text-sm text-left break-words">
                <thead>
                  <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide">
                    <th className="px-3 sm:px-4 py-3 font-medium w-[20%]">Bucket</th>
                    <th className="px-3 sm:px-4 py-3 font-medium text-right w-[12%]">Invoices</th>
                    <th className="px-3 sm:px-4 py-3 font-medium text-right w-[16%]">Outstanding (₹)</th>
                    <th className="px-3 sm:px-4 py-3 font-medium min-w-0 w-[52%]">Top customers</th>
                  </tr>
                </thead>
                <tbody>
                  {(aging.chasedBreakdown.byBucket || [])
                    .filter((b) => b.invoiceCount > 0)
                    .map((b) => (
                      <tr
                        key={b.bucket}
                        className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60"
                      >
                        <td className="px-3 sm:px-4 py-3 text-gray-900 font-medium align-top break-words">
                          {b.bucket}
                        </td>
                        <td className="px-3 sm:px-4 py-3 text-right tabular-nums text-gray-800">
                          {b.invoiceCount}
                        </td>
                        <td className="px-3 sm:px-4 py-3 text-right tabular-nums text-gray-900 break-all sm:break-normal">
                          {formatInr(b.outstandingAmount)}
                        </td>
                        <td className="px-3 sm:px-4 py-3 text-gray-600 text-sm min-w-0 break-words align-top">
                          {b.topCustomers.map((c) => c.customerName).join(', ') || '—'}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {(aging?.customerSummary?.length ?? 0) > 0 && (
        <div className="w-full min-w-0">
          <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-gray-500 mb-3">
            Customer summary
          </h2>
          <p className="text-xs text-gray-400 mb-2">Top 20 customers by outstanding amount</p>
          <div className="w-full min-w-0 max-w-full rounded-lg border border-gray-200/90 bg-white overflow-hidden">
            <table className="w-full min-w-0 table-fixed text-sm text-left break-words">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-3 sm:px-4 py-3 font-medium min-w-0 w-[32%]">Customer</th>
                  <th className="px-3 sm:px-4 py-3 font-medium w-[14%]">Code</th>
                  <th className="px-3 sm:px-4 py-3 font-medium text-right w-[12%]">Invoices</th>
                  <th className="px-3 sm:px-4 py-3 font-medium text-right w-[24%]">Outstanding</th>
                  <th className="px-3 sm:px-4 py-3 font-medium text-right w-[18%]">With response</th>
                </tr>
              </thead>
              <tbody>
                {(aging?.customerSummary || []).map((c) => (
                  <tr
                    key={c.key}
                    className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60"
                  >
                    <td className="px-3 sm:px-4 py-3 text-gray-900 font-medium min-w-0 align-top">
                      <button
                        type="button"
                        onClick={() =>
                          setLineItemsModal({ customerCode: c.customerCode, customerName: c.customerName })
                        }
                        className="text-left w-full break-words cursor-pointer hover:underline underline-offset-2"
                      >
                        {c.customerName}
                      </button>
                    </td>
                    <td className="px-3 sm:px-4 py-3 text-gray-500 tabular-nums text-xs align-top break-all">
                      {c.customerCode}
                    </td>
                    <td className="px-3 sm:px-4 py-3 text-right tabular-nums text-gray-800 align-top">
                      {c.invoiceCount}
                    </td>
                    <td className="px-3 sm:px-4 py-3 text-right tabular-nums text-gray-900 break-all sm:break-normal align-top">
                      {formatInr(c.outstandingAmount)}
                    </td>
                    <td className="px-3 sm:px-4 py-3 text-right tabular-nums text-gray-600 align-top">
                      {c.withResponse}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {companyTableRows.length > 0 && (
        <div className="w-full min-w-0">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between mb-3">
            <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-gray-500">
              By company
            </h2>
            <Link
              href="/companies"
              className="inline-flex w-fit items-center rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-slate-800"
            >
              View all companies
            </Link>
          </div>
          <p className="text-xs text-gray-400 mb-2">
            Top 20 by outstanding
            {(aging?.companyBreakdown?.length ?? 0) > 20 && (
              <span>
                {' '}
                — {(aging?.companyBreakdown?.length ?? 0) - 20} more: open{' '}
                <Link
                  href="/companies"
                  className="font-medium text-slate-800 underline decoration-slate-400 underline-offset-2 hover:text-slate-950"
                >
                  all companies
                </Link>
                {' '}
                or use &quot;Filter by company&quot; above
              </span>
            )}
          </p>
          <div className="w-full min-w-0 max-w-full rounded-lg border border-gray-200/90 bg-white overflow-hidden">
            <table className="w-full min-w-0 table-fixed text-sm text-left break-words">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-2 sm:px-3 py-3 font-medium min-w-0 w-[32%]">Company</th>
                  <th className="px-2 sm:px-3 py-3 font-medium w-[12%]">Code</th>
                  <th className="px-2 sm:px-3 py-3 font-medium text-right w-[10%]">Invoices</th>
                  <th className="px-2 sm:px-3 py-3 font-medium text-right w-[20%]">Outstanding</th>
                  <th className="px-2 sm:px-3 py-3 font-medium text-right w-[12%]">Sent</th>
                  <th className="px-2 sm:px-3 py-3 font-medium text-right w-[12%]">Resp.</th>
                </tr>
              </thead>
              <tbody>
                {companyTableRows.map((co) => (
                  <tr
                    key={co.companyCode}
                    className={`border-b border-gray-50 last:border-0 hover:bg-gray-50/60 ${
                      selectedCompany.split(',').filter(Boolean).includes(co.companyCode)
                        ? 'bg-blue-50/40'
                        : ''
                    }`}
                  >
                    <td className="px-2 sm:px-3 py-3 text-gray-900 font-medium min-w-0 align-top">
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedCompany((p) => (p === co.companyCode ? '' : co.companyCode))
                        }
                        className="hover:underline underline-offset-2 text-left w-full break-words"
                        title="Click to filter dashboard by this company"
                      >
                        {co.companyName || '—'}
                      </button>
                    </td>
                    <td className="px-2 sm:px-3 py-3 text-gray-500 tabular-nums text-xs align-top break-all">
                      {co.companyCode}
                    </td>
                    <td className="px-2 sm:px-3 py-3 text-right tabular-nums text-gray-800 align-top">
                      {co.invoiceCount}
                    </td>
                    <td className="px-2 sm:px-3 py-3 text-right tabular-nums text-gray-900 break-all sm:break-normal align-top">
                      {formatInr(co.outstandingAmount)}
                    </td>
                    <td className="px-2 sm:px-3 py-3 text-right tabular-nums text-gray-800 align-top">
                      {co.emailsSent}
                    </td>
                    <td className="px-2 sm:px-3 py-3 text-right tabular-nums text-gray-600 align-top">
                      {co.responses}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

        </div>
      </div>

      <CustomerLineItemsModal
        open={lineItemsModal != null}
        onClose={() => setLineItemsModal(null)}
        customerCode={lineItemsModal?.customerCode ?? ''}
        customerName={lineItemsModal?.customerName ?? ''}
      />
    </div>
  );
}
