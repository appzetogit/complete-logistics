import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Users, MapPin, Clock, ChevronRight, Zap, Shield } from 'lucide-react';

// --- Seat Map Component ---
const SeatMap = ({ seats, onToggle }) => {
  // Bus-style: 2-2 layout, front row is 2 seats
  const rows = [
    [seats[0], seats[1]],
    [seats[2], seats[3]],
    [seats[4], seats[5]],
    [seats[6], seats[7]],
  ];

  const getSeatColor = (seat) => {
    if (!seat) return 'invisible';
    if (seat.status === 'booked') return 'bg-red-400 border-red-500 cursor-not-allowed opacity-60';
    if (seat.status === 'selected') return 'bg-primary border-primary text-white shadow-lg shadow-orange-200';
    return 'bg-white border-gray-200 text-gray-500 hover:border-primary hover:bg-orange-50 cursor-pointer';
  };

  return (
    <div className="bg-gray-50 rounded-3xl p-6 border border-gray-100">
      {/* Driver row */}
      <div className="flex justify-between items-center mb-5 pb-4 border-b border-dashed border-gray-200">
        <div className="text-[11px] font-black text-gray-300 uppercase tracking-widest">Front</div>
        <div className="w-12 h-12 bg-gray-200 rounded-xl flex items-center justify-center text-xl">🧑‍✈️</div>
      </div>

      {/* Seat grid */}
      <div className="space-y-3">
        {rows.map((row, rowIdx) => (
          <div key={rowIdx} className="flex gap-3 justify-center">
            {row.map((seat, seatIdx) => seat ? (
              <motion.button
                key={seat.id}
                whileTap={seat.status !== 'booked' ? { scale: 0.9 } : {}}
                onClick={() => seat.status !== 'booked' && onToggle(seat.id)}
                className={`w-14 h-14 rounded-2xl border-2 text-[11px] font-black transition-all flex flex-col items-center justify-center gap-0.5 ${getSeatColor(seat)}`}
              >
                <span className="text-lg leading-none">{seat.status === 'booked' ? '🔴' : seat.status === 'selected' ? '✓' : '💺'}</span>
                <span className="leading-none opacity-70">{seat.label}</span>
              </motion.button>
            ) : (
              <div key={seatIdx} className="w-14 h-14 invisible" />
            ))}
            {/* Aisle spacer */}
            {rowIdx < rows.length && <div className="w-6" />}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex justify-center gap-5 mt-5 pt-4 border-t border-gray-100">
        <div className="flex items-center gap-1.5 text-[10px] font-black text-gray-400 uppercase tracking-widest">
          <div className="w-3 h-3 rounded bg-white border border-gray-300" /> Available
        </div>
        <div className="flex items-center gap-1.5 text-[10px] font-black text-gray-400 uppercase tracking-widest">
          <div className="w-3 h-3 rounded bg-primary border border-primary" /> Selected
        </div>
        <div className="flex items-center gap-1.5 text-[10px] font-black text-gray-400 uppercase tracking-widest">
          <div className="w-3 h-3 rounded bg-red-400 border border-red-500" /> Booked
        </div>
      </div>
    </div>
  );
};

// --- Available Trips Data ---
const TRIPS = [
  {
    id: 'T001',
    from: 'Indore (Vijay Nagar)',
    to: 'Bhopal (MP Nagar)',
    departure: '07:30 AM',
    duration: '3h 15m',
    pricePerSeat: 249,
    vehicle: 'Toyota Innova · MP09 AB 4521',
    driver: { name: 'Rahul Patel', rating: '4.9' },
    seats: [
      { id: 1, label: 'A1', status: 'booked' },
      { id: 2, label: 'A2', status: 'available' },
      { id: 3, label: 'B1', status: 'available' },
      { id: 4, label: 'B2', status: 'booked' },
      { id: 5, label: 'C1', status: 'available' },
      { id: 6, label: 'C2', status: 'available' },
      { id: 7, label: 'D1', status: 'available' },
      { id: 8, label: 'D2', status: 'booked' },
    ],
  },
  {
    id: 'T002',
    from: 'Indore (Rajwada)',
    to: 'Ujjain (Mahakal)',
    departure: '09:00 AM',
    duration: '1h 10m',
    pricePerSeat: 119,
    vehicle: 'Maruti Ertiga · MP09 CD 7890',
    driver: { name: 'Kishan Sharma', rating: '4.7' },
    seats: [
      { id: 1, label: 'A1', status: 'available' },
      { id: 2, label: 'A2', status: 'available' },
      { id: 3, label: 'B1', status: 'booked' },
      { id: 4, label: 'B2', status: 'available' },
      { id: 5, label: 'C1', status: 'available' },
      { id: 6, label: 'C2', status: 'booked' },
      { id: 7, label: 'D1', status: 'booked' },
      { id: 8, label: 'D2', status: 'available' },
    ],
  },
];

// --- Main Component ---
const CabSharing = () => {
  const navigate = useNavigate();
  const [expandedTrip, setExpandedTrip] = useState(null);
  const [tripSeats, setTripSeats] = useState(
    TRIPS.reduce((acc, t) => ({ ...acc, [t.id]: t.seats }), {})
  );
  const [bookingConfirm, setBookingConfirm] = useState(null);

  const toggleSeat = (tripId, seatId) => {
    setTripSeats(prev => ({
      ...prev,
      [tripId]: prev[tripId].map(s =>
        s.id === seatId
          ? { ...s, status: s.status === 'selected' ? 'available' : 'selected' }
          : s
      ),
    }));
  };

  const getSelectedSeats = (tripId) =>
    tripSeats[tripId]?.filter(s => s.status === 'selected') || [];

  const handleBook = (trip) => {
    const selected = getSelectedSeats(trip.id);
    if (selected.length === 0) return;
    setBookingConfirm({
      trip,
      seats: selected,
      total: selected.length * trip.pricePerSeat,
    });
  };

  return (
    <div className="min-h-screen bg-[#F8F9FB] max-w-lg mx-auto font-sans pb-10">
      {/* Header */}
      <div className="bg-white px-5 pt-10 pb-5 sticky top-0 z-20 shadow-sm border-b border-gray-50">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 active:scale-90 transition-all">
            <ArrowLeft size={24} className="text-gray-900" strokeWidth={2.5} />
          </button>
          <div>
            <h1 className="text-[22px] font-black text-gray-900 leading-none tracking-tight">Cab Sharing</h1>
            <p className="text-[12px] font-bold text-gray-400 mt-0.5 uppercase tracking-widest">
              Pick your seat · Share the fare
            </p>
          </div>
        </div>

        {/* USP Strip */}
        <div className="mt-4 flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {['50% cheaper than solo rides', 'Choose your exact seat', 'Real-time tracking'].map(tag => (
            <span key={tag} className="shrink-0 bg-green-50 border border-green-100 text-green-700 text-[10px] font-black px-3 py-1.5 rounded-full uppercase tracking-widest flex items-center gap-1.5">
              <Zap size={10} strokeWidth={3} />
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Trip List */}
      <div className="px-5 pt-5 space-y-4">
        <h2 className="text-[16px] font-black text-gray-700 uppercase tracking-widest">Available Today</h2>

        {TRIPS.map((trip, idx) => {
          const seats = tripSeats[trip.id];
          const availableCount = seats.filter(s => s.status === 'available').length;
          const selectedSeats = getSelectedSeats(trip.id);
          const isExpanded = expandedTrip === trip.id;

          return (
            <motion.div
              key={trip.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.08 }}
              className="bg-white rounded-[28px] overflow-hidden border border-gray-50 shadow-sm"
            >
              {/* Trip Summary */}
              <div
                className="p-5 cursor-pointer"
                onClick={() => setExpandedTrip(isExpanded ? null : trip.id)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-[13px] font-black text-gray-900">
                      <MapPin size={13} className="text-green-500 shrink-0" strokeWidth={2.5} />
                      <span className="line-clamp-1">{trip.from}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[13px] font-black text-gray-900">
                      <MapPin size={13} className="text-orange-500 shrink-0" strokeWidth={2.5} />
                      <span className="line-clamp-1">{trip.to}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <p className="text-[22px] font-black text-gray-900 tracking-tight">₹{trip.pricePerSeat}</p>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">per seat</p>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 text-[11px] font-black text-gray-400">
                      <Clock size={11} strokeWidth={3} /> {trip.departure}
                    </div>
                    <div className="w-1 h-1 bg-gray-200 rounded-full" />
                    <div className="text-[11px] font-black text-gray-400">{trip.duration}</div>
                    <div className="w-1 h-1 bg-gray-200 rounded-full" />
                    <div className={`text-[11px] font-black ${availableCount <= 2 ? 'text-red-500' : 'text-green-600'}`}>
                      {availableCount} seats left
                    </div>
                  </div>
                  <motion.div
                    animate={{ rotate: isExpanded ? 90 : 0 }}
                    className="text-gray-300"
                  >
                    <ChevronRight size={18} strokeWidth={3} />
                  </motion.div>
                </div>

                <p className="text-[11px] font-bold text-gray-300 mt-2 truncate">{trip.vehicle}</p>
              </div>

              {/* Expanded — Seat Map */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="px-5 pb-5 space-y-4 border-t border-gray-50 pt-4">
                      <SeatMap
                        seats={seats}
                        onToggle={(seatId) => toggleSeat(trip.id, seatId)}
                      />

                      {selectedSeats.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="bg-orange-50 border border-orange-100 rounded-2xl p-4 flex items-center justify-between"
                        >
                          <div>
                            <p className="text-[12px] font-black text-gray-500">
                              {selectedSeats.length} seat{selectedSeats.length > 1 ? 's' : ''} selected
                              <span className="text-gray-300 mx-1">·</span>
                              Seats: {selectedSeats.map(s => s.label).join(', ')}
                            </p>
                            <p className="text-[20px] font-black text-gray-900 mt-0.5">
                              ₹{selectedSeats.length * trip.pricePerSeat}
                            </p>
                          </div>
                          <motion.button
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handleBook(trip)}
                            className="bg-[#1C2833] text-white px-5 py-3 rounded-2xl text-[13px] font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all"
                          >
                            Book Now
                          </motion.button>
                        </motion.div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>

      {/* Safety note */}
      <div className="mx-5 mt-6 flex items-center gap-3 bg-gray-50 rounded-2xl p-4 border border-gray-100">
        <Shield size={18} className="text-gray-400 shrink-0" />
        <p className="text-[12px] font-bold text-gray-400 leading-relaxed">
          All shared rides are GPS-tracked. Driver & co-passengers are identity verified.
        </p>
      </div>

      {/* Booking Confirmation Modal */}
      <AnimatePresence>
        {bookingConfirm && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setBookingConfirm(null)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 max-w-lg mx-auto"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 50 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-white rounded-t-[40px] p-8 z-[51] shadow-2xl"
            >
              <div className="text-center space-y-5">
                <div className="text-5xl">🎉</div>
                <h3 className="text-xl font-black text-gray-900">Confirm Booking</h3>
                <div className="bg-gray-50 rounded-2xl p-4 text-left space-y-2 border border-gray-100">
                  <p className="text-[13px] font-bold text-gray-500">{bookingConfirm.trip.from} → {bookingConfirm.trip.to}</p>
                  <p className="text-[13px] font-bold text-gray-500">Departure: {bookingConfirm.trip.departure}</p>
                  <p className="text-[13px] font-bold text-gray-500">Seats: {bookingConfirm.seats.map(s => s.label).join(', ')}</p>
                  <p className="text-[18px] font-black text-gray-900 border-t border-gray-100 pt-2 mt-2">Total: ₹{bookingConfirm.total}</p>
                </div>
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={() => { setBookingConfirm(null); navigate('/'); }}
                  className="w-full bg-[#1C2833] text-white py-4 rounded-2xl text-[15px] font-black uppercase tracking-widest shadow-xl"
                >
                  Confirm & Pay ₹{bookingConfirm.total}
                </motion.button>
                <button onClick={() => setBookingConfirm(null)} className="text-[13px] font-black text-gray-300 hover:text-gray-500">
                  Go Back
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CabSharing;
