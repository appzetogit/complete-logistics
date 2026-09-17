import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Edit2, Plus, Trash2 } from 'lucide-react';
import { adminSupportService } from '../../../shared/services/supportTicketService';

const USER_TYPES = ['user', 'driver', 'owner'];

const initialForm = {
  title: '',
  userType: 'user',
  active: true,
};

const TicketTitle = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState('');
  const [search, setSearch] = useState('');

  const loadRows = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await adminSupportService.listTitles();
      setRows(response?.data?.results || []);
    } catch (apiError) {
      setError(apiError?.message || 'Unable to load support ticket titles');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRows();
  }, []);

  const resetForm = () => {
    setEditingId('');
    setForm(initialForm);
  };

  const filteredRows = useMemo(() => {
    const query = String(search || '').trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) =>
      [row.title, row.userType].some((value) =>
        String(value || '').toLowerCase().includes(query),
      ),
    );
  }, [rows, search]);

  const submitForm = async (event) => {
    event.preventDefault();
    if (!form.title.trim()) {
      setError('Title is required');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const payload = {
        title: form.title.trim(),
        userType: form.userType,
        active: form.active,
      };

      if (editingId) {
        await adminSupportService.updateTitle(editingId, payload);
      } else {
        await adminSupportService.createTitle(payload);
      }

      await loadRows();
      resetForm();
    } catch (apiError) {
      setError(apiError?.message || 'Unable to save ticket title');
    } finally {
      setSaving(false);
    }
  };

  const onEdit = (row) => {
    setEditingId(row.id);
    setForm({
      title: row.title || '',
      userType: row.userType || 'user',
      active: Boolean(row.active),
    });
  };

  const onDelete = async (row) => {
    if (!window.confirm(`Delete "${row.title}"?`)) return;
    try {
      await adminSupportService.deleteTitle(row.id);
      await loadRows();
      if (editingId === row.id) {
        resetForm();
      }
    } catch (apiError) {
      setError(apiError?.message || 'Unable to delete title');
    }
  };

  const toggleActive = async (row) => {
    try {
      await adminSupportService.updateTitle(row.id, { active: !row.active });
      await loadRows();
    } catch (apiError) {
      setError(apiError?.message || 'Unable to update status');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6 lg:p-8">
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-1.5 text-xs text-gray-400">
          <span>Support Management</span>
          <ChevronRight size={12} />
          <span className="text-gray-700">Ticket Title</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl text-gray-900 font-bold">Ticket Title</h1>
        </div>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <form onSubmit={submitForm} className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="mb-6 flex items-center gap-3 border-b border-gray-100 pb-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-yellow-100 text-yellow-600">
              <Plus size={18} />
            </div>
            <div>
              <h3 className="text-sm text-gray-900 font-bold">
                {editingId ? 'Update Ticket Title' : 'Add Ticket Title'}
              </h3>
              <p className="text-xs text-gray-400">Create support title for user/driver/owner flows</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-500">Title</label>
              <input
                type="text"
                value={form.title}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="e.g. Ride related issue"
                className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-800 outline-none transition-colors focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-500">User Type</label>
              <select
                value={form.userType}
                onChange={(event) => setForm((prev) => ({ ...prev, userType: event.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-800 outline-none transition-colors focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400"
              >
                {USER_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-gray-700">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(event) => setForm((prev) => ({ ...prev, active: event.target.checked }))}
                className="h-4 w-4 rounded border-gray-300 text-yellow-500 focus:ring-yellow-400"
              />
              Active
            </label>

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 rounded-lg bg-yellow-400 px-4 py-2.5 text-sm font-bold text-black transition-colors hover:bg-yellow-500 disabled:cursor-not-allowed disabled:opacity-60 shadow-sm"
              >
                {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
              </button>
              {editingId ? (
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </div>
        </form>

        <div className="rounded-xl border border-gray-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 p-4">
            <h3 className="text-sm text-gray-900 font-bold">Ticket Title List</h3>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search title..."
              className="w-60 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Title</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">User Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-sm text-gray-400">
                      Loading titles...
                    </td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-sm text-gray-400">
                      No support title found.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
                    <tr key={row.id} className="border-b border-gray-50 last:border-b-0">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{row.title}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{row.userType}</td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => toggleActive(row)}
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            row.active
                              ? 'bg-emerald-50 text-emerald-600'
                              : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {row.active ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => onEdit(row)}
                            className="rounded-md border border-gray-200 p-2 text-gray-500 hover:bg-gray-50"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete(row)}
                            className="rounded-md border border-rose-200 p-2 text-rose-600 hover:bg-rose-50"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TicketTitle;
