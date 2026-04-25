'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { EmailAddressList } from '@/components/EmailAddressList';
import { MultiSelect } from '@/components/ui/MultiSelect';
import type { MultiValue } from 'react-select';
import { usePdfFolder } from '@/hooks/usePdfFolder';

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

type BulkLineDocumentRow = {
  id: string;
  documentNo: string;
  customerName: string;
  customerCode: string;
};

type DocPdfViewFilter = 'all' | 'found' | 'not_found';

function formatBulkFollowupResultMessage(d: {
  sent?: number;
  skipped?: number;
  errors?: string[];
}): string {
  const sent = d.sent ?? 0;
  const skipped = d.skipped ?? 0;
  const errList = Array.isArray(d.errors) ? d.errors : [];
  const head = `Follow-up: ${sent} sent, ${skipped} skipped, ${errList.length} error(s)`;
  if (errList.length > 0) {
    const detail = errList.slice(0, 8).join('\n');
    const out = `${head}\n\n${detail}`;
    return out.length > 800 ? `${out.slice(0, 797)}…` : out;
  }
  if (sent === 0 && skipped > 0) {
    return `${head}\n\nNo messages sent. Groups may be missing a Microsoft 365 message for this ageing file (re-send the initial), or To addresses are invalid.`;
  }
  return head;
}

function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function buildPdfMatchCsv(
  rows: BulkLineDocumentRow[],
  statusById: Record<string, 'found' | 'not_found' | 'na'>,
  pdfCheckBusy: boolean
): string {
  const lines = rows.map((row) => {
    const st = statusById[row.id];
    let label = '…';
    if (!pdfCheckBusy && st !== undefined) {
      if (st === 'found') {
        label = 'Found';
      } else if (st === 'not_found') {
        label = 'Not found';
      } else {
        label = 'n/a';
      }
    }
    return [
      escapeCsvField(String(row.documentNo || '')),
      escapeCsvField(row.customerName),
      escapeCsvField(row.customerCode),
      escapeCsvField(label),
    ].join(',');
  });
  return ['Document no.,Customer,Code,PDF in folder', ...lines].join('\n');
}

