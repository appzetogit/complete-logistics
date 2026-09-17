import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Car,
  ChevronRight,
  ChevronDown,
  Trash2,
  Edit2,
  ArrowLeft,
  Upload,
  Info,
  Save,
  Activity,
  X,
  CheckCircle2,
  Package,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../../../shared/api/axiosInstance';
import { useTaxiTransportTypes } from '../../../../shared/hooks/useTaxiTransportTypes';

import CarIcon from '../../../../assets/icons/car.png';
import BikeIcon from '../../../../assets/icons/bike.png';
import AutoIcon from '../../../../assets/icons/auto.png';
import TruckIcon from '../../../../assets/icons/truck.png';
import EhcvIcon from '../../../../assets/icons/ehcv.png';
import HcvIcon from '../../../../assets/icons/hcv.png';
import LcvIcon from '../../../../assets/icons/LCV.png';
import McvIcon from '../../../../assets/icons/mcv.png';
import LuxuryIcon from '../../../../assets/icons/Luxury.png';
import PremiumIcon from '../../../../assets/icons/Premium.png';
import SuvIcon from '../../../../assets/icons/SUV.png';
import ScootyIcon from '../../../../assets/icons/scooty.png';
import HatchbackIcon from '../../../../assets/icons/Hatchback.png';
import BusIcon from '../../../../assets/icons/bus.png';
import MiniBusIcon from '../../../../assets/icons/mini_bus.png';
import MapBackground from '../../../../assets/map_image.png';
import trucksImg from '@/assets/images/delivery/trucks.png';
import bikeImg from '@/assets/images/delivery/bike.png';
import moversImg from '@/assets/images/delivery/movers.png';

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition-all focus:border-yellow-400 focus:ring-2 focus:ring-yellow-100';
const labelClass = 'mb-2 block text-[12px] font-bold text-slate-700';

const iconMap = {
  car: CarIcon,
  bike: BikeIcon,
  auto: AutoIcon,
  truck: TruckIcon,
  ehcb: EhcvIcon,
  HCV: HcvIcon,
  LCV: LcvIcon,
  MCV: McvIcon,
  Luxary: LuxuryIcon,
  premium: PremiumIcon,
  suv: SuvIcon,
  scooty: ScootyIcon,
  car_5_seater: HatchbackIcon,
  car_7_seater: SuvIcon,
  bus: BusIcon,
  mini_bus: MiniBusIcon,
};

const ICON_TYPE_ALIASES = {
  motor_bike: 'bike',
  motorbike: 'bike',
  mini_truck: 'truck',
  'mini truck': 'truck',
  pooling_truck: 'truck',
  'pooling truck': 'truck',
  loader: 'truck',
  hcv: 'HCV',
  lcv: 'LCV',
  mcv: 'MCV',
  luxary: 'Luxary',
  scooty: 'scooty',
  'car 5 seater': 'car_5_seater',
  'car 7 seater': 'car_7_seater',
  bus: 'bus',
  'mini bus': 'mini_bus',
};

const ICON_TYPE_LABELS = {
  car: 'Car',
  bike: 'Bike',
  auto: 'Auto',
  truck: 'Truck',
  ehcb: 'Extra Heavy Commercial Vehicle',
  HCV: 'Heavy Commercial Vehicle',
  LCV: 'Light Commercial Vehicle',
  MCV: 'Medium Commercial Vehicle',
  Luxary: 'Luxury',
  premium: 'Premium',
  suv: 'SUV',
  scooty: 'Scooty',
  car_5_seater: 'Car 5 Seater',
  car_7_seater: 'Car 7 Seater',
  bus: 'Bus',
  mini_bus: 'Mini Bus',
};

const normalizeIconType = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return 'car';
  const lower = raw.toLowerCase();
  if (ICON_TYPE_ALIASES[lower]) return ICON_TYPE_ALIASES[lower];
  const exactKey = Object.keys(iconMap).find((key) => key.toLowerCase() === lower);
  return exactKey || 'car';
};

const OBJECT_ID_PATTERN = /^[a-fA-F0-9]{24}$/;

const normalizeTransportType = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'delivery') return 'delivery';
  if (normalized === 'pooling') return 'pooling';
  if (normalized === 'both' || normalized === 'all') return 'both';
  return 'taxi';
};

const normalizeTaxiMode = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'delivery') return 'delivery';
  if (normalized === 'pooling') return 'pooling';
  if (normalized === 'both' || normalized === 'all') return 'both';
  return 'taxi';
};

const getTransportTypeOptionDescription = (transportType = '', vehicleName = '') => {
  const normalizedTransportType = normalizeTransportType(transportType);
  const normalizedVehicleName = String(vehicleName || '').trim() || 'Vehicle name preview';

  if (normalizedTransportType === 'both') {
    return `${normalizedVehicleName} in both ride and delivery`;
  }

  if (normalizedTransportType === 'delivery') {
    return normalizedVehicleName;
  }

  return normalizedVehicleName;
};

