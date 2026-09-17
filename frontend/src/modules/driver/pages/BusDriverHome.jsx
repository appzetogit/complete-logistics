import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bus,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock3,
  Filter,
  LayoutDashboard,
  MapPin,
  Phone,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Ticket,
  UserRound,
  Users,
  XCircle,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { clearDriverAuthState, getCurrentDriver } from '../services/registrationService';
import BusDriverBottomNav from '../components/BusDriverBottomNav';
import {
  createBusDriverReservation,
  getBusDriverBookings,
  getBusDriverSeatLayout,
  updateBusDriverSchedules,
} from '../services/busDriverService';

const unwrap = (response) => response?.data?.data || response?.data || response;
const unwrapResults = (response) => response?.data?.results || response?.results || [];
const formatDateKey = (value) => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return '';
  }

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDateKey = (value) => {
  if (typeof value !== 'string') {
    return null;
  }

  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(year, monthIndex, day);

  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== monthIndex ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return parsed;
};

const createToday = () => formatDateKey(new Date());
const DAY_OPTIONS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const createLocalScheduleId = () =>
  `schedule-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const createScheduleDraft = () => ({
  id: createLocalScheduleId(),
  label: '',
  departureTime: '',
  arrivalTime: '',
  activeDays: [...DAY_OPTIONS],
  status: 'active',
});

const formatCurrency = (value, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currency || 'INR',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const formatDisplayDate = (value) => {
  if (!value) return 'No date selected';
  const date = parseDateKey(value) || new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const getNextTravelDate = (schedule) => {
  const activeDays = Array.isArray(schedule?.activeDays) ? schedule.activeDays : [];
  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  for (let index = 0; index < 14; index += 1) {
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + index);
    const label = dayLabels[nextDate.getDay()];
    if (activeDays.length === 0 || activeDays.includes(label)) {
      return formatDateKey(nextDate);
    }
  }

  return createToday();
};

const WORKSPACE_TABS = [
  { id: 'overview', label: 'Overview', Icon: LayoutDashboard },
  { id: 'schedule', label: 'Schedule', Icon: CalendarDays },
  { id: 'desk', label: 'Seat Desk', Icon: Bus },
  { id: 'bookings', label: 'Bookings', Icon: ClipboardList },
];

const STOP_TYPE_TONE = {
  pickup: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  drop: 'bg-rose-50 text-rose-700 border-rose-200',
  both: 'bg-indigo-50 text-indigo-700 border-indigo-200',
};

const getCalendarMatrix = (value) => {
  const sourceDate = value instanceof Date ? value : parseDateKey(value) || new Date();
  const year = sourceDate.getFullYear();
  const month = sourceDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startDay = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];

  for (let index = 0; index < startDay; index += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const cellDate = new Date(year, month, day);
    cells.push({
      label: day,
      value: formatDateKey(cellDate),
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
};

const countBlueprintSeats = (blueprint = {}) =>
  ['lowerDeck', 'upperDeck']
    .flatMap((deckKey) => (Array.isArray(blueprint?.[deckKey]) ? blueprint[deckKey] : []))
    .flatMap((row) => (Array.isArray(row) ? row : []))
    .filter((cell) => cell?.kind === 'seat').length;

const SeatDeck = ({ title, rows, selectedSeatIds, onToggle }) => {
  if (!rows?.length) return null;

  const maxColumns = Math.max(...rows.map((row) => row.length), 1);

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-black text-slate-900">{title}</h3>
        <span className="rounded-full bg-slate-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
          Coach
        </span>
      </div>

      <div className="space-y-3">
        {rows.map((row, rowIndex) => (
          <div
            key={`${title}-${rowIndex}`}
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${Math.max(maxColumns, row.length)}, minmax(0, 1fr))` }}
          >
            {row.map((seat, cellIndex) => {
              if (!seat || seat.kind !== 'seat') {
                return <div key={`${title}-${rowIndex}-${cellIndex}`} className="h-10 rounded-xl bg-slate-100/70" />;
              }

              const isBooked = seat.status === 'booked';
              const isSelected = selectedSeatIds.includes(seat.id);

              return (
                <button
                  key={`${title}-${seat.id}`}
                  type="button"
                  disabled={isBooked}
                  onClick={() => onToggle(seat)}
                  className={`relative h-10 rounded-xl border text-[10px] font-black transition ${
                    isBooked
                      ? 'cursor-not-allowed border-slate-200 bg-slate-200 text-slate-500'
                      : isSelected
                        ? 'border-slate-950 bg-slate-950 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'
                  }`}
                >
                  <span className="absolute inset-x-2 top-1 h-1 rounded-full bg-slate-200/90" />
                  {seat.label || seat.id}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
};

const StatCard = ({ label, value, tone = 'light', Icon }) => (
  <div className={`rounded-2xl p-4 ${tone === 'dark' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-900'} shadow-sm`}>
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className={`text-[10px] font-bold uppercase tracking-[0.16em] ${tone === 'dark' ? 'text-white/55' : 'text-slate-400'}`}>{label}</p>
        <p className="mt-2 text-2xl font-black">{value}</p>
      </div>
      {Icon ? (
        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${tone === 'dark' ? 'bg-white/10 text-white' : 'bg-slate-100 text-slate-700'}`}>
          <Icon size={20} />
        </div>
      ) : null}
    </div>
  </div>
);

const BusDriverHome = () => {
  const navigate = useNavigate();
  const calendarPopoverRef = useRef(null);
  const runDetailsPopoverRef = useRef(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [profile, setProfile] = useState(null);
  const [layout, setLayout] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [selectedScheduleId, setSelectedScheduleId] = useState('');
  const [travelDate, setTravelDate] = useState(createToday());
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingDesk, setLoadingDesk] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deskError, setDeskError] = useState('');
  const [bookingSearch, setBookingSearch] = useState('');
  const [bookingFilter, setBookingFilter] = useState('all');
  const [scheduleDrafts, setScheduleDrafts] = useState([]);
  const [isSavingSchedules, setIsSavingSchedules] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isRunDetailsOpen, setIsRunDetailsOpen] = useState(false);
  const [passenger, setPassenger] = useState({
    name: '',
    age: '',
    gender: 'Male',
    phone: '',
    email: '',
    notes: '',
  });

  const confirmLogout = useCallback(() => {
    const shouldLogout = window.confirm('Do you want to log out and leave the bus driver console?');
    if (!shouldLogout) {
      return false;
    }

    clearDriverAuthState();
    navigate('/taxi/driver/login', { replace: true });
    return true;
  }, [navigate]);

  const busService = profile?.busService || null;
  const schedules = Array.isArray(busService?.schedules) ? busService.schedules : [];
  const routeStops = Array.isArray(busService?.route?.stops) ? busService.route.stops : [];
  const pickupStops = routeStops.filter((stop) => stop?.stopType === 'pickup' || stop?.stopType === 'both');
  const dropStops = routeStops.filter((stop) => stop?.stopType === 'drop' || stop?.stopType === 'both');
  const selectedSchedule =
    schedules.find((item) => item.id === selectedScheduleId) || schedules[0] || null;
  const persistedScheduleIds = useMemo(
    () => new Set(schedules.map((item) => item.id)),
    [schedules],
  );
  const calendarCells = useMemo(() => getCalendarMatrix(calendarMonth), [calendarMonth]);
  const calendarLabel = useMemo(
    () =>
      calendarMonth.toLocaleDateString('en-IN', {
        month: 'long',
        year: 'numeric',
      }),
    [calendarMonth],
  );

  useEffect(() => {
    let active = true;

    const loadProfile = async () => {
      setLoadingProfile(true);
      try {
        const response = await getCurrentDriver();
        const data = unwrap(response);
        if (!active) return;
        setProfile(data);

        const firstSchedule = Array.isArray(data?.busService?.schedules) ? data.busService.schedules[0] : null;
        if (firstSchedule?.id) {
          setSelectedScheduleId(firstSchedule.id);
          const nextDate = getNextTravelDate(firstSchedule);
          setTravelDate(nextDate);
          const parsedDate = parseDateKey(nextDate);
          if (!parsedDate) return;
          setCalendarMonth(new Date(parsedDate.getFullYear(), parsedDate.getMonth(), 1));
        }
      } catch (error) {
        if (!active) return;
        toast.error(error?.message || 'Unable to load bus driver profile');
      } finally {
        if (active) {
          setLoadingProfile(false);
        }
      }
    };

    loadProfile();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setScheduleDrafts(
      Array.isArray(schedules) && schedules.length
        ? schedules.map((schedule) => ({
            id: schedule.id,
            label: schedule.label || '',
            departureTime: schedule.departureTime || '',
            arrivalTime: schedule.arrivalTime || '',
            activeDays: Array.isArray(schedule.activeDays) ? [...schedule.activeDays] : [],
            status: schedule.status || 'active',
          }))
        : [createScheduleDraft()],
    );
  }, [schedules]);

  useEffect(() => {
    window.history.pushState({ busDriverHome: true }, '', window.location.href);

    const handlePopState = () => {
      const loggedOut = confirmLogout();
      if (!loggedOut) {
        window.history.pushState({ busDriverHome: true }, '', window.location.href);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [confirmLogout]);

  useEffect(() => {
    if (!schedules.length) {
      setSelectedScheduleId('');
      return;
    }

    if (!selectedScheduleId || !schedules.some((item) => item.id === selectedScheduleId)) {
      const nextSchedule = schedules[0];
      setSelectedScheduleId(nextSchedule.id);
      const nextDate = getNextTravelDate(nextSchedule);
      setTravelDate(nextDate);
      const parsedDate = parseDateKey(nextDate);
      if (!parsedDate) return;
      setCalendarMonth(new Date(parsedDate.getFullYear(), parsedDate.getMonth(), 1));
      setSelectedSeats([]);
    }
  }, [schedules, selectedScheduleId]);

  useEffect(() => {
    if (!selectedScheduleId || !travelDate) {
      return;
    }

    let active = true;

    const loadDesk = async () => {
      setLoadingDesk(true);
      setDeskError('');
      try {
        const [layoutResponse, bookingsResponse] = await Promise.all([
          getBusDriverSeatLayout({ scheduleId: selectedScheduleId, date: travelDate }),
          getBusDriverBookings({ scheduleId: selectedScheduleId, date: travelDate }),
        ]);

        if (!active) return;
        setLayout(unwrap(layoutResponse));
        setBookings(unwrapResults(bookingsResponse));
      } catch (error) {
        if (!active) return;
        setDeskError(error?.message || 'Unable to load seat desk');
        setLayout(null);
        setBookings([]);
      } finally {
        if (active) {
          setLoadingDesk(false);
        }
      }
    };

    loadDesk();

    return () => {
      active = false;
    };
  }, [selectedScheduleId, travelDate]);

  useEffect(() => {
    if (!travelDate) {
      return;
    }

    const parsedDate = parseDateKey(travelDate);
    if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
      return;
    }

    setCalendarMonth((current) => {
      if (
        current.getFullYear() === parsedDate.getFullYear() &&
        current.getMonth() === parsedDate.getMonth()
      ) {
        return current;
      }

      return new Date(parsedDate.getFullYear(), parsedDate.getMonth(), 1);
    });
  }, [travelDate]);

  useEffect(() => {
    if (!isCalendarOpen) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (calendarPopoverRef.current && !calendarPopoverRef.current.contains(event.target)) {
        setIsCalendarOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsCalendarOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isCalendarOpen]);

  useEffect(() => {
    if (!isRunDetailsOpen) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (runDetailsPopoverRef.current && !runDetailsPopoverRef.current.contains(event.target)) {
        setIsRunDetailsOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsRunDetailsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isRunDetailsOpen]);

  useEffect(() => {
    if (!isCalendarOpen && !isRunDetailsOpen) {
      return undefined;
    }

    const { body, documentElement } = document;
    const scrollY = window.scrollY || window.pageYOffset || 0;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyPosition = body.style.position;
    const previousBodyTop = body.style.top;
    const previousBodyWidth = body.style.width;
    const previousBodyTouchAction = body.style.touchAction;
    const previousHtmlOverflow = documentElement.style.overflow;
    const previousHtmlOverscrollBehavior = documentElement.style.overscrollBehavior;

    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';
    body.style.touchAction = 'none';
    documentElement.style.overflow = 'hidden';
    documentElement.style.overscrollBehavior = 'none';

    return () => {
      body.style.overflow = previousBodyOverflow;
      body.style.position = previousBodyPosition;
      body.style.top = previousBodyTop;
      body.style.width = previousBodyWidth;
      body.style.touchAction = previousBodyTouchAction;
      documentElement.style.overflow = previousHtmlOverflow;
      documentElement.style.overscrollBehavior = previousHtmlOverscrollBehavior;
      window.scrollTo(0, scrollY);
    };
  }, [isCalendarOpen, isRunDetailsOpen]);

  const selectedFare = useMemo(
    () => selectedSeats.length * Number(busService?.seatPrice || 0),
    [selectedSeats, busService?.seatPrice],
  );
  const totalSeatCount = useMemo(() => countBlueprintSeats(layout?.blueprint), [layout?.blueprint]);
  const occupiedSeatCount = useMemo(
    () => Math.max(0, totalSeatCount - Number(layout?.availableSeats ?? 0)),
    [layout?.availableSeats, totalSeatCount],
  );

  const todaysManualReservations = useMemo(
    () => bookings.filter((item) => item.bookingSource === 'bus_driver').length,
    [bookings],
  );
  const occupiedSeatLabels = useMemo(
    () =>
      bookings
        .flatMap((booking) => (Array.isArray(booking?.seatLabels) ? booking.seatLabels : []))
        .filter(Boolean),
    [bookings],
  );

  const filteredBookings = useMemo(() => {
    const query = bookingSearch.trim().toLowerCase();

    return bookings.filter((booking) => {
      const sourceLabel = booking.bookingSource === 'bus_driver' ? 'manual' : 'user';
      const matchesFilter =
        bookingFilter === 'all'
          ? true
          : bookingFilter === 'manual'
            ? booking.bookingSource === 'bus_driver'
            : booking.status === bookingFilter || sourceLabel === bookingFilter;

      if (!matchesFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      const searchableValues = [
        booking.bookingCode,
        booking.passenger?.name,
        booking.passenger?.phone,
        booking.passenger?.email,
        booking.seatLabels?.join(' '),
        booking.notes,
      ];

      return searchableValues.some((value) => String(value || '').toLowerCase().includes(query));
    });
  }, [bookingFilter, bookingSearch, bookings]);

  const handleToggleSeat = (seat) => {
    setSelectedSeats((current) =>
      current.some((item) => item.id === seat.id)
        ? current.filter((item) => item.id !== seat.id)
        : [...current, { id: seat.id, label: seat.label || seat.id }],
    );
  };

  const openTravelDatePicker = () => setIsCalendarOpen(true);

  const handleTravelDateSelect = (value) => {
    setTravelDate(value);
    setSelectedSeats([]);
    setIsCalendarOpen(false);
  };

  const refreshDesk = async () => {
    if (!selectedScheduleId || !travelDate) {
      return;
    }

    setLoadingDesk(true);
    try {
      const [layoutResponse, bookingsResponse, profileResponse] = await Promise.all([
        getBusDriverSeatLayout({ scheduleId: selectedScheduleId, date: travelDate }),
        getBusDriverBookings({ scheduleId: selectedScheduleId, date: travelDate }),
        getCurrentDriver(),
      ]);

      setLayout(unwrap(layoutResponse));
      setBookings(unwrapResults(bookingsResponse));
      setProfile(unwrap(profileResponse));
      setDeskError('');
    } catch (error) {
      setDeskError(error?.message || 'Unable to refresh desk');
    } finally {
      setLoadingDesk(false);
    }
  };

  const updateScheduleDraftField = (scheduleId, field, value) => {
    setScheduleDrafts((current) =>
      current.map((schedule) =>
        schedule.id === scheduleId ? { ...schedule, [field]: value } : schedule,
      ),
    );
  };

  const toggleScheduleDraftDay = (scheduleId, day) => {
    setScheduleDrafts((current) =>
      current.map((schedule) => {
        if (schedule.id !== scheduleId) return schedule;
        const activeDays = schedule.activeDays.includes(day)
          ? schedule.activeDays.filter((item) => item !== day)
          : [...schedule.activeDays, day];
        return { ...schedule, activeDays };
      }),
    );
  };

  const addScheduleDraft = () => {
    setScheduleDrafts((current) => [...current, createScheduleDraft()]);
  };

  const removeScheduleDraft = (scheduleId) => {
    setScheduleDrafts((current) => {
      if (current.length <= 1) return current;
      return current.filter((schedule) => schedule.id !== scheduleId);
    });
  };

  const handleSaveSchedules = async () => {
    const cleanedSchedules = scheduleDrafts.map((schedule) => ({
      id: String(schedule.id || '').trim() || createLocalScheduleId(),
      label: String(schedule.label || '').trim(),
      departureTime: String(schedule.departureTime || '').trim(),
      arrivalTime: String(schedule.arrivalTime || '').trim(),
      activeDays: Array.isArray(schedule.activeDays)
        ? DAY_OPTIONS.filter((day) => schedule.activeDays.includes(day))
        : [],
      status: ['active', 'paused', 'draft'].includes(schedule.status) ? schedule.status : 'active',
    }));

    if (!cleanedSchedules.length) {
      toast.error('Add at least one schedule');
      return;
    }

    const invalidSchedule = cleanedSchedules.find(
      (schedule) => !schedule.label || !schedule.departureTime || !schedule.arrivalTime,
    );
    if (invalidSchedule) {
      toast.error('Each schedule needs a label, departure time, and arrival time');
      return;
    }

    setIsSavingSchedules(true);
    try {
      await updateBusDriverSchedules({ schedules: cleanedSchedules });
      const profileResponse = await getCurrentDriver();
      setProfile(unwrap(profileResponse));
      toast.success('Schedules updated for driver and admin');
    } catch (error) {
      toast.error(error?.message || 'Unable to save schedules');
    } finally {
      setIsSavingSchedules(false);
    }
  };

  const handleReserve = async () => {
    if (!selectedSeats.length) {
      toast.error('Pick at least one seat');
      return;
    }

    setSubmitting(true);
    try {
      await createBusDriverReservation({
        scheduleId: selectedScheduleId,
        travelDate,
        seatIds: selectedSeats.map((seat) => seat.id),
        passenger: {
          name: passenger.name,
          age: Number(passenger.age || 0),
          gender: passenger.gender,
          phone: passenger.phone,
          email: passenger.email,
        },
        notes: passenger.notes,
      });

      toast.success('Seat reservation created');
      setPassenger({
        name: '',
        age: '',
        gender: 'Male',
        phone: '',
        email: '',
        notes: '',
      });
      setSelectedSeats([]);
      setIsRunDetailsOpen(false);
      setActiveTab('bookings');
      await refreshDesk();
    } catch (error) {
      toast.error(error?.message || 'Unable to reserve seats');
    } finally {
      setSubmitting(false);
    }
  };

  const openLiveRoutePage = useCallback(() => {
    navigate('/taxi/driver/bus-home/live-route', {
      state: {
        profile,
        travelDate,
        selectedScheduleId,
      },
    });
  }, [navigate, profile, selectedScheduleId, travelDate]);

  const renderOverviewTab = () => (
    <div className="space-y-5">
      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Assigned Coach</p>
            <h2 className="mt-2 text-xl font-black text-slate-900">{busService.busName}</h2>
          </div>
          <div className="rounded-2xl bg-slate-50 px-3 py-2 text-right">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Seat Fare</p>
            <p className="mt-1 text-lg font-black text-slate-900">{formatCurrency(busService.seatPrice, busService.fareCurrency)}</p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={openLiveRoutePage}
            className="rounded-2xl bg-slate-50 p-4 text-left transition hover:bg-slate-100 active:scale-[0.99]"
          >
            <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400"><MapPin size={14} /> Route</p>
            <p className="mt-2 text-sm font-black text-slate-900">
              {busService.route?.originCity || 'Origin'} to {busService.route?.destinationCity || 'Destination'}
            </p>
            <p className="mt-1 text-sm text-slate-500">{busService.route?.routeName || 'Standard route'}</p>
          </button>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400"><Phone size={14} /> Driver Contact</p>
            <p className="mt-2 text-sm font-black text-slate-900">{busService.driverName || profile?.name}</p>
            <p className="mt-1 text-sm text-slate-500">{busService.driverPhone || profile?.phone}</p>
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard label="Today's Bookings" value={bookings.length} Icon={Ticket} />
        <StatCard label="Manual Reserves" value={todaysManualReservations} tone="dark" Icon={Users} />
      </div>

      <button
        type="button"
        onClick={openLiveRoutePage}
        className="w-full rounded-[28px] border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-slate-300"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Today's Bus Details</p>
            <h3 className="mt-2 text-xl font-black text-slate-900">{selectedSchedule?.label || busService.busName || 'Assigned run'}</h3>
            <p className="mt-1 text-sm font-medium text-slate-500">
              {formatDisplayDate(travelDate)} {selectedSchedule?.departureTime ? `· ${selectedSchedule.departureTime}` : ''}
            </p>
          </div>
          <div className="rounded-2xl bg-slate-950 px-4 py-3 text-white">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/60">Tap To Open</p>
            <p className="mt-1 text-sm font-black">Live Details</p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Available</p>
            <p className="mt-2 text-xl font-black text-slate-900">{layout?.availableSeats ?? 0}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Occupied</p>
            <p className="mt-2 text-xl font-black text-slate-900">{occupiedSeatCount}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Stops</p>
            <p className="mt-2 text-xl font-black text-slate-900">{routeStops.length}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Selected</p>
            <p className="mt-2 text-xl font-black text-slate-900">{selectedSeats.length}</p>
          </div>
        </div>
      </button>

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Route Stops</p>
          </div>
        
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Pickup Stops</p>
            <p className="mt-2 text-xl font-black text-slate-900">{pickupStops.length}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Drop Stops</p>
            <p className="mt-2 text-xl font-black text-slate-900">{dropStops.length}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Route Name</p>
            <p className="mt-2 text-sm font-black text-slate-900">{busService.route?.routeName || 'Standard route'}</p>
          </div>
        </div>

        {routeStops.length ? (
          <div className="mt-4 space-y-3">
            {routeStops.map((stop, index) => {
              const stopTone = STOP_TYPE_TONE[stop?.stopType] || 'bg-slate-100 text-slate-600 border-slate-200';

              return (
                <article
                  key={stop?.id || `route-stop-${index}`}
                  className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-indigo-600 shadow-sm">
                        <MapPin size={16} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-black text-slate-900">{stop?.city || 'City not set'}</p>
                        <p className="mt-1 text-sm text-slate-600">{stop?.pointName || 'Point not set'}</p>
                        {stop?.landmark ? (
                          <p className="mt-1 text-xs font-medium text-slate-500">{stop.landmark}</p>
                        ) : null}
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${stopTone}`}>
                        {stop?.stopType || 'stop'}
                      </span>
                      <p className="mt-2 text-xs font-semibold text-slate-500">
                        {stop?.arrivalTime || '--:--'} to {stop?.departureTime || '--:--'}
                      </p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm font-medium text-slate-500">
            No stops are configured yet in admin for this bus service.
          </div>
        )}
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Quick Actions</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setActiveTab('desk')}
            className="rounded-2xl bg-slate-950 px-4 py-4 text-left text-white shadow-lg"
          >
            <p className="text-sm font-black">Open Seat Desk</p>
            <p className="mt-1 text-xs text-white/70">Reserve seats, manage availability, and book passengers.</p>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('bookings')}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left"
          >
            <p className="text-sm font-black text-slate-900">View Bookings</p>
            <p className="mt-1 text-xs text-slate-500">Check confirmed passengers for the selected travel date.</p>
          </button>
        </div>
      </section>
    </div>
  );

  const renderScheduleTab = () => (
    <div className="space-y-5">
      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Schedule Control</p>
            <h2 className="mt-2 text-xl font-black text-slate-900">Manage live service scheduling</h2>
            <p className="mt-1 text-sm font-medium text-slate-500">Changes here update the same bus service schedules the admin panel uses.</p>
          </div>
          <button
            type="button"
            onClick={handleSaveSchedules}
            disabled={isSavingSchedules}
            className={`inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-[11px] font-black uppercase tracking-[0.12em] transition ${
              isSavingSchedules ? 'bg-slate-200 text-slate-500' : 'bg-slate-950 text-white shadow-lg'
            }`}
          >
            <Save size={15} />
            {isSavingSchedules ? 'Saving' : 'Save'}
          </button>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Schedule</span>
            <select
              value={selectedScheduleId}
              onChange={(event) => {
                const nextSchedule = schedules.find((item) => item.id === event.target.value);
                setSelectedScheduleId(event.target.value);
                if (nextSchedule) {
                  const nextDate = getNextTravelDate(nextSchedule);
                  setTravelDate(nextDate);
                  const parsedDate = parseDateKey(nextDate);
                  if (!parsedDate) return;
                  setCalendarMonth(new Date(parsedDate.getFullYear(), parsedDate.getMonth(), 1));
                }
                setSelectedSeats([]);
              }}
              className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none"
            >
              {schedules.map((schedule) => (
                <option key={schedule.id} value={schedule.id}>
                  {schedule.label || 'Bus Schedule'} · {schedule.departureTime || '--:--'}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Travel Date</span>
            <button
              type="button"
              onClick={openTravelDatePicker}
              className="flex h-12 w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 text-left text-sm font-bold text-slate-900 transition active:scale-95"
              aria-label="Open travel date calendar"
            >
              <span>{formatDisplayDate(travelDate)}</span>
              <CalendarDays size={18} className="text-slate-500" />
            </button>
          </label>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3 rounded-[24px] border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Departure Slots</p>
            <p className="mt-1 text-sm font-medium text-slate-500">Add, pause, or update the assigned bus schedules from here.</p>
          </div>
          <button
            type="button"
            onClick={addScheduleDraft}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-[11px] font-black uppercase tracking-[0.12em] text-slate-700 transition active:scale-95"
          >
            <Plus size={15} />
            Add Schedule
          </button>
        </div>

        {scheduleDrafts.map((schedule, index) => {
          const active = schedule.id === selectedScheduleId;
          const isPersisted = persistedScheduleIds.has(schedule.id);

          return (
            <div
              key={schedule.id}
              className={`w-full rounded-[28px] border p-4 text-left transition ${
                active ? 'border-slate-900 bg-slate-900 text-white shadow-lg' : 'border-slate-200 bg-white text-slate-900 shadow-sm'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className={`text-[10px] font-bold uppercase tracking-[0.16em] ${active ? 'text-white/55' : 'text-slate-400'}`}>Route Slot</p>
                  <h3 className="mt-2 text-lg font-black">Schedule {index + 1}</h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!isPersisted) return;
                      setSelectedScheduleId(schedule.id);
                      setTravelDate(getNextTravelDate(schedule));
                      setSelectedSeats([]);
                    }}
                    disabled={!isPersisted}
                    className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${
                      active ? 'bg-white text-slate-900' : 'bg-slate-100 text-slate-600'
                    } ${!isPersisted ? 'opacity-50' : ''}`}
                  >
                    {active ? 'Live Now' : isPersisted ? 'Use for Ops' : 'Save First'}
                  </button>
                  {scheduleDrafts.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => removeScheduleDraft(schedule.id)}
                      className={`rounded-2xl border p-2 transition ${
                        active
                          ? 'border-white/15 bg-white/10 text-white hover:bg-white/15'
                          : 'border-rose-200 bg-white text-rose-500 hover:bg-rose-50'
                      }`}
                    >
                      <XCircle size={16} />
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <input
                  value={schedule.label}
                  onChange={(event) => updateScheduleDraftField(schedule.id, 'label', event.target.value)}
                  placeholder="Daily Evening Service"
                  className={`rounded-2xl px-4 py-3 text-sm font-black outline-none ${
                    active ? 'bg-white/10 text-white placeholder:text-white/45' : 'bg-slate-50 text-slate-900'
                  }`}
                />
                <input
                  type="time"
                  value={schedule.departureTime}
                  onChange={(event) => updateScheduleDraftField(schedule.id, 'departureTime', event.target.value)}
                  className={`rounded-2xl px-4 py-3 text-sm font-black outline-none ${
                    active ? 'bg-white/10 text-white' : 'bg-slate-50 text-slate-900'
                  }`}
                />
                <select
                  value={schedule.status}
                  onChange={(event) => updateScheduleDraftField(schedule.id, 'status', event.target.value)}
                  className={`rounded-2xl px-4 py-3 text-sm font-black outline-none ${
                    active ? 'bg-white/10 text-white' : 'bg-slate-50 text-slate-900'
                  }`}
                >
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="draft">Draft</option>
                </select>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className={`rounded-2xl px-3 py-3 ${active ? 'bg-white/10' : 'bg-slate-50'}`}>
                  <p className={`text-[10px] font-bold uppercase tracking-[0.16em] ${active ? 'text-white/55' : 'text-slate-400'}`}>Arrival</p>
                  <input
                    type="time"
                    value={schedule.arrivalTime}
                    onChange={(event) => updateScheduleDraftField(schedule.id, 'arrivalTime', event.target.value)}
                    className={`mt-1 w-full bg-transparent text-sm font-black outline-none ${active ? 'text-white' : 'text-slate-900'}`}
                  />
                </div>
                <div className={`rounded-2xl px-3 py-3 ${active ? 'bg-white/10' : 'bg-slate-50'}`}>
                  <p className={`text-[10px] font-bold uppercase tracking-[0.16em] ${active ? 'text-white/55' : 'text-slate-400'}`}>Active Days</p>
                  <p className="mt-1 text-sm font-black">
                    {Array.isArray(schedule.activeDays) && schedule.activeDays.length ? schedule.activeDays.join(', ') : 'No days selected'}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {DAY_OPTIONS.map((day) => {
                  const enabled = schedule.activeDays.includes(day);
                  return (
                    <button
                      key={`${schedule.id}-${day}`}
                      type="button"
                      onClick={() => toggleScheduleDraftDay(schedule.id, day)}
                      className={`rounded-full border px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] transition ${
                        enabled
                          ? active
                            ? 'border-white bg-white text-slate-900'
                            : 'border-slate-900 bg-slate-900 text-white'
                          : active
                            ? 'border-white/15 bg-white/10 text-white'
                            : 'border-slate-200 bg-white text-slate-500'
                      }`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );

  const renderDeskTab = () => (
    <div className="space-y-5">
      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Seat Reservation Desk</p>
            <h2 className="mt-2 text-xl font-black text-slate-900">Reserve seats and manage live availability</h2>
          </div>
          <button
            type="button"
            onClick={refreshDesk}
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-700"
          >
            <RefreshCcw size={18} />
          </button>
        </div>

        {deskError ? (
          <div className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600">
            {deskError}
          </div>
        ) : null}

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-slate-50 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Available Seats</p>
            <p className="mt-1 text-lg font-black text-slate-900">{layout?.availableSeats ?? 0}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Selected</p>
            <p className="mt-1 text-lg font-black text-slate-900">{selectedSeats.length}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Reserve Fare</p>
            <p className="mt-1 text-lg font-black text-slate-900">{formatCurrency(selectedFare, busService.fareCurrency)}</p>
          </div>
        </div>
      </section>

      <div className="space-y-4">
        {loadingDesk ? (
          <div className="rounded-[24px] border border-slate-200 bg-white p-10 text-center text-sm font-bold text-slate-400 shadow-sm">
            Loading seat desk...
          </div>
        ) : (
          <>
            <SeatDeck
              title="Lower Deck"
              rows={layout?.blueprint?.lowerDeck || []}
              selectedSeatIds={selectedSeats.map((seat) => seat.id)}
              onToggle={handleToggleSeat}
            />
            <SeatDeck
              title="Upper Deck"
              rows={layout?.blueprint?.upperDeck || []}
              selectedSeatIds={selectedSeats.map((seat) => seat.id)}
              onToggle={handleToggleSeat}
            />
          </>
        )}
      </div>

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-black text-slate-900">Passenger Reservation Form</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <input
            value={passenger.name}
            onChange={(event) => setPassenger((current) => ({ ...current, name: event.target.value }))}
            placeholder="Passenger name"
            className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none"
          />
          <input
            value={passenger.phone}
            onChange={(event) => setPassenger((current) => ({ ...current, phone: event.target.value.replace(/\D/g, '').slice(0, 10) }))}
            placeholder="Passenger phone"
            className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none"
          />
          <input
            value={passenger.age}
            onChange={(event) => setPassenger((current) => ({ ...current, age: event.target.value.replace(/\D/g, '').slice(0, 3) }))}
            placeholder="Age"
            className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none"
          />
          <select
            value={passenger.gender}
            onChange={(event) => setPassenger((current) => ({ ...current, gender: event.target.value }))}
            className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none"
          >
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Other">Other</option>
          </select>
          <input
            value={passenger.email}
            onChange={(event) => setPassenger((current) => ({ ...current, email: event.target.value }))}
            placeholder="Passenger email"
            className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none sm:col-span-2"
          />
          <textarea
            value={passenger.notes}
            onChange={(event) => setPassenger((current) => ({ ...current, notes: event.target.value }))}
            placeholder="Notes for this reservation"
            className="min-h-[92px] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-900 outline-none sm:col-span-2"
          />
        </div>

        {selectedSeats.length > 0 ? (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Selected Seats</p>
            <p className="mt-1 text-sm font-black text-slate-900">{selectedSeats.map((seat) => seat.label).join(', ')}</p>
          </div>
        ) : null}

        <button
          type="button"
          disabled={submitting || !selectedSeats.length}
          onClick={handleReserve}
          className={`mt-4 flex h-12 w-full items-center justify-center rounded-2xl text-sm font-black transition ${
            submitting || !selectedSeats.length
              ? 'bg-slate-200 text-slate-500'
              : 'bg-slate-950 text-white shadow-lg'
          }`}
        >
          {submitting ? 'Reserving Seats...' : 'Reserve Seats'}
        </button>
      </section>
    </div>
  );

  const renderBookingsTab = () => (
    <div className="space-y-5">
      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Bookings</p>
            <h2 className="mt-2 text-xl font-black text-slate-900">Passenger list for the selected run</h2>
          </div>
          <div className="rounded-full bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-500">
            {filteredBookings.length} of {bookings.length}
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={openTravelDatePicker}
            className="rounded-2xl bg-slate-50 p-3 text-left transition hover:bg-slate-100 active:scale-95"
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Travel Date</p>
            <p className="mt-1 text-sm font-black text-slate-900">{travelDate || 'NA'}</p>
          </button>
          <div className="rounded-2xl bg-slate-50 p-3 text-left">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Schedule</p>
            <p className="mt-1 text-sm font-black text-slate-900">{selectedSchedule?.label || 'Bus Schedule'}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-3 text-left">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Departure</p>
            <p className="mt-1 text-sm font-black text-slate-900">{selectedSchedule?.departureTime || '--:--'}</p>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
              <Search size={13} />
              Search Passenger
            </span>
            <div className="flex h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4">
              <Search size={16} className="text-slate-400" />
              <input
                value={bookingSearch}
                onChange={(event) => setBookingSearch(event.target.value)}
                placeholder="Name, phone, booking id, seat..."
                className="w-full bg-transparent text-sm font-bold text-slate-900 outline-none placeholder:text-slate-400"
              />
            </div>
          </label>

          <div>
            <span className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
              <Filter size={13} />
              Booking Filter
            </span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { id: 'all', label: 'All' },
                { id: 'manual', label: 'Manual' },
                { id: 'confirmed', label: 'Confirmed' },
                { id: 'pending', label: 'Pending' },
              ].map((option) => {
                const active = bookingFilter === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setBookingFilter(option.id)}
                    className={`rounded-2xl px-3 py-3 text-[11px] font-black uppercase tracking-[0.12em] transition ${
                      active ? 'bg-slate-950 text-white shadow-md' : 'bg-slate-50 text-slate-500'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        {filteredBookings.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm font-bold text-slate-400 shadow-sm">
            No bookings match this search.
          </div>
        ) : (
          filteredBookings.map((booking, index) => (
            <article key={booking.id} className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-300">Passenger {index + 1}</p>
                  <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                    <Ticket size={14} />
                    {booking.bookingCode}
                  </p>
                  <h3 className="mt-2 text-sm font-black text-slate-900">{booking.passenger?.name || 'Passenger'}</h3>
                  <p className="mt-1 text-sm text-slate-500">{booking.seatLabels?.join(', ') || 'No seats'}</p>
                </div>
                <span className="rounded-full bg-slate-50 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-600">
                  {booking.bookingSource === 'bus_driver' ? 'Manual Reserve' : booking.status}
                </span>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-4">
                <div className="rounded-2xl bg-slate-50 px-3 py-3">
                  <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400"><CalendarDays size={13} /> Travel</p>
                  <p className="mt-1 text-sm font-black text-slate-900">{booking.travelDate || 'NA'}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-3 py-3">
                  <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400"><Clock3 size={13} /> Departure</p>
                  <p className="mt-1 text-sm font-black text-slate-900">{booking.routeSnapshot?.departureTime || '--:--'}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-3 py-3">
                  <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400"><UserRound size={13} /> Fare</p>
                  <p className="mt-1 text-sm font-black text-slate-900">{formatCurrency(booking.amount, booking.currency)}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-3 py-3">
                  <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400"><Phone size={13} /> Contact</p>
                  <p className="mt-1 text-sm font-black text-slate-900">{booking.passenger?.phone || 'NA'}</p>
                </div>
              </div>

              <div className="mt-3 rounded-2xl bg-slate-50 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Trip Notes</p>
                <p className="mt-1 text-sm text-slate-600">
                  {booking.notes || booking.passenger?.email || 'No extra notes for this passenger.'}
                </p>
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );

  if (loadingProfile) {
    return (
      <div className="min-h-screen bg-[#f6f7fb] px-5 py-10">
        <div className="mx-auto flex min-h-[60vh] max-w-lg items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f6f7fb] px-4 pb-28 pt-6" style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
      {isRunDetailsOpen ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/45 p-4">
          <div ref={runDetailsPopoverRef} className="mx-auto w-full max-w-4xl rounded-[32px] border border-slate-200 bg-[#f6f7fb] p-4 shadow-[0_30px_80px_rgba(15,23,42,0.28)]">
            <section className="rounded-[28px] bg-[#10213b] p-5 text-white shadow-[0_24px_60px_rgba(15,23,42,0.22)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/55">Today's Bus Run</p>
                  <h2 className="mt-2 text-2xl font-black">{busService?.busName || 'Assigned Bus'}</h2>
                  <p className="mt-1 text-sm text-white/70">
                    {formatDisplayDate(travelDate)} · {selectedSchedule?.label || 'Schedule'} · {selectedSchedule?.departureTime || '--:--'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsRunDetailsOpen(false)}
                  className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-white transition active:scale-95"
                >
                  <XCircle size={18} />
                </button>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-4">
                <div className="rounded-2xl bg-white/8 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/50">Available</p>
                  <p className="mt-2 text-2xl font-black">{layout?.availableSeats ?? 0}</p>
                </div>
                <div className="rounded-2xl bg-white/8 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/50">Occupied</p>
                  <p className="mt-2 text-2xl font-black">{occupiedSeatCount}</p>
                </div>
                <div className="rounded-2xl bg-white/8 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/50">Stops</p>
                  <p className="mt-2 text-2xl font-black">{routeStops.length}</p>
                </div>
                <div className="rounded-2xl bg-white/8 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/50">Selected</p>
                  <p className="mt-2 text-2xl font-black">{selectedSeats.length}</p>
                </div>
              </div>
            </section>

            <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
              <div className="space-y-4">
                <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Run Overview</p>
                      <h3 className="mt-2 text-lg font-black text-slate-900">
                        {busService?.route?.originCity || 'Origin'} to {busService?.route?.destinationCity || 'Destination'}
                      </h3>
                      <p className="mt-1 text-sm text-slate-500">{busService?.route?.routeName || 'Standard route'}</p>
                    </div>
                    <button
                      type="button"
                      onClick={refreshDesk}
                      className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-700"
                    >
                      <RefreshCcw size={18} />
                    </button>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400"><Phone size={14} /> Driver</p>
                      <p className="mt-2 text-sm font-black text-slate-900">{busService?.driverName || profile?.name}</p>
                      <p className="mt-1 text-sm text-slate-500">{busService?.driverPhone || profile?.phone}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400"><Clock3 size={14} /> Trip Window</p>
                      <p className="mt-2 text-sm font-black text-slate-900">{selectedSchedule?.departureTime || '--:--'} to {selectedSchedule?.arrivalTime || '--:--'}</p>
                      <p className="mt-1 text-sm text-slate-500">{selectedSchedule?.status || 'active'}</p>
                    </div>
                  </div>
                </section>

                <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Seat Blueprint</p>
                      <h3 className="mt-2 text-lg font-black text-slate-900">Add or remove seats live</h3>
                    </div>
                    <div className="rounded-2xl bg-slate-50 px-3 py-2 text-right">
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Reserve Fare</p>
                      <p className="mt-1 text-lg font-black text-slate-900">{formatCurrency(selectedFare, busService?.fareCurrency)}</p>
                    </div>
                  </div>

                  <div className="mt-4 space-y-4">
                    <SeatDeck
                      title="Lower Deck"
                      rows={layout?.blueprint?.lowerDeck || []}
                      selectedSeatIds={selectedSeats.map((seat) => seat.id)}
                      onToggle={handleToggleSeat}
                    />
                    <SeatDeck
                      title="Upper Deck"
                      rows={layout?.blueprint?.upperDeck || []}
                      selectedSeatIds={selectedSeats.map((seat) => seat.id)}
                      onToggle={handleToggleSeat}
                    />
                  </div>

                  {selectedSeats.length ? (
                    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Selected Seats</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {selectedSeats.map((seat) => (
                          <button
                            key={`selected-seat-${seat.id}`}
                            type="button"
                            onClick={() => handleToggleSeat(seat)}
                            className="rounded-full bg-slate-950 px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-white"
                          >
                            {seat.label} · Remove
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </section>
              </div>

              <div className="space-y-4">
                <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Stops</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Pickup Stops</p>
                      <p className="mt-2 text-xl font-black text-slate-900">{pickupStops.length}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Drop Stops</p>
                      <p className="mt-2 text-xl font-black text-slate-900">{dropStops.length}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Occupied Labels</p>
                      <p className="mt-2 text-sm font-black text-slate-900">{occupiedSeatLabels.length || 0}</p>
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    {routeStops.length ? routeStops.map((stop, index) => {
                      const stopTone = STOP_TYPE_TONE[stop?.stopType] || 'bg-slate-100 text-slate-600 border-slate-200';

                      return (
                        <article key={stop?.id || `modal-route-stop-${index}`} className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-black text-slate-900">{stop?.city || 'City not set'}</p>
                              <p className="mt-1 text-sm text-slate-600">{stop?.pointName || 'Point not set'}</p>
                            </div>
                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${stopTone}`}>
                              {stop?.stopType || 'stop'}
                            </span>
                          </div>
                          <p className="mt-2 text-xs font-semibold text-slate-500">{stop?.arrivalTime || '--:--'} to {stop?.departureTime || '--:--'}</p>
                        </article>
                      );
                    }) : (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm font-medium text-slate-500">
                        No stops are configured yet in admin for this bus service.
                      </div>
                    )}
                  </div>
                </section>

                <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="text-sm font-black text-slate-900">Reserve Seats Right Here</h3>
                  <div className="mt-4 grid gap-3">
                    <input
                      value={passenger.name}
                      onChange={(event) => setPassenger((current) => ({ ...current, name: event.target.value }))}
                      placeholder="Passenger name"
                      className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none"
                    />
                    <input
                      value={passenger.phone}
                      onChange={(event) => setPassenger((current) => ({ ...current, phone: event.target.value.replace(/\D/g, '').slice(0, 10) }))}
                      placeholder="Passenger phone"
                      className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none"
                    />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input
                        value={passenger.age}
                        onChange={(event) => setPassenger((current) => ({ ...current, age: event.target.value.replace(/\D/g, '').slice(0, 3) }))}
                        placeholder="Age"
                        className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none"
                      />
                      <select
                        value={passenger.gender}
                        onChange={(event) => setPassenger((current) => ({ ...current, gender: event.target.value }))}
                        className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none"
                      >
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <input
                      value={passenger.email}
                      onChange={(event) => setPassenger((current) => ({ ...current, email: event.target.value }))}
                      placeholder="Passenger email"
                      className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none"
                    />
                    <textarea
                      value={passenger.notes}
                      onChange={(event) => setPassenger((current) => ({ ...current, notes: event.target.value }))}
                      placeholder="Notes for this reservation"
                      className="min-h-[92px] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-900 outline-none"
                    />
                  </div>

                  <button
                    type="button"
                    disabled={submitting || !selectedSeats.length}
                    onClick={handleReserve}
                    className={`mt-4 flex h-12 w-full items-center justify-center rounded-2xl text-sm font-black transition ${
                      submitting || !selectedSeats.length
                        ? 'bg-slate-200 text-slate-500'
                        : 'bg-slate-950 text-white shadow-lg'
                    }`}
                  >
                    {submitting ? 'Reserving Seats...' : 'Reserve Selected Seats'}
                  </button>
                </section>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {isCalendarOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4">
          <div
            ref={calendarPopoverRef}
            className="w-full max-w-sm rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_30px_80px_rgba(15,23,42,0.28)]"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Travel Date</p>
                <p className="mt-1 text-sm font-black text-slate-900">{calendarLabel}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsCalendarOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-700 transition active:scale-95"
                aria-label="Close travel date calendar"
              >
                <XCircle size={18} />
              </button>
            </div>

            <div className="mb-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() =>
                  setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))
                }
                className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700"
              >
                <ChevronLeft size={16} />
              </button>
              <p className="text-sm font-black text-slate-900">{calendarLabel}</p>
              <button
                type="button"
                onClick={() =>
                  setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))
                }
                className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="mb-2 grid grid-cols-7 gap-2">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                <div
                  key={day}
                  className="text-center text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400"
                >
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-2">
              {calendarCells.map((cell, index) => {
                if (!cell) {
                  return <div key={`calendar-empty-${index}`} className="h-11 rounded-2xl bg-transparent" />;
                }

                const isSelected = cell.value === travelDate;
                const isToday = cell.value === createToday();

                return (
                  <button
                    key={cell.value}
                    type="button"
                    onClick={() => handleTravelDateSelect(cell.value)}
                    className={`h-11 rounded-2xl text-sm font-black transition ${
                      isSelected
                        ? 'bg-slate-950 text-white shadow-md'
                        : isToday
                          ? 'border border-slate-300 bg-white text-slate-900'
                          : 'bg-slate-50 text-slate-600'
                    }`}
                  >
                    {cell.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
      <div className="mx-auto max-w-lg space-y-5">
        {activeTab === 'overview' ? (
          <section className="rounded-[32px] bg-[#10213b] p-5 text-white shadow-[0_24px_60px_rgba(15,23,42,0.22)]">
            <div className="flex items-start justify-between gap-3">
              <button
                type="button"
                onClick={confirmLogout}
                className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-white transition active:scale-95"
              >
                <ArrowLeft size={18} />
              </button>
              <button
                type="button"
                onClick={confirmLogout}
                className="rounded-full border border-white/15 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-white/80"
              >
                Logout
              </button>
            </div>

            <div className="mt-5 flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-[#2f67f6] text-white">
                <Bus size={26} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/60">Bus Driver Console</p>
                <h1 className="mt-1 text-[28px] font-black leading-none">{profile?.name || 'Bus Driver'}</h1>
                <p className="mt-2 text-sm font-medium text-white/70">
                  {busService?.busName || 'No bus assigned'} {busService?.serviceNumber ? `· ${busService.serviceNumber}` : ''}
                </p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-3">
              <div className="rounded-2xl bg-white/8 p-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/50">Schedules</p>
                <p className="mt-2 text-2xl font-black">{profile?.metrics?.totalSchedules || 0}</p>
              </div>
              <div className="rounded-2xl bg-white/8 p-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/50">Capacity</p>
                <p className="mt-2 text-2xl font-black">{profile?.metrics?.totalCapacity || 0}</p>
              </div>
              <div className="rounded-2xl bg-white/8 p-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/50">Bookings</p>
                <p className="mt-2 text-2xl font-black">{profile?.metrics?.upcomingBookings || 0}</p>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3 rounded-[24px] border border-white/10 bg-white/8 px-4 py-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/50">Selected Travel Date</p>
                <p className="mt-1 truncate text-sm font-black text-white">{formatDisplayDate(travelDate)}</p>
              </div>
              <button
                type="button"
                onClick={openTravelDatePicker}
                className="inline-flex shrink-0 items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-[11px] font-black uppercase tracking-[0.12em] text-white transition active:scale-95"
              >
                <CalendarDays size={15} />
                Calendar
              </button>
            </div>
          </section>
        ) : (
          <div className="flex items-center justify-between px-2">
             <div className="flex items-center gap-3">
               <button
                  type="button"
                  onClick={() => setActiveTab('overview')}
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-900 transition active:scale-95"
                >
                  <ArrowLeft size={16} />
                </button>
                <h2 className="text-lg font-black text-slate-900 capitalize">{activeTab}</h2>
             </div>
              <button
                 type="button"
                 onClick={confirmLogout}
                 className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-rose-500"
               >
                 Logout
              </button>
          </div>
        )}

        {!busService ? (
          <section className="rounded-[28px] border border-slate-200 bg-white p-5 text-center shadow-sm">
            <p className="text-lg font-black text-slate-900">No bus assigned yet</p>
            <p className="mt-2 text-sm text-slate-500">Assign this driver from the admin bus service page using driver name and phone.</p>
          </section>
        ) : (
          <>
            {activeTab === 'overview' ? renderOverviewTab() : null}
            {activeTab === 'schedule' ? renderScheduleTab() : null}
            {activeTab === 'desk' ? renderDeskTab() : null}
            {activeTab === 'bookings' ? renderBookingsTab() : null}
          </>
        )}
      </div>
      <BusDriverBottomNav
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        onLogout={confirmLogout}
      />
    </div>
  );
};

export default BusDriverHome;
