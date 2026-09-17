import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, ChevronRight, MapPin } from 'lucide-react';

const DESTINATIONS = [
  { id: 'ujjain',      name: 'Ujjain',       subtitle: 'Mahakaleshwar Jyotirlinga', dist: '55 km',  fare: '₹800–₹1,200',  emoji: '🛕', accent: 'bg-[linear-gradient(135deg,#FDF4FF_0%,#F3E8FF_100%)]' },
  { id: 'omkareshwar', name: 'Omkareshwar',  subtitle: 'Jyotirlinga on Narmada',   dist: '77 km',  fare: '₹1,000–₹1,500', emoji: '🙏', accent: 'bg-[linear-gradient(135deg,#FFF7ED_0%,#FFE5C2_100%)]' },
  { id: 'maheshwar',   name: 'Maheshwar',    subtitle: 'Ahilya Fort & Ghats',      dist: '91 km',  fare: '₹1,200–₹1,800', emoji: '⛵', accent: 'bg-[linear-gradient(135deg,#EFF6FF_0%,#DBEAFE_100%)]' },
  { id: 'orchha',      name: 'Orchha',       subtitle: 'Ram Raja Temple',          dist: '320 km', fare: '₹3,500–₹5,000', emoji: '🏯', accent: 'bg-[linear-gradient(135deg,#F0FDF4_0%,#BBF7D0_100%)]' },
  { id: 'omkareshwar2',name: 'Pitambara Peeth', subtitle: 'Datia, Madhya Pradesh', dist: '210 km', fare: '₹2,500–₹3,500', emoji: '🌸', accent: 'bg-[linear-gradient(135deg,#FDF4FF_0%,#FBCFE8_100%)]' },
  { id: 'amarkantak',  name: 'Amarkantak',   subtitle: 'Source of Narmada River',  dist: '380 km', fare: '₹4,000–₹5,500', emoji: '🏔️', accent: 'bg-[linear-gradient(135deg,#F0FDF4_0%,#D1FAE5_100%)]' },
];

const SpiritualTrip = () => {
  const navigate = useNavigate();

  const handleSelect = (dest) => {
    navigate('/cab/spiritual-vehicle', {
      state: { isSpiritualTrip: true, trip: dest },
    });
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#F8FAFC_0%,#F3F4F6_38%,#EEF2F7_100%)] max-w-lg mx-auto font-sans pb-12 relative overflow-hidden">
      <div className="absolute -top-16 right-[-40px] h-44 w-44 rounded-full bg-purple-100/60 blur-3xl pointer-events-none" />
      <div className="absolute top-52 left-[-60px] h-52 w-52 rounded-full bg-orange-100/40 blur-3xl pointer-events-none" />

      {/* Header */}
      <header className="bg-white/90 backdrop-blur-md px-5 pt-10 pb-4 sticky top-0 z-20 border-b border-white/80 shadow-[0_4px_20px_rgba(15,23,42,0.05)]">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-[12px] border border-white/80 bg-white/90 flex items-center justify-center shadow-sm active:scale-95 transition-all">
            <ArrowLeft size={18} className="text-slate-900" strokeWidth={2.5} />
          </button>
          <div className="flex-1">
            <p className="text-[9px] font-black uppercase tracking-[0.26em] text-slate-400">Auto & Cab</p>
            <h1 className="text-[19px] font-black tracking-tight text-slate-900">Spiritual Trips</h1>
          </div>
          <span className="text-[9px] font-black px-2.5 py-1 rounded-full border bg-purple-50 text-purple-600 border-purple-100">Guided Tours</span>
        </div>
      </header>

      <div className="px-5 pt-4 space-y-4">
        {/* Intro card */}
        <div className="rounded-[20px] bg-gradient-to-br from-purple-600 to-purple-800 p-5 text-white shadow-[0_8px_24px_rgba(147,51,234,0.25)]">
          <p className="text-[10px] font-black text-purple-200 uppercase tracking-widest mb-1">From Indore</p>
          <h2 className="text-[18px] font-black leading-tight">Sacred Journeys<br />to Holy Sites</h2>
          <p className="text-[11px] font-bold text-purple-200 mt-1">Comfortable cabs · Experienced drivers · Best prices</p>
        </div>

        {/* Section label */}
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.26em] text-slate-400">Popular Destinations</p>
          <h2 className="mt-0.5 text-[16px] font-black tracking-tight text-slate-900">Choose your pilgrimage</h2>
        </div>

        {/* Destination grid */}
        <div className="grid grid-cols-2 gap-3">
          {DESTINATIONS.map((dest, i) => (
            <motion.button key={dest.id} type="button"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => handleSelect(dest)}
              className={`rounded-[20px] border border-white/80 shadow-[0_4px_14px_rgba(15,23,42,0.06)] p-4 text-left flex flex-col gap-2 ${dest.accent}`}>
              <span className="text-3xl">{dest.emoji}</span>
              <div>
                <p className="text-[14px] font-black text-slate-900 leading-tight">{dest.name}</p>
                <p className="text-[10px] font-bold text-slate-500 mt-0.5 leading-tight">{dest.subtitle}</p>
              </div>
              <div className="flex items-center justify-between mt-auto pt-1">
                <div>
                  <div className="flex items-center gap-1">
                    <MapPin size={9} className="text-slate-400" strokeWidth={2.5} />
                    <span className="text-[9px] font-bold text-slate-400">{dest.dist}</span>
                  </div>
                  <p className="text-[10px] font-black text-slate-700">{dest.fare}</p>
                </div>
                <div className="w-6 h-6 rounded-full bg-white/70 flex items-center justify-center">
                  <ChevronRight size={12} className="text-slate-500" strokeWidth={2.5} />
                </div>
              </div>
            </motion.button>
          ))}
        </div>

        {/* Note */}
        <div className="rounded-[16px] border border-white/80 bg-white/90 px-4 py-3 shadow-[0_2px_8px_rgba(15,23,42,0.04)]">
          <p className="text-[11px] font-bold text-slate-400 leading-relaxed">
            All fares are estimates. Final fare depends on vehicle type and route. Drivers are experienced with pilgrimage routes.
          </p>
        </div>
      </div>
    </div>
  );
};

export default SpiritualTrip;
