'use client';

import { useState, useEffect } from 'react';
import * as path from 'path';

interface AppSettings {
  id: string;
  autoReplyCheck: boolean;
  replyCheckIntervalMinutes: number;
  emailSaveBasePath: string;
}

function FolderPathPreview({ basePath }: { basePath: string }) {
  const entity = 'Clean Max IPP 4 Power Private Limited';
  const category = 'Bank Balances and FDs';
  const sentPath = `${basePath}/${entity}/${category}/Emails Sent/`;
  const responsesPath = `${basePath}/${entity}/${category}/Responses Received/`;

  return (
    <div className="mt-3 p-4 bg-gray-900 rounded-xl text-xs font-mono text-gray-300 space-y-1.5">
      <p className="text-gray-500 mb-2"># Example folder structure:</p>
      <div className="flex items-start gap-2">
        <span className="text-blue-400 flex-shrink-0">📁</span>
        <span className="text-green-400 break-all">{sentPath}</span>
      </div>
      <div className="flex items-start gap-2">
        <span className="text-blue-400 flex-shrink-0">📁</span>
        <span className="text-amber-400 break-all">{responsesPath}</span>
      </div>
      <p className="text-gray-600 mt-2 text-xs italic">Files are saved as: YYYY-MM-DD_HH-mm_BankName.html</p>
    </div>
  );
}

export default function SettingsClient() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Local edits
  const [autoReplyCheck, setAutoReplyCheck] = useState(true);
  const [interval, setInterval] = useState(30);
  const [basePath, setBasePath] = useState('emails');

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((data) => {
        if (data.settings) {
          setSettings(data.settings);
          setAutoReplyCheck(data.settings.autoReplyCheck);
          setInterval(data.settings.replyCheckIntervalMinutes);
          setBasePath(data.settings.emailSaveBasePath);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          autoReplyCheck,
          replyCheckIntervalMinutes: interval,
          emailSaveBasePath: basePath.trim() || 'emails',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to save settings');
        return;
      }
      setSettings(data.settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Configure auto-reply checking and email storage preferences</p>
      </div>

      <div className="space-y-6">
        {/* Auto Reply Check */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Auto-Reply Check</h2>
              <p className="text-sm text-gray-500 mt-1">
                Automatically scan your inbox for replies to sent confirmation emails during each cron cycle.
                When a reply is detected, the record status is updated to "Response Received" and the email
                is saved to the Responses Received folder.
              </p>
            </div>
            <Toggle value={autoReplyCheck} onChange={setAutoReplyCheck} />
          </div>

          {autoReplyCheck && (
            <div className="mt-5 pt-5 border-t border-gray-100">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Check interval
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min={30}
                  max={360}
                  step={30}
                  value={interval}
                  onChange={(e) => setInterval(Number(e.target.value))}
                  className="flex-1 accent-blue-600"
                />
                <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-4 py-2 min-w-[100px] justify-center">
                  <span className="text-lg font-bold text-gray-800">
                    {interval >= 60 ? `${Math.floor(interval / 60)}h${interval % 60 > 0 ? ` ${interval % 60}m` : ''}` : `${interval}m`}
                  </span>
                </div>
              </div>
              <div className="flex justify-between text-xs text-gray-400 mt-1 px-0.5">
                <span>30 min</span>
                <span>Every {interval >= 60 ? `${Math.floor(interval / 60)}h${interval % 60 > 0 ? ` ${interval % 60}m` : ''}` : `${interval}m`}</span>
                <span>6 hours</span>
              </div>
              <p className="text-xs text-gray-400 mt-3">
                Note: Reply checks run in conjunction with the email cron job. The cron job must be enabled on at least one Email Configuration for auto-check to work.
              </p>
            </div>
          )}
        </div>

        {/* Email Save Folder */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900">Email Save Location</h2>
          <p className="text-sm text-gray-500 mt-1">
            All sent confirmation emails and received responses are saved to disk in a structured folder hierarchy.
            Set the base folder path below.
          </p>

          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Base folder path
            </label>
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={basePath}
                onChange={(e) => setBasePath(e.target.value)}
                placeholder="emails"
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                onClick={() => setBasePath('emails')}
                className="px-3 py-2.5 text-xs border border-gray-200 text-gray-500 rounded-xl hover:bg-gray-50 transition-colors"
              >
                Reset
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Use a relative path (relative to project root) or an absolute path.
              Relative example: <code className="bg-gray-100 px-1.5 py-0.5 rounded font-mono">emails</code>
              &nbsp;→ <code className="bg-gray-100 px-1.5 py-0.5 rounded font-mono">/project/emails/</code>
            </p>
            <FolderPathPreview basePath={basePath || 'emails'} />
          </div>
        </div>

        {/* Folder structure guide */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900">Folder Structure Guide</h2>
          <p className="text-sm text-gray-500 mt-1 mb-4">
            Emails are organized so you can find them without opening the application:
          </p>
          <div className="space-y-3">
            {[
              {
                level: 'Level 1',
                desc: 'Entity folder — one folder per client entity',
                example: 'Clean Max IPP 4 Power Private Limited/',
                color: 'bg-blue-50 border-blue-200 text-blue-700',
              },
              {
                level: 'Level 2',
                desc: 'Category folder — inside each entity folder',
                example: 'Bank Balances and FDs/',
                color: 'bg-purple-50 border-purple-200 text-purple-700',
              },
              {
                level: 'Level 3a',
                desc: 'Emails Sent — original + follow-up emails',
                example: 'Emails Sent/2026-04-06_10-30_HDFC_Bank.html',
                color: 'bg-amber-50 border-amber-200 text-amber-700',
              },
              {
                level: 'Level 3b',
                desc: 'Responses Received — replies from banks/parties',
                example: 'Responses Received/2026-04-08_14-15_xxxx@hdfcbank.com.html',
                color: 'bg-green-50 border-green-200 text-green-700',
              },
            ].map((item) => (
              <div key={item.level} className={`flex items-start gap-4 p-4 rounded-xl border ${item.color}`}>
                <span className="text-xs font-bold w-16 flex-shrink-0 mt-0.5">{item.level}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{item.desc}</p>
                  <p className="text-xs font-mono mt-1 opacity-80 break-all">{item.example}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 p-4 bg-gray-50 rounded-xl text-xs text-gray-500">
            <p className="font-medium text-gray-600 mb-1">File format</p>
            <p>Each email is saved as an HTML file with full styling. Open any .html file in a browser to view it, or use the in-app viewer for PDF export. Files are named as:</p>
            <code className="block mt-2 bg-white border border-gray-200 px-3 py-2 rounded-lg font-mono">
              YYYY-MM-DD_HH-mm_BankOrPartyName.html
            </code>
          </div>
        </div>

        {/* Save button */}
        <div className="flex items-center justify-between">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-xl border border-red-200">
              {error}
            </p>
          )}
          {saved && (
            <p className="text-sm text-green-600 bg-green-50 px-4 py-2 rounded-xl border border-green-200 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Settings saved
            </p>
          )}
          {!error && !saved && <div />}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 shadow-sm"
          >
            {saving && (
              <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
        value ? 'bg-blue-600' : 'bg-gray-200'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
          value ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}
