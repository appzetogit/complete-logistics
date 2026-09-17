import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { Autocomplete, GoogleMap, MarkerF, Polygon } from '@react-google-maps/api';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  Building2,
  Car,
  ChevronRight,
  Edit2,
  Loader2,
  MapPin,
  Plus,
  Users,
  Save,
  Search,
  Trash2,
  ShieldCheck,
  AlertCircle,
  Phone,
  LayoutGrid
} from 'lucide-react';
import { adminService } from '../../services/adminService';
import { INDIA_CENTER, useAppGoogleMapsLoader } from '../../utils/googleMaps';

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-slate-900 focus:ring-4 focus:ring-slate-900/5';
const labelClass = 'mb-2 block text-xs font-semibold text-slate-600';

const defaultFormData = {
  name: '',
  zone_id: '',
  address: '',
  owner_name: '',
  owner_phone: '',
  latitude: '',
  longitude: '',
  status: 'active',
};

const defaultStaffFormData = {
  name: '',
  phone: '',
};

const getZoneBoundary = (zone) =>
  Array.isArray(zone?.coordinates)
    ? zone.coordinates
        .map((point) => ({
          lat: Number(point?.lat),
          lng: Number(point?.lng),
        }))
        .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng))
    : [];

const ServiceStores = ({ mode: initialMode = 'list' }) => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [view, setView] = useState(initialMode);
  const [stores, setStores] = useState([]);
  const [pendingStores, setPendingStores] = useState([]);
  const [pendingStaff, setPendingStaff] = useState([]);
  const [zones, setZones] = useState([]);
  const [serviceLocations, setServiceLocations] = useState([]);
  const [rentalVehicles, setRentalVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStoreId, setSelectedStoreId] = useState(id || null);
  const [formData, setFormData] = useState(defaultFormData);
  const [staffFormData, setStaffFormData] = useState(defaultStaffFormData);
  const [zoneBoundary, setZoneBoundary] = useState([]);
  const [mapCenter, setMapCenter] = useState(INDIA_CENTER);
  const [autocomplete, setAutocomplete] = useState(null);
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);
  const [addingStaff, setAddingStaff] = useState(false);
  const mapRef = useRef(null);
  const geocoderRef = useRef(null);
  const reverseGeocodeRequestRef = useRef(0);
  const { isLoaded } = useAppGoogleMapsLoader();

  const serviceLocationMap = useMemo(
    () =>
      new Map(
        serviceLocations.map((location) => [String(location._id || location.id), location]),
      ),
    [serviceLocations],
  );

  const getZoneCenter = (zone) => {
    const boundary = getZoneBoundary(zone);
    if (boundary.length > 0) {
      return boundary[0];
    }
    const locationId = zone?.service_location_id || zone?.service_location_id?._id;
    const serviceLocation = serviceLocationMap.get(String(locationId || ''));
    const lat = Number(serviceLocation?.latitude);
    const lng = Number(serviceLocation?.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    return INDIA_CENTER;
  };

  const resetFormState = () => {
    setSelectedStoreId(null);
    setFormData(defaultFormData);
    setStaffFormData(defaultStaffFormData);
    setZoneBoundary([]);
    setMapCenter(INDIA_CENTER);
  };

  useEffect(() => {
    setView(initialMode);
    if (initialMode === 'list') resetFormState();
  }, [initialMode]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [storesRes, zonesRes, locationsRes, pendingStoresRes, pendingStaffRes] = await Promise.allSettled([
        adminService.getServiceStores(),
        adminService.getZones(),
        adminService.getServiceLocations(),
        adminService.getPendingServiceStores(),
        adminService.getPendingServiceStoreStaff(),
      ]);
      const nextStores = storesRes.status === 'fulfilled' ? (storesRes.value?.data?.data?.results || storesRes.value?.data?.results || storesRes.value?.results || []) : [];
      const nextZones = zonesRes.status === 'fulfilled' ? (zonesRes.value?.data?.data?.results || zonesRes.value?.data?.results || zonesRes.value?.results || []) : [];
      const nextServiceLocations = locationsRes.status === 'fulfilled' ? (locationsRes.value?.data?.data || locationsRes.value?.data?.results || locationsRes.value?.results || []) : [];

      setStores(nextStores);
      setZones(nextZones);
      setServiceLocations(nextServiceLocations);
      setPendingStores(pendingStoresRes.status === 'fulfilled' ? (pendingStoresRes.value?.data?.data?.results || pendingStoresRes.value?.data?.results || []) : []);
      setPendingStaff(pendingStaffRes.status === 'fulfilled' ? (pendingStaffRes.value?.data?.data?.results || pendingStaffRes.value?.data?.results || []) : []);

      if (id && initialMode === 'edit') {
        const store = nextStores.find(s => String(s._id || s.id) === String(id));
        if (store) handleEdit(store, nextZones, nextServiceLocations);
      }
    } finally { setLoading(false); }

    // Vehicle assignment counts are secondary; don't block the page on them.
    adminService.getRentalVehicleTypes()
      .then((response) => {
        const nextRentalVehicles = response?.data?.data?.results || response?.data?.results || response?.results || [];
        setRentalVehicles(Array.isArray(nextRentalVehicles) ? nextRentalVehicles : []);
      })
      .catch(() => {
        setRentalVehicles([]);
      });
  };

  useEffect(() => { fetchData(); }, []);

  useEffect(() => {
    if (id && zones.length > 0 && stores.length > 0 && initialMode === 'edit') {
      const store = stores.find(s => String(s._id || s.id) === String(id));
      if (store) handleEdit(store, zones, serviceLocations);
    }
  }, [id, initialMode, stores, zones]);

  const selectedZone = useMemo(() => zones.find(z => String(z._id || z.id) === String(formData.zone_id)), [formData.zone_id, zones]);
  const selectedServiceLocation = useMemo(() => {
    const locId = selectedZone?.service_location_id?._id || selectedZone?.service_location_id;
    return serviceLocationMap.get(String(locId || '')) || null;
  }, [selectedZone, serviceLocationMap]);

  const filteredStores = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return stores;
    return stores.filter(s => {
      const zoneName = s.zone_id?.name || zones.find(z => String(z._id || z.id) === String(s.zone_id))?.name || '';
      return [s.name, s.owner_name, s.owner_phone, zoneName, s.address].some(v => String(v || '').toLowerCase().includes(q));
    });
  }, [searchTerm, stores, zones]);

  const selectedStore = useMemo(() => stores.find(s => String(s._id || s.id) === String(selectedStoreId)), [selectedStoreId, stores]);
  const selectedStoreStaff = useMemo(() => Array.isArray(selectedStore?.staff) ? selectedStore.staff : [], [selectedStore]);
  const selectedStoreVehicles = useMemo(() => rentalVehicles.filter(v => Array.isArray(v.serviceStoreIds) && v.serviceStoreIds.some(sid => String(sid) === String(selectedStoreId))), [rentalVehicles, selectedStoreId]);

  const fillAddressFromCoordinates = (lat, lng) => {
    if (!window.google?.maps?.Geocoder) return;
    const geocoder = geocoderRef.current || new window.google.maps.Geocoder();
    geocoderRef.current = geocoder;
    setIsResolvingAddress(true);
    geocoder.geocode({ location: { lat, lng } }, (results, status) => {
      setIsResolvingAddress(false);
      if (status === 'OK' && results[0]) {
        setFormData(prev => ({ ...prev, address: results[0].formatted_address }));
      }
    });
  };

  const updatePinnedLocation = (lat, lng, opts = {}) => {
    const nLat = Number(lat), nLng = Number(lng);
    if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) return;
    setFormData(prev => ({ ...prev, latitude: nLat.toFixed(6), longitude: nLng.toFixed(6), address: opts.address || prev.address }));
    setMapCenter({ lat: nLat, lng: nLng });
    if (!opts.address && !opts.skipLookup) fillAddressFromCoordinates(nLat, nLng);
  };

  const handleZoneChange = (zid) => {
    setFormData(prev => ({ ...prev, zone_id: zid }));
    const zone = zones.find(z => String(z._id || z.id) === String(zid));
    setZoneBoundary(getZoneBoundary(zone));
    const center = getZoneCenter(zone);
    setMapCenter(center);
    mapRef.current?.panTo(center);
  };

  const handleEdit = (store, zItems = zones) => {
    setSelectedStoreId(store._id || store.id);
    const zid = store.zone_id?._id || store.zone_id || '';
    const zone = zItems.find(z => String(z._id || z.id) === String(zid));
    setFormData({
      name: store.name || '',
      zone_id: zid,
      address: store.address || '',
      owner_name: store.owner_name || '',
      owner_phone: store.owner_phone || '',
      latitude: store.latitude ?? '',
      longitude: store.longitude ?? '',
      status: store.status || 'active',
    });
    setZoneBoundary(getZoneBoundary(zone));
    const lat = Number(store.latitude), lng = Number(store.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) setMapCenter({ lat, lng });
    else setMapCenter(getZoneCenter(zone));
  };

  const handlePlaceChanged = () => {
    if (!autocomplete) return;
    const place = autocomplete.getPlace();
    const lat = place.geometry?.location?.lat(), lng = place.geometry?.location?.lng();
    if (lat && lng) {
      updatePinnedLocation(lat, lng, { address: place.formatted_address || place.name });
      mapRef.current?.panTo({ lat, lng });
    }
  };

  const handleSave = async () => {
    if (!formData.name.trim()) return toast.error('Store Name is required.');
    if (!formData.zone_id) return toast.error('Zone Association is required.');
    if (!formData.address.trim()) return toast.error('Physical Address is required.');
    
    const phoneRegex = /^\d{10,15}$/;
    if (!formData.owner_phone || !phoneRegex.test(formData.owner_phone.replace(/\D/g, ''))) {
      return toast.error('Valid Owner Contact number (10-15 digits) is required.');
    }
    
    if (!formData.latitude || !formData.longitude) return toast.error('Please pin the store on the map.');
    
    setSaving(true);
    try {
      const payload = { ...formData, latitude: Number(formData.latitude), longitude: Number(formData.longitude) };
      const res = selectedStoreId ? await adminService.updateServiceStore(selectedStoreId, payload) : await adminService.createServiceStore(payload);
      if (res?.data?.success || res?.success || res) {
        toast.success(selectedStoreId ? 'Store updated successfully' : 'Store created successfully');
        navigate('/admin/pricing/service-stores');
        fetchData();
      }
    } catch (e) { toast.error(e.response?.data?.message || 'Error saving store.'); } finally { setSaving(false); }
  };

  const handleAddStaff = async () => {
    if (!selectedStoreId) return alert('Save store first.');
    const name = staffFormData.name.trim(), phone = staffFormData.phone.replace(/\D/g, '').slice(-10);
    if (!name || phone.length !== 10) return alert('Valid name and 10-digit phone required.');
    setAddingStaff(true);
    try {
      const res = await adminService.createServiceStoreStaff(selectedStoreId, { name, phone });
      if (res) {
        fetchData();
        setStaffFormData(defaultStaffFormData);
        setAddingStaff(false);
      }
    } catch (e) { alert(e.response?.data?.message || 'Error adding staff.'); } finally { setAddingStaff(false); }
  };

  const handleDelete = async (sid) => {
    if (!window.confirm('Delete this store?')) return;
    try {
      const res = await adminService.deleteServiceStore(sid);
      if (res) fetchData();
    } catch (e) { alert('Delete failed.'); }
  };

  const handleApprovePendingStore = async (storeId) => {
    try {
      await adminService.approvePendingServiceStore(storeId);
      fetchData();
    } catch (error) {
      alert(error?.response?.data?.message || 'Unable to approve service center request.');
    }
  };

  const handleRejectPendingStore = async (storeId) => {
    const rejectionReason = window.prompt('Reason for rejection', '');
    if (rejectionReason === null) return;
    try {
      await adminService.rejectPendingServiceStore(storeId, rejectionReason);
      fetchData();
    } catch (error) {
      alert(error?.response?.data?.message || 'Unable to reject service center request.');
    }
  };

  const handleApprovePendingStaff = async (staffId) => {
    try {
      await adminService.approvePendingServiceStoreStaff(staffId);
      fetchData();
    } catch (error) {
      alert(error?.response?.data?.message || 'Unable to approve service staff request.');
    }
  };

  const handleRejectPendingStaff = async (staffId) => {
    const rejectionReason = window.prompt('Reason for rejection', '');
    if (rejectionReason === null) return;
    try {
      await adminService.rejectPendingServiceStoreStaff(staffId, rejectionReason);
      fetchData();
    } catch (error) {
      alert(error?.response?.data?.message || 'Unable to reject service staff request.');
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] p-4 lg:p-6 font-sans">
      <AnimatePresence mode="wait">
        {view === 'list' ? (
          <motion.div key="list" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="mx-auto max-w-7xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1 text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">
                  <span>Pricing</span><ChevronRight size={10} /><span className="text-slate-900">Stores</span>
                </div>
                <h1 className="text-xl font-bold text-slate-900">Service Stores</h1>
              </div>
              <button onClick={() => navigate('/admin/pricing/service-stores/add')} className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white shadow-md transition-all hover:scale-105">
                <Plus size={16} /> Add New Store
              </button>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {[{ label: 'Total Registry', val: stores.length, icon: Building2 }, { label: 'Pending Requests', val: pendingStores.length + pendingStaff.length, icon: Users }, { label: 'Active', val: stores.filter(s => s.status === 'active').length, icon: ShieldCheck }].map((s, i) => (
                <div key={i} className="rounded-2xl border border-yellow-100 bg-[#FFFDF0] p-4 shadow-sm">
                  <div className="flex justify-between mb-2"><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{s.label}</p><s.icon size={16} className="text-slate-300" /></div>
                  <p className="text-2xl font-black text-slate-900">{s.val}</p>
                </div>
              ))}
            </div>
            {(pendingStores.length > 0 || pendingStaff.length > 0) ? (
              <div className="grid gap-6 xl:grid-cols-2">
                <div className="rounded-[2.5rem] border border-amber-200 bg-white p-6 shadow-sm">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-amber-500">Pending Centers</p>
                      <h3 className="mt-1 text-xl font-black text-slate-900">{pendingStores.length} requests</h3>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {pendingStores.map((store) => (
                      <div key={store.id || store._id} className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                        <p className="text-sm font-black text-slate-900">{store.name}</p>
                        <p className="mt-1 text-xs font-bold text-slate-500">{store.owner_name || 'Owner'} - {store.owner_phone || 'No phone'}</p>
                        <p className="mt-1 text-xs text-slate-500">{store.address || 'No address'}</p>
                        <div className="mt-3 flex gap-2">
                          <button onClick={() => handleApprovePendingStore(store.id || store._id)} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white">Approve</button>
                          <button onClick={() => handleRejectPendingStore(store.id || store._id)} className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-black text-rose-600">Reject</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-[2.5rem] border border-rose-200 bg-white p-6 shadow-sm">
                  <div className="mb-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-rose-500">Pending Staff</p>
                    <h3 className="mt-1 text-xl font-black text-slate-900">{pendingStaff.length} requests</h3>
                  </div>
                  <div className="space-y-3">
                    {pendingStaff.map((staffItem) => (
                      <div key={staffItem.id || staffItem._id} className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                        <p className="text-sm font-black text-slate-900">{staffItem.name}</p>
                        <p className="mt-1 text-xs font-bold text-slate-500">{staffItem.phone}</p>
                        <p className="mt-1 text-xs text-slate-500">{staffItem.serviceCenterName || 'No center selected'}</p>
                        <div className="mt-3 flex gap-2">
                          <button onClick={() => handleApprovePendingStaff(staffItem.id || staffItem._id)} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white">Approve</button>
                          <button onClick={() => handleRejectPendingStaff(staffItem.id || staffItem._id)} className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-black text-rose-600">Reject</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
            <div className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 bg-slate-50/50 p-4">
                <div className="relative max-w-sm"><Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" /><input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search registry..." className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-4 text-xs font-bold text-slate-900 outline-none focus:border-slate-900 focus:ring-4 focus:ring-slate-900/5" /></div>
              </div>
              <div className="overflow-x-auto no-scrollbar">
                {loading ? <div className="py-24 text-center"><Loader2 size={32} className="animate-spin text-slate-900 mx-auto" /></div> : (
                  <table className="w-full text-left">
                    <thead><tr className="bg-slate-50/30 border-b border-slate-100">{['Identity', 'Zone', 'Owner', 'Fleet', 'Status', ''].map(h => <th key={h} className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">{h}</th>)}</tr></thead>
                    <tbody className="divide-y divide-slate-50">
                      {filteredStores.map(s => (
                        <tr key={s._id || s.id} className="group hover:bg-slate-50/30">
                          <td className="px-8 py-4 flex items-center gap-4"><div className="h-11 w-11 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-900 group-hover:bg-slate-900 group-hover:text-white transition-colors"><Building2 size={18} /></div><div><p className="text-[14px] font-bold text-slate-900">{s.name}</p><p className="text-[11px] text-slate-400 truncate max-w-[150px]">{s.address}</p></div></td>
                          <td className="px-8 py-4 text-[13px] font-bold text-slate-700">{s.zone_id?.name || zones.find(z => String(z._id || z.id) === String(s.zone_id))?.name || '-'}</td>
                          <td className="px-8 py-4"><p className="text-[13px] font-bold text-slate-900">{s.owner_name}</p><p className="text-[11px] text-slate-400">{s.owner_phone}</p></td>
                          <td className="px-8 py-4"><div className="flex gap-4"><div className="flex items-center gap-1.5"><Users size={14} className="text-slate-300"/><span className="text-[13px] font-black">{s.staff?.length || 0}</span></div><div className="flex items-center gap-1.5"><Car size={14} className="text-slate-300"/><span className="text-[13px] font-black">{rentalVehicles.filter(v => v.serviceStoreIds?.includes(s._id || s.id)).length}</span></div></div></td>
                          <td className="px-8 py-4"><div className="flex items-center gap-2"><div className={`h-1.5 w-1.5 rounded-full ${s.status === 'active' ? 'bg-emerald-500' : 'bg-slate-300'}`} /><span className="text-xs font-semibold capitalize text-slate-500">{s.status}</span></div></td>
                          <td className="px-8 py-4 text-right"><div className="flex justify-end gap-1"><button onClick={() => navigate(`/admin/pricing/service-stores/edit/${s._id || s.id}`)} title="Edit Store" className="p-2.5 text-slate-300 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all"><Edit2 size={16} /></button><button onClick={() => handleDelete(s._id || s.id)} title="Delete Store" className="p-2.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"><Trash2 size={16} /></button></div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div key="form" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="mx-auto max-w-7xl space-y-4">
            <div className="flex items-center justify-between"><div><h1 className="text-xl font-black text-slate-900 tracking-tight">{selectedStoreId ? 'Configure Hub' : 'Initialize Hub'}</h1></div><button onClick={() => navigate('/admin/pricing/service-stores')} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:border-slate-900 hover:text-slate-900 transition-all"><ArrowLeft size={14} /> Return</button></div>
            <div className="grid gap-4 xl:grid-cols-[400px_minmax(0,1fr)]">
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
                  <div className="flex items-center gap-3 mb-2"><div className="h-8 w-8 bg-slate-900 rounded-xl flex items-center justify-center text-white"><Building2 size={16} /></div><div><h3 className="text-lg font-bold text-slate-900">Identity Details</h3><p className="text-xs text-slate-500 font-semibold mt-1">Core Metadata</p></div></div>
                  <div><label className={labelClass}>Store Name *</label><input type="text" value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} className={inputClass} placeholder="Hub Name" required /></div>
                  <div><label className={labelClass}>Zone Association *</label><select value={formData.zone_id} onChange={e => handleZoneChange(e.target.value)} className={inputClass} required><option value="">Select Zone</option>{zones.map(z => <option key={z._id || z.id} value={z._id || z.id}>{z.name}</option>)}</select></div>
                  <div><label className={labelClass}>Physical Address *</label><textarea value={formData.address} onChange={e => setFormData(p => ({ ...p, address: e.target.value }))} className={`${inputClass} min-h-[60px] py-2 resize-none leading-relaxed`} placeholder="Street address" required /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className={labelClass}>Status *</label><select value={formData.status} onChange={e => setFormData(p => ({ ...p, status: e.target.value }))} className={inputClass} required><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
                    <div><label className={labelClass}>Owner Contact *</label><input type="text" value={formData.owner_phone} onChange={e => setFormData(p => ({ ...p, owner_phone: e.target.value.replace(/[^0-9+]/g, '') }))} className={inputClass} placeholder="Phone number" required /></div>
                  </div>
                  <button onClick={handleSave} disabled={saving} className="w-full py-2.5 bg-yellow-400 text-black hover:bg-yellow-500 rounded-xl font-bold text-sm shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2">{saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} COMMIT CONFIGURATION</button>
                </div>
              </div>
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-1 shadow-md"><div className="relative h-[280px] w-full overflow-hidden rounded-xl">{isLoaded ? <GoogleMap mapContainerStyle={{ width: '100%', height: '100%' }} center={mapCenter} zoom={14} onLoad={m => mapRef.current = m} options={{ disableDefaultUI: true }}>{(formData.latitude || formData.longitude) && <MarkerF position={{ lat: Number(formData.latitude || mapCenter.lat), lng: Number(formData.longitude || mapCenter.lng) }} draggable onDragEnd={e => updatePinnedLocation(e.latLng.lat(), e.latLng.lng())} />}{zoneBoundary.length > 0 && <Polygon paths={zoneBoundary} options={{ fillColor: '#0F172A', fillOpacity: 0.05, strokeColor: '#0F172A', strokeOpacity: 0.4, strokeWeight: 2 }} />}<div className="absolute left-4 top-4 w-[260px]"><Autocomplete onLoad={setAutocomplete} onPlaceChanged={handlePlaceChanged}><div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input type="text" placeholder="Search & Pin Location..." className="w-full rounded-xl border-none bg-white/95 py-2.5 pl-9 pr-4 text-xs font-bold text-slate-900 shadow-md backdrop-blur-xl outline-none focus:ring-2 focus:ring-slate-900/10" /></div></Autocomplete></div></GoogleMap> : <div className="h-full bg-slate-50 flex items-center justify-center"><Loader2 className="animate-spin text-slate-300" /></div>}</div></div>
                {selectedStoreId && (
                  <div className="grid lg:grid-cols-2 gap-4">
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex items-center justify-between mb-4"><div className="flex gap-3 items-center"><div className="h-8 w-8 bg-slate-50 rounded-xl flex items-center justify-center text-slate-900"><Users size={16} /></div><div><h3 className="text-lg font-bold text-slate-900">Personnel</h3><p className="text-xs text-slate-500 font-semibold mt-1">Team Management</p></div></div><button onClick={() => setAddingStaff(!addingStaff)} className="h-6 w-6 bg-slate-900 text-white rounded-md flex items-center justify-center transition-all hover:scale-110">{addingStaff ? <AlertCircle size={14} /> : <Plus size={14} />}</button></div>
                      <AnimatePresence>{addingStaff && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden mb-8"><div className="p-5 bg-slate-50 rounded-2xl space-y-4"><div><label className={labelClass}>Name</label><input type="text" value={staffFormData.name} onChange={e => setStaffFormData(p => ({ ...p, name: e.target.value }))} className={inputClass} placeholder="Staff Name" /></div><div><label className={labelClass}>Phone</label><input type="text" value={staffFormData.phone} onChange={e => setStaffFormData(p => ({ ...p, phone: e.target.value }))} className={inputClass} placeholder="10-digit number" /></div><button onClick={handleAddStaff} className="w-full py-3 bg-slate-900 text-white rounded-xl font-black text-xs transition-all hover:bg-slate-800">AUTHENTICATE & ADD</button></div></motion.div>}</AnimatePresence>
                      <div className="space-y-3">{selectedStoreStaff.length === 0 ? <div className="py-4 text-center border-2 border-dashed border-slate-100 rounded-xl text-[10px] text-slate-400 font-bold italic">No Personnel Registered</div> : selectedStoreStaff.map((s, i) => <div key={i} className="flex justify-between items-center p-3 bg-white border border-slate-100 rounded-xl hover:border-slate-200 transition-all"><div className="flex gap-3 items-center"><div className="h-8 w-8 bg-slate-50 rounded-lg flex items-center justify-center text-[10px] font-black text-slate-400 border border-slate-100">{s.name?.[0]}</div><div><p className="text-xs font-bold text-slate-900">{s.name}</p><p className="text-[10px] text-slate-400 font-medium">{s.phone}</p></div></div><div className="flex items-center gap-1.5"><div className="h-1.5 w-1.5 rounded-full bg-emerald-500" /><span className="text-xs font-semibold text-slate-400">Live</span></div></div>)}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex gap-3 items-center mb-4"><div className="h-8 w-8 bg-slate-50 rounded-xl flex items-center justify-center text-slate-900"><Car size={16} /></div><div><h3 className="text-lg font-bold text-slate-900">Active Fleet</h3><p className="text-xs text-slate-500 font-semibold mt-1">Assigned Vehicles</p></div></div>
                      <div className="space-y-3">{selectedStoreVehicles.length === 0 ? <div className="py-4 text-center border-2 border-dashed border-slate-100 rounded-xl text-[10px] text-slate-400 font-bold italic">No vehicles assigned yet</div> : selectedStoreVehicles.map((v, i) => <div key={i} className="flex justify-between items-center p-3 bg-white border border-slate-100 rounded-xl transition-all"><div className="flex gap-3 items-center"><div className="h-8 w-8 bg-slate-900 rounded-lg flex items-center justify-center text-white shadow-md shadow-slate-900/10"><Car size={14} /></div><div><p className="text-xs font-bold text-slate-900">{v.name}</p><p className="text-[10px] text-slate-400 font-medium">{v.vehicleCategory} · {v.capacity} Seats</p></div></div><ChevronRight size={12} className="text-slate-300" /></div>)}</div>
                      <div className="mt-4 p-3 bg-slate-50 border border-slate-100 rounded-xl text-xs text-slate-500 font-medium italic text-center">Update assets via Vehicle Types registry</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ServiceStores;
