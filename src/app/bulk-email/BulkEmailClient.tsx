'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import AgingSendModal from '@/components/AgingSendModal';
import AttachmentsModal from '@/components/AttachmentsModal';
import BulkPreviewModal, { type GroupRowWithStatus } from '@/components/BulkPreviewModal';
import { ServerDataTable, type SortDir } from '@/components/ui/ServerDataTable';
import type { Column } from '@/components/ui/DataTable';
import type { GroupSortField } from '@/lib/aging-groups-list';

type StatusFilter = 'all' | 'not_sent' | 'no_response' | 'followup' | 'response';

function groupStatusLabel(g: GroupRowWithStatus): StatusFilter {
  if (g.hasResponse) return 'response';
  if (g.totalEmailsCount === 0) return 'not_sent';
  if (g.followupCount >= 1) return 'followup';
  return 'no_response';
}

function statusBadgeText(g: GroupRowWithStatus): string {
  if (g.hasResponse) return 'Response received';
  if (g.totalEmailsCount === 0) return 'Not sent';
  if (g.followupCount >= 1) return `Follow-up #${g.followupCount}`;
  return 'No response';
}

function statusBadgeClass(g: GroupRowWithStatus): string {
  if (g.hasResponse) return 'bg-emerald-100 text-emerald-800';
  if (g.totalEmailsCount === 0) return 'bg-gray-100 text-gray-700';
  if (g.followupCount >= 1) return 'bg-amber-100 text-amber-900';
  return 'bg-orange-100 text-orange-900';
}

