'use client';

import { useState, useRef } from 'react';
import EmailPreviewModal from './EmailPreviewModal';
import EmailViewDrawer from './EmailViewDrawer';
import SendConfirmModal from './SendConfirmModal';
import EditRecordModal from './EditRecordModal';

export interface ConfirmationRecord {
  id: string;
  entityName: string;
  category: string;
  bankName?: string | null;
  accountNumber?: string | null;
  custId?: string | null;
  emailTo: string;
  emailCc?: string | null;
  status: string;
  sentAt?: string | null;
  followupSentAt?: string | null;
  followupCount?: number;
  followupsJson?: string | null;
  responsesJson?: string | null;
  responseReceivedAt?: string | null;
  responseSubject?: string | null;
  responseFromEmail?: string | null;
  responseFromName?: string | null;
  responseBody?: string | null;
  responseHtmlBody?: string | null;
  responseHasAttachments?: boolean;
  responseAttachmentsJson?: string | null;
  sentEmailFilePath?: string | null;
  followupEmailFilePath?: string | null;
  responseEmailFilePath?: string | null;
  emailsSentFolderPath?: string | null;
  responsesFolderPath?: string | null;
  attachmentName?: string | null;
  attachmentPath?: string | null;
  remarks?: string | null;
}

interface ConfirmationTableProps {
  records: ConfirmationRecord[];
  onRefresh: () => void;
  loading?: boolean;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  not_sent: { label: 'Not Sent', color: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' },
  sent: { label: 'Email Sent', color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' },
  followup_sent: { label: 'Follow-up Sent', color: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  response_received: { label: 'Response Received', color: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
};

export default function ConfirmationTable({ records, onRefresh, loading }: ConfirmationTableProps) {
  const [previewRecordId, setPreviewRecordId] = useState<string | null>(null);
  const [viewRecord, setViewRecord] = useState<ConfirmationRecord | null>(null);
  const [editingRemark, setEditingRemark] = useState<string | null>(null);
  const [remarkValue, setRemarkValue] = useState('');
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [followupId, setFollowupId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileUploadTarget, setFileUploadTarget] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Send / Follow-up confirmation modal state
  const [sendModalRecord, setSendModalRecord] = useState<ConfirmationRecord | null>(null);
  const [sendModalMode, setSendModalMode] = useState<'send' | 'followup'>('send');

  // Edit modal state
  const [editRecord, setEditRecord] = useState<ConfirmationRecord | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);

  const handleResetResponse = async (recordId: string) => {
    setResettingId(recordId);
    try {
      await fetch(`/api/confirmations/${recordId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset-response' }),
      });
      onRefresh();
    } finally {
      setResettingId(null);
    }
  };

  const previewRecord = records.find((r) => r.id === previewRecordId);

  const openSendModal = (record: ConfirmationRecord, mode: 'send' | 'followup') => {
    setSendModalRecord(record);
    setSendModalMode(mode);
  };

  const handleSendConfirmed = async (overrides: { emailTo: string; emailCc: string; remarks: string; emailBody?: string }) => {
    if (!sendModalRecord) return;
    setSendingId(sendModalRecord.id);

    // Save any edits to emailTo, emailCc, remarks first
    await fetch(`/api/confirmations/${sendModalRecord.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        emailTo: overrides.emailTo,
        emailCc: overrides.emailCc || null,
        remarks: overrides.remarks || null,
      }),
    });

    const endpoint =
      sendModalMode === 'followup'
        ? `/api/confirmations/${sendModalRecord.id}/followup`
        : `/api/confirmations/${sendModalRecord.id}/send`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailBody: overrides.emailBody || undefined }),
    });
    const data = await res.json();
    setSendingId(null);
    setSendModalRecord(null);
    if (!res.ok) throw new Error(data.error || 'Failed to send');
    onRefresh();
  };

  const handleSaveRemark = async (id: string) => {
    try {
      await fetch(`/api/confirmations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remarks: remarkValue }),
      });
      setEditingRemark(null);
      onRefresh();
    } catch {
      alert('Failed to save remark');
    }
  };

  const handleAttachmentUpload = async (id: string, file: File) => {
    setUploadingId(id);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch(`/api/confirmations/${id}/attachment`, { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) alert(data.error || 'Upload failed');
      else onRefresh();
    } catch {
      alert('Upload failed');
    } finally {
      setUploadingId(null);
      setFileUploadTarget(null);
    }
  };

  const handleDeleteRecord = async (id: string) => {
    if (!confirm('Delete this confirmation record? This cannot be undone.')) return;
    setDeletingId(id);
    try {
      await fetch(`/api/confirmations/${id}`, { method: 'DELETE' });
      onRefresh();
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (d?: string | null) => {
    if (!d) return null;
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <svg className="w-14 h-14 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        <p className="text-base font-medium text-gray-500">No records found</p>
        <p className="text-sm mt-1">Upload a master file or adjust your filters</p>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-8">#</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide min-w-[180px]">Entity</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide min-w-[140px]">Category</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide min-w-[140px]">Bank / Party</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Acct No.</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Cust ID</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide min-w-[160px]">Email TO</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Attachment</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Preview</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Action</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide min-w-[130px]">Status</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">View</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide min-w-[140px]">Remarks</th>
              <th className="px-4 py-3 w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {records.map((record, idx) => {
              const status = STATUS_CONFIG[record.status] || STATUS_CONFIG['not_sent'];
              const isSending = sendingId === record.id;
              const isFollowingUp = followupId === record.id;
              const isUploading = uploadingId === record.id;
              const isDeleting = deletingId === record.id;

              return (
                <tr key={record.id} className="hover:bg-gray-50 transition-colors">
                  {/* # */}
                  <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>

                  {/* Entity */}
                  <td className="px-4 py-3">
                    <span className="font-medium text-gray-800 text-xs leading-snug" title={record.entityName}>
                      {record.entityName}
                    </span>
                  </td>

                  {/* Category */}
                  <td className="px-4 py-3">
                    <span className="text-xs text-gray-600">{record.category}</span>
                  </td>

                  {/* Bank/Party */}
                  <td className="px-4 py-3 text-xs text-gray-600">{record.bankName || '—'}</td>

                  {/* Account No */}
                  <td className="px-4 py-3 text-xs text-gray-500 font-mono">{record.accountNumber || '—'}</td>

                  {/* Cust ID */}
                  <td className="px-4 py-3 text-xs text-gray-500 font-mono">{record.custId || '—'}</td>

                  {/* Email TO */}
                  <td className="px-4 py-3">
                    <span className="text-xs text-gray-600 break-all" title={record.emailTo}>
                      {record.emailTo.split(',')[0].trim()}
                      {record.emailTo.split(',').length > 1 && (
                        <span className="ml-1 text-gray-400">+{record.emailTo.split(',').length - 1}</span>
                      )}
                    </span>
                    {record.sentAt && (
                      <p className="text-xs text-gray-400 mt-0.5">{formatDate(record.sentAt)}</p>
                    )}
                  </td>

                  {/* Attachment */}
                  <td className="px-4 py-3">
                    {record.attachmentName ? (
                      <div className="flex items-center gap-1">
                        <svg className="w-3.5 h-3.5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                        </svg>
                        <span className="text-xs text-gray-600 truncate max-w-[80px]" title={record.attachmentName}>
                          {record.attachmentName}
                        </span>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setFileUploadTarget(record.id);
                          fileInputRef.current?.click();
                        }}
                        disabled={isUploading}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition-colors"
                      >
                        {isUploading ? (
                          <svg className="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        ) : (
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                        )}
                        Upload
                      </button>
                    )}
                  </td>

                  {/* Preview */}
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setPreviewRecordId(record.id)}
                      className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      Preview
                    </button>
                  </td>

                  {/* Action */}
                  <td className="px-4 py-3">
                    {record.status === 'not_sent' && (
                      <button
                        onClick={() => openSendModal(record, 'send')}
                        disabled={isSending}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                      >
                        {isSending ? (
                          <svg className="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        ) : (
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                          </svg>
                        )}
                        Send
                      </button>
                    )}
                    {(record.status === 'sent' || record.status === 'followup_sent') && (
                      <button
                        onClick={() => openSendModal(record, 'followup')}
                        disabled={isFollowingUp}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-500 text-white text-xs font-medium rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50"
                      >
                        {isFollowingUp ? (
                          <svg className="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        ) : (
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        )}
                        Follow-up
                        {(record.followupCount ?? 0) > 0 && (
                          <span className="ml-0.5 bg-white/30 text-white text-[10px] font-bold px-1 rounded-full">
                            #{(record.followupCount ?? 0) + 1}
                          </span>
                        )}
                      </button>
                    )}
                    {record.status === 'response_received' && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-green-600 font-medium">Received</span>
                        <button
                          onClick={() => handleResetResponse(record.id)}
                          disabled={resettingId === record.id}
                          title="Reset and re-check reply"
                          className="text-xs text-gray-400 hover:text-blue-600 transition-colors disabled:opacity-50"
                        >
                          <svg className={`w-3 h-3 ${resettingId === record.id ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${status.dot}`} />
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status.color}`}>
                        {status.label}
                      </span>
                    </div>
                    {record.responseReceivedAt && (
                      <p className="text-xs text-gray-400 mt-0.5">{formatDate(record.responseReceivedAt)}</p>
                    )}
                  </td>

                  {/* View */}
                  <td className="px-4 py-3">
                    {(record.sentEmailFilePath || record.responseEmailFilePath || record.responseHtmlBody || record.responseBody) && (
                      <button
                        onClick={() => setViewRecord(record)}
                        className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-800 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        View
                      </button>
                    )}
                  </td>

                  {/* Remarks */}
                  <td className="px-4 py-3">
                    {editingRemark === record.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          autoFocus
                          value={remarkValue}
                          onChange={(e) => setRemarkValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveRemark(record.id);
                            if (e.key === 'Escape') setEditingRemark(null);
                          }}
                          className="text-xs border border-gray-300 rounded px-2 py-1 w-24 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          placeholder="Add remark…"
                        />
                        <button onClick={() => handleSaveRemark(record.id)} className="text-green-600 hover:text-green-800">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        </button>
                        <button onClick={() => setEditingRemark(null)} className="text-gray-400 hover:text-gray-600">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingRemark(record.id);
                          setRemarkValue(record.remarks || '');
                        }}
                        className="text-xs text-gray-500 hover:text-gray-700 text-left max-w-[120px] truncate"
                        title={record.remarks || 'Click to add remark'}
                      >
                        {record.remarks || <span className="text-gray-300 italic">Add remark…</span>}
                      </button>
                    )}
                  </td>

                  {/* Edit + Delete */}
                  <td className="px-2 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditRecord(record)}
                        className="p-1 text-gray-300 hover:text-blue-500 transition-colors"
                        title="Edit record"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDeleteRecord(record.id)}
                        disabled={isDeleting}
                        className="p-1 text-gray-300 hover:text-red-500 transition-colors disabled:opacity-50"
                        title="Delete record"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Hidden file input for attachment uploads */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f && fileUploadTarget) handleAttachmentUpload(fileUploadTarget, f);
          e.target.value = '';
        }}
      />

      {/* Email Preview Modal */}
      {previewRecordId && previewRecord && (
        <EmailPreviewModal
          recordId={previewRecordId}
          entityName={previewRecord.entityName}
          category={previewRecord.category}
          onClose={() => setPreviewRecordId(null)}
        />
      )}

      {/* Email View Drawer */}
      {viewRecord && (
        <EmailViewDrawer
          key={viewRecord.id}
          record={viewRecord}
          onClose={() => setViewRecord(null)}
        />
      )}

      {/* Send / Follow-up Confirmation + Edit Modal */}
      {sendModalRecord && (
        <SendConfirmModal
          record={sendModalRecord}
          mode={sendModalMode}
          onClose={() => setSendModalRecord(null)}
          onConfirm={handleSendConfirmed}
        />
      )}

      {/* Edit Record Modal */}
      {editRecord && (
        <EditRecordModal
          record={editRecord}
          onClose={() => setEditRecord(null)}
          onSaved={() => { setEditRecord(null); onRefresh(); }}
        />
      )}
    </>
  );
}
