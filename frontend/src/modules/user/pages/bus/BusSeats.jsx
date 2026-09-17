import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ChevronRight, Loader2 } from 'lucide-react';
import userBusService from '../../services/busService';
import { buildBusRouteState, toPlainData } from './busNavigationState';

const getRoutePrefix = (pathname = '') => (pathname.startsWith('/taxi/user') ? '/taxi/user' : '');

const getDisplayRoute = (bus, fallbackFromCity = '', fallbackToCity = '') => ({
  fromCity: bus?.route?.originCity || bus?.fromCity || fallbackFromCity,
  toCity: bus?.route?.destinationCity || bus?.toCity || fallbackToCity,
});

const seatLegend = [
  { key: 'available', label: 'Available' },
  { key: 'selected', label: 'Selected' },
  { key: 'booked', label: 'Booked' },
  { key: 'sleeper', label: 'Sleeper' },
];

const resolveSeatPrice = (bus, seat) => {
  const variantPricing = bus?.variantPricing || {};
  const defaultPrice = Number(bus?.price || 0);
  const variantKey = String(seat?.variant || 'seat').trim().toLowerCase();
  const resolvedPrice = variantPricing?.[variantKey] ?? variantPricing?.seat ?? defaultPrice;

  return Number.isFinite(Number(resolvedPrice)) ? Number(resolvedPrice) : defaultPrice;
};