export default function BulkEmailClient() {
  const [importId, setImportId] = useState<string | null>(null);
  const [importName, setImportName] = useState<string | null>(null);
  const [lineCount, setLineCount] = useState(0);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const grouping = 'code' as const;
  const [groups, setGroups] = useState<GroupRowWithStatus[]>([]);
  const [total, setTotal] = useState(0);
  const [filterOptions, setFilterOptions] = useState<{
    companyName: string[];
    customerName: string[];
    customerCode: string[];
    emailTo: string[];
    status: string[];
  }>({ companyName: [], customerName: [], customerCode: [], emailTo: [], status: [] });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [sortKey, setSortKey] = useState<GroupSortField | null>('customerName');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [columnFilters, setColumnFilters] = useState<Record<string, Set<string>>>({});
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [checkBusy, setCheckBusy] = useState(false);

  const [sendOpen, setSendOpen] = useState<{
    ids: string[];
    mode: 'send' | 'followup';
  } | null>(null);

  const [attOpen, setAttOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState<'send' | 'followup' | null>(null);

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const res = await fetch('/api/aging/line-items');
      const data = await res.json();
      if (data.import) {
        setImportId(data.import.id);
        setImportName(data.import.fileName);
        setLineCount(data.lineCount ?? 0);
      } else {
        setImportId(null);
        setImportName(null);
        setLineCount(0);
      }
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  const loadGroups = useCallback(async () => {
    if (!importId) {
      setGroups([]);
      setTotal(0);
      return;
    }
    setGroupsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('importId', importId);
      params.set('grouping', grouping);
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      if (sortKey) {
        params.set('sortBy', sortKey);
        params.set('sortOrder', sortDir);
      }
      const cn = columnFilters.companyName;
      if (cn && cn.size > 0) {
        for (const n of cn) {
          params.append('companyNames', n);
        }
      }
      const cus = columnFilters.customerName;
      if (cus && cus.size > 0) {
        for (const n of cus) params.append('customerName', n);
      }
      const codes = columnFilters.customerCode;
      if (codes && codes.size > 0) {
        for (const c of codes) params.append('customerCode', c);
      }
      const em = columnFilters.emailTo;
      if (em && em.size > 0) {
        for (const e of em) params.append('emailTo', e);
      }
      const st = columnFilters.status;
      if (st && st.size > 0) {
        for (const s of st) params.append('status', s);
      }

      const res = await fetch(`/api/aging/groups?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        setGroups([]);
        setTotal(0);
        return;
      }
      setGroups(data.groups || []);
      setTotal(typeof data.total === 'number' ? data.total : 0);
      if (data.filterOptions) {
        const fo = data.filterOptions;
        setFilterOptions({
          companyName: fo.companyName || [],
          customerName: fo.customerName || [],
          customerCode: fo.customerCode || [],
          emailTo: fo.emailTo || [],
          status: fo.status || [],
        });
      } else {
        setFilterOptions({
          companyName: [],
          customerName: [],
          customerCode: [],
          emailTo: [],
          status: [],
        });
      }
    } finally {
      setGroupsLoading(false);
    }
  }, [importId, page, pageSize, sortKey, sortDir, columnFilters, grouping]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  useEffect(() => {
    setPage(1);
  }, [importId]);

  const onCheckReplies = async () => {
    setCheckBusy(true);
    try {
      const res = await fetch('/api/aging/check-replies', { method: 'POST' });
      const d = await res.json();
      if (res.ok) {
        setMessage(`Aging: ${d.repliesFound ?? 0} new repl(ies) matched`);
        loadGroups();
      }
    } finally {
      setCheckBusy(false);
    }
  };

  const onSortChange = (colKey: string) => {
    const k = colKey as GroupSortField;
    if (sortKey === k) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(k);
      setSortDir('asc');
    }
    setPage(1);
  };

  const onColumnFilterChange = (colKey: string, values: Set<string>) => {
    setColumnFilters((prev) => ({ ...prev, [colKey]: values }));
    setPage(1);
  };

  const onClearAllFilters = () => {
    setColumnFilters({});
  };

  const hasActiveColumnFilters = Object.values(columnFilters).some((s) => s && s.size > 0);
  const filterBarActive = hasActiveColumnFilters;

  const tableColumns = useMemo((): Column<GroupRowWithStatus>[] => {
    return [
      {
        key: 'customerName',
        header: 'Customer',
        sortable: true,
        filterable: true,
        rawValue: (g) => g.customerName,
        accessor: (g) => <span className="font-medium text-gray-900">{g.customerName}</span>,
        minWidth: '140px',
      },
      {
        key: 'customerCode',
        header: 'Code',
        sortable: true,
        filterable: true,
        rawValue: (g) => g.customerCode,
        accessor: (g) => g.customerCode,
        minWidth: '100px',
      },
      {
        key: 'companyName',
        header: 'Company',
        sortable: true,
        filterable: true,
        rawValue: (g) => (g.companyName || '').trim(),
        accessor: (g) => <span className="text-gray-600">{g.companyName}</span>,
        minWidth: '120px',
      },
      {
        key: 'lineCount',
        header: 'Lines',
        sortable: true,
        align: 'right',
        rawValue: (g) => g.lineCount,
        accessor: (g) => g.lineCount,
        minWidth: '72px',
      },
      {
        key: 'emailTo',
        header: 'Email',
        sortable: false,
        filterable: true,
        rawValue: (g) => g.emailTo || '',
        accessor: (g) => (
          <span className="break-all">
            {g.emailTo || '—'}
            {g.emailConflict && (
              <span className="ml-1 text-amber-700 text-xs">(emails differ)</span>
            )}
          </span>
        ),
        minWidth: '180px',
      },
      {
        key: 'totalEmailsCount',
        header: 'Emails sent',
        sortable: true,
        align: 'right',
        rawValue: (g) => g.totalEmailsCount,
        accessor: (g) => g.totalEmailsCount,
        minWidth: '88px',
      },
      {
        key: 'lastSentAt',
        header: 'Last sent',
        sortable: true,
        rawValue: (g) => (g.lastSentAt ? g.lastSentAt : ''),
        accessor: (g) =>
          g.lastSentAt
            ? new Date(g.lastSentAt).toLocaleString(undefined, {
                dateStyle: 'short',
                timeStyle: 'short',
              })
            : '—',
        minWidth: '120px',
      },
      {
        key: 'status',
        header: 'Status',
        sortable: false,
        filterable: true,
        rawValue: (g) => groupStatusLabel(g),
        accessor: (g) => (
          <span
            className={`inline-block px-2 py-0.5 rounded-md text-xs font-medium ${statusBadgeClass(g)}`}
          >
            {statusBadgeText(g)}
          </span>
        ),
        minWidth: '130px',
      },
      {
        key: 'actions',
        header: 'Actions',
        sortable: false,
        align: 'right',
        accessor: (g) => (
          <div className="space-x-2 whitespace-nowrap">
            <button
              type="button"
              className="text-blue-600 hover:underline"
              onClick={() => setSendOpen({ ids: g.lineItemIds, mode: 'send' })}
            >
              Send
            </button>
            <button
              type="button"
              className="text-amber-800 hover:underline"
              onClick={() => setSendOpen({ ids: g.lineItemIds, mode: 'followup' })}
            >
              Follow-up
            </button>
          </div>
        ),
        minWidth: '140px',
      },
    ];
  }, []);

  const serverFilterOptions = useMemo(
    () => ({
      companyName: filterOptions.companyName,
      customerName: filterOptions.customerName,
      customerCode: filterOptions.customerCode,
      emailTo: filterOptions.emailTo,
      status: filterOptions.status,
    }),
    [filterOptions]
  );

  return (
    <div className="flex flex-col min-h-screen">
      <div className="px-6 py-4 border-b border-gray-200 bg-white">
        <h1 className="text-2xl font-bold text-gray-900">Receivables bulk email</h1>
      </div>

      <div className="px-6 py-4 space-y-4 flex-1 overflow-auto">
        {message && (
          <div className="text-sm text-blue-800 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
            {message}
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <button
            type="button"
            onClick={() => setAttOpen(true)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white hover:bg-gray-50"
          >
            Attachments
          </button>

          {filterBarActive && (
            <button
              type="button"
              onClick={onClearAllFilters}
              className="h-9 px-3 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-lg"
            >
              Clear column filters
            </button>
          )}

          <div className="ml-auto flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onCheckReplies}
              disabled={checkBusy}
              className="px-3 py-2 text-sm border rounded-lg hover:bg-gray-50"
            >
              {checkBusy ? '…' : 'Check replies'}
            </button>
            <button
              type="button"
              onClick={() => {
                if (!importId) return;
                setBulkOpen('send');
              }}
              disabled={!importId}
              className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-50"
            >
              Bulk send
            </button>
            <button
              type="button"
              onClick={() => {
                if (!importId) return;
                setBulkOpen('followup');
              }}
              disabled={!importId}
              className="px-3 py-2 text-sm border border-amber-300 text-amber-900 rounded-lg bg-amber-50"
            >
              Bulk follow-up
            </button>
          </div>
        </div>

        <div className="text-sm text-gray-600">
          {summaryLoading ? (
            'Loading import…'
          ) : importId ? (
            <>
              <strong>Current file:</strong> {importName} — {lineCount.toLocaleString()} line item(s) (
              {total.toLocaleString()} group{total === 1 ? '' : 's'} in view, by customer code)
            </>
          ) : (
            'No ageing import loaded for your account.'
          )}
        </div>

        <p className="text-xs text-gray-500">Filter and sort from column headers. Status values: not_sent, no_response, followup, response.</p>

        {importId && (
          <ServerDataTable<GroupRowWithStatus>
            rows={groups}
            total={total}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(s) => {
              setPageSize(s);
              setPage(1);
            }}
            sortKey={sortKey}
            sortDir={sortDir}
            onSortChange={onSortChange}
            columnFilters={columnFilters}
            onColumnFilterChange={onColumnFilterChange}
            filterOptions={serverFilterOptions}
            onClearAllFilters={onClearAllFilters}
            rowKey={(g) => g.groupKey}
            columns={tableColumns}
            loading={groupsLoading}
            emptyMessage="No groups (excluded, filtered, or no data)."
            pageSizeOptions={[10, 15, 25, 50, 100]}
          />
        )}

        {!importId && !summaryLoading && (
          <p className="text-sm text-gray-500">No ageing import loaded for your account.</p>
        )}
      </div>

      {sendOpen && (
        <AgingSendModal
          lineItemIds={sendOpen.ids}
          mode={sendOpen.mode}
          importId={importId}
          grouping={grouping}
          onClose={() => setSendOpen(null)}
          onComplete={() => {
            setSendOpen(null);
            loadGroups();
            setMessage('Sent.');
          }}
        />
      )}

      <AttachmentsModal open={attOpen} onClose={() => setAttOpen(false)} importId={importId} />

      {bulkOpen && importId && (
        <BulkPreviewModal
          key={`${importId}-${bulkOpen}`}
          mode={bulkOpen}
          importId={importId}
          grouping={grouping}
          companyCode={undefined}
          initialCompanyNames={Array.from(columnFilters.companyName ?? [])}
          onClose={() => setBulkOpen(null)}
          onComplete={() => {
            setBulkOpen(null);
            loadGroups();
          }}
        />
      )}
    </div>
  );
}
