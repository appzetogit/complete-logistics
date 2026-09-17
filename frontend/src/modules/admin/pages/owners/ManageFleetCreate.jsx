import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, Save } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTaxiTransportTypes } from '../../../../shared/hooks/useTaxiTransportTypes';
import AdminPageHeader from '../../components/ui/AdminPageHeader';

const BASE = `${globalThis.__LEGACY_BACKEND_ORIGIN__}/api/v1/admin`;

const inputClass = 'h-10 w-full rounded border border-gray-300 bg-white px-3 text-sm text-gray-950 outline-none transition-colors focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400';
const labelClass = 'mb-1.5 block text-xs font-bold text-gray-950';

const getOwnerLabel = (owner) => owner?.company_name || owner?.name || owner?.email || owner?.mobile || owner?._id || 'Owner';

const getVehicleTypeLabel = (vt) => vt?.name || vt?.type_name || vt?.title || vt?._id || vt?.id || 'Type';

const ManageFleetCreate = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem('adminToken') || '';
  const authHeaders = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : {}), [token]);
  const { transportTypes } = useTaxiTransportTypes();

  const [isBootLoading, setIsBootLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [owners, setOwners] = useState([]);
  const [serviceLocations, setServiceLocations] = useState([]);
  const [vehicleTypes, setVehicleTypes] = useState([]);

  const [formData, setFormData] = useState({
    owner_id: '',
    vehicle_type_id: '',
    car_brand: '',
    car_model: '',
    license_plate_number: '',
    car_color: '',

    // Backend-required fields (kept off-UI to match your screenshot).
    service_location_id: '',
    transport_type: '',
  });

  useEffect(() => {
    const boot = async () => {
      setIsBootLoading(true);
      try {
        const [ownersRes, locationsRes] = await Promise.all([
          fetch(`${BASE}/owner-management/manage-owners`, { headers: authHeaders }),
          fetch(`${BASE}/service-locations`, { headers: authHeaders }),
        ]);

        const oJson = await ownersRes.json();
        const lJson = await locationsRes.json();

        const oList = oJson?.data?.results || oJson?.data || [];
        const locs = Array.isArray(lJson?.data) ? lJson.data : lJson?.data?.results || [];

        const safeOwners = Array.isArray(oList) ? oList : [];
        const safeLocs = Array.isArray(locs) ? locs : [];

        setOwners(safeOwners);
        setServiceLocations(safeLocs);

        setFormData((prev) => ({
          ...prev,
          owner_id: prev.owner_id || safeOwners?.[0]?._id || '',
          service_location_id: prev.service_location_id || safeLocs?.[0]?._id || '',
        }));
      } catch (e) {
        console.error('Failed to load create fleet dependencies:', e);
      } finally {
        setIsBootLoading(false);
      }
    };

    boot();
  }, [authHeaders]);

  useEffect(() => {
    const fetchTypes = async () => {
      try {
        const typeFilter = (formData.transport_type || 'taxi').toLowerCase();
        const res = await fetch(`${BASE}/types/vehicle-types/list?transport_type=${encodeURIComponent(typeFilter)}`, {
          headers: authHeaders,
        });
        const json = await res.json();
        if (json?.success) {
          const list = Array.isArray(json.data) ? json.data : json?.data?.results || [];
          const safe = Array.isArray(list) ? list : [];
          setVehicleTypes(safe);
          setFormData((prev) => ({ ...prev, vehicle_type_id: prev.vehicle_type_id || safe?.[0]?._id || safe?.[0]?.id || '' }));
        }
      } catch (e) {
        console.error('Failed to fetch vehicle types:', e);
      }
    };

    fetchTypes();
  }, [formData.transport_type, authHeaders]);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (
      !formData.owner_id ||
      !formData.vehicle_type_id ||
      !formData.car_brand ||
      !formData.car_model ||
      !formData.license_plate_number ||
      !formData.car_color
    ) {
      alert('Please fill all required fields');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${BASE}/owner-management/manage-fleet`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner_id: formData.owner_id,
          service_location_id: formData.service_location_id,
          transport_type: formData.transport_type,
          vehicle_type_id: formData.vehicle_type_id,
          car_brand: formData.car_brand,
          car_model: formData.car_model,
          license_plate_number: formData.license_plate_number,
          car_color: formData.car_color,
        }),
      });

      const json = await res.json();
      if (json?.success) {
        navigate('/admin/fleet/manage');
        return;
      }
      alert(json?.message || 'Operation failed');
    } catch (e) {
      console.error('Failed to create fleet:', e);
      alert('Network error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-950">
      <div className="px-5 pt-3">
        <AdminPageHeader module="Fleet Management" page="Manage Fleet" title="Create Fleet" backTo="/admin/fleet/manage" />
      </div>

      <div className="flex justify-center px-5 pb-10 pt-4">
        <div className="w-full max-w-3xl bg-white rounded-xl border border-gray-200 shadow-sm p-6 lg:p-8">
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
              <div>
                <label className={labelClass}>
                  Transport Type <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={formData.transport_type}
                    onChange={(e) => setFormData((prev) => ({ ...prev, transport_type: e.target.value }))}
                    className={`${inputClass} appearance-none pr-10`}
                    required
                  >
                    <option value="">Select Transport Type</option>
                    {transportTypes.map((t) => (
                      <option key={t.id || t._id} value={t.name}>
                        {t.display_name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={18} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                </div>
              </div>

              <div>
                <label className={labelClass}>
                  Owner <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={formData.owner_id}
                    onChange={(e) => setFormData((prev) => ({ ...prev, owner_id: e.target.value }))}
                    className={`${inputClass} appearance-none pr-10`}
                    disabled={isBootLoading}
                  >
                    <option value="">{isBootLoading ? 'Loading owners...' : 'Select an owner'}</option>
                    {owners.map((o) => (
                      <option key={o._id} value={o._id}>
                        {getOwnerLabel(o)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={18} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                </div>
              </div>

              <div>
                <label className={labelClass}>
                  Select Type <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={formData.vehicle_type_id}
                    onChange={(e) => setFormData((prev) => ({ ...prev, vehicle_type_id: e.target.value }))}
                    className={`${inputClass} appearance-none pr-10`}
                    disabled={isBootLoading || !formData.service_location_id}
                  >
                    <option value="">
                      {isBootLoading ? 'Loading types...' : vehicleTypes.length ? 'Select' : 'No types found'}
                    </option>
                    {vehicleTypes.map((vt) => {
                      const id = vt?._id || vt?.id;
                      return (
                        <option key={id} value={id}>
                          {getVehicleTypeLabel(vt)}
                        </option>
                      );
                    })}
                  </select>
                  <ChevronDown size={18} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                </div>
              </div>

              <div>
                <label className={labelClass}>
                  Car Brand <span className="text-rose-500">*</span>
                </label>
                <input
                  value={formData.car_brand}
                  onChange={(e) => setFormData((prev) => ({ ...prev, car_brand: e.target.value }))}
                  className={inputClass}
                  placeholder="Enter Car Make"
                />
              </div>

              <div>
                <label className={labelClass}>
                  Car Model <span className="text-rose-500">*</span>
                </label>
                <input
                  value={formData.car_model}
                  onChange={(e) => setFormData((prev) => ({ ...prev, car_model: e.target.value }))}
                  className={inputClass}
                  placeholder="Enter Car Model"
                />
              </div>

              <div>
                <label className={labelClass}>
                  License Plate Number <span className="text-rose-500">*</span>
                </label>
                <input
                  value={formData.license_plate_number}
                  onChange={(e) => setFormData((prev) => ({ ...prev, license_plate_number: e.target.value }))}
                  className={inputClass}
                  placeholder="Enter License Plate Number"
                />
              </div>

              <div>
                <label className={labelClass}>
                  Car Color <span className="text-rose-500">*</span>
                </label>
                <input
                  value={formData.car_color}
                  onChange={(e) => setFormData((prev) => ({ ...prev, car_color: e.target.value }))}
                  className={inputClass}
                  placeholder="Enter Car Color"
                />
              </div>
            <div className="col-span-1 md:col-span-2 pt-6 flex items-center justify-end gap-3 border-t border-gray-100 mt-2">
              <button
                type="button"
                onClick={() => navigate('/admin/fleet/manage')}
                className="h-10 px-6 rounded-lg text-sm font-bold text-gray-600 hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || isBootLoading}
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
  );
};

export default ManageFleetCreate;
