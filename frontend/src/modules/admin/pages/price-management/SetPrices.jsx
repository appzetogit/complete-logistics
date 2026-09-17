import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  MapPin, 
  Car, 
  ChevronRight, 
  Trash2, 
  Edit2, 
  Save, 
  ArrowLeft,
  Loader2,
  CreditCard,
  User,
  Zap,
  Truck,
  Layers,
  ShieldCheck,
  Activity,
  DollarSign,
  Tag,
  Clock,
  ChevronLeft,
  Gift,
  Settings,
  Filter,
  Cone,
  Info,
  ChevronDown,
  Globe,
  Eye,
  Menu,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from "framer-motion";
import { API_BASE_URL } from '../../../../shared/api/runtimeConfig';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { adminService } from '../../services/adminService';

const inputClass = "w-full border border-gray-200 rounded-md px-2 py-0.5 text-xs text-gray-800 bg-white hover:border-indigo-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-100 transition-all outline-none shadow-sm";
const labelClass = "block text-[10px] font-semibold text-gray-700 mb-0";
const paymentTypeOptions = [
  { value: 'cash', label: 'Cash' },
  { value: 'online', label: 'Online' },
  { value: 'wallet', label: 'Wallet' },
];
const ALL_ZONES_OPTION_VALUE = '__all_zones__';
const isAllZonesSelection = (value) => String(value || '').trim() === ALL_ZONES_OPTION_VALUE;

const normalizePaymentTypes = (value) => {
  const items = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];

  const normalized = items
    .map((item) => String(item || '').trim().toLowerCase())
    .filter(Boolean);

  return Array.from(new Set(normalized)).filter((item) => paymentTypeOptions.some((option) => option.value === item));
};

const normalizeTransportType = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'delivery') return 'delivery';
  if (normalized === 'pooling') return 'pooling';
  if (normalized === 'both' || normalized === 'all') return 'both';
  return normalized === 'taxi' ? 'taxi' : '';
};

const getVehicleTransportType = (vehicle = {}) =>
  normalizeTransportType(vehicle?.transport_type || vehicle?.is_taxi || '');

const formatTransportTypeLabel = (value = '') => {
  const normalized = normalizeTransportType(value);
  if (normalized === 'delivery') return 'Delivery';
  if (normalized === 'pooling') return 'Pooling';
  if (normalized === 'both') return 'Both';
  return normalized === 'taxi' ? 'Taxi' : 'Not assigned';
};

const buildSetPriceGroupingSignature = (item = {}) => JSON.stringify({
  pricing_scope: item.pricing_scope || 'ride',
  transport_type: item.transport_type || '',
  vehicle_type: item.type_id || item.vehicle_type || '',
  service_location_id: item.service_location_id || '',
  vehicle_type_name: item.vehicle_type_name || '',
  payment_type: normalizePaymentTypes(item.payment_type),
  active: Number(item.active ?? 0),
  status: item.status || '',
  service_tax: Number(item.service_tax ?? 0),
  base_price: Number(item.base_price ?? 0),
  base_distance: Number(item.base_distance ?? 0),
  price_per_distance: Number(item.price_per_distance ?? 0),
  time_price: Number(item.time_price ?? 0),
  waiting_charge: Number(item.waiting_charge ?? 0),
  free_waiting_before: Number(item.free_waiting_before ?? 0),
  free_waiting_after: Number(item.free_waiting_after ?? 0),
  outstation_base_price: Number(item.outstation_base_price ?? 0),
  outstation_base_distance: Number(item.outstation_base_distance ?? 0),
  outstation_price_per_distance: Number(item.outstation_price_per_distance ?? 0),
  outstation_time_price: Number(item.outstation_time_price ?? 0),
});

const collapseAllZonesSetPrices = (items = []) => {
  if (!items.length) {
    return items;
  }

  const grouped = new Map();

  items.forEach((item) => {
    const signature = buildSetPriceGroupingSignature(item);
    const bucket = grouped.get(signature) || [];
    bucket.push(item);
    grouped.set(signature, bucket);
  });

  return Array.from(grouped.values()).flatMap((bucket) => {
    const uniqueZoneIds = new Set(
      bucket
        .map((item) => String(item?.zone_id || '').trim())
        .filter(Boolean),
    );

    const isAllZonesGroup = uniqueZoneIds.size > 1;

    if (!isAllZonesGroup) {
      return bucket;
    }

    const [firstItem] = bucket;
    return [{
      ...firstItem,
      zone_id: ALL_ZONES_OPTION_VALUE,
      zone_name: 'All',
      is_all_zones: true,
      grouped_ids: bucket.map((item) => String(item?.id || item?._id || '')).filter(Boolean),
      grouped_zone_ids: Array.from(uniqueZoneIds),
    }];
  });
};

const NON_NEGATIVE_FORM_FIELDS = new Set([
  'admin_commission_from_driver',
  'admin_commission_for_owner',
  'service_tax',
  'order_number',
  'base_price',
  'base_distance',
  'price_per_distance',
  'time_price',
  'waiting_charge',
  'free_waiting_before',
  'free_waiting_after',
  'support_airport_fee',
  'airport_surge',
  'outstation_base_price',
  'outstation_base_distance',
  'outstation_price_per_distance',
  'outstation_time_price',
  'price_per_seat',
  'shared_price_per_distance',
  'shared_cancel_fee',
  'user_cancellation_fee',
  'driver_cancellation_fee',
]);

const clampNonNegativeInput = (field, value) => {
  if (!NON_NEGATIVE_FORM_FIELDS.has(field)) {
    return value;
  }

  if (value === '' || value === null || value === undefined) {
    return '';
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return value;
  }

  return String(Math.max(0, numeric));
};

const togglePaymentType = (currentValue, targetValue) => {
  const currentItems = normalizePaymentTypes(currentValue);

  if (currentItems.includes(targetValue)) {
    return currentItems.filter((item) => item !== targetValue);
  }

  return [...currentItems, targetValue];
};

