'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MultiSelect } from '@/components/ui/MultiSelect';
import type { MultiValue } from 'react-select';

export type GroupRowWithStatus = {
  groupKey: string;
  lineItemIds: string[];
  lineCount: number;
  emailTo: string;
  emailCc: string | null;
  emailConflict: boolean;
  companyName: string;
  customerName: string;
  customerCode: string;
  emailCount: number;
  followupCount: number;
  totalEmailsCount: number;
  lastSentAt: string | null;
  hasResponse: boolean;
  hasUnansweredSent: boolean;
};

type CompanyOption = { companyCode: string; companyName: string };

type Props = {
  mode: 'send' | 'followup';
  importId: string;
  grouping: 'name' | 'code';
  /** When set, same company filter as bulk email list */
  companyCode?: string;
  /** Seed company name filter from bulk-email table column filter (on mount only) */
  initialCompanyNames?: string[];
  onClose: () => void;
  onComplete: () => void;
};

export default function BulkPreviewModal({
  mode,
  importId,
  grouping,
  companyCode,
  initialCompanyNames,
  onClose,
  onComplete,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(true);
  const [groups, setGroups] = useState<GroupRowWithStatus[]>([]);
  const [selectedCompanyNames, setSelectedCompanyNames] = useState<string[]>(() =>
    initialCompanyNames && initialCompanyNames.length > 0 ? [...initialCompanyNames] : []
  );
  const [onlyNeverSent, setOnlyNeverSent] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());

  /** 1 = customer list, 2 = email body preview (sample) */
  const [step, setStep] = useState<1 | 2>(1);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewSubject, setPreviewSubject] = useState('');
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewCaption, setPreviewCaption] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const sp = new URLSearchParams();
      sp.set('importId', importId);
      sp.set('grouping', grouping);
      if (companyCode?.trim()) sp.set('companyCode', companyCode.trim());
      for (const n of selectedCompanyNames) {
        if (n.trim()) sp.append('companyNames', n.trim());
      }
      const res = await fetch(`/api/aging/groups?${sp.toString()}`);
      const data = await res.json();
      setGroups(data.groups || []);
    } catch {
      setMessage('Failed to load groups');
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [importId, grouping, companyCode, selectedCompanyNames]);

  useEffect(() => {
    let cancelled = false;
    setCompaniesLoading(true);
    (async () => {
      try {
        const res = await fetch(
          `/api/aging/distinct-companies?importId=${encodeURIComponent(importId)}`
        );
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setCompanies([]);
          return;
        }
        setCompanies(data.companies || []);
      } catch {
        if (!cancelled) setCompanies([]);
      } finally {
        if (!cancelled) setCompaniesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [importId]);

  useEffect(() => {
    load();
  }, [load]);

  const companySelectOptions = useMemo(() => {
    const fromApi = companies.map((c) => ({
      value: c.companyName,
      label: c.companyName
        ? `${c.companyName} (${c.companyCode})`
        : c.companyCode,
    }));
    const have = new Set(fromApi.map((o) => o.value));
    const extras = selectedCompanyNames
      .filter((n) => !have.has(n))
      .map((n) => ({ value: n, label: n }));
    return [...fromApi, ...extras];
  }, [companies, selectedCompanyNames]);

  const companySelectValue: MultiValue<{ value: string; label: string }> = useMemo(
    () =>
      selectedCompanyNames.map((v) => {
        const o = companySelectOptions.find((x) => x.value === v);
        return o ?? { value: v, label: v };
      }),
    [selectedCompanyNames, companySelectOptions]
  );

  useEffect(() => {
    setStep(1);
  }, [onlyNeverSent]);

  const eligibleSend = useMemo(() => groups.filter((g) => g.totalEmailsCount === 0), [groups]);
  const sendList = useMemo(
    () => (onlyNeverSent ? eligibleSend : groups),
    [onlyNeverSent, eligibleSend, groups]
  );
  const eligibleFollowup = useMemo(() => groups.filter((g) => g.hasUnansweredSent), [groups]);

  const tableRows = useMemo(
    () => (mode === 'send' ? sendList : eligibleFollowup),
    [mode, sendList, eligibleFollowup]
  );

  const rowKeySig = useMemo(() => tableRows.map((g) => g.groupKey).join('\0'), [tableRows]);

  // Default: all rows in the current list selected
  useEffect(() => {
    setSelectedKeys(new Set(tableRows.map((g) => g.groupKey)));
  }, [rowKeySig]);

  const selectedCount = useMemo(
    () => tableRows.filter((g) => selectedKeys.has(g.groupKey)).length,
    [tableRows, selectedKeys]
  );

  const filteredRows = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return tableRows;
    return tableRows.filter(
      (g) =>
        g.customerName.toLowerCase().includes(s) ||
        g.customerCode.toLowerCase().includes(s) ||
        (g.emailTo || '').toLowerCase().includes(s) ||
        (g.emailCc || '').toLowerCase().includes(s) ||
        (g.companyName || '').toLowerCase().includes(s) ||
        g.groupKey.toLowerCase().includes(s)
    );
  }, [tableRows, search]);

  const allInListSelected =
    tableRows.length > 0 && tableRows.every((g) => selectedKeys.has(g.groupKey));
  const someInListSelected = tableRows.some((g) => selectedKeys.has(g.groupKey)) && !allInListSelected;

  const toggleKey = (key: string) => {
    setSelectedKeys((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  };

  const selectAllInList = () => {
    setSelectedKeys(new Set(tableRows.map((g) => g.groupKey)));
  };

  const deselectAllInList = () => {
    setSelectedKeys(new Set());
  };

  const selectedGroupKeys = useMemo(
    () => tableRows.filter((g) => selectedKeys.has(g.groupKey)).map((g) => g.groupKey),
    [tableRows, selectedKeys]
  );

  const firstSelectedGroup = useMemo(
    () => tableRows.find((g) => selectedKeys.has(g.groupKey)) ?? null,
    [tableRows, selectedKeys]
  );

  // Load email preview for first *selected* group
  useEffect(() => {
    if (step !== 2 || !firstSelectedGroup || firstSelectedGroup.lineItemIds.length === 0) {
      return;
    }

    let cancelled = false;
    (async () => {
      setPreviewLoading(true);
      setPreviewError(null);
      try {
        const res = await fetch('/api/aging/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            importId,
            lineItemIds: firstSelectedGroup.lineItemIds,
            grouping,
            mode: mode === 'followup' ? 'followup' : 'send',
            customerName: firstSelectedGroup.customerName,
            customerCode: firstSelectedGroup.customerCode,
            companyName: firstSelectedGroup.companyName,
          }),
        });
        const d = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setPreviewError(d.error || 'Failed to load email preview');
          setPreviewSubject('');
          setPreviewHtml('');
          setPreviewCaption('');
          return;
        }
        setPreviewSubject(d.subject || '');
        setPreviewHtml(d.htmlBody || '');
        setPreviewCaption(
          `${firstSelectedGroup.customerName} · ${d.invoiceCount ?? firstSelectedGroup.lineItemIds.length} invoice(s) in this group`
        );
      } catch (e) {
        if (!cancelled) {
          setPreviewError(e instanceof Error ? e.message : 'Failed to load email preview');
        }
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, firstSelectedGroup, importId, grouping, mode]);

  const onConfirm = async () => {
    if (selectedCount === 0 || selectedGroupKeys.length === 0) return;
    setBusy(true);
    setMessage(null);
    try {
      if (mode === 'send') {
        const res = await fetch('/api/aging/bulk-send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            importId,
            grouping,
            onlyNeverSent,
            groupKeys: selectedGroupKeys,
            ...(companyCode?.trim() ? { companyCode: companyCode.trim() } : {}),
          }),
        });
        const d = await res.json();
        if (res.ok) {
          setMessage(`Sent: ${d.sent}, skipped: ${d.skipped}, error(s): ${d.errors?.length || 0}`);
          onComplete();
        } else {
          setMessage(d.error || 'Failed');
        }
      } else {
        const res = await fetch('/api/aging/bulk-followup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            importId,
            grouping,
            groupKeys: selectedGroupKeys,
            ...(companyCode?.trim() ? { companyCode: companyCode.trim() } : {}),
          }),
        });
        const d = await res.json();
        if (res.ok) {
          setMessage(
            `Follow-up: ${d.sent} sent, ${d.skipped} skipped, ${d.errors?.length || 0} error(s)`
          );
          onComplete();
        } else {
          setMessage(d.error || 'Failed');
        }
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" role="dialog" aria-modal>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {mode === 'send' ? 'Bulk send preview' : 'Bulk follow-up preview'}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Step {step} of 2
              {step === 1 ? ' — Recipients' : ' — Email body (sample)'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-700 text-xl leading-none">
            ×
          </button>
        </div>

        <div className="p-4 space-y-4 flex-1 overflow-y-auto text-sm min-h-0">
          {step === 1 ? (
            <>
              {message && (
                <div className="text-sm text-blue-800 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                  {message}
                </div>
              )}

              <div className="space-y-1.5 z-20 relative">
                <MultiSelect
                  label="Companies"
                  isLoading={companiesLoading}
                  isDisabled={companiesLoading}
                  placeholder="All companies"
                  isClearable
                  options={companySelectOptions}
                  value={companySelectValue}
                  onChange={(sel) => {
                    const list = Array.isArray(sel) ? sel : [];
                    setSelectedCompanyNames(
                      (list as { value: string }[]).map((x) => x.value)
                    );
                  }}
                />
                <p className="text-gray-500 text-xs">
                  Filter which companies appear in this list. Clear to show all companies.
                </p>
                {!companiesLoading && companies.length === 0 && (
                  <p className="text-gray-500 text-xs">No companies in this import.</p>
                )}
              </div>

              <p className="text-gray-700">
                <strong>{selectedCount}</strong> of {tableRows.length} recipient
                {tableRows.length === 1 ? '' : 's'} selected
                {mode === 'send' && onlyNeverSent && ' (only never-emailed)'}
                {mode === 'send' && !onlyNeverSent && ' (all in import)'}
                {mode === 'followup' && ' (follow-up candidates)'}.
              </p>
              <p className="text-gray-500 text-xs">
                Use the checkboxes to include or exclude customers. <strong>Next</strong> shows a sample email for
                the first <em>selected</em> customer in list order. Confirm sends only to selected rows.
              </p>

              {mode === 'send' && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={onlyNeverSent}
                    onChange={(e) => setOnlyNeverSent(e.target.checked)}
                  />
                  <span>Only show customers with no email triggered yet (recommended)</span>
                </label>
              )}

              <div className={`flex flex-wrap gap-2 items-center ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className="flex-1 min-w-[200px]">
                  <label htmlFor="bulk-prev-search" className="sr-only">
                    Search recipients
                  </label>
                  <input
                    id="bulk-prev-search"
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by name, code, company, email…"
                    className="w-full h-9 px-3 border border-gray-300 rounded-lg text-sm bg-white"
                    disabled={loading}
                  />
                </div>
                <div className="flex flex-wrap gap-1.5 text-xs">
                  <button
                    type="button"
                    onClick={selectAllInList}
                    disabled={loading}
                    className="px-2.5 py-1.5 border border-gray-200 rounded-md hover:bg-gray-50"
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={deselectAllInList}
                    disabled={loading}
                    className="px-2.5 py-1.5 border border-gray-200 rounded-md hover:bg-gray-50"
                  >
                    Deselect all
                  </button>
                </div>
              </div>

              <div className="border border-gray-200 rounded-lg overflow-x-auto max-h-72 overflow-y-auto">
                {loading ? (
                  <p className="p-4 text-gray-500">Loading…</p>
                ) : (
                <>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-gray-600 sticky top-0">
                    <tr>
                      <th className="px-2 py-2 w-10">
                        <input
                          type="checkbox"
                          checked={allInListSelected}
                          ref={(el) => {
                            if (el) el.indeterminate = someInListSelected;
                          }}
                          onChange={() => (allInListSelected ? deselectAllInList() : selectAllInList())}
                          title="Select or clear all in list"
                        />
                      </th>
                      <th className="px-3 py-2">Customer</th>
                      <th className="px-3 py-2">Code</th>
                      <th className="px-3 py-2">Email</th>
                      <th className="px-3 py-2">Last sent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((g) => (
                      <tr key={g.groupKey} className="border-t border-gray-100 hover:bg-gray-50/80">
                        <td className="px-2 py-2">
                          <input
                            type="checkbox"
                            checked={selectedKeys.has(g.groupKey)}
                            onChange={() => toggleKey(g.groupKey)}
                            aria-label={`Select ${g.customerName}`}
                          />
                        </td>
                        <td className="px-3 py-2 font-medium text-gray-900">{g.customerName}</td>
                        <td className="px-3 py-2 text-gray-600">{g.customerCode}</td>
                        <td className="px-3 py-2 break-all text-sm">
                          <div>
                            <span className="text-gray-500">To:</span> {g.emailTo || '—'}
                          </div>
                          {g.emailCc ? (
                            <div className="text-gray-600 mt-0.5">
                              <span className="text-gray-500">Cc:</span> {g.emailCc}
                            </div>
                          ) : null}
                          {g.emailConflict && (
                            <span className="ml-1 text-amber-700 text-xs">(emails differ)</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-gray-500">
                          {g.lastSentAt
                            ? new Date(g.lastSentAt).toLocaleString(undefined, {
                                dateStyle: 'short',
                                timeStyle: 'short',
                              })
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {tableRows.length === 0 && (
                  <p className="p-4 text-gray-500">No matching groups for this action.</p>
                )}
                {tableRows.length > 0 && filteredRows.length === 0 && (
                  <p className="p-4 text-gray-500">No rows match your search.</p>
                )}
                </>
                )}
              </div>
            </>
          ) : (
            <>
              <p className="text-gray-600 text-sm">
                {mode === 'send'
                  ? 'This is a sample for the first selected customer in your list. The layout is the same for each recipient, with their own line items and totals.'
                  : 'Sample follow-up for the first selected customer. Each selected recipient gets the follow-up body with their own invoices.'}
              </p>
              {previewCaption && (
                <p className="text-xs text-gray-500">
                  <strong>Sample:</strong> {previewCaption}
                </p>
              )}

              {previewError && (
                <div className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {previewError}
                </div>
              )}

              {previewLoading ? (
                <div className="flex items-center gap-2 text-gray-600 py-8 justify-center">
                  <div className="h-5 w-5 border-2 border-gray-200 border-t-blue-600 rounded-full animate-spin" />
                  Loading email preview…
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Subject</label>
                    <div className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-900">
                      {previewSubject || '—'}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Email body</label>
                    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                      <iframe
                        title="Email body preview"
                        className="w-full min-h-[360px] border-0"
                        srcDoc={previewHtml}
                        sandbox="allow-same-origin"
                      />
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <div className="px-4 py-3 border-t border-gray-200 flex justify-end gap-2 flex-wrap">
          {step === 1 ? (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={busy || loading || selectedCount === 0}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-50"
              >
                Next: email preview
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setStep(1)}
                disabled={busy}
                className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Back
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={busy || loading || selectedCount === 0}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-50"
              >
                {busy ? '…' : 'Confirm and send'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
