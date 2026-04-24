'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
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

interface AgingStats {
  hasImport: boolean;
  importName?: string;
  importAt?: string;
  companyCodeFilter?: string | null;
  invoiceCountLatest?: number;
  outstandingInvoices?: number;
  highTouchNoReply?: number;
  responseReceived?: number;
  cleared?: number;
  customerSummary?: CustomerRow[];
  companyBreakdown?: CompanyRow[];
  bucketBreakdown?: BucketRow[];
  chasedBreakdown?: { byEmails: ChasedByEmail[]; byBucket: ChasedByBucket[] };
}

function formatInr(n: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n);
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
              Latest import: <span className="text-gray-800">{aging.importName}</span>
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Invoices (latest file)"
          value={aging?.invoiceCountLatest ?? 0}
          sub="excludes internal"
        />
        <StatCard label="Open (portfolio)" value={aging?.outstandingInvoices ?? 0} sub="invoices" />
        <StatCard
          label="Responses"
          value={aging?.responseReceived ?? 0}
          sub="with reply"
          emphasis="positive"
        />
        <StatCard label="Cleared" value={aging?.cleared ?? 0} />
      </div>

      {(aging?.bucketBreakdown?.length ?? 0) > 0 && (
        <div>
          <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-gray-500 mb-3">
            Uncleared by ageing bucket
          </h2>
          <div className="w-full min-w-0 max-w-full rounded-lg border border-gray-200/90 bg-white overflow-hidden">
            <table className="w-full min-w-0 table-fixed text-sm text-left break-words">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-3 sm:px-4 py-3 font-medium w-[45%]">Bucket</th>
                  <th className="px-3 sm:px-4 py-3 font-medium text-right w-[15%]">Invoices</th>
                  <th className="px-3 sm:px-4 py-3 font-medium text-right w-[40%]">Outstanding (₹)</th>
                </tr>
              </thead>
              <tbody>
                {(aging?.bucketBreakdown || [])
                  .filter((r) => r.outstandingAmount > 0)
                  .sort(
                    (a, b) =>
                      getBucketSortDaysFromMaxDaysField(b.bucket) -
                      getBucketSortDaysFromMaxDaysField(a.bucket),
                  )
                  .map((r) => (
                    <tr
                      key={r.bucket}
                      className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60"
                    >
                      <td className="px-3 sm:px-4 py-3 text-gray-900 font-medium break-words align-top">
                        {r.bucket}
                      </td>
                      <td className="px-3 sm:px-4 py-3 text-right tabular-nums text-gray-800">
                        {r.invoiceCount}
                      </td>
                      <td className="px-3 sm:px-4 py-3 text-right tabular-nums text-gray-900 break-all sm:break-normal">
                        {formatInr(r.outstandingAmount)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
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
                        className="hover:underline underline-offset-2 text-left w-full break-words"
                      >
                        {c.customerName}
                      </button>
                    </td>
                    <td className="px-3 sm:px-4 py-3 text-gray-500 tabular-nums text-xs align-top break-all">
                      <Link
                        href={`/invoices?customer=${encodeURIComponent(c.customerCode)}`}
                        className="hover:underline underline-offset-2"
                      >
                        {c.customerCode}
                      </Link>
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
          <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-gray-500 mb-3">
            By company
          </h2>
          <p className="text-xs text-gray-400 mb-2">
            Top 20 by outstanding
            {(aging?.companyBreakdown?.length ?? 0) > 20 && (
              <span>
                {' '}
                — {(aging?.companyBreakdown?.length ?? 0) - 20} more companies available in
                &quot;Filter by company&quot; above
              </span>
            )}
          </p>
          <div className="w-full min-w-0 max-w-full rounded-lg border border-gray-200/90 bg-white overflow-hidden">
            <table className="w-full min-w-0 table-fixed text-sm text-left break-words">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-2 sm:px-3 py-3 font-medium min-w-0 w-[22%]">Company</th>
                  <th className="px-2 sm:px-3 py-3 font-medium w-[10%]">Code</th>
                  <th className="px-2 sm:px-3 py-3 font-medium text-right w-[9%]">Invoices</th>
                  <th className="px-2 sm:px-3 py-3 font-medium text-right w-[16%]">Outstanding</th>
                  <th className="px-2 sm:px-3 py-3 font-medium text-right w-[9%]">Sent</th>
                  <th className="px-2 sm:px-3 py-3 font-medium text-right w-[9%]">Resp.</th>
                  <th className="px-2 sm:px-3 py-3 font-medium w-[25%]">Actions</th>
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
                    <td className="px-2 sm:px-3 py-2 text-xs align-top min-w-0">
                      <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                        <Link
                          href={`/invoices?company=${encodeURIComponent(co.companyCode)}`}
                          className="text-blue-600 hover:underline shrink-0"
                        >
                          Invoices
                        </Link>
                        <Link
                          href={`/bulk-email?company=${encodeURIComponent(co.companyCode)}`}
                          className="text-amber-700 hover:underline shrink-0"
                        >
                          Bulk email
                        </Link>
                      </div>
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

function StatCard({
  label,
  value,
  sub,
  emphasis,
}: {
  label: string;
  value: number;
  sub?: string;
  emphasis?: 'positive' | 'alert';
}) {
  const border =
    emphasis === 'positive'
      ? 'border-emerald-200/80 bg-emerald-50/30'
      : emphasis === 'alert'
        ? 'border-amber-200/80 bg-amber-50/30'
        : 'border-gray-200/80 bg-white';

  return (
    <div className={`rounded-lg border px-4 py-3.5 ${border}`}>
      <p className="text-xs text-gray-500 leading-tight">{label}</p>
      <p className="text-2xl font-semibold text-gray-900 mt-1 tabular-nums tracking-tight">
        {value.toLocaleString()}
      </p>
      {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}
