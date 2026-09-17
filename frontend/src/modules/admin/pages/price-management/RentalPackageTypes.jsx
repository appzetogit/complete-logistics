import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  Search, 
  ChevronRight, 
  Trash2, 
  Edit2, 
  ArrowLeft,
  Loader2,
  Clock,
  Filter,
  Save,
  Activity,
  ChevronDown
} from 'lucide-react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { adminService } from '../../services/adminService';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from "framer-motion";

const inputClass = "w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-slate-800 font-semibold bg-white focus:border-amber-400 focus:ring-1 focus:ring-amber-400 outline-none transition-colors shadow-sm";
const labelClass = "block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide";
const selectClass = "w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-slate-800 font-semibold bg-white focus:border-amber-400 focus:ring-1 focus:ring-amber-400 outline-none transition-colors appearance-none cursor-pointer bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%3E%3Cpath%20d%3D%22M6%209L12%2015L18%209%22%20stroke%3D%22%2364748B%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22/%3E%3C/svg%3E')] bg-[length:18px] bg-[right_12px_center] bg-no-repeat shadow-sm";

const StatusToggle = ({ active, onToggle }) => (
  <button
    type="button"
    onClick={(e) => { e.stopPropagation(); onToggle(); }}
    className={`w-12 h-6.5 rounded-full transition-colors relative flex items-center px-1 ${active ? 'bg-[#10B981]' : 'bg-gray-300'}`}
  >
    <div className={`w-4.5 h-4.5 rounded-full bg-white shadow-sm transition-transform ${active ? 'translate-x-5.5' : 'translate-x-0'}`} />
  </button>
);

