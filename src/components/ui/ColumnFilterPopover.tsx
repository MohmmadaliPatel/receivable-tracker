'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search } from 'lucide-react';

/**
 * Multi-select filter dropdown for table columns (search + checkboxes + clear / select all).
 * Used by DataTable and ServerDataTable.
 */
export function ColumnFilterPopover({
  options,
  selected,
  onChange,
  onClose,
  loading = false,
  emptyMessage = 'No filter values for this column.',
}: {
  options: string[];
  selected: Set<string>;
  onChange: (s: Set<string>) => void;
  onClose: () => void;
  /** Server still loading facet options */
  loading?: boolean;
  /** Shown when not loading and options is empty */
  emptyMessage?: string;
}) {
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasOptions = options.length > 0;

  useEffect(() => {
    if (hasOptions && !loading) inputRef.current?.focus();
  }, [hasOptions, loading]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, search]);

  const toggle = (val: string) => {
    const next = new Set(selected);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    onChange(next);
  };

  if (loading) {
    return (
      <div
        ref={ref}
        className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-xl min-w-[220px] max-w-[320px] animate-fadeIn p-4 flex items-center justify-center gap-2 text-sm text-gray-500"
      >
        <div className="h-4 w-4 border-2 border-gray-200 border-t-blue-600 rounded-full animate-spin shrink-0" />
        Loading options…
      </div>
    );
  }

  if (!hasOptions) {
    return (
      <div
        ref={ref}
        className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-xl min-w-[220px] max-w-[320px] animate-fadeIn p-3 text-xs text-gray-500 text-center"
      >
        {emptyMessage}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-xl min-w-[220px] max-w-[320px] animate-fadeIn"
    >
      <div className="p-2 border-b border-gray-100">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter list…"
            className="w-full h-8 pl-8 pr-3 text-sm border border-gray-200 rounded-md bg-gray-50 focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>
      <div className="max-h-48 overflow-y-auto p-1.5">
        {filtered.length === 0 ? (
          <p className="text-xs text-gray-400 px-2 py-3 text-center">No matches</p>
        ) : (
          filtered.map((opt) => (
            <label
              key={opt}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-gray-50 cursor-pointer text-sm"
            >
              <input
                type="checkbox"
                checked={selected.has(opt)}
                onChange={() => toggle(opt)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="truncate text-gray-700" title={opt}>
                {opt || '(empty)'}
              </span>
            </label>
          ))
        )}
      </div>
      <div className="flex items-center justify-between px-2 py-1.5 border-t border-gray-100 text-xs">
        <button
          type="button"
          onClick={() => onChange(new Set())}
          className="text-gray-500 hover:text-gray-700"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={() => onChange(new Set(options))}
          className="text-blue-600 hover:text-blue-700 font-medium"
        >
          Select all
        </button>
      </div>
    </div>
  );
}
