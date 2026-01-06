'use client';

import { useState, useEffect, FormEvent } from 'react';

interface Forwarder {
  id: string;
  email: string;
  name: string | null;
  subject: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function ForwardersManager() {
  const [forwarders, setForwarders] = useState<Forwarder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedForwarder, setSelectedForwarder] = useState<Forwarder | null>(null);
  const [formData, setFormData] = useState({ email: '', name: '', subject: '' });
  const [editingForwarder, setEditingForwarder] = useState<Forwarder | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');

  useEffect(() => {
    fetchForwarders();
  }, []);

  const fetchForwarders = async () => {
    try {
      const response = await fetch('/api/forwarders');
      if (response.ok) {
        const data = await response.json();
        setForwarders(data.forwarders || []);
      }
    } catch (err) {
      console.error('Error fetching forwarders:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddForwarder = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const url = editingForwarder
        ? `/api/forwarders/${editingForwarder.id}`
        : '/api/forwarders';
      const method = editingForwarder ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save forwarder');
      }

      setSuccess(editingForwarder ? 'Forwarder updated successfully!' : 'Forwarder added successfully!');
      setShowAddForm(false);
      setEditingForwarder(null);
      setFormData({ email: '', name: '', subject: '' });
      fetchForwarders();
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    }
  };

  const handleEdit = (forwarder: Forwarder) => {
    setEditingForwarder(forwarder);
    setFormData({
      email: forwarder.email,
      name: forwarder.name || '',
      subject: forwarder.subject || '',
    });
    setShowAddForm(true);
  };

  const handleDeleteForwarder = async (id: string) => {
    if (!confirm('Are you sure you want to delete this forwarder?')) {
      return;
    }

    try {
      const response = await fetch(`/api/forwarders/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete forwarder');
      }

      setSuccess('Forwarder deleted successfully!');
      fetchForwarders();
    } catch (err: any) {
      setError(err.message || 'Failed to delete forwarder');
    }
  };

  const handleToggleActive = async (forwarder: Forwarder) => {
    try {
      const response = await fetch(`/api/forwarders/${forwarder.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !forwarder.isActive }),
      });

      if (!response.ok) {
        throw new Error('Failed to update forwarder');
      }

