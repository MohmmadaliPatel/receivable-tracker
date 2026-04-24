'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { ChevronUp, ChevronDown, Filter, X } from 'lucide-react';
import { Pagination } from './Pagination';
import { ColumnFilterPopover } from './ColumnFilterPopover';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Column<T> {
  key: string;
  header: string;
  accessor: (row: T) => React.ReactNode;
  /** Raw value for sorting & filtering. Defaults to accessor if not provided. */
  rawValue?: (row: T) => string | number;
  sortable?: boolean;
  filterable?: boolean;
  /** Fixed width (e.g. '120px', '10%') */
  width?: string;
  /** Min width */
  minWidth?: string;
  /** Text alignment */
  align?: 'left' | 'center' | 'right';
  /** Truncate long text */
  truncate?: boolean;
}

export interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  /** Unique key extractor */
  rowKey: (row: T) => string;
  /** Enable checkbox selection */
  selectable?: boolean;
  selectedKeys?: Set<string>;
  onSelectionChange?: (keys: Set<string>) => void;
  /** Default page size */
  defaultPageSize?: number;
  /** Custom actions row (rendered above the table) */
  actions?: React.ReactNode;
  /** Loading state */
  loading?: boolean;
  /** Empty state message */
  emptyMessage?: string;
  /** Disable client-side filtering (for server-side) */
  disableClientFilter?: boolean;
}

type SortDir = 'asc' | 'desc';

// ─── DataTable ──────────────────────────────────────────────────────────────

