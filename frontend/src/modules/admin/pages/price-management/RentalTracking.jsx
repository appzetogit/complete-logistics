import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CarFront,
  Loader2,
  Radio,
  Search,
  ShieldAlert,
  WifiOff,
  Filter,
  User2,
  Phone,
  PhoneOff,
  ChevronDown,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminPageHeader from '../../components/ui/AdminPageHeader';
import { socketService } from '../../../../shared/api/socket';
import { adminService } from '../../services/adminService';

// ─── Status / Zone colour maps ────────────────────────────────────────────────
const STATUS_TONE = {
  active:           'bg-emerald-50 text-emerald-700 border-emerald-100',
  idle:             'bg-amber-50 text-amber-700 border-amber-100',
  location_off:     'bg-rose-50 text-rose-700 border-rose-100',
  tracking_stopped: 'bg-slate-50 text-slate-700 border-slate-200',
  inactive:         'bg-slate-100 text-slate-600 border-slate-200',
};

const ZONE_TONE = {
  inside:  'bg-sky-50 text-sky-700 border-sky-100',
  outside: 'bg-rose-50 text-rose-700 border-rose-100',
  unknown: 'bg-slate-100 text-slate-600 border-slate-200',
};

// Statuses available in the Status filter dropdown.
// Values match the derived tracking-status strings produced below.
const FILTER_STATUSES = [
  { value: '',                label: 'All Statuses'      },
  { value: 'active',          label: 'Active (Live)'     },
  { value: 'idle',            label: 'Idle'              },
  { value: 'location_off',    label: 'GPS Lost'          },
  { value: 'tracking_stopped',label: 'Tracking Stopped'  },
  { value: 'inactive',        label: 'Inactive / Offline'},
];

// ─── Pure helpers ─────────────────────────────────────────────────────────────
const formatDateTime = (value) => {
  const d = value ? new Date(value) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleString() : 'Not available';
};

const formatMinutesAgo = (value) => {
  const ms = value ? new Date(value).getTime() : NaN;
  if (!Number.isFinite(ms)) return 'No ping';
  const mins = Math.floor(Math.max(0, Date.now() - ms) / 60000);
  if (mins <= 0) return 'Just now';
  if (mins === 1) return '1 min ago';
  return `${mins} mins ago`;
};

/**
 * Given a raw tracking item, derive the display tracking status.
 * Rules (read-only, never set by admin):
 *  – backend already sets 'active' | 'location_off' | 'tracking_stopped' | 'inactive'
 *  – if trackingStatus === 'active' but speed === 0 → display as 'idle'
 */
const deriveTrackingStatus = (tracking = {}) => {
  const raw = String(tracking.trackingStatus || '').toLowerCase() || 'inactive';
  const speed = Number(tracking.speed || 0);
  return raw === 'active' && speed === 0 ? 'idle' : raw;
};

/**
 * Given a raw tracking item, derive the display zone status.
 * Read-only, sourced from backend geofence evaluation.
 */
const deriveZoneStatus = (tracking = {}) =>
  String(tracking.zoneStatus || 'unknown').toLowerCase();

/**
 * Derive the booking trip status badge from item.status + tracking fields.
 * Read-only — never editable by admin from this list.
 */
const deriveTripStatus = (item = {}) => {
  const bookingStatus = String(item.status || '').toLowerCase();
  const tracking = item.rentalTracking || {};
  const speed = Number(tracking.speed || 0);

  if (bookingStatus === 'completed')  return { label: 'Completed', color: 'bg-emerald-50 text-emerald-700 border border-emerald-200' };
  if (bookingStatus === 'cancelled')  return { label: 'Cancelled',  color: 'bg-rose-50 text-rose-700 border border-rose-200' };
  if (bookingStatus === 'end_requested') return { label: 'End Requested', color: 'bg-orange-50 text-orange-700 border border-orange-200' };
  if (tracking.trackingStatus === 'active') {
    return speed > 0
      ? { label: 'On Trip',  color: 'bg-blue-50 text-blue-700 border border-blue-200' }
      : { label: 'Started',  color: 'bg-indigo-50 text-indigo-700 border border-indigo-200' };
  }
  if (bookingStatus === 'assigned') return { label: 'Assigned', color: 'bg-violet-50 text-violet-700 border border-violet-200' };
  return { label: 'Booked', color: 'bg-slate-100 text-slate-700' };
};

