import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CarFront, CheckCircle2, Image as ImageIcon, Loader2, Plus, Save, Trash2, X } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  clearDriverAuthState,
  createServiceCenterVehicle,
  deleteServiceCenterVehicle,
  getCurrentDriver,
  getServiceCenterVehicles,
  updateServiceCenterVehicle,
} from '../services/registrationService';

const unwrap = (response) => response?.data?.data || response?.data || response || {};

const inputClass =
  'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100';
const labelClass = 'mb-2 block text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500';

const buildVehicleForm = () => ({
  name: '',
  short_description: '',
  description: '',
  vehicleCategory: 'Car',
  capacity: '4',
  luggageCapacity: '2',
  image: '',
  coverImage: '',
  galleryImages: [],
  amenities: 'AC, GPS, Charging Port',
  pricing: [
    { id: 'pkg-6h', label: '6 Hours', durationHours: '6', price: '799', includedKm: '60', extraHourPrice: '120', extraKmPrice: '12', active: true },
    { id: 'pkg-12h', label: '12 Hours', durationHours: '12', price: '1299', includedKm: '120', extraHourPrice: '110', extraKmPrice: '11', active: true },
    { id: 'pkg-24h', label: '24 Hours', durationHours: '24', price: '1999', includedKm: '240', extraHourPrice: '95', extraKmPrice: '10', active: true },
  ],
  status: 'active',
});

const normalizeVehicleToForm = (vehicle) => {
  const pricing = Array.isArray(vehicle?.pricing) ? vehicle.pricing : [];

  return {
    name: vehicle?.name || '',
    short_description: vehicle?.short_description || '',
    description: vehicle?.description || '',
    vehicleCategory: vehicle?.vehicleCategory || 'Car',
    capacity: String(vehicle?.capacity ?? 4),
    luggageCapacity: String(vehicle?.luggageCapacity ?? 0),
    image: vehicle?.image || vehicle?.coverImage || '',
    coverImage: vehicle?.coverImage || vehicle?.image || '',
    galleryImages: Array.isArray(vehicle?.galleryImages) ? vehicle.galleryImages.filter(Boolean) : [],
    amenities: Array.isArray(vehicle?.amenities) ? vehicle.amenities.join(', ') : '',
    pricing: pricing.length
      ? pricing.map((item, index) => ({
          id: item?.id || `pkg-${index + 1}`,
          label: String(item?.label || `${item?.durationHours || index + 1} Hours`),
          durationHours: String(item?.durationHours ?? ''),
          price: String(item?.price ?? 0),
          includedKm: String(item?.includedKm ?? 0),
          extraHourPrice: String(item?.extraHourPrice ?? 0),
          extraKmPrice: String(item?.extraKmPrice ?? 0),
          active: item?.active !== false,
        }))
      : buildVehicleForm().pricing,
    status: vehicle?.status === 'inactive' ? 'inactive' : 'active',
  };
};

