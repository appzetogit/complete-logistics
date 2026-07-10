import { PoolingVehicle } from '../models/PoolingVehicle.js';
import { PoolingBooking } from '../models/PoolingBooking.js';
import { PoolingRoute } from '../models/PoolingRoute.js';
import { PoolingSeatReservation } from '../models/PoolingSeatReservation.js';
import { ApiError } from '../../../../utils/ApiError.js';
import { asyncHandler } from '../../../../utils/asyncHandler.js';
import { uploadDataUrlToCloudinary } from '../../../../utils/cloudinaryUpload.js';

const ok = (res, data, message) => res.status(200).json({ success: true, data, message });
const created = (res, data, message) => res.status(201).json({ success: true, data, message });

const clampPercentage = (value, fallback = 0) => {
  const numericValue = Number(value);
  const safeValue = Number.isFinite(numericValue) ? numericValue : Number(fallback || 0);
  return Math.min(100, Math.max(0, safeValue));
};

const toTrimmedString = (value, fallback = '') =>
  String(value ?? fallback)
    .trim();

const toOptionalTrimmedString = (value, fallback = '') => {
  const normalized = toTrimmedString(value, fallback);
  return normalized || fallback;
};

const normalizeBlueprint = (blueprint = {}) => {
  const rows = Math.max(1, Number(blueprint?.rows || 0) || 1);
  const cols = Math.max(1, Number(blueprint?.cols || 0) || 1);
  const layout = Array.isArray(blueprint?.layout)
    ? blueprint.layout
        .map((item) => ({
          r: Number(item?.r || 0),
          c: Number(item?.c || 0),
          type: ['seat', 'empty', 'driver'].includes(String(item?.type || ''))
            ? String(item.type)
            : 'empty',
        }))
        .filter((item) => item.r >= 0 && item.c >= 0)
    : [];

  return { rows, cols, layout };
};

const serializePoolingVehicle = (vehicle) => {
  const item = typeof vehicle?.toObject === 'function' ? vehicle.toObject() : vehicle;
  return {
    ...item,
    adminCommissionPercentage: clampPercentage(item?.adminCommissionPercentage),
    driverCommissionPercentage: clampPercentage(item?.adminCommissionPercentage),
    ownerCommissionPercentage: clampPercentage(item?.ownerCommissionPercentage),
    serviceTaxPercentage: clampPercentage(item?.serviceTaxPercentage),
    capacity: Math.max(1, Number(item?.capacity || 1)),
    blueprint: normalizeBlueprint(item?.blueprint),
    images: Array.isArray(item?.images) ? item.images.filter(Boolean) : [],
    poolingEnabled: item?.poolingEnabled !== false,
  };
};

const buildAdminPoolingVehiclePayload = (payload = {}, existing = {}) => ({
  name: toOptionalTrimmedString(payload.name, existing.name || ''),
  vehicleModel: toOptionalTrimmedString(payload.vehicleModel, existing.vehicleModel || ''),
  vehicleNumber: toOptionalTrimmedString(payload.vehicleNumber, existing.vehicleNumber || ''),
  driverName: toTrimmedString(payload.driverName, existing.driverName || ''),
  driverPhone: toTrimmedString(payload.driverPhone, existing.driverPhone || ''),
  color: toTrimmedString(payload.color, existing.color || ''),
  capacity: Math.max(1, Number(payload.capacity ?? existing.capacity ?? 1) || 1),
  adminCommissionPercentage: clampPercentage(
    payload.driverCommissionPercentage ?? payload.adminCommissionPercentage,
    existing.adminCommissionPercentage ?? 0,
  ),
  ownerCommissionPercentage: clampPercentage(
    payload.ownerCommissionPercentage,
    existing.ownerCommissionPercentage ?? 0,
  ),
  serviceTaxPercentage: clampPercentage(
    payload.serviceTaxPercentage,
    existing.serviceTaxPercentage ?? 0,
  ),
  vehicleType: ['bike', 'sedan', 'hatchback', 'suv', 'van', 'luxury'].includes(String(payload.vehicleType || existing.vehicleType || ''))
    ? String(payload.vehicleType || existing.vehicleType || 'sedan')
    : 'sedan',
  blueprint: normalizeBlueprint(payload.blueprint ?? existing.blueprint),
  images: Array.isArray(payload.images)
    ? payload.images.filter(Boolean)
    : Array.isArray(existing.images)
      ? existing.images.filter(Boolean)
      : [],
  status: ['pending', 'active', 'inactive', 'maintenance'].includes(String(payload.status || existing.status || ''))
    ? String(payload.status || existing.status || 'active')
    : 'active',
  approve: payload.approve ?? existing.approve ?? true,
  poolingEnabled: payload.poolingEnabled ?? existing.poolingEnabled ?? true,
});