const resolveVehicleTransportType = (vehicle = {}) => {
  const directTransportType = normalizeTransportType(vehicle?.transport_type || vehicle?.is_taxi || '');
  if (directTransportType !== 'taxi') {
    return directTransportType;
  }

  const hasDeliveryCategory = Boolean(String(vehicle?.delivery_category || '').trim());
  const hasDeliveryPricing = Boolean(
    vehicle?.delivery_distance_pricing?.enabled ||
    Number(vehicle?.delivery_distance_pricing?.base_price || 0) > 0 ||
    Number(vehicle?.delivery_distance_pricing?.distance_price || 0) > 0,
  );

  if (hasDeliveryCategory || hasDeliveryPricing) {
    return 'delivery';
  }

  return 'taxi';
};

const buildVehicleFormData = (selectedVehicle = {}) => ({
  name: selectedVehicle.name || '',
  short_description: selectedVehicle.short_description || '',
  description: selectedVehicle.description || '',
  transport_type: resolveVehicleTransportType(selectedVehicle),
  dispatch_type: selectedVehicle.dispatch_type || selectedVehicle.trip_dispatch_type || 'normal',
  icon_types: normalizeIconType(selectedVehicle.icon_types || selectedVehicle.icon_types_for),
  category: String(selectedVehicle.category || ''),
  image: selectedVehicle.image || '',
  map_icon: selectedVehicle.map_icon || selectedVehicle.icon || selectedVehicle.image || '',
  capacity: Number(selectedVehicle.capacity || 0),
  size: String(selectedVehicle.size || ''),
  is_taxi: selectedVehicle.is_taxi || resolveVehicleTransportType(selectedVehicle),
  is_accept_share_ride: Number(selectedVehicle.is_accept_share_ride || 0),
  delivery_category: String(selectedVehicle.delivery_category || ''),
  delivery_distance_pricing: normalizeDeliveryDistancePricing(selectedVehicle.delivery_distance_pricing),
  service_tax: String(selectedVehicle.service_tax ?? 0),
  admin_commission_type_from_driver: String(selectedVehicle.admin_commission_type_from_driver ?? 1),
  admin_commission_from_driver: String(selectedVehicle.admin_commission_from_driver ?? 0),
  admin_commission_type_for_owner: String(selectedVehicle.admin_commission_type_for_owner ?? 1),
  admin_commission_for_owner: String(selectedVehicle.admin_commission_for_owner ?? 0),
  status: Number(selectedVehicle.status ?? (selectedVehicle.active !== false ? 1 : 0)),
  active: selectedVehicle.active !== false && Number(selectedVehicle.status ?? 1) !== 0,
  supported_other_vehicle_types: Array.isArray(selectedVehicle.supported_other_vehicle_types)
    ? selectedVehicle.supported_other_vehicle_types.map((item) => String(item?._id || item))
    : typeof selectedVehicle.supported_vehicles === 'string' && selectedVehicle.supported_vehicles
      ? selectedVehicle.supported_vehicles.split(',').map((item) => item.trim()).filter(Boolean)
      : [],
  vehicle_preference: Array.isArray(selectedVehicle.vehicle_preference)
    ? selectedVehicle.vehicle_preference.map((item) => String(item?._id || item))
    : [],
});

const sanitizeObjectIdList = (items = []) =>
  (Array.isArray(items) ? items : [])
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (item && typeof item === 'object') {
        return String(item._id || item.id || '').trim();
      }
      return '';
    })
    .filter((item, index, array) => OBJECT_ID_PATTERN.test(item) && array.indexOf(item) === index);

const defaultFormData = {
  name: '',
  short_description: '',
  description: '',
  transport_type: 'taxi',
  dispatch_type: 'normal',
  icon_types: 'car',
  category: '',
  image: '',
  map_icon: '',
  capacity: 0,
  size: '',
  is_taxi: 'taxi',
  is_accept_share_ride: 0,
  delivery_category: '',
  delivery_distance_pricing: {
    enabled: false,
    base_price: '',
    free_distance: '',
    distance_price: '',
  },
  service_tax: '0',
  admin_commission_type_from_driver: '1',
  admin_commission_from_driver: '0',
  admin_commission_type_for_owner: '1',
  admin_commission_for_owner: '0',
  status: 1,
  active: true,
  supported_other_vehicle_types: [],
  vehicle_preference: [],
};

const DELIVERY_CATEGORY_OPTIONS = [
  {
    id: 'trucks',
    title: 'Trucks',
    image: trucksImg,
    description: 'Heavy goods, loaders, and cargo-style delivery vehicles.',
  },
  {
    id: '2wheeler',
    title: '2 Wheeler',
    image: bikeImg,
    description: 'Fast lightweight parcel bikes and two-wheel delivery options.',
  },
  {
    id: 'auto',
    title: 'Auto',
    image: '/2_AutoRickshaw.png',
    description: 'Classic three-wheeler Indian auto rickshaw for fast local parcel delivery.',
  },
  {
    id: 'movers',
    title: 'Packers & Movers',
    image: moversImg,
    description: 'Home shifting, helper-based, and larger move services.',
  },
];

const VEHICLE_CATEGORY_OPTIONS = [
  { id: '', label: 'Select Category' },
  { id: 'bike', label: 'Bike' },
  { id: 'car', label: 'Car' },
  { id: 'auto', label: 'Auto' },
];

const TRANSPORT_TYPE_OPTIONS = [
  { id: 'taxi', name: 'taxi', display_name: 'Ride' },
  { id: 'delivery', name: 'delivery', display_name: 'Delivery' },
  { id: 'both', name: 'both', display_name: 'Both' },
];

