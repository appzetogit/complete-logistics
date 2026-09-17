import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { useUserTheme } from '../../../shared/context/UserThemeContext';
import bikeImg from '../../../assets/user-app/bike.png';
import parcelImg from '../../../assets/user-app/parcel.png';

const ActionCard = ({ title, description, image, surfaceClass, glowClass, buttonBgClass, path }) => {
  const navigate = useNavigate();

  return (
    <motion.div
      whileHover={{ y: -4, scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => navigate(path)}
      className={`group relative flex min-h-[180px] flex-1 flex-col overflow-hidden rounded-[28px] border p-5 shadow-[0_16px_36px_rgba(0,0,0,0.08)] hover:shadow-[0_20px_40px_rgba(0,0,0,0.15)] transition-all duration-300 cursor-pointer ${surfaceClass}`}
    >
      {/* Dynamic Hover Glow */}
      <div 
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" 
        style={{
          background: `radial-gradient(circle at 75% 75%, rgba(${glowClass}, 0.12) 0%, transparent 65%)`
        }}
      />
      
      {/* Corner visual gradient accent */}
      <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-white/10 to-transparent blur-md pointer-events-none" />

      <div className="relative z-10 flex flex-1 flex-col justify-between">
        <div className="max-w-[130px] space-y-1">
          <h3 className="text-[20px] font-bold tracking-tight leading-tight">
            {title}
          </h3>
          <p className="text-[11px] font-medium leading-normal opacity-70">
            {description}
          </p>
        </div>

        <div className="mt-4 flex items-center">
          <div className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[10px] font-bold shadow-md transition-all duration-300 group-hover:shadow-lg ${buttonBgClass}`}>
            <span>Go</span>
            <ArrowRight size={11} strokeWidth={3} className="transform group-hover:translate-x-0.5 transition-transform duration-200" />
          </div>
        </div>
      </div>

      {/* Floating Spotlight Image */}
      <div className="absolute -bottom-2 -right-2 w-28 h-28 pointer-events-none select-none">
        <div className="relative w-full h-full">
          <div className="absolute inset-2 rounded-full blur-xl opacity-20 group-hover:opacity-35 transition-opacity duration-300 bg-white" />
          <img
            src={image}
            alt=""
            className="w-full h-full object-contain drop-shadow-[0_16px_24px_rgba(0,0,0,0.15)] transform group-hover:scale-110 group-hover:-translate-y-1 group-hover:-translate-x-1 transition-transform duration-300"
          />
        </div>
      </div>
    </motion.div>
  );
};

const ActionsSection = () => {
  const location = useLocation();
  const routePrefix = location.pathname.startsWith('/taxi/user') ? '/taxi/user' : '';
  const { theme } = useUserTheme();
  const isDark = theme === 'dark';

  return (
    <div className="px-5">
      <div className="mb-3.5 ml-1">
        <h2 className="text-[20px] font-extrabold tracking-tight">What do you need today?</h2>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <ActionCard
          title="Ride"
          description="Bike, auto, and cab rides."
          image={bikeImg}
          surfaceClass={isDark ? "bg-gradient-to-br from-slate-900/90 via-slate-900/60 to-slate-950/20 border-slate-800/80 text-white" : "bg-gradient-to-br from-slate-50/60 via-white/80 to-slate-100/40 border-slate-200/40 text-slate-900"}
          glowClass={isDark ? "255,255,255" : "15,23,42"}
          buttonBgClass={isDark ? "bg-white hover:bg-slate-100 text-slate-950" : "bg-slate-900 hover:bg-slate-800 text-white"}
          path={`${routePrefix}/ride/select-location`}
        />

        <ActionCard
          title="Delivery"
          description="Send parcels across the city."
          image={parcelImg}
          surfaceClass={isDark ? "bg-gradient-to-br from-slate-900/90 via-slate-900/60 to-slate-950/20 border-slate-800/80 text-white" : "bg-gradient-to-br from-slate-50/60 via-white/80 to-slate-100/40 border-slate-200/40 text-slate-900"}
          glowClass={isDark ? "255,255,255" : "15,23,42"}
          buttonBgClass={isDark ? "bg-white hover:bg-slate-100 text-slate-950" : "bg-slate-900 hover:bg-slate-800 text-white"}
          path={`${routePrefix}/parcel/type`}
        />
      </div>
    </div>
  );
};

export default ActionsSection;
