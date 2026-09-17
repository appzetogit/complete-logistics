import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Circle, GoogleMap } from '@react-google-maps/api';
import { 
  ChevronRight, 
  Map as MapIcon, 
  RefreshCw, 
  Settings2, 
  ArrowLeft,
  Activity,
  Zap,
  Navigation,
  MapPinOff
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useBaseGoogleMapsLoader, HAS_VALID_GOOGLE_MAPS_KEY } from '../../utils/googleMaps';
import { adminService } from '../../services/adminService';

const INDIA_CENTER = { lat: 22.7196, lng: 75.8577 };
const MAP_CONTAINER_STYLE = { width: '100%', height: '400px' };

const mapOptions = {
  disableDefaultUI: false,
  zoomControl: true,
  streetViewControl: false,
  mapTypeControl: true,
  fullscreenControl: true,
  styles: [
    { elementType: 'geometry', stylers: [{ color: '#f9fafb' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#6b7280' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#e5e7eb' }] }
  ]
};

const FIRE_OVERLAY_STYLE = {
  fillColor: '#ef4444',
  strokeColor: '#b91c1c',
};

const hasUsableCoordinates = (latitude, longitude) => {
  const lat = Number(latitude);
  const lng = Number(longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
};

const toHeatBucketKey = (latitude, longitude) =>
  `${Number(latitude).toFixed(3)}:${Number(longitude).toFixed(3)}`;

const extractCoordinates = (item, source) => {
  let coords = null;
  if (source === 'ride_requests' || source === 'trip_pickups') {
    coords = item?.pickupLocation?.coordinates;
  } else if (source === 'trip_drops') {
    coords = item?.dropLocation?.coordinates;
  } else if (source === 'active_drivers') {
    coords = item?.location?.coordinates || item?.currentLocation?.coordinates;
  } else if (source === 'sos_alerts') {
    coords = item?.location?.coordinates || item?.pickupLocation?.coordinates;
  }

  const longitude = Number(Array.isArray(coords) ? coords[0] : null);
  const latitude = Number(Array.isArray(coords) ? coords[1] : null);

  if (!hasUsableCoordinates(latitude, longitude)) {
    return null;
  }
  return { latitude, longitude };
};

const HeatMap = () => {
  const navigate = useNavigate();
  const [dataPoints, setDataPoints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState(null);
  
  // Settings State
  const [heatSource, setHeatSource] = useState('ride_requests');
  const [opacity, setOpacity] = useState(0.7);
  const [radius, setRadius] = useState(40);
  
  // Filters State
  const [timeRange, setTimeRange] = useState('all');
  const [serviceLocation, setServiceLocation] = useState('all');
  const [zone, setZone] = useState('all');
  const [vehicleType, setVehicleType] = useState('all');

  // Options Data
  const [serviceLocations, setServiceLocations] = useState([]);
  const [zones, setZones] = useState([]);
  const [vehicleTypes, setVehicleTypes] = useState([]);

  const { isLoaded, loadError } = useBaseGoogleMapsLoader();

  const inputClass = "w-full border border-gray-200 rounded-md px-2 py-1.5 text-xs text-gray-800 bg-white focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 outline-none transition-colors";
  const labelClass = "block text-[11px] font-bold text-gray-500 mb-1";

  useEffect(() => {
    // Load filter options
    const loadOptions = async () => {
      try {
        const [locRes, zoneRes, vTypeRes] = await Promise.all([
          adminService.getServiceLocations().catch(() => ({ data: [] })),
          adminService.getZones().catch(() => ({ data: [] })),
          adminService.getVehicleTypes().catch(() => ({ data: { results: [] } }))
        ]);
        setServiceLocations(locRes.data?.results || locRes.data || []);
        setZones(zoneRes.data?.results || zoneRes.data || []);
        setVehicleTypes(vTypeRes.data?.results || vTypeRes.data || []);
      } catch (err) {
        console.error("Failed to load filter options", err);
      }
    };
    loadOptions();
  }, []);

  const fetchHeatmapData = useCallback(async () => {
    setLoading(true);
    try {
      let results = [];
      if (heatSource === 'ride_requests') {
        const res = await adminService.getRideRequests({ page: 1, limit: 500, tab: 'all' });
        results = res?.data?.results || res?.data || [];
      } else if (heatSource === 'active_drivers') {
        const res = await adminService.getDrivers({ page: 1, limit: 500, status: 'active' });
        results = res?.data?.results || res?.data || [];
      } else if (heatSource === 'trip_pickups' || heatSource === 'trip_drops') {
        const res = await adminService.getTrips({ page: 1, limit: 500, tab: 'all' });
        results = res?.data?.results || res?.data || [];
      } else if (heatSource === 'sos_alerts') {
        const res = await adminService.getSafetyAlerts({ page: 1, limit: 500 });
        results = res?.data?.results || res?.data || [];
      }
      setDataPoints(Array.isArray(results) ? results : []);
      setLastSync(new Date());
    } catch (error) {
      console.error('Failed to fetch heatmap data', error);
      setDataPoints([]);
    } finally {
      setLoading(false);
    }
  }, [heatSource]);

  useEffect(() => {
    fetchHeatmapData();
  }, [fetchHeatmapData]);

  // Client-side filtering
  const filteredData = useMemo(() => {
    return dataPoints.filter((item) => {
      // Time Filter
      if (timeRange !== 'all') {
        const itemDate = new Date(item.createdAt || item.date || item.updatedAt);
        if (!isNaN(itemDate.getTime())) {
          const now = new Date();
          const diffHour = (now - itemDate) / (1000 * 60 * 60);
          if (timeRange === 'last_hour' && diffHour > 1) return false;
          if (timeRange === 'today' && itemDate.toDateString() !== now.toDateString()) return false;
        }
      }

      // We apply generic matching if fields exist
      if (serviceLocation !== 'all' && item.serviceLocationId && item.serviceLocationId !== serviceLocation) {
        return false;
      }
      if (zone !== 'all' && item.zoneId && item.zoneId !== zone) {
        return false;
      }
      if (vehicleType !== 'all' && item.vehicleTypeId && item.vehicleTypeId !== vehicleType) {
        return false;
      }

      return true;
    });
  }, [dataPoints, timeRange, serviceLocation, zone, vehicleType]);

  const requestOverlays = useMemo(() => {
    const buckets = new Map();

    filteredData.forEach((item) => {
      const coords = extractCoordinates(item, heatSource);
      if (!coords) return;

      const key = toHeatBucketKey(coords.latitude, coords.longitude);
      const current = buckets.get(key) || {
        id: key,
        center: { lat: coords.latitude, lng: coords.longitude },
        count: 0,
      };

      current.count += 1;
      buckets.set(key, current);
    });

    return [...buckets.values()];
  }, [filteredData, heatSource]);

  const mapCenter = useMemo(() => {
    if (requestOverlays.length > 0) {
      return requestOverlays[0].center;
    }
    return INDIA_CENTER;
  }, [requestOverlays]);

  const circleRadiusMeters = Math.max(250, radius * 140);

  return (
    <div className="min-h-screen bg-slate-50/50 p-3 lg:p-4 mx-auto w-full max-w-[1600px] font-sans">
      
      {/* 1. Header Block */}
      <div className="mb-2 flex flex-col md:flex-row md:items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 mb-1">
            <span>Geofencing</span>
            <ChevronRight size={14} className="text-slate-300" />
            <span className="text-slate-600">Heat Map</span>
          </div>
          <h1 className="text-base text-slate-900 font-bold">Heat Map Overlay</h1>
        </div>
        <button 
           onClick={() => navigate('/admin/dashboard')}
           className="inline-flex w-fit items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-bold text-slate-600 shadow-sm border border-slate-200 transition hover:bg-slate-50"
        >
          <ArrowLeft size={16} /> Back to Dashboard
        </button>
      </div>

      <div className="space-y-3">
        
        {/* 2. Map Canvas Card */}
        <div className="bg-white rounded-xl border border-slate-200 p-1.5 shadow-sm relative">
           <div className="rounded-xl overflow-hidden relative">
              {loadError ? (
                 <div className="h-[400px] flex items-center justify-center bg-slate-50 text-red-500 font-semibold">Map Load Error</div>
              ) : HAS_VALID_GOOGLE_MAPS_KEY && isLoaded ? (
                 <>
                   <GoogleMap
                      mapContainerStyle={MAP_CONTAINER_STYLE} center={mapCenter} zoom={11} options={mapOptions}
                   >
                      {requestOverlays.map((overlay) => (
                        <Circle
                          key={overlay.id}
                          center={overlay.center}
                          radius={circleRadiusMeters * Math.max(1, Math.min(overlay.count, 6))}
                          options={{
                            fillColor: FIRE_OVERLAY_STYLE.fillColor,
                            fillOpacity: Math.max(0.18, Math.min(opacity * 0.6, 0.82)),
                            strokeColor: FIRE_OVERLAY_STYLE.strokeColor,
                            strokeOpacity: Math.max(0.2, Math.min(opacity, 0.9)),
                            strokeWeight: 2,
                            clickable: false,
                          }}
                        />
                      ))}
                   </GoogleMap>
                   {requestOverlays.length === 0 && !loading && (
                     <div className="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-[2px] pointer-events-none">
                       <div className="bg-white px-6 py-4 rounded-2xl shadow-lg border border-slate-100 flex flex-col items-center text-center max-w-sm">
                         <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center text-slate-400 mb-3">
                           <MapPinOff size={24} />
                         </div>
                         <h3 className="text-base font-bold text-slate-900 mb-1">No heat activity found</h3>
                         <p className="text-xs text-slate-500">There are no data points available for the selected source and filters in this region.</p>
                       </div>
                     </div>
                   )}
                 </>
              ) : (
                <div className="h-[400px] flex flex-col items-center justify-center bg-slate-50 gap-4">
                   <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-sm text-yellow-500"><MapIcon size={32} /></div>
                   <p className="text-[10px] font-black text-slate-400 tracking-[0.2em]">MAP API KEY REQUIRED</p>
                </div>
              )}
              
              {/* Floating Action Badge */}
              <div className="absolute top-4 right-4 flex items-center gap-2">
                 <button onClick={fetchHeatmapData} disabled={loading} className="w-10 h-10 bg-white rounded-xl shadow-md flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors border border-slate-200 disabled:opacity-50">
                    <RefreshCw size={18} className={loading ? 'animate-spin text-yellow-500' : ''} />
                 </button>
              </div>
           </div>
        </div>

        {/* 3. Controls & Filters Section */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
           {/* Section Header */}
           <div className="px-3 py-2.5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-2 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-white border border-slate-200 rounded-lg flex items-center justify-center text-slate-600 shadow-sm">
                   <Settings2 size={16} />
                </div>
                <div>
                   <h3 className="text-xs font-black text-slate-900 tracking-tight">Data & Visibility</h3>
                   <p className="text-[10px] text-slate-500 font-medium">Select source, filters & overlay</p>
                </div>
              </div>
           </div>
           
           <div className="p-2">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                 
                 {/* Filters Left Column */}
                 <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-4 gap-2">
                    <div>
                       <label className={labelClass}>Heat Source</label>
                       <select
                         value={heatSource}
                         onChange={(e) => setHeatSource(e.target.value)}
                         className={inputClass}
                       >
                         <option value="ride_requests">Ride Requests (Pickups)</option>
                         <option value="active_drivers">Active Drivers</option>
                         <option value="trip_pickups">Trip Pickups</option>
                         <option value="trip_drops">Trip Drops</option>
                         <option value="sos_alerts">SOS Alerts</option>
                       </select>
                    </div>

                    <div>
                       <label className={labelClass}>Time Range</label>
                       <select
                         value={timeRange}
                         onChange={(e) => setTimeRange(e.target.value)}
                         className={inputClass}
                       >
                         <option value="all">All Time</option>
                         <option value="last_hour">Last 1 Hour</option>
                         <option value="today">Today</option>
                       </select>
                    </div>

                    <div>
                       <label className={labelClass}>Service Location</label>
                       <select
                         value={serviceLocation}
                         onChange={(e) => setServiceLocation(e.target.value)}
                         className={inputClass}
                       >
                         <option value="all">All Locations</option>
                         {serviceLocations.map(loc => (
                           <option key={loc._id} value={loc._id}>{loc.name || loc.city}</option>
                         ))}
                       </select>
                    </div>

                    <div>
                       <label className={labelClass}>Vehicle Type</label>
                       <select
                         value={vehicleType}
                         onChange={(e) => setVehicleType(e.target.value)}
                         className={inputClass}
                       >
                         <option value="all">All Vehicles</option>
                         {vehicleTypes.map(vt => (
                           <option key={vt._id} value={vt._id}>{vt.name}</option>
                         ))}
                       </select>
                    </div>
                 </div>

                 {/* Sliders Right Column */}
                 <div className="lg:col-span-4 lg:border-l lg:border-slate-100 lg:pl-3 space-y-3 flex flex-col justify-center">
                    <div className="space-y-1.5">
                       <div className="flex items-center justify-between">
                          <label className={labelClass + " !mb-0"}>Layer Opacity</label>
                          <span className="text-[10px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">{Math.round(opacity * 100)}%</span>
                       </div>
                       <input 
                         type="range" min="0" max="1" step="0.01" value={opacity} 
                         onChange={e => setOpacity(Number(e.target.value))}
                         className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-800"
                       />
                    </div>

                    <div className="space-y-1.5">
                       <div className="flex items-center justify-between">
                          <label className={labelClass + " !mb-0"}>Gradient Radius</label>
                          <span className="text-[10px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded font-mono">{radius}px</span>
                       </div>
                       <input 
                         type="range" min="1" max="100" step="1" value={radius} 
                         onChange={e => setRadius(Number(e.target.value))}
                         className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-800"
                       />
                    </div>
                 </div>

              </div>
           </div>
        </div>

        {/* 4. Dynamic KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
           <div className="bg-white rounded-lg border border-slate-200 p-3 flex items-center gap-3 shadow-sm hover:border-slate-300 transition-colors">
              <div className="w-8 h-8 bg-slate-50 flex items-center justify-center rounded-md text-slate-400">
                 <Navigation size={16} />
              </div>
              <div>
                 <p className="text-[9px] font-bold text-slate-400 tracking-wider mb-0.5">Coverage</p>
                 <p className="text-base font-black text-slate-900 tracking-tight leading-none">{requestOverlays.length} Hotspots</p>
              </div>
           </div>

           <div className="bg-white rounded-lg border border-slate-200 p-3 flex items-center gap-3 shadow-sm hover:border-slate-300 transition-colors">
              <div className="w-8 h-8 bg-slate-50 flex items-center justify-center rounded-md text-slate-400">
                 <Activity size={16} />
              </div>
              <div>
                 <p className="text-[9px] font-bold text-slate-400 tracking-wider mb-0.5">Live Data</p>
                 <p className="text-base font-black text-slate-900 tracking-tight leading-none">{filteredData.length} Points</p>
              </div>
           </div>

           <div className="bg-white rounded-lg border border-slate-200 p-3 flex items-center gap-3 shadow-sm hover:border-slate-300 transition-colors">
              <div className="w-8 h-8 bg-slate-50 flex items-center justify-center rounded-md text-slate-400">
                 <Zap size={16} className={loading ? "text-yellow-500 animate-pulse" : ""} />
              </div>
              <div>
                 <p className="text-[9px] font-bold text-slate-400 tracking-wider mb-0.5">Sync State</p>
                 <p className="text-[11px] font-black text-slate-900 tracking-tight leading-tight">
                   {loading ? 'Syncing...' : lastSync ? `Synced ${lastSync.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}` : 'Pending'}
                 </p>
              </div>
           </div>
        </div>

      </div>
    </div>
  );
};

export default HeatMap;
