import React, { useEffect, useMemo, useState } from 'react';
import { 
  Bus, Percent, Receipt, RefreshCcw, Save, Search, 
  Filter, MoreVertical, X, Check, Edit, History, 
  FileClock, AlertCircle, TrendingUp, DollarSign, Wallet,
  ChevronDown
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { getAdminBuses, upsertAdminBus } from '../../services/busService';

const inputClass =
  'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 shadow-sm outline-none transition focus:border-yellow-400 focus:ring-4 focus:ring-yellow-400/10';

const BusCommissionManager = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [savingId, setSavingId] = useState('');
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  
  const [filters, setFilters] = useState({
    operator: '',
    route: '',
    status: '',
    commissionRange: '',
  });

  const [buses, setBuses] = useState([]);
  
  // Modals state
  const [editingBus, setEditingBus] = useState(null);
  const [draft, setDraft] = useState({ commission: '0', tax: '0', status: 'active', remarks: '' });
  
  const [viewHistoryBus, setViewHistoryBus] = useState(null);
  const [activeMenuId, setActiveMenuId] = useState(null); // for action menu dropdown

  const loadBuses = async () => {
    setLoading(true);
    setError(null);
    try {
      const results = await getAdminBuses();
      setBuses(results);
    } catch (err) {
      setError(err?.message || 'Failed to load buses');
      toast.error(err?.message || 'Failed to load buses');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBuses();
  }, []);

  const filteredBuses = useMemo(() => {
    let result = buses;
    const query = String(search || '').trim().toLowerCase();
    
    if (query) {
      result = result.filter((bus) =>
        [
          bus.busName,
          bus.operatorName,
          bus.serviceNumber,
          bus.registrationNumber,
          bus.route?.routeName,
          bus.route?.originCity,
          bus.route?.destinationCity,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query))
      );
    }

    if (filters.operator) {
      result = result.filter(bus => bus.operatorName?.toLowerCase().includes(filters.operator.toLowerCase()));
    }
    if (filters.route) {
      result = result.filter(bus => bus.route?.routeName?.toLowerCase().includes(filters.route.toLowerCase()));
    }
    if (filters.status) {
      result = result.filter(bus => (bus.status || 'active').toLowerCase() === filters.status.toLowerCase());
    }
    if (filters.commissionRange) {
      result = result.filter(bus => {
        const comm = Number(bus.adminCommissionPercentage || 0);
        if (filters.commissionRange === '0-5') return comm >= 0 && comm <= 5;
        if (filters.commissionRange === '6-10') return comm > 5 && comm <= 10;
        if (filters.commissionRange === '10+') return comm > 10;
        return true;
      });
    }

    return result;
  }, [buses, search, filters]);

  // Summary Calculations
  const totalBuses = buses.length;
  const avgCommission = buses.length ? (buses.reduce((acc, bus) => acc + Number(bus.adminCommissionPercentage || 0), 0) / buses.length).toFixed(1) : 0;
  const avgServiceTax = buses.length ? (buses.reduce((acc, bus) => acc + Number(bus.serviceTaxPercentage || 0), 0) / buses.length).toFixed(1) : 0;
  const estimatedEarnings = buses.reduce((acc, bus) => {
    const fare = Number(bus.seatPrice || 0);
    const comm = Number(bus.adminCommissionPercentage || 0) / 100;
    const capacity = Number(bus.capacity || 0);
    return acc + (fare * comm * capacity * 30);
  }, 0);

  const formatCurrency = (val) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);

  const openEditModal = (bus) => {
    setEditingBus(bus);
    setDraft({
      commission: String(bus.adminCommissionPercentage ?? '0'),
      tax: String(bus.serviceTaxPercentage ?? '0'),
      status: bus.status || 'active',
      remarks: ''
    });
    setActiveMenuId(null);
  };

  const handleSave = async () => {
    if (!editingBus) return;
    setSavingId(editingBus.id);

    try {
      const payload = {
        ...editingBus,
        status: draft.status,
        adminCommissionPercentage: Math.min(100, Math.max(0, Number(draft.commission || 0))),
        serviceTaxPercentage: Math.min(100, Math.max(0, Number(draft.tax || 0))),
        remarks: draft.remarks // Might be ignored by backend, but included
      };

      const updated = await upsertAdminBus(payload);
      setBuses((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      toast.success(`Updated ${updated.busName || 'bus'} pricing settings`);
      setEditingBus(null);
    } catch (err) {
      toast.error(err?.message || 'Failed to save bus commission settings');
    } finally {
      setSavingId('');
    }
  };

  // Click outside listener for Action Menu could be added, but for simplicity we toggle it directly
  const toggleMenu = (id) => {
    if (activeMenuId === id) setActiveMenuId(null);
    else setActiveMenuId(id);
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] p-4 lg:p-6 relative">
      <div className="mx-auto max-w-7xl space-y-4">
        
        {/* Header */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-yellow-200 bg-yellow-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-yellow-600">
              <Percent size={14} />
              Bus Commission
            </div>
            <h1 className="mt-3 text-3xl font-black text-slate-900 tracking-tight">Commission Management</h1>
            <p className="mt-2 text-sm font-medium text-slate-500 max-w-2xl">
              Enterprise dashboard for managing individual commission and service tax percentages across the fleet.
            </p>
          </div>

          <div className="flex items-center gap-3">
             <button
              type="button"
              onClick={() => navigate('/admin/bus-service')}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <Bus size={16} />
              Fleet Manager
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        {!loading && !error && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-slate-500 mb-2">
                <Bus size={16} className="text-yellow-500" />
                <span className="text-[10px] font-black uppercase tracking-widest">Total Services</span>
              </div>
              <p className="text-2xl font-black text-slate-900">{totalBuses}</p>
            </div>
            <div className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-slate-500 mb-2">
                <TrendingUp size={16} className="text-yellow-500" />
                <span className="text-[10px] font-black uppercase tracking-widest">Avg Commission</span>
              </div>
              <p className="text-2xl font-black text-slate-900">{avgCommission}%</p>
            </div>
            <div className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-slate-500 mb-2">
                <Receipt size={16} className="text-yellow-500" />
                <span className="text-[10px] font-black uppercase tracking-widest">Avg Service Tax</span>
              </div>
              <p className="text-2xl font-black text-slate-900">{avgServiceTax}%</p>
            </div>
            <div className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-slate-500 mb-2">
                <Wallet size={16} className="text-yellow-500" />
                <span className="text-[10px] font-black uppercase tracking-widest">Est. Monthly Earnings</span>
              </div>
              <p className="text-2xl font-black text-slate-900">{formatCurrency(estimatedEarnings)}</p>
            </div>
          </div>
        )}

        {/* Search & Filters */}
        <div className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className={`${inputClass} pl-11`}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search bus, operator, route, or registration"
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-3 text-sm font-black transition ${showFilters ? 'bg-black text-yellow-400' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            >
              <Filter size={16} />
              Filters
              <ChevronDown size={16} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {/* Collapsible Filters */}
          {showFilters && (
            <div className="mt-4 border-t border-slate-100 pt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-500">Operator</label>
                <input 
                  type="text" 
                  value={filters.operator}
                  onChange={(e) => setFilters({...filters, operator: e.target.value})}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold focus:border-yellow-400 focus:outline-none" 
                  placeholder="All Operators" 
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-500">Route</label>
                <input 
                  type="text" 
                  value={filters.route}
                  onChange={(e) => setFilters({...filters, route: e.target.value})}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold focus:border-yellow-400 focus:outline-none" 
                  placeholder="All Routes" 
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-500">Commission Range</label>
                <select 
                  value={filters.commissionRange}
                  onChange={(e) => setFilters({...filters, commissionRange: e.target.value})}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold focus:border-yellow-400 focus:outline-none bg-white"
                >
                  <option value="">All Ranges</option>
                  <option value="0-5">0% - 5%</option>
                  <option value="6-10">6% - 10%</option>
                  <option value="10+">Above 10%</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-500">Status</label>
                <select 
                  value={filters.status}
                  onChange={(e) => setFilters({...filters, status: e.target.value})}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold focus:border-yellow-400 focus:outline-none bg-white"
                >
                  <option value="">All Statuses</option>
                  <option value="active">Active</option>
                  <option value="draft">Draft</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* States & Table */}
        {error ? (
          <div className="rounded-[2.5rem] border border-rose-200 bg-rose-50 p-8 text-center">
            <AlertCircle className="mx-auto h-10 w-10 text-rose-500" />
            <h2 className="mt-4 text-xl font-black text-slate-900">Failed to load commission data</h2>
            <p className="mt-2 text-sm font-medium text-rose-600">{error}</p>
            <button
              onClick={loadBuses}
              className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-black px-6 py-3 text-sm font-black text-white hover:bg-slate-800 transition"
            >
              Retry
            </button>
          </div>
        ) : loading ? (
           <div className="overflow-hidden rounded-[2.5rem] border border-slate-200 bg-white shadow-sm">
             <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex gap-4">
               <div className="h-4 w-24 bg-slate-200 rounded animate-pulse" />
               <div className="h-4 w-24 bg-slate-200 rounded animate-pulse" />
             </div>
             {[1,2,3,4].map(i => (
               <div key={i} className="px-6 py-5 border-b border-slate-100 flex gap-4 items-center">
                 <div className="h-10 w-10 bg-slate-200 rounded-full animate-pulse" />
                 <div className="flex-1 space-y-2">
                   <div className="h-4 w-1/3 bg-slate-200 rounded animate-pulse" />
                   <div className="h-3 w-1/4 bg-slate-200 rounded animate-pulse" />
                 </div>
               </div>
             ))}
           </div>
        ) : filteredBuses.length === 0 ? (
          <div className="rounded-[2.5rem] border border-dashed border-slate-300 bg-white px-8 py-20 text-center shadow-sm">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-slate-50">
                <Receipt className="h-10 w-10 text-slate-400" />
            </div>
            <h2 className="mt-6 text-xl font-black text-slate-900">No commission records available</h2>
            <p className="mt-2 text-sm font-medium text-slate-500">Commission settings will appear here once bus services are created.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[2.5rem] border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-black uppercase tracking-widest text-slate-500">
                <tr>
                  <th className="px-4 py-3">Bus & Operator</th>
                  <th className="px-4 py-3">Route</th>
                  <th className="px-4 py-3">Pricing</th>
                  <th className="px-4 py-3">Platform Earnings</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredBuses.map((bus) => {
                  const fare = Number(bus.seatPrice || 0);
                  const comm = Number(bus.adminCommissionPercentage || 0);
                  const tax = Number(bus.serviceTaxPercentage || 0);
                  const platformEarnings = fare * (comm / 100);
                  const isMenuOpen = activeMenuId === bus.id;
                  
                  return (
                    <tr key={bus.id} className="transition hover:bg-slate-50/50">
                      <td className="px-4 py-3">
                        <p className="font-black text-slate-900">{bus.busName || 'Untitled Bus'}</p>
                        <p className="mt-0.5 text-xs font-bold text-slate-500">{bus.operatorName || 'No Operator'}</p>
                        <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          {bus.serviceNumber} | {bus.registrationNumber}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-black text-slate-900">
                          {bus.route?.originCity || 'Origin'} → {bus.route?.destinationCity || 'Destination'}
                        </p>
                        <p className="mt-0.5 text-xs font-bold text-slate-500 truncate max-w-[200px]">
                          {bus.route?.routeName || 'Route not set'}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Fare</p>
                            <p className="font-black text-slate-900">{formatCurrency(fare)}</p>
                          </div>
                          <div className="h-8 w-px bg-slate-200"></div>
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Comm.</p>
                            <p className="font-black text-slate-900">{comm}%</p>
                          </div>
                          <div className="h-8 w-px bg-slate-200"></div>
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Tax</p>
                            <p className="font-black text-slate-900">{tax}%</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-black text-emerald-600 bg-emerald-50 inline-flex px-3 py-1 rounded-full">
                          + {formatCurrency(platformEarnings)} <span className="text-[10px] ml-1 mt-0.5 uppercase">/seat</span>
                        </p>
                        <p className="mt-2 text-[10px] font-bold text-slate-400">
                          Last updated: {new Date(bus.updatedAt || Date.now()).toLocaleDateString()}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${
                          (bus.status || 'active') === 'active' 
                            ? 'bg-yellow-50 text-yellow-600 border border-yellow-200' 
                            : 'bg-slate-100 text-slate-500 border border-slate-200'
                        }`}>
                          {bus.status || 'Active'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right relative">
                        <button
                          onClick={() => toggleMenu(bus.id)}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
                        >
                          <MoreVertical size={16} />
                        </button>
                        
                        {isMenuOpen && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setActiveMenuId(null)}></div>
                            <div className="absolute right-8 top-12 z-20 w-48 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                              <button
                                onClick={() => openEditModal(bus)}
                                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-bold text-slate-700 transition hover:bg-yellow-50 hover:text-yellow-700"
                              >
                                <Edit size={14} />
                                Edit Commission
                              </button>
                              <button
                                onClick={() => { setViewHistoryBus(bus); setActiveMenuId(null); }}
                                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                              >
                                <History size={14} />
                                View History
                              </button>
                              <button
                                onClick={() => { setViewHistoryBus(bus); setActiveMenuId(null); }}
                                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                              >
                                <FileClock size={14} />
                                Audit Log
                              </button>
                            </div>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Commission Drawer / Modal */}
      {editingBus && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-900/50 backdrop-blur-sm">
          <div className="h-full w-full max-w-md bg-white shadow-2xl overflow-y-auto border-l border-slate-200 animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5 sticky top-0 bg-white z-10">
              <h3 className="text-xl font-black text-slate-900">Edit Commission</h3>
              <button
                onClick={() => setEditingBus(null)}
                className="rounded-full bg-slate-100 p-2 text-slate-500 hover:bg-slate-200 transition"
              >
                <X size={16} />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100">
                <p className="text-sm font-black text-slate-900">{editingBus.busName}</p>
                <p className="text-xs font-bold text-slate-500">{editingBus.operatorName}</p>
              </div>

              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-500">Commission Percentage (%)</label>
                <div className="relative">
                  <Percent size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    className={`${inputClass} pl-11`}
                    value={draft.commission}
                    onChange={(e) => setDraft({...draft, commission: e.target.value})}
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-500">Service Tax Percentage (%)</label>
                <div className="relative">
                  <Receipt size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    className={`${inputClass} pl-11`}
                    value={draft.tax}
                    onChange={(e) => setDraft({...draft, tax: e.target.value})}
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-500">Status</label>
                <select
                  className={inputClass}
                  value={draft.status}
                  onChange={(e) => setDraft({...draft, status: e.target.value})}
                >
                  <option value="active">Active</option>
                  <option value="draft">Draft</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-500">Remarks (Optional)</label>
                <textarea
                  rows={3}
                  className={inputClass}
                  placeholder="Reason for change..."
                  value={draft.remarks}
                  onChange={(e) => setDraft({...draft, remarks: e.target.value})}
                />
              </div>

            </div>

            <div className="border-t border-slate-100 p-6 sticky bottom-0 bg-white">
              <div className="flex gap-3">
                <button
                  onClick={() => setEditingBus(null)}
                  className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-600 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={!!savingId}
                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-black px-4 py-3 text-sm font-black text-white hover:bg-slate-800 transition disabled:opacity-60"
                >
                  {savingId === editingBus.id ? <RefreshCcw size={16} className="animate-spin" /> : <Save size={16} />}
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View History / Audit Log Modal (Read Only) */}
      {viewHistoryBus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-[2.5rem] bg-white p-6 shadow-xl sm:p-8">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h3 className="text-2xl font-black text-slate-900">Audit History</h3>
                <p className="mt-1 text-sm font-medium text-slate-500">Viewing changes for {viewHistoryBus.busName}</p>
              </div>
              <button
                onClick={() => setViewHistoryBus(null)}
                className="rounded-full bg-slate-100 p-2 text-slate-500 hover:bg-slate-200 transition"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="rounded-[2rem] border border-slate-200 bg-slate-50 p-8 text-center">
               <History className="mx-auto h-12 w-12 text-slate-300 mb-4" />
               <h4 className="text-lg font-black text-slate-900">No historical records</h4>
               <p className="text-sm font-medium text-slate-500 mt-2 max-w-md mx-auto">
                 History and audit logs will be available once the backend API starts tracking individual commission changes.
               </p>
               
               <div className="mt-6 text-left border-t border-slate-200 pt-6">
                 <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">Current Settings Snapshot</p>
                 <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                   <div>
                     <p className="text-xs text-slate-500 font-bold mb-1">Commission</p>
                     <p className="font-black text-slate-900">{viewHistoryBus.adminCommissionPercentage || 0}%</p>
                   </div>
                   <div>
                     <p className="text-xs text-slate-500 font-bold mb-1">Service Tax</p>
                     <p className="font-black text-slate-900">{viewHistoryBus.serviceTaxPercentage || 0}%</p>
                   </div>
                   <div>
                     <p className="text-xs text-slate-500 font-bold mb-1">Changed By</p>
                     <p className="font-black text-slate-900">System (Last Update)</p>
                   </div>
                   <div>
                     <p className="text-xs text-slate-500 font-bold mb-1">Changed Date</p>
                     <p className="font-black text-slate-900">{new Date(viewHistoryBus.updatedAt || Date.now()).toLocaleDateString()}</p>
                   </div>
                 </div>
               </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default BusCommissionManager;
