'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';

interface ImportRecord {
  id: string;
  fileName: string;
  createdAt: string;
  lineCount: number;
  lineCountAll?: number;
}

type UploadState =
  | { kind: 'idle' }
  | {
      kind: 'uploading';
      percent: number;
      loaded: number;
      total: number;
    }
  | { kind: 'processing' }
  | { kind: 'success'; data: SuccessPayload }
  | { kind: 'error'; message: string };

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

type SuccessPayload = {
  rowCount: number;
  customerCount: number;
  pruned: number;
  excludedCount: number;
  snapshotId: string;
};

function postAgingSnapshotWithProgress(
  file: File,
  onProgress: (info: { percent: number; loaded: number; total: number }) => void,
  onUploadBytesDone: () => void
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const fd = new FormData();
    fd.append('file', file);
    const url = '/api/aging/upload';
    xhr.open('POST', url);
    let uploadLoadFired = false;
    const fileSize = file.size > 0 ? file.size : 0;
    xhr.upload.onprogress = (e) => {
      const total =
        e.lengthComputable && e.total > 0 ? e.total : fileSize > 0 ? fileSize : e.total || 0;
      const loaded = e.loaded;
      const percent =
        total > 0 ? Math.min(100, Math.round((100 * loaded) / total)) : loaded > 0 ? 50 : 0;
      onProgress({ percent, loaded, total: total || loaded || fileSize || 0 });
    };
    xhr.upload.addEventListener('load', () => {
      if (!uploadLoadFired) {
        uploadLoadFired = true;
        onUploadBytesDone();
      }
    });
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.onload = () => {
      resolve({ status: xhr.status, body: xhr.responseText || '{}' });
    };
    xhr.send(fd);
  });
}

