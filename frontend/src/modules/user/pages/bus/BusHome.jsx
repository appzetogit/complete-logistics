import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Calendar,
  ChevronLeft,
  ChevronRight,
  BusFront,
  ArrowRightLeft,
  Loader2,
  Route,
  MapPin,
  Search,
  Ticket,
  X,
} from 'lucide-react';
import userBusService from '../../services/busService';
import { useSettings } from '../../../../shared/context/SettingsContext';
// ... removed BottomNavbar import ...

const isEnabledFlag = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(String(value || '').trim().toLowerCase());
};

const getRoutePrefix = (pathname = '') => (pathname.startsWith('/taxi/user') ? '/taxi/user' : '');

const getDateOffset = (offset = 1) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().split('T')[0];
};

const getTodayDate = () => getDateOffset(0);

const getTomorrowDate = () => getDateOffset(1);

const getNextWeekendDate = () => {
  const date = new Date();
  const day = date.getDay();

  if (day === 6 || day === 0) {
    return formatDateKey(date);
  }

  const daysUntilSaturday = (6 - day + 7) % 7;
  date.setDate(date.getDate() + daysUntilSaturday);
  return formatDateKey(date);
};

const getMonthStart = (value) => new Date(value.getFullYear(), value.getMonth(), 1);

const addMonths = (value, amount) => new Date(value.getFullYear(), value.getMonth() + amount, 1);

const formatDateKey = (value) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const buildCalendarDays = (monthDate) => {
  const start = getMonthStart(monthDate);
  const startOffset = (start.getDay() + 6) % 7;
  const gridStart = new Date(start);
  gridStart.setDate(start.getDate() - startOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const value = new Date(gridStart);
    value.setDate(gridStart.getDate() + index);
    return value;
  });
};

const formatTravelDate = (value) => {
  if (!value) return '';

  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
};

const normalizeCity = (value = '') => value.trim().toLowerCase();
const getListKey = (value, index, prefix) => `${String(value || '').trim() || prefix}-${index}`;
const getRouteKey = (route, index) => {
  const fromCity = String(route?.fromCity || '').trim();
  const toCity = String(route?.toCity || '').trim();
  const operatorName = String(route?.operatorName || '').trim();
  return `${fromCity || 'from'}-${toCity || 'to'}-${operatorName || index}`;
};