      fetchForwarders();
    } catch (err: any) {
      setError(err.message || 'Failed to update forwarder');
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading forwarders...</div>;
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Email Forwarders</h2>
          <p className="text-sm text-gray-600 mt-1">
            Manage forwarders to send emails. Add email addresses and default subjects for sending emails.
          </p>
        </div>
        <button
          onClick={() => {
            setShowAddForm(true);
            setEditingForwarder(null);
            setFormData({ email: '', name: '', subject: '' });
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          + Add Forwarder
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

      {/* Search and Filter Bar */}
      <div className="mb-6 bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Search Forwarders
            </label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, email, or subject..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div className="md:w-48">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Filter by Status
            </label>
            <select
              value={filterActive}
              onChange={(e) => setFilterActive(e.target.value as 'all' | 'active' | 'inactive')}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Forwarders</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>
          </div>
        </div>
      </div>

      {showAddForm && (
        <div className="mb-6 bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-xl text-black font-semibold mb-4">
            {editingForwarder ? 'Edit Forwarder' : 'Add New Forwarder'}
          </h3>
          <form onSubmit={handleAddForwarder} className="space-y-4">
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
                placeholder="forwarder@example.com"
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
                placeholder="Forwarder Name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Default Subject (Optional)
              </label>
              <input
                type="text"
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                className="w-full px-3 py-2 text-black border border-gray-300 rounded-lg"
                placeholder="e.g., Account Statement"
              />
            </div>
            <div className="flex space-x-3">
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                {editingForwarder ? 'Update' : 'Add'} Forwarder
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setEditingForwarder(null);
                  setFormData({ email: '', name: '', subject: '' });
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
        {(() => {
          // Filter forwarders based on search and status
          let filteredForwarders = forwarders;
          
          // Apply status filter
          if (filterActive === 'active') {
            filteredForwarders = filteredForwarders.filter(f => f.isActive);
          } else if (filterActive === 'inactive') {
            filteredForwarders = filteredForwarders.filter(f => !f.isActive);
          }
          
          // Apply search filter
          if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            filteredForwarders = filteredForwarders.filter(forwarder => 
              forwarder.email.toLowerCase().includes(query) ||
              (forwarder.name && forwarder.name.toLowerCase().includes(query)) ||
              (forwarder.subject && forwarder.subject.toLowerCase().includes(query))
            );
          }
          
          return filteredForwarders.length === 0 ? (
          <div className="text-center py-8 text-black">
            {forwarders.length === 0 
              ? 'No forwarders found. Add a forwarder to start sending emails.'
              : 'No forwarders match your search criteria. Try adjusting your search or filter options.'}
          </div>
        ) : (
          <>
            {searchQuery || filterActive !== 'all' ? (
              <div className="mb-4 text-sm text-gray-600 bg-blue-50 border border-blue-200 rounded-lg p-3">
                Showing {filteredForwarders.length} of {forwarders.length} forwarder(s)
              </div>
            ) : null}
            {filteredForwarders.map((forwarder) => {
            const isExpanded = selectedForwarder?.id === forwarder.id;

            return (
              <div
                key={forwarder.id}
                className={`bg-white border rounded-lg overflow-hidden ${
                  isExpanded ? 'border-blue-500' : 'border-gray-200'
                }`}
              >
                {/* Forwarder Header */}
                <div
                  className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => setSelectedForwarder(isExpanded ? null : forwarder)}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <h3 className="text-lg text-black font-semibold">
                          {forwarder.name || forwarder.email}
                        </h3>
                        {!forwarder.isActive && (
                          <span className="px-2 py-1 bg-gray-200 text-gray-700 text-xs rounded">
                            Inactive
                          </span>
                        )}
                        {forwarder.isActive && (
                          <span className="px-2 py-1 bg-green-500 text-white text-xs rounded">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-black">{forwarder.email}</p>
                      {forwarder.subject && (
                        <p className="text-sm text-gray-600 mt-1">
                          <strong>Subject:</strong> {forwarder.subject}
                        </p>
                      )}
                    </div>
                    <div className="flex space-x-2 ml-4">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleActive(forwarder);
                        }}
                        className={`px-3 py-1 text-sm rounded ${
                          forwarder.isActive
                            ? 'bg-gray-600 text-white hover:bg-gray-700'
                            : 'bg-green-600 text-white hover:bg-green-700'
                        }`}
                      >
                        {forwarder.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEdit(forwarder);
                        }}
                        className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                      >
                        Edit
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteForwarder(forwarder.id);
                        }}
                        className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>

                {/* Summary Only - Similar to RecipientTrackingDashboard */}
                {isExpanded && (
                  <div className="border-t bg-gray-50 p-4">
                    <div className="text-sm text-gray-600">
                      <p className="mb-2">
                        <strong>Email:</strong> {forwarder.email}
                      </p>
                      {forwarder.name && (
                        <p className="mb-2">
                          <strong>Name:</strong> {forwarder.name}
                        </p>
                      )}
                      {forwarder.subject ? (
                        <p className="mb-2">
                          <strong>Default Subject:</strong> {forwarder.subject}
                        </p>
                      ) : (
                        <p className="mb-2 text-gray-500 italic">
                          <strong>Default Subject:</strong> Not set
                        </p>
                      )}
                      <p className="mb-2">
                        <strong>Status:</strong>{' '}
                        {forwarder.isActive ? (
                          <span className="text-green-600 font-semibold">Active</span>
                        ) : (
                          <span className="text-gray-500">Inactive</span>
                        )}
                      </p>
                      <p className="mt-4 text-xs text-gray-500">
                        Created: {new Date(forwarder.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          </>
        );
        })()}
      </div>
    </div>
  );
}

