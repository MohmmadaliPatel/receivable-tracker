'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, FileText } from 'lucide-react';

type CompanyRow = {
  companyCode: string;
  companyName: string;
  invoiceCount: number;
  outstandingAmount: number;
  emailsSent: number;
  responses: number;
};

type ApiShape = {
  hasImport: boolean;
  importName?: string;
  importAt?: string;
  companyBreakdown?: CompanyRow[];
};

function formatInr(n: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n);
}

export default function CompaniesClient() {
  const [data, setData] = useState<ApiShape | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const r = await fetch('/api/aging/analytics', { cache: 'no-store' });
      if (!r.ok) {
        setData(null);
        setErr('Could not load company summary.');
        return;
      }
      const j = (await r.json()) as ApiShape;
      setData(j);
    } catch {
      setData(null);
      setErr('Could not load company summary.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = data?.companyBreakdown ?? [];
  const n = rows.length;

  if (err) {
    return (
      <div className="px-6 py-4">
        <p className="text-sm text-red-600">{err}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-2 text-sm text-blue-600 hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="px-6 py-8 flex items-center justify-center text-gray-500 text-sm">Loading</div>
    );
  }

  if (!data.hasImport || n === 0) {
    return (
      <div className="px-6 py-4">
        <p className="text-sm text-gray-600">
          No ageing data yet. Upload a file to see all companies in the report.
        </p>
        <Link
          href="/"
          className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4 text-slate-500" aria-hidden />
          Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full min-w-0">
      <div className="px-6 py-4 border-b border-gray-200 bg-white shrink-0">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              href="/"
              className="mb-2 inline-flex w-fit items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-1.5 text-xs font-medium text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-white"
            >
              <ArrowLeft className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />
              Dashboard
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">All companies</h1>
            {data.importName && (
              <p className="text-sm text-gray-500 break-words mt-0.5">
                From latest import: <span className="text-gray-800 font-medium">{data.importName}</span>
                {data.importAt && (
                  <span className="text-gray-400">
                    {' '}
                    · {new Date(data.importAt).toLocaleString()}
                  </span>
                )}
              </p>
            )}
            <p className="text-xs text-gray-400 mt-1">
              {n} compan{n === 1 ? 'y' : 'ies'}, sorted by outstanding (₹)
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto bg-gray-50">
        <div className="w-full min-w-0 max-w-6xl mx-auto px-6 py-4">
          <div className="w-full min-w-0 max-w-full rounded-lg border border-gray-200/90 bg-white overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm text-left break-words">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-3 sm:px-4 py-3 font-medium min-w-0 w-[24%]">Company</th>
                  <th className="px-3 sm:px-4 py-3 font-medium w-[10%]">Code</th>
                  <th className="px-3 sm:px-4 py-3 font-medium text-right w-[8%]">Invoices</th>
                  <th className="px-3 sm:px-4 py-3 font-medium text-right w-[16%]">Outstanding</th>
                  <th className="px-3 sm:px-4 py-3 font-medium text-right w-[8%]">Sent</th>
                  <th className="px-3 sm:px-4 py-3 font-medium text-right w-[8%]">Resp.</th>
                  <th className="px-2 sm:px-3 py-3 font-medium text-right w-[11%]">
                    <span className="inline-flex items-center justify-end gap-1.5 text-slate-500">
                      <FileText className="h-3.5 w-3.5" aria-hidden />
                      Invoices
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((co) => (
                  <tr
                    key={co.companyCode}
                    className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60"
                  >
                    <td className="px-3 sm:px-4 py-3 text-gray-900 font-medium min-w-0 align-top break-words">
                      {co.companyName || '—'}
                    </td>
                    <td className="px-3 sm:px-4 py-3 text-gray-500 tabular-nums text-xs align-top break-all">
                      {co.companyCode}
                    </td>
                    <td className="px-3 sm:px-4 py-3 text-right tabular-nums text-gray-800 align-top">
                      {co.invoiceCount}
                    </td>
                    <td className="px-3 sm:px-4 py-3 text-right tabular-nums text-gray-900 break-all sm:break-normal align-top">
                      {formatInr(co.outstandingAmount)}
                    </td>
                    <td className="px-3 sm:px-4 py-3 text-right tabular-nums text-gray-800 align-top">
                      {co.emailsSent}
                    </td>
                    <td className="px-3 sm:px-4 py-3 text-right tabular-nums text-gray-600 align-top">
                      {co.responses}
                    </td>
                    <td className="px-2 sm:px-3 py-2 align-top">
                      <div className="group/inv relative flex justify-end">
                        <Link
                          href={`/invoices?company=${encodeURIComponent(co.companyCode)}`}
                          className="inline-flex h-9 min-w-9 sm:min-w-0 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 sm:px-2.5 text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-slate-400"
                          title={
                            co.companyName
                              ? `Open the invoices list filtered to this company: ${co.companyName} (code ${co.companyCode})`
                              : `Open the invoices list filtered to company code ${co.companyCode}`
                          }
                          aria-label={
                            co.companyName
                              ? `Open invoices for ${co.companyName}, code ${co.companyCode}`
                              : `Open invoices for company code ${co.companyCode}`
                          }
                        >
                          <FileText
                            className="h-4 w-4 shrink-0 text-slate-600 group-hover/inv:text-slate-900"
                            aria-hidden
                          />
                          <span className="hidden text-xs font-medium sm:inline">View</span>
                        </Link>
                        <div
                          role="tooltip"
                          className="pointer-events-none absolute bottom-[calc(100%+6px)] right-0 z-20 w-max max-w-[16rem] rounded-md border border-slate-200 bg-slate-900 px-2.5 py-1.5 text-left text-[10px] font-medium leading-snug text-white shadow-lg opacity-0 transition-opacity [transition-delay:40ms] sm:hidden group-hover/inv:opacity-100"
                        >
                          View invoices for {co.companyName || co.companyCode}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