const BusHome = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { settings } = useSettings();
  const routePrefix = useMemo(() => getRoutePrefix(location.pathname), [location.pathname]);
  const busEnabled = isEnabledFlag(settings.transportRide?.enable_bus_service);

  const [fromCity, setFromCity] = useState('');
  const [toCity, setToCity] = useState('');
  const [date, setDate] = useState(getTodayDate());
  const [error, setError] = useState('');
  const [routeSuggestions, setRouteSuggestions] = useState([]);
  const [routesLoading, setRoutesLoading] = useState(false);
  const [routesError, setRoutesError] = useState('');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => getMonthStart(new Date(getTomorrowDate())));

  useEffect(() => {
    if (!busEnabled) {
      setRouteSuggestions([]);
      return;
    }

    let active = true;

    const loadRoutes = async () => {
      setRoutesLoading(true);
      setRoutesError('');
      try {
        const response = await userBusService.getRoutes();
        if (!active) return;
        setRouteSuggestions(Array.isArray(response?.data?.results) ? response.data.results : []);
      } catch (err) {
        if (!active) return;
        setRoutesError(err?.message || 'Failed to load route suggestions');
      } finally {
        if (active) {
          setRoutesLoading(false);
        }
      }
    };

    loadRoutes();

    return () => {
      active = false;
    };
  }, [busEnabled]);

  const cityOptions = useMemo(() => {
    const cities = new Set();

    routeSuggestions.forEach((route) => {
      const fromCity = String(route?.fromCity || '').trim();
      const toCity = String(route?.toCity || '').trim();

      if (fromCity) cities.add(fromCity);
      if (toCity) cities.add(toCity);
    });

    return Array.from(cities).sort((left, right) => left.localeCompare(right));
  }, [routeSuggestions]);

  const matchingRoute = useMemo(
    () =>
      routeSuggestions.find(
        (route) =>
          normalizeCity(route.fromCity) === normalizeCity(fromCity) &&
          normalizeCity(route.toCity) === normalizeCity(toCity),
      ) || null,
    [fromCity, routeSuggestions, toCity],
  );

  const hasTypedInvalidRoute =
    fromCity.trim() &&
    toCity.trim() &&
    normalizeCity(fromCity) !== normalizeCity(toCity) &&
    routeSuggestions.length > 0 &&
    !matchingRoute;

  const quickDates = useMemo(
    () => [
      { label: 'Today', value: getTodayDate() },
      { label: 'Tomorrow', value: getDateOffset(1) },
      { label: 'Day After', value: getDateOffset(2) },
      { label: 'This Weekend', value: getNextWeekendDate() },
    ],
    [],
  );

  const filteredFromCities = useMemo(() => {
    const source = normalizeCity(fromCity);
    const destinations = new Set(
      routeSuggestions
        .filter((route) => (!toCity ? true : normalizeCity(route.toCity) === normalizeCity(toCity)))
        .map((route) => route.fromCity)
        .filter(Boolean),
    );

    return Array.from(destinations)
      .filter((city) => (!source ? true : normalizeCity(city).includes(source)))
      .slice(0, 6);
  }, [fromCity, routeSuggestions, toCity]);

  const filteredToCities = useMemo(() => {
    const destination = normalizeCity(toCity);
    const origins = new Set(
      routeSuggestions
        .filter((route) => (!fromCity ? true : normalizeCity(route.fromCity) === normalizeCity(fromCity)))
        .map((route) => route.toCity)
        .filter(Boolean),
    );

    return Array.from(origins)
      .filter((city) => (!destination ? true : normalizeCity(city).includes(destination)))
      .slice(0, 6);
  }, [fromCity, routeSuggestions, toCity]);

  const featuredRoutes = useMemo(() => routeSuggestions.slice(0, 6), [routeSuggestions]);
  const minimumDate = useMemo(() => new Date(`${getTodayDate()}T00:00:00`), []);
  const selectedDateValue = useMemo(() => (date ? new Date(`${date}T00:00:00`) : null), [date]);
  const calendarDays = useMemo(() => buildCalendarDays(calendarMonth), [calendarMonth]);
  const monthLabel = useMemo(
    () =>
      calendarMonth.toLocaleDateString('en-IN', {
        month: 'long',
        year: 'numeric',
      }),
    [calendarMonth],
  );

  const handleSearch = () => {
    const source = fromCity.trim();
    const destination = toCity.trim();

    if (!busEnabled) {
      setError('Bus service is disabled right now.');
      return;
    }

    if (!source || !destination) {
      setError('Choose both source and destination first.');
      return;
    }

    if (normalizeCity(source) === normalizeCity(destination)) {
      setError('From and destination cannot be the same.');
      return;
    }

    if (!date) {
      setError('Select a travel date.');
      return;
    }

    if (date < getTodayDate()) {
      setError('Please select today or a future travel date.');
      return;
    }

    if (!matchingRoute) {
      setError('This route is not active yet. Pick one from the available routes below.');
      return;
    }

    setError('');
    navigate(`${routePrefix}/bus/list`, {
      state: {
        fromCity: source,
        toCity: destination,
        date,
      },
    });
  };

  const fillRoute = (route) => {
    setFromCity(route.fromCity || '');
    setToCity(route.toCity || '');
    setError('');

    if (date) {
      navigate(`${routePrefix}/bus/list`, {
        state: {
          fromCity: route.fromCity || '',
          toCity: route.toCity || '',
          date,
        },
      });
    }
  };

  const swapCities = () => {
    setFromCity(toCity);
    setToCity(fromCity);
    setError('');
  };

  const openCalendar = () => {
    const activeDate = selectedDateValue && !Number.isNaN(selectedDateValue.getTime()) ? selectedDateValue : minimumDate;
    setCalendarMonth(getMonthStart(activeDate));
    setCalendarOpen(true);
  };

  const selectCalendarDate = (value) => {
    const nextValue = formatDateKey(value);
    if (nextValue < getTodayDate()) {
      return;
    }

    setDate(nextValue);
    setCalendarOpen(false);
    setError('');
  };

  return (
    <div className="min-h-screen bg-slate-50 max-w-lg mx-auto font-sans pb-32 relative overflow-hidden">
      <header className="bg-white px-5 pt-10 pb-4 sticky top-0 z-20 border-b border-slate-100 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-xl border border-slate-200 bg-white flex items-center justify-center shadow-sm active:scale-95 transition-all"
          >
            <ArrowLeft size={18} className="text-slate-900" />
          </button>
          <div className="flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Bus Tickets</p>
            <h1 className="text-xl font-bold text-slate-900">Book your journey</h1>
          </div>
        </div>
      </header>

      <div className="px-5 pt-6 space-y-6">
        <div className="rounded-3xl bg-slate-900 p-6 text-white shadow-xl shadow-slate-200">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold leading-tight">Travel with ease</h2>
              <p className="mt-2 text-sm text-slate-300 font-medium">
                Find and book bus tickets for your preferred routes in just a few clicks.
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center shrink-0">
              <BusFront size={24} className="text-white" />
            </div>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-4 border-t border-white/10 pt-4">
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400">Routes</p>
              <p className="mt-1 text-lg font-bold">{routeSuggestions.length || 0}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400">Cities</p>
              <p className="mt-1 text-lg font-bold">{cityOptions.length || 0}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400">Date</p>
              <p className="mt-1 text-sm font-bold">{formatTravelDate(date) || 'Choose'}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-50 text-slate-600 flex items-center justify-center">
              <Search size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Search Buses</h3>
              <p className="text-xs text-slate-500 font-medium">Find available buses on your route</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="relative">
              <div className="absolute left-4 top-4 text-slate-400">
                <MapPin size={16} />
              </div>
              <div className="pl-12 pr-4 py-3 bg-slate-50 rounded-2xl border border-slate-100">
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-0.5">From</label>
                <input
                  type="text"
                  list="bus-route-cities"
                  value={fromCity}
                  onChange={(event) => setFromCity(event.target.value)}
                  placeholder="Enter source city"
                  className="w-full bg-transparent text-base font-semibold text-slate-900 focus:outline-none placeholder:text-slate-300"
                />
              </div>
              
              <div className="absolute right-6 top-1/2 -translate-y-1/2 z-10">
                <button
                  type="button"
                  onClick={swapCities}
                  className="w-10 h-10 rounded-full bg-white border border-slate-200 text-slate-600 flex items-center justify-center shadow-sm active:rotate-180 transition-transform duration-300"
                >
                  <ArrowRightLeft size={16} />
                </button>
              </div>
            </div>

            <div className="relative">
              <div className="absolute left-4 top-4 text-slate-400">
                <MapPin size={16} />
              </div>
              <div className="pl-12 pr-4 py-3 bg-slate-50 rounded-2xl border border-slate-100">
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-0.5">To</label>
                <input
                  type="text"
                  list="bus-route-cities"
                  value={toCity}
                  onChange={(event) => setToCity(event.target.value)}
                  placeholder="Enter destination city"
                  className="w-full bg-transparent text-base font-semibold text-slate-900 focus:outline-none placeholder:text-slate-300"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={openCalendar}
              className="w-full flex items-center gap-4 pl-4 pr-4 py-3 bg-slate-50 rounded-2xl border border-slate-100 text-left"
            >
              <div className="text-slate-400">
                <Calendar size={16} />
              </div>
              <div className="flex-1">
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-0.5">Date of Journey</label>
                <span className="text-base font-semibold text-slate-900">{formatTravelDate(date) || 'Choose date'}</span>
              </div>
              <span className="text-xs font-bold text-slate-400">Change</span>
            </button>
          </div>

          <div className="space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Quick dates</p>
            <div className="flex flex-wrap gap-2">
              {quickDates.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setDate(item.value)}
                  className={`rounded-full px-4 py-2 text-xs font-bold transition-all ${
                    date === item.value
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-50 text-slate-600 border border-slate-100 hover:border-slate-300'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <datalist id="bus-route-cities">
            {cityOptions.map((city, index) => (
              <option key={getListKey(city, index, 'city')} value={city} />
            ))}
          </datalist>

          <div className="space-y-4">
            {matchingRoute && (
              <div className="rounded-2xl bg-emerald-50 border border-emerald-100 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Route size={14} className="text-emerald-600" />
                  <span className="text-xs font-bold text-emerald-700">Route available</span>
                </div>
                <span className="text-xs font-bold text-emerald-700">
                  Starts at ₹{Number(matchingRoute.startingPrice || 0)}
                </span>
              </div>
            )}

            {hasTypedInvalidRoute && (
              <div className="rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3 text-xs font-bold text-slate-500">
                This specific route is not available. Please check the list below.
              </div>
            )}

            {error && (
              <div className="rounded-2xl bg-rose-50 border border-rose-100 px-4 py-3 text-xs font-bold text-rose-600">
                {error}
              </div>
            )}

            {!busEnabled && (
              <div className="rounded-2xl bg-amber-50 border border-amber-100 px-4 py-3 text-xs font-bold text-amber-700">
                Bus service is currently disabled.
              </div>
            )}

            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={handleSearch}
              className="w-full bg-slate-900 text-white py-4 rounded-2xl text-base font-bold flex items-center justify-center gap-2 shadow-lg shadow-slate-200 active:scale-95 transition-all"
            >
              Search Buses <ChevronRight size={18} />
            </motion.button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900">Popular Routes</h3>
            {routesLoading && <Loader2 size={18} className="animate-spin text-slate-400" />}
          </div>

          <div className="space-y-3">
            {featuredRoutes.map((route, index) => (
              <button
                key={getRouteKey(route, index)}
                type="button"
                onClick={() => fillRoute(route)}
                className="w-full rounded-2xl border border-slate-100 bg-white px-4 py-4 text-left shadow-sm active:scale-[0.99] transition-transform"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="text-base font-bold text-slate-900 truncate">
                      {route.fromCity} → {route.toCity}
                    </h4>
                    <p className="mt-1 text-xs font-medium text-slate-500 truncate">
                      {route.operatorName || 'Multiple operators available'}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[10px] font-bold uppercase text-slate-400">From</p>
                    <p className="text-lg font-bold text-slate-900">₹{Number(route.startingPrice || 0)}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {!routesLoading && !featuredRoutes.length && !routesError && (
            <p className="text-center py-8 text-sm font-medium text-slate-400">No active routes found.</p>
          )}

          {routesError && (
            <p className="text-center py-8 text-sm font-medium text-rose-500">{routesError}</p>
          )}
        </div>
      </div>

      {calendarOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm flex items-end justify-center p-4">
          <motion.div 
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Select Journey Date</p>
                <h3 className="text-xl font-bold text-slate-900">{monthLabel}</h3>
              </div>
              <button
                type="button"
                onClick={() => setCalendarOpen(false)}
                className="w-10 h-10 rounded-full bg-slate-50 text-slate-400 flex items-center justify-center hover:bg-slate-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex items-center justify-between gap-4 mb-6">
              <button
                type="button"
                onClick={() => setCalendarMonth((current) => addMonths(current, -1))}
                className="w-10 h-10 rounded-xl border border-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-50"
              >
                <ChevronLeft size={20} />
              </button>
              <div className="flex-1 text-center">
                <span className="text-sm font-bold text-slate-900 px-4 py-2 bg-slate-50 rounded-full">
                  {formatTravelDate(date)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setCalendarMonth((current) => addMonths(current, 1))}
                className="w-10 h-10 rounded-xl border border-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-50"
              >
                <ChevronRight size={20} />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-6">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => (
                <div key={i} className="text-center text-[10px] font-bold text-slate-400 py-2">
                  {day}
                </div>
              ))}
              {calendarDays.map((day) => {
                const key = formatDateKey(day);
                const isCurrentMonth = day.getMonth() === calendarMonth.getMonth();
                const isDisabled = key < getTodayDate();
                const isSelected = key === date;

                return (
                  <button
                    key={key}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => selectCalendarDate(day)}
                    className={`aspect-square rounded-xl text-sm font-bold transition-all flex items-center justify-center ${
                      isSelected
                        ? 'bg-slate-900 text-white shadow-lg'
                        : isDisabled
                          ? 'text-slate-200'
                          : isCurrentMonth
                            ? 'text-slate-800 hover:bg-slate-50'
                            : 'text-slate-300'
                    }`}
                  >
                    {day.getDate()}
                  </button>
                );
              })}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setDate(getTodayDate());
                  setCalendarOpen(false);
                }}
                className="flex-1 py-3 rounded-2xl bg-slate-50 text-slate-700 text-sm font-bold border border-slate-100"
              >
                Tomorrow
              </button>
              <button
                type="button"
                onClick={() => setCalendarOpen(false)}
                className="flex-1 py-3 rounded-2xl bg-slate-900 text-white text-sm font-bold"
              >
                Confirm
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default BusHome;
