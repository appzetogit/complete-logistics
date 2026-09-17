import React, { useState } from 'react';
import { Check, ChevronRight, Loader2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';

import { adminService } from '../../services/adminService';
import AdminPageHeader from '../../components/ui/AdminPageHeader';

const OwnerPasswordUpdate = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    password: '',
    password_confirmation: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!formData.password || !formData.password_confirmation) {
      alert('Password and confirm password are required');
      return;
    }

    if (formData.password.length < 6) {
      alert('Password must be at least 6 characters');
      return;
    }

    if (formData.password !== formData.password_confirmation) {
      alert('Passwords do not match');
      return;
    }

    setSubmitting(true);

    try {
      const response = await adminService.updateOwner(id, formData);

      if (response.success) {
        navigate('/admin/owners');
        return;
      }

      alert(response.message || 'Failed to update password');
    } catch (error) {
      alert(error.message || 'Failed to update password');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-950">
      <div className="p-6 lg:p-8">
        <AdminPageHeader module="Owner Management" page="Owners" title="Update Owner Password" backTo="/admin/owners" />

        <div className="mt-6">
          <form
            onSubmit={handleSubmit}
            className="rounded border border-gray-200 bg-white px-4 py-9 shadow-sm md:px-5"
          >
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-950">
                Password <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                className="h-10 w-full rounded border border-gray-300 bg-white px-4 text-sm text-gray-950 outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                autoComplete="new-password"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-950">
                Confirm Password <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                name="password_confirmation"
                value={formData.password_confirmation}
                onChange={handleChange}
                className="h-10 w-full rounded border border-gray-300 bg-white px-4 text-sm text-gray-950 outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                autoComplete="new-password"
              />
            </div>
          </div>

          <div className="mt-5 flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-10 items-center gap-3 rounded bg-indigo-900 px-6 text-sm font-semibold text-white transition-colors hover:bg-indigo-950 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Submit
                </>
              ) : (
                <>
                  Submit
                  <Check size={17} />
                </>
              )}
            </button>
          </div>
        </form>
        </div>
      </div>
    </div>
  );
};

export default OwnerPasswordUpdate;
