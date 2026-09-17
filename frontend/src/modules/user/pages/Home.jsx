import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarClock, ChevronRight, Clock3, MapPin, ShieldCheck, User, Clock, Heart, Search, X } from 'lucide-react';
import HeaderGreeting from '../components/HeaderGreeting';
import ServiceGrid, { ServiceCard } from '../components/ServiceGrid';
import LocationMapSection from '../components/LocationMapSection';
import ActionsSection from '../components/ActionsSection';
import PromoBanners from '../components/PromoBanners';
import ExplorerSection from '../components/ExplorerSection';
import CheckUsOutSection from '../components/CheckUsOutSection';
// ... removed import ...

import taxiFallback from '../../../assets/user-app/taxi.png';
import bikeFallback from '../../../assets/user-app/bike.png';
import deliveryFallback from '../../../assets/user-app/delivery.png';
import parcelFallback from '../../../assets/user-app/parcel.png';
import truckFallback from '../../../assets/user-app/truck.png';
import busFallback from '../../../assets/user-app/bus.png';
import fallbackCar from '../../../assets/user-app/fallback-car.png';
import yellowTaxiImg from '../../../assets/user-app/yellow-taxi.jpg';
import indiaGateRealImg from '@/assets/india_gate_real.png';
import seamlessHighwayBg from '@/assets/seamless_highway_bg.png';
import airplaneIcon from '../../../assets/3d images/AutoCab/airoplan.png';
import railwayIcon from '../../../assets/3d images/AutoCab/one way.png';
import busStationIcon from '../../../assets/3d images/AutoCab/bus.png';
import api from '../../../shared/api/axiosInstance';
import { useSettings } from '../../../shared/context/SettingsContext';
import { useUserTheme } from '../../../shared/context/UserThemeContext';
import { BACKEND_ORIGIN } from '../../../shared/api/runtimeConfig';

const getDynamicImageSrc = (item = {}, fallbackImage) => {
  const rawImage = item.uploadedImage || item.imageUrl || item.image || item.bannerImage || item.thumbnail || item.url || item.icon || null;

  if (!rawImage) {
    return fallbackImage;
  }

  let imageUrl = rawImage;
  if (!rawImage.startsWith('http') && !rawImage.startsWith('data:')) {
    const origin = (typeof BACKEND_ORIGIN !== 'undefined' ? BACKEND_ORIGIN : 'http://localhost:5000').replace('/api/v1', '');
    const cleanPath = rawImage.startsWith('/') ? rawImage : `/${rawImage}`;
    imageUrl = `${origin}${cleanPath}`;
  }

  if (item.updatedAt) {
    const separator = imageUrl.includes('?') ? '&' : '?';
    imageUrl = `${imageUrl}${separator}v=${item.updatedAt}`;
  }

  return imageUrl;
};

const SafeImage = ({ item, fallbackImage, className, alt, ...props }) => {
  const resolved = getDynamicImageSrc(item, fallbackImage);
  const [src, setSrc] = useState(resolved);

  useEffect(() => {
    setSrc(resolved);
  }, [resolved]);

  return (
    <img
      src={src}
      alt={alt || item?.title || ''}
      className={className}
      loading="lazy"
      onError={() => {
        setSrc(fallbackImage);
      }}
      {...props}
    />
  );
};

const PromoBannerImage = ({ promo, fallbackImage }) => {
  const resolved = getDynamicImageSrc(promo, fallbackImage);
  const [src, setSrc] = useState(resolved);

  useEffect(() => {
    setSrc(resolved);
  }, [resolved]);

  return (
    <>
      <img
        src={src}
        alt=""
        style={{ display: 'none' }}
        onError={() => setSrc(fallbackImage)}
      />
      <div
        className="absolute inset-0 bg-cover bg-no-repeat transition-transform duration-700 ease-out group-hover:scale-105"
        style={{
          backgroundImage: `url(${src})`,
          backgroundPosition: 'center',
        }}
      />
    </>
  );
};

const FooterBannerImage = ({ footerSettings, fallbackImage }) => {
  const { theme } = useUserTheme();
  const isDark = theme === 'dark';

  const hasCustomMedia = footerSettings?.uploadedImage || footerSettings?.imageUrl || footerSettings?.image;
  const resolved = hasCustomMedia ? getDynamicImageSrc(footerSettings, fallbackImage) : fallbackImage;

  const [src, setSrc] = useState(resolved);

  useEffect(() => {
    setSrc(resolved);
  }, [resolved]);

  const isVideo = src && (
    src.endsWith('.mp4') ||
    src.endsWith('.webm') ||
    src.endsWith('.ogg') ||
    src.includes('/video/') ||
    src.includes('video')
  );

  if (isVideo) {
    return (
      <div key={src} className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <video
          key={src}
          src={src}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          className={`w-full h-full object-cover ${isDark ? 'opacity-55' : 'opacity-100'}`}
        />
      </div>
    );
  }

  return (
    <>
      <img
        src={src}
        alt=""
        style={{ display: 'none' }}
        onError={() => setSrc(fallbackImage)}
      />
      <motion.div
        key={src}
        className="absolute inset-0 pointer-events-none bg-repeat-x"
        style={{
          backgroundImage: `url(${src})`,
          backgroundSize: 'auto 100%',
          backgroundPosition: '0px center',
          mixBlendMode: 'normal',
          willChange: 'transform, background-position, opacity',
        }}
        initial={{ opacity: 0, scale: 1.05 }}
        animate={{
          opacity: isDark ? 0.6 : 0.8,
          scale: 1,
          backgroundPosition: ["0px center", "-2000px center"],
        }}
        transition={{
          opacity: { duration: 1.2 },
          scale: { duration: 1.5, ease: "easeOut" },
          backgroundPosition: {
            duration: 35,
            repeat: Infinity,
            ease: "linear",
          }
        }}
      />
    </>
  );
};
import { userService } from '../services/userService';
import { getLocalUserToken, clearLocalUserSession } from '../services/authService';
import {
  CURRENT_RIDE_UPDATED_EVENT,
  getCurrentRide,
  getCurrentRideSignature,
  isActiveCurrentRide,
  saveCurrentRide,
  clearCurrentRide,
} from '../services/currentRideService';

const Motion = motion;
const ACTIVE_RIDE_SYNC_INTERVAL_MS = 15000;
const IDLE_RIDE_SYNC_INTERVALS_MS = [60000, 120000, 180000];
const DEFERRED_SECTION_DELAY_MS = 250;
const FORCED_SYNC_COOLDOWN_MS = 10000;

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

const defaultSettings = {
  homeSections: {
    enableEverything: true,
    enableExplore: true,
    enablePromo: true,
    enableGoPlaces: true,
    enableFooter: true
  },
  everything: [
    { id: '1', title: 'Parcel', subtitle: 'Send anything', image: '', route: '/taxi/user/parcel/type', order: 1, status: 'active' },
    { id: '2', title: 'Bike Taxi', subtitle: 'Beat the traffic', image: '', route: '/taxi/user/ride/select-location', order: 2, status: 'active' },
    { id: '3', title: 'Book now', subtitle: 'Your everyday rides', image: '', route: '/taxi/user/ride/select-location', order: 3, status: 'active' },
    { id: '4', title: 'All Services', subtitle: 'All Services', image: '', route: '', order: 4, status: 'active' }
  ],
  explore: [
    { id: '1', title: 'Parcel on Bike', image: '', route: '/taxi/user/parcel/type', order: 1, status: 'active' },
    { id: '2', title: 'Auto', image: '', route: '/taxi/user/ride/select-location', order: 2, status: 'active' },
    { id: '3', title: 'Cab Economy', image: '', route: '/taxi/user/ride/select-location', order: 3, status: 'active' },
    { id: '4', title: 'Bike', image: '', route: '/taxi/user/ride/select-location', order: 4, status: 'active' }
  ],
  promos: [
    { id: '1', title: 'Experience A New Standard With Appzeto ', subtitle: 'A premier private hire service where luxury and reliability converge.', image: '', route: '/taxi/user/ride/select-location', order: 1, status: 'active' },
    { id: '2', title: 'Need to Send Packages? Try Parcel!', subtitle: 'Fast and secure delivery across Indore at affordable prices.', image: '', route: '/taxi/user/parcel/type', order: 2, status: 'active' }
  ],
  goPlaces: [
    { id: '1', title: 'Hassle-Free Airport Rides', image: '', route: '/taxi/user/ride/select-location', order: 1, status: 'active' },
    { id: '2', title: 'Quick Rides to Railway Station', image: '', route: '/taxi/user/ride/select-location', order: 2, status: 'active' },
    { id: '3', title: 'Ride to Bus Terminal', image: '', route: '/taxi/user/ride/select-location', order: 3, status: 'active' }
  ],
  footer: {
    hashtag: '#goAppzeto 24',
    line1: 'Made for India',
    line2: 'Crafted for riders'
  }
};

