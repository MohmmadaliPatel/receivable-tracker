'use client';

import { useState, useEffect, useCallback } from 'react';
import ConfirmationTable, { ConfirmationRecord } from '@/components/ConfirmationTable';
import BulkSendModal from '@/components/BulkSendModal';
import MasterUploadModal from '@/components/MasterUploadModal';
import EntityAttachmentModal from '@/components/EntityAttachmentModal';

const ALL_CATEGORIES = [
  'Bank Balances and FDs',
  'Borrowings',
  'Trade Receivables',
  'Trade Payables',
  'Other Receivables',
  'Other Payables',
];

const STATUS_OPTIONS = [
  { value: 'not_sent', label: 'Not Sent' },
  { value: 'sent', label: 'Email Sent' },
  { value: 'followup_sent', label: 'Follow-up Sent' },
  { value: 'response_received', label: 'Response Received' },
];

type SortField = 'entityName' | 'category' | 'status' | 'sentAt' | 'responseReceivedAt';

export default function BulkEmailClient() {
  const [records, setRecords] = useState<ConfirmationRecord[]>([]);
  const [entityNames, setEntityNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingReplies, setCheckingReplies] = useState(false);
  const [repliesMessage, setRepliesMessage] = useState<string | null>(null);
  const [sendingBulkFollowup, setSendingBulkFollowup] = useState(false);
  const [bulkFollowupMessage, setBulkFollowupMessage] = useState<string | null>(null);

  // Filters
  const [selectedEntities, setSelectedEntities] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [search, setSearch] = useState('');

  // Sort
  const [sortField, setSortField] = useState<SortField>('entityName');
  const [sortAsc, setSortAsc] = useState(true);

  // Modals
  const [showBulkSend, setShowBulkSend] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showEntityAttachment, setShowEntityAttachment] = useState(false);

  // Stats
  const stats = {
    total: records.length,
    notSent: records.filter((r) => r.status === 'not_sent').length,
    sent: records.filter((r) => r.status === 'sent').length,
    followupSent: records.filter((r) => r.status === 'followup_sent').length,
    responseReceived: records.filter((r) => r.status === 'response_received').length,
  };

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      selectedEntities.forEach((e) => params.append('entity', e));
      selectedCategories.forEach((c) => params.append('category', c));
      selectedStatuses.forEach((s) => params.append('status', s));
      if (search) params.set('search', search);
      params.set('metadata', 'true');

      const res = await fetch(`/api/confirmations?${params.toString()}`);
      const data = await res.json();
      setRecords(data.records || []);
      if (data.entityNames) setEntityNames(data.entityNames);
    } finally {
      setLoading(false);
    }
  }, [selectedEntities, selectedCategories, selectedStatuses, search]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const handleCheckReplies = async () => {
    setCheckingReplies(true);
    setRepliesMessage(null);
    try {
      const res = await fetch('/api/confirmations/check-replies', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setRepliesMessage(
          data.repliesFound > 0
            ? `Found ${data.repliesFound} new ${data.repliesFound > 1 ? 'replies' : 'reply'}`
            : 'No new replies found'
        );
        if (data.repliesFound > 0) fetchRecords();
      }
    } finally {
      setCheckingReplies(false);
      setTimeout(() => setRepliesMessage(null), 4000);
    }
  };

  const handleDownloadCSV = () => {
    const headers = [
      'Sr No', 'Entity Name', 'Category', 'Bank / Party', 'Account No', 'Cust ID',
      'Email TO', 'Email CC', 'Attachment', 'Status', 'Sent At', 'Follow-up Sent At',
      'Response At', 'Response From', 'Response Subject', 'Remarks',
      'Emails Sent Folder', 'Responses Folder',
    ];
    const rows = sortedRecords.map((r, i) => [
      i + 1, r.entityName, r.category, r.bankName || '', r.accountNumber || '',
      r.custId || '', r.emailTo, r.emailCc || '', r.attachmentName || '',
      r.status, r.sentAt ? new Date(r.sentAt).toLocaleString('en-IN') : '',
      r.followupSentAt ? new Date(r.followupSentAt).toLocaleString('en-IN') : '',
      r.responseReceivedAt ? new Date(r.responseReceivedAt).toLocaleString('en-IN') : '',
      r.responseFromEmail || '', r.responseSubject || '', r.remarks || '',
      r.emailsSentFolderPath || '', r.responsesFolderPath || '',
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bulk-email-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const sortedRecords = [...records].sort((a, b) => {
    const aVal = a[sortField] || '';
    const bVal = b[sortField] || '';
    const cmp = String(aVal).localeCompare(String(bVal));
    return sortAsc ? cmp : -cmp;
  });

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(true); }
  };

  const handleBulkFollowup = async () => {
    const pendingCount = records.filter(
      (r) => r.status === 'sent' || r.status === 'followup_sent'
    ).length;
    if (pendingCount === 0) {
      setBulkFollowupMessage('No records pending follow-up');
      setTimeout(() => setBulkFollowupMessage(null), 3000);
      return;
    }
    if (!confirm(`Send follow-up emails to ${pendingCount} record(s) that haven't responded yet?`)) return;
    setSendingBulkFollowup(true);
    setBulkFollowupMessage(null);
    try {
      const res = await fetch('/api/confirmations/bulk-followup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityNames: selectedEntities.length ? selectedEntities : undefined,
          categories: selectedCategories.length ? selectedCategories : undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setBulkFollowupMessage(
          data.sent > 0
            ? `Follow-up sent to ${data.sent}/${data.total} records${data.failed > 0 ? ` (${data.failed} failed)` : ''}`
            : 'No follow-ups sent'
        );
        fetchRecords();
      } else {
        setBulkFollowupMessage(`Error: ${data.error || 'Failed'}`);
      }
    } finally {
      setSendingBulkFollowup(false);
      setTimeout(() => setBulkFollowupMessage(null), 5000);
    }
  };

  const matchCount = records.filter((r) => r.status === 'not_sent').length;
  const followupCount = records.filter((r) => r.status === 'sent' || r.status === 'followup_sent').length;

  const toggleFilter = <T extends string>(arr: T[], setArr: (a: T[]) => void, val: T) => {
    setArr(arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val]);
  };

  const clearFilters = () => {
    setSelectedEntities([]);
    setSelectedCategories([]);
    setSelectedStatuses([]);
    setSearch('');
  };

  const hasActiveFilters =
    selectedEntities.length > 0 ||
    selectedCategories.length > 0 ||
    selectedStatuses.length > 0 ||
    search.length > 0;

  return (
    <div className="flex flex-col h-screen">
      {/* Top header */}
      <div className="bg-white border-b border-gray-200 px-6 py-5 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bulk Email</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Balance confirmation emails for statutory audit — Year ending 31 March 2026
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap justify-end">
          {repliesMessage && (
            <span className="text-sm text-green-600 font-medium bg-green-50 px-3 py-1.5 rounded-lg border border-green-200">
              {repliesMessage}
            </span>
          )}
          {bulkFollowupMessage && (
            <span className={`text-sm font-medium px-3 py-1.5 rounded-lg border ${
              bulkFollowupMessage.startsWith('Error')
                ? 'text-red-600 bg-red-50 border-red-200'
                : 'text-amber-700 bg-amber-50 border-amber-200'
            }`}>
              {bulkFollowupMessage}
            </span>
          )}
          <button
            onClick={handleCheckReplies}
            disabled={checkingReplies}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <svg className={`w-4 h-4 ${checkingReplies ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Check Replies
          </button>
          <button
            onClick={handleBulkFollowup}
            disabled={sendingBulkFollowup || followupCount === 0}
            className="flex items-center gap-2 px-4 py-2 border border-amber-300 text-amber-700 text-sm font-medium rounded-xl hover:bg-amber-50 transition-colors disabled:opacity-50 bg-amber-50"
          >
            <svg className={`w-4 h-4 ${sendingBulkFollowup ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {sendingBulkFollowup ? 'Sending…' : 'Bulk Follow-up'}
            {followupCount > 0 && (
              <span className="bg-amber-600 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                {followupCount}
              </span>
            )}
          </button>
          <button
            onClick={handleDownloadCSV}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export CSV
          </button>
          <button
            onClick={() => setShowEntityAttachment(true)}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
            Entity Attachments
          </button>
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            Upload Master
          </button>
          <button
            onClick={() => setShowBulkSend(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
            Bulk Send
            {matchCount > 0 && (
              <span className="bg-white text-blue-600 text-xs font-bold px-1.5 py-0.5 rounded-full">
                {matchCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-6 flex-shrink-0 flex-wrap">
        {[
          { label: 'Total', count: stats.total, color: 'text-gray-700', bg: 'bg-gray-100' },
          { label: 'Not Sent', count: stats.notSent, color: 'text-gray-600', bg: 'bg-gray-100' },
          { label: 'Sent', count: stats.sent, color: 'text-blue-700', bg: 'bg-blue-100' },
          { label: 'Follow-up', count: stats.followupSent, color: 'text-amber-700', bg: 'bg-amber-100' },
          { label: 'Response Received', count: stats.responseReceived, color: 'text-green-700', bg: 'bg-green-100' },
        ].map((s) => (
          <div key={s.label} className="flex items-center gap-2">
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${s.bg} ${s.color}`}>
              {s.count}
            </span>
            <span className="text-xs text-gray-500">{s.label}</span>
          </div>
        ))}
        <div className="flex-1" />
        {stats.total > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all"
                style={{ width: `${Math.round((stats.responseReceived / stats.total) * 100)}%` }}
              />
            </div>
            <span className="text-xs text-gray-500">
              {Math.round((stats.responseReceived / stats.total) * 100)}% response rate
            </span>
          </div>
        )}
      </div>

      {/* Filters row */}
      <div className="bg-white border-b border-gray-100 px-6 py-3 flex items-start gap-4 flex-shrink-0 flex-wrap">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search entity, bank, email…"
            className="pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-56"
          />
        </div>

        <FilterDropdown
          label={selectedEntities.length ? `${selectedEntities.length} ${selectedEntities.length === 1 ? 'entity' : 'entities'}` : 'All Entities'}
          options={entityNames}
          selected={selectedEntities}
          onToggle={(v) => toggleFilter(selectedEntities, setSelectedEntities, v)}
          onClear={() => setSelectedEntities([])}
        />

        <FilterDropdown
          label={
            selectedCategories.length
              ? selectedCategories.length === 1
                ? selectedCategories[0].slice(0, 22)
                : `${selectedCategories.length} categories`
              : 'All Categories'
          }
          options={ALL_CATEGORIES}
          selected={selectedCategories}
          onToggle={(v) => toggleFilter(selectedCategories, setSelectedCategories, v)}
          onClear={() => setSelectedCategories([])}
        />

        <FilterDropdown
          label={selectedStatuses.length ? `${selectedStatuses.length} status` : 'All Status'}
          options={STATUS_OPTIONS.map((s) => s.label)}
          selected={selectedStatuses.map((s) => STATUS_OPTIONS.find((o) => o.value === s)?.label || s)}
          onToggle={(v) => {
            const val = STATUS_OPTIONS.find((o) => o.label === v)?.value || v;
            toggleFilter(selectedStatuses, setSelectedStatuses, val);
          }}
          onClear={() => setSelectedStatuses([])}
        />

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700 transition-colors px-3 py-2"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Clear filters
          </button>
        )}

        <div className="flex-1" />

        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span>Sort:</span>
          {(['entityName', 'category', 'status', 'sentAt', 'responseReceivedAt'] as SortField[]).map((f) => (
            <button
              key={f}
              onClick={() => handleSort(f)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${sortField === f ? 'bg-blue-100 text-blue-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
            >
              {{ entityName: 'Entity', category: 'Category', status: 'Status', sentAt: 'Sent', responseReceivedAt: 'Response' }[f]}
              {sortField === f && <span className="ml-1">{sortAsc ? '↑' : '↓'}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Table area */}
      <div className="flex-1 overflow-auto bg-white">
        <ConfirmationTable
          records={sortedRecords}
          onRefresh={fetchRecords}
          loading={loading}
        />
      </div>

      {/* Modals */}
      {showBulkSend && (
        <BulkSendModal
          matchCount={matchCount}
          entityNames={entityNames}
          categories={ALL_CATEGORIES}
          selectedEntities={selectedEntities}
          selectedCategories={selectedCategories}
          onClose={() => setShowBulkSend(false)}
          onComplete={() => { setShowBulkSend(false); fetchRecords(); }}
        />
      )}

      {showUpload && (
        <MasterUploadModal
          onClose={() => setShowUpload(false)}
          onSuccess={() => { setShowUpload(false); fetchRecords(); }}
        />
      )}

      {showEntityAttachment && (
        <EntityAttachmentModal
          entityNames={entityNames}
          onClose={() => setShowEntityAttachment(false)}
          onSuccess={() => { setShowEntityAttachment(false); fetchRecords(); }}
        />
      )}
    </div>
  );
}

function FilterDropdown({
  label,
  options,
  selected,
  onToggle,
  onClear,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (v: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 px-3 py-2 text-sm border rounded-xl transition-colors ${
          selected.length
            ? 'border-blue-400 bg-blue-50 text-blue-700'
            : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
        }`}
      >
        {label}
        <svg className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-1 left-0 bg-white border border-gray-200 rounded-xl shadow-lg z-20 min-w-[210px] max-h-64 overflow-y-auto">
            {selected.length > 0 && (
              <button
                onClick={() => { onClear(); setOpen(false); }}
                className="w-full px-4 py-2 text-left text-xs text-red-500 hover:bg-red-50 border-b border-gray-100"
              >
                Clear selection
              </button>
            )}
            {options.length === 0 && (
              <p className="px-4 py-3 text-xs text-gray-400 italic">No options available</p>
            )}
            {options.map((opt) => (
              <button
                key={opt}
                onClick={() => onToggle(opt)}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
              >
                <span className={`w-4 h-4 border rounded flex items-center justify-center flex-shrink-0 ${selected.includes(opt) ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}>
                  {selected.includes(opt) && (
                    <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
                <span className="text-xs">{opt}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
