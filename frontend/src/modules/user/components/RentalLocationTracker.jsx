import { useEffect, useRef, useState } from 'react';
import { getLocalUserToken } from '../services/authService';
import {
  CURRENT_RIDE_UPDATED_EVENT,
  clearCurrentRide,
  getCurrentRide,
  saveCurrentRide,
} from '../services/currentRideService';
import { userService } from '../services/userService';

const ACTIVE_RENTAL_STATUSES = new Set(['assigned', 'confirmed', 'end_requested']);
const MIN_SEND_INTERVAL_MS = 15000;
const MIN_SEND_DISTANCE_METERS = 50;
const ACTIVE_RENTAL_SYNC_INTERVAL_MS = 45000;

const isRentalRide = (ride) => String(ride?.serviceType || '').toLowerCase() === 'rental';

const isTrackableRentalRide = (ride) =>
  Boolean(ride?.rideId) &&
  isRentalRide(ride) &&
  ACTIVE_RENTAL_STATUSES.has(String(ride?.status || '').toLowerCase());

const toRad = (degrees) => (degrees * Math.PI) / 180;

const distanceBetweenMeters = (pointA, pointB) => {
  if (!pointA || !pointB) {
    return null;
  }

  const lat1 = Number(pointA.lat);
  const lng1 = Number(pointA.lng);
  const lat2 = Number(pointB.lat);
  const lng2 = Number(pointB.lng);

  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) {
    return null;
  }

  const earthRadius = 6371000;
  const deltaLat = toRad(lat2 - lat1);
  const deltaLng = toRad(lng2 - lng1);
  const q1 = toRad(lat1);
  const q2 = toRad(lat2);
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(q1) * Math.cos(q2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  return earthRadius * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

const RentalLocationTracker = () => {
  const [activeRentalRide, setActiveRentalRide] = useState(() => {
    const initialRide = getCurrentRide();
    return isTrackableRentalRide(initialRide) ? initialRide : null;
  });
  const activeRentalRef = useRef(activeRentalRide);
  const lastSentRef = useRef({
    rideId: '',
    at: 0,
    point: null,
    offStatus: '',
  });

  useEffect(() => {
    activeRentalRef.current = activeRentalRide;
  }, [activeRentalRide]);

  useEffect(() => {
    const syncFromStorage = () => {
      const ride = getCurrentRide();
      setActiveRentalRide(isTrackableRentalRide(ride) ? ride : null);
    };

    syncFromStorage();
    window.addEventListener(CURRENT_RIDE_UPDATED_EVENT, syncFromStorage);
    window.addEventListener('storage', syncFromStorage);

    return () => {
      window.removeEventListener(CURRENT_RIDE_UPDATED_EVENT, syncFromStorage);
      window.removeEventListener('storage', syncFromStorage);
    };
  }, []);

  useEffect(() => {
    if (!getLocalUserToken()) {
      return undefined;
    }

    let cancelled = false;

    const syncActiveRental = async () => {
      try {
        const response = await userService.getActiveRentalBooking();
        const payload = response?.data?.data || response?.data || null;

        if (cancelled) {
          return;
        }

        if (payload && ACTIVE_RENTAL_STATUSES.has(String(payload?.status || '').toLowerCase())) {
          const assignedVehicle = payload.assignedVehicle || {};
          const vehicleName = assignedVehicle?.name || payload.vehicleName || 'Assigned Vehicle';
          const vehicleImage = assignedVehicle?.image || payload.vehicleImage || '';
          const vehicleCategory = assignedVehicle?.vehicleCategory || payload.vehicleCategory || 'Rental';
          const nextRide = {
            ...payload,
            rideId: payload.id || payload.rideId,
            serviceType: 'rental',
            liveStatus: payload.status || payload.liveStatus || 'assigned',
            vehicleName,
            vehicleImage,
            vehicleCategory,
            vehicle: {
              name: vehicleName,
              image: vehicleImage,
              vehicleIconUrl: vehicleImage,
            },
            driver: {
              name: vehicleName,
              vehicle: vehicleCategory,
              vehicleType: vehicleCategory,
              vehicleIconUrl: vehicleImage,
            },
            vehicleIconUrl: vehicleImage,
            imageVersion: payload.updatedAt || payload.assignedAt || payload.createdAt || '',
          };
          saveCurrentRide(nextRide);
          setActiveRentalRide(nextRide);
          return;
        }

        const currentRide = getCurrentRide();
        if (isRentalRide(currentRide)) {
          clearCurrentRide();
          setActiveRentalRide(null);
        }
      } catch {
        // Keep current tracker state on transient sync errors.
      }
    };

    syncActiveRental();
    const intervalId = window.setInterval(syncActiveRental, ACTIVE_RENTAL_SYNC_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!activeRentalRide?.rideId || !navigator.geolocation) {
      return undefined;
    }

    let watchId = null;
    let disposed = false;

    const publishTrackingState = async (payload) => {
      const currentRide = activeRentalRef.current;
      if (!currentRide?.rideId || disposed) {
        return;
      }

      const now = Date.now();
      const lastSent = lastSentRef.current;
      const isSameRide = lastSent.rideId === currentRide.rideId;
      const nextPoint = payload?.coordinates
        ? {
            lng: Number(payload.coordinates[0]),
            lat: Number(payload.coordinates[1]),
          }
        : null;
      const movedDistance = nextPoint && isSameRide ? distanceBetweenMeters(lastSent.point, nextPoint) : null;
      const isStatusOnlyUpdate = !nextPoint;

      if (
        isSameRide &&
        !isStatusOnlyUpdate &&
        now - lastSent.at < MIN_SEND_INTERVAL_MS &&
        (movedDistance === null || movedDistance < MIN_SEND_DISTANCE_METERS)
      ) {
        return;
      }

      if (isSameRide && isStatusOnlyUpdate && lastSent.offStatus === payload.status && now - lastSent.at < MIN_SEND_INTERVAL_MS) {
        return;
      }

      try {
        await userService.updateRentalLocation(currentRide.rideId, {
          ...payload,
          capturedAt: new Date().toISOString(),
        });

        lastSentRef.current = {
          rideId: currentRide.rideId,
          at: now,
          point: nextPoint || lastSent.point,
          offStatus: isStatusOnlyUpdate ? payload.status : '',
        };
      } catch (error) {
        // Avoid interrupting the ride flow if tracking calls fail.
        if (error?.response?.status === 409 || error?.response?.status === 404) {
          const current = getCurrentRide();
          if (isRentalRide(current) && current.rideId === currentRide.rideId) {
            clearCurrentRide();
            setActiveRentalRide(null);
          }
        }
      }
    };

    watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (disposed) {
          return;
        }

        publishTrackingState({
          status: 'active',
          coordinates: [position.coords.longitude, position.coords.latitude],
          heading: Number.isFinite(Number(position.coords.heading)) ? Number(position.coords.heading) : null,
          speed: Number.isFinite(Number(position.coords.speed)) ? Number(position.coords.speed) : null,
          accuracyMeters: Number.isFinite(Number(position.coords.accuracy)) ? Number(position.coords.accuracy) : null,
        });
      },
      () => {
        if (disposed) {
          return;
        }

        publishTrackingState({
          status: 'location_off',
        });
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 20000,
      },
    );

    return () => {
      disposed = true;
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [activeRentalRide?.rideId]);

  return null;
};

export default RentalLocationTracker;
