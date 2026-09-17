import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MapPin, Search, Wallet, Sun, Moon } from 'lucide-react';
import { DEFAULT_LOCATION_LABEL, getSavedLocationLabel, LOCATION_UPDATED_EVENT } from '../services/locationStore';
import { useUserTheme } from '../../../shared/context/UserThemeContext';

const fallingCoins = [
  { id: 1, left: '24%', delay: 0 },
  { id: 2, left: '50%', delay: 0.65 },
  { id: 3, left: '72%', delay: 1.2 },
];

import { useSettings } from '../../../shared/context/SettingsContext';

const HeaderGreeting = ({ floating = false, hideSearch = false }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const routePrefix = location.pathname.startsWith('/taxi/user') ? '/taxi/user' : '';
  const { theme } = useUserTheme();

  const { settings, loading, hasBootstrapSettings } = useSettings();
  const appLogo = settings.general?.logo || settings.customization?.logo || settings.general?.favicon || '';
  let appName = settings.general?.app_name || 'Appzeto ';
  if (appName === 'Appzeto') appName = 'Appzeto ';
  const [locationLabel, setLocationLabel] = useState(getSavedLocationLabel);
  const showBrandingSkeleton = loading && !hasBootstrapSettings && !appLogo;

  useEffect(() => {
    const syncLocationLabel = () => {
      setLocationLabel(getSavedLocationLabel());
    };

    syncLocationLabel();
    window.addEventListener('storage', syncLocationLabel);
    window.addEventListener(LOCATION_UPDATED_EVENT, syncLocationLabel);

    return () => {
      window.removeEventListener('storage', syncLocationLabel);
      window.removeEventListener(LOCATION_UPDATED_EVENT, syncLocationLabel);
    };
  }, []);

  return (
    <div className={floating ? "absolute top-0 left-0 right-0 z-20 px-4 pt-4 pb-2 pointer-events-none flex items-center justify-end gap-3 w-full" : "px-5 pt-6"}>
      {floating ? (
        <>
          <div className="flex items-center gap-2 shrink-0 pointer-events-auto">
            <button
              onClick={() => navigate(`${routePrefix}/wallet`)}
              className="w-9 h-9 rounded-full border border-white/10 bg-slate-950/70 backdrop-blur-md flex items-center justify-center text-white shadow-lg active:scale-95 transition-transform"
            >
              <Wallet size={15} />
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 w-full">
            <div className="flex min-w-0 items-center gap-3">
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.45, ease: 'easeOut' }}
                className="relative inline-flex items-center bg-transparent px-1.5 py-1"
              >
                <motion.div
                  aria-hidden="true"
                  className="absolute inset-x-2 inset-y-1 rounded-full bg-emerald-100/55 blur-md"
                  animate={{ opacity: [0.3, 0.75, 0.3], scale: [0.92, 1.06, 0.92] }}
                  transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
                />
                {appLogo ? (
                  <motion.img
                    key={appLogo}
                    src={appLogo}
                    alt={appName}
                    className="relative z-10 h-9 object-contain drop-shadow-sm"
                    animate={{ y: [0, -2, 0], scale: [1, 1.02, 1] }}
                    transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
                  />
                ) : (
                  <span className="relative z-10 text-lg font-black tracking-wider text-[#ffc400] uppercase font-['Outfit']">{appName}</span>
                )}
              </motion.div>

              <motion.button
                type="button"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: 0.03, ease: 'easeOut' }}
                whileTap={{ scale: 0.99 }}
                onClick={() => navigate(`${routePrefix}/ride/select-location`, { state: { activeInput: 'pickup', flow: 'ride' } })}
                className="group flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-transparent px-0 py-0 text-left transition-opacity active:opacity-80"
              >
                <MapPin size={16} className="text-slate-500 transition-colors group-hover:text-slate-700" strokeWidth={2.5} />

                <div className="min-w-0 flex-1">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-400">Location</p>
                  <p className="truncate text-[11px] font-medium text-slate-800">{locationLabel}</p>
                </div>
              </motion.button>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => navigate(`${routePrefix}/wallet`)}
                className="relative w-12 h-12 overflow-hidden rounded-full border border-white/80 bg-white/95 flex items-center justify-center shadow-[0_12px_30px_rgba(15,23,42,0.08)] shrink-0 active:scale-95 transition-transform"
              >
                <motion.div
                  className="absolute inset-x-2 top-1 h-3 rounded-full bg-gradient-to-b from-slate-200/50 to-transparent"
                  animate={{ opacity: [0.15, 0.35, 0.15] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                />

                {fallingCoins.map((coin) => (
                  <motion.span
                    key={coin.id}
                    aria-hidden="true"
                    className="absolute top-1 block h-1.5 w-1.5 rounded-full bg-gradient-to-br from-slate-300 to-slate-500 shadow-[0_1px_4px_rgba(148,163,184,0.45)]"
                    style={{ left: coin.left }}
                    animate={{
                      y: [0, 10, 16],
                      opacity: [0, 1, 1, 0],
                      scale: [0.85, 1, 0.92],
                    }}
                    transition={{
                      duration: 1.8,
                      delay: coin.delay,
                      repeat: Infinity,
                      repeatDelay: 0.8,
                      ease: 'easeIn',
                    }}
                  />
                ))}

                <motion.div
                  className="relative z-10"
                  animate={{ y: [0, -1, 0], rotate: [0, -2, 0] }}
                  transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <Wallet size={20} className="text-gray-900" strokeWidth={2.5} />
                </motion.div>
              </button>
            </div>
          </div>

          {!hideSearch && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.05, ease: 'easeOut' }}
              className="mt-3 space-y-2.5"
            >
              <motion.button
                type="button"
                whileTap={{ scale: 0.99 }}
                onClick={() => navigate(`${routePrefix}/ride/select-location`, { state: { activeInput: 'drop', flow: 'ride' } })}
                className={`flex w-full items-center gap-3 rounded-full text-left shadow-[0_12px_26px_rgba(15,23,42,0.06)] transition-all ${theme === 'dark'
                    ? 'search-button-dark'
                    : 'bg-[#f1f3f6] border border-slate-200/40 text-slate-900'
                  }`}
              >
                <Search size={16} className={theme === 'dark' ? 'text-white' : 'text-slate-900'} strokeWidth={2.5} />
                <span className={`min-w-0 flex-1 truncate text-[13px] font-semibold ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                  Where do you want to go?
                </span>
              </motion.button>
            </motion.div>
          )}
        </>
      )}
    </div>
  );
};

export default HeaderGreeting;
