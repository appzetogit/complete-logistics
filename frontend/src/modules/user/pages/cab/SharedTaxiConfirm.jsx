import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, MapPin, Clock, Users, CheckCircle2, CreditCard, Banknote, Smartphone, ChevronRight } from 'lucide-react';

const PAYMENT_METHODS = [
  { id: 'upi',  label: 'UPI',  sub: 'PhonePe, GPay, Paytm', icon: Smartphone },
  { id: 'card', label: 'Card', sub: 'Debit / Credit card',   icon: CreditCard },
  { id: 'cash', label: 'Cash', sub: 'Pay to driver',         icon: Banknote   },
];

const SharedTaxiConfirm = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { route, date, seats, total, serviceTaxPercentage = 0 } = location.state || {};
  const basePath = location.pathname.includes('/taxi/user') ? '/taxi/user' : '';

  React.useEffect(() => {
    if (!route) {
      navigate(`${basePath}/cab/shared`);
    }
  }, [route, navigate, basePath]);

  if (!route) return null;

  const serviceTaxAmount = Math.round((total * serviceTaxPercentage) / 100);
  const grandTotal = total + serviceTaxAmount;
  console.log('SharedTaxiConfirm state:', { route, date, seats, total, serviceTaxPercentage, serviceTaxAmount, grandTotal });

  const [method, setMethod] = useState('upi');
  const [paying, setPaying] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [errors, setErrors] = useState({});

  const [passengers, setPassengers] = useState(() => 
    (seats || []).map(seat => ({
      seatId: seat.id,
      seatLabel: seat.label,
      name: '',
      age: '',
      gender: 'male',
      phone: ''
    }))
  );

  const updatePassenger = (index, field, value) => {
    setPassengers(prev => prev.map((p, idx) => 
      idx === index ? { ...p, [field]: value } : p
    ));
    setErrors(prev => {
      const next = { ...prev };
      delete next[`p-${index}-${field}`];
      return next;
    });
  };

  const bookingId = `SHR-${Math.random().toString(36).slice(2,8).toUpperCase()}`;

  const handlePay = () => {
    const newErrors = {};
    passengers.forEach((p, idx) => {
      if (!p.name.trim()) newErrors[`p-${idx}-name`] = true;
      if (!p.age || Number(p.age) <= 0) newErrors[`p-${idx}-age`] = true;
    });

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      alert('Please fill in valid details for all passengers.');
      return;
    }

    setPaying(true);
    setTimeout(() => { setPaying(false); setConfirmed(true); }, 1800);
  };

  if (confirmed) {
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,#F0FDF4_0%,#F3F4F6_38%,#F8FAFC_100%)] max-w-lg mx-auto font-sans flex flex-col items-center justify-center px-5 gap-5">
        <div className="absolute -top-16 right-[-40px] h-44 w-44 rounded-full bg-emerald-100/50 blur-3xl pointer-events-none" />
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300 }}
          className="w-16 h-16 bg-[#20A354] rounded-full flex items-center justify-center shadow-[0_8px_24px_rgba(32,163,84,0.25)]">
          <CheckCircle2 size={30} className="text-white" strokeWidth={2.5} />
        </motion.div>
        <div className="text-center">
          <p className="text-[9px] font-extrabold uppercase tracking-[0.26em] text-emerald-600">Booking Confirmed</p>
          <h1 className="text-[22px] font-extrabold text-slate-900 tracking-tight mt-0.5">You're booked!</h1>
          <p className="text-[12px] font-semibold text-slate-400 mt-1">ID: <span className="text-slate-700 font-extrabold">{bookingId}</span></p>
        </div>
        <div className="w-full rounded-[20px] border border-white/80 bg-white/90 shadow-[0_4px_14px_rgba(15,23,42,0.06)] px-5 py-4 space-y-2.5">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            <span className="text-[12px] font-extrabold text-slate-800 truncate">{route.from}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-orange-500 shrink-0" />
            <span className="text-[12px] font-extrabold text-slate-800 truncate">{route.to}</span>
          </div>
          <div className="border-t border-slate-50 pt-2.5 flex flex-col gap-1">
            <div className="flex justify-between items-center mb-1">
              <div>
                <p className="text-[10px] font-semibold text-slate-400">{date} · {route.departure}</p>
                <p className="text-[10px] font-semibold text-slate-400">Seats: {seats?.map(s=>s.label).join(', ')}</p>
              </div>
              <p className="text-[20px] font-extrabold text-[#20A354]">₹{grandTotal}</p>
            </div>
            
            <div className="mt-1 border-t border-dashed border-slate-100 pt-2 space-y-1">
              <p className="text-[9px] font-extrabold text-emerald-600 uppercase tracking-widest">Passenger List</p>
              {passengers.map((p, idx) => (
                <p key={p.seatId} className="text-[11px] font-semibold text-slate-500 leading-tight">
                  Seat {p.seatLabel}: <span className="text-slate-700 font-bold">{p.name}</span> ({p.age}, {p.gender.toUpperCase()})
                </p>
              ))}
            </div>
          </div>
        </div>
         <motion.button onClick={() => navigate(basePath ? basePath : '/cab')}
          className="pointer-events-auto w-full bg-slate-900 hover:bg-slate-855 py-4 rounded-[18px] text-[15px] font-extrabold text-white shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95">
          Go to Home Dashboard
        </motion.button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#F0FDF4_0%,#F3F4F6_38%,#F8FAFC_100%)] max-w-lg mx-auto font-sans pb-28 relative overflow-hidden">
      <div className="absolute -top-16 right-[-40px] h-44 w-44 rounded-full bg-emerald-100/50 blur-3xl pointer-events-none" />

      <motion.header initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white/90 backdrop-blur-md px-5 pt-10 pb-4 sticky top-0 z-20 border-b border-white/80 shadow-[0_4px_20px_rgba(16,185,129,0.05)]">
        <div className="flex items-center gap-3">
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-[12px] border border-white/80 bg-white/90 flex items-center justify-center shadow-[0_4px_12px_rgba(15,23,42,0.07)] shrink-0">
            <ArrowLeft size={18} className="text-slate-900" strokeWidth={2.5} />
          </motion.button>
          <div className="flex-1 min-w-0">
            <p className="text-[9px] font-extrabold uppercase tracking-[0.26em] text-emerald-600">Confirm Booking</p>
            <h1 className="text-[18px] font-extrabold tracking-tight text-slate-900 leading-tight">Review & Pay</h1>
          </div>
        </div>
      </motion.header>

      <div className="px-5 pt-4 space-y-3">

        {/* Trip summary */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="rounded-[20px] border border-white/80 bg-white/90 shadow-[0_4px_14px_rgba(15,23,42,0.05)] px-4 py-4 space-y-3">
          <p className="text-[9px] font-extrabold uppercase tracking-[0.22em] text-emerald-600">Trip Details</p>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <span className="text-[13px] font-extrabold text-slate-900 truncate">{route.from}</span>
            </div>
            <div className="ml-0.5 w-px h-3 border-l border-dashed border-slate-200" />
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-orange-500 shrink-0" />
              <span className="text-[13px] font-extrabold text-slate-900 truncate">{route.to}</span>
            </div>
          </div>
          <div className="flex items-center gap-3 text-[10px] font-bold text-slate-400 border-t border-slate-50 pt-2.5">
            <div className="flex items-center gap-1"><Clock size={10} strokeWidth={2} />{date} · {route.departure}</div>
            <div className="w-1 h-1 bg-slate-200 rounded-full" />
            <div className="flex items-center gap-1"><Users size={10} strokeWidth={2} />{seats?.length} seat{seats?.length > 1 ? 's' : ''}: {seats?.map(s=>s.label).join(', ')}</div>
          </div>
        </motion.div>

        {/* Passenger details form */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
          className="rounded-[20px] border border-white/80 bg-white/90 shadow-[0_4px_14px_rgba(15,23,42,0.05)] px-4 py-4 space-y-4">
          <p className="text-[9px] font-extrabold uppercase tracking-[0.22em] text-emerald-600">Passenger Details</p>
          
          <div className="space-y-4 divide-y divide-slate-100">
            {passengers.map((passenger, index) => (
              <div key={passenger.seatId} className={`pt-4 ${index === 0 ? 'pt-0' : ''} space-y-3`}>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-md">
                    Passenger {index + 1} (Seat {passenger.seatLabel})
                  </span>
                </div>
                
                <div className="grid grid-cols-1 gap-2.5">
                  <div>
                    <label className="text-[9px] font-extrabold text-slate-405 uppercase tracking-wider block mb-1">Full Name</label>
                    <input 
                      type="text" 
                      required
                      placeholder="e.g. John Doe"
                      value={passenger.name}
                      onChange={(e) => updatePassenger(index, 'name', e.target.value)}
                      className={`w-full rounded-xl border ${errors[`p-${index}-name`] ? 'border-red-300 bg-red-50/50' : 'border-slate-200'} bg-white px-3.5 py-2 text-xs text-slate-800 outline-none transition-all focus:border-[#20A354]`}
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[9px] font-extrabold text-slate-405 uppercase tracking-wider block mb-1">Age</label>
                      <input 
                        type="number" 
                        required
                        placeholder="Age"
                        value={passenger.age}
                        onChange={(e) => updatePassenger(index, 'age', e.target.value)}
                        className={`w-full rounded-xl border ${errors[`p-${index}-age`] ? 'border-red-300 bg-red-50/50' : 'border-slate-200'} bg-white px-3.5 py-2 text-xs text-slate-800 outline-none transition-all focus:border-[#20A354]`}
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-extrabold text-slate-405 uppercase tracking-wider block mb-1">Gender</label>
                      <select 
                        value={passenger.gender}
                        onChange={(e) => updatePassenger(index, 'gender', e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-800 outline-none transition-all focus:border-[#20A354]"
                      >
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Fare breakdown */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="rounded-[20px] border border-white/80 bg-white/90 shadow-[0_4px_14px_rgba(15,23,42,0.05)] px-4 py-4 space-y-2">
          <p className="text-[9px] font-extrabold uppercase tracking-[0.22em] text-emerald-600">Fare Breakdown</p>
          <div className="flex justify-between text-[12px] font-semibold text-slate-500">
            <span>₹{route.price} × {seats?.length} seat{seats?.length > 1 ? 's' : ''}</span>
            <span className="font-extrabold text-slate-955">₹{total}</span>
          </div>
          {serviceTaxPercentage > 0 && (
            <div className="flex justify-between text-[12px] font-semibold text-slate-500">
              <span>Service Tax ({serviceTaxPercentage}%)</span>
              <span className="font-extrabold text-slate-955">₹{serviceTaxAmount}</span>
            </div>
          )}
          <div className="flex justify-between text-[12px] font-semibold text-slate-500">
            <span>Platform fee</span><span>₹0</span>
          </div>
          <div className="border-t border-slate-50 pt-2 flex justify-between">
            <span className="text-[14px] font-extrabold text-slate-900">Total</span>
            <span className="text-[18px] font-extrabold text-[#20A354]">₹{grandTotal}</span>
          </div>
        </motion.div>

        {/* Payment method */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="rounded-[20px] border border-white/80 bg-white/90 shadow-[0_4px_14px_rgba(15,23,42,0.05)] px-4 py-4 space-y-2.5">
          <p className="text-[9px] font-extrabold uppercase tracking-[0.22em] text-emerald-600">Payment Method</p>
          <div className="grid grid-cols-3 gap-2">
            {PAYMENT_METHODS.map(({ id, label, sub, icon: Icon }) => (
              <motion.button key={id} whileTap={{ scale: 0.96 }} onClick={() => setMethod(id)}
                className={`flex flex-col items-center gap-1.5 py-3 rounded-[14px] border transition-all ${
                  method === id ? 'border-emerald-200 bg-emerald-50 shadow-[0_3px_10px_rgba(16,185,129,0.12)]' : 'border-slate-100 bg-slate-50'
                }`}>
                <Icon size={16} className={method === id ? 'text-[#20A354]' : 'text-slate-400'} strokeWidth={2} />
                <span className={`text-[10px] font-extrabold ${method === id ? 'text-slate-900' : 'text-slate-400'}`}>{label}</span>
              </motion.button>
            ))}
          </div>
        </motion.div>
      </div>

      {/* CTA */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg px-5 pb-6 pt-3 bg-gradient-to-t from-[#EEF2F7] via-[#F3F4F6]/95 to-transparent pointer-events-none z-30">
        <motion.button whileTap={{ scale: 0.98 }} onClick={handlePay} disabled={paying}
          className="pointer-events-auto w-full bg-[#20A354] hover:bg-[#1a8543] py-4 rounded-[18px] text-[15px] font-extrabold text-white shadow-[0_8px_24px_rgba(32,163,84,0.25)] flex items-center justify-center gap-2 transition-all">
          {paying
            ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            : <><CheckCircle2 size={16} strokeWidth={2.5} /> Confirm & Pay ₹{grandTotal}</>}
        </motion.button>
      </div>
    </div>
  );
};

export default SharedTaxiConfirm;
