import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, ChevronRight, Loader2, LockKeyhole, MapPinned, Shield, UserRound } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { adminService } from '../../services/adminService';
import { ADMIN_PERMISSION_GROUPS } from '../../constants/adminAccess';

const inputClass =
  'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none transition-all placeholder:text-slate-400 focus:border-[#1D4ED8] focus:ring-4 focus:ring-blue-100';
const labelClass = 'mb-2 block text-xs font-black uppercase tracking-[0.18em] text-slate-500';

const initialForm = {
  name: '',
  email: '',
  phone: '',
  role: 'Operations Subadmin',
  admin_type: 'subadmin',
  permissions: [],
  service_location_ids: [],
  zone_ids: [],
  password: '',
  passwordConfirmation: '',
  active: true,
};

const PermissionCheckbox = ({ checked, label, onChange }) => (
  <button
    type="button"
    onClick={onChange}
    className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition-all ${
      checked
        ? 'border-blue-200 bg-blue-50 text-blue-900'
        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
    }`}
  >
    <span className="text-sm font-bold">{label}</span>
    <span
      className={`flex h-5 w-5 items-center justify-center rounded-full border ${
        checked ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-transparent'
      }`}
    >
      <Check size={12} />
    </span>
  </button>
);

const AdminCreate = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);
  const [form, setForm] = useState(initialForm);
  const [serviceLocations, setServiceLocations] = useState([]);
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [serviceLocationResponse, zoneResponse, adminResponse] = await Promise.all([
          adminService.getServiceLocations(),
          adminService.getZones(),
          isEdit ? adminService.getAdmins() : Promise.resolve(null),
        ]);

        const nextServiceLocations = Array.isArray(serviceLocationResponse?.data)
          ? serviceLocationResponse.data
          : serviceLocationResponse?.data?.results || [];
        const nextZones = Array.isArray(zoneResponse?.data?.results)
          ? zoneResponse.data.results
          : zoneResponse?.data?.results || [];

        setServiceLocations(nextServiceLocations);
        setZones(nextZones);

        if (isEdit) {
          const adminList = Array.isArray(adminResponse?.data?.results) ? adminResponse.data.results : [];
          const existingAdmin = adminList.find((item) => String(item.id || item._id) === String(id));
          if (!existingAdmin) {
            toast.error('Admin account not found.');
            navigate('/admin/management/admins');
            return;
          }

          setForm({
            name: existingAdmin.name || '',
            email: existingAdmin.email || '',
            phone: existingAdmin.phone || '',
            role: existingAdmin.role || 'Operations Subadmin',
            admin_type: existingAdmin.admin_type || 'subadmin',
            permissions: Array.isArray(existingAdmin.permissions) ? existingAdmin.permissions.filter((item) => item !== '*') : [],
            service_location_ids: Array.isArray(existingAdmin.service_location_ids) ? existingAdmin.service_location_ids : [],
            zone_ids: Array.isArray(existingAdmin.zone_ids) ? existingAdmin.zone_ids : [],
            password: '',
            passwordConfirmation: '',
            active: existingAdmin.active !== false,
          });
        }
      } catch (error) {
        toast.error(error?.response?.data?.message || error?.message || 'Unable to load admin setup data.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [id, isEdit, navigate]);

  const visibleZones = useMemo(() => {
    if (form.admin_type === 'superadmin') {
      return zones;
    }

    const serviceLocationSet = new Set((form.service_location_ids || []).map(String));
    return zones.filter((zone) => serviceLocationSet.has(String(zone.service_location_id || '')));
  }, [form.admin_type, form.service_location_ids, zones]);

  useEffect(() => {
    if (form.admin_type === 'superadmin') {
      if (form.permissions.length > 0 || form.service_location_ids.length > 0 || form.zone_ids.length > 0) {
        setForm((current) => ({
          ...current,
          permissions: [],
          service_location_ids: [],
          zone_ids: [],
        }));
      }
      return;
    }

    const allowedZoneIds = new Set(visibleZones.map((zone) => String(zone.id || zone._id || '')));
    setForm((current) => ({
      ...current,
      zone_ids: current.zone_ids.filter((zoneId) => allowedZoneIds.has(String(zoneId))),
    }));
  }, [form.admin_type, form.permissions.length, form.service_location_ids.length, form.zone_ids.length, visibleZones]);

  const handlePermissionToggle = (permission) => {
    setForm((current) => ({
      ...current,
      permissions: current.permissions.includes(permission)
        ? current.permissions.filter((item) => item !== permission)
        : [...current.permissions, permission],
    }));
  };

  const handleMultiSelect = (key, value) => {
    setForm((current) => {
      const currentValues = Array.isArray(current[key]) ? current[key] : [];
      return {
        ...current,
        [key]: currentValues.includes(value)
          ? currentValues.filter((item) => item !== value)
          : [...currentValues, value],
      };
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!form.name.trim() || !form.email.trim()) {
      toast.error('Name and email are required.');
      return;
    }

    if (!isEdit && !form.password.trim()) {
      toast.error('Password is required for new admins.');
      return;
    }

    if (form.password || form.passwordConfirmation) {
      if (form.password !== form.passwordConfirmation) {
        toast.error('Passwords do not match.');
        return;
      }
    }

    const payload = {
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      role: form.admin_type === 'superadmin' ? 'superadmin' : form.role.trim(),
      admin_type: form.admin_type,
      permissions: form.admin_type === 'superadmin' ? [] : form.permissions,
      service_location_ids: form.admin_type === 'superadmin' ? [] : form.service_location_ids,
      zone_ids: form.admin_type === 'superadmin' ? [] : form.zone_ids,
      active: form.active,
      status: form.active ? 'active' : 'inactive',
      password: form.password,
      passwordConfirmation: form.passwordConfirmation,
      password_confirmation: form.passwordConfirmation,
    };

    setSaving(true);
    try {
      if (isEdit) {
        await adminService.updateAdminAccount(id, payload);
        toast.success('Admin account updated.');
      } else {
        await adminService.createAdminAccount(payload);
        toast.success('Subadmin created.');
      }
      navigate('/admin/management/admins');
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || 'Unable to save admin account.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={30} className="animate-spin text-blue-600" />
          <p className="text-xs font-black uppercase tracking-[0.24em] text-slate-400">Preparing access form</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,_#EFF6FF_0%,_#F8FAFC_32%)] p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
              <span>Admin Management</span>
              <ChevronRight size={12} />
              <span className="text-slate-700">{isEdit ? 'Edit Admin' : 'Create Subadmin'}</span>
            </div>
            <h1 className="text-3xl font-black tracking-tight text-slate-950">
              {isEdit ? 'Update Scoped Access' : 'Create Scoped Subadmin'}
            </h1>
            <p className="mt-2 max-w-2xl text-sm font-semibold text-slate-500">
              Assign module access first, then limit the account to the right service locations and zones.
            </p>
          </div>

          <button
            type="button"
            onClick={() => navigate('/admin/management/admins')}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 transition-all hover:bg-slate-50"
          >
            <ArrowLeft size={16} />
            Back to Admins
          </button>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          <div className="space-y-6 xl:col-span-4">
            <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50">
              <div className="mb-6 flex items-center gap-3">
                <div className="rounded-2xl bg-blue-50 p-3 text-blue-700">
                  <UserRound size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-900">Identity</h3>
                  <p className="text-xs font-semibold text-slate-500">Who will use this access profile</p>
                </div>
              </div>

              <div className="space-y-5">
                <div>
                  <label className={labelClass}>Admin Type</label>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { key: 'superadmin', label: 'Superadmin' },
                      { key: 'subadmin', label: 'Subadmin' },
                    ].map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => setField('admin_type', option.key)}
                        className={`rounded-2xl border px-4 py-3 text-sm font-black uppercase tracking-[0.14em] transition-all ${
                          form.admin_type === option.key
                            ? 'border-blue-200 bg-blue-50 text-blue-700'
                            : 'border-slate-200 bg-white text-slate-500'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className={labelClass}>Name</label>
                  <input value={form.name} onChange={(event) => setField('name', event.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Email</label>
                  <input value={form.email} onChange={(event) => setField('email', event.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Phone</label>
                  <input value={form.phone} onChange={(event) => setField('phone', event.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Role Label</label>
                  <input value={form.role} onChange={(event) => setField('role', event.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Account Status</label>
                  <button
                    type="button"
                    onClick={() => setField('active', !form.active)}
                    className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-sm font-bold transition-all ${
                      form.active
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-rose-200 bg-rose-50 text-rose-700'
                    }`}
                  >
                    <span>{form.active ? 'Active account' : 'Inactive account'}</span>
                    <span className="text-xs font-black uppercase tracking-[0.18em]">
                      {form.active ? 'Enabled' : 'Disabled'}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50">
              <div className="mb-6 flex items-center gap-3">
                <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
                  <LockKeyhole size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-900">Credentials</h3>
                  <p className="text-xs font-semibold text-slate-500">
                    {isEdit ? 'Leave blank to keep the current password.' : 'Set initial login password.'}
                  </p>
                </div>
              </div>

              <div className="space-y-5">
                <div>
                  <label className={labelClass}>Password</label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(event) => setField('password', event.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Confirm Password</label>
                  <input
                    type="password"
                    value={form.passwordConfirmation}
                    onChange={(event) => setField('passwordConfirmation', event.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6 xl:col-span-8">
            <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50">
              <div className="mb-6 flex items-center gap-3">
                <div className="rounded-2xl bg-violet-50 p-3 text-violet-700">
                  <Shield size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-900">Sidebar Permissions</h3>
                  <p className="text-xs font-semibold text-slate-500">Choose which menu groups and modules the admin can access.</p>
                </div>
              </div>

              {form.admin_type === 'superadmin' ? (
                <div className="rounded-3xl border border-amber-100 bg-amber-50 px-5 py-4 text-sm font-bold text-amber-800">
                  Superadmin inherits all sidebar menus and API permissions automatically.
                </div>
              ) : (
                <div className="space-y-6">
                  {ADMIN_PERMISSION_GROUPS.map((group) => (
                    <div key={group.title} className="space-y-3">
                      <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{group.title}</div>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        {group.items.map((permission) => (
                          <PermissionCheckbox
                            key={permission.key}
                            checked={form.permissions.includes(permission.key)}
                            label={permission.label}
                            onChange={() => handlePermissionToggle(permission.key)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50">
              <div className="mb-6 flex items-center gap-3">
                <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700">
                  <MapPinned size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-900">Service Location Scope</h3>
                  <p className="text-xs font-semibold text-slate-500">Subadmins only see records inside the locations and zones selected here.</p>
                </div>
              </div>

              {form.admin_type === 'superadmin' ? (
                <div className="rounded-3xl border border-blue-100 bg-blue-50 px-5 py-4 text-sm font-bold text-blue-800">
                  Superadmin scope stays global, so no location or zone limits are applied.
                </div>
              ) : (
                <div className="space-y-6">
                  <div>
                    <div className={labelClass}>Assigned Service Locations</div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      {serviceLocations.map((location) => {
                        const value = String(location._id || location.id || '');
                        const checked = form.service_location_ids.includes(value);

                        return (
                          <PermissionCheckbox
                            key={value}
                            checked={checked}
                            label={`${location.service_location_name || location.name} ${location.country ? `• ${location.country}` : ''}`}
                            onChange={() => handleMultiSelect('service_location_ids', value)}
                          />
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <div className={labelClass}>Assigned Zones</div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      {visibleZones.map((zone) => {
                        const value = String(zone._id || zone.id || '');
                        const checked = form.zone_ids.includes(value);
                        return (
                          <PermissionCheckbox
                            key={value}
                            checked={checked}
                            label={zone.name || 'Unnamed Zone'}
                            onChange={() => handleMultiSelect('zone_ids', value)}
                          />
                        );
                      })}
                    </div>
                    {visibleZones.length === 0 && (
                      <p className="text-sm font-semibold text-slate-400">Select service locations first to unlock matching zones.</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3 rounded-[30px] border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => navigate('/admin/management/admins')}
                className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 transition-all hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#1D4ED8] px-6 py-3 text-sm font-black text-white shadow-lg shadow-blue-200 transition-all hover:-translate-y-0.5 hover:bg-[#1E40AF] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : null}
                {isEdit ? 'Update Admin Access' : 'Create Admin Access'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AdminCreate;
