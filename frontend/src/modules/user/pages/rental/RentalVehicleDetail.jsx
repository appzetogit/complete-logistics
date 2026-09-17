import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { GoogleMap, OverlayView } from '@react-google-maps/api';
import {
  ArrowLeft,
  Calendar,
  Car,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Fuel,
  Image as ImageIcon,
  Luggage,
  Loader2,
  MapPin,
  Navigation,
  Shield,
  Star,
  Tag,
  Users,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useSettings } from '../../../../shared/context/SettingsContext';
import { toHistorySafeState } from '../../../../shared/utils/historyState';
import { HAS_VALID_GOOGLE_MAPS_KEY, INDIA_CENTER, useBaseGoogleMapsLoader } from '../../../admin/utils/googleMaps';
import { userService } from '../../services/userService';
import { useUserTheme } from '../../../../shared/context/UserThemeContext';

const MAP_CONTAINER_STYLE = { width: '100%', height: '100%' };
const RENTAL_SELECTED_VEHICLE_STORAGE_KEY = 'selectedRentalVehicleDetail';
const WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TIME_OPTIONS = [
  '06:00',
  '07:00',
  '08:00',
  '09:00',
  '10:00',
  '11:00',
  '12:00',
  '13:00',
  '14:00',
  '15:00',
  '16:00',
  '17:00',
  '18:00',
  '19:00',
  '20:00',
  '21:00',
];

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition-all focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100/60';
const pickerTriggerClass =
  'w-full rounded-[18px] border border-slate-200 bg-white px-4 py-3.5 text-left text-sm text-slate-800 shadow-[0_4px_12px_rgba(15,23,42,0.04)] transition-all';

const RentalMapMarker = ({ position, title, color, active = false, onClick }) => (
  <OverlayView
    position={position}
    mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
    getPixelPositionOffset={() => ({ x: -16, y: -32 })}
  >
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="flex flex-col items-center bg-transparent p-0"
    >
      <div
        className="relative h-8 w-8 rounded-full border-2 border-white shadow-[0_8px_18px_rgba(15,23,42,0.25)]"
        style={{ backgroundColor: color, transform: active ? 'scale(1.05)' : 'scale(1)' }}
      >
        <div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/90" />
      </div>
      <div
        style={{
          width: 0,
          height: 0,
          borderLeft: '6px solid transparent',
          borderRight: '6px solid transparent',
          borderTop: `10px solid ${color}`,
          marginTop: -2,
          filter: 'drop-shadow(0 6px 8px rgba(15,23,42,0.18))',
        }}
      />
    </button>
  </OverlayView>
);

