'use client';

import { useState, useEffect } from 'react';

interface AgingSendModalProps {
  lineItemIds: string[];
  mode: 'send' | 'followup';
  importId: string | null;
  grouping?: 'name' | 'code';
  onClose: () => void;
  onComplete: () => void;
}

interface InvoicePreview {
  documentNo: string;
  totalBalance: string | null;
  maxDaysBucket: string;
  docDate: string;
  generationMonth: string;
  customerName: string;
  customerCode: string;
  companyName: string;
}

export default function AgingSendModal({
  lineItemIds,
  mode,
  importId,
  grouping = 'name',
  onClose,
  onComplete,
}: AgingSendModalProps) {
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [subject, setSubject] = useState('');
  const [htmlBody, setHtmlBody] = useState('');
  const [invoices, setInvoices] = useState<InvoicePreview[]>([]);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [cc, setCc] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!importId) return;

    // Load preview
    const loadPreview = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/aging/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            importId,
            lineItemIds,
            grouping,
            mode,
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to load preview');
        }

        const data = await res.json();
        setSubject(data.subject);
        setHtmlBody(data.htmlBody);
        setInvoices(
          data.invoices || [
            {
              documentNo: data.documentNo || '—',
              totalBalance: data.totalAmount,
              maxDaysBucket: '',
              docDate: '—',
              generationMonth: '—',
              customerName: data.customerName,
              customerCode: '',
              companyName: '',
            },
          ]
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load preview');
      } finally {
        setLoading(false);
      }
    };

    loadPreview();
  }, [importId, lineItemIds, mode, grouping]);

  const handleSend = async () => {
    if (!subject || !htmlBody) {
      setError('Subject and email body are required');
      return;
    }

    setSending(true);
    setError(null);

    try {
      const endpoint = mode === 'followup' ? '/api/aging/followup' : '/api/aging/send';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          importId,
          lineItemIds,
          subject,
          htmlBody,
          cc: cc || undefined,
          grouping,
          customerName: invoices[0]?.customerName,
          customerCode: invoices[0]?.customerCode,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to send');
      }

      const data = await res.json();
      setRecipientEmail(data.recipientEmail);
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send');
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl p-6 w-full max-w-4xl mx-4">
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin mr-3" />
            <span className="text-gray-600">Loading preview...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {mode === 'followup' ? 'Send Follow-up Email' : 'Send Initial Email'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            disabled={sending}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Subject */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={sending}
            />
          </div>

          {/* CC */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">CC (optional)</label>
            <input
              type="text"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              placeholder="email1@example.com, email2@example.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={sending}
            />
          </div>

          {/* Email Body Editor */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email Body (HTML)
            </label>
            <textarea
              value={htmlBody}
              onChange={(e) => setHtmlBody(e.target.value)}
              rows={12}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={sending}
            />
            <p className="text-xs text-gray-500 mt-1">
              You can edit the HTML above. The invoice table will be rendered as shown in the preview.
            </p>
          </div>

          {/* Invoice Preview */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">
              Invoices to include ({invoices.length})
            </h3>
            <div className="border border-gray-200 rounded-lg overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-gray-600">Doc date</th>
                    <th className="px-3 py-2 text-left text-gray-600">Customer Name</th>
                    <th className="px-3 py-2 text-left text-gray-600">Generation Month</th>
                    <th className="px-3 py-2 text-left text-gray-600">Document No</th>
                    <th className="px-3 py-2 text-right text-gray-600">Total Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="px-3 py-2 text-gray-800 whitespace-nowrap">{inv.docDate || '—'}</td>
                      <td className="px-3 py-2 text-gray-800">{inv.customerName || '—'}</td>
                      <td className="px-3 py-2 text-gray-600">{inv.generationMonth || '—'}</td>
                      <td className="px-3 py-2 font-mono text-xs">{inv.documentNo}</td>
                      <td className="px-3 py-2 text-right">{inv.totalBalance || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
          <div className="text-sm text-gray-500">
            {recipientEmail && (
              <span className="text-green-600">
                Sent to: {recipientEmail}
              </span>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={sending}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={sending || !subject || !htmlBody}
              className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {sending && (
                <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              {mode === 'followup' ? 'Send Follow-up' : 'Send Email'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
