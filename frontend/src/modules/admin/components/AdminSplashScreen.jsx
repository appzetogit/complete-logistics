import React from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { useSettings } from '../../../shared/context/SettingsContext';

const AdminSplashScreen = () => {
  const { settings } = useSettings();
  const logoUrl = settings?.general?.logo || settings?.customization?.logo;

  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: 'easeInOut' }}
      className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-[#FAFAFA]"
    >
      {/* Subtle Yellow Glow Background */}
      <div className="absolute inset-0 flex items-center justify-center overflow-hidden pointer-events-none">
        <div className="w-[600px] h-[600px] bg-yellow-400/10 rounded-full blur-[100px] opacity-70 animate-pulse" />
      </div>

      <div className="relative z-10 flex flex-col items-center">
        {/* Logo Animation */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
          className="relative mb-6"
        >
          <div className="absolute inset-0 bg-yellow-400/20 blur-2xl rounded-full scale-150 animate-pulse" />
          <div className="relative flex items-center justify-center w-28 h-28 bg-white rounded-3xl shadow-xl shadow-yellow-900/5 border border-yellow-100 p-4">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="w-full h-full object-contain" />
            ) : (
              <ShieldCheck size={56} className="text-yellow-500" />
            )}
          </div>
        </motion.div>

        {/* Text Animations */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15, ease: 'easeOut' }}
          className="text-center"
        >
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Admin Panel</h1>
          <p className="text-sm font-semibold text-gray-500 mt-1.5">Platform Management System</p>
        </motion.div>

        {/* Loader Animation */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="mt-12 flex flex-col items-center"
        >
          <Loader2 size={24} className="animate-spin text-yellow-500" />
        </motion.div>
      </div>
    </motion.div>
  );
};

export default AdminSplashScreen;
