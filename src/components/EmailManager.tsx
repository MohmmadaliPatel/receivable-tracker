'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

interface Email {
  id: string;
  messageId: string;
  subject?: string;
  sender: string;
  senderName?: string;
  recipients: string;
  body?: string;
  bodyPreview?: string;
  receivedAt: string;
  isRead: boolean;
  hasAttachments: boolean;
  attachments?: string;
  createdAt: string;
  updatedAt: string;
}

interface EmailFilter {
  fromDate?: string;
  toDate?: string;
  senders?: string[];
  limit?: number;
}

export default function EmailManager() {
  const { data: session, status } = useSession();
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [totalEmails, setTotalEmails] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [filter, setFilter] = useState<EmailFilter>({
    limit: 50,
  });
  const [fetchFilter, setFetchFilter] = useState<EmailFilter>({
    limit: 100,
  });

  useEffect(() => {
    if (session?.user?.id) {
      loadEmails();
    }
  }, [currentPage, filter, session]);

  // If user is not authenticated, show login prompt
  if (status === 'loading') {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent mx-auto mb-4"></div>
            <p className="text-lg font-medium text-gray-700">Loading your workspace...</p>
            <p className="text-sm text-gray-500 mt-1">Please wait while we set things up</p>
          </div>
        </div>
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="p-8">
        <div className="text-center py-16">
          <div className="max-w-2xl mx-auto">
            <div className="w-20 h-20 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-2xl">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Welcome to Email Auto</h2>
            <p className="text-xl text-gray-600 mb-8">
              Connect your Microsoft account to unlock powerful email management features
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-12">
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-6 rounded-2xl border border-blue-100">
                <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Smart Email Sync</h3>
                <p className="text-gray-600 text-sm">Automatically fetch and organize emails from your Outlook inbox with intelligent filtering</p>
              </div>
              
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-6 rounded-2xl border border-green-100">
                <div className="w-12 h-12 bg-green-600 rounded-xl flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Advanced Search</h3>
                <p className="text-gray-600 text-sm">Search and filter through your email history with powerful date and sender filters</p>
              </div>
              
              <div className="bg-gradient-to-br from-purple-50 to-pink-50 p-6 rounded-2xl border border-purple-100">
                <div className="w-12 h-12 bg-purple-600 rounded-xl flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Secure & Private</h3>
                <p className="text-gray-600 text-sm">Your data stays secure with enterprise-grade encryption and privacy protection</p>
              </div>
              
              <div className="bg-gradient-to-br from-orange-50 to-yellow-50 p-6 rounded-2xl border border-orange-100">
                <div className="w-12 h-12 bg-orange-600 rounded-xl flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Lightning Fast</h3>
                <p className="text-gray-600 text-sm">Optimized performance with delta sync technology for instant email updates</p>
              </div>
            </div>

            <div className="mt-12 p-6 bg-gray-50 rounded-2xl border border-gray-200">
              <p className="text-sm text-gray-600 mb-4">
                <span className="font-semibold">Getting started is easy:</span> Sign in with your Microsoft account to begin managing your emails
              </p>
              <div className="flex items-center justify-center space-x-2 text-xs text-gray-500">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <span>Secure OAuth authentication</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const loadEmails = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: filter.limit?.toString() || '50',
        offset: ((currentPage - 1) * (filter.limit || 50)).toString(),
      });

      if (filter.fromDate) params.append('fromDate', filter.fromDate);
      if (filter.toDate) params.append('toDate', filter.toDate);
      if (filter.senders?.length) params.append('sender', filter.senders[0]);

      const response = await fetch(`/api/emails?${params}`);
      const data = await response.json();

      setEmails(data.emails);
      setTotalEmails(data.total);
    } catch (error) {
      console.error('Error loading emails:', error);
      alert('Failed to load emails');
    }
    setLoading(false);
  };

  const fetchEmailsFromOutlook = async () => {
    setFetching(true);
    try {
      const response = await fetch('/api/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(fetchFilter),
      });

      const result = await response.json();

      if (result.success) {
        alert(result.message);
        loadEmails(); // Refresh the list
      } else {
        alert('Failed to fetch emails: ' + result.error);
      }
    } catch (error) {
      console.error('Error fetching emails:', error);
      alert('Failed to fetch emails from Outlook');
    }
    setFetching(false);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const totalPages = Math.ceil(totalEmails / (filter.limit || 50));

  return (
    <div className="p-8">
      {/* Header Section */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Email Manager</h1>
            <p className="text-gray-600">Welcome back, {session.user.name || session.user.email}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">Total emails stored</p>
            <p className="text-2xl font-bold text-blue-600">{totalEmails}</p>
          </div>
        </div>
      </div>

      {/* Fetch Emails Section */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl shadow-lg border border-blue-100 p-8 mb-8">
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
            </svg>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Fetch Emails from Outlook</h2>
            <p className="text-gray-600">Sync new emails from your Microsoft account</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              From Date
            </label>
            <input
              type="date"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white shadow-sm transition-all duration-200"
              value={fetchFilter.fromDate || ''}
              onChange={(e) => setFetchFilter(prev => ({ ...prev, fromDate: e.target.value }))}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              To Date
            </label>
            <input
              type="date"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white shadow-sm transition-all duration-200"
              value={fetchFilter.toDate || ''}
              onChange={(e) => setFetchFilter(prev => ({ ...prev, toDate: e.target.value }))}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Senders (comma-separated)
            </label>
            <input
              type="text"
              placeholder="email1@example.com, email2@example.com"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white shadow-sm transition-all duration-200"
              value={fetchFilter.senders?.join(', ') || ''}
              onChange={(e) => setFetchFilter(prev => ({
                ...prev,
                senders: e.target.value ? e.target.value.split(',').map(s => s.trim()) : undefined
              }))}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Limit
            </label>
            <input
              type="number"
              min="1"
              max="1000"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white shadow-sm transition-all duration-200"
              value={fetchFilter.limit || 100}
              onChange={(e) => setFetchFilter(prev => ({ ...prev, limit: parseInt(e.target.value) || 100 }))}
            />
          </div>
        </div>

        <button
          onClick={fetchEmailsFromOutlook}
          disabled={fetching}
          className="px-8 py-4 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
        >
          {fetching ? (
            <div className="flex items-center space-x-3">
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
              <span>Fetching emails...</span>
            </div>
          ) : (
            <div className="flex items-center space-x-3">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>Sync Emails from Outlook</span>
            </div>
          )}
        </button>
      </div>

      {/* Filter Section */}
      <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl shadow-lg border border-green-100 p-8 mb-8">
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 bg-green-600 rounded-xl flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Filter Stored Emails</h2>
            <p className="text-gray-600">Search and filter your local email collection</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              From Date
            </label>
            <input
              type="date"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white shadow-sm transition-all duration-200"
              value={filter.fromDate || ''}
              onChange={(e) => setFilter(prev => ({ ...prev, fromDate: e.target.value }))}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              To Date
            </label>
            <input
              type="date"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white shadow-sm transition-all duration-200"
              value={filter.toDate || ''}
              onChange={(e) => setFilter(prev => ({ ...prev, toDate: e.target.value }))}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Sender Email
            </label>
            <input
              type="email"
              placeholder="Search by sender email"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white shadow-sm transition-all duration-200"
              value={filter.senders?.[0] || ''}
              onChange={(e) => setFilter(prev => ({
                ...prev,
                senders: e.target.value ? [e.target.value] : undefined
              }))}
            />
          </div>
        </div>

        <button
          onClick={() => {
            setCurrentPage(1);
            loadEmails();
          }}
          className="px-8 py-4 text-sm font-semibold text-white bg-gradient-to-r from-green-600 to-emerald-600 rounded-xl hover:from-green-700 hover:to-emerald-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
        >
          <div className="flex items-center space-x-3">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            <span>Apply Filters</span>
          </div>
        </button>
      </div>

      {/* Email List */}
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100">
        <div className="p-8 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-purple-600 rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 009.586 13H7" />
                </svg>
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Your Emails</h2>
                <p className="text-gray-600">{totalEmails} emails in your collection</p>
              </div>
            </div>
            {emails.length > 0 && (
              <div className="text-right">
                <p className="text-sm text-gray-500">Page {currentPage} of {totalPages}</p>
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <div className="p-16 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-purple-600 border-t-transparent mx-auto mb-4"></div>
            <p className="text-lg font-medium text-gray-700">Loading your emails...</p>
            <p className="text-sm text-gray-500 mt-1">Please wait while we fetch your data</p>
          </div>
        ) : emails.length === 0 ? (
          <div className="p-16 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 009.586 13H7" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No emails found</h3>
            <p className="text-gray-600 mb-6">Try fetching emails from Outlook or adjusting your filters to see results</p>
            <button
              onClick={fetchEmailsFromOutlook}
              disabled={fetching}
              className="px-6 py-3 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
            >
              {fetching ? 'Fetching...' : 'Fetch Emails Now'}
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {emails.map((email, index) => (
              <div key={email.id} className="p-6 hover:bg-gradient-to-r hover:from-gray-50 hover:to-blue-50 transition-all duration-200 group">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1 pr-4">
                    <div className="flex items-start space-x-3">
                      <div className="flex-shrink-0 mt-1">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center text-white font-semibold text-sm shadow-md">
                          {(email.senderName || email.sender)[0].toUpperCase()}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-semibold text-gray-900 group-hover:text-blue-700 transition-colors duration-200">
                          {email.subject || '(No subject)'}
                        </h3>
                        <p className="text-sm text-gray-600 mt-1">
                          <span className="font-medium">{email.senderName || email.sender.split('@')[0]}</span>
                          <span className="text-gray-400 ml-1">({email.sender})</span>
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm text-gray-500 mb-2">{formatDate(email.receivedAt)}</p>
                    <div className="flex items-center space-x-2">
                      {email.hasAttachments && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-700 font-medium">
                          <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                          </svg>
                          Attachment
                        </span>
                      )}
                      {!email.isRead && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-100 text-green-700 font-medium">
                          <div className="w-2 h-2 bg-green-500 rounded-full mr-1"></div>
                          New
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {email.bodyPreview && (
                  <div className="ml-13 pl-3 border-l-2 border-gray-100">
                    <p className="text-gray-600 text-sm leading-relaxed">
                      {email.bodyPreview.substring(0, 200)}{email.bodyPreview.length > 200 ? '...' : ''}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-8 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
            <div className="flex justify-between items-center">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="px-6 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50 hover:border-gray-300 disabled:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-400 transition-all duration-200 shadow-sm hover:shadow-md"
              >
                <div className="flex items-center space-x-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  <span>Previous</span>
                </div>
              </button>

              <div className="flex items-center space-x-4">
                <span className="text-sm font-medium text-gray-700 bg-white px-4 py-2 rounded-xl border border-gray-200 shadow-sm">
                  Page {currentPage} of {totalPages}
                </span>
                <span className="text-xs text-gray-500">
                  Showing {((currentPage - 1) * (filter.limit || 50)) + 1} - {Math.min(currentPage * (filter.limit || 50), totalEmails)} of {totalEmails}
                </span>
              </div>

              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="px-6 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50 hover:border-gray-300 disabled:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-400 transition-all duration-200 shadow-sm hover:shadow-md"
              >
                <div className="flex items-center space-x-2">
                  <span>Next</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