export default function AgeingSnapshotsClient() {
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedImport, setSelectedImport] = useState<string | null>(null);
  const [loadingLines, setLoadingLines] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>({ kind: 'idle' });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadImports = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/aging/imports');
      if (res.ok) {
        const data = await res.json();
        setImports(data.imports || []);
      }
    } catch (error) {
      console.error('Failed to load imports:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadImports();
  }, [loadImports]);

  const onPickFile: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.xlsx') && !file.name.toLowerCase().endsWith('.xls')) {
      setUploadState({ kind: 'error', message: 'Please choose an .xlsx or .xls file.' });
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setUploadState({ kind: 'error', message: 'File is too large (max 50MB).' });
      return;
    }

    setUploadState({
      kind: 'uploading',
      percent: 0,
      loaded: 0,
      total: file.size,
    });
    try {
      const { status, body } = await postAgingSnapshotWithProgress(
        file,
        (info) => {
          setUploadState({
            kind: 'uploading',
            percent: info.percent,
            loaded: info.loaded,
            total: info.total,
          });
        },
        () => {
          setUploadState({ kind: 'processing' });
        }
      );
      let json: Record<string, unknown> = {};
      try {
        json = JSON.parse(body) as Record<string, unknown>;
      } catch {
        setUploadState({
          kind: 'error',
          message: 'Invalid response from server.',
        });
        return;
      }
      if (status === 201 && json.success) {
        const pruned = Number(json.pruned ?? 0) || 0;
        const rowCount = Number(json.rowCount ?? json.lineCount ?? 0) || 0;
        const customerCount = Number(json.customerCount ?? 0) || 0;
        const excludedCount = Number(json.excludedCount ?? 0) || 0;
        const snapshotId = String(json.snapshotId ?? json.importId ?? '');
        setUploadState({
          kind: 'success',
          data: { rowCount, customerCount, pruned, excludedCount, snapshotId },
        });
        setMessage(
          `Snapshot imported: ${rowCount} row(s), ${customerCount} customer(s)${excludedCount ? ` (excluded ${excludedCount})` : ''}${pruned ? ` — ${pruned} older snapshot(s) removed.` : ''}.`
        );
        await loadImports();
      } else {
        setUploadState({
          kind: 'error',
          message: String(json.error || 'Upload failed'),
        });
      }
    } catch (err) {
      setUploadState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Upload failed',
      });
    }
  };

  const closeModal = () => {
    setModalOpen(false);
    setTimeout(() => setUploadState({ kind: 'idle' }), 200);
  };

  const onDelete = async (id: string) => {
    if (!confirm('Delete this import and all its line items?')) return;

    try {
      const res = await fetch(`/api/aging/imports?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setMessage('Import deleted');
        await loadImports();
        if (selectedImport === id) {
          setSelectedImport(null);
        }
      } else {
        const data = await res.json();
        setMessage(data.error || 'Delete failed');
      }
    } catch (error) {
      setMessage('Delete failed');
    }
  };

  const viewLineItems = async (importId: string) => {
    setSelectedImport(importId);
    setLoadingLines(true);
    try {
      await fetch(`/api/aging/line-items?importId=${encodeURIComponent(importId)}`);
    } finally {
      setLoadingLines(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-2xl font-bold text-gray-900">Ageing Snapshots</h1>
        <p className="text-sm text-gray-500 mt-1">
          View and manage historical ageing report imports.
        </p>
      </div>

      <div className="px-6 py-4 space-y-4 flex-1 overflow-auto">
        {message && (
          <div
            className={`text-sm rounded-lg px-3 py-2 ${
              message.includes('failed') || message.includes('error') || message.includes('Delete failed')
                ? 'text-red-800 bg-red-50 border border-red-200'
                : 'text-blue-800 bg-blue-50 border border-blue-200'
            }`}
          >
            {message}
          </div>
        )}

        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-2">Upload</h3>
          <p className="text-sm text-gray-600 mb-3">
            Upload a receivable ageing Excel file (.xlsx or .xls). The file is stored, parsed, and
            line items are created for bulk email. Older snapshots may be removed per your retention
            setting.
          </p>
          <button
            type="button"
            onClick={() => {
              setModalOpen(true);
              setUploadState({ kind: 'idle' });
            }}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
          >
            Upload snapshot
          </button>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-gray-800 mb-3">
            Import history ({imports.length})
          </h3>

          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-500">
              <div className="h-6 w-6 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin mr-3" />
              Loading...
            </div>
          ) : imports.length === 0 ? (
            <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-xl border border-gray-200">
              No imports yet. Upload an ageing report to get started.
            </div>
          ) : (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-gray-600">
                  <tr>
                    <th className="px-4 py-3">File name</th>
                    <th className="px-4 py-3">Uploaded</th>
                    <th className="px-4 py-3 text-right">Lines</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {imports.map((imp) => (
                    <tr
                      key={imp.id}
                      className={`border-t border-gray-100 ${
                        selectedImport === imp.id ? 'bg-blue-50' : ''
                      }`}
                    >
                      <td className="px-4 py-3 font-medium text-gray-900">{imp.fileName}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {new Date(imp.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">
                        {imp.lineCount.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => viewLineItems(imp.id)}
                            className="text-blue-600 hover:underline text-sm"
                          >
                            View
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete(imp.id)}
                            className="text-red-600 hover:underline text-sm"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {selectedImport && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium text-blue-900">Import details</h4>
              <button
                type="button"
                onClick={() => setSelectedImport(null)}
                className="text-blue-600 hover:underline text-sm"
              >
                Close
              </button>
            </div>
            {loadingLines ? (
              <div className="flex items-center text-blue-700">
                <div className="h-4 w-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin mr-2" />
                Loading…
              </div>
            ) : (
              <p className="text-sm text-blue-800">
                Use the bulk email page to view and send emails for this import.
              </p>
            )}
            <div className="mt-2">
              <Link
                href="/bulk-email"
                className="text-sm text-blue-700 font-medium hover:underline"
              >
                Open receivables bulk email
              </Link>
            </div>
          </div>
        )}
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          role="dialog"
          aria-modal="true"
          aria-labelledby="upload-snapshot-title"
        >
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-5 border border-gray-200">
            <h2 id="upload-snapshot-title" className="text-lg font-semibold text-gray-900">
              Upload ageing snapshot
            </h2>
            <p className="text-sm text-gray-600 mt-1 mb-4">
              Choose a single .xlsx or .xls file. Upload progress and processing run on the server
              (this may take a moment for large files).
            </p>

            {uploadState.kind === 'idle' && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="sr-only"
                  onChange={onPickFile}
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                  >
                    Choose file
                  </button>
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-4 py-2 text-sm text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}

            {uploadState.kind === 'uploading' && (
              <div className="space-y-3" aria-live="polite" aria-busy="true">
                <div className="flex items-center justify-between gap-2 text-sm text-gray-800">
                  <span className="font-medium">Uploading file</span>
                  <span className="tabular-nums text-gray-600">
                    {uploadState.total > 0
                      ? `${formatBytes(uploadState.loaded)} / ${formatBytes(uploadState.total)}`
                      : formatBytes(uploadState.loaded)}
                    {' · '}
                    {uploadState.percent}%
                  </span>
                </div>
                <div
                  className="h-3 bg-gray-200 rounded-full overflow-hidden border border-gray-100"
                  role="progressbar"
                  aria-valuenow={uploadState.percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-[width] duration-100 ease-out"
                    style={{ width: `${uploadState.percent}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500">
                  Sending the workbook to the server. Large files may take a minute.
                </p>
              </div>
            )}

            {uploadState.kind === 'processing' && (
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <div className="h-5 w-5 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
                Processing on server…
              </div>
            )}

            {uploadState.kind === 'success' && (
              <div className="space-y-3">
                <p className="text-sm text-gray-800">
                  <strong>{uploadState.data.rowCount}</strong> row(s) imported,{' '}
                  <strong>{uploadState.data.customerCount}</strong> customer(s)
                  {uploadState.data.excludedCount
                    ? ` (excluded ${uploadState.data.excludedCount} internal/ruled out)`
                    : ''}
                  .
                </p>
                {uploadState.data.pruned > 0 && (
                  <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
                    Removed {uploadState.data.pruned} older snapshot(s) to stay within retention.
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Link
                    href="/bulk-email"
                    onClick={closeModal}
                    className="inline-flex px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                  >
                    Open bulk email
                  </Link>
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-4 py-2 text-sm text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}

            {uploadState.kind === 'error' && (
              <div className="space-y-3">
                <p className="text-sm text-red-800">{uploadState.message}</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setUploadState({ kind: 'idle' })}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg"
                  >
                    Try again
                  </button>
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-4 py-2 text-sm text-gray-700 border border-gray-200 rounded-lg"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}

            {uploadState.kind !== 'idle' &&
              uploadState.kind !== 'error' &&
              uploadState.kind !== 'success' && (
                <button
                  type="button"
                  onClick={closeModal}
                  className="mt-4 text-sm text-gray-500 hover:text-gray-800"
                >
                  Cancel
                </button>
              )}
          </div>
        </div>
      )}
    </div>
  );
}
