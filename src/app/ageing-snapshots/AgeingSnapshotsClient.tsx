'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';

interface ImportRecord {
  id: string;
  fileName: string;
  createdAt: string;
  lineCount: number;
  /** Total rows in import (includes excluded) when API provides it */
  lineCountAll?: number;
}

export default function AgeingSnapshotsClient() {
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedImport, setSelectedImport] = useState<string | null>(null);
  const [lineItems, setLineItems] = useState<Array<{
    id: string;
    companyCode: string;
    companyName: string;
    customerCode: string;
    customerName: string;
    documentNo: string;
    totalBalance: string;
    maxDaysBucket: string;
    emailTo: string;
    excluded: boolean;
  }> | null>(null);
  const [loadingLines, setLoadingLines] = useState(false);

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

  const onUpload = async (file: File) => {
    setUploading(true);
    setMessage(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('mode', 'append');
      const res = await fetch('/api/aging/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || 'Upload failed');
        return;
      }
      setMessage(
        `Imported ${data.lineCount} row(s) — excluded internal companies: ${data.excludedCount ?? 0}`
      );
      await loadImports();
    } finally {
      setUploading(false);
    }
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
          setLineItems(null);
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
      const res = await fetch(`/api/aging/line-items?importId=${encodeURIComponent(importId)}`);
      if (res.ok) {
        const data = await res.json();
        // We need to fetch full line items - let's use a different approach
        // For now, show limited info
        setLineItems([]);
      }
    } finally {
      setLoadingLines(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-5">
        <div className="flex flex-wrap items-center gap-4 mb-3">
          <Image src="/logo.png" alt="Taxteck" width={120} height={32} className="h-8 w-auto" />
          <Image
            src="/cleanmax-logo.png"
            alt="Cleanmax"
            width={120}
            height={36}
            className="h-9 w-auto object-contain"
          />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Ageing Snapshots</h1>
        <p className="text-sm text-gray-500 mt-1">
          View and manage historical ageing report imports.
        </p>
      </div>

      <div className="px-6 py-4 space-y-4 flex-1 overflow-auto">
        {message && (
          <div className={`text-sm rounded-lg px-3 py-2 ${
            message.includes('failed') || message.includes('error')
              ? 'text-red-800 bg-red-50 border border-red-200'
              : 'text-blue-800 bg-blue-50 border border-blue-200'
          }`}>
            {message}
          </div>
        )}

        {/* Upload Section */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-2">Upload New Snapshot</h3>
          <div className="flex items-center gap-4">
            <input
              type="file"
              accept=".xlsx,.xls"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUpload(f);
              }}
              className="text-sm"
            />
            {uploading && (
              <div className="flex items-center text-sm text-gray-600">
                <div className="h-4 w-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin mr-2" />
                Uploading...
              </div>
            )}
          </div>
        </div>

        {/* Imports List */}
        <div>
          <h3 className="text-sm font-semibold text-gray-800 mb-3">
            Import History ({imports.length})
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
                    <th className="px-4 py-3">File Name</th>
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
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {imp.fileName}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {new Date(imp.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">
                        {imp.lineCount.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => viewLineItems(imp.id)}
                            className="text-blue-600 hover:underline text-sm"
                          >
                            View
                          </button>
                          <button
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

        {/* Selected Import Details */}
        {selectedImport && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium text-blue-900">
                Import Details
              </h4>
              <button
                onClick={() => {
                  setSelectedImport(null);
                  setLineItems(null);
                }}
                className="text-blue-600 hover:underline text-sm"
              >
                Close
              </button>
            </div>
            {loadingLines ? (
              <div className="flex items-center text-blue-700">
                <div className="h-4 w-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin mr-2" />
                Loading details...
              </div>
            ) : (
              <p className="text-sm text-blue-800">
                Use the Bulk Email page to view and send emails for specific imports.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
