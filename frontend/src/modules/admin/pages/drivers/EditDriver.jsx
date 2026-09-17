import React, { useState, useEffect } from 'react';
import { 
  ChevronRight, 
  ArrowLeft, 
  Save, 
  User, 
  MapPin, 
  Phone, 
  Mail, 
  Users, 
  Car,
  CheckCircle2,
  AlertCircle,
  Globe,
  Loader2
} from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { adminService } from '../../services/adminService';
import { useTaxiTransportTypes } from '../../../../shared/hooks/useTaxiTransportTypes';

const serviceCategoryOptions = [
  { value: 'taxi', label: 'Taxi' },
  { value: 'outstation', label: 'Outstation' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'pooling', label: 'Pooling' },
];

const normalizeTransportTypeForSelect = (value, options = []) => {
  const normalizedValue = String(value || '').trim().toLowerCase();
  if (!normalizedValue) return '';

  const availableNames = options.map((item) => String(item.name || '').trim().toLowerCase());
  if (availableNames.includes(normalizedValue)) {
    return normalizedValue;
  }

  if (normalizedValue === 'both' && availableNames.includes('all')) {
    return 'all';
  }

  if (normalizedValue === 'all' && availableNames.includes('both')) {
    return 'both';
  }

  return normalizedValue;
};

const normalizeServiceCategories = (value, fallback = 'taxi') => {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];

  const normalized = [...new Set(
    rawValues
      .map((item) => String(item || '').trim().toLowerCase())
      .flatMap((item) => item === 'both' ? ['taxi', 'outstation'] : item ? [item] : [])
      .filter((item) => serviceCategoryOptions.some((option) => option.value === item)),
  )];

  if (normalized.length > 0) {
    return normalized;
  }

  const fallbackValue = String(fallback || 'taxi').trim().toLowerCase();
  if (fallbackValue === 'both') {
    return ['taxi', 'outstation'];
  }

  return serviceCategoryOptions.some((option) => option.value === fallbackValue) ? [fallbackValue] : ['taxi'];
};

const getVehicleTypeId = (item = {}) => String(item?._id || item?.id || '');
const getVehicleTypeLabel = (item = {}) => item?.vehicle_type || item?.name || item?.type || 'Vehicle';

