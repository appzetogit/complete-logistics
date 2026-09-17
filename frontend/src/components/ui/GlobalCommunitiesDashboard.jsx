import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, MapPin, Activity, Shield, TrendingUp, Car, Bike, Package, Globe
} from 'lucide-react';

const cities = [
  { name: 'Indore', x: 280, y: 190, color: '#FFB300', active: true },
  { name: 'Bhopal', x: 380, y: 170, color: '#2563EB', active: true },
  { name: 'Ujjain', x: 220, y: 150, color: '#10B981', active: true },
  { name: 'Mumbai', x: 190, y: 290, color: '#8B5CF6', active: true },
  { name: 'Delhi NCR', x: 310, y: 70, color: '#EC4899', active: true },
];

const mockRides = [
  { id: 1, city: 'Indore', type: 'Ride', icon: Car, text: 'Premium ride booked near Vijay Nagar', time: 'Just now', color: 'text-amber-400' },
  { id: 2, city: 'Bhopal', type: 'Parcel', icon: Package, text: 'Express parcel picked up from MP Nagar', time: '1m ago', color: 'text-blue-400' },
  { id: 3, city: 'Ujjain', type: 'Bike', icon: Bike, text: 'Bike Taxi reached Mahakal Temple', time: '3m ago', color: 'text-emerald-400' },
  { id: 4, city: 'Mumbai', type: 'Ride', icon: Car, text: 'Airport transfer completed successfully', time: '4m ago', color: 'text-purple-400' },
  { id: 5, city: 'Delhi NCR', type: 'Parcel', icon: Package, text: 'Instant delivery package dispatched', time: '6m ago', color: 'text-pink-400' },
];

const feedPool = [
  { city: 'Indore', type: 'Bike', icon: Bike, text: 'Quick bike taxi booked to C21 Mall', color: 'text-emerald-400' },
  { city: 'Mumbai', type: 'Ride', icon: Car, text: 'Luxury sedan booked to Bandra Stand', color: 'text-amber-400' },
  { city: 'Bhopal', type: 'Ride', icon: Car, text: 'Outstation booking started for Indore', color: 'text-blue-400' },
  { city: 'Ujjain', type: 'Parcel', icon: Package, text: 'Prasad parcel delivery initiated', color: 'text-pink-400' },
  { city: 'Delhi NCR', type: 'Ride', icon: Car, text: 'City cab request active in Connaught Place', color: 'text-amber-400' },
];

