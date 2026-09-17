import React, { useEffect, useState, useMemo } from 'react';
import {
  CalendarDays,
  Search,
  ChevronRight,
  User,
  MapPin,
  Clock,
  IndianRupee,
  CheckCircle2,
  XCircle,
  Car,
  Eye,
  RefreshCcw,
  Filter
} from 'lucide-react';
import { adminService } from '../../services/adminService';
import toast from 'react-hot-toast';

const PoolingBookings = () => {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadBookings = async (showToast = false) => {
    if (showToast) setIsRefreshing(true);
    else setLoading(true);
    
    try {
      const response = await adminService.getPoolingBookings();
      setBookings(response.data || []);
      if (showToast) toast.success('Bookings refreshed');
    } catch (error) {
      toast.error('Failed to load pooling bookings');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadBookings();
  }, []);

  const handleStatusChange = async (id, status) => {
    if (!window.confirm(`Are you sure you want to mark this booking as ${status}?`)) return;
    try {
      await adminService.updatePoolingBookingStatus(id, status);
      toast.success(`Booking ${status} successfully`);
      loadBookings();
    } catch (error) {
      toast.error('Failed to update booking status');
    }
  };

  const filteredBookings = useMemo(() => {
    return bookings.filter(b => {
      const query = searchTerm.toLowerCase().trim();
      const matchSearch = 
        !query ||
        b.bookingId?.toLowerCase().includes(query) ||
        b._id?.toLowerCase().includes(query) ||
        b.user?.name?.toLowerCase().includes(query) ||
        b.user?.phone?.toLowerCase().includes(query) ||
        b.route?.routeName?.toLowerCase().includes(query) ||
        b.bookingStatus?.toLowerCase().includes(query);
      
      const matchStatus = statusFilter === 'all' || b.bookingStatus === statusFilter;
      const matchPayment = paymentFilter === 'all' || b.paymentStatus === paymentFilter;

      return matchSearch && matchStatus && matchPayment;
    });
  }, [bookings, searchTerm, statusFilter, paymentFilter]);

  const getStatusStyle = (status) => {
    switch (status) {
      case 'confirmed': return 'bg-emerald-50 text-emerald-600 border-emerald-100';
      case 'completed': return 'bg-sky-50 text-sky-600 border-sky-100';
      case 'cancelled': return 'bg-rose-50 text-rose-600 border-rose-100';
      case 'pending': return 'bg-amber-50 text-amber-600 border-amber-100';
      default: return 'bg-slate-50 text-slate-600 border-slate-100';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/50 p-2 lg:p-4">
      {/* Header */}
      <div className="mb-4">
        <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
          <span>Operations</span>
          <ChevronRight size={10} />
          <span>Car Pooling</span>
          <ChevronRight size={10} />
          <span className="text-yellow-600">Bookings</span>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-black text-slate-900">Pooling Bookings</h1>
            <p className="text-xs font-medium text-slate-500">Monitor and manage all pooled ride reservations</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => loadBookings(true)}
              disabled={isRefreshing || loading}
              className="inline-flex items-center gap-1.5 rounded-xl bg-yellow-400 px-3 py-1.5 text-xs font-bold text-slate-900 shadow-sm transition hover:bg-yellow-500 disabled:opacity-70"
            >
              <RefreshCcw size={14} className={isRefreshing ? "animate-spin" : ""} />
              Refresh Data
            </button>
          </div>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          <input
            type="text"
            placeholder="Search by ID, User Name, Phone, or Route..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs font-medium outline-none transition-all focus:border-yellow-400 focus:ring-4 focus:ring-yellow-400/10"
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex items-center">
            <Filter className="absolute left-2.5 text-slate-400" size={12} />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="appearance-none rounded-xl border border-slate-200 bg-white py-1.5 pl-7 pr-6 text-xs font-bold text-slate-700 outline-none transition focus:border-yellow-400 focus:ring-4 focus:ring-yellow-400/10"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            className="appearance-none rounded-xl border border-slate-200 bg-white py-1.5 px-3 pr-6 text-xs font-bold text-slate-700 outline-none transition focus:border-yellow-400 focus:ring-4 focus:ring-yellow-400/10"
          >
            <option value="all">All Payments</option>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
            <option value="refunded">Refunded</option>
          </select>
        </div>
      </div>

      {/* Bookings Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50">
              <tr className="text-left">
                <th className="px-3 py-2 !normal-case !tracking-normal !text-xs !font-bold">Booking ID</th>
                <th className="px-3 py-2 !normal-case !tracking-normal !text-xs !font-bold">Customer</th>
                <th className="px-3 py-2 !normal-case !tracking-normal !text-xs !font-bold">Route & Journey</th>
                <th className="px-3 py-2 !normal-case !tracking-normal !text-xs !font-bold">Date & Details</th>
                <th className="px-3 py-2 !normal-case !tracking-normal !text-xs !font-bold">Fare & Payment</th>
                <th className="px-3 py-2 !normal-case !tracking-normal !text-xs !font-bold">Status</th>
                <th className="px-3 py-2 text-right !normal-case !tracking-normal !text-xs !font-bold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {loading ? (
                <tr>
                  <td colSpan="7" className="px-4 py-12 text-center">
                    <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-slate-900 border-t-transparent"></div>
                  </td>
                </tr>
              ) : filteredBookings.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-4 py-20 text-center">
                    <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-slate-50 text-slate-300">
                      <CalendarDays size={32} strokeWidth={1.5} />
                    </div>
                    <p className="text-lg font-black text-slate-900">No pooling bookings found</p>
                    <p className="mt-1 text-sm font-medium text-slate-500">
                      {searchTerm || statusFilter !== 'all' || paymentFilter !== 'all' 
                        ? 'Try adjusting your filters.' 
                        : 'Bookings will appear here after customers reserve pooling seats.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredBookings.map((booking) => (
                  <tr key={booking._id} className="group transition hover:bg-slate-50/70">
                    <td className="px-3 py-2">
                      <span className="font-black text-slate-900">
                        #{booking.bookingId || booking._id.slice(-8)}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-100 text-[10px] font-black text-slate-700">
                          {booking.user?.name?.charAt(0)?.toUpperCase() || 'U'}
                        </div>
                        <div>
                          <p className="font-black text-slate-900">{booking.user?.name || 'Unknown'}</p>
                          <p className="text-[10px] font-bold text-slate-500">{booking.user?.phone || 'No phone'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-0.5">
                        <p className="font-bold text-slate-900">{booking.route?.routeName || 'N/A'}</p>
                        <div className="flex items-center gap-1 text-[9px] font-semibold text-slate-500">
                          <MapPin size={8} className="text-emerald-500" />
                          <span className="truncate max-w-[70px]">{booking.pickupPoint?.name || 'Origin'}</span>
                          <ChevronRight size={8} className="text-slate-300" />
                          <MapPin size={8} className="text-rose-500" />
                          <span className="truncate max-w-[70px]">{booking.dropPoint?.name || 'Dest'}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-0.5">
                        <p className="font-bold text-slate-700">
                          {new Date(booking.travelDate).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                        </p>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-0.5 text-[9px] font-bold text-slate-500">
                            <Clock size={8} />
                            <span>{booking.scheduleId || 'Time TBD'}</span>
                          </div>
                          <div className="flex items-center gap-0.5 text-[9px] font-bold text-slate-500">
                            <User size={8} />
                            <span>{booking.seatsBooked} Seats</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-0.5 font-black text-slate-900">
                          <IndianRupee size={10} className="text-slate-400" />
                          <span>{booking.fare}</span>
                        </div>
                        <span className={`inline-flex w-fit rounded px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide ${
                          booking.paymentStatus === 'paid' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
                        }`}>
                          {booking.paymentStatus}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${getStatusStyle(booking.bookingStatus)}`}>
                        {booking.bookingStatus}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button 
                          className="inline-flex items-center gap-1 rounded bg-slate-50 border border-slate-200 px-1.5 py-1 text-[10px] font-bold text-slate-600 transition hover:bg-slate-100"
                          title="View Details"
                        >
                          <Eye size={10} /> View
                        </button>
                        
                        {booking.bookingStatus === 'confirmed' && (
                          <button 
                            className="inline-flex items-center gap-1 rounded bg-yellow-50 border border-yellow-200 px-1.5 py-1 text-[10px] font-bold text-yellow-700 transition hover:bg-yellow-100"
                            title="Assign Vehicle/Driver"
                          >
                            <Car size={10} /> Assign
                          </button>
                        )}
                        
                        {['pending', 'confirmed'].includes(booking.bookingStatus) && (
                          <button 
                            onClick={() => handleStatusChange(booking._id, 'cancelled')}
                            className="rounded border border-rose-100 bg-rose-50 p-1 text-rose-500 transition hover:bg-rose-100"
                            title="Cancel Booking"
                          >
                            <XCircle size={12} />
                          </button>
                        )}
                        
                        {booking.bookingStatus === 'confirmed' && (
                          <button 
                            onClick={() => handleStatusChange(booking._id, 'completed')}
                            className="rounded border border-emerald-100 bg-emerald-50 p-1 text-emerald-600 transition hover:bg-emerald-100"
                            title="Complete Booking"
                          >
                            <CheckCircle2 size={12} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PoolingBookings;
