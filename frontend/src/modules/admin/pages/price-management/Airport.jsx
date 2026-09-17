import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { Autocomplete, DrawingManager, GoogleMap, MarkerF, Polygon } from '@react-google-maps/api';
import { 
  ArrowLeft, 
  Edit2, 
  Eraser, 
  Loader2, 
  MapPin, 
  Plus, 
  Save, 
  Search, 
  Trash2,
  ChevronRight,
  Plane,
  FileSearch,
  Maximize2,
  Filter,
  Globe,
  Tag,
  Info
} from 'lucide-react';
import { adminService } from '../../services/adminService';
import { DELHI_CENTER, useDrawingGoogleMapsLoader } from '../../utils/googleMaps';

const inputClass = "w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-800 bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-colors";
const labelClass = "block text-xs font-semibold text-gray-500 mb-1.5";
const cardClass = "bg-white rounded-xl border border-gray-200 p-6";
const AIRPORT_STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];
const AIRPORT_FORM_STATUS_OPTIONS = AIRPORT_STATUS_OPTIONS.filter((option) => option.value);

const MAP_CONTAINER_STYLE = {
  width: '100%',
  height: '100%',
};

const defaultFormData = {
  name: '',
  service_location_id: '',
  status: 'active',
  latitude: '',
  longitude: '',
  airport_surge: '',
  support_airport_fee: '',
};

