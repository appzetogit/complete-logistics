import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Fuel, Shield, ChevronRight, Star, Info, Car, Search, X, Bike } from 'lucide-react';
import { userService } from '../../services/userService';
import { useUserTheme } from '../../../../shared/context/UserThemeContext';
const DURATION_TABS = ['Hourly', 'Half-Day', 'Daily'];
const RENTAL_SELECTED_VEHICLE_STORAGE_KEY = 'selectedRentalVehicleDetail';
const RENTAL_PAGE_SIZE = 10;
const CATEGORY_FILTERS = [
  { id: 'all', label: 'All', Icon: Star },
  { id: 'car', label: 'Cars', Icon: Car },
  { id: 'bike', label: 'Bikes', Icon: Bike },
];

const infoBanner = {
  Hourly: 'Short rentals for quick city use.',
  'Half-Day': 'Mid-length rentals for errands and local trips.',
  Daily: 'Full-day rentals for flexible travel and extended usage.',
};

const durationSuffix = { Hourly: '/hr', 'Half-Day': '/6hr', Daily: '/day' };
const toNavigationSafeData = (value) => {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
};

const gradientPairs = [
  ['#FFF7ED', '#FFFFFF'],
  ['#F0FDF4', '#FFFFFF'],
  ['#EFF6FF', '#FFFFFF'],
  ['#FDF4FF', '#FFFFFF'],
  ['#FEF2F2', '#FFFFFF'],
];

const normalizeSearchValue = (value = '') => String(value || '').trim().toLowerCase();
const normalizeRentalCategory = (value = '') => {
  const normalized = normalizeSearchValue(value);

  if (normalized === 'bike') return 'bike';
  if (['car', 'suv', 'van'].includes(normalized)) return 'car';

  return normalized;
};

const findPricingBucket = (pricing = [], minHours, maxHours = Infinity) =>
  pricing.find(
    (item) =>
      Number(item.durationHours || 0) >= minHours &&
      Number(item.durationHours || 0) <= maxHours &&
      item.active !== false,
  );

const normalizeRentalVehicle = (item = {}, index = 0) => {
  const [gradientFrom, gradientTo] = gradientPairs[index % gradientPairs.length];
  const pricing = Array.isArray(item.pricing) ? item.pricing : [];
  const hourly = findPricingBucket(pricing, 1, 5) || pricing[0] || null;
  const halfDay = findPricingBucket(pricing, 6, 12) || hourly || pricing[0] || null;
  const daily = findPricingBucket(pricing, 24, Infinity) || pricing[pricing.length - 1] || halfDay || hourly;
  const capacity = Number(item.capacity || 0);
  const luggageCapacity = Number(item.luggageCapacity || 0);
  const isBike = String(item.vehicleCategory || '').toLowerCase() === 'bike';

  const featureSet = new Set(Array.isArray(item.amenities) ? item.amenities.filter(Boolean) : []);
  if (capacity > 0) featureSet.add(`${capacity} seat${capacity === 1 ? '' : 's'}`);
  if (luggageCapacity > 0) featureSet.add(`${luggageCapacity} bag${luggageCapacity === 1 ? '' : 's'} space`);
  if (!featureSet.size) {
    featureSet.add(isBike ? 'Helmet included' : 'Comfort ride');
  }

  const prices = {
    Hourly: Number(hourly?.price || 0),
    'Half-Day': Number(halfDay?.price || 0),
    Daily: Number(daily?.price || 0),
  };

  const kmLimit = {
    Hourly: `${Number(hourly?.includedKm || 0)} km`,
    'Half-Day': `${Number(halfDay?.includedKm || 0)} km`,
    Daily: `${Number(daily?.includedKm || 0)} km`,
  };

  const sortedPackages = [...pricing].sort(
    (a, b) => Number(a.durationHours || 0) - Number(b.durationHours || 0),
  );
  const mostExpensive = sortedPackages.reduce(
    (best, current) =>
      Number(current.price || 0) > Number(best?.price || 0) ? current : best,
    sortedPackages[0] || null,
  );
  const cheapest = sortedPackages.reduce(
    (best, current) =>
      Number(current.price || 0) < Number(best?.price || 0) ? current : best,
    sortedPackages[0] || null,
  );

  let tag = `${item.vehicleCategory || 'Rental'} Ready`;
  let tagColor = 'text-blue-600';
  let tagBg = 'bg-blue-50 border-blue-100';

  if (mostExpensive && String(mostExpensive.id) === String(daily?.id)) {
    tag = 'Premium';
    tagColor = 'text-purple-600';
    tagBg = 'bg-purple-50 border-purple-100';
  } else if (cheapest && String(cheapest.id) === String(hourly?.id)) {
    tag = 'Best Value';
    tagColor = 'text-emerald-600';
    tagBg = 'bg-emerald-50 border-emerald-100';
  } else if (isBike) {
    tag = 'Most Popular';
    tagColor = 'text-orange-500';
    tagBg = 'bg-orange-50 border-orange-100';
  }

  const gallery = [
    item.coverImage,
    item.image,
    ...(Array.isArray(item.galleryImages) ? item.galleryImages : []),
    ...(Array.isArray(item.gallery) ? item.gallery : []),
    item.map_icon,
  ].filter((value, currentIndex, array) => value && array.indexOf(value) === currentIndex);

  return {
    id: item.id || item._id,
    name: item.name || 'Rental Vehicle',
    tag,
    tagColor,
    tagBg,
    image: item.image || '',
    rating: '4.8',
    fuel: isBike ? 'Self-drive · License required' : 'Self-drive · Clean and sanitized',
    prices,
    kmLimit,
    features: Array.from(featureSet).slice(0, 4),
    gradientFrom,
    gradientTo,
    rawPricing: pricing,
    gallery,
    blueprint: item.blueprint || { lowerDeck: [], upperDeck: [] },
    amenities: Array.isArray(item.amenities) ? item.amenities.filter(Boolean) : [],
    shortDescription: item.short_description || '',
    description: item.description || '',
    luggageCapacity,
    capacity,
    vehicleCategory: item.vehicleCategory || 'Vehicle',
    normalizedCategory: normalizeRentalCategory(item.vehicleCategory),
    advancePayment: {
      enabled: Boolean(item.advancePayment?.enabled),
      paymentMode: item.advancePayment?.paymentMode || 'percentage',
      amount: Number(item.advancePayment?.amount || 0),
      label: item.advancePayment?.label || 'Advance booking payment',
      notes: item.advancePayment?.notes || '',
    },
  };
};

