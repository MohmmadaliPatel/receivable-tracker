'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { htmlEmailToPlainText, plainTextToHtmlBody, plainTextsEqual } from '@/lib/email-plain-text';

interface RecordPreview {
  id: string;
  entityName: string;
  category: string;
  bankName: string | null;
  emailTo: string;
  emailCc: string | null;
  remarks: string | null;
  attachmentName: string | null;
}

interface EditableRecord extends RecordPreview {
  editTo: string;
  editCc: string;
  editRemarks: string;
  skip: boolean;
}

interface CategoryGroup {
  category: string;
  records: EditableRecord[];
  htmlPreview: string;
  baselinePlainText: string;
  bodyText: string;
}

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
  const [step, setStep] = useState<'loading' | 'preview' | 'sending' | 'done'>('loading');
  const [groups, setGroups] = useState<CategoryGroup[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [editingRecord, setEditingRecord] = useState<string | null>(null);
  const [bodyMode, setBodyMode] = useState<'preview' | 'edit'>('preview');
  const [results, setResults] = useState<BulkSendResult[]>([]);
  const [summary, setSummary] = useState<{ sent: number; failed: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emailLimit, setEmailLimit] = useState<{ used: number; remaining: number } | null>(null);

  const loadPreview = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      selectedEntities.forEach((e) => params.append('entity', e));
      selectedCategories.forEach((c) => params.append('category', c));
      params.set('status', 'not_sent');

      const res = await fetch(`/api/confirmations?${params.toString()}`);
      const data = await res.json();
      const records: RecordPreview[] = data.records || [];

      // Check email limit
      const limitRes = await fetch('/api/confirmations/email-limit');
      if (limitRes.ok) {
        const limitData = await limitRes.json();
        setEmailLimit(limitData);
      }

      // Fetch HTML previews for each category
      const categorySet = [...new Set(records.map((r) => r.category))];
      const previewRes = await fetch('/api/confirmations/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categories: categorySet }),
      });
      const previewData = previewRes.ok ? await previewRes.json() : { previews: {} };

      const categoryGroups: CategoryGroup[] = categorySet.map((cat) => {
        const html = previewData.previews?.[cat] || '<p>Preview unavailable</p>';
        const plain = htmlEmailToPlainText(html);
        return {
          category: cat,
          records: records
            .filter((r) => r.category === cat)
            .map((r) => ({
              ...r,
              editTo: r.emailTo,
              editCc: r.emailCc || '',
              editRemarks: r.remarks || '',
              skip: false,
            })),
          htmlPreview: html,
          baselinePlainText: plain,
          bodyText: plain,
        };
      });

      setGroups(categoryGroups);
      setActiveCategory(categoryGroups[0]?.category || null);
      setStep('preview');
    } catch {
      setError('Failed to load preview');
      setStep('preview');
    }
  }, [selectedEntities, selectedCategories]);

  useEffect(() => { loadPreview(); }, [loadPreview]);

  const totalActive = groups.reduce((sum, g) => sum + g.records.filter((r) => !r.skip).length, 0);

  const handleSend = async () => {
    setStep('sending');
    setError(null);

    const recordEdits = groups.flatMap((g) =>
      g.records.filter((r) => !r.skip).map((r) => ({
        id: r.id,
        emailTo: r.editTo,
        emailCc: r.editCc || undefined,
        remarks: r.editRemarks || undefined,
      }))
    );

    // Per-category custom bodies when plain text was changed from baseline
    const categoryBodies: Record<string, string> = {};
    for (const g of groups) {
      if (!plainTextsEqual(g.bodyText, g.baselinePlainText)) {
        categoryBodies[g.category] = plainTextToHtmlBody(g.bodyText);
      }
    }

    try {
      const res = await fetch('/api/confirmations/bulk-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityNames: selectedEntities.length ? selectedEntities : undefined,
          categories: selectedCategories.length ? selectedCategories : undefined,
          includeNotSentOnly: true,
          recordEdits,
          categoryBodies: Object.keys(categoryBodies).length ? categoryBodies : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Bulk send failed');
        setStep('preview');
        return;
      }

      setResults(data.results || []);
      setSummary({ sent: data.sent, failed: data.failed, total: data.total });
      setStep('done');
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
      setStep('preview');
    }
  };

  const activeGroup = groups.find((g) => g.category === activeCategory);

  const activePreviewHtml = useMemo(() => {
    if (!activeGroup) return '';
    return plainTextsEqual(activeGroup.bodyText, activeGroup.baselinePlainText)
      ? activeGroup.htmlPreview
      : plainTextToHtmlBody(activeGroup.bodyText);
  }, [activeGroup]);

  const updateRecord = (recordId: string, updates: Partial<EditableRecord>) => {
    setGroups((prev) =>
      prev.map((g) => ({
        ...g,
        records: g.records.map((r) => (r.id === recordId ? { ...r, ...updates } : r)),
      }))
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Bulk Send Confirmations</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {step === 'loading' && 'Loading preview…'}
              {step === 'preview' && `${totalActive} emails ready — review & edit before sending`}
              {step === 'sending' && `Sending ${totalActive} emails…`}
              {step === 'done' && 'Send complete'}
            </p>
          </div>
          {step !== 'sending' && (
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

        <div className="flex-1 overflow-hidden flex flex-col">
          {step === 'loading' && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="animate-spin w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full" />
              <p className="text-gray-500 text-sm">Preparing email preview…</p>
            </div>
          )}

          {step === 'preview' && (
            <div className="flex-1 flex overflow-hidden">
              {/* Category tabs (left panel) */}
              <div className="w-56 border-r border-gray-200 bg-gray-50 flex flex-col flex-shrink-0">
                <div className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-200">
                  Categories
                </div>
                <div className="flex-1 overflow-y-auto">
                  {groups.map((g) => {
                    const activeCount = g.records.filter((r) => !r.skip).length;
                    return (
                      <button
                        key={g.category}
                        onClick={() => { setActiveCategory(g.category); setBodyMode('preview'); }}
                        className={`w-full text-left px-4 py-3 text-sm border-b border-gray-100 transition-colors ${
                          activeCategory === g.category
                            ? 'bg-white border-l-2 border-l-blue-600 font-medium text-gray-900'
                            : 'hover:bg-gray-100 text-gray-600'
                        }`}
                      >
                        <span className="block truncate">{g.category}</span>
                        <span className="text-xs text-gray-400">{activeCount} email{activeCount !== 1 ? 's' : ''}</span>
                      </button>
                    );
                  })}
                </div>

                {emailLimit && (
                  <div className="px-4 py-3 border-t border-gray-200 text-xs">
                    <div className="flex justify-between text-gray-500">
                      <span>Sent today</span>
                      <span className={emailLimit.remaining < totalActive ? 'text-red-600 font-medium' : ''}>
                        {emailLimit.used}/100
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-200 rounded-full mt-1.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${emailLimit.used >= 100 ? 'bg-red-500' : emailLimit.used > 70 ? 'bg-amber-500' : 'bg-blue-500'}`}
                        style={{ width: `${Math.min(100, emailLimit.used)}%` }}
                      />
                    </div>
                    {emailLimit.remaining < totalActive && (
                      <p className="text-red-600 mt-1.5 font-medium">
                        Only {emailLimit.remaining} emails remaining today
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Records list + preview (right panel) */}
              <div className="flex-1 flex flex-col overflow-hidden">
                {activeGroup && (
                  <>
                    {/* Email body header with preview/edit toggle */}
                    <div className="border-b border-gray-200 bg-gray-50 px-4 py-2 flex items-center justify-between flex-shrink-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-gray-500">EMAIL BODY</span>
                        <span className="text-xs text-gray-400">— applies to all records in this category</span>
                        {!plainTextsEqual(activeGroup.bodyText, activeGroup.baselinePlainText) && (
                          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Edited</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-0.5">
                        <button
                          onClick={() => setBodyMode('preview')}
                          className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                            bodyMode === 'preview' ? 'bg-blue-600 text-white font-medium' : 'text-gray-500 hover:text-gray-700'
                          }`}
                        >
                          Preview
                        </button>
                        <button
                          onClick={() => setBodyMode('edit')}
                          className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                            bodyMode === 'edit' ? 'bg-blue-600 text-white font-medium' : 'text-gray-500 hover:text-gray-700'
                          }`}
                        >
                          Edit text
                        </button>
                        {!plainTextsEqual(activeGroup.bodyText, activeGroup.baselinePlainText) && (
                          <button
                            onClick={() => {
                              setGroups((prev) =>
                                prev.map((g) =>
                                  g.category === activeCategory
                                    ? { ...g, bodyText: g.baselinePlainText }
                                    : g
                                )
                              );
                            }}
                            className="px-2.5 py-1 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors"
                          >
                            Reset
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Email HTML preview or editor */}
                    <div className="h-48 border-b border-gray-200 flex-shrink-0 overflow-hidden relative">
                      {bodyMode === 'preview' ? (
                        <iframe
                          srcDoc={activePreviewHtml}
                          className="w-full h-full border-none"
                          title="Email preview"
                          sandbox="allow-same-origin"
                        />
                      ) : (
                        <textarea
                          value={activeGroup.bodyText}
                          onChange={(e) => {
                            const t = e.target.value;
                            setGroups((prev) =>
                              prev.map((g) =>
                                g.category === activeCategory ? { ...g, bodyText: t } : g
                              )
                            );
                          }}
                          className="w-full h-full px-3 py-2 text-sm text-gray-800 border-none focus:outline-none focus:ring-0 resize-none"
                          placeholder="Edit the email message text for this category…"
                        />
                      )}
                    </div>

                    {/* Records table */}
                    <div className="flex-1 overflow-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr className="border-b border-gray-200">
                            <th className="text-left px-3 py-2 text-gray-600 font-semibold w-8">
                              <input
                                type="checkbox"
                                checked={activeGroup.records.every((r) => !r.skip)}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  activeGroup.records.forEach((r) => updateRecord(r.id, { skip: !checked }));
                                }}
                                className="rounded"
                              />
                            </th>
                            <th className="text-left px-3 py-2 text-gray-600 font-semibold">Entity</th>
                            <th className="text-left px-3 py-2 text-gray-600 font-semibold">Bank/Party</th>
                            <th className="text-left px-3 py-2 text-gray-600 font-semibold">Email To</th>
                            <th className="text-left px-3 py-2 text-gray-600 font-semibold">CC</th>
                            <th className="text-left px-3 py-2 text-gray-600 font-semibold w-16">Attach</th>
                            <th className="text-right px-3 py-2 text-gray-600 font-semibold w-12"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {activeGroup.records.map((r) => (
                            <tr
                              key={r.id}
                              className={`transition-colors ${r.skip ? 'opacity-40 bg-gray-50' : 'hover:bg-gray-50'}`}
                            >
                              <td className="px-3 py-2.5">
                                <input
                                  type="checkbox"
                                  checked={!r.skip}
                                  onChange={() => updateRecord(r.id, { skip: !r.skip })}
                                  className="rounded"
                                />
                              </td>
                              <td className="px-3 py-2.5 text-gray-900 font-medium text-xs">{r.entityName}</td>
                              <td className="px-3 py-2.5 text-gray-600 text-xs">{r.bankName || '—'}</td>
                              <td className="px-3 py-2.5">
                                {editingRecord === r.id ? (
                                  <input
                                    type="text"
                                    value={r.editTo}
                                    onChange={(e) => updateRecord(r.id, { editTo: e.target.value })}
                                    className="w-full text-xs px-2 py-1 border border-gray-300 rounded"
                                  />
                                ) : (
                                  <span className="text-xs text-gray-600 truncate block max-w-[200px]" title={r.editTo}>
                                    {r.editTo}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2.5">
                                {editingRecord === r.id ? (
                                  <input
                                    type="text"
                                    value={r.editCc}
                                    onChange={(e) => updateRecord(r.id, { editCc: e.target.value })}
                                    className="w-full text-xs px-2 py-1 border border-gray-300 rounded"
                                    placeholder="CC"
                                  />
                                ) : (
                                  <span className="text-xs text-gray-400 truncate block max-w-[150px]" title={r.editCc}>
                                    {r.editCc || '—'}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-xs">
                                {r.attachmentName ? (
                                  <span className="text-green-600" title={r.attachmentName}>✓</span>
                                ) : (
                                  <span className="text-gray-300">—</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                <button
                                  onClick={() => setEditingRecord(editingRecord === r.id ? null : r.id)}
                                  className={`text-xs px-2 py-1 rounded transition-colors ${
                                    editingRecord === r.id
                                      ? 'bg-blue-600 text-white'
                                      : 'text-blue-600 hover:bg-blue-50'
                                  }`}
                                >
                                  {editingRecord === r.id ? 'Done' : 'Edit'}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {step === 'sending' && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full" />
              <p className="text-gray-600 font-medium">Sending {totalActive} emails…</p>
              <p className="text-sm text-gray-400">Please do not close this window</p>
            </div>
          )}

          {step === 'done' && summary && (
            <div className="flex-1 overflow-auto px-6 py-6 space-y-4">
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

              {results.length > 0 && (
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="max-h-60 overflow-y-auto divide-y divide-gray-100">
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
        </div>

        {error && (
          <div className="mx-6 mb-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-between items-center flex-shrink-0">
          <div className="text-sm text-gray-500">
            {step === 'preview' && `${totalActive} emails selected`}
          </div>
          <div className="flex gap-3">
            {step === 'done' ? (
              <button
                onClick={onComplete}
                className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors"
              >
                Done
              </button>
            ) : step === 'preview' ? (
              <>
                <button
                  onClick={onClose}
                  className="px-5 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSend}
                  disabled={totalActive === 0 || (emailLimit ? emailLimit.remaining < totalActive : false)}
                  className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                  Send {totalActive} Emails
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