const unwrapApiPayload = (response) => response?.data?.data || response?.data || response;

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

const calculateDistanceKm = (fromCoords, toCoords) => {
  const [fromLng, fromLat] = fromCoords;
  const [toLng, toLat] = toCoords;

  if (![fromLng, fromLat, toLng, toLat].every((value) => Number.isFinite(Number(value)))) {
    return null;
  }

  const toRadians = (value) => (Number(value) * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const latDelta = toRadians(toLat - fromLat);
  const lngDelta = toRadians(toLng - fromLng);
  const startLat = toRadians(fromLat);
  const endLat = toRadians(toLat);
  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(startLat) * Math.cos(endLat) * Math.sin(lngDelta / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return (earthRadiusKm * c).toFixed(1);
};

const RecentLocationsList = ({ routePrefix }) => {
  const navigate = useNavigate();
  const { theme } = useUserTheme();
  const isDark = theme === 'dark';

  const [recentLocations, setRecentLocations] = useState(() => {
    try {
      const saved = window.localStorage.getItem('Appzeto 24:recentLocations');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) { }
    // Pre-fill with dynamic defaults from reference screenshot if empty
    return [
      {
        name: 'Prakash Bakery',
        address: 'Bk Sindhi Colony, Indore, Madhya Pradesh, India',
        lat: 22.7039,
        lon: 75.9048,
        distance: '2.5 km',
      },
      {
        name: 'Navlakha Bus Stand',
        address: 'Ahilyapur, Chhanera, New Harsud, Harsud, Madhya Pradesh',
        lat: 22.6926,
        lon: 75.8586,
        distance: '3.1 km',
      },
      {
        name: 'Jhabua Tower Road',
        address: 'Chhoti Gwaltoli, Indore, Madhya Pradesh, India',
        lat: 22.7187,
        lon: 75.8553,
        distance: '1.2 km',
      },
    ];
  });

  const getSavedLocationCoords = () => {
    try {
      const saved = JSON.parse(window.localStorage.getItem('Appzeto 24:lastLocation') || '{}');
      const lat = Number(saved?.lat);
      const lon = Number(saved?.lon);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        return [lon, lat];
      }
    } catch (e) { }
    return null;
  };

  useEffect(() => {
    const handleRefresh = () => {
      try {
        const saved = window.localStorage.getItem('Appzeto 24:recentLocations');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setRecentLocations(parsed);
          }
        }
      } catch (e) { }
    };
    window.addEventListener('storage', handleRefresh);
    window.addEventListener('Appzeto 24:recent-locations-updated', handleRefresh);
    return () => {
      window.removeEventListener('storage', handleRefresh);
      window.removeEventListener('Appzeto 24:recent-locations-updated', handleRefresh);
    };
  }, []);

  const recentList = useMemo(() => {
    const currentCoords = getSavedLocationCoords();
    return recentLocations.map((item) => {
      let distanceLabel = item.distance;
      if (currentCoords && item.lat && item.lon) {
        const distKm = calculateDistanceKm(currentCoords, [item.lon, item.lat]);
        if (distKm !== null) {
          distanceLabel = `${distKm} km`;
        }
      }
      return {
        ...item,
        distance: distanceLabel || 'Recent',
      };
    }).slice(0, 3);
  }, [recentLocations]);

  return (
    <div className="space-y-1 mt-2">
      {recentList.map((item, index) => (
        <div key={index} className="w-full">
          <div
            className={`w-full flex items-center justify-between gap-3 py-3 text-left rounded-xl px-2 transition-colors duration-200 ${isDark ? 'hover:bg-slate-900/40' : 'hover:bg-slate-100/60'
              }`}
          >
            <div
              onClick={() =>
                navigate(`${routePrefix}/ride/select-location`, {
                  state: {
                    drop: item.address,
                    dropCoords: item.lat && item.lon ? [item.lon, item.lat] : null,
                    activeInput: 'drop',
                  },
                })
              }
              className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
            >
              <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 border ${isDark ? 'bg-slate-900 border-slate-800 text-slate-400' : 'bg-slate-100 border-slate-200 text-slate-500'
                }`}>
                <Clock size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className={`text-[14px] font-bold leading-tight truncate ${isDark ? 'text-white' : 'text-[#0B1220]'}`}>
                  {item.name}
                </h4>
                <p className={`text-[11px] font-medium mt-1 truncate ${isDark ? 'text-zinc-400' : 'text-[#64748B]'}`}>
                  {item.distance && `${item.distance} • `}{item.address}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const updated = recentLocations.map((loc) => {
                  if (loc.address === item.address) {
                    return { ...loc, favourite: !loc.favourite };
                  }
                  return loc;
                });
                setRecentLocations(updated);
                localStorage.setItem('Appzeto 24:recentLocations', JSON.stringify(updated));
              }}
              className={`hover:text-rose-500 transition-colors px-1 shrink-0 ${item.favourite ? 'text-rose-500' : 'text-slate-400'
                }`}
            >
              <Heart size={16} fill={item.favourite ? 'currentColor' : 'none'} />
            </button>
          </div>
          {index < recentList.length - 1 && (
            <div className={`border-b border-dashed mx-2 ${isDark ? 'border-slate-800/80' : 'border-slate-200/80'}`} />
          )}
        </div>
      ))}
    </div>
  );
};

const Home = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { settings, loading: settingsLoading } = useSettings();
  const { theme } = useUserTheme();
  const isDark = theme === 'dark';
  const appName = settings.general?.app_name || 'App';
  const [uiSettings, setUiSettings] = useState(() => {
    try {
      if (settings?.userHomeSettings && Object.keys(settings.userHomeSettings).length > 0) {
        return settings.userHomeSettings;
      }
      const saved = window.localStorage.getItem('Appzeto 24:admin:user-app-settings');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    return defaultSettings;
  });

  useEffect(() => {
    if (settings?.userHomeSettings && Object.keys(settings.userHomeSettings).length > 0) {
      setUiSettings(prev => {
        if (JSON.stringify(prev) === JSON.stringify(settings.userHomeSettings)) {
          return prev;
        }
        return settings.userHomeSettings;
      });
    }
  }, [settings?.userHomeSettings]);

  useEffect(() => {
    const handleStorageChange = () => {
      try {
        const saved = window.localStorage.getItem('Appzeto 24:admin:user-app-settings');
        if (saved) {
          const parsed = JSON.parse(saved);
          setUiSettings(prev => {
            if (JSON.stringify(prev) === JSON.stringify(parsed)) {
              return prev;
            }
            return parsed;
          });
        } else {
          if (settings?.userHomeSettings && Object.keys(settings.userHomeSettings).length > 0) {
            setUiSettings(prev => {
              if (JSON.stringify(prev) === JSON.stringify(settings.userHomeSettings)) {
                return prev;
              }
              return settings.userHomeSettings;
            });
          } else {
            setUiSettings(prev => prev === defaultSettings ? prev : defaultSettings);
          }
        }
      } catch (e) {
        console.error(e);
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [settings?.userHomeSettings]);

  const [isExpanded, setIsExpanded] = useState(false);
  const [isAllServicesOpen, setIsAllServicesOpen] = useState(false);
  const [activeServices, setActiveServices] = useState([]);
  const [pickupAddress, setPickupAddress] = useState(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem('Appzeto 24:lastLocation') || '{}');
      return String(saved?.address || '').trim() || 'Indore, Madhya Pradesh';
    } catch (e) {
      return 'Indore, Madhya Pradesh';
    }
  });
  const [isLocationLoading, setIsLocationLoading] = useState(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem('Appzeto 24:lastLocation') || '{}');
      return !saved?.address;
    } catch {
      return true;
    }
  });

  useEffect(() => {
    const handleLocationUpdate = () => {
      try {
        const saved = JSON.parse(window.localStorage.getItem('Appzeto 24:lastLocation') || '{}');
        setPickupAddress(String(saved?.address || '').trim() || 'Indore, Madhya Pradesh');
      } catch (e) { }
    };
    const handleLocationStatus = (e) => {
      setIsLocationLoading(e.detail === 'loading');
    };
    window.addEventListener('Appzeto 24:location-updated', handleLocationUpdate);
    window.addEventListener('Appzeto 24:location-status', handleLocationStatus);
    return () => {
      window.removeEventListener('Appzeto 24:location-updated', handleLocationUpdate);
      window.removeEventListener('Appzeto 24:location-status', handleLocationStatus);
    };
  }, []);

  const [currentRide, setCurrentRide] = useState(() => {
    const ride = getCurrentRide();
    return isActiveCurrentRide(ride) ? ride : null;
  });
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [endingRide, setEndingRide] = useState(false);
  const [showDeferredSections, setShowDeferredSections] = useState(false);
  const [currentPromoIndex, setCurrentPromoIndex] = useState(0);
  const [isHoveringPromo, setIsHoveringPromo] = useState(false);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const [isProgrammaticScrolling, setIsProgrammaticScrolling] = useState(false);
  const promoScrollRef = useRef(null);
  const isProgrammaticScrollRef = useRef(false);
  const programmaticScrollTimeoutRef = useRef(null);
  const routePrefix = location.pathname.startsWith('/taxi/user') ? '/taxi/user' : '';
  const currentRideRef = useRef(currentRide);
  const lastSyncAtRef = useRef(0);
  const consecutiveIdleMissesRef = useRef(0);
  const lastRideSignatureRef = useRef(getCurrentRideSignature(currentRide));

  const persistCurrentRide = (ride) => {
    const normalizedRide = isActiveCurrentRide(ride) ? ride : null;
    const nextSignature = getCurrentRideSignature(normalizedRide);

    if (lastRideSignatureRef.current === nextSignature) {
      return;
    }

    lastRideSignatureRef.current = nextSignature;
    setCurrentRide(normalizedRide);

    if (normalizedRide) {
      saveCurrentRide(normalizedRide);
    } else {
      clearCurrentRide();
    }
  };

  useEffect(() => {
    currentRideRef.current = currentRide;
    lastRideSignatureRef.current = getCurrentRideSignature(currentRide);
  }, [currentRide]);

  const rawBanners = uiSettings?.promos || defaultSettings.promos;
  const promoBanners = useMemo(() => {
    if (!Array.isArray(rawBanners)) return [];
    return rawBanners.filter(b => {
      const imageSrc = b.uploadedImage || b.imageUrl || b.image || b.bannerImage || b.thumbnail || b.url;
      return b.status !== false && b.status !== 'inactive' && imageSrc;
    });
  }, [rawBanners]);

  useEffect(() => {
    setCurrentPromoIndex(0);
  }, [promoBanners.length]);

  useEffect(() => {
    if (!promoBanners || promoBanners.length <= 1) return;
    if (isHoveringPromo) return;

    const interval = setInterval(() => {
      setCurrentPromoIndex(prev => (prev + 1) % promoBanners.length);
    }, 3000);

    return () => clearInterval(interval);
  }, [promoBanners.length, isHoveringPromo]);



  useEffect(() => {
    const timer = setTimeout(() => {
      const container = document.querySelector('.user-home') || document.querySelector('.user-app') || document.querySelector('.user-home-page');
      if (container) {
        container.scrollTop = 220;
      }
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  const handleEndRide = async () => {
    if (!currentRide?.rideId) return;

    try {
      setEndingRide(true);
      const response = await userService.endRentalRide(currentRide.rideId);
      const payload = response?.data || null;
      const nextRideState = {
        ...currentRide,
        ...payload,
        rideId: payload?.id || currentRide.rideId,
        status: payload?.status || 'end_requested',
        liveStatus: payload?.status || 'end_requested',
      };
      persistCurrentRide(nextRideState);
      navigate(`${routePrefix}/rental/confirmed`, {
        state: nextRideState,
      });
    } catch (error) {
      console.error(error);
    } finally {
      setEndingRide(false);
    }
  };

  const handleServiceClick = (service) => {
    // Scroll everything to top immediately upon clicking a service
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    if (document.documentElement) document.documentElement.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    if (document.body) document.body.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    document.querySelectorAll('.overflow-y-auto, [class*="overflow-y-auto"], .overflow-y-scroll, .no-scrollbar').forEach(el => {
      el.scrollTop = 0;
    });

    // Helper to map fallback routes to registered routes defensively
    const cleanRoute = (route) => {
      if (!route) return '/taxi/user/ride/select-location';
      if (route === '/delivery') return '/taxi/user/parcel/type';
      if (route === '/rental') return '/taxi/user/rental';
      if (route === '/bus') return '/taxi/user/bus';
      if (route === '/truck') return '/taxi/user/ride/select-location';
      if (route === '/self-drive') return '/taxi/user/rental';
      return route;
    };

    const targetRoute = service.actionRoute || service.route;

    if (targetRoute === "ALL_SERVICES_MODAL") {
      setIsAllServicesOpen(true);
      return;
    }

    if (targetRoute && targetRoute.trim() !== '') {
      setIsAllServicesOpen(false);

      let vehicleType = '';
      const tName = String(service.name || service.label || service.title || "").toLowerCase();
      if (tName.includes('bike') || tName.includes('moto')) vehicleType = 'bike';
      else if (tName.includes('auto')) vehicleType = 'auto';
      else if (tName.includes('cab') || tName.includes('taxi') || tName.includes('car') || tName === 'book now' || tName === 'ride') vehicleType = 'cab';
      else if (tName.includes('parcel') || tName.includes('delivery')) vehicleType = 'parcel';

      console.log('--- TEMPORARY DEBUG LOG ---');
      console.log('selectedVehicleType from home:', vehicleType);

      if (vehicleType) {
        localStorage.setItem('selectedVehicleType', vehicleType);
        navigate(`/taxi/user/ride/select-vehicle?vehicleType=${vehicleType}`, { state: { selectedCategory: vehicleType } });
      } else {
        localStorage.removeItem('selectedVehicleType');
        navigate(cleanRoute(targetRoute), { state: { selectedCategory: vehicleType } });
      }
      return;
    }

    const name = String(service.name || service.label || service.title || "").toLowerCase();
    const serviceType = String(service.service_type || service.serviceType || service.moduleService || "").toLowerCase();
    const transportType = String(service.transport_type || service.transportType || "").toLowerCase();

    // Close any open bottom sheet/modal
    setIsAllServicesOpen(false);

    const definedPath = service.path;
    if (definedPath && definedPath.trim() !== '') {
      let vehicleType = '';
      if (name.includes('bike') || name.includes('moto')) vehicleType = 'bike';
      else if (name.includes('auto')) vehicleType = 'auto';
      else if (name.includes('cab') || name.includes('taxi') || name.includes('car') || name === 'book now' || name === 'ride') vehicleType = 'cab';
      else if (name.includes('parcel') || name.includes('delivery')) vehicleType = 'parcel';

      console.log('--- TEMPORARY DEBUG LOG ---');
      console.log('selectedVehicleType from home:', vehicleType);

      if (vehicleType) {
        localStorage.setItem('selectedVehicleType', vehicleType);
        navigate(`/taxi/user/ride/select-vehicle?vehicleType=${vehicleType}`, { state: { selectedCategory: vehicleType } });
      } else {
        localStorage.removeItem('selectedVehicleType');
        navigate(cleanRoute(definedPath), { state: { selectedCategory: vehicleType } });
      }
      return;
    }

    if (name.includes("parcel") || name.includes("delivery") || name.includes("courier") || serviceType.includes("delivery") || serviceType.includes("parcel")) {
      navigate("/taxi/user/parcel/type");
      return;
    }

    if (name.includes("rental") || serviceType.includes("rental") || name.includes("self-drive")) {
      navigate("/taxi/user/rental");
      return;
    }

    if (name.includes("bus") || transportType.includes("bus") || serviceType.includes("bus")) {
      navigate("/taxi/user/bus");
      return;
    }

    if (name.includes("pooling") || serviceType.includes("pooling")) {
      navigate("/taxi/user/pooling");
      return;
    }

    if (name.includes("outstation") || name.includes("intercity") || serviceType.includes("intercity")) {
      navigate("/taxi/user/intercity");
      return;
    }

    if (name.includes("truck")) {
      navigate("/taxi/user/ride/select-location");
      return;
    }

    // Extract category if it matches common ride types
    let selectedCategory = '';
    if (name.includes('bike') || name.includes('moto')) selectedCategory = 'bike';
    else if (name.includes('auto')) selectedCategory = 'auto';
    else if (name.includes('cab') || name.includes('taxi') || name.includes('car')) selectedCategory = 'cab';

    // Default ride / taxi / cab / bike flow
    navigate("/taxi/user/ride/select-location", { state: { selectedCategory } });
  };

  useEffect(() => {
    const token = getLocalUserToken();
    if (!token) {
      clearLocalUserSession();
      navigate('/taxi/user/login', { replace: true });
    }
  }, [navigate]);

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

  useEffect(() => {
    let cancelled = false;
    const scheduleDeferredSections = window.requestIdleCallback
      ? window.requestIdleCallback(() => {
        if (!cancelled) {
          setShowDeferredSections(true);
        }
      }, { timeout: DEFERRED_SECTION_DELAY_MS })
      : window.setTimeout(() => {
        if (!cancelled) {
          setShowDeferredSections(true);
        }
      }, DEFERRED_SECTION_DELAY_MS);

    return () => {
      cancelled = true;
      if (typeof scheduleDeferredSections === 'number') {
        window.clearTimeout(scheduleDeferredSections);
        return;
      }

      window.cancelIdleCallback?.(scheduleDeferredSections);
    };
  }, []);

  useEffect(() => {
    const refreshCurrentRide = () => {
      const ride = getCurrentRide();
      if (String(ride?.serviceType || '').toLowerCase() === 'rental') {
        const normalizedRentalRide = normalizeRentalCurrentRideSnapshot(ride, currentRideRef.current || {});
        const nextRide = isActiveCurrentRide(normalizedRentalRide) ? normalizedRentalRide : null;
        lastRideSignatureRef.current = getCurrentRideSignature(nextRide);
        setCurrentRide(nextRide);
        return;
      }
      const nextRide = isActiveCurrentRide(ride) ? ride : null;
      lastRideSignatureRef.current = getCurrentRideSignature(nextRide);
      setCurrentRide(nextRide);
    };

    refreshCurrentRide();
    window.addEventListener('storage', refreshCurrentRide);
    window.addEventListener(CURRENT_RIDE_UPDATED_EVENT, refreshCurrentRide);

    let cancelled = false;
    let syncTimer = null;
    let syncInFlight = false;

    const scheduleNextSync = () => {
      if (cancelled) {
        return;
      }

      const nextInterval = currentRideRef.current && !isRentalCurrentRide(currentRideRef.current)
        ? ACTIVE_RIDE_SYNC_INTERVAL_MS
        : IDLE_RIDE_SYNC_INTERVALS_MS[Math.min(consecutiveIdleMissesRef.current, IDLE_RIDE_SYNC_INTERVALS_MS.length - 1)];
      syncTimer = window.setTimeout(() => {
        syncCurrentRide();
      }, nextInterval);
    };

    const syncCurrentRide = async (reason = 'timer') => {
      if (cancelled || syncInFlight || document.visibilityState === 'hidden') {
        scheduleNextSync();
        return;
      }

      if (
        reason !== 'timer' &&
        Date.now() - lastSyncAtRef.current < FORCED_SYNC_COOLDOWN_MS
      ) {
        return;
      }

      syncInFlight = true;
      lastSyncAtRef.current = Date.now();
      try {
        const token = getLocalUserToken();
        if (!token) {
          persistCurrentRide(null);
          currentRideRef.current = null;
          consecutiveIdleMissesRef.current = 0;
          return;
        }

        // Rental booking state is synchronized globally by RentalLocationTracker.
        // Avoid re-polling the same "active rental" endpoint from the home page.
        if (isRentalCurrentRide(currentRideRef.current)) {
          consecutiveIdleMissesRef.current = 0;
          return;
        }

        let rideData = null;

        try {
          rideData = unwrapApiPayload(await api.get('/rides/active/me'));
        } catch (error) {
          const status = Number(error?.response?.status || 0);
          if (status !== 404) {
            throw error;
          }
        }

        if (rideData?._id || rideData?.rideId) {
          const normalizedRide = {
            rideId: rideData._id || rideData.rideId,
            pickup: rideData.pickupAddress || rideData.pickup,
            drop: rideData.dropAddress || rideData.drop,
            pickupCoords: rideData.pickupLocation?.coordinates || rideData.pickupCoords || null,
            dropCoords: rideData.dropLocation?.coordinates || rideData.dropCoords || null,
            fare: rideData.fare,
            baseFare: rideData.baseFare || rideData.fare || 0,
            status: rideData.status,
            liveStatus: rideData.liveStatus,
            serviceType: rideData.serviceType,
            scheduledAt: rideData.scheduledAt || null,
            acceptedAt: rideData.acceptedAt || null,
            arrivedAt: rideData.arrivedAt || null,
            estimatedDistanceMeters: rideData.estimatedDistanceMeters || 0,
            estimatedDurationMinutes: rideData.estimatedDurationMinutes || 0,
            paymentMethod: rideData.paymentMethod || 'Cash',
            pricingSnapshot: rideData.pricingSnapshot || null,
            otp: rideData.otp || '',
            driver: rideData.driverId || rideData.driver,
            vehicleIconUrl: rideData.vehicleIconUrl,
            vehicleIconType: rideData.vehicleIconType,
          };
          if (isActiveCurrentRide(normalizedRide)) {
            if (cancelled) return;
            consecutiveIdleMissesRef.current = 0;
            persistCurrentRide(normalizedRide);
            currentRideRef.current = normalizedRide;
            return;
          }
        }

        if (cancelled) return;
        consecutiveIdleMissesRef.current = Math.min(
          consecutiveIdleMissesRef.current + 1,
          IDLE_RIDE_SYNC_INTERVALS_MS.length - 1,
        );
        persistCurrentRide(null);
        currentRideRef.current = null;
      } finally {
        syncInFlight = false;
        scheduleNextSync();
      }
    };

    const handleWindowFocus = () => {
      if (document.visibilityState !== 'hidden') {
        syncCurrentRide('focus');
      }
    };

    syncCurrentRide('mount');
    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleWindowFocus);

    return () => {
      cancelled = true;
      if (syncTimer) {
        window.clearTimeout(syncTimer);
      }
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleWindowFocus);
      window.removeEventListener('storage', refreshCurrentRide);
      window.removeEventListener(CURRENT_RIDE_UPDATED_EVENT, refreshCurrentRide);
    };
  }, []);

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
  const footerIllustrationBg = {
    backgroundImage: `url(${indiaGateRealImg})`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'center bottom',
    backgroundSize: 'cover',
  };
  const footerIllustrationFadeMask = {
    WebkitMaskImage:
      'linear-gradient(to bottom, rgba(0,0,0,0.04) 0%, rgba(0,0,0,0.2) 20%, rgba(0,0,0,0.55) 45%, rgba(0,0,0,0.85) 70%, rgba(0,0,0,1) 85%, rgba(0,0,0,0) 100%)',
    maskImage:
      'linear-gradient(to bottom, rgba(0,0,0,0.04) 0%, rgba(0,0,0,0.2) 20%, rgba(0,0,0,0.55) 45%, rgba(0,0,0,0.85) 70%, rgba(0,0,0,1) 85%, rgba(0,0,0,0) 100%)',
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    WebkitMaskSize: '100% 100%',
    maskSize: '100% 100%',
  };

  const footerIllustrationEdgeBlurMask = {
    WebkitMaskImage:
      'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 16%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 100%)',
    maskImage:
      'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 16%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 100%)',
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    WebkitMaskSize: '100% 100%',
    maskSize: '100% 100%',
  };

  const renderExploreSection = () => {
    if (settingsLoading) {
      return (
        <div className="pt-2">
          <div className="h-4 w-20 animate-pulse bg-slate-200 dark:bg-zinc-800 rounded-md mb-3" />
          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex-shrink-0 w-[86px] h-[96px] rounded-[20px] animate-pulse bg-slate-250 dark:bg-zinc-800/80" />
            ))}
          </div>
        </div>
      );
    }
    if (uiSettings?.homeSections && uiSettings.homeSections.enableExplore === false) {
      return null;
    }

    const cards = uiSettings?.explore || defaultSettings.explore;
    const activeCards = cards
      .filter(c => c.status === 'active' || c.status === true)
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));

    const getExploreIcon = (title) => {
      const cleanTitle = String(title || '').toLowerCase();
      if (cleanTitle.includes('parcel')) return parcelFallback;
      if (cleanTitle.includes('auto')) return taxiFallback;
      if (cleanTitle.includes('cab') || cleanTitle.includes('car')) return fallbackCar;
      if (cleanTitle.includes('bike') || cleanTitle.includes('moto')) return bikeFallback;
      return fallbackCar;
    };

    return (
      <div className="pt-1">
        <div className="mb-2.5 ml-1 flex items-center justify-between">
          <h2 className={`text-[19px] font-[900] tracking-tight leading-none ${isDark ? 'text-white' : 'text-slate-900'}`}>
            Explore
          </h2>
          <button
            type="button"
            onClick={() => setIsAllServicesOpen(true)}
            className="text-[13px] font-black uppercase text-[#FFC400] tracking-wider flex items-center gap-0.5"
            style={{ pointerEvents: 'auto', zIndex: 100, position: 'relative' }}
          >
            View All <ChevronRight size={12} strokeWidth={3} />
          </button>
        </div>

        <div className="flex gap-3 overflow-x-auto no-scrollbar scroll-smooth pb-3 px-1">
          {activeCards.map((card, idx) => (
            <motion.button
              key={card.id || idx}
              whileTap={{ scale: 0.96 }}
              type="button"
              onClick={() => handleServiceClick(card)}
              className={`flex-shrink-0 w-[86px] h-[96px] rounded-[20px] border flex flex-col items-center justify-center p-2 text-center transition-all duration-300 group shadow-sm ${isDark
                ? 'bg-gradient-to-br from-[#121821] to-[#1A2332] border-[#222E42]/80 hover:border-yellow-500/20'
                : 'bg-[#F7F8FB] border-slate-200/80 hover:border-[#FFC400]/20'
                }`}
            >
              {/* Subtle accent blob behind icon */}
              <div className="w-10 h-10 rounded-full flex items-center justify-center relative overflow-hidden">
                <div className="absolute inset-0 bg-[#FFC400]/10 rounded-full blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity" />
                <SafeImage
                  item={card}
                  fallbackImage={getExploreIcon(card.title)}
                  className="w-8 h-8 object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.1)] group-hover:scale-105 transition-transform"
                />
              </div>
              <span className={`text-[12px] font-black leading-tight mt-2 tracking-tight text-center line-clamp-2 ${isDark ? 'text-zinc-300 group-hover:text-yellow-400' : 'text-[#0B1220] group-hover:text-[#FFC400]'
                }`}>
                {card.title}
              </span>
            </motion.button>
          ))}
        </div>
      </div>
    );
  };
  const renderPromoBanner = () => {
    if (settingsLoading) {
      return (
        <div className="pt-2">
          <div className="h-[140px] w-full rounded-[26px] animate-pulse bg-slate-250 dark:bg-zinc-800/80" />
        </div>
      );
    }
    if (uiSettings?.homeSections && uiSettings.homeSections.enablePromo === false) {
      return null;
    }

    if (!promoBanners || promoBanners.length === 0) return null;

    const fallbackImages = [yellowTaxiImg, seamlessHighwayBg];

    const handleTouchStart = (e) => {
      touchStartX.current = e.targetTouches[0].clientX;
      setIsHoveringPromo(true);
    };

    const handleTouchMove = (e) => {
      touchEndX.current = e.targetTouches[0].clientX;
    };

    const handleTouchEnd = () => {
      setIsHoveringPromo(false);
      const diffX = touchStartX.current - touchEndX.current;
      if (Math.abs(diffX) > 50) {
        if (diffX > 0) {
          // Swiped left -> next banner
          setCurrentPromoIndex((prev) => (prev + 1) % promoBanners.length);
        } else {
          // Swiped right -> prev banner
          setCurrentPromoIndex((prev) => (prev - 1 + promoBanners.length) % promoBanners.length);
        }
      }
    };

    return (
      <div
        className="pt-2 relative w-full overflow-hidden"
        onMouseEnter={() => setIsHoveringPromo(true)}
        onMouseLeave={() => setIsHoveringPromo(false)}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="promo-carousel border border-slate-200/60 dark:border-zinc-800 shadow-md bg-[#0B1220] transition-colors duration-300">
          <div
            className="promo-track"
            style={{ transform: `translateX(-${currentPromoIndex * 100}%)` }}
          >
            {promoBanners.map((item, idx) => {
              const fallback = fallbackImages[idx % fallbackImages.length];
              const resolvedImgSrc = getDynamicImageSrc(item, fallback);
              return (
                <div
                  key={item.id || item._id}
                  className="promo-slide cursor-pointer"
                  onClick={() => {
                    if (item.route) {
                      const targetRoute = item.route;
                      const isSelectLocationRoute = targetRoute.includes('/ride/select-location');
                      if (isSelectLocationRoute) {
                        navigate(targetRoute, { state: { activeInput: 'drop', flow: 'ride' } });
                      } else {
                        navigate(targetRoute);
                      }
                    } else {
                      navigate(`${routePrefix}/ride/select-location`, { state: { activeInput: 'drop', flow: 'ride' } });
                    }
                  }}
                >
                  <img
                    src={resolvedImgSrc}
                    alt={item.title || "Promo"}
                    className="w-full h-[150px] object-cover rounded-[22px] block"
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/80 to-transparent z-10 rounded-[22px]" />
                  <div className="absolute inset-0 flex items-center p-6 z-20">
                    <div className="max-w-[80%] space-y-1 text-left">
                      <span className="inline-block text-[10px] font-black uppercase tracking-widest text-[#FFC400] bg-[#FFC400]/10 px-2.5 py-0.5 rounded-full mb-1">
                        Super Saver
                      </span>
                      <h2 className="text-[17px] sm:text-[19px] font-black leading-tight tracking-normal uppercase text-slate-50 whitespace-normal break-words">
                        <span className="text-[#FFC400]">{item.title ? item.title.split(' ')[0] : ''}</span>
                        {' '}
                        {item.title ? item.title.split(' ').slice(1).join(' ') : ''}
                      </h2>
                      {item.subtitle && (
                        <p className="text-[11px] sm:text-[12px] font-semibold text-slate-200/90 leading-snug line-clamp-2">
                          {item.subtitle}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Autoplay Linear Progress Bar */}
          {promoBanners.length > 1 && (
            <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-white/10 z-30 overflow-hidden">
              <motion.div
                key={currentPromoIndex}
                initial={{ width: '0%' }}
                animate={isHoveringPromo ? { width: '0%' } : { width: '100%' }}
                transition={{ duration: 3, ease: 'linear' }}
                className="h-full bg-[#FFC400]"
              />
            </div>
          )}

          {/* Page Indicators */}
          {promoBanners.length > 1 && (
            <div className="promo-dots">
              {promoBanners.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentPromoIndex(idx);
                  }}
                  className={idx === currentPromoIndex ? "active" : ""}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderGoPlacesSection = () => {
    if (settingsLoading) {
      return (
        <div className="pt-2 space-y-2">
          <div className="h-4 w-32 animate-pulse bg-slate-200 dark:bg-zinc-800 rounded-md" />
          <div className="h-3 w-40 animate-pulse bg-slate-200 dark:bg-zinc-800 rounded-md mb-3" />
          <div className="flex gap-3.5 overflow-x-auto no-scrollbar pb-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex-shrink-0 w-[156px] h-[162px] rounded-[24px] animate-pulse bg-slate-250 dark:bg-zinc-800/80" />
            ))}
          </div>
        </div>
      );
    }
    if (uiSettings?.homeSections && uiSettings.homeSections.enableGoPlaces === false) {
      return null;
    }

    const cards = uiSettings?.goPlaces || defaultSettings.goPlaces;
    const activeCards = cards
      .filter(c => c.status === 'active' || c.status === true)
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));

    const getGoPlacesIcon = (title) => {
      const cleanTitle = String(title || '').toLowerCase();
      if (cleanTitle.includes('airport') || cleanTitle.includes('flight')) return airplaneIcon;
      if (cleanTitle.includes('railway') || cleanTitle.includes('station') || cleanTitle.includes('train')) return railwayIcon;
      if (cleanTitle.includes('bus') || cleanTitle.includes('terminal')) return busStationIcon;
      return railwayIcon;
    };

    return (
      <div className="pt-1">
        <div className="mb-2.5 ml-1">
          <h2 className={`text-[19px] font-[900] tracking-tight leading-none ${isDark ? 'text-white' : 'text-slate-900'}`}>
            Go Places with Appzeto
          </h2>
          <p className={`text-[11px] font-[900] tracking-[0.14em] mt-1.5 ${isDark ? 'text-zinc-500' : 'text-slate-400'}`}>
            Fast bookings to key transit hubs
          </p>
        </div>

        <div className="flex gap-3.5 overflow-x-auto no-scrollbar scroll-smooth pb-3 px-1">
          {activeCards.map((card, idx) => (
            <motion.button
              key={card.id || idx}
              whileTap={{ scale: 0.97 }}
              type="button"
              onClick={() => {
                if (card.route) {
                  navigate(card.route);
                } else {
                  navigate(`${routePrefix}/ride/select-location`);
                }
              }}
              className={`flex-shrink-0 w-[156px] rounded-[24px] border overflow-hidden text-left transition-all duration-300 group shadow-sm flex flex-col ${isDark
                ? 'bg-gradient-to-br from-[#121821] to-[#1A2332] border-[#222E42]/85 hover:border-yellow-500/20'
                : 'bg-[#F7F8FB] border-slate-200/80 hover:border-[#FFC400]/20'
                }`}
            >
              {/* Header Image Area with subtle gradient */}
              <div className={`h-[80px] w-full flex items-center justify-center p-3 relative overflow-hidden ${isDark ? 'bg-zinc-900/50' : 'bg-slate-200/30'
                }`}>
                {/* Yellow glow blob */}
                <div className="absolute w-12 h-12 rounded-full bg-[#FFC400]/10 blur-md pointer-events-none group-hover:bg-[#FFC400]/20 transition-all" />
                <SafeImage
                  item={card}
                  fallbackImage={getGoPlacesIcon(card.title)}
                  className="h-full object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.12)] group-hover:scale-105 transition-transform duration-300"
                />
              </div>

              {/* Title & Slogan */}
              <div className="p-3 flex-1 flex flex-col justify-between">
                <h4 className={`text-[14px] font-black leading-tight tracking-tight line-clamp-2 ${isDark ? 'text-zinc-100 group-hover:text-yellow-400' : 'text-slate-800 group-hover:text-[#FFC400]'
                  }`}>
                  {card.title}
                </h4>
                <div className="mt-2.5 flex items-center gap-0.5 text-[11px] font-[900] text-[#FFC400] tracking-wider leading-none">
                  Book Now <ChevronRight size={10} strokeWidth={3} className="mt-0.5" />
                </div>
              </div>
            </motion.button>
          ))}
        </div>
      </div>
    );
  };

  const renderFooterSection = () => {
    if (settingsLoading) {
      return (
        <div className="pt-4 pb-6">
          <div className="relative overflow-hidden w-full h-[140px] rounded-[24px] animate-pulse bg-slate-250 dark:bg-zinc-800/80" />
        </div>
      );
    }
    if (uiSettings?.homeSections && uiSettings.homeSections.enableFooter === false) {
      return null;
    }

    return (
      <div className="pt-4 pb-6">
        <style>{`
          @keyframes scrollHighway {
            from {
              background-position: 0px 50%;
            }
            to {
              background-position: -2000px 50%;
            }
          }
          @keyframes kenBurns {
            0% {
              transform: scale(1) translate(0, 0);
            }
            50% {
              transform: scale(1.08) translate(-1%, -0.5%);
            }
            100% {
              transform: scale(1) translate(0, 0);
            }
          }
          .animate-scroll-highway {
            animation: scrollHighway 35s linear infinite;
          }
          .animate-ken-burns {
            animation: kenBurns 25s ease-in-out infinite;
          }
        `}</style>

        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 30 }}
          whileInView={{ opacity: 1, scale: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ type: "spring", stiffness: 80, damping: 15 }}
          className={`go-appzeto-banner relative overflow-hidden min-h-[420px] pb-32 flex flex-col justify-center items-center text-center p-8 transition-all duration-300 border-t w-full rounded-[24px] ${isDark
            ? 'border-zinc-800 bg-[#05070D] shadow-[0_-12px_36px_rgba(0,0,0,0.4)]'
            : 'border-slate-200 bg-[#F8FAFC] shadow-[0_-8px_24px_rgba(15,23,42,0.04)]'
            }`}
        >
          {/* Subtle neon glowing orb */}
          <motion.div
            animate={{
              scale: [1, 1.25, 1],
              opacity: [0.8, 1, 0.8]
            }}
            transition={{
              duration: 5,
              repeat: Infinity,
              ease: "easeInOut"
            }}
            className={`absolute -top-10 left-1/2 -translate-x-1/2 w-32 h-32 rounded-full blur-2xl pointer-events-none ${isDark ? 'bg-[#FFC400]/20' : 'bg-[#FFC400]/10'
              }`}
          />

          {/* City highway background mask with smooth scrolling animation */}
          <FooterBannerImage footerSettings={uiSettings?.footer || {}} fallbackImage={seamlessHighwayBg} />

          {/* Light overlay optimized for dark text contrast in both themes */}
          <motion.div
            animate={{
              opacity: [0.8, 0.9, 0.8]
            }}
            transition={{
              duration: 8,
              repeat: Infinity,
              ease: "easeInOut"
            }}
            className="absolute inset-0 pointer-events-none z-[1] bg-gradient-to-b from-white/15 via-white/45 to-white/80"
          />

          <motion.div
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.1 }}
            className="go-appzeto-content relative z-10 space-y-3 py-2 w-full max-w-sm"
          >
            <motion.h3
              initial={{ opacity: 0, y: -15 }}
              animate={{
                opacity: 1,
                y: [0, -4, 0]
              }}
              transition={{
                opacity: { duration: 0.8 },
                y: { duration: 4, repeat: Infinity, ease: "easeInOut" }
              }}
              className="text-[28px] font-[900] tracking-tight uppercase font-display leading-none text-[#0B1220]"
              style={{
                textShadow: 'none'
              }}
            >
              #GOAPPZETO
            </motion.h3>

            {/* Holiday taxi inline image removed to show background image only */}

            <motion.p
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="text-[13px] font-black uppercase tracking-widest font-sans flex items-center justify-center gap-1 text-[#0B1220]"
              style={{ textShadow: 'none' }}
            >
              MADE FOR INDIA
            </motion.p>
            <motion.p
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="text-[10px] font-bold uppercase tracking-[0.16em] mt-1 text-[#64748B]"
              style={{ textShadow: 'none' }}
            >
              CRAFTED FOR RIDERS
            </motion.p>
          </motion.div>
        </motion.div>
      </div>
    );
  };

  const exploreSection = useMemo(() => {
    return renderExploreSection();
  }, [uiSettings?.explore, uiSettings?.homeSections?.enableExplore, isDark, settingsLoading]);

  const promoBanner = useMemo(() => {
    return renderPromoBanner();
  }, [promoBanners, currentPromoIndex, isHoveringPromo, uiSettings?.homeSections?.enablePromo, isDark, settingsLoading]);

  const goPlacesSection = useMemo(() => {
    return renderGoPlacesSection();
  }, [uiSettings?.goPlaces, uiSettings?.homeSections?.enableGoPlaces, isDark, settingsLoading]);

  const footerSection = useMemo(() => {
    return renderFooterSection();
  }, [uiSettings?.footer, uiSettings?.homeSections?.enableFooter, isDark, settingsLoading]);

  return (
    <div className="min-h-screen w-full lg:max-w-7xl mx-auto relative font-sans no-scrollbar overflow-x-hidden transition-colors duration-300 user-app-theme shadow-2xl">
      <div className={`absolute -top-16 right-[-40px] h-44 w-44 rounded-full blur-3xl pointer-events-none ${isDark ? 'bg-yellow-500/5' : 'bg-orange-100/60'}`} />
      <div className={`absolute top-52 left-[-60px] h-52 w-52 rounded-full blur-3xl pointer-events-none ${isDark ? 'bg-yellow-500/5' : 'bg-emerald-100/60'}`} />
      <div className={`absolute bottom-28 right-[-40px] h-40 w-40 rounded-full blur-3xl pointer-events-none ${isDark ? 'bg-yellow-500/5' : 'bg-blue-100/60'}`} />

      {/* 1. MOBILE LAYOUT: Google Map component + Sticky Search Bar + HomeContent */}
      <div className="block lg:hidden">
        <div className="user-home">
          {/* Map Background Layer */}
          <div className="map-header">
            {showDeferredSections ? (
              <LocationMapSection />
            ) : (
              <div className={`h-full w-full animate-pulse ${isDark ? 'bg-[#0f172a]' : 'bg-slate-200'}`} />
            )}

            {/* Floating Greeting on Map */}
            <div className="absolute top-4 left-0 right-0 z-20">
              <HeaderGreeting floating={true} hideSearch={true} />
            </div>

            {/* Pickup Address Pill: positioned absolute overlaying map bottom */}
            <div
              onClick={() => navigate(`${routePrefix}/ride/select-location`, { state: { activeInput: 'pickup', flow: 'ride' } })}
              className={`pickup-address-pill flex items-center gap-2.5 rounded-full px-4 py-2.5 shadow-[0_8px_20px_rgba(0,0,0,0.18)] border transition-colors duration-300 cursor-pointer ${isDark ? 'bg-[#111827] border-zinc-800 text-white hover:bg-zinc-800' : 'bg-white border-slate-200 text-slate-800 hover:bg-slate-50'
                }`}
            >
              <div className="w-[11px] h-[11px] rounded-full bg-[#168a45] shrink-0" />
              <span className="text-xs font-bold truncate flex-1 leading-none">
                {isLocationLoading ? 'Pinning your current location...' : pickupAddress}
              </span>
              <span className="text-[10.5px] font-[900] text-yellow-500 dark:text-yellow-400 uppercase tracking-wider border-l border-slate-200/50 dark:border-white/10 pl-2 shrink-0">
                Change
              </span>
            </div>
          </div>
          {/* Content Sheet overlaying the sticky map */}
          <div className="home-sheet space-y-3">
            {/* Sticky Search Bar */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: [0.21, 1.02, 0.43, 1.01], delay: 0.05 }}
              className="user-search-bar"
            >
              <motion.button
                type="button"
                whileTap={{ scale: 0.99 }}
                onClick={() => navigate(`${routePrefix}/ride/select-location`, { state: { activeInput: 'drop', flow: 'ride' } })}
                className={`flex w-full items-center gap-3 rounded-full px-4 py-3.5 text-left transition-all relative overflow-hidden shadow-sm border ${isDark
                  ? 'bg-[#111827] border-zinc-800 text-white'
                  : 'bg-white border-slate-250 text-slate-900'
                  }`}
              >
                <Search size={18} className={isDark ? 'text-white' : 'text-slate-900'} strokeWidth={2.5} />
                <span className={`min-w-0 flex-1 truncate text-[14px] font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  Where do you want to go?
                </span>
              </motion.button>
            </motion.div>

            {/* Recent Locations List */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: [0.21, 1.02, 0.43, 1.01], delay: 0.08 }}
            >
              <RecentLocationsList routePrefix={routePrefix} />
            </motion.div>

            {/* Compact Active Ride/Booking Banner */}
            {currentRide && String(currentRide?.status || '').toLowerCase() !== 'end_requested' && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: [0.21, 1.02, 0.43, 1.01], delay: 0.12 }}
                className="pt-1"
              >
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.99 }}
                  onClick={() => navigate(trackingPath, { state: currentRide })}
                  className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl border text-left shadow-sm transition-all duration-200 ${isDark
                    ? 'bg-[#111827] border-zinc-800 text-white hover:bg-zinc-800'
                    : 'bg-emerald-50/40 border-emerald-100/60 text-slate-900 hover:bg-emerald-50/75'
                    }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <span className="text-[13px] font-bold truncate leading-none">
                      {serviceType === 'rental' ? 'You have an active rental booking' : 'You have an active ride'}
                    </span>
                  </div>
                  <span className="text-[12px] font-black text-emerald-650 dark:text-emerald-400 hover:opacity-80 shrink-0 flex items-center gap-0.5 leading-none">
                    View details <ChevronRight size={14} className="mt-0.5" />
                  </span>
                </motion.button>
              </motion.div>
            )}

            {/* Everything In Minutes Grid */}
            {(!uiSettings?.homeSections || uiSettings.homeSections.enableEverything !== false) && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: [0.21, 1.02, 0.43, 1.01], delay: 0.16 }}
                className="everything-section"
              >
                <ServiceGrid
                  isAllServicesOpen={isAllServicesOpen}
                  setIsAllServicesOpen={setIsAllServicesOpen}
                  onLoadServices={setActiveServices}
                />
              </motion.div>
            )}

            {/* Explore Horizontal List */}
            {exploreSection && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: [0.21, 1.02, 0.43, 1.01], delay: 0.2 }}
                className="explore-section"
              >
                {exploreSection}
              </motion.div>
            )}

            {/* Promo Banner */}
            {promoBanner && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: [0.21, 1.02, 0.43, 1.01], delay: 0.24 }}
                className="promo-section"
              >
                {promoBanner}
              </motion.div>
            )}

            {/* Go Places */}
            {goPlacesSection && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: [0.21, 1.02, 0.43, 1.01], delay: 0.28 }}
                className="go-places-section"
              >
                {goPlacesSection}
              </motion.div>
            )}

            {/* Footer Branding Illustration */}
            {footerSection && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: [0.21, 1.02, 0.43, 1.01], delay: 0.32 }}
                className="go-appzeto-section"
              >
                {footerSection}
              </motion.div>
            )}

            {/* Active Scheduled Ride Tracker */}
            {isScheduledAcceptedRide && (
              <div className="pt-2">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.99 }}
                  onClick={() => navigate(trackingPath, { state: currentRide })}
                  className="block w-full overflow-hidden rounded-[28px] border border-slate-850 p-5 text-left bg-slate-900 text-white shadow-xl"
                >
                  <div className="flex items-center justify-between">
                    <div className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] bg-yellow-400/10 text-yellow-400">
                      <ShieldCheck size={11} strokeWidth={3} />
                      Confirmed
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="h-1.5 w-1.5 rounded-full animate-pulse bg-yellow-400" />
                      <span className="text-[9px] font-black uppercase tracking-[0.14em] text-yellow-400">Live Status</span>
                    </div>
                  </div>

                  <div className="mt-4 flex items-end justify-between">
                    <div>
                      <h2 className="text-[24px] font-black tracking-tight leading-none text-white">
                        {scheduledCountdown}
                      </h2>
                      <p className="mt-1.5 text-[12px] font-bold text-slate-400">
                        {scheduledDateLabel}
                      </p>
                    </div>
                    <div className="relative mb-1">
                      <div className="absolute -inset-4 rounded-full bg-yellow-400/5 blur-xl animate-pulse" />
                      <div className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-slate-950 shadow-2xl border border-slate-800">
                        <img src={currentRideIcon} alt="" className="h-8 w-8 object-contain" />
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 flex items-center justify-between rounded-xl p-2.5 bg-slate-950/60 border border-slate-850">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="h-8 w-8 shrink-0 rounded-full bg-slate-900 border border-slate-800 text-yellow-400 flex items-center justify-center">
                        <User size={16} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500 leading-none">Driver & Vehicle</p>
                        <p className="mt-0.5 truncate text-[12.5px] font-bold">{driverName} • {vehicleLabel}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500 leading-none">Fare</p>
                      <p className="mt-0.5 text-[12.5px] font-bold">₹{Number(currentRide?.fare || 0).toFixed(0)}</p>
                    </div>
                  </div>
                </motion.button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. DESKTOP LAYOUT (hidden lg:grid) */}
      <div className="hidden lg:grid lg:grid-cols-12 lg:gap-8 lg:px-6 lg:pt-6 relative z-10">

        {/* Left Column (Greeting + Categories + Promos) */}
        <div className="lg:col-span-5 space-y-4">
          <HeaderGreeting />

          {/* Compact Active Ride/Booking Banner (Desktop) */}
          {currentRide && (
            <motion.button
              type="button"
              whileTap={{ scale: 0.99 }}
              onClick={() => navigate(trackingPath, { state: currentRide })}
              className={`w-full flex items-center justify-between px-5 py-4 rounded-[24px] border text-left shadow-md transition-all duration-200 ${isDark
                ? 'bg-slate-900 border-slate-800 text-white hover:bg-slate-850'
                : 'bg-emerald-50/40 border-emerald-100/60 text-slate-900 hover:bg-emerald-50/75'
                }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
                <span className="text-[14px] font-bold truncate">
                  {serviceType === 'rental' ? 'You have an active rental booking' : 'You have an active ride'}
                </span>
              </div>
              <span className="text-[13px] font-black text-emerald-600 dark:text-emerald-400 hover:opacity-80 shrink-0 flex items-center gap-0.5">
                View details <ChevronRight size={15} className="mt-0.5" />
              </span>
            </motion.button>
          )}
          {/* Premium Top Banner */}
          {promoBanner}

          {/* Everything In Minutes Grid */}
          {(!uiSettings?.homeSections || uiSettings.homeSections.enableEverything !== false) && (
            <div>
              <ServiceGrid onLoadServices={setActiveServices} />
            </div>
          )}

          {/* Explore Horizontal List */}
          {exploreSection}

          {/* Go Places Section */}
          {goPlacesSection}

          {/* Footer Branding Illustration */}
          {footerSection}
        </div>

        {/* Right Column (Map) */}
        <div className="lg:col-span-7 space-y-6 lg:sticky lg:top-6 self-start">
          {showDeferredSections ? (
            <div className="lg:h-[calc(100vh-14rem)] min-h-[480px]">
              <LocationMapSection />
            </div>
          ) : (
            <div className="lg:h-[calc(100vh-14rem)] min-h-[480px] h-[480px] animate-pulse rounded-[20px] border border-white/80 bg-white/70 shadow-[0_10px_22px_rgba(15,23,42,0.05)]" />
          )}

          {/* Desktop Branding Footer */}
          <div className="hidden lg:block pt-6">
            <div className="flex flex-col items-start px-2 py-2">
              <div className="text-[48px] font-[900] tracking-[-0.03em] text-[#FFC400] drop-shadow-[0_10px_30px_rgba(255,196,0,0.4)] leading-none uppercase">
                Appzeto
              </div>
              <div className="mt-2 text-[14px] font-sans italic font-bold tracking-[0.04em] text-slate-800 dark:text-slate-200">
                #goAppzeto 24
              </div>
              <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                Made for India, Crafted for riders.
              </div>
            </div>
          </div>
        </div>

      </div>

      <AnimatePresence>
        {isAllServicesOpen && (
          <AllServicesBottomSheet
            services={activeServices}
            onClose={() => setIsAllServicesOpen(false)}
            onServiceClick={handleServiceClick}
          />
        )}
      </AnimatePresence>

    </div>
  );
};

const AllServicesBottomSheet = ({ services, onClose, onServiceClick }) => {
  const { theme } = useUserTheme();
  const isDark = theme === 'dark';
  const navigate = useNavigate();

  useEffect(() => {
    // Reset window and body scroll positions when opening All Services bottom sheet
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    if (document.documentElement) {
      document.documentElement.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }
    if (document.body) {
      document.body.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }

    // Reset parent/global user app scroll container scroll heights
    const scrollables = document.querySelectorAll('.overflow-y-auto, [class*="overflow-y-auto"], .overflow-y-scroll, .no-scrollbar');
    scrollables.forEach(el => {
      el.scrollTop = 0;
    });
  }, []);

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.03,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, scale: 0.85 },
    show: {
      opacity: 1,
      scale: 1,
      transition: {
        type: 'spring',
        stiffness: 300,
        damping: 20,
      },
    },
  };

  return (
    <div className="all-services-backdrop flex items-end justify-center animate-fade-in" onClick={onClose}>
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 26, stiffness: 240 }}
        onClick={(e) => e.stopPropagation()}
        className={`all-services-sheet border-t shadow-2xl flex flex-col ${isDark
          ? 'bg-[#0B1220] text-white border-zinc-800 shadow-[0_-12px_40px_rgba(0,0,0,0.8)]'
          : 'bg-white text-slate-900 border-slate-200/80 shadow-[0_-12px_30px_rgba(15,23,42,0.12)]'
          }`}
      >
        {/* Pull Indicator */}
        <div className="w-full flex justify-center pb-3 cursor-pointer" onClick={onClose}>
          <div className={`w-12 h-1 rounded-full ${isDark ? 'bg-zinc-800' : 'bg-slate-250'}`} />
        </div>

        {/* Header Title & Close Button */}
        <div className={`flex items-center justify-between pb-3 border-b ${isDark ? 'border-zinc-800/85' : 'border-slate-100'}`}>
          <span className={`text-[19px] font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
            All Services
          </span>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-full transition-all active:scale-95 ${isDark ? 'bg-zinc-900 hover:bg-zinc-850 text-zinc-400' : 'bg-slate-100 hover:bg-slate-200 text-slate-500'}`}
          >
            <X size={16} strokeWidth={2.5} />
          </button>
        </div>

        {/* Services Grid (Rapido style: 4 columns grid, dark rounded rectangle icons, white text/yellow accent) */}
        <div className="flex-1 overflow-y-auto mt-5 pr-1 py-1 no-scrollbar">
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="grid grid-cols-4 gap-y-6 gap-x-2"
          >
            {services.map((service, index) => {
              const { icon, label } = service;
              return (
                <motion.div key={index} variants={itemVariants} className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => {
                      onServiceClick(service);
                    }}
                    className="flex flex-col items-center group cursor-pointer focus:outline-none"
                  >
                    {/* Dark rounded rectangle icon container */}
                    <div className="w-16 h-16 rounded-[20px] bg-[#121824] dark:bg-[#1A202C] flex items-center justify-center relative overflow-hidden shadow-md transition-all duration-300 border border-slate-800/10 dark:border-white/5 group-hover:scale-105 group-active:scale-95">
                      <div className="absolute inset-0 bg-[#FFC400]/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                      <img
                        src={icon}
                        alt={label}
                        className="w-11 h-11 object-contain"
                        style={{
                          objectFit: 'contain',
                          opacity: 1,
                          filter: 'none'
                        }}
                      />
                    </div>
                    {/* Service Name below */}
                    <span className={`text-[10px] font-black tracking-wide text-center mt-2 leading-tight max-w-[76px] break-words whitespace-normal ${isDark ? 'text-zinc-300 group-hover:text-yellow-400' : 'text-slate-800 group-hover:text-[#FFB300]'
                      }`}>
                      {label}
                    </span>
                  </button>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
};

export default Home;
