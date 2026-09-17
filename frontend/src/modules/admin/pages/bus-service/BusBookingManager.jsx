import React, { useEffect, useMemo, useState } from 'react';
import {
  Bus,
  CalendarDays,
  IndianRupee,
  MapPin,
  Search,
  Ticket,
  Users,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { adminService } from '../../services/adminService';
import { getAdminBuses, upsertAdminBus } from '../../services/busService';

const statusTone = {
  confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  cancelled: 'bg-rose-50 text-rose-700 border-rose-200',
  failed: 'bg-slate-100 text-slate-600 border-slate-200',
  expired: 'bg-slate-100 text-slate-600 border-slate-200',
};

const seatTone = {
  available: 'border-slate-200 bg-white text-slate-600 hover:border-yellow-400 hover:text-yellow-700',
  selected: 'border-black bg-black text-yellow-400 shadow-lg',
  blocked: 'border-slate-200 bg-slate-200 text-slate-500 cursor-not-allowed',
  booked: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300',
};

const createEmptyForm = () => ({
  name: '',
  phone: '',
  email: '',
  age: '',
  gender: 'male',
  notes: '',
});

const formatCurrency = (amount = 0, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount || 0));

const formatDateLabel = (value) => {
  if (!value) return 'No date';
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-IN', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
};

const formatMonthLabel = (value) => {
  if (!/^\d{4}-\d{2}$/.test(String(value || ''))) {
    return 'Calendar';
  }

  const [year, month] = String(value).split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });
};

const getTodayValue = () => new Date().toISOString().slice(0, 10);
const getMonthValue = (value = getTodayValue()) => String(value || '').slice(0, 7);

const formatScheduleTime = (schedule = {}) => {
  const departure = schedule?.departureTime || '--:--';
  const arrival = schedule?.arrivalTime || '--:--';
  return `${departure} to ${arrival}`;
};

const buildCalendarCells = (month, dayLookup) => {
  if (!/^\d{4}-\d{2}$/.test(String(month || ''))) {
    return [];
  }

  const [year, monthIndexValue] = month.split('-').map(Number);
  const monthIndex = monthIndexValue - 1;
  const firstDay = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const leadingSlots = firstDay.getDay();
  const cells = [];

  for (let index = 0; index < leadingSlots; index += 1) {
    cells.push({ id: `blank-${index}`, isCurrentMonth: false });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    cells.push({
      id: date,
      date,
      isCurrentMonth: true,
      metrics: dayLookup.get(date) || null,
    });
  }

  return cells;
};

