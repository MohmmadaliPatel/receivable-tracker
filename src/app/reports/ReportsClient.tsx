'use client';

import { useState, useEffect, useMemo, useRef } from 'react';

interface FollowupEntry {
  followupNumber: number;
  sentAt: string;
  subject: string;
  filePath: string;
  messageId: string | null;
}

interface ResponseEntry {
  receivedAt: string;
  messageId: string;
  subject: string;
  fromEmail: string;
  fromName: string;
  htmlBody: string | null;
  body: string | null;
  filePath: string;
  hasAttachments: boolean;
}

interface ReportRecord {
  id: string;
  entityName: string;
  category: string;
  bankName: string | null;
  accountNumber: string | null;
  custId: string | null;
  emailTo: string;
  emailCc: string | null;
  remarks: string | null;
  status: string;
  sentAt: string | null;
  followupCount: number;
  followupSentAt: string | null;
  followupsJson: string | null;
  responseReceivedAt: string | null;
  responseFromName: string | null;
  responseFromEmail: string | null;
  responseHtmlBody: string | null;
  responseBody: string | null;
  responseHasAttachments: boolean;
  responsesJson: string | null;
  createdAt: string;
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  not_sent:          { label: 'Not Sent',         bg: 'bg-gray-100',   text: 'text-gray-600',  dot: 'bg-gray-400'  },
  sent:              { label: 'Sent',              bg: 'bg-blue-100',   text: 'text-blue-700',  dot: 'bg-blue-500'  },
  followup_sent:     { label: 'Follow-up Sent',      bg: 'bg-amber-100',  text: 'text-amber-700', dot: 'bg-amber-500' },
  response_received: { label: 'Response Received', bg: 'bg-green-100',  text: 'text-green-700', dot: 'bg-green-500' },
};

