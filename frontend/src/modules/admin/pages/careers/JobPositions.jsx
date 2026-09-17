import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Edit2, Plus, Trash2, Briefcase } from 'lucide-react';
import api from '../../../../shared/api/axiosInstance';
import toast from 'react-hot-toast';

const JOB_TYPES = ['Full-time', 'Part-time', 'Contract', 'Internship'];

const initialForm = {
  title: '',
  description: '',
  department: '',
  location: '',
  type: 'Full-time',
  active: true,
};

const JobPositions = () => {
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
      const res = await api.get('/admin/careers/jobs');
      const results = res?.results || res?.data?.results || [];
      setRows(results);
    } catch (apiError) {
      setError(apiError?.message || 'Unable to load job positions');
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
      [row.title, row.department, row.location, row.type].some((value) =>
        String(value || '').toLowerCase().includes(query),
      ),
    );
  }, [rows, search]);

  const submitForm = async (event) => {
    event.preventDefault();
    if (!form.title.trim() || !form.description.trim() || !form.department.trim() || !form.location.trim()) {
      toast.error('All fields except type and active are required');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        department: form.department.trim(),
        location: form.location.trim(),
        type: form.type,
        active: form.active,
      };

      if (editingId) {
        await api.patch(`/admin/careers/jobs/${editingId}`, payload);
        toast.success('Job position updated!');
      } else {
        await api.post('/admin/careers/jobs', payload);
        toast.success('Job position created!');
      }

      await loadRows();
      resetForm();
    } catch (apiError) {
      setError(apiError?.message || 'Unable to save job position');
    } finally {
      setSaving(false);
    }
  };

  const onEdit = (row) => {
    setEditingId(row.id);
    setForm({
      title: row.title || '',
      description: row.description || '',
      department: row.department || '',
      location: row.location || '',
      type: row.type || 'Full-time',
      active: Boolean(row.active),
    });
  };

  const onDelete = async (row) => {
    if (!window.confirm(`Delete "${row.title}" and all its applications?`)) return;
    try {
      await api.delete(`/admin/careers/jobs/${row.id}`);
      toast.success('Job position deleted');
      await loadRows();
      if (editingId === row.id) {
        resetForm();
      }
    } catch (apiError) {
      setError(apiError?.message || 'Unable to delete job position');
    }
  };

  const toggleActive = async (row) => {
    try {
      await api.patch(`/admin/careers/jobs/${row.id}`, { active: !row.active });
      toast.success(`Position set to ${!row.active ? 'active' : 'inactive'}`);
      await loadRows();
    } catch (apiError) {
      setError(apiError?.message || 'Unable to update status');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6 lg:p-8">
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-1.5 text-xs text-gray-400 font-semibold">
          <span>Careers Management</span>
          <ChevronRight size={12} />
          <span className="text-gray-700">Job Positions</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-bold text-gray-900 uppercase tracking-tight">Job Positions</h1>
        </div>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600 font-medium">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        {/* Form Column */}
        <form onSubmit={submitForm} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm h-fit">
          <div className="mb-6 flex items-center gap-3 border-b border-gray-100 pb-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <Briefcase size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900 uppercase">
                {editingId ? 'Update Job Position' : 'Add Job Position'}
              </h3>
              <p className="text-xs text-gray-400">Curate job postings displayed on the careers page</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-500">Job Title *</label>
              <input
                type="text"
                value={form.title}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="e.g. Senior Backend Engineer"
                className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-800 outline-none transition-colors focus:border-amber-500 focus:ring-1 focus:ring-amber-500 bg-gray-50/50"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-500">Department *</label>
              <input
                type="text"
                value={form.department}
                onChange={(event) => setForm((prev) => ({ ...prev, department: event.target.value }))}
                placeholder="e.g. Engineering"
                className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-800 outline-none transition-colors focus:border-amber-500 focus:ring-1 focus:ring-amber-500 bg-gray-50/50"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-500">Location *</label>
              <input
                type="text"
                value={form.location}
                onChange={(event) => setForm((prev) => ({ ...prev, location: event.target.value }))}
                placeholder="e.g. New Delhi, India (Hybrid)"
                className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-800 outline-none transition-colors focus:border-amber-500 focus:ring-1 focus:ring-amber-500 bg-gray-50/50"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-500">Job Type</label>
              <select
                value={form.type}
                onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-800 outline-none transition-colors focus:border-amber-500 focus:ring-1 focus:ring-amber-500 bg-white"
              >
                {JOB_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-500">Job Description *</label>
              <textarea
                value={form.description}
                rows="5"
                onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="Role details, responsibilities, and qualifications..."
                className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-800 outline-none transition-colors focus:border-amber-500 focus:ring-1 focus:ring-amber-500 bg-gray-50/50 resize-none"
              ></textarea>
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-gray-700 pt-1">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(event) => setForm((prev) => ({ ...prev, active: event.target.checked }))}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              Active Listing
            </label>

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 rounded-lg bg-[#FFB300] hover:bg-[#E5A100] text-slate-900 px-4 py-2.5 text-sm font-bold uppercase tracking-wider transition-colors disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
              </button>
              {editingId ? (
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </div>
        </form>

        {/* List Column */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 p-4">
            <h3 className="text-base font-bold text-gray-900">Positions List</h3>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search positions..."
              className="w-60 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none transition-colors focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-6 py-3.5 text-left text-xs font-bold text-gray-500">Title</th>
                  <th className="px-6 py-3.5 text-left text-xs font-bold text-gray-500">Department</th>
                  <th className="px-6 py-3.5 text-left text-xs font-bold text-gray-500">Location</th>
                  <th className="px-6 py-3.5 text-left text-xs font-bold text-gray-500">Type</th>
                  <th className="px-6 py-3.5 text-left text-xs font-bold text-gray-500">Status</th>
                  <th className="px-6 py-3.5 text-right text-xs font-bold text-gray-500">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-400 font-medium">
                      Loading positions...
                    </td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-400 font-medium">
                      No job positions found.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
                    <tr key={row.id} className="border-b border-gray-50 last:border-b-0 hover:bg-gray-50/50">
                      <td className="px-6 py-4 text-sm font-bold text-gray-900">{row.title}</td>
                      <td className="px-6 py-4 text-sm font-semibold text-gray-500">{row.department}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">{row.location}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold">
                          {row.type}
                        </span>
                      </td>
                      <td className="px-6 py-4">
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
                      <td className="px-6 py-4">
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

export default JobPositions;
