'use client';

import React, { useState, useEffect } from 'react';

interface ForwardedEmail {
  id: string;
  originalSubject: string | null;
  originalFromEmail: string;
  originalFromName: string | null;
  originalReceivedAt: string;
  forwardedTo: string | null;
  forwardedAt: string | null;
  autoForwarded: boolean;
  hasReplies: boolean;
  replyCount: number;
  lastReplyAt: string | null;
  reminderSent?: boolean;
  reminderSentAt?: string | null;
  sender: {
    email: string;
    name: string | null;
  };
  emailConfig: {
    fromEmail: string;
    reminderEnabled?: boolean | null;
    reminderDurationHours?: number | null;
    reminderDurationUnit?: string | null;
  } | null;
}

interface Reply {
  id: string;
  subject: string;
  from: {
    emailAddress: {
      address: string;
      name?: string;
    };
  };
  body?: string;
  bodyPreview?: string;
  receivedDateTime: string;
  hasAttachments?: boolean;
  attachments?: Array<{
    id: string;
    name: string;
    contentType: string;
    size: number;
  }>;
}

export default function ForwardedEmailsList() {
  const [emails, setEmails] = useState<ForwardedEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmail, setSelectedEmail] = useState<ForwardedEmail | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [showRepliesModal, setShowRepliesModal] = useState(false);
  const [downloadingAttachment, setDownloadingAttachment] = useState<string | null>(null);
  const [sendingReminder, setSendingReminder] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterReplies, setFilterReplies] = useState<'all' | 'with-replies' | 'no-replies' | 'reminder-sent'>('all');
  const [filterDateRange, setFilterDateRange] = useState<'all' | 'today' | 'week' | 'month'>('all');

  useEffect(() => {
    fetchForwardedEmails();
  }, []);

  const fetchForwardedEmails = async () => {
    try {
      const response = await fetch('/api/forwarded-emails');
      if (response.ok) {
        const data = await response.json();
        setEmails(data.emails || []);
      }
    } catch (error) {
      console.error('Error fetching forwarded emails:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchReplies = async (emailId: string) => {
    setLoadingReplies(true);
    try {
      const response = await fetch(`/api/forwarded-emails/${emailId}/replies`);
      if (response.ok) {
        const data = await response.json();
        setReplies(data.replies || []);
      }
    } catch (error) {
      console.error('Error fetching replies:', error);
      setReplies([]);
    } finally {
      setLoadingReplies(false);
    }
  };

  const handleEmailClick = (email: ForwardedEmail) => {
    if (selectedEmail?.id === email.id) {
      setSelectedEmail(null);
      setReplies([]);
    } else {
      setSelectedEmail(email);
      console.log('email', email);
      
      if (email.hasReplies) {
        fetchReplies(email.id);
      } else {
        setReplies([]);
      }
    }
  };

  const handleViewReplies = async (email: ForwardedEmail) => {
    setSelectedEmail(email);
    await fetchReplies(email.id);
    setShowRepliesModal(true);
  };

  const handleDownloadAttachment = async (trackingId: string, attachmentId: string, fileName: string) => {
    setDownloadingAttachment(attachmentId);
    try {
      const response = await fetch(`/api/replies/${trackingId}/attachments/${attachmentId}`);
      if (!response.ok) {
        throw new Error('Failed to download attachment');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading attachment:', error);
      alert('Failed to download attachment');
    } finally {
      setDownloadingAttachment(null);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const shouldShowReminder = (email: ForwardedEmail): boolean => {
    if (!email.forwardedAt || !email.emailConfig) {
      return false;
    }

    // Check if reminder is enabled
    if (!email.emailConfig.reminderEnabled) {
      return false;
    }

    // If reminder has already been sent, don't show button
    if (email.reminderSent) {
      return false;
    }

    // If there are replies, don't show reminder
    if (email.hasReplies) {
      return false;
    }

    // Check if the duration has passed
    const forwardedDate = new Date(email.forwardedAt);
    const now = new Date();
    const minutesSinceForwarded = (now.getTime() - forwardedDate.getTime()) / (1000 * 60);
    
    const reminderDuration = email.emailConfig.reminderDurationHours || 24;
    const reminderUnit = email.emailConfig.reminderDurationUnit || 'hours';
    
    // Convert reminder duration to minutes for comparison
    const reminderDurationMinutes = reminderUnit === 'hours' 
      ? reminderDuration * 60 
      : reminderDuration;

    return minutesSinceForwarded >= reminderDurationMinutes;
  };

  const handleSendReminder = async (emailId: string) => {
    setSendingReminder(emailId);
    try {
      const response = await fetch(`/api/forwarded-emails/${emailId}/send-reminder`, {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to send reminder');
      }

      const data = await response.json();
      alert(data.message || 'Reminder email sent successfully!');
      fetchForwardedEmails();
    } catch (error: any) {
      console.error('Error sending reminder:', error);
      alert(error.message || 'Failed to send reminder email');
    } finally {
      setSendingReminder(null);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading forwarded emails...</div>;
  }

  return (
    <div className="p-6 bg-gradient-to-br from-gray-50 to-gray-100 min-h-screen">
      <div className="mb-6">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">Forwarded Emails</h2>
        <p className="text-sm text-gray-600">
          View all emails that have been forwarded. Click on an email to see details and replies.
        </p>
      </div>

      {/* Search and Filter Bar */}
      <div className="mb-6 bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Search Emails
            </label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by subject, sender, or forwarded-to..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Filter by Replies
            </label>
            <select
              value={filterReplies}
              onChange={(e) => setFilterReplies(e.target.value as any)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Emails</option>
              <option value="with-replies">With Replies</option>
              <option value="no-replies">No Replies</option>
              <option value="reminder-sent">Reminder Sent</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Filter by Date
            </label>
            <select
              value={filterDateRange}
              onChange={(e) => setFilterDateRange(e.target.value as any)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
            </select>
          </div>
        </div>
      </div>

      {(() => {
        // Filter emails based on search, replies, and date
        let filteredEmails = emails;
        
        // Apply search filter
        if (searchQuery.trim()) {
          const query = searchQuery.toLowerCase();
          filteredEmails = filteredEmails.filter(email => 
            (email.originalSubject && email.originalSubject.toLowerCase().includes(query)) ||
            email.originalFromEmail.toLowerCase().includes(query) ||
            (email.originalFromName && email.originalFromName.toLowerCase().includes(query)) ||
            email.sender.email.toLowerCase().includes(query) ||
            (email.sender.name && email.sender.name.toLowerCase().includes(query)) ||
            (email.forwardedTo && email.forwardedTo.toLowerCase().includes(query))
          );
        }
        
        // Apply replies filter
        if (filterReplies === 'with-replies') {
          filteredEmails = filteredEmails.filter(email => email.hasReplies);
        } else if (filterReplies === 'no-replies') {
          filteredEmails = filteredEmails.filter(email => !email.hasReplies && !email.reminderSent);
        } else if (filterReplies === 'reminder-sent') {
          filteredEmails = filteredEmails.filter(email => email.reminderSent);
        }
        
        // Apply date filter
        if (filterDateRange !== 'all' && filteredEmails.length > 0) {
          const now = new Date();
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const weekAgo = new Date(today);
          weekAgo.setDate(weekAgo.getDate() - 7);
          const monthAgo = new Date(today);
          monthAgo.setMonth(monthAgo.getMonth() - 1);
          
          filteredEmails = filteredEmails.filter(email => {
            if (!email.forwardedAt) return false;
            const forwardedDate = new Date(email.forwardedAt);
            
            if (filterDateRange === 'today') {
              return forwardedDate >= today;
            } else if (filterDateRange === 'week') {
              return forwardedDate >= weekAgo;
            } else if (filterDateRange === 'month') {
              return forwardedDate >= monthAgo;
            }
            return true;
          });
        }
        
        return filteredEmails.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="text-6xl mb-4">📧</div>
          <p className="text-xl font-semibold text-gray-700 mb-2">
            {emails.length === 0 
              ? 'No forwarded emails found'
              : 'No emails match your search criteria'}
          </p>
          <p className="text-sm text-gray-500">
            {emails.length === 0 
              ? 'Forwarded emails will appear here once emails are synced and forwarded.'
              : 'Try adjusting your search or filter options.'}
          </p>
        </div>
      ) : (
        <>
          {(searchQuery || filterReplies !== 'all' || filterDateRange !== 'all') && (
            <div className="mb-4 text-sm text-gray-600 bg-blue-50 border border-blue-200 rounded-lg p-3">
              Showing {filteredEmails.length} of {emails.length} email(s)
            </div>
          )}
          <div className="overflow-x-auto bg-white rounded-xl shadow-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gradient-to-r from-blue-50 to-indigo-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Subject
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Sender
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Initial Sender
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Forwarded To
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Forwarded At
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Replies
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredEmails.map((email) => (
                <React.Fragment key={email.id}>
                  <tr
                    className={`hover:bg-gray-50 cursor-pointer ${
                      selectedEmail?.id === email.id ? 'bg-blue-50' : ''
                    }`}
                    onClick={() => handleEmailClick(email)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {email.originalSubject || '(No Subject)'}
                      </div>
                      {email.autoForwarded && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 mt-1">
                          Auto
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {email.originalFromName || email.originalFromEmail}
                      </div>
                      <div className="text-sm text-gray-500">{email.originalFromEmail}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {email.sender.name || email.sender.email}
                      </div>
                      <div className="text-sm text-gray-500">{email.sender.email}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">
                        {email.forwardedTo?.split(',').map((email, idx) => (
                          <div key={idx} className="mb-1">{email.trim()}</div>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {email.forwardedAt
                        ? new Date(email.forwardedAt).toLocaleString()
                        : 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {email.hasReplies ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          {email.replyCount} reply{email.replyCount > 1 ? 'ies' : ''}
                        </span>
                      ) : email.reminderSent ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          📧 Reminder Sent
                        </span>
                      ) : shouldShowReminder(email) ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                          ⏰ Reminder Due
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">No replies</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEmailClick(email);
                          }}
                          className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors font-medium"
                        >
                          {selectedEmail?.id === email.id ? 'Hide' : 'View'} Details
                        </button>
                        {email.hasReplies && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleViewReplies(email);
                            }}
                            className="px-3 py-1.5 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition-colors font-medium"
                          >
                            💬 View Replies ({email.replyCount})
                          </button>
                        )}
                        {shouldShowReminder(email) && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSendReminder(email.id);
                            }}
                            disabled={sendingReminder === email.id}
                            className="px-3 py-1.5 bg-yellow-50 text-yellow-700 rounded-lg hover:bg-yellow-100 transition-colors font-medium disabled:bg-gray-100 disabled:text-gray-400"
                          >
                            {sendingReminder === email.id ? 'Sending...' : '📧 Send Reminder'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {selectedEmail?.id === email.id && (
                    <tr>
                      <td colSpan={7} className="px-6 py-6 bg-gradient-to-br from-blue-50 to-indigo-50">
                        <div className="space-y-4">
                          <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
                            <h4 className="text-lg font-bold text-gray-900 mb-3 flex items-center">
                              <span className="mr-2">📋</span> Email Details
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                              <div className="flex flex-col">
                                <span className="font-semibold text-gray-700">Received:</span>
                                <span className="text-gray-600">{new Date(email.originalReceivedAt).toLocaleString()}</span>
                              </div>
                              <div className="flex flex-col">
                                <span className="font-semibold text-gray-700">From:</span>
                                <span className="text-gray-600">{email.originalFromName || ''} &lt;{email.originalFromEmail}&gt;</span>
                              </div>
                              <div className="flex flex-col">
                                <span className="font-semibold text-gray-700">Forwarded To:</span>
                                <span className="text-gray-600">{email.forwardedTo}</span>
                              </div>
                              <div className="flex flex-col">
                                <span className="font-semibold text-gray-700">Forwarded At:</span>
                                <span className="text-gray-600">{email.forwardedAt ? new Date(email.forwardedAt).toLocaleString() : 'N/A'}</span>
                              </div>
                              {email.reminderSent && (
                                <div className="flex flex-col">
                                  <span className="font-semibold text-gray-700">Reminder Sent:</span>
                                  <span className="text-gray-600">{email.reminderSentAt ? new Date(email.reminderSentAt).toLocaleString() : 'Yes'}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {email.hasReplies && (
                            <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
                              <h4 className="text-lg font-bold text-gray-900 mb-3 flex items-center">
                                <span className="mr-2">💬</span> Replies ({email.replyCount})
                              </h4>
                              <button
                                onClick={() => handleViewReplies(email)}
                                className="px-4 py-2 bg-gradient-to-r from-purple-500 to-indigo-500 text-white rounded-lg hover:from-purple-600 hover:to-indigo-600 transition-all font-medium shadow-md"
                              >
                                View All Replies in Popup
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </>
      );
      })()}

      {/* Replies Modal */}
      {showRepliesModal && selectedEmail && (
        <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col border-2 border-gray-200">
            <div className="p-6 bg-gradient-to-r from-purple-500 to-indigo-600 text-white flex justify-between items-center">
              <div>
                <h3 className="text-2xl font-bold mb-1">💬 Replies to Forwarded Email</h3>
                <p className="text-sm text-purple-100">
                  Subject: {selectedEmail.originalSubject || '(No Subject)'}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowRepliesModal(false);
                  setReplies([]);
                }}
                className="text-white hover:text-gray-200 text-3xl font-bold w-10 h-10 flex items-center justify-center rounded-full hover:bg-white hover:bg-opacity-20 transition-all"
              >
                ×
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
              {loadingReplies ? (
                <div className="text-center py-12">
                  <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mb-4"></div>
                  <p className="text-gray-600 font-medium">Loading replies...</p>
                </div>
              ) : replies.length > 0 ? (
                <div className="space-y-4">
                  {replies.map((reply, index) => (
                    <div
                      key={reply.id}
                      className="bg-white border-2 border-gray-200 rounded-xl p-6 shadow-md hover:shadow-lg transition-shadow"
                    >
                      <div className="flex items-start justify-between mb-4 pb-3 border-b border-gray-200">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 bg-gradient-to-br from-purple-400 to-indigo-500 rounded-full flex items-center justify-center text-white font-bold">
                            {index + 1}
                          </div>
                          <div>
                            <p className="font-bold text-gray-900 text-lg">
                              {reply.from.emailAddress.name || reply.from.emailAddress.address}
                            </p>
                            <p className="text-sm text-gray-500">
                              {reply.from.emailAddress.address}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-medium text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                            {new Date(reply.receivedDateTime).toLocaleString()}
                          </span>
                        </div>
                      </div>
                      
                      <p className="text-base font-semibold text-gray-800 mb-3">
                        📌 {reply.subject || '(No Subject)'}
                      </p>
                      
                      {reply.body && (
                        <div 
                          className="text-sm text-gray-700 mt-3 p-4 bg-gray-50 rounded-lg border border-gray-200 max-h-80 overflow-y-auto prose prose-sm max-w-none"
                          dangerouslySetInnerHTML={{ __html: reply.body || reply.bodyPreview || '' }}
                        />
                      )}
                      {!reply.body && reply.bodyPreview && (
                        <p className="text-sm text-gray-700 mt-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
                          {reply.bodyPreview}
                        </p>
                      )}
                      
                      {reply.hasAttachments && reply.attachments && reply.attachments.length > 0 && (
                        <div className="mt-4 pt-4 border-t-2 border-gray-300">
                          <p className="text-sm font-bold text-gray-800 mb-3 flex items-center">
                            <span className="mr-2">📎</span> Attachments ({reply.attachments.length})
                          </p>
                          <div className="space-y-2">
                            {reply.attachments.map((attachment) => (
                              <div
                                key={attachment.id}
                                className="flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-lg p-3 hover:shadow-md transition-shadow"
                              >
                                <div className="flex items-center space-x-2 flex-1 min-w-0">
                                  <svg
                                    className="w-5 h-5 text-gray-400 flex-shrink-0"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                                    />
                                  </svg>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm text-gray-900 truncate">{attachment.name}</p>
                                    <p className="text-xs text-gray-500">
                                      {formatFileSize(attachment.size)} • {attachment.contentType}
                                    </p>
                                  </div>
                                </div>
                                <button
                                  onClick={() =>
                                    handleDownloadAttachment(selectedEmail.id, attachment.id, attachment.name)
                                  }
                                  disabled={downloadingAttachment === attachment.id}
                                  className="ml-3 px-4 py-2 text-sm bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed font-medium shadow-md transition-all"
                                >
                                  {downloadingAttachment === attachment.id ? '⏳ Downloading...' : '⬇️ Download'}
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-16">
                  <div className="text-6xl mb-4">💭</div>
                  <p className="text-xl font-semibold text-gray-700 mb-2">No replies found</p>
                  <p className="text-sm text-gray-500">Replies may take a few moments to appear after forwarding.</p>
                </div>
              )}
            </div>
            
            <div className="p-6 border-t-2 border-gray-200 bg-gray-50 flex justify-end">
              <button
                onClick={() => {
                  setShowRepliesModal(false);
                  setReplies([]);
                }}
                className="px-6 py-2.5 bg-gradient-to-r from-gray-500 to-gray-600 text-white rounded-lg hover:from-gray-600 hover:to-gray-700 transition-all font-medium shadow-md"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

