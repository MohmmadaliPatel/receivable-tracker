'use client';

import { useState, useRef } from 'react';

interface EntityAttachmentModalProps {
  entityNames: string[];
  onClose: () => void;
  onSuccess: () => void;
}

interface UploadResult {
  entityName: string;
  updatedCount: number;
  success: boolean;
  error?: string;
}

export default function EntityAttachmentModal({
  entityNames,
  onClose,
  onSuccess,
}: EntityAttachmentModalProps) {
  const [mode, setMode] = useState<'single' | 'multi'>('single');

  // Single entity mode
  const [selectedEntity, setSelectedEntity] = useState<string>(entityNames[0] || '');
  const [singleFile, setSingleFile] = useState<File | null>(null);

  // Multi-entity mode — one file per entity
  const [assignments, setAssignments] = useState<Record<string, File | null>>(
    Object.fromEntries(entityNames.map((e) => [e, null]))
  );

  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<UploadResult[]>([]);
  const [done, setDone] = useState(false);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const singleFileRef = useRef<HTMLInputElement>(null);
  const multiFileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const uploadSingle = async (): Promise<UploadResult> => {
    if (!singleFile || !selectedEntity) throw new Error('File and entity required');
    const formData = new FormData();
    formData.append('file', singleFile);
    formData.append('entityName', selectedEntity);
    const res = await fetch('/api/confirmations/entity-attachment', { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) return { entityName: selectedEntity, updatedCount: 0, success: false, error: data.error };
    return { entityName: selectedEntity, updatedCount: data.updatedCount, success: true };
  };

  const uploadMulti = async (): Promise<UploadResult[]> => {
    const entries = Object.entries(assignments).filter(([, f]) => f !== null);
    const results: UploadResult[] = [];
    for (const [entityName, file] of entries) {
      const formData = new FormData();
      formData.append('file', file!);
      formData.append('entityName', entityName);
      try {
        const res = await fetch('/api/confirmations/entity-attachment', { method: 'POST', body: formData });
        const data = await res.json();
        results.push(
          res.ok
            ? { entityName, updatedCount: data.updatedCount, success: true }
            : { entityName, updatedCount: 0, success: false, error: data.error }
        );
      } catch (err: any) {
        results.push({ entityName, updatedCount: 0, success: false, error: err.message });
      }
    }
    return results;
  };

  const handleUpload = async () => {
    setUploading(true);
    try {
      if (mode === 'single') {
        const result = await uploadSingle();
        setResults([result]);
      } else {
        const res = await uploadMulti();
        setResults(res);
      }
      setDone(true);
    } catch (err: any) {
      setResults([{ entityName: selectedEntity, updatedCount: 0, success: false, error: err.message }]);
      setDone(true);
    } finally {
      setUploading(false);
    }
  };

  const assignedCount = Object.values(assignments).filter(Boolean).length;
  const canUpload =
    mode === 'single' ? !!singleFile && !!selectedEntity : assignedCount > 0;

  const totalUpdated = results.reduce((s, r) => s + r.updatedCount, 0);
  const failed = results.filter((r) => !r.success).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Entity-wise Attachments</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Upload authority letters — apply one file to all rows of an entity
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
                { key: 'single', label: 'Single entity', desc: 'Upload one file for one entity' },
                { key: 'multi', label: 'Multiple entities', desc: 'Upload files for multiple entities at once' },
              ] as const).map((opt) => (
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
              {mode === 'single' ? (
                <div className="space-y-4">
                  {/* Entity selector */}
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

                  {/* File drop zone */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Authority Letter</label>
                    <div
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOver(null);
                        const f = e.dataTransfer.files[0];
                        if (f) setSingleFile(f);
                      }}
                      onDragOver={(e) => { e.preventDefault(); setDragOver('single'); }}
                      onDragLeave={() => setDragOver(null)}
                      onClick={() => singleFileRef.current?.click()}
                      className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                        dragOver === 'single' ? 'border-blue-500 bg-blue-50' :
                        singleFile ? 'border-green-400 bg-green-50' :
                        'border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      <input
                        ref={singleFileRef}
                        type="file"
                        className="hidden"
                        onChange={(e) => { if (e.target.files?.[0]) setSingleFile(e.target.files[0]); e.target.value = ''; }}
                      />
                      {singleFile ? (
                        <div className="flex flex-col items-center gap-1.5">
                          <svg className="w-7 h-7 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <p className="text-sm font-medium text-green-700">{singleFile.name}</p>
                          <p className="text-xs text-green-600">{(singleFile.size / 1024).toFixed(1)} KB</p>
                          <button
                            onClick={(e) => { e.stopPropagation(); setSingleFile(null); }}
                            className="text-xs text-red-500 underline mt-1"
                          >
                            Remove
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-1.5 text-gray-400">
                          <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                          </svg>
                          <p className="text-sm">Drop file or click to browse</p>
                          <p className="text-xs">PDF, DOC, DOCX, JPG, PNG accepted</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {selectedEntity && (
                    <p className="text-xs text-gray-500 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
                      This file will be applied to <strong>all rows</strong> for entity: <strong>{selectedEntity}</strong>
                    </p>
                  )}
                </div>
              ) : (
                /* Multi-entity mode */
                <div className="space-y-2">
                  {entityNames.length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-8">No entities found. Upload a master file first.</p>
                  )}
                  {entityNames.map((entityName) => {
                    const file = assignments[entityName];
                    return (
                      <div
                        key={entityName}
                        onDrop={(e) => {
                          e.preventDefault();
                          setDragOver(null);
                          const f = e.dataTransfer.files[0];
                          if (f) setAssignments((prev) => ({ ...prev, [entityName]: f }));
                        }}
                        onDragOver={(e) => { e.preventDefault(); setDragOver(entityName); }}
                        onDragLeave={() => setDragOver(null)}
                        className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                          dragOver === entityName ? 'border-blue-400 bg-blue-50' :
                          file ? 'border-green-300 bg-green-50' :
                          'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        {/* Entity name */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate" title={entityName}>
                            {entityName}
                          </p>
                          {file ? (
                            <p className="text-xs text-green-600 mt-0.5 truncate">{file.name}</p>
                          ) : (
                            <p className="text-xs text-gray-400 mt-0.5">No file uploaded</p>
                          )}
                        </div>

                        {/* Upload / remove button */}
                        {file ? (
                          <button
                            onClick={() => setAssignments((prev) => ({ ...prev, [entityName]: null }))}
                            className="flex-shrink-0 p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Remove file"
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
                                if (f) setAssignments((prev) => ({ ...prev, [entityName]: f }));
                              };
                              input.click();
                            }}
                            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Upload
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {assignedCount > 0 && (
                    <p className="text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 mt-2">
                      {assignedCount} {assignedCount === 1 ? 'entity' : 'entities'} ready to upload
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={onClose}
                className="px-5 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={!canUpload || uploading}
                className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {uploading && (
                  <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                )}
                {uploading
                  ? 'Uploading…'
                  : mode === 'single'
                  ? 'Apply to Entity'
                  : `Apply to ${assignedCount} ${assignedCount === 1 ? 'Entity' : 'Entities'}`}
              </button>
            </div>
          </>
        ) : (
          /* Results view */
          <div className="flex-1 flex flex-col px-6 py-5 gap-4">
            {/* Summary */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-gray-50 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-gray-800">{results.length}</p>
                <p className="text-xs text-gray-500 mt-1">{results.length === 1 ? 'Entity' : 'Entities'}</p>
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
              {results.map((r) => (
                <div key={r.entityName} className={`flex items-center px-4 py-3 ${r.success ? '' : 'bg-red-50'}`}>
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
                    <p className="text-sm text-gray-800 truncate">{r.entityName}</p>
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
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