function fmtDt(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function stripHtml(raw: string): string {
  let s = raw.replace(/<[^>]+>/g, ' ');
  s = s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
  return s.replace(/\s+/g, ' ').trim();
}

function ResponseBodyCell({ html, text }: { html: string | null; text: string | null }) {
  const [open, setOpen] = useState(false);
  const content = html || text;
  if (!content) return <span className="text-gray-400 text-xs">—</span>;
  const preview = stripHtml(text || html || '').slice(0, 80) || '(HTML response)';
  return (
    <div>
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-blue-600 hover:underline text-left max-w-[160px] truncate block"
      >
        {preview}…
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900">Response Content</h3>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            {html ? (
              <iframe srcDoc={html} className="w-full h-96 border border-gray-200 rounded" sandbox="allow-same-origin" />
            ) : (
              <pre className="whitespace-pre-wrap text-sm text-gray-800 bg-gray-50 p-4 rounded">{text}</pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Column definition for advanced filter
interface ColDef {
  key: keyof ReportRecord | 'followupCount_range' | 'responsesCount';
  label: string;
  type: 'text' | 'select' | 'date' | 'number';
}

const FILTER_COLS: ColDef[] = [
  { key: 'entityName',    label: 'Entity Name',    type: 'text'   },
  { key: 'category',      label: 'Category',       type: 'select' },
  { key: 'bankName',      label: 'Bank / Party',   type: 'text'   },
  { key: 'emailTo',       label: 'Email To',       type: 'text'   },
  { key: 'status',        label: 'Status',         type: 'select' },
  { key: 'sentAt',        label: 'Sent After',     type: 'date'   },
  { key: 'followupCount', label: 'Follow-ups ≥',     type: 'number' },
];

interface ActiveFilter {
  id: string;
  col: string;
  value: string;
}

const ALL_CATEGORIES = [
  'Bank Balances and FDs', 'Borrowings', 'Trade Receivables',
  'Trade Payables', 'Other Receivables', 'Other Payables',
];

function ExpandedRow({ record }: { record: ReportRecord }) {
  const followups: FollowupEntry[] = useMemo(() => {
    try { return JSON.parse(record.followupsJson ?? '[]'); } catch { return []; }
  }, [record.followupsJson]);

  const responses: ResponseEntry[] = useMemo(() => {
    try { return JSON.parse(record.responsesJson ?? '[]'); } catch { return []; }
  }, [record.responsesJson]);

  return (
    <tr className="bg-blue-50/40 border-b border-gray-200">
      <td colSpan={12} className="px-6 py-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-sm">

          {/* Original email */}
          <div className="bg-white rounded-lg p-3 border border-blue-200">
            <h4 className="text-blue-700 font-semibold mb-2 text-xs uppercase tracking-wide flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> Original Confirmation
            </h4>
            <dl className="space-y-1 text-xs">
              <div className="flex gap-2"><dt className="text-gray-400 w-16 flex-shrink-0">Sent At</dt><dd className="text-gray-700">{fmtDt(record.sentAt)}</dd></div>
              <div className="flex gap-2"><dt className="text-gray-400 w-16 flex-shrink-0">To</dt><dd className="text-gray-700 break-all">{record.emailTo}</dd></div>
              {record.emailCc && <div className="flex gap-2"><dt className="text-gray-400 w-16 flex-shrink-0">CC</dt><dd className="text-gray-700 break-all">{record.emailCc}</dd></div>}
              {record.remarks && <div className="flex gap-2"><dt className="text-gray-400 w-16 flex-shrink-0">Remarks</dt><dd className="text-gray-700">{record.remarks}</dd></div>}
              {record.accountNumber && <div className="flex gap-2"><dt className="text-gray-400 w-16 flex-shrink-0">Account</dt><dd className="text-gray-700">{record.accountNumber}</dd></div>}
              {record.custId && <div className="flex gap-2"><dt className="text-gray-400 w-16 flex-shrink-0">Cust ID</dt><dd className="text-gray-700">{record.custId}</dd></div>}
            </dl>
          </div>

          {/* Follow-up history */}
          <div className="bg-white rounded-lg p-3 border border-amber-200">
            <h4 className="text-amber-700 font-semibold mb-2 text-xs uppercase tracking-wide flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" /> Follow-up History ({record.followupCount})
            </h4>
            {followups.length === 0 ? (
              <p className="text-gray-400 text-xs">No follow-ups sent.</p>
            ) : (
              <ul className="space-y-2">
                {followups.map((fu) => (
                  <li key={fu.followupNumber} className="text-xs border-l-2 border-amber-400 pl-2">
                    <div className="font-semibold text-amber-700">Follow-up #{fu.followupNumber}</div>
                    <div className="text-gray-500">{fmtDt(fu.sentAt)}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* All responses */}
          <div className="bg-white rounded-lg p-3 border border-green-200">
            <h4 className="text-green-700 font-semibold mb-2 text-xs uppercase tracking-wide flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Responses ({responses.length || (record.status === 'response_received' ? 1 : 0)})
            </h4>
            {responses.length > 0 ? (
              <ul className="space-y-3">
                {responses.map((r, i) => (
                  <li key={r.messageId ?? i} className="border-l-2 border-green-400 pl-2 text-xs">
                    <div className="font-semibold text-green-700">Response #{i + 1}</div>
                    <div className="text-gray-500">{fmtDt(r.receivedAt)}</div>
                    <div className="text-gray-600">{r.fromName || r.fromEmail}</div>
                    {(r.htmlBody || r.body) && (
                      <ResponseBodyCell html={r.htmlBody} text={r.body} />
                    )}
                  </li>
                ))}
              </ul>
            ) : record.status === 'response_received' ? (
              <div className="text-xs">
                <div className="text-gray-500">{fmtDt(record.responseReceivedAt)}</div>
                <div className="text-gray-600">{record.responseFromName} &lt;{record.responseFromEmail}&gt;</div>
                <ResponseBodyCell html={record.responseHtmlBody} text={record.responseBody} />
              </div>
            ) : (
              <p className="text-gray-400 text-xs">No response yet.</p>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

export default function ReportsClient() {
  const [records, setRecords] = useState<ReportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [globalSearch, setGlobalSearch] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [sentFrom, setSentFrom] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const nextFilterId = useRef(1);

  useEffect(() => {
    fetch('/api/reports')
      .then((r) => r.json())
      .then((d) => { setRecords(d.records ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  function addFilter() {
    setActiveFilters((f) => [...f, { id: String(nextFilterId.current++), col: 'entityName', value: '' }]);
  }

  function removeFilter(id: string) {
    setActiveFilters((f) => f.filter((x) => x.id !== id));
  }

  function updateFilter(id: string, patch: Partial<ActiveFilter>) {
    setActiveFilters((f) => f.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }

  const toggleStatus = (s: string) => {
    setSelectedStatuses((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  };

  const clearFilters = () => {
    setSelectedStatuses([]);
    setSentFrom('');
    setSentTo('');
    setGlobalSearch('');
    setActiveFilters([]);
  };

  const hasActiveFilters = selectedStatuses.length > 0 || sentFrom || sentTo || globalSearch.trim() || activeFilters.length > 0;

  const filtered = useMemo(() => {
    let r = records;

    if (selectedStatuses.length > 0) r = r.filter((x) => selectedStatuses.includes(x.status));

    if (sentFrom) {
      const from = new Date(sentFrom);
      r = r.filter((x) => x.sentAt && new Date(x.sentAt) >= from);
    }
    if (sentTo) {
      const to = new Date(sentTo + 'T23:59:59');
      r = r.filter((x) => x.sentAt && new Date(x.sentAt) <= to);
    }

    if (globalSearch.trim()) {
      const q = globalSearch.toLowerCase();
      r = r.filter((x) =>
        x.entityName.toLowerCase().includes(q) ||
        x.category.toLowerCase().includes(q) ||
        (x.bankName ?? '').toLowerCase().includes(q) ||
        x.emailTo.toLowerCase().includes(q) ||
        (x.remarks ?? '').toLowerCase().includes(q)
      );
    }

    for (const f of activeFilters) {
      if (!f.value.trim()) continue;
      const val = f.value.toLowerCase().trim();
      r = r.filter((x) => {
        const raw = (x as unknown as Record<string, unknown>)[f.col];
        if (f.col === 'sentAt') return raw && new Date(raw as string) >= new Date(f.value);
        if (f.col === 'followupCount') return (x.followupCount ?? 0) >= Number(f.value);
        return String(raw ?? '').toLowerCase().includes(val);
      });
    }

    return r;
  }, [records, selectedStatuses, sentFrom, sentTo, globalSearch, activeFilters]);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function exportFiltered() {
    const cols = [
      'Entity Name', 'Category', 'Bank / Party', 'Account Number', 'Customer ID',
      'Email To', 'Email CC', 'Remarks', 'Status',
      'Sent At', 'Follow-up Count', 'Last Follow-up At',
      'Response Received At', 'Response From', 'Response Email', 'Response',
    ];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = filtered.map((r) => {
      const responseText = r.responseBody
        ? stripHtml(r.responseBody)
        : r.responseHtmlBody
          ? stripHtml(r.responseHtmlBody)
          : '';
      return [
        r.entityName, r.category, r.bankName ?? '', r.accountNumber ?? '', r.custId ?? '',
        r.emailTo, r.emailCc ?? '', r.remarks ?? '', r.status,
        fmtDt(r.sentAt),
        r.followupCount,
        fmtDt(r.followupSentAt),
        fmtDt(r.responseReceivedAt),
        r.responseFromName || r.responseFromEmail || '',
        r.responseFromEmail ?? '',
        responseText.slice(0, 500),
      ].map(esc).join(',');
    });
    const csv = [cols.map(esc).join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const summary = useMemo(() => ({
    total: records.length,
    notSent: records.filter((r) => r.status === 'not_sent').length,
    sent: records.filter((r) => r.status === 'sent').length,
    followup: records.filter((r) => r.status === 'followup_sent').length,
    responded: records.filter((r) => r.status === 'response_received').length,
    totalFollowups: records.reduce((s, r) => s + (r.followupCount ?? 0), 0),
  }), [records]);

  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden">
      {/* Header bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-5 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-sm text-gray-500 mt-0.5">Audit confirmation tracker — complete activity log</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={exportFiltered}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export CSV {filtered.length < records.length && `(${filtered.length})`}
          </button>
          <a
            href="/api/reports?format=csv"
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition-colors"
          >
            Export All
          </a>
        </div>
      </div>

      {/* Summary cards */}
      <div className="px-6 py-4 flex gap-3 flex-shrink-0 flex-wrap bg-white border-b border-gray-200">
        {[
          { label: 'Total', value: summary.total, cls: 'border-gray-300 text-gray-700' },
          { label: 'Not Sent', value: summary.notSent, cls: 'border-gray-300 text-gray-500' },
          { label: 'Sent', value: summary.sent, cls: 'border-blue-400 text-blue-700' },
          { label: 'Follow-up', value: summary.followup, cls: 'border-amber-400 text-amber-700' },
          { label: 'Responded', value: summary.responded, cls: 'border-green-400 text-green-700' },
          { label: 'Total Follow-ups', value: summary.totalFollowups, cls: 'border-purple-400 text-purple-700' },
        ].map((c) => (
          <div key={c.label} className={`border-2 ${c.cls} bg-white rounded-xl px-4 py-2.5 min-w-[90px] text-center`}>
            <div className="text-xl font-bold">{c.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex-shrink-0">
        {/* Row 1: search + status chips + date range + advanced */}
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Search entity, category, bank, email, remarks…"
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              className="flex-1 min-w-[200px] px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-400"
            />
            <button
              onClick={() => setShowFilterPanel((p) => !p)}
              className={`flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm font-medium transition-colors ${
                activeFilters.length > 0
                  ? 'border-blue-400 bg-blue-50 text-blue-700'
                  : 'border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
              </svg>
              More Filters
              {activeFilters.length > 0 && (
                <span className="bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {activeFilters.length}
                </span>
              )}
            </button>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1"
              >
                Clear All
              </button>
            )}
          </div>

          {/* Status multi-select chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-gray-500 font-medium mr-1">Status:</span>
            {(['not_sent', 'sent', 'followup_sent', 'response_received'] as const).map((s) => {
              const cfg = STATUS_CONFIG[s];
              const active = selectedStatuses.includes(s);
              return (
                <button
                  key={s}
                  onClick={() => toggleStatus(s)}
                  className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                    active
                      ? `${cfg.bg} ${cfg.text} border-current`
                      : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${active ? cfg.dot : 'bg-gray-300'}`} />
                  {cfg.label}
                  {active && <span className="ml-0.5">&times;</span>}
                </button>
              );
            })}
          </div>

          {/* Date range */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-500 font-medium">Sent between:</span>
            <input
              type="date"
              value={sentFrom}
              onChange={(e) => setSentFrom(e.target.value)}
              className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-900 bg-white focus:outline-none focus:border-blue-400"
            />
            <span className="text-xs text-gray-400">to</span>
            <input
              type="date"
              value={sentTo}
              onChange={(e) => setSentTo(e.target.value)}
              className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-900 bg-white focus:outline-none focus:border-blue-400"
            />
          </div>
        </div>

        {showFilterPanel && (
          <div className="border border-gray-200 rounded-lg p-3 bg-gray-50 space-y-2">
            {activeFilters.map((f) => {
              const colDef = FILTER_COLS.find((c) => c.key === f.col) ?? FILTER_COLS[0];
              return (
                <div key={f.id} className="flex items-center gap-2">
                  <select
                    value={f.col}
                    onChange={(e) => updateFilter(f.id, { col: e.target.value, value: '' })}
                    className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-900 bg-white focus:outline-none"
                  >
                    {FILTER_COLS.map((c) => (
                      <option key={String(c.key)} value={String(c.key)}>{c.label}</option>
                    ))}
                  </select>

                  {colDef.type === 'select' && f.col === 'status' ? (
                    <select
                      value={f.value}
                      onChange={(e) => updateFilter(f.id, { value: e.target.value })}
                      className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-900 bg-white focus:outline-none"
                    >
                      <option value="">Any</option>
                      <option value="not_sent">Not Sent</option>
                      <option value="sent">Sent</option>
                      <option value="followup_sent">Follow-up Sent</option>
                      <option value="response_received">Response Received</option>
                    </select>
                  ) : colDef.type === 'select' && f.col === 'category' ? (
                    <select
                      value={f.value}
                      onChange={(e) => updateFilter(f.id, { value: e.target.value })}
                      className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-900 bg-white focus:outline-none"
                    >
                      <option value="">Any</option>
                      {ALL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  ) : (
                    <input
                      type={colDef.type === 'date' ? 'date' : colDef.type === 'number' ? 'number' : 'text'}
                      placeholder={`Filter by ${colDef.label}…`}
                      value={f.value}
                      onChange={(e) => updateFilter(f.id, { value: e.target.value })}
                      className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-900 bg-white focus:outline-none"
                    />
                  )}

                  <button
                    onClick={() => removeFilter(f.id)}
                    className="text-gray-400 hover:text-red-500 transition-colors text-lg leading-none px-1"
                  >
                    &times;
                  </button>
                </div>
              );
            })}
            <button
              onClick={addFilter}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
            >
              + Add filter
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-6 py-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm min-w-[1200px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-left">
                <th className="px-3 py-3 w-8" />
                <th className="px-3 py-3 text-gray-600 font-semibold">Entity</th>
                <th className="px-3 py-3 text-gray-600 font-semibold">Category</th>
                <th className="px-3 py-3 text-gray-600 font-semibold">Bank / Party</th>
                <th className="px-3 py-3 text-gray-600 font-semibold">Email To</th>
                <th className="px-3 py-3 text-gray-600 font-semibold">Status</th>
                <th className="px-3 py-3 text-gray-600 font-semibold">Sent At</th>
                <th className="px-3 py-3 text-gray-600 font-semibold">Follow-ups</th>
                <th className="px-3 py-3 text-gray-600 font-semibold">Response At</th>
                <th className="px-3 py-3 text-gray-600 font-semibold">Response From</th>
                <th className="px-3 py-3 text-gray-600 font-semibold">Response Email</th>
                <th className="px-3 py-3 text-gray-600 font-semibold">Response</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={12} className="text-center text-gray-400 py-16">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={12} className="text-center text-gray-400 py-16">No records match the current filters.</td></tr>
              ) : (
                filtered.map((record) => {
                  const isExpanded = expanded.has(record.id);
                  const st = STATUS_CONFIG[record.status] ?? STATUS_CONFIG.not_sent;
                  return [
                    <tr
                      key={record.id}
                      className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors ${isExpanded ? 'bg-blue-50/30' : ''}`}
                      onClick={() => toggleExpand(record.id)}
                    >
                      <td className="px-3 py-3 text-gray-400 text-center text-xs">{isExpanded ? '▾' : '▸'}</td>
                      <td className="px-3 py-3 text-gray-900 font-medium">{record.entityName}</td>
                      <td className="px-3 py-3 text-gray-600 text-xs">{record.category}</td>
                      <td className="px-3 py-3 text-gray-600">{record.bankName ?? '—'}</td>
                      <td className="px-3 py-3 text-gray-600 max-w-[160px] truncate text-xs">{record.emailTo}</td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full ${st.bg} ${st.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                          {st.label}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-gray-500 text-xs whitespace-nowrap">{fmtDt(record.sentAt)}</td>
                      <td className="px-3 py-3">
                        {(record.followupCount ?? 0) > 0 ? (
                          <span className="text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                            {record.followupCount}×
                          </span>
                        ) : <span className="text-gray-400 text-xs">—</span>}
                      </td>
                      <td className="px-3 py-3 text-gray-500 text-xs whitespace-nowrap">{fmtDt(record.responseReceivedAt)}</td>
                      <td className="px-3 py-3 text-gray-600 text-xs">{record.responseFromName || record.responseFromEmail || '—'}</td>
                      <td className="px-3 py-3 text-gray-500 text-xs max-w-[160px] truncate">{record.responseFromEmail || '—'}</td>
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <ResponseBodyCell html={record.responseHtmlBody} text={record.responseBody} />
                      </td>
                    </tr>,
                    isExpanded && <ExpandedRow key={`${record.id}-exp`} record={record} />,
                  ];
                })
              )}
            </tbody>
          </table>
        </div>

        <p className="text-gray-400 text-xs mt-3 text-right">
          Showing {filtered.length} of {records.length} records
        </p>
      </div>
    </div>
  );
}
