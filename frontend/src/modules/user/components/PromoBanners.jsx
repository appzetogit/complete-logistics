import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Clock3, ShieldCheck, Sparkles } from 'lucide-react';
import { useUserTheme } from '../../../shared/context/UserThemeContext';

import bannerTaxi from '../../../assets/user-app/banner-taxi.jpg';
import taxiImg from '../../../assets/user-app/taxi.png';
import bikeImg from '../../../assets/user-app/bike.png';

const rotatingCards = [
  {
    icon: Clock3,
    iconClass: 'text-yellow-500',
    title: 'In a hurry?',
    description: 'Auto for shorter wait times.',
    actionClass: 'bg-yellow-400 text-slate-950',
    path: '/taxi/user/ride/select-location',
    state: { selectedCategory: 'auto', activeInput: 'drop', flow: 'ride' },
    images: [
      { src: bikeImg, alt: 'Bike' },
    ],
  },
  {
    icon: ShieldCheck,
    iconClass: 'text-yellow-500',
    title: 'Need more space?',
    description: 'Cab for luggage or comfort.',
    actionClass: 'bg-yellow-400 text-slate-950',
    path: '/taxi/user/ride/select-location',
    state: { selectedCategory: 'car', activeInput: 'drop', flow: 'ride' },
    images: [
      { src: taxiImg, alt: 'Taxi' },
    ],
  },
];

const ImageCarousel = ({ images, className }) => {
  const activeImage = images?.[0];

  if (!activeImage) return null;

  return (
    <div className={className}>
      <motion.img 
        src={activeImage.src} 
        alt={activeImage.alt} 
        className="w-full object-contain drop-shadow-xl"
        animate={{ y: [0, -4, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
};

const PromoCard = ({ icon: Icon, iconClass, title, description, actionClass, path, state, images, onNavigate, isDark }) => (
  <motion.div
    whileTap={{ scale: 0.98 }}
    onClick={() => onNavigate(path, { state })}
    className={`relative min-h-[140px] overflow-hidden rounded-2xl border p-3.5 shadow-[0_12px_28px_rgba(0,0,0,0.08)] cursor-pointer transition-all duration-300 ${
      isDark 
        ? 'bg-gradient-to-br from-slate-900/90 to-slate-900/60 border-slate-800/80 text-white' 
        : 'bg-gradient-to-br from-white/95 to-white/70 border-slate-200/40 text-slate-900'
    }`}
  >
    <div className={`flex items-center gap-2 ${iconClass}`}>
      <Icon size={14} strokeWidth={2.5} />
    </div>
    <h3 className="mt-2.5 text-[17px] font-black leading-snug tracking-tight">{title}</h3>
    <p className="mt-1 max-w-[132px] text-[10px] font-bold leading-snug opacity-60">{description}</p>
    <div className={`mt-3 inline-flex h-8 w-8 items-center justify-center rounded-full shadow-md ${
      isDark ? 'bg-yellow-400 text-slate-950' : 'bg-slate-900 text-white'
    }`}>
      <ArrowRight size={15} strokeWidth={2.5} />
    </div>
    <ImageCarousel images={images} className="absolute bottom-1 right-1 w-[74px] opacity-95 pointer-events-none" />
  </motion.div>
);

const PromoBanners = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const routePrefix = location.pathname.startsWith('/taxi/user') ? '/taxi/user' : '';
  const { theme } = useUserTheme();
  const isDark = theme === 'dark';

  return (
    <div className="px-5 space-y-4">
      <div className="mb-1 ml-1">
        <h2 className="text-[19px] font-black tracking-tight">Recommended for you</h2>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {rotatingCards.map((card, index) => (
          <PromoCard 
            key={`${String(card.title || '').trim() || 'promo'}-${index}`} 
            {...card} 
            isDark={isDark}
            path={routePrefix ? `${routePrefix}/ride/select-location` : '/ride/select-location'}
            onNavigate={navigate} 
          />
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className={`relative overflow-hidden rounded-2xl border p-4 shadow-[0_18px_44px_rgba(0,0,0,0.15)] transition-all duration-300 ${
          isDark 
            ? 'bg-gradient-to-br from-slate-900 to-slate-800 border-slate-800' 
            : 'bg-gradient-to-br from-slate-950 to-slate-900 border-slate-950 text-white'
        }`}
      >
        <div className="absolute inset-0 bg-[radial-gradient(240px_160px_at_20%_25%,rgba(250,204,21,0.12),transparent_60%)]" aria-hidden="true" />
        <div className="absolute inset-0 bg-[radial-gradient(260px_180px_at_85%_85%,rgba(250,204,21,0.06),transparent_62%)]" aria-hidden="true" />

        <div className="relative z-10 flex min-h-[168px] items-end justify-between gap-4">
          <div className="max-w-[62%]">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white/85">
              <Sparkles size={12} strokeWidth={2.5} className="text-yellow-400" />
              Savings
            </div>

            <h3 className="mt-3 text-[20px] font-black leading-tight tracking-tight text-slate-50">
              Better savings on your next ride.
            </h3>
            <p className="mt-1.5 text-[11px] font-bold leading-relaxed text-slate-200/80">Book quickly and save more.</p>

            <motion.button
              type="button"
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate(`${routePrefix}/ride/select-location`, { state: { activeInput: 'drop', flow: 'ride' } })}
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-yellow-400 px-4 py-2 text-[12px] font-black text-slate-950 shadow-lg shadow-black/15 active:scale-95"
            >
              Ride Now
              <ArrowRight size={14} strokeWidth={3} />
            </motion.button>
          </div>

          <motion.div 
            className="pointer-events-none w-[140px] shrink-0 opacity-95"
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          >
            <img src={bannerTaxi} alt="Promo" className="w-full rounded-xl drop-shadow-2xl" />
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
};

export default PromoBanners;
