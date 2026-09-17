import React, { useEffect, useMemo, useState } from 'react';
import { Car, Percent, Plus, Receipt, RefreshCcw, Save, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { adminService } from '../../services/adminService';

const inputClass =
  'w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 shadow-sm outline-none transition focus:border-yellow-400 focus:ring-4 focus:ring-yellow-400/10';

const clampPercentage = (value) => Math.min(100, Math.max(0, Number(value || 0)));

const PoolingCommissionManager = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');
  const [search, setSearch] = useState('');
  const [vehicles, setVehicles] = useState([]);
  const [drafts, setDrafts] = useState({});

  const loadVehicles = async () => {
    setLoading(true);
    try {
      const response = await adminService.getPoolingVehicles();
      const results = response?.data || [];
      setVehicles(results);
      setDrafts(
        results.reduce((accumulator, vehicle) => {
          accumulator[vehicle._id] = {
            adminCommissionPercentage: String(vehicle.adminCommissionPercentage ?? '0'),
            ownerCommissionPercentage: String(vehicle.ownerCommissionPercentage ?? '0'),
            serviceTaxPercentage: String(vehicle.serviceTaxPercentage ?? '0'),
          };
          return accumulator;
        }, {}),
      );
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to load pooling vehicles');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVehicles();
  }, []);

  const filteredVehicles = useMemo(() => {
    const query = String(search || '').trim().toLowerCase();
    if (!query) {
      return vehicles;
    }

    return vehicles.filter((vehicle) =>
      [vehicle.name, vehicle.vehicleModel, vehicle.vehicleNumber, vehicle.color, vehicle.vehicleType, vehicle.status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [search, vehicles]);

  const updateDraft = (vehicleId, field, value) => {
    setDrafts((current) => ({
      ...current,
      [vehicleId]: {
        ...(current[vehicleId] || {}),
        [field]: value,
      },
    }));
  };

  const handleSave = async (vehicle) => {
    const draft = drafts[vehicle._id] || {};
    setSavingId(vehicle._id);

    try {
      const payload = {
        adminCommissionPercentage: clampPercentage(draft.adminCommissionPercentage),
        ownerCommissionPercentage: clampPercentage(draft.ownerCommissionPercentage),
        serviceTaxPercentage: clampPercentage(draft.serviceTaxPercentage),
      };

      const response = await adminService.updatePoolingVehicle(vehicle._id, payload);
      const updated = response?.data;

      setVehicles((current) => current.map((item) => (item._id === updated?._id ? updated : item)));
      setDrafts((current) => ({
        ...current,
        [vehicle._id]: {
          adminCommissionPercentage: String(updated?.adminCommissionPercentage ?? payload.adminCommissionPercentage),
          ownerCommissionPercentage: String(updated?.ownerCommissionPercentage ?? payload.ownerCommissionPercentage),
          serviceTaxPercentage: String(updated?.serviceTaxPercentage ?? payload.serviceTaxPercentage),
        },
      }));

      toast.success(`Updated ${updated?.name || vehicle.name || 'vehicle'} pricing settings`);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to save pooling commission settings');
    } finally {
      setSavingId('');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/50 p-4 lg:p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-yellow-200 bg-yellow-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-yellow-600">
              <Percent size={14} />
              Pooling Commission
            </div>
            <h1 className="mt-3 text-3xl font-black text-slate-900">Car Pooling Commission & Service Tax</h1>
            <p className="mt-1 text-sm font-medium text-slate-500">
              Manage driver commission, owner commission, and service tax percentages for every pooling vehicle.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative min-w-[280px]">
              <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className={`${inputClass} pl-11`}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search vehicle, model, number, or type"
              />
            </div>
            <button
              type="button"
              onClick={() => navigate('/admin/pooling/vehicles')}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-yellow-50 hover:text-yellow-700 hover:border-yellow-200"
            >
              <Car size={16} />
              Open Pooling Fleet
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-[32px] border border-slate-100 bg-white shadow-sm">
          <div className="grid gap-4 border-b border-slate-100 bg-slate-100 px-4 py-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.6fr)_minmax(0,2fr)]">
            <div>
              <p className="text-sm font-black text-slate-700">Vehicle</p>
            </div>
            <div>
              <p className="text-sm font-black text-slate-700">Driver / Status</p>
            </div>
            <div>
              <p className="text-sm font-black text-slate-700">Owner</p>
            </div>
            <div>
              <p className="text-sm font-black text-slate-700">Capacity</p>
            </div>
            <div className="grid grid-cols-4 gap-3 text-sm font-black text-slate-700">
              <p>Driver %</p>
              <p>Owner %</p>
              <p>Tax %</p>
              <p className="text-right lg:text-left">Action</p>
            </div>
          </div>

          {loading ? (
            <div className="bg-white px-6 py-10 text-center text-sm font-bold text-slate-400">Loading pooling commission settings...</div>
          ) : filteredVehicles.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-12 text-center bg-white">
              <div className="mb-4 rounded-full bg-slate-50 p-6 text-slate-300">
                <Car size={48} strokeWidth={1} />
              </div>
              <h3 className="text-lg font-black uppercase tracking-tight text-slate-900">No pooling vehicles found</h3>
              <p className="mt-2 max-w-sm text-sm font-medium text-slate-400">
                Add vehicles first to configure commission.
              </p>
              <button
                type="button"
                onClick={() => navigate('/admin/pooling/vehicles')}
                className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-yellow-400 px-6 py-3 text-sm font-bold text-slate-900 transition hover:bg-yellow-500 hover:shadow-md active:scale-95"
              >
                <Plus size={18} />
                Add Pooling Vehicle
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 bg-white">
              {filteredVehicles.map((vehicle) => {
                const draft = drafts[vehicle._id] || {};
                const isSaving = savingId === vehicle._id;

                return (
                  <div
                    key={vehicle._id}
                    className="grid gap-4 px-4 py-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.6fr)_minmax(0,2fr)] lg:items-center"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-base font-black text-slate-900">{vehicle.name || 'Untitled Vehicle'}</p>
                      <p className="mt-1 truncate text-sm font-semibold text-slate-500">{vehicle.vehicleModel || 'Model not set'}</p>
                      <p className="mt-1 truncate text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        {vehicle.vehicleNumber || 'No vehicle number'}
                      </p>
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-900">{vehicle.driverName || 'No Driver'}</p>
                      <p className="mt-1 truncate text-[11px] font-bold text-slate-500">{vehicle.driverPhone || 'N/A'}</p>
                      <div className="mt-2">
                        <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-slate-600">
                          {vehicle.status || 'inactive'}
                        </span>
                      </div>
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-900">{vehicle.ownerName || 'Platform'}</p>
                      <p className="mt-1 truncate text-[11px] font-bold text-slate-500">{vehicle.ownerPhone || 'N/A'}</p>
                    </div>

                    <div className="min-w-0">
                      <p className="text-sm font-black text-slate-900">{vehicle.capacity || 0}</p>
                      <p className="mt-1 text-[11px] font-semibold text-slate-500">seats</p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <p className="mb-2 text-[11px] font-black text-slate-500 lg:hidden">Driver %</p>
                        <div className="relative">
                          <Percent size={14} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            className={`${inputClass} pl-10`}
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={draft.adminCommissionPercentage ?? '0'}
                            onChange={(event) => updateDraft(vehicle._id, 'adminCommissionPercentage', event.target.value)}
                          />
                        </div>
                      </div>

                      <div>
                        <p className="mb-2 text-[11px] font-black text-slate-500 lg:hidden">Owner %</p>
                        <div className="relative">
                          <Percent size={14} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            className={`${inputClass} pl-10`}
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={draft.ownerCommissionPercentage ?? '0'}
                            onChange={(event) => updateDraft(vehicle._id, 'ownerCommissionPercentage', event.target.value)}
                          />
                        </div>
                      </div>

                      <div>
                        <p className="mb-2 text-[11px] font-black text-slate-500 lg:hidden">Service Tax %</p>
                        <div className="relative">
                          <Receipt size={14} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            className={`${inputClass} pl-10`}
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={draft.serviceTaxPercentage ?? '0'}
                            onChange={(event) => updateDraft(vehicle._id, 'serviceTaxPercentage', event.target.value)}
                          />
                        </div>
                      </div>

                      <div className="flex items-end">
                        <button
                          type="button"
                          onClick={() => handleSave(vehicle)}
                          disabled={isSaving || Number(draft.adminCommissionPercentage) > 100 || Number(draft.adminCommissionPercentage) < 0 || Number(draft.ownerCommissionPercentage) > 100 || Number(draft.ownerCommissionPercentage) < 0 || Number(draft.serviceTaxPercentage) > 100 || Number(draft.serviceTaxPercentage) < 0}
                          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-black px-4 py-2.5 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60"
                        >
                          {isSaving ? <RefreshCcw size={16} className="animate-spin" /> : <Save size={16} />}
                          Save
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
    </div>
  );
};

export default PoolingCommissionManager;