const EditDriver = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const backRoute = location.state?.from || '/admin/drivers';
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [locations, setLocations] = useState([]);
  const [zones, setZones] = useState([]);
  const [countries, setCountries] = useState([]);
  const { transportTypes } = useTaxiTransportTypes();
  const [vehicleTypes, setVehicleTypes] = useState([]);
  const [vehicleTypeFallbackOption, setVehicleTypeFallbackOption] = useState(null);
  const [success, setSuccess] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);

  const [formData, setFormData] = useState({
    area: '',
    zoneId: '',
    country: '',
    name: '',
    mobile: '',
    gender: 'Male',
    email: '',
    password: '',
    confirmPassword: '',
    transportType: 'taxi',
    serviceCategories: ['taxi'],
    vehicleType: '',
    vehicleMake: '',
    vehicleModel: '',
    vehicleYear: '',
    vehicleColor: '',
    vehicleNumber: ''
  });

  const [error, setError] = useState('');

  const providedToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5YzdiZTZhYmJlOTJlYjYwMGYwMmQxNiIsImVtYWlsIjoiYWRtaW5AYWRtaW4uY29tIiwibW9iaWxlIjoiOTk5OTk5OTk5OSIsInJvbGUiOiJzdXBlci1hZG1pbiIsImlhdCI6MTc3NTA0OTExNywiZXhwIjoxODA2NTg1MTE3fQ.5KJmXJwaVefWhnc97EqtArkA1z7ZOhsJwA9fbyRVPdQ';
  const storedToken = localStorage.getItem('adminToken');
  const token = (storedToken && storedToken !== 'undefined' && storedToken !== 'null') ? storedToken : providedToken;

  useEffect(() => {
    const fetchInitialData = async () => {
      setIsFetching(true);
      try {
        const locRes = await fetch(globalThis.__LEGACY_BACKEND_ORIGIN__ + '/api/v1/admin/service-locations', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const locData = await locRes.json();
        if (locData.success || locData.data) {
          const results = locData.data?.results || locData.data || locData.results || [];
          setLocations(Array.isArray(results) ? results : []);
        }

        const zoneRes = await fetch(globalThis.__LEGACY_BACKEND_ORIGIN__ + '/api/v1/admin/zones', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const zoneData = await zoneRes.json();
        if (zoneData.success || zoneData.data) {
          const results = zoneData.data?.results || zoneData.data || zoneData.results || [];
          setZones(Array.isArray(results) ? results : []);
        }

        const countRes = await fetch(globalThis.__LEGACY_BACKEND_ORIGIN__ + '/api/v1/countries', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const countData = await countRes.json();
        if (countData.success || countData.data) {
          const results = countData.data?.results || countData.data || countData.results || [];
          setCountries(Array.isArray(results) ? results : []);
        }

        // Fetching driver details
        const response = await fetch(`${globalThis.__LEGACY_BACKEND_ORIGIN__}/api/v1/admin/drivers/${id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (response.ok && data.success) {
          const d = data.data;
          const onboarding = d.onboarding || {};
          const onboardingPersonal = onboarding.personal || {};
          const onboardingVehicle = onboarding.vehicle || {};
          const savedVehicleTypeId = d.vehicle_type_id || d.vehicleTypeId || onboardingVehicle.vehicleTypeId || '';
          const savedVehicleTypeLabel = d.car_type || d.vehicle_type || d.vehicleType || onboardingVehicle.vehicleType || '';

          setVehicleTypeFallbackOption(
            savedVehicleTypeId || savedVehicleTypeLabel
              ? {
                  value: String(savedVehicleTypeId || savedVehicleTypeLabel),
                  label: String(savedVehicleTypeLabel || savedVehicleTypeId),
                }
              : null,
          );

          setFormData({
            area: d.service_location_id?._id || d.service_location_id || d.service_location?._id || d.service_location || onboardingVehicle.locationId || '',
            zoneId: d.zoneId?._id || d.zoneId || d.zone?._id || d.zone || '',
            country: d.country?._id || d.country || d.service_location?.country?._id || d.service_location?.country || '',
            name: d.name || d.user_id?.name || onboardingPersonal.fullName || '',
            mobile: d.phone || d.mobile || d.user_id?.mobile || '',
            gender: d.gender ? d.gender.charAt(0).toUpperCase() + d.gender.slice(1) : 'Male',
            email: d.email || d.user_id?.email || onboardingPersonal.email || '',
            password: '',
            confirmPassword: '',
            transportType: d.transport_type || d.register_for || d.registerFor || onboardingVehicle.registerFor || 'taxi',
            serviceCategories: normalizeServiceCategories(
              d.service_categories ||
              d.serviceCategories ||
              d.onboarding?.serviceCategories ||
              onboardingVehicle.serviceCategories,
              d.transport_type || d.register_for || d.registerFor || onboardingVehicle.registerFor || 'taxi',
            ),
            vehicleType: savedVehicleTypeId || savedVehicleTypeLabel || '',
            vehicleMake: d.car_make || d.vehicle_make || d.vehicleMake || onboardingVehicle.make || '',
            vehicleModel: d.car_model || d.vehicle_model || d.vehicleModel || onboardingVehicle.model || '',
            vehicleYear: d.car_year || d.vehicle_year || d.vehicleYear || onboardingVehicle.year || '',
            vehicleColor: d.car_color || d.vehicle_color || d.vehicleColor || onboardingVehicle.color || '',
            vehicleNumber: d.car_number || d.vehicle_number || d.vehicleNumber || onboardingVehicle.number || '',
            companyName: onboardingVehicle.companyName || '',
            companyAddress: onboardingVehicle.companyAddress || '',
            city: onboardingVehicle.city || '',
            postalCode: onboardingVehicle.postalCode || '',
            taxNumber: onboardingVehicle.taxNumber || '',
          });
        }
      } catch (err) {
        console.error('Fetch error:', err);
      } finally {
        setIsFetching(false);
      }
    };
    fetchInitialData();
  }, [id]);

  useEffect(() => {
    if (!transportTypes.length) return;

    setFormData((prev) => {
      const normalized = normalizeTransportTypeForSelect(prev.transportType, transportTypes);
      return normalized === prev.transportType ? prev : { ...prev, transportType: normalized };
    });
  }, [transportTypes]);

  useEffect(() => {
    const fetchVehiclesForArea = async () => {
      if (!formData.transportType) return;
      try {
        const typeFilter = formData.transportType.toLowerCase() === 'delivery' ? 'delivery' : 'taxi';
        const res = await adminService.getVehicleTypes(typeFilter);
        if (res?.data) {
          setVehicleTypes(Array.isArray(res.data) ? res.data : (res.data?.results || []));
        }
      } catch (e) {
        console.error("Vehicle types error:", e);
      }
    };
    fetchVehiclesForArea();
  }, [formData.transportType]);

  useEffect(() => {
    if (!vehicleTypes.length || !formData.vehicleType) return;

    const rawValue = String(formData.vehicleType);
    const alreadyMatchesId = vehicleTypes.some((item) => String(item._id) === rawValue);
    if (alreadyMatchesId) return;

    const matchedVehicleType = vehicleTypes.find((item) => {
      const labels = [
        item.vehicle_type,
        item.name,
        item.slug,
        item.type,
      ]
        .filter(Boolean)
        .map((value) => String(value).trim().toLowerCase());

      return labels.includes(rawValue.trim().toLowerCase());
    });

    if (matchedVehicleType?._id) {
      setFormData((prev) => ({ ...prev, vehicleType: String(matchedVehicleType._id) }));
    }
  }, [vehicleTypes, formData.vehicleType]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    
    if (name === 'area') {
      const selectedLoc = locations.find(l => l._id === value);
      if (selectedLoc) {
        setFormData(prev => ({ 
          ...prev, 
          [name]: value,
          zoneId: '',
          country: selectedLoc.country?._id || selectedLoc.country || prev.country
        }));
        return;
      }
    }

    if (name === 'zoneId') {
      const selectedZone = zones.find((zone) => String(zone._id || zone.id) === String(value));
      if (selectedZone) {
        setFormData((prev) => ({
          ...prev,
          zoneId: value,
          area: selectedZone.service_location_id?._id || selectedZone.service_location_id || prev.area,
        }));
        return;
      }
    }
    
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const toggleServiceCategory = (value) => {
    setFormData((prev) => {
      const exists = prev.serviceCategories.includes(value);
      const nextServiceCategories = exists
        ? prev.serviceCategories.filter((item) => item !== value)
        : [...prev.serviceCategories, value];

      return {
        ...prev,
        serviceCategories: nextServiceCategories,
      };
    });
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    
    try {
      const selectedVehicleType = vehicleTypes.find((item) => String(getVehicleTypeId(item)) === String(formData.vehicleType));
      const selectedVehicleTypeLabel = selectedVehicleType
        ? getVehicleTypeLabel(selectedVehicleType)
        : vehicleTypeFallbackOption?.label || formData.vehicleType;
      const payload = {
        name: formData.name,
        email: formData.email,
        mobile: formData.mobile,
        gender: formData.gender.toLowerCase(),
        transport_type: formData.transportType.toLowerCase(),
        register_for: formData.transportType.toLowerCase(),
        registerFor: formData.transportType.toLowerCase(),
        service_categories: formData.serviceCategories,
        serviceCategories: formData.serviceCategories,
        car_make: formData.vehicleMake,
        car_model: formData.vehicleModel,
        car_year: formData.vehicleYear,
        car_color: formData.vehicleColor,
        car_number: formData.vehicleNumber,
        car_type: formData.vehicleType,
        vehicle_type_id: formData.vehicleType,
        vehicle_type: selectedVehicleTypeLabel,
        zone_id: formData.zoneId || null,
        service_location_id: formData.area,
        country: formData.country,
        onboarding: {
          vehicle: {
            registerFor: formData.transportType.toLowerCase(),
            serviceCategories: formData.serviceCategories,
            locationId: formData.area,
            vehicleTypeId: formData.vehicleType,
            vehicleType: selectedVehicleTypeLabel,
            make: formData.vehicleMake,
            model: formData.vehicleModel,
            year: formData.vehicleYear,
            number: formData.vehicleNumber,
            color: formData.vehicleColor,
            companyName: formData.companyName,
            companyAddress: formData.companyAddress,
            city: formData.city,
            postalCode: formData.postalCode,
            taxNumber: formData.taxNumber,
          },
        },
      };

      const response = await fetch(`${globalThis.__LEGACY_BACKEND_ORIGIN__}/api/v1/admin/drivers/${id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (response.ok && data.success) {
        setSuccess(true);
        setTimeout(() => navigate(backRoute), 2000);
      } else {
        setError(data.message || 'Failed to update driver.');
      }
    } catch (err) {
      setError('Network error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  // --- Shared input class ---
  const inputClass = "w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-800 bg-white focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 outline-none transition-colors";
  const labelClass = "block text-xs font-semibold text-gray-500 mb-1.5";
  const visibleZones = zones.filter((zone) => {
    if (!formData.area) return true;
    const zoneServiceLocationId = zone?.service_location_id?._id || zone?.service_location_id || '';
    return String(zoneServiceLocationId) === String(formData.area);
  });

  if (isFetching) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
          <p className="text-sm text-gray-500">Loading driver details...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-4 lg:p-6 font-sans">
      {/* Breadcrumb & Header */}
      <div className="mb-6">
        <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-2">
          <span>Drivers</span>
          <ChevronRight size={12} />
          <span>{backRoute.includes('/pending') ? 'Pending' : 'Approved'}</span>
          <ChevronRight size={12} />
          <span className="text-gray-700">Edit Driver</span>
        </div>
        <div className="flex items-center justify-between">
          <h1 className="text-xl text-gray-900 font-bold">Edit Driver</h1>
          <button 
            onClick={() => navigate(backRoute)}
            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft size={16} />
            Back
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* LEFT: Form Fields */}
        <div className="xl:col-span-2 space-y-6">

          {/* Identity Section */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
              <div className="w-9 h-9 rounded-lg bg-yellow-50 flex items-center justify-center text-yellow-600">
                <User size={18} />
              </div>
              <div>
                <h3 className="text-sm text-gray-900 font-bold">Identity Details</h3>
                <p className="text-xs text-gray-400">Personal & contact information</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className={labelClass}>
                  <MapPin size={12} className="inline mr-1 text-gray-400" />
                  Assigned Zone
                </label>
                <select
                  name="zoneId"
                  value={formData.zoneId}
                  onChange={handleChange}
                  className={inputClass}
                >
                  <option value="">Select Zone</option>
                  {visibleZones.map((zone) => (
                    <option key={zone._id || zone.id} value={zone._id || zone.id}>
                      {zone.name || zone.zone_name || 'Unnamed Zone'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelClass}>
                  <Globe size={12} className="inline mr-1 text-gray-400" />
                  Country *
                </label>
                <select 
                  name="country"
                  required
                  value={formData.country}
                  onChange={handleChange}
                  className={inputClass}
                >
                  <option value="">Select Country</option>
                  {countries.map(c => (
                    <option key={c._id} value={c._id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelClass}>
                  <User size={12} className="inline mr-1 text-gray-400" />
                  Name *
                </label>
                <input 
                  type="text" 
                  name="name"
                  required
                  placeholder="Driver name"
                  value={formData.name}
                  onChange={handleChange}
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>
                  <Phone size={12} className="inline mr-1 text-gray-400" />
                  Mobile *
                </label>
                <input 
                  type="tel" 
                  name="mobile"
                  required
                  placeholder="Mobile number"
                  value={formData.mobile}
                  onChange={handleChange}
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>
                  <Users size={12} className="inline mr-1 text-gray-400" />
                  Gender *
                </label>
                <select 
                  name="gender"
                  required
                  value={formData.gender}
                  onChange={handleChange}
                  className={inputClass}
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className={labelClass}>
                  <Mail size={12} className="inline mr-1 text-gray-400" />
                  Email *
                </label>
                <input 
                  type="email" 
                  name="email"
                  required
                  placeholder="Email address"
                  value={formData.email}
                  onChange={handleChange}
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          {/* Vehicle Section */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
              <div className="w-9 h-9 rounded-lg bg-yellow-50 flex items-center justify-center text-yellow-600">
                <Car size={18} />
              </div>
              <div>
                <h3 className="text-sm text-gray-900 font-bold">Vehicle Information</h3>
                <p className="text-xs text-gray-400">Assigned vehicle specifications</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className={labelClass}>Transport Type *</label>
                <select 
                  name="transportType"
                  required
                  value={formData.transportType}
                  onChange={handleChange}
                  className={inputClass}
                >
                  <option value="">Select Transport Type</option>
                  {transportTypes.map(t => (
                    <option key={t.id || t._id} value={t.name}>{t.display_name}</option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className={labelClass}>Service Categories</label>
                <div className="flex flex-wrap gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                  {serviceCategoryOptions.map((option) => {
                    const selected = formData.serviceCategories.includes(option.value);
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => toggleServiceCategory(option.value)}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                          selected
                            ? 'bg-yellow-400 text-black'
                            : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-100'
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Matches the service selection used during driver onboarding.
                </p>
              </div>

              <div>
                <label className={labelClass}>Vehicle Type *</label>
                <select 
                  name="vehicleType"
                  required
                  value={formData.vehicleType}
                  onChange={handleChange}
                  className={inputClass}
                >
                  <option value="">Select Vehicle Type</option>
                  {vehicleTypeFallbackOption &&
                  !vehicleTypes.some((vt) => String(getVehicleTypeId(vt)) === String(vehicleTypeFallbackOption.value)) ? (
                    <option value={vehicleTypeFallbackOption.value}>{vehicleTypeFallbackOption.label}</option>
                  ) : null}
                  {vehicleTypes.map(vt => (
                    <option key={getVehicleTypeId(vt)} value={getVehicleTypeId(vt)}>{getVehicleTypeLabel(vt)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelClass}>Vehicle Make *</label>
                <input 
                  type="text" 
                  name="vehicleMake"
                  required
                  placeholder="e.g. Maruti Suzuki"
                  value={formData.vehicleMake}
                  onChange={handleChange}
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Vehicle Model *</label>
                <input 
                  type="text" 
                  name="vehicleModel"
                  required
                  placeholder="e.g. Swift Dzire"
                  value={formData.vehicleModel}
                  onChange={handleChange}
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Vehicle Year *</label>
                <input 
                  type="text" 
                  name="vehicleYear"
                  required
                  maxLength={4}
                  placeholder="e.g. 2024"
                  value={formData.vehicleYear}
                  onChange={(event) => handleChange({
                    target: {
                      name: 'vehicleYear',
                      value: event.target.value.replace(/\D/g, '').slice(0, 4),
                    },
                  })}
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Vehicle Color *</label>
                <input 
                  type="text" 
                  name="vehicleColor"
                  required
                  placeholder="e.g. White"
                  value={formData.vehicleColor}
                  onChange={handleChange}
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Vehicle Number *</label>
                <input 
                  type="text" 
                  name="vehicleNumber"
                  required
                  placeholder="e.g. MH 12 AB 1234"
                  value={formData.vehicleNumber}
                  onChange={handleChange}
                  className={inputClass}
                />
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: Sidebar */}
        <div className="space-y-6">
          {/* Photo Upload */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-sm text-gray-900 mb-4 font-bold">Profile Photo</h3>
            <div className="relative group cursor-pointer">
              <div className="w-full aspect-square rounded-xl bg-gray-50 border-2 border-dashed border-gray-200 flex flex-col items-center justify-center overflow-hidden transition-colors group-hover:border-yellow-400 group-hover:bg-yellow-50/30">
                {imagePreview ? (
                  <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center text-gray-400 gap-2">
                    <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 font-semibold text-lg">
                      {formData.name ? formData.name.charAt(0).toUpperCase() : 'D'}
                    </div>
                    <p className="text-xs text-gray-400">Click to upload photo</p>
                  </div>
                )}
              </div>
              <input 
                type="file" 
                accept="image/*"
                onChange={handleImageChange}
                className="absolute inset-0 opacity-0 cursor-pointer" 
              />
            </div>
            <p className="text-[10px] text-gray-400 text-center mt-3">Allowed updates twice every 30 days.</p>
          </div>

          {/* Actions */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
            <button 
              type="submit"
              disabled={isLoading || success}
              className="w-full py-3 bg-yellow-400 text-black rounded-lg text-sm font-bold shadow-sm hover:bg-yellow-500 active:bg-yellow-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {isLoading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : success ? (
                <CheckCircle2 size={16} />
              ) : (
                <Save size={16} />
              )}
              {success ? 'Saved Successfully' : isLoading ? 'Saving...' : 'Save Changes'}
            </button>

            <button 
              type="button"
              onClick={() => navigate('/admin/drivers')}
              className="w-full py-3 bg-gray-50 text-gray-600 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>

            <div className="pt-3 border-t border-gray-100">
              <button 
                type="button"
                className="w-full py-2.5 text-red-500 bg-red-50 border border-red-100 rounded-lg text-xs font-medium hover:bg-red-100 transition-colors flex items-center justify-center gap-1.5"
              >
                <AlertCircle size={13} />
                Disable Account
              </button>
            </div>
          </div>

          {/* Metadata */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs font-semibold text-gray-500 mb-3">Metadata</p>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-400">Driver ID</span>
                <span className="text-gray-700 font-medium">DRV-{id?.substring(0, 8).toUpperCase() || 'NEW'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Status</span>
                <span className="text-emerald-600 font-medium">Active</span>
              </div>
            </div>
          </div>

          {/* Status Messages */}
          {success && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
              <p className="text-xs text-emerald-700 text-center font-medium">Driver profile updated successfully.</p>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-xs text-red-600 text-center font-medium">{error}</p>
            </div>
          )}
        </div>
      </form>
    </div>
  );
};

export default EditDriver;

