import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, Save } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AdminPageHeader from '../../components/ui/AdminPageHeader';

const BASE = `${globalThis.__LEGACY_BACKEND_ORIGIN__}/api/v1/admin/owner-management`;

const inputClass = 'h-10 w-full rounded border border-gray-300 bg-white px-3 text-sm text-gray-950 outline-none transition-colors focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400';
const labelClass = 'mb-1.5 block text-xs font-bold text-gray-950';

const toBool = (value) => {
  if (value === true) return true;
  if (value === false) return false;
  const v = String(value ?? '').toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
};

const OwnerNeededDocumentsCreate = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('id');

  const token = localStorage.getItem('adminToken') || '';
  const [submitting, setSubmitting] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(Boolean(editId));

  const [formData, setFormData] = useState({
    name: '',
    image_type: '',
    has_expiry_date: '',
    has_identify_number: '',
    is_editable: false,
    is_required: false,
    active: true,
  });

  useEffect(() => {
    if (!editId) return;

    const load = async () => {
      setLoadingEdit(true);
      try {
        const res = await fetch(`${BASE}/owner-needed-document/${editId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const json = await res.json();
        const doc = json?.data || json?.data?.result || json?.data?.results || null;

        if (json?.success && doc) {
          setFormData({
            name: doc?.name || '',
            image_type: doc?.image_type || '',
            has_expiry_date: doc?.has_expiry_date ? '1' : '0',
            has_identify_number: doc?.has_identify_number ? '1' : '0',
            is_editable: Boolean(doc?.is_editable),
            is_required: Boolean(doc?.is_required),
            active: doc?.active !== false,
          });
        }
      } catch (e) {
        console.error('Failed to load owner needed document:', e);
      } finally {
        setLoadingEdit(false);
      }
    };

    load();
  }, [editId, token]);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!formData.name || !formData.image_type || formData.has_expiry_date === '' || formData.has_identify_number === '') {
      alert('Please fill all required fields');
      return;
    }

    setSubmitting(true);
    try {
      const url = editId ? `${BASE}/owner-needed-document/${editId}` : `${BASE}/owner-needed-document`;
      const method = editId ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          has_expiry_date: toBool(formData.has_expiry_date),
          has_identify_number: toBool(formData.has_identify_number),
        }),
      });

      const json = await res.json();
      if (json?.success) {
        navigate('/admin/owners/documents');
        return;
      }
      alert(json?.message || 'Operation failed');
    } catch (e) {
      console.error('Failed to save owner needed document:', e);
      alert('Network error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-950">
      <div className="p-6 lg:p-8">
        <AdminPageHeader
          module="Owner Management"
          page="Owner Needed Documents"
          title="Create Owner Needed Document"
          backTo="/admin/owners/documents"
        />

      <div className="flex justify-center px-5 pb-10 pt-4">
        <div className="w-full max-w-3xl rounded-xl border border-gray-200 bg-white shadow-sm p-6 lg:p-8">
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-2">
              <div>
                <label className={labelClass}>
                  Document Name <span className="text-rose-500">*</span>
                </label>
                <input
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  className={inputClass}
                  placeholder="Enter Name"
                  disabled={loadingEdit}
                />
              </div>

              <div>
                <label className={labelClass}>
                  Image Type <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={formData.image_type}
                    onChange={(e) => setFormData((prev) => ({ ...prev, image_type: e.target.value }))}
                    className={`${inputClass} appearance-none pr-10`}
                    disabled={loadingEdit}
                  >
                    <option value="">Select</option>
                    <option value="front">Front</option>
                    <option value="front_back">Front&amp;Back</option>
                  </select>
                  <ChevronDown size={18} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                </div>
              </div>

              <div>
                <label className={labelClass}>
                  Has Expiry Date <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={formData.has_expiry_date}
                    onChange={(e) => setFormData((prev) => ({ ...prev, has_expiry_date: e.target.value }))}
                    className={`${inputClass} appearance-none pr-10`}
                    disabled={loadingEdit}
                  >
                    <option value="">Select</option>
                    <option value="1">Yes</option>
                    <option value="0">No</option>
                  </select>
                  <ChevronDown size={18} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                </div>
              </div>

              <div>
                <label className={labelClass}>
                  Has Identify Number <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={formData.has_identify_number}
                    onChange={(e) => setFormData((prev) => ({ ...prev, has_identify_number: e.target.value }))}
                    className={`${inputClass} appearance-none pr-10`}
                    disabled={loadingEdit}
                  >
                    <option value="">Select</option>
                    <option value="1">Yes</option>
                    <option value="0">No</option>
                  </select>
                  <ChevronDown size={18} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                </div>
              </div>

            <div className="col-span-1 md:col-span-2 mt-2 flex flex-wrap items-center gap-16">
              <label className="flex items-center gap-3 text-sm font-semibold text-gray-900">
                <input
                  type="checkbox"
                  checked={formData.is_editable}
                  onChange={(e) => setFormData((prev) => ({ ...prev, is_editable: e.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300 text-yellow-500 focus:ring-yellow-500"
                  disabled={loadingEdit}
                />
                Is Editable?
              </label>
              <label className="flex items-center gap-3 text-sm font-semibold text-gray-900">
                <input
                  type="checkbox"
                  checked={formData.is_required}
                  onChange={(e) => setFormData((prev) => ({ ...prev, is_required: e.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300 text-yellow-500 focus:ring-yellow-500"
                  disabled={loadingEdit}
                />
                Is Required?
              </label>
            </div>

            <div className="col-span-1 md:col-span-2 pt-6 flex items-center justify-end gap-3 border-t border-gray-100 mt-2">
              <button
                type="button"
                onClick={() => navigate('/admin/owners/documents')}
                className="h-10 px-6 rounded-lg text-sm font-bold text-gray-600 hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || loadingEdit}
                className="h-10 px-8 bg-yellow-400 text-black rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-yellow-500 transition-colors shadow-sm disabled:opacity-50"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Save
              </button>
            </div>
          </form>
        </div>
      </div>
      </div>
    </div>
  );
};

export default OwnerNeededDocumentsCreate;