const pad = (n) => String(n).padStart(2, '0');
const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const getMonthStart = (date) => new Date(date.getFullYear(), date.getMonth(), 1);
const addMonths = (date, amount) => new Date(date.getFullYear(), date.getMonth() + amount, 1);
const isSameDay = (left, right) =>
  Boolean(left) &&
  Boolean(right) &&
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();
const buildCalendarDays = (monthDate) => {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDayIndex = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];

  for (let index = 0; index < firstDayIndex; index += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(year, month, day));
  }

  return cells;
};
const formatTimeLabel = (time) => {
  const [hours, minutes] = String(time || '00:00').split(':').map(Number);
  const displayHour = hours % 12 || 12;
  const suffix = hours >= 12 ? 'PM' : 'AM';
  return `${displayHour}:${pad(minutes)} ${suffix}`;
};
const formatDateTimeValue = (date, time) => {
  const [hours, minutes] = String(time || '00:00').split(':');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${hours}:${minutes}`;
};
const parseDateTimeValue = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const splitDateTimeValue = (value, fallbackDate = new Date(), fallbackTime = '10:00') => {
  const parsed = parseDateTimeValue(value);
  if (!parsed) {
    return {
      date: new Date(fallbackDate.getFullYear(), fallbackDate.getMonth(), fallbackDate.getDate()),
      time: fallbackTime,
    };
  }

  return {
    date: new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()),
    time: `${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`,
  };
};
const formatPickerSummary = (value) => {
  const parsed = parseDateTimeValue(value);
  if (!parsed) return 'Choose date and time';
  return parsed.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const DateTimePickerModal = ({
  open,
  title,
  monthDate,
  selectedDate,
  selectedTime,
  minDate,
  minTime,
  onMonthChange,
  onDateSelect,
  onTimeSelect,
  onClose,
  onApply,
}) => {
  const days = useMemo(() => buildCalendarDays(monthDate), [monthDate]);
  const minDay = startOfDay(minDate);

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end bg-slate-950/45"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 32 }}
          transition={{ type: 'spring', damping: 26, stiffness: 260 }}
          className="w-full rounded-t-[28px] bg-[#f8fafc] px-5 pb-6 pt-4 shadow-[0_-20px_60px_rgba(15,23,42,0.25)]"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="mx-auto mb-4 h-1.5 w-14 rounded-full bg-slate-300" />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500/80">
                Pick Schedule
              </p>
              <h3 className="mt-1 text-lg font-extrabold text-slate-950">{title}</h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600"
            >
              Close
            </button>
          </div>

          <div className="mt-5 rounded-[24px] border border-white/80 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => onMonthChange(-1)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-600"
              >
                <ChevronLeft size={16} />
              </button>
              <p className="text-[14px] font-bold text-slate-950">
                {monthDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
              </p>
              <button
                type="button"
                onClick={() => onMonthChange(1)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-600"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-7 gap-2 text-center">
              {WEEK_DAYS.map((day) => (
                <div key={day} className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {day}
                </div>
              ))}
              {days.map((day, index) => {
                if (!day) {
                  return <div key={`empty-${index}`} className="h-10" />;
                }

                const disabled = startOfDay(day) < minDay;
                const selected = isSameDay(day, selectedDate);

                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    disabled={disabled}
                    onClick={() => onDateSelect(day)}
                    className={`h-10 rounded-[12px] text-[12px] font-bold transition-all ${
                      selected
                        ? 'bg-[#2e3c78] text-white shadow-[0_10px_24px_rgba(46,60,120,0.28)]'
                        : disabled
                          ? 'bg-slate-100 text-slate-300'
                          : 'border border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    {day.getDate()}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4 rounded-[24px] border border-white/80 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
            <div className="mb-3 flex items-center gap-2">
              <Clock size={15} className="text-slate-400" />
              <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500/80">
                Select Time
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {TIME_OPTIONS.map((time) => {
                const disabled =
                  isSameDay(selectedDate, minDate) && String(time) < String(minTime || '00:00');
                const selected = selectedTime === time;

                return (
                  <button
                    key={time}
                    type="button"
                    disabled={disabled}
                    onClick={() => onTimeSelect(time)}
                    className={`rounded-[12px] px-3 py-2.5 text-[11px] font-bold transition-all ${
                      selected
                        ? 'bg-[#2e3c78] text-white'
                        : disabled
                          ? 'bg-slate-100 text-slate-300'
                          : 'border border-slate-200 bg-slate-50 text-slate-700'
                    }`}
                  >
                    {formatTimeLabel(time)}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={onApply}
            className="mt-5 w-full rounded-[18px] bg-[#2e3c78] px-5 py-3.5 text-sm font-bold text-white shadow-[0_10px_26px_rgba(46,60,120,0.28)]"
          >
            Apply Date & Time
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

const SeatPreview = ({ blueprint }) => {
  const rows = blueprint?.lowerDeck || [];

  if (!rows.length) {
    return (
      <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-6 text-center text-[12px] font-semibold text-slate-400">
        No seating blueprint available
      </div>
    );
  }

  return (
    <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
      <div className="space-y-2">
        {rows.map((row, rowIndex) => (
          <div
            key={`row-${rowIndex}`}
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${Math.max(1, row.length)}, minmax(0, 1fr))` }}
          >
            {row.map((cell, cellIndex) => (
              <div
                key={`${rowIndex}-${cellIndex}`}
                className={`h-11 rounded-2xl ${
                  cell?.kind === 'seat'
                    ? cell.status === 'blocked'
                      ? 'border border-rose-200 bg-rose-50'
                      : 'border border-slate-200 bg-white'
                    : 'bg-transparent'
                }`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

const packageSuffix = (hours) => {
  const value = Number(hours || 0);
  if (value <= 1) return '/hr';
  if (value <= 12) return `/${value}hr`;
  return '/day';
};

const toRadians = (value) => (Number(value) * Math.PI) / 180;

const calculateDistanceKm = (from, to) => {
  if (!from || !to) return null;

  const fromLat = Number(from.latitude);
  const fromLng = Number(from.longitude);
  const toLat = Number(to.latitude);
  const toLng = Number(to.longitude);

  if (
    !Number.isFinite(fromLat) ||
    !Number.isFinite(fromLng) ||
    !Number.isFinite(toLat) ||
    !Number.isFinite(toLng)
  ) {
    return null;
  }

  const earthRadiusKm = 6371;
  const latDelta = toRadians(toLat - fromLat);
  const lngDelta = toRadians(toLng - fromLng);
  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(toRadians(fromLat)) *
      Math.cos(toRadians(toLat)) *
      Math.sin(lngDelta / 2) ** 2;

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const formatDistance = (value) => {
  if (!Number.isFinite(value)) return null;
  if (value < 1) return `${Math.max(100, Math.round(value * 1000))} m away`;
  return `${value.toFixed(value < 10 ? 1 : 0)} km away`;
};

const toMapPoint = (latitude, longitude) => {
  const lat = Number(latitude);
  const lng = Number(longitude);

  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng };
  }

  return null;
};

const buildRentalMapPinIcon = (color = '#10b981', isSelected = false) => {
  const pinSvg = `
    <svg width="34" height="42" viewBox="0 0 34 42" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M17 41C17 41 31 27.2 31 17C31 9.26801 24.732 3 17 3C9.26801 3 3 9.26801 3 17C3 27.2 17 41 17 41Z" fill="${color}" stroke="${isSelected ? '#ffffff' : '#E2E8F0'}" stroke-width="${isSelected ? 3 : 2}"/>
      <circle cx="17" cy="17" r="5.5" fill="white"/>
    </svg>
  `;

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(pinSvg)}`,
    scaledSize: new window.google.maps.Size(isSelected ? 34 : 30, isSelected ? 42 : 38),
    anchor: new window.google.maps.Point(isSelected ? 17 : 15, isSelected ? 42 : 38),
  };
};

const normalizeListResponse = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.data?.results)) return payload.data.results;
  if (Array.isArray(payload?.data?.data?.results)) return payload.data.data.results;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

const normalizeId = (value) =>
  String(value?._id || value?.id || value?.service_location_id || value || '').trim();

const resolveStoreServiceLocationId = (store = {}) =>
  normalizeId(
    store.service_location_id ||
    store.zone_id?.service_location_id ||
    '',
  );

const getCurrentCoordinates = () =>
  new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: Number(position.coords.latitude),
          longitude: Number(position.coords.longitude),
        }),
      () => resolve(null),
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 5 * 60 * 1000,
      },
    );
  });

const readStoredRentalVehicleDetail = () => {
  try {
    const raw = window.sessionStorage.getItem(RENTAL_SELECTED_VEHICLE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed ? parsed : {};
  } catch {
    return {};
  }
};

const readStoredUserInfo = () => {
  try {
    const raw = window.localStorage.getItem('userInfo');
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed ? parsed : {};
  } catch {
    return {};
  }
};

const RentalVehicleDetail = () => {
  
  const { theme } = useUserTheme();
  const isDark = theme === 'dark';
  const navigate = useNavigate();
  const location = useLocation();
  const { settings } = useSettings();
  const appName = settings.general?.app_name || 'App';
  const storedDetail = useMemo(() => readStoredRentalVehicleDetail(), []);
  const storedUserInfo = useMemo(() => readStoredUserInfo(), []);
  const initialVehicle = location.state?.vehicle || storedDetail?.vehicle || null;
  const duration = location.state?.duration || storedDetail?.duration || 'Hourly';
  const [vehicle, setVehicle] = useState(initialVehicle);

  const [selectedImage, setSelectedImage] = useState(
    vehicle?.gallery?.[0] || vehicle?.galleryImages?.[0] || vehicle?.coverImage || vehicle?.image || '',
  );
  const [showQuoteForm, setShowQuoteForm] = useState(false);
  const [selectedPackageId, setSelectedPackageId] = useState('');
  const [selectionStep, setSelectionStep] = useState('package');
  const [serviceLocations, setServiceLocations] = useState([]);
  const [selectedServiceLocationId, setSelectedServiceLocationId] = useState('');
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [userCoordinates, setUserCoordinates] = useState(null);
  const [isLocatingUser, setIsLocatingUser] = useState(false);
  const mapRef = useRef(null);
  const { isLoaded: isMapLoaded, loadError: mapLoadError } = useBaseGoogleMapsLoader();
  const [quoteForm, setQuoteForm] = useState({
    contactName: String(storedUserInfo?.name || '').trim(),
    contactPhone: String(storedUserInfo?.phone || '').trim(),
    contactEmail: String(storedUserInfo?.email || '').trim(),
    requestedHours: '',
    pickupLocation: '',
    dropLocation: '',
    seatsNeeded: '',
    luggageNeeded: Number(vehicle?.luggageCapacity || 0) || 0,
    pickupDateTime: '',
    returnDateTime: '',
    specialRequirements: '',
  });
  const [submittingQuote, setSubmittingQuote] = useState(false);
  const [activeQuotePicker, setActiveQuotePicker] = useState(null);
  const [quotePickerMonth, setQuotePickerMonth] = useState(() => getMonthStart(new Date()));
  const [quotePickerDate, setQuotePickerDate] = useState(() => startOfDay(new Date()));
  const [quotePickerTime, setQuotePickerTime] = useState('10:00');

  useEffect(() => {
    setVehicle(initialVehicle);
  }, [initialVehicle]);

  useEffect(() => {
    if (!vehicle?.id && !vehicle?._id) return;

    let active = true;

    const refreshVehicle = async () => {
      try {
        const response = await userService.getRentalVehicles();
        const results =
          response?.data?.results ||
          response?.results ||
          response?.data?.data?.results ||
          [];

        if (!active) return;

        const latestVehicle = results.find(
          (item) => String(item.id || item._id) === String(vehicle.id || vehicle._id),
        );

        if (!latestVehicle) return;

        const mergedGallery = [
          ...(Array.isArray(latestVehicle.galleryImages) ? latestVehicle.galleryImages : []),
          ...(Array.isArray(latestVehicle.gallery) ? latestVehicle.gallery : []),
          ...(Array.isArray(vehicle.galleryImages) ? vehicle.galleryImages : []),
          ...(Array.isArray(vehicle.gallery) ? vehicle.gallery : []),
        ].filter((value, index, array) => value && array.indexOf(value) === index);

        setVehicle((current) => ({
          ...current,
          ...latestVehicle,
          rawPricing: Array.isArray(latestVehicle.pricing)
            ? latestVehicle.pricing
            : Array.isArray(current?.rawPricing)
              ? current.rawPricing
              : [],
          galleryImages: mergedGallery,
          gallery: [
            latestVehicle.coverImage,
            latestVehicle.image,
            ...mergedGallery,
            latestVehicle.map_icon,
          ].filter((value, index, array) => value && array.indexOf(value) === index),
        }));
      } catch {
        // Keep existing route or cached state if refresh fails.
      }
    };

    refreshVehicle();

    return () => {
      active = false;
    };
  }, [vehicle?.id, vehicle?._id]);

  useEffect(() => {
    if (!vehicle) return;

    try {
      window.sessionStorage.setItem(
        RENTAL_SELECTED_VEHICLE_STORAGE_KEY,
        JSON.stringify({ vehicle, duration }),
      );
    } catch {
      // Ignore storage failures and continue rendering with route state only.
    }
  }, [duration, vehicle]);

  if (!vehicle) {
    navigate('/rental');
    return null;
  }

  const gallery = useMemo(
    () =>
      [
        ...(Array.isArray(vehicle.gallery) ? vehicle.gallery : []),
        ...(Array.isArray(vehicle.galleryImages) ? vehicle.galleryImages : []),
        vehicle.coverImage,
        vehicle.image,
        vehicle.map_icon,
      ].filter((value, index, array) => value && array.indexOf(value) === index),
    [vehicle],
  );

  useEffect(() => {
    setSelectedImage(gallery[0] || '');
  }, [gallery]);
  const pricingRows = Array.isArray(vehicle.rawPricing)
    ? [...vehicle.rawPricing].sort(
        (a, b) => Number(a.durationHours || 0) - Number(b.durationHours || 0),
      )
    : Array.isArray(vehicle.pricing)
      ? [...vehicle.pricing].sort(
          (a, b) => Number(a.durationHours || 0) - Number(b.durationHours || 0),
        )
      : [];

  const defaultPackage = useMemo(() => {
    if (!pricingRows.length) return null;

    if (duration === 'Daily') {
      return (
        pricingRows.find((row) => Number(row.durationHours || 0) >= 24) ||
        pricingRows[pricingRows.length - 1]
      );
    }

    if (duration === 'Half-Day') {
      return (
        pricingRows.find((row) => {
          const hours = Number(row.durationHours || 0);
          return hours >= 6 && hours <= 12;
        }) || pricingRows[Math.min(1, pricingRows.length - 1)]
      );
    }

    return (
      pricingRows.find((row) => Number(row.durationHours || 0) <= 6) ||
      pricingRows[0]
    );
  }, [duration, pricingRows]);

  const selectedPackage = useMemo(
    () =>
      pricingRows.find((row) => String(row.id) === String(selectedPackageId)) ||
      defaultPackage ||
      null,
    [defaultPackage, pricingRows, selectedPackageId],
  );

  const selectedServiceLocation = useMemo(
    () =>
      serviceLocations.find(
        (item) => String(item.id) === String(selectedServiceLocationId),
      ) || null,
    [selectedServiceLocationId, serviceLocations],
  );

  const selectedLocationMapPoint = useMemo(
    () =>
      selectedServiceLocation?.pickupPoints?.[0]?.position ||
      selectedServiceLocation?.primaryPoint ||
      null,
    [selectedServiceLocation],
  );

  const mapCenter = useMemo(
    () => selectedLocationMapPoint || serviceLocations[0]?.primaryPoint || INDIA_CENTER,
    [selectedLocationMapPoint, serviceLocations],
  );

  const mapMarkers = useMemo(
    () =>
      serviceLocations.flatMap((locationItem, index) => {
        const markers = [];
        const isSelected = String(locationItem.id) === String(selectedServiceLocationId);
        const isClosest = index === 0 && Boolean(userCoordinates);

        if (locationItem.primaryPoint && (!locationItem.pickupPoints || locationItem.pickupPoints.length === 0)) {
          markers.push({
            key: `location-${locationItem.id}`,
            position: locationItem.primaryPoint,
            title: locationItem.pickupLabel || locationItem.name,
            type: 'location',
            locationId: locationItem.id,
            isSelected,
            isClosest,
          });
        }

        (locationItem.pickupPoints || []).forEach((pickupPoint, pickupIndex) => {
          markers.push({
            key: `pickup-${locationItem.id}-${pickupPoint.id || pickupIndex}`,
            position: pickupPoint.position,
            title: pickupPoint.name || locationItem.pickupLabel || `${locationItem.name} pickup point`,
            type: 'pickup',
            locationId: locationItem.id,
            isSelected,
            isClosest,
          });
        });

        return markers;
      }),
    [selectedServiceLocationId, serviceLocations, userCoordinates],
  );

  const summaryBadges = useMemo(
    () => [
      { icon: Users, label: `${vehicle.capacity || 0} seats` },
      { icon: Luggage, label: `${vehicle.luggageCapacity || 0} bags` },
      { icon: Fuel, label: vehicle.vehicleCategory || 'Vehicle' },
    ],
    [vehicle],
  );

  useEffect(() => {
    if (defaultPackage?.id) {
      setSelectedPackageId(String(defaultPackage.id));
    }
  }, [defaultPackage]);

  useEffect(() => {
    if (!isMapLoaded || !mapRef.current || !window.google?.maps || !mapMarkers.length) {
      return;
    }

    const bounds = new window.google.maps.LatLngBounds();
    mapMarkers.forEach((marker) => bounds.extend(marker.position));

    if (bounds.isEmpty()) {
      mapRef.current.setCenter(mapCenter);
      mapRef.current.setZoom(12);
      return;
    }

    if (mapMarkers.length === 1 && selectedLocationMapPoint) {
      mapRef.current.panTo(selectedLocationMapPoint);
      mapRef.current.setZoom(13);
      return;
    }

    mapRef.current.fitBounds(bounds, 56);
  }, [isMapLoaded, mapCenter, mapMarkers, selectedLocationMapPoint]);

  useEffect(() => {
    let mounted = true;

    const loadServiceLocations = async () => {
      setLocationsLoading(true);
      setLocationError('');
      setIsLocatingUser(true);

      try {
        const [locationsResponse, storesResponse, coords] = await Promise.all([
          userService.getServiceLocations(),
          userService.getServiceStores(),
          getCurrentCoordinates(),
        ]);

        if (!mounted) return;

        setUserCoordinates(coords);
        setIsLocatingUser(false);

        const allLocations = normalizeListResponse(locationsResponse).filter(
          (item) => item.active !== false && item.status !== 'inactive',
        );
        const allStores = normalizeListResponse(storesResponse).filter(
          (item) => item.active !== false && item.status !== 'inactive',
        );

        const allowedStoreIds = new Set(
          Array.isArray(vehicle.serviceStoreIds)
            ? vehicle.serviceStoreIds.map((item) => String(item))
            : [],
        );

        const scopedStores = allowedStoreIds.size
          ? allStores.filter((store) => allowedStoreIds.has(String(store._id || store.id)))
          : allStores;

        const allowedLocationIds = new Set(
          scopedStores
            .map((store) => resolveStoreServiceLocationId(store))
            .filter(Boolean),
        );

        const scopedLocations = allowedLocationIds.size
          ? allLocations.filter((item) => allowedLocationIds.has(normalizeId(item)))
          : allLocations;

        const optionsFromLocations = scopedLocations
          .map((item) => {
            const id = normalizeId(item);
            const locationStores = scopedStores.filter(
              (store) => resolveStoreServiceLocationId(store) === id,
            );
            const primaryStore = locationStores.find(
              (store) => String(store.name || '').trim() || String(store.address || '').trim(),
            ) || locationStores[0] || null;
            const pickupPoints = locationStores
              .map((store, storeIndex) => {
                const position = toMapPoint(store.latitude, store.longitude);

                if (!position) return null;

                return {
                  id: String(store._id || store.id || `${id}-pickup-${storeIndex}`),
                  name: store.name || `Pickup point ${storeIndex + 1}`,
                  address: store.address || '',
                  position,
                };
              })
              .filter(Boolean);
            const primaryPoint =
              toMapPoint(item.latitude, item.longitude) ||
              pickupPoints[0]?.position ||
              null;

            const distanceCandidates = [
              calculateDistanceKm(coords, {
                latitude: item.latitude,
                longitude: item.longitude,
              }),
              ...locationStores.map((store) =>
                calculateDistanceKm(coords, {
                  latitude: store.latitude,
                  longitude: store.longitude,
                }),
              ),
            ].filter((value) => Number.isFinite(value));

            const nearestDistanceKm = distanceCandidates.length
              ? Math.min(...distanceCandidates)
              : null;

            return {
              id,
              name: item.service_location_name || item.name || 'Service location',
              pickupLabel: primaryStore?.name || '',
              address:
                primaryStore?.address ||
                item.address ||
                primaryStore?.name ||
                '',
              latitude: Number(item.latitude),
              longitude: Number(item.longitude),
              primaryPoint: pickupPoints[0]?.position || primaryPoint,
              pickupPoints,
              distanceKm: nearestDistanceKm,
              distanceLabel: formatDistance(nearestDistanceKm),
              storeCount: locationStores.length,
            };
          })
          .sort((left, right) => {
            const leftDistance = left.distanceKm;
            const rightDistance = right.distanceKm;

            if (Number.isFinite(leftDistance) && Number.isFinite(rightDistance)) {
              return leftDistance - rightDistance;
            }

            if (Number.isFinite(leftDistance)) return -1;
            if (Number.isFinite(rightDistance)) return 1;

            return left.name.localeCompare(right.name);
          });

        const options =
          optionsFromLocations.length > 0
            ? optionsFromLocations
            : scopedStores
                .map((store, storeIndex) => {
                  const resolvedLocationId = resolveStoreServiceLocationId(store);
                  const matchedLocation = allLocations.find(
                    (item) => normalizeId(item) === resolvedLocationId,
                  );
                  const position = toMapPoint(store.latitude, store.longitude);

                  if (!position) {
                    return null;
                  }

                  const distanceKm = calculateDistanceKm(coords, {
                    latitude: store.latitude,
                    longitude: store.longitude,
                  });

                  return {
                    id: resolvedLocationId || String(store._id || store.id || `store-${storeIndex}`),
                    name:
                      matchedLocation?.service_location_name ||
                      matchedLocation?.name ||
                      store.zone_id?.name ||
                      'Service location',
                    pickupLabel: store.name || '',
                    address: store.address || store.name || '',
                    latitude: Number(store.latitude),
                    longitude: Number(store.longitude),
                    primaryPoint: position,
                    pickupPoints: [
                      {
                        id: String(store._id || store.id || `pickup-${storeIndex}`),
                        name: store.name || `Pickup point ${storeIndex + 1}`,
                        address: store.address || '',
                        position,
                      },
                    ],
                    distanceKm,
                    distanceLabel: formatDistance(distanceKm),
                    storeCount: 1,
                  };
                })
                .filter(Boolean)
                .sort((left, right) => {
                  const leftDistance = left.distanceKm;
                  const rightDistance = right.distanceKm;

                  if (Number.isFinite(leftDistance) && Number.isFinite(rightDistance)) {
                    return leftDistance - rightDistance;
                  }

                  if (Number.isFinite(leftDistance)) return -1;
                  if (Number.isFinite(rightDistance)) return 1;

                  return left.name.localeCompare(right.name);
                });

        setServiceLocations(options);
        setSelectedServiceLocationId(options[0]?.id || '');
      } catch (error) {
        if (!mounted) return;
        setIsLocatingUser(false);
        setLocationError(error?.message || 'Could not load available service locations.');
      } finally {
        if (mounted) setLocationsLoading(false);
      }
    };

    loadServiceLocations();

    return () => {
      mounted = false;
    };
  }, [vehicle.serviceStoreIds]);

  const submitQuote = async () => {
    if (!quoteForm.requestedHours || Number(quoteForm.requestedHours) <= 0) {
      toast.error('Enter required hours');
      return;
    }

    if (!quoteForm.pickupDateTime || !quoteForm.returnDateTime) {
      toast.error('Select the full date range');
      return;
    }

    if (new Date(quoteForm.returnDateTime) <= new Date(quoteForm.pickupDateTime)) {
      toast.error('End date and time must be after the start');
      return;
    }

    if (!quoteForm.contactName.trim() || !quoteForm.contactPhone.trim()) {
      toast.error('Please update your profile name and phone before sending a custom quote');
      return;
    }

    setSubmittingQuote(true);
    try {
      await userService.createRentalQuoteRequest({
        vehicleTypeId: vehicle.id,
        vehicleName: vehicle.name,
        contactName: quoteForm.contactName,
        contactPhone: quoteForm.contactPhone,
        contactEmail: quoteForm.contactEmail,
        requestedHours: Number(quoteForm.requestedHours || 0),
        pickupLocation: quoteForm.pickupLocation,
        dropLocation: quoteForm.dropLocation,
        seatsNeeded: Number(quoteForm.seatsNeeded || 1),
        luggageNeeded: Number(quoteForm.luggageNeeded || 0),
        pickupDateTime: quoteForm.pickupDateTime || null,
        returnDateTime: quoteForm.returnDateTime || null,
        specialRequirements: quoteForm.specialRequirements,
      });
      toast.success('Custom quote request sent to admin for review');
      setShowQuoteForm(false);
      setQuoteForm((current) => ({
        ...current,
        requestedHours: '',
        pickupDateTime: '',
        returnDateTime: '',
      }));
    } catch (error) {
      toast.error(error?.message || 'Could not submit quote request.');
    } finally {
      setSubmittingQuote(false);
    }
  };

  const openQuotePicker = (field) => {
    const now = new Date();
    const fallbackDate =
      field === 'returnDateTime' && quoteForm.pickupDateTime
        ? parseDateTimeValue(quoteForm.pickupDateTime) || now
        : now;
    const fallbackTime = field === 'returnDateTime' ? '12:00' : '10:00';
    const { date, time } = splitDateTimeValue(quoteForm[field], fallbackDate, fallbackTime);

    setActiveQuotePicker(field);
    setQuotePickerDate(date);
    setQuotePickerTime(time);
    setQuotePickerMonth(getMonthStart(date));
  };

  const closeQuotePicker = () => {
    setActiveQuotePicker(null);
  };

  const applyQuotePicker = () => {
    if (!activeQuotePicker) return;

    const nextValue = formatDateTimeValue(quotePickerDate, quotePickerTime);
    setQuoteForm((current) => {
      const nextForm = {
        ...current,
        [activeQuotePicker]: nextValue,
      };

      if (
        activeQuotePicker === 'pickupDateTime' &&
        current.returnDateTime &&
        new Date(nextForm.returnDateTime) <= new Date(nextValue)
      ) {
        nextForm.returnDateTime = '';
      }

      return nextForm;
    });
    setActiveQuotePicker(null);
  };

  const pickerMinDate = useMemo(() => {
    if (activeQuotePicker === 'returnDateTime' && quoteForm.pickupDateTime) {
      const pickup = parseDateTimeValue(quoteForm.pickupDateTime);
      if (pickup) {
        return pickup;
      }
    }

    return new Date();
  }, [activeQuotePicker, quoteForm.pickupDateTime]);

  const pickerMinTime = useMemo(() => {
    const minDate = pickerMinDate;
    if (!isSameDay(quotePickerDate, minDate)) {
      return '06:00';
    }

    const currentTime = `${pad(minDate.getHours())}:${pad(minDate.getMinutes())}`;
    const nearest = TIME_OPTIONS.find((time) => String(time) >= currentTime);
    return nearest || TIME_OPTIONS[TIME_OPTIONS.length - 1];
  }, [pickerMinDate, quotePickerDate]);

  const handleProceed = () => {
    if (!selectedPackage) {
      toast.error('Select an hourly rental package first.');
      return;
    }

    if (selectionStep === 'package') {
      setSelectionStep('location');
      return;
    }

    if (!selectedServiceLocation) {
      toast.error('Select a service location to continue.');
      return;
    }

    navigate('/rental/schedule', {
      state: toHistorySafeState({
        vehicle,
        duration,
        selectedPackage,
        serviceLocation: selectedServiceLocation,
        userCoordinates,
      }),
    });
  };

  return (
    <div className={`min-h-screen max-w-lg mx-auto font-sans pb-36 relative overflow-hidden transition-colors duration-300 ${isDark ? 'bg-[#05070D] text-white' : 'bg-[linear-gradient(180deg,#F8FAFC_0%,#F3F4F6_38%,#EEF2F7_100%)]'}`}>
      <div className={`absolute -top-16 right-[-40px] h-44 w-44 rounded-full blur-3xl pointer-events-none ${isDark ? 'bg-orange-500/5' : 'bg-orange-100/60'}`} />

      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="sticky top-0 z-30 w-full"
      >
        <div className={`backdrop-blur-2xl px-5 pt-12 pb-5 border-b relative overflow-hidden ${
          isDark ? 'bg-[#0f1b2d]/85 border-zinc-800/80' : 'bg-white/85 border-white/40 shadow-[0_8px_32px_rgba(15,23,42,0.06)]'
        }`}>
          {/* Subtle accent gradients */}
          <div className="absolute top-0 right-0 h-32 w-32 rounded-full bg-orange-400/5 blur-[40px] pointer-events-none" />
          <div className="absolute top-0 left-0 h-24 w-24 rounded-full bg-blue-400/5 blur-[40px] pointer-events-none" />

          <div className="relative flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <motion.button
                whileHover={{ x: -2 }}
                whileTap={{ scale: 0.92 }}
                onClick={() => navigate(-1)}
                className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 group transition-all ${
                  isDark ? 'bg-[#111827] hover:bg-zinc-800' : 'bg-slate-900 shadow-[0_4px_12px_rgba(15,23,42,0.15)]'
                }`}
              >
                <ArrowLeft size={20} className="text-white group-hover:opacity-80 transition-opacity" strokeWidth={2.5} />
              </motion.button>
              <div className="min-w-0">
                <p className={`text-[10px] font-bold uppercase tracking-[0.18em] leading-none mb-1.5 ${isDark ? 'text-zinc-500' : 'text-slate-500/60'}`}>Vehicle Details</p>
                <h1 className={`text-[22px] font-[900] tracking-tight leading-none truncate max-w-[200px] ${isDark ? 'text-white' : 'text-slate-955'}`}>
                  {vehicle.name}
                </h1>
              </div>
            </div>
          </div>
        </div>
      </motion.header>

      <div className="px-5 pt-5 space-y-4">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className={`rounded-[24px] border overflow-hidden shadow-sm ${
            isDark ? 'border-zinc-800 bg-[#0f1b2d]' : 'border-white/80 bg-white/90 shadow-[0_8px_24px_rgba(15,23,42,0.06)]'
          }`}
        >
          <div
            className="px-6 py-6 flex items-center justify-center"
            style={isDark ? { background: 'linear-gradient(135deg, #111c2a 0%, #0f1b2d 100%)' } : { background: `linear-gradient(135deg, ${vehicle.gradientFrom} 0%, ${vehicle.gradientTo} 100%)` }}
          >
            {selectedImage ? (
              <img src={selectedImage} alt={vehicle.name} className="h-36 object-contain drop-shadow-xl" />
            ) : (
              <div className={`flex h-36 w-full items-center justify-center ${isDark ? 'text-slate-700 bg-slate-950/20' : 'text-slate-300'}`}>
                <Car size={48} />
              </div>
            )}
          </div>
          <div className="px-5 py-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span
                  className={`inline-block text-[9px] font-bold px-2 py-0.5 rounded-full border ${vehicle.tagBg} ${vehicle.tagColor} mb-1.5`}
                >
                  {vehicle.tag}
                </span>
                <h2 className={`text-[20px] font-extrabold tracking-tight leading-tight ${isDark ? 'text-white' : 'text-slate-955'}`}>
                  {vehicle.name}
                </h2>
                {vehicle.shortDescription ? (
                  <p className={`mt-1 text-[12px] font-semibold ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                    {vehicle.shortDescription}
                  </p>
                ) : null}
                <div className="flex items-center gap-1.5 mt-1">
                  <Star size={12} className="text-yellow-500 fill-yellow-400" />
                  <span className={`text-[13px] font-bold ${isDark ? 'text-zinc-350' : 'text-slate-700'}`}>{vehicle.rating}</span>
                  <span className={`text-[11px] font-bold ${isDark ? 'text-zinc-500' : 'text-slate-400'}`}>
                    {selectedPackage
                      ? `- ${selectedPackage.includedKm} km included`
                      : `- ${vehicle.kmLimit?.[duration] || 'Flexible km'} limit`}
                  </span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className={`text-[9px] font-bold uppercase tracking-[0.12em] ${isDark ? 'text-zinc-500' : 'text-slate-500'}`}>
                  Rate
                </p>
                <p className={`text-[24px] font-extrabold leading-none ${isDark ? 'text-white' : 'text-slate-955'}`}>
                  Rs.{selectedPackage?.price || vehicle.prices?.[duration] || 0}
                </p>
                <p className={`text-[11px] font-bold ${isDark ? 'text-zinc-450' : 'text-slate-400'}`}>
                  {selectedPackage
                    ? packageSuffix(selectedPackage.durationHours)
                    : { Hourly: '/hr', 'Half-Day': '/6hr', Daily: '/day' }[duration] || '/hr'}
                </p>
              </div>
            </div>

            {gallery.length > 1 ? (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {gallery.map((image) => (
                  <button
                    key={image}
                    type="button"
                    onClick={() => setSelectedImage(image)}
                    className={`h-16 w-16 shrink-0 overflow-hidden rounded-2xl border transition-colors ${
                      selectedImage === image 
                        ? isDark ? 'border-[#FFC400]' : 'border-slate-900' 
                        : isDark ? 'border-zinc-800 bg-[#05070D]' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <img src={image} alt="Vehicle gallery" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="grid grid-cols-3 gap-3"
        >
          {summaryBadges.map(({ icon: Icon, label }) => (
            <div
              key={label}
              className={`rounded-[18px] border px-3 py-3 shadow-sm ${
                isDark ? 'border-zinc-800 bg-[#0f1b2d]' : 'border-white/80 bg-white/90 shadow-[0_4px_14px_rgba(15,23,42,0.05)]'
              }`}
            >
              <Icon size={15} className={isDark ? 'text-zinc-500' : 'text-slate-400'} />
              <p className={`mt-2 text-[12px] font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{label}</p>
            </div>
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className={`rounded-[20px] border px-5 py-4 space-y-3 shadow-sm ${
            isDark ? 'border-zinc-800 bg-[#0f1b2d]' : 'border-white/80 bg-white/90 shadow-[0_4px_14px_rgba(15,23,42,0.05)]'
          }`}
        >
          <p className={`text-[10px] font-bold uppercase tracking-[0.15em] ${isDark ? 'text-zinc-500' : 'text-slate-500/80'}`}>
            What's included
          </p>
          <div className="space-y-2">
            {(vehicle.amenities?.length ? vehicle.amenities : vehicle.features).map((feature) => (
              <div key={feature} className="flex items-center gap-2.5">
                <CheckCircle2 size={14} className="text-emerald-500 shrink-0" strokeWidth={2.5} />
                <span className={`text-[13px] font-bold ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>{feature}</span>
              </div>
            ))}
          </div>
          {vehicle.description ? (
            <p className={`text-[12px] font-semibold leading-relaxed ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
              {vehicle.description}
            </p>
          ) : null}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
          className={`rounded-[20px] border px-5 py-4 space-y-3 shadow-sm ${
            isDark ? 'border-zinc-800 bg-[#0f1b2d]' : 'border-white/80 bg-white/90 shadow-[0_4px_14px_rgba(15,23,42,0.05)]'
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Tag size={14} className="text-slate-400" />
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500/80">
                Choose Hourly Rental
              </p>
            </div>
            <span className="rounded-full bg-orange-50 px-3 py-1 text-[10px] font-bold text-orange-600">
              {selectionStep === 'package' ? 'Step 1 of 2' : 'Step 2 of 2'}
            </span>
          </div>

          <div className="space-y-3">
            {pricingRows.map((row) => {
              const isSelected = String(selectedPackageId) === String(row.id);

              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setSelectedPackageId(String(row.id))}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition-all ${
                    isSelected
                      ? 'border-slate-900 bg-slate-900 text-white shadow-[0_10px_24px_rgba(15,23,42,0.16)]'
                      : 'border-slate-100 bg-slate-50 hover:border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className={`text-sm font-bold ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                        {row.label}
                      </p>
                      <p className={`text-[11px] font-semibold ${isSelected ? 'text-white/75' : 'text-slate-500'}`}>
                        {row.durationHours} hours - {row.includedKm} km included
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-bold ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                        Rs.{row.price}
                      </p>
                      <p className={`text-[11px] font-semibold ${isSelected ? 'text-white/75' : 'text-slate-500'}`}>
                        {packageSuffix(row.durationHours)}
                      </p>
                    </div>
                  </div>
                  <div className={`mt-2 text-[11px] font-semibold ${isSelected ? 'text-white/80' : 'text-slate-500'}`}>
                    Extra hour: Rs.{row.extraHourPrice || 0} - Extra km: Rs.{row.extraKmPrice || 0}
                  </div>
                </button>
              );
            })}
          </div>
        </motion.div>

        <AnimatePresence mode="wait">
          {selectionStep === 'location' ? (
            <motion.div
              key="location-step"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              className="rounded-[20px] border border-white/80 bg-white/90 shadow-[0_4px_14px_rgba(15,23,42,0.05)] px-5 py-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500/80">
                    Available Service Locations
                  </p>
                  <p className="mt-1 text-[13px] font-bold text-slate-700">
                    Select where you want to pick up your rental.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectionStep('package')}
                  className="shrink-0 rounded-full border border-slate-200 px-3 py-1 text-[11px] font-bold text-slate-500"
                >
                  <span className="inline-flex items-center gap-1">
                    <ChevronLeft size={12} /> Back
                  </span>
                </button>
              </div>

              <div className="rounded-2xl bg-slate-50 px-4 py-3 text-[12px] font-bold text-slate-500">
                {isLocatingUser
                  ? 'Finding your current location to sort the closest service points...'
                  : userCoordinates
                    ? 'Service locations are sorted by distance from your current location. The nearest option is preselected.'
                    : 'Location access was unavailable, so service locations are shown in fallback order.'}
              </div>

              {locationsLoading ? (
                <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-6 text-[12px] font-bold text-slate-500">
                  <Loader2 size={16} className="animate-spin" />
                  Loading service locations...
                </div>
              ) : locationError ? (
                <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-4 text-[12px] font-bold text-rose-500">
                  {locationError}
                </div>
              ) : serviceLocations.length === 0 ? (
                <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-6 text-[12px] font-bold text-slate-500">
                  No active service locations are available for this rental right now.
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="overflow-hidden rounded-[22px] border border-slate-100 bg-slate-50">
                    <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-white/80 px-4 py-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500/80">
                          Pickup Map
                        </p>
                        <p className="mt-0.5 text-[12px] font-bold text-slate-600">
                          Available rental pickup points pinned on Google Maps.
                        </p>
                      </div>
                      {selectedServiceLocation?.distanceLabel ? (
                        <span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-bold text-emerald-700">
                          {selectedServiceLocation.distanceLabel}
                        </span>
                      ) : null}
                    </div>

                    <div className="relative h-64 w-full bg-slate-200">
                      {!HAS_VALID_GOOGLE_MAPS_KEY ? (
                        <div className="flex h-full items-center justify-center px-6 text-center">
                          <div className="rounded-[18px] bg-white/90 px-4 py-4 shadow-sm">
                            <p className="text-[12px] font-bold text-slate-900">Google Maps key missing</p>
                            <p className="mt-1 text-[11px] font-bold text-slate-500">
                              Set `VITE_GOOGLE_MAPS_API_KEY` in `frontend/.env`.
                            </p>
                          </div>
                        </div>
                      ) : mapLoadError ? (
                        <div className="flex h-full items-center justify-center px-6 text-center">
                          <div className="rounded-[18px] bg-white/90 px-4 py-4 shadow-sm">
                            <p className="text-[12px] font-bold text-slate-900">Google Maps failed to load</p>
                            <p className="mt-1 text-[11px] font-bold text-slate-500">
                              Check the browser key restrictions and reload.
                            </p>
                          </div>
                        </div>
                      ) : !isMapLoaded ? (
                        <div className="flex h-full items-center justify-center">
                          <div className="flex items-center gap-2 rounded-[16px] bg-white/90 px-4 py-3 shadow-sm">
                            <Loader2 size={18} className="animate-spin text-slate-500" />
                            <span className="text-[12px] font-bold text-slate-700">Loading map</span>
                          </div>
                        </div>
                      ) : (
                        <GoogleMap
                          mapContainerStyle={MAP_CONTAINER_STYLE}
                          center={mapCenter}
                          zoom={12}
                          onLoad={(map) => {
                            mapRef.current = map;
                          }}
                          options={{
                            disableDefaultUI: true,
                            zoomControl: true,
                            clickableIcons: false,
                            streetViewControl: false,
                            fullscreenControl: false,
                            mapTypeControl: false,
                            gestureHandling: 'greedy',
                          }}
                        >
                          {mapMarkers.map((marker) => (
                            <RentalMapMarker
                              key={marker.key}
                              position={marker.position}
                              title={marker.title}
                              onClick={() => setSelectedServiceLocationId(String(marker.locationId))}
                              color={marker.isSelected ? '#10b981' : marker.type === 'location' ? '#0f172a' : '#f59e0b'}
                              active={marker.isSelected || marker.isClosest}
                            />
                          ))}
                        </GoogleMap>
                      )}
                    </div>
                  </div>

                  {serviceLocations.map((item, index) => {
                    const isSelected = String(selectedServiceLocationId) === String(item.id);

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSelectedServiceLocationId(String(item.id))}
                        className={`w-full rounded-2xl border px-4 py-3 text-left transition-all ${
                          isSelected
                            ? 'border-emerald-200 bg-emerald-50 shadow-[0_10px_24px_rgba(16,185,129,0.10)]'
                            : 'border-slate-100 bg-white hover:border-slate-200'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-[14px] font-black text-slate-900">{item.name}</p>
                              {index === 0 && userCoordinates ? (
                                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-700">
                                  Closest
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-1 flex items-start gap-2">
                              <MapPin size={13} className="mt-0.5 shrink-0 text-orange-400" />
                              <div>
                                {item.pickupLabel ? (
                                  <p className="text-[12px] font-black text-slate-700">
                                    {item.pickupLabel}
                                  </p>
                                ) : null}
                                <p className="text-[12px] font-bold text-slate-600">
                                  {item.address || `${appName} pickup point`}
                                </p>
                                <p className="mt-0.5 text-[11px] font-semibold text-slate-400">
                                  {item.storeCount > 0
                                    ? `${item.storeCount} pickup point${item.storeCount === 1 ? '' : 's'} available`
                                    : 'Pickup available'}
                                  {item.distanceLabel ? ` - ${item.distanceLabel}` : ''}
                                </p>
                              </div>
                            </div>
                          </div>
                          {isSelected ? (
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                              <CheckCircle2 size={16} />
                            </div>
                          ) : (
                            <Navigation size={16} className="mt-1 shrink-0 text-slate-300" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </motion.div>
          ) : null}
        </AnimatePresence>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.14 }}
          className="rounded-[20px] border border-white/80 bg-white/90 shadow-[0_4px_14px_rgba(15,23,42,0.05)] px-5 py-4 space-y-3"
        >
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
            Seats Layout
          </p>
          <SeatPreview blueprint={vehicle.blueprint} />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16 }}
          className="flex items-center gap-3 rounded-[16px] border border-white/80 bg-white/90 px-4 py-3.5 shadow-[0_4px_14px_rgba(15,23,42,0.04)]"
        >
          <div className="w-8 h-8 rounded-[10px] bg-slate-50 flex items-center justify-center shrink-0">
            <Shield size={15} className="text-slate-400" strokeWidth={2} />
          </div>
          <p className="text-[11px] font-bold text-slate-400 leading-relaxed">
            Valid driving license required. Refundable security deposit collected at booking.
          </p>
        </motion.div>

        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={() => setShowQuoteForm((current) => !current)}
          className="w-full rounded-[18px] border border-slate-200 bg-white px-5 py-4 text-[14px] font-black text-slate-900 shadow-[0_8px_24px_rgba(15,23,42,0.08)]"
        >
          Request Custom Quote
        </motion.button>

        <AnimatePresence>
          {showQuoteForm ? (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.08)] space-y-4"
            >
              <div className="flex items-center gap-2">
                <ImageIcon size={15} className="text-slate-400" />
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
                  Custom Quote Request
                </p>
              </div>
              <p className="text-[12px] font-semibold text-slate-500">
                Share just the rental hours and your date range. The admin team can review and send back a custom price.
              </p>
              <div className="grid gap-4">
                <div className="space-y-2">
                  <label className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                    Hours needed
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={quoteForm.requestedHours}
                    onChange={(event) =>
                      setQuoteForm((current) => ({
                        ...current,
                        requestedHours: event.target.value,
                      }))
                    }
                    className={inputClass}
                    placeholder="Enter rental hours"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                    Start date and time
                  </label>
                  <button
                    type="button"
                    onClick={() => openQuotePicker('pickupDateTime')}
                    className={pickerTriggerClass}
                  >
                    <span className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-indigo-50 text-indigo-700">
                        <Calendar size={18} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                          Tap to choose
                        </span>
                        <span className="mt-1 block truncate text-sm font-bold text-slate-800">
                          {formatPickerSummary(quoteForm.pickupDateTime)}
                        </span>
                      </span>
                    </span>
                  </button>
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                    End date and time
                  </label>
                  <button
                    type="button"
                    onClick={() => openQuotePicker('returnDateTime')}
                    className={pickerTriggerClass}
                  >
                    <span className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-sky-50 text-sky-700">
                        <Clock size={18} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                          Tap to choose
                        </span>
                        <span className="mt-1 block truncate text-sm font-bold text-slate-800">
                          {formatPickerSummary(quoteForm.returnDateTime)}
                        </span>
                      </span>
                    </span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={submitQuote}
                  disabled={submittingQuote}
                  className="w-full rounded-[16px] bg-[#2e3c78] px-5 py-3 text-sm font-black text-white disabled:opacity-60"
                >
                  {submittingQuote ? 'Sending Request...' : 'Send To Admin For Review'}
                </button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
        <DateTimePickerModal
          open={Boolean(activeQuotePicker)}
          title={activeQuotePicker === 'returnDateTime' ? 'Select End Date & Time' : 'Select Start Date & Time'}
          monthDate={quotePickerMonth}
          selectedDate={quotePickerDate}
          selectedTime={quotePickerTime}
          minDate={pickerMinDate}
          minTime={pickerMinTime}
          onMonthChange={(amount) => setQuotePickerMonth((current) => addMonths(current, amount))}
          onDateSelect={setQuotePickerDate}
          onTimeSelect={setQuotePickerTime}
          onClose={closeQuotePicker}
          onApply={applyQuotePicker}
        />
      </div>

      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg px-5 pb-6 pt-3 bg-gradient-to-t from-[#EEF2F7] via-[#F3F4F6]/95 to-transparent pointer-events-none z-30">
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={handleProceed}
          disabled={
            !selectedPackage ||
            (selectionStep === 'location' &&
              (locationsLoading || !selectedServiceLocation))
          }
          className={`pointer-events-auto w-full py-4 rounded-[18px] text-[15px] font-black text-white shadow-[0_8px_24px_rgba(15,23,42,0.18)] flex items-center justify-center gap-2 transition-all ${
            !selectedPackage ||
            (selectionStep === 'location' && (locationsLoading || !selectedServiceLocation))
              ? 'bg-slate-300'
              : 'bg-slate-900'
          }`}
        >
          {selectionStep === 'package' ? 'Proceed to Service Location' : 'Select Date & Time'}
          <ChevronRight size={17} strokeWidth={3} className="opacity-50" />
        </motion.button>
      </div>
    </div>
  );
};

export default RentalVehicleDetail;
