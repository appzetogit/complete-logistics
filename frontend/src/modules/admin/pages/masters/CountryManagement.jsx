import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  ChevronRight,
  ChevronLeft,
  Filter,
  Globe,
  Loader2,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import api from '../../../../shared/api/axiosInstance';
import toast from 'react-hot-toast';

const CountryManagement = () => {
  const [loading, setLoading] = useState(true);
  const [countries, setCountries] = useState([]);
  const [pagination, setPagination] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [searchTerm, setSearchTerm] = useState('');

  const fetchCountries = async (page = 1) => {
    try {
      setLoading(true);
      const res = await api.get(`/admin/countries?page=${page}&limit=10&search=${searchTerm}`);
      setCountries(res.data?.results || []);
      setPagination(res.data?.paginator || { current_page: 1, last_page: 1, total: 0 });
    } catch (err) {
      console.error('Fetch error:', err);
      toast.error('Failed to load countries');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      fetchCountries(1);
    }, 500);
    return () => clearTimeout(delayDebounce);
  }, [searchTerm]);

  const toggleStatus = async (id, currentStatus) => {
    try {
      await api.patch(`/admin/countries/${id}`, { active: !currentStatus });
      toast.success('Status updated successfully');
      fetchCountries(pagination.current_page);
    } catch (err) {
      toast.error('Failed to update status');
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="p-4 md:p-8 max-w-[1600px] mx-auto animate-in fade-in duration-500">
        
        {/* Breadcrumb & Title */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
           <div>
              <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Countries</h1>
              <div className="flex items-center gap-1.5 text-[12px] font-bold text-slate-400 mt-1">
                 <span>App Settings</span>
                 <ChevronRight size={14} />
                 <span className="text-indigo-600">Countries</span>
              </div>
           </div>
           <div className="flex items-center gap-3">
              <div className="relative group">
                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={18} />
                 <input 
                  type="text" 
                  placeholder="Search countries..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-[14px] w-64 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                 />
              </div>
              <button className="flex items-center gap-2 bg-[#2563EB] text-white px-5 py-2.5 rounded-xl text-[13px] font-black shadow-lg shadow-blue-500/20 hover:bg-blue-700 transition-all active:scale-95">
                 <Plus size={18} />
                 Add Country
              </button>
           </div>
        </div>

        {/* Dynamic Table Card */}
        <div className="bg-white rounded-[32px] border border-slate-200 shadow-xl shadow-slate-200/50 overflow-hidden">
           <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                 <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-100">
                       <th className="px-8 py-5 text-[11px] font-black text-slate-500 uppercase tracking-widest">Country Name</th>
                       <th className="px-8 py-5 text-[11px] font-black text-slate-500 uppercase tracking-widest text-center">Icon</th>
                       <th className="px-8 py-5 text-[11px] font-black text-slate-500 uppercase tracking-widest text-center">Status</th>
                       <th className="px-8 py-5 text-[11px] font-black text-slate-500 uppercase tracking-widest text-right">Action</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-50">
                    {loading ? (
                      [...Array(5)].map((_, i) => (
                        <tr key={i} className="animate-pulse">
                          <td colSpan="4" className="px-8 py-6"><div className="h-4 bg-slate-100 rounded w-full"></div></td>
                        </tr>
                      ))
                    ) : countries.length > 0 ? (
                      countries.map((country) => (
                        <tr key={country._id} className="hover:bg-slate-50/50 transition-colors group">
                           <td className="px-8 py-6">
                              <span className="text-[14px] font-bold text-slate-700">{country.name}</span>
                           </td>
                           <td className="px-8 py-6 text-center">
                              <div className="w-10 h-10 rounded-full mx-auto overflow-hidden border border-slate-200 shadow-sm flex items-center justify-center bg-slate-50">
                                 {country.flag ? (
                                   <img src={country.flag} alt={country.name} className="w-full h-full object-cover" />
                                 ) : (
                                   <Globe size={18} className="text-slate-300" />
                                 )}
                              </div>
                           </td>
                           <td className="px-8 py-6 text-center">
                              <button
                                onClick={() => toggleStatus(country._id, country.active)}
                                className={`w-11 h-6 rounded-full relative transition-all duration-300 mx-auto ${
                                  country.active ? 'bg-emerald-500' : 'bg-slate-300'
                                }`}
                              >
                                 <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all duration-300 ${country.active ? 'right-1' : 'left-1'}`} />
                              </button>
                           </td>
                           <td className="px-8 py-6 text-right">
                              <div className="flex items-center justify-end gap-2 px-2">
                                <button className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all group/edit">
                                   <Edit size={18} className="group-hover/edit:scale-110 transition-transform" />
                                </button>
                              </div>
                           </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="4" className="px-8 py-20 text-center">
                           <div className="flex flex-col items-center gap-2">
                              <XCircle className="text-slate-200" size={48} />
                              <p className="text-slate-400 font-bold uppercase tracking-widest text-[12px]">No countries indexed in database</p>
                           </div>
                        </td>
                      </tr>
                    )}
                 </tbody>
              </table>
           </div>

           {/* Pagination Footer */}
           <div className="px-8 py-6 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[12px] font-bold text-slate-400">
                 Showing <span className="text-slate-700">{countries.length}</span> of <span className="text-slate-700">{pagination.total}</span> entries
              </span>
              <div className="flex items-center gap-1">
                 <button 
                  disabled={pagination.current_page === 1}
                  onClick={() => fetchCountries(pagination.current_page - 1)}
                  className="p-2 rounded-xl text-slate-400 hover:text-indigo-600 disabled:opacity-50 transition-all font-bold"
                 >
                    Prev
                 </button>
                 {[...Array(pagination.last_page)].map((_, i) => (
                   <button 
                    key={i}
                    onClick={() => fetchCountries(i + 1)}
                    className={`min-w-[40px] h-10 rounded-xl text-[13px] font-black transition-all ${
                      pagination.current_page === i + 1 
                        ? 'bg-[#2563EB] text-white shadow-lg shadow-blue-500/20' 
                        : 'bg-white border border-slate-200 text-slate-600 hover:border-indigo-500 hover:text-indigo-600'
                    }`}
                   >
                      {i + 1}
                   </button>
                 ))}
                 <button 
                  disabled={pagination.current_page === pagination.last_page}
                  onClick={() => fetchCountries(pagination.current_page + 1)}
                  className="p-2 rounded-xl text-slate-400 hover:text-indigo-600 disabled:opacity-50 transition-all font-bold"
                 >
                    Next
                 </button>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};

export default CountryManagement;
