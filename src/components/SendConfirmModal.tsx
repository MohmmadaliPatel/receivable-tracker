'use client';

import { useState, useEffect } from 'react';
import { ConfirmationRecord } from './ConfirmationTable';
import EmailPreviewModal from './EmailPreviewModal';

interface SendConfirmModalProps {
  record: ConfirmationRecord;
  mode: 'send' | 'followup';
  onClose: () => void;
  onConfirm: (overrides: { emailTo: string; emailCc: string; remarks: string }) => Promise<void>;
}

export default function SendConfirmModal({ record, mode, onClose, onConfirm }: SendConfirmModalProps) {
  const [emailTo, setEmailTo] = useState(record.emailTo);
  const [emailCc, setEmailCc] = useState(record.emailCc || '');
  const [remarks, setRemarks] = useState(record.remarks || '');
  const [showPreview, setShowPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isFollowup = mode === 'followup';

  const handleSend = async () => {
    if (!emailTo.trim()) {
      setError('Email TO is required');
      return;
    }
    setSending(true);
    setError(null);
    try {
      await onConfirm({ emailTo: emailTo.trim(), emailCc: emailCc.trim(), remarks: remarks.trim() });
    } catch (err: any) {
      setError(err.message || 'Failed to send');
      setSending(false);
    }
  };

  const subject = isFollowup
    ? `Follow-up: ${record.entityName}: Balance Confirmations for the year ending 31 March 2026`
    : `${record.entityName}: Balance Confirmations for the year ending 31 March 2026`;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col">
          {/* Header */}
          <div className="px-6 py-5 border-b border-gray-200">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-900">
                  {isFollowup ? 'Send Follow-up Email' : 'Send Confirmation Email'}
                </h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  Review and edit before sending
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <div className="px-6 py-5 space-y-4 overflow-y-auto max-h-[65vh]">
            {/* Email summary card */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <div>
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Entity</p>
                  <p className="text-gray-800 font-medium mt-0.5 text-xs">{record.entityName}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Category</p>
                  <p className="text-gray-600 mt-0.5 text-xs">{record.category}</p>
                </div>
                {record.bankName && (
                  <div>
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Bank / Party</p>
                    <p className="text-gray-600 mt-0.5 text-xs">{record.bankName}</p>
                  </div>
                )}
                {record.accountNumber && (
                  <div>
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Account No.</p>
                    <p className="text-gray-600 mt-0.5 text-xs font-mono">{record.accountNumber}</p>
                  </div>
                )}
              </div>
              <div className="pt-2 border-t border-gray-200">
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Subject</p>
                <p className="text-gray-700 mt-0.5 text-xs leading-snug">{subject}</p>
              </div>
              {record.attachmentName && (
                <div className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2">
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                  Authority letter attached: {record.attachmentName}
                </div>
              )}
            </div>

            {/* Editable fields */}
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email To <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  placeholder="recipient@example.com, another@example.com"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-400 mt-1">Comma-separate multiple addresses</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email CC</label>
                <input
                  type="text"
                  value={emailCc}
                  onChange={(e) => setEmailCc(e.target.value)}
                  placeholder="cc@example.com"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Remarks / Notes</label>
                <textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Optional internal note for this record…"
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
              </div>
            </div>

            {/* Preview link */}
            <button
              onClick={() => setShowPreview(true)}
              className="flex items-center gap-2 text-sm text-purple-600 hover:text-purple-800 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              Preview email body
            </button>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between bg-gray-50 rounded-b-2xl">
            <p className="text-xs text-gray-400">
              {isFollowup
                ? 'A follow-up will be sent to the above addresses'
                : 'Email will be sent via your active Microsoft Graph configuration'}
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                disabled={sending}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-200 rounded-xl transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={sending || !emailTo.trim()}
                className={`flex items-center gap-2 px-5 py-2 text-sm font-medium rounded-xl transition-colors disabled:opacity-50 shadow-sm ${
                  isFollowup
                    ? 'bg-amber-500 text-white hover:bg-amber-600'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {sending && (
                  <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                )}
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
                {sending ? 'Sending…' : isFollowup ? 'Send Follow-up' : 'Send Email'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Preview modal (layered on top) */}
      {showPreview && (
        <EmailPreviewModal
          recordId={record.id}
          entityName={record.entityName}
          category={record.category}
          onClose={() => setShowPreview(false)}
        />
      )}
    </>
  );
}
