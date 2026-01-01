'use client';

import { useState, useEffect } from 'react';

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
  recipient: {
    email: string;
    name: string | null;
  };
  emailConfig: {
    fromEmail: string;
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

      {emails.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="text-6xl mb-4">📧</div>
          <p className="text-xl font-semibold text-gray-700 mb-2">No forwarded emails found</p>
          <p className="text-sm text-gray-500">Forwarded emails will appear here once emails are synced and forwarded.</p>
        </div>
      ) : (
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
                  Initial Recipient
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
              {emails.map((email) => (
                <>
                  <tr
                    key={email.id}
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
                        {email.recipient.name || email.recipient.email}
                      </div>
                      <div className="text-sm text-gray-500">{email.recipient.email}</div>
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
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

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

