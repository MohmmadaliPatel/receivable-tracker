'use client';

import { useState, useRef } from 'react';

const ALL_CATEGORIES = [
  'Bank Balances and FDs',
  'Borrowings',
  'Trade Receivables',
  'Trade Payables',
  'Other Receivables',
  'Other Payables',
];

interface EntityAttachmentModalProps {
  entityNames: string[];
  onClose: () => void;
  onSuccess: () => void;
}

interface UploadResult {
  label: string;
  updatedCount: number;
  success: boolean;
  error?: string;
}

export default function EntityAttachmentModal({
  entityNames,
  onClose,
  onSuccess,
}: EntityAttachmentModalProps) {
  const [mode, setMode] = useState<'entity' | 'category'>('entity');

  // Entity mode
  const [selectedEntity, setSelectedEntity] = useState<string>(entityNames[0] || '');
  const [entityFile, setEntityFile] = useState<File | null>(null);

  // Category mode (no entity filter — applies to ALL entities in that category)
  const [catAssignments, setCatAssignments] = useState<Record<string, File | null>>(
    Object.fromEntries(ALL_CATEGORIES.map((c) => [c, null]))
  );

  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<UploadResult[]>([]);
  const [done, setDone] = useState(false);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const entityFileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async () => {
    setUploading(true);
    const allResults: UploadResult[] = [];

    try {
      if (mode === 'entity') {
        if (!entityFile || !selectedEntity) return;
        const formData = new FormData();
        formData.append('file', entityFile);
        formData.append('entityName', selectedEntity);
        const res = await fetch('/api/confirmations/entity-attachment', { method: 'POST', body: formData });
        const data = await res.json();
        allResults.push(
          res.ok
            ? { label: selectedEntity, updatedCount: data.updatedCount, success: true }
            : { label: selectedEntity, updatedCount: 0, success: false, error: data.error }
        );
      } else {
        const entries = Object.entries(catAssignments).filter(([, f]) => f !== null);
        for (const [category, file] of entries) {
          const formData = new FormData();
          formData.append('file', file!);
          formData.append('category', category);
          // No entityName — applies to ALL entities for this category
          try {
            const res = await fetch('/api/confirmations/entity-attachment', { method: 'POST', body: formData });
            const data = await res.json();
            allResults.push(
              res.ok
                ? { label: category, updatedCount: data.updatedCount, success: true }
                : { label: category, updatedCount: 0, success: false, error: data.error }
            );
          } catch (err: any) {
            allResults.push({ label: category, updatedCount: 0, success: false, error: err.message });
          }
        }
      }

      setResults(allResults);
      setDone(true);
    } catch (err: any) {
      setResults([{ label: 'Error', updatedCount: 0, success: false, error: err.message }]);
      setDone(true);
    } finally {
      setUploading(false);
    }
  };

  const catAssignedCount = Object.values(catAssignments).filter(Boolean).length;
  const canUpload =
    mode === 'entity' ? !!entityFile && !!selectedEntity : catAssignedCount > 0;

  const totalUpdated = results.reduce((s, r) => s + r.updatedCount, 0);
  const failed = results.filter((r) => !r.success).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Upload Attachments</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Upload authority letters by entity or by category
            </p>
          </div>
          {!uploading && (
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {!done ? (
          <>
            {/* Mode toggle */}
            <div className="px-6 pt-4 flex gap-3">
              {([
                { key: 'entity' as const, label: 'By Entity', desc: 'One file for a specific entity (all its categories)' },
                { key: 'category' as const, label: 'By Category', desc: 'One file per category, applied to all entities' },
              ]).map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setMode(opt.key)}
                  className={`flex-1 p-3 rounded-xl border-2 text-left transition-colors ${
                    mode === opt.key
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <p className={`text-sm font-medium ${mode === opt.key ? 'text-blue-700' : 'text-gray-700'}`}>
                    {opt.label}
                  </p>
                  <p className={`text-xs mt-0.5 ${mode === opt.key ? 'text-blue-600' : 'text-gray-400'}`}>
                    {opt.desc}
                  </p>
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              {mode === 'entity' ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Select Entity</label>
                    <select
                      value={selectedEntity}
                      onChange={(e) => setSelectedEntity(e.target.value)}
                      className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="">— Choose entity —</option>
                      {entityNames.map((e) => (
                        <option key={e} value={e}>{e}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Authority Letter</label>
                    <div
                      onDrop={(e) => { e.preventDefault(); setDragOver(null); const f = e.dataTransfer.files[0]; if (f) setEntityFile(f); }}
                      onDragOver={(e) => { e.preventDefault(); setDragOver('entity'); }}
                      onDragLeave={() => setDragOver(null)}
                      onClick={() => entityFileRef.current?.click()}
                      className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                        dragOver === 'entity' ? 'border-blue-500 bg-blue-50' :
                        entityFile ? 'border-green-400 bg-green-50' :
                        'border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      <input
                        ref={entityFileRef}
                        type="file"
                        className="hidden"
                        onChange={(e) => { if (e.target.files?.[0]) setEntityFile(e.target.files[0]); e.target.value = ''; }}
                      />
                      {entityFile ? (
                        <div className="flex flex-col items-center gap-1.5">
                          <p className="text-sm font-medium text-green-700">{entityFile.name}</p>
                          <p className="text-xs text-green-600">{(entityFile.size / 1024).toFixed(1)} KB</p>
                          <button
                            onClick={(e) => { e.stopPropagation(); setEntityFile(null); }}
                            className="text-xs text-red-500 underline mt-1"
                          >Remove</button>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-1.5 text-gray-400">
                          <p className="text-sm">Drop file or click to browse</p>
                          <p className="text-xs">PDF, DOC, DOCX, JPG, PNG</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {selectedEntity && (
                    <p className="text-xs text-gray-500 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
                      This file will be applied to <strong>all rows</strong> (all categories) for entity: <strong>{selectedEntity}</strong>
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-start gap-2.5 px-3 py-2.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700">
                    <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Each file will be applied to <strong>all entities</strong> in that category — no entity filter.</span>
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-700">Upload per category</p>
                    {ALL_CATEGORIES.map((category) => {
                      const file = catAssignments[category];
                      return (
                        <div
                          key={category}
                          onDrop={(e) => {
                            e.preventDefault(); setDragOver(null);
                            const f = e.dataTransfer.files[0];
                            if (f) setCatAssignments((prev) => ({ ...prev, [category]: f }));
                          }}
                          onDragOver={(e) => { e.preventDefault(); setDragOver(category); }}
                          onDragLeave={() => setDragOver(null)}
                          className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                            dragOver === category ? 'border-blue-400 bg-blue-50' :
                            file ? 'border-green-300 bg-green-50' :
                            'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{category}</p>
                            {file ? (
                              <p className="text-xs text-green-600 mt-0.5 truncate">{file.name}</p>
                            ) : (
                              <p className="text-xs text-gray-400 mt-0.5">No file</p>
                            )}
                          </div>
                          {file ? (
                            <button
                              onClick={() => setCatAssignments((prev) => ({ ...prev, [category]: null }))}
                              className="flex-shrink-0 p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                const input = document.createElement('input');
                                input.type = 'file';
                                input.onchange = (ev) => {
                                  const f = (ev.target as HTMLInputElement).files?.[0];
                                  if (f) setCatAssignments((prev) => ({ ...prev, [category]: f }));
                                };
                                input.click();
                              }}
                              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
                            >
                              Upload
                            </button>
                          )}
                        </div>
                      );
                    })}
                    {catAssignedCount > 0 && (
                      <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2 mt-2">
                        {catAssignedCount} {catAssignedCount === 1 ? 'category' : 'categories'} ready — will update <strong>all entities</strong> in {catAssignedCount === 1 ? 'that category' : 'those categories'}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={onClose}
                className="px-5 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-200 transition-colors"
              >Cancel</button>
              <button
                onClick={handleUpload}
                disabled={!canUpload || uploading}
                className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {uploading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {uploading ? 'Uploading…' : mode === 'entity' ? 'Apply to Entity' : `Apply to ${catAssignedCount} ${catAssignedCount === 1 ? 'Category' : 'Categories'} (All Entities)`}
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col px-6 py-5 gap-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-gray-50 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-gray-800">{results.length}</p>
                <p className="text-xs text-gray-500 mt-1">Uploads</p>
              </div>
              <div className="bg-green-50 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-green-700">{totalUpdated}</p>
                <p className="text-xs text-green-600 mt-1">Records updated</p>
              </div>
              <div className={`${failed > 0 ? 'bg-red-50' : 'bg-gray-50'} rounded-xl p-4 text-center`}>
                <p className={`text-2xl font-bold ${failed > 0 ? 'text-red-600' : 'text-gray-400'}`}>{failed}</p>
                <p className={`text-xs mt-1 ${failed > 0 ? 'text-red-500' : 'text-gray-400'}`}>Failed</p>
              </div>
            </div>

            <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
              {results.map((r, i) => (
                <div key={i} className={`flex items-center px-4 py-3 ${r.success ? '' : 'bg-red-50'}`}>
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
                    <p className="text-sm text-gray-800 truncate">{r.label}</p>
                    {r.success ? (
                      <p className="text-xs text-gray-400">{r.updatedCount} record{r.updatedCount !== 1 ? 's' : ''} updated</p>
                    ) : (
                      <p className="text-xs text-red-500">{r.error}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end mt-auto">
              <button
                onClick={onSuccess}
                className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors"
              >Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
