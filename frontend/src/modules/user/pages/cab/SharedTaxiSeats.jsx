import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, MapPin, Clock, Users, ChevronRight, Star, Armchair } from 'lucide-react';
import { userService } from '../../services/userService';

const INIT_SEATS = [
  { id: '1', label: 'A1', status: 'available' },
  { id: '2', label: 'A2', status: 'available' },
  { id: '3', label: 'B1', status: 'available' },
  { id: '4', label: 'B2', status: 'available' },
  { id: '5', label: 'C1', status: 'available' },
  { id: '6', label: 'C2', status: 'available' },
  { id: '7', label: 'D1', status: 'available' },
  { id: '8', label: 'D2', status: 'available' },
];

const SharedTaxiSeats = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { route, date } = location.state || {};

  const [seats, setSeats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [serviceTaxPercentage, setServiceTaxPercentage] = useState(0);

  useEffect(() => {
    if (!route) return;

    const loadSeats = async () => {
      try {
        const response = await userService.getPoolingRouteDetails(route.routeId, { date });
        const routeData = response?.data?.data || response?.data || {};
        console.log('loadSeats routeData:', routeData);
        const nextVehicle = routeData.assignedVehicleTypeIds?.[0] || routeData.assignedVehicles?.[0] || null;
        console.log('loadSeats nextVehicle:', nextVehicle);
        const taxVal = Number(nextVehicle?.serviceTaxPercentage || 0);
        console.log('loadSeats serviceTaxPercentage:', taxVal);
        setServiceTaxPercentage(taxVal);
        const seatAvailability = routeData.seatAvailability || {};
        const availabilityKey = nextVehicle?._id && route.scheduleId
          ? `${String(nextVehicle._id)}:${String(route.scheduleId)}`
          : '';
        const bookedIds = availabilityKey && Array.isArray(seatAvailability[availabilityKey])
          ? seatAvailability[availabilityKey]
          : [];
          
        const layout = nextVehicle?.blueprint?.layout || [];
        if (layout.length > 0) {
          const mappedSeats = layout.map((item, idx) => {
            const seatId = `${item.r}-${item.c}`;
            return {
              id: seatId,
              label: item.label || `S${idx + 1}`,
              status: item.type === 'driver' || item.type === 'empty' || item.type === 'gap' ? 'gap'
                : bookedIds.includes(seatId) ? 'booked' : 'available',
              type: item.type
            };
          });
          setSeats(mappedSeats);
        } else {
          const mappedMock = INIT_SEATS.map((s) => {
            const seatId = String(s.id);
            return {
              ...s,
              status: bookedIds.includes(seatId) ? 'booked' : 'available'
            };
          });
          setSeats(mappedMock);
        }
      } catch (error) {
        console.error('Failed to load seats details:', error);
        setSeats(INIT_SEATS.map(s => ({ ...s })));
      } finally {
        setLoading(false);
      }
    };
    loadSeats();
  }, [route?.routeId, route?.scheduleId, date]);

  const toggle = (id) => setSeats(prev =>
    prev.map(s => s.id === id && s.status !== 'booked' && s.status !== 'gap'
      ? { ...s, status: s.status === 'selected' ? 'available' : 'selected' }
      : s
    )
  );

  const selected = useMemo(() => seats.filter(s => s.status === 'selected'), [seats]);
  const total = useMemo(() => selected.length * (route?.price || 0), [selected, route?.price]);

  const rows = useMemo(() => {
    const grouped = {};
    seats.forEach(seat => {
      if (seat.type === 'driver') return;
      const r = seat.id.includes && seat.id.includes('-') ? Number(seat.id.split('-')[0]) : 0;
      if (!grouped[r]) grouped[r] = [];
      grouped[r].push(seat);
    });
    const sortedRows = Object.keys(grouped)
      .sort((a, b) => Number(a) - Number(b))
      .map(rKey => {
        return grouped[rKey].sort((a, b) => {
          const cA = Number(a.id.split('-')[1]);
          const cB = Number(b.id.split('-')[1]);
          return cA - cB;
        });
      });
    return sortedRows.length > 0 ? sortedRows : [[seats[0],seats[1]],[seats[2],seats[3]],[seats[4],seats[5]],[seats[6],seats[7]]];
  }, [seats]);

  const basePath = location.pathname.includes('/taxi/user') ? '/taxi/user' : '';

  useEffect(() => {
    if (!route) {
      navigate(`${basePath}/cab/shared`);
    }
  }, [route, navigate, basePath]);

  if (!route) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#F0FDF4_0%,#F3F4F6_38%,#F8FAFC_100%)] max-w-lg mx-auto font-sans pb-28 relative overflow-hidden">
      <div className="absolute -top-16 right-[-40px] h-44 w-44 rounded-full bg-emerald-100/50 blur-3xl pointer-events-none" />

      {/* Header */}
      <motion.header initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white/90 backdrop-blur-md px-5 pt-10 pb-4 sticky top-0 z-20 border-b border-white/80 shadow-[0_4px_20px_rgba(16,185,129,0.05)]">
        <div className="flex items-center gap-3">
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-[12px] border border-white/80 bg-white/90 flex items-center justify-center shadow-[0_4px_12px_rgba(15,23,42,0.07)] shrink-0">
            <ArrowLeft size={18} className="text-slate-900" strokeWidth={2.5} />
          </motion.button>
          <div className="flex-1 min-w-0">
            <p className="text-[9px] font-extrabold uppercase tracking-[0.26em] text-emerald-600">Select Seats · {date}</p>
            <h1 className="text-[18px] font-extrabold tracking-tight text-slate-900 leading-tight truncate">{route.from} → {route.to}</h1>
          </div>
        </div>
      </motion.header>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-32 gap-3">
          <span className="w-8 h-8 border-2 border-[#20A354] border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-400 font-extrabold uppercase tracking-widest">Loading seat layout...</p>
        </div>
      ) : (
        <div className="px-5 pt-4 space-y-4">
          {/* Route summary card */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
            className="rounded-[18px] border border-white/80 bg-white/90 shadow-[0_4px_14px_rgba(15,23,42,0.05)] px-4 py-3 flex items-center justify-between gap-3">
            <div className="space-y-1 flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                <span className="text-[11px] font-extrabold text-slate-700 truncate">{route.from}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />
                <span className="text-[11px] font-extrabold text-slate-700 truncate">{route.to}</span>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0 text-[10px] font-bold text-slate-400">
              <div className="flex items-center gap-1"><Clock size={10} strokeWidth={2} />{route.departure}</div>
              <div className="flex items-center gap-1"><Users size={10} strokeWidth={2} />{route.duration}</div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[9px] font-extrabold text-emerald-600 uppercase tracking-[0.18em]">Per seat</p>
              <p className="text-[18px] font-extrabold text-[#20A354] leading-tight">₹{route.price}</p>
            </div>
          </motion.div>

          {/* Driver info */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="rounded-[18px] border border-white/80 bg-white/90 shadow-[0_4px_14px_rgba(15,23,42,0.05)] px-4 py-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-[12px] bg-emerald-50 text-[#20A354] flex items-center justify-center shrink-0 font-extrabold text-[15px] border border-emerald-100 uppercase">
              {route.driver ? route.driver.charAt(0) : 'D'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-extrabold text-slate-900 leading-tight">{route.driver}</p>
              <p className="text-[10px] font-semibold text-slate-400">{route.vehicle}</p>
            </div>
            <div className="flex items-center gap-1 bg-yellow-50 border border-yellow-100 rounded-full px-2 py-0.5 shrink-0">
              <Star size={9} className="text-yellow-500 fill-yellow-500" />
              <span className="text-[10px] font-extrabold text-slate-850">{route.rating}</span>
            </div>
          </motion.div>

          {/* Seat map */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className="rounded-[20px] border border-white/80 bg-white/90 shadow-[0_4px_14px_rgba(15,23,42,0.05)] px-5 py-4 space-y-4">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-emerald-600">Choose Your Seat</p>

            {/* Steering row */}
            <div className="flex items-center justify-between pb-3 border-b border-dashed border-slate-100">
              <span className="text-[9px] font-extrabold text-slate-300 uppercase tracking-widest">Front Cabin</span>
              <div className="w-8 h-8 rounded-full border-2 border-slate-200 flex items-center justify-center text-[10px] font-extrabold text-slate-400 bg-slate-50 uppercase tracking-tighter">Wheel</div>
            </div>

            {/* Seats */}
            <div className="space-y-2.5">
              {rows.map((row, ri) => (
                <div key={ri} className="flex items-center justify-center gap-2">
                  {row.slice(0, 2).map(seat => seat ? (
                    <motion.button key={seat.id} whileTap={seat.status !== 'booked' && seat.status !== 'gap' ? { scale: 0.9 } : {}}
                      onClick={() => seat.status !== 'gap' && toggle(seat.id)}
                      className={`w-14 h-14 rounded-[14px] border-2 flex flex-col items-center justify-center gap-0.5 transition-all ${
                        seat.status === 'gap'       ? 'invisible pointer-events-none' :
                        seat.status === 'booked'    ? 'bg-slate-100 border-slate-100 cursor-not-allowed opacity-60 text-slate-350' :
                        seat.status === 'selected'  ? 'bg-[#20A354] border-[#20A354] shadow-[0_4px_12px_rgba(32,163,84,0.2)] text-white animate-pulse' :
                                                      'bg-white border-slate-200 hover:border-emerald-300 text-slate-400'
                      }`}>
                      {seat.status !== 'gap' && (
                        <>
                          <Armchair size={18} className={`${seat.status === 'selected' ? 'text-white scale-110' : 'text-slate-400'} transition-transform`} />
                          <span className={`text-[9px] font-extrabold leading-none ${seat.status === 'selected' ? 'text-white' : 'text-slate-400'}`}>
                            {seat.label}
                          </span>
                        </>
                      )}
                    </motion.button>
                  ) : <div key="empty-left" className="w-14 h-14 invisible" />)}
                  <div className="w-5" />
                  {row.slice(2, 4).map(seat => seat ? (
                    <motion.button key={seat.id} whileTap={seat.status !== 'booked' && seat.status !== 'gap' ? { scale: 0.9 } : {}}
                      onClick={() => seat.status !== 'gap' && toggle(seat.id)}
                      className={`w-14 h-14 rounded-[14px] border-2 flex flex-col items-center justify-center gap-0.5 transition-all ${
                        seat.status === 'gap'       ? 'invisible pointer-events-none' :
                        seat.status === 'booked'    ? 'bg-slate-100 border-slate-100 cursor-not-allowed opacity-60 text-slate-350' :
                        seat.status === 'selected'  ? 'bg-[#20A354] border-[#20A354] shadow-[0_4px_12px_rgba(32,163,84,0.2)] text-white animate-pulse' :
                                                      'bg-white border-slate-200 hover:border-emerald-300 text-slate-400'
                      }`}>
                      {seat.status !== 'gap' && (
                        <>
                          <Armchair size={18} className={`${seat.status === 'selected' ? 'text-white scale-110' : 'text-slate-400'} transition-transform`} />
                          <span className={`text-[9px] font-extrabold leading-none ${seat.status === 'selected' ? 'text-white' : 'text-slate-400'}`}>
                            {seat.label}
                          </span>
                        </>
                      )}
                    </motion.button>
                  ) : <div key="empty" className="w-14 h-14 invisible" />)}
                </div>
              ))}
            </div>

            {/* Legend */}
            <div className="flex justify-center gap-4 pt-2 border-t border-slate-50">
              {[['bg-white border-slate-200','Available'],['bg-[#20A354] border-[#20A354]','Selected'],['bg-slate-100 border-slate-100','Booked']].map(([cls,lbl]) => (
                <div key={lbl} className="flex items-center gap-1.5">
                  <div className={`w-3 h-3 rounded border-2 ${cls}`} />
                  <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">{lbl}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      )}

      {/* Sticky CTA */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg px-5 pb-6 pt-3 bg-gradient-to-t from-[#EEF2F7] via-[#F3F4F6]/95 to-transparent pointer-events-none z-30">
        <AnimatePresence>
          {selected.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
              className="pointer-events-auto mb-2 flex items-center justify-between rounded-[16px] border border-white/80 bg-white/90 shadow-[0_4px_14px_rgba(16,185,129,0.08)] px-4 py-3">
              <div>
                <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                  {selected.length} seat{selected.length > 1 ? 's' : ''} · {selected.map(s=>s.label).join(', ')}
                </p>
                <p className="text-[18px] font-extrabold text-[#20A354] leading-tight">₹{total}</p>
              </div>
              <span className="text-[10px] font-extrabold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-full">
                {selected.length}x ₹{route?.price}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
        <motion.button whileTap={{ scale: 0.98 }} disabled={selected.length === 0}
          onClick={() => navigate(`${basePath}/cab/shared/confirm`, { state: { route, date, seats: selected, total, serviceTaxPercentage } })}
          className={`pointer-events-auto w-full py-4 rounded-[18px] text-[15px] font-extrabold text-white shadow-[0_8px_24px_rgba(32,163,84,0.25)] flex items-center justify-center gap-2 transition-all ${
            selected.length > 0 ? 'bg-[#20A354] hover:bg-[#1a8543]' : 'bg-slate-350 cursor-not-allowed'
          }`}>
          Continue to Booking <ChevronRight size={17} strokeWidth={3} className="opacity-50" />
        </motion.button>
      </div>
    </div>
  );
};

export default SharedTaxiSeats;
