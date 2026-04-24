'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type AttMatchType = 'customer_code' | 'customer_name' | 'company_name';

type DistinctCustomer = {
  label: string;
  customerName: string;
  customerCode: string;
  companyName: string;
};

type Rule = {
  id: string;
  matchType: string;
  matchValue: string;
  fileName: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  importId: string | null;
};

export default function AttachmentsModal({ open, onClose, importId }: Props) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [attType, setAttType] = useState<AttMatchType>('customer_code');
  const [distinctCustomers, setDistinctCustomers] = useState<DistinctCustomer[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

  const loadRules = useCallback(async () => {
    const res = await fetch('/api/aging/attachments');
    if (res.ok) {
      const d = await res.json();
      setRules(d.rules || []);
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadRules();
    }
  }, [open, loadRules]);

  useEffect(() => {
    if (!open || !importId) {
      setDistinctCustomers([]);
      return;
    }
    fetch(`/api/aging/distinct-customers?importId=${encodeURIComponent(importId)}`)
      .then((r) => r.json())
      .then((d) => setDistinctCustomers(d.customers || []))
      .catch(() => setDistinctCustomers([]));
  }, [open, importId]);

  useEffect(() => {
    if (open) {
      setSearch('');
      setSelected(new Set());
      setFile(null);
      setMessage(null);
    }
  }, [open, attType]);

  const options = useMemo(() => {
    if (attType === 'customer_code') {
      return distinctCustomers.map((c) => ({
        key: c.customerCode,
        label: `${c.customerCode} — ${c.customerName}`,
        matchValue: c.customerCode,
      }));
    }
    if (attType === 'customer_name') {
      const seen = new Set<string>();
      const out: { key: string; label: string; matchValue: string }[] = [];
      for (const c of distinctCustomers) {
        const v = c.customerName.trim();
        if (!v || seen.has(v.toLowerCase())) continue;
        seen.add(v.toLowerCase());
        out.push({ key: v, label: c.label || v, matchValue: v });
      }
      return out;
    }
    // company_name
    const seen = new Set<string>();
    const out: { key: string; label: string; matchValue: string }[] = [];
    for (const c of distinctCustomers) {
      const v = c.companyName?.trim() || '';
      if (!v || seen.has(v.toLowerCase())) continue;
      seen.add(v.toLowerCase());
      out.push({ key: v, label: v, matchValue: v });
    }
    return out;
  }, [attType, distinctCustomers]);

  const filteredOptions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q) || o.matchValue.toLowerCase().includes(q));
  }, [options, search]);

  const toggle = (matchValue: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(matchValue)) n.delete(matchValue);
      else n.add(matchValue);
      return n;
    });
  };

  const onAdd = async () => {
    if (!file) {
      setMessage('Choose a file');
      return;
    }
    if (selected.size === 0) {
      setMessage('Select at least one row');
      return;
    }
    setBulkBusy(true);
    setMessage(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('matchType', attType);
      fd.append('matchValues', JSON.stringify([...selected]));
      const res = await fetch('/api/aging/attachments/bulk', { method: 'POST', body: fd });
      const d = await res.json();
      if (res.ok) {
        setMessage(`Created/updated ${d.count} rule(s).`);
        setSelected(new Set());
        setFile(null);
        loadRules();
      } else {
        setMessage(d.error || 'Failed');
      }
    } finally {
      setBulkBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" role="dialog" aria-modal>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Attachments by customer / company</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-xl leading-none"
          >
            ×
          </button>
        </div>
        <div className="p-4 space-y-4 overflow-y-auto flex-1 text-sm">
          {message && (
            <div className="text-sm text-blue-800 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
              {message}
            </div>
          )}

          {!importId && (
            <p className="text-amber-700 text-sm">No ageing import is loaded — rules can still be listed.</p>
          )}

          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Match on</label>
              <select
                value={attType}
                onChange={(e) => setAttType(e.target.value as AttMatchType)}
                className="text-sm border rounded-lg px-2 py-1.5"
              >
                <option value="customer_code">Customer code</option>
                <option value="customer_name">Customer name</option>
                <option value="company_name">Company name</option>
              </select>
            </div>
            <div className="flex-1 min-w-0 max-w-md">
              <label className="block text-xs text-gray-500 mb-1">Search</label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search list…"
                className="w-full text-sm border rounded-lg px-2 py-1.5"
              />
            </div>
          </div>

          <div className="border border-gray-200 rounded-lg p-2 max-h-40 overflow-y-auto space-y-1.5">
            {filteredOptions.length === 0 ? (
              <p className="text-gray-400 text-sm p-2">No rows. Import data or try another match type.</p>
            ) : (
              filteredOptions.map((o) => (
                <label key={o.key} className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={selected.has(o.matchValue)}
                    onChange={() => toggle(o.matchValue)}
                  />
                  <span>{o.label}</span>
                </label>
              ))
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-sm flex-1 min-w-0"
            />
            <button
              type="button"
              disabled={bulkBusy}
              onClick={onAdd}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-50"
            >
              {bulkBusy ? '…' : 'Add for selected'}
            </button>
          </div>

          <div>
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Current rules</h3>
            <ul className="space-y-1.5 text-sm max-h-36 overflow-y-auto">
              {rules.map((r) => (
                <li key={r.id} className="flex justify-between gap-2">
                  <span>
                    {r.matchType} = {r.matchValue} — {r.fileName}
                  </span>
                  <button
                    type="button"
                    className="text-red-600 text-xs shrink-0"
                    onClick={async () => {
                      await fetch(`/api/aging/attachments?id=${encodeURIComponent(r.id)}`, {
                        method: 'DELETE',
                      });
                      loadRules();
                    }}
                  >
                    Remove
                  </button>
                </li>
              ))}
              {rules.length === 0 && <li className="text-gray-400">No rules</li>}
            </ul>
          </div>
        </div>
        <div className="px-4 py-3 border-t border-gray-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