function downloadCsvFile(filename: string, csv: string) {
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

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

  const { pickFolder, getPdfFile, folderName, isReady, isSupported, error: folderPickError } =
    usePdfFolder();
  const [docLines, setDocLines] = useState<BulkLineDocumentRow[]>([]);
  const [docLinesLoading, setDocLinesLoading] = useState(false);
  const [docLinesError, setDocLinesError] = useState<string | null>(null);
  const [pdfByLineId, setPdfByLineId] = useState<Record<string, 'found' | 'not_found' | 'na'>>({});
  const [pdfCheckBusy, setPdfCheckBusy] = useState(false);
  const [pdfViewFilter, setPdfViewFilter] = useState<DocPdfViewFilter>('all');

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

  const selectedLineItemIds = useMemo(() => {
    const set = new Set<string>();
    for (const g of tableRows) {
      if (selectedKeys.has(g.groupKey)) {
        for (const id of g.lineItemIds) {
          set.add(id);
        }
      }
    }
    return [...set];
  }, [tableRows, selectedKeys]);

  const lineIdsKey = useMemo(() => selectedLineItemIds.slice().sort().join(','), [selectedLineItemIds]);

  const pdfMatchCounts = useMemo(() => {
    let found = 0;
    let notFound = 0;
    for (const row of docLines) {
      const st = pdfByLineId[row.id];
      if (pdfCheckBusy || st === undefined) continue;
      if (st === 'found') found += 1;
      else if (st === 'not_found') notFound += 1;
    }
    return { found, notFound };
  }, [docLines, pdfByLineId, pdfCheckBusy]);

  const filteredDocLines = useMemo(() => {
    if (pdfViewFilter === 'all') {
      return docLines;
    }
    return docLines.filter((row) => {
      const st = pdfByLineId[row.id];
      if (pdfCheckBusy || st === undefined) {
        return false;
      }
      if (pdfViewFilter === 'found') {
        return st === 'found';
      }
      return st === 'not_found';
    });
  }, [docLines, pdfViewFilter, pdfByLineId, pdfCheckBusy]);

  const foundOnlyRows = useMemo(
    () => docLines.filter((r) => pdfByLineId[r.id] === 'found'),
    [docLines, pdfByLineId]
  );
  const notFoundOnlyRows = useMemo(
    () => docLines.filter((r) => pdfByLineId[r.id] === 'not_found'),
    [docLines, pdfByLineId]
  );

  const exportPdfCsv = useCallback(
    (rows: BulkLineDocumentRow[], filenamePart: string) => {
      const csv = buildPdfMatchCsv(rows, pdfByLineId, pdfCheckBusy);
      downloadCsvFile(`receivables-pdf-${filenamePart}.csv`, csv);
    },
    [pdfByLineId, pdfCheckBusy]
  );

  useEffect(() => {
    if (!isReady) {
      setDocLines([]);
      setDocLinesError(null);
      setDocLinesLoading(false);
      setPdfByLineId({});
      setPdfCheckBusy(false);
      setPdfViewFilter('all');
      return;
    }
    if (!importId || selectedLineItemIds.length === 0) {
      setDocLines([]);
      setDocLinesError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setDocLinesLoading(true);
      setDocLinesError(null);
      try {
        const res = await fetch('/api/aging/bulk-line-documents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ importId, lineItemIds: selectedLineItemIds }),
        });
        const d = (await res.json()) as { lines?: BulkLineDocumentRow[]; error?: string };
        if (cancelled) return;
        if (!res.ok) {
          throw new Error(d.error || 'Failed to load line items');
        }
        setDocLines(d.lines || []);
      } catch (e) {
        if (!cancelled) {
          setDocLinesError(e instanceof Error ? e.message : 'Failed to load');
          setDocLines([]);
        }
      } finally {
        if (!cancelled) setDocLinesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isReady, importId, lineIdsKey]);

  useEffect(() => {
    if (!isReady || docLines.length === 0) {
      setPdfByLineId({});
      setPdfCheckBusy(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setPdfCheckBusy(true);
      const next: Record<string, 'found' | 'not_found' | 'na'> = {};
      const uniqueNos = new Set<string>();
      for (const row of docLines) {
        const dn = String(row.documentNo).trim();
        if (dn) uniqueNos.add(dn);
      }
      const statusByDocNo = new Map<string, 'found' | 'not_found'>();
      for (const dn of uniqueNos) {
        if (cancelled) return;
        const file = await getPdfFile(dn);
        if (cancelled) return;
        statusByDocNo.set(dn, file ? 'found' : 'not_found');
      }
      for (const row of docLines) {
        const dn = String(row.documentNo).trim();
        if (!dn) {
          next[row.id] = 'na';
        } else {
          next[row.id] = statusByDocNo.get(dn) ?? 'not_found';
        }
      }
      if (!cancelled) {
        setPdfByLineId(next);
        setPdfCheckBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isReady, docLines, getPdfFile]);

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
        const payload = {
          importId,
          grouping,
          onlyNeverSent,
          groupKeys: selectedGroupKeys,
          ...(companyCode?.trim() ? { companyCode: companyCode.trim() } : {}),
        };
        let res: Response;
        if (isReady) {
          const form = new FormData();
          form.append('payload', JSON.stringify(payload));
          const uniqueDocNos = new Set<string>();
          for (const row of docLines) {
            const dn = String(row.documentNo || '').trim();
            if (dn) uniqueDocNos.add(dn);
          }
          for (const dn of uniqueDocNos) {
            const file = await getPdfFile(dn);
            if (file && file.size > 0) {
              form.append(
                `pdf:${encodeURIComponent(dn)}`,
                file,
                file.name && file.name.toLowerCase().endsWith('.pdf') ? file.name : `${dn}.pdf`
              );
            }
          }
          res = await fetch('/api/aging/bulk-send', { method: 'POST', body: form });
        } else {
          res = await fetch('/api/aging/bulk-send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
        }
        const d = await res.json();
        if (res.ok) {
          setMessage(`Sent: ${d.sent}, skipped: ${d.skipped}, error(s): ${d.errors?.length || 0}`);
          onComplete();
        } else {
          setMessage(d.error || 'Failed');
        }
      } else {
        const payload = {
          importId,
          grouping,
          groupKeys: selectedGroupKeys,
          ...(companyCode?.trim() ? { companyCode: companyCode.trim() } : {}),
        };
        let res: Response;
        if (isReady) {
          const form = new FormData();
          form.append('payload', JSON.stringify(payload));
          const uniqueDocNos = new Set<string>();
          for (const row of docLines) {
            const dn = String(row.documentNo || '').trim();
            if (dn) uniqueDocNos.add(dn);
          }
          for (const dn of uniqueDocNos) {
            const file = await getPdfFile(dn);
            if (file && file.size > 0) {
              form.append(
                `pdf:${encodeURIComponent(dn)}`,
                file,
                file.name && file.name.toLowerCase().endsWith('.pdf') ? file.name : `${dn}.pdf`
              );
            }
          }
          res = await fetch('/api/aging/bulk-followup', { method: 'POST', body: form });
        } else {
          res = await fetch('/api/aging/bulk-followup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
        }
        const d = await res.json();
        if (res.ok) {
          setMessage(formatBulkFollowupResultMessage(d));
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

              <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-3 space-y-2">
                <h3 className="text-sm font-semibold text-gray-900">Local PDF folder (optional)</h3>
                {!isSupported && (
                  <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
                    Folder access requires a Chromium-based browser (Chrome or Edge). Safari and Firefox
                    cannot read a local folder here.
                  </p>
                )}
                {folderPickError && <p className="text-xs text-red-600">{folderPickError}</p>}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void pickFolder()}
                    disabled={!isSupported || loading}
                    className="px-3 py-1.5 text-xs font-medium rounded-md bg-gray-900 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Select local PDF folder
                  </button>
                  {isReady && folderName && (
                    <span className="flex items-center gap-1.5 text-xs text-gray-700">
                      <span
                        className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-100 text-emerald-800"
                        aria-hidden
                      >
                        <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="2">
                          <path d="M2 6l2.5 2.5L10 3" />
                        </svg>
                      </span>
                      {folderName}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500">
                  Each PDF should be named <code className="rounded bg-white px-1">{'{Document No}.pdf'}</code>{' '}
                  (same as the import&apos;s document number, flat folder). If the same document number appears
                  on multiple lines, one file in the folder is matched for <strong>all</strong> of those lines.
                  Matches use <strong>selected</strong> recipients only.
                </p>
                {isReady && selectedLineItemIds.length === 0 && (
                  <p className="text-xs text-gray-600">Select at least one customer above to list invoices.</p>
                )}
                {isReady && (docLinesLoading || pdfCheckBusy) && (
                  <p className="text-xs text-gray-600 flex items-center gap-2">
                    <span className="h-3.5 w-3.5 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin" />
                    {docLinesLoading ? 'Loading selected line items…' : 'Matching PDFs in folder…'}
                  </p>
                )}
                {isReady && docLinesError && (
                  <p className="text-xs text-red-600">{docLinesError}</p>
                )}
                {isReady && !docLinesLoading && !docLinesError && docLines.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-medium text-gray-600">Show in table</span>
                        <div
                          className="inline-flex rounded-md border border-gray-300 bg-white p-0.5 text-xs shadow-sm"
                          role="group"
                          aria-label="Filter PDF match rows"
                        >
                          <button
                            type="button"
                            onClick={() => setPdfViewFilter('all')}
                            className={`rounded px-2.5 py-1 font-medium ${
                              pdfViewFilter === 'all'
                                ? 'bg-gray-900 text-white'
                                : 'text-gray-700 hover:bg-gray-100'
                            }`}
                          >
                            All ({docLines.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => setPdfViewFilter('found')}
                            disabled={pdfCheckBusy}
                            className={`rounded px-2.5 py-1 font-medium ${
                              pdfViewFilter === 'found'
                                ? 'bg-emerald-800 text-white'
                                : 'text-gray-700 hover:bg-gray-100 disabled:opacity-50'
                            }`}
                          >
                            Found ({pdfMatchCounts.found})
                          </button>
                          <button
                            type="button"
                            onClick={() => setPdfViewFilter('not_found')}
                            disabled={pdfCheckBusy}
                            className={`rounded px-2.5 py-1 font-medium ${
                              pdfViewFilter === 'not_found'
                                ? 'bg-amber-800 text-white'
                                : 'text-gray-700 hover:bg-gray-100 disabled:opacity-50'
                            }`}
                          >
                            Not found ({pdfMatchCounts.notFound})
                          </button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            exportPdfCsv(
                              filteredDocLines,
                              pdfViewFilter === 'all' ? 'view-all' : pdfViewFilter
                            )
                          }
                          className="rounded border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-800 hover:bg-gray-50"
                        >
                          Export view (CSV)
                        </button>
                        <button
                          type="button"
                          onClick={() => exportPdfCsv(foundOnlyRows, 'export-found')}
                          disabled={foundOnlyRows.length === 0 || pdfCheckBusy}
                          className="rounded border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
                        >
                          Export found (CSV)
                        </button>
                        <button
                          type="button"
                          onClick={() => exportPdfCsv(notFoundOnlyRows, 'export-not-found')}
                          disabled={notFoundOnlyRows.length === 0 || pdfCheckBusy}
                          className="rounded border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                        >
                          Export not found (CSV)
                        </button>
                      </div>
                    </div>
                    <p className="text-[11px] text-gray-500">
                      <strong>Export view</strong> uses the current table filter. The other two buttons always
                      download the full found or not-found list.
                    </p>
                    <div className="border border-gray-200 rounded-md overflow-x-auto max-h-56 overflow-y-auto bg-white">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-100 text-left text-gray-600">
                          <tr>
                            <th className="px-2 py-1.5 font-medium">Document no.</th>
                            <th className="px-2 py-1.5 font-medium">Customer</th>
                            <th className="px-2 py-1.5 font-medium">Code</th>
                            <th className="px-2 py-1.5 font-medium">PDF in folder</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredDocLines.length === 0 ? (
                            <tr>
                              <td
                                colSpan={4}
                                className="px-2 py-3 text-center text-gray-500 border-t border-gray-100"
                              >
                                {pdfViewFilter === 'all'
                                  ? 'No line items for the current selection.'
                                  : 'No rows match this filter (or matching still in progress).'}
                              </td>
                            </tr>
                          ) : (
                            filteredDocLines.map((row) => {
                              const st = pdfByLineId[row.id];
                              return (
                                <tr key={row.id} className="border-t border-gray-100">
                                  <td className="px-2 py-1.5 font-mono text-gray-900">
                                    {row.documentNo || '—'}
                                  </td>
                                  <td className="px-2 py-1.5 text-gray-800">{row.customerName}</td>
                                  <td className="px-2 py-1.5 text-gray-600">{row.customerCode}</td>
                                  <td className="px-2 py-1.5">
                                    {pdfCheckBusy || st === undefined ? (
                                      <span className="text-gray-500">…</span>
                                    ) : st === 'found' ? (
                                      <span className="text-emerald-800">Found</span>
                                    ) : st === 'not_found' ? (
                                      <span className="text-amber-800">Not found</span>
                                    ) : (
                                      <span className="text-gray-500">n/a</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
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
                        <td className="px-3 py-2 text-sm min-w-0 max-w-md">
                          <EmailAddressList value={g.emailTo} label="To" className="mb-0.5" emptyLabel="—" />
                          <EmailAddressList
                            value={g.emailCc}
                            label="Cc"
                            variant="muted"
                            emptyLabel="—"
                            className="mt-0.5"
                          />
                          {g.emailConflict && (
                            <span className="block text-amber-700 text-xs mt-1">(emails differ)</span>
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
