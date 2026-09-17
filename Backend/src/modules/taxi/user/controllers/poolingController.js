import crypto from 'node:crypto';
import { PoolingRoute } from '../../admin/models/PoolingRoute.js';
import { PoolingVehicle } from '../../admin/models/PoolingVehicle.js';
import { PoolingBooking } from '../../admin/models/PoolingBooking.js';
import { PoolingSeatReservation } from '../../admin/models/PoolingSeatReservation.js';
import { asyncHandler } from '../../../../utils/asyncHandler.js';
import { ApiError } from '../../../../utils/ApiError.js';
import { resolveConfiguredGatewayCredentials } from '../../services/paymentGatewayService.js';

const ok = (res, data, message) => res.status(200).json({ success: true, data, message });
const created = (res, data, message) => res.status(201).json({ success: true, data, message });

const toCleanString = (value) => String(value || '').trim();

const normalizeTravelDate = (value) => {
  const rawValue = toCleanString(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) {
    return rawValue;
  }

  const parsed = new Date(rawValue);
  if (!Number.isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  throw new ApiError(400, 'travelDate must be in YYYY-MM-DD format');
};

const getCurrentUserId = (req) => String(req.auth?.sub || req.user?._id || '').trim();

const resolveRazorpayCredentials = async () => {
  return resolveConfiguredGatewayCredentials('razor_pay');
};

const razorpayRequest = async ({ method, path, body, keyId, keySecret }) => {
  const credentials = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(response.status || 502, payload?.error?.description || payload?.error?.message || 'Razorpay request failed');
  }

  return payload;
};