const ServiceCenterVehicleDetails = () => {
  const navigate = useNavigate();
  const { vehicleId } = useParams();
  const isCreateMode = !vehicleId || vehicleId === 'new';
  const [profile, setProfile] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [formData, setFormData] = useState(buildVehicleForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let active = true;

    const loadVehicleContext = async () => {
      setLoading(true);
      setErrorMessage('');

      try {
        const [profileResponse, vehicleResponse] = await Promise.all([
          getCurrentDriver(),
          getServiceCenterVehicles(),
        ]);

        if (!active) return;

        const nextProfile = unwrap(profileResponse);
        const vehicleResults = unwrap(vehicleResponse)?.results || [];
        const role = String(nextProfile?.onboarding?.role || '').toLowerCase();

        if (role === 'service_center_staff') {
          navigate('/taxi/driver/service-center?tab=vehicles', { replace: true });
          return;
        }

        setProfile(nextProfile);
        setVehicles(vehicleResults);

        if (!isCreateMode) {
          const selectedVehicle = vehicleResults.find((item) => String(item.id || item._id) === String(vehicleId));
          if (!selectedVehicle) {
            setErrorMessage('Rental vehicle not found.');
            setFormData(buildVehicleForm());
            return;
          }

          setFormData(normalizeVehicleToForm(selectedVehicle));
        }
      } catch (error) {
        if (!active) return;
        if (error?.status === 401 || error?.status === 404) {
          clearDriverAuthState();
          navigate('/taxi/driver/login', { replace: true });
          return;
        }
        setErrorMessage(error?.message || 'Unable to load vehicle details.');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadVehicleContext();

    return () => {
      active = false;
    };
  }, [isCreateMode, navigate, vehicleId]);

  const selectedVehicle = useMemo(
    () => vehicles.find((item) => String(item.id || item._id) === String(vehicleId)) || null,
    [vehicleId, vehicles],
  );

  const amenities = useMemo(
    () => formData.amenities.split(',').map((item) => item.trim()).filter(Boolean),
    [formData.amenities],
  );

  const gallery = useMemo(
    () =>
      [
        formData.coverImage || formData.image,
        ...(Array.isArray(formData.galleryImages) ? formData.galleryImages : []),
      ].filter((value, index, array) => value && array.indexOf(value) === index),
    [formData.coverImage, formData.galleryImages, formData.image],
  );

  const updateForm = (field, value) => {
    setFormData((current) => ({ ...current, [field]: value }));
  };

  const updatePricingPackage = (index, field, value) => {
    setFormData((current) => ({
      ...current,
      pricing: current.pricing.map((item, packageIndex) =>
        packageIndex === index ? { ...item, [field]: value } : item,
      ),
    }));
  };

  const addPricingPackage = () => {
    setFormData((current) => ({
      ...current,
      pricing: [
        ...current.pricing,
        {
          id: `pkg-${Date.now()}`,
          label: '',
          durationHours: '',
          price: '',
          includedKm: '0',
          extraHourPrice: '0',
          extraKmPrice: '0',
          active: true,
        },
      ],
    }));
  };

  const removePricingPackage = (index) => {
    setFormData((current) => ({
      ...current,
      pricing: current.pricing.filter((_, packageIndex) => packageIndex !== index),
    }));
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      setErrorMessage('Vehicle name is required');
      return;
    }

    if (!Array.isArray(formData.pricing) || formData.pricing.length === 0) {
      setErrorMessage('Add at least one pricing package');
      return;
    }

    setSaving(true);
    setErrorMessage('');

    try {
      const normalizedPricing = formData.pricing
        .map((item, index) => ({
          id: String(item?.id || `pkg-${Date.now()}-${index}`),
          label: String(item?.label || '').trim(),
          durationHours: Number(item?.durationHours || 0),
          price: Number(item?.price || 0),
          includedKm: Number(item?.includedKm || 0),
          extraHourPrice: Number(item?.extraHourPrice || 0),
          extraKmPrice: Number(item?.extraKmPrice || 0),
          active: item?.active !== false,
        }))
        .filter((item) => item.label && item.durationHours > 0);

      if (!normalizedPricing.length) {
        setErrorMessage('Every pricing package needs a label and valid duration');
        setSaving(false);
        return;
      }

      const payload = {
        transport_type: 'rental',
        name: formData.name.trim(),
        short_description: formData.short_description.trim(),
        description: formData.description.trim(),
        vehicleCategory: formData.vehicleCategory.trim() || 'Car',
        image: (formData.coverImage || formData.image).trim(),
        coverImage: (formData.coverImage || formData.image).trim(),
        galleryImages: Array.isArray(formData.galleryImages) ? formData.galleryImages.filter(Boolean) : [],
        capacity: Number(formData.capacity || 4),
        luggageCapacity: Number(formData.luggageCapacity || 0),
        amenities,
        pricing: normalizedPricing,
        status: formData.status,
      };

      if (isCreateMode) {
        const response = await createServiceCenterVehicle(payload);
        const created = unwrap(response);
        toast.success('Vehicle created');
        navigate(`/taxi/driver/service-center/vehicles/${created?.id || created?._id}`, { replace: true });
        return;
      }

      await updateServiceCenterVehicle(vehicleId, payload);
      toast.success('Vehicle updated');
      navigate('/taxi/driver/service-center?tab=vehicles', { replace: true });
    } catch (error) {
      setErrorMessage(error?.message || (isCreateMode ? 'Unable to create vehicle' : 'Unable to update vehicle'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (isCreateMode) return;
    if (!window.confirm('Delete this rental vehicle?')) return;

    setDeleting(true);
    setErrorMessage('');

    try {
      await deleteServiceCenterVehicle(vehicleId);
      toast.success('Vehicle deleted');
      navigate('/taxi/driver/service-center?tab=vehicles', { replace: true });
    } catch (error) {
      setErrorMessage(error?.message || 'Unable to delete vehicle');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f6f7fb] p-4 pb-28 pt-6" style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Service Center Vehicles</p>
            <h1 className="mt-2 text-2xl font-black text-slate-900">{isCreateMode ? 'Add Rental Vehicle' : formData.name || 'Vehicle Details'}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {isCreateMode
                ? 'Create a new service-center rental listing with full details and pricing.'
                : 'View and edit the complete rental vehicle setup from a separate page.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/taxi/driver/service-center?tab=vehicles')}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <ArrowLeft size={16} />
            Back
          </button>
        </div>

        {errorMessage ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">
            {errorMessage}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-[28px] border border-slate-200 bg-white p-10 text-center text-sm font-semibold text-slate-400 shadow-sm">
            Loading vehicle details...
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
            <div className="space-y-6">
              <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex h-56 items-center justify-center rounded-[24px] bg-slate-50">
                  {gallery[0] ? (
                    <img src={gallery[0]} alt={formData.name || 'Vehicle'} className="max-h-48 w-full object-contain p-4" />
                  ) : (
                    <CarFront size={48} className="text-slate-300" />
                  )}
                </div>

                {gallery.length > 1 ? (
                  <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
                    {gallery.map((image, index) => (
                      <div key={`${image}-${index}`} className="h-20 w-24 shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                        <img src={image} alt={`${formData.name || 'Vehicle'} gallery ${index + 1}`} className="h-full w-full object-cover" />
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="mt-5">
                  <p className="text-xl font-black text-slate-900">{formData.name || 'New rental vehicle'}</p>
                  <p className="mt-1 text-sm text-slate-500">{formData.short_description || 'No short description added yet.'}</p>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-slate-50 px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Seats</p>
                    <p className="mt-1 text-lg font-black text-slate-900">{formData.capacity || 0}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Bags</p>
                    <p className="mt-1 text-lg font-black text-slate-900">{formData.luggageCapacity || 0}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Packages</p>
                    <p className="mt-1 text-lg font-black text-slate-900">{formData.pricing.length}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Status</p>
                    <p className="mt-1 text-sm font-black text-slate-900">{formData.status === 'inactive' ? 'Inactive' : 'Active'}</p>
                  </div>
                </div>

                {amenities.length ? (
                  <div className="mt-5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Amenities</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {amenities.map((amenity) => (
                        <span key={amenity} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                          {amenity}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </section>

              {!isCreateMode ? (
                <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Vehicle Control</p>
                  <div className="mt-4 flex gap-3">
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={deleting}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600 transition hover:bg-rose-100 disabled:opacity-60"
                    >
                      {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                      Delete Vehicle
                    </button>
                  </div>
                </section>
              ) : null}
            </div>

            <div className="space-y-6">
              <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                <div className="rounded-[24px] border border-slate-200 bg-slate-50/70 px-5 py-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-600">Section 1</p>
                  <h2 className="mt-1 text-lg font-black text-slate-900">Vehicle Identity</h2>
                  <p className="mt-1 text-sm font-medium text-slate-500">Define the base profile that riders and the service-center team will recognize.</p>
                </div>

                <div className="mt-6 grid gap-5 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label className={labelClass}>Vehicle Name</label>
                    <input value={formData.name} onChange={(event) => updateForm('name', event.target.value)} className={inputClass} placeholder="Swift Dzire Rental" />
                  </div>
                  <div>
                    <label className={labelClass}>Category</label>
                    <input value={formData.vehicleCategory} onChange={(event) => updateForm('vehicleCategory', event.target.value)} className={inputClass} placeholder="Car" />
                  </div>
                  <div>
                    <label className={labelClass}>Status</label>
                    <select value={formData.status} onChange={(event) => updateForm('status', event.target.value)} className={inputClass}>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className={labelClass}>Short Description</label>
                    <input value={formData.short_description} onChange={(event) => updateForm('short_description', event.target.value)} className={inputClass} placeholder="Comfortable city rental" />
                  </div>
                  <div className="md:col-span-2">
                    <label className={labelClass}>Description</label>
                    <textarea rows={4} value={formData.description} onChange={(event) => updateForm('description', event.target.value)} className={`${inputClass} resize-none`} placeholder="Add details about this rental vehicle" />
                  </div>
                  <div className="md:col-span-2">
                    <label className={labelClass}>Cover Image URL</label>
                    <div className="relative">
                      <ImageIcon size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        value={formData.coverImage || formData.image}
                        onChange={(event) => {
                          updateForm('coverImage', event.target.value);
                          updateForm('image', event.target.value);
                        }}
                        className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm font-medium text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                        placeholder="https://..."
                      />
                    </div>
                  </div>
                  {formData.galleryImages.length ? (
                    <div className="md:col-span-2">
                      <label className={labelClass}>Gallery Images</label>
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {formData.galleryImages.map((image, index) => (
                          <div key={`${image}-${index}`} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                            <img src={image} alt={`Gallery ${index + 1}`} className="h-28 w-full object-cover" />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </section>

              <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                <div className="rounded-[24px] border border-slate-200 bg-slate-50/70 px-5 py-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-600">Section 2</p>
                  <h2 className="mt-1 text-lg font-black text-slate-900">Capacity & Features</h2>
                  <p className="mt-1 text-sm font-medium text-slate-500">Control the vehicle seating, luggage, and amenity display from one place.</p>
                </div>

                <div className="mt-6 grid gap-5 md:grid-cols-2">
                  <div>
                    <label className={labelClass}>Capacity</label>
                    <input type="number" min="1" value={formData.capacity} onChange={(event) => updateForm('capacity', event.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Luggage Capacity</label>
                    <input type="number" min="0" value={formData.luggageCapacity} onChange={(event) => updateForm('luggageCapacity', event.target.value)} className={inputClass} />
                  </div>
                  <div className="md:col-span-2">
                    <label className={labelClass}>Amenities</label>
                    <input value={formData.amenities} onChange={(event) => updateForm('amenities', event.target.value)} className={inputClass} placeholder="AC, GPS, Charging Port" />
                  </div>
                </div>
              </section>

              <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                <div className="rounded-[24px] border border-slate-200 bg-slate-50/70 px-5 py-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-600">Section 3</p>
                  <h2 className="mt-1 text-lg font-black text-slate-900">Pricing Packages</h2>
                  <p className="mt-1 text-sm font-medium text-slate-500">Every package assigned to this vehicle is shown here, including newly added ones.</p>
                </div>

                <div className="mt-6 space-y-4">
                  {formData.pricing.map((pkg, index) => (
                    <div key={pkg.id || index} className="rounded-[24px] border border-slate-200 bg-slate-50/60 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600">Package {index + 1}</p>
                          <p className="mt-1 text-sm font-semibold text-slate-500">Edit the visible package label, duration, and charges.</p>
                        </div>
                        {formData.pricing.length > 1 ? (
                          <button
                            type="button"
                            onClick={() => removePricingPackage(index)}
                            className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-600 transition hover:bg-rose-50"
                          >
                            <X size={14} />
                            Remove
                          </button>
                        ) : null}
                      </div>

                      <div className="mt-4 grid gap-4 md:grid-cols-3">
                        <div>
                          <label className={labelClass}>Label</label>
                          <input value={pkg.label} onChange={(event) => updatePricingPackage(index, 'label', event.target.value)} className={inputClass} placeholder="6 Hours" />
                        </div>
                        <div>
                          <label className={labelClass}>Duration Hours</label>
                          <input type="number" min="1" value={pkg.durationHours} onChange={(event) => updatePricingPackage(index, 'durationHours', event.target.value)} className={inputClass} />
                        </div>
                        <div>
                          <label className={labelClass}>Price</label>
                          <input type="number" min="0" value={pkg.price} onChange={(event) => updatePricingPackage(index, 'price', event.target.value)} className={inputClass} />
                        </div>
                        <div>
                          <label className={labelClass}>Included KM</label>
                          <input type="number" min="0" value={pkg.includedKm} onChange={(event) => updatePricingPackage(index, 'includedKm', event.target.value)} className={inputClass} />
                        </div>
                        <div>
                          <label className={labelClass}>Extra Hour Price</label>
                          <input type="number" min="0" value={pkg.extraHourPrice} onChange={(event) => updatePricingPackage(index, 'extraHourPrice', event.target.value)} className={inputClass} />
                        </div>
                        <div>
                          <label className={labelClass}>Extra KM Price</label>
                          <input type="number" min="0" value={pkg.extraKmPrice} onChange={(event) => updatePricingPackage(index, 'extraKmPrice', event.target.value)} className={inputClass} />
                        </div>
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={addPricingPackage}
                    className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
                  >
                    <Plus size={16} />
                    Add Package
                  </button>
                </div>
              </section>

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => navigate('/taxi/driver/service-center?tab=vehicles')}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleSave}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : isCreateMode ? <CheckCircle2 size={16} /> : <Save size={16} />}
                  {isCreateMode ? 'Create Vehicle' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ServiceCenterVehicleDetails;
