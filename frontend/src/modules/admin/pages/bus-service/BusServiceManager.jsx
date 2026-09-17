import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Autocomplete,
  GoogleMap,
  MarkerF,
  Polyline,
} from '@react-google-maps/api';
import {
  Armchair,
  Bus,
  CalendarDays,
  CheckCircle2,
  Clock3,
  CopyPlus,
  Eye,
  ImagePlus,
  Search,
  MapPin,
  Plus,
  Route,
  Save,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { adminService } from '../../services/adminService';
import { computeDrivingRoute } from '../../../../shared/utils/googleRoutes';
import {
  BUS_BLUEPRINT_TEMPLATES,
  createBusBlueprint,
  countTotalSeats,
  createBlueprintFromTemplate,
  createBusDraft,
  deleteAdminBus as defaultDeleteBus,
  getAdminBuses as defaultGetBuses,
  upsertAdminBus as defaultUpsertBus,
} from '../../services/busService';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { HAS_VALID_GOOGLE_MAPS_KEY, useAppGoogleMapsLoader } from '../../utils/googleMaps';

const DAY_OPTIONS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const AMENITY_OPTIONS = [
  'Charging Port',
  'Reading Light',
  'Live Tracking',
  'Blanket',
  'Water Bottle',
  'WiFi',
  'CCTV',
  'Emergency Exit',
];

const fieldClassName =
  'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 shadow-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-400/5';

const labelClassName = 'mb-1 block text-[10px] font-bold text-slate-500';

const statusTone = {
  active: 'bg-emerald-100 text-emerald-800 border-emerald-300 shadow-sm',
  draft: 'bg-amber-100 text-amber-800 border-amber-300 shadow-sm',
  paused: 'bg-rose-100 text-rose-800 border-rose-300 shadow-sm',
};

const DEFAULT_COACH_TYPES = ['AC Sleeper', 'Non AC Sleeper', 'AC Seater', 'Volvo Multi Axle', 'Semi Sleeper'];
const VARIANT_PRICING_FIELDS = [
  { key: 'seat', label: 'Standard Seat' },
  { key: 'window', label: 'Window Seat' },
  { key: 'aisle', label: 'Aisle Seat' },
  { key: 'sleeper', label: 'Sleeper Berth' },
];
const CREATE_FLOW_STEPS = [
  {
    key: 'basics',
    shortLabel: 'Step 1',
    title: 'Bus Basics',
    description: 'Driver assignment, operator profile, pricing, and status.',
  },
  {
    key: 'experience',
    shortLabel: 'Step 2',
    title: 'Media & Policies',
    description: 'Images, amenities, and rider policy details.',
  },
  {
    key: 'layout',
    shortLabel: 'Step 3',
    title: 'Seat Layout',
    description: 'Coach blueprint and seat inventory setup.',
  },
  {
    key: 'route',
    shortLabel: 'Step 4',
    title: 'Route & Schedule',
    description: 'Stops, route map, and recurring departures.',
  },
];

const blankStop = () => ({
  id: `stop-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  city: '',
  pointName: '',
  stopType: 'pickup',
  arrivalTime: '',
  departureTime: '',
});

const blankSchedule = () => ({
  id: `schedule-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  label: '',
  departureTime: '',
  arrivalTime: '',
  activeDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  status: 'active',
});

const blankCancellationRule = () => ({
  id: `cancel-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  label: '',
  hoursBeforeDeparture: 0,
  refundType: 'percentage',
  refundValue: 0,
  notes: '',
});

const CITY_AUTOCOMPLETE_FIELDS = ['address_components', 'formatted_address', 'geometry', 'name', 'place_id'];
const ROUTE_MAP_CONTAINER_STYLE = { width: '100%', height: '100%' };
const getRouteCacheKey = (origin, destination) => {
  const serializePoint = (point) =>
    point ? `${Number(point.lat || 0).toFixed(5)},${Number(point.lng || 0).toFixed(5)}` : '';

  return `${serializePoint(origin)}|${serializePoint(destination)}`;
};
const getCreateFlowStepIndex = (searchParams) => {
  const rawValue = Number(searchParams.get('step') || 1);
  if (!Number.isFinite(rawValue)) {
    return 0;
  }
  return Math.min(CREATE_FLOW_STEPS.length - 1, Math.max(0, rawValue - 1));
};

const toCoords = (value) => {
  const lat = Number(value?.lat);
  const lng = Number(value?.lng);

  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng };
  }

  return null;
};

const getCityLabelFromPlace = (place) => {
  const components = Array.isArray(place?.address_components) ? place.address_components : [];
  const locality =
    components.find((component) => component.types?.includes('locality'))?.long_name ||
    components.find((component) => component.types?.includes('administrative_area_level_3'))?.long_name ||
    components.find((component) => component.types?.includes('administrative_area_level_2'))?.long_name;

  return String(locality || place?.name || place?.formatted_address || '').trim();
};

const getCoordsFromPlace = (place) => {
  const location = place?.geometry?.location;

  if (!location || typeof location.lat !== 'function' || typeof location.lng !== 'function') {
    return null;
  }

  return {
    lat: Number(location.lat()),
    lng: Number(location.lng()),
  };
};

const swapStopType = (stopType = 'pickup') => {
  if (stopType === 'pickup') return 'drop';
  if (stopType === 'drop') return 'pickup';
  return 'both';
};

const buildMirroredReturnRoute = (route = {}) => ({
  routeName:
    route.originCity || route.destinationCity
      ? `Return: ${route.destinationCity || 'Destination'} to ${route.originCity || 'Origin'}`
      : '',
  originCity: route.destinationCity || '',
  destinationCity: route.originCity || '',
  originCoords: toCoords(route.destinationCoords),
  destinationCoords: toCoords(route.originCoords),
  distanceKm: route.distanceKm || '',
  durationHours: route.durationHours || '',
  stops: Array.isArray(route.stops)
    ? route.stops
        .slice()
        .reverse()
        .map((stop, index) => ({
          id: stop.id || `return-stop-${index + 1}`,
          city: stop.city || '',
          pointName: stop.pointName || '',
          stopType: swapStopType(stop.stopType),
          arrivalTime: stop.departureTime || '',
          departureTime: stop.arrivalTime || '',
        }))
    : [],
});

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const SeatCell = ({ cell, onToggle }) => {
  if (!cell || cell.kind !== 'seat') {
    return <div className="h-11 rounded-2xl bg-transparent" />;
  }

  const isBlocked = cell.status === 'blocked';
  const isSleeper = cell.variant === 'sleeper';
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`relative flex items-center justify-center overflow-hidden border text-[10px] font-black tracking-wider transition ${
        isBlocked
          ? 'border-rose-200 bg-rose-50 text-rose-500'
          : isSleeper
            ? 'border-sky-200 bg-gradient-to-br from-sky-50 to-cyan-50 text-sky-700 hover:border-sky-300 hover:text-sky-800'
            : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:text-indigo-600'
      }`}
      title={isBlocked ? 'Seat blocked for sale' : 'Seat available for sale'}
      style={{
        minHeight: isSleeper ? '58px' : '44px',
        borderRadius: isSleeper ? '18px' : '14px',
      }}
    >
      {isSleeper ? (
        <>
          <span className="absolute inset-y-1 left-1.5 w-2 rounded-full bg-sky-200" />
          <span className="absolute right-1.5 top-1.5 h-2 w-8 rounded-full bg-white/60" />
          <span className="pl-4">{cell.label}</span>
        </>
      ) : (
        <>
          <span className="absolute inset-x-2 top-1.5 h-1.5 rounded-full bg-slate-200" />
          <span className="absolute bottom-1 right-1.5 h-2.5 w-2.5 rounded-full bg-slate-100" />
          <span>{cell.label}</span>
        </>
      )}
    </button>
  );
};

const SeatDeckPreview = ({ title, deckRows, onToggleSeat }) => {
  if (!deckRows?.length) return null;

  const maxColumns = Math.max(...deckRows.map((row) => row.length), 1);

  return (
    <div className="rounded-[32px] border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-4 shadow-inner">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h4 className="text-sm font-black text-slate-900">{title}</h4>
          <p className="text-[10px] font-medium text-slate-500">Tap any seat or berth to block or reopen it.</p>
        </div>
        <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-bold text-slate-500">
          Redbus style
        </div>
      </div>

      <div className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]">
        <div className="mb-4 flex items-center justify-between">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black text-slate-500">
            Entry
          </div>
          <div className="flex h-12 w-12 rotate-45 items-center justify-center rounded-2xl border-4 border-slate-200 border-b-transparent border-r-transparent">
            <div className="-rotate-45 text-[10px] font-black text-slate-400">Front</div>
          </div>
        </div>

        <div className="space-y-3">
        {deckRows.map((row, rowIndex) => (
          <div
            key={`${title}-${rowIndex}`}
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${Math.max(maxColumns, row.length)}, minmax(0, 1fr))` }}
          >
            {row.map((cell, cellIndex) => (
              <SeatCell
                key={`${title}-${rowIndex}-${cellIndex}-${cell?.id || 'aisle'}`}
                cell={cell}
                onToggle={() => cell?.kind === 'seat' && onToggleSeat(cell.id)}
              />
            ))}
          </div>
        ))}
        </div>
      </div>
    </div>
  );
};

const BlueprintDeckConfigurator = ({ title, config, onChange }) => (
  <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
    <div className="mb-4 flex items-center justify-between">
      <div>
        <h4 className="text-xs font-bold text-slate-900">{title}</h4>
        <p className="text-[10px] font-medium text-slate-500">Tune rows, berth type, and seats on each side.</p>
      </div>
      <button
        type="button"
        onClick={() => onChange('enabled', !config.enabled)}
        className={`rounded-full px-2.5 py-0.5 border text-[10px] font-bold transition-all ${
          config.enabled ? 'border-amber-300 bg-amber-100 text-amber-800 shadow-sm' : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300'
        }`}
      >
        {config.enabled ? 'Enabled' : 'Disabled'}
      </button>
    </div>

    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <div>
        <label className={labelClassName}>Seat Type</label>
        <select
          className={fieldClassName}
          value={config.seatType}
          onChange={(event) => onChange('seatType', event.target.value)}
          disabled={!config.enabled}
        >
          <option value="seat">Seater</option>
          <option value="sleeper">Sleeper</option>
        </select>
      </div>
      <div>
        <label className={labelClassName}>Rows</label>
        <input
          className={fieldClassName}
          type="number"
          min="0"
          max="20"
          value={config.rows}
          onChange={(event) => onChange('rows', event.target.value)}
          disabled={!config.enabled}
        />
      </div>
      <div>
        <label className={labelClassName}>Left Side Seats</label>
        <input
          className={fieldClassName}
          type="number"
          min="0"
          max="3"
          value={config.leftSeats}
          onChange={(event) => onChange('leftSeats', event.target.value)}
          disabled={!config.enabled}
        />
      </div>
      <div>
        <label className={labelClassName}>Right Side Seats</label>
        <input
          className={fieldClassName}
          type="number"
          min="0"
          max="3"
          value={config.rightSeats}
          onChange={(event) => onChange('rightSeats', event.target.value)}
          disabled={!config.enabled}
        />
      </div>
    </div>
  </div>
);

