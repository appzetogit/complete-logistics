import React, { useEffect, useMemo, useState } from 'react';
import { Bus, CalendarDays, ChevronLeft, IndianRupee, Search, Ticket, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import DriverBottomNav from '../../shared/components/DriverBottomNav';
import {
  cancelOwnerBusBookingSeats,
  getOwnerBusBookingCalendar,
  getOwnerBusBookings,
} from '../services/registrationService';

const statusTone = {
  confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  cancelled: 'bg-rose-50 text-rose-700 border-rose-200',
  failed: 'bg-slate-100 text-slate-600 border-slate-200',
  expired: 'bg-slate-100 text-slate-600 border-slate-200',
};

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

const getTodayValue = () => new Date().toISOString().slice(0, 10);
const getMonthValue = (value = getTodayValue()) => String(value || '').slice(0, 7);

const buildCalendarCells = (month, dayLookup) => {
  if (!/^\d{4}-\d{2}$/.test(String(month || ''))) return [];
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

const OwnerBusBookingsPage = () => {
  const navigate = useNavigate();
  const [filters, setFilters] = useState({
    busServiceId: '',
    travelDate: getTodayValue(),
    status: 'all',
    search: '',
  });
  const [month, setMonth] = useState(getMonthValue());
  const [loading, setLoading] = useState(true);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [bookingData, setBookingData] = useState({
    buses: [],
    bookings: [],
    summary: {},
  });
  const [calendarDays, setCalendarDays] = useState([]);

  const loadBookings = async (activeFilters) => {
    const response = await getOwnerBusBookings(activeFilters);
    return response?.data?.data || response?.data || {};
  };

  const loadCalendar = async (payload) => {
    const response = await getOwnerBusBookingCalendar(payload);
    return response?.data?.data?.days || response?.data?.days || [];
  };

  useEffect(() => {
    let active = true;
    const run = async () => {
      setLoading(true);
      try {
        const data = await loadBookings(filters);
        if (!active) return;
        setBookingData(data);
        if (!filters.busServiceId && Array.isArray(data?.buses) && data.buses[0]) {
          setFilters((current) => ({ ...current, busServiceId: data.buses[0].id }));
        }
      } catch (error) {
        if (!active) return;
        toast.error(error?.response?.data?.message || error?.message || 'Failed to load owner bus bookings');
      } finally {
        if (active) setLoading(false);
      }
    };

    run();
    return () => {
      active = false;
    };
  }, [filters.busServiceId, filters.search, filters.status, filters.travelDate]);

  useEffect(() => {
    if (!filters.busServiceId) return undefined;
    let active = true;
    const run = async () => {
      setCalendarLoading(true);
      try {
        const days = await loadCalendar({
          busServiceId: filters.busServiceId,
          month,
        });
        if (!active) return;
        setCalendarDays(days);
      } catch (error) {
        if (!active) return;
        toast.error(error?.response?.data?.message || error?.message || 'Failed to load owner bus calendar');
      } finally {
        if (active) setCalendarLoading(false);
      }
    };

    run();
    return () => {
      active = false;
    };
  }, [filters.busServiceId, month]);

  const buses = bookingData.buses || [];
  const bookings = bookingData.bookings || [];
  const summary = bookingData.summary || {};
  const selectedBus = useMemo(
    () => buses.find((item) => item.id === filters.busServiceId) || null,
    [buses, filters.busServiceId],
  );
  const dayLookup = useMemo(
    () => new Map((calendarDays || []).map((item) => [item.date, item])),
    [calendarDays],
  );
  const calendarCells = useMemo(() => buildCalendarCells(month, dayLookup), [dayLookup, month]);

  const refreshData = async () => {
    const [data, days] = await Promise.all([
      loadBookings(filters),
      filters.busServiceId ? loadCalendar({ busServiceId: filters.busServiceId, month }) : Promise.resolve([]),
    ]);
    setBookingData(data);
    setCalendarDays(days);
  };

  const handleCancelSeats = async (bookingId, seatIds = []) => {
    setActionLoading(`${bookingId}-${seatIds.join(',') || 'all'}`);
    try {
      const response = await cancelOwnerBusBookingSeats(bookingId, {
        seatIds,
        ownerNote: seatIds.length > 0 ? 'Seat cancelled by owner panel' : 'Booking cancelled by owner panel',
      });
      await refreshData();
      toast.success(response?.data?.message || 'Cancellation processed');
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || 'Failed to cancel booking seats');
    } finally {
      setActionLoading('');
    }
  };

  return (
    <div className="min-h-screen bg-[#f8f9fb] pb-32">
      <div className="mx-auto max-w-6xl px-4 pb-8 pt-6 sm:px-5">
        <div className="mb-5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => navigate('/taxi/owner/bus-service')}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <ChevronLeft size={16} />
            Back
          </button>
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-emerald-700">
            <Ticket size={14} />
            Owner Bus Bookings
          </div>
        </div>

        <section className="rounded-3xl bg-slate-900 p-5 text-white shadow-xl shadow-slate-200 sm:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-300">
                <Bus size={14} />
                Booking Operations
              </div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Manage Owner Bus Bookings</h1>
              <p className="mt-4 max-w-2xl text-sm font-medium leading-relaxed text-slate-400">
                Filter owner bookings by travel date, status, and bus. Cancel full bookings or individual seats and let refunds follow the configured bus cancellation rules.
              </p>
            </div>
            <div className="rounded-[28px] border border-white/10 bg-white/5 px-5 py-4">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Selected Bus</p>
              <p className="mt-2 text-lg font-black text-white">{selectedBus?.busName || 'Choose a bus'}</p>
              <p className="mt-1 text-xs font-semibold text-slate-300">
                {selectedBus?.route?.originCity || 'Origin'} to {selectedBus?.route?.destinationCity || 'Destination'}
              </p>
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
            <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Bus</label>
            <select
              value={filters.busServiceId}
              onChange={(event) => setFilters((current) => ({ ...current, busServiceId: event.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 outline-none"
            >
              <option value="">Select bus</option>
              {buses.map((bus) => (
                <option key={bus.id} value={bus.id}>
                  {bus.busName} | {bus.route?.originCity} to {bus.route?.destinationCity}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
            <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Travel Date</label>
            <input
              type="date"
              value={filters.travelDate}
              onChange={(event) => {
                const nextDate = event.target.value;
                setFilters((current) => ({ ...current, travelDate: nextDate }));
                setMonth(getMonthValue(nextDate));
              }}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 outline-none"
            />
          </div>

          <div className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
            <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Status</label>
            <select
              value={filters.status}
              onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 outline-none"
            >
              <option value="all">All bookings</option>
              <option value="confirmed">Confirmed</option>
              <option value="pending">Pending</option>
              <option value="cancelled">Cancelled</option>
              <option value="failed">Failed</option>
              <option value="expired">Expired</option>
            </select>
          </div>

          <div className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
            <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Search</label>
            <div className="relative">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={filters.search}
                onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
                placeholder="Booking, passenger, phone..."
                className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-12 pr-4 text-sm font-medium outline-none"
              />
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-4 lg:grid-cols-4">
          <div className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                <Ticket size={18} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Bookings</p>
                <p className="mt-1 text-2xl font-black text-slate-900">{summary.totalBookings || 0}</p>
              </div>
            </div>
          </div>
          <div className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                <Users size={18} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Booked Seats</p>
                <p className="mt-1 text-2xl font-black text-slate-900">{summary.totalSeats || 0}</p>
              </div>
            </div>
          </div>
          <div className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                <CalendarDays size={18} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Selected Date</p>
                <p className="mt-1 text-base font-black text-slate-900">{formatDateLabel(filters.travelDate)}</p>
              </div>
            </div>
          </div>
          <div className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-50 text-sky-600">
                <IndianRupee size={18} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Revenue</p>
                <p className="mt-1 text-base font-black text-slate-900">{formatCurrency(summary.totalAmount || 0, selectedBus?.fareCurrency || 'INR')}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-5 rounded-[32px] border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Calendar View</p>
              <h2 className="mt-2 text-2xl font-black text-slate-900">{month}</h2>
            </div>
            <input
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 outline-none"
            />
          </div>
          <div className="mb-3 grid grid-cols-7 gap-2 text-center text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label) => (
              <div key={label}>{label}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {calendarLoading
              ? Array.from({ length: 35 }, (_, index) => (
                  <div key={`loading-${index}`} className="h-24 rounded-[20px] bg-slate-100 animate-pulse" />
                ))
              : calendarCells.map((cell) =>
                  cell.isCurrentMonth ? (
                    <button
                      key={cell.id}
                      type="button"
                      onClick={() => setFilters((current) => ({ ...current, travelDate: cell.date }))}
                      className={`h-24 rounded-[20px] border p-2 text-left transition-all ${
                        filters.travelDate === cell.date
                          ? 'border-slate-900 bg-slate-900 text-white shadow-lg'
                          : 'border-slate-100 bg-slate-50/70 text-slate-900 hover:border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-black">{Number(cell.date.slice(-2))}</span>
                        <span className="text-[10px] font-black uppercase tracking-wide">{cell.metrics?.totalBookings || 0} bk</span>
                      </div>
                      <div className="mt-3 space-y-1 text-[11px] font-bold">
                        <p>{cell.metrics?.confirmedBookings || 0} confirmed</p>
                        <p>{cell.metrics?.totalSeats || 0} seats</p>
                      </div>
                    </button>
                  ) : (
                    <div key={cell.id} className="h-24 rounded-[20px] border border-dashed border-slate-100 bg-white/70" />
                  ),
                )}
          </div>
        </section>

        <section className="mt-5 rounded-[32px] border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Booking Register</p>
            <h2 className="mt-2 text-2xl font-black text-slate-900">Passenger Bookings</h2>
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
              <p className="mt-1 text-xs font-semibold text-slate-500">Try another date, status, or bus.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {bookings.map((booking) => (
                <div key={booking.id} className="rounded-[26px] border border-slate-100 bg-slate-50/60 p-5">
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
                        <div className="rounded-2xl bg-white px-4 py-3">
                          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Passenger</p>
                          <p className="mt-1 text-sm font-black text-slate-900">{booking.passenger?.name || booking.user?.name || 'Unknown'}</p>
                          <p className="mt-1 text-[11px] font-semibold text-slate-500">{booking.passenger?.phone || booking.user?.phone || 'No phone'}</p>
                        </div>
                        <div className="rounded-2xl bg-white px-4 py-3">
                          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Bus</p>
                          <p className="mt-1 text-sm font-black text-slate-900">{booking.busService?.busName || booking.routeSnapshot?.busName || 'Bus'}</p>
                          <p className="mt-1 text-[11px] font-semibold text-slate-500">{booking.busService?.operatorName || booking.routeSnapshot?.operatorName || 'Operator'}</p>
                        </div>
                        <div className="rounded-2xl bg-white px-4 py-3">
                          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Route</p>
                          <p className="mt-1 text-sm font-black text-slate-900">{booking.routeSnapshot?.originCity || 'Origin'} to {booking.routeSnapshot?.destinationCity || 'Destination'}</p>
                          <p className="mt-1 text-[11px] font-semibold text-slate-500">{formatDateLabel(booking.travelDate)}</p>
                        </div>
                        <div className="rounded-2xl bg-white px-4 py-3">
                          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Fare</p>
                          <p className="mt-1 text-sm font-black text-slate-900">{formatCurrency(booking.amount, booking.currency)}</p>
                          <p className="mt-1 text-[11px] font-semibold text-slate-500">Payment {booking.payment?.status || 'pending'}</p>
                        </div>
                      </div>
                    </div>

                    <div className="w-full max-w-sm rounded-[24px] border border-slate-100 bg-white p-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Cancellation Controls</p>
                      <p className="mt-3 text-sm font-black text-slate-900">
                        Seats booked: {booking.seatSummary?.active || 0} active / {booking.seatSummary?.total || 0} total
                      </p>
                      <p className="mt-1 text-[11px] font-semibold text-slate-500">
                        Refund follows bus cancellation rules. Cancel all seats or seat-by-seat.
                      </p>

                      {(booking.activeSeats || []).length > 0 ? (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {booking.activeSeats.map((seat) => (
                            <button
                              key={`${booking.id}-${seat.seatId}`}
                              type="button"
                              disabled={Boolean(actionLoading)}
                              onClick={() => handleCancelSeats(booking.id, [seat.seatId])}
                              className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
                            >
                              Cancel {seat.seatLabel}
                            </button>
                          ))}
                        </div>
                      ) : null}

                      <button
                        type="button"
                        disabled={Boolean(actionLoading) || (booking.activeSeats || []).length === 0}
                        onClick={() => handleCancelSeats(booking.id)}
                        className="mt-4 w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {actionLoading.startsWith(booking.id) ? 'Processing...' : 'Cancel Full Booking'}
                      </button>

                      {(booking.cancelledSeats || []).length > 0 ? (
                        <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Refund Snapshot</p>
                          <div className="mt-2 space-y-1 text-xs font-semibold text-slate-600">
                            {booking.cancelledSeats.map((seat) => (
                              <p key={`${booking.id}-refund-${seat.seatId}`}>
                                {seat.seatLabel}: {formatCurrency(seat.refundAmount, booking.currency)} refunded
                              </p>
                            ))}
                          </div>
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

      <DriverBottomNav />
    </div>
  );
};

export default OwnerBusBookingsPage;