const Airport = ({ mode: initialMode = "list" }) => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [view, setView] = useState(initialMode);
  const [airports, setAirports] = useState([]);
  const [serviceLocations, setServiceLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [entriesPerPage, setEntriesPerPage] = useState(10);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedAirportId, setSelectedAirportId] = useState(id || null);
  const [formData, setFormData] = useState(defaultFormData);
  const [mapCenter, setMapCenter] = useState(DELHI_CENTER);
  const [autocomplete, setAutocomplete] = useState(null);
  const [boundaryCoords, setBoundaryCoords] = useState([]);
  const [filters, setFilters] = useState({
    service_location_id: '',
    status: '',
  });
  const mapRef = useRef(null);
  const { isLoaded, loadError } = useDrawingGoogleMapsLoader();

  useEffect(() => {
    setView(initialMode);
    if (initialMode === 'list') {
      resetFormState();
    }
  }, [initialMode]);

  const resetFormState = (serviceLocationId = '', serviceLocation = null) => {
    setSelectedAirportId(null);
    setFormData({ ...defaultFormData, service_location_id: serviceLocationId });
    setBoundaryCoords([]);
    if (serviceLocation) {
      const lat = Number(serviceLocation.latitude);
      const lng = Number(serviceLocation.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        setMapCenter({ lat, lng });
        return;
      }
    }
    setMapCenter(DELHI_CENTER);
  };

  const fetchData = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const [airportsRes, serviceLocationsRes] = await Promise.allSettled([
        adminService.getAirports(),
        adminService.getServiceLocations(),
      ]);

      const nextAirports = airportsRes.status === 'fulfilled' ? (airportsRes.value?.data?.airports || airportsRes.value?.data || airportsRes.value?.results || (Array.isArray(airportsRes.value) ? airportsRes.value : [])) : [];
      const nextServiceLocations = serviceLocationsRes.status === 'fulfilled' ? (serviceLocationsRes.value?.data?.service_locations || serviceLocationsRes.value?.data || serviceLocationsRes.value?.results || (Array.isArray(serviceLocationsRes.value) ? serviceLocationsRes.value : [])) : [];

      setAirports(Array.isArray(nextAirports) ? nextAirports : []);
      setServiceLocations(Array.isArray(nextServiceLocations) ? nextServiceLocations : []);

      if (id && initialMode === 'edit') {
        const airportToEdit = nextAirports.find(a => (a._id || a.id) === id);
        if (airportToEdit) handleEdit(airportToEdit);
      }
    } catch (error) {
      console.error('Airport fetch error:', error);
      setErrorMessage(`Failed to connect to backend.`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (id && airports.length > 0 && initialMode === 'edit') {
      const airportToEdit = airports.find(a => (a._id || a.id) === id);
      if (airportToEdit) handleEdit(airportToEdit);
    }
  }, [id, airports]);

  const filteredAirports = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return airports.filter((airport) => {
      const matchesSearch = !query || [
        airport.name,
        airport.code,
        airport.terminal,
        airport.service_location_id?.name,
        airport.service_location_id?.service_location_name,
      ].filter(Boolean).some((val) => String(val).toLowerCase().includes(query));
      const airportServiceLocationId = String(airport.service_location_id?._id || airport.service_location_id || '');
      const matchesServiceLocation =
        !filters.service_location_id || airportServiceLocationId === String(filters.service_location_id);
      const matchesStatus =
        !filters.status || String(airport.status || 'active').toLowerCase() === filters.status;

      return matchesSearch && matchesServiceLocation && matchesStatus;
    });
  }, [airports, filters, searchTerm]);

  const updatePinnedLocation = (lat, lng) => {
    const nextLat = Number(lat);
    const nextLng = Number(lng);
    if (!Number.isFinite(nextLat) || !Number.isFinite(nextLng)) return;
    setFormData(prev => ({ ...prev, latitude: nextLat.toFixed(6), longitude: nextLng.toFixed(6) }));
    setMapCenter({ lat: nextLat, lng: nextLng });
  };

  const handleMapClick = (event) => updatePinnedLocation(event.latLng?.lat(), event.latLng?.lng());
  const handleMarkerDragEnd = (event) => updatePinnedLocation(event.latLng?.lat(), event.latLng?.lng());

  const handlePlaceChanged = () => {
    if (!autocomplete) return;
    const place = autocomplete.getPlace();
    const lat = place.geometry?.location?.lat?.();
    const lng = place.geometry?.location?.lng?.();
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      updatePinnedLocation(lat, lng);
      mapRef.current?.panTo({ lat, lng });
      mapRef.current?.setZoom(15);
    }
  };

  const handleSave = async () => {
    if (!formData.name.trim() || !formData.service_location_id) {
      alert('Airport name and service location are required.');
      return;
    }
    if (formData.airport_surge && Number(formData.airport_surge) < 0) {
      alert('Airport surge fee must be greater than or equal to 0.');
      return;
    }
    if (formData.support_airport_fee && Number(formData.support_airport_fee) < 0) {
      alert('Support airport fee must be greater than or equal to 0.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...formData,
        name: formData.name.trim(),
        boundary_coordinates: boundaryCoords,
      };
      const res = selectedAirportId ? await adminService.updateAirport(selectedAirportId, payload) : await adminService.createAirport(payload);
      if (res?.success || res?.status === 200 || res?.status === 201) {
        navigate("/admin/pricing/airport");
        fetchData();
        resetFormState();
      } else {
        alert(res?.data?.message || res?.message || 'Failed to save airport');
      }
    } catch (err) {
      alert(err?.response?.data?.message || 'Server error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (airport) => {
    setSelectedAirportId(airport._id || airport.id);
    setFormData({
      name: airport.name || '',
      service_location_id: airport.service_location_id?._id || airport.service_location_id || '',
      latitude: airport.latitude ?? '',
      longitude: airport.longitude ?? '',
      airport_surge: airport.airport_surge ?? '',
      support_airport_fee: airport.support_airport_fee ?? '',
      status: airport.status || 'active',
    });
    setBoundaryCoords(Array.isArray(airport.boundary_coordinates) ? airport.boundary_coordinates : []);
    if (airport.latitude && airport.longitude) setMapCenter({ lat: Number(airport.latitude), lng: Number(airport.longitude) });
  };

  const handleDelete = async (id) => {
    if (window.confirm('Delete this airport permanently?')) {
      try {
        const res = await adminService.deleteAirport(id);
        if (res?.success) setAirports(prev => prev.filter(a => a._id !== id && a.id !== id));
      } catch (err) { alert('Delete failed'); }
    }
  };

  const handleStatusUpdate = async (airport, nextStatus) => {
    const airportId = airport._id || airport.id;
    try {
      const res = await adminService.updateAirport(airportId, { status: nextStatus });
      const updatedAirport = res?.data || res;
      if (res?.success || res?.status === 200 || updatedAirport?._id || updatedAirport?.id) {
        setAirports((prev) =>
          prev.map((item) => {
            if ((item._id || item.id) !== airportId) {
              return item;
            }

            return {
              ...item,
              ...updatedAirport,
              status: updatedAirport?.status || nextStatus,
              active: updatedAirport?.active ?? (nextStatus === 'active'),
            };
          }),
        );
      } else {
        alert(res?.message || 'Failed to update airport status');
      }
    } catch (err) {
      alert(err?.response?.data?.message || 'Failed to update airport status');
    }
  };

  const handleBoundaryComplete = (polygon) => {
    setBoundaryCoords(polygon.getPath().getArray().map(p => ({ lat: p.lat(), lng: p.lng() })));
    polygon.setMap(null);
  };

  const clearBoundary = () => { setBoundaryCoords([]); };
  const clearFilters = () => setFilters({ service_location_id: '', status: '' });

  return (
    <div className="min-h-screen bg-gray-50 p-6 lg:p-8 animate-in fade-in duration-500 font-sans">
      <AnimatePresence mode="wait">
        {view === 'list' ? (
          <motion.div 
            key="list" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="max-w-7xl mx-auto space-y-6"
          >
            <div className="mb-6">
              <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-2">
                <span>Pricing</span>
                <ChevronRight size={12} />
                <span className="text-gray-700">Airport Management</span>
              </div>
              <div className="flex items-center justify-between">
                <h1 className="text-xl text-gray-900 font-bold">Airport Management</h1>
                <button 
                  type="button"
                  onClick={() => navigate("create")}
                  className="flex items-center gap-2 px-4 py-2 bg-[#FFC400] text-[#0B1220] rounded-lg text-sm font-medium hover:brightness-95 transition-colors shadow-sm"
                >
                  <Plus size={16} /> Add Airport
                </button>
              </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
               <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                 <p className="text-xs font-semibold text-gray-500 mb-1">Total Airports</p>
                 <h3 className="text-2xl font-bold text-gray-900">{airports.length}</h3>
               </div>
               <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                 <p className="text-xs font-semibold text-gray-500 mb-1">Active Airports</p>
                 <h3 className="text-2xl font-bold text-gray-900">{airports.filter(a => (a.status || 'active').toLowerCase() === 'active' || a.active).length}</h3>
               </div>
               <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                 <p className="text-xs font-semibold text-gray-500 mb-1">Inactive Airports</p>
                 <h3 className="text-2xl font-bold text-gray-900">{airports.filter(a => (a.status || '').toLowerCase() === 'inactive' || a.active === false).length}</h3>
               </div>
               <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                 <p className="text-xs font-semibold text-gray-500 mb-1">Locations Covered</p>
                 <h3 className="text-2xl font-bold text-gray-900">{new Set(airports.map(a => a.service_location_id?._id || a.service_location_id).filter(Boolean)).size}</h3>
               </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/30">
                <div className="flex items-center gap-3 text-sm text-gray-500">
                  <span>Show</span>
                  <select 
                    value={entriesPerPage} onChange={(e) => setEntriesPerPage(Number(e.target.value))}
                    className="border border-gray-200 rounded px-2 py-1 bg-white outline-none focus:border-indigo-500"
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </select>
                  <span>entries</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input 
                      type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search airports..." 
                      className="pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500 transition-all w-64"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsFilterOpen((current) => !current)}
                    aria-expanded={isFilterOpen}
                    aria-label={isFilterOpen ? 'Hide filters' : 'Show filters'}
                    className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
                      isFilterOpen
                        ? 'border-indigo-200 bg-indigo-50 text-indigo-600'
                        : 'border-gray-200 bg-white text-gray-500 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600'
                    }`}
                  >
                    <Filter size={18} />
                    <span>{isFilterOpen ? 'Hide Filters' : 'Filters'}</span>
                  </button>
                </div>
              </div>

              {isFilterOpen ? (
                <div className="grid grid-cols-1 gap-4 border-b border-gray-100 bg-white px-4 py-4 md:grid-cols-3">
                  <div>
                    <label className={labelClass}>Service Location</label>
                    <select
                      value={filters.service_location_id}
                      onChange={(e) => setFilters((current) => ({ ...current, service_location_id: e.target.value }))}
                      className={inputClass}
                    >
                      <option value="">All service locations</option>
                      {serviceLocations.map((sl) => (
                        <option key={sl._id || sl.id} value={sl._id || sl.id}>
                          {sl.name || sl.service_location_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className={labelClass}>Status</label>
                    <select
                      value={filters.status}
                      onChange={(e) => setFilters((current) => ({ ...current, status: e.target.value }))}
                      className={inputClass}
                    >
                      {AIRPORT_STATUS_OPTIONS.map((option) => (
                        <option key={option.value || 'all'} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="h-[42px] w-full rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50"
                    >
                      Reset Filters
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-6 py-4 text-left font-semibold text-gray-700">Airport Name</th>
                      <th className="px-6 py-4 text-left font-semibold text-gray-700">Service Location</th>
                      <th className="px-6 py-4 text-center font-semibold text-gray-700">Status</th>
                      <th className="px-6 py-4 text-right font-semibold text-gray-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {loading ? (
                      <tr>
                        <td colSpan="4" className="py-20 text-center text-gray-400">
                          <Loader2 className="animate-spin mx-auto mb-2" />
                          <span>Loading data...</span>
                        </td>
                      </tr>
                    ) : filteredAirports.length > 0 ? (
                      filteredAirports.slice(0, entriesPerPage).map(airport => (
                        <tr key={airport._id || airport.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded bg-indigo-50 flex items-center justify-center text-indigo-600">
                                <Plane size={14} />
                              </div>
                              <span className="font-medium text-gray-900">
                                {airport.name}
                                {airport.code && <span className="ml-2 text-[10px] font-bold tracking-wider text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md border border-gray-200 uppercase">{airport.code}</span>}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-gray-600">
                            {airport.service_location_id?.name || 'N/A'}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <select
                              value={String(airport.status || 'active').toLowerCase()}
                              onChange={(event) => handleStatusUpdate(airport, event.target.value)}
                              className="rounded-full border border-gray-200 bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-700 outline-none transition-colors hover:border-indigo-200 focus:border-indigo-500"
                            >
                              {AIRPORT_FORM_STATUS_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex justify-end gap-2 text-gray-400 relative z-50">
                              <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(`edit/${airport._id || airport.id}`); }} className="p-1.5 hover:text-[#0B1220] hover:bg-[#FFC400] rounded-lg transition-colors"><Edit2 size={14} /></button>
                              <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(airport._id || airport.id); }} className="p-1.5 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"><Trash2 size={14} /></button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="4" className="py-24 text-center">
                          <Plane size={48} className="mx-auto mb-4 text-gray-300" />
                          <h3 className="text-gray-900 mb-1 font-bold">No Airports Available</h3>
                          <p className="text-sm text-gray-500 mb-6">Create your first airport to enable airport pricing.</p>
                          <button 
                            type="button"
                            onClick={() => navigate("create")}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-[#FFC400] text-[#0B1220] rounded-lg text-sm font-medium hover:brightness-95 transition-colors shadow-sm"
                          >
                            <Plus size={16} /> Add Airport
                          </button>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="form" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
            className="max-w-7xl mx-auto space-y-6"
          >
            <div className="mb-6">
              <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-2">
                <span>Pricing</span>
                <ChevronRight size={12} />
                <span>Airport Management</span>
                <ChevronRight size={12} />
                <span className="text-gray-700">{id ? 'Edit' : 'Create'}</span>
              </div>
              <div className="flex items-center justify-between">
                <h1 className="text-xl text-gray-900 font-bold">{id ? 'Edit Airport' : 'Add Airport'}</h1>
                <button 
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate("/admin/pricing/airport"); setView('list'); }}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors shadow-sm relative z-50"
                >
                  <ArrowLeft size={14} /> Back
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
              <div className="xl:col-span-12 lg:xl:col-span-5 space-y-6">
                <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                   <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
                      <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                        <Plane size={18} />
                      </div>
                      <div>
                        <h3 className="text-sm text-gray-900 font-bold">Airport Details</h3>
                        <p className="text-xs text-gray-400">Configure core airport terminal data</p>
                      </div>
                   </div>

                   <div className="space-y-5">
                      <div>
                        <label className={labelClass}>
                          <MapPin size={12} className="inline mr-1 text-gray-400" />
                          Service Location *
                        </label>
                        <select 
                          value={formData.service_location_id}
                          onChange={(e) => {
                            const sid = e.target.value;
                            setFormData(p => ({ ...p, service_location_id: sid }));
                            const loc = serviceLocations.find(l => (l._id || l.id) === sid);
                            if (loc) {
                              const center = { lat: Number(loc.latitude), lng: Number(loc.longitude) };
                              setMapCenter(center);
                              mapRef.current?.panTo(center);
                            }
                          }}
                          className={inputClass}
                        >
                          <option value="">Select Service Location</option>
                          {serviceLocations.map(sl => <option key={sl._id || sl.id} value={sl._id || sl.id}>{sl.name}</option>)}
                        </select>
                      </div>

                      <div>
                        <label className={labelClass}>
                          <Tag size={12} className="inline mr-1 text-gray-400" />
                          Airport Name *
                        </label>
                        <input 
                          type="text" value={formData.name} onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))}
                          placeholder="Enter Airport Name"
                          className={inputClass}
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className={labelClass}>
                            <Globe size={12} className="inline mr-1 text-gray-400" />
                            Airport Surge Fee
                          </label>
                          <p className="text-[10px] text-gray-400 mb-2">Extra pickup/drop charge for airport trips.</p>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={formData.airport_surge}
                            onChange={(e) => setFormData(p => ({ ...p, airport_surge: e.target.value }))}
                            placeholder="Enter airport surge fee"
                            className={inputClass}
                          />
                        </div>

                        <div>
                          <label className={labelClass}>
                            <Globe size={12} className="inline mr-1 text-gray-400" />
                            Support Airport Fee
                          </label>
                          <p className="text-[10px] text-gray-400 mb-2">Additional operational airport support fee.</p>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={formData.support_airport_fee}
                            onChange={(e) => setFormData(p => ({ ...p, support_airport_fee: e.target.value }))}
                            placeholder="Enter support airport fee"
                            className={inputClass}
                          />
                        </div>
                      </div>

                      <div>
                        <label className={labelClass}>
                          <Tag size={12} className="inline mr-1 text-gray-400" />
                          Status
                        </label>
                        <select
                          value={formData.status}
                          onChange={(e) => setFormData((p) => ({ ...p, status: e.target.value }))}
                          className={inputClass}
                        >
                          {AIRPORT_FORM_STATUS_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                   </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
                   <button 
                     type="button"
                     onClick={handleSave} disabled={saving}
                     className="w-full py-3 bg-[#FFC400] text-[#0B1220] rounded-lg text-sm font-medium hover:brightness-95 transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
                   >
                     {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                     {id ? 'Update Airport' : 'Save Airport'}
                   </button>
                   <button 
                     type="button"
                     onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate("/admin/pricing/airport"); setView('list'); }}
                     className="w-full py-3 bg-gray-50 text-gray-600 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-100 transition-colors"
                   >
                     Cancel
                   </button>
                </div>
              </div>

<div className="xl:col-span-12 lg:xl:col-span-7">
                <div className="bg-white rounded-xl border border-gray-200 p-2 h-[600px] shadow-sm relative overflow-hidden">
                  {isLoaded ? (
                    <div className="w-full h-full rounded-lg overflow-hidden relative">
                       <div className="absolute inset-x-4 top-4 z-10 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div className="w-full md:max-w-md">
                            <div className="flex h-12 w-full items-center gap-3 rounded-2xl border border-gray-100 bg-white/95 px-4 shadow-xl backdrop-blur-sm">
                              <Search className="text-gray-400" size={18} />
                              <Autocomplete
                                onLoad={(a) => setAutocomplete(a)}
                                onPlaceChanged={handlePlaceChanged}
                                className="flex-1"
                              >
                                <input
                                  type="text"
                                  placeholder="Search for a city or airport"
                                  className="w-full bg-transparent text-sm font-semibold text-gray-800 outline-none placeholder:text-gray-400"
                                />
                              </Autocomplete>
                            </div>
                          </div>

                          {boundaryCoords.length > 0 ? (
                            <button
                              type="button"
                              onClick={clearBoundary}
                              className="self-start rounded-xl bg-white px-4 py-2.5 text-[11px] font-black uppercase tracking-widest text-rose-600 shadow-xl transition-all border border-gray-100 hover:bg-rose-50 active:scale-95"
                            >
                              Clear Boundary
                            </button>
                          ) : null}
                       </div>
                       
                       <GoogleMap
                         mapContainerStyle={MAP_CONTAINER_STYLE}
                         center={mapCenter} zoom={13}
                         onLoad={m => { mapRef.current = m; }}
                         onClick={handleMapClick}
                         options={{
                            mapTypeId: 'roadmap',
                            disableDefaultUI: false,
                            zoomControl: true,
                            mapTypeControl: true,
                            clickableIcons: true,
                            streetViewControl: false,
                            fullscreenControl: true
                         }}
                       >
                         {boundaryCoords.length > 0 && <Polygon paths={boundaryCoords} options={{ fillColor: '#4f46e5', strokeColor: '#4f46e5', fillOpacity: 0.1, strokeWeight: 2 }} />}
                         
                         <MarkerF 
                            position={{ lat: Number(formData.latitude || mapCenter.lat), lng: Number(formData.longitude || mapCenter.lng) }} 
                            draggable onDragEnd={handleMarkerDragEnd}
                            icon={window.google ? {
                              path: window.google.maps.SymbolPath.CIRCLE,
                              scale: 6,
                              fillColor: "#4f46e5",
                              fillOpacity: 1,
                              strokeColor: "white",
                              strokeWeight: 2
                            } : undefined}
                         />

                         <DrawingManager
                            onPolygonComplete={handleBoundaryComplete}
                            options={{
                              drawingControl: true,
                              drawingControlOptions: {
                                position: window.google ? window.google.maps.ControlPosition.RIGHT_TOP : 6,
                                drawingModes: ['polygon']
                              },
                              polygonOptions: { fillColor: '#4f46e5', strokeColor: '#4f46e5', fillOpacity: 0.1, strokeWeight: 2 }
                            }}
                         />
                       </GoogleMap>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full bg-gray-50 rounded-lg">
                       <Loader2 className="animate-spin text-gray-300" size={32} />
                    </div>
                  )}
                </div>

                <div className="mt-6 bg-indigo-50 border border-indigo-100 rounded-xl p-4 flex items-start gap-3">
                   <Info size={18} className="text-indigo-600 shrink-0 mt-0.5" />
                   <p className="text-xs text-indigo-900 leading-relaxed font-medium">
                     Use the polygon tool at the top of the map to define the precise operational boundary for this airport. This allows for automated geofencing of ride requests.
                   </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Airport;
