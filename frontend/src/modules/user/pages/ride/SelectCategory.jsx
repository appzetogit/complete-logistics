import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ChevronRight, LoaderCircle, Users, CheckCircle2, AlertCircle } from 'lucide-react';
import api from '../../../../shared/api/axiosInstance';

// Local vehicle icon imports
import carIcon from '../../../../assets/icons/premium_car.png';
import bikeIcon from '../../../../assets/icons/premium_bike.png';
import autoIcon from '../../../../assets/icons/premium_auto.png';

const CATEGORY_DETAILS = {
  car: {
    id: 'car',
    title: 'Car',
    description: 'Safe, comfortable, and weather-proof rides for group travel or commutes.',
    capacity: '1-4 seats',
    icon: carIcon,
    accentClass: 'from-blue-500/20 to-indigo-500/20 border-blue-200/50 text-blue-600',
    hoverShadow: 'shadow-blue-500/10',
    pillClass: 'bg-blue-50 text-blue-600 border-blue-100',
    pedestalBg: 'bg-gradient-to-b from-blue-50 to-indigo-50/50',
  },
  bike: {
    id: 'bike',
    title: 'Bike',
    description: 'Fast, solo riding to beat the traffic and travel economically.',
    capacity: '1 seat',
    icon: bikeIcon,
    accentClass: 'from-orange-500/20 to-amber-500/20 border-orange-200/50 text-orange-600',
    hoverShadow: 'shadow-orange-500/10',
    pillClass: 'bg-orange-50 text-orange-600 border-orange-100',
    pedestalBg: 'bg-gradient-to-b from-orange-50 to-amber-50/50',
  },
  auto: {
    id: 'auto',
    title: 'Auto',
    description: 'Classic open-air local travel. Perfect for everyday quick trips.',
    capacity: '1-3 seats',
    icon: autoIcon,
    accentClass: 'from-emerald-500/20 to-teal-500/20 border-emerald-200/50 text-emerald-600',
    hoverShadow: 'shadow-emerald-500/10',
    pillClass: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    pedestalBg: 'bg-gradient-to-b from-emerald-50 to-teal-50/50',
  },
};

const unwrap = (response) => response?.data?.data || response?.data || response;

