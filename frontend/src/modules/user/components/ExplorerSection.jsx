import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { useUserTheme } from '../../../shared/context/UserThemeContext';
import indiaGateImg from '@/assets/india_gate_real.png';
import jaipurImg from '@/assets/jaipur.avif';
import tajMahalImg from '@/assets/taj mahal.jpeg';

const ExplorerSection = () => {
  const navigate = useNavigate();
  const { theme } = useUserTheme();
  const isDark = theme === 'dark';

  const indiaCities = [
    {
      title: 'Taj Mahal',
      image: tajMahalImg,
      label: 'Agra',
      code: 'AGR',
      drop: 'Taj Mahal, Agra',
    },
    {
      title: 'Hawa Mahal',
      image: jaipurImg,
      label: 'Jaipur',
      code: 'JAI',
      drop: 'Hawa Mahal, Jaipur',
    },
    {
      title: 'India Gate',
      image: indiaGateImg,
      label: 'New Delhi',
      code: 'DEL',
      drop: 'India Gate, New Delhi',
    },
  ];

  const handleExploreDestination = (city) => {
    navigate('/taxi/user/ride/select-location', {
      state: {
        drop: city.drop || city.title,
      },
    });
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const cardVariants = {
    hidden: { opacity: 0, scale: 0.95, y: 15 },
    show: {
      opacity: 1,
      scale: 1,
      y: 0,
      transition: {
        type: 'spring',
        stiffness: 260,
        damping: 24,
      },
    },
  };

  return (
    <div className="px-5 pb-8 flex flex-col gap-10">
      <div>
        <div className="mb-3 ml-1">
          <h2 className="text-[19px] font-black tracking-tight">Explore India</h2>
          <p className="mt-1 text-[11px] font-black uppercase tracking-[0.18em] opacity-60">
            Top tourist destinations across the country
          </p>
        </div>

        <motion.div 
          variants={containerVariants}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-40px" }}
          className="flex gap-4 overflow-x-auto no-scrollbar scroll-smooth pb-5 px-1"
        >
          {indiaCities.map((city, idx) => (
            <motion.button
              key={idx}
              variants={cardVariants}
              type="button"
              onClick={() => handleExploreDestination(city)}
              className="flex-shrink-0 w-[214px] group text-left transition-all active:scale-[0.98] cursor-pointer"
            >
              <div className={`rounded-[20px] border overflow-hidden h-[136px] transition-all relative ${
                isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-200/40 bg-white'
              }`}>
                <img
                  src={city.image}
                  alt={city.title}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900/45 to-transparent"></div>
                <div className={`absolute top-4 right-4 backdrop-blur-md px-2.5 py-1 rounded-full shadow-sm border z-10 ${
                  isDark ? 'bg-slate-900/90 border-slate-700' : 'bg-white/92 border-slate-200'
                }`}>
                  <p className="text-[9px] font-black text-yellow-500 tracking-widest uppercase">{city.code}</p>
                </div>
              </div>
              <div className="mt-3 px-2">
                <h4 className="text-[15px] font-black leading-tight tracking-tight flex items-center justify-between">
                  {city.title}
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
                    isDark ? 'bg-slate-800 text-yellow-400 group-hover:bg-yellow-400 group-hover:text-slate-950' : 'bg-slate-100 text-slate-500 group-hover:bg-slate-900 group-hover:text-white'
                  }`}>
                    <ArrowRight size={14} strokeWidth={2.5} />
                  </div>
                </h4>
                <p className="text-[11px] opacity-60 font-bold mt-1 tracking-tight">
                  Located in {city.label}
                </p>
              </div>
            </motion.button>
          ))}
          
          <motion.button
            variants={cardVariants}
            type="button"
            onClick={() => handleExploreDestination(indiaCities[0])}
            className={`flex-shrink-0 w-[128px] flex flex-col justify-center items-center gap-2 border rounded-[18px] active:scale-95 transition-all font-black h-[136px] self-start shadow-md ${
              isDark ? 'bg-slate-900/80 border-slate-800 text-yellow-400' : 'bg-white/75 border-slate-200/60 text-slate-500'
            }`}
          >
            <div className={`w-10 h-10 rounded-full border shadow-sm flex items-center justify-center ${
              isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'
            }`}>
              <ArrowRight size={18} strokeWidth={2.5} className="text-yellow-500" />
            </div>
            <span className="text-[11px] uppercase tracking-[0.14em]">View All</span>
          </motion.button>
        </motion.div>
      </div>
    </div>
  );
};

export default ExplorerSection;