const RentalSkeleton = ({ isDark }) => (
  <div className="space-y-4">
    {[1, 2, 3].map((i) => (
      <div key={i} className={`rounded-[24px] border overflow-hidden shadow-sm ${isDark ? 'border-zinc-800 bg-[#0f1b2d]' : 'border-white/80 bg-white/90'} overflow-hidden`}>
        <div className={`px-4 pt-3.5 pb-3 flex items-center justify-between ${isDark ? 'bg-slate-900/40' : 'bg-slate-50/50'}`}>
          <div className="flex-1 space-y-2">
            <div className="h-3 w-16 skeleton rounded-full" />
            <div className="h-5 w-32 skeleton rounded-md" />
            <div className="h-3 w-24 skeleton rounded-md" />
            <div className="flex gap-2">
              <div className="h-3 w-8 skeleton rounded-full" />
              <div className="h-3 w-12 skeleton rounded-full" />
            </div>
          </div>
          <div className="h-16 w-20 skeleton rounded-2xl shrink-0" />
        </div>
        <div className="px-4 pb-4 pt-3 space-y-3">
          <div className="flex gap-1">
            <div className="h-4 w-12 skeleton rounded-full" />
            <div className="h-4 w-12 skeleton rounded-full" />
            <div className="h-4 w-12 skeleton rounded-full" />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="h-2 w-8 skeleton rounded-full" />
              <div className="h-6 w-20 skeleton rounded-md" />
            </div>
            <div className="h-9 w-24 skeleton rounded-xl" />
          </div>
        </div>
      </div>
    ))}
  </div>
);

