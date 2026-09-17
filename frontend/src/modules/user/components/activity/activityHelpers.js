import carIcon from '../../../../assets/icons/car.png';
import bikeIcon from '../../../../assets/icons/bike.png';
import autoIcon from '../../../../assets/icons/auto.png';
import LuxuryIcon from '../../../../assets/icons/Luxury.png';
import PremiumIcon from '../../../../assets/icons/Premium.png';
import SuvIcon from '../../../../assets/icons/SUV.png';
import busIcon from '../../../../assets/3d images/AutoCab/bus.png';

export const PAGE_SIZE = 4;
export const TABS = ['All', 'Rides', 'Parcels', 'Rental', 'Bus', 'Pooling', 'Outstation', 'Scheduled', 'Support'];

export const pickFirstString = (...values) => {
  for (const value of values) {
    const normalized = String(value || '').trim();

    if (normalized) {
      return normalized;
    }
  }

  return '';
};

export const buildAvatarFallback = (name = 'Captain') =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=E2E8F0&color=0F172A&bold=true`;

export const isLikelyVehiclePhoto = (value) => {
  const url = String(value || '').trim().toLowerCase();

  if (!url) {
    return false;
  }

  return !url.endsWith('.svg') && !url.includes('/icon') && !url.includes('map_icon');
};

export const getVehicleTypeAsset = (iconType = '') => {
  const value = String(iconType || '').toLowerCase();

  if (value.includes('bike')) return bikeIcon;
  if (value.includes('auto')) return autoIcon;
  if (value.includes('lux')) return LuxuryIcon;
  if (value.includes('premium')) return PremiumIcon;
  if (value.includes('suv')) return SuvIcon;
  return carIcon;
};

export const getStatusTone = (status = '') => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'completed' || normalized === 'confirmed') return 'success';
  if (normalized === 'cancelled' || normalized === 'failed' || normalized === 'expired') return 'danger';
  return 'warning';
};

export const formatRideDate = (value) => {
  if (!value) {
    return '--';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '--';
  }

  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};

export const formatRideTime = (value) => {
  if (!value) {
    return '--';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '--';
  }

  return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
};

export const toTimestamp = (value) => {
  if (!value) {
    return 0;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

const getBusTravelTimestamp = (booking) => {
  const travelDate = String(booking?.travelDate || '').trim();
  const departure = String(booking?.bus?.departure || '').trim();
  const rawValue = travelDate
    ? `${travelDate}T${departure && /^\d{1,2}:\d{2}/.test(departure) ? departure.slice(0, 5) : '00:00'}:00`
    : booking?.createdAt;

  return toTimestamp(rawValue);
};

export const formatStatus = (status) => {
  const normalized = String(status || 'searching').toLowerCase();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

export const getRideTimeSource = (ride) =>
  ride.completedAt || ride.startedAt || ride.acceptedAt || ride.createdAt || ride.updatedAt;

export const coordLabel = (location, fallback) => {
  const coords = location?.coordinates || [];
  const [lng, lat] = coords;

  if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
    return `${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`;
  }

  return fallback;
};

export const getVehicleVisual = (ride, type) => {
  if (type === 'parcel') {
    return '/5_Parcel.png';
  }

  if (type === 'bus') {
    return busIcon;
  }

  if (type === 'pooling') {
    return carIcon;
  }

  return getVehicleTypeAsset(
    ride?.vehicleIconType ||
    ride?.driver?.vehicleIconType ||
    ride?.driver?.vehicleType ||
    ride?.serviceType
  );
};

export const normalizeRide = (ride) => {
  const timeSource = getRideTimeSource(ride);
  const driverName = pickFirstString(
    ride?.driver?.name,
    ride?.driver?.fullName,
    ride?.driverName,
    ride?.driver?.phone ? `Driver ${ride.driver.phone}` : '',
    'Driver assigned',
  );
  const vehicle = ride.driver?.vehicleType || ride.vehicleIconType || 'Ride';
  const status = formatStatus(ride.status || ride.liveStatus);
  const serviceType = String(ride.serviceType || ride.type || 'ride').toLowerCase();
  const type = serviceType === 'parcel' ? 'parcel' : 'ride';
  const pickup = ride.pickupAddress || coordLabel(ride.pickupLocation, 'Pickup');
  const drop = ride.dropAddress || coordLabel(ride.dropLocation, 'Drop');
  const isScheduled = Boolean(ride?.scheduledAt);
  const isOutstation = serviceType === 'intercity' || Boolean(ride?.parcel?.isOutstation) || String(ride?.parcel?.deliveryScope || '').toLowerCase() === 'outstation';
  const title = type === 'parcel'
    ? (isScheduled ? 'Scheduled parcel' : isOutstation ? 'Outstation parcel' : status === 'Searching' ? 'Parcel request' : 'Parcel delivery')
    : isScheduled
      ? `Scheduled ride with ${driverName}`
      : isOutstation
        ? `Outstation trip with ${driverName}`
        : (status === 'Searching' ? 'Ride request' : `Ride with ${driverName}`);

  return {
    id: ride.rideId || ride._id || ride.id,
    type,
    title,
    address: `${pickup} to ${drop}`,
    date: formatRideDate(timeSource),
    time: formatRideTime(timeSource),
    status,
    statusTone: getStatusTone(status),
    price: Number(ride.fare || 0).toFixed(0),
    ride,
    vehicle: type === 'parcel' ? 'Parcel' : vehicle,
    driverName,
    eyebrow: isScheduled
      ? 'Scheduled booking'
      : isOutstation
        ? 'Outstation trip'
        : type === 'parcel'
          ? 'Delivery booking'
          : 'Driver trip',
    driverImage: pickFirstString(
      ride?.driver?.profileImage,
      ride?.driver?.profile_image,
      ride?.driver?.image,
      ride?.driver?.avatar,
      buildAvatarFallback(driverName),
    ),
    vehicleImage: getVehicleVisual(ride, type),
    sortTimestamp: toTimestamp(timeSource),
  };
};

export const normalizeBusBooking = (booking) => {
  const fromCity = pickFirstString(booking?.bus?.fromCity, 'From');
  const toCity = pickFirstString(booking?.bus?.toCity, 'To');
  const operator = pickFirstString(booking?.bus?.operator, booking?.bus?.busName, 'Bus Service');
  const driverName = pickFirstString(booking?.bus?.driverName, operator, 'Bus crew');
  const status = formatStatus(booking?.status || 'confirmed');
  const pickup = pickFirstString(booking?.bus?.pickupLocation, fromCity);
  const drop = pickFirstString(booking?.bus?.dropLocation, toCity);

  return {
    id: booking.id,
    type: 'bus',
    title: `${fromCity} to ${toCity}`,
    address: `${pickup} to ${drop}`,
    date: formatRideDate(getBusTravelTimestamp(booking)),
    time: pickFirstString(booking?.bus?.departure, formatRideTime(getBusTravelTimestamp(booking))),
    status,
    statusTone: getStatusTone(status),
    price: Number(booking.amount || 0).toFixed(0),
    driverName,
    eyebrow: operator,
    driverImage: buildAvatarFallback(driverName),
    vehicleImage: getVehicleVisual(null, 'bus'),
    booking,
    sortTimestamp: toTimestamp(booking?.createdAt || getBusTravelTimestamp(booking)),
  };
};

export const normalizePoolingBooking = (booking) => {
  const routeName = pickFirstString(
    booking?.route?.routeName,
    booking?.route?.originLabel && booking?.route?.destinationLabel
      ? `${booking.route.originLabel} to ${booking.route.destinationLabel}`
      : '',
    'Pooling trip',
  );
  const pickup = pickFirstString(booking?.pickupLabel, booking?.route?.originLabel, 'Pickup');
  const drop = pickFirstString(booking?.dropLabel, booking?.route?.destinationLabel, 'Drop');
  const driverName = pickFirstString(booking?.vehicle?.name, 'Pooling vehicle');
  const status = formatStatus(booking?.bookingStatus || 'confirmed');

  return {
    id: booking?._id || booking?.bookingId,
    type: 'pooling',
    title: routeName,
    address: `${pickup} to ${drop}`,
    date: formatRideDate(booking?.travelDate),
    time: pickFirstString(booking?.scheduleId, formatRideTime(booking?.travelDate)),
    status,
    statusTone: getStatusTone(status),
    price: Number(booking?.fare || 0).toFixed(0),
    driverName,
    eyebrow: pickFirstString(booking?.vehicle?.vehicleNumber, 'Pooling booking'),
    driverImage: buildAvatarFallback(driverName),
    vehicleImage: getVehicleVisual(null, 'pooling'),
    booking,
    sortTimestamp: toTimestamp(booking?.createdAt || booking?.travelDate),
  };
};

export const normalizeRentalBooking = (booking) => {
  const status = formatStatus(booking?.status || 'pending');
  const locationName = pickFirstString(
    booking?.serviceLocation?.name,
    booking?.serviceLocation?.city,
    'Rental pickup hub',
  );
  const assignedVehicleName = pickFirstString(booking?.assignedVehicle?.name, booking?.vehicleName, 'Rental vehicle');
  const title = pickFirstString(
    booking?.vehicleName,
    booking?.selectedPackage?.label ? `Rental - ${booking.selectedPackage.label}` : '',
    'Rental booking',
  );
  const pickupTimeSource = booking?.pickupDateTime || booking?.createdAt;

  return {
    id: booking?.id || booking?._id,
    type: 'rental',
    title,
    address: `${locationName} to ${pickFirstString(booking?.serviceLocation?.address, booking?.serviceLocation?.city, 'Return at same hub')}`,
    date: formatRideDate(pickupTimeSource),
    time: formatRideTime(pickupTimeSource),
    status,
    statusTone: getStatusTone(status),
    price: Number(booking?.totalCost || 0).toFixed(0),
    driverName: assignedVehicleName,
    eyebrow: pickFirstString(booking?.selectedPackage?.label, booking?.bookingReference, 'Rental booking'),
    driverImage: buildAvatarFallback(assignedVehicleName),
    vehicleImage: pickFirstString(
      booking?.assignedVehicle?.image,
      booking?.vehicleImage,
      carIcon,
    ),
    booking,
    sortTimestamp: toTimestamp(booking?.updatedAt || booking?.pickupDateTime || booking?.createdAt),
  };
};
