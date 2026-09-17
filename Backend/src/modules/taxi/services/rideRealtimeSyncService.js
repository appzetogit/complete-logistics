import { getFirebaseDatabase, firebaseServerTimestamp } from '../../../config/firebase.js';

const getRideRealtimeRef = (rideId) => {
  const database = getFirebaseDatabase();

  if (!database || !rideId) {
    return null;
  }

  return database.ref(`taxiRides/${String(rideId)}`);
};

const toCoordinates = (value) => {
  if (Array.isArray(value?.coordinates) && value.coordinates.length >= 2) {
    const [lng, lat] = value.coordinates;
    if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
      return [Number(lng), Number(lat)];
    }
  }

  if (Array.isArray(value) && value.length >= 2) {
    const [lng, lat] = value;
    if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
      return [Number(lng), Number(lat)];
    }
  }

  return null;
};

const pointSnapshot = (value, fallbackAddress = '') => {
  const coordinates = toCoordinates(value);

  if (!coordinates) {
    return null;
  }

  return {
    coordinates,
    lng: coordinates[0],
    lat: coordinates[1],
    address: String(value?.address || fallbackAddress || ''),
  };
};

const normalizeDriverSnapshot = (driver) => {
  if (!driver || typeof driver !== 'object' || Array.isArray(driver)) {
    return null;
  }

  return {
    id: driver._id ? String(driver._id) : driver.id ? String(driver.id) : '',
    name: driver.name || '',
    phone: driver.phone || '',
    profileImage: driver.profileImage || '',
    vehicleType: driver.vehicleType || '',
    vehicleIconType: driver.vehicleIconType || '',
    vehicleNumber: driver.vehicleNumber || '',
    vehicleColor: driver.vehicleColor || '',
    vehicleMake: driver.vehicleMake || '',
    vehicleModel: driver.vehicleModel || '',
    vehicleImage: driver.vehicleImage || '',
    rating: driver.rating || '',
  };
};

export const mirrorRideRealtimeState = async (ridePayload = {}) => {
  const rideId = String(ridePayload.rideId || '').trim();
  const rideRef = getRideRealtimeRef(rideId);

  if (!rideRef) {
    return false;
  }

  const nextState = {
    rideId,
    type: ridePayload.type || ridePayload.serviceType || 'ride',
    serviceType: ridePayload.serviceType || ridePayload.type || 'ride',
    status: ridePayload.liveStatus || ridePayload.status || 'accepted',
    liveStatus: ridePayload.liveStatus || ridePayload.status || 'accepted',
    fare: Number(ridePayload.fare || 0),
    paymentMethod: ridePayload.paymentMethod || 'cash',
    vehicleIconType: ridePayload.vehicleIconType || '',
    vehicleIconUrl: ridePayload.vehicleIconUrl || '',
    scheduledAt: ridePayload.scheduledAt || null,
    acceptedAt: ridePayload.acceptedAt || null,
    arrivedAt: ridePayload.arrivedAt || null,
    startedAt: ridePayload.startedAt || null,
    completedAt: ridePayload.completedAt || null,
    otp: ridePayload.otp || '',
    pricingSnapshot: ridePayload.pricingSnapshot || null,
    driverPaymentCollection: ridePayload.driverPaymentCollection || null,
    feedback: ridePayload.feedback || null,
    pickup: pointSnapshot(ridePayload.pickupLocation, ridePayload.pickupAddress || ''),
    drop: pointSnapshot(ridePayload.dropLocation, ridePayload.dropAddress || ''),
    driverLocation: pointSnapshot(
      ridePayload.lastDriverLocation,
      ridePayload.lastDriverLocation?.address || '',
    )
      ? {
          ...pointSnapshot(ridePayload.lastDriverLocation, ridePayload.lastDriverLocation?.address || ''),
          heading: Number.isFinite(Number(ridePayload.lastDriverLocation?.heading))
            ? Number(ridePayload.lastDriverLocation.heading)
            : null,
          speed: Number.isFinite(Number(ridePayload.lastDriverLocation?.speed))
            ? Number(ridePayload.lastDriverLocation.speed)
            : null,
          updatedAt: ridePayload.lastDriverLocation?.updatedAt || null,
        }
      : null,
    driver: normalizeDriverSnapshot(ridePayload.driver),
    updatedAt: firebaseServerTimestamp(),
  };

  try {
    await rideRef.update(nextState);
    return true;
  } catch (error) {
    console.error(`Firebase ride state sync failed for ride ${rideId}:`, error.message);
    return false;
  }
};

export const mirrorRideDriverLocation = async ({
  rideId,
  coordinates,
  heading = null,
  speed = null,
  liveStatus = null,
} = {}) => {
  const rideRef = getRideRealtimeRef(rideId);
  const normalizedCoordinates = toCoordinates(coordinates);

  if (!rideRef || !normalizedCoordinates) {
    return false;
  }

  try {
    await rideRef.update({
      ...(liveStatus ? { status: String(liveStatus), liveStatus: String(liveStatus) } : {}),
      driverLocation: {
        coordinates: normalizedCoordinates,
        lng: normalizedCoordinates[0],
        lat: normalizedCoordinates[1],
        heading: Number.isFinite(Number(heading)) ? Number(heading) : null,
        speed: Number.isFinite(Number(speed)) ? Number(speed) : null,
        updatedAt: firebaseServerTimestamp(),
      },
      updatedAt: firebaseServerTimestamp(),
    });
    return true;
  } catch (error) {
    console.error(`Firebase driver location sync failed for ride ${rideId}:`, error.message);
    return false;
  }
};
