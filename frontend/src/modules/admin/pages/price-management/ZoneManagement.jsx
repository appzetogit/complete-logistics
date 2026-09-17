import React, { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useParams } from "react-router-dom";
import {
  Search,
  Plus,
  Edit2,
  Trash2,
  Navigation,
  Loader2,
  ChevronRight,
  Target,
  Zap,
  Tag,
  Save,
  ArrowLeft,
  Maximize2,
  Map as MapIcon,
  Globe,
  Info,
  Layers,
  MousePointer2,
  X,
  MapPin
} from "lucide-react";
import {
  GoogleMap,
  DrawingManager,
  Circle,
  Polygon,
  Autocomplete,
} from "@react-google-maps/api";
import { useDrawingGoogleMapsLoader } from "../../utils/googleMaps";
import { adminService } from "../../services/adminService";
import {
  buildCountryBoundaryUrl,
  normalizeBoundaryRings,
  isDriverAvailable,
} from "../../utils/mapUtils";

const inputClass = "w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-800 bg-white focus:border-[#FFC400] focus:ring-1 focus:ring-[#FFC400] outline-none transition-colors";
const labelClass = "block text-xs font-semibold text-gray-500 mb-1.5";
const cardClass = "bg-white rounded-xl border border-gray-200 p-6 shadow-sm";
const ADMIN_LANGUAGE_OPTIONS = ['English', 'Hindi', 'Arabic', 'French', 'Spanish'];

