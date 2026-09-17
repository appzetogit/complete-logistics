import React, { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Phone, UserRound, XCircle } from 'lucide-react';
import { adminService } from '../../services/adminService';

const PendingServiceStaff = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState('');

  const loadItems = async () => {
    setLoading(true);
    try {
      const response = await adminService.getPendingServiceStoreStaff();
      setItems(response?.data?.data?.results || response?.data?.results || []);
    } catch (error) {
      setItems([]);
      window.alert(error?.response?.data?.message || 'Unable to load pending service staff requests.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, []);

  const handleApprove = async (staffId) => {
    if (!window.confirm('Are you sure you want to approve this service staff?')) return;
    setProcessingId(String(staffId));
    try {
      await adminService.approvePendingServiceStoreStaff(staffId);
      await loadItems();
    } catch (error) {
      window.alert(error?.response?.data?.message || 'Unable to approve service staff request.');
    } finally {
      setProcessingId('');
    }
  };

  const handleReject = async (staffId) => {
    if (!window.confirm('Are you sure you want to reject this service staff?')) return;
    const rejectionReason = window.prompt('Reason for rejection', '');
    if (rejectionReason === null) {
      return;
    }

    setProcessingId(String(staffId));
    try {
      await adminService.rejectPendingServiceStoreStaff(staffId, rejectionReason);
      await loadItems();
    } catch (error) {
      window.alert(error?.response?.data?.message || 'Unable to reject service staff request.');
    } finally {
      setProcessingId('');
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] p-6 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-rose-500">Rental Approval Queue</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Pending Service Staff</h1>
            <p className="mt-2 max-w-2xl text-sm font-medium text-slate-500">
              Review staff signup requests and attach them to the correct service center workflow.
            </p>
          </div>
          <div className="rounded-[1.75rem] border border-rose-200 bg-white px-6 py-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-rose-500">Waiting</p>
            <p className="mt-2 text-3xl font-black text-slate-900">{items.length}</p>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-[320px] items-center justify-center rounded-[2.5rem] border border-slate-200 bg-white">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-[2.5rem] border border-dashed border-slate-300 bg-white px-8 py-20 text-center">
            <UserRound className="h-10 w-10 text-slate-300" />
            <h2 className="mt-4 text-xl font-black text-slate-900">No pending staff requests</h2>
            <p className="mt-2 text-sm font-medium text-slate-500">New service staff signup requests will appear here.</p>
            <button onClick={loadItems} className="mt-6 flex items-center gap-2 rounded-xl bg-slate-100 px-6 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-200 transition-colors">
              Refresh
            </button>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => {
              const itemId = item.id || item._id;
              const isProcessing = processingId === String(itemId);

              return (
                <div key={itemId} className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-500">
                      <UserRound size={20} />
                    </div>
                    <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-rose-600">
                      Pending
                    </span>
                  </div>

                  <h2 className="mt-5 text-lg font-black text-slate-900">{item.name || 'Unnamed staff'}</h2>
                  <div className="mt-4 space-y-3 text-sm text-slate-600">
                    <div className="flex items-start gap-3">
                      <Phone size={16} className="mt-0.5 text-slate-300" />
                      <div>
                        <p className="font-bold text-slate-900">{item.phone || 'No phone provided'}</p>
                        <p className="font-medium text-slate-500">{item.email || 'No email provided'}</p>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Requested Store & Zone</p>
                      <p className="mt-1 text-sm font-bold text-slate-900">{item.serviceCenterName || item.store?.name || 'No store selected'}</p>
                      <p className="text-xs font-medium text-slate-500">Zone: {item.zone_id?.name || item.zone || 'Unassigned'}</p>
                    </div>
                    <div className="flex items-center gap-3 text-xs font-medium text-slate-400">
                      <span>Requested: {new Date(item.created_at || item.createdAt || Date.now()).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div className="mt-6 flex flex-col gap-3">
                    <button
                      type="button"
                      onClick={() => window.alert('Details view coming soon')}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-200"
                    >
                      View Details
                    </button>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => handleApprove(itemId)}
                        disabled={isProcessing}
                        className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <CheckCircle2 size={16} />
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReject(itemId)}
                        disabled={isProcessing}
                        className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-rose-200 px-4 py-2.5 text-sm font-black text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <XCircle size={16} />
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default PendingServiceStaff;
