'use client';

import { useState, useEffect, FormEvent } from 'react';

interface EmailTracking {
  id: string;
  originalSubject: string | null;
  originalFromEmail: string;
  originalFromName: string | null;
  originalReceivedAt: string;
  isForwarded: boolean;
  forwardedTo: string | null;
  forwardedAt: string | null;
  autoForwarded: boolean;
  hasReplies: boolean;
  replyCount: number;
  lastReplyAt: string | null;
  hasAttachments: boolean;
  status: string;
}

interface Recipient {
  id: string;
  email: string;
  name: string | null;
  isActive: boolean;
  emailTrackings: EmailTracking[];
  createdAt: string;
}

export default function RecipientTrackingDashboard() {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedRecipient, setSelectedRecipient] = useState<Recipient | null>(null);
  const [formData, setFormData] = useState({ email: '', name: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [syncing, setSyncing] = useState<string | null>(null);
  const [forwarding, setForwarding] = useState<string | null>(null);
  const [forwardForm, setForwardForm] = useState<{ trackingId: string; forwardTo: string; customMessage: string } | null>(null);

  useEffect(() => {
    fetchRecipients();
  }, []);

  const fetchRecipients = async () => {
    try {
      const response = await fetch('/api/recipients');
      if (response.ok) {
        const data = await response.json();
        setRecipients(data.recipients || []);
      }
    } catch (err) {
      console.error('Error fetching recipients:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddRecipient = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/api/recipients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to add recipient');
      }

      setSuccess('Recipient added successfully!');
      setShowAddForm(false);
      setFormData({ email: '', name: '' });
      fetchRecipients();
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    }
  };

  const handleSync = async (recipientId: string) => {
    setSyncing(recipientId);
    setError('');
    setSuccess('');

    try {
      const response = await fetch(`/api/recipients/${recipientId}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 50 }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to sync emails');
      }

      const data = await response.json();
      setSuccess(`Synced ${data.fetched} emails successfully!`);
      fetchRecipients();
    } catch (err: any) {
      setError(err.message || 'Failed to sync emails');
    } finally {
      setSyncing(null);
    }
  };

  const handleForward = async (trackingId: string, forwardTo: string, customMessage: string) => {
    setForwarding(trackingId);
    setError('');
    setSuccess('');

    try {
      const response = await fetch(`/api/email-tracking/${trackingId}/forward`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forwardTo, customMessage, includeOriginalBody: true }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to forward email');
      }

      setSuccess('Email forwarded successfully!');
      setForwardForm(null);
      fetchRecipients();
    } catch (err: any) {
      setError(err.message || 'Failed to forward email');
    } finally {
      setForwarding(null);
    }
  };

  const handleDeleteRecipient = async (id: string) => {
    if (!confirm('Are you sure you want to delete this recipient? All tracked emails will also be deleted.')) {
      return;
    }

    try {
      const response = await fetch(`/api/recipients/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete recipient');
      }

      setSuccess('Recipient deleted successfully!');
      fetchRecipients();
    } catch (err: any) {
      setError(err.message || 'Failed to delete recipient');
    }
  };

  const getStats = (trackings: EmailTracking[]) => {
    return {
      total: trackings.length,
      received: trackings.filter((e) => e.status === 'received').length,
      forwarded: trackings.filter((e) => e.isForwarded).length,
      withReplies: trackings.filter((e) => e.hasReplies).length,
      withAttachments: trackings.filter((e) => e.hasAttachments).length,
    };
  };

  if (loading) {
    return <div className="text-center py-8">Loading recipients...</div>;
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Recipient Email Tracking</h2>
        <button
          onClick={() => setShowAddForm(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          + Add Recipient
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 text-green-700 rounded-lg">
          {success}
        </div>
      )}

      {showAddForm && (
        <div className="mb-6 bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-xl text-black font-semibold mb-4">Add New Recipient</h3>
          <form onSubmit={handleAddRecipient} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email Address *
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
                className="w-full px-3 py-2 text-black border border-gray-300 rounded-lg"
                placeholder="recipient@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name (Optional)
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 text-black border border-gray-300 rounded-lg"
                placeholder="Recipient Name"
              />
            </div>
            <div className="flex space-x-3">
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Add Recipient
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setFormData({ email: '', name: '' });
                }}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-6">
        {recipients.length === 0 ? (
          <div className="text-center py-8 text-black">
            No recipients found. Add a recipient to start tracking emails.
          </div>
        ) : (
          recipients.map((recipient) => {
            const stats = getStats(recipient.emailTrackings);
            const isExpanded = selectedRecipient?.id === recipient.id;

            return (
              <div
                key={recipient.id}
                className={`bg-white border rounded-lg overflow-hidden ${
                  isExpanded ? 'border-blue-500' : 'border-gray-200'
                }`}
              >
                {/* Recipient Header */}
                <div
                  className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => setSelectedRecipient(isExpanded ? null : recipient)}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <h3 className="text-lg text-black font-semibold">
                          {recipient.name || recipient.email}
                        </h3>
                        {!recipient.isActive && (
                          <span className="px-2 py-1 bg-gray-200 text-gray-700 text-xs rounded">
                            Inactive
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-black">{recipient.email}</p>
                      <div className="flex text-black space-x-4 mt-2 text-sm">
                        <span>
                          <strong>Total:</strong> {stats.total}
                        </span>
                        <span>
                          <strong>Received:</strong> {stats.received}
                        </span>
                        <span>
                          <strong>Forwarded:</strong> {stats.forwarded}
                        </span>
                        <span>
                          <strong>Replies:</strong> {stats.withReplies}
                        </span>
                        <span>
                          <strong>Attachments:</strong> {stats.withAttachments}
                        </span>
                      </div>
                    </div>
                    <div className="flex space-x-2 ml-4">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSync(recipient.id);
                        }}
                        disabled={syncing === recipient.id}
                        className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400"
                      >
                        {syncing === recipient.id ? 'Syncing...' : 'Sync Emails'}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteRecipient(recipient.id);
                        }}
                        className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>

                {/* Summary Only - No Email Details */}
                {isExpanded && (
                  <div className="border-t bg-gray-50 p-4">
                    <div className="text-sm text-gray-600">
                      <p className="mb-2">
                        <strong>Summary:</strong> This recipient has {stats.total} total email(s) tracked.
                      </p>
                      <p className="mb-2">
                        <strong>Status Breakdown:</strong>
                      </p>
                      <ul className="list-disc list-inside space-y-1 ml-4">
                        <li>{stats.received} email(s) received</li>
                        <li>{stats.forwarded} email(s) forwarded</li>
                        <li>{stats.withReplies} email(s) with replies</li>
                        <li>{stats.withAttachments} email(s) with attachments</li>
                      </ul>
                      <p className="mt-4 text-xs text-gray-500">
                        View detailed forwarded emails on the <a href="/forwarded-emails" className="text-blue-600 hover:underline">Forwarded Emails</a> page.
                      </p>
                    </div>
                  </div>
                )}
                
                {/* Hidden Email List - Keep for reference but not displayed */}
                {false && isExpanded && (
                  <div className="border-t bg-gray-50 p-4">
                    {recipient.emailTrackings.length === 0 ? (
                      <div className="text-center py-4 text-black">
                        No emails tracked yet. Click "Sync Emails" to fetch emails.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {recipient.emailTrackings.map((tracking) => (
                          <div
                            key={tracking.id}
                            className="bg-white border border-gray-200 rounded-lg p-4"
                          >
                            <div className="flex justify-between items-start mb-2">
                              <div className="flex-1">
                                <h4 className="font-medium text-gray-900">
                                  {tracking.originalSubject || '(No Subject)'}
                                </h4>
                                <p className="text-sm text-black mt-1">
                                  <strong>From:</strong> {tracking.originalFromName || tracking.originalFromEmail}
                                </p>
                                <p className="text-sm text-black">
                                  <strong>Date:</strong>{' '}
                                  {new Date(tracking.originalReceivedAt).toLocaleString()}
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2 ml-4">
                                {tracking.hasAttachments && (
                                  <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">
                                    📎 Attachments
                                  </span>
                                )}
                                {tracking.isForwarded && (
                                  <span className={`px-2 py-1 text-xs rounded ${
                                    tracking.autoForwarded 
                                      ? 'bg-purple-100 text-purple-700' 
                                      : 'bg-green-100 text-green-700'
                                  }`}>
                                    {tracking.autoForwarded ? '🤖 Auto-Forwarded' : '✓ Forwarded'}
                                  </span>
                                )}
                                {tracking.hasReplies && (
                                  <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded">
                                    💬 {tracking.replyCount} Reply{tracking.replyCount > 1 ? 'ies' : ''}
                                  </span>
                                )}
                              </div>
                            </div>

                            {tracking.isForwarded && (
                              <div className={`mt-2 p-2 rounded text-sm ${
                                tracking.autoForwarded ? 'bg-purple-50' : 'bg-green-50'
                              }`}>
                                <div className="flex items-center space-x-2">
                                  {tracking.autoForwarded && (
                                    <span className="text-purple-600">🤖</span>
                                  )}
                                  <strong>Forwarded to:</strong> {tracking.forwardedTo}
                                </div>
                                {tracking.forwardedAt && (
                                  <span className="ml-2 text-gray-600 text-xs">
                                    on {new Date(tracking.forwardedAt).toLocaleString()}
                                  </span>
                                )}
                              </div>
                            )}

                            {!tracking.isForwarded && (
                              <button
                                onClick={() =>
                                  setForwardForm({
                                    trackingId: tracking.id,
                                    forwardTo: '',
                                    customMessage: '',
                                  })
                                }
                                className="mt-3 px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                              >
                                Forward Email
                              </button>
                            )}

                            {forwardForm?.trackingId === tracking.id && (
                              <div className="mt-3 p-3 bg-gray-50 rounded-lg border">
                                <label className="block text-sm font-medium mb-1">
                                  Forward To (comma-separated emails) *
                                </label>
                                <input
                                  type="text"
                                  value={forwardForm.forwardTo}
                                  onChange={(e) =>
                                    setForwardForm({ ...forwardForm, forwardTo: e.target.value })
                                  }
                                  className="w-full px-3 py-2 border border-gray-300 rounded mb-2"
                                  placeholder="email1@example.com, email2@example.com"
                                />
                                <label className="block text-sm font-medium mb-1">
                                  Custom Message (Optional)
                                </label>
                                <textarea
                                  value={forwardForm.customMessage}
                                  onChange={(e) =>
                                    setForwardForm({ ...forwardForm, customMessage: e.target.value })
                                  }
                                  className="w-full px-3 py-2 border border-gray-300 rounded mb-2"
                                  rows={3}
                                  placeholder="Add a custom message..."
                                />
                                <div className="flex space-x-2">
                                  <button
                                    onClick={() =>
                                      handleForward(
                                        tracking.id,
                                        forwardForm.forwardTo,
                                        forwardForm.customMessage
                                      )
                                    }
                                    disabled={!forwardForm.forwardTo || forwarding === tracking.id}
                                    className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
                                  >
                                    {forwarding === tracking.id ? 'Forwarding...' : 'Send Forward'}
                                  </button>
                                  <button
                                    onClick={() => setForwardForm(null)}
                                    className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
