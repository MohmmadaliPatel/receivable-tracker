'use client';

import React, { useState, useCallback } from 'react';
import { ChevronUp, ChevronDown, Filter, X } from 'lucide-react';
import { Pagination } from './Pagination';
import { ColumnFilterPopover } from './ColumnFilterPopover';
import type { Column } from './DataTable';

export type SortDir = 'asc' | 'desc';

export interface ServerDataTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  /** Total row count on the server (before pagination) */
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  /** Current sort column key, or null for default server order */
  sortKey: string | null;
  sortDir: SortDir;
  /** Called when user clicks a sortable column header */
  onSortChange: (colKey: string) => void;
  /** Per-column multi-select values (empty set = no filter for that column) */
  columnFilters: Record<string, Set<string>>;
  onColumnFilterChange: (colKey: string, values: Set<string>) => void;
  /** Server-provided option lists per filterable column */
  filterOptions: Record<string, string[] | undefined>;
  onClearAllFilters: () => void;
  actions?: React.ReactNode;
  loading?: boolean;
  emptyMessage?: string;
  selectable?: boolean;
  selectedKeys?: Set<string>;
  onSelectionChange?: (keys: Set<string>) => void;
  pageSizeOptions?: number[];
}

export function ServerDataTable<T>({
  rows,
  columns,
  rowKey,
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  sortKey,
  sortDir,
  onSortChange,
  columnFilters,
  onColumnFilterChange,
  filterOptions,
  onClearAllFilters,
  actions,
  loading = false,
  emptyMessage = 'No data found.',
  selectable = false,
  selectedKeys,
  onSelectionChange,
  pageSizeOptions,
}: ServerDataTableProps<T>) {
  const [openFilter, setOpenFilter] = useState<string | null>(null);

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

  const activeFilterCount = Object.values(columnFilters).filter((s) => s.size > 0).length;
  const totalPages = total === 0 ? 1 : Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);

  const allPageSelected =
    selectable &&
    rows.length > 0 &&
    rows.every((r) => selectedKeys?.has(rowKey(r)));

  const toggleAll = () => {
    if (!onSelectionChange || !selectedKeys) return;
    const next = new Set(selectedKeys);
    if (allPageSelected) {
      rows.forEach((r) => next.delete(rowKey(r)));
    } else {
      rows.forEach((r) => next.add(rowKey(r)));
    }
    onSelectionChange(next);
  };

  const toggleRow = (key: string) => {
    if (!onSelectionChange || !selectedKeys) return;
    const next = new Set(selectedKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onSelectionChange(next);
  };

  return (
    <div className="space-y-3">
      {(actions || activeFilterCount > 0) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={onClearAllFilters}
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

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-500 border border-dashed border-gray-200 rounded-xl">
          <div className="h-6 w-6 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin mr-3" />
          Loading…
        </div>
      ) : total === 0 ? (
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
                        {col.sortable ? (
                          <button
                            type="button"
                            onClick={() => onSortChange(col.key)}
                            className="inline-flex items-center gap-1 hover:text-gray-900 transition-colors group"
                          >
                            {col.header}
                            <span className="flex flex-col -space-y-1">
                              <ChevronUp
                                className={`w-3 h-3 ${
                                  sortKey === col.key && sortDir === 'asc'
                                    ? 'text-blue-600'
                                    : 'text-gray-300 group-hover:text-gray-400'
                                }`}
                              />
                              <ChevronDown
                                className={`w-3 h-3 ${
                                  sortKey === col.key && sortDir === 'desc'
                                    ? 'text-blue-600'
                                    : 'text-gray-300 group-hover:text-gray-400'
                                }`}
                              />
                            </span>
                          </button>
                        ) : (
                          <span>{col.header}</span>
                        )}

                        {col.filterable && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenFilter(openFilter === col.key ? null : col.key);
                            }}
                            className={`inline-flex items-center justify-center w-5 h-5 rounded transition-colors ${
                              columnFilters[col.key]?.size
                                ? 'text-blue-600 bg-blue-50'
                                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                            }`}
                            title={`Filter by ${col.header}`}
                          >
                            <Filter className="w-3 h-3" />
                          </button>
                        )}

                        {col.filterable && openFilter === col.key && (
                          <ColumnFilterPopover
                            options={filterOptions[col.key] ?? []}
                            selected={columnFilters[col.key] || new Set()}
                            onChange={(s) => onColumnFilterChange(col.key, s)}
                            onClose={() => setOpenFilter(null)}
                            loading={loading}
                          />
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row) => {
                  const key = rowKey(row);
                  const isSelected = selectable && selectedKeys?.has(key);
                  return (
                    <tr
                      key={key}
                      className={`hover:bg-gray-50/60 transition-colors ${
                        isSelected ? 'bg-blue-50/40' : ''
                      }`}
                    >
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

          <div className="px-4">
            <Pagination
              page={safePage}
              totalPages={totalPages}
              total={total}
              pageSize={pageSize}
              onPageChange={onPageChange}
              onPageSizeChange={onPageSizeChange}
              pageSizeOptions={pageSizeOptions}
            />
          </div>
        </div>
      )}
    </div>
  );
}
