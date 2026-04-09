'use client';

import { useState, useEffect, useCallback } from 'react';

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  size?: number;
  modified?: string;
  children?: FileNode[];
}

function formatSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// Detect file type from name and return badge config
function fileTag(name: string): { label: string; bg: string; text: string } | null {
  const n = name.toUpperCase();
  if (n.includes('_CONF')) return { label: 'CONF', bg: 'bg-blue-100', text: 'text-blue-700' };
  const m = n.match(/_FU-(\d+)/);
  if (m) return { label: `FU-${m[1]}`, bg: 'bg-amber-100', text: 'text-amber-700' };
  if (n.includes('_RESP')) return { label: 'RESP', bg: 'bg-green-100', text: 'text-green-700' };
  // Non-email files in the attachments subfolder
  if (!n.endsWith('.PDF') && !n.endsWith('.HTML')) return { label: 'ATT', bg: 'bg-purple-100', text: 'text-purple-700' };
  return null;
}

function TreeNode({
  node,
  depth,
  selectedPath,
  onSelect,
}: {
  node: FileNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (n: FileNode) => void;
}) {
  const [open, setOpen] = useState(depth < 2);
  const indent = depth * 14;

  if (node.type === 'folder') {
    const childFiles = (node.children ?? []).filter((c) => c.type === 'file').length;
    return (
      <div>
        <button
          className="flex items-center gap-1.5 w-full text-left px-2 py-1.5 hover:bg-gray-100 rounded-lg text-gray-700 text-sm group"
          style={{ paddingLeft: `${8 + indent}px` }}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="text-gray-400 text-xs w-3 text-center flex-shrink-0">{open ? '▾' : '▸'}</span>
          <span className="text-amber-500 text-base flex-shrink-0">📁</span>
          <span className="truncate font-medium text-gray-700">{node.name}</span>
          {childFiles > 0 && (
            <span className="ml-1 text-[10px] text-gray-400">{childFiles}</span>
          )}
          <button
            title="Download folder as ZIP"
            className="ml-auto opacity-0 group-hover:opacity-100 text-xs text-blue-600 hover:text-blue-800 px-1.5 py-0.5 bg-blue-50 hover:bg-blue-100 rounded transition-all"
            onClick={(e) => {
              e.stopPropagation();
              window.open(`/api/documents?action=zip&path=${encodeURIComponent(node.path)}`);
            }}
          >
            ZIP ↓
          </button>
        </button>
        {open && (
          <div>
            {(node.children ?? []).map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                selectedPath={selectedPath}
                onSelect={onSelect}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const isSelected = selectedPath === node.path;
  const tag = fileTag(node.name);

  return (
    <button
      className={`flex items-center gap-1.5 w-full text-left px-2 py-1.5 rounded-lg text-sm transition-colors ${
        isSelected
          ? 'bg-blue-600 text-white'
          : 'hover:bg-gray-100 text-gray-600'
      }`}
      style={{ paddingLeft: `${8 + indent}px` }}
      onClick={() => onSelect(node)}
    >
      <span className="text-base flex-shrink-0">📄</span>
      {tag && (
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${
          isSelected ? 'bg-white/20 text-white' : `${tag.bg} ${tag.text}`
        }`}>
          {tag.label}
        </span>
      )}
      <span className="truncate flex-1 font-mono text-xs" title={node.name}>
        {node.name}
      </span>
      {node.size && (
        <span className={`text-[10px] flex-shrink-0 ${isSelected ? 'text-blue-200' : 'text-gray-400'}`}>
          {formatSize(node.size)}
        </span>
      )}
    </button>
  );
}

function countNodes(nodes: FileNode[]): { files: number; folders: number } {
  let files = 0, folders = 0;
  for (const n of nodes) {
    if (n.type === 'folder') { folders++; const s = countNodes(n.children ?? []); files += s.files; folders += s.folders; }
    else files++;
  }
  return { files, folders };
}

export default function DocumentsClient() {
  const [tree, setTree] = useState<FileNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(true);
  const [selected, setSelected] = useState<FileNode | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    fetch('/api/documents?action=tree')
      .then((r) => r.json())
      .then((d) => { setTree(d.tree ?? []); setTreeLoading(false); })
      .catch(() => setTreeLoading(false));
  }, []);

  const handleSelect = useCallback(async (node: FileNode) => {
    setSelected(node);
    setPreviewUrl(null);
    setPreviewHtml(null);
    setLoadingPreview(true);
    try {
      const ext = node.name.split('.').pop()?.toLowerCase() || '';
      const previewableExts = ['pdf', 'png', 'jpg', 'jpeg', 'gif'];
      if (ext === 'html') {
        const res = await fetch(`/api/documents?action=file&path=${encodeURIComponent(node.path)}`);
        const data = await res.json();
        setPreviewHtml(data.content ?? null);
      } else if (previewableExts.includes(ext)) {
        setPreviewUrl(`/api/documents?action=file&path=${encodeURIComponent(node.path)}`);
      } else {
        setPreviewHtml(`<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:16px;font-family:sans-serif;color:#666"><p style="font-size:48px">📎</p><p><strong>${node.name}</strong></p><p style="font-size:13px">This file cannot be previewed. Use the Download button.</p></div>`);
      }
    } catch {
      setPreviewHtml('<p style="color:red;padding:16px">Failed to load file.</p>');
    } finally {
      setLoadingPreview(false);
    }
  }, []);

  const { files, folders } = countNodes(tree);

  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-5 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Browse saved confirmation emails, follow-ups, and responses
          </p>
        </div>
        {!treeLoading && (
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <span className="flex items-center gap-1">📁 {folders} folder{folders !== 1 ? 's' : ''}</span>
            <span className="flex items-center gap-1">📄 {files} file{files !== 1 ? 's' : ''}</span>
            <button
              onClick={() => window.open('/api/documents?action=zip&path=')}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50 text-gray-700 transition-colors"
            >
              ↓ Download All (ZIP)
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar — file tree */}
        <div className="w-72 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
          {/* Legend */}
          <div className="px-3 py-2 border-b border-gray-100 flex items-center gap-3 flex-wrap">
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">CONF</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">FU-N</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-100 text-green-700">RESP</span>
            <span className="text-[10px] text-gray-400">= same folder = same thread</span>
          </div>

          <div className="flex-1 overflow-y-auto p-1.5">
            {treeLoading ? (
              <div className="flex items-center justify-center h-32 text-gray-400 text-sm gap-2">
                <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Loading…
              </div>
            ) : tree.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-gray-400 gap-3 p-4 text-center">
                <span className="text-4xl">📭</span>
                <div>
                  <p className="font-medium text-gray-500">No emails saved yet</p>
                  <p className="text-xs mt-1">Send a confirmation to get started</p>
                </div>
              </div>
            ) : (
              tree.map((node) => (
                <TreeNode
                  key={node.path}
                  node={node}
                  depth={0}
                  selectedPath={selected?.path ?? null}
                  onSelect={handleSelect}
                />
              ))
            )}
          </div>
        </div>

        {/* Main panel — preview */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
          {selected ? (
            <>
              {/* Preview toolbar */}
              <div className="border-b border-gray-200 px-5 py-3 flex items-center gap-3 flex-shrink-0">
                <div className="flex-1 min-w-0">
                  {(() => { const tag = fileTag(selected.name); return tag ? (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded mr-2 ${tag.bg} ${tag.text}`}>{tag.label}</span>
                  ) : null; })()}
                  <span className="text-gray-900 text-sm font-medium">{selected.name.replace(/\.(html|pdf)$/, '')}</span>
                  <p className="text-gray-400 text-xs mt-0.5 font-mono truncate">emails/{selected.path}</p>
                </div>
                {selected.modified && (
                  <span className="text-gray-400 text-xs hidden lg:block">{formatDate(selected.modified)}</span>
                )}
                <button
                  onClick={() => window.open(`/api/documents?action=download&path=${encodeURIComponent(selected.path)}`)}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download
                </button>
                {!selected.name.endsWith('.pdf') && (
                  <button
                    onClick={() => {
                      const frame = document.getElementById('doc-iframe') as HTMLIFrameElement | null;
                      if (frame?.contentWindow) frame.contentWindow.print();
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                    </svg>
                    Print
                  </button>
                )}
              </div>

              {/* Preview area */}
              <div className="flex-1 overflow-hidden">
                {loadingPreview ? (
                  <div className="flex items-center justify-center h-full text-gray-400 gap-2">
                    <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Loading preview…
                  </div>
                ) : previewUrl ? (
                  selected?.name.match(/\.(png|jpg|jpeg|gif)$/i) ? (
                    <div className="flex items-center justify-center h-full p-4">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={previewUrl} alt={selected?.name || ''} className="max-w-full max-h-full object-contain rounded-lg shadow" />
                    </div>
                  ) : (
                    <embed
                      src={previewUrl}
                      type="application/pdf"
                      className="w-full h-full"
                      title="PDF preview"
                    />
                  )
                ) : previewHtml ? (
                  <iframe
                    id="doc-iframe"
                    srcDoc={previewHtml}
                    className="w-full h-full border-none"
                    title="Email preview"
                    sandbox="allow-same-origin allow-modals"
                  />
                ) : null}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
              <span className="text-6xl mb-4">🗂️</span>
              <p className="text-lg font-medium text-gray-500">Select a file to preview</p>
              <p className="text-sm text-gray-400 mt-1">
                All CONF / FU-N / RESP files in the same folder belong to the same thread
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
