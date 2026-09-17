import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  ChevronRight,
  Loader2,
  X,
  ArrowLeft,
  Search,
  CheckCircle2,
  Edit,
  Trash2,
  Users,
  Save,
} from 'lucide-react';
import { adminService } from '../../services/adminService';
import toast from 'react-hot-toast';

const emptyForm = {
  audience: 'user',
  order: 1,
  title: '',
  description: '',
  active: true,
};

const OnboardingScreens = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [screens, setScreens] = useState([]);
  const [entries, setEntries] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [form, setForm] = useState(emptyForm);

  const fetchAllScreens = async () => {
    try {
      setLoading(true);
      const [userRes, driverRes, ownerRes] = await Promise.all([
        adminService.getOnboardingScreens('user'),
        adminService.getOnboardingScreens('driver'),
        adminService.getOnboardingScreens('owner'),
      ]);

      const combined = [
        ...(userRes?.data?.results || userRes?.results || []),
        ...(driverRes?.data?.results || driverRes?.results || []),
        ...(ownerRes?.data?.results || ownerRes?.results || []),
      ];

      combined.sort((a, b) => {
        if (Number(a?.order || 0) !== Number(b?.order || 0)) {
          return Number(a?.order || 0) - Number(b?.order || 0);
        }
        return String(a?.title || '').localeCompare(String(b?.title || ''));
      });

      setScreens(combined);
    } catch (err) {
      console.error('Fetch error:', err);
      toast.error('Failed to load screens');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllScreens();
  }, []);

  const filteredScreens = useMemo(() => {
    const keyword = String(searchTerm || '').trim().toLowerCase();
    if (!keyword) {
      return screens;
    }

    return screens.filter((item) =>
      [item?.title, item?.description, item?.audience, item?.screen]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword)),
    );
  }, [screens, searchTerm]);

  const visibleScreens = filteredScreens.slice(0, Number(entries));

  const openCreateModal = () => {
    setEditingId('');
    setForm(emptyForm);
    setIsModalOpen(true);
  };

  const openEditModal = (screen) => {
    setEditingId(String(screen?._id || ''));
    setForm({
      audience: screen?.audience || screen?.screen || 'user',
      order: Number(screen?.order || 1),
      title: screen?.title || '',
      description: screen?.description || '',
      active: screen?.active !== false,
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId('');
    setForm(emptyForm);
  };

  const handleSubmit = async () => {
    const payload = {
      audience: form.audience,
      order: Number(form.order || 1),
      title: String(form.title || '').trim(),
      description: String(form.description || '').trim(),
      active: form.active,
    };

    if (!payload.title) {
      toast.error('Title is required');
      return;
    }

    try {
      setSaving(true);
      if (editingId) {
        await adminService.updateOnboardingScreen(editingId, payload);
        toast.success('Onboarding screen updated');
      } else {
        await adminService.createOnboardingScreen(payload);
        toast.success('Onboarding screen created');
      }
      closeModal();
      await fetchAllScreens();
    } catch (err) {
      console.error('Save error:', err);
      toast.error('Failed to save onboarding screen');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this onboarding screen?')) {
      return;
    }
    try {
      await adminService.deleteOnboardingScreen(id);
      toast.success('Onboarding screen deleted');
      await fetchAllScreens();
    } catch (err) {
      console.error('Delete error:', err);
      toast.error('Failed to delete onboarding screen');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6 lg:p-8 font-sans">
      <div className="mb-8">
        <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-2">
          <span>Settings</span>
          <ChevronRight size={12} />
          <span>App Configuration</span>
          <ChevronRight size={12} />
          <span className="text-gray-700">Onboarding Flow</span>
        </div>
        <div className="flex items-center justify-between">
          <h1 className="text-xl text-gray-900 font-bold">Landing & Onboarding</h1>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={openCreateModal}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors shadow-sm"
            >
              <Plus size={16} /> Add Screen
            </button>
            <button
              onClick={() => window.history.back()}
              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
            >
              <ArrowLeft size={16} /> Back
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {['user', 'driver', 'owner'].map((role) => (
            <div key={role} className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${role === 'user' ? 'bg-indigo-50 text-indigo-600' : role === 'driver' ? 'bg-amber-50 text-amber-600' : 'bg-green-50 text-green-600'}`}>
                <Users size={20} />
              </div>
              <div>
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{role} screens</h4>
                <p className="text-xl font-black text-gray-900">
                  {screens.filter((s) => (s?.audience || s?.screen) === role).length}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-gray-100 flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Filter onboarding content..."
                className="w-full pl-11 pr-4 py-2.5 bg-gray-50/50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:border-indigo-500 outline-none transition-all"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-gray-400 uppercase mr-2">Show</label>
              <select
                value={entries}
                onChange={(e) => setEntries(Number(e.target.value))}
                className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-bold text-gray-700 outline-none focus:border-indigo-500"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  <th className="px-6 py-4">Audience</th>
                  <th className="px-6 py-4 text-center">Order</th>
                  <th className="px-6 py-4">Title & Description</th>
                  <th className="px-6 py-4 text-center">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-medium">
                {loading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan="5" className="px-6 py-10"><div className="h-4 bg-gray-50 rounded w-full" /></td>
                    </tr>
                  ))
                ) : visibleScreens.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-6 py-20 text-center text-gray-400 text-sm italic">No onboarding screens found in the registry.</td>
                  </tr>
                ) : (
                  visibleScreens.map((screen) => {
                    const audience = screen?.audience || screen?.screen || 'user';
                    return (
                      <tr key={screen._id} className="group hover:bg-gray-50/70 transition-colors">
                        <td className="px-6 py-5">
                          <span className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider border ${audience === 'driver' ? 'bg-amber-50 text-amber-600 border-amber-100' : audience === 'owner' ? 'bg-green-50 text-green-600 border-green-100' : 'bg-indigo-50 text-indigo-600 border-indigo-100'}`}>
                            {audience}
                          </span>
                        </td>
                        <td className="px-6 py-5 text-center">
                          <span className="text-xs font-black text-gray-400">{String(screen?.order || 0).padStart(2, '0')}</span>
                        </td>
                        <td className="px-6 py-5">
                          <div>
                            <p className="text-sm font-bold text-gray-900 mb-0.5">{screen?.title}</p>
                            <p className="text-[11px] text-gray-400 font-medium leading-relaxed max-w-md">{screen?.description}</p>
                          </div>
                        </td>
                        <td className="px-6 py-5 text-center">
                          {screen?.active ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-bold uppercase">
                              <CheckCircle2 size={10} /> Live
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-50 text-gray-400 text-[10px] font-bold uppercase">
                              Hidden
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => openEditModal(screen)} className="p-2.5 text-gray-400 hover:text-indigo-600 hover:bg-white rounded-lg transition-all border border-transparent hover:border-indigo-100"><Edit size={16} /></button>
                            <button onClick={() => handleDelete(screen._id)} className="p-2.5 text-gray-400 hover:text-red-500 hover:bg-white rounded-lg transition-all border border-transparent hover:border-red-100"><Trash2 size={16} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="p-6 bg-gray-50/50 border-t border-gray-100 flex items-center justify-between">
            <div className="text-[11px] text-gray-400 font-bold uppercase tracking-wider">
              Showing {visibleScreens.length ? 1 : 0} to {visibleScreens.length} of {filteredScreens.length} Registry Items
            </div>
          </div>
        </div>
      </div>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <h2 className="text-lg text-slate-900 font-bold">{editingId ? 'Edit Onboarding Screen' : 'Add Onboarding Screen'}</h2>
                <p className="text-sm text-slate-500">Manage the landing content shown before app sign-in.</p>
              </div>
              <button type="button" onClick={closeModal} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50">
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-5 px-6 py-5 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-500">Audience</label>
                <select
                  value={form.audience}
                  onChange={(e) => setForm((current) => ({ ...current, audience: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="user">User</option>
                  <option value="driver">Driver</option>
                  <option value="owner">Owner</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-500">Order</label>
                <input
                  type="number"
                  min="1"
                  value={form.order}
                  onChange={(e) => setForm((current) => ({ ...current, order: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-500">Title</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  placeholder="Enter onboarding title"
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-500">Description</label>
                <textarea
                  rows={4}
                  value={form.description}
                  onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  placeholder="Enter onboarding description"
                />
              </div>

              <div className="md:col-span-2 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Show this screen in app</p>
                  <p className="text-xs text-slate-500">Disable it when the screen should stay hidden.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setForm((current) => ({ ...current, active: !current.active }))}
                  className={`relative h-7 w-12 rounded-full transition-colors ${form.active ? 'bg-indigo-600' : 'bg-slate-300'}`}
                >
                  <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${form.active ? 'right-1' : 'left-1'}`} />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-4">
              <button type="button" onClick={closeModal} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {saving ? 'Saving...' : editingId ? 'Update Screen' : 'Create Screen'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default OnboardingScreens;
