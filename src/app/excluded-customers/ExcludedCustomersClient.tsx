'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { ServerDataTable, type SortDir } from '@/components/ui/ServerDataTable';
import type { Column } from '@/components/ui/DataTable';

type KeyT = 'customer_name' | 'customer_code';

interface ExcludedEntry {
  id: string;
  keyType: KeyT;
  keyValue: string;
  reason: string | null;
  createdAt: string;
  updatedAt: string;
}

type SuggestRow = {
  customerName: string;
  customerCode: string;
  companyName: string;
};

type FormState = { keyValue: string; reason: string };

function labelKeyType(t: KeyT): string {
  return t === 'customer_name' ? 'Customer name' : 'Customer code';
}

function parseCsvValues(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^"(.*)"$/, '$1').trim())
    .filter((line, i) => {
      if (!line) return false;
      // skip header row if it's a known column name
      if (i === 0 && ['customer_name', 'customer_code', 'name', 'code', 'key'].includes(line.toLowerCase()))
        return false;
      return true;
    });
}

export default function ExcludedCustomersClient() {
  // --- list state ---
  const [entries, setEntries] = useState<ExcludedEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [columnFilters, setColumnFilters] = useState<Record<string, Set<string>>>({});
  const [filterOptions, setFilterOptions] = useState<{
    keyType: string[];
    keyValue: string[];
    reason: string[];
  }>({ keyType: [], keyValue: [], reason: [] });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [sortField, setSortField] = useState<
    'keyValue' | 'keyType' | 'reason' | 'createdAt' | 'updatedAt'
  >('keyValue');
  const [sortOrder, setSortOrder] = useState<SortDir>('asc');

  // --- ui state ---
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  // --- add modal ---
  const [showAddModal, setShowAddModal] = useState(false);
  const [addKeyType, setAddKeyType] = useState<KeyT>('customer_code');
  const [addForm, setAddForm] = useState<FormState>({ keyValue: '', reason: '' });

  // --- edit modal ---
  const [editEntry, setEditEntry] = useState<ExcludedEntry | null>(null);
  const [editForm, setEditForm] = useState<FormState | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  // --- import modal ---
  const [showImportModal, setShowImportModal] = useState(false);
  const [importKeyType, setImportKeyType] = useState<KeyT>('customer_code');
  const [importParsed, setImportParsed] = useState<string[]>([]);
  const [importFileName, setImportFileName] = useState('');
  const [importing, setImporting] = useState(false);

  // --- cleanmax modal ---
  const [showCleanmaxModal, setShowCleanmaxModal] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestRow[]>([]);
  const [suggestKeyType, setSuggestKeyType] = useState<KeyT>('customer_code');
  const [selectedSuggest, setSelectedSuggest] = useState<Set<string>>(new Set());
  const [bulkAdding, setBulkAdding] = useState(false);
  const [allExclusionRows, setAllExclusionRows] = useState<ExcludedEntry[]>([]);

  // --- load entries ---
  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      const kts = columnFilters.keyType;
      if (kts && kts.size > 0) {
        for (const k of kts) {
          if (k === 'customer_name' || k === 'customer_code') params.append('keyType', k);
        }
      }
      const kvs = columnFilters.keyValue;
      if (kvs && kvs.size > 0) {
        for (const v of kvs) params.append('keyValue', v);
      }
      const rs = columnFilters.reason;
      if (rs && rs.size > 0) {
        for (const r of rs) {
          params.append('reason', r === '(No reason)' ? '__empty__' : r);
        }
      }
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      params.set('sortBy', sortField);
      params.set('sortOrder', sortOrder);
      const res = await fetch(`/api/excluded-customers?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries || []);
        setTotal(data.total ?? 0);
        if (data.filterOptions) {
          setFilterOptions({
            keyType: data.filterOptions.keyType || ['customer_name', 'customer_code'],
            keyValue: data.filterOptions.keyValue || [],
            reason: data.filterOptions.reason || [],
          });
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [columnFilters, page, pageSize, sortField, sortOrder]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const onExcludedSort = (colKey: string) => {
    const valid = ['keyValue', 'keyType', 'reason', 'createdAt', 'updatedAt'] as const;
    if (!valid.includes(colKey as (typeof valid)[number])) return;
    const k = colKey as (typeof valid)[number];
    if (sortField === k) {
      setSortOrder((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(k);
      setSortOrder('asc');
    }
    setPage(1);
  };

  // --- edit ---
  const openEdit = (e: ExcludedEntry) => {
    setMessage(null);
    setEditEntry(e);
    setEditForm({ keyValue: e.keyValue, reason: e.reason || '' });
  };
  const closeEdit = () => { setEditEntry(null); setEditForm(null); };

  const handleSaveEdit = async () => {
    if (!editEntry || !editForm) return;
    if (!editForm.keyValue.trim()) { setMessage({ text: 'Key value is required', error: true }); return; }
    setSavingEdit(true);
    setMessage(null);
    try {
      const res = await fetch('/api/excluded-customers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editEntry.id, keyValue: editForm.keyValue.trim(), reason: editForm.reason.trim() || null }),
      });
      const data = await res.json();
      if (res.ok) { setMessage({ text: 'Saved' }); closeEdit(); await loadEntries(); }
      else { setMessage({ text: data.error || 'Save failed', error: true }); }
    } catch { setMessage({ text: 'Save failed', error: true }); }
    finally { setSavingEdit(false); }
  };

  // --- add ---
  const handleAdd = async () => {
    if (!addForm.keyValue.trim()) { setMessage({ text: 'Key value is required', error: true }); return; }
    try {
      const res = await fetch('/api/excluded-customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyType: addKeyType, keyValue: addForm.keyValue.trim(), reason: addForm.reason.trim() || undefined }),
      });
      const data = await res.json();
      if (res.ok) { setMessage({ text: 'Entry added' }); setShowAddModal(false); setAddForm({ keyValue: '', reason: '' }); await loadEntries(); }
      else { setMessage({ text: data.error || 'Failed to add', error: true }); }
    } catch { setMessage({ text: 'Failed to add', error: true }); }
  };

  // --- delete ---
  const handleDelete = async (id: string) => {
    if (!confirm('Remove this exclusion?')) return;
    try {
      const res = await fetch(`/api/excluded-customers?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (res.ok) { setMessage({ text: 'Removed' }); if (editEntry?.id === id) closeEdit(); await loadEntries(); }
      else { const d = await res.json(); setMessage({ text: d.error || 'Delete failed', error: true }); }
    } catch { setMessage({ text: 'Delete failed', error: true }); }
  };

  // --- export (single column) ---
  const handleExport = async () => {
    try {
      const res = await fetch('/api/excluded-customers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'export', keyType: addKeyType }),
      });
      if (res.ok) {
        const data = await res.json();
        const blob = new Blob([data.csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `excluded-${addKeyType === 'customer_name' ? 'names' : 'codes'}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch { setMessage({ text: 'Export failed', error: true }); }
  };

  // --- import CSV ---
  const handleImportFile = async (file: File) => {
    setImportFileName(file.name);
    const text = await file.text();
    setImportParsed(parseCsvValues(text));
  };

  const handleImport = async () => {
    if (importParsed.length === 0) return;
    setImporting(true);
    setMessage(null);
    try {
      const entries = importParsed.map((v) => ({ keyType: importKeyType, keyValue: v }));
      const res = await fetch('/api/excluded-customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ text: `Imported ${data.added} entr${data.added === 1 ? 'y' : 'ies'}${data.skipped ? `, ${data.skipped} already existed` : ''}` });
        setShowImportModal(false);
        setImportParsed([]);
        setImportFileName('');
        await loadEntries();
      } else {
        setMessage({ text: data.error || 'Import failed', error: true });
      }
    } catch { setMessage({ text: 'Import failed', error: true }); }
    finally { setImporting(false); }
  };

  // --- cleanmax suggestions ---

  // Deduplicate by the selected keyType so the count shown = count added
  const displayedSuggestions = useMemo(() => {
    const seen = new Set<string>();
    return suggestions.filter((r) => {
      const key = (suggestKeyType === 'customer_name' ? r.customerName : r.customerCode).toLowerCase().trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [suggestions, suggestKeyType]);

  // Clear selection when keyType toggle changes (displayed rows change)
  useEffect(() => {
    setSelectedSuggest(new Set());
  }, [suggestKeyType]);

  const suggestRowKey = (r: SuggestRow) =>
    (suggestKeyType === 'customer_name' ? r.customerName : r.customerCode).toLowerCase().trim();

  const isAlreadyExcluded = useCallback(
    (r: SuggestRow, kt: KeyT): boolean => {
      const v = (kt === 'customer_name' ? r.customerName : r.customerCode).toLowerCase().trim();
      return allExclusionRows.some((e) => e.keyType === kt && e.keyValue === v);
    },
    [allExclusionRows]
  );

  const uniqueToAdd = useMemo(() => {
    const seen = new Set<string>();
    for (const r of displayedSuggestions) {
      const k = suggestRowKey(r);
      if (!selectedSuggest.has(k)) continue;
      if (isAlreadyExcluded(r, suggestKeyType)) continue;
      seen.add(k);
    }
    return seen.size;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayedSuggestions, selectedSuggest, suggestKeyType, isAlreadyExcluded]);

  const toggleSuggest = (r: SuggestRow) => {
    const k = suggestRowKey(r);
    setSelectedSuggest((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  };

  const selectAllSuggest = () =>
    setSelectedSuggest(new Set(displayedSuggestions.filter((r) => !isAlreadyExcluded(r, suggestKeyType)).map(suggestRowKey)));

  const clearSuggestSelection = () => setSelectedSuggest(new Set());

  const openCleanmaxModal = async () => {
    setShowCleanmaxModal(true);
    setSelectedSuggest(new Set());
    setSuggestLoading(true);
    setMessage(null);
    try {
      const [suggestRes, allRes] = await Promise.all([
        fetch('/api/excluded-customers/suggest'),
        // large pageSize to fetch all for dedupe — no keyType filter
        fetch('/api/excluded-customers?pageSize=10000'),
      ]);
      const suggestData = await suggestRes.json();
      setSuggestions(suggestRes.ok ? suggestData.suggestions || [] : []);
      if (allRes.ok) {
        const allData = await allRes.json();
        setAllExclusionRows(allData.entries || []);
      } else {
        setAllExclusionRows([]);
      }
    } catch {
      setSuggestions([]);
      setAllExclusionRows([]);
      setMessage({ text: 'Could not load suggestions', error: true });
    } finally {
      setSuggestLoading(false);
    }
  };

  // Single bulk request instead of N sequential POSTs
  const handleAddSelectedCleanmax = async () => {
    const rows = displayedSuggestions.filter(
      (r) => selectedSuggest.has(suggestRowKey(r)) && !isAlreadyExcluded(r, suggestKeyType)
    );
    if (rows.length === 0) return;
    setBulkAdding(true);
    setMessage(null);
    try {
      const entries = rows.map((r) => ({
        keyType: suggestKeyType,
        keyValue: (suggestKeyType === 'customer_name' ? r.customerName : r.customerCode).trim(),
        reason: 'Cleanmax / CMES match',
      }));
      const res = await fetch('/api/excluded-customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries }),
      });
      const data = await res.json();
      setMessage(
        res.ok
          ? { text: `Added ${data.added} exclusion(s)${data.skipped ? `, ${data.skipped} already existed` : ''}` }
          : { text: data.error || 'Failed', error: true }
      );
      setShowCleanmaxModal(false);
      await loadEntries();
    } catch {
      setMessage({ text: 'Failed to add', error: true });
    } finally {
      setBulkAdding(false);
    }
  };

  const excludedColumns: Column<ExcludedEntry>[] = [
    {
      key: 'keyValue',
      header: 'Key',
      sortable: true,
      filterable: true,
      rawValue: (e) => e.keyValue,
      accessor: (e) => <span className="font-medium text-gray-900">{e.keyValue}</span>,
      minWidth: '140px',
    },
    {
      key: 'keyType',
      header: 'Type',
      sortable: true,
      filterable: true,
      rawValue: (e) => e.keyType,
      accessor: (e) => <span className="text-gray-600">{labelKeyType(e.keyType)}</span>,
      minWidth: '120px',
    },
    {
      key: 'reason',
      header: 'Reason',
      sortable: true,
      filterable: true,
      rawValue: (e) => (e.reason && e.reason.trim() ? e.reason : '(No reason)'),
      accessor: (e) => (
        <span className="text-gray-600 max-w-md truncate block" title={e.reason || ''}>
          {e.reason || '—'}
        </span>
      ),
      minWidth: '160px',
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      accessor: (e) => (
        <div className="text-right">
          <button
            type="button"
            onClick={() => openEdit(e)}
            className="text-sm font-medium text-blue-700 hover:underline mr-3"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => handleDelete(e.id)}
            className="text-sm font-medium text-red-600 hover:underline"
          >
            Delete
          </button>
        </div>
      ),
      minWidth: '120px',
    },
  ];

  // ─── render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-screen">
      <div className="px-6 py-4 space-y-5 flex-1 overflow-auto max-w-7xl w-full">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Excluded customers</h1>

        {message && (
          <div
            className={`text-sm rounded-lg px-3 py-2 ${
              message.error
                ? 'text-red-800 bg-red-50 border border-red-200'
                : 'text-blue-800 bg-blue-50 border border-blue-200'
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-3">
            Filter from column headers. Export uses the &quot;Exclude by&quot; type when adding an entry, or the Import dialog type.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={handleExport}
              className="h-9 px-3 text-sm font-medium border border-gray-300 rounded-lg bg-white hover:bg-gray-50">
              Export CSV
            </button>
            <button type="button" onClick={() => { setShowImportModal(true); setImportParsed([]); setImportFileName(''); }}
              className="h-9 px-3 text-sm font-medium border border-gray-300 rounded-lg bg-white hover:bg-gray-50">
              Import CSV
            </button>
            <button
              type="button"
              onClick={() => { setAddKeyType('customer_code'); setAddForm({ keyValue: '', reason: '' }); setShowAddModal(true); }}
              className="h-9 px-3 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Add entry
            </button>
            <button type="button" onClick={openCleanmaxModal}
              className="h-9 px-3 text-sm font-medium border border-amber-300 text-amber-900 bg-amber-50 rounded-lg hover:bg-amber-100">
              Cleanmax customers
            </button>
          </div>
        </div>

        {/* table */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-800">
              Excluded entries
              {!loading && (
                <span className="ml-1 text-gray-500 font-normal">
                  ({total} total
                  {Object.values(columnFilters).some((s) => s && s.size > 0) ? ', filtered' : ''})
                </span>
              )}
            </h2>
          </div>

          <ServerDataTable<ExcludedEntry>
            rows={entries}
            total={total}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(s) => {
              setPageSize(s);
              setPage(1);
            }}
            sortKey={sortField}
            sortDir={sortOrder}
            onSortChange={onExcludedSort}
            columnFilters={columnFilters}
            onColumnFilterChange={(colKey, values) => {
              setColumnFilters((prev) => ({ ...prev, [colKey]: values }));
              setPage(1);
            }}
            filterOptions={{
              keyValue: filterOptions.keyValue,
              keyType: filterOptions.keyType,
              reason: filterOptions.reason.map((r) => (r === '__empty__' ? '(No reason)' : r)) as string[],
            }}
            onClearAllFilters={() => {
              setColumnFilters({});
              setPage(1);
            }}
            rowKey={(e) => e.id}
            columns={excludedColumns}
            loading={loading}
            emptyMessage="No exclusions yet. Add entries or use Cleanmax customers."
            pageSizeOptions={[10, 25, 50, 100]}
          />
        </section>
      </div>

      {/* ── Add modal ─────────────────────────────────────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Add exclusion</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Exclude by</label>
                <div className="flex gap-2">
                  {(['customer_name', 'customer_code'] as KeyT[]).map((kt) => (
                    <button key={kt} type="button" onClick={() => setAddKeyType(kt)}
                      className={`flex-1 py-2 rounded-lg text-sm ${addKeyType === kt ? 'bg-blue-600 text-white' : 'border border-gray-300'}`}>
                      {kt === 'customer_name' ? 'Name' : 'Code'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{labelKeyType(addKeyType)}</label>
                <input type="text" value={addForm.keyValue}
                  onChange={(e) => setAddForm({ ...addForm, keyValue: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason (optional)</label>
                <input type="text" value={addForm.reason}
                  onChange={(e) => setAddForm({ ...addForm, reason: e.target.value })}
                  placeholder="e.g. Internal entity"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button type="button" onClick={() => setShowAddModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg">Cancel</button>
              <button type="button" onClick={handleAdd} disabled={!addForm.keyValue.trim()}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50">Add</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit modal ────────────────────────────────────────────── */}
      {editEntry && editForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal>
          <div className="bg-white rounded-xl w-full max-w-md p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Edit exclusion</h3>
            <p className="text-xs text-gray-500 mb-4">Type: {labelKeyType(editEntry.keyType)}</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Key</label>
                <input type="text" value={editForm.keyValue}
                  onChange={(e) => setEditForm({ ...editForm, keyValue: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason (optional)</label>
                <input type="text" value={editForm.reason}
                  onChange={(e) => setEditForm({ ...editForm, reason: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button type="button" onClick={closeEdit} disabled={savingEdit}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50">Cancel</button>
              <button type="button" onClick={handleSaveEdit} disabled={savingEdit || !editForm.keyValue.trim()}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50">
                {savingEdit ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Import CSV modal ──────────────────────────────────────── */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal>
          <div className="bg-white rounded-xl w-full max-w-md p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Import CSV</h3>
            <p className="text-xs text-gray-500 mb-4">
              One value per line. Header row is optional — if present use <code className="bg-gray-100 px-1 rounded">customer_name</code> or{' '}
              <code className="bg-gray-100 px-1 rounded">customer_code</code> and it will be skipped automatically.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Import as</label>
                <div className="flex gap-2">
                  {(['customer_name', 'customer_code'] as KeyT[]).map((kt) => (
                    <button key={kt} type="button" onClick={() => setImportKeyType(kt)}
                      className={`flex-1 py-2 rounded-lg text-sm ${importKeyType === kt ? 'bg-blue-600 text-white' : 'border border-gray-300'}`}>
                      {labelKeyType(kt)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">CSV file</label>
                <input
                  type="file"
                  accept=".csv,text/csv,text/plain"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportFile(f); }}
                  className="block w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
              </div>
              {importParsed.length > 0 && (
                <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-700">
                  <span className="font-medium">{importFileName}</span>: {importParsed.length} value{importParsed.length !== 1 ? 's' : ''} ready to import
                  <div className="mt-1.5 max-h-24 overflow-y-auto text-xs text-gray-500 space-y-0.5">
                    {importParsed.slice(0, 8).map((v, i) => <div key={i}>{v}</div>)}
                    {importParsed.length > 8 && <div>…and {importParsed.length - 8} more</div>}
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button type="button" onClick={() => setShowImportModal(false)} disabled={importing}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50">Cancel</button>
              <button type="button" onClick={handleImport} disabled={importing || importParsed.length === 0}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50">
                {importing ? 'Importing…' : `Import ${importParsed.length > 0 ? importParsed.length : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Cleanmax modal ────────────────────────────────────────── */}
      {showCleanmaxModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal>
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-xl">
            <div className="px-5 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Cleanmax / CMES customers</h3>
              <p className="text-sm text-gray-500 mt-1">
                From your latest ageing import: customers matching <strong>cleanmax</strong>,{' '}
                <strong>clean max</strong>, or <strong>cmes</strong>. Deduplicated by the selected key type.
              </p>
              <div className="flex flex-wrap items-center gap-3 mt-3">
                <span className="text-xs text-gray-500">Add as</span>
                {(['customer_name', 'customer_code'] as KeyT[]).map((kt) => (
                  <button key={kt} type="button" onClick={() => setSuggestKeyType(kt)}
                    className={`px-3 py-1.5 rounded-lg text-sm ${suggestKeyType === kt ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>
                    {labelKeyType(kt)}
                  </button>
                ))}
                <span className="text-xs text-gray-400 ml-1">
                  {displayedSuggestions.length} unique {suggestKeyType === 'customer_name' ? 'names' : 'codes'}
                </span>
                <button type="button" onClick={selectAllSuggest} className="text-sm text-blue-700 ml-auto">Select all</button>
                <button type="button" onClick={clearSuggestSelection} className="text-sm text-gray-600">Clear</button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {suggestLoading ? (
                <div className="flex items-center gap-2 text-gray-500 text-sm py-4">
                  <div className="h-4 w-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
                  Loading…
                </div>
              ) : displayedSuggestions.length === 0 ? (
                <p className="text-gray-500 text-sm">No matching customers in the latest import.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-600 border-b">
                      <th className="py-2 w-10" />
                      <th className="py-2">Customer name</th>
                      <th className="py-2">Code</th>
                      <th className="py-2">Company</th>
                      <th className="py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedSuggestions.map((r) => {
                      const k = suggestRowKey(r);
                      const dup = isAlreadyExcluded(r, suggestKeyType);
                      return (
                        <tr key={k} className="border-b border-gray-100">
                          <td className="py-2">
                            <input type="checkbox" checked={selectedSuggest.has(k)} disabled={dup}
                              onChange={() => toggleSuggest(r)} />
                          </td>
                          <td className="py-2 pr-2 max-w-[180px] truncate" title={r.customerName}>{r.customerName}</td>
                          <td className="py-2">{r.customerCode}</td>
                          <td className="py-2 text-gray-600 max-w-[140px] truncate" title={r.companyName}>{r.companyName || '—'}</td>
                          <td className="py-2 text-xs whitespace-nowrap">
                            {dup
                              ? <span className="text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">Already excluded</span>
                              : <span className="text-gray-400">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div className="px-5 py-4 border-t border-gray-200 flex justify-end gap-2">
              <button type="button" onClick={() => setShowCleanmaxModal(false)} disabled={bulkAdding}
                className="px-4 py-2 border border-gray-300 rounded-lg">Cancel</button>
              <button type="button" onClick={handleAddSelectedCleanmax}
                disabled={bulkAdding || uniqueToAdd === 0}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50">
                {bulkAdding
                  ? 'Adding…'
                  : uniqueToAdd === 0
                    ? 'Add selected'
                    : `Add selected (${uniqueToAdd})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
