'use client';

import { useCallback, useEffect, useState } from 'react';
import { getBucketSortDaysFromMaxDaysField } from '@/lib/aging-bucket-utils';

type Row = {
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

function formatInr(n: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n);
}

function chipClass(bucket: string): string {
  const d = getBucketSortDaysFromMaxDaysField(bucket);
  if (d <= 15) return 'bg-emerald-50 text-emerald-900 border-emerald-200/80';
  if (d <= 60) return 'bg-lime-50 text-lime-900 border-lime-200/80';
  if (d <= 135) return 'bg-amber-50 text-amber-900 border-amber-200/80';
  if (d <= 273) return 'bg-orange-50 text-orange-900 border-orange-200/80';
  return 'bg-rose-50 text-rose-900 border-rose-200/80';
}

type Props = {
  open: boolean;
  onClose: () => void;
  customerCode: string;
  customerName: string;
};

export default function CustomerLineItemsModal({ open, onClose, customerCode, customerName }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [importLabel, setImportLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!customerCode) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/aging/customer-line-items?customerCode=${encodeURIComponent(customerCode)}`,
      );
      if (!res.ok) {
        setError('Could not load line items');
        setRows([]);
        return;
      }
      const j = await res.json();
      setRows(j.rows || []);
      if (j.importName) {
        setImportLabel(
          j.importName + (j.importAt ? ` · ${new Date(j.importAt).toLocaleString()}` : ''),
        );
      } else {
        setImportLabel(null);
      }
    } catch (e) {
      console.error(e);
      setError('Could not load line items');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [customerCode]);

  useEffect(() => {
    if (open && customerCode) {
      void load();
    } else {
      setRows([]);
      setError(null);
    }
  }, [open, customerCode, load]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="customer-line-items-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[85vh] flex flex-col border border-gray-200/90">
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-gray-100">
          <div>
            <h2 id="customer-line-items-title" className="text-base font-semibold text-gray-900">
              {customerName}
              <span className="text-gray-500 font-normal text-sm ml-2 tabular-nums">
                {customerCode}
              </span>
            </h2>
            {importLabel && <p className="text-xs text-gray-500 mt-1">Latest import: {importLabel}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-gray-400 hover:text-gray-700 text-2xl leading-none px-1"
            aria-label="Close"
          >
            &times;
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-3">
          {loading && <p className="text-sm text-gray-500 text-center py-8">Loading…</p>}
          {error && <p className="text-sm text-red-600 py-2">{error}</p>}
          {!loading && !error && rows.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-8">No line items for this customer.</p>
          )}
          {!loading && rows.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-gray-200/80">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide">
                    <th className="px-3 py-2.5 font-medium">Doc no</th>
                    <th className="px-3 py-2.5 font-medium">Bucket</th>
                    <th className="px-3 py-2.5 font-medium text-right">Amount</th>
                    <th className="px-3 py-2.5 font-medium text-right">Emails</th>
                    <th className="px-3 py-2.5 font-medium">Last sent</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.invoiceKey} className="border-b border-gray-50 last:border-0">
                      <td className="px-3 py-2 text-gray-900 tabular-nums">{r.documentNo}</td>
                      <td className="px-3 py-2">
                        <span
                          className={'inline-block px-2 py-0.5 rounded text-xs border ' + chipClass(r.bucket)}
                        >
                          {r.bucket}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-900">
                        {formatInr(r.amount)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                        {r.emailsSent}
                      </td>
                      <td className="px-3 py-2 text-gray-600 text-xs">
                        {r.lastSentAt ? new Date(r.lastSentAt).toLocaleString() : '—'}
                      </td>
                      <td className="px-3 py-2 text-gray-800">
                        {r.status}
                        {r.hasResponse && (
                          <span className="ml-1.5 text-emerald-600 text-xs">(reply)</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