const StatusToggle = ({ active, onToggle }) => (
  <button
    onClick={(e) => { e.stopPropagation(); onToggle(); }}
    className={`w-11 h-6 rounded-full transition-colors relative flex items-center ${active ? 'bg-yellow-400' : 'bg-gray-200'}`}
  >
    <div className={`absolute w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${active ? 'translate-x-[22px]' : 'translate-x-1'}`} />
  </button>
);

const initialFormState = {
  zone_id: '',
  transport_type: '',
  vehicle_type: '',
  payment_type: ['cash'],
  admin_commision_type: '1',
  admin_commision: '',
  admin_commission_type_from_driver: '1',
  admin_commission_from_driver: '',
  admin_commission_type_for_owner: '1',
  admin_commission_for_owner: '',
  service_tax: '',
  order_number: '',
  base_price: '',
  base_distance: '',
  price_per_distance: '',
  time_price: '',
  waiting_charge: '',
  free_waiting_before: '',
  free_waiting_after: '',
  enable_airport_ride: false,
  support_airport_fee: '',
  airport_surge: '',
  enable_outstation_ride: false,
  outstation_base_price: '',
  outstation_base_distance: '',
  outstation_price_per_distance: '',
  outstation_time_price: '',
  enable_ride_sharing: false,
  enable_shared_ride: 0,
  price_per_seat: '',
  shared_price_per_distance: '',
  shared_cancel_fee: '',
  user_cancellation_fee: '',
  user_cancellation_fee_type: 'percentage',
  driver_cancellation_fee: '',
  driver_cancellation_fee_type: 'percentage',
  cancellation_fee_goes_to: 'admin',
  status: 'active',
  active: 1
};

