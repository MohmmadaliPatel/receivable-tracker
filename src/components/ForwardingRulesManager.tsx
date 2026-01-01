'use client';

import { useState, useEffect, FormEvent, KeyboardEvent } from 'react';

interface Recipient {
  id: string;
  email: string;
  name: string | null;
  isActive: boolean;
}

interface ForwardingRule {
  id: string;
  recipientId: string;
  forwardToEmails: string;
  subjectFilter: string | null;
  isActive: boolean;
  autoForward: boolean;
  recipient: Recipient;
  createdAt: string;
  updatedAt: string;
}

export default function ForwardingRulesManager() {
  const [rules, setRules] = useState<ForwardingRule[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<ForwardingRule | null>(null);
  const [formData, setFormData] = useState({
    recipientId: '',
    forwardToEmails: '',
    subjectFilter: '',
    isActive: true,
    autoForward: true,
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [rulesRes, recipientsRes] = await Promise.all([
        fetch('/api/forwarding-rules'),
        fetch('/api/recipients'),
      ]);

      if (rulesRes.ok) {
        const rulesData = await rulesRes.json();
        setRules(rulesData.rules || []);
      }

      if (recipientsRes.ok) {
        const recipientsData = await recipientsRes.json();
        setRecipients(recipientsData.recipients || []);
      }
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/api/forwarding-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save forwarding rule');
      }

      setSuccess(editingRule ? 'Forwarding rule updated successfully!' : 'Forwarding rule created successfully!');
      setShowForm(false);
      setEditingRule(null);
      setFormData({
        recipientId: '',
        forwardToEmails: '',
        subjectFilter: '',
        isActive: true,
        autoForward: true,
      });
      fetchData();
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    }
  };

  const handleEdit = (rule: ForwardingRule) => {
    setEditingRule(rule);
    setFormData({
      recipientId: rule.recipientId,
      forwardToEmails: rule.forwardToEmails,
      subjectFilter: rule.subjectFilter || '',
      isActive: rule.isActive,
      autoForward: rule.autoForward,
    });
    setShowForm(true);
  };

  const handleDelete = async (recipientId: string) => {
    if (!confirm('Are you sure you want to delete this forwarding rule?')) {
      return;
    }

    try {
      const response = await fetch(`/api/forwarding-rules/${recipientId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete forwarding rule');
      }

      setSuccess('Forwarding rule deleted successfully!');
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to delete forwarding rule');
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading forwarding rules...</div>;
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Email Forwarding Rules</h2>
          <p className="text-sm text-gray-600 mt-1">
            Configure automatic forwarding for recipients. When emails are received from a recipient,
            they will be automatically forwarded to the specified email addresses.
          </p>
        </div>
        <button
          onClick={() => {
            setShowForm(true);
            setEditingRule(null);
            setFormData({
              recipientId: '',
              forwardToEmails: '',
              subjectFilter: '',
              isActive: true,
              autoForward: true,
            });
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          + Add Rule
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
        <div className="mb-6 bg-gray-50 border border-gray-200 rounded-lg p-6">
          <h3 className="text-xl font-semibold mb-4 text-gray-800">
            {editingRule ? 'Edit Forwarding Rule' : 'New Forwarding Rule'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Recipient *
              </label>
              <select
                value={formData.recipientId}
                onChange={(e) => setFormData({ ...formData, recipientId: e.target.value })}
                required
                disabled={!!editingRule}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 disabled:bg-gray-100"
              >
                <option value="">Select a recipient</option>
                {recipients.map((recipient) => (
                  <option key={recipient.id} value={recipient.id}>
                    {recipient.name || recipient.email} ({recipient.email})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Forward To Emails *
              </label>
              <EmailInput
                emails={formData.forwardToEmails ? formData.forwardToEmails.split(',').map(e => e.trim()).filter(e => e) : []}
                onChange={(emails) => setFormData({ ...formData, forwardToEmails: emails.join(', ') })}
              />
              <p className="text-xs text-gray-500 mt-2">
                Add email addresses to forward emails to. Click the X to remove an email.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Subject Filter (Optional)
              </label>
              <input
                type="text"
                value={formData.subjectFilter}
                onChange={(e) => setFormData({ ...formData, subjectFilter: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
                placeholder="e.g., account statement (partial match, case-insensitive)"
              />
              <p className="text-xs text-gray-500 mt-1">
                Only forward emails whose subject contains this text. Leave empty to forward all emails.
                Example: "account statement" will match "Account Statement for Mohammadali"
              </p>
            </div>

            <div className="flex items-center space-x-6">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="mr-2"
                />
                <span className="text-sm font-medium text-gray-700">Active</span>
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.autoForward}
                  onChange={(e) => setFormData({ ...formData, autoForward: e.target.checked })}
                  className="mr-2"
                />
                <span className="text-sm font-medium text-gray-700">Auto-Forward on Sync</span>
              </label>
            </div>

            <div className="flex space-x-3">
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                {editingRule ? 'Update' : 'Create'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingRule(null);
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
        {rules.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-lg mb-2">No forwarding rules configured</p>
            <p className="text-sm">Create a rule to automatically forward emails from recipients</p>
          </div>
        ) : (
          rules.map((rule) => (
            <div
              key={rule.id}
              className={`bg-white border rounded-lg p-5 ${
                rule.isActive ? 'border-green-200 bg-green-50' : 'border-gray-200'
              }`}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-2">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {rule.recipient.name || rule.recipient.email}
                    </h3>
                    {rule.isActive && (
                      <span className="px-2 py-1 bg-green-500 text-white text-xs rounded">
                        Active
                      </span>
                    )}
                    {!rule.isActive && (
                      <span className="px-2 py-1 bg-gray-300 text-gray-700 text-xs rounded">
                        Inactive
                      </span>
                    )}
                    {rule.autoForward && (
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">
                        Auto-Forward
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mb-2">
                    <strong>Recipient:</strong> {rule.recipient.email}
                  </p>
                  <p className="text-sm text-gray-600 mb-2">
                    <strong>Forward To:</strong> {rule.forwardToEmails}
                  </p>
                  {rule.subjectFilter && (
                    <p className="text-sm text-gray-600">
                      <strong>Subject Filter:</strong> "{rule.subjectFilter}" (partial match)
                    </p>
                  )}
                </div>
                <div className="flex space-x-2 ml-4">
                  <button
                    onClick={() => handleEdit(rule)}
                    className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(rule.recipientId)}
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

// Email Input Component with Tag-based UI
interface EmailInputProps {
  emails: string[];
  onChange: (emails: string[]) => void;
}

function EmailInput({ emails, onChange }: EmailInputProps) {
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState('');

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleAddEmail = () => {
    const trimmedEmail = inputValue.trim();
    
    if (!trimmedEmail) {
      return;
    }

    if (!validateEmail(trimmedEmail)) {
      setError('Please enter a valid email address');
      return;
    }

    if (emails.includes(trimmedEmail)) {
      setError('This email is already added');
      return;
    }

    onChange([...emails, trimmedEmail]);
    setInputValue('');
    setError('');
  };

  const handleRemoveEmail = (emailToRemove: string) => {
    onChange(emails.filter(email => email !== emailToRemove));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      handleAddEmail();
    } else if (e.key === 'Backspace' && inputValue === '' && emails.length > 0) {
      // Remove last email if backspace is pressed on empty input
      handleRemoveEmail(emails[emails.length - 1]);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');
    const emailList = pastedText
      .split(/[,\n;]/)
      .map(email => email.trim())
      .filter(email => email && validateEmail(email));
    
    if (emailList.length > 0) {
      const newEmails = [...emails];
      emailList.forEach(email => {
        if (!newEmails.includes(email)) {
          newEmails.push(email);
        }
      });
      onChange(newEmails);
      setInputValue('');
      setError('');
    } else {
      setInputValue(pastedText);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2 p-3 min-h-[50px] border border-gray-300 rounded-lg bg-white focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500">
        {emails.map((email, index) => (
          <span
            key={index}
            className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium"
          >
            {email}
            <button
              type="button"
              onClick={() => handleRemoveEmail(email)}
              className="ml-1 text-blue-600 hover:text-blue-800 focus:outline-none"
              aria-label={`Remove ${email}`}
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </span>
        ))}
        <input
          type="email"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setError('');
          }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={emails.length === 0 ? "Enter email address and press Enter or comma" : ""}
          className="flex-1 min-w-[200px] outline-none text-gray-900 placeholder-gray-400"
        />
      </div>
      {error && (
        <p className="text-xs text-red-600 mt-1">{error}</p>
      )}
      {emails.length === 0 && !error && (
        <p className="text-xs text-gray-500 mt-1">
          Press Enter or comma to add an email
        </p>
      )}
    </div>
  );
}

