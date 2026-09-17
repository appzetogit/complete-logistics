import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Calendar, ChevronRight, Clock3, Info, MapPin, Users } from 'lucide-react';
import { useSettings } from '../../../../shared/context/SettingsContext';

const pad = (value) => String(value).padStart(2, '0');

const formatDateInputValue = (date) => {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  return `${year}-${month}-${day}`;
};

const formatDateTimeInputValue = (date) => {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const getTomorrowLocalDateTime = () => {
  const next = new Date(Date.now() + 60 * 60 * 1000);
  return formatDateTimeInputValue(next);
};

const DEFAULT_BID_STEP_AMOUNT = 10;
const DEFAULT_BID_HEADROOM_PERCENT = 20;

const toConfiguredPositiveInteger = (value, fallback) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : fallback;
};

const clampPercentage = (value, fallback = 0) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.max(0, Math.min(100, numeric));
};

const alignBidAmountToStep = ({ baseFare, amount, stepAmount }) => {
  const safeBaseFare = Math.max(0, Math.round(Number(baseFare || 0)));
  const safeStepAmount = toConfiguredPositiveInteger(stepAmount, DEFAULT_BID_STEP_AMOUNT);
  const safeAmount = Math.max(safeBaseFare, Math.round(Number(amount || 0)));
  const delta = safeAmount - safeBaseFare;

  if (delta === 0) {
    return safeBaseFare;
  }

  return safeBaseFare + (Math.ceil(delta / safeStepAmount) * safeStepAmount);
};

const getTodayLocalDate = () => formatDateInputValue(new Date());

const getMaxAdvanceDate = () => {
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  return formatDateInputValue(nextWeek);
};

const getMaxAdvanceDateTime = () => {
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  return formatDateTimeInputValue(nextWeek);
};

const getVehicleIcon = (type = {}) => {
  const customIcon = String(type.icon || '').trim();
  if (customIcon) return customIcon;

  const iconValue = String(type.iconType || type.vehicleName || '').toLowerCase();
  if (iconValue.includes('bike')) return '/1_Bike.png';
  if (iconValue.includes('auto')) return '/2_AutoRickshaw.png';
  return '/4_Taxi.png';
};

const normalizeVehicleEntry = (pkg, vehicle, index) => ({
  id: vehicle.id || `${pkg.id}:${vehicle.vehicleTypeId || index}`,
  packageId: pkg.id,
  packageTypeName: pkg.packageTypeName || 'Intercity',
  destination: pkg.destination || '',
  vehicleTypeId: vehicle.vehicleTypeId || '',
  name: vehicle.vehicleName || 'Vehicle',
  desc: `${pkg.packageTypeName || 'Intercity'} · ${pkg.destination || 'Destination'}`,
  seats: Number(vehicle.capacity || 4) || 4,
  icon: getVehicleIcon(vehicle),
  vehicleIconUrl: getVehicleIcon(vehicle),
  iconType: vehicle.iconType || vehicle.vehicleName || 'car',
  dispatchType: String(vehicle.dispatchType || 'normal').trim().toLowerCase(),
  supportsBidding: ['bidding', 'both'].includes(String(vehicle.dispatchType || 'normal').trim().toLowerCase()),
  baseFare: Number(vehicle.basePrice || 0),
  freeDistance: Number(vehicle.freeDistance || 0),
  pricePerKm: Number(vehicle.distancePrice || 0),
  freeTime: Number(vehicle.freeTime || 0),
  timePrice: Number(vehicle.timePrice || 0),
  serviceTax: Number(vehicle.serviceTax || 0),
  cancellationFee: Number(vehicle.cancellationFee || 0),
});

const calculateFare = (vehicle, tripType) => {
  const baseFare = Number(vehicle.baseFare || 0);
  return tripType === 'Round Trip' ? Math.round(baseFare * 1.8) : Math.round(baseFare);
};

const calculateDefaultBidCeiling = (fare, stepAmount = DEFAULT_BID_STEP_AMOUNT, headroomPercent = DEFAULT_BID_HEADROOM_PERCENT) => {
  const safeFare = Math.max(0, Number(fare || 0));
  const raisedFare = safeFare * (1 + (clampPercentage(headroomPercent, DEFAULT_BID_HEADROOM_PERCENT) / 100));
  return alignBidAmountToStep({ baseFare: safeFare, amount: raisedFare, stepAmount });
};

