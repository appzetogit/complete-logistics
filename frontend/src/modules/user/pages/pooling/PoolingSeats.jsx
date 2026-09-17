import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronRight,
  Armchair,
  Info,
  ShieldCheck,
  Zap,
  Car,
  User,
  CheckCircle2,
  AlertCircle,
  Shield,
  Clock,
  Navigation,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { userService } from '../../services/userService';
import toast from 'react-hot-toast';

// Asset Imports
import taxiImg from '../../../../assets/3d images/AutoCab/taxi.png';

const SEAT_LEGEND = [
  { key: 'available', label: 'Available', color: 'bg-white border-slate-200 text-slate-400' },
  { key: 'selected', label: 'Selected', color: 'bg-indigo-600 border-indigo-600 text-white shadow-indigo-200 shadow-lg' },
  { key: 'booked', label: 'Booked', color: 'bg-slate-100 border-slate-100 text-slate-300' },
  { key: 'driver', label: 'Driver', color: 'bg-slate-900 border-slate-900 text-slate-400' },
];

const unwrapPayload = (response) => response?.data?.data || response?.data || response || {};

const computePoolingFareBreakdown = (route, selectedVehicle, seatCount) => {
  const safeSeatCount = Math.max(0, Number(seatCount || 0));
  const farePerSeat = Math.max(0, Number(route?.farePerSeat || 0));
  const baseFare = Math.round(farePerSeat * safeSeatCount * 100) / 100;
  const serviceTaxPercentage = Math.max(0, Number(selectedVehicle?.serviceTaxPercentage || 0));
  const serviceTaxAmount = Math.round((baseFare * serviceTaxPercentage) * 100) / 100 / 100;
  const totalFare = Math.round((baseFare + serviceTaxAmount) * 100) / 100;

  return { baseFare, serviceTaxPercentage, serviceTaxAmount, totalFare };
};

