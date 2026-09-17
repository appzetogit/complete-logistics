import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
// ... removed BottomNavbar import ...
import { useUserTheme } from '../../../shared/context/UserThemeContext';

import ActivityHeader from '../components/activity/ActivityHeader';
import ActivityTabs from '../components/activity/ActivityTabs';
import ActivityCard from '../components/activity/ActivityCard';
import ActivityPager from '../components/activity/ActivityPager';
import {
  ActivityEmptyState,
  ActivityErrorState,
  ActivityLoadingState,
  ActivitySupportState,
} from '../components/activity/ActivityStates';
import api from '../../../shared/api/axiosInstance';
import { toHistorySafeState } from '../../../shared/utils/historyState';
import userBusService from '../services/busService';
import { userService } from '../services/userService';
import { normalizeBusBooking, normalizePoolingBooking, normalizeRentalBooking, normalizeRide, PAGE_SIZE, TABS } from '../components/activity/activityHelpers';

import taxiFallback from '../../../assets/user-app/taxi.png';
import bikeFallback from '../../../assets/user-app/bike.png';
import parcelFallback from '../../../assets/user-app/parcel.png';
import busFallback from '../../../assets/user-app/bus.png';

import {
  CURRENT_RIDE_UPDATED_EVENT,
  getCurrentRide,
  getCurrentRideSignature,
  isActiveCurrentRide,
} from '../services/currentRideService';
import { CalendarClock, Clock3, MapPin, ShieldCheck, User, ChevronRight } from 'lucide-react';

const getCurrentRideIcon = (ride) => {
  const customIcon = String(
    ride?.vehicleIconUrl ||
    ride?.vehicle?.vehicleIconUrl ||
    ride?.vehicle?.icon ||
    ride?.driver?.vehicleIconUrl ||
    '',
  ).trim();

  if (customIcon && !customIcon.includes('localhost') && !customIcon.startsWith('/')) {
    return customIcon;
  }

  const serviceType = String(ride?.serviceType || ride?.type || '').toLowerCase();
  const iconType = String(ride?.vehicleIconType || ride?.driver?.vehicleIconType || ride?.driver?.vehicleType || '').toLowerCase();

  if (serviceType === 'parcel' || serviceType === 'delivery') {
    return parcelFallback;
  }

  if (iconType.includes('bike')) {
    return bikeFallback;
  }

  if (iconType.includes('auto')) {
    return taxiFallback;
  }

  if (serviceType === 'bus') {
    return busFallback;
  }

  return taxiFallback;
};

