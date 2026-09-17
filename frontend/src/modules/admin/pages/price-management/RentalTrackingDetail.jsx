import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { GoogleMap, MarkerF, PolylineF } from '@react-google-maps/api';
import toast from 'react-hot-toast';
import { socketService } from '../../../../shared/api/socket';
import { adminService } from '../../services/adminService';
import { useBaseGoogleMapsLoader, HAS_VALID_GOOGLE_MAPS_KEY } from '../../utils/googleMaps';
import {
  AlertTriangle,
  Clock3,
  Loader2,
  MapPin,
  Navigation,
  Phone,
  Radio,
  ShieldAlert,
  User2,
  Activity,
  ArrowUp,
  CheckCircle2,
  Info,
  BatteryMedium,
  Signal,
  Calendar,
  CreditCard,
  Hash,
  Flag,
  Car,
  Zap,
  Gauge,
  ArrowLeft,
  RefreshCw,
  Eye,
  UserPlus,
  PowerOff,
  Download,
  Focus,
  Layers,
  Map as MapIcon,
  Maximize2,
  Minimize2,
  Star,
  Fuel,
  Key,
  ShieldCheck,
  FileCheck2,
  Route,
  Timer
} from 'lucide-react';
const mapContainerStyle = { width: '100%', height: '100%' };

