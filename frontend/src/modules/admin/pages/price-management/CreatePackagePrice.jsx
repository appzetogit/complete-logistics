import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronRight, Loader2, Plus, Trash2, MapPin, X, Car } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { adminService } from '../../services/adminService';
import { Autocomplete } from '@react-google-maps/api';
import { useAppGoogleMapsLoader, HAS_VALID_GOOGLE_MAPS_KEY } from '../../utils/googleMaps';

const inputClass = 'w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-xs text-slate-800 outline-none transition-all shadow-sm hover:border-amber-300 focus:border-amber-400 focus:ring-1 focus:ring-amber-400';
const labelClass = 'mb-0.5 block text-xs font-semibold text-slate-800';
const selectWrapClass = 'relative';

const createVehiclePriceRow = () => ({
  id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  vehicle_type: '',
  base_price: '',
  free_distance: '',
  distance_price: '',
  free_time: '',
  time_price: '',
  admin_commision_type: '1',
  admin_commision: '0',
  admin_commission_type_from_driver: '1',
  admin_commission_from_driver: '0',
  admin_commission_type_for_owner: '1',
  admin_commission_for_owner: '0',
  service_tax: '0',
  cancellation_fee: '',
  active: 1,
});

const initialFormState = {
  service_location_id: '',
  package_type_id: '',
  package_destination: '',
  package_availability: 'available',
  status: 'active',
  active: 1,
  package_vehicle_prices: [createVehiclePriceRow()],
};