const getDisplayDate = (rideMode, travelDate) => (rideMode === 'schedule' ? travelDate : 'Ride Now');

const IntercityVehicle = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { settings } = useSettings();
  const routePrefix = location.pathname.startsWith('/taxi/user') ? '/taxi/user' : '';
  const {
    fromCity,
    toCity,
    tripType: initialTripType,
    date: initialDate,
    rideMode: initialRideMode,
    selectedPackages = [],
    pickupAddress = '',
    pickupCoords = null,
  } = location.state || {};

  const [tripType, setTripType] = useState(initialTripType || 'One Way');
  const [rideMode, setRideMode] = useState(initialRideMode || 'now');
  const [travelDate, setTravelDate] = useState(
    initialRideMode === 'schedule' && initialDate && initialDate !== 'Ride Now'
      ? initialDate
      : new Date().toISOString().split('T')[0]
  );
  const [scheduledAt, setScheduledAt] = useState(
    initialRideMode === 'schedule' && location.state?.scheduledAt
      ? String(location.state.scheduledAt).slice(0, 16)
      : getTomorrowLocalDateTime()
  );
  const [passengers, setPassengers] = useState(1);
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [scheduleError, setScheduleError] = useState('');
  const travelDateInputRef = useRef(null);
  const scheduledAtInputRef = useRef(null);
  const minTravelDate = useMemo(() => getTodayLocalDate(), []);
  const maxTravelDate = useMemo(() => getMaxAdvanceDate(), []);
  const minScheduledAt = useMemo(() => getTomorrowLocalDateTime(), []);
  const maxScheduledAt = useMemo(() => getMaxAdvanceDateTime(), []);

  const vehicles = useMemo(
    () =>
      selectedPackages.flatMap((pkg) =>
        (Array.isArray(pkg.vehicles) ? pkg.vehicles : []).map((vehicle, index) =>
          normalizeVehicleEntry(pkg, vehicle, index)
        )
      ),
    [selectedPackages]
  );

  useEffect(() => {
    if (!selectedVehicleId && vehicles.length) {
      setSelectedVehicleId(vehicles[0].id);
    }
  }, [selectedVehicleId, vehicles]);

  const selectedVehicle = useMemo(
    () => vehicles.find((vehicle) => vehicle.id === selectedVehicleId) || vehicles[0] || null,
    [selectedVehicleId, vehicles]
  );

  useEffect(() => {
    if (!fromCity || !toCity) {
      navigate(`${routePrefix}/intercity`, { replace: true });
    }
  }, [fromCity, navigate, routePrefix, toCity]);

  useEffect(() => {
    if (!selectedVehicle) return;
    setPassengers((current) => Math.min(Math.max(current, 1), selectedVehicle.seats));
  }, [selectedVehicle]);

  useEffect(() => {
    if (travelDate < minTravelDate) {
      setTravelDate(minTravelDate);
      return;
    }

    if (travelDate > maxTravelDate) {
      setTravelDate(maxTravelDate);
    }
  }, [maxTravelDate, minTravelDate, travelDate]);

  useEffect(() => {
    if (!scheduledAt) {
      return;
    }

    if (scheduledAt < minScheduledAt) {
      setScheduledAt(minScheduledAt);
      return;
    }

    if (scheduledAt > maxScheduledAt) {
      setScheduledAt(maxScheduledAt);
    }
  }, [maxScheduledAt, minScheduledAt, scheduledAt]);

  if (!fromCity || !toCity) {
    return null;
  }

  const finalFare = selectedVehicle ? calculateFare(selectedVehicle, tripType) : 0;
  const configuredBidStepAmount = toConfiguredPositiveInteger(
    settings?.bidRide?.bidding_amount_increase_or_decrease,
    DEFAULT_BID_STEP_AMOUNT,
  );
  const configuredBidHighPercentage = clampPercentage(
    settings?.bidRide?.user_bidding_high_percentage,
    DEFAULT_BID_HEADROOM_PERCENT,
  );

  const openPicker = (inputRef) => {
    if (typeof inputRef.current?.showPicker === 'function') {
      inputRef.current.showPicker();
      return;
    }

    inputRef.current?.focus();
    inputRef.current?.click();
  };

  const handleContinue = () => {
    if (!selectedVehicle) return;

    if (rideMode === 'schedule') {
      const parsedSchedule = new Date(scheduledAt);
      if (!scheduledAt || Number.isNaN(parsedSchedule.getTime())) {
        setScheduleError('Choose a valid schedule date and time.');
        return;
      }

      if (!travelDate || travelDate < minTravelDate) {
        setScheduleError('Travel date cannot be earlier than today.');
        return;
      }

      if (travelDate > maxTravelDate) {
        setScheduleError('Advance booking is available for up to 7 days only.');
        return;
      }

      if (parsedSchedule.getTime() <= Date.now() + 60 * 1000) {
        setScheduleError('Schedule time must be at least 1 minute ahead.');
        return;
      }

      if (scheduledAt < minScheduledAt) {
        setScheduleError('Schedule time cannot be earlier than now.');
        return;
      }

      if (scheduledAt > maxScheduledAt) {
        setScheduleError('Advance booking is available for up to 7 days only.');
        return;
      }
    }

    setScheduleError('');

    navigate(`${routePrefix}/intercity/details`, {
      state: {
        fromCity,
        toCity,
        tripType,
        rideMode,
        date: getDisplayDate(rideMode, travelDate),
        travelDate,
        scheduledAt: rideMode === 'schedule' ? new Date(scheduledAt).toISOString() : null,
        selectedPackages,
        pickupAddress,
        pickupCoords,
        distance: 0,
        vehicle: selectedVehicle,
        passengers,
        fare: finalFare,
        baseFare: finalFare,
        bookingMode: selectedVehicle.supportsBidding ? 'bidding' : 'normal',
        bidStepAmount: configuredBidStepAmount,
        userMaxBidFare: selectedVehicle.supportsBidding
          ? calculateDefaultBidCeiling(finalFare, configuredBidStepAmount, configuredBidHighPercentage)
          : finalFare,
      },
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 max-w-lg mx-auto pb-32">
      <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur px-5 pt-10 pb-4">
        <div className="flex items-center gap-3">
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => navigate(-1)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700"
          >
            <ArrowLeft size={18} />
          </motion.button>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500">Intercity booking</p>
            <h1 className="truncate text-lg font-semibold text-slate-900">{toCity}</h1>
          </div>
        </div>
      </div>

      <div className="space-y-5 px-5 py-5">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-500">Route</p>
              <h2 className="mt-1 text-xl font-semibold text-slate-900">{fromCity} to {toCity}</h2>
            </div>
            <div className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
              {selectedPackages.length} package{selectedPackages.length === 1 ? '' : 's'}
            </div>
          </div>
          {pickupAddress ? (
            <div className="mt-4 flex items-start gap-2 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <MapPin size={16} className="mt-0.5 shrink-0 text-blue-600" />
              <span className="line-clamp-2">{pickupAddress}</span>
            </div>
          ) : null}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Trip details</h3>
              <p className="mt-1 text-sm text-slate-500">Choose how and when this trip should run.</p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            {['One Way', 'Round Trip'].map((type) => {
              const active = tripType === type;
              return (
                <button
                  type="button"
                  key={type}
                  onClick={() => setTripType(type)}
                  className={`rounded-2xl border px-4 py-3 text-sm font-medium transition ${
                    active
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  {type}
                </button>
              );
            })}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setRideMode('now')}
              className={`flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition ${
                rideMode === 'now'
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-slate-200 bg-white text-slate-700'
              }`}
            >
              <Clock3 size={16} />
              Ride now
            </button>
            <button
              type="button"
              onClick={() => setRideMode('schedule')}
              className={`flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition ${
                rideMode === 'schedule'
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-slate-200 bg-white text-slate-700'
              }`}
            >
              <Calendar size={16} />
              Schedule
            </button>
          </div>

          {rideMode === 'schedule' ? (
            <div className="mt-4">
              <label className="mb-2 block text-sm font-medium text-slate-700">Travel date</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => openPicker(travelDateInputRef)}
                  className="flex h-12 w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 text-left text-sm text-slate-900 outline-none transition focus:border-blue-500"
                >
                  <span>{travelDate || 'Select travel date'}</span>
                  <Calendar size={16} className="text-slate-400" />
                </button>
                <input
                  ref={travelDateInputRef}
                  type="date"
                  min={minTravelDate}
                  max={maxTravelDate}
                  value={travelDate}
                  onChange={(event) => {
                    setTravelDate(event.target.value);
                    setScheduleError('');
                  }}
                  className="pointer-events-none absolute inset-0 opacity-0"
                  tabIndex={-1}
                />
              </div>
              <label className="mb-2 mt-4 block text-sm font-medium text-slate-700">Pickup time</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => openPicker(scheduledAtInputRef)}
                  className="flex h-12 w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 text-left text-sm text-slate-900 outline-none transition focus:border-blue-500"
                >
                  <span>{scheduledAt ? scheduledAt.replace('T', ' ') : 'Select pickup time'}</span>
                  <Clock3 size={16} className="text-slate-400" />
                </button>
                <input
                  ref={scheduledAtInputRef}
                  type="datetime-local"
                  min={minScheduledAt}
                  max={maxScheduledAt}
                  value={scheduledAt}
                  onChange={(event) => {
                    setScheduledAt(event.target.value);
                    setScheduleError('');
                  }}
                  className="pointer-events-none absolute inset-0 opacity-0"
                  tabIndex={-1}
                />
              </div>
              {scheduleError ? (
                <p className="mt-2 text-sm font-medium text-rose-500">{scheduleError}</p>
              ) : (
                <p className="mt-2 text-xs text-slate-500">Drivers will be notified automatically around this scheduled time.</p>
              )}
            </div>
          ) : null}

          <div className="mt-4 flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-slate-500" />
              <div>
                <p className="text-sm font-medium text-slate-900">Passengers</p>
                <p className="text-xs text-slate-500">Up to {selectedVehicle?.seats || 1} seats</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPassengers((current) => Math.max(1, current - 1))}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-lg text-slate-700"
              >
                -
              </button>
              <span className="w-8 text-center text-base font-semibold text-slate-900">{passengers}</span>
              <button
                type="button"
                onClick={() => setPassengers((current) => Math.min(selectedVehicle?.seats || 1, current + 1))}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-lg text-slate-700"
              >
                +
              </button>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Choose vehicle</h3>
              <p className="mt-1 text-sm text-slate-500">Only vehicles mapped to this package are shown.</p>
            </div>
          </div>

          {vehicles.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <Info size={20} />
              </div>
              <p className="text-sm font-medium text-slate-900">No vehicles available</p>
              <p className="mt-1 text-sm text-slate-500">Try another destination or package.</p>
            </div>
          ) : (
            vehicles.map((vehicle) => {
              const vehicleFare = calculateFare(vehicle, tripType);
              const isActive = selectedVehicleId === vehicle.id;

              return (
                <button
                  type="button"
                  key={vehicle.id}
                  onClick={() => {
                    setSelectedVehicleId(vehicle.id);
                    if (passengers > vehicle.seats) {
                      setPassengers(vehicle.seats);
                    }
                  }}
                  className={`w-full rounded-3xl border p-4 text-left transition ${
                    isActive
                      ? 'border-blue-600 bg-blue-50/60 shadow-sm'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white">
                      <img src={vehicle.icon} alt={vehicle.name} className="h-10 w-10 object-contain" draggable={false} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <h4 className="truncate text-base font-semibold text-slate-900">{vehicle.name}</h4>
                          <p className="mt-1 text-sm text-slate-500">{vehicle.seats} seats · {vehicle.packageTypeName}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-semibold text-slate-900">Rs {vehicleFare.toLocaleString()}</p>
                          <p className="text-xs text-slate-500">estimated</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </section>
      </div>

      <div className="fixed bottom-0 left-1/2 w-full max-w-lg -translate-x-1/2 border-t border-slate-200 bg-white px-5 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-slate-500">{tripType} · {getDisplayDate(rideMode, travelDate)}</p>
            <p className="mt-1 text-xl font-semibold text-slate-900">Rs {finalFare.toLocaleString()}</p>
          </div>
          <motion.button
            type="button"
            whileTap={{ scale: 0.98 }}
            onClick={handleContinue}
            disabled={!selectedVehicle}
            className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 text-sm font-medium text-white disabled:opacity-50"
          >
            Continue
            <ChevronRight size={16} />
          </motion.button>
        </div>
      </div>
    </div>
  );
};

export default IntercityVehicle;