const SetPrices = ({ mode }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const isCreateOrEdit = mode === 'create' || mode === 'edit';
  const view = isCreateOrEdit ? 'create' : 'list';
  const editingId = id || null;

  const [prizes, setPrizes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [paginator, setPaginator] = useState({ current_page: 1, last_page: 1, total: 0, per_page: 10, from: 0, to: 0 });
  const [showFilters, setShowFilters] = useState(false);
  const [transportFilter, setTransportFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [zoneFilter, setZoneFilter] = useState('');
  const [vehicleFilter, setVehicleFilter] = useState('');
  
  const [zones, setZones] = useState([]);
  const [vehicleTypes, setVehicleTypes] = useState([]);
  const [formData, setFormData] = useState(initialFormState);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const selectedVehicleType = React.useMemo(
    () => vehicleTypes.find((vehicle) => String(vehicle._id || vehicle.id) === String(formData.vehicle_type || '')) || null,
    [formData.vehicle_type, vehicleTypes],
  );
  const derivedTransportType = React.useMemo(
    () => getVehicleTransportType(selectedVehicleType),
    [selectedVehicleType],
  );

  const baseUrl = `${API_BASE_URL}/admin`;
  const token = localStorage.getItem('adminToken');

  useEffect(() => {
    fetchInitialData();
  }, [view, editingId, location.key, location.state?.refreshAt, page, itemsPerPage, searchTerm, transportFilter, statusFilter, zoneFilter, vehicleFilter]);

  useEffect(() => {
    if (mode === 'create') {
      setFormData({ ...initialFormState });
    }
  }, [mode]);

  useEffect(() => {
    if (!selectedVehicleType) {
      return;
    }

    const nextTransportType = getVehicleTransportType(selectedVehicleType);
    if (!nextTransportType) {
      return;
    }

    setFormData((previous) => (
      previous.transport_type === nextTransportType
        ? previous
        : { ...previous, transport_type: nextTransportType }
    ));
  }, [selectedVehicleType]);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const auth = { 'Authorization': `Bearer ${token}` };
      if (view === 'list') {
        const [pricesResponse, zonesResponse, vehiclesResponse] = await Promise.all([
          adminService.getSetPrices({
            scope: 'ride',
            page,
            limit: itemsPerPage,
            search: searchTerm,
            transport_type: transportFilter || undefined,
            status: statusFilter || undefined,
            zone_id: zoneFilter && zoneFilter !== ALL_ZONES_OPTION_VALUE ? zoneFilter : undefined,
            vehicle_type: vehicleFilter || undefined,
          }),
          adminService.getZones(),
          adminService.getVehicleTypes(),
        ]);

        const prizesData = pricesResponse?.data || {};
        const items = prizesData.results || prizesData.data?.results || [];
        const pager = prizesData.paginator || { current_page: 1, last_page: 1, total: 0, per_page: itemsPerPage, from: 0, to: 0 };

        const zoneItems = zonesResponse?.data?.results || zonesResponse?.data?.data?.results || zonesResponse?.data?.data?.zones || [];
        const vehicleItems = vehiclesResponse?.data?.results || vehiclesResponse?.data?.data?.results || vehiclesResponse?.data?.data?.vehicle_types || [];
        const safeZoneItems = Array.isArray(zoneItems) ? zoneItems : [];
        const safeItems = Array.isArray(items) ? items : [];
        const collapsedItems = collapseAllZonesSetPrices(safeItems);
        const visibleItems = zoneFilter === ALL_ZONES_OPTION_VALUE
          ? collapsedItems.filter((item) => item.is_all_zones)
          : collapsedItems;

        setPrizes(visibleItems);
        setPaginator({
          current_page: Number(pager.current_page || 1),
          last_page: Number(pager.last_page || 1),
          total: visibleItems.length,
          per_page: Number(pager.per_page || itemsPerPage),
          from: visibleItems.length ? ((Number(pager.current_page || 1) - 1) * Number(pager.per_page || itemsPerPage)) + 1 : 0,
          to: visibleItems.length ? Math.min(((Number(pager.current_page || 1) - 1) * Number(pager.per_page || itemsPerPage)) + visibleItems.length, visibleItems.length) : 0,
        });

        setZones(safeZoneItems);
        setVehicleTypes(Array.isArray(vehicleItems) ? vehicleItems : []);

        return;
      }

      const requests = [
        fetch(`${baseUrl}/zones`, { headers: auth }),
        fetch(`${baseUrl}/types/vehicle-types`, { headers: auth }),
      ];

      const responses = await Promise.all(requests);
      const payloads = await Promise.all(responses.map((response) => response.json()));
      const [zonesData, vehiclesData] = payloads;
      
      const zItems = zonesData.results || zonesData.data?.zones || JSON.parse(JSON.stringify(zonesData.data?.results || []));
      setZones(Array.isArray(zItems) ? zItems : []);
      
      const vItems = vehiclesData.results || vehiclesData.data?.vehicle_types || JSON.parse(JSON.stringify(vehiclesData.data?.results || []));
      setVehicleTypes(Array.isArray(vItems) ? vItems : []);

      if (mode === 'edit' && editingId) {
        const detailResponse = await adminService.getSetPriceById(editingId);
        const pData = detailResponse?.data?.data || detailResponse?.data || {};

        setFormData({
          ...initialFormState,
          ...pData,
          zone_id: pData.zone_id?._id || pData.zone_id || ALL_ZONES_OPTION_VALUE,
          transport_type: normalizeTransportType(pData.transport_type),
          vehicle_type: pData.vehicle_type?._id || pData.vehicle_type || '',
          admin_commision: pData.admin_commision ?? pData.customer_commission ?? '',
          admin_commision_type: String(pData.admin_commision_type ?? 1),
          admin_commission_from_driver: pData.admin_commission_from_driver ?? pData.driver_commission ?? '',
          admin_commission_type_from_driver: String(pData.admin_commission_type_from_driver ?? 1),
          admin_commission_for_owner: pData.admin_commission_for_owner ?? 0,
          admin_commission_type_for_owner: String(pData.admin_commission_type_for_owner ?? 1),
          order_number: pData.order_number ?? pData.eta_sequence ?? '',
          payment_type: normalizePaymentTypes(pData.payment_type).length ? normalizePaymentTypes(pData.payment_type) : ['cash'],
          user_cancellation_fee_type: pData.user_cancellation_fee_type || 'percentage',
          driver_cancellation_fee_type: pData.driver_cancellation_fee_type || 'percentage',
        });
      }
      
    } catch (error) { 
      console.error("Fetch Data Error:", error);
    } finally { 
      setLoading(false); 
    }
  };

  const handleSave = async (e) => {
    if(e) e.preventDefault();
    if (!formData.zone_id) { alert("Zone is required."); return; }
    if (!formData.vehicle_type) { alert("Vehicle Type is required."); return; }
    if (normalizePaymentTypes(formData.payment_type).length === 0) { alert("At least one payment type is required."); return; }
    
    const numericFields = [
      { name: 'Admin Commission From Driver', val: formData.admin_commission_from_driver },
      { name: 'Admin Commission From Owner', val: formData.admin_commission_for_owner },
      { name: 'Service Tax', val: formData.service_tax },
      { name: 'Base Price', val: formData.base_price },
      { name: 'Base Distance', val: formData.base_distance },
      { name: 'Price Per Distance', val: formData.price_per_distance },
      { name: 'Time Price', val: formData.time_price },
      { name: 'Waiting Charge', val: formData.waiting_charge },
      { name: 'User Cancellation Fee', val: formData.user_cancellation_fee },
      { name: 'Driver Cancellation Fee', val: formData.driver_cancellation_fee },
      ...(formData.enable_airport_ride ? [
        { name: 'Airport Surge Fee', val: formData.airport_surge },
        { name: 'Support Airport Fee', val: formData.support_airport_fee }
      ] : []),
      ...(formData.enable_outstation_ride ? [
        { name: 'Outstation Base Price', val: formData.outstation_base_price },
        { name: 'Outstation Base Distance', val: formData.outstation_base_distance },
        { name: 'Outstation Price Per Distance', val: formData.outstation_price_per_distance },
        { name: 'Outstation Time Price', val: formData.outstation_time_price }
      ] : [])
    ];
    for (const field of numericFields) {
      if (field.val !== '' && Number(field.val) < 0) {
        alert(`${field.name} cannot be negative.`);
        return;
      }
    }

    setSaving(true);
    try {
      const normalizedPaymentTypes = normalizePaymentTypes(formData.payment_type).length
        ? normalizePaymentTypes(formData.payment_type)
        : ['cash'];
      const basePayload = {
        ...formData,
        enable_ride_sharing: false,
        enable_shared_ride: 0,
        price_per_seat: 0,
        shared_price_per_distance: 0,
        shared_cancel_fee: 0,
        pricing_scope: 'ride',
        transport_type: derivedTransportType || normalizeTransportType(formData.transport_type),
        payment_type: normalizedPaymentTypes,
        zone_id: isAllZonesSelection(formData.zone_id) ? null : formData.zone_id,
        service_location_id: isAllZonesSelection(formData.zone_id) ? null : (formData.service_location_id || null),
      };

      const method = editingId ? 'PATCH' : 'POST';
      const url = editingId ? `${baseUrl}/types/set-prices/${editingId}` : `${baseUrl}/types/set-prices`;
      const res = await fetch(url, {
        method,
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(basePayload)
      });
      const data = await res.json();
      if (data.success) {
        navigate('/admin/pricing/set-price', {
          state: { refreshAt: Date.now() },
        });
      } else alert(data.message || "Failed to save");
    } catch (error) { console.error(error); } finally { setSaving(false); }
  };

  const handleDeleteSetPrice = async (prize) => {
    const groupedIds = Array.isArray(prize?.grouped_ids) && prize.grouped_ids.length > 0
      ? prize.grouped_ids
      : [prize?.id || prize?._id || ''].filter(Boolean);
    const priceId = groupedIds[0] || '';
    const zoneName = prize?.zone_name || 'this zone';
    const vehicleName = prize?.vehicle_type_name || 'this vehicle type';

    if (!priceId) {
      alert('Pricing rule id is missing for this row.');
      return;
    }

    if (!window.confirm(`Delete the pricing rule for "${zoneName}" and "${vehicleName}"?`)) {
      return;
    }

    try {
      const responses = await Promise.all(groupedIds.map((id) => adminService.deleteSetPrice(id)));
      const hasFailure = responses.some((response) => !response?.data?.success);
      if (!hasFailure) {
        setPrizes((previous) =>
          previous.filter((item) => {
            const itemIds = Array.isArray(item?.grouped_ids) && item.grouped_ids.length > 0
              ? item.grouped_ids
              : [item?.id || item?._id || ''].filter(Boolean);
            return !itemIds.some((id) => groupedIds.includes(String(id)));
          }),
        );
        fetchInitialData();
        return;
      }

      alert('Failed to delete one or more grouped pricing rules.');
    } catch (error) {
      console.error('Delete set price error:', error);
      alert(error?.response?.data?.message || 'Failed to delete pricing rule.');
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FD] flex flex-col font-sans">
      <AnimatePresence mode="wait">
        {view === 'list' ? (
          <motion.div 
            key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="p-3 lg:p-4 space-y-3"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 pb-2 mb-3">
               <h1 className="text-2xl font-bold text-[#1E293B]" style={{ fontFamily: '"Times New Roman", Times, serif' }}>Set Prices</h1>
               <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-medium tracking-tight">
                  <span className="hover:text-slate-600 transition-colors cursor-pointer" onClick={() => fetchInitialData()}>Set Prices</span>
                  <ChevronRight size={10} className="text-slate-300" />
                  <span className="text-slate-800 font-bold">Listing</span>
               </div>
            </div>

            <div className="bg-white rounded-md border border-gray-100 shadow-sm overflow-hidden">
               <div className="border-b border-gray-50 bg-white px-4 py-3 space-y-2">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex flex-wrap items-center gap-2 text-sm text-slate-400 font-medium">
                    <span>show</span>
                      <div className="relative">
                        <select
                          value={itemsPerPage}
                          onChange={(event) => {
                            setItemsPerPage(Number(event.target.value) || 10);
                            setPage(1);
                          }}
                          className="appearance-none bg-white border border-gray-200 rounded px-4 py-1.5 pr-8 focus:outline-none focus:border-indigo-500 cursor-pointer text-slate-700 font-bold text-[13px]"
                        >
                          {[10, 25, 50].map((value) => (
                            <option key={value} value={value}>{value}</option>
                          ))}
                        </select>
                        <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      </div>
                      <span>entries</span>
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <div className="relative min-w-[200px]">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          value={searchTerm}
                          onChange={(event) => {
                            setSearchTerm(event.target.value);
                            setPage(1);
                          }}
                          placeholder="Search zone, vehicle, location..."
                          className="w-full rounded-md border border-gray-200 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-700 outline-none transition-all focus:border-indigo-500"
                        />
                      </div>
                      <button
                        onClick={() => fetchInitialData()}
                        className={`w-8 h-8 flex items-center justify-center bg-white border border-gray-200 rounded-full text-slate-400 hover:text-indigo-600 transition-all shadow-sm ${loading ? 'animate-spin' : ''}`}
                      >
                        {loading ? <Loader2 size={14} /> : <Search size={14} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowFilters((current) => !current)}
                        className={`flex items-center gap-1.5 px-4 py-1.5 rounded text-xs font-bold shadow-sm transition-colors ${showFilters ? 'bg-yellow-400 text-black' : 'bg-gray-100 hover:bg-gray-200 text-slate-700'}`}
                      >
                        <Filter size={14} /> Filters
                      </button>
                      <button onClick={() => navigate('/admin/pricing/set-price/create')} className="flex items-center gap-1.5 px-4 py-1.5 bg-yellow-400 hover:bg-yellow-500 text-black rounded text-xs font-bold shadow-sm">
                        <Plus size={14} /> Add Set Price
                      </button>
                    </div>
                  </div>

                  {showFilters ? (
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <div className="relative">
                        <select
                          value={transportFilter}
                          onChange={(event) => {
                            setTransportFilter(event.target.value);
                            setPage(1);
                          }}
                          className={`${inputClass} appearance-none pr-10`}
                        >
                          <option value="">All transport types</option>
                          <option value="taxi">Taxi</option>
                          <option value="delivery">Delivery</option>
                          <option value="pooling">Pooling</option>
                          <option value="both">Both</option>
                        </select>
                        <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      </div>

                      <div className="relative">
                        <select
                          value={statusFilter}
                          onChange={(event) => {
                            setStatusFilter(event.target.value);
                            setPage(1);
                          }}
                          className={`${inputClass} appearance-none pr-10`}
                        >
                          <option value="">All statuses</option>
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
                        <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      </div>

                      <div className="relative">
                        <select
                          value={zoneFilter}
                          onChange={(event) => {
                            setZoneFilter(event.target.value);
                            setPage(1);
                          }}
                          className={`${inputClass} appearance-none pr-10`}
                        >
                          <option value="">All zones</option>
                          <option value={ALL_ZONES_OPTION_VALUE}>All</option>
                          {zones.map((zone) => (
                            <option key={zone._id || zone.id} value={zone._id || zone.id}>{zone.name}</option>
                          ))}
                        </select>
                        <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      </div>

                      <div className="relative">
                        <select
                          value={vehicleFilter}
                          onChange={(event) => {
                            setVehicleFilter(event.target.value);
                            setPage(1);
                          }}
                          className={`${inputClass} appearance-none pr-10`}
                        >
                          <option value="">All vehicle types</option>
                          {vehicleTypes.map((vehicle) => (
                            <option key={vehicle._id || vehicle.id} value={vehicle._id || vehicle.id}>{vehicle.name}</option>
                          ))}
                        </select>
                        <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      </div>

                      <div className="md:col-span-2 xl:col-span-4 flex justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            setTransportFilter('');
                            setStatusFilter('');
                            setZoneFilter('');
                            setVehicleFilter('');
                            setSearchTerm('');
                            setPage(1);
                          }}
                          className="rounded-md border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
                        >
                          Clear filters
                        </button>
                      </div>
                    </div>
                  ) : null}
               </div>

                <div className="overflow-x-auto">
                 <table className="w-full text-left">
                   <thead className="bg-[#FBFCFF]">
                     <tr className="border-b border-gray-100 text-sm font-semibold text-slate-700">
                        <th className="px-4 py-2">Zone</th>
                        <th className="px-4 py-2">Transport Type</th>
                        <th className="px-4 py-2">Vehicle Type</th>
                        <th className="px-4 py-2">Status</th>
                        <th className="px-4 py-2 text-right pr-6">Action</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-gray-50">
                    {loading && prizes.length === 0 ? (
                       <tr><td colSpan="5" className="py-12 text-center text-slate-300 font-bold uppercase tracking-widest text-xs animate-pulse">Syncing Price Matrix...</td></tr>
                    ) : prizes.length === 0 ? (
                       <tr><td colSpan="5" className="py-12 text-center text-slate-400 italic text-xs">No price rules matched the current search or filters.</td></tr>
                    ) : (
                      prizes.map((prize) => (
                        <tr key={prize.id || prize._id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-4 py-2 text-xs font-semibold text-slate-700 capitalize">{(prize.zone_name || 'India').toLowerCase()}</td>
                          <td className="px-4 py-2 text-xs text-slate-600 font-medium">
                            {prize.transport_type === 'both' ? 'All' : (prize.transport_type === 'taxi' ? 'Ride Hailing' : (prize.transport_type || 'All'))}
                          </td>
                          <td className="px-4 py-2 text-xs text-slate-800 font-bold capitalize">{(prize.vehicle_type_name || 'Premium Car').toLowerCase()}</td>
                          <td className="px-4 py-2">
                             <StatusToggle active={Number(prize.active) === 1} onToggle={async () => {
                               try {
                                 const idsToToggle = Array.isArray(prize.grouped_ids) && prize.grouped_ids.length > 0
                                   ? prize.grouped_ids
                                   : [prize.id || prize._id].filter(Boolean);
                                 await Promise.all(idsToToggle.map((targetId) =>
                                   fetch(`${baseUrl}/types/set-prices/${targetId}`, {
                                     method: 'PATCH',
                                     headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                                     body: JSON.stringify({ active: Number(prize.active) === 1 ? 0 : 1 })
                                   })
                                 ));
                                 fetchInitialData();
                               } catch(e) {}
                             }} />
                          </td>
                          <td className="px-4 py-2 text-right pr-6">
                              <div className="flex items-center justify-end gap-1.5">
                                 <button title="Edit Price" onClick={() => navigate(`/admin/pricing/set-price/edit/${prize.id || prize._id}`)} className="w-7 h-7 flex items-center justify-center bg-[#FFF7ED] text-[#F97316] rounded transition-colors hover:bg-orange-100"><Edit2 size={12} /></button>
                                 <button 
                                   title="Incentive"
                                   onClick={() => navigate('/admin/pricing/package-pricing')}
                                   className="w-7 h-7 flex items-center justify-center bg-[#F0FDFA] text-[#14B8A6] rounded transition-colors hover:bg-emerald-100"
                                 >
                                    <Gift size={12} />
                                 </button>
                                 <button 
                                   title="Surge Pricing"
                                   onClick={() => navigate(`/admin/pricing/set-price/surge/${prize.id || prize._id}`)}
                                   className="w-7 h-7 flex items-center justify-center bg-[#FEF2F2] text-[#EF4444] rounded transition-colors hover:bg-red-100"
                                 >
                                    <Zap size={12} />
                                 </button>
                                 <button 
                                   title="Airport/Outstation Setting"
                                   onClick={() => navigate(`/admin/pricing/set-price/incentive/${prize.id || prize._id}`)}
                                   className="w-7 h-7 flex items-center justify-center bg-[#EEF2FF] text-[#6366F1] rounded transition-colors hover:bg-indigo-100"
                                 >
                                    <Cone size={12} />
                                 </button>
                                 <button
                                   title="Delete"
                                   onClick={() => handleDeleteSetPrice(prize)}
                                   className="w-7 h-7 flex items-center justify-center bg-[#FEF2F2] text-[#DC2626] rounded transition-colors hover:bg-red-100"
                                 >
                                    <Trash2 size={12} />
                                 </button>
                             </div>
                          </td>
                        </tr>
                      ))
                   )}
                   </tbody>
                 </table>
               </div>

               <div className="flex flex-col gap-3 border-t border-gray-100 px-4 py-2.5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                 <span>
                   Showing {paginator.from || 0} to {paginator.to || 0} of {paginator.total || 0} entries
                 </span>
                 <div className="flex items-center gap-2">
                   <button
                     type="button"
                     onClick={() => setPage((current) => Math.max(1, current - 1))}
                     disabled={Number(paginator.current_page || page) <= 1}
                     className="flex items-center gap-1 rounded border border-gray-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition disabled:opacity-50"
                   >
                     <ChevronLeft size={14} />
                     Prev
                   </button>
                   <span className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white">
                     Page {paginator.current_page || page} / {Math.max(1, Number(paginator.last_page || 1))}
                   </span>
                   <button
                     type="button"
                     onClick={() => setPage((current) => Math.min(Math.max(1, Number(paginator.last_page || 1)), current + 1))}
                     disabled={Number(paginator.current_page || page) >= Math.max(1, Number(paginator.last_page || 1))}
                     className="rounded border border-gray-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition disabled:opacity-50"
                   >
                     Next
                   </button>
                 </div>
               </div>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="create" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="p-3 lg:p-4 space-y-3"
          >
            {/* Form Header */}
            <div className="flex items-center justify-between border-b border-gray-100 pb-1 mb-2">
               <h1 className="text-xl font-bold text-[#1E293B]" style={{ fontFamily: '"Times New Roman", Times, serif' }}>{mode === 'edit' ? 'Edit Set Price' : 'Create Set Price'}</h1>
               <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-medium">
                  <span className="hover:text-slate-600 transition-colors cursor-pointer" onClick={() => navigate('/admin/pricing/set-price')}>Set Prices</span>
                  <ChevronRight size={10} className="text-slate-300" />
                  <span className="text-slate-800 font-bold">{mode === 'edit' ? 'Edit' : 'Create'}</span>
               </div>
            </div>

            <div className="bg-white rounded-md border border-gray-100 shadow-sm p-2 relative">
               {loading && mode === 'edit' && (
                  <div className="absolute inset-0 bg-white/80 z-20 flex flex-col items-center justify-center gap-4">
                     <Loader2 className="animate-spin text-indigo-600" size={40} />
                     <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Hydrating Form State...</p>
                  </div>
               )}
               
               <div className="flex justify-end mb-2">
                  <button type="button" onClick={() => setShowHowItWorks(true)} className="text-[10px] font-bold text-[#00BFA5] underline decoration-dotted underline-offset-4">How It Works</button>
               </div>

               <form onSubmit={handleSave} className="space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-2 gap-y-1">
                     {/* Top Section */}
                     <div>
                        <label className={labelClass}>Zone <span className="text-rose-500">*</span></label>
                        <div className="relative">
                           <select required className={inputClass + " appearance-none cursor-pointer"} value={formData.zone_id} onChange={e => setFormData(p=>({...p, zone_id: e.target.value}))}>
                              <option value="">Select Zone</option>
                              <option value={ALL_ZONES_OPTION_VALUE}>All Zones</option>
                              {zones.map(z => <option key={z._id || z.id} value={z._id || z.id}>{z.name}</option>)}
                           </select>
                           <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        </div>
                        {isAllZonesSelection(formData.zone_id) && (
                          <p className="mt-2 text-[11px] font-medium text-slate-400">
                            Saving with <span className="font-black text-slate-600">All Zones</span> creates one global pricing rule for this vehicle type that applies when a zone-specific rule is not set.
                          </p>
                        )}
                     </div>
                     <div>
                        <label className={labelClass}>Vehicle Type <span className="text-rose-500">*</span></label>
                        <div className="relative">
                           <select required className={inputClass + " appearance-none cursor-pointer"} value={formData.vehicle_type} onChange={e => setFormData(p=>({...p, vehicle_type: e.target.value}))}>
                              <option value="">Select Vehicle Type</option>
                              {vehicleTypes.map(v => <option key={v._id || v.id} value={v._id || v.id}>{v.name}</option>)}
                           </select>
                           <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        </div>
                        <p className="mt-2 text-[11px] font-medium text-slate-400">
                          Transport type is taken from the selected vehicle type:
                          {' '}
                          <span className="font-black uppercase tracking-[0.12em] text-slate-600">
                            {formatTransportTypeLabel(derivedTransportType || formData.transport_type)}
                          </span>
                        </p>
                     </div>
                  </div>

                  <div className="border-t border-gray-100 pt-1 mt-1">
                        <label className={labelClass}>Payment Type <span className="text-rose-500">*</span></label>
                        <div className="space-y-1 mt-0.5">
                           <div className="flex flex-wrap gap-2">
                              {paymentTypeOptions.map((option) => {
                                const isSelected = normalizePaymentTypes(formData.payment_type).includes(option.value);

                                return (
                                  <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => setFormData((previous) => ({
                                      ...previous,
                                      payment_type: togglePaymentType(previous.payment_type, option.value),
                                    }))}
                                    className={`rounded border px-2 py-1 text-left transition-all ${
                                      isSelected
                                        ? 'border-emerald-300 bg-emerald-50 shadow-sm'
                                        : 'border-gray-200 bg-white hover:border-indigo-300'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2">
                                      <div
                                        className={`flex h-4 w-4 items-center justify-center rounded border text-[10px] font-black ${
                                          isSelected
                                            ? 'border-emerald-500 bg-emerald-500 text-white'
                                            : 'border-slate-300 bg-white text-transparent'
                                        }`}
                                      >
                                        ✓
                                      </div>
                                      <div>
                                        <p className="text-[10px] font-bold text-slate-800 leading-none">{option.label}</p>
                                      </div>
                                    </div>
                                  </button>
                                );
                              })}
                           </div>
                           <input
                             type="hidden"
                             required
                             value={normalizePaymentTypes(formData.payment_type).join(',')}
                             onChange={() => {}}
                           />
                        </div>
                     </div>
                     <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-2 gap-y-1 pt-1 mt-1 border-t border-gray-100">
                     <div>
                        <label className={labelClass}>Admin Comm. (Driver) <span className="text-rose-500">*</span></label>
                        <div className="flex gap-1">
                           <select className={inputClass + " w-20 py-1"} value={formData.admin_commission_type_from_driver} onChange={e => setFormData(p=>({...p, admin_commission_type_from_driver: e.target.value}))}>
                              <option value="1">%</option>
                              <option value="2">Fixed</option>
                           </select>
                           <input type="number" min="0" required className={inputClass + " py-1"} value={formData.admin_commission_from_driver} onChange={e => setFormData(p=>({...p, admin_commission_from_driver: clampNonNegativeInput('admin_commission_from_driver', e.target.value)}))} />
                        </div>
                     </div>
                     <div>
                        <label className={labelClass}>Admin Comm. (Owner) <span className="text-rose-500">*</span></label>
                        <div className="flex gap-1">
                           <select className={inputClass + " w-20 py-1"} value={formData.admin_commission_type_for_owner} onChange={e => setFormData(p=>({...p, admin_commission_type_for_owner: e.target.value}))}>
                              <option value="1">%</option>
                              <option value="2">Fixed</option>
                           </select>
                           <input type="number" min="0" required className={inputClass + " py-1"} value={formData.admin_commission_for_owner} onChange={e => setFormData(p=>({...p, admin_commission_for_owner: clampNonNegativeInput('admin_commission_for_owner', e.target.value)}))} />
                        </div>
                     </div>
                     <div>
                        <label className={labelClass}>Service Tax (%) <span className="text-rose-500">*</span></label>
                        <input type="number" min="0" required className={inputClass + " py-1"} value={formData.service_tax} onChange={e => setFormData(p=>({...p, service_tax: clampNonNegativeInput('service_tax', e.target.value)}))} />
                     </div>
                     <div>
                        <label className={labelClass}>Base Price <span className="text-rose-500">*</span></label>
                        <input type="number" min="0" required className={inputClass + " py-1"} value={formData.base_price} onChange={e => setFormData(p=>({...p, base_price: clampNonNegativeInput('base_price', e.target.value)}))} />
                     </div>
                     <div>
                        <label className={labelClass}>Base Distance <span className="text-rose-500">*</span></label>
                        <input type="number" min="0" required className={inputClass + " py-1"} value={formData.base_distance} onChange={e => setFormData(p=>({...p, base_distance: clampNonNegativeInput('base_distance', e.target.value)}))} />
                     </div>
                     <div>
                        <label className={labelClass}>Price / Distance <span className="text-rose-500">*</span></label>
                        <input type="number" min="0" required className={inputClass + " py-1"} value={formData.price_per_distance} onChange={e => setFormData(p=>({...p, price_per_distance: clampNonNegativeInput('price_per_distance', e.target.value)}))} />
                     </div>
                     <div>
                        <label className={labelClass}>Time Price / Min <span className="text-rose-500">*</span></label>
                        <input type="number" min="0" required className={inputClass + " py-1"} value={formData.time_price} onChange={e => setFormData(p=>({...p, time_price: clampNonNegativeInput('time_price', e.target.value)}))} />
                     </div>
                     <div>
                        <label className={labelClass}>Waiting Charge <span className="text-rose-500">*</span></label>
                        <input type="number" min="0" required className={inputClass + " py-1"} value={formData.waiting_charge} onChange={e => setFormData(p=>({...p, waiting_charge: clampNonNegativeInput('waiting_charge', e.target.value)}))} />
                     </div>
                     <div>
                        <label className={labelClass}>Free Wait (Before) <span className="text-rose-500">*</span></label>
                        <input type="number" min="0" required className={inputClass + " py-1"} value={formData.free_waiting_before} onChange={e => setFormData(p=>({...p, free_waiting_before: clampNonNegativeInput('free_waiting_before', e.target.value)}))} />
                     </div>
                     <div>
                        <label className={labelClass}>Free Wait (After) <span className="text-rose-500">*</span></label>
                        <input type="number" min="0" required className={inputClass + " py-1"} value={formData.free_waiting_after} onChange={e => setFormData(p=>({...p, free_waiting_after: clampNonNegativeInput('free_waiting_after', e.target.value)}))} />
                     </div>
                     <div className="col-span-full grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-2 gap-y-1 pt-1 border-t border-gray-100 mt-1">
                        <div className="flex items-center gap-1">
                           <input type="checkbox" className="w-3 h-3 rounded border-gray-300" checked={formData.enable_airport_ride} onChange={e => setFormData(p=>({...p, enable_airport_ride: e.target.checked}))} />
                           <span className="text-[10px] font-semibold text-gray-700">Airport Ride</span>
                        </div>
                        <div className="flex items-center gap-1">
                           <input type="checkbox" className="w-3 h-3 rounded border-gray-300" checked={formData.enable_outstation_ride} onChange={e => setFormData(p=>({...p, enable_outstation_ride: e.target.checked}))} />
                           <span className="text-[10px] font-semibold text-gray-700">Outstation Ride</span>
                        </div>
                     </div>

                     {formData.enable_airport_ride && (
                        <div className="col-span-1 sm:col-span-2 md:col-span-4 lg:col-span-6 flex gap-2">
                           <div className="flex-1"><label className={labelClass}>Airport Surge</label><input type="number" className={inputClass + " py-1"} value={formData.airport_surge} onChange={e => setFormData(p=>({...p, airport_surge: e.target.value}))} /></div>
                           <div className="flex-1"><label className={labelClass}>Support Fee</label><input type="number" className={inputClass + " py-1"} value={formData.support_airport_fee} onChange={e => setFormData(p=>({...p, support_airport_fee: e.target.value}))} /></div>
                        </div>
                     )}

                     {formData.enable_outstation_ride && (
                        <div className="col-span-1 sm:col-span-2 md:col-span-4 lg:col-span-6 flex gap-2">
                           <div className="flex-1"><label className={labelClass}>Out. Base</label><input type="number" className={inputClass + " py-1"} value={formData.outstation_base_price} onChange={e => setFormData(p=>({...p, outstation_base_price: e.target.value}))} /></div>
                           <div className="flex-1"><label className={labelClass}>Out. Dist</label><input type="number" className={inputClass + " py-1"} value={formData.outstation_base_distance} onChange={e => setFormData(p=>({...p, outstation_base_distance: e.target.value}))} /></div>
                           <div className="flex-1"><label className={labelClass}>Out. Price/Dist</label><input type="number" className={inputClass + " py-1"} value={formData.outstation_price_per_distance} onChange={e => setFormData(p=>({...p, outstation_price_per_distance: e.target.value}))} /></div>
                        </div>
                     )}
                  </div>

                  {/* Section: Cancellation Fee */}
                  <div className="space-y-1 pt-1 mt-1 border-t border-gray-100">
                     <h2 className="text-[10px] font-bold text-[#1E293B] uppercase tracking-wider">Cancellation Fee</h2>
                     <div className="grid grid-cols-1 md:grid-cols-3 gap-x-2 gap-y-1">
                        <div>
                           <label className={labelClass}>Cancellation Fee for User <span className="text-rose-500">*</span></label>
                           <div className="flex border border-gray-200 rounded-md overflow-hidden focus-within:border-indigo-500">
                              <select className="bg-gray-50 px-3 text-[11px] font-black border-r outline-none cursor-pointer" value={formData.user_cancellation_fee_type} onChange={e => setFormData(p=>({...p, user_cancellation_fee_type: e.target.value}))}>
                                 <option value="percentage">%</option>
                                 <option value="fixed">FIXED</option>
                              </select>
                              <input type="number" min="0" className="flex-1 px-2.5 py-1.5 text-xs outline-none" placeholder="User Cancellation Fee" value={formData.user_cancellation_fee} onChange={e => setFormData(p=>({...p, user_cancellation_fee: clampNonNegativeInput('user_cancellation_fee', e.target.value)}))} />
                           </div>
                        </div>
                        <div>
                           <label className={labelClass}>Cancellation Fee for Driver <span className="text-rose-500">*</span></label>
                           <div className="flex border border-gray-200 rounded-md overflow-hidden focus-within:border-indigo-500">
                              <select className="bg-gray-50 px-3 text-[11px] font-black border-r outline-none cursor-pointer" value={formData.driver_cancellation_fee_type} onChange={e => setFormData(p=>({...p, driver_cancellation_fee_type: e.target.value}))}>
                                 <option value="percentage">%</option>
                                 <option value="fixed">FIXED</option>
                              </select>
                              <input type="number" min="0" className="flex-1 px-2.5 py-1.5 text-xs outline-none" placeholder="Driver Cancellation Fee" value={formData.driver_cancellation_fee} onChange={e => setFormData(p=>({...p, driver_cancellation_fee: clampNonNegativeInput('driver_cancellation_fee', e.target.value)}))} />
                           </div>
                        </div>
                        <div>
                           <label className={labelClass}>Fee Goes to <span className="text-rose-500">*</span></label>
                           <div className="relative">
                              <select required className={inputClass + " appearance-none cursor-pointer"} value={formData.cancellation_fee_goes_to} onChange={e => setFormData(p=>({...p, cancellation_fee_goes_to: e.target.value}))}>
                                 <option value="">Select who get cancellation fee</option>
                                 <option value="admin">Admin</option>
                                 <option value="driver">Driver</option>
                              </select>
                              <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            </div>
                         </div>
                      </div>
                   </div>

                  {/* Footer Action */}
                  <div className="pt-2 flex justify-end border-t border-gray-50 mt-1">
                     <button type="submit" disabled={saving} className="px-6 py-1.5 bg-yellow-400 text-black rounded text-xs font-bold shadow-lg hover:opacity-90 transition-all active:scale-95 flex items-center gap-2">
                        {saving && <Loader2 size={16} className="animate-spin" />}
                        {saving ? 'Saving Changes...' : 'Save'}
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
                       <h3 className="text-xs font-bold text-[#1E293B] uppercase tracking-wider">How It Works</h3>
                       <button onClick={() => setShowHowItWorks(false)} className="p-1.5 text-gray-400 hover:text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-full transition-colors"><X size={14} /></button>
                     </div>
                     <div className="space-y-3 text-xs text-gray-600">
                       <div>
                         <p className="font-bold text-gray-800 mb-0.5 flex items-center gap-1.5"><MapPin size={12} className="text-[#00BFA5]"/> Zone</p>
                         <p className="leading-snug text-gray-500 pl-4.5">Select the geographical area where this pricing applies.</p>
                       </div>
                       <div>
                         <p className="font-bold text-gray-800 mb-0.5 flex items-center gap-1.5"><Car size={12} className="text-[#00BFA5]"/> Vehicle Type</p>
                         <p className="leading-snug text-gray-500 pl-4.5">The vehicle category (e.g. Mini, SUV). This automatically sets the transport type.</p>
                       </div>
                       <div>
                         <p className="font-bold text-gray-800 mb-0.5 flex items-center gap-1.5"><CreditCard size={12} className="text-[#00BFA5]"/> Payment Type</p>
                         <p className="leading-snug text-gray-500 pl-4.5">Allowed payment methods for this ride type.</p>
                       </div>
                       <div>
                         <p className="font-bold text-gray-800 mb-0.5 flex items-center gap-1.5"><DollarSign size={12} className="text-[#00BFA5]"/> Commission</p>
                         <p className="leading-snug text-gray-500 pl-4.5">Platform earnings rules for drivers and fleet owners.</p>
                       </div>
                       <div>
                         <p className="font-bold text-gray-800 mb-0.5 flex items-center gap-1.5"><ShieldCheck size={12} className="text-[#00BFA5]"/> Cancellation Fee</p>
                         <p className="leading-snug text-gray-500 pl-4.5">Charges applied if the user or driver cancels the ride.</p>
                       </div>
                       <div>
                         <p className="font-bold text-gray-800 mb-0.5 flex items-center gap-1.5"><Globe size={12} className="text-[#00BFA5]"/> Airport / Outstation</p>
                         <p className="leading-snug text-gray-500 pl-4.5">Enable toggles to add special pricing rules for airport trips or inter-city outstation rides.</p>
                       </div>
                     </div>
                   </motion.div>
                 )}
               </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SetPrices;
