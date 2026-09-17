import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Crosshair,
  Layers,
  LocateFixed,
  Map as MapIcon,
  MapPin,
  Navigation,
  RefreshCw,
  Search,
  ShieldAlert,
  TrendingUp,
  Users
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { Autocomplete, GoogleMap, MarkerF, Polygon } from '@react-google-maps/api';
import { adminService } from '../../services/adminService';
import { HAS_VALID_GOOGLE_MAPS_KEY, useAppGoogleMapsLoader } from '../../utils/googleMaps';

const DEFAULT_CENTER = { lat: 22.7196, lng: 75.8577 };
const MAP_CONTAINER_STYLE = { width: '100%', height: '100%' };
const DEFAULT_ZOOM = 12;

const GEO_NAV_ITEMS = [
  { label: 'Heat Map', path: '/admin/geo/heatmap' },
  { label: "God's Eye", path: '/admin/geo/gods-eye' },
  { label: 'Peak Zone', path: '/admin/geo/peak-zone' }
];

const mapOptions = {
  disableDefaultUI: false,
  zoomControl: true,
  mapTypeControl: true,
  fullscreenControl: true,
  streetViewControl: false,
  clickableIcons: false,
  styles: [
    { elementType: 'geometry', stylers: [{ color: '#eef2ff' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#334155' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }] },
    { featureType: 'poi', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit', stylers: [{ visibility: 'off' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#c7d2fe' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#bfdbfe' }] }
  ]
};

const zonePalette = [
  { fill: '#2563EB', stroke: '#1D4ED8', marker: '#2563EB' },
  { fill: '#F97316', stroke: '#EA580C', marker: '#F97316' },
  { fill: '#10B981', stroke: '#059669', marker: '#10B981' },
  { fill: '#E11D48', stroke: '#BE123C', marker: '#E11D48' },
  { fill: '#7C3AED', stroke: '#6D28D9', marker: '#7C3AED' }
];

const toLatLng = (point) => {
  if (Array.isArray(point) && point.length >= 2) {
    return { lat: Number(point[1]), lng: Number(point[0]) };
  }

  if (point && typeof point === 'object') {
    const lat = Number(point.lat ?? point.latitude);
    const lng = Number(point.lng ?? point.longitude ?? point.lon);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng };
    }
  }

  return null;
};

const normalizeCoordinates = (coordinates) => {
  if (!Array.isArray(coordinates)) {
    return [];
  }

  if (coordinates.length > 0 && Array.isArray(coordinates[0]) && Array.isArray(coordinates[0][0])) {
    return coordinates[0].map(toLatLng).filter(Boolean);
  }

  return coordinates.map(toLatLng).filter(Boolean);
};

const getPolygonCenter = (path) => {
  if (!path.length) {
    return DEFAULT_CENTER;
  }

  const total = path.reduce(
    (acc, point) => ({
      lat: acc.lat + point.lat,
      lng: acc.lng + point.lng
    }),
    { lat: 0, lng: 0 }
  );

  return {
    lat: total.lat / path.length,
    lng: total.lng / path.length
  };
};

const formatZone = (zone, index) => {
  const coordinates = normalizeCoordinates(zone.coordinates);
  const center = coordinates.length ? getPolygonCenter(coordinates) : DEFAULT_CENTER;
  const palette = zonePalette[index % zonePalette.length];
  const isActive = zone.status === 1 || zone.status === 'active' || zone.active === true;

  return {
    id: zone._id || zone.id || `zone-${index}`,
    name: zone.name || zone.zone_name || 'Unnamed Zone',
    surge: Number(zone.surge_multiplier || zone.peak_zone_surge_percentage || 1).toFixed(1),
    status: isActive ? 'Active' : 'Inactive',
    type: zone.type || 'Main',
    center,
    coordinates,
    palette
  };
};

const createFleetMarkers = (zones) =>
  zones.slice(0, 12).flatMap((zone, index) => {
    const offsetBase = (index % 4) * 0.006 + 0.004;
    return [
      {
        id: `${zone.id}-driver`,
        label: `Driver near ${zone.name}`,
        position: {
          lat: zone.center.lat + offsetBase,
          lng: zone.center.lng - offsetBase * 0.7
        },
        kind: 'driver'
      },
      {
        id: `${zone.id}-rider`,
        label: `Demand in ${zone.name}`,
        position: {
          lat: zone.center.lat - offsetBase * 0.5,
          lng: zone.center.lng + offsetBase * 0.55
        },
        kind: 'demand'
      }
    ];
  });

const ZoneCard = ({ zone, selected, onSelect }) => (
  <button
    type="button"
    onClick={() => onSelect(zone)}
    className={`w-full p-4 rounded-2xl border text-left transition-all ${
      selected
        ? 'border-blue-200 bg-blue-50 shadow-sm'
        : 'border-gray-100 bg-white hover:border-gray-200 hover:shadow-sm'
    }`}
  >
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <span
          className="w-2.5 h-2.5 rounded-full"
          style={{ backgroundColor: zone.palette.marker }}
        />
        <span className="text-[13px] font-black text-gray-900 tracking-tight">{zone.name}</span>
      </div>
      <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-white text-gray-500 border border-gray-100">
        {zone.type}
      </span>
    </div>

    <div className="flex items-center justify-between">
      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Surge</p>
        <div className="flex items-center gap-1.5">
          <TrendingUp size={14} className="text-primary" />
          <span className="text-[15px] font-black text-gray-900">{zone.surge}x</span>
        </div>
      </div>
      <div className="text-right">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Status</p>
        <span className={zone.status === 'Active' ? 'text-emerald-600 text-[12px] font-black' : 'text-gray-400 text-[12px] font-black'}>
          {zone.status}
        </span>
      </div>
    </div>
  </button>
);

const GeoFencing = () => {
  const location = useLocation();
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedZoneId, setSelectedZoneId] = useState(null);
  const [mapRef, setMapRef] = useState(null);
  const [autocomplete, setAutocomplete] = useState(null);
  const [searchValue, setSearchValue] = useState('');

  const currentView = useMemo(() => {
    if (location.pathname.includes('/peak-zone')) return 'peak-zone';
    if (location.pathname.includes('/heatmap')) return 'heatmap';
    return 'gods-eye';
  }, [location.pathname]);

  const { isLoaded, loadError } = useAppGoogleMapsLoader();

  const fetchZones = async () => {
    setLoading(true);
    try {
      const response = await adminService.getZones();
      const rawZones = response?.data?.results || response?.data || [];
      const mappedZones = (Array.isArray(rawZones) ? rawZones : []).map(formatZone);
      setZones(mappedZones);
      setSelectedZoneId((current) => current || mappedZones[0]?.id || null);
    } catch (error) {
      console.error('Failed to fetch zones', error);
      setZones([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchZones();
  }, []);

  const filteredZones = useMemo(() => {
    const query = searchValue.trim().toLowerCase();
    if (!query) {
      return zones;
    }

    return zones.filter((zone) => zone.name.toLowerCase().includes(query));
  }, [searchValue, zones]);

  const selectedZone =
    filteredZones.find((zone) => zone.id === selectedZoneId) ||
    zones.find((zone) => zone.id === selectedZoneId) ||
    filteredZones[0] ||
    zones[0] ||
    null;

  const mapCenter = selectedZone?.center || zones[0]?.center || DEFAULT_CENTER;

  const fleetMarkers = useMemo(() => createFleetMarkers(zones), [zones]);
  const onlineCount = fleetMarkers.filter((marker) => marker.kind === 'driver').length;
  const activeZoneCount = zones.filter((zone) => zone.status === 'Active').length;
  const averageSurge =
    zones.length > 0
      ? (zones.reduce((sum, zone) => sum + Number(zone.surge || 1), 0) / zones.length).toFixed(1)
      : '1.0';

  const fitZoneBounds = (zone) => {
    if (!mapRef || !zone?.coordinates?.length || !window.google?.maps) {
      return;
    }

    const bounds = new window.google.maps.LatLngBounds();
    zone.coordinates.forEach((point) => bounds.extend(point));
    mapRef.fitBounds(bounds, 80);
  };

  useEffect(() => {
    if (selectedZone) {
      fitZoneBounds(selectedZone);
    }
  }, [selectedZone, mapRef]);

  const handlePlaceChanged = () => {
    if (!autocomplete || !mapRef) {
      return;
    }

    const place = autocomplete.getPlace();
    if (!place?.geometry?.location) {
      return;
    }

    mapRef.panTo({
      lat: place.geometry.location.lat(),
      lng: place.geometry.location.lng()
    });
    mapRef.setZoom(14);
  };

  const renderMarkers = currentView === 'gods-eye';
  const polygonOpacity = currentView === 'heatmap' ? 0.18 : 0.28;

  const renderMapCanvas = () => {
    if (loadError) {
      return (
        <div className="h-full w-full flex items-center justify-center bg-gray-50 p-8">
          <div className="max-w-md rounded-3xl border border-rose-100 bg-white p-8 shadow-sm">
            <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mb-4">
              <AlertTriangle size={24} />
            </div>
            <h3 className="text-xl font-black text-gray-900 tracking-tight">Google Maps failed to load</h3>
            <p className="mt-2 text-sm text-gray-500">
              Check the browser key, allowed referrers, and whether the Maps JavaScript API is enabled.
            </p>
          </div>
        </div>
      );
    }

    if (HAS_VALID_GOOGLE_MAPS_KEY && isLoaded) {
      return (
        <GoogleMap
          mapContainerStyle={MAP_CONTAINER_STYLE}
          center={mapCenter}
          zoom={DEFAULT_ZOOM}
          options={mapOptions}
          onLoad={setMapRef}
        >
          {zones.map((zone) =>
            zone.coordinates.length ? (
              <Polygon
                key={zone.id}
                paths={zone.coordinates}
                options={{
                  fillColor: zone.palette.fill,
                  fillOpacity: polygonOpacity,
                  strokeColor: zone.palette.stroke,
                  strokeOpacity: zone.id === selectedZone?.id ? 1 : 0.7,
                  strokeWeight: zone.id === selectedZone?.id ? 3 : 2,
                  zIndex: zone.id === selectedZone?.id ? 3 : 2
                }}
                onClick={() => setSelectedZoneId(zone.id)}
              />
            ) : null
          )}

          {zones.map((zone) => (
            <MarkerF
              key={`${zone.id}-label`}
              position={zone.center}
              onClick={() => setSelectedZoneId(zone.id)}
              title={zone.name}
              icon={{
                path: window.google.maps.SymbolPath.CIRCLE,
                scale: zone.id === selectedZone?.id ? 9 : 7,
                fillColor: zone.palette.marker,
                fillOpacity: 1,
                strokeColor: '#ffffff',
                strokeWeight: 2
              }}
            />
          ))}

          {renderMarkers &&
            fleetMarkers.map((marker) => (
              <MarkerF
                key={marker.id}
                position={marker.position}
                title={marker.label}
                icon={{
                  path: window.google.maps.SymbolPath.CIRCLE,
                  scale: marker.kind === 'driver' ? 6 : 5,
                  fillColor: marker.kind === 'driver' ? '#10B981' : '#F97316',
                  fillOpacity: 1,
                  strokeColor: '#ffffff',
                  strokeWeight: 2
                }}
              />
            ))}
        </GoogleMap>
      );
    }

    return (
      <div className="h-full w-full bg-[radial-gradient(circle_at_top,#dbeafe,transparent_35%),linear-gradient(135deg,#eff6ff_0%,#f8fafc_55%,#eef2ff_100%)] flex items-center justify-center p-10">
        <div className="max-w-xl bg-white/95 border border-gray-100 rounded-[32px] p-8 shadow-xl">
          <div className="w-16 h-16 rounded-3xl bg-blue-50 text-blue-600 flex items-center justify-center mb-5">
            <MapIcon size={28} />
          </div>
          <h3 className="text-2xl font-black text-gray-900 tracking-tight">Google Maps is ready to plug in</h3>
          <p className="mt-3 text-sm leading-6 text-gray-500">
            This page now uses the Google Maps loader and your admin zones API. Add a real browser key in
            [frontend/.env](/z:/projects/appzeto-taxi/frontend/.env) to render the live map on `/admin/geo/gods-eye`.
          </p>
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Zones Loaded</p>
              <p className="text-2xl font-black text-gray-900">{zones.length}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Selected</p>
              <p className="text-sm font-black text-gray-900">{selectedZone?.name || 'None'}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Map Center</p>
              <p className="text-sm font-black text-gray-900">
                {mapCenter.lat.toFixed(3)}, {mapCenter.lng.toFixed(3)}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (currentView === 'gods-eye') {
    return (
      <div className="grid grid-cols-1 xl:grid-cols-[320px,minmax(0,1fr),300px] gap-6 min-h-[calc(100vh-120px)] animate-in fade-in slide-in-from-bottom-4 duration-500">
        <aside className="rounded-[32px] border border-cyan-100 bg-[linear-gradient(180deg,#ecfeff_0%,#ffffff_100%)] shadow-sm p-5 flex flex-col overflow-hidden">
          <div className="space-y-1 mb-5">
            <p className="text-[11px] font-black text-cyan-700 uppercase tracking-[0.25em]">Geo Deck</p>
            <h1 className="text-3xl font-black text-slate-950 tracking-tight">God&apos;s Eye</h1>
            <p className="text-[12px] font-bold text-slate-500">Dedicated live map for zone intelligence and fleet spread.</p>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-5">
            <div className="bg-white rounded-2xl border border-cyan-100 p-4 shadow-sm">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Online Fleet</p>
              <div className="flex items-center gap-2">
                <Users size={15} className="text-emerald-500" />
                <span className="text-2xl font-black text-gray-900">{onlineCount}</span>
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-cyan-100 p-4 shadow-sm">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Active Zones</p>
              <span className="text-2xl font-black text-gray-900">{activeZoneCount}</span>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-cyan-100 p-4 shadow-sm flex items-center justify-between mb-5">
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Avg Surge</p>
              <span className="text-[22px] font-black text-primary">{averageSurge}x</span>
            </div>
            <button
              type="button"
              onClick={fetchZones}
              className="h-11 w-11 rounded-xl bg-cyan-50 text-cyan-700 hover:bg-cyan-100 transition-all flex items-center justify-center"
              aria-label="Refresh zones"
            >
              <RefreshCw size={18} />
            </button>
          </div>

          <div className="bg-white p-2 rounded-2xl border border-cyan-100 flex items-center shadow-sm mb-5">
            <Search size={16} className="text-gray-300 ml-3" />
            <input
              type="text"
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Search zone..."
              className="w-full bg-transparent border-none text-[12px] font-bold px-3 py-2 focus:ring-0 placeholder:text-gray-300"
            />
            <div className="bg-gray-50 p-2 rounded-xl text-gray-400 mr-1">
              <MapPin size={14} />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto no-scrollbar space-y-3 pr-1">
            {loading ? (
              <div className="bg-white border border-cyan-100 rounded-2xl p-6 text-center text-[12px] font-bold text-gray-400 uppercase tracking-widest">
                Syncing map data...
              </div>
            ) : filteredZones.length > 0 ? (
              filteredZones.map((zone) => (
                <ZoneCard
                  key={zone.id}
                  zone={zone}
                  selected={zone.id === selectedZoneId}
                  onSelect={(nextZone) => setSelectedZoneId(nextZone.id)}
                  compact
                />
              ))
            ) : (
              <div className="bg-white border border-cyan-100 rounded-2xl p-6 text-center">
                <p className="text-[12px] font-bold text-gray-400 uppercase tracking-widest">No zones available</p>
              </div>
            )}
          </div>
        </aside>

        <section className="rounded-[36px] overflow-hidden border border-slate-200 bg-[#082f49] shadow-[0_30px_80px_rgba(8,47,73,0.12)] relative min-h-[calc(100vh-120px)]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.25),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.18),transparent_28%)] pointer-events-none z-0" />

          <div className="absolute top-0 left-0 right-0 z-10 p-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-xl">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 text-cyan-100 border border-white/10 backdrop-blur-md">
                <Crosshair size={14} />
                <span className="text-[10px] font-black uppercase tracking-[0.25em]">Live Operations Grid</span>
              </div>
              <h2 className="mt-4 text-4xl font-black text-white tracking-tight leading-none">City-wide zone intelligence</h2>
              <p className="mt-3 text-sm leading-6 text-cyan-50/80 max-w-lg">
                Dedicated God&apos;s Eye map for monitoring zone boundaries, fleet spread and surge pockets from a single command screen.
              </p>
            </div>

            <div className="w-full max-w-sm">
              {HAS_VALID_GOOGLE_MAPS_KEY && isLoaded ? (
                <Autocomplete onLoad={setAutocomplete} onPlaceChanged={handlePlaceChanged}>
                  <div className="relative">
                    <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 z-10" />
                    <input
                      type="text"
                      placeholder="Search city or locality"
                      className="w-full rounded-2xl border border-white/10 bg-white/90 backdrop-blur-md py-3.5 pl-11 pr-4 text-[13px] font-semibold text-gray-700 shadow-lg focus:border-cyan-400 focus:ring-4 focus:ring-cyan-400/10 outline-none"
                    />
                  </div>
                </Autocomplete>
              ) : (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] font-semibold text-amber-800 shadow-sm">
                  Set `VITE_GOOGLE_MAPS_API_KEY` in [frontend/.env](/z:/projects/appzeto-taxi/frontend/.env) to load the live map here.
                </div>
              )}
            </div>
          </div>

          <div className="absolute inset-[112px_18px_18px_18px] z-10 rounded-[30px] overflow-hidden border border-white/10 shadow-2xl bg-white">
            {renderMapCanvas()}
          </div>

          <div className="absolute left-10 bottom-10 z-20 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => fitZoneBounds(selectedZone)}
              className="bg-white/95 backdrop-blur-md px-4 py-3 rounded-2xl border border-white shadow-lg text-[12px] font-black uppercase tracking-widest text-gray-700 flex items-center gap-2"
            >
              <LocateFixed size={15} />
              Focus Zone
            </button>
            <div className="bg-white/95 backdrop-blur-md px-4 py-3 rounded-2xl border border-white shadow-lg text-[12px] font-black uppercase tracking-widest text-gray-700 flex items-center gap-2">
              <Layers size={15} className="text-cyan-600" />
              Fleet + zone overlay
            </div>
          </div>
        </section>

        <aside className="rounded-[32px] border border-slate-200 bg-white shadow-sm p-5 flex flex-col">
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-[11px] font-black text-gray-400 uppercase tracking-[0.25em]">Live Focus</p>
              <h3 className="text-2xl font-black text-slate-950 tracking-tight mt-2">{selectedZone?.name || 'No zone selected'}</h3>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-slate-50 text-slate-700 flex items-center justify-center">
              <Layers size={20} />
            </div>
          </div>

          <div className="space-y-3 mb-5">
            <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Selected Zone</p>
              <p className="text-lg font-black text-slate-900">{selectedZone?.name || 'None'}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Current Surge</p>
              <p className="text-lg font-black text-primary">{selectedZone?.surge || averageSurge}x</p>
            </div>
            <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Map Center</p>
              <p className="text-sm font-black text-slate-900">
                {mapCenter.lat.toFixed(3)}, {mapCenter.lng.toFixed(3)}
              </p>
            </div>
          </div>

          <div className="rounded-[28px] bg-[#0f172a] text-white p-5 mb-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-cyan-300">
                <ShieldAlert size={18} />
              </div>
              <div>
                <p className="text-[10px] font-black text-cyan-100/70 uppercase tracking-widest">Ops Note</p>
                <p className="text-sm font-black text-white">Monitor overlap before pricing changes</p>
              </div>
            </div>
            <p className="text-xs leading-6 text-slate-300">
              This dedicated screen is tuned for map monitoring first. Keep zone boundaries clean and verify surge changes against live fleet spread.
            </p>
          </div>

          <div className="flex-1 overflow-y-auto no-scrollbar space-y-3">
            {filteredZones.slice(0, 5).map((zone) => (
              <ZoneCard
                key={`focus-${zone.id}`}
                zone={zone}
                selected={zone.id === selectedZoneId}
                onSelect={(nextZone) => setSelectedZoneId(nextZone.id)}
                compact
              />
            ))}
          </div>
        </aside>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-120px)] gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="w-80 shrink-0 flex flex-col space-y-5 overflow-y-auto no-scrollbar pb-10">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Geo Operations</h1>
          <p className="text-gray-400 font-bold text-[11px] mt-1 uppercase tracking-widest leading-none">
            Live spatial view for zones, demand and fleet coverage
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-2 shadow-sm">
          <div className="grid grid-cols-3 gap-1">
            {GEO_NAV_ITEMS.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`px-3 py-3 rounded-xl text-center text-[11px] font-black uppercase tracking-widest transition-all ${
                    isActive ? 'bg-[#0F172A] text-white shadow-lg' : 'text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Online Fleet</p>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-2xl font-black text-gray-900">{onlineCount}</span>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Active Zones</p>
            <span className="text-2xl font-black text-gray-900">{activeZoneCount}</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Avg Surge</p>
            <span className="text-[22px] font-black text-primary">{averageSurge}x</span>
          </div>
          <button
            type="button"
            onClick={fetchZones}
            className="h-11 w-11 rounded-xl bg-gray-50 text-gray-500 hover:bg-gray-100 transition-all flex items-center justify-center"
            aria-label="Refresh zones"
          >
            <RefreshCw size={18} />
          </button>
        </div>

        <div className="bg-white p-2 rounded-2xl border border-gray-100 flex items-center shadow-sm">
          <Search size={16} className="text-gray-300 ml-3" />
          <input
            type="text"
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            placeholder="Search zone..."
            className="w-full bg-transparent border-none text-[12px] font-bold px-3 py-2 focus:ring-0 placeholder:text-gray-300"
          />
          <div className="bg-gray-50 p-2 rounded-xl text-gray-400 mr-1">
            <MapPin size={14} />
          </div>
        </div>

        <div className="flex-1 space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
              Zone Watchlist ({filteredZones.length})
            </span>
          </div>

          {loading ? (
            <div className="bg-white border border-gray-100 rounded-2xl p-6 text-center text-[12px] font-bold text-gray-400 uppercase tracking-widest">
              Syncing map data...
            </div>
          ) : filteredZones.length > 0 ? (
            filteredZones.map((zone) => (
              <ZoneCard
                key={zone.id}
                zone={zone}
                selected={zone.id === selectedZoneId}
                onSelect={(nextZone) => setSelectedZoneId(nextZone.id)}
              />
            ))
          ) : (
            <div className="bg-white border border-gray-100 rounded-2xl p-6 text-center">
              <p className="text-[12px] font-bold text-gray-400 uppercase tracking-widest">No zones match your search</p>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden relative">
        <div className="absolute top-5 left-5 right-5 z-10 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="bg-white/95 backdrop-blur-md rounded-2xl px-5 py-4 border border-white shadow-lg">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                {currentView === 'peak-zone' ? <TrendingUp size={20} /> : currentView === 'heatmap' ? <Layers size={20} /> : <Navigation size={20} />}
              </div>
              <div>
                <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest">
                  {currentView === 'gods-eye' ? 'God\'s Eye View' : currentView === 'heatmap' ? 'Heat Map View' : 'Peak Zone View'}
                </p>
                <h2 className="text-lg font-black text-gray-900 tracking-tight">
                  {selectedZone?.name || 'Live geo coverage'}
                </h2>
              </div>
            </div>
          </div>

          <div className="w-full md:w-[340px]">
            {HAS_VALID_GOOGLE_MAPS_KEY && isLoaded ? (
              <Autocomplete onLoad={setAutocomplete} onPlaceChanged={handlePlaceChanged}>
                <div className="relative">
                  <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 z-10" />
                  <input
                    type="text"
                    placeholder="Search city or locality"
                    className="w-full rounded-2xl border border-gray-200 bg-white/95 backdrop-blur-md py-3.5 pl-11 pr-4 text-[13px] font-semibold text-gray-700 shadow-lg focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none"
                  />
                </div>
              </Autocomplete>
            ) : (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] font-semibold text-amber-800 shadow-sm">
                Set `VITE_GOOGLE_MAPS_API_KEY` in [frontend/.env](/z:/projects/appzeto-taxi/frontend/.env) to load the live map here.
              </div>
            )}
          </div>
        </div>

        {renderMapCanvas()}

        <div className="absolute left-5 bottom-5 z-10 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => fitZoneBounds(selectedZone)}
            className="bg-white/95 backdrop-blur-md px-4 py-3 rounded-2xl border border-white shadow-lg text-[12px] font-black uppercase tracking-widest text-gray-700 flex items-center gap-2"
          >
            <LocateFixed size={15} />
            Focus Zone
          </button>
          <div className="bg-white/95 backdrop-blur-md px-4 py-3 rounded-2xl border border-white shadow-lg text-[12px] font-black uppercase tracking-widest text-gray-700 flex items-center gap-2">
            {currentView === 'peak-zone' ? <ShieldAlert size={15} className="text-rose-500" /> : <Layers size={15} className="text-blue-500" />}
            {currentView === 'gods-eye' ? 'Fleet + zone overlay' : currentView === 'heatmap' ? 'Demand intensity overlay' : 'Peak pricing overlay'}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GeoFencing;
