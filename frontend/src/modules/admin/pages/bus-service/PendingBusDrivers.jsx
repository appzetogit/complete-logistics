import React, { useEffect, useState } from 'react';
import { Bus, CheckCircle2, Loader2, Phone, UserRound, XCircle, Mail, Calendar } from 'lucide-react';
import { adminService } from '../../services/adminService';

const PendingBusDrivers = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [processingId, setProcessingId] = useState('');
  const [selectedDriver, setSelectedDriver] = useState(null);

  const loadItems = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await adminService.getPendingBusDrivers();
      setItems(response?.data?.data?.results || response?.data?.results || []);
    } catch (err) {
      setItems([]);
      setError(err?.response?.data?.message || 'Unable to load pending bus driver requests.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, []);

  const handleApprove = async (driverId) => {
    setProcessingId(String(driverId));
    try {
      await adminService.approvePendingBusDriver(driverId);
      await loadItems();
    } catch (err) {
      window.alert(err?.response?.data?.message || 'Unable to approve bus driver request.');
    } finally {
      setProcessingId('');
    }
  };

  const handleReject = async (driverId) => {
    const rejectionReason = window.prompt('Reason for rejection', '');
    if (rejectionReason === null) {
      return;
    }

    setProcessingId(String(driverId));
    try {
      await adminService.rejectPendingBusDriver(driverId, rejectionReason);
      await loadItems();
    } catch (err) {
      window.alert(err?.response?.data?.message || 'Unable to reject bus driver request.');
    } finally {
      setProcessingId('');
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] p-6 lg:p-8 relative">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-yellow-600">Bus Approval Queue</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Pending Bus Drivers</h1>
            <p className="mt-2 max-w-2xl text-sm font-medium text-slate-500">
              Review bus driver signup requests and approve them into the correct bus service.
            </p>
          </div>
          <div className="rounded-[1.75rem] border border-yellow-200 bg-white px-6 py-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-yellow-600">Waiting</p>
            <p className="mt-2 text-3xl font-black text-slate-900">{items.length}</p>
          </div>
        </div>

        {error && (
          <div className="rounded-[2.5rem] border border-rose-200 bg-rose-50 p-8 text-center">
            <XCircle className="mx-auto h-10 w-10 text-rose-500" />
            <h2 className="mt-4 text-xl font-black text-slate-900">Failed to load requests</h2>
            <p className="mt-2 text-sm font-medium text-rose-600">{error}</p>
            <button
              onClick={loadItems}
              className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-black px-6 py-3 text-sm font-black text-white hover:bg-slate-800 transition"
            >
              Retry
            </button>
          </div>
        )}

        {loading && (
          <div className="flex min-h-[320px] items-center justify-center rounded-[2.5rem] border border-slate-200 bg-white shadow-sm">
            <Loader2 className="h-10 w-10 animate-spin text-yellow-500" />
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <div className="rounded-[2.5rem] border border-dashed border-slate-300 bg-white px-8 py-16 text-center shadow-sm">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-slate-50">
                <Bus className="h-10 w-10 text-slate-400" />
            </div>
            <h2 className="mt-6 text-xl font-black text-slate-900">No pending bus driver requests</h2>
            <p className="mt-2 text-sm font-medium text-slate-500">New bus driver signup requests will appear here.</p>
          </div>
        )}

        {!loading && !error && items.length > 0 && (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => {
              const itemId = item.id || item._id;
              const isProcessing = processingId === String(itemId);
              const submittedDate = item.createdAt ? new Date(item.createdAt).toLocaleDateString() : 'N/A';

              return (
                <div key={itemId} className="flex flex-col rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-yellow-50 text-yellow-600">
                      <Bus size={20} />
                    </div>
                    <span className="rounded-full border border-yellow-200 bg-yellow-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-yellow-600">
                      Pending
                    </span>
                  </div>

                  <h2 className="mt-5 text-lg font-black text-slate-900 truncate" title={item.name}>{item.name || 'Unnamed driver'}</h2>
                  
                  <div className="mt-4 space-y-3 text-sm text-slate-600 flex-1">
                    <div className="flex items-center gap-3">
                      <Phone size={16} className="text-slate-400 shrink-0" />
                      <p className="font-medium text-slate-600 truncate">{item.phone || 'No phone provided'}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Mail size={16} className="text-slate-400 shrink-0" />
                      <p className="font-medium text-slate-600 truncate">{item.email || 'No email provided'}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Calendar size={16} className="text-slate-400 shrink-0" />
                      <p className="font-medium text-slate-600">Submitted: {submittedDate}</p>
                    </div>

                    <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Assigned Service</p>
                      <p className="mt-1 text-sm font-bold text-slate-900 truncate">{item.busServiceName || 'None'}</p>
                    </div>
                  </div>

                  <div className="mt-6 flex flex-col gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedDriver(item)}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-50"
                    >
                      View Details
                    </button>
                    <div className="flex gap-3">
                        <button
                        type="button"
                        onClick={() => handleApprove(itemId)}
                        disabled={isProcessing}
                        className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-black px-4 py-2.5 text-sm font-black text-yellow-400 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                        <CheckCircle2 size={16} />
                        Approve
                        </button>
                        <button
                        type="button"
                        onClick={() => handleReject(itemId)}
                        disabled={isProcessing}
                        className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-slate-100 px-4 py-2.5 text-sm font-black text-slate-600 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
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

      {selectedDriver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[2.5rem] bg-white p-6 shadow-xl sm:p-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between">
              <h3 className="text-2xl font-black text-slate-900">Driver Details</h3>
              <button
                onClick={() => setSelectedDriver(null)}
                className="rounded-full bg-slate-100 p-2 text-slate-500 hover:bg-slate-200 transition"
              >
                <XCircle size={20} />
              </button>
            </div>
            
            <div className="mt-6 space-y-4 text-sm">
               <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Full Name</p>
                  <p className="mt-1 font-bold text-slate-900">{selectedDriver.name || 'N/A'}</p>
               </div>
               <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Phone</p>
                      <p className="mt-1 font-bold text-slate-900">{selectedDriver.phone || 'N/A'}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Email</p>
                      <p className="mt-1 font-bold text-slate-900 truncate" title={selectedDriver.email}>{selectedDriver.email || 'N/A'}</p>
                  </div>
               </div>
               <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Assigned Bus Service</p>
                  <p className="mt-1 font-bold text-slate-900">{selectedDriver.busServiceName || 'None'}</p>
               </div>
               <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Applicant User</p>
                  <div className="mt-1 flex items-center gap-2 font-bold text-slate-900">
                    <UserRound size={16} className="text-slate-400" />
                    <span>{selectedDriver.userName || selectedDriver.name || 'N/A'}</span>
                  </div>
               </div>
               <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Submitted Date</p>
                  <p className="mt-1 font-bold text-slate-900">{selectedDriver.createdAt ? new Date(selectedDriver.createdAt).toLocaleString() : 'N/A'}</p>
               </div>
               <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Status</p>
                  <p className="mt-1 font-bold text-slate-900">Pending Approval</p>
               </div>
            </div>

            <div className="mt-8 flex gap-3">
               <button
                onClick={() => setSelectedDriver(null)}
                className="w-full rounded-2xl bg-black px-6 py-4 text-sm font-black text-white hover:bg-slate-800 transition"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PendingBusDrivers;