const BusBookingManager = () => {
  const [buses, setBuses] = useState([]);
  const [filters, setFilters] = useState({
    busServiceId: '',
    travelDate: getTodayValue(),
    scheduleId: '',
    status: 'all',
    search: '',
  });
  const [month, setMonth] = useState(getMonthValue());
  const [calendarDays, setCalendarDays] = useState([]);
  const [bookingData, setBookingData] = useState({
    bookings: [],
    seatLayout: [],
    schedules: [],
    summary: {},
  });
  const [loading, setLoading] = useState(true);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedSeatIds, setSelectedSeatIds] = useState([]);
  const [activeSeat, setActiveSeat] = useState(null);
  const [bookingForm, setBookingForm] = useState(createEmptyForm());

  useEffect(() => {
    let active = true;

    const loadBuses = async () => {
      try {
        const catalog = await getAdminBuses();
        if (!active) return;
        setBuses(catalog);
        if (catalog[0]) {
          setFilters((current) => ({
            ...current,
            busServiceId: current.busServiceId || catalog[0].id,
          }));
        }
      } catch (error) {
        if (!active) return;
        toast.error(error?.message || 'Failed to load buses');
      }
    };

    loadBuses();

    return () => {
      active = false;
    };
  }, []);

  const loadBookingView = async (activeFilters) => {
    const response = await adminService.getAdminBusBookings(activeFilters);
    return response?.data?.data || response?.data || {};
  };

  const loadCalendarView = async (payload) => {
    const response = await adminService.getAdminBusBookingCalendar(payload);
    return response?.data?.data?.days || response?.data?.days || [];
  };

  useEffect(() => {
    if (!filters.busServiceId) return undefined;
    let active = true;

    const run = async () => {
      setLoading(true);
      try {
        const data = await loadBookingView(filters);
        if (!active) return;
        setBookingData(data);
      } catch (error) {
        if (!active) return;
        toast.error(error?.response?.data?.message || error?.message || 'Failed to load bus bookings');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    run();

    return () => {
      active = false;
    };
  }, [filters]);

  useEffect(() => {
    if (!filters.busServiceId) return undefined;
    let active = true;

    const run = async () => {
      setCalendarLoading(true);
      try {
        const days = await loadCalendarView({
          busServiceId: filters.busServiceId,
          scheduleId: filters.scheduleId,
          month,
        });
        if (!active) return;
        setCalendarDays(days);
      } catch (error) {
        if (!active) return;
        toast.error(error?.response?.data?.message || error?.message || 'Failed to load booking calendar');
      } finally {
        if (active) {
          setCalendarLoading(false);
        }
      }
    };

    run();

    return () => {
      active = false;
    };
  }, [filters.busServiceId, filters.scheduleId, month]);

  useEffect(() => {
    setSelectedSeatIds([]);
    setActiveSeat(null);
    setBookingForm(createEmptyForm());
  }, [filters.busServiceId, filters.travelDate, filters.scheduleId]);

  const selectedBus = useMemo(
    () => buses.find((item) => item.id === filters.busServiceId) || null,
    [buses, filters.busServiceId],
  );

  const dayLookup = useMemo(
    () => new Map((calendarDays || []).map((item) => [item.date, item])),
    [calendarDays],
  );
  const calendarCells = useMemo(() => buildCalendarCells(month, dayLookup), [dayLookup, month]);

  const bookings = bookingData.bookings || [];
  const schedules = bookingData.schedules || [];
  const seatLayout = bookingData.seatLayout || [];
  const summary = bookingData.summary || {};
  const selectedSeats = seatLayout.filter((seat) => selectedSeatIds.includes(seat.seatId));
  const selectedSeatFare = selectedSeats.reduce(
    (sum, seat) => sum + Number(seat.price || selectedBus?.seatPrice || 0),
    0,
  );
  const selectedSchedule = schedules.find((schedule) => schedule.id === filters.scheduleId) || null;

  const getScheduleMeta = (scheduleId, fallback = {}) => {
    const matchedSchedule =
      schedules.find((schedule) => schedule.id === scheduleId) ||
      (selectedBus?.schedules || []).find((schedule) => schedule.id === scheduleId);

    return {
      label: matchedSchedule?.label || scheduleId || 'Standard',
      time: matchedSchedule ? formatScheduleTime(matchedSchedule) : `${fallback.departureTime || '--:--'} to ${fallback.arrivalTime || '--:--'}`,
    };
  };

  const refreshAll = async () => {
    if (!filters.busServiceId) return;
    const [data, days] = await Promise.all([
      loadBookingView(filters),
      loadCalendarView({
        busServiceId: filters.busServiceId,
        scheduleId: filters.scheduleId,
        month,
      }),
    ]);
    setBookingData(data);
    setCalendarDays(days);
  };

  const handleSeatClick = (seat) => {
    if (seat.liveStatus === 'blocked') {
      setActiveSeat(seat);
      setSelectedSeatIds([]);
      return;
    }

    if (seat.liveStatus === 'booked') {
      setActiveSeat(seat);
      setSelectedSeatIds([]);
      return;
    }

    setActiveSeat(null);
    setSelectedSeatIds((current) =>
      current.includes(seat.seatId)
        ? current.filter((item) => item !== seat.seatId)
        : [...current, seat.seatId],
    );
  };

  const handleUnblockSeat = async (seat) => {
    if (!selectedBus?.id || !seat?.seatId) {
      toast.error('Select a valid blocked seat first');
      return;
    }

    const nextBlueprint = JSON.parse(JSON.stringify(selectedBus.blueprint || { lowerDeck: [], upperDeck: [] }));
    let updated = false;

    ['lowerDeck', 'upperDeck'].forEach((deckKey) => {
      nextBlueprint[deckKey] = (Array.isArray(nextBlueprint[deckKey]) ? nextBlueprint[deckKey] : []).map((row) =>
        (Array.isArray(row) ? row : []).map((cell) => {
          if (cell?.kind === 'seat' && cell.id === seat.seatId) {
            updated = true;
            return {
              ...cell,
              status: 'available',
            };
          }
          return cell;
        }),
      );
    });

    if (!updated) {
      toast.error('Seat could not be matched in this bus layout');
      return;
    }

    setActionLoading(true);
    try {
      const updatedBus = await upsertAdminBus({
        ...selectedBus,
        blueprint: nextBlueprint,
      });

      setBuses((current) => current.map((bus) => (bus.id === updatedBus.id ? updatedBus : bus)));
      await refreshAll();
      setActiveSeat(null);
      toast.success(`Seat ${seat.seatLabel || seat.seatId} is available again`);
    } catch (error) {
      toast.error(error?.message || 'Failed to unblock seat');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateBooking = async () => {
    if (!filters.busServiceId || !filters.travelDate || !filters.scheduleId) {
      toast.error('Select bus, date, and schedule first');
      return;
    }
    if (selectedSeatIds.length === 0) {
      toast.error('Select at least one available seat');
      return;
    }

    setActionLoading(true);
    try {
      await adminService.createAdminBusBooking({
        busServiceId: filters.busServiceId,
        travelDate: filters.travelDate,
        scheduleId: filters.scheduleId,
        seatIds: selectedSeatIds,
        passenger: {
          name: bookingForm.name,
          phone: bookingForm.phone,
          email: bookingForm.email,
          age: bookingForm.age,
          gender: bookingForm.gender,
        },
        notes: bookingForm.notes,
      });
      await refreshAll();
      setSelectedSeatIds([]);
      setBookingForm(createEmptyForm());
      toast.success('Seat booked successfully');
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || 'Failed to book seat');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnbookSeat = async (bookingId, seatId) => {
    setActionLoading(true);
    try {
      await adminService.cancelAdminBusBookingSeats(bookingId, {
        seatIds: seatId ? [seatId] : [],
        adminNote: 'Seat released by admin panel',
      });
      await refreshAll();
      setActiveSeat(null);
      toast.success(seatId ? 'Seat unbooked successfully' : 'Booking cancelled successfully');
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || 'Failed to unbook seat');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="rounded-[1.5rem] bg-white border border-slate-200 p-4 lg:p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-yellow-50 border border-yellow-200 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-yellow-600">
              <Ticket size={14} />
              Bus Booking Control
            </div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Manage Bus Booking Service</h1>
            <p className="mt-2 text-sm font-medium leading-relaxed text-slate-500">
              Pick a bus, click seats to book them with passenger info, and unbook occupied seats directly from the admin panel.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50 px-5 py-4">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Selected Bus</p>
            <p className="mt-1 text-lg font-black text-slate-900">{selectedBus?.busName || 'Choose a bus'}</p>
            <p className="mt-1 text-xs font-bold text-slate-500">
              {selectedBus?.route?.originCity || 'Origin'} to {selectedBus?.route?.destinationCity || 'Destination'}
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-3 xl:grid-cols-5">
        <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm xl:col-span-2">
          <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Bus</label>
          <select
            value={filters.busServiceId}
            onChange={(event) =>
              setFilters((current) => ({ ...current, busServiceId: event.target.value, scheduleId: '' }))
            }
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 outline-none"
          >
            <option value="">Select bus</option>
            {buses.map((bus) => (
              <option key={bus.id} value={bus.id}>
                {bus.busName} | {bus.route?.originCity} to {bus.route?.destinationCity}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm">
          <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Travel Date</label>
          <input
            type="date"
            value={filters.travelDate}
            onChange={(event) => {
              const nextDate = event.target.value;
              setFilters((current) => ({ ...current, travelDate: nextDate }));
              setMonth(getMonthValue(nextDate));
            }}
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 outline-none"
          />
        </div>

            <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm">
          <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Schedule</label>
          <select
            value={filters.scheduleId}
            onChange={(event) => setFilters((current) => ({ ...current, scheduleId: event.target.value }))}
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 outline-none"
          >
            <option value="">Select schedule</option>
            {schedules.map((schedule) => (
              <option key={schedule.id} value={schedule.id}>
                {schedule.label || schedule.id} | {formatDateLabel(filters.travelDate)} | {formatScheduleTime(schedule)}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm">
          <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Status</label>
          <select
            value={filters.status}
            onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 outline-none"
          >
            <option value="all">All bookings</option>
            <option value="confirmed">Confirmed</option>
            <option value="pending">Pending</option>
            <option value="cancelled">Cancelled</option>
            <option value="failed">Failed</option>
            <option value="expired">Expired</option>
          </select>
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-4">
        <div className="rounded-[1.5rem] border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <Ticket size={16} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Bookings</p>
              <p className="mt-1 text-2xl font-black text-slate-900">{summary.totalBookings || 0}</p>
            </div>
          </div>
        </div>
        <div className="rounded-[1.5rem] border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Users size={16} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Booked Seats</p>
              <p className="mt-1 text-2xl font-black text-slate-900">{summary.totalSeats || 0}</p>
            </div>
          </div>
        </div>
        <div className="rounded-[1.5rem] border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <CalendarDays size={16} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Selected Date</p>
              <p className="mt-1 text-base font-black text-slate-900">{formatDateLabel(filters.travelDate)}</p>
            </div>
          </div>
        </div>
        <div className="rounded-[1.5rem] border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
              <IndianRupee size={16} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Revenue</p>
              <p className="mt-1 text-base font-black text-slate-900">
                {formatCurrency(summary.totalAmount || 0, selectedBus?.fareCurrency || 'INR')}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
        <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Calendar View</p>
              <h2 className="mt-2 text-2xl font-black text-slate-900">{formatMonthLabel(month)}</h2>
            </div>
            <input
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 outline-none"
            />
          </div>

          <div className="mb-3 grid grid-cols-7 gap-3 text-center text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label) => (
              <div key={label}>{label}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-3">
            {calendarLoading
              ? Array.from({ length: 35 }, (_, index) => (
                  <div key={`loading-${index}`} className="h-20 rounded-[1.25rem] bg-slate-100 animate-pulse" />
                ))
              : calendarCells.map((cell) =>
                  cell.isCurrentMonth ? (
                    <button
                      key={cell.id}
                      type="button"
                      onClick={() => setFilters((current) => ({ ...current, travelDate: cell.date }))}
                      className={`h-20 rounded-[1.25rem] border p-2 text-left transition-all ${
                        filters.travelDate === cell.date
                          ? 'border-black bg-black text-yellow-400 shadow-lg'
                          : 'border-slate-200 bg-slate-50/70 text-slate-900 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-black">{Number(cell.date.slice(-2))}</span>
                        <span className="text-[10px] font-black uppercase tracking-wide">
                          {cell.metrics?.totalBookings || 0} bk
                        </span>
                      </div>
                      <div className="mt-4 space-y-1 text-[11px] font-bold">
                        <p>{cell.metrics?.confirmedBookings || 0} confirmed</p>
                        <p>{cell.metrics?.pendingBookings || 0} pending</p>
                        <p>{cell.metrics?.totalSeats || 0} seats</p>
                      </div>
                    </button>
                  ) : (
                    <div key={cell.id} className="h-20 rounded-[1.25rem] border border-dashed border-slate-100 bg-white/70" />
                  ),
                )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Seat Snapshot</p>
                <h2 className="mt-2 text-xl font-black text-slate-900">Setwise Occupancy</h2>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  {selectedSchedule
                    ? `${formatDateLabel(filters.travelDate)} | ${selectedSchedule.label || selectedSchedule.id} | ${formatScheduleTime(selectedSchedule)}`
                    : `${formatDateLabel(filters.travelDate)} | Pick a schedule to inspect seats`}
                </p>
              </div>
              <div className="rounded-full bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-500">
                {seatLayout.length} seats
              </div>
            </div>

            {loading ? (
              <div className="grid grid-cols-4 gap-3">
                {Array.from({ length: 16 }, (_, index) => (
                  <div key={`seat-loading-${index}`} className="h-16 rounded-2xl bg-slate-100 animate-pulse" />
                ))}
              </div>
            ) : (!filters.busServiceId || !filters.scheduleId) ? (
              <div className="rounded-[1.5rem] border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center">
                <p className="text-sm font-black text-slate-900">Select a bus and schedule to view seats.</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">Pick a schedule from the filters above.</p>
              </div>
            ) : seatLayout.length === 0 ? (
              <div className="rounded-[1.5rem] border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center">
                <p className="text-sm font-black text-slate-900">No seat map found</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">Select a bus to inspect live occupancy.</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-4 gap-3 sm:grid-cols-5">
                  {seatLayout.map((seat) => {
                    const isSelected = selectedSeatIds.includes(seat.seatId);
                    const toneKey =
                      seat.liveStatus === 'available' && isSelected ? 'selected' : seat.liveStatus;

                    return (
                      <button
                        key={seat.seatId}
                        type="button"
                        onClick={() => handleSeatClick(seat)}
                        disabled={actionLoading}
                        className={`rounded-2xl border p-3 text-left transition-all ${seatTone[toneKey] || seatTone.available}`}
                      >
                        <p className="text-sm font-black">{seat.seatLabel}</p>
                        <div className="mt-2">
                          <span className={`inline-flex rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-wide ${
                            isSelected
                              ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                              : seat.liveStatus === 'booked'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : seat.liveStatus === 'blocked'
                                  ? 'border-slate-300 bg-slate-200 text-slate-600'
                                  : 'border-slate-200 bg-slate-50 text-slate-600'
                          }`}>
                            {isSelected ? 'selected' : seat.liveStatus}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-[10px] font-semibold">
                          {seat.booking?.passengerName || seat.booking?.bookingCode || '--'}
                        </p>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-bold text-slate-500">
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-2">Available</span>
                  <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-2 text-indigo-700">Selected</span>
                  <span className="rounded-full border border-slate-200 bg-slate-200 px-3 py-2">Blocked</span>
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700">Booked</span>
                </div>
              </>
            )}
          </div>

          <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">
              {activeSeat?.liveStatus === 'booked' ? 'Unbook Seat' : activeSeat?.liveStatus === 'blocked' ? 'Unblock Seat' : 'Book Seats'}
            </p>
            {activeSeat?.liveStatus === 'booked' ? (
              <div className="mt-4 space-y-4">
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
                  <p className="text-lg font-black text-slate-900">{activeSeat.seatLabel}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-600">
                    {activeSeat.booking?.passengerName || activeSeat.booking?.bookingCode || 'Booked seat'}
                  </p>
                  <p className="mt-2 text-[11px] font-semibold text-slate-500">
                    Booking {activeSeat.booking?.bookingCode || '--'}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={actionLoading || !activeSeat.booking?.bookingId}
                  onClick={() => handleUnbookSeat(activeSeat.booking?.bookingId, activeSeat.seatId)}
                  className="w-full rounded-2xl bg-rose-600 px-4 py-3 text-sm font-black text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {actionLoading ? 'Unbooking...' : `Unbook ${activeSeat.seatLabel}`}
                </button>
              </div>
            ) : activeSeat?.liveStatus === 'blocked' ? (
              <div className="mt-4 space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <p className="text-lg font-black text-slate-900">{activeSeat.seatLabel}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-600">
                    This seat is blocked in the bus inventory and is currently not sellable.
                  </p>
                  <p className="mt-2 text-[11px] font-semibold text-slate-500">
                    Unblocking it will reopen the seat for this bus service.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => handleUnblockSeat(activeSeat)}
                  className="w-full rounded-2xl bg-black px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {actionLoading ? 'Updating Seat...' : `Unblock ${activeSeat.seatLabel}`}
                </button>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                  <p className="text-sm font-black text-slate-900">
                    Selected Seats: {selectedSeats.length > 0 ? selectedSeats.map((seat) => seat.seatLabel).join(', ') : 'None'}
                  </p>
                  <p className="mt-1 text-[11px] font-semibold text-slate-500">
                    {selectedSeats.length > 0
                      ? `Estimated fare ${formatCurrency(selectedSeatFare, selectedBus?.fareCurrency || 'INR')}`
                      : 'Click available seats to start a manual booking.'}
                  </p>
                </div>

                <div className="grid gap-3">
                  <input
                    value={bookingForm.name}
                    onChange={(event) => setBookingForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Passenger name"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 outline-none"
                  />
                  <input
                    value={bookingForm.phone}
                    onChange={(event) => setBookingForm((current) => ({ ...current, phone: event.target.value }))}
                    placeholder="Passenger phone"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 outline-none"
                  />
                  <input
                    value={bookingForm.email}
                    onChange={(event) => setBookingForm((current) => ({ ...current, email: event.target.value }))}
                    placeholder="Passenger email"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 outline-none"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      value={bookingForm.age}
                      onChange={(event) => setBookingForm((current) => ({ ...current, age: event.target.value }))}
                      placeholder="Age"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 outline-none"
                    />
                    <select
                      value={bookingForm.gender}
                      onChange={(event) => setBookingForm((current) => ({ ...current, gender: event.target.value }))}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 outline-none"
                    >
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <textarea
                    value={bookingForm.notes}
                    onChange={(event) => setBookingForm((current) => ({ ...current, notes: event.target.value }))}
                    placeholder="Admin note"
                    className="min-h-[88px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 outline-none"
                  />
                </div>

                <button
                  type="button"
                  disabled={actionLoading || selectedSeatIds.length === 0}
                  onClick={handleCreateBooking}
                  className="w-full rounded-2xl bg-black px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {actionLoading ? 'Booking...' : `Book ${selectedSeatIds.length || ''} Seat${selectedSeatIds.length === 1 ? '' : 's'}`}
                </button>
              </div>
            )}
          </div>

          <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Date Summary</p>
            <div className="mt-5 space-y-3">
              {[
                ['Confirmed', summary.confirmedBookings || 0, 'text-emerald-700 bg-emerald-50'],
                ['Pending', summary.pendingBookings || 0, 'text-amber-700 bg-amber-50'],
                ['Cancelled', summary.cancelledBookings || 0, 'text-rose-700 bg-rose-50'],
              ].map(([label, value, tone]) => (
                <div key={label} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/70 px-3 py-2.5">
                  <span className="text-sm font-black text-slate-900">{label}</span>
                  <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wide ${tone}`}>
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Booking Register</p>
            <h2 className="mt-2 text-2xl font-black text-slate-900">Passenger Bookings</h2>
          </div>
          <div className="relative w-full max-w-md">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={filters.search}
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
              placeholder="Search booking code, passenger, phone..."
              className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-12 pr-4 text-sm font-medium outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50"
            />
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }, (_, index) => (
              <div key={`row-${index}`} className="h-20 rounded-[24px] bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : bookings.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-4 py-16 text-center">
            <Bus size={36} className="mx-auto text-slate-300" />
            <p className="mt-4 text-sm font-black text-slate-900">No bookings for this view</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">Try another date, schedule, or bus.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {bookings.map((booking) => (
              <div key={booking.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="text-lg font-black text-slate-900">{booking.bookingCode || booking.id}</p>
                      <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wide ${statusTone[booking.status] || statusTone.pending}`}>
                        {booking.status}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-black uppercase tracking-wide text-slate-500">
                        {booking.bookingSource}
                      </span>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Passenger</p>
                        <p className="mt-1 text-sm font-black text-slate-900">
                          {booking.passenger?.name || booking.user?.name || 'Unknown'}
                        </p>
                        <p className="mt-1 text-[11px] font-semibold text-slate-500">
                          {booking.passenger?.phone || booking.user?.phone || 'No phone'}
                        </p>
                      </div>

                      <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Route</p>
                        <p className="mt-1 text-sm font-black text-slate-900">
                          {booking.routeSnapshot?.originCity || 'Origin'} to {booking.routeSnapshot?.destinationCity || 'Destination'}
                        </p>
                        <p className="mt-1 text-[11px] font-semibold text-slate-500">
                          {formatDateLabel(booking.travelDate)}
                        </p>
                      </div>

                      <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Schedule & Seats</p>
                        <p className="mt-1 text-sm font-black text-slate-900">{getScheduleMeta(booking.scheduleId, booking.routeSnapshot).label}</p>
                        <p className="mt-1 text-[11px] font-semibold text-slate-500">
                          {formatDateLabel(booking.travelDate)} | {getScheduleMeta(booking.scheduleId, booking.routeSnapshot).time}
                        </p>
                        <p className="mt-1 text-[11px] font-semibold text-slate-500">
                          {(booking.activeSeats || []).map((seat) => seat.seatLabel).join(', ') || 'No active seats'}
                        </p>
                      </div>

                      <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Fare</p>
                        <p className="mt-1 text-sm font-black text-slate-900">
                          {formatCurrency(booking.amount, booking.currency)}
                        </p>
                        <p className="mt-1 text-[11px] font-semibold text-slate-500">
                          Payment {booking.payment?.status || 'pending'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="w-full max-w-xs rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center gap-2 text-slate-500">
                      <MapPin size={15} />
                      <p className="text-[10px] font-black uppercase tracking-[0.2em]">Booking Snapshot</p>
                    </div>
                    <p className="mt-3 text-sm font-black text-slate-900">
                      {booking.busService?.busName || booking.routeSnapshot?.busName || 'Bus'}
                    </p>
                    <p className="mt-1 text-[11px] font-semibold text-slate-500">
                      {booking.busService?.operatorName || booking.routeSnapshot?.operatorName || 'Operator'}
                    </p>
                    <p className="mt-3 text-[11px] font-semibold text-slate-500">
                      Seats booked: {booking.seatSummary?.active || 0} active / {booking.seatSummary?.total || 0} total
                    </p>
                    {(booking.activeSeats || []).length > 0 ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {booking.activeSeats.map((seat) => (
                          <button
                            key={`${booking.id}-${seat.seatId}`}
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleUnbookSeat(booking.id, seat.seatId)}
                            className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
                          >
                            Unbook {seat.seatLabel}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default BusBookingManager;