const BikeRentalHome = () => {
  const { theme } = useUserTheme();
  const isDark = theme === 'dark';
  const [selectedDuration, setSelectedDuration] = useState('Hourly');
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const navigate = useNavigate();

  const openVehicleDetail = (vehicle) => {
    const payload = {
      vehicle,
      duration: selectedDuration,
    };
    const safePayload = toNavigationSafeData(payload);

    if (!safePayload) {
      setErrorMessage('Could not open vehicle details right now.');
      return;
    }

    try {
      window.sessionStorage.setItem(RENTAL_SELECTED_VEHICLE_STORAGE_KEY, JSON.stringify(safePayload));
    } catch {
      // Ignore storage failures and continue with navigation state.
    }

    navigate('/rental/vehicle', { state: safePayload });
  };

  useEffect(() => {
    let mounted = true;

    const loadVehicles = async () => {
      setLoading(true);
      setErrorMessage('');
      try {
        const response = await userService.getRentalVehicles();
        const results = response?.data?.results || response?.results || [];

        if (!mounted) return;

        setVehicles(
          results
            .map((item, index) => normalizeRentalVehicle(item, index))
            .filter((item) => Object.values(item.prices).some((price) => Number(price) > 0)),
        );
      } catch (error) {
        if (mounted) {
          setErrorMessage(error?.message || 'Could not load rental vehicles.');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadVehicles();
    return () => {
      mounted = false;
    };
  }, []);

  const availableCountLabel = useMemo(() => {
    const bikes = vehicles.filter(
      (item) => String(item.vehicleCategory || '').toLowerCase() === 'bike',
    ).length;

    if (bikes === vehicles.length && vehicles.length > 0) {
      return `${vehicles.length} bikes`;
    }

    return `${vehicles.length} vehicles`;
  }, [vehicles]);

  const rentalSuggestions = useMemo(() => {
    const seen = new Set();
    const suggestions = [];

    vehicles.forEach((vehicle) => {
      [vehicle.name, vehicle.vehicleCategory, ...(vehicle.amenities || []), ...(vehicle.features || [])]
        .map((item) => String(item || '').trim())
        .filter(Boolean)
        .forEach((item) => {
          const key = item.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            suggestions.push(item);
          }
        });
    });

    return suggestions;
  }, [vehicles]);

  const visibleSuggestions = useMemo(() => {
    const query = normalizeSearchValue(searchQuery);

    if (!query) {
      return rentalSuggestions.slice(0, 6);
    }

    return rentalSuggestions
      .filter((item) => normalizeSearchValue(item).includes(query))
      .slice(0, 6);
  }, [rentalSuggestions, searchQuery]);

  const categoryCounts = useMemo(() => {
    return vehicles.reduce(
      (accumulator, vehicle) => {
        const category = normalizeRentalCategory(vehicle.normalizedCategory || vehicle.vehicleCategory);
        if (category === 'car') accumulator.car += 1;
        if (category === 'bike') accumulator.bike += 1;
        accumulator.all += 1;
        return accumulator;
      },
      { all: 0, car: 0, bike: 0 },
    );
  }, [vehicles]);

  const filteredVehicles = useMemo(() => {
    const query = normalizeSearchValue(searchQuery);

    return vehicles.filter((vehicle) => {
      const matchesCategory =
        selectedCategoryFilter === 'all' ||
        normalizeRentalCategory(vehicle.normalizedCategory || vehicle.vehicleCategory) === selectedCategoryFilter;

      if (!matchesCategory) {
        return false;
      }

      if (!query) {
        return true;
      }

      const haystack = [
        vehicle.name,
        vehicle.vehicleCategory,
        vehicle.shortDescription,
        vehicle.description,
        vehicle.fuel,
        ...(vehicle.amenities || []),
        ...(vehicle.features || []),
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [searchQuery, selectedCategoryFilter, vehicles]);

  const filteredCountLabel = `${filteredVehicles.length} result${filteredVehicles.length === 1 ? '' : 's'}`;
  const totalPages = Math.max(1, Math.ceil(filteredVehicles.length / RENTAL_PAGE_SIZE));
  const paginatedVehicles = useMemo(() => {
    const startIndex = (currentPage - 1) * RENTAL_PAGE_SIZE;
    return filteredVehicles.slice(startIndex, startIndex + RENTAL_PAGE_SIZE);
  }, [currentPage, filteredVehicles]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedCategoryFilter]);

  useEffect(() => {
    setCurrentPage((previousPage) => Math.min(previousPage, totalPages));
  }, [totalPages]);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#F8FAFC_0%,#F3F4F6_38%,#EEF2F7_100%)] max-w-lg mx-auto font-sans relative overflow-hidden pb-12">
      <div className="absolute -top-16 right-[-40px] h-44 w-44 rounded-full bg-orange-100/60 blur-3xl pointer-events-none" />
      <div className="absolute bottom-28 right-[-40px] h-40 w-40 rounded-full bg-blue-100/60 blur-3xl pointer-events-none" />

      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="sticky top-0 z-30 w-full"
      >
        <div className="bg-white/85 backdrop-blur-2xl px-5 pt-12 pb-5 border-b border-white/40 shadow-[0_8px_32px_rgba(15,23,42,0.06)] relative overflow-hidden">
          {/* Subtle accent gradients */}
          <div className="absolute top-0 right-0 h-32 w-32 rounded-full bg-orange-400/5 blur-[40px] pointer-events-none" />
          <div className="absolute top-0 left-0 h-24 w-24 rounded-full bg-blue-400/5 blur-[40px] pointer-events-none" />

          <div className="relative flex items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-4">
              <motion.button
                whileHover={{ x: -2 }}
                whileTap={{ scale: 0.92 }}
                onClick={() => navigate(-1)}
                className="w-10 h-10 rounded-2xl bg-slate-900 flex items-center justify-center shadow-[0_4px_12px_rgba(15,23,42,0.15)] shrink-0 group transition-all"
              >
                <ArrowLeft size={20} className="text-white group-hover:opacity-80 transition-opacity" strokeWidth={2.5} />
              </motion.button>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500/60 leading-none mb-1.5">Self-drive rentals</p>
                <h1 className="text-[24px] font-[900] tracking-tight text-slate-950 leading-none">Choose Ride</h1>
              </div>
            </div>
            <div className="flex flex-col items-end">
              <span className="px-3 py-1 rounded-full bg-slate-900 text-[10px] font-bold text-white shadow-sm uppercase tracking-wider">
                {availableCountLabel}
              </span>
            </div>
          </div>

          <div className="relative mb-5">
            <div className="flex gap-1.5 bg-slate-100/60 p-1.5 rounded-[20px] border border-slate-200/40 shadow-inner">
              {DURATION_TABS.map((tab) => {
                const isActive = selectedDuration === tab;
                return (
                  <button
                    key={tab}
                    onClick={() => setSelectedDuration(tab)}
                    className="relative flex-1 py-2.5 rounded-[14px] text-[11px] font-[800] uppercase tracking-wider transition-all duration-300 outline-none"
                  >
                    {isActive && (
                      <motion.div
                        layoutId="activeTab"
                        className="absolute inset-0 bg-white rounded-[14px] shadow-[0_4px_12px_rgba(15,23,42,0.08)] border border-slate-100"
                        transition={{ type: 'spring', bounce: 0.25, duration: 0.5 }}
                      />
                    )}
                    <span className={`relative z-10 transition-colors duration-300 ${isActive ? 'text-slate-950' : 'text-slate-400'}`}>
                      {tab}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="relative group">
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
              <Search size={18} className="text-slate-400 group-focus-within:text-slate-900 transition-colors" strokeWidth={2.5} />
            </div>            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search by vehicle, category or brand..."
              className={`w-full border rounded-[20px] pl-11 pr-11 py-3.5 text-[14px] font-bold placeholder:text-slate-400/80 focus:outline-none transition-all ${
                isDark
                  ? 'bg-[#0f1b2d] border-zinc-800 text-white focus:bg-[#162238] focus:border-[#FFC400]/40'
                  : 'bg-slate-100/50 border-slate-200/60 text-slate-950 focus:border-slate-900/10 focus:bg-white'
              }`}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-3 flex items-center pr-1"
              >
                <div className={`h-7 w-7 flex items-center justify-center rounded-full transition-colors ${
                  isDark ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700' : 'bg-slate-200 text-slate-500 hover:bg-slate-300'
                }`}>
                  <X size={14} strokeWidth={3} />
                </div>
              </button>
            )}
          </div>

          {visibleSuggestions.length > 0 && !searchQuery && (
            <motion.div 
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-2 overflow-x-auto no-scrollbar pt-4 pb-1"
            >
              {visibleSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setSearchQuery(suggestion)}
                  className={`shrink-0 rounded-full border px-4 py-2 text-[10px] font-bold uppercase tracking-wider shadow-sm transition-colors ${
                    isDark
                      ? 'border-zinc-800 bg-[#0f1b2d] text-zinc-300 hover:border-zinc-700'
                      : 'border-slate-200 bg-white text-slate-500 hover:border-slate-305 transition-colors'
                  }`}
                >
                  {suggestion}
                </button>
              ))}
            </motion.div>
          )}
        </div>
      </motion.header>

      <div className="px-5 pt-6 space-y-5">
        <AnimatePresence mode="wait">
          <motion.div
            key={selectedDuration}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className={`flex items-center gap-3 rounded-[20px] border backdrop-blur-md px-4 py-3.5 shadow-[0_8px_20px_rgba(15,23,42,0.04)] ${
              isDark ? 'border-zinc-800/80 bg-[#0f1b2d]/80' : 'border-white/80 bg-white/60'
            }`}
          >
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
              isDark ? 'bg-blue-950/40 text-blue-400' : 'bg-blue-50 text-blue-500'
            }`}>
              <Info size={16} strokeWidth={2.5} />
            </div>
            <p className={`text-[13px] font-[700] tracking-tight leading-tight ${
              isDark ? 'text-zinc-300' : 'text-slate-700'
            }`}>
              {infoBanner[selectedDuration]}
            </p>
          </motion.div>
        </AnimatePresence>

        <div className="relative pt-2">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] font-[800] uppercase tracking-[0.2em] text-slate-400">Available Near You</p>
            {searchQuery && (
              <motion.span 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }}
                className="text-[10px] font-[800] uppercase tracking-wider text-blue-500 bg-blue-50 px-2 py-0.5 rounded-md"
              >
                {filteredCountLabel}
              </motion.span>
            )}
          </div>
          <h2 className={`text-[20px] font-[900] tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>Explore Fleet</h2>
        </div>

        <div className="space-y-3">
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {CATEGORY_FILTERS.map(({ id, label, Icon }) => {
              const isActive = selectedCategoryFilter === id;
              const count = categoryCounts[id] || 0;

              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSelectedCategoryFilter(id)}
                  className={`shrink-0 rounded-[18px] border px-3.5 py-2.5 transition-all ${
                    isActive
                      ? isDark
                        ? 'border-[#FFC400] bg-[#FFC400] text-[#05070D] shadow-[0_10px_24px_rgba(255,196,0,0.2)]'
                        : 'border-slate-900 bg-slate-900 text-white shadow-[0_10px_24px_rgba(15,23,42,0.16)]'
                      : isDark
                        ? 'border-zinc-800 bg-[#0f1b2d] text-zinc-300 shadow-sm'
                        : 'border-white/90 bg-white/75 text-slate-600 shadow-[0_8px_20px_rgba(15,23,42,0.05)]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-[12px] ${
                      isActive 
                        ? isDark ? 'bg-[#05070D]/10 text-[#05070D]' : 'bg-white/12' 
                        : isDark ? 'bg-slate-900 text-zinc-400' : 'bg-slate-100 text-slate-500'
                    }`}>
                      <Icon size={15} strokeWidth={2.4} />
                    </div>
                    <div className="text-left">
                      <p className={`text-[11px] font-black uppercase tracking-[0.16em] ${
                        isActive 
                          ? isDark ? 'text-[#05070D]' : 'text-white' 
                          : isDark ? 'text-zinc-400' : 'text-slate-500'
                      }`}>
                        {label}
                      </p>
                      <p className={`text-[12px] font-bold ${
                        isActive 
                          ? isDark ? 'text-[#05070D]/80' : 'text-white/80' 
                          : isDark ? 'text-zinc-300' : 'text-slate-700'
                      }`}>
                        {count} available
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className={`rounded-[18px] border px-3 py-3 shadow-sm ${
              isDark ? 'border-zinc-800 bg-[#0f1b2d]' : 'border-white/80 bg-white/70'
            }`}>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Fleet</p>
              <p className={`mt-1 text-[17px] font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>{categoryCounts.all}</p>
            </div>
            <div className={`rounded-[18px] border px-3 py-3 shadow-sm ${
              isDark 
                ? 'border-orange-950/30 bg-gradient-to-br from-orange-950/20 to-[#0f1b2d]' 
                : 'border-orange-100 bg-gradient-to-br from-orange-50 to-white'
            }`}>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-orange-400">Cars</p>
              <p className={`mt-1 text-[17px] font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>{categoryCounts.car}</p>
            </div>
            <div className={`rounded-[18px] border px-3 py-3 shadow-sm ${
              isDark 
                ? 'border-sky-950/30 bg-gradient-to-br from-sky-950/20 to-[#0f1b2d]' 
                : 'border-sky-100 bg-gradient-to-br from-sky-50 to-white'
            }`}>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-500">Bikes</p>
              <p className={`mt-1 text-[17px] font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>{categoryCounts.bike}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 pt-4 pb-12 space-y-4">
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div
              key="skeleton"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <RentalSkeleton isDark={isDark} />
            </motion.div>
          ) : errorMessage ? (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className={`rounded-[24px] border p-5 text-[13px] font-bold shadow-md ${
                isDark ? 'border-red-950 bg-red-950/20 text-red-400' : 'border-rose-100 bg-rose-50/90 text-rose-500'
              }`}
            >
              {errorMessage}
            </motion.div>
          ) : vehicles.length === 0 ? (
            <motion.div
              key="empty-all"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`rounded-[24px] border p-6 text-center shadow-md ${
                isDark ? 'border-zinc-800 bg-[#0f1b2d]' : 'border-white/80 bg-white/90'
              }`}
            >
              <div className={`mx-auto flex h-12 w-12 items-center justify-center rounded-[16px] ${
                isDark ? 'bg-slate-900 text-zinc-550' : 'bg-slate-100 text-slate-400'
              }`}>
                <Car size={22} />
              </div>
              <p className={`mt-4 text-[15px] font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>No rental vehicles available</p>
              <p className="mt-1 text-[12px] font-bold text-slate-450">Admin has not published any active rental vehicles yet.</p>
            </motion.div>
          ) : filteredVehicles.length === 0 ? (
            <motion.div
              key="empty-search"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`rounded-[24px] border p-6 text-center shadow-md ${
                isDark ? 'border-zinc-800 bg-[#0f1b2d]' : 'border-white/80 bg-white/90'
              }`}
            >
              <div className={`mx-auto flex h-12 w-12 items-center justify-center rounded-[16px] ${
                isDark ? 'bg-slate-900 text-zinc-550' : 'bg-slate-100 text-slate-400'
              }`}>
                <Search size={22} />
              </div>
              <p className={`mt-4 text-[15px] font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>No rentals matched your search</p>
              <p className="mt-1 text-[12px] font-bold text-slate-450">Try another vehicle name, category, amenity, or switch the car and bike filter.</p>
            </motion.div>
          ) : (
          paginatedVehicles.map((v, idx) => (
            <motion.div
              key={v.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.38, delay: idx * 0.07, ease: 'easeOut' }}
              className={`rounded-[24px] border overflow-hidden shadow-sm ${
                isDark ? 'border-zinc-800 bg-[#0f1b2d]' : 'border-white/80 bg-white/90'
              }`}
            >
              <div
                className="px-4 pt-3.5 pb-3 flex items-center justify-between"
                style={isDark ? { background: 'linear-gradient(135deg, #111c2a 0%, #0f1b2d 100%)' } : { background: `linear-gradient(135deg, ${v.gradientFrom} 0%, ${v.gradientTo} 100%)` }}
              >
                <div className="flex-1 min-w-0 pr-2 space-y-1">
                  <span className={`inline-block text-[9px] font-bold px-2 py-0.5 rounded-full border ${v.tagBg} ${v.tagColor}`}>
                    {v.tag}
                  </span>
                  <h3 className={`text-[16px] font-extrabold leading-tight tracking-tight ${isDark ? 'text-white' : 'text-slate-950'}`}>{v.name}</h3>
                  {v.shortDescription ? (
                    <p className={`text-[11px] font-medium ${isDark ? 'text-zinc-400' : 'text-slate-500/80'}`}>{v.shortDescription}</p>
                  ) : null}
                  <div className="flex items-center gap-1">
                    <Star size={10} className="text-yellow-500 fill-yellow-400" />
                    <span className={`text-[11px] font-bold ${isDark ? 'text-zinc-350' : 'text-slate-700'}`}>{v.rating}</span>
                    <span className={`text-[10px] font-medium ${isDark ? 'text-zinc-500' : 'text-slate-400'}`}>· {v.kmLimit[selectedDuration]} limit</span>
                  </div>
                </div>
                {v.image ? (
                  <img src={v.image} alt={v.name} className="h-20 w-24 object-contain drop-shadow-lg shrink-0 -mt-2 -mb-2" />
                ) : (
                  <div className={`flex h-20 w-24 items-center justify-center rounded-[20px] shadow-sm shrink-0 ${isDark ? 'bg-slate-950/60 text-slate-700' : 'bg-white/60 text-slate-300'}`}>
                    <Car size={28} />
                  </div>
                )}
              </div>

              <div className={`px-4 pb-4 pt-3 space-y-2.5 border-t ${isDark ? 'border-zinc-800/60' : 'border-slate-50'}`}>
                <div className="flex flex-wrap gap-1">
                  {v.features.map((feature) => (
                    <span key={feature} className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${isDark ? 'bg-slate-900 text-zinc-300 border-zinc-800/80' : 'bg-slate-50 text-slate-500 border-slate-100'}`}>
                      {feature}
                    </span>
                  ))}
                </div>

                <div className="flex items-center gap-1.5">
                  <Fuel size={11} className="text-slate-300 shrink-0" />
                  <span className={`text-[11px] font-bold ${isDark ? 'text-zinc-400' : 'text-slate-400'}`}>{v.fuel}</span>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[8px] font-bold text-slate-400 uppercase tracking-[0.15em] block">Price</span>
                    <div className="flex items-baseline gap-0.5">
                      <span className={`text-[24px] font-extrabold tracking-tighter leading-none ${isDark ? 'text-white' : 'text-slate-955'}`}>₹{v.prices[selectedDuration]}</span>
                      <span className={`text-[11px] font-bold ml-0.5 ${isDark ? 'text-zinc-400' : 'text-slate-400/80'}`}>{durationSuffix[selectedDuration]}</span>
                    </div>
                  </div>
                  <motion.button
                    whileTap={{ scale: 0.96 }}
                    onClick={() => openVehicleDetail(v)}
                    className={`px-4 py-2.5 rounded-[12px] text-[11px] font-bold uppercase tracking-wider flex items-center gap-1 shadow-sm transition-all ${isDark ? 'bg-[#FFC400] text-[#05070D] hover:bg-[#FFD54F]' : 'bg-slate-950 text-white hover:bg-black'}`}
                  >
                    Book Now <ChevronRight size={13} strokeWidth={3} className="opacity-60" />
                  </motion.button>
                </div>
              </div>
            </motion.div>
          ))
        )}
        </AnimatePresence>

        {!loading && !errorMessage && filteredVehicles.length > RENTAL_PAGE_SIZE ? (
          <div className={`flex items-center justify-between gap-3 rounded-[20px] border px-4 py-3.5 shadow-sm ${isDark ? 'border-zinc-800 bg-[#0f1b2d]' : 'border-white/80 bg-white/90'}`}>
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              disabled={currentPage === 1}
              className={`rounded-[12px] border px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] disabled:opacity-40 transition-colors ${isDark ? 'border-zinc-800 bg-slate-900 text-zinc-300' : 'border-slate-200 bg-white text-slate-600'}`}
            >
              Previous
            </button>
            <div className="text-center">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Page</p>
              <p className={`mt-1 text-[13px] font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>{currentPage} / {totalPages}</p>
            </div>
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              disabled={currentPage === totalPages}
              className={`rounded-[12px] border px-4 py-2 text-[11px] font-bold uppercase tracking-widest disabled:opacity-40 transition-colors ${isDark ? 'border-zinc-800 bg-slate-900 text-zinc-300' : 'border-slate-200 bg-white text-slate-600'}`}
            >
              Next
            </button>
          </div>
        ) : null}

        <div className={`flex items-center gap-3 rounded-[16px] border px-4 py-3.5 shadow-sm ${isDark ? 'border-zinc-800 bg-[#0f1b2d]' : 'border-white/80 bg-white/90'}`}>
          <div className={`w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0 ${isDark ? 'bg-slate-900 text-zinc-500' : 'bg-slate-50 text-slate-400'}`}>
            <Shield size={15} strokeWidth={2} />
          </div>
          <p className="text-[11px] font-bold text-slate-400 leading-relaxed">
            All rental vehicles shown here come from the admin catalog. Valid driving license and verification are required before pickup.
          </p>
        </div>
      </div>
    </div>
  );
};

export default BikeRentalHome;
