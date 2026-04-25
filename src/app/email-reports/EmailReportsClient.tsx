'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type Tab = 'sends' | 'confirmations';

type Summary = {
  receivables: {
    importName: string | null;
    lineCount: number;
    missingRecipient: number;
    withRecipient: number;
    byChaseStatus: Record<string, number>;
  };
  sendLog: { sent: number; failed: number; total: number };
  confirmations: { total: number; byStatus: Record<string, number> };
};

type SendRow = {
  id: string;
  to: string;
  subject: string | null;
  status: string;
  errorMessage: string | null;
  sentAt: string;
  emailConfig: { name: string; fromEmail: string } | null;
};

type ConfRow = {
  id: string;
  entityName: string;
  category: string;
  emailTo: string;
  status: string;
  sentAt: string | null;
  responseReceivedAt: string | null;
  followupCount: number;
  bankName: string | null;
};

const CHASE_STATUS_ORDER = ['outstanding', 'cleared', 'responded', 'no_chase'] as const;

const CHASE_STATUS_LABEL: Record<string, string> = {
  outstanding: 'Outstanding',
  cleared: 'Cleared',
  responded: 'Responded',
  no_chase: 'Not contacted',
};

function formatChaseStatusLabel(key: string): string {
  if (CHASE_STATUS_LABEL[key]) {
    return CHASE_STATUS_LABEL[key]!;
  }
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function chaseStatusEntries(byChaseStatus: Record<string, number>): { key: string; count: number; label: string }[] {
  const keys = Object.keys(byChaseStatus);
  keys.sort((a, b) => {
    const ia = CHASE_STATUS_ORDER.indexOf(a as (typeof CHASE_STATUS_ORDER)[number]);
    const ib = CHASE_STATUS_ORDER.indexOf(b as (typeof CHASE_STATUS_ORDER)[number]);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });
  return keys.map((key) => ({
    key,
    count: byChaseStatus[key] ?? 0,
    label: formatChaseStatusLabel(key),
  }));
}

async function downloadCsv(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    return;
  }
  const blob = await res.blob();
  const name =
    res.headers.get('Content-Disposition')?.match(/filename="?([^";]+)"?/)?.[1] || 'report.csv';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function EmailReportsClient() {
  const [tab, setTab] = useState<Tab>('sends');
  const [summary, setSummary] = useState<Summary | null>(null);

  const [sendLoading, setSendLoading] = useState(false);
  const [sendRows, setSendRows] = useState<SendRow[]>([]);
  const [sendTotal, setSendTotal] = useState(0);
  const [sendPage, setSendPage] = useState(1);
  const [sendPageSize] = useState(25);
  const [sendQ, setSendQ] = useState('');
  const [sendStatus, setSendStatus] = useState('');
  const [sendDateFrom, setSendDateFrom] = useState('');
  const [sendDateTo, setSendDateTo] = useState('');

  const [confLoading, setConfLoading] = useState(false);
  const [confRows, setConfRows] = useState<ConfRow[]>([]);
  const [confTotal, setConfTotal] = useState(0);
  const [confPage, setConfPage] = useState(1);
  const [confPageSize] = useState(25);
  const [confQ, setConfQ] = useState('');
  const [confStatus, setConfStatus] = useState('');
  const [confCategory, setConfCategory] = useState('');
  const [confDateFrom, setConfDateFrom] = useState('');
  const [confDateTo, setConfDateTo] = useState('');
  const [confDateOn, setConfDateOn] = useState<'created' | 'sent'>('created');
  const [confCategories, setConfCategories] = useState<string[]>([]);

  const loadSummary = useCallback(async () => {
    try {
      const res = await fetch('/api/email-reports/summary');
      if (res.ok) {
        const d = await res.json();
        setSummary(d);
      }
    } catch {
      setSummary(null);
    }
  }, []);

  const loadSendLog = useCallback(async () => {
    setSendLoading(true);
    try {
      const s = new URLSearchParams();
      s.set('page', String(sendPage));
      s.set('pageSize', String(sendPageSize));
      if (sendQ.trim()) {
        s.set('q', sendQ.trim());
      }
      if (sendStatus) {
        s.set('status', sendStatus);
      }
      if (sendDateFrom) {
        s.set('dateFrom', sendDateFrom);
      }
      if (sendDateTo) {
        s.set('dateTo', sendDateTo);
      }
      const res = await fetch(`/api/email-reports/graph-emails?${s.toString()}`);
      const d = await res.json();
      if (res.ok) {
        setSendRows(d.rows || []);
        setSendTotal(d.total ?? 0);
      }
    } finally {
      setSendLoading(false);
    }
  }, [sendPage, sendPageSize, sendQ, sendStatus, sendDateFrom, sendDateTo]);

  const loadConf = useCallback(async () => {
    setConfLoading(true);
    try {
      const s = new URLSearchParams();
      s.set('page', String(confPage));
      s.set('pageSize', String(confPageSize));
      if (confQ.trim()) {
        s.set('q', confQ.trim());
      }
      if (confStatus) {
        s.set('status', confStatus);
      }
      if (confCategory) {
        s.set('category', confCategory);
      }
      if (confDateFrom) {
        s.set('dateFrom', confDateFrom);
      }
      if (confDateTo) {
        s.set('dateTo', confDateTo);
      }
      s.set('dateOn', confDateOn);
      const res = await fetch(`/api/email-reports/confirmations?${s.toString()}`);
      const d = await res.json();
      if (res.ok) {
        setConfRows(d.rows || []);
        setConfTotal(d.total ?? 0);
        if (d.filterOptions?.categories) {
          setConfCategories(d.filterOptions.categories);
        }
      }
    } finally {
      setConfLoading(false);
    }
  }, [confPage, confPageSize, confQ, confStatus, confCategory, confDateFrom, confDateTo, confDateOn]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    if (tab === 'sends') {
      loadSendLog();
    }
  }, [tab, loadSendLog]);

  useEffect(() => {
    if (tab === 'confirmations') {
      loadConf();
    }
  }, [tab, loadConf]);

  const confirmationStatusEntries = useMemo(() => {
    if (!summary?.confirmations?.byStatus) {
      return [];
    }
    return Object.entries(summary.confirmations.byStatus).sort((a, b) => a[0].localeCompare(b[0]));
  }, [summary]);

  return (
    <div className="p-6 lg:p-8 max-w-[1920px] mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Email reports</h1>
        <p className="text-gray-600 mt-1 text-sm max-w-3xl">
          Outbound send history and confirmation letters. Key figures below use the latest ageing import. Missing
          recipient counts use the same rules as the Customer emails directory plus the sheet, then a sheet-only
          fallback.
        </p>
      </div>

      {summary && (
        <div className="space-y-3 mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Latest ageing file</p>
              <p className="text-2xl font-semibold text-gray-900 tabular-nums mt-1">{summary.receivables.lineCount}</p>
              <p className="text-xs text-gray-500 mt-0.5 truncate" title={summary.receivables.importName || ''}>
                {summary.receivables.importName || '—'}
              </p>
            </div>
            <div className="rounded-lg border border-amber-200/90 bg-amber-50/60 p-4 shadow-sm">
              <p className="text-xs font-medium text-amber-900/80 uppercase tracking-wide">Missing recipient</p>
              <p className="text-2xl font-semibold text-amber-950 tabular-nums mt-1">
                {summary.receivables.missingRecipient}
              </p>
              <p className="text-xs text-amber-900/60 mt-0.5">No directory or sheet address</p>
            </div>
            {chaseStatusEntries(summary.receivables.byChaseStatus).map(({ key, count, label }) => (
              <div
                key={key}
                className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
              >
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
                <p className="text-2xl font-semibold text-gray-900 tabular-nums mt-1">{count}</p>
                <p className="text-xs text-gray-500 mt-0.5">invoices (chase status)</p>
              </div>
            ))}
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Sends (logged)</p>
              <p className="text-2xl font-semibold text-gray-900 mt-1 tabular-nums">
                {summary.sendLog.sent}
                <span className="text-gray-400 font-normal mx-1">/</span>
                <span className="text-red-600">{summary.sendLog.failed}</span>
              </p>
              <p className="text-xs text-gray-500 mt-0.5">delivered vs failed (send-time)</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm col-span-1 sm:col-span-2">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Confirmation letters by status</p>
              <p className="text-sm text-gray-800 mt-2 leading-relaxed">
                {confirmationStatusEntries.length > 0
                  ? confirmationStatusEntries.map(([k, v]) => `${k}: ${v}`).join(' · ')
                  : '—'}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="inline-flex gap-1 rounded-full border border-gray-200 bg-white p-0.5 text-sm mb-4">
        {(
          [
            ['sends', 'Send log'],
            ['confirmations', 'Confirmations'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={
              tab === id
                ? 'rounded-full bg-slate-800 text-white px-4 py-2 font-medium'
                : 'px-4 py-2 text-gray-600 hover:text-gray-900 rounded-full'
            }
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'sends' && (
        <div className="space-y-3">
          <div className="flex flex-col lg:flex-row flex-wrap gap-2 lg:items-end">
            <input
              type="search"
              placeholder="Search to, subject, error…"
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm min-w-[200px] flex-1 max-w-md text-gray-900 bg-white"
              value={sendQ}
              onChange={(e) => setSendQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadSendLog()}
            />
            <select
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900 bg-white"
              value={sendStatus}
              onChange={(e) => {
                setSendStatus(e.target.value);
                setSendPage(1);
              }}
            >
              <option value="">All statuses</option>
              <option value="sent">Sent</option>
              <option value="failed">Failed</option>
              <option value="pending">Pending</option>
            </select>
            <input
              type="date"
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900 bg-white"
              value={sendDateFrom}
              onChange={(e) => setSendDateFrom(e.target.value)}
            />
            <input
              type="date"
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900 bg-white"
              value={sendDateTo}
              onChange={(e) => setSendDateTo(e.target.value)}
            />
            <button
              type="button"
              onClick={() => {
                setSendPage(1);
                loadSendLog();
              }}
              className="rounded-lg bg-slate-800 text-white px-3 py-1.5 text-sm font-medium hover:bg-slate-900"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={() => {
                const s = new URLSearchParams();
                s.set('format', 'csv');
                if (sendQ.trim()) {
                  s.set('q', sendQ.trim());
                }
                if (sendStatus) {
                  s.set('status', sendStatus);
                }
                if (sendDateFrom) {
                  s.set('dateFrom', sendDateFrom);
                }
                if (sendDateTo) {
                  s.set('dateTo', sendDateTo);
                }
                downloadCsv(`/api/email-reports/graph-emails?${s.toString()}`);
              }}
              className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-800 shadow-sm hover:bg-gray-50"
            >
              Export CSV
            </button>
          </div>
          <div className="border border-gray-200 rounded-lg overflow-x-auto bg-white shadow-sm">
            {sendLoading ? (
              <p className="p-6 text-gray-500">Loading…</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-gray-600 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-3 py-2.5 font-medium">To</th>
                    <th className="px-3 py-2.5 font-medium">Subject</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                    <th className="px-3 py-2.5 font-medium">Error</th>
                    <th className="px-3 py-2.5 font-medium">Sending account</th>
                    <th className="px-3 py-2.5 font-medium">Sent</th>
                  </tr>
                </thead>
                <tbody>
                  {sendRows.map((r) => (
                    <tr key={r.id} className="border-t border-gray-100">
                      <td className="px-3 py-2.5 text-xs break-all max-w-xs text-gray-800">{r.to}</td>
                      <td className="px-3 py-2.5 text-gray-800">{r.subject || '—'}</td>
                      <td className="px-3 py-2.5">
                        <span
                          className={
                            r.status === 'failed'
                              ? 'text-red-600 font-medium'
                              : r.status === 'sent'
                                ? 'text-emerald-700'
                                : 'text-amber-700'
                          }
                        >
                          {r.status}
                        </span>
                      </td>
                      <td
                        className="px-3 py-2.5 text-xs text-red-600 max-w-md truncate"
                        title={r.errorMessage || ''}
                      >
                        {r.errorMessage || '—'}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-600">
                        {r.emailConfig?.name || '—'}
                        {r.emailConfig && <span className="block text-gray-400">{r.emailConfig.fromEmail}</span>}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-700 whitespace-nowrap">
                        {new Date(r.sentAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {sendTotal > 0 && (
              <div className="flex items-center justify-between px-3 py-2 border-t border-gray-200 text-xs text-gray-600">
                <span>
                  Page {sendPage} — {sendRows.length} of {sendTotal}
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    disabled={sendPage <= 1}
                    className="px-2 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
                    onClick={() => setSendPage((p) => Math.max(1, p - 1))}
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    disabled={sendPage * sendPageSize >= sendTotal}
                    className="px-2 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
                    onClick={() => setSendPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'confirmations' && (
        <div className="space-y-3">
          <div className="flex flex-col lg:flex-row flex-wrap gap-2">
            <input
              type="search"
              placeholder="Search entity, category, email…"
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[200px] text-gray-900 bg-white"
              value={confQ}
              onChange={(e) => setConfQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadConf()}
            />
            <select
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900 bg-white"
              value={confStatus}
              onChange={(e) => {
                setConfStatus(e.target.value);
                setConfPage(1);
              }}
            >
              <option value="">All statuses</option>
              <option value="not_sent">not_sent</option>
              <option value="sent">sent</option>
              <option value="followup_sent">followup_sent</option>
              <option value="response_received">response_received</option>
            </select>
            <select
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm min-w-[180px] text-gray-900 bg-white"
              value={confCategory}
              onChange={(e) => {
                setConfCategory(e.target.value);
                setConfPage(1);
              }}
            >
              <option value="">All categories</option>
              {confCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900 bg-white"
              value={confDateOn}
              onChange={(e) => setConfDateOn(e.target.value as 'created' | 'sent')}
            >
              <option value="created">Filter date on: created</option>
              <option value="sent">Filter date on: sent</option>
            </select>
            <input
              type="date"
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900 bg-white"
              value={confDateFrom}
              onChange={(e) => setConfDateFrom(e.target.value)}
            />
            <input
              type="date"
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900 bg-white"
              value={confDateTo}
              onChange={(e) => setConfDateTo(e.target.value)}
            />
            <button
              type="button"
              onClick={() => {
                setConfPage(1);
                loadConf();
              }}
              className="rounded-lg bg-slate-800 text-white px-3 py-1.5 text-sm font-medium hover:bg-slate-900"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={() => {
                const s = new URLSearchParams();
                s.set('format', 'csv');
                if (confQ.trim()) {
                  s.set('q', confQ.trim());
                }
                if (confStatus) {
                  s.set('status', confStatus);
                }
                if (confCategory) {
                  s.set('category', confCategory);
                }
                s.set('dateOn', confDateOn);
                if (confDateFrom) {
                  s.set('dateFrom', confDateFrom);
                }
                if (confDateTo) {
                  s.set('dateTo', confDateTo);
                }
                downloadCsv(`/api/email-reports/confirmations?${s.toString()}`);
              }}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-800 shadow-sm hover:bg-gray-50"
            >
              Export CSV
            </button>
          </div>
          <div className="border border-gray-200 rounded-lg overflow-x-auto bg-white shadow-sm">
            {confLoading ? (
              <p className="p-6 text-gray-500">Loading…</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-gray-600 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-3 py-2.5 font-medium">Entity</th>
                    <th className="px-3 py-2.5 font-medium">Category</th>
                    <th className="px-3 py-2.5 font-medium">Email To</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                    <th className="px-3 py-2.5 font-medium">Sent</th>
                    <th className="px-3 py-2.5 font-medium">Response</th>
                    <th className="px-3 py-2.5 font-medium">Follow-ups</th>
                  </tr>
                </thead>
                <tbody>
                  {confRows.map((r) => (
                    <tr key={r.id} className="border-t border-gray-100">
                      <td className="px-3 py-2.5 font-medium text-gray-900">{r.entityName}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-600">{r.category}</td>
                      <td className="px-3 py-2.5 text-xs break-all max-w-xs text-gray-800">{r.emailTo}</td>
                      <td className="px-3 py-2.5">
                        <span className="rounded bg-gray-100 text-gray-800 px-2 py-0.5 text-xs">{r.status}</span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-700 whitespace-nowrap">
                        {r.sentAt ? new Date(r.sentAt).toLocaleString() : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-700">
                        {r.responseReceivedAt
                          ? new Date(r.responseReceivedAt).toLocaleString()
                          : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-center text-gray-800">{r.followupCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {confTotal > 0 && (
              <div className="flex items-center justify-between px-3 py-2 border-t border-gray-200 text-xs text-gray-600">
                <span>
                  Page {confPage} — {confRows.length} of {confTotal}
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    disabled={confPage <= 1}
                    className="px-2 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
                    onClick={() => setConfPage((p) => Math.max(1, p - 1))}
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    disabled={confPage * confPageSize >= confTotal}
                    className="px-2 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
                    onClick={() => setConfPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
