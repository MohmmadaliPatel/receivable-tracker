'use client';

import { useState, useEffect, FormEvent } from 'react';

interface EmailConfig {
  id: string;
  name: string;
  type: string;
  msTenantId: string;
  msClientId: string;
  fromEmail: string;
  isActive: boolean;
  cronEnabled?: boolean;
  cronIntervalMinutes?: number;
  reminderEnabled?: boolean;
  reminderDurationHours?: number;
  reminderDurationUnit?: string;
  createdAt: string;
  updatedAt: string;
}

export default function EmailConfigManager() {
  const [configs, setConfigs] = useState<EmailConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingConfig, setEditingConfig] = useState<EmailConfig | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    msTenantId: '',
    msClientId: '',
    msClientSecret: '',
    fromEmail: '',
    isActive: true,
    cronEnabled: false,
    cronIntervalMinutes: 10,
    reminderEnabled: false,
    reminderDurationHours: 24,
    reminderDurationUnit: 'hours',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchConfigs();
  }, []);

  const fetchConfigs = async () => {
    try {
      const response = await fetch('/api/email-config');
      if (response.ok) {
        const data = await response.json();
        setConfigs(data.configs || []);
      }
    } catch (err) {
      console.error('Error fetching configs:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const url = editingConfig
        ? `/api/email-config/${editingConfig.id}`
        : '/api/email-config';
      const method = editingConfig ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          type: 'graph', // Only graph is implemented
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save configuration');
      }

      setSuccess(editingConfig ? 'Configuration updated successfully!' : 'Configuration created successfully!');
      setShowForm(false);
      setEditingConfig(null);
      setFormData({
        name: '',
        msTenantId: '',
        msClientId: '',
        msClientSecret: '',
        fromEmail: '',
        isActive: true,
        cronEnabled: false,
        cronIntervalMinutes: 10,
      });
      fetchConfigs();
      // Reload cron jobs after config update
      try {
        await fetch('/api/cron', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'reload' }),
        });
      } catch (err) {
        console.error('Error reloading cron:', err);
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    }
  };

  const handleEdit = (config: EmailConfig) => {
    setEditingConfig(config);
    setFormData({
      name: config.name,
      msTenantId: config.msTenantId,
      msClientId: config.msClientId,
      msClientSecret: '', // Don't show secret
      fromEmail: config.fromEmail,
      isActive: config.isActive,
      cronEnabled: config.cronEnabled || false,
      cronIntervalMinutes: config.cronIntervalMinutes || 10,
      reminderEnabled: config.reminderEnabled || false,
      reminderDurationHours: config.reminderDurationHours || 24,
      reminderDurationUnit: config.reminderDurationUnit || 'hours',
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this configuration?')) {
      return;
    }

    try {
      const response = await fetch(`/api/email-config/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete configuration');
      }

      setSuccess('Configuration deleted successfully!');
      fetchConfigs();
    } catch (err: any) {
      setError(err.message || 'Failed to delete configuration');
    }
  };

  const handleActivate = async (id: string) => {
    try {
      const response = await fetch(`/api/email-config/${id}/activate`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to activate configuration');
      }

      setSuccess('Configuration activated successfully!');
      fetchConfigs();
    } catch (err: any) {
      setError(err.message || 'Failed to activate configuration');
    }
  };

  const handleValidate = async (id: string) => {
    try {
      const response = await fetch(`/api/email-config/${id}/validate`, {
        method: 'POST',
      });

      const data = await response.json();

      if (data.valid) {
        setSuccess('Configuration is valid!');
      } else {
        setError(`Configuration validation failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      setError('Failed to validate configuration');
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading configurations...</div>;
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800"></h2>
        <button
          onClick={() => {
            setShowForm(true);
            setEditingConfig(null);
            setFormData({
              name: '',
              msTenantId: '',
              msClientId: '',
              msClientSecret: '',
              fromEmail: '',
              isActive: true,
              cronEnabled: false,
              cronIntervalMinutes: 10,
            });
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          + Add Configuration
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

      {showForm && (
        <div className="mb-6 bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-xl text-black font-semibold mb-4">
            {editingConfig ? 'Edit Configuration' : 'New Configuration'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-black font-medium mb-1">
                Configuration Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                className="w-full px-3 text-black py-2 border border-gray-300 rounded-lg"
                placeholder="e.g., Primary, Backup"
              />
            </div>

            <div>
              <label className="block text-sm text-black font-medium mb-1">
                MS Tenant ID *
              </label>
              <input
                type="text"
                value={formData.msTenantId}
                onChange={(e) => setFormData({ ...formData, msTenantId: e.target.value })}
                required
                className="w-full px-3 text-black py-2 border border-gray-300 rounded-lg font-mono text-sm"
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              />
            </div>

            <div>
              <label className="block text-sm text-black font-medium mb-1">
                MS Client ID *
              </label>
              <input
                type="text"
                value={formData.msClientId}
                onChange={(e) => setFormData({ ...formData, msClientId: e.target.value })}
                required
                className="w-full px-3 text-black py-2 border border-gray-300 rounded-lg font-mono text-sm"
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              />
            </div>

            <div>
              <label className="block text-sm text-black font-medium mb-1">
                MS Client Secret *
              </label>
              <input
                type="password"
                value={formData.msClientSecret}
                onChange={(e) => setFormData({ ...formData, msClientSecret: e.target.value })}
                required={!editingConfig}
                className="w-full px-3 text-black py-2 border border-gray-300 rounded-lg font-mono text-sm"
                placeholder={editingConfig ? 'Leave blank to keep existing' : 'Enter client secret'}
              />
            </div>

            <div>
              <label className="block text-sm text-black font-medium mb-1">
                Email *
              </label>
              <input
                type="email"
                value={formData.fromEmail}
                onChange={(e) => setFormData({ ...formData, fromEmail: e.target.value })}
                required
                className="w-full px-3 text-black py-2 border border-gray-300 rounded-lg"
                placeholder="sender@yourdomain.com"
              />
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="isActive"
                checked={formData.isActive}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                className="mr-2"
              />
              <label htmlFor="isActive" className="text-sm text-black font-medium">
                Set as active configuration
              </label>
            </div>

            <div className="border-t border-gray-200 pt-4 mt-4">
              <h4 className="text-sm font-semibold text-gray-900 mb-3">Automatic Email Fetching (Cron)</h4>
              
              <div className="flex items-center mb-3">
                <input
                  type="checkbox"
                  id="cronEnabled"
                  checked={formData.cronEnabled}
                  onChange={(e) => setFormData({ ...formData, cronEnabled: e.target.checked })}
                  className="mr-2"
                />
                <label htmlFor="cronEnabled" className="text-sm text-black font-medium">
                  Enable automatic email fetching
                </label>
              </div>

              {formData.cronEnabled && (
                <div>
                  <label className="block text-sm text-black font-medium mb-1">
                    Fetch Interval (minutes) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="1440"
                    value={formData.cronIntervalMinutes}
                    onChange={(e) => setFormData({ ...formData, cronIntervalMinutes: parseInt(e.target.value) || 10 })}
                    required={formData.cronEnabled}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black"
                    placeholder="10"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    How often to automatically fetch emails and check for replies (1-1440 minutes)
                  </p>
                </div>
              )}
            </div>

            <div className="border-t border-gray-200 pt-4 mt-4">
              <h4 className="text-sm font-semibold text-gray-900 mb-3">Reminder Emails</h4>
              
              <div className="flex items-center mb-3">
                <input
                  type="checkbox"
                  id="reminderEnabled"
                  checked={formData.reminderEnabled}
                  onChange={(e) => setFormData({ ...formData, reminderEnabled: e.target.checked })}
                  className="mr-2"
                />
                <label htmlFor="reminderEnabled" className="text-sm text-black font-medium">
                  Enable reminder emails for forwarded emails without replies
                </label>
              </div>

              {formData.reminderEnabled && (
                <div>
                  <div className="flex gap-4 mb-2">
                    <div className="flex-1">
                      <label className="block text-sm text-black font-medium mb-1">
                        Reminder Duration *
                      </label>
                      <input
                        type="number"
                        min="1"
                        max={formData.reminderDurationUnit === 'hours' ? '720' : '43200'}
                        value={formData.reminderDurationHours}
                        onChange={(e) => setFormData({ ...formData, reminderDurationHours: parseInt(e.target.value) || (formData.reminderDurationUnit === 'hours' ? 24 : 1440) })}
                        required={formData.reminderEnabled}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black"
                        placeholder={formData.reminderDurationUnit === 'hours' ? '24' : '1440'}
                      />
                    </div>
                    <div className="w-32">
                      <label className="block text-sm text-black font-medium mb-1">
                        Unit *
                      </label>
                      <select
                        value={formData.reminderDurationUnit}
                        onChange={(e) => {
                          const newUnit = e.target.value;
                          // Convert value when switching units
                          let newValue = formData.reminderDurationHours;
                          if (newUnit === 'minutes' && formData.reminderDurationUnit === 'hours') {
                            newValue = formData.reminderDurationHours * 60;
                          } else if (newUnit === 'hours' && formData.reminderDurationUnit === 'minutes') {
                            newValue = Math.round(formData.reminderDurationHours / 60);
                          }
                          setFormData({ 
                            ...formData, 
                            reminderDurationUnit: newUnit,
                            reminderDurationHours: newValue || (newUnit === 'hours' ? 24 : 1440)
                          });
                        }}
                        required={formData.reminderEnabled}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black"
                      >
                        <option value="hours">Hours</option>
                        <option value="minutes">Minutes</option>
                      </select>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Send reminder email if no reply is received within this duration
                    {formData.reminderDurationUnit === 'hours' 
                      ? ' (1-720 hours)' 
                      : ' (1-43200 minutes / 720 hours)'}
                  </p>
                </div>
              )}
            </div>

            <div className="flex space-x-3">
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                {editingConfig ? 'Update' : 'Create'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingConfig(null);
                }}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-4">
        {configs.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No email configurations found. Create one to get started.
          </div>
        ) : (
          configs.map((config) => (
            <div
              key={config.id}
              className={`bg-white border rounded-lg p-4 ${
                config.isActive ? 'border-green-500 bg-green-50' : 'border-gray-200'
              }`}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-2">
                    <h3 className="text-lg font-semibold">{config.name}</h3>
                    {config.isActive && (
                      <span className="px-2 py-1 bg-green-500 text-white text-xs rounded">
                        Active
                      </span>
                    )}
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">
                      {config.type.toUpperCase()}
                    </span>
                  </div>
                  <div className="space-y-1 text-sm text-gray-600">
                    <p>
                      <span className="font-medium">Tenant ID:</span>{' '}
                      <span className="font-mono">{config.msTenantId}</span>
                    </p>
                    <p>
                      <span className="font-medium">Client ID:</span>{' '}
                      <span className="font-mono">{config.msClientId}</span>
                    </p>
                    <p>
                      <span className="font-medium">From Email:</span> {config.fromEmail}
                    </p>
                    {config.cronEnabled && (
                      <p className="mt-2">
                        <span className="font-medium">Auto Fetch:</span>{' '}
                        <span className="text-green-600 font-semibold">Enabled</span> - Every {config.cronIntervalMinutes || 10} minutes
                      </p>
                    )}
                    {config.reminderEnabled && (
                      <p className="mt-2">
                        <span className="font-medium">Reminders:</span>{' '}
                        <span className="text-blue-600 font-semibold">Enabled</span> - After {config.reminderDurationHours || 24} {config.reminderDurationUnit === 'minutes' ? 'minutes' : 'hours'}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-col space-y-2 ml-4">
                  {!config.isActive && (
                    <button
                      onClick={() => handleActivate(config.id)}
                      className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700"
                    >
                      Activate
                    </button>
                  )}
                  <button
                    onClick={() => handleValidate(config.id)}
                    className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    Validate
                  </button>
                  <button
                    onClick={() => handleEdit(config)}
                    className="px-3 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(config.id)}
                    className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
