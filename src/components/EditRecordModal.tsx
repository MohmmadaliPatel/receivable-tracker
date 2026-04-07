'use client';

import { useState } from 'react';
import { ConfirmationRecord } from './ConfirmationTable';

const CATEGORIES = [
  'Bank Balances and FDs',
  'Borrowings',
  'Trade Receivables',
  'Trade Payables',
  'Other Receivables',
  'Other Payables',
];

interface EditRecordModalProps {
  record: ConfirmationRecord;
  onClose: () => void;
  onSaved: () => void;
}

export default function EditRecordModal({ record, onClose, onSaved }: EditRecordModalProps) {
  const [entityName, setEntityName] = useState(record.entityName);
  const [category, setCategory] = useState(record.category);
  const [bankName, setBankName] = useState(record.bankName || '');
  const [accountNumber, setAccountNumber] = useState(record.accountNumber || '');
  const [custId, setCustId] = useState(record.custId || '');
  const [emailTo, setEmailTo] = useState(record.emailTo);
  const [emailCc, setEmailCc] = useState(record.emailCc || '');
  const [remarks, setRemarks] = useState(record.remarks || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editable fields for bank category rows
  const isBankCategory = category === 'Bank Balances and FDs' || category === 'Borrowings';

  const handleSave = async () => {
    if (!entityName.trim()) { setError('Entity Name is required'); return; }
    if (!emailTo.trim()) { setError('Email TO is required'); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/confirmations/${record.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityName: entityName.trim(),
          category,
          bankName: bankName.trim() || null,
          accountNumber: isBankCategory ? (accountNumber.trim() || null) : null,
          custId: isBankCategory ? (custId.trim() || null) : null,
          emailTo: emailTo.trim(),
          emailCc: emailCc.trim() || null,
          remarks: remarks.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to save'); return; }
      onSaved();
    } catch (err: any) {
      setError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-200">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Edit Record</h2>
            <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs" title={record.entityName}>
              {record.entityName} — {record.category}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Entity Name */}
          <Field label="Entity Name" required>
            <input
              type="text"
              value={entityName}
              onChange={(e) => setEntityName(e.target.value)}
              className={inputCls}
              placeholder="Entity Pvt Ltd"
            />
          </Field>

          {/* Category */}
          <Field label="Category" required>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={inputCls}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </Field>

          {/* Bank / Confirming Party */}
          <Field label="Bank / Confirming Party">
            <input
              type="text"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              className={inputCls}
              placeholder="HDFC Bank"
            />
          </Field>

          {/* Account Number + Cust ID — only editable for Bank/Borrowings */}
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Account / Loan No."
              hint={!isBankCategory ? 'Not applicable for this category' : undefined}
            >
              <input
                type="text"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                disabled={!isBankCategory}
                className={`${inputCls} ${!isBankCategory ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : ''}`}
                placeholder={isBankCategory ? 'ACCT-001' : 'N/A'}
              />
            </Field>
            <Field
              label="Cust ID"
              hint={!isBankCategory ? 'Not applicable for this category' : undefined}
            >
              <input
                type="text"
                value={custId}
                onChange={(e) => setCustId(e.target.value)}
                disabled={!isBankCategory}
                className={`${inputCls} ${!isBankCategory ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : ''}`}
                placeholder={isBankCategory ? 'CUST-001' : 'N/A'}
              />
            </Field>
          </div>

          {/* Email To */}
          <Field label="Email To" required hint="Comma-separate multiple addresses">
            <input
              type="text"
              value={emailTo}
              onChange={(e) => setEmailTo(e.target.value)}
              className={inputCls}
              placeholder="contact@bank.com, manager@bank.com"
            />
          </Field>

          {/* Email CC */}
          <Field label="Email CC" hint="Optional — comma-separate multiple addresses">
            <input
              type="text"
              value={emailCc}
              onChange={(e) => setEmailCc(e.target.value)}
              className={inputCls}
              placeholder="auditor@yourfirm.com"
            />
          </Field>

          {/* Remarks */}
          <Field label="Remarks / Notes">
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={2}
              className={`${inputCls} resize-none`}
              placeholder="Internal notes for this record…"
            />
          </Field>

          {/* Status note */}
          {record.status !== 'not_sent' && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
              <strong>Note:</strong> This record has already been sent (status: <em>{record.status.replace(/_/g, ' ')}</em>).
              Editing contact details here will only affect future sends and follow-ups, not emails already delivered.
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-200 rounded-xl transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !entityName.trim() || !emailTo.trim()}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 shadow-sm"
          >
            {saving && (
              <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  'w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white';

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
        {hint && <span className="text-xs text-gray-400 font-normal ml-2">— {hint}</span>}
      </label>
      {children}
    </div>
  );
}
