import api from '../../../shared/api/axiosInstance';

const createId = (prefix = 'item') => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

const DEFAULT_AMENITIES = ['Charging Port', 'WiFi', 'Blanket', 'Water Bottle', 'Live Tracking'];
const normalizeLatLng = (value) => {
  const lat = Number(value?.lat);
  const lng = Number(value?.lng);

  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng };
  }

  return null;
};

const createDefaultCancellationRules = () => [
  {
    id: createId('cancel'),
    label: '48h+ before departure',
    hoursBeforeDeparture: 48,
    refundType: 'percentage',
    refundValue: 90,
    notes: '10% cancellation charge',
  },
  {
    id: createId('cancel'),
    label: '24h to 48h before departure',
    hoursBeforeDeparture: 24,
    refundType: 'percentage',
    refundValue: 75,
    notes: '25% cancellation charge',
  },
  {
    id: createId('cancel'),
    label: '6h to 24h before departure',
    hoursBeforeDeparture: 6,
    refundType: 'percentage',
    refundValue: 50,
    notes: '50% cancellation charge',
  },
  {
    id: createId('cancel'),
    label: 'Within 6h of departure',
    hoursBeforeDeparture: 0,
    refundType: 'percentage',
    refundValue: 0,
    notes: 'No refund',
  },
];

const createSeatCell = (deckCode, rowNumber, seatCode, variant = 'seat') => ({
  kind: 'seat',
  id: `${deckCode}${rowNumber}${seatCode}`,
  label: `${rowNumber}${seatCode}`,
  variant,
  status: 'available',
});

const createEmptyCell = () => ({
  kind: 'aisle',
});

const SEAT_CODE_LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const DEFAULT_BUS_LAYOUT_CONFIG = {
  lower: {
    enabled: true,
    rows: 10,
    leftSeats: 2,
    rightSeats: 2,
    seatType: 'seat',
  },
  upper: {
    enabled: false,
    rows: 0,
    leftSeats: 0,
    rightSeats: 0,
    seatType: 'seat',
  },
};

const createEmptyRoute = () => ({
  routeName: '',
  originCity: '',
  destinationCity: '',
  originCoords: null,
  destinationCoords: null,
  distanceKm: '',
  durationHours: '',
  stops: [],
});

const normalizeDeckConfig = (value = {}, fallback = {}) => {
  const base = {
    enabled: false,
    rows: 0,
    leftSeats: 0,
    rightSeats: 0,
    seatType: 'seat',
    ...fallback,
    ...(value && typeof value === 'object' ? value : {}),
  };

  return {
    enabled: Boolean(base.enabled),
    rows: Math.max(0, Number(base.rows || 0)),
    leftSeats: Math.max(0, Math.min(3, Number(base.leftSeats || 0))),
    rightSeats: Math.max(0, Math.min(3, Number(base.rightSeats || 0))),
    seatType: base.seatType === 'sleeper' ? 'sleeper' : 'seat',
  };
};

export const normalizeBusLayoutConfig = (value = {}) => ({
  lower: normalizeDeckConfig(value?.lower, DEFAULT_BUS_LAYOUT_CONFIG.lower),
  upper: normalizeDeckConfig(value?.upper, DEFAULT_BUS_LAYOUT_CONFIG.upper),
});

const createSeatCode = (index = 0, seatType = 'seat', side = 'left') => {
  const baseLabel = SEAT_CODE_LABELS[index] || `S${index + 1}`;
  if (seatType === 'sleeper') {
    return `${side === 'left' ? 'L' : 'R'}${baseLabel}`;
  }
  return baseLabel;
};