const ZoneManagement = ({ mode: initialMode = "list" }) => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [view, setView] = useState(initialMode);
  const [zones, setZones] = useState([]);
  const [serviceLocations, setServiceLocations] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [saving, setSaving] = useState(false);
  const [enablePeakZoneGlobal, setEnablePeakZoneGlobal] = useState(true);
  const [editingId, setEditingId] = useState(id || null);
  const [mapCenter, setMapCenter] = useState({ lat: 21.1458, lng: 79.0882 }); 
  const [autocomplete, setAutocomplete] = useState(null);
  const [countryBoundaryPaths, setCountryBoundaryPaths] = useState([]);
  const [boundaryLoading, setBoundaryLoading] = useState(false);
  const mapRef = useRef(null);
  const polygonRef = useRef(null);
  const polygonListenersRef = useRef([]);
  const circleRef = useRef(null);
  const circleListenersRef = useRef([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('English');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Map & Drawing States
  const [boundaryMode, setBoundaryMode] = useState('polygon');
  const [polygonCoords, setPolygonCoords] = useState([]);
  const [circleCenter, setCircleCenter] = useState(null);
  const [circleRadiusMeters, setCircleRadiusMeters] = useState('');
  const { isLoaded, loadError } = useDrawingGoogleMapsLoader();

  // Form State
  const [formData, setFormData] = useState({
    service_location_id: '',
    name: { English: '', Hindi: '', Arabic: '', French: '', Spanish: '' },
    unit: '',
    peak_zone_ride_count: '',
    peak_zone_radius: '',
    peak_zone_selection_duration: '',
    peak_zone_duration: '',
    peak_zone_surge_percentage: '',
    maximum_distance_for_regular_rides: '',
    maximum_distance_for_outstation_rides: '',
    status: 'active'
  });

  useEffect(() => {
    setView(initialMode === 'edit' || initialMode === 'create' || initialMode === 'view' ? 'form' : 'list');
    if (initialMode === 'list') {
      resetForm();
    }
  }, [initialMode]);

  const fetchData = async () => {
    setLoading(true);
    setFetchError('');
    try {
      const [zoneRes, slRes, driverRes] = await Promise.all([
        adminService.getZones(),
        adminService.getServiceLocations(),
        adminService.getDrivers(1, 200),
      ]);

      if (zoneRes) {
        const zoneData = zoneRes.success ? (zoneRes.data?.results || zoneRes.data) : zoneRes;
        setZones(Array.isArray(zoneData) ? zoneData : []);
      }

      if (slRes) {
        const locs = slRes.success ? (slRes.data?.results || slRes.data) : slRes;
        setServiceLocations(Array.isArray(locs) ? locs : []);
      }

      if (driverRes) {
        const driverItems = driverRes.success ? (driverRes.data?.results || driverRes.data) : driverRes;
        setDrivers(Array.isArray(driverItems) ? driverItems : []);
      }

      if (id && initialMode === 'edit') {
        const zoneToEdit = Array.isArray(zoneData) && zoneData.find(z => (z._id || z.id) === id);
        if (zoneToEdit) handleEdit(zoneToEdit);
      }
    } catch (err) {
      console.error("Fetch error:", err);
      setFetchError(`Zone data could not be loaded.`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (id && zones.length > 0 && initialMode === 'edit') {
      const zoneToEdit = zones.find(z => (z._id || z.id) === id);
      if (zoneToEdit) handleEdit(zoneToEdit);
    }
  }, [id, zones]);

  const filteredZones = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return zones;
    return zones.filter(z => (z.name || z.zone_name || '').toLowerCase().includes(query));
  }, [zones, searchTerm]);

  const totalZonePages = Math.max(1, Math.ceil(filteredZones.length / pageSize));

  const paginatedZones = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredZones.slice(start, start + pageSize);
  }, [filteredZones, currentPage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, pageSize]);

  useEffect(() => {
    if (currentPage > totalZonePages) {
      setCurrentPage(totalZonePages);
    }
  }, [currentPage, totalZonePages]);

  const fitMapToPaths = (paths) => {
    if (!mapRef.current || !window.google || !Array.isArray(paths) || paths.length === 0) {
      return;
    }
    const bounds = new window.google.maps.LatLngBounds();
    let hasPoint = false;
    paths.forEach((ring) => {
      ring.forEach((point) => {
        if (Number.isFinite(point?.lat) && Number.isFinite(point?.lng)) {
          bounds.extend(point);
          hasPoint = true;
        }
      });
    });
    if (hasPoint) {
      mapRef.current.fitBounds(bounds, 40);
    }
  };

  const onPolygonComplete = (polygon) => {
    const coords = polygon.getPath().getArray().map(p => ({
      lat: p.lat(),
      lng: p.lng()
    }));
    setBoundaryMode('polygon');
    setPolygonCoords(coords);
    setCircleCenter(null);
    setCircleRadiusMeters('');
    polygon.setMap(null);
  };

  const onCircleComplete = (circle) => {
    const center = circle.getCenter();
    setBoundaryMode('circle');
    setCircleCenter({
      lat: center.lat(),
      lng: center.lng(),
    });
    setCircleRadiusMeters(String(Math.round(circle.getRadius())));
    setPolygonCoords([]);
    circle.setMap(null);
  };

  const syncPolygonState = () => {
    const polygon = polygonRef.current;
    if (!polygon) {
      return polygonCoords;
    }

    const nextCoords = polygon
      .getPath()
      .getArray()
      .map((point) => ({
        lat: point.lat(),
        lng: point.lng(),
      }));

    setPolygonCoords(nextCoords);
    return nextCoords;
  };

  const syncCircleState = () => {
    const circle = circleRef.current;
    if (!circle) {
      return {
        center: circleCenter,
        radiusMeters: circleRadiusMeters,
      };
    }

    const center = circle.getCenter();
    const radius = circle.getRadius();
    const nextCenter = center
      ? {
          lat: center.lat(),
          lng: center.lng(),
        }
      : circleCenter;
    const nextRadiusMeters = Number.isFinite(radius)
      ? String(Math.round(radius))
      : circleRadiusMeters;

    setCircleCenter(nextCenter);
    setCircleRadiusMeters(nextRadiusMeters);

    return {
      center: nextCenter,
      radiusMeters: nextRadiusMeters,
    };
  };

  useEffect(() => () => {
    polygonListenersRef.current.forEach((listener) => listener?.remove?.());
    polygonListenersRef.current = [];
    polygonRef.current = null;
    circleListenersRef.current.forEach((listener) => listener?.remove?.());
    circleListenersRef.current = [];
    circleRef.current = null;
  }, []);

  const onPlaceChanged = () => {
    if (autocomplete !== null) {
      const place = autocomplete.getPlace();
      if (place.geometry) {
        const loc = {
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng()
        };
        setMapCenter(loc);
        mapRef.current?.panTo(loc);
      }
    }
  };

  const handleSave = async () => {
    const syncedPolygonCoords = boundaryMode === 'polygon' ? syncPolygonState() : polygonCoords;
    const syncedCircle = boundaryMode === 'circle'
      ? syncCircleState()
      : { center: circleCenter, radiusMeters: circleRadiusMeters };
    const effectiveCircleCenter = syncedCircle?.center || circleCenter;
    const effectiveCircleRadiusMeters = syncedCircle?.radiusMeters || circleRadiusMeters;

    const hasPolygon = boundaryMode === 'polygon' && syncedPolygonCoords.length >= 3;
    const hasCircle =
      boundaryMode === 'circle' &&
      Number(effectiveCircleRadiusMeters) > 0 &&
      Number.isFinite(Number(effectiveCircleCenter?.lat)) &&
      Number.isFinite(Number(effectiveCircleCenter?.lng));

    if (!formData.name.English.trim() || (!hasPolygon && !hasCircle)) {
      alert("Please add a zone name and draw a polygon or circle boundary on the map.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...formData,
        boundary_mode: boundaryMode,
        coordinates: boundaryMode === 'polygon' ? syncedPolygonCoords : undefined,
        circle_center: boundaryMode === 'circle' ? effectiveCircleCenter : undefined,
        circle_radius_meters: boundaryMode === 'circle' ? Number(effectiveCircleRadiusMeters) : undefined,
        name: formData.name.English
      };
      const res = editingId 
        ? await adminService.updateZone(editingId, payload)
        : await adminService.createZone(payload);
      if (res.success) {
        resetForm();
        navigate("/admin/pricing/zone");
        fetchData();
      } else {
        alert(res.message || "Operation failed");
      }
    } catch (err) {
      console.error("Save error:", err);
      alert("Error connecting to server.");
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setFormData({
      service_location_id: '',
      name: { English: '', Hindi: '', Arabic: '', French: '', Spanish: '' },
      unit: '',
      peak_zone_ride_count: '',
      peak_zone_radius: '',
      peak_zone_selection_duration: '',
      peak_zone_duration: '',
      peak_zone_surge_percentage: '',
      maximum_distance_for_regular_rides: '',
      maximum_distance_for_outstation_rides: '',
      status: 'active'
    });
    setBoundaryMode('polygon');
    setPolygonCoords([]);
    setCircleCenter(null);
    setCircleRadiusMeters('');
    setCountryBoundaryPaths([]);
  };

  const handleStatusToggle = async (zoneId, currentIsActive) => {
    try {
      const res = await adminService.toggleZoneStatus(zoneId);
      if (res.success) {
        setZones(prev => prev.map(z => (z._id === zoneId || z.id === zoneId) ? { ...z, active: !currentIsActive } : z));
      }
    } catch (err) {
      console.error("Status update error:", err);
    }
  };

  const handleDelete = async (zoneId) => {
    if (!window.confirm("Are you sure?")) return;
    try {
      const res = await adminService.deleteZone(zoneId);
      if (res.success) {
        setZones(prev => prev.filter(z => (z._id !== zoneId && z.id !== zoneId)));
      }
    } catch (err) {
      console.error("Delete error:", err);
    }
  };

  const handleEdit = (zone) => {
    const zid = zone._id || zone.id;
    setEditingId(zid);
    const localizedNames = typeof zone.name === 'object' && zone.name !== null ? zone.name : {};
    let zoneName = typeof zone.name === 'string' ? zone.name : (localizedNames.English || zone.zone_name || '');
    setFormData({
      service_location_id: zone.service_location_id || '',
      name: {
        English: zoneName,
        Hindi: localizedNames.Hindi || '',
        Arabic: localizedNames.Arabic || '',
        French: localizedNames.French || '',
        Spanish: localizedNames.Spanish || '',
      },
      unit: zone.unit || '',
      peak_zone_ride_count: zone.peak_zone_ride_count || '',
      peak_zone_radius: zone.peak_zone_radius || '',
      peak_zone_selection_duration: zone.peak_zone_selection_duration || '',
      peak_zone_duration: zone.peak_zone_duration || '',
      peak_zone_surge_percentage: zone.peak_zone_surge_percentage || '',
      maximum_distance_for_regular_rides: zone.maximum_distance_for_regular_rides || '',
      maximum_distance_for_outstation_rides: zone.maximum_distance_for_outstation_rides || '',
      status: zone.active ? 'active' : 'inactive'
    });
    let parsedCoords = [];
    if (Array.isArray(zone.coordinates)) {
      parsedCoords = zone.coordinates.map(coord => {
        if (Array.isArray(coord)) return { lat: coord[1], lng: coord[0] };
        if (coord && typeof coord === 'object') return { lat: Number(coord.lat), lng: Number(coord.lng) };
        return coord;
      });
    }
    if (parsedCoords.length > 0) setMapCenter(parsedCoords[0]);
    const nextBoundaryMode = zone.boundary_mode === 'circle' ? 'circle' : 'polygon';
    setBoundaryMode(nextBoundaryMode);
    setPolygonCoords(parsedCoords);
    setCircleCenter(
      zone.circle_center && Number.isFinite(Number(zone.circle_center?.lat)) && Number.isFinite(Number(zone.circle_center?.lng))
        ? {
            lat: Number(zone.circle_center.lat),
            lng: Number(zone.circle_center.lng),
          }
        : null,
    );
    setCircleRadiusMeters(
      zone.circle_radius_meters !== null && zone.circle_radius_meters !== undefined
        ? String(zone.circle_radius_meters)
        : '',
    );
  };

  const handleExplore = (zone) => {
    handleEdit(zone);
    setView('form');
  };

  const selectedServiceLocation = serviceLocations.find(l => String(l._id || l.id) === String(formData.service_location_id));
  const selectedCountry = selectedServiceLocation?.country || selectedServiceLocation?.name || '';

  useEffect(() => {
    if (view === 'list' || !selectedCountry) return;
    let cancelled = false;
    const loadCountryBoundary = async () => {
      setBoundaryLoading(true);
      try {
        const response = await fetch(buildCountryBoundaryUrl(selectedCountry));
        if (!response.ok) throw new Error();
        const payload = await response.json();
        const feature = Array.isArray(payload) ? payload[0] : null;
        const nextPaths = normalizeBoundaryRings(feature?.geojson);
        if (!cancelled) {
          setCountryBoundaryPaths(nextPaths);
          if (nextPaths.length > 0) fitMapToPaths(nextPaths);
        }
      } catch (error) {
        if (!cancelled) setCountryBoundaryPaths([]);
      } finally {
        if (!cancelled) setBoundaryLoading(false);
      }
    };
    loadCountryBoundary();
    return () => { cancelled = true; };
  }, [selectedCountry, view]);

  return (
    <div className="min-h-screen bg-gray-50 p-6 lg:p-8 animate-in fade-in duration-500">
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
                <span className="text-gray-700">Zone Management</span>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-xl text-gray-900 font-bold">Zone Management</h1>
                  <p className="text-xs text-gray-400 mt-1">Configure geofenced boundaries for operational control.</p>
                </div>
                <button 
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate("/admin/pricing/zone/create"); }}
                  className="flex items-center gap-2 px-4 py-2 bg-[#FFC400] text-[#0B1220] rounded-lg text-sm font-medium hover:brightness-95 transition-colors shadow-sm relative z-50"
                >
                  <Plus size={16} /> Add Market Zone
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6 flex items-center justify-between shadow-sm">
               <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${enablePeakZoneGlobal ? 'bg-amber-50 text-amber-600' : 'bg-gray-50 text-gray-300'}`}>
                     <Zap size={20} className={enablePeakZoneGlobal ? 'animate-pulse' : ''} />
                  </div>
                  <div>
                     <h3 className="text-sm text-gray-900 font-bold">Dynamic Peak Pricing</h3>
                     <p className="text-[11px] text-gray-400">Toggle surge modifiers across all zones globally</p>
                  </div>
               </div>
               <button 
                 onClick={() => setEnablePeakZoneGlobal(!enablePeakZoneGlobal)}
                 className={`relative w-11 h-6 rounded-full transition-colors ${enablePeakZoneGlobal ? 'bg-[#FFC400]' : 'bg-gray-200'}`}
               >
                 <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${enablePeakZoneGlobal ? 'translate-x-5' : ''}`} />
               </button>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
              <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                <div className="relative w-full max-w-sm">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input 
                    type="text" 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search zones..." 
                    className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#FFC400] focus:border-[#FFC400] transition-all font-medium"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-20">
                    <Loader2 className="animate-spin text-[#FFC400] mb-2" size={32} />
                    <p className="text-xs text-gray-400 font-medium">Loading data...</p>
                  </div>
                ) : filteredZones.length > 0 ? (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50/50 border-b border-gray-100">
                        <th className="px-6 py-3.5 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">S.No</th>
                        <th className="px-6 py-3.5 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Market Zone Identity</th>
                        <th className="px-6 py-3.5 text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest">Status</th>
                        <th className="px-6 py-3.5 text-right text-[10px] font-bold text-gray-400 uppercase tracking-widest">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {paginatedZones.map((zone, idx) => (
                        <tr key={zone._id || zone.id} className="hover:bg-gray-50/50 transition-colors group">
                          <td className="px-6 py-4 whitespace-nowrap text-xs font-bold text-gray-400">{(((currentPage - 1) * pageSize) + idx + 1).toString().padStart(2, '0')}</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-lg bg-[#FFC400]/10 flex items-center justify-center text-[#FFC400] shadow-sm border border-[#FFC400]/20 transition-transform group-hover:scale-105">
                                <Target size={16} />
                              </div>
                              <span className="font-semibold text-gray-900">{zone.name || zone.zone_name}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                             <button 
                               onClick={() => handleStatusToggle(zone._id || zone.id, zone.active)} 
                               className={`px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider ${zone.active ? 'bg-emerald-50 text-gray-900 border border-emerald-100' : 'bg-gray-50 text-gray-400 border border-gray-200'}`}
                             >
                               {zone.active ? 'Active' : 'Inactive'}
                             </button>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                             <div className="flex items-center justify-end gap-2 relative z-50">
                               <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(`/admin/pricing/zone/edit/${zone._id || zone.id}`); }} className="p-2 text-gray-400 hover:text-[#0B1220] hover:bg-[#FFC400] rounded-lg transition-colors"><Edit2 size={14} /></button>
                               <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(zone._id || zone.id); }} className="p-2 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"><Trash2 size={14} /></button>
                               <button
                                 type="button"
                                 onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleExplore(zone); }}
                                 title="Explore Zone"
                                 className="p-2 text-gray-400 hover:text-[#0B1220] hover:bg-[#FFC400] rounded-lg transition-colors"
                               >
                                 <Globe size={14} />
                               </button>
                             </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="py-20 text-center">
                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center text-gray-200 mx-auto mb-4"><Navigation size={32} /></div>
                    <h3 className="text-sm text-gray-900 mb-1 font-bold">No Zones Configured</h3>
                    <p className="text-xs text-gray-400 max-w-xs mx-auto">Map your operational sector boundaries to initiate geofencing.</p>
                  </div>
                )}
              </div>

              {!loading && filteredZones.length > 0 && (
                <div className="flex flex-col gap-4 border-t border-gray-100 bg-gray-50/40 px-4 py-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span className="font-medium">
                      Showing {Math.min(((currentPage - 1) * pageSize) + 1, filteredZones.length)} to {Math.min(currentPage * pageSize, filteredZones.length)} of {filteredZones.length} zones
                    </span>
                    <select
                      value={pageSize}
                      onChange={(e) => setPageSize(Number(e.target.value))}
                      className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none transition-colors focus:border-[#FFC400]"
                    >
                      {[10, 20, 50].map((size) => (
                        <option key={size} value={size}>{size} / page</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                      disabled={currentPage === 1}
                      className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 transition-colors hover:border-[#FFC400]/50 hover:text-[#0B1220] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <span className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-gray-700 border border-gray-200">
                      Page {currentPage} of {totalZonePages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setCurrentPage((page) => Math.min(totalZonePages, page + 1))}
                      disabled={currentPage === totalZonePages}
                      className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 transition-colors hover:border-[#FFC400]/50 hover:text-[#0B1220] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="form" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
            className="max-w-7xl mx-auto space-y-6 pb-20"
          >
            <div className="mb-6">
              <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-2">
                <span>Pricing</span>
                <ChevronRight size={12} />
                <span>Zone Management</span>
                <ChevronRight size={12} />
                <span className="text-gray-700">{editingId ? 'Edit' : 'Create'}</span>
              </div>
              <div className="flex items-center justify-between">
                <h1 className="text-xl text-gray-900 font-bold">{editingId ? 'Edit Market Zone' : 'Add Market Zone'}</h1>
                <button 
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate("/admin/pricing/zone"); setView('list'); }}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors shadow-sm relative z-50"
                >
                  <ArrowLeft size={14} /> Back
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
              {/* Form Section */}
              <div className="xl:col-span-4 space-y-6">
                <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                   <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
                      <div className="w-9 h-9 rounded-lg bg-[#FFC400]/10 flex items-center justify-center text-[#FFC400]">
                        <Tag size={18} />
                      </div>
                      <div>
                        <h3 className="text-sm text-gray-900 font-bold">Zone Identity</h3>
                        <p className="text-xs text-gray-400">Basic identification settings</p>
                      </div>
                   </div>
                   
                   <div className="space-y-5">
                      <div>
                        <label className={labelClass}>Service Location</label>
                        <select 
                          value={formData.service_location_id}
                          onChange={(e) => {
                            const nextId = e.target.value;
                            setFormData({...formData, service_location_id: nextId});
                            const loc = serviceLocations.find(l => String(l._id || l.id) === String(nextId));
                            if (loc?.latitude) {
                              const center = { lat: Number(loc.latitude), lng: Number(loc.longitude) };
                              setMapCenter(center);
                              mapRef.current?.panTo(center);
                            }
                          }}
                          className={inputClass}
                        >
                          <option value="">Select Service Location</option>
                          {serviceLocations.map(sl => (
                            <option key={sl._id || sl.id} value={sl._id || sl.id}>{sl.name || sl.service_location_name}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <div className="flex items-center gap-1 border-b border-gray-100 mb-4 overflow-x-auto hide-scrollbar whitespace-nowrap pb-1">
                          {ADMIN_LANGUAGE_OPTIONS.map(lang => (
                            <button
                              type="button"
                              key={lang}
                              onClick={(e) => { e.preventDefault(); setActiveTab(lang); }}
                              className={`px-4 py-2 text-xs font-medium transition-colors relative whitespace-nowrap shrink-0 ${activeTab === lang ? 'text-[#FFC400]' : 'text-gray-400 hover:text-gray-600'}`}
                            >
                              {lang}
                              {activeTab === lang && (
                                <motion.div layoutId="activeTab" className="absolute bottom-[-1px] left-0 right-0 h-[2px] bg-[#FFC400]" />
                              )}
                            </button>
                          ))}
                        </div>
                        
                        <div>
                          <label className={labelClass}>Zone Name *</label>
                          <input 
                            type="text" 
                            value={formData.name[activeTab] || ''}
                            onChange={(e) => setFormData({...formData, name: { ...formData.name, [activeTab]: e.target.value }})}
                            placeholder={`Name in ${activeTab}`}
                            className={inputClass}
                          />
                        </div>
                      </div>

                      <div>
                        <label className={labelClass}>Boundary Shape</label>
                        <div className="grid grid-cols-2 gap-3">
                          {[
                            { id: 'polygon', label: 'Polygon Boundary' },
                            { id: 'circle', label: 'Circle Radius' },
                          ].map((option) => (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => setBoundaryMode(option.id)}
                              className={`rounded-lg border px-4 py-3 text-sm font-semibold transition-colors ${
                                boundaryMode === option.id
                                  ? 'border-[#FFC400] bg-[#FFC400]/10 text-[#0B1220]'
                                  : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                              }`}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {boundaryMode === 'circle' ? (
                        <div>
                          <label className={labelClass}>Circle Boundary Radius (meters)</label>
                          <input
                            type="number"
                            min="1"
                            value={circleRadiusMeters}
                            onChange={(e) => setCircleRadiusMeters(e.target.value)}
                            placeholder="Enter circle radius in meters"
                            className={inputClass}
                          />
                        </div>
                      ) : null}

                   </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3 shadow-sm">
                   <button 
                     disabled={saving} onClick={handleSave}
                     className="w-full py-3 bg-[#FFC400] text-[#0B1220] rounded-lg text-sm font-medium hover:brightness-95 transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
                   >
                     {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                     {editingId ? 'Update Zone' : 'Save'}
                   </button>
                   <button 
                     onClick={() => navigate("/admin/pricing/zone")}
                     className="w-full py-3 bg-gray-50 text-gray-600 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-100 transition-colors"
                   >
                     Cancel
                   </button>
                </div>
              </div>

              {/* Map Section */}
              <div className="xl:col-span-8 space-y-6">
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                   <div className="flex flex-col gap-3 border-b border-gray-100 px-4 py-4 md:flex-row md:items-center md:justify-between">
                      <div className="w-full md:max-w-md">
                        <div className="flex h-12 w-full items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 shadow-sm">
                           <Search className="text-gray-400" size={18} />
                           {isLoaded ? (
                             <Autocomplete
                               onLoad={a => setAutocomplete(a)}
                               onPlaceChanged={onPlaceChanged}
                               className="flex-1"
                             >
                               <input
                                 type="text"
                                 placeholder="Search for a city or zone"
                                 className="w-full bg-transparent text-sm font-semibold text-gray-800 outline-none placeholder:text-gray-400"
                               />
                             </Autocomplete>
                           ) : (
                             <input
                               type="text"
                               placeholder={loadError ? "Google Maps failed to load" : "Loading map search..."}
                               disabled
                               className="w-full bg-transparent text-sm font-semibold text-gray-400 outline-none placeholder:text-gray-400"
                             />
                           )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3 md:justify-end">
                        <div className="rounded-full bg-slate-50 px-3 py-1.5 text-[11px] font-semibold text-slate-500">
                          State and city labels remain visible while you draw zone boundaries.
                        </div>
                        <button 
                          type="button"
                          onClick={() => {
                            setPolygonCoords([]);
                            setCircleCenter(null);
                            setCircleRadiusMeters('');
                          }}
                          className="flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-[11px] font-black uppercase tracking-widest text-rose-600 shadow-sm transition-all border border-gray-200 hover:bg-rose-50 active:scale-95"
                        >
                          <X size={14} />
                          Clear Map
                        </button>
                      </div>
                   </div>

                   <div className="h-[620px] p-2">
                     {isLoaded ? (
                       <div className="w-full h-full rounded-lg overflow-hidden relative">
                         <GoogleMap
                           mapContainerStyle={{ width: '100%', height: '100%' }}
                           center={mapCenter} zoom={12}
                           onLoad={m => { mapRef.current = m; }}
                           options={{
                              mapTypeId: 'roadmap',
                              disableDefaultUI: false,
                              zoomControl: true,
                              mapTypeControl: true,
                              streetViewControl: false,
                              fullscreenControl: true
                           }}
                         >
                           <DrawingManager
                             onPolygonComplete={onPolygonComplete}
                             options={{
                               drawingControl: true,
                               drawingControlOptions: {
                                 position: window.google.maps.ControlPosition.TOP_RIGHT,
                                 drawingModes: [
                                   window.google.maps.drawing.OverlayType.POLYGON,
                                   window.google.maps.drawing.OverlayType.CIRCLE,
                                 ],
                               },
                               polygonOptions: {
                                 fillColor: '#FFC400',
                                 fillOpacity: 0.15,
                                 strokeColor: '#FFC400',
                                 strokeWeight: 2,
                                 editable: true,
                               },
                               circleOptions: {
                                 fillColor: '#FFC400',
                                 fillOpacity: 0.12,
                                 strokeColor: '#FFC400',
                                 strokeWeight: 2,
                                 editable: true,
                               },
                             }}
                             onCircleComplete={onCircleComplete}
                           />
                           {boundaryMode === 'polygon' && polygonCoords.length > 0 && (
                             <Polygon
                               paths={polygonCoords}
                               options={{ fillColor: '#FFC400', strokeColor: '#FFC400', strokeWeight: 2, fillOpacity: 0.25, editable: true, draggable: true }}
                               onLoad={(polygon) => {
                                 polygonListenersRef.current.forEach((listener) => listener?.remove?.());
                                 polygonListenersRef.current = [];
                                 polygonRef.current = polygon;
                                 const path = polygon.getPath();
                                 polygonListenersRef.current = [
                                   path.addListener('set_at', syncPolygonState),
                                   path.addListener('insert_at', syncPolygonState),
                                   path.addListener('remove_at', syncPolygonState),
                                   polygon.addListener('dragend', syncPolygonState),
                                   polygon.addListener('mouseup', syncPolygonState),
                                 ];
                               }}
                               onUnmount={() => {
                                 polygonListenersRef.current.forEach((listener) => listener?.remove?.());
                                 polygonListenersRef.current = [];
                                 polygonRef.current = null;
                               }}
                             />
                           )}
                           {boundaryMode === 'circle' && circleCenter && Number(circleRadiusMeters) > 0 ? (
                             <Circle
                               center={circleCenter}
                               radius={Number(circleRadiusMeters)}
                               options={{
                                 fillColor: '#FFC400',
                                 strokeColor: '#FFC400',
                                 strokeWeight: 2,
                                 fillOpacity: 0.18,
                                 editable: true,
                                 draggable: true,
                               }}
                               onLoad={(circle) => {
                                 circleListenersRef.current.forEach((listener) => listener?.remove?.());
                                 circleListenersRef.current = [];
                                 circleRef.current = circle;
                                 circleListenersRef.current = [
                                   circle.addListener('dragend', syncCircleState),
                                   circle.addListener('radius_changed', syncCircleState),
                                   circle.addListener('mouseup', syncCircleState),
                                 ];
                               }}
                               onUnmount={() => {
                                 circleListenersRef.current.forEach((listener) => listener?.remove?.());
                                 circleListenersRef.current = [];
                                 circleRef.current = null;
                               }}
                             />
                           ) : null}
                           {countryBoundaryPaths.map((path, index) => (
                              <Polygon
                                key={index} paths={path}
                                options={{ strokeColor: '#f43f5e', fillOpacity: 0.05, fillColor: '#f43f5e', strokeWeight: 1.5, strokeDasharray: '5,5', clickable: false }}
                              />
                           ))}
                         </GoogleMap>
                       </div>
                     ) : (
                       <div className="flex h-full items-center justify-center bg-gray-50 rounded-lg">
                          <Loader2 className="animate-spin text-gray-300" size={32} />
                       </div>
                     )}
                   </div>
                </div>

                <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-amber-800 flex items-start gap-3 shadow-sm">
                   <Info size={18} className="text-amber-500 shrink-0 mt-0.5" />
                   <p className="text-sm font-medium">
                     Avoid drawing multiple zones that overlap with each other.
                   </p>
                </div>

                <div className="bg-gray-900 rounded-xl p-6 text-white overflow-hidden relative shadow-md">
                    <div className="relative z-10">
                      <h4 className="text-sm mb-2 flex items-center gap-2 font-bold"><MapPin size={16} className="text-[#FFC400]" /> Mapping Intelligence</h4>
                      <p className="text-xs text-gray-300 leading-relaxed">
                        Use the polygon or circle tool at the top of the map to define your zone boundary. Click to place polygon vertices and close the shape, or drop a circle and adjust its radius for a radial market boundary. The red dashed line represents the country boundary for reference.
                      </p>
                    </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ZoneManagement;
