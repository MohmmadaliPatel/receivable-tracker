'use client';

import { useEffect, useState, useRef } from 'react';

interface AttachmentMeta {
  id: string;
  name: string;
  contentType: string;
  size: number;
}

interface FollowupEntry {
  followupNumber: number;
  sentAt: string;
  subject: string;
  filePath: string;
  messageId: string | null;
}

interface ResponseEntry {
  receivedAt: string;
  messageId: string;
  subject: string;
  fromEmail: string;
  fromName: string;
  htmlBody: string | null;
  body: string | null;
  filePath: string;
  hasAttachments: boolean;
  attachmentsJson: string | null;
}

interface ConfirmationRecord {
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
  responseReceivedAt?: string | null;
  responseSubject?: string | null;
  responseFromEmail?: string | null;
  responseFromName?: string | null;
  responseBody?: string | null;
  responseHtmlBody?: string | null;
  responseHasAttachments?: boolean;
  responseAttachmentsJson?: string | null;
  responsesJson?: string | null;
  sentEmailFilePath?: string | null;
  followupEmailFilePath?: string | null;
  responseEmailFilePath?: string | null;
  emailsSentFolderPath?: string | null;
  responsesFolderPath?: string | null;
  attachmentName?: string | null;
  remarks?: string | null;
}

interface EmailViewDrawerProps {
  record: ConfirmationRecord;
  onClose: () => void;
}

// Tab can be 'sent' | 'followup-N' (N=1,2,...) | 'response' | 'trail'
type ActiveTab = 'sent' | `followup-${number}` | 'response' | 'trail';

function defaultTabForRecord(record: ConfirmationRecord): ActiveTab {
  if (record.responseEmailFilePath || record.responseHtmlBody || record.responseBody) return 'trail';
  if (record.followupEmailFilePath || (record.followupCount ?? 0) > 0) return 'trail';
  return 'sent';
}

const statusColors: Record<string, string> = {
  not_sent: 'bg-gray-100 text-gray-600',
  sent: 'bg-blue-100 text-blue-700',
  followup_sent: 'bg-yellow-100 text-yellow-700',
  response_received: 'bg-green-100 text-green-700',
};

