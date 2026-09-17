import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, Save } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import AdminPageHeader from '../../components/ui/AdminPageHeader';

const BASE = `${globalThis.__LEGACY_BACKEND_ORIGIN__}/api/v1/admin/owner-management`;

const inputClass = 'h-10 w-full rounded border border-gray-300 bg-white px-3 text-sm text-gray-950 outline-none transition-colors focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400';
const labelClass = 'mb-1.5 block text-xs font-bold text-gray-950';

const FleetNeededDocumentsCreate = () => {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    image_type: '',
    has_expiry_date: '',
    has_identify_number: '',
    is_editable: false,
    is_required: false,
    active: true,
  });

  const token = localStorage.getItem('adminToken') || '';

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!formData.name || !formData.image_type || formData.has_expiry_date === '' || formData.has_identify_number === '') {
      alert('Please fill all required fields');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${BASE}/driver-needed-document`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          has_expiry_date: formData.has_expiry_date === '1',
          has_identify_number: formData.has_identify_number === '1',
        }),
      });

      const json = await res.json();
      if (json?.success) {
        navigate('/admin/fleet/documents');
        return;
      }
      alert(json?.message || 'Operation failed');
    } catch (error) {
      console.error('Failed to create fleet needed document:', error);
      alert('Network error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-950">
      <div className="px-5 pt-3">
        <AdminPageHeader
          module="Fleet Management"
          page="Fleet Needed Documents"
          title="Create Fleet Needed Document"
          backTo="/admin/fleet/documents"
        />
      </div>

      <div className="flex justify-center px-5 pb-10 pt-4">
        <div className="w-full max-w-3xl bg-white rounded-xl border border-gray-200 shadow-sm p-6 lg:p-8">
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
            <div>
              <label className={labelClass}>
                Document Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                required
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                className={inputClass}
                placeholder="Enter Name"
              />
            </div>

            <div>
              <label className={labelClass}>
                Image Type <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <select
                  required
                  value={formData.image_type}
                  onChange={(e) => setFormData((prev) => ({ ...prev, image_type: e.target.value }))}
                  className={`${inputClass} appearance-none pr-10`}
                >
                  <option value="">Select</option>
                  <option value="front">Front</option>
                  <option value="front_back">Front & Back</option>
                </select>
                <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
              </div>
            </div>

            <div>
              <label className={labelClass}>
                Has Expiry Date <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <select
                  required
                  value={formData.has_expiry_date}
                  onChange={(e) => setFormData((prev) => ({ ...prev, has_expiry_date: e.target.value }))}
                  className={`${inputClass} appearance-none pr-10`}
                >
                  <option value="">Select</option>
                  <option value="1">Yes</option>
                  <option value="0">No</option>
                </select>
                <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
              </div>
            </div>

            <div>
              <label className={labelClass}>
                Has Identify Number <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <select
                  required
                  value={formData.has_identify_number}
                  onChange={(e) => setFormData((prev) => ({ ...prev, has_identify_number: e.target.value }))}
                  className={`${inputClass} appearance-none pr-10`}
                >
                  <option value="">Select</option>
                  <option value="1">Yes</option>
                  <option value="0">No</option>
                </select>
                <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
              </div>
            </div>

            <div className="col-span-1 md:col-span-2 flex flex-wrap items-center gap-8 pt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.is_editable}
                  onChange={(e) => setFormData((prev) => ({ ...prev, is_editable: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-300 text-yellow-500 focus:ring-yellow-500"
                />
                <span className="text-sm font-semibold text-gray-900">Is Editable?</span>
              </label>
              
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.is_required}
                  onChange={(e) => setFormData((prev) => ({ ...prev, is_required: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-300 text-yellow-500 focus:ring-yellow-500"
                />
                <span className="text-sm font-semibold text-gray-900">Is Required?</span>
              </label>
            </div>

            <div className="col-span-1 md:col-span-2 pt-6 flex items-center justify-end gap-3 border-t border-gray-100 mt-2">
              <button
                type="button"
                onClick={() => navigate('/admin/fleet/documents')}
                className="h-10 px-6 rounded-lg text-sm font-bold text-gray-600 hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="h-10 px-8 bg-black text-white rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-gray-900 transition-colors shadow-sm disabled:opacity-50"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Save
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default FleetNeededDocumentsCreate;
