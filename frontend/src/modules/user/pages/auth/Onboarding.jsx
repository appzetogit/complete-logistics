import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sun, Moon } from 'lucide-react';
import { useSettings } from '../../../../shared/context/SettingsContext';
import { useUserTheme } from '../../../../shared/context/UserThemeContext';
import { getLocalUserToken } from '../../services/authService';

const Onboarding = () => {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const { theme, toggleTheme } = useUserTheme();
  const appName = settings.general?.app_name || 'Appzeto 24';
  const appLogo = settings.general?.logo || settings.customization?.logo || settings.general?.favicon || '';

  useEffect(() => {
    const timer = setTimeout(() => {
      const token = getLocalUserToken();
      if (token) {
        navigate('/taxi/user', { replace: true });
      } else {
        navigate('/taxi/user/login', { replace: true });
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="login-page flex flex-col items-center justify-center relative min-h-screen max-w-lg mx-auto overflow-hidden">


      {/* Decorative Blobs for Depth */}
      <div className="absolute top-[-10%] right-[-10%] w-72 h-72 rounded-full bg-[#FFB300]/10 blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-72 h-72 rounded-full bg-[#FFB300]/5 blur-3xl pointer-events-none" />

      {/* Centered Logo & Brand Content */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col items-center justify-center z-10 text-center px-6"
      >
        {appLogo ? (
          <div className="p-4 rounded-[28px] bg-slate-900/10 dark:bg-white/5 border border-white/10 shadow-2xl mb-5 backdrop-blur-md">
            <img
              src={appLogo}
              alt={appName}
              className="h-20 w-20 object-contain rounded-2xl"
            />
          </div>
        ) : (
          <div className="h-20 w-20 bg-[#FFB300] rounded-[24px] flex items-center justify-center shadow-2xl shadow-yellow-500/20 mb-5 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-tr from-black/10 to-transparent" />
            <span className="text-3xl font-black italic text-slate-950 tracking-tighter">
              {appName[0]?.toUpperCase() || 'R'}
            </span>
          </div>
        )}

        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6 }}
          className="text-3xl font-black tracking-tight uppercase"
        >
          {appName}
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.7 }}
          transition={{ delay: 0.4, duration: 0.6 }}
          className="text-[11px] font-extrabold uppercase tracking-[0.25em] mt-2 login-accent-text"
        >
          Premium Mobility Platform
        </motion.p>
      </motion.div>

      {/* Loading Indicator at Bottom */}
      <div className="absolute bottom-16 left-0 right-0 flex justify-center">
        <div className="w-12 h-1 rounded-full bg-zinc-800/20 dark:bg-zinc-800 overflow-hidden relative">
          <motion.div
            initial={{ left: '-100%' }}
            animate={{ left: '100%' }}
            transition={{ repeat: Infinity, duration: 1.2, ease: 'easeInOut' }}
            className="absolute top-0 bottom-0 w-1/2 bg-[#FFB300] rounded-full"
          />
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
