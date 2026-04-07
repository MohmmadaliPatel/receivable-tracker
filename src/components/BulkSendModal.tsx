'use client';

import { useState } from 'react';

interface BulkSendResult {
  id: string;
  entityName: string;
  category: string;
  success: boolean;
  error?: string;
}

interface BulkSendModalProps {
  matchCount: number;
  entityNames: string[];
  categories: string[];
  selectedEntities: string[];
  selectedCategories: string[];
  onClose: () => void;
  onComplete: () => void;
}

export default function BulkSendModal({
  matchCount,
  entityNames,
  categories,
  selectedEntities,
  selectedCategories,
  onClose,
  onComplete,
}: BulkSendModalProps) {
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [results, setResults] = useState<BulkSendResult[]>([]);
  const [summary, setSummary] = useState<{ sent: number; failed: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSend = async () => {
    setSending(true);
    setError(null);

    try {
      const res = await fetch('/api/confirmations/bulk-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityNames: selectedEntities.length ? selectedEntities : undefined,
          categories: selectedCategories.length ? selectedCategories : undefined,
          includeNotSentOnly: true,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Bulk send failed');
        return;
      }

      setResults(data.results || []);
      setSummary({ sent: data.sent, failed: data.failed, total: data.total });
      setDone(true);
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Bulk Send Confirmations</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {done ? 'Send complete' : `${matchCount} emails ready to send`}
            </p>
          </div>
          {!sending && (
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {!done && !sending && (
            <div className="space-y-4">
              {/* Filter summary */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                <p className="font-medium text-gray-700">Send scope</p>
                <div className="flex gap-2 flex-wrap">
                  <span className="px-2.5 py-1 bg-white border border-gray-200 rounded-full text-xs text-gray-600">
                    {selectedEntities.length
                      ? `${selectedEntities.length} ${selectedEntities.length === 1 ? 'entity' : 'entities'}`
                      : 'All entities'}
                  </span>
                  <span className="px-2.5 py-1 bg-white border border-gray-200 rounded-full text-xs text-gray-600">
                    {selectedCategories.length
                      ? selectedCategories.join(', ')
                      : 'All categories'}
                  </span>
                  <span className="px-2.5 py-1 bg-blue-50 border border-blue-200 rounded-full text-xs text-blue-700">
                    Status: Not Sent only
                  </span>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
                <p className="font-medium mb-1">Before you proceed</p>
                <ul className="list-disc list-inside space-y-1 text-xs text-amber-700">
                  <li>Emails will be sent via your active Microsoft Graph configuration</li>
                  <li>Each email will be automatically saved to the designated folder</li>
                  <li>Only records with status "Not Sent" will be included</li>
                  <li>This action cannot be undone</li>
                </ul>
              </div>

              {matchCount === 0 && (
                <div className="text-center py-4 text-gray-500 text-sm">
                  No unsent records match the current filters.
                </div>
              )}
            </div>
          )}

          {sending && (
            <div className="flex flex-col items-center justify-center py-10 gap-4">
              <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full" />
              <p className="text-gray-600 font-medium">Sending {matchCount} emails…</p>
              <p className="text-sm text-gray-400">Please do not close this window</p>
            </div>
          )}

          {done && summary && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gray-50 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-gray-800">{summary.total}</p>
                  <p className="text-xs text-gray-500 mt-1">Total</p>
                </div>
                <div className="bg-green-50 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-green-700">{summary.sent}</p>
                  <p className="text-xs text-green-600 mt-1">Sent</p>
                </div>
                <div className={`${summary.failed > 0 ? 'bg-red-50' : 'bg-gray-50'} rounded-xl p-4 text-center`}>
                  <p className={`text-2xl font-bold ${summary.failed > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                    {summary.failed}
                  </p>
                  <p className={`text-xs mt-1 ${summary.failed > 0 ? 'text-red-500' : 'text-gray-400'}`}>Failed</p>
                </div>
              </div>

              {/* Per-row results */}
              {results.length > 0 && (
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="max-h-52 overflow-y-auto divide-y divide-gray-100">
                    {results.map((r) => (
                      <div key={r.id} className={`flex items-center px-4 py-2.5 text-sm ${r.success ? '' : 'bg-red-50'}`}>
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mr-3 ${r.success ? 'bg-green-100' : 'bg-red-100'}`}>
                          {r.success ? (
                            <svg className="w-3 h-3 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <svg className="w-3 h-3 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          )}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-gray-800">{r.entityName}</p>
                          <p className="text-xs text-gray-400">{r.category}</p>
                          {r.error && <p className="text-xs text-red-500 mt-0.5">{r.error}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          {done ? (
            <button
              onClick={onComplete}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors"
            >
              Done
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                disabled={sending}
                className="px-5 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={sending || matchCount === 0}
                className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {sending && (
                  <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                )}
                Send {matchCount} Emails
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
