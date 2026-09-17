import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Search,
  Car,
  Trash2,
  CheckCircle2,
  XCircle,
  ChevronRight,
  Info,
  Eye,
  PencilLine,
  List,
  CalendarDays,
  Phone,
} from 'lucide-react';
import { adminService } from '../../services/adminService';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

const PoolingVehicles = () => {
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const loadVehicles = async () => {
    setLoading(true);
    try {
      const response = await adminService.getPoolingVehicles();
      setVehicles(response.data || []);
    } catch (error) {
      toast.error('Failed to load pooling vehicles');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVehicles();
  }, []);

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this vehicle?')) return;
    try {
      await adminService.deletePoolingVehicle(id);
      toast.success('Vehicle deleted');
      loadVehicles();
    } catch (error) {
      toast.error('Failed to delete vehicle');
    }
  };

  const filteredVehicles = useMemo(
    () =>
      vehicles.filter((vehicle) => {
        const query = searchTerm.trim().toLowerCase();
        if (!query) return true;
        return [vehicle.name, vehicle.vehicleModel, vehicle.vehicleNumber, vehicle.driverName, vehicle.driverPhone, vehicle.color, vehicle.vehicleType]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));
      }),
    [searchTerm, vehicles],
  );

  const activeCount = useMemo(
    () => vehicles.filter((vehicle) => vehicle.status === 'active').length,
    [vehicles],
  );

  const averageCapacity = useMemo(() => {
    if (!vehicles.length) return 0;
    return (vehicles.reduce((acc, curr) => acc + Number(curr.capacity || 0), 0) / vehicles.length).toFixed(1);
  }, [vehicles]);

  const formatDate = (value) => {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'N/A';
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <div className="min-h-screen bg-slate-50/50 p-4 lg:p-6">
      <div className="mb-4">
        <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400">
          <span>Car Pooling</span>
          <ChevronRight size={12} />
          <span className="text-yellow-600">Vehicles</span>
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-900">Pooling Vehicles</h1>
            <p className="text-sm font-medium text-slate-500">Manage dedicated fleet for car pooling services</p>
          </div>
          <button
            onClick={() => navigate('/admin/pooling/vehicles/create')}
            className="inline-flex items-center gap-2 rounded-2xl bg-yellow-400 px-4 py-2 text-[13px] font-bold text-slate-900 shadow-sm transition-all hover:bg-yellow-500 hover:shadow active:scale-95 sm:px-5 sm:py-3 sm:text-sm"
          >
            <Plus size={18} />
            Add New Vehicle
          </button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-[1.5rem] border border-slate-200 bg-white p-2.5 px-3 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
              <Car size={16} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400">Total Cars</p>
              <p className="text-lg font-black text-slate-900">{vehicles.length}</p>
            </div>
          </div>
        </div>
        <div className="rounded-[1.5rem] border border-slate-200 bg-white p-2.5 px-3 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
              <CheckCircle2 size={16} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400">Active</p>
              <p className="text-lg font-black text-slate-900">{activeCount}</p>
            </div>
          </div>
        </div>
        <div className="rounded-[1.5rem] border border-slate-200 bg-white p-2.5 px-3 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
              <Info size={16} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400">Capacity Avg</p>
              <p className="text-lg font-black text-slate-900">{averageCapacity}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Search by vehicle, driver, phone, type, model, color, or plate number..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm font-medium outline-none transition-all focus:border-yellow-400 focus:ring-4 focus:ring-yellow-400/10"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-900 border-t-transparent"></div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-600">
                <List size={18} />
              </div>
              <div>
                <h2 className="text-sm font-black uppercase tracking-wide text-slate-900">Vehicle List</h2>
                <p className="text-xs font-medium text-slate-500">
                  {filteredVehicles.length} vehicle{filteredVehicles.length === 1 ? '' : 's'} shown
                </p>
              </div>
            </div>
          </div>

          {filteredVehicles.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <div className="mb-4 rounded-full bg-slate-50 p-6 text-slate-300">
                <Car size={48} strokeWidth={1} />
              </div>
              <h3 className="text-lg font-black uppercase tracking-tight text-slate-900">No vehicles found</h3>
              <p className="mt-2 max-w-xs text-sm font-medium text-slate-400">
                Try adjusting your search or add a new vehicle to the pooling fleet.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-white">
                  <tr className="text-left text-xs font-bold text-slate-500">
                    <th className="px-3 py-2">Vehicle</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Plate</th>
                    <th className="px-3 py-2">Capacity</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Created</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredVehicles.map((vehicle) => (
                    <tr key={vehicle._id} className="transition hover:bg-slate-50/70">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100">
                            {vehicle.images && vehicle.images.length > 0 ? (
                              <img src={vehicle.images[0]} alt={vehicle.name} className="h-full w-full object-cover" />
                            ) : (
                              <Car size={16} className="text-slate-300" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-slate-900">{vehicle.name}</p>
                            <p className="truncate text-[11px] font-semibold text-slate-500">
                              {vehicle.vehicleModel || 'No model added'}
                            </p>
                            <div className="mt-0.5 flex items-center gap-1.5 text-[10px] font-medium text-slate-400">
                              <CalendarDays size={10} />
                              <span>{vehicle.color || 'No color'}</span>
                            </div>
                            <div className="mt-0.5 flex items-center gap-1.5 text-[10px] font-semibold text-slate-500">
                              <Phone size={10} />
                              <span className="truncate">
                                {vehicle.driverName || 'No driver'}{vehicle.driverPhone ? ` - ${vehicle.driverPhone}` : ''}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-slate-700">
                          {vehicle.vehicleType || 'sedan'}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className="text-sm font-bold text-slate-700">{vehicle.vehicleNumber || 'N/A'}</span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-2 py-1 text-xs font-black text-slate-700">
                          <Info size={12} />
                          {vehicle.capacity || 0} seats
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-wide ${
                            vehicle.status === 'active'
                              ? 'bg-emerald-50 text-emerald-600'
                              : vehicle.status === 'maintenance'
                              ? 'bg-amber-50 text-amber-600'
                              : 'bg-rose-50 text-rose-600'
                          }`}
                        >
                          {vehicle.status === 'active' ? (
                            <CheckCircle2 size={10} />
                          ) : vehicle.status === 'maintenance' ? (
                            <Info size={10} />
                          ) : (
                            <XCircle size={10} />
                          )}
                          {vehicle.status}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className="text-xs font-medium text-slate-500">{formatDate(vehicle.createdAt)}</span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1.5">
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
      )}
    </div>
  );
};

export default PoolingVehicles;