export const GlobalCommunitiesDashboard = () => {
  const [feed, setFeed] = useState(mockRides);
  const [stats, setStats] = useState({
    activeRiders: 1842,
    liveTrips: 457,
    completedToday: 12840,
    safetyScore: 99.8
  });

  // Simulate real-time dashboard updates
  useEffect(() => {
    const feedInterval = setInterval(() => {
      const randomEvent = feedPool[Math.floor(Math.random() * feedPool.length)];
      const newEvent = {
        id: Date.now(),
        ...randomEvent,
        time: 'Just now'
      };

      setFeed(prev => {
        const updated = [newEvent, ...prev.slice(0, 4)];
        return updated.map((item, idx) => {
          if (idx === 0) return item;
          // Increment times slightly
          return {
            ...item,
            time: item.time === 'Just now' ? '1m ago' : `${idx + 1}m ago`
          };
        });
      });

      // Update counters slightly to show active updates
      setStats(prev => ({
        activeRiders: prev.activeRiders + Math.floor(Math.random() * 7) - 3,
        liveTrips: prev.liveTrips + Math.floor(Math.random() * 5) - 2,
        completedToday: prev.completedToday + 1,
        safetyScore: parseFloat((99.8 + (Math.random() * 0.1 - 0.05)).toFixed(2))
      }));
    }, 4000);

    return () => clearInterval(feedInterval);
  }, []);

  return (
    <div className="w-full h-full bg-slate-950 text-slate-100 flex flex-col font-sans p-4 md:p-6 overflow-hidden select-none">
      
      {/* Top Header / Status Row */}
      <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="relative flex h-3.5 w-3.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500"></span>
          </div>
          <div>
            <h3 className="font-extrabold text-[15px] tracking-wide text-white uppercase">Live Network Operations</h3>
            <p className="text-[10px] text-slate-400 font-medium">Real-time telemetry and global dispatcher view</p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1 text-xs">
          <Globe className="text-[#FFB300] animate-spin-slow" size={14} />
          <span className="text-[11px] font-bold text-slate-300">5 Regional Hubs Active</span>
        </div>
      </div>

      {/* Grid Layout: Map (Left 60%) + Dashboard Stats & Live Feed (Right 40%) */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-5 gap-4 overflow-hidden">
        
        {/* Visual Map Area */}
        <div className="lg:col-span-3 bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 flex flex-col relative overflow-hidden group">
          <div className="absolute top-3 left-3 z-10">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 flex items-center gap-1.5">
              <MapPin size={10} className="text-[#FFB300]" /> Visual Routing Map
            </span>
          </div>

          {/* SVG Map Graphic */}
          <div className="flex-1 flex items-center justify-center relative w-full h-[220px] md:h-full">
            <svg viewBox="0 0 600 360" className="w-full h-full max-h-[300px] text-slate-800 select-none">
              
              {/* Map grid lines / network visual */}
              <defs>
                <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                  <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(51, 65, 85, 0.15)" strokeWidth="1" />
                </pattern>
                <radialGradient id="mapGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#FFB300" stopOpacity="0.1" />
                  <stop offset="100%" stopColor="#1e293b" stopOpacity="0" />
                </radialGradient>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
              <circle cx="300" cy="180" r="220" fill="url(#mapGlow)" />

              {/* Dotted Connection Routes (Animations) */}
              <path d="M 280 190 Q 330 180 380 170" fill="none" stroke="#FFB300" strokeWidth="2" strokeDasharray="5,5" className="animate-[dash_15s_linear_infinite]" />
              <path d="M 280 190 Q 250 170 220 150" fill="none" stroke="#10B981" strokeWidth="2" strokeDasharray="5,5" className="animate-[dash_12s_linear_infinite]" />
              <path d="M 280 190 Q 235 240 190 290" fill="none" stroke="#8B5CF6" strokeWidth="2.5" strokeDasharray="6,6" className="animate-[dash_18s_linear_infinite]" />
              <path d="M 380 170 Q 345 120 310 70" fill="none" stroke="#EC4899" strokeWidth="2" strokeDasharray="4,4" className="animate-[dash_10s_linear_infinite]" />
              <path d="M 310 70 Q 295 130 280 190" fill="none" stroke="#FFB300" strokeWidth="2" strokeDasharray="5,5" className="animate-[dash_14s_linear_infinite]" />

              {/* Pulsing City Nodes */}
              {cities.map((city) => (
                <g key={city.name} className="cursor-pointer">
                  {/* Ping Animation ring */}
                  <circle cx={city.x} cy={city.y} r="12" fill={city.color} opacity="0.3" className="animate-ping" style={{ transformOrigin: `${city.x}px ${city.y}px` }} />
                  {/* Main solid dot */}
                  <circle cx={city.x} cy={city.y} r="6" fill={city.color} className="stroke-slate-950 stroke-2" />
                  {/* Text Label */}
                  <text x={city.x + 10} y={city.y + 4} fill="#94A3B8" fontSize="10" className="font-black tracking-wide" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
                    {city.name}
                  </text>
                </g>
              ))}

              {/* Animated Tiny Moving Vehicle Indicators */}
              <motion.circle
                r="4.5"
                fill="#FFB300"
                className="stroke-white stroke-1"
                animate={{
                  cx: [280, 310, 345, 380, 330, 280],
                  cy: [190, 180, 175, 170, 180, 190],
                }}
                transition={{
                  duration: 8,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
              />
              <motion.circle
                r="4"
                fill="#10B981"
                className="stroke-white stroke-1"
                animate={{
                  cx: [280, 250, 220, 250, 280],
                  cy: [190, 170, 150, 170, 190],
                }}
                transition={{
                  duration: 6,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
              />
              <motion.circle
                r="4"
                fill="#8B5CF6"
                className="stroke-white stroke-1"
                animate={{
                  cx: [280, 235, 190, 235, 280],
                  cy: [190, 240, 290, 240, 190],
                }}
                transition={{
                  duration: 10,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
              />
            </svg>
          </div>

          {/* Quick HUD details */}
          <div className="mt-2 bg-slate-950/80 border border-slate-800 rounded-xl p-3 grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-[9px] text-slate-400 font-extrabold uppercase">Indore HUB</p>
              <p className="text-xs font-black text-amber-400">942 trips/hr</p>
            </div>
            <div className="border-x border-slate-800">
              <p className="text-[9px] text-slate-400 font-extrabold uppercase">Bhopal HUB</p>
              <p className="text-xs font-black text-blue-400">628 trips/hr</p>
            </div>
            <div>
              <p className="text-[9px] text-slate-400 font-extrabold uppercase">Mumbai HUB</p>
              <p className="text-xs font-black text-purple-400">1,208 trips/hr</p>
            </div>
          </div>
        </div>

        {/* Dashboard Stats & Live Event Log */}
        <div className="lg:col-span-2 flex flex-col gap-4 overflow-hidden">
          
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 gap-3">
            
            <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-3.5 flex flex-col justify-between hover:border-slate-700 transition">
              <div className="flex items-center justify-between mb-1.5">
                <Users size={16} className="text-amber-400" />
                <span className="text-[8px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-full font-bold uppercase">LIVE</span>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold">Active Riders</p>
                <p className="text-lg font-black text-white">{stats.activeRiders.toLocaleString()}</p>
              </div>
            </div>

            <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-3.5 flex flex-col justify-between hover:border-slate-700 transition">
              <div className="flex items-center justify-between mb-1.5">
                <Activity size={16} className="text-emerald-400 animate-pulse" />
                <span className="text-[8px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full font-bold uppercase">Trips</span>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold">In-Progress</p>
                <p className="text-lg font-black text-white">{stats.liveTrips}</p>
              </div>
            </div>

            <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-3.5 flex flex-col justify-between hover:border-slate-700 transition">
              <div className="flex items-center justify-between mb-1.5">
                <TrendingUp size={16} className="text-blue-400" />
                <span className="text-[8px] bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full font-bold uppercase">Today</span>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold">Completed Rides</p>
                <p className="text-lg font-black text-white">{stats.completedToday.toLocaleString()}</p>
              </div>
            </div>

            <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-3.5 flex flex-col justify-between hover:border-slate-700 transition">
              <div className="flex items-center justify-between mb-1.5">
                <Shield size={16} className="text-purple-400" />
                <span className="text-[8px] bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded-full font-bold uppercase">Safety</span>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold">Safety Index</p>
                <p className="text-lg font-black text-white">{stats.safetyScore}%</p>
              </div>
            </div>

          </div>

          {/* Live Feed Container */}
          <div className="flex-1 bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 flex flex-col overflow-hidden min-h-[160px]">
            <div className="flex items-center justify-between mb-3 border-b border-slate-800/50 pb-2">
              <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 flex items-center gap-1.5">
                <Activity size={12} className="text-rose-400 animate-pulse" /> Dispatch Log
              </span>
              <span className="text-[9px] font-bold text-[#FFB300]">Streaming live</span>
            </div>

            {/* Scrollable feed items */}
            <div className="flex-1 flex flex-col gap-2.5 overflow-hidden">
              <AnimatePresence initial={false}>
                {feed.map((item) => {
                  const IconComponent = item.icon;
                  return (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, y: -15, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                      className="bg-slate-950/70 border border-slate-850 p-2.5 rounded-xl flex items-start gap-3 hover:border-slate-800 transition"
                    >
                      <div className={`p-1.5 bg-slate-900 rounded-lg shrink-0 ${item.color}`}>
                        <IconComponent size={14} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[10px] font-extrabold text-slate-300">{item.city} HUB</span>
                          <span className="text-[8px] text-slate-500 font-bold uppercase tracking-wider">{item.time}</span>
                        </div>
                        <p className="text-[11px] text-slate-400 font-medium truncate">{item.text}</p>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>

        </div>

      </div>

      {/* Embedded CSS for custom keyframe animations */}
      <style>{`
        @keyframes dash {
          to {
            stroke-dashoffset: -100;
          }
        }
        .animate-spin-slow {
          animation: spin 8s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
