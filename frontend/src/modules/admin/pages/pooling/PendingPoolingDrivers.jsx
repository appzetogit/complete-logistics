import React, { useEffect, useMemo, useState } from 'react';
import {
  Car,
  CheckCircle2,
  ChevronRight,
  Eye,
  PencilLine,
  Phone,
  Search,
  Trash2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { adminService } from '../../services/adminService';

const PendingPoolingDrivers = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const loadItems = async (search = '') => {
    setLoading(true);
    try {
      const response = await adminService.getPendingPoolingVehicles(search);
      const payload = response?.data?.data || response?.data || response;
      setItems(Array.isArray(payload) ? payload : []);
    } catch (error) {
      toast.error('Failed to load pending pooling drivers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems(searchTerm);
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      loadItems(searchTerm);
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [searchTerm]);

  const stats = useMemo(() => ({
    pending: items.length,
    withImages: items.filter((item) => Array.isArray(item.images) && item.images.length > 0).length,
  }), [items]);

  const handleApprove = async (id) => {
    if (!window.confirm('Approve this pooling driver request?')) {
      return;
    }

    try {
      await adminService.approvePoolingVehicle(id);
      toast.success('Pooling driver approved');
      loadItems(searchTerm);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Approval failed');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this pending pooling request?')) {
      return;
    }

    try {
      await adminService.deletePoolingVehicle(id);
      toast.success('Pending request deleted');
      loadItems(searchTerm);
    } catch (error) {
      toast.error('Delete failed');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/50 p-4 lg:p-6">
      <div className="mb-4">
        <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400">
          <span>Car Pooling</span>
          <ChevronRight size={12} />
          <span className="text-yellow-600">Pending Pooling Drivers</span>
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-900">Pending Pooling Drivers</h1>
            <p className="text-sm font-medium text-slate-500">Review self-signup pooling drivers before they go live</p>
          </div>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Pending Requests</p>
          <p className="mt-1 text-2xl font-black text-slate-900">{stats.pending}</p>
        </div>
        <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">With Vehicle Images</p>
          <p className="mt-1 text-2xl font-black text-slate-900">{stats.withImages}</p>
        </div>
      </div>

      <div className="mb-4">
        <div className="relative max-w-xl">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Search by driver, phone, model, or plate number..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm font-medium outline-none transition-all focus:border-yellow-400 focus:ring-4 focus:ring-yellow-400/10"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-[28px] border border-slate-100 bg-white shadow-sm">
        {loading ? (
          <div className="p-6 space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={`loading-${i}`} className="h-20 rounded-2xl bg-slate-50 animate-pulse border border-slate-100" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-slate-50">
              <Car size={32} className="text-slate-300" />
            </div>
            <h3 className="text-lg font-black text-slate-900">No pending drivers</h3>
            <p className="mt-1 max-w-sm text-sm font-medium text-slate-500">
              New driver signup requests will appear here for review.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-white">
                <tr className="text-left text-xs font-bold text-slate-500">
                  <th className="px-4 py-3">Driver</th>
                  <th className="px-4 py-3">Vehicle</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((vehicle) => (
                  <tr key={vehicle._id} className="transition hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <div className="space-y-0.5">
                        <p className="text-sm font-black text-slate-900">{vehicle.driverName || 'Pooling Driver'}</p>
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                          <Phone size={10} />
                          {vehicle.driverPhone || 'No phone'}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-slate-100">
                          {vehicle.images?.[0] ? (
                            <img src={vehicle.images[0]} alt={vehicle.name} className="h-full w-full object-cover" />
                          ) : (
                            <Car size={16} className="text-slate-300" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-black text-slate-900">{vehicle.name || 'Unnamed vehicle'}</p>
                          <p className="text-[11px] font-semibold text-slate-500">{vehicle.vehicleModel || '-'}</p>
                          <p className="text-[11px] font-bold text-slate-400">{vehicle.vehicleNumber || '-'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-slate-700">
                        {vehicle.vehicleType || 'sedan'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-amber-700">
                        {vehicle.status || 'pending'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        <button
                          onClick={() => navigate(`/admin/pooling/vehicles/view/${vehicle._id}`)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-600 transition hover:bg-slate-100"
                        >
                          <Eye size={12} />
                          View
                        </button>
                        <button
                          onClick={() => navigate(`/admin/pooling/vehicles/edit/${vehicle._id}`)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-700 transition hover:bg-yellow-50 hover:text-yellow-700 hover:border-yellow-200"
                        >
                          <PencilLine size={12} />
                          Edit
                        </button>
                        <button
                          onClick={() => handleApprove(vehicle._id)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-black px-2 py-1 text-[11px] font-bold text-white transition hover:bg-slate-800"
                        >
                          <CheckCircle2 size={12} />
                          Approve
                        </button>
                        <button
                          onClick={() => handleDelete(vehicle._id)}
                          className="rounded-lg border border-rose-100 p-1.5 text-rose-500 transition hover:bg-rose-50"
                          aria-label={`Delete ${vehicle.name}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default PendingPoolingDrivers;