const BusServiceManager = ({
  mode: modeProp = null,
  api = {},
  basePath = '/admin/bus-service',
  badgeLabel = 'Bus Service Control',
  title = 'Manage Bus Fleet & Schedules',
  description = 'Define coaches, preview seat blueprints, manage inventory, and publish recurring departures with multi-stop routes.',
  emptyLabel = 'No buses found.',
  defaultStatus = 'draft',
}) => {
  const buildFreshDraft = () => ({
    ...createBusDraft(),
    status: ['draft', 'active', 'paused'].includes(defaultStatus) ? defaultStatus : 'draft',
  });

  const navigate = useNavigate();
  const location = useLocation();
  const { id: routeBusId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const getBuses = api.getBuses || defaultGetBuses;
  const upsertBus = api.upsertBus || defaultUpsertBus;
  const deleteBus = api.deleteBus || defaultDeleteBus;
  const getPendingBusDrivers = api.getPendingBusDrivers || adminService.getPendingBusDrivers;
  const approvePendingBusDriver = api.approvePendingBusDriver || adminService.approvePendingBusDriver;
  const rejectPendingBusDriver = api.rejectPendingBusDriver || adminService.rejectPendingBusDriver;
  const getDrivers = api.getDrivers;
  const resolvedPathMode = useMemo(() => {
    const pathname = String(location.pathname || '');

    if (pathname === `${basePath}/create`) {
      return 'create';
    }

    if (pathname.startsWith(`${basePath}/edit/`)) {
      return 'edit';
    }

    if (routeBusId && pathname.startsWith(`${basePath}/`)) {
      return 'details';
    }

    return '';
  }, [basePath, location.pathname, routeBusId]);
  const currentMode = modeProp || resolvedPathMode || searchParams.get('mode') || 'list';
  const currentBusId = routeBusId || searchParams.get('bus') || '';
  const [catalog, setCatalog] = useState([]);
  const [pendingBusDrivers, setPendingBusDrivers] = useState([]);
  const [selectedBusId, setSelectedBusId] = useState(null);
  const [detailBusId, setDetailBusId] = useState(null);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [draft, setDraft] = useState(() => buildFreshDraft());
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [ownerDrivers, setOwnerDrivers] = useState([]);
  const [driverSearch, setDriverSearch] = useState('');
  const [routePath, setRoutePath] = useState([]);
  const autocompleteRefs = useRef({});
  const routeMapRef = useRef(null);
  const routePreviewCacheRef = useRef(new Map());
  const cityGeocodeCacheRef = useRef(new Map());
  const { isLoaded: isGoogleMapsLoaded } = useAppGoogleMapsLoader();
  const canUsePlacesAutocomplete =
    isGoogleMapsLoaded &&
    HAS_VALID_GOOGLE_MAPS_KEY &&
    typeof window !== 'undefined' &&
    Boolean(window.google?.maps?.places);
  const coachTypeOptions = useMemo(() => {
    const discovered = Array.from(
      new Set(
        [draft.coachType, ...catalog.map((item) => item.coachType)].filter(Boolean),
      ),
    );

    return Array.from(new Set([...DEFAULT_COACH_TYPES, ...discovered]));
  }, [catalog, draft.coachType]);

  useEffect(() => {
    let active = true;

    const loadCatalog = async () => {
      setIsLoadingCatalog(true);
      try {
        const buses = await getBuses();
        const pendingResponse = await getPendingBusDrivers?.();
        if (!active) return;

        setCatalog(buses);
        setPendingBusDrivers(Array.isArray(pendingResponse?.data?.data?.results || pendingResponse?.data?.results)
          ? (pendingResponse?.data?.data?.results || pendingResponse?.data?.results)
          : []);
        if (currentMode === 'create') {
          return;
        }
        if (buses[0]) {
          setSelectedBusId((current) => current || buses[0].id);
          setDraft((current) =>
            current.id === buses[0].id ? current : JSON.parse(JSON.stringify(buses[0])),
          );
        } else {
          const nextDraft = buildFreshDraft();
          setSelectedBusId(nextDraft.id);
          setDraft(nextDraft);
        }
      } catch (error) {
        if (!active) return;
        toast.error(error?.message || 'Failed to load bus services');
      } finally {
        if (active) {
          setIsLoadingCatalog(false);
        }
      }
    };

    loadCatalog();

    return () => {
      active = false;
    };
  }, [currentMode]);

  const refreshPendingBusDrivers = async () => {
    if (typeof getPendingBusDrivers !== 'function') {
      return;
    }
    try {
      const response = await getPendingBusDrivers();
      setPendingBusDrivers(response?.data?.data?.results || response?.data?.results || []);
    } catch (error) {
      toast.error(error?.message || 'Failed to load pending bus driver requests');
    }
  };

  const handleApprovePendingBusDriver = async (driverId) => {
    if (typeof approvePendingBusDriver !== 'function') return;
    try {
      await approvePendingBusDriver(driverId);
      await refreshPendingBusDrivers();
      toast.success('Bus driver request approved');
    } catch (error) {
      toast.error(error?.message || 'Failed to approve bus driver request');
    }
  };

  const handleRejectPendingBusDriver = async (driverId) => {
    if (typeof rejectPendingBusDriver !== 'function') return;
    const rejectionReason = window.prompt('Reason for rejection', '');
    if (rejectionReason === null) return;
    try {
      await rejectPendingBusDriver(driverId, rejectionReason);
      await refreshPendingBusDrivers();
      toast.success('Bus driver request updated');
    } catch (error) {
      toast.error(error?.message || 'Failed to reject bus driver request');
    }
  };

  useEffect(() => {
    if (typeof getDrivers !== 'function') {
      setOwnerDrivers([]);
      return undefined;
    }

    let active = true;
    const loadDrivers = async () => {
      try {
        const result = await getDrivers();
        if (!active) return;
        setOwnerDrivers(Array.isArray(result) ? result : []);
      } catch (error) {
        if (!active) return;
        toast.error(error?.message || 'Failed to load owner drivers');
      }
    };

    loadDrivers();
    return () => {
      active = false;
    };
  }, [getDrivers]);

  useEffect(() => {
    if (currentMode === 'create') return;
    const selectedBus = catalog.find((item) => item.id === selectedBusId);
    if (selectedBus) {
      setDraft(JSON.parse(JSON.stringify(selectedBus)));
    }
  }, [catalog, currentMode, selectedBusId]);

  const totalSeats = useMemo(() => countTotalSeats(draft.blueprint), [draft.blueprint]);
  const totalStops = draft.route?.stops?.length || 0;
  const totalSchedules = draft.schedules?.length || 0;
  const isCreateFlowMode = currentMode === 'edit' || currentMode === 'create';
  const currentFormStepIndex = useMemo(
    () => (isCreateFlowMode ? getCreateFlowStepIndex(searchParams) : 0),
    [isCreateFlowMode, searchParams],
  );
  const currentFormStep = CREATE_FLOW_STEPS[currentFormStepIndex] || CREATE_FLOW_STEPS[0];
  const isLastFormStep = currentFormStepIndex === CREATE_FLOW_STEPS.length - 1;
  const basicStepComplete = Boolean(
    String(draft.operatorName || '').trim() && String(draft.busName || '').trim(),
  );
  const experienceStepComplete = Boolean(
    String(draft.boardingPolicy || '').trim()
      && String(draft.cancellationPolicy || '').trim()
      && String(draft.luggagePolicy || '').trim(),
  );
  const layoutStepComplete = totalSeats > 0;
  const routeStepComplete = Boolean(
    String(draft.route?.originCity || '').trim()
      && String(draft.route?.destinationCity || '').trim()
      && totalSchedules > 0,
  );
  const stepCompletionState = [basicStepComplete, experienceStepComplete, layoutStepComplete, routeStepComplete];
  const canAdvanceFromCurrentStep =
    currentFormStepIndex === 0 ? basicStepComplete :
    currentFormStepIndex === 1 ? experienceStepComplete :
    currentFormStepIndex === 2 ? layoutStepComplete : true;
  const detailBus = useMemo(
    () => catalog.find((item) => item.id === currentBusId || item.id === detailBusId) || null,
    [catalog, currentBusId, detailBusId],
  );
  const filteredCatalog = useMemo(() => {
    const query = catalogSearch.trim().toLowerCase();
    if (!query) return catalog;

    return catalog.filter((bus) =>
      [
        bus.busName,
        bus.operatorName,
        bus.serviceNumber,
        bus.registrationNumber,
        bus.driverName,
        bus.driverPhone,
        bus.route?.routeName,
        bus.route?.originCity,
        bus.route?.destinationCity,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [catalog, catalogSearch]);
  const selectedOwnerDriver = useMemo(
    () => ownerDrivers.find((driver) => String(driver.id) === String(draft.ownerDriverId || '')) || null,
    [draft.ownerDriverId, ownerDrivers],
  );
  const routePreviewPoints = useMemo(() => {
    const points = [
      toCoords(draft.route?.originCoords),
      toCoords(draft.route?.destinationCoords),
    ].filter(Boolean);

    if (points.length >= 2) {
      return points;
    }

    return points;
  }, [draft.route?.destinationCoords, draft.route?.originCoords]);
  const routeMapCenter = useMemo(() => {
    if (routePreviewPoints.length === 0) {
      return { lat: 22.7196, lng: 75.8577 };
    }

    if (routePreviewPoints.length === 1) {
      return routePreviewPoints[0];
    }

    const totals = routePreviewPoints.reduce(
      (acc, point) => ({
        lat: acc.lat + point.lat,
        lng: acc.lng + point.lng,
      }),
      { lat: 0, lng: 0 },
    );

    return {
      lat: totals.lat / routePreviewPoints.length,
      lng: totals.lng / routePreviewPoints.length,
    };
  }, [routePreviewPoints]);
  const routePolylinePath = useMemo(() => {
    if (routePath.length >= 2) {
      return routePath;
    }

    return routePreviewPoints;
  }, [routePath, routePreviewPoints]);
  const filteredOwnerDrivers = useMemo(() => {
    const query = String(driverSearch || '').trim().toLowerCase();
    if (!query) return ownerDrivers.slice(0, 8);
    return ownerDrivers
      .filter((driver) =>
        [driver.name, driver.phone, driver.city, driver.status]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query)),
      )
      .slice(0, 8);
  }, [driverSearch, ownerDrivers]);

  useEffect(() => {
    if (currentMode !== 'edit' || !currentBusId) return;
    const selectedBus = catalog.find((item) => item.id === currentBusId);
    if (selectedBus) {
      setSelectedBusId(selectedBus.id);
      setDraft(JSON.parse(JSON.stringify(selectedBus)));
    }
  }, [catalog, currentBusId, currentMode]);

  useEffect(() => {
    if (
      !isGoogleMapsLoaded ||
      routePreviewPoints.length < 2 ||
      !window.google?.maps?.importLibrary
    ) {
      setRoutePath([]);
      return;
    }

    const routeCacheKey = getRouteCacheKey(routePreviewPoints[0], routePreviewPoints[1]);
    const cachedRoute = routePreviewCacheRef.current.get(routeCacheKey);
    if (cachedRoute) {
      setRoutePath(cachedRoute);
      return;
    }

    let cancelled = false;
    void (async () => {
      const result = await computeDrivingRoute({
        origin: routePreviewPoints[0],
        destination: routePreviewPoints[1],
        region: 'IN',
      });

      if (cancelled) {
        return;
      }

      if (result.status === 'OK' && result.path.length) {
        routePreviewCacheRef.current.set(routeCacheKey, result.path);
        setRoutePath(result.path);
        return;
      }

      routePreviewCacheRef.current.set(routeCacheKey, routePreviewPoints);
      setRoutePath(routePreviewPoints);
    })();

    return () => {
      cancelled = true;
    };
  }, [isGoogleMapsLoaded, routePreviewPoints]);

  useEffect(() => {
    if (!routeMapRef.current || routePreviewPoints.length === 0 || !window.google?.maps) {
      return;
    }

    if (routePolylinePath.length === 1) {
      routeMapRef.current.panTo(routePolylinePath[0]);
      routeMapRef.current.setZoom(8);
      return;
    }

    const bounds = new window.google.maps.LatLngBounds();
    routePolylinePath.forEach((point) => bounds.extend(point));
    routeMapRef.current.fitBounds(bounds, 60);
  }, [routePolylinePath, routePreviewPoints.length]);

  const openListView = () => {
    setDetailBusId(null);
    navigate(basePath);
  };

  const openFormStep = (stepIndex) => {
    const nextStepIndex = Math.min(CREATE_FLOW_STEPS.length - 1, Math.max(0, Number(stepIndex) || 0));
    const nextParams = new URLSearchParams(searchParams);
    if (nextStepIndex <= 0) {
      nextParams.delete('step');
    } else {
      nextParams.set('step', String(nextStepIndex + 1));
    }
    setSearchParams(nextParams, { replace: true });
  };

  const goToPreviousFormStep = () => {
    if (currentFormStepIndex <= 0) {
      return;
    }
    openFormStep(currentFormStepIndex - 1);
  };

  const goToNextFormStep = () => {
    if (currentFormStepIndex >= CREATE_FLOW_STEPS.length - 1) {
      return;
    }
    openFormStep(currentFormStepIndex + 1);
  };

  const openEditView = (busId) => {
    setDetailBusId(null);
    setSelectedBusId(busId);
    navigate(`${basePath}/edit/${busId}`);
  };

  const openDetailView = (busId) => {
    navigate(`${basePath}/${busId}`);
  };

  const updateDraft = (field, value) => {
    setDraft((current) => {
      if (field === 'seatPrice') {
        return {
          ...current,
          seatPrice: value,
          variantPricing: {
            seat: value,
            window: value,
            aisle: value,
            sleeper: value,
          },
        };
      }

      return { ...current, [field]: value };
    });
  };

  const updateRouteField = (field, value) => {
    setDraft((current) => ({
      ...current,
      route: {
        ...current.route,
        [field]: value,
        ...(field === 'originCity' ? { originCoords: null } : {}),
        ...(field === 'destinationCity' ? { destinationCoords: null } : {}),
      },
      returnRoute: current.returnRouteEnabled
        ? buildMirroredReturnRoute({
            ...current.route,
            [field]: value,
            ...(field === 'originCity' ? { originCoords: null } : {}),
            ...(field === 'destinationCity' ? { destinationCoords: null } : {}),
          })
        : current.returnRoute,
    }));
  };

  const applyRoutePlace = (field, place) => {
    const cityLabel = getCityLabelFromPlace(place);
    const coords = getCoordsFromPlace(place);

    if (!cityLabel || !coords) {
      toast.error('Pick a valid Indian city from the suggestions.');
      return;
    }

    setDraft((current) => {
      const nextRoute = {
        ...current.route,
        [field]: cityLabel,
        ...(field === 'originCity' ? { originCoords: coords } : { destinationCoords: coords }),
      };

      return {
        ...current,
        route: nextRoute,
        returnRoute: current.returnRouteEnabled ? buildMirroredReturnRoute(nextRoute) : current.returnRoute,
      };
    });
  };

  const registerAutocomplete = (field, autocomplete) => {
    autocompleteRefs.current[field] = autocomplete;
    if (autocomplete && typeof autocomplete.setFields === 'function') {
      autocomplete.setFields(CITY_AUTOCOMPLETE_FIELDS);
    }
  };

  const handleRoutePlaceChanged = (field) => {
    const autocomplete = autocompleteRefs.current[field];
    if (!autocomplete || typeof autocomplete.getPlace !== 'function') {
      return;
    }

    applyRoutePlace(field, autocomplete.getPlace());
  };

  const geocodeCity = async (cityName) => {
    const trimmedCityName = String(cityName || '').trim();
    if (!trimmedCityName || !window.google?.maps?.Geocoder) {
      return null;
    }

    const cacheKey = trimmedCityName.toLowerCase();
    const cachedCity = cityGeocodeCacheRef.current.get(cacheKey);
    if (cachedCity) {
      return cachedCity;
    }

    const geocoder = new window.google.maps.Geocoder();

    return new Promise((resolve) => {
      geocoder.geocode(
        {
          address: trimmedCityName,
          componentRestrictions: { country: 'IN' },
        },
        (results, status) => {
          if (status !== 'OK' || !Array.isArray(results) || !results[0]) {
            resolve(null);
            return;
          }

          const bestMatch = results.find((item) =>
            Array.isArray(item?.types) &&
            item.types.some((type) =>
              ['locality', 'administrative_area_level_3', 'administrative_area_level_2'].includes(type),
            ),
          ) || results[0];

          const resolvedCity = {
            city: getCityLabelFromPlace(bestMatch),
            coords: getCoordsFromPlace(bestMatch),
          };
          cityGeocodeCacheRef.current.set(cacheKey, resolvedCity);
          resolve(resolvedCity);
        },
      );
    });
  };

  const ensureRouteCoordinates = async () => {
    const fieldsToResolve = [
      {
        field: 'originCity',
        coordsField: 'originCoords',
        label: 'origin',
      },
      {
        field: 'destinationCity',
        coordsField: 'destinationCoords',
        label: 'destination',
      },
    ];

    let nextDraft = draft;

    for (const item of fieldsToResolve) {
      const cityValue = String(nextDraft.route?.[item.field] || '').trim();
      const coordsValue = toCoords(nextDraft.route?.[item.coordsField]);

      if (!cityValue) {
        continue;
      }

      if (coordsValue) {
        continue;
      }

      if (!canUsePlacesAutocomplete) {
        toast.error(`Google city suggestions are not ready. Select a valid Indian ${item.label} city.`);
        return null;
      }

      const resolved = await geocodeCity(cityValue);
      if (!resolved?.coords) {
        toast.error(`Select a valid Indian ${item.label} city from suggestions.`);
        return null;
      }

      const routeWithCoords = {
        ...nextDraft.route,
        [item.field]: resolved.city || cityValue,
        [item.coordsField]: resolved.coords,
      };

      nextDraft = {
        ...nextDraft,
        route: routeWithCoords,
        returnRoute: nextDraft.returnRouteEnabled
          ? buildMirroredReturnRoute(routeWithCoords)
          : nextDraft.returnRoute,
      };
    }

    if (nextDraft !== draft) {
      setDraft(nextDraft);
    }

    return nextDraft;
  };

  const toggleReturnRoute = () => {
    setDraft((current) => {
      const nextEnabled = !current.returnRouteEnabled;
      return {
        ...current,
        returnRouteEnabled: nextEnabled,
        returnRoute: nextEnabled ? buildMirroredReturnRoute(current.route) : current.returnRoute,
      };
    });
  };

  const toggleAmenity = (amenity) => {
    setDraft((current) => {
      const nextAmenities = current.amenities.includes(amenity)
        ? current.amenities.filter((item) => item !== amenity)
        : [...current.amenities, amenity];

      return { ...current, amenities: nextAmenities };
    });
  };

  const handleImageChange = async (event, field) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const result = await fileToDataUrl(file);
      updateDraft(field, result);
      if (field === 'coverImage' || field === 'image') {
        updateDraft('image', result);
        updateDraft('coverImage', result);
      }
    } catch {
      toast.error('Failed to read selected image');
    } finally {
      event.target.value = '';
    }
  };

  const handleGalleryImagesChange = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    try {
      const results = await Promise.all(files.map((file) => fileToDataUrl(file)));
      setDraft((current) => ({
        ...current,
        galleryImages: [
          ...(Array.isArray(current.galleryImages) ? current.galleryImages : []),
          ...results.filter(Boolean),
        ],
      }));
    } catch {
      toast.error('Failed to read one or more gallery images');
    } finally {
      event.target.value = '';
    }
  };

  const removeGalleryImage = (indexToRemove) => {
    setDraft((current) => ({
      ...current,
      galleryImages: (Array.isArray(current.galleryImages) ? current.galleryImages : []).filter(
        (_, index) => index !== indexToRemove,
      ),
    }));
  };

  const switchBlueprintTemplate = (templateKey) => {
    setDraft((current) => ({
      ...current,
      blueprint: createBlueprintFromTemplate(templateKey),
    }));
  };

  const updateBlueprintLayoutConfig = (deckKey, field, value) => {
    setDraft((current) => {
      const currentLayoutConfig = current.blueprint?.layoutConfig || {};
      const currentDeckConfig = currentLayoutConfig?.[deckKey] || {};
      const nextDeckConfig = {
        ...currentDeckConfig,
        [field]:
          field === 'enabled'
            ? Boolean(value)
            : field === 'seatType'
              ? value
              : Math.max(0, Number(value || 0)),
      };

      if (field === 'enabled' && !value) {
        nextDeckConfig.rows = 0;
        nextDeckConfig.leftSeats = 0;
        nextDeckConfig.rightSeats = 0;
      }

      if (field === 'enabled' && value && Number(currentDeckConfig.rows || 0) <= 0) {
        nextDeckConfig.rows = deckKey === 'upper' ? 4 : 8;
        nextDeckConfig.leftSeats = Number(currentDeckConfig.leftSeats || 0) || 2;
        nextDeckConfig.rightSeats = Number(currentDeckConfig.rightSeats || 0) || 1;
      }

      const nextLayoutConfig = {
        ...currentLayoutConfig,
        [deckKey]: nextDeckConfig,
      };

      return {
        ...current,
        blueprint: createBusBlueprint(current.blueprint?.templateKey || 'seater_2_2', nextLayoutConfig),
      };
    });
  };

  const toggleSeatStatus = (seatId) => {
    const nextBlueprint = JSON.parse(JSON.stringify(draft.blueprint));

    ['lowerDeck', 'upperDeck'].forEach((deckKey) => {
      nextBlueprint[deckKey] = nextBlueprint[deckKey].map((row) =>
        row.map((cell) => {
          if (cell?.kind === 'seat' && cell.id === seatId) {
            return {
              ...cell,
              status: cell.status === 'blocked' ? 'available' : 'blocked',
            };
          }
          return cell;
        }),
      );
    });

    setDraft((current) => ({ ...current, blueprint: nextBlueprint }));
  };

  const updateStop = (stopId, field, value) => {
    setDraft((current) => ({
      ...current,
      route: {
        ...current.route,
        stops: current.route.stops.map((stop) => (stop.id === stopId ? { ...stop, [field]: value } : stop)),
      },
      returnRoute: current.returnRouteEnabled
        ? buildMirroredReturnRoute({
            ...current.route,
            stops: current.route.stops.map((stop) => (stop.id === stopId ? { ...stop, [field]: value } : stop)),
          })
        : current.returnRoute,
    }));
  };

  const addStop = () => {
    setDraft((current) => {
      const nextStop = blankStop();
      const nextStops = [...current.route.stops, nextStop];
      return {
        ...current,
        route: {
          ...current.route,
          stops: nextStops,
        },
        returnRoute: current.returnRouteEnabled
          ? buildMirroredReturnRoute({
              ...current.route,
              stops: nextStops,
            })
          : current.returnRoute,
      };
    });
  };

  const removeStop = (stopId) => {
    setDraft((current) => ({
      ...current,
      route: {
        ...current.route,
        stops: current.route.stops.filter((stop) => stop.id !== stopId),
      },
      returnRoute: current.returnRouteEnabled
        ? buildMirroredReturnRoute({
            ...current.route,
            stops: current.route.stops.filter((stop) => stop.id !== stopId),
          })
        : current.returnRoute,
    }));
  };

  const updateSchedule = (scheduleId, field, value) => {
    setDraft((current) => ({
      ...current,
      schedules: current.schedules.map((schedule) =>
        schedule.id === scheduleId ? { ...schedule, [field]: value } : schedule,
      ),
    }));
  };

  const toggleScheduleDay = (scheduleId, day) => {
    setDraft((current) => ({
      ...current,
      schedules: current.schedules.map((schedule) => {
        if (schedule.id !== scheduleId) return schedule;
        const activeDays = schedule.activeDays.includes(day)
          ? schedule.activeDays.filter((item) => item !== day)
          : [...schedule.activeDays, day];
        return { ...schedule, activeDays };
      }),
    }));
  };

  const addSchedule = () => {
    setDraft((current) => ({
      ...current,
      schedules: [...current.schedules, blankSchedule()],
    }));
  };

  const removeSchedule = (scheduleId) => {
    setDraft((current) => ({
      ...current,
      schedules: current.schedules.filter((schedule) => schedule.id !== scheduleId),
    }));
  };

  const updateCancellationRule = (ruleId, field, value) => {
    setDraft((current) => ({
      ...current,
      cancellationRules: (current.cancellationRules || []).map((rule) =>
        rule.id === ruleId ? { ...rule, [field]: value } : rule,
      ),
    }));
  };

  const addCancellationRule = () => {
    setDraft((current) => ({
      ...current,
      cancellationRules: [...(current.cancellationRules || []), blankCancellationRule()],
    }));
  };

  const removeCancellationRule = (ruleId) => {
    setDraft((current) => ({
      ...current,
      cancellationRules: (current.cancellationRules || []).filter((rule) => rule.id !== ruleId),
    }));
  };

  const handleCreateNew = () => {
    const nextDraft = buildFreshDraft();
    setDraft(nextDraft);
    setSelectedBusId(nextDraft.id);
    setDetailBusId(null);
    navigate(`${basePath}/create`);
  };

  const handleDuplicate = () => {
    if (!catalog.some((item) => item.id === draft.id)) {
      toast.error('You can only duplicate a saved bus.');
      return;
    }

    const copy = {
      ...JSON.parse(JSON.stringify(draft)),
      id: `bus-copy-${Date.now()}`,
      busName: `${draft.busName || 'New Bus'} Copy`,
      serviceNumber: '',
      registrationNumber: '',
      driverName: '',
      driverPhone: '',
      busDriverId: '',
      status: ['draft', 'active', 'paused'].includes(defaultStatus) ? defaultStatus : 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setDraft(copy);
    setSelectedBusId(copy.id);
    setDetailBusId(null);
    navigate(`${basePath}/create`);
    toast.success('Bus duplicated as a new draft');
  };

  const handleSave = async () => {
    if (!draft.operatorName.trim() || !draft.busName.trim() || !draft.route.originCity.trim() || !draft.route.destinationCity.trim()) {
      toast.error('Add operator, bus name, origin and destination first.');
      return;
    }

    setIsSaving(true);
    try {
      const draftWithCoords = await ensureRouteCoordinates();
      if (!draftWithCoords) {
        return;
      }

      const nextBus = await upsertBus({
        ...draftWithCoords,
        status: draftWithCoords.status || 'draft',
        capacity: totalSeats,
      });

      setCatalog((current) => {
        const existingIndex = current.findIndex((item) => item.id === nextBus.id);

        if (existingIndex >= 0) {
          const nextCatalog = [...current];
          nextCatalog[existingIndex] = nextBus;
          return nextCatalog;
        }

        return [nextBus, ...current];
      });
      setSelectedBusId(nextBus.id);
      setDraft(nextBus);
      navigate({
        pathname: `${basePath}/edit/${nextBus.id}`,
        search: currentFormStepIndex > 0 ? `?step=${currentFormStepIndex + 1}` : '',
      });
      toast.success('Bus service saved');
    } catch (error) {
      toast.error(error?.message || 'Failed to save bus service');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!catalog.some((item) => item.id === draft.id)) {
      const nextDraft = buildFreshDraft();
      setSelectedBusId(nextDraft.id);
      setDraft(nextDraft);
      navigate(basePath);
      toast.success('Unsaved draft cleared');
      return;
    }

    if (!window.confirm('Are you sure you want to delete this bus?')) {
      return;
    }

    setIsSaving(true);
    try {
      await deleteBus(draft.id);
      const nextCatalog = catalog.filter((bus) => bus.id !== draft.id);
      setCatalog(nextCatalog);
      const fallback = nextCatalog[0] || buildFreshDraft();
      setSelectedBusId(fallback.id);
      setDraft(fallback);
      setDetailBusId(null);
      navigate(basePath);
      toast.success('Bus service removed');
    } catch (error) {
      toast.error(error?.message || 'Failed to remove bus service');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      <section className="rounded-3xl bg-amber-50 border border-amber-100 p-4 text-slate-900 shadow-xl shadow-amber-100/50 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-amber-200/50 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-amber-900">
              <Bus size={14} />
              {badgeLabel}
            </div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
            <p className="mt-4 max-w-2xl text-sm font-medium leading-relaxed text-slate-600">
              {description}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleCreateNew}
              className="inline-flex items-center gap-2 rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm font-black text-slate-900 shadow-sm transition hover:-translate-y-0.5 hover:bg-amber-100/50"
            >
              <Plus size={16} />
              New Bus
            </button>
            <button
              type="button"
              onClick={handleDuplicate}
              className="inline-flex items-center gap-2 rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm font-black text-slate-900 transition hover:bg-amber-100/50"
            >
              <CopyPlus size={16} />
              Duplicate
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl bg-white/60 p-4 backdrop-blur-sm border border-amber-200/50">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Capacity</p>
            <div className="mt-3 flex items-end justify-between">
              <p className="text-3xl font-bold">{totalSeats}</p>
              <Armchair className="text-amber-500" size={24} />
            </div>
          </div>
          <div className="rounded-2xl bg-white/60 p-4 backdrop-blur-sm border border-amber-200/50">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Stops Configured</p>
            <div className="mt-3 flex items-end justify-between">
              <p className="text-3xl font-bold">{totalStops}</p>
              <Route className="text-amber-500" size={24} />
            </div>
          </div>
          <div className="rounded-2xl bg-white/60 p-4 backdrop-blur-sm border border-amber-200/50">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Schedules</p>
            <div className="mt-3 flex items-end justify-between">
              <p className="text-3xl font-bold">{totalSchedules}</p>
              <CalendarDays className="text-amber-500" size={24} />
            </div>
          </div>
        </div>
      </section>

      {currentMode === 'list' ? (
      <section className="rounded-[32px] border border-slate-100 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-xl font-black tracking-tight text-slate-900">Bus Services</h2>
            <p className="mt-1 text-sm font-medium text-slate-500">Manage coaches, routes, assigned drivers, pricing and schedules.</p>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="flex items-center gap-3 text-sm font-semibold text-slate-400">
              <span>show</span>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-900">
                {filteredCatalog.length}
              </div>
              <span>entries</span>
            </div>

            <div className="relative">
              <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm font-bold text-slate-800 shadow-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-400/5 md:w-80"
                placeholder="Search buses"
                value={catalogSearch}
                onChange={(event) => setCatalogSearch(event.target.value)}
              />
            </div>

            <button
              type="button"
              onClick={handleCreateNew}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-50 border border-amber-200 px-5 py-3 text-sm font-black text-slate-900 shadow-sm transition hover:-translate-y-0.5 hover:bg-amber-100/50"
            >
              <Plus size={16} />
              Add Bus Service
            </button>
          </div>
        </div>

        {pendingBusDrivers.length > 0 ? (
          <div className="mt-6 rounded-[28px] border border-amber-200 bg-amber-50/40 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-600">Pending Bus Driver Requests</p>
                <h3 className="mt-1 text-lg font-black text-slate-900">{pendingBusDrivers.length} waiting for approval</h3>
              </div>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {pendingBusDrivers.map((item) => (
                <div key={item.id || item._id} className="rounded-[22px] border border-white bg-white p-4 shadow-sm">
                  <p className="text-sm font-black text-slate-900">{item.name || 'Bus Driver'}</p>
                  <p className="mt-1 text-xs font-bold text-slate-500">{item.phone || 'No phone'}{item.email ? ` - ${item.email}` : ''}</p>
                  <p className="mt-2 text-xs text-slate-500">{item.operatorName || 'Operator'} - {item.busName || 'Bus'}{item.serviceNumber ? ` - ${item.serviceNumber}` : ''}</p>
                  <p className="mt-1 text-xs text-slate-500">{item.originCity || 'Origin'} to {item.destinationCity || 'Destination'}</p>
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => handleApprovePendingBusDriver(item.id || item._id)} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white">Approve</button>
                    <button onClick={() => handleRejectPendingBusDriver(item.id || item._id)} className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-black text-rose-600">Reject</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-5 space-y-2 md:hidden">
          {isLoadingCatalog ? (
            <div className="rounded-[24px] border border-slate-100 bg-white px-5 py-8 text-center text-sm font-bold text-slate-400">
              Loading bus services...
            </div>
          ) : filteredCatalog.length === 0 ? (
            <div className="rounded-[24px] border border-slate-100 bg-white px-5 py-8 text-center text-sm font-bold text-slate-400">
              {emptyLabel}
            </div>
          ) : (
            filteredCatalog.map((bus) => (
              <div key={`mobile-catalog-${bus.id}`} className="rounded-[24px] border border-slate-100 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-black text-slate-900">{bus.busName || 'Untitled Bus'}</p>
                    <p className="mt-1 truncate text-sm font-semibold text-slate-500">{bus.operatorName || 'Operator not set'}</p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wider ${statusTone[bus.status] || statusTone.draft}`}>
                    {bus.status || 'draft'}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-slate-50 px-3 py-2.5">
                    <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Route</p>
                    <p className="mt-1 text-xs font-bold text-slate-900">{bus.route?.originCity || 'Origin'} to {bus.route?.destinationCity || 'Destination'}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 px-3 py-2.5">
                    <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Fare</p>
                    <p className="mt-1 text-xs font-bold text-slate-900">Rs {bus.seatPrice || 0}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 px-3 py-2.5">
                    <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Commission / Tax</p>
                    <p className="mt-1 text-xs font-bold text-slate-900">
                      {bus.adminCommissionPercentage || 0}% / {bus.serviceTaxPercentage || 0}%
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 px-3 py-2.5">
                    <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Driver</p>
                    <p className="mt-1 text-xs font-bold text-slate-900">{bus.driverName || 'Not assigned'}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 px-3 py-2.5">
                    <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Seats</p>
                    <p className="mt-1 text-xs font-bold text-slate-900">{countTotalSeats(bus.blueprint)}</p>
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => openEditView(bus.id)}
                    className="flex-1 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => openDetailView(bus.id)}
                    className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700"
                  >
                    View
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-4 hidden overflow-hidden rounded-[28px] border border-slate-100 md:block">
          <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,1fr)_120px_120px_170px] gap-4 bg-slate-100 px-4 py-3 text-sm font-black text-slate-700">
            <p>Name</p>
            <p>Driver</p>
            <p>Route</p>
            <p>Fare</p>
            <p>Status</p>
            <p>Action</p>
          </div>

          {isLoadingCatalog ? (
            <div className="bg-white px-6 py-10 text-center text-sm font-bold text-slate-400">Loading bus services...</div>
          ) : filteredCatalog.length === 0 ? (
            <div className="bg-white px-6 py-10 text-center text-sm font-bold text-slate-400">{emptyLabel}</div>
          ) : (
            <div className="divide-y divide-slate-100 bg-white">
              {filteredCatalog.map((bus) => {
                const active = selectedBusId === bus.id;
                return (
                  <div
                    key={`catalog-${bus.id}`}
                    className={`grid grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,1fr)_120px_120px_170px] gap-4 px-4 py-4 transition ${
                      active ? 'bg-indigo-50/70' : 'hover:bg-slate-50/80'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-lg font-black text-slate-900">{bus.busName || 'Untitled Bus'}</p>
                      <p className="mt-1 truncate text-sm font-semibold text-slate-500">{bus.operatorName || 'Operator not set'}</p>
                      <p className="mt-0.5 truncate text-xs font-bold uppercase tracking-wider text-slate-400">
                        {bus.serviceNumber || 'No service number'} | {bus.registrationNumber || 'No registration'}
                      </p>
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-base font-black text-slate-900">{bus.driverName || 'Driver not assigned'}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-500">{bus.driverPhone || 'No phone added'}</p>
                      <p className="mt-1 text-xs font-bold uppercase tracking-wider text-slate-400">{countTotalSeats(bus.blueprint)} seats</p>
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-base font-black text-slate-900">
                        {bus.route?.originCity || 'Origin'} to {bus.route?.destinationCity || 'Destination'}
                      </p>
                      <p className="mt-1 truncate text-sm font-semibold text-slate-500">{bus.route?.routeName || 'Route not set'}</p>
                    </div>

                    <div>
                      <p className="text-base font-black text-slate-900">Rs {bus.seatPrice || 0}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-500">{bus.fareCurrency || 'INR'}</p>
                      <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        {bus.adminCommissionPercentage || 0}% commission
                      </p>
                      <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        {bus.serviceTaxPercentage || 0}% tax
                      </p>
                    </div>

                    <div className="flex items-center">
                      <span className={`rounded-full border px-4 py-2 text-xs font-black uppercase tracking-wider ${statusTone[bus.status] || statusTone.draft}`}>
                        {bus.status || 'draft'}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => openEditView(bus.id)}
                        className={`inline-flex h-11 items-center justify-center rounded-2xl px-4 text-sm font-black transition ${
                          active
                            ? 'bg-slate-900 text-white'
                            : 'border border-amber-200 bg-amber-50 text-amber-600 hover:bg-amber-100'
                        }`}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => openDetailView(bus.id)}
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                      >
                        <Eye size={16} />
                        View Details
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
      ) : null}

      {currentMode === 'details' && detailBus ? (
        <section className="space-y-5 rounded-[32px] border border-slate-100 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-400">Bus Details</p>
              <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-900">{detailBus.busName || 'Untitled Bus'}</h2>
              <p className="mt-2 text-sm font-semibold text-slate-500">
                {detailBus.operatorName || 'Operator'} | {detailBus.serviceNumber || 'No service number'} | {detailBus.registrationNumber || 'No registration'}
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={openListView}
                className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50"
              >
                Back To List
              </button>
              <button
                type="button"
                onClick={() => openEditView(detailBus.id)}
                className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-black text-white shadow-lg transition hover:-translate-y-0.5"
              >
                Edit Bus
              </button>
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <div className="space-y-5">
              <div className="rounded-[28px] border border-slate-200 bg-slate-50/70 p-5">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Route Overview</p>
                <h3 className="mt-3 text-xl font-black text-slate-900">
                  {detailBus.route?.originCity || 'Origin'} to {detailBus.route?.destinationCity || 'Destination'}
                </h3>
                <p className="mt-1 text-sm font-semibold text-slate-500">{detailBus.route?.routeName || 'Route name not configured'}</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl bg-white px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Distance</p>
                    <p className="mt-1 text-sm font-black text-slate-900">{detailBus.route?.distanceKm || 'N/A'}</p>
                  </div>
                  <div className="rounded-2xl bg-white px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Duration</p>
                    <p className="mt-1 text-sm font-black text-slate-900">{detailBus.route?.durationHours || 'N/A'}</p>
                  </div>
                  <div className="rounded-2xl bg-white px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Stops</p>
                    <p className="mt-1 text-sm font-black text-slate-900">{detailBus.route?.stops?.length || 0}</p>
                  </div>
                </div>
                <div className="mt-5 space-y-3">
                  {(detailBus.route?.stops || []).map((stop, index) => (
                    <div key={stop.id || `${detailBus.id}-stop-${index}`} className="rounded-2xl bg-white px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-black text-slate-900">{stop.city || 'City not set'}</p>
                          <p className="mt-1 text-xs font-semibold text-slate-500">{stop.pointName || 'Point not set'}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{stop.stopType || 'stop'}</p>
                          <p className="mt-1 text-xs font-semibold text-slate-500">{stop.arrivalTime || '--:--'} | {stop.departureTime || '--:--'}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <div className="rounded-[28px] border border-slate-200 bg-white p-5">
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Policies</p>
                  <div className="mt-4 space-y-4">
                    <div>
                      <p className="text-xs font-black uppercase tracking-wider text-slate-500">Boarding</p>
                      <p className="mt-1 text-sm font-semibold text-slate-700">{detailBus.boardingPolicy || 'Not set'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase tracking-wider text-slate-500">Cancellation</p>
                      <p className="mt-1 text-sm font-semibold text-slate-700">{detailBus.cancellationPolicy || 'Not set'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase tracking-wider text-slate-500">Luggage</p>
                      <p className="mt-1 text-sm font-semibold text-slate-700">{detailBus.luggagePolicy || 'Not set'}</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-[28px] border border-slate-200 bg-white p-5">
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Amenities</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {(detailBus.amenities || []).length > 0 ? (
                      detailBus.amenities.map((amenity) => (
                        <span key={amenity} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-black text-slate-700">
                          {amenity}
                        </span>
                      ))
                    ) : (
                      <p className="text-sm font-semibold text-slate-500">No amenities configured.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-5">
              <div className="rounded-[28px] border border-slate-200 bg-slate-900 p-5 text-white">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Coach Summary</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <div className="rounded-2xl bg-white/10 px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Coach Type</p>
                    <p className="mt-1 text-sm font-black">{detailBus.coachType || 'N/A'}</p>
                  </div>
                  <div className="rounded-2xl bg-white/10 px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Category</p>
                    <p className="mt-1 text-sm font-black">{detailBus.busCategory || 'N/A'}</p>
                  </div>
                  <div className="rounded-2xl bg-white/10 px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Seat Capacity</p>
                    <p className="mt-1 text-sm font-black">{countTotalSeats(detailBus.blueprint)}</p>
                  </div>
                  <div className="rounded-2xl bg-white/10 px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Fare</p>
                    <p className="mt-1 text-sm font-black">Rs {detailBus.seatPrice || 0} {detailBus.fareCurrency || 'INR'}</p>
                  </div>
                  <div className="rounded-2xl bg-white/10 px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Commission</p>
                    <p className="mt-1 text-sm font-black">{detailBus.adminCommissionPercentage || 0}%</p>
                  </div>
                  <div className="rounded-2xl bg-white/10 px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Service Tax</p>
                    <p className="mt-1 text-sm font-black">{detailBus.serviceTaxPercentage || 0}%</p>
                  </div>
                </div>
              </div>

              <div className="rounded-[28px] border border-slate-200 bg-white p-5">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Driver Assignment</p>
                <div className="mt-4 space-y-3">
                  <div className="rounded-2xl bg-slate-50 px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Driver Name</p>
                    <p className="mt-1 text-sm font-black text-slate-900">{detailBus.driverName || 'Not assigned'}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Driver Phone</p>
                    <p className="mt-1 text-sm font-black text-slate-900">{detailBus.driverPhone || 'Not assigned'}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-[28px] border border-slate-200 bg-white p-5">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Schedules</p>
                <div className="mt-4 space-y-3">
                  {(detailBus.schedules || []).map((schedule, index) => (
                    <div key={schedule.id || `${detailBus.id}-schedule-${index}`} className="rounded-2xl bg-slate-50 px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-black text-slate-900">{schedule.label || `Schedule ${index + 1}`}</p>
                          <p className="mt-1 text-xs font-semibold text-slate-500">{schedule.departureTime || '--:--'} to {schedule.arrivalTime || '--:--'}</p>
                        </div>
                        <span className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-wider ${statusTone[schedule.status] || statusTone.draft}`}>
                          {schedule.status || 'draft'}
                        </span>
                      </div>
                      <p className="mt-3 text-[11px] font-semibold text-slate-500">{(schedule.activeDays || []).join(', ') || 'No active days'}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[28px] border border-slate-200 bg-white p-5">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Cancellation Slabs</p>
                <div className="mt-4 space-y-3">
                  {(detailBus.cancellationRules || []).length > 0 ? (
                    detailBus.cancellationRules.map((rule, index) => (
                      <div key={rule.id || `${detailBus.id}-cancel-${index}`} className="rounded-2xl bg-slate-50 px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-black text-slate-900">{rule.label || `Slab ${index + 1}`}</p>
                            <p className="mt-1 text-xs font-semibold text-slate-500">{rule.hoursBeforeDeparture ?? 0} hours before departure</p>
                          </div>
                          <p className="text-xs font-black uppercase tracking-wider text-slate-500">
                            {rule.refundType === 'percentage'
                              ? `${rule.refundValue ?? 0}% refund`
                              : rule.refundType === 'fixed'
                                ? `Rs ${rule.refundValue ?? 0} refund`
                                : 'No refund'}
                          </p>
                        </div>
                        <p className="mt-3 text-[11px] font-semibold text-slate-500">{rule.notes || 'No extra notes.'}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm font-semibold text-slate-500">No hourly cancellation slabs configured.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {currentMode === 'edit' || currentMode === 'create' ? (
      <section className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)] xl:gap-6">
        <div className="space-y-4">
          <div className="hidden rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Bus Catalog</h2>
                <p className="text-xs font-medium text-slate-500">Choose a coach to edit or publish.</p>
              </div>
              <div className="rounded-full bg-slate-50 px-3 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                {catalog.length} Active
              </div>
            </div>

            <div className="space-y-3">
              {isLoadingCatalog && (
                <div className="rounded-2xl border border-dashed border-slate-100 bg-slate-50 px-4 py-8 text-center text-sm font-bold text-slate-400">
                  Loading catalog...
                </div>
              )}

              {!isLoadingCatalog && catalog.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-100 bg-slate-50 px-4 py-8 text-center text-sm font-bold text-slate-400">
                  No buses found.
                </div>
              )}

              {!isLoadingCatalog && catalog.length > 0 && (
                <div className="overflow-hidden rounded-3xl border border-slate-100">
                  <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] gap-3 bg-slate-50 px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                    <p>Bus</p>
                    <p>Route</p>
                    <p>Actions</p>
                  </div>

                  <div className="divide-y divide-slate-100">
                    {catalog.map((bus) => {
                      const active = selectedBusId === bus.id;
                      return (
                        <div
                          key={`row-${bus.id}`}
                          className={`grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] gap-3 px-4 py-4 transition ${
                            active ? 'bg-slate-900 text-white' : 'bg-white hover:bg-slate-50/80'
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="truncate text-[10px] font-black uppercase tracking-wider text-slate-400">
                              {bus.operatorName || 'Operator'}
                            </p>
                            <p className={`mt-1 truncate text-sm font-black ${active ? 'text-white' : 'text-slate-900'}`}>
                              {bus.busName || 'Untitled Bus'}
                            </p>
                            <p className={`mt-1 truncate text-[11px] font-semibold ${active ? 'text-slate-300' : 'text-slate-500'}`}>
                              {bus.serviceNumber || 'No service number'} | {bus.registrationNumber || 'No reg no.'}
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <span className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-wider ${
                                active
                                  ? 'border-white/20 bg-white/10 text-white'
                                  : statusTone[bus.status] || statusTone.draft
                              }`}>
                                {bus.status || 'draft'}
                              </span>
                              <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wider ${
                                active ? 'bg-white/10 text-slate-200' : 'bg-slate-100 text-slate-600'
                              }`}>
                                {countTotalSeats(bus.blueprint)} seats
                              </span>
                              <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wider ${
                                active ? 'bg-white/10 text-slate-200' : 'bg-slate-100 text-slate-600'
                              }`}>
                                Rs {bus.seatPrice || 0}
                              </span>
                            </div>
                          </div>

                          <div className="min-w-0">
                            <p className={`truncate text-sm font-bold ${active ? 'text-white' : 'text-slate-900'}`}>
                              {bus.route?.originCity || 'Origin'} to {bus.route?.destinationCity || 'Destination'}
                            </p>
                            <p className={`mt-1 truncate text-[11px] font-semibold ${active ? 'text-slate-300' : 'text-slate-500'}`}>
                              {bus.route?.routeName || 'Route name not set'}
                            </p>
                            <p className={`mt-3 text-[11px] font-semibold ${active ? 'text-slate-300' : 'text-slate-500'}`}>
                              {bus.route?.stops?.length || 0} stops configured
                            </p>
                          </div>

                          <div className="flex flex-col items-end gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedBusId(bus.id)}
                              className={`min-w-[92px] rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-wider transition ${
                                active
                                  ? 'bg-white text-slate-900'
                                  : 'bg-slate-900 text-white hover:-translate-y-0.5'
                              }`}
                            >
                              Edit Bus
                            </button>
                            <button
                              type="button"
                              onClick={() => setDetailBusId(bus.id)}
                              className={`inline-flex min-w-[92px] items-center justify-center gap-1 rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-wider transition ${
                                active
                                  ? 'border-white/20 bg-white/10 text-white'
                                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                              }`}
                            >
                              <Eye size={12} />
                              View Details
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {false && catalog.map((bus) => (
                <button
                  key={bus.id}
                  type="button"
                  onClick={() => setSelectedBusId(bus.id)}
                  className={`w-full rounded-2xl border p-4 text-left transition-all ${
                    selectedBusId === bus.id
                      ? 'border-slate-900 bg-slate-900 text-white shadow-lg'
                      : 'border-slate-100 bg-white hover:border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={`text-[9px] font-bold uppercase tracking-wider ${selectedBusId === bus.id ? 'text-slate-400' : 'text-slate-400'}`}>
                        {bus.operatorName}
                      </p>
                      <h3 className={`mt-1 text-sm font-bold truncate ${selectedBusId === bus.id ? 'text-white' : 'text-slate-900'}`}>
                        {bus.busName}
                      </h3>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                      selectedBusId === bus.id 
                        ? 'border-white/20 bg-white/10 text-white' 
                        : statusTone[bus.status] || statusTone.draft
                    }`}>
                      {bus.status}
                    </span>
                  </div>
                  
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <div className={`rounded-xl px-2 py-2 ${selectedBusId === bus.id ? 'bg-white/10' : 'bg-slate-50'}`}>
                      <p className={`text-[8px] font-bold uppercase tracking-wider ${selectedBusId === bus.id ? 'text-slate-400' : 'text-slate-400'}`}>Seats</p>
                      <p className="mt-0.5 text-xs font-bold">{countTotalSeats(bus.blueprint)}</p>
                    </div>
                    <div className={`rounded-xl px-2 py-2 ${selectedBusId === bus.id ? 'bg-white/10' : 'bg-slate-50'}`}>
                      <p className={`text-[8px] font-bold uppercase tracking-wider ${selectedBusId === bus.id ? 'text-slate-400' : 'text-slate-400'}`}>Stops</p>
                      <p className="mt-0.5 text-xs font-bold">{bus.route.stops.length}</p>
                    </div>
                    <div className={`rounded-xl px-2 py-2 ${selectedBusId === bus.id ? 'bg-white/10' : 'bg-slate-50'}`}>
                      <p className={`text-[8px] font-bold uppercase tracking-wider ${selectedBusId === bus.id ? 'text-slate-400' : 'text-slate-400'}`}>Fare</p>
                      <p className="mt-0.5 text-xs font-bold">₹{bus.seatPrice}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Creation Flow</h3>
                <p className="mt-1 text-xs font-medium text-slate-500">Move one block at a time, like the signup journey.</p>
              </div>
              <div className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                {currentFormStep.shortLabel}
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {CREATE_FLOW_STEPS.map((step, index) => {
                const isActive = index === currentFormStepIndex;
                const isComplete = stepCompletionState[index] && index < currentFormStepIndex;
                return (
                  <button
                    key={step.key}
                    type="button"
                    onClick={() => openFormStep(index)}
                    className={`w-full rounded-[22px] border p-4 text-left transition ${
                      isActive
                        ? 'border-amber-200 bg-amber-50 text-slate-900 shadow-md shadow-amber-100'
                        : 'border-slate-200 bg-slate-50 text-slate-900 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className={`text-[10px] font-black uppercase tracking-[0.18em] ${isActive ? 'text-amber-600' : 'text-slate-400'}`}>
                          {step.shortLabel}
                        </p>
                        <p className="mt-1 text-sm font-black">{step.title}</p>
                        <p className={`mt-1 text-xs font-semibold ${isActive ? 'text-amber-900/70' : 'text-slate-500'}`}>
                          {step.description}
                        </p>
                      </div>
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full border ${
                        isActive
                          ? 'border-amber-300 bg-amber-200 text-amber-800'
                          : isComplete
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
                            : 'border-slate-200 bg-white text-slate-400'
                      }`}>
                        {isComplete ? <CheckCircle2 size={16} /> : <span className="text-[11px] font-black">{index + 1}</span>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {currentFormStepIndex <= 1 ? (
          <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-xl font-bold tracking-tight text-slate-900">
                  {currentFormStepIndex === 0 ? 'Bus Specification' : 'Bus Experience Setup'}
                </h2>
                <p className="mt-1 text-xs font-medium text-slate-500">
                  {currentFormStepIndex === 0
                    ? 'Define the essential operator, driver, and pricing details first.'
                    : 'Add imagery, amenities, and passenger-facing policies without crowding the rest of the form.'}
                </p>
              </div>

              {currentFormStepIndex === 0 ? (
                <div className="flex flex-wrap gap-2">
                  {['draft', 'active', 'paused'].map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => updateDraft('status', status)}
                      className={`rounded-full border px-4 py-2 text-[9px] font-bold uppercase tracking-wider transition-all ${
                        draft.status === status ? statusTone[status] : 'border-slate-100 bg-white text-slate-400 hover:border-slate-200'
                      }`}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900">
                  {(draft.galleryImages || []).length} gallery images
                </div>
              )}
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              {currentFormStepIndex === 0 ? (
              <>
              <div>
                <label className={labelClassName}>
                  {typeof api.getDrivers === 'function' ? 'Assign Fleet Driver' : 'Bus Driver Name'}
                </label>
                {typeof api.getDrivers === 'function' ? (
                  <div className="space-y-3">
                    <input
                      className={fieldClassName}
                      value={driverSearch}
                      onChange={(event) => setDriverSearch(event.target.value)}
                      placeholder="Search owner drivers by name or phone"
                    />
                    <div className="max-h-52 space-y-2 overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-2">
                      {filteredOwnerDrivers.length === 0 ? (
                        <p className="px-3 py-4 text-xs font-semibold text-slate-500">No matching fleet drivers found.</p>
                      ) : (
                        filteredOwnerDrivers.map((driver) => {
                          const isActive = String(draft.ownerDriverId || '') === String(driver.id);
                          return (
                            <button
                              key={driver.id}
                              type="button"
                              onClick={() =>
                                setDraft((current) => ({
                                  ...current,
                                  ownerDriverId: driver.id,
                                  driverName: driver.name || '',
                                  driverPhone: driver.phone || '',
                                }))
                              }
                              className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                                isActive
                                  ? 'border-slate-900 bg-slate-900 text-white'
                                  : 'border-slate-200 bg-white text-slate-900 hover:border-slate-300'
                              }`}
                            >
                              <p className="text-sm font-black">{driver.name || 'Driver'}</p>
                              <p className={`mt-1 text-xs font-semibold ${isActive ? 'text-slate-300' : 'text-slate-500'}`}>
                                {driver.phone || 'No phone'}{driver.city ? ` | ${driver.city}` : ''}
                              </p>
                            </button>
                          );
                        })
                      )}
                    </div>
                    {selectedOwnerDriver ? (
                      <button
                        type="button"
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            ownerDriverId: '',
                            driverName: '',
                            driverPhone: '',
                          }))
                        }
                        className="text-xs font-bold text-rose-600"
                      >
                        Clear assigned driver
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <input className={fieldClassName} value={draft.driverName || ''} onChange={(event) => updateDraft('driverName', event.target.value)} placeholder="Enter Driver Name" />
                )}
              </div>
              <div>
                <label className={labelClassName}>{typeof api.getDrivers === 'function' ? 'Assigned Driver Phone' : 'Bus Driver Phone'}</label>
                <input
                  className={fieldClassName}
                  value={draft.driverPhone || ''}
                  onChange={(event) => updateDraft('driverPhone', event.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="Enter Phone Number"
                  readOnly={typeof api.getDrivers === 'function'}
                />
              </div>
              <div>
                <label className={labelClassName}>Operator Name</label>
                <input className={fieldClassName} value={draft.operatorName} onChange={(event) => updateDraft('operatorName', event.target.value)} placeholder="Enter Operator Name" />
              </div>
              <div>
                <label className={labelClassName}>Bus Name</label>
                <input className={fieldClassName} value={draft.busName} onChange={(event) => updateDraft('busName', event.target.value)} placeholder="Enter Bus Name" />
              </div>
              <div>
                <label className={labelClassName}>Service Number</label>
                <input className={fieldClassName} value={draft.serviceNumber} onChange={(event) => updateDraft('serviceNumber', event.target.value)} placeholder="Enter Service Number" />
              </div>
              <div>
                <label className={labelClassName}>Registration Number</label>
                <input className={fieldClassName} value={draft.registrationNumber} onChange={(event) => updateDraft('registrationNumber', event.target.value.toUpperCase())} placeholder="Enter Registration Number" />
              </div>
              <div>
                <label className={labelClassName}>Coach Type</label>
                <div className="space-y-3">
                <select className={fieldClassName} value={coachTypeOptions.includes(draft.coachType) ? draft.coachType : '__custom__'} onChange={(event) => updateDraft('coachType', event.target.value === '__custom__' ? '' : event.target.value)}>
                  {coachTypeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                  <option value="__custom__">Custom Coach Type</option>
                </select>
                {!coachTypeOptions.includes(draft.coachType) || !draft.coachType ? (
                  <input
                    className={fieldClassName}
                    value={draft.coachType}
                    onChange={(event) => updateDraft('coachType', event.target.value)}
                    placeholder="Enter custom coach type"
                  />
                ) : null}
                </div>
              </div>
              <div>
                <label className={labelClassName}>Category</label>
                <select className={fieldClassName} value={draft.busCategory} onChange={(event) => updateDraft('busCategory', event.target.value)}>
                  {['Sleeper', 'Seater', 'Semi Sleeper', 'Electric Coach'].map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClassName}>Seat Price</label>
                <input className={fieldClassName} value={draft.seatPrice} onChange={(event) => updateDraft('seatPrice', event.target.value)} placeholder="1199" />
              </div>
              <div>
                <label className={labelClassName}>Bus Commission %</label>
                <input
                  className={fieldClassName}
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={draft.adminCommissionPercentage}
                  onChange={(event) => updateDraft('adminCommissionPercentage', event.target.value)}
                  placeholder="10"
                />
              </div>
              <div>
                <label className={labelClassName}>Service Tax %</label>
                <input
                  className={fieldClassName}
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={draft.serviceTaxPercentage}
                  onChange={(event) => updateDraft('serviceTaxPercentage', event.target.value)}
                  placeholder="5"
                />
              </div>
              <div>
                <label className={labelClassName}>Currency</label>
                <input className={fieldClassName} value={draft.fareCurrency} onChange={(event) => updateDraft('fareCurrency', event.target.value.toUpperCase())} placeholder="INR" />
              </div>
              </>
              ) : null}
              {currentFormStepIndex === 1 ? (
              <>
              <div className="md:col-span-2">
                <label className={labelClassName}>Different Seat Pricing</label>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {VARIANT_PRICING_FIELDS.map((field) => (
                    <div key={field.key}>
                      <p className="mb-2 text-xs font-bold text-slate-500">{field.label}</p>
                      <input
                        className={fieldClassName}
                        type="number"
                        min="0"
                        value={draft.variantPricing?.[field.key] ?? ''}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            variantPricing: {
                              ...(current.variantPricing || {}),
                              [field.key]: event.target.value,
                            },
                          }))
                        }
                        placeholder="0"
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div className="md:col-span-2">
                <label className={labelClassName}>Bus Main Image</label>
                <div className="rounded-[28px] border border-dashed border-slate-300 p-4">
                  <div className="group relative flex min-h-[240px] items-center justify-center overflow-hidden rounded-[24px] bg-slate-50">
                    {draft.coverImage ? (
                      <>
                        <img src={draft.coverImage} alt={draft.busName || 'Bus cover'} className="h-full w-full object-cover" />
                        <button
                          type="button"
                          onClick={() => {
                            updateDraft('image', '');
                            updateDraft('coverImage', '');
                          }}
                          className="absolute right-3 top-3 rounded-xl bg-white p-2 text-rose-500 shadow-sm transition hover:bg-rose-500 hover:text-white"
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    ) : (
                      <label className="flex cursor-pointer flex-col items-center gap-3 text-center">
                        <input type="file" accept="image/*" className="hidden" onChange={(event) => handleImageChange(event, 'coverImage')} />
                        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-orange-500 shadow-sm">
                          <Upload size={20} />
                        </span>
                        <span className="text-sm font-bold text-slate-700">Upload main bus image</span>
                        <span className="text-xs font-medium text-slate-400">This becomes the primary preview for the bus card and details page.</span>
                      </label>
                    )}
                  </div>
                </div>
              </div>
              <div className="md:col-span-2">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <label className={labelClassName}>Bus Gallery Images</label>
                    <p className="text-xs font-medium text-slate-500">Add extra interior or exterior images for the bus details page.</p>
                  </div>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs font-bold text-slate-900 shadow-sm transition hover:bg-amber-100/50">
                    <ImagePlus size={14} />
                    Add Gallery Images
                    <input type="file" accept="image/*" multiple className="hidden" onChange={handleGalleryImagesChange} />
                  </label>
                </div>

                {(draft.galleryImages || []).length ? (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {draft.galleryImages.map((image, index) => (
                      <div key={`bus-gallery-${index}`} className="rounded-[22px] border border-slate-200 bg-slate-50 p-2">
                        <div className="relative overflow-hidden rounded-[18px]">
                          <img src={image} alt={`${draft.busName || 'Bus'} gallery ${index + 1}`} className="h-32 w-full object-cover" />
                          <button
                            type="button"
                            onClick={() => removeGalleryImage(index)}
                            className="absolute right-2 top-2 rounded-lg bg-white/95 p-1.5 text-rose-500 shadow-sm transition hover:bg-rose-500 hover:text-white"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm font-semibold text-slate-500">
                    No gallery images added yet.
                  </div>
                )}
              </div>
              <div className="md:col-span-2">
                <label className={labelClassName}>Amenities</label>
                <div className="flex flex-wrap gap-2">
                  {AMENITY_OPTIONS.map((amenity) => {
                    const active = draft.amenities.includes(amenity);
                    return (
                      <button
                        key={amenity}
                        type="button"
                        onClick={() => toggleAmenity(amenity)}
                        className={`rounded-full border px-4 py-2 text-[10px] font-bold uppercase tracking-wider transition-all ${
                          active
                            ? 'border-amber-300 bg-amber-100 text-amber-800 shadow-sm'
                            : 'border-slate-100 bg-white text-slate-400 hover:border-slate-200'
                        }`}
                      >
                        {amenity}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="md:col-span-2">
                <label className={labelClassName}>Boarding Policy</label>
                <textarea className={`${fieldClassName} min-h-[92px]`} value={draft.boardingPolicy} onChange={(event) => updateDraft('boardingPolicy', event.target.value)} />
              </div>
              <div>
                <label className={labelClassName}>Cancellation Policy</label>
                <textarea className={`${fieldClassName} min-h-[92px]`} value={draft.cancellationPolicy} onChange={(event) => updateDraft('cancellationPolicy', event.target.value)} />
              </div>
              <div>
                <label className={labelClassName}>Luggage Policy</label>
                <textarea className={`${fieldClassName} min-h-[92px]`} value={draft.luggagePolicy} onChange={(event) => updateDraft('luggagePolicy', event.target.value)} />
              </div>
              <div className="md:col-span-2">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <label className={labelClassName}>Hourly Cancellation Slabs</label>
                    <p className="text-xs font-medium text-slate-500">Set refund slabs by hours before departure, with custom percentage or fixed value.</p>
                  </div>
                  <button
                    type="button"
                    onClick={addCancellationRule}
                    className="inline-flex items-center gap-2 rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs font-bold text-slate-900 shadow-sm transition hover:bg-amber-100/50"
                  >
                    <Plus size={14} />
                    Add Slab
                  </button>
                </div>

                <div className="space-y-3">
                  {(draft.cancellationRules || []).map((rule, index) => (
                    <div key={rule.id} className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-4">
                      <div className="mb-4 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-black text-slate-900">Cancellation Slab {index + 1}</p>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Refund rule before departure</p>
                        </div>
                        {(draft.cancellationRules || []).length > 1 ? (
                          <button
                            type="button"
                            onClick={() => removeCancellationRule(rule.id)}
                            className="rounded-2xl border border-rose-200 bg-white p-2 text-rose-500 transition hover:bg-rose-50"
                          >
                            <Trash2 size={16} />
                          </button>
                        ) : null}
                      </div>

                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <input
                          className={fieldClassName}
                          value={rule.label || ''}
                          onChange={(event) => updateCancellationRule(rule.id, 'label', event.target.value)}
                          placeholder="48h+ before departure"
                        />
                        <input
                          className={fieldClassName}
                          type="number"
                          value={rule.hoursBeforeDeparture ?? 0}
                          onChange={(event) => updateCancellationRule(rule.id, 'hoursBeforeDeparture', event.target.value)}
                          placeholder="Hours before departure"
                        />
                        <select
                          className={fieldClassName}
                          value={rule.refundType || 'percentage'}
                          onChange={(event) => updateCancellationRule(rule.id, 'refundType', event.target.value)}
                        >
                          <option value="percentage">Refund %</option>
                          <option value="fixed">Fixed Refund</option>
                          <option value="none">No Refund</option>
                        </select>
                        <input
                          className={fieldClassName}
                          type="number"
                          value={rule.refundValue ?? 0}
                          onChange={(event) => updateCancellationRule(rule.id, 'refundValue', event.target.value)}
                          placeholder={rule.refundType === 'fixed' ? 'Refund amount' : 'Refund percentage'}
                          disabled={rule.refundType === 'none'}
                        />
                      </div>

                      <textarea
                        className={`${fieldClassName} mt-4 min-h-[84px]`}
                        value={rule.notes || ''}
                        onChange={(event) => updateCancellationRule(rule.id, 'notes', event.target.value)}
                        placeholder="Example: 25% cancellation charge applies in this window."
                      />
                    </div>
                  ))}
                </div>
              </div>
              </>
              ) : null}
            </div>
          </section>
          ) : null}

          {currentFormStepIndex === 2 ? (
          <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-xl font-bold tracking-tight text-slate-900">Seat Blueprint</h2>
                <p className="mt-1 text-xs font-medium text-slate-500">Build a RedBus-style coach map, customize seat counts, and block inventory visually.</p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900">
                {totalSeats} Seats
              </div>
            </div>

            <div className="mb-5 flex flex-wrap gap-3">
            {BUS_BLUEPRINT_TEMPLATES.map((template) => {
              const active = draft.blueprint.templateKey === template.key;
              return (
                <button
                  key={template.key}
                  type="button"
                  onClick={() => switchBlueprintTemplate(template.key)}
                  className={`rounded-2xl border px-4 py-3 text-left transition-all ${
                    active
                      ? 'border-amber-200 bg-amber-50 text-slate-900 shadow-md shadow-amber-100'
                      : 'border-slate-100 bg-white text-slate-500 hover:border-slate-200'
                  }`}
                >
                  <p className="text-sm font-bold">{template.label}</p>
                  <p className={`text-[9px] font-bold uppercase tracking-wider ${active ? 'text-amber-600' : 'text-slate-400'}`}>
                    {template.category}
                  </p>
                  <p className={`mt-1 text-[10px] font-medium ${active ? 'text-amber-900/70' : 'text-slate-400'}`}>
                    {template.description}
                  </p>
                </button>
              );
            })}
            </div>

            <div className="mb-6 grid gap-4 xl:grid-cols-2">
              <BlueprintDeckConfigurator
                title="Lower Deck Setup"
                config={draft.blueprint?.layoutConfig?.lower || { enabled: true, rows: 0, leftSeats: 0, rightSeats: 0, seatType: 'seat' }}
                onChange={(field, value) => updateBlueprintLayoutConfig('lower', field, value)}
              />
              <BlueprintDeckConfigurator
                title="Upper Deck Setup"
                config={draft.blueprint?.layoutConfig?.upper || { enabled: false, rows: 0, leftSeats: 0, rightSeats: 0, seatType: 'seat' }}
                onChange={(field, value) => updateBlueprintLayoutConfig('upper', field, value)}
              />
            </div>

            <div className="grid gap-5 xl:grid-cols-2">
              <SeatDeckPreview title="Lower Deck" deckRows={draft.blueprint.lowerDeck} onToggleSeat={toggleSeatStatus} />
              <SeatDeckPreview title="Upper Deck" deckRows={draft.blueprint.upperDeck} onToggleSeat={toggleSeatStatus} />
            </div>

            <div className="mt-5 flex flex-wrap gap-4 text-xs font-semibold text-slate-500">
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 rounded-xl border border-slate-200 bg-white" />
                Available seat
              </div>
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 rounded-xl border border-rose-200 bg-rose-50" />
                Blocked seat
              </div>
              <div className="flex items-center gap-2">
                <div className="h-4 w-8 rounded-xl border border-sky-200 bg-sky-50" />
                Sleeper berth
              </div>
            </div>
          </section>
          ) : null}

          {currentFormStepIndex === 3 ? (
          <>
          <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-xl font-bold tracking-tight text-slate-900">Route Assignment</h2>
                <p className="mt-1 text-xs font-medium text-slate-500">Manage stops, distance and route timings.</p>
              </div>
              <button
                type="button"
                onClick={addStop}
                className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-md transition-all active:scale-95"
              >
                <Plus size={16} />
                Add Stop
              </button>
            </div>

            <div className="mb-6 rounded-[28px] border border-slate-200 bg-slate-50/70 p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Return Route</p>
                  <h3 className="mt-1 text-base font-black text-slate-900">Auto-create mirrored return path</h3>
                  <p className="mt-1 text-xs font-medium text-slate-500">
                    When enabled, the return path flips origin and destination, reverses stops, and swaps pickup/drop roles automatically.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={toggleReturnRoute}
                  className={`inline-flex items-center gap-3 rounded-full px-4 py-3 text-xs font-black uppercase tracking-[0.18em] transition ${
                    draft.returnRouteEnabled
                      ? 'bg-slate-900 text-white shadow-lg'
                      : 'border border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      draft.returnRouteEnabled ? 'bg-emerald-400' : 'bg-slate-300'
                    }`}
                  />
                  {draft.returnRouteEnabled ? 'Return On' : 'Return Off'}
                </button>
              </div>
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_420px]">
              <div>
                <div className="grid gap-5 md:grid-cols-2">
                  <div>
                    <label className={labelClassName}>Route Name</label>
                    <input className={fieldClassName} value={draft.route.routeName} onChange={(event) => updateRouteField('routeName', event.target.value)} placeholder="Indore to Bhopal Night Corridor" />
                  </div>
                  <div>
                    <label className={labelClassName}>Distance / Duration</label>
                    <div className="grid grid-cols-2 gap-3">
                      <input className={fieldClassName} value={draft.route.distanceKm} onChange={(event) => updateRouteField('distanceKm', event.target.value)} placeholder="195 km" />
                      <input className={fieldClassName} value={draft.route.durationHours} onChange={(event) => updateRouteField('durationHours', event.target.value)} placeholder="4h 45m" />
                    </div>
                  </div>
                  <div>
                    <label className={labelClassName}>Origin City</label>
                    {canUsePlacesAutocomplete ? (
                      <Autocomplete
                        onLoad={(autocomplete) => registerAutocomplete('originCity', autocomplete)}
                        onPlaceChanged={() => handleRoutePlaceChanged('originCity')}
                        options={{
                          componentRestrictions: { country: 'in' },
                          fields: CITY_AUTOCOMPLETE_FIELDS,
                          types: ['(cities)'],
                        }}
                      >
                        <input
                          className={fieldClassName}
                          value={draft.route.originCity}
                          onChange={(event) => updateRouteField('originCity', event.target.value)}
                          placeholder="Search origin city in India"
                        />
                      </Autocomplete>
                    ) : (
                      <input
                        className={fieldClassName}
                        value={draft.route.originCity}
                        onChange={(event) => updateRouteField('originCity', event.target.value)}
                        placeholder="Indore"
                      />
                    )}
                    <p className="mt-2 text-[11px] font-semibold text-slate-500">
                      {draft.route.originCoords
                        ? `Coords: ${draft.route.originCoords.lat.toFixed(5)}, ${draft.route.originCoords.lng.toFixed(5)}`
                        : 'Indian city suggestions only. Select one to store live-tracking coordinates.'}
                    </p>
                  </div>
                  <div>
                    <label className={labelClassName}>Destination City</label>
                    {canUsePlacesAutocomplete ? (
                      <Autocomplete
                        onLoad={(autocomplete) => registerAutocomplete('destinationCity', autocomplete)}
                        onPlaceChanged={() => handleRoutePlaceChanged('destinationCity')}
                        options={{
                          componentRestrictions: { country: 'in' },
                          fields: CITY_AUTOCOMPLETE_FIELDS,
                          types: ['(cities)'],
                        }}
                      >
                        <input
                          className={fieldClassName}
                          value={draft.route.destinationCity}
                          onChange={(event) => updateRouteField('destinationCity', event.target.value)}
                          placeholder="Search destination city in India"
                        />
                      </Autocomplete>
                    ) : (
                      <input
                        className={fieldClassName}
                        value={draft.route.destinationCity}
                        onChange={(event) => updateRouteField('destinationCity', event.target.value)}
                        placeholder="Bhopal"
                      />
                    )}
                    <p className="mt-2 text-[11px] font-semibold text-slate-500">
                      {draft.route.destinationCoords
                        ? `Coords: ${draft.route.destinationCoords.lat.toFixed(5)}, ${draft.route.destinationCoords.lng.toFixed(5)}`
                        : 'Indian city suggestions only. Select one to store live-tracking coordinates.'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-[28px] border border-slate-200 bg-slate-50/80 p-3 shadow-inner">
                <div className="mb-3 flex items-center justify-between px-2 pt-2">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Route Preview</p>
                    <h3 className="mt-1 text-sm font-black text-slate-900">
                      {draft.route.originCity || 'Origin'} to {draft.route.destinationCity || 'Destination'}
                    </h3>
                  </div>
                  <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Polyline
                  </div>
                </div>

                <div className="overflow-hidden rounded-[22px] border border-slate-200 bg-white">
                  <div className="h-[320px] w-full">
                    {canUsePlacesAutocomplete ? (
                      <GoogleMap
                        mapContainerStyle={ROUTE_MAP_CONTAINER_STYLE}
                        center={routeMapCenter}
                        zoom={routePreviewPoints.length > 1 ? 6 : 5}
                        onLoad={(map) => {
                          routeMapRef.current = map;
                        }}
                        options={{
                          disableDefaultUI: true,
                          clickableIcons: false,
                          gestureHandling: 'greedy',
                          streetViewControl: false,
                          mapTypeControl: false,
                          fullscreenControl: false,
                        }}
                      >
                        {toCoords(draft.route.originCoords) ? (
                          <MarkerF position={draft.route.originCoords} label={{ text: 'A', color: '#ffffff', fontWeight: '700' }} />
                        ) : null}
                        {toCoords(draft.route.destinationCoords) ? (
                          <MarkerF position={draft.route.destinationCoords} label={{ text: 'B', color: '#ffffff', fontWeight: '700' }} />
                        ) : null}
                        {routePolylinePath.length >= 2 ? (
                          <Polyline
                            path={routePolylinePath}
                            options={{
                              strokeColor: '#0f172a',
                              strokeOpacity: 0.9,
                              strokeWeight: 4,
                              geodesic: true,
                            }}
                          />
                        ) : null}
                      </GoogleMap>
                    ) : (
                      <div className="flex h-full items-center justify-center px-6 text-center text-sm font-semibold text-slate-500">
                        Add valid Indian origin and destination cities to preview the route on map.
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Start</p>
                    <p className="mt-1 text-sm font-bold text-slate-900">{draft.route.originCity || 'Not set'}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">End</p>
                    <p className="mt-1 text-sm font-bold text-slate-900">{draft.route.destinationCity || 'Not set'}</p>
                  </div>
                </div>
              </div>
            </div>

            {draft.returnRouteEnabled ? (
              <div className="mt-6 rounded-[28px] border border-emerald-100 bg-emerald-50/70 p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600">Generated Return Route</p>
                    <h3 className="mt-1 text-base font-black text-slate-900">
                      {draft.returnRoute.originCity || 'Destination'} to {draft.returnRoute.destinationCity || 'Origin'}
                    </h3>
                    <p className="mt-1 text-xs font-medium text-slate-600">
                      {draft.returnRoute.routeName || 'Return route name will be generated automatically.'}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-emerald-100 bg-white/90 px-4 py-3 text-sm font-bold text-slate-900">
                    {draft.returnRoute.stops.length} return stops
                  </div>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-emerald-100 bg-white/90 p-4">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Return From</p>
                    <p className="mt-2 text-sm font-black text-slate-900">{draft.returnRoute.originCity || 'Not generated yet'}</p>
                  </div>
                  <div className="rounded-2xl border border-emerald-100 bg-white/90 p-4">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Return To</p>
                    <p className="mt-2 text-sm font-black text-slate-900">{draft.returnRoute.destinationCity || 'Not generated yet'}</p>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="mt-6 space-y-4">
              {draft.route.stops.map((stop, index) => (
                <div key={stop.id} className="rounded-[26px] border border-slate-200 bg-slate-50/60 p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-indigo-600 shadow-sm">
                        <MapPin size={16} />
                      </div>
                      <div>
                        <p className="text-sm font-black text-slate-900">Stop {index + 1}</p>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Pickup / drop configuration</p>
                      </div>
                    </div>
                    {draft.route.stops.length > 2 && (
                      <button type="button" onClick={() => removeStop(stop.id)} className="rounded-2xl border border-rose-200 bg-white p-2 text-rose-500 transition hover:bg-rose-50">
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                    <input className={fieldClassName} value={stop.city} onChange={(event) => updateStop(stop.id, 'city', event.target.value)} placeholder="City" />
                    <input className={fieldClassName} value={stop.pointName} onChange={(event) => updateStop(stop.id, 'pointName', event.target.value)} placeholder="Pickup / Drop Point" />
                    <select className={fieldClassName} value={stop.stopType} onChange={(event) => updateStop(stop.id, 'stopType', event.target.value)}>
                      <option value="pickup">Pickup Only</option>
                      <option value="drop">Drop Only</option>
                      <option value="both">Pickup + Drop</option>
                    </select>
                    <input className={fieldClassName} type="time" value={stop.arrivalTime} onChange={(event) => updateStop(stop.id, 'arrivalTime', event.target.value)} />
                    <input className={fieldClassName} type="time" value={stop.departureTime} onChange={(event) => updateStop(stop.id, 'departureTime', event.target.value)} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-xl font-bold tracking-tight text-slate-900">Departure Schedules</h2>
                <p className="mt-1 text-xs font-medium text-slate-500">Manage recurring service slots and availability.</p>
              </div>
              <button
                type="button"
                onClick={addSchedule}
                className="inline-flex items-center gap-2 rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm font-bold text-slate-900 shadow-sm transition hover:bg-amber-100/50"
              >
                <Plus size={16} />
                Add Schedule
              </button>
            </div>

            <div className="space-y-4">
              {draft.schedules.map((schedule, index) => (
                <div key={schedule.id} className="rounded-[26px] border border-slate-200 bg-slate-50/60 p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-indigo-600 shadow-sm">
                        <Clock3 size={16} />
                      </div>
                      <div>
                        <p className="text-sm font-black text-slate-900">Schedule {index + 1}</p>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Recurring service slot</p>
                      </div>
                    </div>
                    {draft.schedules.length > 1 && (
                      <button type="button" onClick={() => removeSchedule(schedule.id)} className="rounded-2xl border border-rose-200 bg-white p-2 text-rose-500 transition hover:bg-rose-50">
                        <XCircle size={16} />
                      </button>
                    )}
                  </div>

                  <div className="grid gap-4 md:grid-cols-4">
                    <input className={fieldClassName} value={schedule.label} onChange={(event) => updateSchedule(schedule.id, 'label', event.target.value)} placeholder="Daily Evening Service" />
                    <input className={fieldClassName} type="time" value={schedule.departureTime} onChange={(event) => updateSchedule(schedule.id, 'departureTime', event.target.value)} />
                    <input className={fieldClassName} type="time" value={schedule.arrivalTime} onChange={(event) => updateSchedule(schedule.id, 'arrivalTime', event.target.value)} />
                    <select className={fieldClassName} value={schedule.status} onChange={(event) => updateSchedule(schedule.id, 'status', event.target.value)}>
                      <option value="active">Active</option>
                      <option value="paused">Paused</option>
                      <option value="draft">Draft</option>
                    </select>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {DAY_OPTIONS.map((day) => {
                      const active = schedule.activeDays.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleScheduleDay(schedule.id, day)}
                          className={`rounded-full border px-3 py-2 text-[10px] font-bold uppercase tracking-wider transition-all ${
                            active
                              ? 'border-amber-300 bg-amber-100 text-amber-800 shadow-sm'
                              : 'border-slate-100 bg-white text-slate-400 hover:border-slate-200'
                          }`}
                        >
                          {day}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
          </>
          ) : null}

          <section className="mt-6 rounded-3xl border border-slate-100 bg-white p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-4">
                <div className="rounded-2xl bg-slate-50 px-4 py-3 border border-slate-100">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Current Step</p>
                  <p className="mt-1 text-sm font-bold text-slate-900">{currentFormStep.title}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3 border border-slate-100">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Route Snapshot</p>
                  <p className="mt-1 text-sm font-bold text-slate-900">
                    {draft.route.originCity || 'Origin'} to {draft.route.destinationCity || 'Destination'}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3 border border-slate-100">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Inventory</p>
                  <p className="mt-1 text-sm font-bold text-slate-900">{totalSeats} seats | {draft.schedules.length} schedules</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={goToPreviousFormStep}
                  disabled={currentFormStepIndex === 0 || isSaving}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                {!isLastFormStep ? (
                  <button
                    type="button"
                    onClick={goToNextFormStep}
                    disabled={!canAdvanceFromCurrentStep || isSaving}
                    className="inline-flex items-center gap-2 rounded-2xl bg-amber-100 border border-amber-300 px-6 py-3 text-sm font-bold text-slate-900 shadow-sm transition hover:-translate-y-0.5 hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next Step
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 rounded-2xl bg-slate-50 px-5 py-3 text-sm font-bold text-rose-500 transition-all hover:bg-rose-50 hover:text-rose-600 active:scale-95 border border-slate-100"
                >
                  <Trash2 size={16} />
                  Delete
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 rounded-2xl bg-amber-100 border border-amber-300 px-6 py-3 text-sm font-bold text-slate-900 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-amber-200 active:scale-95"
                >
                  <Save size={16} />
                  {isSaving ? 'Saving...' : isLastFormStep ? 'Save Bus Service' : 'Save Draft'}
                </button>
              </div>
            </div>
          </section>
        </div>
      </section>
      ) : null}
    </div>
  );
};

export default BusServiceManager;
