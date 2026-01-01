'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Stats {
  totalRecipients: number;
  totalEmails: number;
  forwardedEmails: number;
  activeRules: number;
}

export default function DashboardOverview() {
  const [stats, setStats] = useState<Stats>({
    totalRecipients: 0,
    totalEmails: 0,
    forwardedEmails: 0,
    activeRules: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const [recipientsRes, rulesRes] = await Promise.all([
        fetch('/api/recipients'),
        fetch('/api/forwarding-rules'),
      ]);

      let totalEmails = 0;
      let forwardedEmails = 0;

      if (recipientsRes.ok) {
        const recipientsData = await recipientsRes.json();
        const recipients = recipientsData.recipients || [];
        setStats(prev => ({ ...prev, totalRecipients: recipients.length }));
        
        recipients.forEach((recipient: any) => {
          totalEmails += recipient.emailTrackings?.length || 0;
          forwardedEmails += recipient.emailTrackings?.filter((e: any) => e.isForwarded).length || 0;
        });
      }

      if (rulesRes.ok) {
        const rulesData = await rulesRes.json();
        const activeRules = (rulesData.rules || []).filter((r: any) => r.isActive).length;
        setStats(prev => ({ ...prev, activeRules }));
      }

      setStats(prev => ({
        ...prev,
        totalEmails,
        forwardedEmails,
      }));
    } catch (err) {
      console.error('Error fetching stats:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading dashboard...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Recipients</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{stats.totalRecipients}</p>
            </div>
            <div className="text-4xl">👥</div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Emails</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{stats.totalEmails}</p>
            </div>
            <div className="text-4xl">📧</div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Forwarded</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{stats.forwardedEmails}</p>
            </div>
            <div className="text-4xl">➡️</div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Active Rules</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{stats.activeRules}</p>
            </div>
            <div className="text-4xl">⚙️</div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link
            href="/recipients"
            className="p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
          >
            <div className="text-2xl mb-2">👥</div>
            <h3 className="font-semibold text-gray-900">Manage Recipients</h3>
            <p className="text-sm text-gray-600 mt-1">Add and manage email recipients</p>
          </Link>

          <Link
            href="/forwarding-rules"
            className="p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
          >
            <div className="text-2xl mb-2">📧</div>
            <h3 className="font-semibold text-gray-900">Forwarding Rules</h3>
            <p className="text-sm text-gray-600 mt-1">Configure automatic email forwarding</p>
          </Link>

          <Link
            href="/email-config"
            className="p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
          >
            <div className="text-2xl mb-2">⚙️</div>
            <h3 className="font-semibold text-gray-900">Email Config</h3>
            <p className="text-sm text-gray-600 mt-1">Manage email configurations</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
