'use client';

import { useCallback, useEffect, useState } from 'react';

type TimelineChase = {
  invoiceKey: string;
  documentNo: string;
  customerName: string;
  customerCode: string;
  status: string;
  emailCount: number;
  followupCount: number;
  sentAt: string | null;
  lastFollowupAt: string | null;
  lastResponseAt: string | null;
  responsePreview: string | null;
  responseSubject: string | null;
  lastAgingSendFailedAt: string | null;
  lastAgingSendError: string | null;
  bouncedAt: string | null;
  bounceDetail: string | null;
  followups: unknown;
  responses: unknown;
};

type EmailRow = {
  id: string;
  to: string;
  subject: string | null;
  status: string;
  errorMessage: string | null;
  sentAt: string;
  kind: string | null;
};

type Props = {
  invoiceKey: string;
  onClose: () => void;
};

function safeArr(x: unknown): object[] {
  if (Array.isArray(x)) return x as object[];
  return [];
}

export default function InvoiceEmailTimelineModal({ invoiceKey, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [chase, setChase] = useState<TimelineChase | null>(null);
  const [emails, setEmails] = useState<EmailRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/aging/invoice-timeline?invoiceKey=${encodeURIComponent(invoiceKey)}`
      );
      const d = await res.json();
      if (!res.ok) {
        setErr(d.error || 'Failed to load');
        return;
      }
      setChase(d.chase);
      setEmails(d.emails || []);
    } catch {
      setErr('Network error');
    } finally {
      setLoading(false);
    }
  }, [invoiceKey]);

  useEffect(() => {
    load();
  }, [load]);

  const followupEntries = safeArr(chase?.followups);
  const responseEntries = safeArr(chase?.responses);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-5 text-left"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start gap-2 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Email trail</h2>
            {chase && (
              <p className="text-sm text-gray-600 mt-0.5">
                {chase.documentNo} · {chase.customerName} ({chase.customerCode})
              </p>
            )}
            <p className="text-xs text-gray-500 font-mono mt-0.5">{invoiceKey}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-800 px-2 py-1 text-sm rounded"
          >
            Close
          </button>
        </div>

        {loading && <p className="text-sm text-gray-500">Loading…</p>}
        {err && <p className="text-sm text-red-600">{err}</p>}

        {chase && !loading && !err && (
          <div className="space-y-5 text-sm">
            <div className="rounded-lg border border-gray-200 p-3 bg-gray-50/80">
              <p className="text-xs font-medium text-gray-500 uppercase">Status</p>
              <p className="text-gray-900 mt-1">
                <span className="font-medium">{chase.status}</span>
                {chase.lastResponseAt && (
                  <span className="ml-2 text-emerald-700">· Response received</span>
                )}
              </p>
              {chase.lastAgingSendFailedAt && (
                <p className="text-red-700 mt-2 text-xs">
                  Last send error ({new Date(chase.lastAgingSendFailedAt).toLocaleString()}):{' '}
                  {chase.lastAgingSendError || '—'}
                </p>
              )}
              {chase.bouncedAt && (
                <p className="text-amber-800 mt-1 text-xs">
                  Bounce ({new Date(chase.bouncedAt).toLocaleString()}): {chase.bounceDetail || '—'}
                </p>
              )}
              <p className="text-gray-600 mt-2 text-xs">
                Outbound: {chase.emailCount} initial
                {chase.followupCount > 0 ? ` · ${chase.followupCount} follow-up(s)` : ''}
              </p>
            </div>

            <div>
              <h3 className="text-xs font-medium text-gray-500 uppercase mb-2">Logged sends (graph)</h3>
              {emails.length === 0 ? (
                <p className="text-gray-500 text-xs">No rows linked to this invoice in the send log yet.</p>
              ) : (
                <ul className="space-y-2">
                  {emails.map((e) => (
                    <li
                      key={e.id}
                      className="border border-gray-100 rounded-lg p-2.5 text-xs bg-white"
                    >
                      <p className="font-medium text-gray-900">
                        {e.subject || '—'}
                        <span
                          className={
                            e.status === 'failed'
                              ? ' ml-1 text-red-600'
                              : ' ml-1 text-emerald-700'
                          }
                        >
                          [{e.status}]
                        </span>
                        {e.kind && (
                          <span className="text-gray-500 ml-1">({e.kind})</span>
                        )}
                      </p>
                      <p className="text-gray-600 mt-0.5">To: {e.to}</p>
                      <p className="text-gray-400 text-[10px] mt-0.5">
                        {new Date(e.sentAt).toLocaleString()}
                      </p>
                      {e.errorMessage && (
                        <p className="text-red-600 mt-1">{e.errorMessage}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {followupEntries.length > 0 && (
              <div>
                <h3 className="text-xs font-medium text-gray-500 uppercase mb-2">
                  Follow-up trail (stored on chase)
                </h3>
                <ul className="list-decimal pl-4 space-y-1 text-xs text-gray-800">
                  {followupEntries.map((f, i) => {
                    const row = f as {
                      sentAt?: string;
                      subject?: string;
                      emailId?: string;
                      graphMessageId?: string;
                    };
                    return (
                      <li key={i}>
                        {row.subject || 'Follow-up'}{' '}
                        {row.sentAt
                          ? `· ${new Date(row.sentAt).toLocaleString()}`
                          : ''}
                        {row.emailId && (
                          <span className="text-gray-500 block text-[10px]">email id: {row.emailId}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {responseEntries.length > 0 && (
              <div>
                <h3 className="text-xs font-medium text-gray-500 uppercase mb-2">Customer responses</h3>
                <ul className="space-y-2">
                  {responseEntries.map((r, i) => {
                    const row = r as {
                      messageId?: string;
                      receivedAt?: string;
                      subject?: string;
                      fromEmail?: string;
                      bodyPreview?: string;
                    };
                    return (
                      <li
                        key={i}
                        className="border border-emerald-100 bg-emerald-50/50 rounded-lg p-2.5 text-xs"
                      >
                        <p className="font-medium text-emerald-900">
                          {row.subject || 'Reply'}
                          {row.receivedAt && (
                            <span className="font-normal text-emerald-800 ml-1">
                              · {new Date(row.receivedAt).toLocaleString()}
                            </span>
                          )}
                        </p>
                        {row.fromEmail && (
                          <p className="text-emerald-800 mt-0.5">From: {row.fromEmail}</p>
                        )}
                        {row.bodyPreview && (
                          <p className="text-gray-700 mt-1 whitespace-pre-wrap">{row.bodyPreview}</p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {chase.lastResponseAt && responseEntries.length === 0 && (
              <div className="rounded border border-gray-200 p-2 text-xs">
                <p className="text-gray-700">Latest response time: {new Date(chase.lastResponseAt).toLocaleString()}</p>
                {chase.responsePreview && (
                  <p className="text-gray-600 mt-1 whitespace-pre-wrap">{chase.responsePreview}</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