const createPoolingBookingCode = () =>
  `POOL${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

const resolvePickupStop = (route, pickupStopId) => {
  const pickupPoints = Array.isArray(route?.pickupPoints) ? route.pickupPoints : [];
  const stops = Array.isArray(route?.stops) ? route.stops : [];
  return (
    pickupPoints.find((item) => String(item?.id || '') === String(pickupStopId || '')) ||
    stops.find((item) => String(item?.id || '') === String(pickupStopId || '')) ||
    pickupPoints[0] ||
    stops[0] ||
    null
  );
};

const resolveDropStop = (route, dropStopId) => {
  const dropPoints = Array.isArray(route?.dropPoints) ? route.dropPoints : [];
  const stops = Array.isArray(route?.stops) ? route.stops : [];
  return (
    dropPoints.find((item) => String(item?.id || '') === String(dropStopId || '')) ||
    stops.find((item) => String(item?.id || '') === String(dropStopId || '')) ||
    dropPoints[0] ||
    stops[stops.length - 1] ||
    null
  );
};

const getVehicleSeatIds = (vehicle = {}) => {
  const layout = Array.isArray(vehicle?.blueprint?.layout) ? vehicle.blueprint.layout : [];
  return layout
    .filter((item) => item?.type === 'seat')
    .map((item) => `${item.r}-${item.c}`);
};

const getBookedSeatIds = async ({ routeId, vehicleId, scheduleId, travelDate }) => {
  const reservations = await PoolingSeatReservation.find({
    route: routeId,
    vehicle: vehicleId,
    scheduleId,
    travelDate,
  })
    .select('seatId')
    .lean();

  return reservations.map((item) => String(item?.seatId || '')).filter(Boolean);
};

const computePoolingFareBreakdown = ({ route = {}, vehicle = {}, seatCount = 0 }) => {
  const safeSeatCount = Math.max(0, Number(seatCount || 0));
  const farePerSeat = Math.max(0, Number(route?.farePerSeat || 0));
  const baseFare = Math.round(farePerSeat * safeSeatCount * 100) / 100;
  const serviceTaxPercentage = Math.max(0, Math.min(100, Number(vehicle?.serviceTaxPercentage || 0)));
  const driverCommissionPercentage = Math.max(0, Math.min(100, Number(
    vehicle?.driverCommissionPercentage ?? vehicle?.adminCommissionPercentage ?? 0,
  )));
  const ownerCommissionPercentage = Math.max(0, Math.min(100, Number(vehicle?.ownerCommissionPercentage || 0)));
  const serviceTaxAmount = Math.round((baseFare * serviceTaxPercentage) * 100) / 100 / 100;
  const driverCommissionAmount = Math.round(((baseFare * driverCommissionPercentage) / 100) * 100) / 100;
  const ownerCommissionAmount = Math.round(((baseFare * ownerCommissionPercentage) / 100) * 100) / 100;
  const totalFare = Math.round((baseFare + serviceTaxAmount) * 100) / 100;

  return {
    farePerSeat,
    baseFare,
    serviceTaxPercentage,
    serviceTaxAmount,
    driverCommissionPercentage,
    driverCommissionAmount,
    ownerCommissionPercentage,
    ownerCommissionAmount,
    totalFare,
  };
};

const withPrimaryVehicleDriver = (route) => {
  const routeObject = typeof route?.toObject === 'function' ? route.toObject() : route;
  const primaryVehicle = Array.isArray(routeObject?.assignedVehicleTypeIds)
    ? routeObject.assignedVehicleTypeIds[0]
    : null;

  return {
    ...routeObject,
    driverName: routeObject?.driverName || primaryVehicle?.driverName || '',
    driverPhone: routeObject?.driverPhone || primaryVehicle?.driverPhone || '',
  };
};

const serializePoolingBooking = (booking) => {
  const route = booking?.route || booking?.routeId || {};
  const vehicle = booking?.vehicle || booking?.vehicleId || {};
  const user = booking?.user || booking?.userId || {};

  return {
    _id: booking?._id,
    bookingId: booking?.bookingId || '',
    user: user?._id ? user : undefined,
    route: route?._id ? route : undefined,
    vehicle: vehicle?._id ? vehicle : undefined,
    scheduleId: booking?.scheduleId || '',
    pickupStopId: booking?.pickupStopId || '',
    dropStopId: booking?.dropStopId || '',
    pickupLabel: booking?.pickupLabel || '',
    dropLabel: booking?.dropLabel || '',
    seatsBooked: Number(booking?.seatsBooked || 0),
    selectedSeats: Array.isArray(booking?.selectedSeats) ? booking.selectedSeats : [],
    fare: Number(booking?.fare || 0),
    baseFare: Number(booking?.baseFare || 0),
    serviceTaxPercentage: Number(booking?.serviceTaxPercentage || 0),
    serviceTaxAmount: Number(booking?.serviceTaxAmount || 0),
    driverCommissionPercentage: Number(booking?.driverCommissionPercentage || 0),
    driverCommissionAmount: Number(booking?.driverCommissionAmount || 0),
    ownerCommissionPercentage: Number(booking?.ownerCommissionPercentage || 0),
    ownerCommissionAmount: Number(booking?.ownerCommissionAmount || 0),
    currency: booking?.currency || 'INR',
    paymentStatus: booking?.paymentStatus || 'pending',
    bookingStatus: booking?.bookingStatus || 'confirmed',
    travelDate: booking?.travelDate || '',
    createdAt: booking?.createdAt || null,
    updatedAt: booking?.updatedAt || null,
    payment: booking?.payment || {},
  };
};

export const searchPoolingRoutes = asyncHandler(async (req, res) => {
  const { from, to } = req.query;

  const routes = await PoolingRoute.find({
    status: 'active',
    active: { $ne: false },
    $or: [
      { originLabel: { $regex: from || '', $options: 'i' } },
      { destinationLabel: { $regex: to || '', $options: 'i' } },
    ],
  }).populate('assignedVehicleTypeIds');

  return ok(res, routes.map(withPrimaryVehicleDriver), 'Routes fetched successfully');
});

export const getPoolingRouteDetails = asyncHandler(async (req, res) => {
  const route = await PoolingRoute.findById(req.params.id).populate('assignedVehicleTypeIds');

  if (!route) {
    throw new ApiError(404, 'Route not found');
  }

  const travelDate = toCleanString(req.query?.travelDate || req.query?.date);
  let seatAvailability = {};

  if (travelDate) {
    const normalizedTravelDate = normalizeTravelDate(travelDate);
    const vehicleIds = (Array.isArray(route.assignedVehicleTypeIds) ? route.assignedVehicleTypeIds : [])
      .map((item) => String(item?._id || item))
      .filter(Boolean);
    const scheduleIds = (Array.isArray(route.schedules) ? route.schedules : [])
      .filter((item) => String(item?.status || 'active') === 'active')
      .map((item) => String(item?.id || ''))
      .filter(Boolean);

    if (vehicleIds.length > 0 && scheduleIds.length > 0) {
      const reservations = await PoolingSeatReservation.find({
        route: route._id,
        vehicle: { $in: vehicleIds },
        scheduleId: { $in: scheduleIds },
        travelDate: normalizedTravelDate,
      })
        .select('vehicle scheduleId seatId')
        .lean();

      seatAvailability = reservations.reduce((accumulator, item) => {
        const key = `${String(item.vehicle)}:${String(item.scheduleId || '')}`;
        accumulator[key] = accumulator[key] || [];
        accumulator[key].push(String(item.seatId || ''));
        return accumulator;
      }, {});
    }
  }

  return ok(
    res,
    {
      ...route.toObject(),
      seatAvailability,
    },
    'Route details fetched successfully',
  );
});

export const createPoolingBookingOrder = asyncHandler(async (req, res) => {
  const userId = getCurrentUserId(req);
  const routeId = toCleanString(req.body?.routeId);
  const vehicleId = toCleanString(req.body?.vehicleId);
  const scheduleId = toCleanString(req.body?.scheduleId);
  const travelDate = normalizeTravelDate(req.body?.travelDate || req.body?.date);
  const selectedSeats = Array.isArray(req.body?.selectedSeats)
    ? [...new Set(req.body.selectedSeats.map((item) => toCleanString(item)).filter(Boolean))]
    : [];
  const pickupStopId = toCleanString(req.body?.pickupStopId);
  const dropStopId = toCleanString(req.body?.dropStopId);

  if (!userId) {
    throw new ApiError(401, 'User authentication is required');
  }

  if (!routeId || !vehicleId || !scheduleId || selectedSeats.length === 0) {
    throw new ApiError(400, 'routeId, vehicleId, scheduleId and selectedSeats are required');
  }

  const [route, vehicle] = await Promise.all([
    PoolingRoute.findById(routeId).lean(),
    PoolingVehicle.findById(vehicleId).lean(),
  ]);

  if (!route || String(route.status || '') !== 'active' || route.active === false) {
    throw new ApiError(404, 'Pooling route not found');
  }

  if (!vehicle || String(vehicle.status || '') !== 'active') {
    throw new ApiError(404, 'Pooling vehicle not found');
  }

  const allowedVehicleIds = (Array.isArray(route.assignedVehicleTypeIds) ? route.assignedVehicleTypeIds : []).map((item) => String(item));
  if (allowedVehicleIds.length > 0 && !allowedVehicleIds.includes(vehicleId)) {
    throw new ApiError(400, 'Selected vehicle is not assigned to this route');
  }

  const schedule = (Array.isArray(route.schedules) ? route.schedules : []).find(
    (item) => String(item?.id || '') === scheduleId && String(item?.status || 'active') === 'active',
  );
  if (!schedule) {
    throw new ApiError(404, 'Selected route schedule is not available');
  }

  const pickupStop = resolvePickupStop(route, pickupStopId);
  const dropStop = resolveDropStop(route, dropStopId);
  if (!pickupStop || !dropStop) {
    throw new ApiError(400, 'Pickup and drop points are required for pooling booking');
  }

  const farePerSeat = Number(route.farePerSeat || 0);
  const fareBreakdown = computePoolingFareBreakdown({ route, vehicle, seatCount: selectedSeats.length });
  if (!Number.isFinite(fareBreakdown.totalFare) || fareBreakdown.totalFare <= 0) {
    throw new ApiError(400, 'Pooling fare is not configured');
  }

  const vehicleSeatIds = new Set(getVehicleSeatIds(vehicle));
  const invalidSeatId = selectedSeats.find((seatId) => !vehicleSeatIds.has(seatId));
  if (invalidSeatId) {
    throw new ApiError(400, `Seat ${invalidSeatId} is not available in this vehicle`);
  }

  const alreadyBookedSeatIds = await getBookedSeatIds({
    routeId,
    vehicleId,
    scheduleId,
    travelDate,
  });
  const conflictingSeatId = selectedSeats.find((seatId) => alreadyBookedSeatIds.includes(seatId));
  if (conflictingSeatId) {
    throw new ApiError(409, `Seat ${conflictingSeatId} was already booked by another user`);
  }

  const { keyId, keySecret } = await resolveRazorpayCredentials();
  const compactUserId = userId.replace(/[^a-zA-Z0-9]/g, '').slice(-8) || 'usr';
  const order = await razorpayRequest({
    method: 'POST',
    path: '/orders',
    body: {
      amount: Math.round(fareBreakdown.totalFare * 100),
      currency: 'INR',
      receipt: `upool_${compactUserId}_${Date.now().toString(36)}`,
      notes: {
        userId,
        routeId,
        vehicleId,
        scheduleId,
        travelDate,
        seats: selectedSeats.join(','),
      },
    },
    keyId,
    keySecret,
  });

  return created(
    res,
    {
      keyId,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency || 'INR',
      travelDate,
      fare: fareBreakdown.totalFare,
      baseFare: fareBreakdown.baseFare,
      serviceTaxPercentage: fareBreakdown.serviceTaxPercentage,
      serviceTaxAmount: fareBreakdown.serviceTaxAmount,
      driverCommissionPercentage: fareBreakdown.driverCommissionPercentage,
      driverCommissionAmount: fareBreakdown.driverCommissionAmount,
      ownerCommissionPercentage: fareBreakdown.ownerCommissionPercentage,
      ownerCommissionAmount: fareBreakdown.ownerCommissionAmount,
    },
    'Pooling payment order created successfully',
  );
});

export const verifyPoolingBookingPayment = asyncHandler(async (req, res) => {
  const userId = getCurrentUserId(req);
  const orderId = toCleanString(req.body?.razorpay_order_id);
  const paymentId = toCleanString(req.body?.razorpay_payment_id);
  const signature = toCleanString(req.body?.razorpay_signature);
  const routeId = toCleanString(req.body?.routeId);
  const vehicleId = toCleanString(req.body?.vehicleId);
  const scheduleId = toCleanString(req.body?.scheduleId);
  const travelDate = normalizeTravelDate(req.body?.travelDate || req.body?.date);
  const selectedSeats = Array.isArray(req.body?.selectedSeats)
    ? [...new Set(req.body.selectedSeats.map((item) => toCleanString(item)).filter(Boolean))]
    : [];
  const pickupStopId = toCleanString(req.body?.pickupStopId);
  const dropStopId = toCleanString(req.body?.dropStopId);

  if (!userId) {
    throw new ApiError(401, 'User authentication is required');
  }

  if (!orderId || !paymentId || !signature) {
    throw new ApiError(400, 'Payment verification fields are required');
  }

  if (!routeId || !vehicleId || !scheduleId || selectedSeats.length === 0) {
    throw new ApiError(400, 'routeId, vehicleId, scheduleId and selectedSeats are required');
  }

  const { keySecret } = await resolveRazorpayCredentials();
  const expectedSignature = crypto
    .createHmac('sha256', keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  if (expectedSignature !== signature) {
    throw new ApiError(400, 'Invalid payment signature');
  }

  const existingBooking = await PoolingBooking.findOne({
    user: userId,
    'payment.paymentId': paymentId,
  })
    .populate('route', 'routeName originLabel destinationLabel')
    .populate('vehicle', 'name vehicleNumber driverName driverPhone');

  if (existingBooking) {
    return ok(res, serializePoolingBooking(existingBooking), 'Pooling booking already confirmed');
  }

  const [route, vehicle] = await Promise.all([
    PoolingRoute.findById(routeId).lean(),
    PoolingVehicle.findById(vehicleId).lean(),
  ]);

  if (!route || String(route.status || '') !== 'active' || route.active === false) {
    throw new ApiError(404, 'Pooling route not found');
  }

  if (!vehicle || String(vehicle.status || '') !== 'active') {
    throw new ApiError(404, 'Pooling vehicle not found');
  }

  const schedule = (Array.isArray(route.schedules) ? route.schedules : []).find(
    (item) => String(item?.id || '') === scheduleId && String(item?.status || 'active') === 'active',
  );
  if (!schedule) {
    throw new ApiError(404, 'Selected route schedule is not available');
  }

  const pickupStop = resolvePickupStop(route, pickupStopId);
  const dropStop = resolveDropStop(route, dropStopId);
  if (!pickupStop || !dropStop) {
    throw new ApiError(400, 'Pickup and drop points are required for pooling booking');
  }

  const fareBreakdown = computePoolingFareBreakdown({ route, vehicle, seatCount: selectedSeats.length });
  if (!Number.isFinite(fareBreakdown.totalFare) || fareBreakdown.totalFare <= 0) {
    throw new ApiError(400, 'Pooling fare is not configured');
  }

  const vehicleSeatIds = new Set(getVehicleSeatIds(vehicle));
  const invalidSeatId = selectedSeats.find((seatId) => !vehicleSeatIds.has(seatId));
  if (invalidSeatId) {
    throw new ApiError(400, `Seat ${invalidSeatId} is not available in this vehicle`);
  }

  const alreadyBookedSeatIds = await getBookedSeatIds({
    routeId,
    vehicleId,
    scheduleId,
    travelDate,
  });
  const conflictingSeatId = selectedSeats.find((seatId) => alreadyBookedSeatIds.includes(seatId));
  if (conflictingSeatId) {
    throw new ApiError(409, `Seat ${conflictingSeatId} was already booked by another user`);
  }

  const duplicateUpcomingBooking = await PoolingBooking.findOne({
    user: userId,
    route: routeId,
    scheduleId,
    travelDate: new Date(`${travelDate}T00:00:00.000Z`),
    bookingStatus: 'confirmed',
    selectedSeats: { $in: selectedSeats },
  })
    .populate('route', 'routeName originLabel destinationLabel')
    .populate('vehicle', 'name vehicleNumber driverName driverPhone');

  if (duplicateUpcomingBooking) {
    return ok(res, serializePoolingBooking(duplicateUpcomingBooking), 'Pooling booking already confirmed');
  }

  const booking = await PoolingBooking.create({
    bookingId: createPoolingBookingCode(),
    user: userId,
    route: routeId,
    vehicle: vehicleId,
    scheduleId,
    pickupStopId: String(pickupStop.id || pickupStopId),
    dropStopId: String(dropStop.id || dropStopId),
    seatsBooked: selectedSeats.length,
    selectedSeats,
    fare: fareBreakdown.totalFare,
    baseFare: fareBreakdown.baseFare,
    serviceTaxPercentage: fareBreakdown.serviceTaxPercentage,
    serviceTaxAmount: fareBreakdown.serviceTaxAmount,
    driverCommissionPercentage: fareBreakdown.driverCommissionPercentage,
    driverCommissionAmount: fareBreakdown.driverCommissionAmount,
    ownerCommissionPercentage: fareBreakdown.ownerCommissionPercentage,
    ownerCommissionAmount: fareBreakdown.ownerCommissionAmount,
    currency: 'INR',
    paymentStatus: 'paid',
    bookingStatus: 'confirmed',
    travelDate: new Date(`${travelDate}T00:00:00.000Z`),
    pickupLabel: pickupStop.name || pickupStop.address || route.originLabel || '',
    dropLabel: dropStop.name || dropStop.address || route.destinationLabel || '',
    payment: {
      provider: 'razorpay',
      orderId,
      paymentId,
      signature,
      status: 'paid',
      paidAt: new Date(),
    },
  });

  try {
    await PoolingSeatReservation.insertMany(
      selectedSeats.map((seatId) => ({
        route: routeId,
        vehicle: vehicleId,
        booking: booking._id,
        scheduleId,
        travelDate,
        seatId,
      })),
      { ordered: true },
    );
  } catch (error) {
    await PoolingBooking.deleteOne({ _id: booking._id });
    if (error?.code === 11000) {
      throw new ApiError(409, 'One or more selected seats were just booked by another user');
    }
    throw error;
  }

  const hydratedBooking = await PoolingBooking.findById(booking._id)
    .populate('route', 'routeName originLabel destinationLabel')
    .populate('vehicle', 'name vehicleNumber driverName driverPhone');

  return created(res, serializePoolingBooking(hydratedBooking), 'Pooling booking confirmed successfully');
});

export const createPoolingBooking = asyncHandler(async (_req, _res) => {
  throw new ApiError(405, 'Direct pooling booking is disabled. Please complete online payment first.');
});

export const getMyPoolingBookings = asyncHandler(async (req, res) => {
  const userId = getCurrentUserId(req);
  if (!userId) {
    throw new ApiError(401, 'User authentication is required');
  }

  const bookings = await PoolingBooking.find({ user: userId })
    .populate('route', 'routeName originLabel destinationLabel')
    .populate('vehicle', 'name vehicleNumber driverName driverPhone')
    .sort({ createdAt: -1 });

  return ok(res, bookings.map(serializePoolingBooking), 'My bookings fetched successfully');
});
