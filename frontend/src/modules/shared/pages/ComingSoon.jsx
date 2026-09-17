import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Rocket, Bell, Bike, Car, Landmark, Bus } from 'lucide-react';
import { useSettings } from '../../../shared/context/SettingsContext';
import { ContainerScroll } from '@/components/ui/container-scroll-animation';

// Feature metadata per route
const FEATURE_META = {
  '/rental': {
    icon: <Bike size={48} strokeWidth={1.5} />,
    title: 'Bike Rentals',
    subtitle: 'Self-drive scooters & motorcycles',
    description: 'Rent a bike by the hour or day — no driver needed. Choose from Activa, Splendor, Royal Enfield & more.',
    color: 'bg-purple-50',
    accent: 'text-purple-600',
    border: 'border-purple-100',
    tag: 'COMING SOON',
  },
  '/intercity': {
    icon: <Car size={48} strokeWidth={1.5} />,
    title: 'Intercity Travel',
    subtitle: 'Indore ↔ Bhopal · Ujjain · Mumbai',
    description: 'Book scheduled city-to-city cab rides. One-way or round trip — Mini, Sedan, or SUV.',
    color: 'bg-blue-50',
    accent: 'text-blue-600',
    border: 'border-blue-100',
    tag: 'COMING SOON',
  },
  '/tours': {
    icon: <Landmark size={48} strokeWidth={1.5} />,
    title: 'Spiritual Tours',
    subtitle: 'Mahakal · Omkareshwar · Maheshwar',
    description: 'Curated temple tour packages with expert guides, flexible timings, and group travel options.',
    color: 'bg-amber-50',
    accent: 'text-amber-600',
    border: 'border-amber-100',
    tag: 'COMING SOON',
  },
  '/cab-sharing': {
    icon: <Bus size={48} strokeWidth={1.5} />,
    title: 'Cab Sharing',
    subtitle: 'Share rides, save big — Appzeto 24\'s USP',
    description: 'Real-time seat booking in shared cabs. Choose your seat, split the fare, and travel smart.',
    color: 'bg-green-50',
    accent: 'text-green-600',
    border: 'border-green-100',
    tag: 'LAUNCHING SOON',
  },
};

const DEFAULT_META = {
  icon: <Rocket size={48} strokeWidth={1.5} />,
  title: 'Feature Coming Soon',
  subtitle: 'We\'re working on something great',
  description: 'This feature is under development and will be available in a future update.',
  color: 'bg-gray-50',
  accent: 'text-gray-600',
  border: 'border-gray-100',
  tag: 'COMING SOON',
};

const ComingSoon = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { settings } = useSettings();
  const appName = settings.general?.app_name || 'App';
  const meta = FEATURE_META[location.pathname] || DEFAULT_META;
  const subtitle = String(meta.subtitle || '').replace(/Appzeto 24/gi, appName);

  return (
    <div className="min-h-screen bg-white max-w-lg mx-auto flex flex-col font-sans">
      {/* Header */}
      <div className="p-5 flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 active:scale-90 transition-all">
          <ArrowLeft size={24} className="text-gray-900" strokeWidth={2.5} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-8 pb-20">
        {/* Animated Icon */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 200 }}
          className={`w-32 h-32 ${meta.color} rounded-[40px] flex items-center justify-center shadow-xl border ${meta.border} ${meta.accent}`}
        >
          {meta.icon}
        </motion.div>

        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex flex-col items-center gap-3"
        >
          <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] ${meta.color} ${meta.accent} border ${meta.border} flex items-center gap-2`}>
            <Rocket size={11} strokeWidth={3} />
            {meta.tag}
          </span>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight leading-tight">{meta.title}</h1>
          <p className={`text-[14px] font-black ${meta.accent} uppercase tracking-widest`}>{subtitle}</p>
          <p className="text-[14px] font-bold text-gray-400 leading-relaxed max-w-xs mt-1">{meta.description}</p>
        </motion.div>

        {/* Notify Me Button */}
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => navigate('/')}
          className="w-full max-w-xs bg-[#1C2833] text-white py-4 rounded-[24px] text-[14px] font-black uppercase tracking-widest shadow-xl flex items-center justify-center gap-2.5 active:scale-95 transition-all"
        >
          <Bell size={16} strokeWidth={3} />
          <span>Notify Me When Live</span>
        </motion.button>

        {/* Scroll Animation Section */}
        <div className="w-full mt-6 py-6 border-t border-gray-100 overflow-hidden">
          <ContainerScroll
            titleComponent={
              <div className="mb-4">
                <h2 className="text-xl font-extrabold text-slate-900 tracking-tight leading-none text-center">
                  We're launching soon! <br />
                  <span className="text-2xl font-black text-[#FFB300] mt-2 block leading-none">
                    Stay tuned
                  </span>
                </h2>
              </div>
            }
          >
            <img
              src="https://ui.aceternity.com/_next/image?url=%2Flinear.webp&w=3840&q=75"
              alt="Appzeto  launch preview"
              className="mx-auto rounded-xl object-cover h-full object-left-top w-full"
              draggable={false}
            />
          </ContainerScroll>
        </div>

        <button
          onClick={() => navigate('/')}
          className="text-[13px] font-black text-gray-300 hover:text-gray-500 uppercase tracking-widest transition-colors active:scale-95"
        >
          Back to Home
        </button>
      </div>
    </div>
  );
};

export default ComingSoon;