// ─── Map API response to array ────────────────────────────────────────────────
const mapTrackingResults = (response) => {
  const payload = response?.data?.data || response?.data || {};
  return Array.isArray(payload?.results) ? payload.results : [];
};

// ─── Extract option lists from API responses ──────────────────────────────────
const extractArray = (response) => {
  const d = response?.data?.data || response?.data || [];
  return Array.isArray(d) ? d : [];
};

// ─── Reusable styled select component ────────────────────────────────────────
const FilterSelect = ({ value, onChange, disabled = false, children }) => (
  <div className="relative">
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="appearance-none cursor-pointer rounded-xl border border-slate-200 bg-white py-2 pl-3 pr-8 text-sm font-semibold text-slate-700 outline-none transition hover:bg-slate-50 focus:border-blue-300 focus:ring-2 focus:ring-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
    </select>
    <ChevronDown
      size={14}
      className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
    />
  </div>
);

// ─── Call button (uses tel: link; disables when no phone) ─────────────────────
const CallButton = ({ phone, label = 'Call Driver' }) => {
  if (!phone || String(phone).trim() === '') {
    return (
      <button
        type="button"
        disabled
        title="Phone number not available"
        className="flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-full bg-slate-100 text-slate-300"
      >
        <PhoneOff size={14} />
      </button>
    );
  }

  return (
    <a
      href={`tel:${String(phone).trim()}`}
      title={label}
      className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-emerald-50 hover:text-emerald-700"
    >
      <Phone size={14} />
    </a>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────
const RentalTracking = () => {
  const navigate = useNavigate();

  // ── Data ──────────────────────────────────────────────────────────────────
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  // ── Filter option lists (loaded from API once) ────────────────────────────
  const [stores, setStores] = useState([]);
  const [zones, setZones] = useState([]);
  const [vehicleTypes, setVehicleTypes] = useState([]);
  const [filterOptsLoading, setFilterOptsLoading] = useState(true);

  // ── Active filter values ──────────────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStore, setSelectedStore] = useState('');
  const [selectedZone, setSelectedZone] = useState('');
  const [selectedVehicleType, setSelectedVehicleType] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');

  // ─────────────────────────────────────────────────────────────────────────
  // Load tracking data (initial + every 60 s silent refresh)
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    const load = async ({ silent = false } = {}) => {
      if (!silent) setLoading(true);
      try {
        const res = await adminService.getRentalTrackingDashboard();
        if (mounted) setItems(mapTrackingResults(res));
      } catch (err) {
        if (mounted) toast.error(err?.message || 'Could not load rental tracking dashboard.');
      } finally {
        if (mounted && !silent) setLoading(false);
      }
    };

    load();
    const tid = window.setInterval(() => load({ silent: true }), 60_000);
    return () => { mounted = false; window.clearInterval(tid); };
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Load filter option lists (once on mount)
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    setFilterOptsLoading(true);

    (async () => {
      try {
        const [storesRes, zonesRes, vtRes] = await Promise.allSettled([
          adminService.getServiceStores(),
          adminService.getZones(),
          adminService.getRentalVehicleTypes(),
        ]);

        if (!mounted) return;

        if (storesRes.status === 'fulfilled') setStores(extractArray(storesRes.value));
        if (zonesRes.status  === 'fulfilled') setZones(extractArray(zonesRes.value));
        if (vtRes.status     === 'fulfilled') setVehicleTypes(extractArray(vtRes.value));
      } catch {
        // silently ignore; filters just won't have options
      } finally {
        if (mounted) setFilterOptsLoading(false);
      }
    })();

    return () => { mounted = false; };
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Socket: real-time upsert
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = socketService.connect({ role: 'admin' });
    if (!socket) return undefined;

    const upsert = (next) => {
      if (!next?.id) return;
      setItems((prev) => {
        const list = Array.isArray(prev) ? [...prev] : [];
        const idx  = list.findIndex((x) => String(x?.id) === String(next.id));
        if (idx >= 0) list[idx] = next; else list.unshift(next);
        return list;
      });
    };

    const onUpdate = (payload) => upsert(payload);
    const onAlert  = (payload) => {
      upsert(payload);
      const user = payload?.user?.name || 'Customer';
      const ref  = payload?.bookingReference || 'Rental booking';
      // Real alert message from server – not mocked
      toast.error(
        (payload?.rentalTracking?.alerts || [])[0]?.message ||
        `${user} triggered a tracking alert on ${ref}.`,
      );
    };

    socketService.on('rental:tracking:updated', onUpdate);
    socketService.on('rental:tracking:alert',   onAlert);

    return () => {
      socketService.off('rental:tracking:updated', onUpdate);
      socketService.off('rental:tracking:alert',   onAlert);
    };
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Derived KPI stats (from unfiltered full list)
  // ─────────────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        acc.total += 1;
        const ts    = String(item?.rentalTracking?.trackingStatus || '').toLowerCase();
        const zs    = String(item?.rentalTracking?.zoneStatus || '').toLowerCase();
        const speed = Number(item?.rentalTracking?.speed || 0);

        if (ts === 'active') {
          if (speed > 0) acc.live += 1; else acc.idle += 1;
          acc.activeTrips += 1;
        } else if (ts === 'location_off') {
          acc.gpsLost += 1;
          acc.activeTrips += 1;
        } else {
          acc.offline += 1;
        }
        if (zs === 'outside') acc.geofenceViolations += 1;
        return acc;
      },
      { total: 0, live: 0, idle: 0, offline: 0, gpsLost: 0, geofenceViolations: 0, activeTrips: 0 },
    );
  }, [items]);

  // ─────────────────────────────────────────────────────────────────────────
  // Client-side filtering  (all filters + search work together, no reload)
  // ─────────────────────────────────────────────────────────────────────────
  const filteredItems = useMemo(() => {
    let result = items;

    // ── Store filter ───────────────────────────────────────────────────────
    // Matches by service store ID against the booking's serviceLocation.id
    // (which stores the locationId embedded at booking time) OR falls back
    // to name-matching when IDs differ between systems.
    if (selectedStore) {
      const storeObj = stores.find(
        (s) => String(s._id || s.id) === selectedStore,
      );
      const storeName = storeObj
        ? String(storeObj.name || storeObj.storeName || '').toLowerCase()
        : '';

      result = result.filter((item) => {
        const locId = String(
          item?.serviceLocation?.id || item?.serviceLocation?.locationId || '',
        );
        const locName = String(item?.serviceLocation?.name || '').toLowerCase();

        return (
          locId === selectedStore ||
          (storeName && locName.includes(storeName))
        );
      });
    }

    // ── Zone filter ────────────────────────────────────────────────────────
    // Matches by zone ID against booking's tracking zoneId OR zone name
    if (selectedZone) {
      const zoneObj = zones.find((z) => String(z._id || z.id) === selectedZone);
      const zoneName = zoneObj
        ? String(zoneObj.name || zoneObj.zoneName || '').toLowerCase()
        : '';

      result = result.filter((item) => {
        const tracking = item?.rentalTracking || {};
        const trackingZoneId   = String(tracking.zoneId || '');
        const matchedZoneName  = String(tracking.matchedZoneName || '').toLowerCase();

        return (
          trackingZoneId === selectedZone ||
          (zoneName && matchedZoneName.includes(zoneName))
        );
      });
    }

    // ── Vehicle Type filter ────────────────────────────────────────────────
    // Matches by vehicle type name (category field on booking vehicle)
    if (selectedVehicleType) {
      const vtObj = vehicleTypes.find((v) => String(v._id || v.id) === selectedVehicleType);
      const vtName = vtObj
        ? String(vtObj.name || vtObj.vehicleName || '').toLowerCase()
        : '';

      result = result.filter((item) => {
        const cat = String(item?.vehicle?.category || item?.vehicle?.name || '').toLowerCase();
        const vtId = String(item?.vehicle?.id || '');
        return (
          vtId === selectedVehicleType ||
          (vtName && cat.includes(vtName))
        );
      });
    }

    // ── Status filter ──────────────────────────────────────────────────────
    // Compares against the derived tracking status (read-only, from server)
    if (selectedStatus) {
      result = result.filter(
        (item) => deriveTrackingStatus(item?.rentalTracking || {}) === selectedStatus,
      );
    }

    // ── Full-text search ───────────────────────────────────────────────────
    // Covers: booking ID, customer name/phone, driver name/phone, vehicle name,
    //         service location name, zone status, tracking status
    const query = searchTerm.trim().toLowerCase();
    if (query) {
      result = result.filter((item) => {
        const tracking = item?.rentalTracking || {};
        return [
          item?.bookingReference,
          item?.user?.name,
          item?.user?.phone,
          item?.user?.email,
          item?.driver?.name,
          item?.driver?.phone,
          item?.vehicle?.name,
          item?.vehicle?.registrationNumber,
          item?.vehicle?.category,
          item?.serviceLocation?.name,
          tracking.trackingStatus,
          tracking.zoneStatus,
          tracking.matchedZoneName,
          tracking.hubName,
        ]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(query));
      });
    }

    return result;
  }, [items, searchTerm, selectedStore, selectedZone, selectedVehicleType, selectedStatus, stores, zones, vehicleTypes]);

  const hasActiveFilters = !!(
    selectedStore || selectedZone || selectedVehicleType || selectedStatus || searchTerm.trim()
  );

  const clearFilters = () => {
    setSelectedStore('');
    setSelectedZone('');
    setSelectedVehicleType('');
    setSelectedStatus('');
    setSearchTerm('');
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#f6f7fb] p-6 lg:p-8">
      <AdminPageHeader
        module="Operations"
        page="Fleet Dashboard"
        title="Fleet Tracking Dashboard"
      />

      {/* ── KPI Cards ──────────────────────────────────────────────────────── */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-7">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-500">Total Vehicles</p>
          <p className="mt-1 text-2xl font-black text-slate-900">{stats.total}</p>
        </div>
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 shadow-sm">
          <p className="text-xs font-semibold text-emerald-700">Live Vehicles</p>
          <p className="mt-1 flex items-center gap-2 text-2xl font-black text-emerald-900">
            {stats.live}
            <Radio size={16} className="animate-pulse text-emerald-600" />
          </p>
        </div>
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 shadow-sm">
          <p className="text-xs font-semibold text-amber-700">Idle Vehicles</p>
          <p className="mt-1 text-2xl font-black text-amber-900">{stats.idle}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-100 p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-600">Offline</p>
          <p className="mt-1 text-2xl font-black text-slate-900">{stats.offline}</p>
        </div>
        <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4 shadow-sm">
          <p className="text-xs font-semibold text-rose-700">GPS Lost</p>
          <p className="mt-1 text-2xl font-black text-rose-900">{stats.gpsLost}</p>
        </div>
        <div className="rounded-2xl border border-orange-100 bg-orange-50 p-4 shadow-sm">
          <p className="text-xs font-semibold text-orange-700">Geofence Violations</p>
          <p className="mt-1 text-2xl font-black text-orange-900">{stats.geofenceViolations}</p>
        </div>
        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 shadow-sm">
          <p className="text-xs font-semibold text-blue-700">Active Trips</p>
          <p className="mt-1 text-2xl font-black text-blue-900">{stats.activeTrips}</p>
        </div>
      </div>

      {/* ── Filter Bar ─────────────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">

        {/* Label */}
        <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-500">
          <Filter size={16} />
          <span className="font-semibold">Filters:</span>
        </div>

        {/* Store */}
        <FilterSelect
          value={selectedStore}
          onChange={setSelectedStore}
          disabled={filterOptsLoading}
        >
          <option value="">All Stores</option>
          {stores.map((s) => (
            <option key={s._id || s.id} value={String(s._id || s.id)}>
              {s.name || s.storeName || `Store #${s._id || s.id}`}
            </option>
          ))}
        </FilterSelect>

        {/* Zone */}
        <FilterSelect
          value={selectedZone}
          onChange={setSelectedZone}
          disabled={filterOptsLoading}
        >
          <option value="">All Zones</option>
          {zones.map((z) => (
            <option key={z._id || z.id} value={String(z._id || z.id)}>
              {z.name || z.zoneName || `Zone #${z._id || z.id}`}
            </option>
          ))}
        </FilterSelect>

        {/* Vehicle Type */}
        <FilterSelect
          value={selectedVehicleType}
          onChange={setSelectedVehicleType}
          disabled={filterOptsLoading}
        >
          <option value="">All Vehicle Types</option>
          {vehicleTypes.map((vt) => (
            <option key={vt._id || vt.id} value={String(vt._id || vt.id)}>
              {vt.name || vt.vehicleName || `Type #${vt._id || vt.id}`}
            </option>
          ))}
        </FilterSelect>

        {/* Status */}
        <FilterSelect value={selectedStatus} onChange={setSelectedStatus}>
          {FILTER_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </FilterSelect>

        {/* Clear button – appears only when a filter is active */}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-100"
          >
            <X size={14} />
            Clear
          </button>
        )}

        {/* Search */}
        <div className="relative ml-auto w-full max-w-xs">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search booking, driver, vehicle..."
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-4 text-sm font-semibold text-slate-700 outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-100"
          />
        </div>
      </div>

      {/* ── Table Card ─────────────────────────────────────────────────────── */}
      <div className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="p-1">
          {loading ? (
            <div className="flex min-h-[320px] items-center justify-center">
              <Loader2 size={30} className="animate-spin text-slate-400" />
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50/70 px-6 py-16 text-center">
              <CarFront size={34} className="mx-auto text-slate-300" />
              <h2 className="mt-4 text-xl font-black text-slate-900">
                {hasActiveFilters
                  ? 'No matching tracking records found'
                  : 'No vehicles found'}
              </h2>
              <p className="mt-2 text-sm font-medium text-slate-500">
                {hasActiveFilters
                  ? 'Try adjusting or clearing the active filters.'
                  : 'Active rental vehicles and trips will appear here.'}
              </p>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-black"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-[24px]">
              <table className="w-full min-w-[1300px] border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left">
                    <th className="px-5 py-4 text-xs font-bold text-slate-500">Booking ID</th>
                    <th className="px-5 py-4 text-xs font-bold text-slate-500">Vehicle</th>
                    <th className="px-5 py-4 text-xs font-bold text-slate-500">Driver</th>
                    <th className="px-5 py-4 text-xs font-bold text-slate-500">Customer</th>
                    <th className="px-5 py-4 text-xs font-bold text-slate-500">Trip Status</th>
                    <th className="px-5 py-4 text-xs font-bold text-slate-500">Tracking</th>
                    <th className="px-5 py-4 text-xs font-bold text-slate-500">Zone</th>
                    <th className="px-5 py-4 text-xs font-bold text-slate-500">Last Ping</th>
                    <th className="px-5 py-4 text-xs font-bold text-slate-500">Alerts</th>
                    <th className="px-5 py-4 text-right text-xs font-bold text-slate-500">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredItems.map((item) => {
                    const tracking       = item?.rentalTracking || {};
                    const activeAlerts   = Array.isArray(tracking.alerts) ? tracking.alerts : [];
                    const trackingStatus = deriveTrackingStatus(tracking);
                    const zoneStatus     = deriveZoneStatus(tracking);
                    const tripStatus     = deriveTripStatus(item);
                    const statusClass    = STATUS_TONE[trackingStatus] || STATUS_TONE.inactive;
                    const zoneClass      = ZONE_TONE[zoneStatus] || ZONE_TONE.unknown;

                    // Label shown in the Tracking badge
                    const trackingLabel = trackingStatus.replace(/_/g, ' ');

                    // Zone label: prefer matchedZoneName + status, else plain status
                    const zoneLabel = tracking.matchedZoneName
                      ? `${tracking.matchedZoneName} (${zoneStatus})`
                      : zoneStatus;

                    const recordId = item.id || item._id || item.rentalBookingId || item.bookingId;

                    return (
                      <tr key={recordId || Math.random()} className="transition hover:bg-slate-50/50">
                        {/* Booking ID */}
                        <td className="px-5 py-4 align-top">
                          <p className="text-sm font-bold text-slate-900">
                            {item.bookingReference || '—'}
                          </p>
                          <p className="mt-1 text-xs font-semibold text-slate-500">
                            {item.serviceLocation?.name || 'Hub'}
                          </p>
                        </td>

                        {/* Vehicle */}
                        <td className="px-5 py-4 align-top">
                          <p className="text-sm font-bold text-slate-900">
                            {item.vehicle?.name || '—'}
                          </p>
                          <p className="mt-0.5 text-xs font-semibold text-slate-500">
                            {item.vehicle?.registrationNumber || '—'}
                          </p>
                          {item.vehicle?.category && (
                            <span className="mt-1.5 inline-block rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                              {item.vehicle.category}
                            </span>
                          )}
                        </td>

                        {/* Driver */}
                        <td className="px-5 py-4 align-top">
                          <div className="flex items-start gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-200 text-slate-500">
                              <User2 size={16} />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-slate-900">
                                {item.driver?.name || 'Unassigned'}
                              </p>
                              <p className="text-xs font-semibold text-slate-500">
                                {item.driver?.phone || 'No phone'}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Customer */}
                        <td className="px-5 py-4 align-top">
                          <p className="text-sm font-bold text-slate-900">
                            {item.user?.name || '—'}
                          </p>
                          <p className="mt-0.5 text-xs font-semibold text-slate-500">
                            {item.user?.phone || 'No phone'}
                          </p>
                        </td>

                        {/* Trip Status – read-only badge, not a button */}
                        <td className="px-5 py-4 align-top">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${tripStatus.color}`}
                          >
                            {tripStatus.label}
                          </span>
                        </td>

                        {/* Tracking – read-only, derived from server data */}
                        <td className="px-5 py-4 align-top">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${statusClass}`}
                          >
                            {trackingStatus === 'active' ? (
                              <Radio size={12} />
                            ) : (
                              <WifiOff size={12} />
                            )}
                            {trackingLabel}
                          </span>
                        </td>

                        {/* Zone – read-only, from geofence evaluation */}
                        <td className="px-5 py-4 align-top">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${zoneClass}`}
                          >
                            <ShieldAlert size={12} />
                            {zoneLabel}
                          </span>
                        </td>

                        {/* Last Ping */}
                        <td className="px-5 py-4 align-top">
                          <p className="text-sm font-bold text-slate-900">
                            {formatMinutesAgo(tracking.lastLocationAt)}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {formatDateTime(tracking.lastLocationAt)}
                          </p>
                        </td>

                        {/* Alerts */}
                        <td className="px-5 py-4 align-top">
                          {activeAlerts.length > 0 ? (
                            <div className="flex flex-col gap-1.5">
                              {activeAlerts.map((alert, idx) => (
                                <span
                                  key={idx}
                                  className="inline-flex w-fit items-center gap-1.5 rounded-md bg-rose-50 px-2 py-1 text-[10px] font-bold text-rose-700"
                                >
                                  <AlertTriangle size={10} />
                                  {alert.type || alert.code || 'Alert'}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs font-semibold text-slate-400">Clear</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-5 py-4 align-top text-right">
                          <div className="flex items-center justify-end gap-2">
                            {/* Call Driver – tel: link, disabled when no phone */}
                            <CallButton
                              phone={item.driver?.phone}
                              label={`Call Driver: ${item.driver?.name || 'Driver'}`}
                            />

                            {/* Track – navigate to detail page using real item id */}
                            <button
                              type="button"
                              disabled={!recordId}
                              onClick={() =>
                                navigate(
                                  `/admin/pricing/rental-tracking/${recordId}`,
                                  { state: { item } },
                                )
                              }
                              className="inline-flex h-8 items-center rounded-full bg-slate-900 px-3.5 text-xs font-bold text-white shadow-sm transition hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Track
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RentalTracking;
