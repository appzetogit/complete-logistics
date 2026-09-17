import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { 
  ArrowLeft, 
  ChevronRight, 
  MapPin,
  ArrowRight,
  Megaphone
} from 'lucide-react';
import api from '../../../../shared/api/axiosInstance';
import { useBaseGoogleMapsLoader } from '../../../admin/utils/googleMaps';
import { getSavedLocation, getSavedLocationCoords, saveLocation } from '../../services/locationStore';
import { useUserTheme } from '../../../../shared/context/UserThemeContext';

import trucksImg from '@/assets/images/delivery/trucks.png';
import bikeImg from '@/assets/images/delivery/bike.png';
import moversImg from '@/assets/images/delivery/movers.png';

const Motion = motion;
const PARCEL_BOOKING_DRAFT_KEY = 'parcelBookingDraft';
const FALLBACK_PICKUP_LABEL = 'Choose your location';
const unwrapResults = (response) => {
  const payload = response?.data?.data || response?.data || response;
  return payload?.results || (Array.isArray(payload) ? payload : []);
};

const toPlainData = (value) => {
  if (value === null || value === undefined) {
    return value;
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
};

const getDeliveryPricingScore = (vehicle = {}) => {
  const pricing = vehicle?.delivery_distance_pricing || {};
  const enabled = Boolean(pricing?.enabled);
  const basePrice = Number(pricing?.base_price || 0);
  const distancePrice = Number(pricing?.distance_price || 0);
  const baseDistance = Number(pricing?.base_distance ?? pricing?.free_distance ?? 0);

  return Number(enabled) * 1000 + Number(basePrice > 0) * 100 + Number(distancePrice > 0) * 10 + Number(baseDistance > 0);
};

const getVehicleRecencyScore = (vehicle = {}) => {
  const timestamp = new Date(vehicle?.updatedAt || vehicle?.createdAt || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const DELIVERY_CATEGORY_OPTIONS = [
  {
    id: 'trucks',
    title: 'Trucks',
    img: trucksImg,
    searchTokens: ['truck', 'lcv', 'hcv', 'mcv', 'loader'],
  },
  {
    id: '2wheeler',
    title: '2 Wheeler',
    img: bikeImg,
    searchTokens: ['bike', 'scooter', 'cycle', '2-wheeler'],
  },
  {
    id: 'auto',
    title: 'Auto',
    img: '/2_AutoRickshaw.png',
    searchTokens: ['auto', 'rickshaw', 'tuk', '3-wheeler', 'three-wheeler'],
  },
  {
    id: 'movers',
    title: 'Packers & Movers',
    img: moversImg,
    searchTokens: ['mover', 'packers'],
  }
];

const ParcelType = () => {
  const { theme } = useUserTheme();
  const location = useLocation();
  const routeState = location.state || {};
  const savedLocation = getSavedLocation();
  const savedPickupLabel = String(savedLocation?.address || '').trim();
  const savedPickupCoords = getSavedLocationCoords();
  const [vehicleTypes, setVehicleTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pickupAddress, setPickupAddress] = useState(() => routeState.pickup || savedPickupLabel || FALLBACK_PICKUP_LABEL);
  const [pickupCoords, setPickupCoords] = useState(() => routeState.pickupCoords || savedPickupCoords || null);
  const geolocationRequestedRef = useRef(false);
  const navigate = useNavigate();
  const { isLoaded: isGoogleMapsLoaded } = useBaseGoogleMapsLoader();

  useEffect(() => {
    const fetchVehicles = async () => {
      try {
        setLoading(true);
        const response = await api.get('/users/vehicle-types');
        const items = unwrapResults(response);
        setVehicleTypes(items.filter(v => v.active && (v.transport_type === 'delivery' || v.transport_type === 'both')));
      } catch (err) {
        console.error('Failed to load vehicles:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchVehicles();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const draft = JSON.parse(window.sessionStorage.getItem(PARCEL_BOOKING_DRAFT_KEY) || '{}');

      if (!routeState.pickup && !savedPickupLabel && draft?.pickup) {
        setPickupAddress(String(draft.pickup || '').trim() || FALLBACK_PICKUP_LABEL);
      }

      if (!routeState.pickupCoords && !savedPickupCoords && Array.isArray(draft?.pickupCoords) && draft.pickupCoords.length === 2) {
        setPickupCoords(draft.pickupCoords);
      }
    } catch {
      // ignore invalid draft state
    }
  }, [routeState.pickup, routeState.pickupCoords, savedPickupCoords, savedPickupLabel]);

  useEffect(() => {
    if (geolocationRequestedRef.current || !navigator.geolocation) {
      return;
    }

    geolocationRequestedRef.current = true;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextCoords = [position.coords.longitude, position.coords.latitude];
        setPickupCoords(nextCoords);
        saveLocation({
          lon: position.coords.longitude,
          lat: position.coords.latitude,
          updatedAt: Date.now(),
        });
      },
      () => {
        // keep saved or route-based location when geolocation fails
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  }, []);

  useEffect(() => {
    if (!isGoogleMapsLoaded || !window.google?.maps?.Geocoder || !Array.isArray(pickupCoords) || pickupCoords.length !== 2) {
      return;
    }

    let active = true;
    const geocoder = new window.google.maps.Geocoder();
    const [lng, lat] = pickupCoords;

    geocoder.geocode({ location: { lat: Number(lat), lng: Number(lng) } }, (results, status) => {
      if (!active) {
        return;
      }

      const nextAddress = status === 'OK' && results?.[0]?.formatted_address
        ? results[0].formatted_address
        : '';

      if (!nextAddress) {
        return;
      }

      setPickupAddress(nextAddress);
      saveLocation({
        address: nextAddress,
        lon: Number(lng),
        lat: Number(lat),
        updatedAt: Date.now(),
      });
    });

    return () => {
      active = false;
    };
  }, [isGoogleMapsLoaded, pickupCoords]);

  const handleCategorySelect = (category) => {
    if (loading) {
      toast('Vehicle options are still loading. Try again in a sec.', {
        duration: 2200,
      });
      return;
    }

    const filteredVehicles = vehicleTypes.filter((vehicle) => {
      const configuredCategory = String(vehicle.delivery_category || '').trim().toLowerCase();
      if (configuredCategory) {
        return configuredCategory === category.id;
      }

      const name = String(vehicle.name || '').toLowerCase();
      const iconType = String(vehicle.icon_types || '').toLowerCase();
      return category.searchTokens.some((token) => name.includes(token) || iconType.includes(token));
    });
    const prioritizedVehicles = [...filteredVehicles].sort((left, right) => {
      const pricingDelta = getDeliveryPricingScore(right) - getDeliveryPricingScore(left);
      if (pricingDelta !== 0) {
        return pricingDelta;
      }

      const recencyDelta = getVehicleRecencyScore(right) - getVehicleRecencyScore(left);
      if (recencyDelta !== 0) {
        return recencyDelta;
      }

      return String(left?.name || '').localeCompare(String(right?.name || ''));
    });

    const selectedVehicle = prioritizedVehicles[0] || vehicleTypes[0];
    const selectedVehicles = (prioritizedVehicles.length ? prioritizedVehicles : selectedVehicle ? [selectedVehicle] : [])
      .map((vehicle) => toPlainData(vehicle))
      .filter(Boolean);
    const plainSelectedVehicle = toPlainData(selectedVehicle);
    const selectedVehicleIds = prioritizedVehicles.length
      ? prioritizedVehicles.map((vehicle) => vehicle?._id || vehicle?.id).filter(Boolean)
      : [plainSelectedVehicle?._id || plainSelectedVehicle?.id].filter(Boolean);

    const nextState = {
      parcelType: 'General Parcel',
      selectedVehicle: plainSelectedVehicle,
      selectedVehicles,
      selectedVehicleId: plainSelectedVehicle?._id || plainSelectedVehicle?.id,
      selectedVehicleIds,
      category: category.id,
      deliveryCategory: category.id,
      pickup: pickupAddress,
      pickupCoords,
    };

    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(PARCEL_BOOKING_DRAFT_KEY, JSON.stringify(nextState));
    }

    navigate('/taxi/user/parcel/details', {
      state: nextState,
    });
  };

  return (
    <div className={`min-h-screen w-full max-w-lg mx-auto flex flex-col font-sans relative overflow-x-hidden ${theme === 'dark' ? 'bg-[#05070D]' : 'bg-[#F5F8FF]'}`}>
      
      {/* Premium Header with Wave Background */}
      <div className={`relative pt-10 pb-20 px-6 overflow-hidden ${theme === 'dark' ? 'bg-[#090D16]' : 'bg-[#F1F5F9]'}`}>
        {/* Subtle Wave SVG */}
        <div className="absolute bottom-0 left-0 right-0 h-16 opacity-20 pointer-events-none">
            <svg viewBox="0 0 1440 320" className="w-full h-full preserve-3d">
                <path fill={theme === 'dark' ? '#05070D' : '#ffffff'} fillOpacity="1" d="M0,160L48,176C96,192,192,224,288,224C384,224,480,192,576,165.3C672,139,768,117,864,128C960,139,1056,181,1152,186.7C1248,192,1344,160,1392,144L1440,128L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"></path>
            </svg>
        </div>

        <div className="relative z-10 flex flex-col gap-4">
           {/* Pickup Selector */}
           <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`rounded-[24px] p-4 flex items-center gap-4 shadow-lg border transition-all cursor-pointer ${theme === 'dark' ? 'bg-[#111827] border-zinc-800/85 text-white' : 'bg-white border-white/50 text-slate-900'}`}
            onClick={() => navigate('/taxi/user/parcel/details', { state: { editPickup: true, pickup: pickupAddress, pickupCoords } })}
           >
             <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${theme === 'dark' ? 'bg-emerald-500/10' : 'bg-emerald-50'}`}>
               <MapPin size={20} className="text-emerald-500 fill-emerald-500/20" />
             </div>
             <div className="flex-1 min-w-0">
               <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Pick up from</p>
               <p className={`text-[13px] font-bold truncate mt-0.5 ${theme === 'dark' ? 'text-slate-200' : 'text-slate-900'}`}>{pickupAddress}</p>
             </div>
             <ChevronRight size={18} className="text-slate-400" />
           </motion.div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 px-5 -mt-10 z-20 pb-10">
        
        {/* Category Grid */}
        <div className="grid grid-cols-2 gap-3 mb-8">
          {DELIVERY_CATEGORY_OPTIONS.map((cat, idx) => (
            <motion.button
              key={cat.id}
              type="button"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: idx * 0.1 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleCategorySelect(cat)}
              className={`rounded-[24px] p-4 flex flex-col items-center gap-4 shadow-md border hover:shadow-xl transition-all duration-300 aspect-[0.85/1] group ${theme === 'dark' ? 'bg-[#111827] border-zinc-800/80' : 'bg-white border-slate-100/50'}`}
            >
              <div className="flex-1 flex items-center justify-center w-full">
                <img 
                  src={cat.img} 
                  alt={cat.title} 
                  className="w-full h-auto object-contain max-h-[110px] sm:max-h-[120px] drop-shadow-md transition-transform duration-300 group-hover:scale-105"
                />
              </div>
              <p className={`text-[14px] font-black text-center leading-tight ${theme === 'dark' ? 'text-white' : 'text-slate-800'}`}>
                {cat.title}
              </p>
            </motion.button>
          ))}
        </div>

        {/* Promo Banner: Explore Porter Rewards */}
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          onClick={() => navigate('/taxi/user/referral')}
          className="relative overflow-hidden rounded-[24px] bg-gradient-to-r from-amber-100 via-yellow-100 to-yellow-50 border border-yellow-200/60 p-5 mb-8 shadow-md group cursor-pointer"
        >
          {/* Decorative coin circles */}
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/5 rounded-full blur-xl" />
          <div className="absolute right-10 bottom-2 w-12 h-12 bg-yellow-400/10 rounded-full blur-lg" />
          
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-4">
               <div className="w-12 h-12 rounded-full bg-gradient-to-br from-yellow-300 to-yellow-600 flex items-center justify-center shadow-lg border-4 border-white/20">
                  <div className="w-6 h-6 rounded-full border-2 border-white/40 flex items-center justify-center font-black text-white text-[14px]">
                    $
                  </div>
               </div>
                <div>
                  <h3 className="text-[17px] font-black tracking-tight leading-tight text-dark-force">Explore Rewards</h3>
                  <p className="text-[11px] font-bold text-dark-force-muted mt-1">Earn 2 coins for every 100 spent</p>
                </div>
            </div>
             <div className="w-8 h-8 rounded-full bg-slate-900/10 flex items-center justify-center text-dark-force group-hover:translate-x-1 transition-transform">
                <ArrowRight size={18} strokeWidth={3} />
             </div>
          </div>
        </motion.div>

        {/* Footer Illustration */}
        <div className="mt-4 flex justify-center">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative w-full max-w-[320px] aspect-[16/9]"
            >
                {/* Simulated Road */}
                <div className={`absolute bottom-0 left-0 right-0 h-4 rounded-full blur-sm ${theme === 'dark' ? 'bg-zinc-800/50' : 'bg-slate-200/50'}`} />
                <img 
                  src={trucksImg} 
                  alt="Delivery Truck" 
                  className="w-full h-full object-contain opacity-20 grayscale brightness-125"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                   <div className="w-32 h-32 rounded-full bg-blue-500/5 blur-3xl" />
                </div>
                <div className="absolute top-1/2 left-4 w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                    <MapPin size={24} className="text-blue-500/40" />
                </div>
            </motion.div>
        </div>

      </main>

      {/* Floating Back Button */}
      <button 
        onClick={() => navigate(-1)}
        className={`fixed top-2 left-4 z-50 w-8 h-8 rounded-full backdrop-blur-md flex items-center justify-center border active:scale-95 transition-transform ${theme === 'dark' ? 'bg-zinc-900/80 border-zinc-800 text-white shadow-[0_4px_12px_rgba(0,0,0,0.5)]' : 'bg-white/70 border-slate-200/80 text-slate-800 shadow-sm'}`}
      >
        <ArrowLeft size={16} />
      </button>

    </div>
  );
};

export default ParcelType;