const SelectCategory = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = location.state || {};
  const routePrefix = location.pathname.startsWith('/taxi/user') ? '/taxi/user' : '';

  const [loading, setLoading] = useState(true);
  const [activeCategories, setActiveCategories] = useState({ car: false, bike: false, auto: false });
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const checkCategoryAvailability = async () => {
      try {
        const response = await api.get('/users/vehicle-types');
        if (!active) return;

        const data = unwrap(response);
        const list = data?.vehicle_types || data?.results || (Array.isArray(data) ? data : []);

        const available = { car: false, bike: false, auto: false };
        list.forEach((type) => {
          const isActive = type.active !== false && Number(type.status ?? 1) !== 0;
          const transportType = String(type.transport_type || 'taxi').toLowerCase();
          
          if (isActive && (transportType === 'taxi' || transportType === 'both')) {
            const category = String(type.category || type.icon_types || '').toLowerCase().trim();
            if (category.includes('car') || category.includes('hatchback') || category.includes('suv') || category.includes('premium')) {
              available.car = true;
            } else if (category.includes('bike') || category.includes('scooty')) {
              available.bike = true;
            } else if (category.includes('auto')) {
              available.auto = true;
            }
          }
        });

        setActiveCategories(available);
      } catch (err) {
        console.error('Failed to load category availability:', err);
        // Default fallback to true for all to be safe if API fails
        setActiveCategories({ car: true, bike: true, auto: true });
      } finally {
        if (active) setLoading(false);
      }
    };

    checkCategoryAvailability();

    return () => {
      active = false;
    };
  }, []);

  const handleCategorySelect = (categoryId) => {
    navigate(`${routePrefix}/ride/select-location`, {
      state: {
        ...routeState,
        selectedCategory: categoryId,
      },
    });
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#F8FAFC_0%,#F3F4F6_38%,#EEF2F7_100%)] pb-12 max-w-lg mx-auto relative overflow-hidden font-sans no-scrollbar flex flex-col">
      {/* Visual background glows */}
      <div className="absolute -top-16 right-[-40px] h-44 w-44 rounded-full bg-orange-100/60 blur-3xl pointer-events-none" />
      <div className="absolute top-52 left-[-60px] h-52 w-52 rounded-full bg-emerald-100/60 blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-[-40px] h-40 w-40 rounded-full bg-blue-100/60 blur-3xl pointer-events-none" />

      {/* Header bar */}
      <header className="relative z-10 px-5 pt-6 flex items-center justify-between">
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => navigate(routePrefix || '/taxi/user')}
          className="w-10 h-10 bg-white/90 border border-white/60 rounded-[14px] shadow-sm flex items-center justify-center shrink-0 active:scale-95 transition-all"
        >
          <ArrowLeft size={18} className="text-slate-900" strokeWidth={2.5} />
        </motion.button>
        <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Step 1 of 3</span>
        <div className="w-10 h-10 opacity-0" />
      </header>

      {/* Heading area */}
      <div className="relative z-10 px-5 mt-6 mb-6">
        <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight leading-tight">
          How would you like to ride?
        </h1>
        <p className="mt-1.5 text-[13px] font-medium text-slate-500">
          Choose a category to find available drivers nearby.
        </p>
      </div>

      {/* Main card list */}
      <div className="relative z-10 px-5 flex-1 overflow-y-auto no-scrollbar pb-6 flex flex-col gap-6">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
            <LoaderCircle size={32} className="animate-spin text-orange-500" />
            <p className="text-[11px] font-bold uppercase tracking-[0.18em]">Analyzing local fleets...</p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {Object.values(CATEGORY_DETAILS).map((cat) => {
              const isAvailable = activeCategories[cat.id];
              
              return (
                <motion.div
                  key={cat.id}
                  whileHover={isAvailable ? { y: -6, scale: 1.01 } : {}}
                  whileTap={isAvailable ? { scale: 0.99 } : {}}
                  onClick={() => isAvailable && handleCategorySelect(cat.id)}
                  className={`relative overflow-hidden rounded-[30px] border bg-white/90 backdrop-blur-xl flex flex-col transition-all duration-300 ${
                    isAvailable
                      ? `border-white/80 cursor-pointer shadow-[0_16px_36px_rgba(15,23,42,0.06)] hover:${cat.hoverShadow} hover:bg-white`
                      : 'border-slate-200/40 bg-slate-100/40 opacity-60 cursor-not-allowed'
                  }`}
                >
                  {/* Top Section: Large Premium Vehicle Pedestal */}
                  <div className="relative h-60 w-full flex items-center justify-center overflow-hidden border-b border-slate-100/40 bg-[#eaeaea]">
                    <img
                      src={cat.icon}
                      alt={cat.title}
                      className="w-full h-full object-cover relative z-10"
                    />
                  </div>

                  {/* Bottom Section: Descriptions & Details */}
                  <div className="p-5 flex flex-col justify-between flex-1 min-w-0">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <h2 className="text-[18px] font-black text-slate-900 leading-none">
                          {cat.title}
                        </h2>
                        
                        <div className="flex items-center gap-1.5 shrink-0">
                          {isAvailable ? (
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider ${cat.pillClass}`}>
                              Available
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-slate-400">
                              Offline
                            </span>
                          )}
                        </div>
                      </div>

                      <p className="mt-2.5 text-[12px] font-medium leading-relaxed text-slate-500">
                        {cat.description}
                      </p>
                    </div>

                    <div className="mt-4 flex items-center justify-between pt-3 border-t border-slate-100">
                      <div className="flex items-center gap-1.5 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                        <Users size={13} className="text-slate-400" />
                        <span>{cat.capacity}</span>
                      </div>
                      
                      {isAvailable && (
                        <div className="flex items-center gap-1.5 text-[11px] font-black text-slate-900 uppercase tracking-wider">
                          <span>Select</span>
                          <div className="w-6 h-6 rounded-full bg-slate-950 flex items-center justify-center text-white shadow-sm shrink-0">
                            <ChevronRight size={14} strokeWidth={3} />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Safety message at the bottom */}
      <div className="mt-auto pt-6 px-5 relative z-10 flex items-center justify-center gap-2 text-slate-400 select-none">
        <CheckCircle2 size={13} className="text-emerald-500" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em]">Verified active drivers only</span>
      </div>
    </div>
  );
};

export default SelectCategory;
