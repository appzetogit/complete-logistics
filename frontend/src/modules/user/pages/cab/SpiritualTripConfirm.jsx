import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle2, ChevronRight, MapPin, Calendar, User, ArrowLeft, Star } from 'lucide-react';

const SpiritualTripConfirm = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state || {};
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (!state.trip) {
      navigate('/cab/spiritual');
    }
  }, [navigate, state.trip]);

  if (!state.trip) return null;
  const { trip, vehicle, seats, date, time } = state;

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#F8FAFC_0%,#F3F4F6_38%,#EEF2F7_100%)] max-w-lg mx-auto font-sans pb-32 relative overflow-hidden">
      <div className="absolute -top-16 right-[-40px] h-44 w-44 rounded-full bg-purple-100/60 blur-3xl pointer-events-none" />
      <div className="absolute top-40 left-[-60px] h-40 w-40 rounded-full bg-orange-100/40 blur-3xl pointer-events-none" />

      {/* Header */}
      <header className="bg-white/90 backdrop-blur-md px-5 pt-10 pb-4 sticky top-0 z-20 border-b border-white/80 shadow-[0_4px_20px_rgba(15,23,42,0.05)]">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="w-9 h-9 rounded-[12px] border border-white/80 bg-white/90 flex items-center justify-center shadow-sm active:scale-95 transition-all">
            <ArrowLeft size={18} className="text-slate-900" strokeWidth={2.5} />
          </button>
          <div className="flex-1">
            <p className="text-[9px] font-black uppercase tracking-[0.26em] text-slate-400">Tour Booking</p>
            <h1 className="text-[19px] font-black tracking-tight text-slate-900">Confirmed</h1>
          </div>
        </div>
      </header>

      <div className="px-5 pt-10 flex flex-col items-center">
        <motion.div 
          initial={{ scale: 0, opacity: 0 }} 
          animate={{ scale: mounted ? 1 : 0, opacity: mounted ? 1 : 0 }} 
          transition={{ type: 'spring', stiffness: 200, damping: 15 }}
          className="w-24 h-24 bg-purple-50 rounded-full flex items-center justify-center mb-6 shadow-[0_8px_24px_rgba(147,51,234,0.2)]"
        >
          <CheckCircle2 size={48} className="text-purple-500" strokeWidth={2.5} />
        </motion.div>

        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-center mb-8"
        >
          <h2 className="text-[24px] font-black tracking-tight text-slate-900 leading-tight">Divine Journey Booked</h2>
          <p className="text-[13px] font-bold text-slate-500 mt-2">A verified captain connects with you soon.</p>
        </motion.div>

        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="w-full bg-white/90 backdrop-blur-md rounded-[20px] shadow-[0_8px_30px_rgba(15,23,42,0.06)] border border-white/80 p-5 space-y-4 relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-bl-full pointer-events-none" />
          
          <div className="flex justify-between items-center pb-4 border-b border-slate-100">
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Destination</p>
              <h3 className="text-[18px] font-black tracking-tight text-slate-900 leading-none">
                {trip.name} {trip.emoji}
              </h3>
            </div>
            <div className="text-right">
              <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${trip.accent.replace('bg-[linear-gradient', 'border-purple-200 bg-[linear-gradient')} text-slate-700 uppercase tracking-widest block mb-1`}>
                Guided Tour
              </span>
              <p className="text-[11px] font-black text-purple-600">{trip.dist} Trip</p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="flex flex-col items-center gap-1 mt-1 shrink-0">
              <div className="w-2.5 h-2.5 rounded-full bg-slate-300" />
              <div className="w-0.5 h-10 bg-slate-200" />
              <div className="w-2.5 h-2.5 rounded-full bg-purple-500" />
            </div>
            <div className="flex-1 space-y-4">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Pickup (Indore)</p>
                <p className="text-[14px] font-bold text-slate-900 leading-snug">Pipaliyahana, Indore</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Destination</p>
                <p className="text-[14px] font-bold text-slate-900 leading-snug tracking-tight">{trip.subtitle}</p>
              </div>
            </div>
          </div>

          <div className="bg-slate-50 rounded-[14px] p-3 flex justify-between items-center mt-2 border border-slate-100/50">
            <div className="flex items-center gap-3">
              <User size={18} className="text-purple-500" />
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Top Rated</p>
                <p className="text-[13px] font-bold text-slate-900 flex items-center gap-1">Pilgrimage Drivers <Star size={11} className="fill-purple-500 text-purple-500" /></p>
              </div>
            </div>
          </div>

          {(vehicle || date) && (
            <div className="grid grid-cols-2 gap-2 mt-2 pt-3 border-t border-slate-100">
              {date && (
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Date & Time</p>
                  <p className="text-[12px] font-bold text-slate-900">{date} at {time}</p>
                </div>
              )}
              {vehicle && (
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Vehicle</p>
                  <p className="text-[12px] font-bold text-slate-900 flex items-center gap-1">{vehicle.icon} {vehicle.name} <span className="opacity-50">· {seats} Pax</span></p>
                </div>
              )}
            </div>
          )}
        </motion.div>

      </div>

      {/* CTA */}
      <motion.div 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg px-5 pb-6 pt-3 bg-gradient-to-t from-[#EEF2F7] via-[#F3F4F6]/95 to-transparent pointer-events-none z-30"
      >
        <div className="pointer-events-auto bg-white/90 rounded-[20px] border border-white/80 shadow-[0_4px_14px_rgba(15,23,42,0.06)] px-5 py-4 flex items-center justify-between mb-3">
          <div>
            <p className="text-[11px] font-black text-slate-700 tracking-tight">Estimated Fare</p>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mt-0.5 max-w-[150px]">Based on ride time</p>
          </div>
          <p className="text-[22px] font-black text-slate-900 tracking-tight text-right">{trip.fare}</p>
        </div>
        <motion.button onClick={() => navigate('/taxi/user')}
          className="pointer-events-auto w-full bg-slate-900 py-4 rounded-[18px] text-[15px] font-black text-white shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95">
          <Home size={16} strokeWidth={2.5} /> Go to Home Dashboard
        </motion.button>
      </motion.div>
    </div>
  );
};

export default SpiritualTripConfirm;