const SeatDeck = ({ title, rows, selectedSeatIds, onToggle }) => {
  if (!rows?.length) return null;

  return (
    <div className="w-full bg-white rounded-[28px] p-5 shadow-[0_8px_30px_rgba(15,23,42,0.06)] border border-slate-100">
      <div className="flex justify-between items-center mb-5 pb-5 border-b border-dashed border-slate-100">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-2 py-1 bg-slate-50 rounded">{title}</span>
        <div className="w-10 h-10 rounded-full border-4 border-slate-200 border-r-transparent border-b-transparent transform rotate-45 flex items-center justify-center">
          <div className="w-6 h-6 rounded-full border-2 border-slate-200" />
        </div>
      </div>

      <div className="space-y-3">
        {rows.map((row, rowIndex) => (
          <div
            key={`${title}-${rowIndex}`}
            className="grid gap-3"
            style={{ gridTemplateColumns: `repeat(${Math.max(1, row.length)}, minmax(0, 1fr))` }}
          >
            {row.map((seat, cellIndex) => {
              if (!seat || seat.kind !== 'seat') {
                return <div key={`${title}-${rowIndex}-${cellIndex}`} className="w-full" />;
              }

              const isBooked = seat.status === 'booked';
              const isSelected = selectedSeatIds.includes(seat.id);
              const isSleeper = seat.variant === 'sleeper';

              return (
                <motion.button
                  key={seat.id}
                  type="button"
                  disabled={isBooked}
                  whileTap={!isBooked ? { scale: 0.85 } : {}}
                  onClick={() => onToggle(seat)}
                  className={`relative flex w-full items-center justify-center border-2 transition-all ${
                    isBooked
                      ? 'cursor-not-allowed border-slate-300 bg-slate-200'
                      : isSelected
                        ? 'border-slate-900 bg-slate-900 shadow-[0_6px_16px_rgba(2,6,23,0.22)]'
                        : isSleeper
                          ? 'border-blue-200 bg-blue-50 hover:border-blue-300'
                          : 'border-slate-300 bg-white hover:border-orange-300'
                  }`}
                  style={{
                    minHeight: isSleeper ? '52px' : '44px',
                    borderRadius: isSleeper ? '18px' : '10px',
                  }}
                  aria-label={isBooked ? `Seat ${seat.label || seat.id} sold out` : `Seat ${seat.label || seat.id}`}
                  title={isBooked ? `Sold out: ${seat.label || seat.id}` : `Available: ${seat.label || seat.id}`}
                >
                  {isSleeper ? (
                    <>
                      <div
                        className={`absolute left-1.5 top-1/2 h-[72%] w-2 -translate-y-1/2 rounded-full transition-colors ${
                          isBooked ? 'bg-slate-400' : isSelected ? 'bg-orange-300' : 'bg-blue-200'
                        }`}
                      />
                      <div className="flex w-full items-center justify-center px-3 pl-5">
                        <span
                          className={`text-[10px] font-black leading-none ${
                            isSelected ? 'text-white' : isBooked ? 'text-slate-500' : 'text-slate-700'
                          }`}
                        >
                          {seat.label || seat.id}
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className={`absolute -top-1 h-2 w-full rounded-t-sm transition-colors ${isBooked ? 'bg-slate-400' : isSelected ? 'bg-orange-400' : 'bg-slate-200'}`} />
                      <span className={`text-[9px] font-black leading-none ${isSelected ? 'text-white' : isBooked ? 'text-slate-500' : 'text-slate-600'}`}>
                        {seat.label || seat.id}
                      </span>
                    </>
                  )}
                </motion.button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

const BusSeats = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const routePrefix = useMemo(() => getRoutePrefix(location.pathname), [location.pathname]);
  const state = location.state || {};
  const { bus, fromCity, toCity, date } = state;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [seatLayout, setSeatLayout] = useState(null);
  const [selectedSeats, setSelectedSeats] = useState([]);
  const displayRoute = getDisplayRoute(seatLayout?.bus || bus, fromCity, toCity);

  useEffect(() => {
    if (!bus?.busServiceId || !bus?.scheduleId || !date) {
      navigate(`${routePrefix}/bus`, { replace: true });
      return;
    }

    let active = true;

    const loadSeats = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await userBusService.getSeatLayout({
          busServiceId: bus.busServiceId,
          scheduleId: bus.scheduleId,
          date,
        });
        if (!active) return;
        setSeatLayout(toPlainData(response?.data) || null);
      } catch (err) {
        if (!active) return;
        setError(err?.message || 'Failed to load seat layout');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadSeats();

    return () => {
      active = false;
    };
  }, [bus?.busServiceId, bus?.scheduleId, date, navigate, routePrefix]);

  const toggleSeat = (seat) => {
    if (!seat || seat.status === 'booked') return;

    setSelectedSeats((current) =>
      current.some((item) => item.id === seat.id)
        ? current.filter((item) => item.id !== seat.id)
        : [...current, { id: seat.id, label: seat.label || seat.id, variant: seat.variant || 'seat', price: resolveSeatPrice(seatLayout?.bus || bus, seat) }],
    );
  };

  const totalFare = selectedSeats.reduce((sum, seat) => sum + Number(seat.price || 0), 0);

  return (
    <div className="min-h-screen bg-slate-50 max-w-lg mx-auto font-sans pb-32">
      <div className="bg-white px-5 pt-10 pb-4 sticky top-0 z-20 border-b border-slate-100 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-xl border border-slate-200 bg-white flex items-center justify-center shadow-sm active:scale-95 transition-all"
          >
            <ArrowLeft size={18} className="text-slate-900" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-slate-900 truncate">Select Seats</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
              {bus?.operator} • {displayRoute.fromCity} to {displayRoute.toCity}
            </p>
          </div>
        </div>
      </div>

      <div className="px-5 pt-6 space-y-6">
        {loading ? (
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-12 flex flex-col items-center gap-4 text-slate-500">
            <Loader2 size={32} className="animate-spin text-slate-400" />
            <p className="text-sm font-bold text-slate-400">Loading seat map...</p>
          </div>
        ) : null}

        {!loading && error ? (
          <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4 text-sm font-bold text-rose-600">
            {error}
          </div>
        ) : null}

        {!loading && !error ? (
          <>
            <SeatDeck
              title="Lower Deck"
              rows={seatLayout?.blueprint?.lowerDeck || []}
              selectedSeatIds={selectedSeats.map((seat) => seat.id)}
              onToggle={toggleSeat}
            />
            <SeatDeck
              title="Upper Deck"
              rows={seatLayout?.blueprint?.upperDeck || []}
              selectedSeatIds={selectedSeats.map((seat) => seat.id)}
              onToggle={toggleSeat}
            />

            <div className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              {seatLegend.map((item) => (
                <div key={item.key} className="flex items-center gap-2">
                  <div
                    className={`h-4 w-4 ${
                      item.key === 'sleeper' ? 'rounded-xl border border-blue-200 bg-blue-50' : 'rounded border-2'
                    } ${
                      item.key === 'available'
                        ? 'border-slate-200 bg-white'
                        : item.key === 'selected'
                          ? 'border-slate-900 bg-slate-900'
                          : item.key === 'booked'
                            ? 'border-slate-200 bg-slate-200'
                            : ''
                    }`}
                  />
                  <span className="text-[10px] font-bold uppercase text-slate-500">{item.label}</span>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </div>

      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg px-5 pb-8 pt-4 bg-white border-t border-slate-100 z-30">
        <AnimatePresence>
          {selectedSeats.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="bg-slate-50 rounded-2xl p-4 flex items-center justify-between mb-4 border border-slate-100"
            >
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  {selectedSeats.length} Seat{selectedSeats.length > 1 ? 's' : ''} Selected
                </p>
                <p className="text-sm font-bold text-slate-900">
                  {selectedSeats.map((seat) => seat.label || seat.id).join(', ')}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total</p>
                <p className="text-xl font-bold text-slate-900">₹{totalFare}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.button
          disabled={selectedSeats.length === 0 || !!error || loading}
          whileTap={{ scale: 0.98 }}
          onClick={() =>
            navigate(`${routePrefix}/bus/checkout`, {
              state: buildBusRouteState(state, {
                bus: seatLayout?.bus || bus,
                selectedSeats,
                totalFare,
              }),
            })
          }
          className={`w-full py-4 rounded-2xl text-base font-bold flex items-center justify-center gap-2 transition-all ${
            selectedSeats.length > 0 && !error && !loading
              ? 'bg-slate-900 text-white shadow-lg active:scale-95'
              : 'bg-slate-100 text-slate-400 cursor-not-allowed'
          }`}
        >
          Proceed to Payment <ChevronRight size={18} />
        </motion.button>
      </div>
    </div>
  );
};

export default BusSeats;
