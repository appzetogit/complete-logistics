import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, MapPinned, Pencil, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminService } from '../../services/adminService';

const inputClass =
  'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none transition-all placeholder:text-slate-400 focus:border-[#1D4ED8] focus:ring-4 focus:ring-blue-100';
const labelClass = 'mb-2 block text-xs font-black uppercase tracking-[0.18em] text-slate-500';

const emptyForm = { name: '', code: '', status: 'active' };

const readIsSuperAdmin = () => {
  try {
    const info = JSON.parse(window.localStorage.getItem('adminInfo') || 'null');
    return !info || String(info.admin_type || info.role || 'superadmin').toLowerCase() === 'superadmin';
  } catch {
    return true;
  }
};

const States = () => {
  const [states, setStates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [form, setForm] = useState(emptyForm);
  const canManage = readIsSuperAdmin();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await adminService.getStates();
      setStates(Array.isArray(response?.data) ? response.data : response?.data?.results || []);
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || 'Unable to load states.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const reset = () => {
    setEditingId('');
    setForm(emptyForm);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.name.trim() || !form.code.trim()) {
      toast.error('State name and code are required.');
      return;
    }
    setSaving(true);
    try {
      const payload = { name: form.name.trim(), code: form.code.trim().toUpperCase(), status: form.status };
      if (editingId) {
        await adminService.updateState(editingId, payload);
        toast.success('State updated.');
      } else {
        await adminService.createState(payload);
        toast.success('State added.');
      }
      reset();
      await load();
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || 'Unable to save the state.');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (state) => {
    setEditingId(String(state._id || state.id));
    setForm({ name: state.name || '', code: state.code || '', status: state.status || 'active' });
  };

  const handleDelete = async (state) => {
    if (!window.confirm(`Delete ${state.name}?`)) return;
    try {
      await adminService.deleteState(String(state._id || state.id));
      toast.success('State deleted.');
      await load();
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || 'Unable to delete the state.');
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700">
          <MapPinned size={20} />
        </div>
        <div>
          <h1 className="text-xl font-black text-slate-900">States</h1>
          <p className="text-xs font-semibold text-slate-500">
            Put each city (Pricing → Service Location) in a state, then give admins the states they should see.
          </p>
        </div>
      </div>

      {canManage && (
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 rounded-[28px] border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50 md:grid-cols-4">
          <div className="md:col-span-2">
            <label className={labelClass}>State name</label>
            <input className={inputClass} value={form.name} onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))} placeholder="e.g. Maharashtra" />
          </div>
          <div>
            <label className={labelClass}>Code</label>
            <input className={inputClass} value={form.code} maxLength={6} onChange={(e) => setForm((c) => ({ ...c, code: e.target.value.toUpperCase() }))} placeholder="e.g. MH" />
          </div>
          <div>
            <label className={labelClass}>Status</label>
            <select className={inputClass} value={form.status} onChange={(e) => setForm((c) => ({ ...c, status: e.target.value }))}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div className="flex gap-3 md:col-span-4">
            <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              {editingId ? 'Update state' : 'Add state'}
            </button>
            {editingId && (
              <button type="button" onClick={reset} className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-600">
                Cancel
              </button>
            )}
          </div>
        </form>
      )}

      <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-lg shadow-slate-200/50">
        {loading ? (
          <div className="flex items-center justify-center p-10 text-slate-400">
            <Loader2 className="animate-spin" />
          </div>
        ) : states.length === 0 ? (
          <div className="p-10 text-center text-sm font-semibold text-slate-500">No states yet.</div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
              <tr>
                <th className="px-5 py-3">State</th>
                <th className="px-5 py-3">Code</th>
                <th className="px-5 py-3">Cities</th>
                <th className="px-5 py-3">Status</th>
                {canManage && <th className="px-5 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {states.map((state) => (
                <tr key={state._id || state.id} className="border-t border-slate-100">
                  <td className="px-5 py-3 font-bold text-slate-900">{state.name}</td>
                  <td className="px-5 py-3 font-semibold text-slate-600">{state.code}</td>
                  <td className="px-5 py-3 font-semibold text-slate-600">{state.service_location_count ?? 0}</td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${state.status === 'inactive' ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-700'}`}>
                      {state.status === 'inactive' ? 'Inactive' : 'Active'}
                    </span>
                  </td>
                  {canManage && (
                    <td className="px-5 py-3 text-right">
                      <button type="button" onClick={() => handleEdit(state)} className="mr-2 rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50" aria-label="Edit">
                        <Pencil size={14} />
                      </button>
                      <button type="button" onClick={() => handleDelete(state)} className="rounded-xl border border-rose-100 p-2 text-rose-600 hover:bg-rose-50" aria-label="Delete">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default States;
