'use client';

import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize?: number;
  pageSizeOptions?: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}

export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  pageSizeOptions = [10, 25, 50, 100],
  onPageChange,
  onPageSizeChange,
}: PaginationProps) {
  if (total === 0) return null;

  const from = (page - 1) * (pageSize ?? 25) + 1;
  const to = Math.min(page * (pageSize ?? 25), total);

  // Generate visible page numbers
  const getPageNumbers = (): (number | '...')[] => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | '...')[] = [1];
    if (page > 3) pages.push('...');
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
      pages.push(i);
    }
    if (page < totalPages - 2) pages.push('...');
    pages.push(totalPages);
    return pages;
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-4 pb-2 border-t border-gray-100 mt-2 text-sm">
      {/* Left: range info */}
      <div className="flex items-center gap-3 text-gray-500">
        <span>
          Showing <span className="font-medium text-gray-800">{from}</span>–<span className="font-medium text-gray-800">{to}</span> of{' '}
          <span className="font-medium text-gray-800">{total.toLocaleString()}</span>
        </span>
        {onPageSizeChange && pageSize && (
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="h-8 pl-2 pr-7 rounded-md border border-gray-200 bg-white text-sm text-gray-700 cursor-pointer hover:border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 appearance-none"
            style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.3rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.25em 1.25em' }}
          >
            {pageSizeOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt} / page
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Right: page navigation */}
      <div className="flex items-center gap-1">
        {/* First page */}
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(1)}
          className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="First page"
        >
          <ChevronsLeft className="w-3.5 h-3.5" />
        </button>
        {/* Prev */}
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Previous page"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>

        {/* Page numbers */}
        {getPageNumbers().map((p, i) =>
          p === '...' ? (
            <span key={`dots-${i}`} className="w-8 h-8 flex items-center justify-center text-gray-400 text-xs">
              ···
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange(p)}
              className={`inline-flex items-center justify-center min-w-[2rem] h-8 px-1.5 rounded-md text-sm font-medium transition-colors ${
                p === page
                  ? 'bg-blue-600 text-white border border-blue-600 shadow-sm'
                  : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              {p}
            </button>
          )
        )}

        {/* Next */}
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Next page"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
        {/* Last page */}
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(totalPages)}
          className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Last page"
        >
          <ChevronsRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
