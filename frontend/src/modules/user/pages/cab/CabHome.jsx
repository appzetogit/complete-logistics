import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useSettings } from '../../../../shared/context/SettingsContext';

import imgShared    from '@/assets/3d images/AutoCab/taxi.png';
import imgAirport   from '@/assets/3d images/AutoCab/airoplan.png';
import imgSpiritual from '@/assets/3d images/AutoCab/temple.png';
import imgOneWay    from '@/assets/3d images/AutoCab/one way.png';
import imgBus       from '@/assets/3d images/AutoCab/bus.png';

const isEnabledFlag = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(String(value || '').trim().toLowerCase());
};

const services = [
  {
    id: 'shared',
    title: 'Shared Taxi',
    sub: 'Split fare with co-passengers',
    img: imgShared,
    path: '/cab/shared',
    accent: 'bg-[linear-gradient(135deg,#F0FDF4_0%,#BBF7D0_100%)]',
    tag: '50% cheaper',
    tagColor: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  },
  {
    id: 'airport',
    title: 'Airport Cab',
    sub: 'On-time airport transfers',
    img: imgAirport,
    path: '/cab/airport',
    accent: 'bg-[linear-gradient(135deg,#EFF6FF_0%,#DBEAFE_100%)]',
    tag: 'Fixed fare',
    tagColor: 'bg-blue-50 text-blue-600 border-blue-100',
  },
  {
    id: 'spiritual',
    title: 'Spiritual Trips',
    sub: 'Ujjain, Omkareshwar & more',
    img: imgSpiritual,
    path: '/cab/spiritual',
    accent: 'bg-[linear-gradient(135deg,#FDF4FF_0%,#F3E8FF_100%)]',
    tag: 'Guided tours',
    tagColor: 'bg-purple-50 text-purple-600 border-purple-100',
  },
  {
    id: 'oneway',
    title: 'One Way',
    sub: 'Intercity drop at best price',
    img: imgOneWay,
    path: '/intercity',
    accent: 'bg-[linear-gradient(135deg,#FFF7ED_0%,#FFE5C2_100%)]',
    tag: 'No return charge',
    tagColor: 'bg-orange-50 text-orange-600 border-orange-100',
  },
  {
    id: 'bus',
    title: 'Bus Booking',
    sub: 'Comfortable intercity buses',
    img: imgBus,
    path: '/bus',
    accent: 'bg-[linear-gradient(135deg,#FFF1F2_0%,#FECDD3_100%)]',
    tag: 'Sleeper & Seater',
    tagColor: 'bg-rose-50 text-rose-600 border-rose-100',
  },
];

const CabHome = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { settings } = useSettings();
  const showBusService = isEnabledFlag(settings.transportRide?.enable_bus_service);
  const visibleServices = services.filter((service) => showBusService || service.id !== 'bus');
  const routePrefix = location.pathname.startsWith('/taxi/user') ? '/taxi/user' : '';

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#F8FAFC_0%,#F3F4F6_38%,#EEF2F7_100%)] max-w-lg mx-auto font-sans pb-12 relative overflow-hidden">
      <div className="absolute -top-16 right-[-40px] h-44 w-44 rounded-full bg-purple-100/60 blur-3xl pointer-events-none" />
      <div className="absolute top-52 left-[-60px] h-52 w-52 rounded-full bg-blue-100/40 blur-3xl pointer-events-none" />

      {/* Header */}
      <motion.header initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white/90 backdrop-blur-md px-5 pt-10 pb-4 sticky top-0 z-20 border-b border-white/80 shadow-[0_4px_20px_rgba(15,23,42,0.05)]">
        <div className="flex items-center gap-3">
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-[12px] border border-white/80 bg-white/90 flex items-center justify-center shadow-[0_4px_12px_rgba(15,23,42,0.07)] shrink-0">
            <ArrowLeft size={18} className="text-slate-900" strokeWidth={2.5} />
          </motion.button>
          <div className="flex-1 min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.26em] text-slate-400">Auto & Cab</p>
            <h1 className="text-[19px] font-black tracking-tight text-slate-900 leading-tight">Choose a Service</h1>
          </div>
          <img src="/4_Taxi.png" alt="cab" className="h-10 w-10 object-contain drop-shadow-md shrink-0" />
        </div>
      </motion.header>

      <div className="px-5 pt-5 space-y-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.26em] text-slate-400">{visibleServices.length} services available</p>
          <h2 className="mt-0.5 text-[16px] font-black tracking-tight text-slate-900">What do you need?</h2>
        </div>

        {visibleServices.map((s, i) => (
          <motion.button key={s.id} type="button"
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.06 + i * 0.07 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate(`${routePrefix}${s.path}`)}
            className="w-full flex items-center gap-4 rounded-[20px] border border-white/80 bg-white/90 shadow-[0_4px_14px_rgba(15,23,42,0.06)] px-4 py-4 text-left">
            <div className={`w-12 h-12 rounded-[16px] flex items-center justify-center shrink-0 overflow-visible ${s.accent}`}>
              <img src={s.img} alt={s.title} className="w-14 h-14 object-contain drop-shadow-md" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[15px] font-black text-slate-900 leading-tight">{s.title}</span>
                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${s.tagColor}`}>{s.tag}</span>
              </div>
              <p className="text-[11px] font-bold text-slate-400 mt-0.5">{s.sub}</p>
            </div>
            <ArrowRight size={16} className="text-slate-300 shrink-0" strokeWidth={2.5} />
          </motion.button>
        ))}
      </div>
    </div>
  );
};

export default CabHome;