const createDeckFromConfig = (deckCode = 'L', config = {}) => {
  const normalized = normalizeDeckConfig(config);

  if (!normalized.enabled || normalized.rows <= 0 || normalized.leftSeats + normalized.rightSeats <= 0) {
    return [];
  }

  return Array.from({ length: normalized.rows }, (_, index) => {
    const rowNumber = index + 1;
    const row = [];

    for (let seatIndex = 0; seatIndex < normalized.leftSeats; seatIndex += 1) {
      row.push(
        createSeatCell(
          deckCode,
          rowNumber,
          createSeatCode(seatIndex, normalized.seatType, 'left'),
          normalized.seatType === 'sleeper'
            ? 'sleeper'
            : seatIndex === 0
              ? 'window'
              : 'aisle',
        ),
      );
    }

    row.push(createEmptyCell());

    for (let seatIndex = 0; seatIndex < normalized.rightSeats; seatIndex += 1) {
      row.push(
        createSeatCell(
          deckCode,
          rowNumber,
          createSeatCode(normalized.leftSeats + seatIndex, normalized.seatType, 'right'),
          normalized.seatType === 'sleeper'
            ? 'sleeper'
            : seatIndex === normalized.rightSeats - 1
              ? 'window'
              : 'aisle',
        ),
      );
    }

    return row;
  });
};

const createBlueprintFromLayoutConfig = (templateKey, layoutConfig = {}) => {
  const normalizedLayoutConfig = normalizeBusLayoutConfig(layoutConfig);

  return {
    templateKey,
    layoutConfig: normalizedLayoutConfig,
    lowerDeck: createDeckFromConfig('L', normalizedLayoutConfig.lower),
    upperDeck: createDeckFromConfig('U', normalizedLayoutConfig.upper),
  };
};

export const BUS_BLUEPRINT_TEMPLATES = [
  {
    key: 'seater_2_2',
    label: 'Seater 2+2',
    category: 'Seater Coach',
    description: 'Classic 4-across pushback layout',
    layoutConfig: {
      lower: { enabled: true, rows: 11, leftSeats: 2, rightSeats: 2, seatType: 'seat' },
      upper: { enabled: false, rows: 0, leftSeats: 0, rightSeats: 0, seatType: 'seat' },
    },
  },
  {
    key: 'seater_2_1',
    label: 'Seater 2+1',
    category: 'Seater Coach',
    description: 'Premium intercity seater layout',
    layoutConfig: {
      lower: { enabled: true, rows: 10, leftSeats: 2, rightSeats: 1, seatType: 'seat' },
      upper: { enabled: false, rows: 0, leftSeats: 0, rightSeats: 0, seatType: 'seat' },
    },
  },
  {
    key: 'sleeper_2_1',
    label: 'Sleeper 2+1',
    category: 'Sleeper Coach',
    description: 'Popular RedBus-style sleeper stack',
    layoutConfig: {
      lower: { enabled: true, rows: 6, leftSeats: 2, rightSeats: 1, seatType: 'sleeper' },
      upper: { enabled: true, rows: 6, leftSeats: 2, rightSeats: 1, seatType: 'sleeper' },
    },
  },
  {
    key: 'sleeper_1_1',
    label: 'Sleeper 1+1',
    category: 'Sleeper Coach',
    description: 'Wide berth layout with more spacing',
    layoutConfig: {
      lower: { enabled: true, rows: 6, leftSeats: 1, rightSeats: 1, seatType: 'sleeper' },
      upper: { enabled: true, rows: 6, leftSeats: 1, rightSeats: 1, seatType: 'sleeper' },
    },
  },
  {
    key: 'mixed_redbus',
    label: 'Semi Sleeper Mix',
    category: 'Hybrid Coach',
    description: 'Lower deck seating with upper sleeper berths',
    layoutConfig: {
      lower: { enabled: true, rows: 8, leftSeats: 2, rightSeats: 2, seatType: 'seat' },
      upper: { enabled: true, rows: 4, leftSeats: 2, rightSeats: 1, seatType: 'sleeper' },
    },
  },
];

