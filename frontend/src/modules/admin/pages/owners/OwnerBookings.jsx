import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Edit2, Loader2, Plus, Save, Search, Trash2 } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { adminService } from '../../services/adminService';
import AdminPageHeader from '../../components/ui/AdminPageHeader';

const MotionDiv = motion.div;

const defaultFormData = {
  owner_id: '',
  booking_reference: '',
  customer_name: '',
  customer_phone: '',
  pickup_location: '',
  dropoff_location: '',
  trip_type: 'city',
  vehicle_type: '',
  trip_date: '',
  fare_amount: '',
  payment_status: 'pending',
  booking_status: 'pending',
  notes: '',
};

const OwnerBookings = () => {
  const [view, setView] = useState('list');
  const [bookings, setBookings] = useState([]);
  const [owners, setOwners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(defaultFormData);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [bookingsRes, ownersRes] = await Promise.all([
        adminService.getOwnerBookings(),
        adminService.getOwners(),
      ]);

      setBookings(bookingsRes?.data?.results || bookingsRes?.results || []);
      setOwners(ownersRes?.data?.results || ownersRes?.results || []);
    } catch (error) {
      console.error('Failed to fetch owner bookings:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setFormData(defaultFormData);
  };

  const filteredBookings = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return bookings;

    return bookings.filter((item) =>
      [
        item.booking_reference,
        item.customer_name,
        item.customer_phone,
        item.owner_id?.name,
        item.pickup_location,
        item.dropoff_location,
        item.booking_status,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [bookings, searchTerm]);

  const handleEdit = (booking) => {
    setEditingId(booking._id || booking.id);
    setFormData({
      owner_id: booking.owner_id?._id || '',
      booking_reference: booking.booking_reference || '',
      customer_name: booking.customer_name || '',
      customer_phone: booking.customer_phone || '',
      pickup_location: booking.pickup_location || '',
      dropoff_location: booking.dropoff_location || '',
      trip_type: booking.trip_type || 'city',
      vehicle_type: booking.vehicle_type || '',
      trip_date: booking.trip_date ? new Date(booking.trip_date).toISOString().slice(0, 16) : '',
      fare_amount: booking.fare_amount ?? '',
      payment_status: booking.payment_status || 'pending',
      booking_status: booking.booking_status || 'pending',
      notes: booking.notes || '',
    });
    setView('form');
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...formData,
        fare_amount: formData.fare_amount === '' ? 0 : Number(formData.fare_amount),
        trip_date: formData.trip_date || null,
      };

      const response = editingId
        ? await adminService.updateOwnerBooking(editingId, payload)
        : await adminService.createOwnerBooking(payload);

      if (response?.success) {
        resetForm();
        setView('list');
        fetchData();
      } else {
        alert(response?.message || 'Failed to save booking');
      }
    } catch (error) {
      console.error('Failed to save owner booking:', error);
      alert(error?.message || 'Failed to save booking');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this booking?')) return;
    try {
      const response = await adminService.deleteOwnerBooking(id);
      if (response?.success) {
        setBookings((prev) => prev.filter((item) => (item._id || item.id) !== id));
      }
    } catch (error) {
      console.error('Failed to delete owner booking:', error);
      alert('Failed to delete booking');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-6 lg:p-8">
        <AdminPageHeader module="Owner Management" page="Bookings" title="Owner Bookings" />

        <div className="mt-6">
          <AnimatePresence mode="wait">
            {view === 'list' ? (
              <MotionDiv key="list" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -18 }} className="space-y-6">
            <div className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-between">
              <div>
                <h1 className="text-2xl font-black tracking-tight text-slate-900">Owner Bookings</h1>
                <p className="mt-1 text-sm font-medium text-slate-500">Manage bookings assigned to owners and fleets.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setView('form');
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-yellow-400 px-5 py-3 text-sm font-bold text-black shadow-sm transition hover:bg-yellow-500"
              >
                <Plus size={16} />
                Add Booking
              </button>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-5 md:flex-row md:items-center md:justify-between">
                <div className="relative w-full max-w-sm">
                  <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Search bookings"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm font-semibold text-slate-700 outline-none transition focus:border-slate-300 focus:bg-white"
                  />
                </div>
              </div>

              <div className="p-6">
                {loading ? (
                  <div className="flex min-h-[280px] items-center justify-center">
                    <Loader2 className="animate-spin text-slate-400" size={30} />
                  </div>
                ) : filteredBookings.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[1100px] border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100 text-left">
                          <th className="px-4 py-3 text-[11px] font-black uppercase tracking-widest text-slate-400">Reference</th>
                          <th className="px-4 py-3 text-[11px] font-black uppercase tracking-widest text-slate-400">Owner</th>
                          <th className="px-4 py-3 text-[11px] font-black uppercase tracking-widest text-slate-400">Customer</th>
                          <th className="px-4 py-3 text-[11px] font-black uppercase tracking-widest text-slate-400">Trip</th>
                          <th className="px-4 py-3 text-[11px] font-black uppercase tracking-widest text-slate-400">Fare</th>
                          <th className="px-4 py-3 text-[11px] font-black uppercase tracking-widest text-slate-400">Payment</th>
                          <th className="px-4 py-3 text-[11px] font-black uppercase tracking-widest text-slate-400">Status</th>
                          <th className="px-4 py-3 text-[11px] font-black uppercase tracking-widest text-slate-400 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredBookings.map((booking) => (
                          <tr key={booking._id || booking.id} className="border-b border-slate-50 last:border-0">
                            <td className="px-4 py-4 text-sm font-bold text-slate-900">{booking.booking_reference}</td>
                            <td className="px-4 py-4 text-sm font-semibold text-slate-600">{booking.owner_id?.name || '-'}</td>
                            <td className="px-4 py-4 text-sm font-semibold text-slate-600">{booking.customer_name}</td>
                            <td className="px-4 py-4 text-sm font-semibold text-slate-600">{booking.trip_type}</td>
                            <td className="px-4 py-4 text-sm font-semibold text-slate-600">{booking.fare_amount}</td>
                            <td className="px-4 py-4 text-sm font-semibold text-slate-600">{booking.payment_status}</td>
                            <td className="px-4 py-4 text-sm font-semibold text-slate-600">{booking.booking_status}</td>
                            <td className="px-4 py-4">
                              <div className="flex items-center justify-end gap-2">
                                <button type="button" onClick={() => handleEdit(booking)} className="rounded-xl border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50">
                                  <Edit2 size={15} />
                                </button>
                                <button type="button" onClick={() => handleDelete(booking._id || booking.id)} className="rounded-xl border border-rose-200 p-2 text-rose-600 transition hover:bg-rose-50">
                                  <Trash2 size={15} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="rounded-[28px] border border-dashed border-slate-200 bg-white px-8 py-16 text-center">
                    <h3 className="text-lg font-black text-slate-900">No Bookings Yet</h3>
                    <p className="mx-auto mt-2 max-w-md text-sm font-medium text-slate-500">Create your first owner booking to start tracking assigned trips.</p>
                  </div>
                )}
              </div>
            </div>
          </MotionDiv>
        ) : (
          <MotionDiv key="form" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} className="space-y-6">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-2xl font-black tracking-tight text-slate-900">{editingId ? 'Update Booking' : 'Create Booking'}</h2>
              <button type="button" onClick={() => setView('list')} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-slate-900">
                <ArrowLeft size={16} />
                Back
              </button>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <form onSubmit={handleSave} className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-[12px] font-bold text-slate-600">Owner</label>
                  <select value={formData.owner_id} onChange={(event) => setFormData((prev) => ({ ...prev, owner_id: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-slate-300">
                    <option value="">Select Owner</option>
                    {owners.map((owner) => (
                      <option key={owner._id || owner.id} value={owner._id || owner.id}>
                        {owner.full_name || owner.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[12px] font-bold text-slate-600">Booking Reference</label>
                  <input type="text" required value={formData.booking_reference} onChange={(event) => setFormData((prev) => ({ ...prev, booking_reference: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-slate-300" />
                </div>
                <div className="space-y-2">
                  <label className="text-[12px] font-bold text-slate-600">Customer Name</label>
                  <input type="text" required value={formData.customer_name} onChange={(event) => setFormData((prev) => ({ ...prev, customer_name: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-slate-300" />
                </div>
                <div className="space-y-2">
                  <label className="text-[12px] font-bold text-slate-600">Customer Phone</label>
                  <input type="text" value={formData.customer_phone} onChange={(event) => setFormData((prev) => ({ ...prev, customer_phone: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-slate-300" />
                </div>
                <div className="space-y-2">
                  <label className="text-[12px] font-bold text-slate-600">Pickup Location</label>
                  <input type="text" value={formData.pickup_location} onChange={(event) => setFormData((prev) => ({ ...prev, pickup_location: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-slate-300" />
                </div>
                <div className="space-y-2">
                  <label className="text-[12px] font-bold text-slate-600">Dropoff Location</label>
                  <input type="text" value={formData.dropoff_location} onChange={(event) => setFormData((prev) => ({ ...prev, dropoff_location: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-slate-300" />
                </div>
                <div className="space-y-2">
                  <label className="text-[12px] font-bold text-slate-600">Trip Type</label>
                  <select value={formData.trip_type} onChange={(event) => setFormData((prev) => ({ ...prev, trip_type: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-slate-300">
                    <option value="city">City</option>
                    <option value="rental">Rental</option>
                    <option value="outstation">Outstation</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[12px] font-bold text-slate-600">Vehicle Type</label>
                  <input type="text" value={formData.vehicle_type} onChange={(event) => setFormData((prev) => ({ ...prev, vehicle_type: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-slate-300" />
                </div>
                <div className="space-y-2">
                  <label className="text-[12px] font-bold text-slate-600">Trip Date</label>
                  <input type="datetime-local" value={formData.trip_date} onChange={(event) => setFormData((prev) => ({ ...prev, trip_date: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-slate-300" />
                </div>
                <div className="space-y-2">
                  <label className="text-[12px] font-bold text-slate-600">Fare Amount</label>
                  <input type="number" value={formData.fare_amount} onChange={(event) => setFormData((prev) => ({ ...prev, fare_amount: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-slate-300" />
                </div>
                <div className="space-y-2">
                  <label className="text-[12px] font-bold text-slate-600">Payment Status</label>
                  <select value={formData.payment_status} onChange={(event) => setFormData((prev) => ({ ...prev, payment_status: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-slate-300">
                    <option value="pending">Pending</option>
                    <option value="paid">Paid</option>
                    <option value="refunded">Refunded</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[12px] font-bold text-slate-600">Booking Status</label>
                  <select value={formData.booking_status} onChange={(event) => setFormData((prev) => ({ ...prev, booking_status: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-slate-300">
                    <option value="pending">Pending</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="ongoing">Ongoing</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-[12px] font-bold text-slate-600">Notes</label>
                  <textarea rows="4" value={formData.notes} onChange={(event) => setFormData((prev) => ({ ...prev, notes: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-slate-300" />
                </div>
                <div className="md:col-span-2 flex justify-end">
                  <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-yellow-400 px-5 py-3 text-sm font-bold text-black transition hover:bg-yellow-500 disabled:cursor-not-allowed disabled:opacity-70">
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    Save
                  </button>
                </div>
              </form>
            </div>
          </MotionDiv>
        )}
      </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default OwnerBookings;