const PoolingSeats = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const travelDate = location.state?.travelDate || '';

  const [route, setRoute] = useState(null);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [bookedSeatIds, setBookedSeatIds] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRouteDetails();
  }, [id, travelDate]);

  const fetchRouteDetails = async () => {
    setLoading(true);
    try {
      const response = await userService.getPoolingRouteDetails(id, travelDate ? { travelDate } : undefined);
      const routeData = unwrapPayload(response);
      setRoute(routeData);

      const nextVehicle =
        (Array.isArray(routeData?.assignedVehicleTypeIds) && routeData.assignedVehicleTypeIds[0]) ||
        (Array.isArray(routeData?.assignedVehicles) && routeData.assignedVehicles[0]) ||
        null;
      setSelectedVehicle(nextVehicle);

      const activeSchedules = Array.isArray(routeData?.schedules) ? routeData.schedules : [];
      const selectedSchedule =
        activeSchedules.find((item) => String(item?.status || 'active') === 'active') ||
        activeSchedules[0] ||
        null;

      const seatAvailability = routeData?.seatAvailability || {};
      const availabilityKey =
        nextVehicle?._id && selectedSchedule?.id
          ? `${String(nextVehicle._id)}:${String(selectedSchedule.id)}`
          : '';
      const nextBookedSeatIds =
        availabilityKey && Array.isArray(seatAvailability[availabilityKey])
          ? seatAvailability[availabilityKey]
          : [];

      setBookedSeatIds(nextBookedSeatIds);
      setSelectedSeats((current) => current.filter((seatId) => !nextBookedSeatIds.includes(seatId)));
    } catch {
      toast.error('Failed to load route details');
    } finally {
      setLoading(false);
    }
  };

  const toggleSeat = (seatId) => {
    if (bookedSeatIds.includes(seatId)) {
      toast.error('This seat is already booked by another user');
      return;
    }

    if (selectedSeats.includes(seatId)) {
      setSelectedSeats((current) => current.filter((idValue) => idValue !== seatId));
      return;
    }

    if (selectedSeats.length >= (route?.maxSeatsPerBooking || 1)) {
      toast.error(`Maximum ${route?.maxSeatsPerBooking} seats allowed`);
      return;
    }

    setSelectedSeats((current) => [...current, seatId]);
  };

  const handleContinue = () => {
    if (selectedSeats.length === 0) {
      toast.error('Please select at least one seat');
      return;
    }

    const activeSchedules = Array.isArray(route?.schedules) ? route.schedules : [];
    const selectedSchedule =
      activeSchedules.find((item) => String(item?.status || 'active') === 'active') ||
      activeSchedules[0] ||
      null;
    if (!selectedSchedule?.id) {
      toast.error('No active schedule is available for this route');
      return;
    }

    const pickupStop =
      (Array.isArray(route?.pickupPoints) && route.pickupPoints[0]) ||
      (Array.isArray(route?.stops) && route.stops[0]) ||
      null;
    const dropStop =
      (Array.isArray(route?.dropPoints) && route.dropPoints[0]) ||
      (Array.isArray(route?.stops) && route.stops[route.stops.length - 1]) ||
      null;
    if (!pickupStop?.id || !dropStop?.id) {
      toast.error('Route pickup or drop point is missing');
      return;
    }

    navigate('/taxi/user/pooling/confirm', {
      state: {
        route,
        vehicle: selectedVehicle,
        selectedSeats,
        fareBreakdown: computePoolingFareBreakdown(route, selectedVehicle, selectedSeats.length),
        travelDate,
        schedule: selectedSchedule,
        pickupStop,
        dropStop,
      },
    });
  };

  if (loading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-white p-6 text-center">
        <div className="relative flex items-center justify-center mb-8">
          <motion.div 
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            className="h-24 w-24 rounded-full border-[3px] border-slate-100 border-t-indigo-600" 
          />
          <Car className="absolute text-slate-900" size={32} />
        </div>
        <h2 className="text-xl font-black text-slate-900 tracking-tight">Initializing Seats</h2>
        <p className="mt-2 text-xs font-bold uppercase tracking-widest text-slate-400">Please wait while we sync availability</p>
      </div>
    );
  }

  const blueprint = selectedVehicle?.blueprint || { cols: 0, layout: [] };
  const maxSeats = route?.maxSeatsPerBooking || 1;
  const bookedCount = bookedSeatIds.length;
  const vehicleImage = (selectedVehicle?.images && selectedVehicle.images.length > 0) ? selectedVehicle.images[0] : taxiImg;
  const fareBreakdown = computePoolingFareBreakdown(route, selectedVehicle, selectedSeats.length);

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-slate-50 pb-40 font-sans selection:bg-indigo-100">
      <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-slate-100 px-5 pb-6 pt-12">
        <div className="mb-6 flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-100 bg-white text-slate-900 shadow-sm transition-all hover:bg-slate-50 active:scale-95"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black tracking-tight text-slate-900">Select Seats</h1>
              <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-indigo-600">
                Step 2/3
              </span>
            </div>
            <p className="truncate text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 mt-0.5">
              {route?.originLabel} <span className="mx-1 text-slate-300">→</span> {route?.destinationLabel}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/50 p-3 hover:bg-slate-50 transition-colors">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
              <Car size={18} className="text-slate-900" />
            </div>
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Vehicle</p>
              <p className="truncate text-xs font-black text-slate-900 uppercase">{selectedVehicle?.name || 'Assigned'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/50 p-3 hover:bg-slate-50 transition-colors">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
              <Zap size={18} className="text-amber-500 fill-amber-500/10" />
            </div>
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Base Fare</p>
              <p className="text-xs font-black text-slate-900">
                ₹{route?.farePerSeat}
                <span className="text-[9px] font-bold text-slate-400 ml-1">/seat</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 pt-8">
        {/* Vehicle Preview Card */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 relative overflow-hidden rounded-[40px] border border-white bg-white p-6 shadow-xl shadow-slate-200/50 group"
        >
          <div className="absolute right-0 top-0 -mr-12 -mt-12 h-40 w-40 rounded-full bg-indigo-50 blur-3xl group-hover:bg-indigo-100 transition-colors" />
          <div className="relative z-10 flex items-center gap-6">
            <div className="relative h-24 w-32 overflow-hidden rounded-3xl bg-slate-50 border border-slate-100 flex items-center justify-center">
              <img src={vehicleImage} alt={selectedVehicle?.name} className="h-20 w-auto object-contain transform group-hover:scale-110 transition-transform duration-500" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600">Available Now</p>
              </div>
              <h3 className="text-xl font-black text-slate-900 tracking-tight leading-tight">{selectedVehicle?.name}</h3>
              <p className="mt-1 text-[11px] font-bold text-slate-500 uppercase tracking-widest">{selectedVehicle?.vehicleNumber}</p>
              
              <div className="mt-3 flex items-center gap-2">
                <div className="flex items-center gap-1 text-[9px] font-black text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full uppercase tracking-widest">
                  <ShieldCheck size={10} />
                  Top Rated
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        <div className="mb-10 flex flex-col items-center">
          <p className="mb-6 text-[11px] font-black uppercase tracking-[0.25em] text-slate-400">Select your preferred seat</p>
          
          <div className="grid w-full grid-cols-2 gap-x-8 gap-y-4 px-6 mb-12">
            {SEAT_LEGEND.map((item) => (
              <div key={item.key} className="flex items-center gap-3">
                <div className={`h-4 w-4 rounded-md border-[1.5px] transition-all ${item.color}`} />
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{item.label}</span>
              </div>
            ))}
          </div>

          <div className="relative w-full max-w-[340px] rounded-[70px] border-[6px] border-slate-100 bg-white p-10 shadow-[0_48px_96px_-24px_rgba(15,23,42,0.15)] overflow-hidden">
            {/* Steering & Dashboard Decoration */}
            <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-b from-slate-50/50 to-transparent pointer-events-none" />
            
            <div className="mb-16 flex items-center justify-between px-6 relative z-10">
              <div className="flex flex-col gap-1.5">
                <div className="h-1.5 w-12 rounded-full bg-slate-100" />
                <div className="h-1.5 w-8 rounded-full bg-slate-50" />
              </div>
              <div className="relative flex h-14 w-14 items-center justify-center rounded-full border-[5px] border-slate-100 bg-white shadow-sm ring-1 ring-slate-50">
                <div className="h-6 w-6 rounded-full border-[3px] border-slate-100" />
                <div className="absolute top-0 h-3.5 w-1 rounded-full bg-slate-200" />
              </div>
            </div>

            {!blueprint.layout?.length ? (
              <div className="py-20 text-center">
                <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-slate-50 text-slate-200">
                  <AlertCircle size={32} />
                </div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Layout unavailable</p>
              </div>
            ) : (
              <div
                className="grid gap-x-8 gap-y-10 relative z-10"
                style={{
                  gridTemplateColumns: `repeat(${blueprint.cols || 2}, minmax(0, 1fr))`,
                }}
              >
                {blueprint.layout.map((item, idx) => {
                  const seatId = `${item.r}-${item.c}`;
                  const isSelected = selectedSeats.includes(seatId);
                  const isBooked = item.status === 'booked' || bookedSeatIds.includes(seatId);

                  if (item.type === 'empty' || item.type === 'gap') {
                    return <div key={`gap-${idx}`} className="h-14 w-full" />;
                  }

                  return (
                    <motion.div
                      key={seatId}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: idx * 0.03, type: "spring", stiffness: 200 }}
                      className="relative flex justify-center"
                    >
                      <button
                        type="button"
                        disabled={isBooked || item.type === 'driver'}
                        onClick={() => item.type === 'seat' && toggleSeat(seatId)}
                        className={`group relative flex h-16 w-16 items-center justify-center rounded-[20px] transition-all duration-300 ${
                          item.type === 'driver'
                            ? 'border-2 border-slate-900 bg-slate-900 text-slate-500 shadow-xl shadow-slate-100 ring-4 ring-slate-50'
                            : isBooked
                              ? 'cursor-not-allowed border-2 border-slate-100 bg-slate-50 text-slate-200'
                              : isSelected
                                ? 'border-2 border-indigo-600 bg-indigo-600 text-white shadow-[0_12px_24px_-8px_rgba(79,70,229,0.5)] scale-110'
                                : 'border-2 border-slate-200 bg-white text-slate-400 hover:border-indigo-300 hover:shadow-lg active:scale-95'
                        }`}
                      >
                        {item.type === 'driver' ? (
                          <User size={24} className="opacity-40" />
                        ) : (
                          <Armchair size={26} className={`${isSelected ? 'scale-110' : ''} transition-transform`} />
                        )}

                        {/* Seat Number Tooltip/Badge */}
                        <span className={`absolute -bottom-6 text-[9px] font-black uppercase tracking-tighter transition-colors ${isSelected ? 'text-indigo-600' : 'text-slate-300'}`}>
                          {item.label || (item.type === 'driver' ? 'DRV' : `S${idx + 1}`)}
                        </span>

                        {isSelected && (
                          <motion.div 
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-emerald-500 shadow-lg"
                          >
                            <CheckCircle2 size={12} className="text-white" />
                          </motion.div>
                        )}

                        {isBooked && (
                          <div className="absolute inset-0 flex items-center justify-center opacity-10">
                            <Shield size={32} />
                          </div>
                        )}
                      </button>
                    </motion.div>
                  );
                })}
              </div>
            )}

            {/* Rear Decoration */}
            <div className="mt-20 flex flex-col items-center gap-3 opacity-20">
              <div className="h-1 w-32 rounded-full bg-slate-100" />
              <div className="h-1 w-16 rounded-full bg-slate-50" />
            </div>
          </div>
        </div>

        {/* Dynamic Warning/Info */}
        <AnimatePresence mode="wait">
          {bookedCount > 0 ? (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-8 rounded-3xl border border-amber-100 bg-amber-50/50 p-5"
            >
              <div className="flex items-start gap-4">
                <div className="mt-1 rounded-xl bg-amber-100 p-2 text-amber-600">
                  <Clock size={18} />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-700">Real-time availability</p>
                  <p className="mt-1.5 text-xs font-semibold leading-relaxed text-amber-800">
                    {bookedCount} {bookedCount === 1 ? 'seat is' : 'seats are'} already booked. Grab yours before they're gone!
                  </p>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-8 rounded-3xl border border-indigo-100 bg-indigo-50/50 p-5"
            >
              <div className="flex items-start gap-4">
                <div className="mt-1 rounded-xl bg-indigo-100 p-2 text-indigo-600">
                  <ShieldCheck size={18} />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-700">Secure Reservation</p>
                  <p className="mt-1.5 text-xs font-semibold leading-relaxed text-indigo-800">
                    Select up to {maxSeats} {maxSeats === 1 ? 'seat' : 'seats'} for your group. Seats are locked instantly upon selection.
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Floating Action Bar */}
      <div className="fixed bottom-0 left-1/2 z-50 w-full max-w-lg -translate-x-1/2">
        <div className="mx-5 mb-8">
          <AnimatePresence>
            {selectedSeats.length > 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 30, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 30, scale: 0.9 }}
                className="overflow-hidden rounded-[32px] bg-slate-900 p-2 shadow-[0_32px_64px_-16px_rgba(15,23,42,0.5)] border border-white/10"
              >
                <div className="flex items-center justify-between pl-6 pr-2 py-2">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.25em] text-slate-400">Total Fare</p>
                    <div className="flex items-baseline gap-2 mt-0.5">
                      <span className="text-2xl font-black text-white">₹{fareBreakdown.totalFare}</span>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                        ({selectedSeats.length} {selectedSeats.length === 1 ? 'Seat' : 'Seats'})
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleContinue}
                    className="group flex h-16 items-center gap-3 rounded-[24px] bg-white px-6 text-sm font-black text-slate-900 transition-all hover:bg-indigo-50 active:scale-95"
                  >
                    CONTINUE
                    <div className="rounded-full bg-slate-900 p-1 text-white group-hover:translate-x-1 transition-transform">
                      <ChevronRight size={20} />
                    </div>
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-4 rounded-[28px] border-2 border-dashed border-slate-200 bg-white/80 p-5 backdrop-blur-md"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-400">
                  <Armchair size={20} />
                </div>
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 leading-relaxed">
                  Select a seat to see <br /> fare breakdown
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default PoolingSeats;
