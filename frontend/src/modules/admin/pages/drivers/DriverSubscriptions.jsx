import React, { useState, useEffect } from 'react';
import { 
  Zap, 
  Search, 
  ChevronRight, 
  Plus, 
  Filter, 
  Download, 
  Car,
  MoreVertical,
  List,
  LayoutGrid
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { adminService } from '../../services/adminService';
import toast from 'react-hot-toast';

const DriverSubscriptions = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [config, setConfig] = useState({
    mode: 'commissionOnly' // commissionOnly, subscriptionOnly, both
  });
  const [isLoading, setIsLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({ status: '', type: '' });
  const [plans, setPlans] = useState([]);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const handleToggle = async (mode) => {
    try {
      const res = await adminService.updateSubscriptionSettings({ mode });
      if (res.success) {
        setConfig({ mode });
        toast.success(`Mode changed to ${mode.replace(/([A-Z])/g, ' $1').toLowerCase()}`);
      } else {
        toast.error(res.message || "Failed to update settings");
      }
    } catch (err) {
      console.error('Update settings error:', err);
      toast.error(err.message || "Failed to update settings");
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        
        const [plansData, settingsData] = await Promise.all([
          adminService.getSubscriptionPlans(),
          adminService.getSubscriptionSettings()
        ]);

        if (plansData.success) setPlans(plansData.data?.results || []);
        
        if (settingsData.success) {
          setConfig({ mode: settingsData.data?.mode || 'commissionOnly' });
        }

      } catch (err) {
        console.error('Fetch error:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  const filteredPlans = plans.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50 p-6 lg:p-8">
      {/* HEADER */}
      <div className="mb-6">
        <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-2">
          <span>Drivers</span>
          <ChevronRight size={12} />
          <span className="text-gray-700">Subscription</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl text-gray-900 font-bold">Subscription</h1>
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
              <Download size={15} /> Export List
            </button>
          </div>
        </div>
      </div>

      {/* TOP CONFIG TOGGLES */}
      <div className="flex flex-wrap gap-4 mb-8">
        <ToggleSwitch 
          label="Enable Commission Only" 
          enabled={config.mode === 'commissionOnly'} 
          onToggle={() => handleToggle('commissionOnly')} 
        />
        <ToggleSwitch 
          label="Enable Subscription Only" 
          enabled={config.mode === 'subscriptionOnly'} 
          onToggle={() => handleToggle('subscriptionOnly')} 
        />
        <ToggleSwitch 
          label="Enable Subscription and Commission" 
          enabled={config.mode === 'both'} 
          onToggle={() => handleToggle('both')} 
        />
      </div>

      {/* LIST SECTION */}
      {config.mode !== 'commissionOnly' && (
      <div className="bg-white rounded-xl border border-gray-200 overflow-visible shadow-sm">
        {/* TOOLBAR */}
        <div className="p-4 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button className="w-10 h-10 bg-teal-500 text-white rounded-lg flex items-center justify-center shadow-sm">
              <List size={18} />
            </button>
            <button className="w-10 h-10 bg-gray-100 text-gray-400 rounded-lg flex items-center justify-center hover:bg-indigo-50 transition-all">
              <LayoutGrid size={18} />
            </button>
            <div className="flex items-center gap-2 text-xs text-gray-500 ml-4 font-medium">
              <span>Show</span>
              <select
                value={itemsPerPage}
                onChange={(e) => setItemsPerPage(e.target.value)}
                className="border border-gray-200 rounded px-2 py-1 text-xs bg-white outline-none"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
              <span>entries</span>
            </div>
          </div>
          
          <div className="flex items-center gap-3 w-full md:w-auto mt-4 md:mt-0">
            <button 
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 transition-colors ml-auto md:ml-0"
            >
              <Filter size={16} /> Filters
            </button>
            <div className="relative flex-1 md:flex-none">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input 
                type="text" 
                placeholder="Search plans..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg md:w-56 focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 outline-none transition-colors"
              />
            </div>
            <button 
              onClick={() => navigate('/admin/drivers/subscription/create')}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-black font-semibold bg-yellow-400 rounded-lg shadow-sm hover:bg-yellow-500 transition-colors whitespace-nowrap"
            >
               <Plus size={16} /> Add Subscription
            </button>
          </div>
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <div className="mx-4 mt-2 pt-4 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 gap-4 pb-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Status</label>
              <select 
                value={filters.status}
                onChange={(e) => setFilters({...filters, status: e.target.value})}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-gray-50 outline-none focus:border-yellow-400 focus:bg-white"
              >
                <option value="">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Transport Type</label>
              <select 
                value={filters.type}
                onChange={(e) => setFilters({...filters, type: e.target.value})}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-gray-50 outline-none focus:border-yellow-400 focus:bg-white"
              >
                <option value="">All</option>
                <option value="taxi">Taxi</option>
                <option value="delivery">Delivery</option>
              </select>
            </div>
          </div>
        )}

        {/* TABLE */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vehicle Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                <tr>
                  <td colSpan="4" className="py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <Loader2 className="w-7 h-7 text-indigo-600 animate-spin" />
                      <p className="text-sm text-gray-400">Loading plans...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredPlans.length === 0 ? (
                <tr>
                  <td colSpan="4" className="px-6 py-16 text-center text-sm text-gray-400">
                    No plans found.
                  </td>
                </tr>
              ) : (
                filteredPlans.map((item) => (
                  <tr key={item._id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900 uppercase">{item.name}</td>
                    <td className="px-4 py-4 text-sm text-gray-500">
                       <div className="flex items-center gap-2">
                          <Car size={14} className="text-gray-400" /> {item.transport_type} ({item.vehicle_type_id?.name || 'N/A'})
                       </div>
                    </td>
                    <td className="px-4 py-4">
                       <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium ${item.active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-50 text-gray-500'}`}>
                          {item.active ? 'Active' : 'Inactive'}
                       </span>
                    </td>
                    <td className="px-4 py-4 text-center">
                       <button className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                          <MoreVertical size={16} />
                       </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* FOOTER */}
        {!isLoading && filteredPlans.length > 0 && (
          <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
             <span>Showing 1 to {filteredPlans.length} of {filteredPlans.length} entries</span>
             <div className="flex items-center gap-1">
                <button className="px-3 py-1.5 border border-gray-200 rounded text-xs text-gray-400" disabled>Prev</button>
                <button className="w-7 h-7 rounded bg-indigo-600 text-white text-xs font-medium flex items-center justify-center">1</button>
                <button className="px-3 py-1.5 border border-gray-200 rounded text-xs text-gray-400" disabled>Next</button>
             </div>
          </div>
        )}
      </div>
      )}

    </div>
  );
};

export default DriverSubscriptions;
