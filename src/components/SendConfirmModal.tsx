'use client';

import { useState, useEffect, useRef } from 'react';
import { ConfirmationRecord } from './ConfirmationTable';
import { emailHtmlEquals } from '@/lib/email-plain-text';

interface SendConfirmModalProps {
  record: ConfirmationRecord;
  mode: 'send' | 'followup';
  onClose: () => void;
  onConfirm: (overrides: { emailTo: string; emailCc: string; remarks: string; emailBody?: string }) => Promise<void>;
}

export default function SendConfirmModal({ record, mode, onClose, onConfirm }: SendConfirmModalProps) {
  const [emailTo, setEmailTo] = useState(record.emailTo);
  const [emailCc, setEmailCc] = useState(record.emailCc || '');
  const [remarks, setRemarks] = useState(record.remarks || '');
  const [baselineHtml, setBaselineHtml] = useState<string>('');
  const [editedHtml, setEditedHtml] = useState<string>('');
  const [bodyMode, setBodyMode] = useState<'preview' | 'edit'>('preview');
  const [loadingBody, setLoadingBody] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  const isFollowup = mode === 'followup';

  useEffect(() => {
    setLoadingBody(true);
    setBodyMode('preview');
    fetch(`/api/confirmations/${record.id}/preview`)
      .then((r) => r.json())
      .then((data) => {
        const html = data.html || '';
        setBaselineHtml(html);
        setEditedHtml(html);
      })
      .catch(() => {})
      .finally(() => setLoadingBody(false));
  }, [record.id]);

  // Sync contenteditable when opening the editor or after load (not on every keystroke — omit editedHtml from deps).
  useEffect(() => {
    if (bodyMode !== 'edit' || loadingBody) return;
    const id = requestAnimationFrame(() => {
      if (!editorRef.current) return;
      editorRef.current.innerHTML = editedHtml;
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- editedHtml omitted: browser owns DOM while typing
  }, [bodyMode, loadingBody, record.id]);

  const handleSend = async () => {
    if (!emailTo.trim()) {
      setError('Email TO is required');
      return;
    }
    setSending(true);
    setError(null);
    try {
      await onConfirm({
        emailTo: emailTo.trim(),
        emailCc: emailCc.trim(),
        remarks: remarks.trim(),
        emailBody: emailHtmlEquals(editedHtml, baselineHtml) ? undefined : editedHtml,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to send');
      setSending(false);
    }
  };

  const subject = isFollowup
    ? `Reminder: ${record.entityName}: Balance Confirmations for the year ending 31 March 2026`
    : `${record.entityName}: Balance Confirmations for the year ending 31 March 2026`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                {isFollowup ? 'Send Follow-up Email' : 'Send Confirmation Email'}
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">Review and edit before sending</p>
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

        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
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

          {/* Email Body Section */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200">
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Email Body</span>
              <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={() => setBodyMode('preview')}
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${
                    bodyMode === 'preview'
                      ? 'bg-blue-600 text-white font-medium'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Preview
                </button>
                <button
                  type="button"
                  onClick={() => setBodyMode('edit')}
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${
                    bodyMode === 'edit'
                      ? 'bg-blue-600 text-white font-medium'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Edit
                </button>
              </div>
            </div>

            {loadingBody ? (
              <div className="flex items-center justify-center py-10">
                <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full" />
              </div>
            ) : bodyMode === 'preview' ? (
              <iframe
                srcDoc={editedHtml}
                className="w-full border-none"
                style={{ height: '260px' }}
                title="Email body preview"
                sandbox="allow-same-origin"
              />
            ) : (
              <div className="relative">
                <div
                  ref={editorRef}
                  role="textbox"
                  aria-multiline
                  contentEditable
                  suppressContentEditableWarning
                  className="w-full px-4 py-3 text-sm text-gray-800 border-none focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 min-h-[260px] max-h-[360px] overflow-y-auto [&_a]:text-blue-600 [&_a]:underline"
                  style={{ minHeight: '260px' }}
                  onInput={(e) => setEditedHtml((e.currentTarget as HTMLDivElement).innerHTML)}
                />
                <div className="absolute bottom-2 right-2">
                  <button
                    type="button"
                    onClick={() => setBodyMode('preview')}
                    className="text-xs text-blue-600 hover:text-blue-800 bg-white border border-blue-200 rounded px-2 py-1 shadow-sm"
                  >
                    Preview changes
                  </button>
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between bg-gray-50 rounded-b-2xl flex-shrink-0">
          <p className="text-xs text-gray-400">
            {isFollowup
              ? 'A follow-up will be sent to the above addresses'
              : 'Email will be sent via your active Microsoft Graph configuration'}
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={sending}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-200 rounded-xl transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
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
  );
}
