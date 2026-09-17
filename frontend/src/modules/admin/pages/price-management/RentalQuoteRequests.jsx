import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  Clock3,
  IndianRupee,
  Luggage,
  Mail,
  MapPin,
  Phone,
  User2,
  Users,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { adminService } from '../../services/adminService';

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition-all focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100/60';

const statusClasses = {
  pending: 'bg-amber-50 text-amber-700',
  reviewing: 'bg-sky-50 text-sky-700',
  quoted: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-rose-50 text-rose-700',
};

const formatDateTime = (value) => (value ? new Date(value).toLocaleString() : 'Not set');

const normalizeArray = (payload) =>
  payload?.data?.data?.results ||
  payload?.data?.results ||
  payload?.results ||
  [];

const RentalQuoteRequests = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);
      try {
        const response = await adminService.getRentalQuoteRequests();
        if (!mounted) return;
        setItems(normalizeArray(response));
      } catch (error) {
        if (mounted) {
          toast.error(error?.message || 'Could not load rental quote requests.');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const counts = useMemo(
    () => ({
      open: items.filter((item) => ['pending', 'reviewing'].includes(String(item.status || '').toLowerCase())).length,
      quoted: items.filter((item) => String(item.status || '').toLowerCase() === 'quoted').length,
    }),
    [items],
  );

  const updateLocal = (id, patch) => {
    setItems((current) =>
      current.map((item) => (String(item.id || item._id) === String(id) ? { ...item, ...patch } : item)),
    );
  };

  const saveRequest = async (item) => {
    const id = String(item.id || item._id);
    const amount = Number(item.adminQuotedAmount || 0);
    const note = String(item.adminNote || '').trim();

    if (item.status === 'quoted' && amount <= 0) {
      toast.error('Quoted amount must be greater than 0');
      return;
    }
    if (item.status === 'rejected' && !note) {
      toast.error('Please provide a reason in the note when rejecting');
      return;
    }

    setSavingId(id);

    try {
      const updated = await adminService.updateRentalQuoteRequest(id, {
        status: item.status,
        adminQuotedAmount: amount,
        adminNote: note,
      });
      const payload = updated?.data?.data || updated?.data || updated;
      updateLocal(id, payload);
      toast.success(item.status === 'quoted' ? 'Quote shared successfully' : 'Quote request updated');
    } catch (error) {
      toast.error(error?.message || 'Could not update rental quote request.');
    } finally {
      setSavingId('');
    }
  };

  return (
    <div className="min-h-screen bg-[#f6f7fb] p-6 lg:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Rental Quote Requests</h1>
          <p className="mt-1 text-sm text-slate-500">
            Review custom quote requirements, update quote amount, and reply with admin notes.
          </p>
        </div>
        <div className="flex gap-3">
          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Open</p>
            <p className="mt-1 text-2xl font-black text-slate-900">{counts.open}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Quoted</p>
            <p className="mt-1 text-2xl font-black text-slate-900">{counts.quoted}</p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-8 text-sm text-slate-400">
            Loading rental quote requests...
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-8 text-sm text-slate-400">
            No rental quote requests found.
          </div>
        ) : (
          items.map((item) => {
            const id = String(item.id || item._id);
            const status = String(item.status || 'pending').toLowerCase();
            const statusClass = statusClasses[status] || statusClasses.pending;
            const isRejected = status === 'rejected';

            return (
              <div key={id} className="rounded-2xl border-t-[3px] border-t-amber-400 border-x border-b border-x-slate-200 border-b-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-black text-slate-900">{item.vehicleName || 'Rental Vehicle'}</h2>
                      <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusClass}`}>
                        {status}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-slate-500">
                      {item.vehicleCategory || item.vehicleTypeId?.vehicleCategory || 'Vehicle'}
                    </p>
                    <p className="mt-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                      ID: {id}
                    </p>
                  </div>
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-right">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Quoted Amount</p>
                    <p className="text-xl font-black text-amber-900">
                      Rs {Number(item.adminQuotedAmount || 0).toFixed(0)}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 grid-cols-2 md:grid-cols-4 lg:grid-cols-8">
                  <div className="col-span-2 lg:col-span-2 rounded-xl bg-slate-50 p-3 border border-slate-100">
                    <div className="flex items-center gap-1.5 text-slate-500"><User2 size={14} /><span className="text-[10px] font-bold uppercase tracking-wide">Customer</span></div>
                    <p className="mt-1 text-sm font-bold text-slate-900 truncate">{item.userId?.name || item.contactName || 'Unknown user'}</p>
                  </div>
                  <div className="col-span-2 lg:col-span-2 rounded-xl bg-slate-50 p-3 border border-slate-100">
                    <div className="flex items-center gap-1.5 text-slate-500"><Phone size={14} /><span className="text-[10px] font-bold uppercase tracking-wide">Contact</span></div>
                    <p className="mt-1 text-sm font-bold text-slate-900 truncate">{item.userId?.phone || item.contactPhone || 'No phone'}</p>
                    <p className="text-xs font-medium text-slate-500 truncate">{item.userId?.email || item.contactEmail || 'No email'}</p>
                  </div>
                  <div className="col-span-1 lg:col-span-1 rounded-xl bg-slate-50 p-3 border border-slate-100">
                    <div className="flex items-center gap-1.5 text-slate-500"><Clock3 size={14} /><span className="text-[10px] font-bold uppercase tracking-wide">Hours</span></div>
                    <p className="mt-1 text-sm font-bold text-slate-900">{Number(item.requestedHours || 0) > 0 ? `${item.requestedHours}h` : 'N/A'}</p>
                  </div>
                  <div className="col-span-1 lg:col-span-1 rounded-xl bg-slate-50 p-3 border border-slate-100">
                    <div className="flex items-center gap-1.5 text-slate-500"><Users size={14} /><span className="text-[10px] font-bold uppercase tracking-wide">Seats</span></div>
                    <p className="mt-1 text-sm font-bold text-slate-900">{Number(item.seatsNeeded || 0) > 0 ? item.seatsNeeded : 'N/A'}</p>
                  </div>
                  <div className="col-span-2 lg:col-span-2 rounded-xl bg-slate-50 p-3 border border-slate-100">
                    <div className="flex items-center gap-1.5 text-slate-500"><CalendarDays size={14} /><span className="text-[10px] font-bold uppercase tracking-wide">Schedule</span></div>
                    <p className="mt-1 text-[11px] font-bold text-slate-900 truncate">Pick: {formatDateTime(item.pickupDateTime)}</p>
                    <p className="text-[11px] font-bold text-slate-900 truncate">Drop: {formatDateTime(item.returnDateTime)}</p>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 lg:col-span-2 flex flex-col justify-center">
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <div className="flex items-start gap-1.5">
                          <MapPin size={14} className="mt-0.5 shrink-0 text-slate-400" />
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Pickup</p>
                            <p className="text-xs font-semibold text-slate-900">{item.pickupLocation || 'Not shared yet'}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-1.5 mt-3">
                          <MapPin size={14} className="mt-0.5 shrink-0 text-slate-400" />
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Drop</p>
                            <p className="text-xs font-semibold text-slate-900">{item.dropLocation || 'Not shared yet'}</p>
                          </div>
                        </div>
                      </div>
                      <div className="border-t md:border-t-0 md:border-l border-slate-200 pt-3 md:pt-0 md:pl-4">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Special Requirements</p>
                        <p className="mt-1 text-xs font-medium text-slate-600 line-clamp-3">{item.specialRequirements || 'No extra requirement added.'}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={item.status}
                        onChange={(event) => updateLocal(id, { status: event.target.value })}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                      >
                        <option value="pending">Pending</option>
                        <option value="reviewing">Reviewing</option>
                        <option value="quoted">Quoted</option>
                        <option value="rejected">Rejected</option>
                      </select>
                      <div className="relative">
                        <IndianRupee size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="number"
                          min="0"
                          value={item.adminQuotedAmount || ''}
                          onChange={(event) => updateLocal(id, { adminQuotedAmount: event.target.value })}
                          className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                          placeholder="Amount"
                        />
                      </div>
                    </div>
                    <textarea
                      rows="2"
                      value={item.adminNote || ''}
                      onChange={(event) => updateLocal(id, { adminNote: event.target.value })}
                      className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                      placeholder="Add quote note, rejection reason, or review details..."
                    />
                    <button
                      type="button"
                      onClick={() => saveRequest(item)}
                      disabled={savingId === id}
                      className={`w-full rounded-lg px-4 py-2.5 text-sm font-bold transition disabled:opacity-60 ${
                        isRejected 
                          ? 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
                          : 'bg-amber-400 text-slate-900 hover:bg-amber-500'
                      }`}
                    >
                      {savingId === id ? 'Saving...' : (isRejected ? 'Reject Request' : 'Save Quote')}
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default RentalQuoteRequests;