const unwrap = (response) => response?.data?.data || response?.data || response;

const normalizeDeliveryDistancePricing = (value = {}) => ({
  enabled: Boolean(value?.enabled),
  base_price: String(value?.base_price ?? ''),
  free_distance: String(value?.free_distance ?? value?.base_distance ?? ''),
  distance_price: String(value?.distance_price ?? ''),
});

const clampNonNegativeInput = (value) => {
  if (value === '') {
    return '';
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return '';
  }

  return String(Math.max(0, numericValue));
};

const normalizeVehicle = (item = {}) => ({
  ...item,
  id: String(item?._id || item?.id || ''),
});

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const StatusToggle = ({ active, onToggle }) => (
  <button
    type="button"
    onClick={(e) => {
      e.stopPropagation();
      onToggle();
    }}
    className={`relative h-6 w-12 rounded-full transition-all ${active ? 'bg-yellow-400' : 'bg-slate-300'}`}
  >
    <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${active ? 'left-7' : 'left-1'}`} />
  </button>
);

const VehicleMultiSelect = ({
  label,
  options,
  value,
  onChange,
  placeholder = 'Select options',
}) => {
  const selectedItems = options.filter((item) => value.includes(String(item.id || item._id)));

  const handleSelect = (event) => {
    const nextValue = event.target.value;
    if (!nextValue || value.includes(nextValue)) {
      return;
    }
    onChange([...value, nextValue]);
  };

  const removeItem = (id) => onChange(value.filter((item) => item !== id));

  return (
    <div>
      <label className={labelClass}>{label}</label>
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="mb-3 flex flex-wrap gap-2">
          {selectedItems.length ? selectedItems.map((item) => (
            <span
              key={String(item.id || item._id)}
              className="inline-flex items-center gap-2 rounded-full bg-slate-700 px-3 py-1.5 text-[12px] font-semibold text-black"
            >
              {item.name}
              <button
                type="button"
                onClick={() => removeItem(String(item.id || item._id))}
                className="opacity-80 transition hover:opacity-100"
              >
                <X size={12} />
              </button>
            </span>
          )) : (
            <p className="text-[12px] text-slate-400">{placeholder}</p>
          )}
        </div>
        <select value="" onChange={handleSelect} className={inputClass}>
          <option value="">Add option</option>
          {options
            .filter((item) => !value.includes(String(item.id || item._id)))
            .map((item) => (
              <option key={String(item.id || item._id)} value={String(item.id || item._id)}>
                {item.name}
              </option>
            ))}
        </select>
      </div>
    </div>
  );
};

const VehicleType = ({ mode: propMode }) => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditor = propMode === 'create' || propMode === 'edit';
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTransportTypeMenuOpen, setIsTransportTypeMenuOpen] = useState(false);
  const [vehiclePreferences, setVehiclePreferences] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, current_page: 1 });
  const [errorMessage, setErrorMessage] = useState('');
  const [formData, setFormData] = useState({ ...defaultFormData, transport_type: '' });
  const { transportTypes } = useTaxiTransportTypes({ enabled: isEditor });
  const transportTypeOptions = useMemo(() => {
    const normalized = new Map();

    [...TRANSPORT_TYPE_OPTIONS, ...(Array.isArray(transportTypes) ? transportTypes : [])].forEach((item) => {
      const value = normalizeTransportType(item?.name || item?.transport_type || item?.id || '');
      if (!value || value === 'pooling') return;

      normalized.set(value, {
        id: item?.id || item?._id || value,
        name: value,
        display_name:
          value === 'both'
            ? 'Both'
            : (item?.display_name || item?.label || value.charAt(0).toUpperCase() + value.slice(1)),
      });
    });

    return Array.from(normalized.values());
  }, [transportTypes]);
  const selectedTransportTypeOption = useMemo(
    () => transportTypeOptions.find((item) => item.name === formData.transport_type) || null,
    [formData.transport_type, transportTypeOptions],
  );

  useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      setLoading(true);
      setErrorMessage('');

      try {
        const vehicleCatalogPromise = api.get(isEditor ? '/admin/types/vehicle-types' : '/admin/types/vehicle-types/list');
        const preferencePromise = isEditor ? api.get('/admin/vehicle_preference') : Promise.resolve(null);
        const detailPromise = isEditor && id ? api.get(`/admin/types/vehicle-types/${id}`) : Promise.resolve(null);

        if (!id && propMode === 'create') {
          setFormData(defaultFormData);
        }

        detailPromise
          .then((response) => {
            if (!mounted || !response) {
              return;
            }

            const detailPayload = unwrap(response);
            if (detailPayload) {
              setFormData(buildVehicleFormData(normalizeVehicle(detailPayload)));
            }
          })
          .catch(() => {});

        vehicleCatalogPromise
          .then((response) => {
            if (!mounted) {
              return;
            }

            const vehiclePayload = unwrap(response);
            const vehicleResults = Array.isArray(vehiclePayload?.results)
              ? vehiclePayload.results
              : Array.isArray(vehiclePayload)
                ? vehiclePayload
                : [];
            const normalizedVehicles = vehicleResults.map(normalizeVehicle);
            setVehicles(normalizedVehicles);
            setPagination(vehiclePayload?.paginator || { total: normalizedVehicles.length, current_page: 1 });

            if (id && !formData.name) {
              const selectedVehicle = normalizedVehicles.find((item) => String(item.id) === String(id));
              if (selectedVehicle) {
                setFormData(buildVehicleFormData(selectedVehicle));
              }
            }
          })
          .catch(() => {});

        preferencePromise
          .then((response) => {
            if (!mounted || !response) {
              return;
            }

            const prefPayload = unwrap(response);
            const prefResults = Array.isArray(prefPayload?.results)
              ? prefPayload.results
              : Array.isArray(prefPayload?.data)
                ? prefPayload.data
                : Array.isArray(prefPayload)
                  ? prefPayload
                  : [];
            setVehiclePreferences(prefResults);
          })
          .catch(() => {});

        const [vehicleCatalogResult, preferenceResult, detailResult] = await Promise.allSettled([
          vehicleCatalogPromise,
          preferencePromise,
          detailPromise,
        ]);

        if (!mounted) {
          return;
        }

        const errors = [vehicleCatalogResult, preferenceResult, detailResult]
          .filter((result) => result.status === 'rejected')
          .map((result) => result.reason?.message || 'Request failed');

        if (errors.length === 3 || (id && detailResult.status === 'rejected')) {
          setErrorMessage(errors[0] || 'Could not load vehicle types.');
        }
      } catch (error) {
        if (mounted) {
          setErrorMessage(error.message || 'Could not load vehicle types.');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadData();

    return () => {
      mounted = false;
    };
  }, [id, propMode]);

  const previewImage = useMemo(() => {
    if (formData.image && typeof formData.image === 'string') {
      return formData.image;
    }
    return '';
  }, [formData.image]);

  const mapIconPreview = useMemo(() => {
    if (formData.map_icon && typeof formData.map_icon === 'string') {
      return formData.map_icon;
    }
    return iconMap[formData.icon_types] || CarIcon;
  }, [formData.icon_types, formData.map_icon]);

  const availableSupportVehicles = useMemo(
    () => vehicles.filter((item) => String(item.id) !== String(id)),
    [id, vehicles],
  );

  const preferenceOptions = useMemo(
    () => vehiclePreferences.map((item) => ({ ...item, id: String(item._id || item.id) })),
    [vehiclePreferences],
  );

  const showsDeliveryCategorySelector = useMemo(
    () => ['delivery', 'both'].includes(normalizeTransportType(formData.transport_type)),
    [formData.transport_type],
  );

  const updateForm = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleImageChange = async (event, field = 'image') => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const dataUrl = await fileToDataUrl(file);
    updateForm(field, dataUrl);
    event.target.value = '';
  };

  const handleSave = async () => {
    setIsSaving(true);
    setErrorMessage('');

    try {
      if (showsDeliveryCategorySelector && !formData.delivery_category) {
        throw new Error('Choose a delivery category for this delivery-enabled vehicle type.');
      }

      const payload = {
        name: formData.name.trim(),
        short_description: formData.short_description.trim(),
        description: formData.description.trim(),
        transport_type: normalizeTransportType(formData.transport_type),
        dispatch_type: formData.dispatch_type,
        icon_types: normalizeIconType(formData.icon_types),
        category: formData.category,
        image: formData.image || '',
        icon: formData.map_icon || '',
        map_icon: formData.map_icon || '',
        capacity: Number(formData.capacity || 0),
        size: formData.size,
        is_taxi: normalizeTaxiMode(formData.is_taxi || formData.transport_type),
        is_accept_share_ride: Number(formData.is_accept_share_ride || 0),
        delivery_category: showsDeliveryCategorySelector ? formData.delivery_category : '',
        delivery_distance_pricing: showsDeliveryCategorySelector
          ? {
              enabled: Boolean(formData.delivery_distance_pricing?.enabled),
              base_price: Number(formData.delivery_distance_pricing?.base_price || 0),
              free_distance: Number(formData.delivery_distance_pricing?.free_distance || 0),
              distance_price: Number(formData.delivery_distance_pricing?.distance_price || 0),
              free_time: 0,
              time_price: 0,
            }
          : {
              enabled: false,
              base_price: 0,
              free_distance: 0,
              distance_price: 0,
              free_time: 0,
              time_price: 0,
            },
        service_tax: showsDeliveryCategorySelector ? Number(formData.service_tax || 0) : 0,
        admin_commission_type_from_driver: Number(formData.admin_commission_type_from_driver || 1),
        admin_commission_from_driver: Number(formData.admin_commission_from_driver || 0),
        admin_commission_type_for_owner: Number(formData.admin_commission_type_for_owner || 1),
        admin_commission_for_owner: Number(formData.admin_commission_for_owner || 0),
        status: formData.active ? 1 : 0,
        active: formData.active,
        supported_other_vehicle_types: sanitizeObjectIdList(formData.supported_other_vehicle_types),
        vehicle_preference: sanitizeObjectIdList(formData.vehicle_preference),
      };

      if (id) {
        await api.patch(`/admin/types/vehicle-types/${id}`, payload);
      } else {
        await api.post('/admin/types/vehicle-types', payload);
      }

      navigate('/admin/pricing/vehicle-type');
    } catch (error) {
      setErrorMessage(error?.response?.data?.message || error.message || 'Could not save vehicle type.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (vehicleId) => {
    if (!window.confirm('Delete this vehicle type?')) {
      return;
    }

    try {
      await api.delete(`/admin/types/vehicle-types/${vehicleId}`);
      setVehicles((prev) => prev.filter((item) => String(item.id) !== String(vehicleId)));
    } catch (error) {
      setErrorMessage(error.message || 'Could not delete vehicle type.');
    }
  };

  if (!isEditor) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 lg:p-8">
        <div className="mb-6">
          <div className="mb-2 flex items-center gap-1.5 text-xs text-slate-400">
            <span>Pricing</span>
            <ChevronRight size={12} />
            <span className="text-slate-700">Vehicle Type</span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Vehicle Type</h1>
              <p className="mt-1 text-sm text-slate-500">Manage the ride and delivery vehicle catalog.</p>
            </div>
            <button
              onClick={() => navigate('/admin/pricing/vehicle-type/create')}
              className="inline-flex items-center gap-2 rounded-xl bg-yellow-400 px-4 py-3 text-sm font-semibold text-black shadow-lg shadow-orange-200 transition hover:bg-yellow-500"
            >
              <Plus size={18} />
              Add Vehicle
            </button>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-5 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50 text-orange-500">
                <Car size={20} />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">Total Types</p>
                <p className="text-2xl font-bold text-slate-900">{vehicles.length}</p>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-500">
                <Activity size={20} />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">Active</p>
                <p className="text-2xl font-bold text-slate-900">{vehicles.filter((item) => item.active !== false).length}</p>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-500">
                <Package size={20} />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">Delivery Types</p>
                <p className="text-2xl font-bold text-slate-900">{vehicles.filter((item) => ['delivery', 'both'].includes(String(item.transport_type || '').toLowerCase())).length}</p>
              </div>
            </div>
          </div>
        </div>

        {errorMessage ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
            {errorMessage}
          </div>
        ) : null}

        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-4 text-sm font-semibold text-slate-600">Vehicle</th>
                  <th className="px-6 py-4 text-sm font-semibold text-slate-600">Transport</th>
                  <th className="px-6 py-4 text-sm font-semibold text-slate-600">Dispatch</th>
                  <th className="px-6 py-4 text-sm font-semibold text-slate-600">Active</th>
                  <th className="px-6 py-4 text-right text-sm font-semibold text-slate-600">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="5" className="px-6 py-20 text-center text-sm text-slate-400">Loading vehicle types...</td>
                  </tr>
                ) : !vehicles.length ? (
                  <tr>
                    <td colSpan="5" className="px-6 py-20 text-center text-sm text-slate-400">No vehicle types found.</td>
                  </tr>
                ) : vehicles.map((vehicle) => (
                  <tr key={vehicle.id} className="border-t border-slate-100">
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50">
                          <img src={vehicle.image || vehicle.map_icon || vehicle.icon || iconMap[normalizeIconType(vehicle.icon_types)] || CarIcon} alt={vehicle.name} className="h-10 w-10 object-contain" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{vehicle.name}</p>
                          <p className="text-xs text-slate-500">{vehicle.short_description || vehicle.description || 'No description added'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                        String(vehicle.transport_type || '').toLowerCase() === 'delivery'
                          ? 'bg-orange-50 text-orange-600'
                          : String(vehicle.transport_type || '').toLowerCase() === 'both'
                            ? 'bg-emerald-50 text-emerald-600'
                            : 'bg-blue-50 text-blue-600'
                      }`}>
                        {vehicle.transport_type}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-sm font-medium text-slate-700">{vehicle.trip_dispatch_type || vehicle.dispatch_type || 'normal'}</td>
                    <td className="px-6 py-5">
                      <StatusToggle active={vehicle.active !== false} onToggle={() => {}} />
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => navigate(`/admin/pricing/vehicle-type/edit/${vehicle.id}`)}
                          className="rounded-xl p-2 text-slate-400 transition hover:bg-blue-50 hover:text-blue-600"
                        >
                          <Edit2 size={15} />
                        </button>
                        <button
                          onClick={() => handleDelete(vehicle.id)}
                          className="rounded-xl p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6 lg:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs text-slate-400">
            <span>Pricing</span>
            <ChevronRight size={12} />
            <span className="text-slate-700">Vehicle Type</span>
            <ChevronRight size={12} />
            <span className="text-slate-700">{id ? 'Edit' : 'Create'}</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{id ? 'Edit Vehicle Type' : 'Create Vehicle Type'}</h1>
          <p className="mt-1 text-sm text-slate-500">Update the live vehicle catalog with real transport, icon, dispatch, and compatibility data.</p>
        </div>
        <button
          onClick={() => navigate('/admin/pricing/vehicle-type')}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          <ArrowLeft size={16} />
          Back
        </button>
      </div>

      {errorMessage ? (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
          {errorMessage}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-1 gap-8 p-6 lg:grid-cols-2 lg:p-8">
          <div>
            <label className={labelClass}>Transport Type *</label>
            <input type="hidden" required value={formData.transport_type} onChange={() => {}} />
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsTransportTypeMenuOpen((previous) => !previous)}
                onBlur={(event) => {
                  const nextFocusTarget = event.relatedTarget;
                  if (!event.currentTarget.parentElement?.contains(nextFocusTarget)) {
                    setIsTransportTypeMenuOpen(false);
                  }
                }}
                className={`${inputClass} flex min-h-[76px] items-center justify-between text-left`}
              >
                <div>
                  <p className="text-sm font-bold text-slate-900">
                    {selectedTransportTypeOption?.display_name || 'Select Transport Type'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {selectedTransportTypeOption
                      ? getTransportTypeOptionDescription(selectedTransportTypeOption.name, formData.name)
                      : 'Choose where this vehicle name should appear.'}
                  </p>
                </div>
                <ChevronDown
                  size={18}
                  className={`shrink-0 text-slate-400 transition-transform ${isTransportTypeMenuOpen ? 'rotate-180' : ''}`}
                />
              </button>
              {isTransportTypeMenuOpen ? (
                <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-20 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
                  {transportTypeOptions.map((t) => {
                    const selected = t.name === formData.transport_type;

                    return (
                      <button
                        key={t.id || t._id || t.name}
                        type="button"
                        onClick={() => {
                          const nextTransportType = t.name;
                          updateForm('transport_type', nextTransportType);
                          if (!['delivery', 'both'].includes(normalizeTransportType(nextTransportType))) {
                            updateForm('delivery_category', '');
                            updateForm('delivery_distance_pricing', normalizeDeliveryDistancePricing());
                          }
                          setIsTransportTypeMenuOpen(false);
                        }}
                        className={`flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition ${
                          selected ? 'bg-orange-50' : 'bg-white hover:bg-slate-50'
                        }`}
                      >
                        <div>
                          <p className={`text-sm font-bold ${selected ? 'text-orange-600' : 'text-slate-900'}`}>
                            {t.display_name}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {getTransportTypeOptionDescription(t.name, formData.name)}
                          </p>
                        </div>
                        {selected ? (
                          <span className="mt-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-white">
                            <CheckCircle2 size={12} />
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Choose `Both` for vehicle types like bikes that can handle ride and parcel flows.
            </p>
          </div>

          <div>
            <label className={labelClass}>Icon Type *</label>
            <select value={formData.icon_types} onChange={(e) => updateForm('icon_types', e.target.value)} className={inputClass}>
              {Object.keys(iconMap).map((key) => (
                <option key={key} value={key}>{ICON_TYPE_LABELS[key] || key}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Category</label>
            <select value={formData.category} onChange={(e) => updateForm('category', e.target.value)} className={inputClass}>
              {VEHICLE_CATEGORY_OPTIONS.map((option) => (
                <option key={option.id || 'empty'} value={option.id}>{option.label}</option>
              ))}
            </select>
          </div>

          {showsDeliveryCategorySelector ? (
            <div className="lg:col-span-2">
              <label className={labelClass}>Delivery Category *</label>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {DELIVERY_CATEGORY_OPTIONS.map((option) => {
                  const selected = formData.delivery_category === option.id;

                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => updateForm('delivery_category', option.id)}
                      className={`rounded-[24px] border p-4 text-left transition-all ${
                        selected
                          ? 'border-[#0047AB] bg-[#EEF4FF] shadow-md'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                      }`}
                    >
                      <div className="rounded-[20px] bg-slate-50 p-3">
                        <img src={option.image} alt={option.title} className="mx-auto h-24 w-full object-contain" />
                      </div>
                      <div className="mt-4 flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-black text-slate-900">{option.title}</p>
                          <p className="mt-1 text-xs font-medium leading-5 text-slate-500">{option.description}</p>
                        </div>
                        <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                          selected ? 'border-[#0047AB] bg-[#0047AB] text-white' : 'border-slate-300 bg-white'
                        }`}>
                          {selected ? <CheckCircle2 size={12} /> : null}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-slate-500">
                This decides which delivery card this vehicle type appears under in the user parcel flow.
              </p>
            </div>
          ) : null}

          {showsDeliveryCategorySelector ? (
            <div className="lg:col-span-2 rounded-[28px] border border-slate-200 bg-slate-50/70 p-5">
              <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <label className={labelClass}>Delivery Distance Based Charges</label>
                  <p className="text-xs text-slate-500">
                    Enable quick parcel pricing defaults for this delivery-enabled vehicle type.
                  </p>
                </div>
                <label className="inline-flex items-center gap-3 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={Boolean(formData.delivery_distance_pricing?.enabled)}
                    onChange={(e) => updateForm('delivery_distance_pricing', {
                      ...formData.delivery_distance_pricing,
                      enabled: e.target.checked,
                    })}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  Enable distance based charges
                </label>
              </div>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                <div>
                  <label className={labelClass}>Base Price</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.delivery_distance_pricing?.base_price ?? ''}
                    onChange={(e) => updateForm('delivery_distance_pricing', {
                      ...formData.delivery_distance_pricing,
                      base_price: e.target.value,
                    })}
                    className={inputClass}
                    placeholder="45"
                    disabled={!formData.delivery_distance_pricing?.enabled}
                  />
                </div>

                <div>
                  <label className={labelClass}>Base Distance (KM)</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.delivery_distance_pricing?.free_distance ?? ''}
                    onChange={(e) => updateForm('delivery_distance_pricing', {
                      ...formData.delivery_distance_pricing,
                      free_distance: e.target.value,
                    })}
                    className={inputClass}
                    placeholder="2"
                    disabled={!formData.delivery_distance_pricing?.enabled}
                  />
                  <p className="mt-2 text-[11px] font-medium text-slate-400">
                    Distance covered by the base price before per-km charges begin.
                  </p>
                </div>

                <div>
                  <label className={labelClass}>Distance Price</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.delivery_distance_pricing?.distance_price ?? ''}
                    onChange={(e) => updateForm('delivery_distance_pricing', {
                      ...formData.delivery_distance_pricing,
                      distance_price: e.target.value,
                    })}
                    className={inputClass}
                    placeholder="12"
                    disabled={!formData.delivery_distance_pricing?.enabled}
                  />
                </div>

                <div>
                  <label className={labelClass}>Service Tax (%)</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.service_tax}
                    onChange={(e) => updateForm('service_tax', clampNonNegativeInput(e.target.value))}
                    className={inputClass}
                    placeholder="5"
                  />
                  <p className="mt-2 text-[11px] font-medium text-slate-400">
                    Added on top of the delivery fare shown to the user.
                  </p>
                </div>

              </div>

              <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <label className={labelClass}>Admin Commission Type From Driver</label>
                  <select
                    value={formData.admin_commission_type_from_driver}
                    onChange={(e) => updateForm('admin_commission_type_from_driver', e.target.value)}
                    className={inputClass}
                  >
                    <option value="1">Percentage</option>
                    <option value="2">Fixed</option>
                  </select>
                </div>

                <div>
                  <label className={labelClass}>Admin Commission From Driver</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.admin_commission_from_driver}
                    onChange={(e) => updateForm('admin_commission_from_driver', clampNonNegativeInput(e.target.value))}
                    className={inputClass}
                    placeholder="0"
                  />
                </div>

                <div>
                  <label className={labelClass}>Admin Commission Type From Owner</label>
                  <select
                    value={formData.admin_commission_type_for_owner}
                    onChange={(e) => updateForm('admin_commission_type_for_owner', e.target.value)}
                    className={inputClass}
                  >
                    <option value="1">Percentage</option>
                    <option value="2">Fixed</option>
                  </select>
                </div>

                <div>
                  <label className={labelClass}>Admin Commission From Owner</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.admin_commission_for_owner}
                    onChange={(e) => updateForm('admin_commission_for_owner', clampNonNegativeInput(e.target.value))}
                    className={inputClass}
                    placeholder="0"
                  />
                </div>
              </div>

              <p className="mt-3 text-xs text-slate-500">
                This section only appears when the vehicle supports `Delivery` or `Both`.
              </p>
            </div>
          ) : null}

          <div>
            <label className={labelClass}>Preview Image</label>
            <div className="rounded-2xl border border-dashed border-slate-300 p-4">
              <div className="group relative flex min-h-[320px] items-center justify-center overflow-hidden rounded-2xl bg-slate-50">
                {previewImage ? (
                  <>
                    <img src={previewImage} alt="Vehicle preview" className="max-h-[280px] w-full object-contain p-4" />
                    <button
                      type="button"
                      onClick={() => updateForm('image', '')}
                      className="absolute right-3 top-3 rounded-xl bg-white p-2 text-red-500 shadow-sm transition hover:bg-red-500 hover:text-white"
                    >
                      <Trash2 size={16} />
                    </button>
                  </>
                ) : (
                  <label className="flex cursor-pointer flex-col items-center gap-3">
                    <input type="file" accept="image/*" className="hidden" onChange={(event) => handleImageChange(event, 'image')} />
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-orange-500 shadow-sm">
                      <Upload size={20} />
                    </span>
                    <span className="text-sm font-semibold text-slate-700">Upload preview image</span>
                    <span className="text-xs text-slate-400">This shows in the user vehicle selection card</span>
                  </label>
                )}
              </div>
            </div>
            <div className="mt-4 rounded-[24px] border border-orange-100 bg-gradient-to-r from-white via-orange-50/30 to-white p-3 shadow-sm">
              <p className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">User Card Preview</p>
              <div className="flex items-center gap-3 rounded-[20px] border border-orange-400 bg-white px-3 py-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-100">
                  <img
                    src={previewImage || mapIconPreview}
                    alt="User card vehicle preview"
                    className="h-10 w-10 object-contain"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-black text-slate-900">{formData.name || 'Taxi'}</p>
                    <span className="rounded bg-orange-500 px-1.5 py-0.5 text-[7px] font-black text-black">FASTEST</span>
                  </div>
                  <p className="truncate text-[11px] font-bold text-slate-500">{formData.short_description || formData.description || 'Closest driver 940 m away'}</p>
                  {showsDeliveryCategorySelector ? (
                    <p className="mt-1 text-[10px] font-black uppercase tracking-wide text-slate-400">
                      Includes {Number(formData.service_tax || 0).toFixed(2)}% service tax
                    </p>
                  ) : null}
                </div>
                <p className="text-sm font-black text-slate-900">₹31</p>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">Live Map Icon Preview</p>
                  <p className="text-[11px] font-medium text-slate-500">This uploaded icon is saved to the DB and used on app maps.</p>
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-white px-3 py-2 text-[11px] font-bold text-slate-700 shadow-sm transition hover:text-orange-500">
                  <Upload size={14} />
                  Change
                  <input type="file" accept="image/*" className="hidden" onChange={(event) => handleImageChange(event, 'map_icon')} />
                </label>
              </div>
              <div className="relative h-[228px] overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <img src={MapBackground} alt="Map preview" className="absolute inset-0 h-full w-full object-cover opacity-25" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <img src={mapIconPreview} alt="Icon preview" className="h-16 w-16 object-contain drop-shadow-xl" />
                </div>
              </div>
              {formData.map_icon ? (
                <button
                  type="button"
                  onClick={() => updateForm('map_icon', '')}
                  className="mt-3 text-[11px] font-bold text-red-500 transition hover:text-red-600"
                >
                  Remove uploaded map icon and use the selected icon type fallback
                </button>
              ) : null}
            </div>

            <div>
              <label className={labelClass}>Maximum Weight / Capacity *</label>
              <input
                type="number"
                value={formData.capacity}
                onChange={(e) => updateForm('capacity', e.target.value)}
                className={inputClass}
                placeholder="12"
              />
            </div>

            <div>
              <label className={labelClass}>Short Description *</label>
              <input
                type="text"
                value={formData.short_description}
                onChange={(e) => updateForm('short_description', e.target.value)}
                className={inputClass}
                placeholder="Normal Delivery"
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => updateForm('name', e.target.value)}
              className={inputClass}
              placeholder="Parcel"
            />
          </div>

          <div>
            <label className={labelClass}>Trip Dispatch Type *</label>
            <select value={formData.dispatch_type} onChange={(e) => updateForm('dispatch_type', e.target.value)} className={inputClass}>
              <option value="normal">Normal</option>
              <option value="bidding">Bidding</option>
              <option value="both">Both</option>
            </select>
          </div>

          <div>
            <label className={labelClass}>Size *</label>
            <input
              type="text"
              value={formData.size}
              onChange={(e) => updateForm('size', e.target.value)}
              className={inputClass}
              placeholder="2"
            />
          </div>

          <div>
            <label className={labelClass}>Operational Scope *</label>
            <select value={formData.is_taxi} onChange={(e) => updateForm('is_taxi', e.target.value)} className={inputClass}>
              <option value="">Select Scope</option>
              {transportTypes.map(t => (
                <option key={t.id || t._id} value={t.name}>{t.display_name}</option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-2">
            <label className={labelClass}>Description *</label>
            <textarea
              rows="4"
              value={formData.description}
              onChange={(e) => updateForm('description', e.target.value)}
              className={inputClass}
              placeholder="Parcel Delivery"
            />
          </div>

          <div className="lg:col-span-2">
            <VehicleMultiSelect
              label="Supported Other Vehicle Types"
              options={availableSupportVehicles}
              value={formData.supported_other_vehicle_types}
              onChange={(next) => updateForm('supported_other_vehicle_types', next)}
              placeholder="No supporting vehicle types selected"
            />
          </div>

          <div className="lg:col-span-2">
            <VehicleMultiSelect
              label="Vehicle Preferences"
              options={preferenceOptions}
              value={formData.vehicle_preference}
              onChange={(next) => updateForm('vehicle_preference', next)}
              placeholder="No preferences selected"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 border-t border-slate-100 bg-slate-50/50 p-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-2xl bg-amber-50 px-4 py-3">
              <Info size={16} className="mt-0.5 shrink-0 text-amber-600" />
              <p className="text-sm text-amber-800">
                This form is fully dynamic from your DB. Transport type, icon type, supported vehicles, and preferences all save to the real vehicle catalog.
              </p>
            </div>
            <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={formData.is_accept_share_ride === 1}
                onChange={(e) => updateForm('is_accept_share_ride', e.target.checked ? 1 : 0)}
                className="h-4 w-4 rounded border-slate-300"
              />
              Accept share ride
            </label>
            <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={formData.active}
                onChange={(e) => {
                  updateForm('active', e.target.checked);
                  updateForm('status', e.target.checked ? 1 : 0);
                }}
                className="h-4 w-4 rounded border-slate-300"
              />
              Active vehicle type
            </label>
          </div>

          <div className="flex flex-col gap-3 lg:items-end">
            <button
              onClick={handleSave}
              disabled={isSaving || loading}
              className="inline-flex min-w-[180px] items-center justify-center gap-2 rounded-xl bg-yellow-400 px-5 py-3 text-sm font-semibold text-black transition hover:bg-yellow-500 disabled:opacity-60"
            >
              <Save size={16} />
              {isSaving ? 'Saving...' : id ? 'Update' : 'Create'}
            </button>
            <button
              onClick={() => navigate('/admin/pricing/vehicle-type')}
              className="text-sm font-medium text-slate-500 transition hover:text-slate-700"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {!loading && formData.active ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="fixed bottom-8 right-8 flex h-14 w-14 items-center justify-center rounded-full bg-[#14b8a6] text-white shadow-2xl"
          >
            <CheckCircle2 size={24} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};

export default VehicleType;
