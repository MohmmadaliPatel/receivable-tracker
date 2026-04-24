'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MultiSelect } from '@/components/ui/MultiSelect';
import type { MultiValue } from 'react-select';

type CompanyRow = { companyCode: string; companyName: string };

type AttRow = {
  id: string;
  customerCode: string;
  customerName: string;
  fileName: string;
  updatedAt: string;
};

export default function AgingAttachmentsClient() {
  const [importId, setImportId] = useState<string | null>(null);
  const [importName, setImportName] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(false);
  const [filterCompanyNames, setFilterCompanyNames] = useState<string[]>([]);
  const [rows, setRows] = useState<AttRow[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    created: number;
    updated: number;
    errors: string[];
    warnings: string[];
  } | null>(null);

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const res = await fetch('/api/aging/line-items');
      const data = await res.json();
      if (data.import) {
        setImportId(data.import.id);
        setImportName(data.import.fileName);
      } else {
        setImportId(null);
        setImportName(null);
      }
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    if (!importId) {
      setCompanies([]);
      return;
    }
    setCompaniesLoading(true);
    fetch(`/api/aging/distinct-companies?importId=${encodeURIComponent(importId)}`)
      .then((r) => r.json())
      .then((d) => setCompanies(d.companies || []))
      .catch(() => setCompanies([]))
      .finally(() => setCompaniesLoading(false));
  }, [importId]);

  const loadList = useCallback(async () => {
    if (!importId) {
      setRows([]);
      return;
    }
    setListLoading(true);
    try {
      const res = await fetch(
        `/api/aging/import-attachments?importId=${encodeURIComponent(importId)}`
      );
      const d = await res.json();
      setRows(d.attachments || []);
    } catch {
      setRows([]);
    } finally {
      setListLoading(false);
    }
  }, [importId]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const companyOptions = useMemo(
    () =>
      companies.map((c) => ({
        value: c.companyName,
        label: c.companyName ? `${c.companyName} (${c.companyCode})` : c.companyCode,
      })),
    [companies]
  );

  const companyValue: MultiValue<{ value: string; label: string }> = useMemo(
    () =>
      filterCompanyNames.map((v) => {
        const o = companyOptions.find((x) => x.value === v);
        return o ?? { value: v, label: v };
      }),
    [filterCompanyNames, companyOptions]
  );

  const downloadTemplate = async () => {
    if (!importId) return;
    setDownloadBusy(true);
    setMessage(null);
    try {
      const sp = new URLSearchParams();
      sp.set('importId', importId);
      for (const n of filterCompanyNames) {
        if (n.trim()) sp.append('companyNames', n.trim());
      }
      const res = await fetch(`/api/aging/import-attachments/template-zip?${sp.toString()}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setMessage(d.error || 'Download failed');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice-attachments-template-${importId.slice(0, 8)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloadBusy(false);
    }
  };

  const onUpload = async (file: File | null) => {
    if (!file || !importId) return;
    setUploadBusy(true);
    setUploadResult(null);
    setMessage(null);
    try {
      const fd = new FormData();
      fd.append('importId', importId);
      fd.append('file', file);
      const res = await fetch('/api/aging/import-attachments/upload', {
        method: 'POST',
        body: fd,
      });
      const d = await res.json();
      if (!res.ok) {
        setMessage(d.error || 'Upload failed');
        return;
      }
      setUploadResult({
        created: d.created ?? 0,
        updated: d.updated ?? 0,
        errors: d.errors || [],
        warnings: d.warnings || [],
      });
      loadList();
    } catch {
      setMessage('Upload failed');
    } finally {
      setUploadBusy(false);
    }
  };

  const removeOne = async (customerCode: string) => {
    if (!importId) return;
    if (!confirm(`Remove attachment for ${customerCode}?`)) return;
    const res = await fetch(
      `/api/aging/import-attachments?importId=${encodeURIComponent(importId)}&customerCode=${encodeURIComponent(customerCode)}`,
      { method: 'DELETE' }
    );
    if (res.ok) loadList();
    else setMessage('Remove failed');
  };

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Invoice attachments (ageing import)</h1>
        <p className="text-sm text-gray-500 mt-1">
          Download a folder template for customers with positive total balance, add one PDF (or file) per folder, then
          upload the ZIP. Attachments are stored for this import only; import-scoped files are used first when sending
          emails.
        </p>
      </div>

      {summaryLoading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : !importId ? (
        <p className="text-amber-800 text-sm bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          No ageing import found. Upload an ageing file from the dashboard or bulk email flow first.
        </p>
      ) : (
        <>
          <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-2 text-sm">
            <p>
              <span className="text-gray-500">Current import:</span>{' '}
              <span className="font-medium text-gray-900">{importName}</span>
            </p>
            <p className="text-xs text-gray-500">
              Template includes customers where the sum of line-item balances is greater than zero (excluded rows
              ignored). Optional: filter companies for a smaller template.
            </p>
          </div>

          {message && (
            <div className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {message}
            </div>
          )}

          <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-4">
            <div className="max-w-xl z-20 relative">
              <MultiSelect
                label="Companies (optional filter for template)"
                isLoading={companiesLoading}
                isDisabled={companiesLoading}
                isClearable
                placeholder="All companies"
                options={companyOptions}
                value={companyValue}
                onChange={(sel) => {
                  const list = Array.isArray(sel) ? (sel as { value: string }[]) : [];
                  setFilterCompanyNames(list.map((x) => x.value));
                }}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={downloadTemplate}
                disabled={downloadBusy}
                className="px-4 py-2 text-sm bg-slate-800 text-white rounded-lg disabled:opacity-50"
              >
                {downloadBusy ? 'Preparing…' : 'Download template ZIP'}
              </button>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Upload filled ZIP</label>
              <input
                type="file"
                accept=".zip,application/zip"
                disabled={uploadBusy}
                onChange={(e) => onUpload(e.target.files?.[0] ?? null)}
                className="text-sm"
              />
              {uploadBusy && <p className="text-xs text-gray-500 mt-1">Uploading…</p>}
            </div>
            {uploadResult && (
              <div className="text-sm space-y-1 border border-gray-100 rounded-md p-3 bg-gray-50">
                <p>
                  Created: <strong>{uploadResult.created}</strong>, updated:{' '}
                  <strong>{uploadResult.updated}</strong>
                </p>
                {uploadResult.warnings.length > 0 && (
                  <ul className="list-disc pl-4 text-amber-800 text-xs">
                    {uploadResult.warnings.slice(0, 20).map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                )}
                {uploadResult.errors.length > 0 && (
                  <ul className="list-disc pl-4 text-red-800 text-xs">
                    {uploadResult.errors.slice(0, 30).map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
            <div className="px-4 py-2 border-b border-gray-200 bg-gray-50 text-sm font-medium text-gray-700">
              Stored attachments for this import
            </div>
            {listLoading ? (
              <p className="p-4 text-sm text-gray-500">Loading…</p>
            ) : rows.length === 0 ? (
              <p className="p-4 text-sm text-gray-500">No per-customer files uploaded yet for this import.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-600">
                      <th className="px-3 py-2">Customer</th>
                      <th className="px-3 py-2">Code</th>
                      <th className="px-3 py-2">File</th>
                      <th className="px-3 py-2">Updated</th>
                      <th className="px-3 py-2 w-24" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50/80">
                        <td className="px-3 py-2 text-gray-900">{r.customerName}</td>
                        <td className="px-3 py-2 text-gray-600 font-mono text-xs">{r.customerCode}</td>
                        <td className="px-3 py-2 break-all">{r.fileName}</td>
                        <td className="px-3 py-2 text-gray-500 text-xs">
                          {new Date(r.updatedAt).toLocaleString()}
                        </td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => removeOne(r.customerCode)}
                            className="text-xs text-red-700 hover:underline"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
