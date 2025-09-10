'use client';

import { useSession } from 'next-auth/react';
import { useState, useEffect } from 'react';

interface SyncStatusData {
  id: string;
  userId: string;
  lastSyncToken: string | null;
  lastSyncDate: string | null;
  totalEmailsSynced: number;
  status: string;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function SyncStatus() {
  const { data: session } = useSession();
  const [syncStatus, setSyncStatus] = useState<SyncStatusData | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (session?.user?.id) {
      fetchSyncStatus();
    }
  }, [session]);

  const fetchSyncStatus = async () => {
    if (!session?.user?.id) return;

    setLoading(true);
    try {
      const response = await fetch('/api/emails/sync');
      const data = await response.json();

      if (data.success) {
        setSyncStatus(data.data);
      }
    } catch (error) {
      console.error('Error fetching sync status:', error);
    }
    setLoading(false);
  };

  const resetSync = async () => {
    if (!session?.user?.id) return;

    setResetting(true);
    try {
      const response = await fetch('/api/emails/sync', {
        method: 'POST',
      });
      const data = await response.json();

      if (data.success) {
        await fetchSyncStatus(); // Refresh status
        alert('Sync reset successfully!');
      } else {
        alert('Failed to reset sync');
      }
    } catch (error) {
      console.error('Error resetting sync:', error);
      alert('Failed to reset sync');
    }
    setResetting(false);
  };

  if (!session?.user?.id) {
    return null;
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'syncing':
        return 'text-yellow-600 bg-yellow-100';
      case 'error':
        return 'text-red-600 bg-red-100';
      case 'idle':
      default:
        return 'text-green-600 bg-green-100';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'syncing':
        return 'Syncing';
      case 'error':
        return 'Error';
      case 'idle':
      default:
        return 'Ready';
    }
  };

  return (
    <div className="flex items-center space-x-4 text-sm">
      <div className="flex items-center space-x-2">
        <span className="text-gray-600">Sync Status:</span>
        {loading ? (
          <div className="flex items-center space-x-1">
            <div className="animate-spin rounded-full h-3 w-3 border-b border-gray-400"></div>
            <span className="text-gray-500">Loading...</span>
          </div>
        ) : syncStatus ? (
          <div className="flex items-center space-x-2">
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(syncStatus.status)}`}>
              {getStatusText(syncStatus.status)}
            </span>
            <span className="text-gray-600">
              {syncStatus.totalEmailsSynced} emails synced
            </span>
            {syncStatus.lastSyncDate && (
              <span className="text-gray-500">
                Last sync: {new Date(syncStatus.lastSyncDate).toLocaleString()}
              </span>
            )}
          </div>
        ) : (
          <span className="text-gray-500">No sync data</span>
        )}
      </div>

      {syncStatus && (
        <button
          onClick={resetSync}
          disabled={resetting}
          className="px-3 py-1 text-xs font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {resetting ? 'Resetting...' : 'Reset Sync'}
        </button>
      )}
    </div>
  );
}
