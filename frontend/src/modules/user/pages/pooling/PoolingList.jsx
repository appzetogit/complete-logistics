import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  MapPin, 
  Clock, 
  Users, 
  ChevronRight, 
  Filter,
  Car,
  Star,
  ShieldCheck,
  Zap,
  Ticket,
  Navigation,
  Calendar,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { userService } from '../../services/userService';
import toast from 'react-hot-toast';

// Asset Imports
import taxiImg from '../../../../assets/3d images/AutoCab/taxi.png';

const PoolingList = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const date = searchParams.get('date');

  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRoutes();
  }, [from, to, date]);

  const fetchRoutes = async () => {
    setLoading(true);
    try {
      const res = await userService.searchPoolingRoutes({ from, to, date });
      setRoutes(res.data || []);
    } catch (error) {
      toast.error('Failed to fetch routes');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 max-w-lg mx-auto font-sans pb-24 selection:bg-indigo-100">
      {/* Immersive Header */}
      <div className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl px-5 pt-12 pb-6 shadow-sm border-b border-slate-100">
        <div className="flex items-center gap-4 mb-6">
          <button 
            onClick={() => navigate('/taxi/user/pooling')}
            className="w-11 h-11 rounded-2xl border border-slate-100 bg-white flex items-center justify-center text-slate-900 shadow-sm active:scale-95 transition-all hover:bg-slate-50"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 overflow-hidden">
            <div className="flex items-center gap-2">
              <span className="truncate text-base font-black text-slate-900 leading-tight">{from}</span>
              <ChevronRight size={14} className="text-slate-300 shrink-0" />
              <span className="truncate text-base font-black text-slate-900 leading-tight">{to}</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
               <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  <Calendar size={10} />
                  {date}
               </div>
               <span className="bg-indigo-50 text-indigo-600 text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">Step 1/3</span>
            </div>
          </div>
          <button className="w-11 h-11 rounded-2xl border border-slate-100 bg-white flex items-center justify-center text-slate-400 hover:text-slate-900 transition-colors">
            <Filter size={18} />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="flex items-center gap-2 px-1">
          <div className="h-1.5 flex-1 rounded-full bg-indigo-600 shadow-[0_0_8px_rgba(79,70,229,0.4)]" />
          <div className="h-1.5 flex-1 rounded-full bg-slate-100" />
          <div className="h-1.5 flex-1 rounded-full bg-slate-100" />
        </div>
      </div>

      <div className="px-5 pt-8">
        {loading ? (
          <div className="space-y-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-56 w-full animate-pulse rounded-[40px] bg-white border border-slate-100 shadow-sm" />
            ))}
          </div>
        ) : routes.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center py-24 text-center"
          >
            <div className="mb-8 relative">
               <div className="h-32 w-32 rounded-full bg-indigo-50/50 flex items-center justify-center text-indigo-100 animate-pulse" />
               <Car size={56} className="absolute inset-0 m-auto text-indigo-200" />
            </div>
            <h3 className="text-xl font-black text-slate-900 tracking-tight">No Rides Found</h3>
            <p className="mt-3 max-w-[260px] text-sm font-medium text-slate-500 leading-relaxed">
              We couldn't find any carpools matching your route for this date.
            </p>
            <button 
              onClick={() => navigate('/taxi/user/pooling')}
              className="mt-10 flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-white px-8 py-4 bg-slate-900 rounded-[20px] shadow-2xl shadow-slate-200 active:scale-95 transition-all"
            >
              <ArrowLeft size={16} />
              Modify Search
            </button>
          </motion.div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between px-3">
               <p className="text-[11px] font-black uppercase tracking-[0.25em] text-slate-400">{routes.length} Available Rides</p>
               <div className="flex items-center gap-1.5 text-[10px] font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full uppercase tracking-widest">
                  <ShieldCheck size={12} />
                  Verified
               </div>
            </div>

            {routes.map((route, idx) => {
              const vehicle = route.assignedVehicleTypeIds?.[0] || {};
              const vehicleImage = (vehicle.images && vehicle.images.length > 0) ? vehicle.images[0] : taxiImg;
              const serviceTaxPercentage = Number(vehicle.serviceTaxPercentage || 0);

              return (
                <motion.div
                  key={route._id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.08 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() =>
                    navigate(`/taxi/user/pooling/seats/${route._id}`, {
                      state: {
                        travelDate: date,
                      },
                    })
                  }
                  className="group relative overflow-hidden rounded-[40px] border border-white bg-white p-7 transition-all hover:border-indigo-100 hover:shadow-[0_40px_80px_-16px_rgba(15,23,42,0.1)] cursor-pointer"
                >
                  {/* Decorative Elements */}
                  <div className="absolute top-0 right-0 -mr-16 -mt-16 h-48 w-48 rounded-full bg-slate-50/50 blur-3xl group-hover:bg-indigo-50/50 transition-colors" />
                  
                  <div className="flex items-start justify-between relative z-10">
                    <div className="space-y-5 flex-1 pr-4">
                      <div className="flex items-start gap-4">
                        <div className="relative flex flex-col items-center pt-2">
                          <div className="h-3 w-3 rounded-full border-2 border-indigo-600 bg-white z-10 shadow-[0_0_8px_rgba(79,70,229,0.3)]" />
                          <div className="h-12 w-0.5 border-l-2 border-dashed border-slate-100" />
                          <div className="h-3 w-3 rounded-full bg-slate-900 z-10 ring-4 ring-slate-50" />
                        </div>
                        <div className="space-y-6 flex-1 min-w-0">
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Pickup</p>
                            <p className="text-sm font-black text-slate-900 truncate leading-tight mt-0.5">{route.originLabel}</p>
                          </div>
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Destination</p>
                            <p className="text-sm font-black text-slate-900 truncate leading-tight mt-0.5">{route.destinationLabel}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex flex-col items-end">
                      <div className="mb-6 relative h-20 w-32 overflow-hidden rounded-3xl bg-slate-50 border border-slate-100 shadow-inner group-hover:bg-white transition-colors">
                         <img src={vehicleImage} alt={vehicle.name} className="w-full h-full object-contain p-2 transform group-hover:scale-110 transition-transform duration-500" />
                         <div className="absolute bottom-1 right-2">
                           <div className="bg-white/80 backdrop-blur-md px-2 py-0.5 rounded-lg border border-slate-100">
                             <p className="text-[8px] font-black text-slate-900 uppercase tracking-widest">{vehicle.vehicleType || 'Sedan'}</p>
                           </div>
                         </div>
                      </div>
                      
                      <div className="text-right">
                         <p className="text-3xl font-black tracking-tight text-slate-900 leading-none">₹{route.farePerSeat}</p>
                         <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.15em] mt-1.5">Per Seat</p>
                         {serviceTaxPercentage > 0 ? (
                           <p className="mt-1 text-[10px] font-bold text-amber-600 uppercase tracking-[0.12em]">
                             + {serviceTaxPercentage}% service tax
                           </p>
                         ) : null}
                      </div>
                    </div>
                  </div>

                  {/* Footer Info */}
                  <div className="mt-8 flex items-center justify-between border-t border-slate-50 pt-7">
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        <div className="h-10 w-10 overflow-hidden rounded-2xl bg-slate-100 border-2 border-white shadow-sm ring-1 ring-slate-50">
                          <img src={`https://ui-avatars.com/api/?name=${route.driverName || 'Verified'}&background=4f46e5&color=fff&bold=true&font-size=0.45`} alt="" className="w-full h-full object-cover" />
                        </div>
                        <div className="absolute -right-1 -bottom-1 h-4 w-4 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center">
                          <ShieldCheck size={8} className="text-white" />
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-black text-slate-900">{route.driverName || 'Verified Captain'}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <div className="flex items-center gap-0.5">
                            {[...Array(5)].map((_, i) => (
                              <Star key={i} size={8} className={i < 4 ? "text-amber-400 fill-amber-400" : "text-slate-200 fill-slate-200"} />
                            ))}
                          </div>
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">4.8 • Top Pilot</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <div className="flex flex-col items-end">
                         <div className="flex items-center gap-1.5 text-[11px] font-black text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full uppercase tracking-widest">
                           <Zap size={10} fill="currentColor" />
                           Instant
                         </div>
                         <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 mt-2 tracking-tight">
                           <Users size={12} className="text-slate-300" />
                           {route.maxSeatsPerBooking} seats left
                         </div>
                      </div>
                      <div className="flex h-11 w-11 items-center justify-center rounded-[18px] bg-slate-900 text-white shadow-xl shadow-slate-200 group-hover:bg-indigo-600 group-hover:shadow-indigo-100 transition-all">
                         <ChevronRight size={22} className="group-hover:translate-x-0.5 transition-transform" />
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default PoolingList;
