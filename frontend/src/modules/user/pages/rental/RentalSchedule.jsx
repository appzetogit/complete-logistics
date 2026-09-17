import React, { useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Tag,
} from 'lucide-react';

const WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TIME_OPTIONS = [
  '06:00',
  '07:00',
  '08:00',
  '09:00',
  '10:00',
  '11:00',
  '12:00',
  '13:00',
  '14:00',
  '15:00',
  '16:00',
  '17:00',
  '18:00',
  '19:00',
  '20:00',
  '21:00',
];

const pad = (n) => String(n).padStart(2, '0');

const startOfDay = (date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const formatDateTimeValue = (date, time) => {
  const [hours, minutes] = String(time || '00:00').split(':');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${hours}:${minutes}`;
};

const formatDateLabel = (date) =>
  date.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

const formatTimeLabel = (time) => {
  const [hours, minutes] = String(time || '00:00').split(':').map(Number);
  const displayHour = hours % 12 || 12;
  const suffix = hours >= 12 ? 'PM' : 'AM';
  return `${displayHour}:${pad(minutes)} ${suffix}`;
};

const buildCalendarDays = (monthDate) => {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDayIndex = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];

  for (let i = 0; i < firstDayIndex; i += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(year, month, day));
  }

  return cells;
};

const isSameDay = (left, right) =>
  left &&
  right &&
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();

const DateTimePickerCard = ({
  title,
  accentClass,
  icon: Icon,
  selectedDate,
  selectedTime,
  monthDate,
  onMonthChange,
  onDateSelect,
  onTimeSelect,
  minDate,
  minTime,
}) => {
  const days = useMemo(() => buildCalendarDays(monthDate), [monthDate]);
  const minDay = startOfDay(minDate);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[20px] border border-white/80 bg-white/90 shadow-[0_4px_14px_rgba(15,23,42,0.05)] px-5 py-4 space-y-4"
    >
      <div className="flex items-center gap-2">
        <div className={`w-7 h-7 rounded-[9px] flex items-center justify-center ${accentClass}`}>
          <Icon size={13} className="text-slate-900" strokeWidth={2.5} />
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500/80">
            {title}
          </p>
          <p className="text-[12px] font-bold text-slate-800 mt-1">
            {formatDateLabel(selectedDate)} · {formatTimeLabel(selectedTime)}
          </p>
        </div>
      </div>

      <div className="rounded-[18px] border border-slate-100 bg-slate-50 px-4 py-4">
        <div className="flex items-center justify-between mb-4">
          <button
            type="button"
            onClick={() => onMonthChange(-1)}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500"
          >
            <ChevronLeft size={15} />
          </button>
          <p className="text-[14px] font-bold text-slate-950">
            {monthDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
          </p>
          <button
            type="button"
            onClick={() => onMonthChange(1)}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500"
          >
            <ChevronRight size={15} />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-2 text-center">
          {WEEK_DAYS.map((day) => (
            <div key={day} className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {day}
            </div>
          ))}
          {days.map((day, index) => {
            if (!day) {
              return <div key={`empty-${index}`} className="h-10" />;
            }

            const disabled = startOfDay(day) < minDay;
            const selected = isSameDay(day, selectedDate);

            return (
              <button
                key={day.toISOString()}
                type="button"
                disabled={disabled}
                onClick={() => onDateSelect(day)}
                className={`h-10 rounded-[12px] text-[12px] font-bold transition-all ${
                  selected
                    ? 'bg-slate-950 text-white shadow-[0_8px_20px_rgba(15,23,42,0.18)]'
                    : disabled
                      ? 'bg-white/40 text-slate-300'
                      : 'bg-white text-slate-700 border border-slate-100 hover:border-slate-300'
                }`}
              >
                {day.getDate()}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500/80 mb-3">
          Select Time
        </p>
        <div className="grid grid-cols-3 gap-2">
          {TIME_OPTIONS.map((time) => {
            const disabled =
              isSameDay(selectedDate, minDate) &&
              String(time) < String(minTime || '00:00');
            const selected = selectedTime === time;

            return (
              <button
                key={time}
                type="button"
                disabled={disabled}
                onClick={() => onTimeSelect(time)}
                className={`rounded-[12px] px-3 py-2.5 text-[11px] font-bold transition-all ${
                  selected
                    ? 'bg-slate-950 text-white'
                    : disabled
                      ? 'bg-slate-100 text-slate-300'
                      : 'bg-slate-50 text-slate-600 border border-slate-100 hover:border-slate-300'
                }`}
              >
                {formatTimeLabel(time)}
              </button>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
};

const RentalSchedule = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { vehicle, duration, selectedPackage, serviceLocation } = location.state || {};

  if (!vehicle) {
    navigate('/rental');
    return null;
  }

  const now = new Date();
  const roundedNow = new Date(now);
  roundedNow.setMinutes(0, 0, 0);
  roundedNow.setHours(Math.max(6, roundedNow.getHours() + 1));

  const defaultHours =
    Number(selectedPackage?.durationHours || 0) ||
    (duration === 'Hourly' ? 2 : duration === 'Half-Day' ? 6 : 24);
  const defaultPickupDate = startOfDay(roundedNow);
  const defaultPickupTime = `${pad(roundedNow.getHours())}:00`;
  const defaultReturnDateTime = new Date(
    defaultPickupDate.getFullYear(),
    defaultPickupDate.getMonth(),
    defaultPickupDate.getDate(),
    roundedNow.getHours() + defaultHours,
    0,
    0,
    0,
  );

  const [pickupDate, setPickupDate] = useState(defaultPickupDate);
  const [pickupTime, setPickupTime] = useState(defaultPickupTime);
  const [returnDate, setReturnDate] = useState(startOfDay(defaultReturnDateTime));
  const [returnTime, setReturnTime] = useState(`${pad(defaultReturnDateTime.getHours())}:00`);
  const [pickupMonthDate, setPickupMonthDate] = useState(defaultPickupDate);
  const [returnMonthDate, setReturnMonthDate] = useState(startOfDay(defaultReturnDateTime));

  const pickup = useMemo(
    () => formatDateTimeValue(pickupDate, pickupTime),
    [pickupDate, pickupTime],
  );

  const returnDateTimeValue = useMemo(
    () => formatDateTimeValue(returnDate, returnTime),
    [returnDate, returnTime],
  );

  const { hours, totalCost, extraHours, extraHourRate, basePrice, includedHours, isValid } = useMemo(() => {
    const diff = (new Date(returnDateTimeValue) - new Date(pickup)) / 3600000;
    const hrs = Math.max(0, diff);
    let cost = 0;
    let overrunHours = 0;
    let hourlyOverrunRate = 0;
    let packageBasePrice = 0;
    let packageIncludedHours = 0;

    if (selectedPackage?.price && selectedPackage?.durationHours) {
      packageIncludedHours = Math.max(1, Number(selectedPackage.durationHours || 0));
      packageBasePrice = Number(selectedPackage.price || 0);
      hourlyOverrunRate = Math.max(0, Number(selectedPackage.extraHourPrice || 0));
      overrunHours = Math.max(0, hrs - packageIncludedHours);
      cost =
        packageBasePrice +
        Math.ceil(overrunHours) * hourlyOverrunRate;
    } else if (duration === 'Hourly') {
      cost = Math.ceil(hrs) * vehicle.prices['Hourly'];
    } else if (duration === 'Half-Day') {
      cost = Math.ceil(hrs / 6) * vehicle.prices['Half-Day'];
    } else {
      cost = Math.ceil(hrs / 24) * vehicle.prices['Daily'];
    }

    return {
      hours: hrs.toFixed(1),
      totalCost: cost,
      extraHours: overrunHours,
      extraHourRate: hourlyOverrunRate,
      basePrice: packageBasePrice,
      includedHours: packageIncludedHours,
      isValid: diff > 0,
    };
  }, [duration, pickup, returnDateTimeValue, selectedPackage, vehicle]);

  const suffix = selectedPackage?.durationHours
    ? `${selectedPackage.durationHours}hr block`
    : { Hourly: 'hr', 'Half-Day': '6hr block', Daily: 'day' }[duration];

  const minimumPickupTime = isSameDay(pickupDate, roundedNow)
    ? `${pad(roundedNow.getHours())}:00`
    : '06:00';

  const minimumReturnDate = new Date(pickupDate);
  const minimumReturnTime = isSameDay(returnDate, pickupDate)
    ? pickupTime
    : '06:00';

  const handlePickupDateSelect = (date) => {
    setPickupDate(date);

    if (isSameDay(date, roundedNow) && pickupTime < minimumPickupTime) {
      setPickupTime(minimumPickupTime);
    }

    if (startOfDay(returnDate) < startOfDay(date)) {
      setReturnDate(date);
      setReturnMonthDate(date);
    }
  };

  const handlePickupTimeSelect = (time) => {
    setPickupTime(time);

    if (isSameDay(returnDate, pickupDate) && returnTime < time) {
      setReturnTime(time);
    }
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#F8FAFC_0%,#F3F4F6_38%,#EEF2F7_100%)] max-w-lg mx-auto font-sans pb-28 relative overflow-hidden">
      <div className="absolute -top-16 right-[-40px] h-44 w-44 rounded-full bg-orange-100/60 blur-3xl pointer-events-none" />

      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="sticky top-0 z-30 w-full"
      >
        <div className="bg-white/85 backdrop-blur-2xl px-5 pt-12 pb-5 border-b border-white/40 shadow-[0_8px_32px_rgba(15,23,42,0.06)] relative overflow-hidden">
          {/* Subtle accent gradients */}
          <div className="absolute top-0 right-0 h-32 w-32 rounded-full bg-orange-400/5 blur-[40px] pointer-events-none" />
          <div className="absolute top-0 left-0 h-24 w-24 rounded-full bg-blue-400/5 blur-[40px] pointer-events-none" />

          <div className="relative flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <motion.button
                whileHover={{ x: -2 }}
                whileTap={{ scale: 0.92 }}
                onClick={() => navigate(-1)}
                className="w-10 h-10 rounded-2xl bg-slate-900 flex items-center justify-center shadow-[0_4px_12px_rgba(15,23,42,0.15)] shrink-0 group transition-all"
              >
                <ArrowLeft size={20} className="text-white group-hover:opacity-80 transition-opacity" strokeWidth={2.5} />
              </motion.button>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500/60 leading-none mb-1.5">Schedule · {vehicle.name}</p>
                <h1 className="text-[22px] font-[900] tracking-tight text-slate-950 leading-none">Date & Time</h1>
              </div>
            </div>
          </div>
        </div>
      </motion.header>

      <div className="px-5 pt-5 space-y-4">
        {selectedPackage || serviceLocation ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.03 }}
            className="rounded-[20px] border border-white/80 bg-white/90 shadow-[0_4px_14px_rgba(15,23,42,0.05)] px-5 py-4 space-y-2"
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500/80">
              Rental Setup
            </p>
            {selectedPackage ? (
              <p className="text-[13px] font-bold text-slate-900">
                {selectedPackage.label} - Rs.{selectedPackage.price}
              </p>
            ) : null}
            {serviceLocation?.name ? (
              <p className="text-[12px] font-bold text-slate-500">
                Pickup location: {serviceLocation.name}
              </p>
            ) : null}
          </motion.div>
        ) : null}

        <DateTimePickerCard
          title="Pickup Date & Time"
          icon={Calendar}
          accentClass="bg-orange-100"
          selectedDate={pickupDate}
          selectedTime={pickupTime}
          monthDate={pickupMonthDate}
          onMonthChange={(offset) =>
            setPickupMonthDate(
              new Date(pickupMonthDate.getFullYear(), pickupMonthDate.getMonth() + offset, 1),
            )
          }
          onDateSelect={handlePickupDateSelect}
          onTimeSelect={handlePickupTimeSelect}
          minDate={roundedNow}
          minTime={minimumPickupTime}
        />

        <DateTimePickerCard
          title="Return Date & Time"
          icon={Clock}
          accentClass="bg-blue-100"
          selectedDate={returnDate}
          selectedTime={returnTime}
          monthDate={returnMonthDate}
          onMonthChange={(offset) =>
            setReturnMonthDate(
              new Date(returnMonthDate.getFullYear(), returnMonthDate.getMonth() + offset, 1),
            )
          }
          onDateSelect={(date) => setReturnDate(date)}
          onTimeSelect={setReturnTime}
          minDate={minimumReturnDate}
          minTime={minimumReturnTime}
        />

        {!isValid ? (
          <div className="rounded-[18px] border border-rose-100 bg-rose-50 px-4 py-3 text-[12px] font-bold text-rose-500">
            Return time must be after pickup.
          </div>
        ) : null}

        <AnimatePresence mode="wait">
          {isValid ? (
            <motion.div
              key={totalCost}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-[20px] border border-white/80 bg-white/90 shadow-[0_4px_14px_rgba(15,23,42,0.05)] px-5 py-4 space-y-3"
            >
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-[9px] bg-emerald-50 flex items-center justify-center">
                  <Tag size={13} className="text-emerald-500" strokeWidth={2.5} />
                </div>
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500/80">
                  Cost Estimate
                </p>
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="text-[12px] font-bold text-slate-400">{vehicle.name}</p>
                  <p className="text-[12px] font-bold text-slate-400">
                    {hours} hrs - Rs.{selectedPackage?.price || vehicle.prices[duration]}/{suffix}
                  </p>
                  {selectedPackage?.durationHours ? (
                    <p className="text-[11px] font-bold text-slate-400">
                      Includes {includedHours} hrs for Rs.{basePrice}
                      {extraHours > 0
                        ? ` + ${Math.ceil(extraHours)} extra hr x Rs.${extraHourRate}`
                        : ' with no extra-hour charge'}
                    </p>
                  ) : null}
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.12em]">
                    Total
                  </p>
                  <p className="text-[28px] font-extrabold text-slate-950 leading-none">
                    Rs.{totalCost}
                  </p>
                  <p className="text-[10px] font-bold text-slate-400">+ deposit (refundable)</p>
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg px-5 pb-6 pt-3 bg-gradient-to-t from-[#EEF2F7] via-[#F3F4F6]/95 to-transparent pointer-events-none z-30">
        <motion.button
          whileTap={{ scale: 0.98 }}
          disabled={!isValid}
          onClick={() =>
            navigate('/rental/kyc', {
              state: {
                vehicle,
                duration,
                selectedPackage,
                serviceLocation,
                pickup,
                returnTime: returnDateTimeValue,
                totalCost,
              },
            })
          }
          className={`pointer-events-auto w-full py-4 rounded-[18px] text-[15px] font-bold text-white shadow-[0_8px_24px_rgba(15,23,42,0.18)] flex items-center justify-center gap-2 transition-all ${
            isValid ? 'bg-slate-950' : 'bg-slate-300'
          }`}
        >
          Continue <ChevronRight size={17} strokeWidth={2.5} className="opacity-50" />
        </motion.button>
      </div>
    </div>
  );
};

export default RentalSchedule;
