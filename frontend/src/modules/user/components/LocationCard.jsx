import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronRight, MapPin, Navigation, Search } from 'lucide-react';

const quickPlaces = ['Home', 'Work', 'Recent'];

const LocationCard = ({ location = 'Fetching location...' }) => {
  const navigate = useNavigate();
  const routeLocation = useLocation();
  const routePrefix = routeLocation.pathname.startsWith('/taxi/user') ? '/taxi/user' : '';
  const isFetchingLocation = location.trim().toLowerCase() === 'fetching location...';
  const locationLabel = isFetchingLocation ? 'Fetching location' : location;

  return (
    <div className="px-5">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="rounded-[22px] border border-white/80 bg-white/92 p-4 shadow-[0_18px_40px_rgba(15,23,42,0.07)] backdrop-blur-md"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12px] font-black uppercase tracking-[0.16em] text-slate-400">Pickup</p>
            <h2 className="mt-2 text-[24px] font-bold leading-tight tracking-tight text-slate-900">
              {locationLabel}
              {isFetchingLocation && (
                <span className="ml-1 inline-flex">
                  {[0, 1, 2].map((dot) => (
                    <motion.span
                      key={dot}
                      className="inline-block"
                      animate={{ opacity: [0.2, 1, 0.2] }}
                      transition={{
                        duration: 1.05,
                        delay: dot * 0.18,
                        repeat: Infinity,
                        ease: 'easeInOut',
                      }}
                    >
                      .
                    </motion.span>
                  ))}
                </span>
              )}
            </h2>
          </div>

          <motion.div
            className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700"
            animate={{ boxShadow: ['0 0 0 0 rgba(16,185,129,0)', '0 0 0 6px rgba(16,185,129,0.08)', '0 0 0 0 rgba(16,185,129,0)'] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Navigation size={12} strokeWidth={2.5} />
            Live
          </motion.div>
        </div>

        <motion.div
          className="mt-4 flex items-start gap-3 rounded-[18px] border border-slate-100 bg-slate-50 px-4 py-3"
          whileHover={{ y: -1 }}
          transition={{ duration: 0.18 }}
        >
          <motion.div
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-orange-500 shadow-sm"
            animate={{ y: [0, -1.5, 0] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
          >
            <MapPin size={18} strokeWidth={2.5} />
          </motion.div>
          <div className="min-w-0">
            <p className="text-[13px] font-black text-slate-700">Current pickup</p>
            <p className="mt-1 text-[12px] font-bold leading-relaxed text-slate-500">
              Update your pickup point or add a stop before booking.
            </p>
          </div>
        </motion.div>

        <motion.button
          onClick={() => navigate(`${routePrefix}/ride/select-location`)}
          className="mt-4 flex w-full items-center gap-3 rounded-[18px] border border-slate-100 bg-slate-50 px-4 py-4 text-left transition-all hover:border-slate-200 hover:bg-white active:scale-[0.99]"
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.985 }}
          transition={{ duration: 0.18 }}
        >
          <motion.div
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-slate-500 shadow-sm"
            animate={{ scale: [1, 1.06, 1] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Search size={18} strokeWidth={2.5} />
          </motion.div>
          <div className="flex-1 min-w-0">
            <p className="text-[17px] font-black tracking-tight text-slate-800">Where to?</p>
            <p className="mt-1 text-[12px] font-bold text-slate-400">Search destination, compare rides, add stops</p>
          </div>
          <motion.div
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm"
            animate={{ x: [0, 2, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          >
            <ChevronRight size={18} strokeWidth={2.5} />
          </motion.div>
        </motion.button>

        <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {quickPlaces.map((place, index) => (
            <motion.button
              key={`${String(place || '').trim() || 'place'}-${index}`}
              type="button"
              onClick={() => navigate(`${routePrefix}/ride/select-location`)}
              className="shrink-0 rounded-full border border-slate-200 bg-white px-4 py-2 text-[12px] font-black text-slate-600 transition-all active:scale-95"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: 0.08 * index, ease: 'easeOut' }}
              whileTap={{ scale: 0.96 }}
            >
              {place}
            </motion.button>
          ))}
        </div>
      </motion.div>
    </div>
  );
};

export default LocationCard;