const RentalPackageTypes = ({ mode: propMode }) => {
  const navigate = useNavigate();
  const { id } = useParams();
  const location = useLocation();
  
  const isCreate = propMode === 'create' || location.pathname.endsWith('/create');
  const isEdit = propMode === 'edit' || location.pathname.includes('/edit/');
  const isList = !isCreate && !isEdit;

  const [loading, setLoading] = useState(true);
  const [packages, setPackages] = useState([]);
  const [entriesPerPage, setEntriesPerPage] = useState(10);
  const [submitting, setSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTransport, setFilterTransport] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    transport_type: 'taxi',
    short_description: '',
    description: '',
    status: 'active',
  });

  const fetchPackages = async () => {
    try {
      setLoading(true);
      const res = await adminService.getRentalPackageTypes();
      if (res && res.success) {
        // Backend pattern consistency: check data.results or rental_packages.results
        const rawPackages = res.data?.rental_packages?.results || res.data?.rental_packages || res.rental_packages?.results || res.rental_packages || res.results || res.data?.results || [];
        setPackages(Array.isArray(rawPackages) ? rawPackages : []);
      }
    } catch (err) {
      toast.error('Failed to load rental packages');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isList) {
      fetchPackages();
    } else if (isEdit && id) {
      const fetchItem = async () => {
        try {
          const res = await adminService.getRentalPackageTypes();
          const items = res.data?.rental_packages?.results || res.data?.rental_packages || res.rental_packages?.results || res.rental_packages || res.results || res.data?.results || [];
          const itemsArr = Array.isArray(items) ? items : [];
          const item = itemsArr.find(p => String(p._id || p.id) === String(id));
          if (item) {
            setFormData({
              name: item.name || '',
              transport_type: item.transport_type || 'taxi',
              short_description: item.short_description || '',
              description: item.description || '',
              status: item.status || 'active',
            });
          }
        } catch (err) {
          toast.error('Failed to fetch package details');
        } finally {
          setLoading(false);
        }
      };
      fetchItem();
    } else {
      setLoading(false);
    }
  }, [isList, isEdit, id]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!formData.name?.trim()) return toast.error('Package name is required');
    if (!formData.transport_type) return toast.error('Transport type is required');
    if (!formData.short_description?.trim()) return toast.error('Short description is required');
    if (!formData.description?.trim()) return toast.error('Description is required');
    try {
      setSubmitting(true);
      if (isEdit) {
        await adminService.updateRentalPackageType(id, formData);
        toast.success('Package updated');
      } else {
        await adminService.createRentalPackageType(formData);
        toast.success('Package created');
      }
      navigate('/admin/pricing/rental-packages');
    } catch (err) {
      toast.error(err.message || 'Failed to save package');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (pid) => {
    if (!window.confirm('Delete this rental package type?')) return;
    try {
      await adminService.deleteRentalPackageType(pid);
      toast.success('Package deleted');
      fetchPackages();
    } catch (err) {
      toast.error('Failed to delete package');
    }
  };

  const filteredPackages = useMemo(() => {
    return packages.filter(p => {
      const matchSearch = (p.name || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchTransport = filterTransport === 'all' || p.transport_type === filterTransport;
      // Depending on API, status could be active/inactive boolean or string. Just check string cast.
      const pStatus = p.status === 'active' || p.active ? 'active' : 'inactive';
      const matchStatus = filterStatus === 'all' || pStatus === filterStatus;
      return matchSearch && matchTransport && matchStatus;
    });
  }, [packages, searchTerm, filterTransport, filterStatus]);

  if (isList) {
    return (
      <div className="min-h-screen bg-[#F3F4F9] animate-in fade-in duration-500 font-sans flex flex-col">
        {/* Header Section */}
        <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between shrink-0 shadow-sm relative z-10">
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">Rental Packages</h1>
          <div className="flex items-center gap-2 text-[11px] font-bold text-gray-400">
            <span>Pricing</span>
            <ChevronRight size={12} className="opacity-30" />
            <span className="text-gray-500">Rental Packages</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <motion.div 
            key="list" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="max-w-7xl mx-auto"
          >
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden min-h-[200px]">
              {/* Toolbar */}
              <div className="p-4 lg:px-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3 text-[13px] text-gray-400 font-medium">
                  <span>show</span>
                  <select 
                    value={entriesPerPage} onChange={(e) => setEntriesPerPage(Number(e.target.value))}
                    className="bg-white border border-gray-300 rounded-md px-2 py-1 text-slate-700 outline-none focus:border-indigo-500"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </select>
                  <span>entries</span>
                </div>

                <div className="flex flex-wrap items-center gap-3 relative">
                  <div className="relative hidden md:block">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input 
                      type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search packages..."
                      className="pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-amber-400 focus:border-amber-400 outline-none transition-all w-64 shadow-sm font-semibold"
                    />
                  </div>
                  <button onClick={() => setShowFilters(!showFilters)} className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-[13px] font-bold shadow-sm transition-colors ${showFilters ? 'bg-slate-800 text-white border-transparent' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                    <Filter size={16} /> Filters
                  </button>
                  <button 
                    onClick={() => navigate("create")}
                    className="flex items-center gap-2 px-5 py-2.5 bg-amber-400 text-slate-900 rounded-lg text-[13px] font-bold shadow-sm hover:bg-amber-500 transition-colors"
                  >
                    <Plus size={18} /> Add Package
                  </button>

                  {/* Filter Dropdown */}
                  <AnimatePresence>
                    {showFilters && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                        className="absolute top-full mt-2 right-0 w-80 bg-white rounded-xl shadow-xl border border-slate-100 p-4 z-20"
                      >
                        <div className="space-y-4">
                          <div className="md:hidden">
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Search</label>
                            <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search packages..." className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400" />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Transport Type</label>
                            <select value={filterTransport} onChange={(e) => setFilterTransport(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400">
                              <option value="all">All Types</option>
                              <option value="taxi">Taxi / Ride-Hailing</option>
                              <option value="delivery">Logistics / Delivery</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Status</label>
                            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400">
                              <option value="all">All Status</option>
                              <option value="active">Active</option>
                              <option value="inactive">Inactive</option>
                            </select>
                          </div>
                          <div className="flex gap-2 pt-2">
                            <button onClick={() => { setSearchTerm(''); setFilterTransport('all'); setFilterStatus('all'); }} className="flex-1 px-3 py-2 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-200 transition-colors">Reset</button>
                            <button onClick={() => setShowFilters(false)} className="flex-1 px-3 py-2 bg-amber-400 text-slate-900 rounded-lg text-xs font-bold hover:bg-amber-500 transition-colors">Apply</button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Table */}
              <div className="px-4 pb-4 lg:px-6 lg:pb-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-[#E9E9E9]">
                        <th className="px-4 py-3 text-[13px] font-bold text-slate-700">Name</th>
                        <th className="px-4 py-3 text-[13px] font-bold text-slate-700">Transport Type</th>
                        <th className="px-4 py-3 text-[13px] font-bold text-slate-700">Status</th>
                        <th className="px-4 py-3 text-right text-[13px] font-bold text-slate-700">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {loading ? (
                        <tr>
                          <td colSpan="4" className="py-24 text-center">
                            <Loader2 className="animate-spin text-indigo-600 mx-auto" size={32} />
                          </td>
                        </tr>
                      ) : filteredPackages.length > 0 ? (
                        filteredPackages.slice(0, entriesPerPage).map(p => (
                          <tr key={p._id || p.id} className="hover:bg-gray-50/50 transition-colors group">
                            <td className="px-4 py-3.5">
                              <div className="flex items-center gap-3">
                                <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg"><Clock size={16} /></div>
                                <span className="text-[14px] font-bold text-slate-700">{p.name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3.5">
                              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${p.transport_type === 'taxi' ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' : 'bg-orange-50 text-orange-600 border border-orange-100'}`}>
                                {p.transport_type || 'Taxi'}
                              </span>
                            </td>
                            <td className="px-4 py-3.5">
                              <StatusToggle 
                                active={p.status === 'active' || p.active} 
                                onToggle={() => {
                                  const sid = p._id || p.id;
                                  const currentActive = p.status === 'active' || p.active;
                                  adminService.updateRentalPackageType(sid, { status: currentActive ? 'inactive' : 'active', active: !currentActive })
                                    .then(() => { toast.success('Status Updated'); fetchPackages(); });
                                }}
                              />
                            </td>
                            <td className="px-4 py-3.5 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button onClick={() => navigate(`edit/${p._id || p.id}`)} className="p-1.5 bg-orange-50 text-orange-400 hover:bg-orange-100 rounded-lg transition-colors"><Edit2 size={16} /></button>
                                <button onClick={() => handleDelete(p._id || p.id)} className="p-1.5 bg-rose-50 text-rose-400 hover:bg-rose-100 rounded-lg transition-colors"><Trash2 size={16} /></button>
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="4" className="py-24 text-center text-gray-400 font-medium italic">
                            No rental packages configured in the system.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F3F4F9] animate-in fade-in duration-500 font-sans flex flex-col">
      {/* Create/Edit Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shrink-0 shadow-sm relative z-10">
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">{isEdit ? 'Edit Rental Package Type' : 'Create Rental Package Type'}</h1>
        <div className="flex items-center gap-2 text-[11px] font-bold text-gray-400">
          <span className="hover:text-amber-500 cursor-pointer" onClick={() => navigate("/admin/pricing/rental-packages")}>Rental Package Types</span>
          <ChevronRight size={12} className="opacity-50" />
          <span className="text-slate-700 uppercase">{isEdit ? 'Edit' : 'Create'}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 lg:p-6 shrink-0">
        <motion.div 
          key="form" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
          className="max-w-[1400px] mx-auto bg-white rounded shadow-sm border border-gray-100 mb-20 relative"
        >
          {/* Main Content Area */}
          <div className="p-5 lg:p-8 border-b border-gray-100 border-dashed">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
              <div className="space-y-1.5 font-sans">
                <label className={labelClass}>Transport Type *</label>
                <select name="transport_type" value={formData.transport_type} onChange={handleInputChange} className={selectClass}>
                  <option value="">Select Transport Type</option>
                  <option value="taxi">Taxi / Ride-Hailing</option>
                  <option value="delivery">Logistics / Delivery</option>
                </select>
              </div>

              <div className="space-y-1.5 font-sans">
                <label className={labelClass}>Name *</label>
                <input name="name" value={formData.name} onChange={handleInputChange} placeholder="Enter Name" className={inputClass} />
              </div>

              <div className="space-y-1.5 font-sans">
                <label className={labelClass}>Short Description *</label>
                <input name="short_description" value={formData.short_description} onChange={handleInputChange} placeholder="Enter Short Description" className={inputClass} />
              </div>

              <div className="space-y-1.5 font-sans">
                <label className={labelClass}>Description *</label>
                <textarea 
                  name="description" 
                  value={formData.description} 
                  onChange={handleInputChange} 
                  rows={2} 
                  placeholder="Enter Description" 
                  className={inputClass + " resize-none min-h-[46px] flex items-center pt-2.5"} 
                />
              </div>
            </div>
          </div>

          <div className="p-6 bg-slate-50 flex justify-end items-center gap-3 rounded-b-xl border-t border-gray-100">
             <button 
                onClick={() => navigate('/admin/pricing/rental-packages')}
                className="px-6 py-2.5 bg-white text-slate-700 rounded-lg text-sm font-bold hover:bg-slate-100 transition-all active:scale-95 border border-slate-200 shadow-sm"
             >
                Cancel
             </button>
             <button 
                onClick={handleSubmit} disabled={submitting}
                className="px-8 py-2.5 bg-amber-400 text-slate-900 rounded-lg text-sm font-bold hover:bg-amber-500 transition-all shadow-sm active:scale-95 flex items-center gap-2 group"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} className="group-hover:scale-110 transition-transform" />}
                {isEdit ? 'Update Package' : 'Save Package'}
             </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default RentalPackageTypes;