// --- Pooling Vehicles ---

export const getPoolingVehicles = asyncHandler(async (req, res) => {
  const query = {};
  const approveQuery = String(req.query.approve ?? '').trim().toLowerCase();
  const statusQuery = String(req.query.status ?? '').trim().toLowerCase();
  const search = String(req.query.search || '').trim();

  if (approveQuery === 'true') {
    query.approve = true;
  } else if (approveQuery === 'false') {
    query.approve = false;
  }

  if (statusQuery) {
    query.status = statusQuery;
  }

  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { vehicleModel: { $regex: search, $options: 'i' } },
      { vehicleNumber: { $regex: search, $options: 'i' } },
      { driverName: { $regex: search, $options: 'i' } },
      { driverPhone: { $regex: search, $options: 'i' } },
    ];
  }

  const vehicles = await PoolingVehicle.find(query).sort({ createdAt: -1 });
  return ok(res, vehicles.map(serializePoolingVehicle), 'Pooling vehicles fetched successfully');
});

export const createPoolingVehicle = asyncHandler(async (req, res) => {
  const vehicle = await PoolingVehicle.create(
    buildAdminPoolingVehiclePayload(req.body, {
      approve: true,
      poolingEnabled: true,
      status: 'active',
    }),
  );
  return created(res, serializePoolingVehicle(vehicle), 'Pooling vehicle created successfully');
});

export const updatePoolingVehicle = asyncHandler(async (req, res) => {
  const existingVehicle = await PoolingVehicle.findById(req.params.id);
  if (!existingVehicle) throw new ApiError(404, 'Vehicle not found');

  existingVehicle.set(buildAdminPoolingVehiclePayload(req.body, existingVehicle.toObject()));
  const vehicle = await existingVehicle.save();
  if (!vehicle) throw new ApiError(404, 'Vehicle not found');
  return ok(res, serializePoolingVehicle(vehicle), 'Pooling vehicle updated successfully');
});

export const deletePoolingVehicle = asyncHandler(async (req, res) => {
  const vehicle = await PoolingVehicle.findByIdAndDelete(req.params.id);
  if (!vehicle) throw new ApiError(404, 'Vehicle not found');
  return ok(res, null, 'Pooling vehicle deleted successfully');
});

export const approvePoolingVehicle = asyncHandler(async (req, res) => {
  const vehicle = await PoolingVehicle.findByIdAndUpdate(
    req.params.id,
    {
      approve: true,
      status: 'active',
      poolingEnabled: true,
    },
    { returnDocument: 'after' },
  );

  if (!vehicle) {
    throw new ApiError(404, 'Vehicle not found');
  }

  return ok(res, serializePoolingVehicle(vehicle), 'Pooling vehicle approved successfully');
});

// --- Pooling Bookings ---

export const getPoolingBookings = asyncHandler(async (req, res) => {
  const bookings = await PoolingBooking.find()
    .populate('user', 'name phone email')
    .populate('route', 'routeName originLabel destinationLabel')
    .populate('vehicle', 'name vehicleNumber driverName driverPhone')
    .sort({ createdAt: -1 });
  return ok(res, bookings, 'Pooling bookings fetched successfully');
});

export const updatePoolingBookingStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const booking = await PoolingBooking.findByIdAndUpdate(
    req.params.id,
    { bookingStatus: status },
    { returnDocument: 'after' }
  );
  if (!booking) throw new ApiError(404, 'Booking not found');

  if (['cancelled', 'no_show'].includes(String(status || '').toLowerCase())) {
    await PoolingSeatReservation.deleteMany({ booking: booking._id });
  }

  return ok(res, booking, 'Booking status updated successfully');
});

// --- Routes & Stops (Already mostly handled, but adding placeholders for consistency) ---

export const getPoolingRoutes = asyncHandler(async (req, res) => {
  const routes = await PoolingRoute.find().sort({ createdAt: -1 });
  return ok(res, routes, 'Pooling routes fetched successfully');
});

// --- Common Upload ---

export const uploadImage = asyncHandler(async (req, res) => {
  const { image } = req.body;
  if (!image) throw new ApiError(400, 'Image data is required');

  const result = await uploadDataUrlToCloudinary({
    dataUrl: image,
    publicIdPrefix: 'pooling-vehicle',
  });

  return ok(res, { url: result.secureUrl }, 'Image uploaded successfully');
});