const statusTone = {
  active: { label: 'LIVE', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  idle: { label: 'IDLE', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  location_off: { label: 'GPS LOST', color: 'bg-rose-50 text-rose-700 border-rose-200' },
  tracking_stopped: { label: 'OFFLINE', color: 'bg-slate-50 text-slate-700 border-slate-200' },
  inactive: { label: 'OFFLINE', color: 'bg-slate-100 text-slate-500 border-slate-200' },
};

const formatDateTime = (value) => {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return 'Not available';
  return parsed.toLocaleString();
};

const formatTimeOnly = (value) => {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return '--:--';
  return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const formatMinutesAgo = (value) => {
  const parsed = value ? new Date(value).getTime() : NaN;
  if (!Number.isFinite(parsed)) return 'No ping';
  const diffMs = Math.max(0, Date.now() - parsed);
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes <= 0) return 'Just now';
  if (diffMinutes === 1) return '1 min ago';
  return `${diffMinutes} mins ago`;
};

const formatDistance = (value) => {
  const distance = Number(value);
  if (!Number.isFinite(distance)) return '0 m';
  if (distance >= 1000) return `${(distance / 1000).toFixed(2)} km`;
  return `${distance.toFixed(0)} m`;
};

const getAccuracyConfidence = (accuracy) => {
  const val = Number(accuracy);
  if (!Number.isFinite(val)) return { label: 'Unknown', color: 'text-slate-400 bg-slate-100' };
  if (val <= 20) return { label: 'High', color: 'text-emerald-700 bg-emerald-100' };
  if (val <= 100) return { label: 'Medium', color: 'text-amber-700 bg-amber-100' };
  return { label: 'Low', color: 'text-rose-700 bg-rose-100' };
};



const getSignalStrength = (accuracy) => {
  const val = Number(accuracy);
  if (!Number.isFinite(val)) return { label: 'Unknown', color: 'text-slate-400', bars: 0 };
  if (val <= 20) return { label: 'Excellent', color: 'text-emerald-500', bars: 4 };
  if (val <= 50) return { label: 'Good', color: 'text-blue-500', bars: 3 };
  if (val <= 100) return { label: 'Fair', color: 'text-amber-500', bars: 2 };
  return { label: 'Poor', color: 'text-rose-500', bars: 1 };
};

const findTrackingItem = async (id) => {
  const response = await adminService.getRentalTrackingDashboard();
  const payload = response?.data?.data || response?.data || {};
  const results = Array.isArray(payload?.results) ? payload.results : [];
  return results.find((item) => String(item?.id) === String(id)) || null;
};

const RentalTrackingDetail = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const seededItem = location.state?.item || null;
  const [item, setItem] = useState(seededItem);
  const [loading, setLoading] = useState(!seededItem);
  const [lastUpdated, setLastUpdated] = useState(Date.now());
  const { isLoaded, loadError } = useBaseGoogleMapsLoader();
  
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mapType, setMapType] = useState('roadmap');
  const [showTraffic, setShowTraffic] = useState(false);
  const mapRef = useRef(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const nextItem = await findTrackingItem(id);
      if (nextItem) {
        setItem(nextItem);
        setLastUpdated(Date.now());
      } else {
        toast.error('Tracked rental not found.');
        navigate('/admin/pricing/rental-tracking', { replace: true });
      }
    } catch (error) {
      toast.error(error?.message || 'Could not load rental tracking details.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    if (!seededItem || String(seededItem?.id) !== String(id)) {
      load();
    }
    const intervalId = window.setInterval(() => load(true), 10000);
    return () => window.clearInterval(intervalId);
  }, [id, seededItem, load]);

  useEffect(() => {
    const socket = socketService.connect({ role: 'admin' });
    if (!socket) return undefined;

    const handleTrackingUpdate = (payload) => {
      if (String(payload?.id) === String(id)) {
        setItem(payload);
        setLastUpdated(Date.now());
      }
    };

    const handleTrackingAlert = (payload) => {
      if (String(payload?.id) !== String(id)) return;
      setItem(payload);
      setLastUpdated(Date.now());
      toast((payload?.rentalTracking?.alerts || [])[0]?.message || 'Rental tracking alert triggered.');
    };

    socketService.on('rental:tracking:updated', handleTrackingUpdate);
    socketService.on('rental:tracking:alert', handleTrackingAlert);

    return () => {
      socketService.off('rental:tracking:updated', handleTrackingUpdate);
      socketService.off('rental:tracking:alert', handleTrackingAlert);
    };
  }, [id]);

  const handleEndTrip = async () => {
    try {
      setLoading(true);
      await adminService.updateRentalBookingRequest(item?.bookingId || id, { status: 'COMPLETED' });
      toast.success('Trip ended successfully');
      load(true);
    } catch (e) {
      toast.error(e?.response?.data?.message || e?.message || 'Failed to end trip');
      setLoading(false);
    }
  };

  const handleRecenter = () => {
    if (mapRef.current && hasLiveLocation) {
      mapRef.current.panTo({ lat: Number(tracking.currentLocation.lat), lng: Number(tracking.currentLocation.lng) });
      mapRef.current.setZoom(16);
    }
  };

  const tracking = item?.rentalTracking || {};
  const hasLiveLocation = Number.isFinite(Number(tracking?.currentLocation?.lat)) && Number.isFinite(Number(tracking?.currentLocation?.lng));
  const speed = Number(tracking.speed || 0);
  
  let refinedTrackingStatus = tracking.trackingStatus || 'inactive';
  if (refinedTrackingStatus === 'active' && speed === 0) refinedTrackingStatus = 'idle';
  const isActive = tracking.trackingStatus === 'active';
  const isTripEnded = tracking.trackingStatus === 'tracking_stopped';
  
  const mapCenter = useMemo(() => {
    if (hasLiveLocation) return { lat: Number(tracking.currentLocation.lat), lng: Number(tracking.currentLocation.lng) };
    const hubLat = Number(item?.serviceLocation?.latitude);
    const hubLng = Number(item?.serviceLocation?.longitude);
    if (Number.isFinite(hubLat) && Number.isFinite(hubLng)) return { lat: hubLat, lng: hubLng };
    return INDIA_CENTER;
  }, [hasLiveLocation, item, tracking]);

  const accuracyData = getAccuracyConfidence(tracking.accuracyMeters);
  const statusInfo = statusTone[refinedTrackingStatus] || statusTone.inactive;
  
  const batteryLevel = Number(tracking.batteryLevel || tracking.battery_level) || 0;
  const fuelLevel = Number(tracking.fuelLevel || tracking.fuel_level) || 0;
  const signalInfo = useMemo(() => getSignalStrength(tracking.accuracyMeters), [tracking.accuracyMeters]);
  const odometer = Number(tracking.odometerKm || tracking.odometer) || 0;
  const driverRating = item?.driver?.rating ? Number(item.driver.rating).toFixed(1) : '--';
  
  const distanceCoveredMeters = Number(tracking.distanceFromHubMeters || 0);
  const plannedDistanceMeters = Number(item?.plannedDistanceMeters || item?.packageDistanceMeters || 0);
  const remainingDistanceMeters = plannedDistanceMeters > 0 ? Math.max(0, plannedDistanceMeters - distanceCoveredMeters) : 0;
  const progressPercent = plannedDistanceMeters > 0 ? Math.min(100, Math.max(5, (distanceCoveredMeters / plannedDistanceMeters) * 100)) : (isActive ? 10 : 0);
  const avgSpeed = (speed > 0) ? (speed * 0.85).toFixed(1) : 0;
  const etaMinutes = remainingDistanceMeters > 0 && avgSpeed > 0 ? (remainingDistanceMeters / 1000 / avgSpeed * 60).toFixed(0) : '--';

  const mockRoutePath = useMemo(() => {
    if (!hasLiveLocation) return [];
    const hubLat = Number(item?.serviceLocation?.latitude) || mapCenter.lat - 0.05;
    const hubLng = Number(item?.serviceLocation?.longitude) || mapCenter.lng - 0.05;
    return [
      { lat: hubLat, lng: hubLng },
      { lat: mapCenter.lat - 0.02, lng: mapCenter.lng - 0.01 },
      mapCenter
    ];
  }, [hasLiveLocation, item, mapCenter]);

  return (
    <div className="min-h-screen bg-[#f6f7fb] p-3 lg:p-4">
      {/* ── Compact header row: breadcrumb + title + actions all inline ── */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        {/* Left: breadcrumb + title */}
        <div>
          <p className="mb-0.5 flex items-center gap-1 text-[11px] text-slate-400">
            <span>Operations</span>
            <span>›</span>
            <span className="text-slate-600">Fleet Dashboard</span>
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/admin/pricing/rental-tracking')}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50"
              title="Back to Fleet Dashboard"
            >
              <ArrowLeft size={14} />
            </button>
            <h1 className="text-[22px] font-bold leading-tight text-black">
              Trip:{' '}
              <span className="font-black">
                {item?.bookingReference || item?.bookingId || item?.id || 'Details'}
              </span>
            </h1>
          </div>
        </div>
        
        {/* Right: action buttons – horizontally scrollable on mobile */}
        <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto rounded-lg bg-white p-1.5 shadow-sm">

          <button onClick={() => load()} className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-100">
            <RefreshCw size={14} /> Refresh
          </button>

          {item?.driver?.phone ? (
            <a href={`tel:${item.driver.phone}`} title={`Call Driver: ${item.driver.name || ''}`}
              className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-100">
              <Phone size={14} /> Driver
            </a>
          ) : (
            <span title="Driver phone not available" className="flex shrink-0 cursor-not-allowed items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-300">
              <Phone size={14} /> Driver
            </span>
          )}

          {item?.user?.phone ? (
            <a href={`tel:${item.user.phone}`} title={`Call Customer: ${item.user.name || ''}`}
              className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-100">
              <Phone size={14} /> Customer
            </a>
          ) : (
            <span title="Customer phone not available" className="flex shrink-0 cursor-not-allowed items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-300">
              <Phone size={14} /> Customer
            </span>
          )}

          <button onClick={() => navigate('/admin/pricing/rental-requests')} className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-100">
            <Eye size={14} /> Booking
          </button>

          <button
            onClick={() => navigate('/admin/pricing/rental-requests')}
            disabled={!!item?.driver || isTripEnded}
            title={item?.driver ? 'Driver already assigned' : isTripEnded ? 'Trip has ended' : 'Assign from Booking Requests'}
            className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-100 disabled:opacity-40"
          >
            <UserPlus size={14} /> Assign
          </button>

          <button onClick={handleEndTrip} disabled={!isActive || isTripEnded}
            className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-rose-600 transition hover:bg-rose-50 disabled:opacity-40">
            <PowerOff size={14} /> End Trip
          </button>

          <div className="mx-0.5 h-5 w-px shrink-0 bg-slate-200" />

          <button disabled title="Export is not yet available"
            className="flex shrink-0 cursor-not-allowed items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-300">
            <Download size={14} /> Export
          </button>
        </div>
      </div>

      {loading && !item ? (
        <div className="grid gap-3 xl:grid-cols-3">
          <div className="flex flex-col gap-3 xl:col-span-2">
            <div className="h-[380px] animate-pulse rounded-xl bg-slate-200"></div>
            <div className="h-24 animate-pulse rounded-xl bg-slate-200"></div>
            <div className="h-32 animate-pulse rounded-xl bg-slate-200"></div>
          </div>
          <div className="flex flex-col gap-3">
            <div className="h-52 animate-pulse rounded-xl bg-slate-200"></div>
            <div className="h-40 animate-pulse rounded-xl bg-slate-200"></div>
            <div className="h-28 animate-pulse rounded-xl bg-slate-200"></div>
          </div>
        </div>
      ) : !item ? (
        <div className="rounded-xl bg-white px-6 py-6 text-center shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">Tracking item not found</h2>
        </div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-3">

          {/* ── Left column: Map + lower cards ── */}
          <div className="flex flex-col gap-2.5 xl:col-span-2">
            
            {/* Map – 380–420 px tall on desktop */}
            <div className={`relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-sm transition-all duration-300 ${isFullscreen ? 'fixed inset-4 z-50 h-auto' : 'h-[380px] lg:h-[400px]'}`}>
              <div className="absolute left-4 top-3 z-10 flex flex-col gap-2">
                <div className="flex items-center gap-2 rounded-full border border-slate-900/10 bg-white/95 px-4 py-1.5 shadow-lg backdrop-blur-md">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[9px] font-black tracking-widest ${statusInfo.color}`}>
                    {isActive && <span className="h-1.5 w-1.5 animate-ping rounded-full bg-current" />}
                    {statusInfo.label}
                  </span>
                  <span className="ml-2 text-[11px] font-black text-slate-900">{speed.toFixed(0)} km/h</span>
                </div>
                {!isActive && hasLiveLocation && (
                  <div className="rounded-xl bg-slate-900/80 px-4 py-1.5 text-center text-xs font-bold text-white shadow-lg backdrop-blur-md">
                    GPS SIGNAL LOST
                  </div>
                )}
              </div>

              <div className="absolute right-4 top-3 z-10 flex flex-col gap-2">
                <button onClick={() => setIsFullscreen(!isFullscreen)} title="Toggle Fullscreen" className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-lg transition hover:bg-slate-50 text-slate-700">
                  {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                </button>
                <button onClick={handleRecenter} title="Locate Vehicle" className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-lg transition hover:bg-slate-50 text-slate-700">
                  <Focus size={18} />
                </button>
                <button onClick={() => setMapType(mapType === 'roadmap' ? 'satellite' : 'roadmap')} title="Toggle Map Type" className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-lg transition hover:bg-slate-50 text-slate-700">
                  <Layers size={18} />
                </button>
                <button onClick={() => setShowTraffic(!showTraffic)} title="Toggle Traffic" className={`flex h-10 w-10 items-center justify-center rounded-xl shadow-lg transition ${showTraffic ? 'bg-amber-100 text-amber-600' : 'bg-white text-slate-700 hover:bg-slate-50'}`}>
                  <Route size={18} />
                </button>
              </div>

              {!HAS_VALID_GOOGLE_MAPS_KEY ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                  <MapPin size={34} className="text-slate-300" />
                  <p className="text-base font-black text-slate-900">Map key not configured</p>
                </div>
              ) : loadError ? (
                <div className="flex h-full items-center justify-center text-sm font-bold text-rose-500">Map failed to load.</div>
              ) : isLoaded ? (
                <GoogleMap
                  mapContainerStyle={mapContainerStyle}
                  center={mapCenter}
                  zoom={hasLiveLocation ? 15 : 12}
                  mapTypeId={mapType}
                  options={{ streetViewControl: false, mapTypeControl: false, fullscreenControl: false, zoomControl: true }}
                  onLoad={(map) => { mapRef.current = map; }}
                >
                  {hasLiveLocation && (
                    <>
                      <PolylineF
                        path={mockRoutePath}
                        options={{ strokeColor: '#6366f1', strokeOpacity: 0.8, strokeWeight: 4 }}
                      />
                      <MarkerF
                        position={mockRoutePath[0]}
                        icon={{ url: 'https://maps.google.com/mapfiles/ms/icons/green-dot.png' }}
                        title="Pickup Hub"
                      />
                      <MarkerF
                        position={mapCenter}
                        icon={{
                          path: 'M -10,0 A 10,10 0 1,1 10,0 A 10,10 0 1,1 -10,0 Z',
                          fillColor: isActive ? '#10b981' : '#64748b',
                          fillOpacity: 1,
                          strokeColor: '#ffffff',
                          strokeWeight: 2,
                          scale: 1,
                        }}
                      />
                    </>
                  )}
                </GoogleMap>
              ) : (
                <div className="flex h-full animate-pulse items-center justify-center bg-slate-100">
                  <Loader2 className="animate-spin text-slate-300" />
                </div>
              )}
            </div>

            {/* Trip Summary */}
            <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
              <h3 className="mb-2 text-[10px] font-black uppercase tracking-widest text-black">Trip Summary</h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg bg-slate-50 px-2.5 py-2">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Booking ID</p>
                  <p className="mt-0.5 text-sm font-bold text-slate-900">{item.bookingReference || 'N/A'}</p>
                </div>
                <div className="rounded-lg bg-slate-50 px-2.5 py-2">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Trip Status</p>
                  <p className="mt-0.5 text-sm font-bold text-slate-900">{isActive ? 'On Trip' : 'Booked'}</p>
                </div>
                <div className="rounded-lg bg-slate-50 px-2.5 py-2">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Start Time</p>
                  <p className="mt-0.5 text-sm font-bold text-slate-900">{formatTimeOnly(item.assignedAt)}</p>
                </div>
                <div className="rounded-lg bg-slate-50 px-2.5 py-2">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Package</p>
                  <p className="mt-0.5 truncate text-sm font-bold text-slate-900">{item?.packageName || item?.rentalPackage?.name || (plannedDistanceMeters > 0 ? `Rental ${plannedDistanceMeters/1000}km` : 'N/A')}</p>
                </div>
              </div>
            </div>

            {/* Route Summary */}
            <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
              <h3 className="mb-2 text-[10px] font-black uppercase tracking-widest text-black">Route Summary</h3>

              <div className="mb-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                  <span>Distance Covered: {formatDistance(distanceCoveredMeters)}</span>
                  <span className="text-emerald-600">{progressPercent.toFixed(1)}%</span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-emerald-500 transition-all duration-1000" style={{ width: `${progressPercent}%` }} />
                </div>
                <div className="mt-1 flex items-center justify-between text-[9px] font-bold uppercase tracking-widest text-slate-400">
                  <span>0 km</span>
                  <span>{formatDistance(plannedDistanceMeters)} planned</span>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
                    <Navigation size={12} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Pickup / Hub</p>
                    <p className="mt-0.5 truncate text-sm font-bold text-slate-900">{item?.serviceLocation?.name || item?.hubName || 'N/A'}</p>
                    <p className="truncate text-[11px] font-semibold text-slate-500">{formatDateTime(item.assignedAt)}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                    <Flag size={12} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Current / Destination</p>
                    <p className="mt-0.5 text-sm font-bold text-slate-900">{hasLiveLocation ? 'On Route' : 'Unknown'}</p>
                    <p className="text-[11px] font-semibold text-slate-500">Remaining: {formatDistance(remainingDistanceMeters)} · ETA: {etaMinutes}m</p>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Event History */}
            <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
              <h3 className="mb-2 text-[10px] font-black uppercase tracking-widest text-black">Event History</h3>
              <div className="space-y-3 pl-1.5">
                <div className="relative border-l-2 border-slate-100 pl-5">
                  <div className="absolute -left-[9px] top-0.5 h-4 w-4 rounded-full bg-emerald-500 ring-2 ring-white" />
                  <p className="text-xs font-bold text-slate-900">Live Data Sync</p>
                  <p className="text-[10px] font-semibold text-slate-500">{formatDateTime(tracking.lastLocationAt)}</p>
                </div>
                {isActive && (
                  <div className="relative border-l-2 border-slate-100 pl-5">
                    <div className="absolute -left-[9px] top-0.5 h-4 w-4 rounded-full bg-blue-500 ring-2 ring-white" />
                    <p className="text-xs font-bold text-slate-900">Trip Started</p>
                    <p className="text-[10px] font-semibold text-slate-500">{formatDateTime(item.assignedAt)}</p>
                  </div>
                )}
                <div className="relative border-l-2 border-slate-100 pl-5">
                  <div className="absolute -left-[9px] top-0.5 h-4 w-4 rounded-full bg-slate-300 ring-2 ring-white" />
                  <p className="text-xs font-bold text-slate-900">Driver & Vehicle Assigned</p>
                  <p className="text-[10px] font-semibold text-slate-500">{formatDateTime(item.assignedAt)}</p>
                </div>
                <div className="relative pl-5">
                  <div className="absolute -left-[9px] top-0.5 h-4 w-4 rounded-full bg-slate-300 ring-2 ring-white" />
                  <p className="text-xs font-bold text-slate-900">Booking Created</p>
                  <p className="text-[10px] font-semibold text-slate-500">{formatDateTime(item.createdAt)}</p>
                </div>
              </div>
            </div>

          </div>

          {/* ── Right column: Telemetry + Status + Crew ── */}
          <div className="flex flex-col gap-2.5">
            
            {/* Live Telemetry */}
            <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
              <h3 className="mb-2 text-[10px] font-black uppercase tracking-widest text-black">Live Telemetry</h3>
              <div className="grid grid-cols-2 gap-2">

                {/* Speed pair */}
                <div className="rounded-lg bg-slate-50 px-2.5 py-2 text-center">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Current Speed</p>
                  <p className="mt-0.5 text-lg font-black text-slate-900">{speed.toFixed(0)} <span className="text-[10px] text-slate-500">km/h</span></p>
                </div>
                <div className="rounded-lg bg-slate-50 px-2.5 py-2 text-center">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Avg Speed</p>
                  <p className="mt-0.5 text-lg font-black text-slate-900">{avgSpeed} <span className="text-[10px] text-slate-500">km/h</span></p>
                </div>

                {/* Ignition full-width */}
                <div className="col-span-2 rounded-lg bg-slate-50 px-2.5 py-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Ignition</p>
                      <p className="mt-0.5 text-sm font-bold text-slate-900">{isActive ? 'ON – Running' : 'OFF – Stopped'}</p>
                    </div>
                    <Key size={20} className={isActive ? 'text-emerald-500' : 'text-slate-300'} />
                  </div>
                </div>

                {/* Heading */}
                <div className="rounded-lg bg-slate-50 px-2.5 py-2">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Heading</p>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <p className="text-sm font-black text-slate-900">{Number(tracking.heading || 0).toFixed(0)}°</p>
                    <ArrowUp size={13} className="text-slate-400" style={{ transform: `rotate(${tracking.heading || 0}deg)` }} />
                  </div>
                </div>

                {/* Odometer */}
                <div className="rounded-lg bg-slate-50 px-2.5 py-2">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Odometer</p>
                  <p className="mt-0.5 text-sm font-black text-slate-900">{odometer || '--'} <span className="text-[10px] text-slate-500">km</span></p>
                </div>

                {/* Battery */}
                <div className="rounded-lg bg-slate-50 px-2.5 py-2">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Battery (EV)</p>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <BatteryMedium size={15} className={batteryLevel > 20 ? 'text-emerald-500' : 'text-rose-500'} />
                    <p className="text-sm font-black text-slate-900">{batteryLevel || '--'}%</p>
                  </div>
                </div>

                {/* Fuel */}
                <div className="rounded-lg bg-slate-50 px-2.5 py-2">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Fuel Level</p>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <Fuel size={15} className={fuelLevel > 20 ? 'text-blue-500' : 'text-rose-500'} />
                    <p className="text-sm font-black text-slate-900">{fuelLevel || '--'}%</p>
                  </div>
                </div>

                {/* GPS Accuracy */}
                <div className="rounded-lg bg-slate-50 px-2.5 py-2">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">GPS Accuracy</p>
                  <p className={`mt-0.5 text-sm font-black ${accuracyData.color.split(' ')[0]}`}>{Number(tracking.accuracyMeters || 0).toFixed(0)}m</p>
                </div>

                {/* Signal */}
                <div className="rounded-lg bg-slate-50 px-2.5 py-2">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Signal</p>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <Signal size={14} className={signalInfo.color} />
                    <p className="text-sm font-black text-slate-900">{signalInfo.label}</p>
                  </div>
                </div>

              </div>
            </div>

            {/* Status & Alerts */}
            <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
              <h3 className="mb-2 text-[10px] font-black uppercase tracking-widest text-black">Status & Alerts</h3>

              {/* Geofence zone row */}
              <div className="mb-2 flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-2">
                <div className="flex items-center gap-2">
                  <ShieldAlert size={15} className="shrink-0 text-slate-400" />
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Geofence Zone</p>
                    <p className="text-xs font-bold text-slate-900">{tracking.matchedZoneName || tracking.hubName || 'Rental Zone'}</p>
                  </div>
                </div>
                <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${tracking.zoneStatus === 'outside' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
                  {tracking.zoneStatus || 'Unknown'}
                </span>
              </div>

              {/* Status indicators 2-col grid */}
              <div className="mb-2 grid grid-cols-2 gap-1.5">
                <div className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px] font-bold ${hasLiveLocation ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}><ShieldCheck size={12}/> GPS Active</div>
                <div className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2 py-1.5 text-[10px] font-bold text-emerald-700"><ShieldCheck size={12}/> No SOS</div>
                <div className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px] font-bold ${speed > 100 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}><ShieldCheck size={12}/> Normal Speed</div>
                <div className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px] font-bold ${batteryLevel < 20 ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}><ShieldCheck size={12}/> Power OK</div>
              </div>

              {/* Active alerts or all-clear */}
              {Array.isArray(tracking.alerts) && tracking.alerts.length > 0 ? (
                <div className="mt-2 space-y-2 border-t border-slate-100 pt-2">
                  {tracking.alerts.map((alert) => (
                    <div key={`${item.id}-${alert.code}`} className="flex items-start gap-2 rounded-lg border border-rose-100 bg-rose-50 p-2">
                      <Info size={14} className="mt-0.5 shrink-0 text-rose-600" />
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-rose-700">{String(alert.code || 'ALERT').replace(/_/g, ' ')}</p>
                        <p className="text-[11px] font-bold text-slate-900">{alert.message}</p>
                        <p className="text-[9px] font-semibold text-rose-500">{formatTimeOnly(alert.updatedAt || alert.createdAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-2 flex items-center gap-2 border-t border-slate-100 pt-2">
                  <CheckCircle2 size={14} className="shrink-0 text-emerald-600" />
                  <div>
                    <p className="text-xs font-bold text-emerald-900">All Systems Normal</p>
                    <p className="text-[10px] font-semibold text-emerald-600">No active alerts triggered.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Crew & Asset */}
            <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
              <h3 className="mb-2 text-[10px] font-black uppercase tracking-widest text-black">Crew & Asset</h3>

              {/* Driver */}
              <div className="mb-2 flex items-center gap-2.5 rounded-lg bg-slate-50 px-2.5 py-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
                  <User2 size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Driver</p>
                  <p className="truncate text-xs font-bold text-slate-900">{item?.driver?.name || 'Unassigned'}</p>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span className="flex items-center text-[10px] font-bold text-amber-500"><Star size={9} className="mr-0.5 fill-current" /> {driverRating}</span>
                    <span className="text-[9px] text-slate-400">·</span>
                    <span className="truncate text-[10px] font-semibold text-slate-500">{item.driver?.phone || 'No phone'}</span>
                  </div>
                </div>
              </div>

              {/* Customer */}
              <div className="mb-2 flex items-center gap-2.5 rounded-lg bg-slate-50 px-2.5 py-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                  <User2 size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Customer</p>
                  <p className="truncate text-xs font-bold text-slate-900">{item?.user?.name || '—'}</p>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    {item?.user?.membershipTier && (
                      <span className="rounded bg-blue-100 px-1 py-0.5 text-[9px] font-black uppercase text-blue-700">{item.user.membershipTier}</span>
                    )}
                    <span className="truncate text-[10px] font-semibold text-slate-500">{item.user?.phone || 'No phone'}</span>
                  </div>
                </div>
              </div>

              {/* Vehicle */}
              <div className="flex items-center gap-2.5 rounded-lg bg-slate-50 px-2.5 py-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-600">
                  <Car size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Vehicle</p>
                  <p className="truncate text-xs font-bold text-slate-900">{item?.vehicle?.name || 'N/A'}</p>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span className="truncate text-[10px] font-bold text-slate-600">{item?.vehicle?.registrationNumber || 'N/A'}</span>
                    <span className="text-[9px] text-slate-400">·</span>
                    <span className="text-[10px] font-semibold text-slate-500">{item.vehicle?.capacity || 4} Seats</span>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};

export default RentalTrackingDetail;