const statusLabels: Record<string, string> = {
  not_sent: 'Not Sent',
  sent: 'Email Sent',
  followup_sent: 'Follow-up Sent',
  response_received: 'Response Received',
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(contentType: string) {
  if (contentType.includes('pdf')) return '📄';
  if (contentType.includes('image')) return '🖼️';
  if (contentType.includes('word') || contentType.includes('document')) return '📝';
  if (contentType.includes('sheet') || contentType.includes('excel')) return '📊';
  if (contentType.includes('zip') || contentType.includes('compressed')) return '🗜️';
  return '📎';
}

export default function EmailViewDrawer({ record, onClose }: EmailViewDrawerProps) {
  const followups: FollowupEntry[] = (() => {
    try { return JSON.parse(record.followupsJson ?? '[]'); } catch { return []; }
  })();

  const allResponses: ResponseEntry[] = (() => {
    try { return JSON.parse(record.responsesJson ?? '[]'); } catch { return []; }
  })();

  // Fall back to single response fields if history list is empty
  const responses: ResponseEntry[] = allResponses.length > 0
    ? allResponses
    : (record.responseReceivedAt ? [{
        receivedAt: record.responseReceivedAt,
        messageId: record.responseAttachmentsJson ? '' : '',
        subject: record.responseSubject ?? '',
        fromEmail: record.responseFromEmail ?? '',
        fromName: record.responseFromName ?? '',
        htmlBody: record.responseHtmlBody ?? null,
        body: record.responseBody ?? null,
        filePath: record.responseEmailFilePath ?? '',
        hasAttachments: record.responseHasAttachments ?? false,
        attachmentsJson: record.responseAttachmentsJson ?? null,
      }] : []);

  const [activeTab, setActiveTab] = useState<ActiveTab>(() => defaultTabForRecord(record));
  const [emailHtml, setEmailHtml] = useState<string | null>(null);
  const [emailPdfUrl, setEmailPdfUrl] = useState<string | null>(null);
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [downloadingAttachment, setDownloadingAttachment] = useState<string | null>(null);
  const [showFullThread, setShowFullThread] = useState(false);
  const [threadHtml, setThreadHtml] = useState<string | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const loadGenerationRef = useRef(0);

  const responseAttachments: AttachmentMeta[] = (() => {
    try {
      return record.responseAttachmentsJson ? JSON.parse(record.responseAttachmentsJson) : [];
    } catch {
      return [];
    }
  })();

  const hasResponse = responses.length > 0;
  const hasAnyFollowup = followups.length > 0 || !!record.followupEmailFilePath;
  const hasTrail = hasAnyFollowup || hasResponse;

  // Build tab list
  interface TabDef { key: ActiveTab; label: string; available: boolean; badge?: string }
  const tabs: TabDef[] = [
    { key: 'sent', label: 'Original', available: !!record.sentEmailFilePath },
    ...(hasTrail
      ? [{ key: 'trail' as ActiveTab, label: 'Full Trail', available: true,
           badge: String((record.followupCount ?? 0) + (hasResponse ? 1 : 0)) }]
      : []),
    { key: 'response', label: 'Response', available: hasResponse },
  ];

  // Load file-based content for sent/followup-N tabs
  useEffect(() => {
    if (activeTab === 'response' || activeTab === 'trail') {
      setEmailHtml(null);
      setEmailPdfUrl(null);
      setEmailError(null);
      setFilePath(activeTab === 'response' ? (record.responseEmailFilePath ?? null) : null);
      return;
    }

    let cancelled = false;
    const gen = ++loadGenerationRef.current;

    const isPdfPath = (p: string | null | undefined) => !!p && p.endsWith('.pdf');

    const load = async () => {
      setLoadingEmail(true);
      setEmailHtml(null);
      setEmailPdfUrl(null);
      setEmailError(null);
      setFilePath(null);

      try {
        // followup-N tabs: load from followupsJson history, fall back to legacy endpoint
        if (activeTab.startsWith('followup-')) {
          const fuNum = parseInt(activeTab.replace('followup-', ''), 10);
          const entry = followups.find((f) => f.followupNumber === fuNum);
          if (entry?.filePath) {
            const rel = entry.filePath.replace(/\\/g, '/').split('emails/')[1] ?? '';
            if (isPdfPath(entry.filePath)) {
              setEmailPdfUrl(`/api/documents?action=file&path=${encodeURIComponent(rel)}`);
              setFilePath(entry.filePath);
            } else {
              const res = await fetch(`/api/documents?action=file&path=${encodeURIComponent(rel)}`);
              if (cancelled || gen !== loadGenerationRef.current) return;
              if (res.ok) {
                const data = await res.json();
                setEmailHtml(data.content);
                setFilePath(entry.filePath);
              } else {
                setEmailError('Could not load follow-up email');
              }
            }
          } else {
            const res = await fetch(`/api/confirmations/${record.id}/email-file?type=followup&followupNumber=${fuNum}`);
            if (cancelled || gen !== loadGenerationRef.current) return;
            const ct = res.headers.get('content-type') ?? '';
            if (ct.includes('application/pdf')) {
              const blob = await res.blob();
              setEmailPdfUrl(URL.createObjectURL(blob));
            } else if (res.ok) {
              const d = await res.json();
              setEmailHtml(d.html);
              setFilePath(d.filePath);
            } else {
              setEmailError('Could not load follow-up email');
            }
          }
          return;
        }

        const res = await fetch(`/api/confirmations/${record.id}/email-file?type=${activeTab}`);
        if (cancelled || gen !== loadGenerationRef.current) return;

        const ct = res.headers.get('content-type') ?? '';
        if (ct.includes('application/pdf')) {
          const blob = await res.blob();
          if (cancelled || gen !== loadGenerationRef.current) return;
          setEmailPdfUrl(URL.createObjectURL(blob));
          return;
        }

        if (!res.ok) {
          const err = await res.json();
          setEmailError(err.error || 'Could not load email');
          return;
        }
        const data = await res.json();
        if (cancelled || gen !== loadGenerationRef.current) return;
        setEmailHtml(data.html);
        setFilePath(data.filePath);
      } catch {
        if (!cancelled && gen === loadGenerationRef.current) setEmailError('Failed to load email content');
      } finally {
        if (!cancelled && gen === loadGenerationRef.current) setLoadingEmail(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [activeTab, record.id]);

  const handleDownloadAttachment = async (att: AttachmentMeta) => {
    setDownloadingAttachment(att.id);
    try {
      const res = await fetch(`/api/confirmations/${record.id}/response-attachment?attachmentId=${att.id}`);
      if (!res.ok) {
        alert('Failed to download attachment');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = att.name;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloadingAttachment(null);
    }
  };

  const handlePrintPDF = () => {
    const html = emailHtml;
    if (!html) return;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);
  };

  const formatDate = (d?: string | null) => {
    if (!d) return '—';
    return new Date(d).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const emlDownloadHref =
    activeTab === 'sent' && record.sentEmailFilePath?.endsWith('.pdf')
      ? `/api/confirmations/${record.id}/email-file?type=sent&format=eml`
      : activeTab.startsWith('followup-')
        ? (() => {
            const fuNum = parseInt(activeTab.replace('followup-', ''), 10);
            const entry = followups.find((f) => f.followupNumber === fuNum);
            if (entry?.filePath?.endsWith('.pdf')) {
              return `/api/confirmations/${record.id}/email-file?type=followup&format=eml&followupNumber=${fuNum}`;
            }
            if (record.followupEmailFilePath?.endsWith('.pdf')) {
              return `/api/confirmations/${record.id}/email-file?type=followup&format=eml`;
            }
            return null;
          })()
        : null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/40" onClick={onClose} />

      {/* Drawer */}
      <div className="w-full max-w-2xl bg-white shadow-2xl flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-200 bg-white">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-semibold text-gray-900 truncate">{record.entityName}</h2>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[record.status] || 'bg-gray-100 text-gray-600'}`}>
                {statusLabels[record.status] || record.status}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-0.5">{record.category}</p>
          </div>
          <button
            onClick={onClose}
            className="ml-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Metadata grid */}
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 grid grid-cols-2 gap-3 text-sm">
          <MetaItem label="Bank / Party" value={record.bankName} />
          <MetaItem label="Authority Letter" value={record.attachmentName} />
          <div className="col-span-2"><MetaItem label="Email To" value={record.emailTo} /></div>
          {record.emailCc && <div className="col-span-2"><MetaItem label="Email CC" value={record.emailCc} /></div>}
          <MetaItem label="Sent At" value={formatDate(record.sentAt)} />
          <MetaItem
            label={`Follow-ups${(record.followupCount ?? 0) > 0 ? ` (${record.followupCount})` : ''}`}
            value={record.followupSentAt ? `Last: ${formatDate(record.followupSentAt)}` : (record.followupCount ?? 0) > 0 ? `${record.followupCount} sent` : undefined}
          />
          {record.remarks && <div className="col-span-2"><MetaItem label="Remarks" value={record.remarks} /></div>}
        </div>

        {/* Folder paths */}
        {(record.emailsSentFolderPath || record.responsesFolderPath) && (
          <div className="px-6 py-3 bg-blue-50 border-b border-blue-100 text-xs">
            <p className="font-medium text-blue-700 mb-1">Saved File Locations</p>
            {record.emailsSentFolderPath && <FolderPath label="Emails Sent" path={record.emailsSentFolderPath} />}
            {record.responsesFolderPath && <FolderPath label="Responses" path={record.responsesFolderPath} />}
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-gray-200 bg-white px-4 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => tab.available && setActiveTab(tab.key)}
              disabled={!tab.available}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600'
                  : tab.available
                  ? 'border-transparent text-gray-500 hover:text-gray-700'
                  : 'border-transparent text-gray-300 cursor-not-allowed'
              }`}
            >
              {tab.label}
              {tab.badge && Number(tab.badge) > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  activeTab === tab.key ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                }`}>
                  {tab.badge}
                </span>
              )}
              {!tab.available && <span className="ml-1 text-xs">(none)</span>}
            </button>
          ))}
          <div className="flex-1" />
          {activeTab !== 'response' && activeTab !== 'trail' && emailHtml && (
            <button
              onClick={handlePrintPDF}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg my-1 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Download PDF
            </button>
          )}
          {activeTab !== 'response' && activeTab !== 'trail' && emlDownloadHref && (
            <a
              href={emlDownloadHref}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg my-1 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download .eml
            </a>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">

          {/* ── TRAIL TAB ── timeline of all emails */}
          {activeTab === 'trail' && (
            <div className="px-4 py-4 space-y-3">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-medium px-1">Email Activity Timeline</p>

              {/* Original */}
              <TrailItem
                type="conf"
                label="Confirmation Sent"
                date={record.sentAt}
                subLabel={record.emailTo}
                onView={record.sentEmailFilePath ? () => setActiveTab('sent') : undefined}
              />

              {/* Follow-ups from history */}
              {followups.map((fu) => (
                <TrailItem
                  key={fu.followupNumber}
                  type="followup"
                  label={`Follow-up #${fu.followupNumber}`}
                  date={fu.sentAt}
                  subLabel={fu.subject}
                  onView={fu.filePath ? () => setActiveTab(`followup-${fu.followupNumber}`) : undefined}
                />
              ))}

              {/* Legacy single follow-up (if no history but has followupSentAt) */}
              {followups.length === 0 && record.followupSentAt && (
                <TrailItem
                  type="followup"
                  label="Follow-up Sent"
                  date={record.followupSentAt}
                  subLabel="(Legacy — details not available)"
                  onView={record.followupEmailFilePath ? () => setActiveTab('followup-1' as ActiveTab) : undefined}
                />
              )}

              {/* All responses */}
              {responses.map((r, i) => (
                <TrailItem
                  key={r.messageId || i}
                  type="response"
                  label={responses.length > 1 ? `Response #${i + 1}` : 'Response Received'}
                  date={r.receivedAt}
                  subLabel={r.fromName ? `${r.fromName} <${r.fromEmail}>` : r.fromEmail}
                  onView={() => setActiveTab('response')}
                />
              ))}
              {!hasResponse && (
                <div className="flex items-center gap-3 px-3 py-3 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                  <span className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 text-sm flex-shrink-0">?</span>
                  <div>
                    <p className="text-sm font-medium text-gray-400">Awaiting Response</p>
                    <p className="text-xs text-gray-400 mt-0.5">No reply received yet</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── RESPONSE TAB ── shows all responses with navigation */}
          {activeTab === 'response' && (
            <ResponseTabContent
              record={record}
              responses={responses}
              responseAttachments={responseAttachments}
              downloadingAttachment={downloadingAttachment}
              onDownloadAttachment={handleDownloadAttachment}
              formatDate={formatDate}
              showFullThread={showFullThread}
              setShowFullThread={setShowFullThread}
              threadHtml={threadHtml}
              setThreadHtml={setThreadHtml}
              loadingThread={loadingThread}
              setLoadingThread={setLoadingThread}
            />
          )}

          {/* ── SENT / FOLLOWUP-N TABS ── iframe file viewer */}
          {activeTab !== 'response' && activeTab !== 'trail' && (
            <>
              {loadingEmail ? (
                <div className="flex items-center justify-center h-full py-24">
                  <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
                </div>
              ) : emailError ? (
                <div className="flex flex-col items-center justify-center h-full py-24 text-gray-400 gap-2">
                  <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0H4" />
                  </svg>
                  <p className="text-sm">{emailError}</p>
                </div>
              ) : emailPdfUrl ? (
                <embed
                  src={emailPdfUrl}
                  type="application/pdf"
                  className="w-full h-full min-h-[400px]"
                  title="Email PDF"
                />
              ) : emailHtml ? (
                <iframe
                  srcDoc={emailHtml}
                  className="w-full h-full min-h-[400px]"
                  title="Email Content"
                  sandbox="allow-same-origin"
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full py-24 text-gray-300">
                  <p className="text-sm">No email content available</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* File path footer */}
        {filePath && activeTab !== 'trail' && (
          <div className="px-6 py-2 border-t border-gray-200 bg-gray-50 text-xs text-gray-400 truncate">
            <span className="font-medium text-gray-500">
              {activeTab === 'response' ? 'Saved: ' : 'File: '}
            </span>
            {filePath}
          </div>
        )}
      </div>
    </div>
  );
}

function ResponseTabContent({
  record,
  responses,
  responseAttachments,
  downloadingAttachment,
  onDownloadAttachment,
  formatDate,
  showFullThread,
  setShowFullThread,
  threadHtml,
  setThreadHtml,
  loadingThread,
  setLoadingThread,
}: {
  record: ConfirmationRecord;
  responses: ResponseEntry[];
  responseAttachments: AttachmentMeta[];
  downloadingAttachment: string | null;
  onDownloadAttachment: (att: AttachmentMeta) => void;
  formatDate: (d?: string | null) => string;
  showFullThread: boolean;
  setShowFullThread: (v: boolean) => void;
  threadHtml: string | null;
  setThreadHtml: (v: string | null) => void;
  loadingThread: boolean;
  setLoadingThread: (v: boolean) => void;
}) {
  const [activeResponseIdx, setActiveResponseIdx] = useState(0);
  const resp = responses[activeResponseIdx];

  if (!resp) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0H4" />
        </svg>
        <p className="text-sm">No response received yet</p>
      </div>
    );
  }

  const respAttachments: AttachmentMeta[] = (() => {
    try { return JSON.parse(resp.attachmentsJson ?? '[]'); } catch { return responseAttachments; }
  })();

  const [threadPdfUrl, setThreadPdfUrl] = useState<string | null>(null);

  const loadFullThread = async () => {
    setShowFullThread(true);
    if (!threadHtml && !threadPdfUrl) {
      setLoadingThread(true);
      try {
        const res = await fetch(`/api/confirmations/${record.id}/email-file?type=response`);
        const ct = res.headers.get('content-type') ?? '';
        if (ct.includes('application/pdf')) {
          const blob = await res.blob();
          setThreadPdfUrl(URL.createObjectURL(blob));
        } else if (res.ok) {
          const d = await res.json();
          setThreadHtml(d.html);
        }
      } finally { setLoadingThread(false); }
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Multiple response navigation */}
      {responses.length > 1 && (
        <div className="flex items-center gap-2 px-5 py-2 bg-gray-50 border-b border-gray-200">
          <span className="text-xs text-gray-500 font-medium">
            {responses.length} responses received:
          </span>
          {responses.map((r, i) => (
            <button
              key={r.messageId || i}
              onClick={() => setActiveResponseIdx(i)}
              className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                i === activeResponseIdx ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
              }`}
            >
              #{i + 1}
            </button>
          ))}
        </div>
      )}

      {/* Response header */}
      <div className="bg-green-600 text-white px-6 py-4">
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-green-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
            <span className="font-semibold text-lg">
              {responses.length > 1 ? `Response #${activeResponseIdx + 1} of ${responses.length}` : 'Reply Received'}
            </span>
          </div>
          {resp.filePath?.endsWith('.pdf') && (
            <a
              href={`/api/confirmations/${record.id}/email-file?type=response&format=eml&responseIndex=${activeResponseIdx}`}
              className="text-xs font-medium px-2.5 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white border border-white/30 transition-colors"
            >
              Download .eml
            </a>
          )}
        </div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-sm">
          <div>
            <p className="text-green-200 text-xs font-medium uppercase tracking-wide">From</p>
            <p className="text-white font-medium mt-0.5">{resp.fromName || resp.fromEmail || '—'}</p>
            {resp.fromName && resp.fromEmail && <p className="text-green-200 text-xs mt-0.5">{resp.fromEmail}</p>}
          </div>
          <div>
            <p className="text-green-200 text-xs font-medium uppercase tracking-wide">Received At</p>
            <p className="text-white font-medium mt-0.5">{formatDate(resp.receivedAt)}</p>
          </div>
          {resp.subject && (
            <div className="col-span-2">
              <p className="text-green-200 text-xs font-medium uppercase tracking-wide">Subject</p>
              <p className="text-white mt-0.5">{resp.subject}</p>
            </div>
          )}
        </div>
      </div>

      {/* Attachments */}
      {respAttachments.length > 0 && (
        <div className="px-6 py-3 border-b border-gray-200 bg-amber-50">
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">
            {respAttachments.length} Attachment{respAttachments.length > 1 ? 's' : ''}
          </p>
          <div className="flex flex-wrap gap-2">
            {respAttachments.map((att) => (
              <button
                key={att.id}
                onClick={() => onDownloadAttachment(att)}
                disabled={downloadingAttachment === att.id}
                className="flex items-center gap-2 px-3 py-2 bg-white border border-amber-200 rounded-lg text-sm hover:bg-amber-50 hover:border-amber-400 transition-colors disabled:opacity-60"
              >
                <span className="text-base leading-none">{fileIcon(att.contentType)}</span>
                <span className="max-w-[180px] truncate text-gray-700 font-medium">{att.name}</span>
                <span className="text-gray-400 text-xs flex-shrink-0">{formatFileSize(att.size)}</span>
                {downloadingAttachment === att.id ? (
                  <svg className="w-4 h-4 animate-spin text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* View toggle */}
      {resp.filePath && (resp.htmlBody || resp.body) && (
        <div className="flex items-center gap-2 px-6 py-2 bg-gray-50 border-b border-gray-200 text-xs">
          <span className="text-gray-500">View:</span>
          <button
            onClick={() => setShowFullThread(false)}
            className={`px-2.5 py-1 rounded-full font-medium transition-colors ${!showFullThread ? 'bg-green-600 text-white' : 'text-gray-500 hover:bg-gray-200'}`}
          >
            Reply only
          </button>
          <button
            onClick={loadFullThread}
            className={`px-2.5 py-1 rounded-full font-medium transition-colors ${showFullThread ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-200'}`}
          >
            Full email thread
          </button>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {showFullThread ? (
          loadingThread ? (
            <div className="flex items-center justify-center py-24">
              <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
            </div>
          ) : threadPdfUrl ? (
            <embed src={threadPdfUrl} type="application/pdf" className="w-full h-full min-h-[400px]" title="Full Thread PDF" />
          ) : threadHtml ? (
            <iframe srcDoc={threadHtml} className="w-full h-full min-h-[400px]" title="Full Thread" sandbox="allow-same-origin" />
          ) : (
            <p className="text-sm text-gray-400 p-6">Could not load full thread.</p>
          )
        ) : resp.htmlBody ? (
          <iframe srcDoc={resp.htmlBody} className="w-full h-full min-h-[400px]" title="Response" sandbox="allow-same-origin" />
        ) : resp.body ? (
          <div className="px-6 py-5 text-gray-800 whitespace-pre-wrap leading-relaxed text-sm">{resp.body}</div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <p className="text-sm">Reply content not available</p>
            <p className="text-xs">Run &ldquo;Check Replies&rdquo; to re-capture.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">{label}</span>
      <p className="text-gray-700 mt-0.5 truncate" title={value}>{value}</p>
    </div>
  );
}

function TrailItem({
  type,
  label,
  date,
  subLabel,
  onView,
}: {
  type: 'conf' | 'followup' | 'response';
  label: string;
  date?: string | null;
  subLabel?: string;
  onView?: () => void;
}) {
  const cfg = {
    conf:     { icon: '📧', bg: 'bg-blue-50',   border: 'border-blue-200',  dot: 'bg-blue-500',  text: 'text-blue-700'  },
    followup: { icon: '🔁', bg: 'bg-amber-50',  border: 'border-amber-200', dot: 'bg-amber-500', text: 'text-amber-700' },
    response: { icon: '✅', bg: 'bg-green-50',  border: 'border-green-200', dot: 'bg-green-500', text: 'text-green-700' },
  }[type];

  const formatDate = (d?: string | null) => {
    if (!d) return '—';
    return new Date(d).toLocaleString(undefined, {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  return (
    <div className={`flex items-start gap-3 px-3 py-3 rounded-lg border ${cfg.bg} ${cfg.border}`}>
      <div className={`w-8 h-8 rounded-full ${cfg.dot} flex items-center justify-center text-white text-sm flex-shrink-0 mt-0.5`}>
        {cfg.icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${cfg.text}`}>{label}</p>
        {date && <p className="text-xs text-gray-500 mt-0.5">{formatDate(date)}</p>}
        {subLabel && <p className="text-xs text-gray-600 mt-0.5 truncate">{subLabel}</p>}
      </div>
      {onView && (
        <button
          onClick={onView}
          className="flex-shrink-0 text-xs font-medium text-blue-600 hover:text-blue-800 px-2 py-1 hover:bg-blue-50 rounded transition-colors"
        >
          View →
        </button>
      )}
    </div>
  );
}

function FolderPath({ label, path }: { label: string; path: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(path);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="flex items-center gap-2 mt-1">
      <span className="text-blue-600 font-medium w-24 flex-shrink-0">{label}:</span>
      <span className="text-blue-800 font-mono truncate flex-1" title={path}>{path}</span>
      <button onClick={handleCopy} className="flex-shrink-0 text-blue-600 hover:text-blue-800 transition-colors" title="Copy path">
        {copied ? (
          <svg className="w-3.5 h-3.5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
          </svg>
        )}
      </button>
    </div>
  );
}
