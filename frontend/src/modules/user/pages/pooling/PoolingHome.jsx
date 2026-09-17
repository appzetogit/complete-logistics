import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  MapPin, 
  ArrowLeftRight, 
  Calendar, 
  ChevronRight, 
  Clock, 
  Star,
  ShieldCheck,
  Users,
  ArrowLeft,
  Search,
  History
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { userService } from '../../services/userService';
import toast from 'react-hot-toast';

// Asset Imports
import taxiImg from '../../../../assets/3d images/AutoCab/taxi.png';

const toCleanString = (value = '') => String(value || '').trim();

const formatDurationFromSchedule = (schedule = {}) => {
  const departure = toCleanString(schedule?.departureTime);
  const arrival = toCleanString(schedule?.arrivalTime);
  if (!departure || !arrival) return '';

  const [departureHour, departureMinute] = departure.split(':').map(Number);
  const [arrivalHour, arrivalMinute] = arrival.split(':').map(Number);

  if (![departureHour, departureMinute, arrivalHour, arrivalMinute].every(Number.isFinite)) {
    return '';
  }

  let totalMinutes = ((arrivalHour * 60) + arrivalMinute) - ((departureHour * 60) + departureMinute);
  if (totalMinutes < 0) {
    totalMinutes += 24 * 60;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
};

const getPrimarySchedule = (route = {}) => {
  const schedules = Array.isArray(route?.schedules) ? route.schedules : [];
  return schedules.find((item) => String(item?.status || '').toLowerCase() === 'active') || schedules[0] || null;
};

const normalizePopularRoute = (route = {}) => {
  const schedule = getPrimarySchedule(route);
  const middleStopCount = Array.isArray(route?.stops) ? route.stops.length : 0;

  return {
    id: route._id || route.id,
    from: toCleanString(route.originLabel) || 'Origin',
    to: toCleanString(route.destinationLabel) || 'Destination',
    price: Number(route.farePerSeat || 0),
    time: formatDurationFromSchedule(schedule) || (schedule?.departureTime && schedule?.arrivalTime ? `${schedule.departureTime} - ${schedule.arrivalTime}` : 'Schedule available'),
    scheduleLabel: toCleanString(schedule?.label) || 'Shared route',
    seats: Number(route.maxSeatsPerBooking || 0),
    stopCount: middleStopCount,
  };
};

const PoolingHome = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState({
    from: '',
    to: '',
    date: new Date().toISOString().split('T')[0]
  });
  const [popularRoutes, setPopularRoutes] = useState([]);
  const [allSuggestions, setAllSuggestions] = useState({ origins: [], destinations: [] });
  const [showFromSuggestions, setShowFromSuggestions] = useState(false);
  const [showToSuggestions, setShowToSuggestions] = useState(false);
  
  const fromRef = useRef(null);
  const toRef = useRef(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await userService.searchPoolingRoutes({});
        const routes = Array.isArray(response?.data?.data) ? response.data.data : Array.isArray(response?.data) ? response.data : [];
        
        // Extract unique locations for suggestions
        const origins = [...new Set(routes.map(r => r.originLabel).filter(Boolean))];
        const destinations = [...new Set(routes.map(r => r.destinationLabel).filter(Boolean))];
        setAllSuggestions({ origins, destinations });

        const activeRoutes = routes
          .filter((route) => String(route?.status || '').toLowerCase() === 'active' && route?.active !== false)
          .slice(0, 6)
          .map(normalizePopularRoute)
          .filter((route) => route.id);
        setPopularRoutes(activeRoutes);
      } catch (error) {
        setPopularRoutes([]);
      }
    };

    loadData();
  }, []);

  // Close suggestions on click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (fromRef.current && !fromRef.current.contains(event.target)) setShowFromSuggestions(false);
      if (toRef.current && !toRef.current.contains(event.target)) setShowToSuggestions(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearch = () => {
    if (!search.from || !search.to) {
      toast.error('Please select both origin and destination');
      return;
    }
    navigate(`/taxi/user/pooling/list?from=${search.from}&to=${search.to}&date=${search.date}`);
  };

  const swapLocations = () => {
    setSearch(prev => ({ ...prev, from: prev.to, to: prev.from }));
  };

  const filteredFrom = allSuggestions.origins.filter(loc => 
    loc.toLowerCase().includes(search.from.toLowerCase()) && loc !== search.from
  );

  const filteredTo = allSuggestions.destinations.filter(loc => 
    loc.toLowerCase().includes(search.to.toLowerCase()) && loc !== search.to
  );

  return (
    <div className="min-h-screen bg-white pb-24 max-w-lg mx-auto font-sans selection:bg-indigo-100">
      {/* Header Section */}
      <div className="relative bg-slate-900 px-6 pt-12 pb-28 text-white overflow-hidden">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 h-80 w-80 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl" />
        
        <div className="relative z-20 flex items-center justify-between mb-8">
          <button 
            onClick={() => navigate('/taxi/user')}
            className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-md transition hover:bg-white/20 border border-white/10 shadow-xl shadow-black/20"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-md border border-white/10">
            <Users size={18} className="text-indigo-200" />
          </div>
        </div>

        <div className="relative z-10 flex items-end justify-between">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="max-w-[200px]"
          >
            <h1 className="text-5xl font-black tracking-tight leading-[0.9]">
              POOL <br />
              <span className="text-indigo-400">RIDE.</span>
            </h1>
            <p className="mt-4 text-indigo-100 font-bold uppercase text-[9px] tracking-[0.3em] bg-white/10 inline-block px-3 py-1 rounded-full backdrop-blur-sm">Verified Shared Trips</p>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, scale: 0.8, x: 20 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            transition={{ type: 'spring', damping: 15 }}
            className="relative -mr-10"
          >
            <div className="absolute inset-0 bg-indigo-500/20 blur-3xl rounded-full" />
            <img src={taxiImg} alt="Pooling" className="relative z-10 h-40 w-auto object-contain drop-shadow-[0_20px_40px_rgba(0,0,0,0.5)]" />
          </motion.div>
        </div>
      </div>

      {/* Search Card */}
      <div className="mx-6 -mt-16 relative z-50">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-[40px] bg-white p-6 shadow-2xl shadow-indigo-200/50 border border-slate-50"
        >
          <div className="space-y-4">
            {/* Origin */}
            <div className="relative" ref={fromRef}>
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-500 z-10">
                <MapPin size={20} />
              </div>
              <input
                type="text"
                placeholder="From where?"
                value={search.from}
                onFocus={() => setShowFromSuggestions(true)}
                onChange={(e) => {
                  setSearch({ ...search, from: e.target.value });
                  setShowFromSuggestions(true);
                }}
                className="w-full rounded-[24px] bg-slate-50 py-5 pl-12 pr-4 text-sm font-black text-slate-900 outline-none transition focus:ring-4 focus:ring-indigo-50 border border-transparent focus:border-indigo-100"
              />
              
              <AnimatePresence>
                {showFromSuggestions && filteredFrom.length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute left-0 right-0 top-full mt-2 bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden z-[100]"
                  >
                    <p className="px-5 pt-4 pb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Suggestions</p>
                    {filteredFrom.map((loc, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setSearch({ ...search, from: loc });
                          setShowFromSuggestions(false);
                        }}
                        className="w-full px-5 py-4 text-left flex items-center gap-4 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0"
                      >
                        <History size={16} className="text-slate-300" />
                        <span className="text-sm font-black text-slate-900">{loc}</span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Swap Button */}
            <div className="relative flex justify-center -my-3 z-10">
              <button 
                onClick={swapLocations}
                className="h-12 w-12 rounded-2xl bg-indigo-600 text-white shadow-xl flex items-center justify-center border-4 border-white active:scale-90 transition-transform"
              >
                <ArrowLeftRight size={20} className="rotate-90" />
              </button>
            </div>

            {/* Destination */}
            <div className="relative" ref={toRef}>
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-rose-500 z-10">
                <MapPin size={20} />
              </div>
              <input
                type="text"
                placeholder="To where?"
                value={search.to}
                onFocus={() => setShowToSuggestions(true)}
                onChange={(e) => {
                  setSearch({ ...search, to: e.target.value });
                  setShowToSuggestions(true);
                }}
                className="w-full rounded-[24px] bg-slate-50 py-5 pl-12 pr-4 text-sm font-black text-slate-900 outline-none transition focus:ring-4 focus:ring-indigo-50 border border-transparent focus:border-indigo-100"
              />

              <AnimatePresence>
                {showToSuggestions && filteredTo.length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute left-0 right-0 top-full mt-2 bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden z-[100]"
                  >
                    <p className="px-5 pt-4 pb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Suggestions</p>
                    {filteredTo.map((loc, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setSearch({ ...search, to: loc });
                          setShowToSuggestions(false);
                        }}
                        className="w-full px-5 py-4 text-left flex items-center gap-4 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0"
                      >
                        <History size={16} className="text-slate-300" />
                        <span className="text-sm font-black text-slate-900">{loc}</span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Date Selection */}
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-500">
                <Calendar size={20} />
              </div>
              <input
                type="date"
                value={search.date}
                onChange={(e) => setSearch({ ...search, date: e.target.value })}
                className="w-full rounded-[24px] bg-slate-50 py-5 pl-12 pr-4 text-sm font-black text-slate-900 outline-none transition focus:ring-4 focus:ring-indigo-50 border border-transparent focus:border-indigo-100 appearance-none"
              />
            </div>

            <button
              onClick={handleSearch}
              className="mt-2 w-full rounded-[24px] bg-slate-900 py-5 text-sm font-black text-white shadow-2xl shadow-slate-200 transition hover:bg-black active:scale-[0.98] flex items-center justify-center gap-3"
            >
              <Search size={20} />
              Search Rides
            </button>
          </div>
        </motion.div>
      </div>

      {/* Popular Routes */}
      <div className="mt-16 px-6">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Popular Routes</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Frequent shared trips</p>
          </div>
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="w-10 h-10 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-900"
          >
            <ChevronRight size={20} className="-rotate-90" />
          </button>
        </div>
        
        <div className="space-y-5">
          {!popularRoutes.length ? (
            <div className="rounded-[32px] border-2 border-dashed border-slate-100 bg-slate-50/50 p-10 text-center">
              <History size={32} className="mx-auto text-slate-200 mb-4" />
              <p className="text-xs font-bold text-slate-400 leading-relaxed max-w-[180px] mx-auto">Active pooling routes will appear here once they are created by admin.</p>
            </div>
          ) : null}
          {popularRoutes.map((route) => (
            <motion.div
              key={route.id}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                setSearch({ ...search, from: route.from, to: route.to });
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="group relative overflow-hidden rounded-[40px] border border-slate-100 bg-white p-6 transition-all hover:border-indigo-200 hover:shadow-2xl hover:shadow-indigo-100/50"
            >
              <div className="flex items-center justify-between relative z-10">
                <div className="flex items-center gap-5">
                  <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-slate-50 text-slate-400 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-500 shadow-sm">
                    <ArrowLeftRight size={22} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-black text-slate-900">{route.from}</span>
                      <ChevronRight size={14} className="text-slate-300" />
                      <span className="text-base font-black text-slate-900">{route.to}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-4">
                      <div className="flex items-center gap-1.5 text-[10px] font-black text-indigo-600 uppercase tracking-wider bg-indigo-50 px-2 py-0.5 rounded-full">
                        <Clock size={12} />
                        {route.time}
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] font-black text-amber-600 uppercase tracking-wider bg-amber-50 px-2 py-0.5 rounded-full">
                        <Users size={12} />
                        {route.seats || 0} SEATS
                      </div>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xl font-black text-slate-900">₹{route.price}</p>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">FARES</p>
                </div>
              </div>
              
              {/* Background Decoration */}
              <div className="absolute -right-12 -bottom-12 w-32 h-32 bg-indigo-50/20 rounded-full blur-2xl group-hover:bg-indigo-100/40 transition-colors" />
            </motion.div>
          ))}
        </div>
      </div>

      {/* Safety Section */}
      <div className="mt-16 px-6">
        <div className="rounded-[40px] bg-slate-900 p-8 text-white relative overflow-hidden">
          <div className="relative z-10">
             <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-2xl bg-indigo-500 flex items-center justify-center">
                   <ShieldCheck size={24} />
                </div>
                <h3 className="text-lg font-black tracking-tight">Travel with Peace</h3>
             </div>
             <p className="text-sm font-medium text-slate-400 leading-relaxed mb-6">All drivers and passengers are ID-verified for a secure community experience.</p>
             <div className="flex items-center gap-4">
                <div className="flex -space-x-3">
                   {[1,2,3,4].map(i => (
                     <div key={i} className="w-8 h-8 rounded-full border-2 border-slate-900 bg-slate-800 overflow-hidden">
                        <img src={`https://ui-avatars.com/api/?name=U${i}&background=random`} alt="" />
                     </div>
                   ))}
                </div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400">10k+ Verified Users</p>
             </div>
          </div>
          <div className="absolute top-0 right-0 -mr-10 -mt-10 w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl" />
        </div>
      </div>
    </div>
  );
};

export default PoolingHome;