const formatScheduledDateTime = (value) => {
  if (!value) {
    return 'Scheduled time pending';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Scheduled time pending';
  }

  return parsed.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getScheduledCountdownLabel = (value, now = Date.now()) => {
  const parsed = value ? new Date(value) : null;
  const time = parsed?.getTime?.() || NaN;

  if (!Number.isFinite(time)) {
    return '';
  }

  const diffMs = time - now;
  if (diffMs <= 0) {
    return 'Pickup window is opening now';
  }

  const totalMinutes = Math.ceil(diffMs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `Starts in ${days}d ${hours}h`;
  }

  if (hours > 0) {
    return `Starts in ${hours}h ${minutes}m`;
  }

  return `Starts in ${minutes}m`;
};

const normalizeRentalCurrentRideSnapshot = (ride = {}, previousRide = {}) => {
  if (!ride) {
    return null;
  }

  const assignedVehicle = ride.assignedVehicle || previousRide.assignedVehicle || {};
  const selectedPackage = ride.selectedPackage || previousRide.selectedPackage || null;
  const rideMetrics = ride.rideMetrics || previousRide.rideMetrics || {};
  const serviceLocation = ride.serviceLocation || previousRide.serviceLocation || null;
  const bookingReference = ride.bookingReference || previousRide.bookingReference || '';
  const vehicleName =
    assignedVehicle?.name ||
    ride.vehicleName ||
    previousRide.vehicleName ||
    previousRide?.vehicle?.name ||
    'Assigned Vehicle';
  const vehicleImage =
    assignedVehicle?.image ||
    ride.vehicleImage ||
    previousRide.vehicleImage ||
    previousRide?.vehicle?.image ||
    '';
  const vehicleCategory =
    assignedVehicle?.vehicleCategory ||
    ride.vehicleCategory ||
    previousRide.vehicleCategory ||
    previousRide?.driver?.vehicle ||
    'Rental';

  return {
    ...previousRide,
    ...ride,
    rideId: ride.id || ride.rideId || previousRide.rideId || '',
    bookingReference,
    fare: rideMetrics?.currentCharge ?? ride.fare ?? previousRide.fare ?? ride.payableNow ?? 0,
    totalCost: ride.totalCost ?? previousRide.totalCost ?? 0,
    advancePaid: ride.payableNow ?? ride.advancePaid ?? previousRide.advancePaid ?? 0,
    status: ride.status || previousRide.status || 'assigned',
    liveStatus: ride.status || ride.liveStatus || previousRide.liveStatus || 'assigned',
    serviceType: 'rental',
    vehicleName,
    vehicleImage,
    vehicleCategory,
    vehicle: {
      ...(previousRide.vehicle || {}),
      name: vehicleName,
      image: vehicleImage,
      vehicleIconUrl: vehicleImage,
    },
    driver: {
      ...(previousRide.driver || {}),
      name: vehicleName,
      vehicle: vehicleCategory,
      vehicleType: vehicleCategory,
      vehicleIconUrl: vehicleImage,
    },
    vehicleIconUrl: vehicleImage || previousRide.vehicleIconUrl || '',
    assignedAt: ride.assignedAt || previousRide.assignedAt || ride.createdAt || null,
    completionRequestedAt: ride.completionRequestedAt || previousRide.completionRequestedAt || null,
    hourlyRate: rideMetrics?.hourlyRate ?? ride.hourlyRate ?? previousRide.hourlyRate ?? 0,
    includedHours: rideMetrics?.includedHours ?? ride.includedHours ?? previousRide.includedHours ?? selectedPackage?.durationHours ?? 0,
    basePrice: rideMetrics?.basePrice ?? ride.basePrice ?? previousRide.basePrice ?? selectedPackage?.price ?? ride.totalCost ?? 0,
    extraHourRate: rideMetrics?.extraHourRate ?? ride.extraHourRate ?? previousRide.extraHourRate ?? selectedPackage?.extraHourPrice ?? 0,
    elapsedMinutes: rideMetrics?.elapsedMinutes ?? ride.elapsedMinutes ?? previousRide.elapsedMinutes ?? 0,
    remainingDue: rideMetrics?.remainingDue ?? ride.remainingDue ?? previousRide.remainingDue ?? 0,
    requestedHours: ride.requestedHours ?? previousRide.requestedHours ?? selectedPackage?.durationHours ?? 0,
    selectedPackage,
    paymentMethodLabel: ride.paymentMethodLabel || previousRide.paymentMethodLabel || '',
    serviceLocation,
    assignedVehicle,
    finalCharge: ride.finalCharge ?? previousRide.finalCharge ?? 0,
    finalElapsedMinutes: ride.finalElapsedMinutes ?? previousRide.finalElapsedMinutes ?? 0,
    updatedAt: ride.updatedAt || previousRide.updatedAt || Date.now(),
  };
};

const isRentalCurrentRide = (ride) =>
  String(ride?.serviceType || ride?.type || '').toLowerCase() === 'rental';

const AGGREGATE_FETCH_LIMIT = 60;

const getPayload = (response) => response?.data?.data || response?.data || response || {};

const buildLocalPagination = (items, page) => {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(Math.max(Number(page) || 1, 1), totalPages);
  const startIndex = (safePage - 1) * PAGE_SIZE;

  return {
    results: items.slice(startIndex, startIndex + PAGE_SIZE),
    pagination: {
      page: safePage,
      limit: PAGE_SIZE,
      total,
      totalPages,
      hasNextPage: safePage < totalPages,
      hasPrevPage: safePage > 1,
    },
  };
};

const sortLatestFirst = (items = []) => [...items].sort((left, right) => Number(right.sortTimestamp || 0) - Number(left.sortTimestamp || 0));

const getRideCategoryForTab = (tab) => {
  if (tab === 'Rides') return 'rides';
  if (tab === 'Parcels') return 'parcels';
  if (tab === 'Outstation') return 'outstation';
  if (tab === 'Scheduled') return 'scheduled';
  return '';
};

const getHelperText = (tab) => {
  if (tab === 'Support') return 'Tickets and help requests';
  if (tab === 'Rental') return 'Your rental bookings, pickup schedule, and booking status';
  if (tab === 'Bus') return 'Your bus tickets, travel timings, and operator details';
  if (tab === 'Pooling') return 'Shared pooling rides, seat reservations, and upcoming departures';
  if (tab === 'Outstation') return 'Long-distance trips and outstation deliveries';
  if (tab === 'Scheduled') return 'Bookings reserved for a later pickup time';
  return 'Your recent trips, deliveries, and bookings';
};

const buildRentalActivityState = (booking) => ({
  ...booking,
  serviceType: 'rental',
  rideId: booking?.id || booking?._id || '',
  status: booking?.status || 'pending',
  summaryMode: String(booking?.status || '').toLowerCase() === 'completed' ? 'completed' : undefined,
});

const Activity = () => {
  const [activeTab, setActiveTab] = useState('All');
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  });
  const navigate = useNavigate();
  const location = useLocation();
  const routePrefix = location.pathname.startsWith('/taxi/user') ? '/taxi/user' : '';

  const [currentRide, setCurrentRide] = useState(() => {
    const ride = getCurrentRide();
    return isActiveCurrentRide(ride) ? ride : null;
  });
  const [clockNow, setClockNow] = useState(() => Date.now());
  const currentRideRef = useRef(currentRide);

  useEffect(() => {
    currentRideRef.current = currentRide;
  }, [currentRide]);

  useEffect(() => {
    const refreshCurrentRide = () => {
      const ride = getCurrentRide();
      if (String(ride?.serviceType || '').toLowerCase() === 'rental') {
        const normalizedRentalRide = normalizeRentalCurrentRideSnapshot(ride, currentRideRef.current || {});
        setCurrentRide(isActiveCurrentRide(normalizedRentalRide) ? normalizedRentalRide : null);
        return;
      }
      setCurrentRide(isActiveCurrentRide(ride) ? ride : null);
    };

    refreshCurrentRide();
    window.addEventListener('storage', refreshCurrentRide);
    window.addEventListener(CURRENT_RIDE_UPDATED_EVENT, refreshCurrentRide);

    return () => {
      window.removeEventListener('storage', refreshCurrentRide);
      window.removeEventListener(CURRENT_RIDE_UPDATED_EVENT, refreshCurrentRide);
    };
  }, []);

  const shouldTickClock =
    String(currentRide?.serviceType || '').toLowerCase() === 'rental'
    || Number.isFinite(currentRide?.scheduledAt ? new Date(currentRide.scheduledAt).getTime() : NaN);

  useEffect(() => {
    if (!shouldTickClock) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setClockNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [shouldTickClock]);

  const driverName = currentRide?.driver?.name || 'Captain';
  const serviceType = String(currentRide?.serviceType || currentRide?.type || 'ride').toLowerCase();
  const vehicleLabel = currentRide?.driver?.vehicle || currentRide?.driver?.vehicleType || (serviceType === 'parcel' ? 'Parcel' : serviceType === 'rental' ? 'Rental' : 'Taxi');
  const currentRideIcon = getCurrentRideIcon(currentRide);
  const trackingPath =
    serviceType === 'parcel'
      ? `${routePrefix}/parcel/tracking`
      : serviceType === 'rental'
        ? `${routePrefix}/rental/confirmed`
        : `${routePrefix}/ride/tracking`;
  const rideStage = String(currentRide?.liveStatus || currentRide?.status || 'accepted').toLowerCase();
  const hasAssignedDriver = Boolean(currentRide?.driver?._id || currentRide?.driver?.id || currentRide?.driver?.name);
  const scheduledTimestamp = currentRide?.scheduledAt ? new Date(currentRide.scheduledAt).getTime() : NaN;
  const isScheduledRide = Number.isFinite(scheduledTimestamp);
  const isScheduledUpcoming = isScheduledRide && scheduledTimestamp > clockNow;
  const isScheduledAcceptedRide = ['ride', 'intercity'].includes(serviceType) && isScheduledUpcoming && hasAssignedDriver && ['accepted', 'arriving'].includes(rideStage);
  const rideStageLabel =
    serviceType === 'rental'
      ? rideStage === 'end_requested'
        ? 'End ride review pending'
        : rideStage === 'assigned'
          ? 'Rental in progress'
          : 'Rental booking active'
      : rideStage === 'started'
        ? serviceType === 'parcel' ? 'Parcel in transit' : 'Ride in progress'
        : rideStage === 'arrived'
          ? serviceType === 'parcel' ? 'Parcel reached destination' : `${driverName} reached destination`
          : rideStage === 'arriving'
            ? serviceType === 'parcel' ? `${driverName} reached sender` : `${driverName} has arrived`
            : serviceType === 'parcel'
              ? 'Parcel booked'
              : 'Ride booked';
  const rideStageContextLabel = isScheduledAcceptedRide
    ? 'Driver assigned for your scheduled trip'
    : rideStageLabel;
  const scheduledDateLabel = formatScheduledDateTime(currentRide?.scheduledAt);
  const scheduledCountdown = getScheduledCountdownLabel(currentRide?.scheduledAt, clockNow);
  const rentalElapsedSeconds = serviceType === 'rental' && currentRide?.assignedAt
    ? String(currentRide?.status || '').toLowerCase() === 'end_requested' && Number(currentRide?.finalElapsedMinutes || 0) > 0
      ? Number(currentRide.finalElapsedMinutes || 0) * 60
      : Math.max(1, Math.floor((clockNow - new Date(currentRide.assignedAt).getTime()) / 1000))
    : Number(currentRide?.elapsedMinutes || 0) * 60;

  const computeRentalLiveCharge = (ride = {}, elapsedSeconds = 0) => {
    const basePrice = Math.max(
      Number(ride?.basePrice || 0),
      Number(ride?.selectedPackage?.price || 0),
      Number(ride?.advancePaid || 0),
      0,
    );
    const includedHours = Math.max(
      Number(ride?.includedHours || 0),
      Number(ride?.selectedPackage?.durationHours || 0),
      Number(ride?.requestedHours || 0) > 0 && Number(ride?.extraHourRate || 0) <= 0 ? Number(ride.requestedHours) : 0,
      1,
    );
    const extraHourRate = Math.max(
      Number(ride?.extraHourRate || 0),
      Number(ride?.selectedPackage?.extraHourPrice || 0),
      0,
    );
    const elapsedHours = Math.max(0, elapsedSeconds / 3600);
    const packageCharge = elapsedHours <= includedHours
      ? basePrice
      : basePrice + Math.ceil(Math.max(0, elapsedHours - includedHours)) * extraHourRate;

    return Math.max(Number(ride?.advancePaid || 0), packageCharge);
  };

  const rentalCurrentCharge = serviceType === 'rental'
    ? String(currentRide?.status || '').toLowerCase() === 'end_requested' && Number(currentRide?.finalCharge || 0) > 0
      ? Number(currentRide.finalCharge || 0)
      : computeRentalLiveCharge(currentRide, rentalElapsedSeconds)
    : Number(currentRide?.fare || 0);

  const formatRentalTime = (totalSeconds) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  };

  const rentalTimerLabel = serviceType === 'rental' ? formatRentalTime(rentalElapsedSeconds) : '';

  useEffect(() => {
    let active = true;

    const loadActivities = async () => {
      setLoading(true);
      setError('');

      try {
        if (activeTab === 'Support') {
          if (!active) return;
          setActivities([]);
          setPagination({
            page: 1,
            limit: PAGE_SIZE,
            total: 0,
            totalPages: 1,
            hasNextPage: false,
            hasPrevPage: false,
          });
          return;
        }

        let nextActivities = [];
        let nextPagination = null;

        if (activeTab === 'Rental') {
          const response = await userService.getMyRentalBookings({
            page: currentPage,
            limit: PAGE_SIZE,
          });
          const payload = getPayload(response);
          const bookings = Array.isArray(payload?.results) ? payload.results : [];
          nextActivities = bookings.map(normalizeRentalBooking).filter((item) => item.id);
          nextPagination = payload?.pagination || null;
        } else if (activeTab === 'Bus') {
          const response = await userBusService.getMyBookings({
            page: currentPage,
            limit: PAGE_SIZE,
          });
          const payload = getPayload(response);
          const bookings = Array.isArray(payload?.results) ? payload.results : [];
          nextActivities = bookings.map(normalizeBusBooking).filter((item) => item.id);
          nextPagination = payload?.pagination || null;
        } else if (activeTab === 'Pooling') {
          const response = await userService.getMyPoolingBookings();
          const payload = getPayload(response);
          const bookings = Array.isArray(payload) ? payload : Array.isArray(payload?.results) ? payload.results : [];
          const localPage = buildLocalPagination(
            sortLatestFirst(bookings.map(normalizePoolingBooking).filter((item) => item.id)),
            currentPage,
          );
          nextActivities = localPage.results;
          nextPagination = localPage.pagination;
        } else if (activeTab === 'All') {
          const [ridesResult, rentalResult, busResult, poolingResult] = await Promise.allSettled([
            api.get('/rides', {
              params: {
                limit: AGGREGATE_FETCH_LIMIT,
                page: 1,
              },
            }),
            userService.getMyRentalBookings({
              page: 1,
              limit: AGGREGATE_FETCH_LIMIT,
            }),
            userBusService.getMyBookings({
              page: 1,
              limit: AGGREGATE_FETCH_LIMIT,
            }),
            userService.getMyPoolingBookings(),
          ]);

          const ridesResponse = ridesResult.status === 'fulfilled' ? ridesResult.value : null;
          const rentalResponse = rentalResult.status === 'fulfilled' ? rentalResult.value : null;
          const busResponse = busResult.status === 'fulfilled' ? busResult.value : null;
          const poolingResponse = poolingResult.status === 'fulfilled' ? poolingResult.value : null;

          const ridePayload = ridesResponse ? getPayload(ridesResponse) : {};
          const rentalPayload = rentalResponse ? getPayload(rentalResponse) : {};
          const busPayload = busResponse ? getPayload(busResponse) : {};
          const poolingPayload = poolingResponse ? getPayload(poolingResponse) : {};
          const rides = Array.isArray(ridePayload?.results) ? ridePayload.results : [];
          const rentalBookings = Array.isArray(rentalPayload?.results) ? rentalPayload.results : [];
          const bookings = Array.isArray(busPayload?.results) ? busPayload.results : [];
          const poolingBookings = Array.isArray(poolingPayload)
            ? poolingPayload
            : Array.isArray(poolingPayload?.results)
              ? poolingPayload.results
              : [];

          const filteredRides = rides.filter(r => {
            const serviceType = String(r.serviceType || r.type || r.category || '').toLowerCase();
            return serviceType !== 'rental';
          });

          const merged = sortLatestFirst([
            ...filteredRides.map(normalizeRide).filter((item) => item.id),
            ...rentalBookings.map(normalizeRentalBooking).filter((item) => item.id),
            ...bookings.map(normalizeBusBooking).filter((item) => item.id),
            ...poolingBookings.map(normalizePoolingBooking).filter((item) => item.id),
          ]);
          const localPage = buildLocalPagination(merged, currentPage);
          nextActivities = localPage.results;
          nextPagination = localPage.pagination;
        } else if (activeTab === 'Rides') {
          const [ridesResult, rentalResult] = await Promise.allSettled([
            api.get('/rides', {
              params: {
                limit: AGGREGATE_FETCH_LIMIT,
                page: 1,
                category: 'rides',
              },
            }),
            userService.getMyRentalBookings({
              page: 1,
              limit: AGGREGATE_FETCH_LIMIT,
            }),
          ]);

          const ridesResponse = ridesResult.status === 'fulfilled' ? ridesResult.value : null;
          const rentalResponse = rentalResult.status === 'fulfilled' ? rentalResult.value : null;

          const ridePayload = ridesResponse ? getPayload(ridesResponse) : {};
          const rentalPayload = rentalResponse ? getPayload(rentalResponse) : {};

          const rides = Array.isArray(ridePayload?.results) ? ridePayload.results : [];
          const rentalBookings = Array.isArray(rentalPayload?.results) ? rentalPayload.results : [];

          const filteredRides = rides.filter(r => {
            const serviceType = String(r.serviceType || r.type || r.category || '').toLowerCase();
            return serviceType !== 'rental';
          });

          const merged = sortLatestFirst([
            ...filteredRides.map(normalizeRide).filter((item) => item.id),
            ...rentalBookings.map(normalizeRentalBooking).filter((item) => item.id),
          ]);
          const localPage = buildLocalPagination(merged, currentPage);
          nextActivities = localPage.results;
          nextPagination = localPage.pagination;
        } else {
          const response = await api.get('/rides', {
            params: {
              limit: PAGE_SIZE,
              page: currentPage,
              category: getRideCategoryForTab(activeTab),
            },
          });
          const payload = getPayload(response);
          const rides = Array.isArray(payload?.results) ? payload.results : [];

          const filteredRides = rides.filter(r => {
            const serviceType = String(r.serviceType || r.type || r.category || '').toLowerCase();
            return serviceType !== 'rental';
          });

          nextActivities = filteredRides.map(normalizeRide).filter((ride) => ride.id);
          nextPagination = payload?.pagination || null;
        }

        if (!active) {
          return;
        }

        setActivities(nextActivities);
        setPagination(nextPagination || {
          page: currentPage,
          limit: PAGE_SIZE,
          total: nextActivities.length,
          totalPages: Math.max(1, Math.ceil(nextActivities.length / PAGE_SIZE)),
          hasNextPage: false,
          hasPrevPage: currentPage > 1,
        });
      } catch (loadError) {
        if (!active) {
          return;
        }

        setError(loadError?.message || 'Could not load your ride history.');
        setActivities([]);
        setPagination({
          page: 1,
          limit: PAGE_SIZE,
          total: 0,
          totalPages: 1,
          hasNextPage: false,
          hasPrevPage: false,
        });
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadActivities();

    return () => {
      active = false;
    };
  }, [activeTab, currentPage, reloadKey]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab]);

  const handleItemClick = (item) => {
    if (item.type === 'bus') {
      navigate(`${routePrefix}/profile/bus-bookings/${item.id}`);
    } else if (item.type === 'rental') {
      navigate(`${routePrefix}/rental/confirmed`, {
        state: toHistorySafeState(buildRentalActivityState(item.booking)),
      });
    } else if (item.type === 'pooling') {
      navigate(`${routePrefix}/pooling`);
    } else if (item.type === 'parcel') {
      navigate(`${routePrefix}/parcel/detail/${item.id}`);
    } else {
      navigate(`${routePrefix}/ride/detail/${item.id}`, {
        state: toHistorySafeState({ ride: item.ride }),
      });
    }
  };
  const helperText = useMemo(() => getHelperText(activeTab), [activeTab]);

  const { theme } = useUserTheme();
  const isDark = theme === 'dark';

  return (
    <div className={`mx-auto flex min-h-screen max-w-lg flex-col font-sans pb-28 transition-colors duration-300 ${
      isDark ? 'bg-slate-950 text-white' : 'bg-slate-50 text-slate-900'
    }`}>
      <ActivityHeader helperText={helperText} onBack={() => navigate(-1)} />
      <ActivityTabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

      <div className="flex-1 px-4 py-4">
        {/* Dynamic Active Ride Card (Rides / Activity Page - Current Ride section) */}
        {currentRide && (
          <div className="mb-4">
            <div
              onClick={() => navigate(trackingPath, { state: currentRide })}
              className={`w-full overflow-hidden rounded-[24px] border p-5 text-left shadow-lg cursor-pointer transition-all duration-300 ${
                isDark 
                  ? 'border-slate-800 bg-slate-900/90 text-white' 
                  : 'border-slate-200 bg-white text-slate-900'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] ${
                  isDark ? 'bg-yellow-400/10 text-yellow-400' : 'bg-emerald-50 text-emerald-700'
                }`}>
                  <ShieldCheck size={11} strokeWidth={3} />
                  Active Trip
                </div>
                <div className="flex items-center gap-1.5">
                  <div className={`h-1.5 w-1.5 rounded-full animate-pulse ${
                    isDark ? 'bg-yellow-400' : 'bg-emerald-500'
                  }`} />
                  <span className={`text-[9px] font-black uppercase tracking-[0.14em] ${
                    isDark ? 'text-yellow-400' : 'text-emerald-600'
                  }`}>Live Status</span>
                </div>
              </div>

              <div className="mt-4 flex items-end justify-between">
                <div>
                  <h2 className="text-[20px] font-black tracking-tight leading-none">
                    {rideStageContextLabel}
                  </h2>
                  <p className="mt-1 text-[11px] font-bold opacity-60">
                    {isScheduledAcceptedRide ? scheduledDateLabel : (serviceType === 'rental' ? 'Rental Booking' : 'Active Booking')}
                  </p>
                </div>
                <div className="relative mb-1">
                  <div className="absolute -inset-4 rounded-full bg-yellow-400/5 blur-xl animate-pulse" />
                  <div className={`relative flex h-12 w-12 items-center justify-center rounded-xl shadow-md border ${
                    isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
                  }`}>
                    <img src={currentRideIcon} alt="" className="h-8 w-8 object-contain" />
                  </div>
                </div>
              </div>

              <div className="mt-4 flex min-w-0 items-center gap-2 text-[11px] font-medium opacity-75">
                <MapPin size={12} className={`shrink-0 ${isDark ? 'text-yellow-400' : 'text-emerald-500'}`} strokeWidth={2.5} />
                <span className="truncate">{currentRide.pickup || 'Pickup location'}</span>
              </div>
              <div className="mt-1 flex min-w-0 items-center gap-2 text-[11px] font-medium opacity-75">
                <MapPin size={12} className={`shrink-0 ${isDark ? 'text-yellow-400' : 'text-orange-500'}`} strokeWidth={2.5} />
                <span className="truncate">{currentRide.drop || 'Drop location'}</span>
              </div>

              {serviceType === 'rental' ? (
                <div className="mt-3.5 flex items-center gap-2 text-[10px] font-medium">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 ${
                    isDark ? 'bg-slate-950 text-slate-300' : 'bg-slate-100 text-slate-600'
                  }`}>
                    <Clock3 size={11} />
                    {rentalTimerLabel}
                  </span>
                  <span className={`rounded-full px-2.5 py-1 ${
                    isDark ? 'bg-yellow-400/10 text-yellow-400' : 'bg-emerald-50 text-emerald-700'
                  }`}>
                    Live charge Rs {rentalCurrentCharge.toFixed(0)}
                  </span>
                </div>
              ) : isScheduledAcceptedRide ? (
                <div className="mt-3.5 flex items-center gap-2 text-[10px] font-medium">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 ${
                    isDark ? 'bg-slate-950 text-slate-300' : 'bg-sky-50 text-sky-700'
                  }`}>
                    <User size={11} />
                    {driverName}
                  </span>
                  {scheduledCountdown ? (
                    <span className={`rounded-full px-2.5 py-1 ${
                      isDark ? 'bg-slate-950 text-slate-400' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {scheduledCountdown}
                    </span>
                  ) : null}
                </div>
              ) : null}

              <div className={`mt-4 flex items-center justify-between rounded-xl p-3 border ${
                isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}>
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`h-8 w-8 shrink-0 rounded-full flex items-center justify-center border ${
                    isDark ? 'bg-slate-900 border-slate-800 text-yellow-400' : 'bg-emerald-50 border-emerald-100 text-emerald-600'
                  }`}>
                    <User size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.14em] opacity-50 leading-none">Driver & Vehicle</p>
                    <p className="mt-0.5 truncate text-[12.5px] font-bold">{driverName} • {vehicleLabel}</p>
                  </div>
                </div>
                <div className="text-right flex items-center gap-3">
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-[0.14em] opacity-50 leading-none">Fare</p>
                    <p className="mt-0.5 text-[12.5px] font-bold">₹{Number(serviceType === 'rental' ? rentalCurrentCharge : currentRide?.fare || 0).toFixed(0)}</p>
                  </div>
                  <div className={`inline-flex h-7 w-7 items-center justify-center rounded-[10px] shadow-sm ${
                    isDark ? 'bg-yellow-400 text-slate-950' : 'bg-slate-900 text-white'
                  }`}>
                    <ChevronRight size={16} strokeWidth={3} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'Support' ? (
          <ActivitySupportState onContact={() => navigate('/support')} />
        ) : loading ? (
          <ActivityLoadingState />
        ) : error ? (
          <ActivityErrorState error={error} onRetry={() => setReloadKey((current) => current + 1)} />
        ) : activities.length === 0 ? (
          <ActivityEmptyState activeTab={activeTab} />
        ) : (
          <div className="space-y-3 pb-2">
            {activities.map((activity) => (
              <ActivityCard key={activity.id} {...activity} onClick={() => handleItemClick(activity)} />
            ))}
            <ActivityPager
              pagination={pagination}
              onPrevious={() => setCurrentPage((page) => Math.max(1, page - 1))}
              onNext={() => setCurrentPage((page) => Math.min(pagination.totalPages, page + 1))}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default Activity;