export function DataTable<T>({
  data,
  columns,
  rowKey,
  selectable = false,
  selectedKeys,
  onSelectionChange,
  defaultPageSize = 25,
  actions,
  loading = false,
  emptyMessage = 'No data found.',
  disableClientFilter = false,
}: DataTableProps<T>) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [filters, setFilters] = useState<Record<string, Set<string>>>({});
  const [openFilter, setOpenFilter] = useState<string | null>(null);

  // Reset page when data or filters change
  useEffect(() => { setPage(1); }, [data, filters, pageSize]);

  // Get raw string value for a cell
  const getRawValue = useCallback((col: Column<T>, row: T): string => {
    if (col.rawValue) {
      const v = col.rawValue(row);
      return String(v ?? '');
    }
    const v = col.accessor(row);
    if (v == null) return '';
    if (typeof v === 'string' || typeof v === 'number') return String(v);
    return '';
  }, []);

  // Build unique filter options per column
  const filterOptions = useMemo(() => {
    const opts: Record<string, string[]> = {};
    for (const col of columns) {
      if (!col.filterable) continue;
      const set = new Set<string>();
      for (const row of data) {
        const v = getRawValue(col, row).trim();
        if (v) set.add(v);
      }
      opts[col.key] = Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    }
    return opts;
  }, [data, columns, getRawValue]);

  // Apply filters + sort
  const processedData = useMemo(() => {
    let result = data;

    // Client-side filtering
    if (!disableClientFilter) {
      for (const col of columns) {
        const f = filters[col.key];
        if (!f || f.size === 0) continue;
        result = result.filter((row) => {
          const v = getRawValue(col, row).trim();
          return f.has(v);
        });
      }
    }

    // Sort
    if (sortKey) {
      const col = columns.find((c) => c.key === sortKey);
      if (col) {
        result = [...result].sort((a, b) => {
          const va = col.rawValue ? col.rawValue(a) : getRawValue(col, a);
          const vb = col.rawValue ? col.rawValue(b) : getRawValue(col, b);
          let cmp = 0;
          if (typeof va === 'number' && typeof vb === 'number') {
            cmp = va - vb;
          } else {
            cmp = String(va).localeCompare(String(vb), undefined, { sensitivity: 'base', numeric: true });
          }
          return sortDir === 'asc' ? cmp : -cmp;
        });
      }
    }

    return result;
  }, [data, columns, filters, sortKey, sortDir, disableClientFilter, getRawValue]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(processedData.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedData = processedData.slice((safePage - 1) * pageSize, safePage * pageSize);

  // Selection helpers
  const allPageSelected = selectable && pagedData.length > 0 && pagedData.every((r) => selectedKeys?.has(rowKey(r)));
  const toggleAll = () => {
    if (!onSelectionChange || !selectedKeys) return;
    const next = new Set(selectedKeys);
    if (allPageSelected) {
      pagedData.forEach((r) => next.delete(rowKey(r)));
    } else {
      pagedData.forEach((r) => next.add(rowKey(r)));
    }
    onSelectionChange(next);
  };
  const toggleRow = (key: string) => {
    if (!onSelectionChange || !selectedKeys) return;
    const next = new Set(selectedKeys);
    if (next.has(key)) next.delete(key); else next.add(key);
    onSelectionChange(next);
  };

  const handleSort = (colKey: string) => {
    if (sortKey === colKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(colKey);
      setSortDir('asc');
    }
  };

  const activeFilterCount = Object.values(filters).filter((s) => s.size > 0).length;
  const clearAllFilters = () => setFilters({});

  const setColumnFilter = (key: string, value: Set<string>) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div className="space-y-3">
      {/* Action bar */}
      {(actions || activeFilterCount > 0) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
              >
                <X className="w-3 h-3" />
                Clear {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}
              </button>
            )}
            {selectable && selectedKeys && selectedKeys.size > 0 && (
              <span className="text-xs text-blue-700 font-medium bg-blue-50 px-2 py-1 rounded-md">
                {selectedKeys.size} selected
              </span>
            )}
          </div>
          {actions}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-500 border border-dashed border-gray-200 rounded-xl">
          <div className="h-6 w-6 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin mr-3" />
          Loading…
        </div>
      ) : processedData.length === 0 ? (
        <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-xl border border-gray-200">
          {activeFilterCount > 0 ? 'No results match the current filters.' : emptyMessage}
        </div>
      ) : (
        <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-200 text-gray-600">
                  {selectable && (
                    <th className="px-3 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={allPageSelected}
                        onChange={toggleAll}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </th>
                  )}
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      className="px-3 py-3 font-semibold text-xs uppercase tracking-wider whitespace-nowrap"
                      style={{ width: col.width, minWidth: col.minWidth, textAlign: col.align || 'left' }}
                    >
                      <div className="flex items-center gap-1.5 relative">
                        {/* Header text + sort */}
                        {col.sortable ? (
                          <button
                            type="button"
                            onClick={() => handleSort(col.key)}
                            className="inline-flex items-center gap-1 hover:text-gray-900 transition-colors group"
                          >
                            {col.header}
                            <span className="flex flex-col -space-y-1">
                              <ChevronUp className={`w-3 h-3 ${sortKey === col.key && sortDir === 'asc' ? 'text-blue-600' : 'text-gray-300 group-hover:text-gray-400'}`} />
                              <ChevronDown className={`w-3 h-3 ${sortKey === col.key && sortDir === 'desc' ? 'text-blue-600' : 'text-gray-300 group-hover:text-gray-400'}`} />
                            </span>
                          </button>
                        ) : (
                          <span>{col.header}</span>
                        )}

                        {/* Filter button */}
                        {col.filterable && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenFilter(openFilter === col.key ? null : col.key);
                            }}
                            className={`inline-flex items-center justify-center w-5 h-5 rounded transition-colors ${
                              filters[col.key]?.size
                                ? 'text-blue-600 bg-blue-50'
                                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                            }`}
                            title={`Filter by ${col.header}`}
                          >
                            <Filter className="w-3 h-3" />
                          </button>
                        )}

                        {/* Filter popover */}
                        {col.filterable && openFilter === col.key && filterOptions[col.key] && (
                          <ColumnFilterPopover
                            options={filterOptions[col.key]}
                            selected={filters[col.key] || new Set()}
                            onChange={(s) => setColumnFilter(col.key, s)}
                            onClose={() => setOpenFilter(null)}
                          />
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pagedData.map((row) => {
                  const key = rowKey(row);
                  const isSelected = selectable && selectedKeys?.has(key);
                  return (
                    <tr key={key} className={`hover:bg-gray-50/60 transition-colors ${isSelected ? 'bg-blue-50/40' : ''}`}>
                      {selectable && (
                        <td className="px-3 py-3">
                          <input
                            type="checkbox"
                            checked={!!isSelected}
                            onChange={() => toggleRow(key)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                        </td>
                      )}
                      {columns.map((col) => (
                        <td
                          key={col.key}
                          className={`px-3 py-3 text-gray-700 ${col.truncate ? 'max-w-[200px] truncate' : ''}`}
                          style={{ textAlign: col.align || 'left' }}
                          title={col.truncate ? String(getRawValue(col, row)) : undefined}
                        >
                          {col.accessor(row)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="px-4">
            <Pagination
              page={safePage}
              totalPages={totalPages}
              total={processedData.length}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