export const createBlueprintFromTemplate = (templateKey = 'seater_2_2') => {
  const template = BUS_BLUEPRINT_TEMPLATES.find((item) => item.key === templateKey) || BUS_BLUEPRINT_TEMPLATES[0];
  return createBlueprintFromLayoutConfig(template.key, template.layoutConfig);
};

export const createBusBlueprint = (templateKey = 'seater_2_2', layoutConfig = {}) =>
  createBlueprintFromLayoutConfig(templateKey, layoutConfig);

export const countSeatsInDeck = (deckRows = []) =>
  deckRows.flat().filter((cell) => cell?.kind === 'seat').length;

export const countTotalSeats = (blueprint = {}) =>
  countSeatsInDeck(blueprint.lowerDeck || []) + countSeatsInDeck(blueprint.upperDeck || []);

export const createBusDraft = () => ({
  id: createId('bus'),
  ownerDriverId: '',
  operatorName: '',
  busName: '',
  serviceNumber: '',
  driverName: '',
  driverPhone: '',
  coachType: 'AC Sleeper',
  busCategory: 'Sleeper',
  registrationNumber: '',
  busColor: '#1f2937',
  seatPrice: '899',
  adminCommissionPercentage: '0',
  serviceTaxPercentage: '0',
  variantPricing: {
    seat: '899',
    window: '899',
    aisle: '899',
    sleeper: '1199',
  },
  fareCurrency: 'INR',
  boardingPolicy: 'Reach 15 minutes before departure.',
  cancellationPolicy: 'Cancellation allowed up to 6 hours before departure.',
  cancellationRules: createDefaultCancellationRules(),
  luggagePolicy: 'One cabin bag and one check-in bag per passenger.',
  amenities: [...DEFAULT_AMENITIES],
  image: '',
  coverImage: '',
  galleryImages: [],
  blueprint: createBlueprintFromTemplate('sleeper_2_1'),
  route: {
    routeName: '',
    originCity: '',
    destinationCity: '',
    originCoords: null,
    destinationCoords: null,
    distanceKm: '',
    durationHours: '',
    stops: [
      {
        id: createId('stop'),
        city: '',
        pointName: '',
        stopType: 'pickup',
        arrivalTime: '',
        departureTime: '',
      },
      {
        id: createId('stop'),
        city: '',
        pointName: '',
        stopType: 'drop',
        arrivalTime: '',
        departureTime: '',
      },
    ],
  },
  returnRouteEnabled: false,
  returnRoute: createEmptyRoute(),
  schedules: [
    {
      id: createId('schedule'),
      label: 'Daily Evening Service',
      departureTime: '21:00',
      arrivalTime: '06:15',
      activeDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      status: 'active',
    },
  ],
  status: 'draft',
  capacity: countTotalSeats(createBlueprintFromTemplate('sleeper_2_1')),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

export const normalizeBusCatalog = (catalog = []) =>
  catalog.map((bus) => {
    const fallbackDraft = createBusDraft();
    const blueprintSource = bus.blueprint || createBlueprintFromTemplate(bus.blueprint?.templateKey);
    const blueprint = createBusBlueprint(
      blueprintSource?.templateKey || 'seater_2_2',
      blueprintSource?.layoutConfig,
    );
    if (Array.isArray(blueprintSource?.lowerDeck) && blueprintSource.lowerDeck.length) {
      blueprint.lowerDeck = blueprintSource.lowerDeck;
    }
    if (Array.isArray(blueprintSource?.upperDeck)) {
      blueprint.upperDeck = blueprintSource.upperDeck;
    }

    return {
      ...fallbackDraft,
      ...bus,
      ownerDriverId: bus.ownerDriverId || '',
      blueprint,
      seatPrice:
        bus.seatPrice !== undefined && bus.seatPrice !== null ? String(bus.seatPrice) : fallbackDraft.seatPrice,
      adminCommissionPercentage:
        bus.adminCommissionPercentage !== undefined && bus.adminCommissionPercentage !== null
          ? String(bus.adminCommissionPercentage)
          : fallbackDraft.adminCommissionPercentage,
      serviceTaxPercentage:
        bus.serviceTaxPercentage !== undefined && bus.serviceTaxPercentage !== null
          ? String(bus.serviceTaxPercentage)
          : fallbackDraft.serviceTaxPercentage,
      variantPricing: {
        seat: String(bus.variantPricing?.seat ?? bus.seatPrice ?? fallbackDraft.variantPricing.seat),
        window: String(bus.variantPricing?.window ?? bus.seatPrice ?? fallbackDraft.variantPricing.window),
        aisle: String(bus.variantPricing?.aisle ?? bus.seatPrice ?? fallbackDraft.variantPricing.aisle),
        sleeper: String(bus.variantPricing?.sleeper ?? bus.seatPrice ?? fallbackDraft.variantPricing.sleeper),
      },
      route: {
        ...fallbackDraft.route,
        ...bus.route,
        originCoords: normalizeLatLng(bus.route?.originCoords),
        destinationCoords: normalizeLatLng(bus.route?.destinationCoords),
        stops:
          Array.isArray(bus.route?.stops) && bus.route.stops.length > 0
            ? bus.route.stops
            : fallbackDraft.route.stops,
      },
      returnRouteEnabled: Boolean(bus.returnRouteEnabled),
      returnRoute: {
        ...createEmptyRoute(),
        ...fallbackDraft.returnRoute,
        ...bus.returnRoute,
        originCoords: normalizeLatLng(bus.returnRoute?.originCoords),
        destinationCoords: normalizeLatLng(bus.returnRoute?.destinationCoords),
        stops:
          Array.isArray(bus.returnRoute?.stops) && bus.returnRoute.stops.length > 0
            ? bus.returnRoute.stops
            : [],
      },
      schedules:
        Array.isArray(bus.schedules) && bus.schedules.length > 0 ? bus.schedules : fallbackDraft.schedules,
      amenities:
        Array.isArray(bus.amenities) && bus.amenities.length > 0 ? bus.amenities : fallbackDraft.amenities,
      image: bus.image || bus.coverImage || '',
      coverImage: bus.coverImage || bus.image || '',
      galleryImages: Array.isArray(bus.galleryImages) ? bus.galleryImages.filter(Boolean) : [],
      cancellationRules:
        Array.isArray(bus.cancellationRules) && bus.cancellationRules.length > 0
          ? bus.cancellationRules
          : fallbackDraft.cancellationRules,
      capacity: bus.capacity || countTotalSeats(blueprint),
    };
  });

const getResultsArray = (response) => {
  if (Array.isArray(response?.data?.results)) {
    return response.data.results;
  }

  if (Array.isArray(response?.data)) {
    return response.data;
  }

  if (Array.isArray(response?.results)) {
    return response.results;
  }

  return [];
};

export const getAdminBuses = async () => {
  const response = await api.get('/admin/bus-services');
  return normalizeBusCatalog(getResultsArray(response));
};

export const upsertAdminBus = async (payload) => {
  const requestPayload = {
    ...payload,
    registrationNumber: String(payload.registrationNumber || '').toUpperCase(),
    fareCurrency: String(payload.fareCurrency || 'INR').toUpperCase(),
    capacity: countTotalSeats(payload.blueprint || {}),
    adminCommissionPercentage: Math.min(100, Math.max(0, Number(payload.adminCommissionPercentage || 0))),
    serviceTaxPercentage: Math.min(100, Math.max(0, Number(payload.serviceTaxPercentage || 0))),
  };

  const response = payload.id?.startsWith('bus-')
    ? await api.post('/admin/bus-services', requestPayload)
    : await api.patch(`/admin/bus-services/${payload.id}`, requestPayload);

  return normalizeBusCatalog([response?.data || response])[0];
};

export const deleteAdminBus = async (busId) => {
  await api.delete(`/admin/bus-services/${busId}`);
  return true;
};
