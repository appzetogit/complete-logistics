import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Home, Clock, Map, User } from 'lucide-react';
import { useSettings, normalizeAssetUrl } from '../../../shared/context/SettingsContext';
import { useUserTheme } from '../../../shared/context/UserThemeContext';
import busIcon from '../../../assets/3d images/AutoCab/bus.png';

const isEnabledFlag = (value) => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value === 1;
  }

  const normalized = String(value || '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(normalized);
};

const BottomNavbar = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { settings, modules, loading, hasBootstrapSettings } = useSettings();
  const { theme } = useUserTheme();
  const isDark = theme === 'dark';
  const showBusService = isEnabledFlag(settings.transportRide?.enable_bus_service);
  const busModule = (modules || []).find(m => m.service_type === 'bus' || m.name.toLowerCase() === 'bus');
  const dynamicBusIcon = busModule?.mobile_menu_icon ? normalizeAssetUrl(busModule.mobile_menu_icon) : busIcon;
  const showNavSkeleton = loading && !hasBootstrapSettings;

  const navItems = [
    { icon: Home, label: 'Ride', path: '/taxi/user' },
    { icon: Clock, label: 'Rides', path: '/taxi/user/activity' },
    ...(showBusService ? [{ imageIcon: dynamicBusIcon, label: 'Bus', path: '/taxi/user/bus' }] : []),
    { icon: Map, label: 'Support', path: '/taxi/user/support' },
    { icon: User, label: 'Profile', path: '/taxi/user/profile' },
  ];

  if (showNavSkeleton) {
    return (
      <nav className="user-bottom-nav pointer-events-none">
        <div className={`flex items-center justify-around overflow-visible rounded-[32px] border px-2 py-2 shadow-[0_20px_40px_rgba(0,0,0,0.12)] backdrop-blur-2xl pointer-events-auto relative ${
          isDark ? 'border-white/10 bg-slate-950/80' : 'border-slate-200 bg-white/80'
        }`}>
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="flex flex-1 flex-col items-center justify-center py-1.5">
              <div className={`h-[21px] w-[21px] animate-pulse rounded-full ${isDark ? 'bg-zinc-800' : 'bg-slate-200'}`} />
              <div className={`mt-2 h-2.5 w-10 animate-pulse rounded-full ${isDark ? 'bg-zinc-800' : 'bg-slate-200'}`} />
            </div>
          ))}
        </div>
      </nav>
    );
  }

  return (
    <nav className="user-bottom-nav pointer-events-none">
      <div className={`flex items-center justify-around overflow-visible rounded-[32px] border px-2 py-2.5 shadow-[0_20px_50px_rgba(0,0,0,0.3)] backdrop-blur-xl pointer-events-auto relative ${
        isDark
          ? 'border-white/10 bg-slate-950/80 shadow-[0_20px_50px_rgba(0,0,0,0.55)]'
          : 'border-slate-200/80 bg-white/80 shadow-[0_12px_40px_rgba(15,23,42,0.08)]'
      }`}>
        {navItems.map(({ icon: Icon, imageIcon, label, path }) => {
          const isActive =
            path === '/taxi/user'
              ? pathname === path
              : pathname === path || pathname.startsWith(`${path}/`);

          return (
            <button
              key={label}
              type="button"
              onClick={() => navigate(path)}
              className="flex-1 flex flex-col items-center justify-center py-1 relative z-10 outline-none tap-highlight-transparent group"
            >
              <div className="relative flex flex-col items-center">
                {/* Active Sliding Background Pill */}
                <AnimatePresence>
                  {isActive && (
                    <motion.div
                      layoutId="active-pill"
                      transition={{
                        type: 'spring',
                        stiffness: 400,
                        damping: 32,
                        mass: 1
                      }}
                      className="absolute -inset-y-2 -inset-x-4 bg-[#FFC400] rounded-[20px] shadow-[0_8px_20px_rgba(255,196,0,0.35)]"
                    />
                  )}
                </AnimatePresence>

                {/* Icon Container with Transition */}
                <motion.div
                  animate={{ 
                    scale: isActive ? 1.15 : 1,
                    y: isActive ? -1 : 0
                  }}
                  transition={{
                    type: 'spring',
                    stiffness: 400,
                    damping: 30
                  }}
                  className="relative z-20"
                >
                  {imageIcon ? (
                    <img
                      src={imageIcon}
                      alt=""
                      className={`h-[21px] w-[21px] object-contain transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-60 group-hover:opacity-80'}`}
                      draggable={false}
                    />
                  ) : (
                    <Icon
                      size={20}
                      strokeWidth={isActive ? 2.8 : 2}
                      className={`transition-colors duration-300 ${
                        isActive 
                          ? 'text-slate-950 font-extrabold' 
                          : isDark
                            ? 'text-zinc-400 group-hover:text-zinc-200' 
                            : 'text-slate-500 group-hover:text-slate-700'
                      }`}
                    />
                  )}
                </motion.div>

                {/* Label with Transition */}
                <motion.span 
                  animate={{ 
                    opacity: isActive ? 1 : 0.6,
                    y: isActive ? 2 : 1,
                    scale: isActive ? 1 : 0.95
                  }}
                  transition={{
                    duration: 0.2
                  }}
                  className={`relative z-20 mt-1 font-['Outfit'] text-[9.5px] font-extrabold uppercase tracking-[0.14em] transition-colors duration-300 ${
                    isActive 
                      ? 'text-slate-950' 
                      : isDark
                        ? 'text-zinc-400 group-hover:text-zinc-200' 
                        : 'text-slate-500 group-hover:text-slate-700'
                  }`}
                >
                  {label}
                </motion.span>
                
                {/* Subtle Bottom Glow for Active Tab */}
                {isActive && (
                  <motion.div
                    layoutId="active-glow"
                    transition={{
                      type: 'spring',
                      stiffness: 400,
                      damping: 32
                    }}
                    className="absolute -bottom-2.5 w-4 h-1.5 bg-slate-950/20 rounded-full blur-[2px]"
                  />
                )}
              </div>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNavbar;
