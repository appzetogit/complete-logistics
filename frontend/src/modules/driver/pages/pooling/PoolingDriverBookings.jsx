import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, MapPin, Ticket, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getPoolingDriverBookings } from '../../services/registrationService';

const unwrap = (response) => response?.data?.data || response?.data || response;

const formatDate = (value) => {
  if (!value) {
    return 'N/A';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'N/A';
  }

  return parsed.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const PoolingDriverBookings = () => {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const loadBookings = async () => {
      try {
        const response = await getPoolingDriverBookings();
        if (active) {
          setBookings(Array.isArray(unwrap(response)) ? unwrap(response) : []);
        }
      } catch (err) {
        if (active) {
          setError(err?.message || 'Unable to load pooling bookings');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadBookings();

    return () => {
      active = false;
    };
  }, []);

  const stats = useMemo(() => ({
    total: bookings.length,
    confirmed: bookings.filter((item) => item.bookingStatus === 'confirmed').length,
    completed: bookings.filter((item) => item.bookingStatus === 'completed').length,
  }), [bookings]);

  return (
    <div className="min-h-screen bg-[#F5F8FC] px-5 py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-teal-600">Pooling Console</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Bookings</h1>
          </div>
          <div className="inline-flex rounded-2xl bg-white p-1 shadow-sm">
            <Link to="/taxi/driver/pooling" className="rounded-xl px-4 py-2 text-sm font-black text-slate-500">
              Overview
            </Link>
            <Link to="/taxi/driver/pooling/bookings" className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-black text-white">
              Bookings
            </Link>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Total</p>
            <p className="mt-3 text-3xl font-black text-slate-900">{stats.total}</p>
          </div>
          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Confirmed</p>
            <p className="mt-3 text-3xl font-black text-emerald-600">{stats.confirmed}</p>
          </div>
          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Completed</p>
            <p className="mt-3 text-3xl font-black text-sky-600">{stats.completed}</p>
          </div>
        </div>

        <div className="rounded-[32px] bg-white p-6 shadow-sm">
          {error ? (
            <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600">
              {error}
            </div>
          ) : null}

          {loading ? (
            <div className="py-16 text-center text-sm font-bold text-slate-400">Loading bookings...</div>
          ) : bookings.length === 0 ? (
            <div className="py-16 text-center text-sm font-bold text-slate-400">No bookings assigned yet.</div>
          ) : (
            <div className="space-y-4">
              {bookings.map((booking) => (
                <div key={booking.id} className="rounded-3xl border border-slate-100 bg-slate-50 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-slate-900">{booking.route?.routeName || 'Pooling Route'}</p>
                      <p className="mt-1 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                        #{booking.bookingId || booking.id}
                      </p>
                    </div>
                    <span className="rounded-full bg-slate-900 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white">
                      {booking.bookingStatus || 'confirmed'}
                    </span>
                  </div>

                  <div className="mt-5 grid gap-4 md:grid-cols-4">
                    <div>
                      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                        <MapPin size={12} />
                        Trip
                      </div>
                      <p className="mt-2 text-sm font-bold text-slate-700">
                        {booking.pickupLabel || booking.route?.originLabel || 'Pickup'} to {booking.dropLabel || booking.route?.destinationLabel || 'Drop'}
                      </p>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                        <Users size={12} />
                        Seats
                      </div>
                      <p className="mt-2 text-sm font-bold text-slate-700">{booking.seatsBooked || 0} booked</p>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                        <CalendarDays size={12} />
                        Travel
                      </div>
                      <p className="mt-2 text-sm font-bold text-slate-700">{formatDate(booking.travelDate)}</p>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                        <Ticket size={12} />
                        Fare
                      </div>
                      <p className="mt-2 text-sm font-bold text-slate-700">
                        {booking.currency || 'INR'} {Number(booking.fare || 0).toLocaleString('en-IN')}
                      </p>
                    </div>
                  </div>

                  {booking.user ? (
                    <div className="mt-5 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-600">
                      Passenger: <span className="font-black text-slate-900">{booking.user.name || 'Unknown'}</span>
                      {booking.user.phone ? ` • ${booking.user.phone}` : ''}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PoolingDriverBookings;
