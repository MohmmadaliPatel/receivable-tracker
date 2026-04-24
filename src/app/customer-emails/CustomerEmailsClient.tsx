'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ServerDataTable, type SortDir } from '@/components/ui/ServerDataTable';
import type { Column } from '@/components/ui/DataTable';
import type { CustomerEmailSortField } from '@/lib/customer-email-directory';

interface EmailEntry {
  id: string;
  keyType: 'customer_name' | 'customer_code';
  keyValue: string;
  companyName: string | null;
  emailTo: string;
  emailCc: string | null;
  createdAt: string;
  updatedAt: string;
}

type RowForm = {
  keyValue: string;
  companyName: string;
  emailTo: string;
  emailCc: string;
};

function rowFromEntry(e: EmailEntry): RowForm {
  return {
    keyValue: e.keyValue,
    companyName: e.companyName || '',
    emailTo: e.emailTo,
    emailCc: e.emailCc || '',
  };
}

export default function CustomerEmailsClient() {
  const [emails, setEmails] = useState<EmailEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [addKeyType, setAddKeyType] = useState<'customer_name' | 'customer_code'>('customer_name');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortField, setSortField] = useState<CustomerEmailSortField>('keyValue');
  const [sortOrder, setSortOrder] = useState<SortDir>('asc');
  const [columnFilters, setColumnFilters] = useState<Record<string, Set<string>>>({});
  const [filterOptions, setFilterOptions] = useState<{
    keyType: string[];
    keyValue: string[];
    companyName: string[];
    emailTo: string[];
    emailCc: string[];
  }>({ keyType: [], keyValue: [], companyName: [], emailTo: [], emailCc: [] });
  const [message, setMessage] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importingExcel, setImportingExcel] = useState(false);
  const [importResult, setImportResult] = useState<{
    created: number; updated: number; skipped: number; errors: number;
    skippedDetails: { row: number; code: string; reason: string }[];
    errorDetails: string[];
    totalRows: number;
  } | null>(null);
  const [editEntry, setEditEntry] = useState<EmailEntry | null>(null);
  const [editForm, setEditForm] = useState<RowForm | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);

  const [newEntry, setNewEntry] = useState({
    keyValue: '',
    companyName: '',
    emailTo: '',
    emailCc: '',
  });

  const openEdit = (entry: EmailEntry) => {
    setMessage(null);
    setEditEntry(entry);
    setEditForm(rowFromEntry(entry));
  };

  const closeEdit = () => {
    setEditEntry(null);
    setEditForm(null);
  };

  const loadEmails = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      params.set('sortBy', sortField);
      params.set('sortOrder', sortOrder);
      const kf = columnFilters.keyType;
      if (kf && kf.size > 0) {
        for (const k of kf) {
          if (k === 'customer_name' || k === 'customer_code') params.append('keyType', k);
        }
      }
      const kv = columnFilters.keyValue;
      if (kv && kv.size > 0) {
        for (const v of kv) params.append('keyValue', v);
      }
      const cn = columnFilters.companyName;
      if (cn && cn.size > 0) {
        for (const n of cn) {
          params.append('companyName', n);
        }
      }
      const et = columnFilters.emailTo;
      if (et && et.size > 0) {
        for (const e of et) params.append('emailTo', e);
      }
      const ecc = columnFilters.emailCc;
      if (ecc && ecc.size > 0) {
        for (const c of ecc) params.append('emailCc', c);
      }
      const res = await fetch(`/api/customer-emails?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setEmails(data.emails || []);
        setTotal(typeof data.total === 'number' ? data.total : 0);
        if (data.filterOptions) {
          const fo = data.filterOptions;
          setFilterOptions({
            keyType: fo.keyType || ['customer_name', 'customer_code'],
            keyValue: fo.keyValue || [],
            companyName: fo.companyName || [],
            emailTo: fo.emailTo || [],
            emailCc: fo.emailCc || [],
          });
        } else {
          setFilterOptions({
            keyType: ['customer_name', 'customer_code'],
            keyValue: [],
            companyName: [],
            emailTo: [],
            emailCc: [],
          });
        }
      }
    } catch (error) {
      console.error('Failed to load emails:', error);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, sortField, sortOrder, columnFilters]);

  useEffect(() => {
    loadEmails();
  }, [loadEmails]);

  const handleSaveEdit = async () => {
    if (!editEntry || !editForm) return;
    if (!editForm.keyValue.trim() || !editForm.emailTo.trim()) {
      setMessage('Customer name/code and email to are required');
      return;
    }
    setSavingEdit(true);
    setMessage(null);
    try {
      const res = await fetch('/api/customer-emails', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editEntry.id,
          keyValue: editForm.keyValue.trim(),
          companyName: editForm.companyName.trim() || null,
          emailTo: editForm.emailTo.trim(),
          emailCc: editForm.emailCc.trim() || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage('Saved');
        closeEdit();
        await loadEmails();
      } else {
        setMessage(data.error || 'Save failed');
      }
    } catch {
      setMessage('Save failed');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleAdd = async () => {
    if (!newEntry.keyValue || !newEntry.emailTo) {
      setMessage('Customer name/code and email are required');
      return;
    }

    try {
      const res = await fetch('/api/customer-emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyType: addKeyType,
          keyValue: newEntry.keyValue,
          companyName: newEntry.companyName || undefined,
          emailTo: newEntry.emailTo,
          emailCc: newEntry.emailCc || undefined,
        }),
      });

      if (res.ok) {
        setMessage('Email entry added successfully');
        setShowAddModal(false);
        setNewEntry({ keyValue: '', companyName: '', emailTo: '', emailCc: '' });
        await loadEmails();
      } else {
        const data = await res.json();
        setMessage(data.error || 'Failed to add entry');
      }
    } catch (error) {
      setMessage('Failed to add entry');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this email entry?')) return;

    try {
      const res = await fetch(`/api/customer-emails?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setMessage('Entry deleted');
        if (editEntry?.id === id) closeEdit();
        await loadEmails();
      } else {
        const data = await res.json();
        setMessage(data.error || 'Delete failed');
      }
    } catch (error) {
      setMessage('Delete failed');
    }
  };

  const handleExport = async () => {
    try {
      const res = await fetch('/api/customer-emails', {
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
        const suffix = addKeyType === 'customer_name' ? 'by-name' : 'by-code';
        a.download = `customer-emails-${suffix}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      setMessage('Export failed');
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setImporting(true);
    setMessage(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('keyType', addKeyType);
      const res = await fetch('/api/customer-emails/import', {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(
          `Import complete: ${data.created} created, ${data.updated} updated${
            data.errors > 0 ? `, ${data.errors} error(s)` : ''
          }`
        );
        await loadEmails();
      } else {
        setMessage(data.error || 'Import failed');
      }
    } catch (error) {
      setMessage('Import failed');
    } finally {
      setImporting(false);
    }
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportingExcel(true);
    setMessage(null);
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/customer-emails/import-excel', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok) {
        setMessage(`Excel import: ${data.created} created, ${data.updated} updated, ${data.skipped} skipped${data.errors > 0 ? `, ${data.errors} error(s)` : ''}`);
        // Auto-switch to customer_code view since Excel imports by code
        setAddKeyType('customer_code');
        // Save full result so user can view skipped details
        setImportResult(data);
        await loadEmails();
      } else {
        setMessage(data.error || 'Excel import failed');
      }
    } catch { setMessage('Excel import failed'); }
    finally { setImportingExcel(false); }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} selected entries?`)) return;
    setMessage(null);
    try {
      const res = await fetch('/api/customer-emails', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selectedIds] }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(`Deleted ${data.deleted} entries`);
        setSelectedIds(new Set());
        await loadEmails();
      } else {
        setMessage(data.error || 'Bulk delete failed');
      }
    } catch { setMessage('Bulk delete failed'); }
  };

  const onEmailSort = (colKey: string) => {
    if (colKey === 'actions') return;
    const f = colKey as CustomerEmailSortField;
    const valid: string[] = ['keyValue', 'companyName', 'emailTo', 'emailCc', 'keyType', 'updatedAt'];
    if (!valid.includes(colKey)) return;
    if (sortField === f) {
      setSortOrder((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(f);
      setSortOrder('asc');
    }
    setPage(1);
  };

  const tableColumns = useMemo((): Column<EmailEntry>[] => [
    {
      key: 'keyType',
      header: 'Type',
      sortable: true,
      filterable: true,
      rawValue: (r) => r.keyType,
      accessor: (r) => (
        <span className="text-gray-600 text-sm">
          {r.keyType === 'customer_name' ? 'Name' : 'Code'}
        </span>
      ),
      minWidth: '88px',
    },
    {
      key: 'keyValue',
      header: 'Key',
      accessor: (r) => <span className="font-medium text-gray-900">{r.keyValue}</span>,
      rawValue: (r) => r.keyValue,
      sortable: true,
      filterable: true,
      truncate: true,
      minWidth: '150px',
    },
    {
      key: 'companyName',
      header: 'Company',
      accessor: (r) => r.companyName || '—',
      rawValue: (r) => r.companyName || '',
      sortable: true,
      filterable: true,
      truncate: true,
      minWidth: '140px',
    },
    {
      key: 'emailTo',
      header: 'Email To',
      accessor: (r) => <span className="break-all text-gray-600">{r.emailTo}</span>,
      rawValue: (r) => r.emailTo,
      sortable: true,
      filterable: true,
      minWidth: '200px',
    },
    {
      key: 'emailCc',
      header: 'Email CC',
      accessor: (r) => <span className="break-all text-gray-500">{r.emailCc || '—'}</span>,
      rawValue: (r) => r.emailCc || '',
      sortable: true,
      filterable: true,
      minWidth: '160px',
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      accessor: (r) => (
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={() => openEdit(r)} className="text-sm font-medium text-blue-700 hover:underline">Edit</button>
          <span className="text-gray-200">|</span>
          <button type="button" onClick={() => handleDelete(r.id)} className="text-sm font-medium text-red-600 hover:underline">Delete</button>
        </div>
      ),
      minWidth: '100px',
    },
  ], []);

  return (
    <div className="flex flex-col min-h-screen">
      <div className="px-6 py-4 space-y-5 flex-1 overflow-auto max-w-7xl w-full">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Customer emails</h1>

        {message && (
          <div
            className={`text-sm rounded-lg px-3 py-2 flex items-center justify-between ${
              message.includes('failed') || message.includes('error')
                ? 'text-red-800 bg-red-50 border border-red-200'
                : 'text-blue-800 bg-blue-50 border border-blue-200'
            }`}
          >
            <span>{message}</span>
            {importResult && importResult.skipped > 0 && (
              <button
                type="button"
                onClick={() => setImportResult({ ...importResult })}
                className="ml-3 text-xs font-semibold underline underline-offset-2 whitespace-nowrap"
              >
                View {importResult.skipped} skipped
              </button>
            )}
          </div>
        )}

        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-3">
            Filter from column headers. Export/CSV import uses the type selected in Add entry.
          </p>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-gray-500 block invisible select-none" aria-hidden>
                Actions
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleExport}
                  className="h-9 px-3 text-sm font-medium border border-gray-300 rounded-lg bg-white hover:bg-gray-50"
                >
                  Export CSV
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddModal(true)}
                  className="h-9 px-3 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Add entry
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={handleImportFile}
                  disabled={importing}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importing}
                  className="h-9 px-3 text-sm font-medium border border-gray-300 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-50"
                >
                  {importing ? 'Importing…' : 'Import CSV'}
                </button>
                <input
                  ref={excelInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={handleImportExcel}
                  disabled={importingExcel}
                />
                <button
                  type="button"
                  onClick={() => excelInputRef.current?.click()}
                  disabled={importingExcel}
                  className="h-9 px-3 text-sm font-medium border border-emerald-300 text-emerald-900 bg-emerald-50 rounded-lg hover:bg-emerald-100 disabled:opacity-50"
                >
                  {importingExcel ? 'Importing…' : 'Import Excel'}
                </button>
              </div>
            </div>
          </div>
        </div>

        <section>
          <ServerDataTable<EmailEntry>
            rows={emails}
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
            onSortChange={onEmailSort}
            columnFilters={columnFilters}
            onColumnFilterChange={(colKey, values) => {
              setColumnFilters((prev) => ({ ...prev, [colKey]: values }));
              setPage(1);
            }}
            filterOptions={{
              keyType: filterOptions.keyType,
              keyValue: filterOptions.keyValue,
              companyName: filterOptions.companyName,
              emailTo: filterOptions.emailTo,
              emailCc: filterOptions.emailCc,
            }}
            onClearAllFilters={() => {
              setColumnFilters({});
              setPage(1);
            }}
            rowKey={(r) => r.id}
            columns={tableColumns}
            selectable
            selectedKeys={selectedIds}
            onSelectionChange={setSelectedIds}
            loading={loading}
            emptyMessage="No email entries. Add an entry or import a CSV/Excel file."
            pageSizeOptions={[10, 25, 50, 100]}
            actions={
              selectedIds.size > 0 ? (
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  className="h-8 px-3 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100"
                >
                  Delete selected ({selectedIds.size})
                </button>
              ) : undefined
            }
          />
        </section>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Add email entry</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {addKeyType === 'customer_name' ? 'Customer name' : 'Customer code'}
                </label>
                <div className="flex gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => setAddKeyType('customer_name')}
                    className={`px-2 py-1 text-xs rounded-md ${
                      addKeyType === 'customer_name' ? 'bg-blue-600 text-white' : 'bg-gray-100'
                    }`}
                  >
                    By name
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddKeyType('customer_code')}
                    className={`px-2 py-1 text-xs rounded-md ${
                      addKeyType === 'customer_code' ? 'bg-blue-600 text-white' : 'bg-gray-100'
                    }`}
                  >
                    By code
                  </button>
                </div>
                <input
                  type="text"
                  value={newEntry.keyValue}
                  onChange={(e) => setNewEntry({ ...newEntry, keyValue: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder={addKeyType === 'customer_name' ? 'Acme Corporation' : '100001'}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Company (optional)</label>
                <input
                  type="text"
                  value={newEntry.companyName}
                  onChange={(e) => setNewEntry({ ...newEntry, companyName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="Cleanmax"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email to</label>
                <input
                  type="email"
                  value={newEntry.emailTo}
                  onChange={(e) => setNewEntry({ ...newEntry, emailTo: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="contact@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Cc (optional)</label>
                <input
                  type="text"
                  value={newEntry.emailCc}
                  onChange={(e) => setNewEntry({ ...newEntry, emailCc: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="cc1@example.com, cc2@example.com"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="flex-1 px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAdd}
                disabled={!newEntry.keyValue || !newEntry.emailTo}
                className="flex-1 px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Add entry
              </button>
            </div>
          </div>
        </div>
      )}

      {editEntry && editForm && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          role="dialog"
          aria-modal
          aria-labelledby="edit-modal-title"
        >
          <div className="bg-white rounded-xl w-full max-w-md p-6 shadow-xl">
            <h3 id="edit-modal-title" className="text-lg font-semibold text-gray-900 mb-4">
              Edit email entry
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {editEntry.keyType === 'customer_name' ? 'Customer name' : 'Customer code'}
                </label>
                <input
                  type="text"
                  value={editForm.keyValue}
                  onChange={(e) => setEditForm({ ...editForm, keyValue: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Company (optional)</label>
                <input
                  type="text"
                  value={editForm.companyName}
                  onChange={(e) => setEditForm({ ...editForm, companyName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email to</label>
                <input
                  type="email"
                  value={editForm.emailTo}
                  onChange={(e) => setEditForm({ ...editForm, emailTo: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Cc (optional)</label>
                <input
                  type="text"
                  value={editForm.emailCc}
                  onChange={(e) => setEditForm({ ...editForm, emailCc: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={closeEdit}
                disabled={savingEdit}
                className="flex-1 px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={savingEdit || !editForm.keyValue.trim() || !editForm.emailTo.trim()}
                className="flex-1 px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {savingEdit ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Import result / skipped modal ──────────────────────── */}
      {importResult && importResult.skipped > 0 && importResult.skippedDetails?.length > 0 && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal>
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-xl">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Import Summary</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  {importResult.totalRows} total rows · {importResult.created + importResult.updated} imported · {importResult.skipped} skipped
                </p>
              </div>
              <button type="button" onClick={() => setImportResult(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <h4 className="text-sm font-semibold text-amber-800 mb-2">Skipped rows ({importResult.skippedDetails.length})</h4>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-gray-600 border-b border-gray-200">
                      <th className="px-3 py-2 font-medium">Row</th>
                      <th className="px-3 py-2 font-medium">Customer Code</th>
                      <th className="px-3 py-2 font-medium">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {importResult.skippedDetails.map((s, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-500 tabular-nums">{s.row}</td>
                        <td className="px-3 py-2 text-gray-900 font-medium">{s.code}</td>
                        <td className="px-3 py-2 text-amber-700">{s.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {importResult.errorDetails?.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-sm font-semibold text-red-800 mb-2">Errors ({importResult.errorDetails.length})</h4>
                  <ul className="text-sm text-red-700 space-y-1 list-disc list-inside">
                    {importResult.errorDetails.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-gray-200 flex justify-end">
              <button type="button" onClick={() => setImportResult(null)} className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
