import React, { useState, useEffect, useRef } from 'react';
import { ChevronRight, Upload, Plus, Trash2, Edit2, Image as ImageIcon, Loader2 } from 'lucide-react';
import { adminService } from '../../services/adminService';

const StatusToggle = ({ active, onToggle }) => (
  <button
    onClick={onToggle}
    className={`w-9 h-5 rounded-full transition-colors relative ${active ? 'bg-indigo-600' : 'bg-gray-300'}`}
  >
    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${active ? 'left-[18px]' : 'left-0.5'}`} />
  </button>
);

const Preferences = () => {
  const [preferences, setPreferences] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [formData, setFormData] = useState({ name: '', icon: null });
  const [iconPreview, setIconPreview] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef(null);

  const fetchPreferences = async () => {
    try {
      setIsLoading(true);
      const response = await adminService.getPreferences();
      const data = response?.paginator?.data || response?.results || (Array.isArray(response) ? response : []);
      setPreferences(data);
    } catch (err) {
      console.error('Fetch Preferences Error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchPreferences(); }, []);

  const handleIconChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFormData(prev => ({ ...prev, icon: file }));
      const reader = new FileReader();
      reader.onloadend = () => setIconPreview(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const handleCreate = async () => {
    if (!formData.name) return alert('Please enter preference name');
    try {
      setIsSubmitting(true);
      const data = { name: formData.name };
      await adminService.createPreference(data);
      setFormData({ name: '', icon: null });
      setIconPreview(null);
      fetchPreferences();
    } catch (err) {
      console.error('Create Preference Error:', err);
      alert(err.message || 'Failed to create preference');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (id, currentStatus) => {
    try {
      await adminService.updatePreferenceStatus(id, { active: currentStatus ? 0 : 1 });
      fetchPreferences();
    } catch (err) {
      console.error('Toggle Error:', err);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Delete this preference?')) {
      try {
        await adminService.deletePreference(id);
        fetchPreferences();
      } catch (err) {
        console.error('Delete Error:', err);
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6 lg:p-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-2">
        <span>Masters</span>
        <ChevronRight size={12} />
        <span className="text-gray-700">Preferences</span>
      </div>
      <h1 className="text-xl text-gray-900 mb-6 font-bold">Preferences</h1>

      {/* Create Form */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h3 className="text-sm text-gray-900 mb-4 font-bold">Add New Preference</h3>
        <div className="flex items-end gap-6 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Name <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g. Pet, Luggage"
              className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Icon</label>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="w-16 h-16 border-2 border-dashed border-gray-200 rounded-lg flex items-center justify-center cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors overflow-hidden"
            >
              {iconPreview ? (
                <img src={iconPreview} className="w-full h-full object-cover" alt="Preview" />
              ) : (
                <Upload size={18} className="text-gray-400" />
              )}
              <input type="file" ref={fileInputRef} onChange={handleIconChange} className="hidden" accept="image/*" />
            </div>
          </div>

          <button
            onClick={handleCreate}
            disabled={isSubmitting}
            className="px-6 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Create
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="w-7 h-7 text-indigo-600 animate-spin" />
            <p className="text-sm text-gray-400">Loading preferences...</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">#</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">Icon</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {preferences.length > 0 ? preferences.map((pref, idx) => (
                <tr key={pref._id || pref.id || idx} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4 text-sm text-gray-500">{idx + 1}</td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{pref.name}</td>
                  <td className="px-6 py-4">
                    <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden border border-gray-200">
                      {pref.icon ? (
                        <img src={pref.icon} className="w-full h-full object-cover" alt={pref.name} />
                      ) : (
                        <ImageIcon size={16} className="text-gray-400" />
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <StatusToggle
                      active={pref.active === 1 || pref.active === true}
                      onToggle={() => handleToggleStatus(pref._id || pref.id, pref.active === 1 || pref.active === true)}
                    />
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors">
                        <Edit2 size={15} />
                      </button>
                      <button
                        onClick={() => handleDelete(pref._id || pref.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="5" className="px-6 py-16 text-center text-sm text-gray-400">
                    No preferences found. Create one above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default Preferences;
