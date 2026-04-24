'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getBucketSortDaysFromMaxDaysField } from '@/lib/aging-bucket-utils';
import CustomerLineItemsModal from '@/components/CustomerLineItemsModal';
import { ServerDataTable, type SortDir } from '@/components/ui/ServerDataTable';
import type { Column } from '@/components/ui/DataTable';

type Row = {
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

type Aggregates = {
  byBucket: { bucket: string; count: number; amount: number }[];
  byCustomer: { customerName: string; customerCode: string; count: number; amount: number }[];
  byEmailCount: { emailsSent: string; count: number; amount: number }[];
};

type BreakdownTab = 'bucket' | 'customer' | 'email';

const INVOICE_SORT_FIELDS = [
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
type InvoiceSortField = (typeof INVOICE_SORT_FIELDS)[number];

function formatInr(n: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n);
}

function bucketChipClass(bucket: string): string {
  const d = getBucketSortDaysFromMaxDaysField(bucket);
  if (d <= 15) return 'bg-emerald-50 text-emerald-900 border-emerald-200/80';
  if (d <= 60) return 'bg-lime-50 text-lime-900 border-lime-200/80';
  if (d <= 135) return 'bg-amber-50 text-amber-900 border-amber-200/80';
  if (d <= 273) return 'bg-orange-50 text-orange-900 border-orange-200/80';
  return 'bg-rose-50 text-rose-900 border-rose-200/80';
}

function appendParamList(s: URLSearchParams, name: string, values: string[]) {
  for (const v of values) {
    if (v) s.append(name, v);
  }
}

function buildQuery(params: {
  columnFilters: Record<string, Set<string>>;
  page: number;
  pageSize: number;
  sortField: InvoiceSortField;
  sortOrder: SortDir;
}): string {
  const s = new URLSearchParams();
  const g = (k: string) => (params.columnFilters[k] ? Array.from(params.columnFilters[k]!) : []);
  appendParamList(s, 'bucket', g('bucket'));
  appendParamList(s, 'company', g('companyName'));
  appendParamList(s, 'documentNo', g('documentNo'));
  appendParamList(s, 'customerName', g('customerName'));
  appendParamList(s, 'status', g('status'));
  appendParamList(s, 'emailsSent', g('emailsSent'));
  appendParamList(s, 'amount', g('amount'));
  appendParamList(s, 'lastSent', g('lastSent'));
  s.set('page', String(params.page));
  s.set('pageSize', String(params.pageSize));
  s.set('sortField', params.sortField);
  s.set('sortOrder', params.sortOrder);
  return s.toString();
}

export default function InvoicesClient() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortField, setSortField] = useState<InvoiceSortField>('amount');
  const [sortOrder, setSortOrder] = useState<SortDir>('desc');
  const [columnFilters, setColumnFilters] = useState<Record<string, Set<string>>>({});
  const [filterOptions, setFilterOptions] = useState<{
    status: string[];
    bucket: string[];
    documentNo: string[];
    customerName: string[];
    companyName: string[];
    amount: string[];
    emailsSent: string[];
    lastSent: string[];
  }>({
    status: [],
    bucket: [],
    documentNo: [],
    customerName: [],
    companyName: [],
    amount: [],
    emailsSent: [],
    lastSent: [],
  });
  const [breakdown, setBreakdown] = useState<BreakdownTab>('bucket');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [aggregates, setAggregates] = useState<Aggregates | null>(null);
  const [top10, setTop10] = useState<Row[]>([]);
  const [importLabel, setImportLabel] = useState<string | null>(null);
  const [lineItemsModal, setLineItemsModal] = useState<{
    customerCode: string;
    customerName: string;
  } | null>(null);

  const q = useMemo(
    () =>
      buildQuery({
        columnFilters,
        page,
        pageSize,
        sortField,
        sortOrder,
      }),
    [columnFilters, page, pageSize, sortField, sortOrder],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/aging/invoices-view?${q}`);
      if (!res.ok) {
        setError('Could not load invoices');
        return;
      }
      const j = await res.json();
      setRows(j.rows || []);
      setTotal(j.total ?? 0);
      setAggregates(j.aggregates || null);
      setTop10(j.top10Spotlight || []);
      if (j.importName) {
        setImportLabel(
          j.importName + (j.importAt ? ` · ${new Date(j.importAt).toLocaleString()}` : ''),
        );
      } else {
        setImportLabel(null);
      }
      if (j.filterOptions) {
        const fo = j.filterOptions;
        setFilterOptions({
          status: fo.status || [],
          bucket: fo.bucket || j.availableBuckets || [],
          documentNo: fo.documentNo || [],
          customerName: fo.customerName || [],
          companyName: fo.companyName || [],
          amount: fo.amount || [],
          emailsSent: fo.emailsSent || [],
          lastSent: fo.lastSent || [],
        });
      }
    } catch (e) {
      console.error(e);
      setError('Could not load invoices');
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => {
    load();
  }, [load]);

  const onInvoiceSort = (colKey: string) => {
    if (!(INVOICE_SORT_FIELDS as readonly string[]).includes(colKey)) return;
    const k = colKey as InvoiceSortField;
    if (sortField === k) {
      setSortOrder((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(k);
      setSortOrder('asc');
    }
    setPage(1);
  };

  const clearAllFilters = useCallback(() => {
    setColumnFilters({});
    setPage(1);
  }, []);

  const invoiceTableColumns: Column<Row>[] = useMemo(
    () => [
      {
        key: 'documentNo',
        header: 'Doc no',
        sortable: true,
        filterable: true,
        rawValue: (r) => r.documentNo,
        accessor: (r) => (
          <Link href="/bulk-email" className="text-slate-800 underline-offset-2 hover:underline">
            {r.documentNo}
          </Link>
        ),
        minWidth: '100px',
      },
      {
        key: 'customerName',
        header: 'Customer',
        sortable: true,
        filterable: true,
        rawValue: (r) => r.customerName,
        accessor: (r) => (
          <span>
            <button
              type="button"
              onClick={() =>
                setLineItemsModal({ customerCode: r.customerCode, customerName: r.customerName })
              }
              className="text-left hover:underline underline-offset-2"
            >
              <span className="text-gray-800">{r.customerName}</span>
            </button>
            <span className="text-gray-500 text-xs ml-1">({r.customerCode})</span>
          </span>
        ),
        minWidth: '180px',
      },
      {
        key: 'companyName',
        header: 'Company',
        sortable: true,
        filterable: true,
        rawValue: (r) => r.companyName,
        accessor: (r) => <span className="text-gray-700">{r.companyName}</span>,
        minWidth: '120px',
      },
      {
        key: 'bucket',
        header: 'Bucket',
        sortable: true,
        filterable: true,
        rawValue: (r) => r.bucket,
        accessor: (r) => (
          <span
            className={'inline-block px-2 py-0.5 rounded text-xs border ' + bucketChipClass(r.bucket)}
          >
            {r.bucket}
          </span>
        ),
        minWidth: '100px',
      },
      {
        key: 'amount',
        header: 'Amount',
        sortable: true,
        filterable: true,
        align: 'right',
        rawValue: (r) => r.amount,
        accessor: (r) => (
          <span className="tabular-nums text-gray-900">{formatInr(r.amount)}</span>
        ),
        minWidth: '100px',
      },
      {
        key: 'emailsSent',
        header: 'Emails',
        sortable: true,
        filterable: true,
        align: 'right',
        rawValue: (r) => r.emailsSent,
        accessor: (r) => r.emailsSent,
        minWidth: '72px',
      },
      {
        key: 'lastSent',
        header: 'Last sent',
        sortable: true,
        filterable: true,
        rawValue: (r) => (r.lastSentAt || ''),
        accessor: (r) =>
          r.lastSentAt ? (
            <span className="text-gray-600 text-xs">
              {new Date(r.lastSentAt).toLocaleString()}
            </span>
          ) : (
            '—'
          ),
        minWidth: '120px',
      },
      {
        key: 'status',
        header: 'Status',
        sortable: true,
        filterable: true,
        rawValue: (r) => r.status,
        accessor: (r) => (
          <span className="text-gray-800">
            {r.status}
            {r.hasResponse && <span className="ml-1.5 text-emerald-600 text-xs">(reply)</span>}
          </span>
        ),
        minWidth: '100px',
      },
    ],
    [],
  );

  const hasColumnFilters = Object.values(columnFilters).some((s) => s && s.size > 0);
  const showClearAll = hasColumnFilters;

  return (
    <div className="h-full overflow-y-auto p-6 lg:p-8 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Invoices</h1>
        {importLabel && <p className="text-sm text-gray-500 mt-1">Latest import: {importLabel}</p>}
      </div>

      <div className="rounded-lg border border-gray-200/90 bg-white p-4 space-y-3">
        <p className="text-xs text-gray-500">
          Filter and sort from column headers. Facet lists are capped (large imports). Emails: 0, 1, 2, 3, or 4+ sent.
        </p>
        {showClearAll && (
          <button
            type="button"
            onClick={clearAllFilters}
            className="h-9 px-3 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-lg"
          >
            Clear all column filters
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {aggregates && (
        <div>
          <div className="inline-flex gap-1 rounded-full border border-gray-200/90 bg-white p-0.5 text-xs mb-3">
            {(
              [
                ['bucket', 'By bucket'],
                ['customer', 'By customer'],
                ['email', 'By email count'],
              ] as [BreakdownTab, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setBreakdown(k)}
                className={
                  breakdown === k
                    ? 'rounded-full bg-slate-800 text-white px-3 py-1'
                    : 'px-3 py-1 text-gray-600 hover:text-gray-900'
                }
              >
                {label}
              </button>
            ))}
          </div>
          <div className="overflow-x-auto rounded-lg border border-gray-200/90 bg-white">
            {breakdown === 'bucket' && (
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide">
                    <th className="px-4 py-3 font-medium">Bucket</th>
                    <th className="px-4 py-3 font-medium text-right">Count</th>
                    <th className="px-4 py-3 font-medium text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {aggregates.byBucket.map((b) => (
                    <tr key={b.bucket} className="border-b border-gray-50 last:border-0">
                      <td className="px-4 py-2.5">
                        <span
                          className={'inline-block px-2 py-0.5 rounded text-xs border ' + bucketChipClass(b.bucket)}
                        >
                          {b.bucket}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-800">{b.count}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-900">
                        {formatInr(b.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {breakdown === 'customer' && (
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide">
                    <th className="px-4 py-3 font-medium">Customer</th>
                    <th className="px-4 py-3 font-medium">Code</th>
                    <th className="px-4 py-3 font-medium text-right">Count</th>
                    <th className="px-4 py-3 font-medium text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {aggregates.byCustomer.map((c) => (
                    <tr key={c.customerCode + c.customerName} className="border-b border-gray-50 last:border-0">
                      <td className="px-4 py-2.5 text-gray-900 font-medium">
                        <button
                          type="button"
                          onClick={() =>
                            setLineItemsModal({ customerCode: c.customerCode, customerName: c.customerName })
                          }
                          className="hover:underline underline-offset-2 text-left"
                        >
                          {c.customerName}
                        </button>
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs tabular-nums">
                        <button
                          type="button"
                          onClick={() => {
                            const label = `${c.customerName} (${c.customerCode})`;
                            setColumnFilters((prev) => ({
                              ...prev,
                              customerName: new Set([label]),
                            }));
                            setPage(1);
                          }}
                          className="hover:underline underline-offset-2 tabular-nums"
                        >
                          {c.customerCode}
                        </button>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-800">{c.count}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-900">
                        {formatInr(c.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {breakdown === 'email' && (
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide">
                    <th className="px-4 py-3 font-medium">Emails</th>
                    <th className="px-4 py-3 font-medium text-right">Count</th>
                    <th className="px-4 py-3 font-medium text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {aggregates.byEmailCount.map((e) => (
                    <tr key={e.emailsSent} className="border-b border-gray-50 last:border-0">
                      <td className="px-4 py-2.5 text-gray-900">
                        {e.emailsSent === '4+' ? '4+' : e.emailsSent}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-800">{e.count}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-900">
                        {formatInr(e.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {top10.length > 0 && (
        <div>
          <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-gray-500 mb-3">
            Top 10 — highest value · farthest bucket
          </h2>
          <div className="overflow-x-auto rounded-lg border border-gray-200/90 bg-white">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3 font-medium">Doc no</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Bucket</th>
                  <th className="px-4 py-3 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {top10.map((r) => (
                  <tr key={r.invoiceKey} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-2.5">
                      <Link
                        href="/bulk-email"
                        className="text-slate-800 underline-offset-2 hover:underline"
                      >
                        {r.documentNo}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-gray-800">
                      {r.customerName}
                      <span className="text-gray-500 text-xs ml-1">({r.customerCode})</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={'inline-block px-2 py-0.5 rounded text-xs border ' + bucketChipClass(r.bucket)}
                      >
                        {r.bucket}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-900">
                      {formatInr(r.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div>
        <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-gray-500 mb-3">Invoices</h2>
        {loading && rows.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-500">Loading…</div>
        ) : total === 0 && !error ? (
          <p className="text-sm text-gray-500">No line items in the latest import (or all filtered out).</p>
        ) : (
          <ServerDataTable<Row>
            rows={rows}
            total={total}
            page={page}
            pageSize={pageSize}
            onPageChange={(p) => setPage(p)}
            onPageSizeChange={(s) => {
              setPageSize(s);
              setPage(1);
            }}
            sortKey={sortField}
            sortDir={sortOrder}
            onSortChange={onInvoiceSort}
            columnFilters={columnFilters}
            onColumnFilterChange={(colKey, values) => {
              setColumnFilters((prev) => ({ ...prev, [colKey]: values }));
              setPage(1);
            }}
            filterOptions={{
              documentNo: filterOptions.documentNo,
              customerName: filterOptions.customerName,
              companyName: filterOptions.companyName,
              bucket: filterOptions.bucket,
              amount: filterOptions.amount,
              emailsSent: filterOptions.emailsSent,
              lastSent: filterOptions.lastSent,
              status: filterOptions.status,
            }}
            onClearAllFilters={clearAllFilters}
            rowKey={(r) => r.invoiceKey}
            columns={invoiceTableColumns}
            loading={loading && rows.length === 0}
            emptyMessage="No line items in the latest import (or all filtered out)."
            pageSizeOptions={[10, 25, 50, 100]}
          />
        )}
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
