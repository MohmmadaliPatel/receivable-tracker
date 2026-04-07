'use client';

import { useEffect, useState } from 'react';

interface EmailPreviewModalProps {
  recordId: string;
  entityName: string;
  category: string;
  onClose: () => void;
}

export default function EmailPreviewModal({
  recordId,
  entityName,
  category,
  onClose,
}: EmailPreviewModalProps) {
  const [subject, setSubject] = useState('');
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/confirmations/${recordId}/preview`)
      .then((r) => r.json())
      .then((data) => {
        setSubject(data.subject || '');
        setHtml(data.html || '');
      })
      .finally(() => setLoading(false));
  }, [recordId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Email Preview</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {entityName} — {category}
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

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-16">
            <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
          </div>
        ) : (
          <>
            {/* Subject */}
            <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Subject</span>
              <p className="text-sm font-medium text-gray-800 mt-1">{subject}</p>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto">
              <iframe
                srcDoc={html}
                className="w-full h-full min-h-[400px]"
                title="Email Preview"
                sandbox="allow-same-origin"
              />
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50">
              <p className="text-xs text-gray-400">
                This is a preview. The actual email will be sent via Microsoft Graph.
              </p>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-800 text-white text-sm rounded-lg hover:bg-gray-700 transition-colors"
              >
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
