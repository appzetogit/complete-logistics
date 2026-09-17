import React from 'react';
import { ArrowLeft, Check, ChevronDown, Loader2, User } from 'lucide-react';

import AdminPageHeader from '../../components/ui/AdminPageHeader';
import { adminCardClass, adminInputClass, adminLabelClass } from '../../components/ui/adminUi';

const phoneInputClass =
  'min-w-0 flex-1 bg-transparent px-4 text-sm text-gray-800 outline-none';

const OwnerFormPanel = ({
  mode = 'create',
  formData,
  setFormData,
  areas,
  transportTypes,
  submitting,
  onSubmit,
  onCancel,
  backLabel = 'Manage Owners',
}) => {
  const isEdit = mode === 'edit';
  const title = isEdit ? 'Edit Owner' : 'Create Owner';

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <div className="p-6 lg:p-8">
        <AdminPageHeader
          module="Owner Management"
          page={backLabel}
          title={title}
          right={
            <button
              type="button"
              onClick={onCancel}
              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <ArrowLeft size={16} /> Back
            </button>
          }
        />

        <div className="mt-6">
          <div className={adminCardClass}>
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
          <div className="w-9 h-9 rounded-lg bg-yellow-50 flex items-center justify-center text-yellow-600">
            <User size={18} />
          </div>
          <div>
            <h3 className="text-sm text-gray-900 font-bold">Basic Information</h3>
            <p className="text-xs text-gray-400">Register an owner account for fleet operations.</p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-6">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div>
                <label className={adminLabelClass}>
                  Company Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.company_name}
                  onChange={(event) => setFormData({ ...formData, company_name: event.target.value })}
                  placeholder="Enter Company Name"
                  className={adminInputClass}
                />
              </div>

              <div>
                <label className={adminLabelClass}>
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                  placeholder="Enter Name"
                  className={adminInputClass}
                />
              </div>

              <div>
                <label className={adminLabelClass}>
                  Mobile <span className="text-red-500">*</span>
                </label>
                <div className="flex h-[42px] overflow-hidden rounded-lg border border-gray-200 bg-white transition-colors focus-within:border-yellow-400 focus-within:ring-1 focus-within:ring-yellow-400">
                  <div className="flex items-center gap-3 border-r border-gray-200 bg-gray-50 px-4 text-sm text-gray-900">
                    <img src="https://flagcdn.com/w20/in.png" alt="IN" className="h-4 w-6 rounded-sm object-cover" />
                    <span>+91</span>
                  </div>
                  <input
                    type="tel"
                    required
                    value={formData.mobile}
                    onChange={(event) => setFormData({ ...formData, mobile: event.target.value.replace(/\D/g, '') })}
                    placeholder="Enter Number"
                    className={phoneInputClass}
                  />
                </div>
              </div>

              <div>
                <label className={adminLabelClass}>
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(event) => setFormData({ ...formData, email: event.target.value })}
                  placeholder="Enter Email"
                  className={adminInputClass}
                />
              </div>

              <div>
                <label className={adminLabelClass}>
                  Password <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  required={!isEdit}
                  value={formData.password}
                  onChange={(event) => setFormData({ ...formData, password: event.target.value })}
                  placeholder="Enter Password"
                  className={adminInputClass}
                />
              </div>

              <div>
                <label className={adminLabelClass}>
                  Confirm Password <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  required={!isEdit}
                  value={formData.password_confirmation}
                  onChange={(event) => setFormData({ ...formData, password_confirmation: event.target.value })}
                  placeholder="Enter confirm Password"
                  className={adminInputClass}
                />
              </div>

              <div>
                <label className={adminLabelClass}>Select Area</label>
                <div className="relative">
                  <select
                    value={formData.service_location_id}
                    onChange={(event) => setFormData({ ...formData, service_location_id: event.target.value })}
                    className={`${adminInputClass} appearance-none pr-10`}
                  >
                    <option value=""></option>
                    {areas.map((area) => (
                      <option key={area._id} value={area._id}>
                        {area.service_location_name || area.name || 'Unknown Area'}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-gray-600" size={16} />
                </div>
              </div>

              <div>
                <label className={adminLabelClass}>
                  Select Transport Type <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <select
                    required
                    value={formData.transport_type}
                    onChange={(event) => setFormData({ ...formData, transport_type: event.target.value })}
                    className={`${adminInputClass} appearance-none pr-10`}
                  >
                    <option value="">Select Transport Type</option>
                    {transportTypes.map((transportType, index) => (
                      <option key={index} value={transportType.transport_type}>
                        {transportType.transport_type === 'all'
                          ? 'All'
                          : transportType.transport_type.charAt(0).toUpperCase() + transportType.transport_type.slice(1)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-gray-600" size={16} />
                </div>
              </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-3 rounded-lg bg-yellow-400 px-6 py-3 text-sm font-bold text-black transition-colors hover:bg-yellow-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="animate-spin" size={16} />
                  Saving...
                </>
              ) : (
                <>
                  {isEdit ? 'Update Owner' : 'Create Owner'}
                  <Check size={18} />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
        </div>
      </div>
    </div>
  );
};

export default OwnerFormPanel;