const CreatePackagePrice = ({ mode = 'create' }) => {
  const { packageId } = useParams();
  const navigate = useNavigate();
  const isEdit = mode === 'edit';

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [serviceLocations, setServiceLocations] = useState([]);
  const [packageTypes, setPackageTypes] = useState([]);
  const [vehicleTypes, setVehicleTypes] = useState([]);
  const [formData, setFormData] = useState(initialFormState);
  const [autocomplete, setAutocomplete] = useState(null);

  const { isLoaded } = useAppGoogleMapsLoader();

  const vehicleLabelMap = useMemo(
    () =>
      vehicleTypes.reduce((acc, item) => {
        acc[String(item._id || item.id)] = item.name || 'Vehicle';
        return acc;
      }, {}),
    [vehicleTypes]
  );

  useEffect(() => {
    const bootstrap = async () => {
      try {
        setLoading(isEdit);
        const [locationsRes, packagesRes, vehiclesRes] = await Promise.all([
          adminService.getServiceLocations(),
          adminService.getRentalPackageTypes(),
          adminService.getVehicleTypes(),
        ]);

        const locations = locationsRes?.data?.locations || locationsRes?.data?.results || locationsRes?.results || [];
        const packages =
          packagesRes?.data?.rental_packages?.results ||
          packagesRes?.data?.rental_packages ||
          packagesRes?.rental_packages?.results ||
          packagesRes?.rental_packages ||
          packagesRes?.results ||
          [];
        const vehicles = vehiclesRes?.data?.vehicle_types || vehiclesRes?.data?.results || vehiclesRes?.results || [];

        setServiceLocations(Array.isArray(locations) ? locations : []);
        setPackageTypes(Array.isArray(packages) ? packages : []);
        setVehicleTypes(Array.isArray(vehicles) ? vehicles : []);

        if (isEdit && packageId) {
          const response = await adminService.getSetPrices({ scope: 'package' });
          const items = response?.data?.paginator?.data || response?.paginator?.data || response?.data?.results || [];
          const selected = (Array.isArray(items) ? items : []).find((item) => String(item.id || item._id) === String(packageId));

          if (!selected) {
            toast.error('Package pricing not found');
            navigate('/admin/pricing/package-pricing');
            return;
          }

          setFormData({
            service_location_id: selected.service_location?._id || selected.service_location?.id || '',
            package_type_id: selected.package_type?._id || selected.package_type?.id || selected.package_type_id || '',
            package_destination: selected.package_destination || '',
            package_availability: selected.package_availability || 'available',
            status: selected.status || 'active',
            active: Number(selected.active ?? 1),
            package_vehicle_prices: Array.isArray(selected.package_vehicle_prices) && selected.package_vehicle_prices.length
              ? selected.package_vehicle_prices.map((row, index) => ({
                  id: row.id || `row-${index}`,
                  vehicle_type: row.vehicle_type?._id || row.vehicle_type?.id || row.vehicle_type || '',
                  base_price: String(row.base_price ?? ''),
                  free_distance: String(row.free_distance ?? ''),
                  distance_price: String(row.distance_price ?? ''),
                  free_time: String(row.free_time ?? ''),
                  time_price: String(row.time_price ?? ''),
                  admin_commision_type: String(row.admin_commision_type ?? 1),
                  admin_commision: String(row.admin_commision ?? 0),
                  admin_commission_type_from_driver: String(row.admin_commission_type_from_driver ?? 1),
                  admin_commission_from_driver: String(row.admin_commission_from_driver ?? 0),
                  admin_commission_type_for_owner: String(row.admin_commission_type_for_owner ?? 1),
                  admin_commission_for_owner: String(row.admin_commission_for_owner ?? 0),
                  service_tax: String(row.service_tax ?? 0),
                  cancellation_fee: String(row.cancellation_fee ?? ''),
                  active: Number(row.active ?? 1),
                }))
              : [createVehiclePriceRow()],
          });
        }
      } catch (error) {
        toast.error('Failed to load package pricing form');
      } finally {
        setLoading(false);
      }
    };

    bootstrap();
  }, [isEdit, packageId, navigate]);

  const updateTopLevel = (field, value) => {
    setFormData((current) => ({ ...current, [field]: value }));
  };

  const updateRow = (rowId, field, value) => {
    setFormData((current) => ({
      ...current,
      package_vehicle_prices: current.package_vehicle_prices.map((row) =>
        row.id === rowId ? { ...row, [field]: value } : row
      ),
    }));
  };

  const addRow = () => {
    setFormData((current) => ({
      ...current,
      package_vehicle_prices: [...current.package_vehicle_prices, createVehiclePriceRow()],
    }));
  };

  const removeRow = (rowId) => {
    setFormData((current) => ({
      ...current,
      package_vehicle_prices: current.package_vehicle_prices.filter((row) => row.id !== rowId),
    }));
  };

  const handlePlaceChanged = () => {
    if (autocomplete) {
      const place = autocomplete.getPlace();
      if (place && (place.formatted_address || place.name)) {
        updateTopLevel('package_destination', place.formatted_address || place.name);
      }
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!formData.package_type_id) return toast.error('Choose a package type');
    if (!formData.package_destination.trim()) return toast.error('Add a destination');
    if (!formData.package_vehicle_prices.every((row) => row.vehicle_type && row.base_price !== '')) {
      return toast.error('Each vehicle row needs a vehicle and base price');
    }

    const payload = {
      pricing_scope: 'package',
      transport_type: 'rental',
      service_location_id: formData.service_location_id || null,
      package_type_id: formData.package_type_id,
      package_destination: formData.package_destination.trim(),
      package_availability: formData.package_availability,
      status: formData.status,
      active: Number(formData.active ?? 1),
      package_vehicle_prices: formData.package_vehicle_prices.map(({ id, ...row }) => ({
        ...row,
        active: Number(row.active ?? 1),
      })),
    };

    try {
      setSaving(true);
      if (isEdit && packageId) {
        await adminService.updateSetPrice(packageId, payload);
        toast.success('Package pricing updated');
      } else {
        await adminService.createSetPrice(payload);
        toast.success('Package pricing created');
      }
      navigate('/admin/pricing/package-pricing');
    } catch (error) {
      toast.error('Failed to save package pricing');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FD] p-3 lg:p-4 font-sans">
      <div className="flex flex-col gap-3 border-b border-gray-100 pb-2 mb-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1E293B]" style={{ fontFamily: '"Times New Roman", Times, serif' }}>{isEdit ? 'Edit Package Pricing' : 'Create Package Pricing'}</h1>
          <p className="mt-1 text-xs text-slate-500">Use a simple package form and set a different price block for each vehicle.</p>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-medium tracking-tight">
          <span className="hover:text-slate-600 transition-colors cursor-pointer" onClick={() => navigate('/admin/pricing/package-pricing')}>Package Pricing</span>
          <ChevronRight size={10} className="text-slate-300" />
          <span className="text-slate-800 font-bold">{isEdit ? 'Edit' : 'Create'}</span>
        </div>
      </div>

      <div className="relative rounded-[28px] border border-gray-100 bg-white shadow-sm">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[28px] bg-white/80">
            <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-4">
          <div className="mb-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => navigate('/admin/pricing/package-pricing')}
              className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-slate-800"
            >
              <ArrowLeft size={16} />
              Back to Package Pricing
            </button>
            <button type="button" onClick={() => setShowHowItWorks(true)} className="text-[11px] font-bold text-amber-500 underline decoration-dotted underline-offset-4">
              How It Works
            </button>
          </div>

          <div className="grid grid-cols-1 gap-x-4 gap-y-3 border-b border-dashed border-gray-200 pb-4 md:grid-cols-3">
            <div>
              <label className={labelClass}>Package Type <span className="text-rose-500">*</span></label>
              <div className={selectWrapClass}>
                <select
                  value={formData.package_type_id}
                  onChange={(event) => updateTopLevel('package_type_id', event.target.value)}
                  className={`${inputClass} appearance-none`}
                  required
                >
                  <option value="">Select package type</option>
                  {packageTypes.map((item) => (
                    <option key={item._id || item.id} value={item._id || item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" />
              </div>
            </div>

            <div>
              <label className={labelClass}>Destination <span className="text-rose-500">*</span></label>
              {isLoaded && HAS_VALID_GOOGLE_MAPS_KEY ? (
                <Autocomplete
                  onLoad={(a) => setAutocomplete(a)}
                  onPlaceChanged={handlePlaceChanged}
                  options={{
                    componentRestrictions: { country: 'in' },
                    types: ['(cities)'],
                  }}
                >
                  <div className="relative">
                    <input
                      type="text"
                      value={formData.package_destination}
                      onChange={(event) => updateTopLevel('package_destination', event.target.value)}
                      className={`${inputClass} pl-10`}
                      placeholder="Search destination city (India)"
                      required
                    />
                    <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  </div>
                </Autocomplete>
              ) : (
                <input
                  value={formData.package_destination}
                  onChange={(event) => updateTopLevel('package_destination', event.target.value)}
                  className={inputClass}
                  placeholder="Enter destination"
                  required
                />
              )}
            </div>

            <div>
              <label className={labelClass}>Available In</label>
              <div className={selectWrapClass}>
                <select
                  value={formData.service_location_id}
                  onChange={(event) => updateTopLevel('service_location_id', event.target.value)}
                  className={`${inputClass} appearance-none`}
                >
                  <option value="">All service locations</option>
                  {serviceLocations.map((item) => (
                    <option key={item._id || item.id} value={item._id || item.id}>
                      {item.name || item.service_location_name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 md:col-span-3 lg:col-span-1">
              <div>
                <label className={labelClass}>Availability</label>
                <div className={selectWrapClass}>
                  <select
                    value={formData.package_availability}
                    onChange={(event) => updateTopLevel('package_availability', event.target.value)}
                    className={`${inputClass} appearance-none`}
                  >
                    <option value="available">Available</option>
                    <option value="unavailable">Unavailable</option>
                  </select>
                  <ChevronDown size={14} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" />
                </div>
              </div>
              <div>
                <label className={labelClass}>Status</label>
                <div className={selectWrapClass}>
                  <select
                    value={formData.active}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      updateTopLevel('active', next);
                      updateTopLevel('status', next === 1 ? 'active' : 'inactive');
                    }}
                    className={`${inputClass} appearance-none`}
                  >
                    <option value={1}>Active</option>
                    <option value={0}>Inactive</option>
                  </select>
                  <ChevronDown size={14} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">Vehicle-wise Pricing</h2>
                <p className="mt-1 text-sm text-slate-500">Each vehicle can have its own package amount and commission setup.</p>
              </div>
              <button
                type="button"
                onClick={addRow}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-600 transition hover:bg-amber-100"
              >
                <Plus size={14} />
                Add Vehicle Price
              </button>
            </div>

            {formData.package_vehicle_prices.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-gray-300 bg-gray-50/50 p-6 text-center">
                <p className="text-sm font-bold text-slate-500">No vehicle pricing added yet.</p>
                <button
                  type="button"
                  onClick={addRow}
                  className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-2 text-sm font-bold text-slate-900 transition hover:bg-amber-500"
                >
                  <Plus size={16} /> Add Vehicle Price
                </button>
              </div>
            ) : (
              formData.package_vehicle_prices.map((row, index) => (
                <div key={row.id} className="rounded-xl border border-gray-200 bg-[#FCFCFD] p-3 lg:p-4">
                  <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-amber-500">Vehicle Pricing {index + 1}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{vehicleLabelMap[row.vehicle_type] || 'Choose vehicle and fill its package pricing'}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeRow(row.id)}
                      className="inline-flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-100"
                    >
                      <Trash2 size={14} />
                      Remove
                    </button>
                  </div>

                <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-3 lg:grid-cols-4">
                  <div>
                    <label className={labelClass}>Vehicle Type <span className="text-rose-500">*</span></label>
                    <div className={selectWrapClass}>
                      <select
                        value={row.vehicle_type}
                        onChange={(event) => updateRow(row.id, 'vehicle_type', event.target.value)}
                        className={`${inputClass} appearance-none`}
                        required
                      >
                        <option value="">Select vehicle type</option>
                        {vehicleTypes.map((item) => (
                          <option key={item._id || item.id} value={item._id || item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={14} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>Base Price Inclusive of tax <span className="text-rose-500">*</span></label>
                    <input type="number" value={row.base_price} onChange={(event) => updateRow(row.id, 'base_price', event.target.value)} className={inputClass} placeholder="Enter Base Price Inclusive of tax" required />
                  </div>

                  <div>
                    <label className={labelClass}>Free Distance (Kilometers) <span className="text-rose-500">*</span></label>
                    <input type="number" value={row.free_distance} onChange={(event) => updateRow(row.id, 'free_distance', event.target.value)} className={inputClass} placeholder="Enter Free Distance" required />
                  </div>

                  <div>
                    <label className={labelClass}>Distance Price <span className="text-rose-500">*</span></label>
                    <input type="number" value={row.distance_price} onChange={(event) => updateRow(row.id, 'distance_price', event.target.value)} className={inputClass} placeholder="Enter Price Per Distance" required />
                  </div>

                  <div>
                    <label className={labelClass}>Free Time in Minute</label>
                    <input type="number" value={row.free_time} onChange={(event) => updateRow(row.id, 'free_time', event.target.value)} className={inputClass} placeholder="Enter Free minute" />
                  </div>

                  <div>
                    <label className={labelClass}>Time Price in Minute <span className="text-rose-500">*</span></label>
                    <input type="number" value={row.time_price} onChange={(event) => updateRow(row.id, 'time_price', event.target.value)} className={inputClass} placeholder="Enter Time Price" required />
                  </div>

                  <div>
                    <label className={labelClass}>Admin Commission Type From Customer <span className="text-rose-500">*</span></label>
                    <div className={selectWrapClass}>
                      <select value={row.admin_commision_type} onChange={(event) => updateRow(row.id, 'admin_commision_type', event.target.value)} className={`${inputClass} appearance-none`} required>
                        <option value="1">Percentage</option>
                        <option value="2">Fixed</option>
                      </select>
                      <ChevronDown size={14} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>Admin Commission From Customer <span className="text-rose-500">*</span></label>
                    <input type="number" value={row.admin_commision} onChange={(event) => updateRow(row.id, 'admin_commision', event.target.value)} className={inputClass} placeholder="0" required />
                  </div>

                  <div>
                    <label className={labelClass}>Admin Commission Type From Driver <span className="text-rose-500">*</span></label>
                    <div className={selectWrapClass}>
                      <select value={row.admin_commission_type_from_driver} onChange={(event) => updateRow(row.id, 'admin_commission_type_from_driver', event.target.value)} className={`${inputClass} appearance-none`} required>
                        <option value="1">Percentage</option>
                        <option value="2">Fixed</option>
                      </select>
                      <ChevronDown size={14} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>Admin Commission From Driver <span className="text-rose-500">*</span></label>
                    <input type="number" value={row.admin_commission_from_driver} onChange={(event) => updateRow(row.id, 'admin_commission_from_driver', event.target.value)} className={inputClass} placeholder="0" required />
                  </div>

                  <div>
                    <label className={labelClass}>Admin Commission Type From Owner <span className="text-rose-500">*</span></label>
                    <div className={selectWrapClass}>
                      <select value={row.admin_commission_type_for_owner} onChange={(event) => updateRow(row.id, 'admin_commission_type_for_owner', event.target.value)} className={`${inputClass} appearance-none`} required>
                        <option value="1">Percentage</option>
                        <option value="2">Fixed</option>
                      </select>
                      <ChevronDown size={14} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>Admin Commission From Owner <span className="text-rose-500">*</span></label>
                    <input type="number" value={row.admin_commission_for_owner} onChange={(event) => updateRow(row.id, 'admin_commission_for_owner', event.target.value)} className={inputClass} placeholder="0" required />
                  </div>

                  <div>
                    <label className={labelClass}>Service Tax (%) <span className="text-rose-500">*</span></label>
                    <input type="number" value={row.service_tax} onChange={(event) => updateRow(row.id, 'service_tax', event.target.value)} className={inputClass} placeholder="0" required />
                  </div>

                  <div>
                    <label className={labelClass}>Cancellation Fee <span className="text-rose-500">*</span></label>
                    <input type="number" value={row.cancellation_fee} onChange={(event) => updateRow(row.id, 'cancellation_fee', event.target.value)} className={inputClass} placeholder="Cancellation Fee" required />
                  </div>
                </div>
              </div>
            )))}
          </div>

          <div className="mt-8 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-yellow-400 px-8 py-3 text-sm font-bold text-black transition hover:bg-yellow-500 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : null}
              {isEdit ? 'Update Package Pricing' : 'Save Package Pricing'}
            </button>
          </div>
        </form>

        <AnimatePresence>
          {showHowItWorks && (
            <motion.div 
              initial={{ x: '100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '100%', opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="absolute top-10 right-4 h-auto max-h-[85%] w-72 bg-white border border-gray-100 shadow-2xl z-50 p-4 rounded-xl overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-[#1E293B]">How It Works</h3>
                <button onClick={() => setShowHowItWorks(false)} className="p-1.5 text-gray-400 hover:text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-full transition-colors"><X size={14} /></button>
              </div>
              <div className="space-y-3 text-xs text-gray-600">
                <div>
                  <p className="font-bold text-gray-800 mb-0.5 flex items-center gap-1.5"><MapPin size={12} className="text-[#00BFA5]"/> Destination</p>
                  <p className="leading-snug text-gray-500 pl-4.5">Search and select the target city for this package pricing.</p>
                </div>
                <div>
                  <p className="font-bold text-gray-800 mb-0.5 flex items-center gap-1.5"><Car size={12} className="text-[#00BFA5]"/> Vehicle-wise Pricing</p>
                  <p className="leading-snug text-gray-500 pl-4.5">Each vehicle added to this package gets its own base price, distance limits, and commission rules.</p>
                </div>
                <div className="bg-emerald-50 rounded p-2 border border-emerald-100">
                  <p className="text-xs font-bold text-emerald-800 mb-1">PRO TIP</p>
                  <p className="text-[11px] leading-tight text-emerald-600">You can add multiple vehicle pricing blocks within a single package form to save time.</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default CreatePackagePrice;
