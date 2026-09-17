import React from 'react';
import { motion } from 'framer-motion';
import { Camera, PlayCircle, Share2, ArrowRight } from 'lucide-react';
import { useUserTheme } from '../../../shared/context/UserThemeContext';
import checkUsOutImg from '@/assets/check_us_out.jpg';

const CheckUsOutSection = () => {
  const { theme } = useUserTheme();
  const isDark = theme === 'dark';

  return (
    <div className="px-5 pb-10">
      <div className="mb-4 ml-1">
        <h2 className="text-[20px] font-black tracking-tight">Check us out</h2>
        <p className="mt-1 text-[11px] font-black uppercase tracking-[0.18em] opacity-60">
          Join our growing community
        </p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className={`relative overflow-hidden rounded-[32px] border shadow-[0_20px_50px_rgba(0,0,0,0.15)] group transition-colors duration-300 ${
          isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200/40'
        }`}
      >
        {/* Main Image Container */}
        <div className="relative h-[220px] overflow-hidden">
          <img
            src={checkUsOutImg}
            alt="Check Us Out"
            className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-slate-900/20 to-transparent" />
          
          {/* Social Badges */}
          <div className="absolute bottom-4 left-5 flex gap-2">
            <div className="h-8 w-8 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 text-white hover:bg-yellow-400 hover:text-slate-950 hover:border-yellow-400 transition-all cursor-pointer">
              <Camera size={16} strokeWidth={2.5} />
            </div>
            <div className="h-8 w-8 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 text-white hover:bg-yellow-400 hover:text-slate-950 hover:border-yellow-400 transition-all cursor-pointer">
              <PlayCircle size={16} strokeWidth={2.5} />
            </div>
            <div className="h-8 w-8 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 text-white hover:bg-yellow-400 hover:text-slate-950 hover:border-yellow-400 transition-all cursor-pointer">
              <Share2 size={16} strokeWidth={2.5} />
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="p-6">
          <div className="flex items-start justify-between">
            <div className="max-w-[75%]">
              <h3 className="text-[22px] font-black leading-tight tracking-tight">
                Experience the ride of your life.
              </h3>
              <p className="mt-2 text-[13px] font-bold opacity-60 leading-relaxed">
                Follow us for exclusive offers, updates, and more amazing journeys.
              </p>
            </div>
            <motion.button
              whileTap={{ scale: 0.95 }}
              className={`h-12 w-12 rounded-2xl flex items-center justify-center shadow-lg transition-colors ${
                isDark ? 'bg-yellow-400 text-slate-950 hover:bg-yellow-500' : 'bg-slate-900 text-white hover:bg-slate-800'
              }`}
            >
              <ArrowRight size={20} strokeWidth={3} />
            </motion.button>
          </div>
          
          {/* Stats/Features */}
          <div className={`mt-6 pt-6 border-t grid grid-cols-3 gap-4 ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest opacity-55">Rating</p>
              <p className={`mt-1 text-[16px] font-black ${isDark ? 'text-yellow-400' : 'text-slate-900'}`}>4.8/5.0</p>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest opacity-55">Users</p>
              <p className={`mt-1 text-[16px] font-black ${isDark ? 'text-yellow-400' : 'text-slate-900'}`}>50K+</p>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest opacity-55">Cities</p>
              <p className={`mt-1 text-[16px] font-black ${isDark ? 'text-yellow-400' : 'text-slate-900'}`}>20+</p>
            </div>
          </div>
        </div>

        {/* Decorative elements */}
        <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-yellow-400/5 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-amber-400/5 blur-3xl pointer-events-none" />
      </motion.div>
    </div>
  );
};

export default CheckUsOutSection;
