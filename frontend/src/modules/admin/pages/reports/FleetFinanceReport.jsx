import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Download, 
  ChevronRight, 
  Calendar,
  Layers,
  ArrowUpRight,
  TrendingUp,
  MapPin,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2
} from 'lucide-react';
import { motion } from 'framer-motion';
import { adminService } from '../../services/adminService';
import { triggerFileDownload } from '../../../../shared/utils/downloadHelper';

const FleetFinanceReport = () => {
  const [filters, setFilters] = useState({
    fleet_id: '',
    trip_status: 'completed',
    date_option: '',
    file_format: ''
  });

  const [fleets, setFleets] = useState([]);
  const [isDownloading, setIsDownloading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalFleetRevenue: 0, activeFleets: 0, performance: 0 });

  useEffect(() => {
    const fetchFleetMeta = async () => {
      try {
        const [locationsRes, statsRes] = await Promise.all([
          adminService.getServiceLocations(),
          adminService.getDashboardData()
        ]);

        if (locationsRes.success) {
          setFleets(locationsRes.data?.results || locationsRes.data || []);
        }
        
        if (statsRes.success) {
          setStats({
            totalFleetRevenue: statsRes.data?.total_fleet_earnings || 0,
            activeFleets: locationsRes.data?.length || 0,
            performance: statsRes.data?.performance_index || 94.8
          });
        }
      } catch (err) {
        console.error('Error fetching fleet report data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchFleetMeta();
  }, []);

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const response = await adminService.downloadFleetFinanceReport(filters);

      const success = triggerFileDownload(response, `fleet_finance_${Date.now()}`, filters.file_format);
      if (success) {
        alert('Fleet Finance report downloaded successfully!');
      } else {
        throw new Error('Download trigger failure');
      }
    } catch (err) {
      console.error('Download error:', err);
      alert('Failed to generate report. Please select a Fleet/Location and Date Option.');
    } finally {
      setIsDownloading(false);
    }
  };

  const updateFilter = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const isFormValid = filters.fleet_id && filters.date_option && filters.file_format;

  return (
    <div className="min-h-screen bg-gray-50 p-6 lg:p-8 font-sans text-gray-950">
      {/* Breadcrumbs & Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-500 mb-2">
          <span>Fleet Reports</span>
          <ChevronRight size={14} />
          <span className="text-gray-900">Fleet Finance Report</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Fleet Finance Report</h1>
      </div>

      {/* Filter Card */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-xl border border-gray-200 shadow-sm"
      >
        <div className="p-6 md:p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Fleet Id (Service Locations) */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">
                Fleet ID <span className="text-red-500">*</span>
              </label>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-yellow-500 transition-colors">
                  <Layers size={18} />
                </div>
                <select 
                  value={filters.fleet_id}
                  onChange={(e) => updateFilter('fleet_id', e.target.value)}
                  className="w-full pl-12 pr-10 py-3 bg-white border border-gray-300 focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 rounded-lg text-sm font-semibold text-gray-900 outline-none transition-all appearance-none cursor-pointer"
                >
                  <option value="">Select Fleet</option>
                  {fleets.map(f => (
                    <option key={f._id} value={f._id}>{f.name}</option>
                  ))}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                  <ChevronRight size={16} className="rotate-90" />
                </div>
              </div>
              {!filters.fleet_id && <p className="text-xs font-medium text-red-500">Fleet ID is required</p>}
            </div>

            {/* Trip Status (Radio Buttons) */}
            <div className="space-y-3 md:col-span-1">
              <label className="text-sm font-semibold text-gray-700">
                Trip Status
              </label>
              <div className="flex items-center gap-6 py-2">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <div className="relative flex items-center justify-center">
                    <input 
                      type="radio" 
                      name="trip_status" 
                      value="completed" 
                      checked={filters.trip_status === 'completed'}
                      onChange={(e) => updateFilter('trip_status', e.target.value)}
                      className="peer sr-only"
                    />
                    <div className="w-4 h-4 rounded-full border border-gray-300 peer-checked:border-yellow-500 peer-checked:bg-yellow-500 transition-all flex items-center justify-center">
                      <div className="w-1.5 h-1.5 bg-white rounded-full scale-0 peer-checked:scale-100 transition-transform"></div>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-gray-700 group-hover:text-black">Completed</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer group">
                  <div className="relative flex items-center justify-center">
                    <input 
                      type="radio" 
                      name="trip_status" 
                      value="cancelled" 
                      checked={filters.trip_status === 'cancelled'}
                      onChange={(e) => updateFilter('trip_status', e.target.value)}
                      className="peer sr-only"
                    />
                    <div className="w-4 h-4 rounded-full border border-gray-300 peer-checked:border-yellow-500 peer-checked:bg-yellow-500 transition-all flex items-center justify-center">
                      <div className="w-1.5 h-1.5 bg-white rounded-full scale-0 peer-checked:scale-100 transition-transform"></div>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-gray-700 group-hover:text-black">Cancelled</span>
                </label>
              </div>
            </div>

            {/* Date Option */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">
                Date Option <span className="text-red-500">*</span>
              </label>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-yellow-500 transition-colors">
                  <Calendar size={18} />
                </div>
                <select 
                  value={filters.date_option}
                  onChange={(e) => updateFilter('date_option', e.target.value)}
                  className="w-full pl-12 pr-10 py-3 bg-white border border-gray-300 focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 rounded-lg text-sm font-semibold text-gray-900 outline-none transition-all appearance-none cursor-pointer"
                >
                  <option value="">Select Date Option</option>
                  <option value="today">Today</option>
                  <option value="yesterday">Yesterday</option>
                  <option value="last_7_days">Last 7 Days</option>
                  <option value="this_month">This Month</option>
                  <option value="last_month">Last Month</option>
                  <option value="this_year">This Year</option>
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                  <ChevronRight size={16} className="rotate-90" />
                </div>
              </div>
              {!filters.date_option && <p className="text-xs font-medium text-red-500">Date Option is required</p>}
            </div>

            {/* File Format */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">
                File Format <span className="text-red-500">*</span>
              </label>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-yellow-500 transition-colors">
                  <FileText size={18} />
                </div>
                <select 
                  value={filters.file_format}
                  onChange={(e) => updateFilter('file_format', e.target.value)}
                  className="w-full pl-12 pr-10 py-3 bg-white border border-gray-300 focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 rounded-lg text-sm font-semibold text-gray-900 outline-none transition-all appearance-none cursor-pointer"
                >
                  <option value="">Select File Format</option>
                  <option value="csv">CSV Spreadsheet</option>
                  <option value="xlsx">Excel File</option>
                  <option value="pdf">PDF Report</option>
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                  <ChevronRight size={16} className="rotate-90" />
                </div>
              </div>
              {!filters.file_format && <p className="text-xs font-medium text-red-500">File Format is required</p>}
            </div>
          </div>

          <div className="flex justify-end pt-6 mt-6 border-t border-gray-100">
            <button 
              onClick={handleDownload}
              disabled={!isFormValid || isDownloading}
              className={`flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-bold text-sm transition-all ${
                (!isFormValid || isDownloading)
                ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                : 'bg-yellow-400 text-black hover:bg-yellow-500 shadow-sm'
              }`}
            >
              {isDownloading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Download size={18} />
              )}
              {isDownloading ? 'Downloading...' : 'Download Report'}
            </button>
          </div>
        </div>
      </motion.div>

      {/* Fleet Stats Overview */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between">
           <div>
              <div className="w-10 h-10 bg-yellow-100 text-yellow-600 rounded-lg flex items-center justify-center mb-4">
                 <MapPin size={20} />
              </div>
              <p className="text-xs font-semibold text-gray-500 mb-1">Fleet Deployment</p>
              <p className="text-2xl font-bold text-gray-900">{loading ? '...' : stats.activeFleets} Cities</p>
           </div>
           <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500">Total Markets</span>
              <CheckCircle2 size={16} className="text-green-500" />
           </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between relative overflow-hidden">
           <div>
              <div className="w-10 h-10 bg-gray-100 text-gray-600 rounded-lg flex items-center justify-center mb-4">
                 <ArrowUpRight size={20} />
              </div>
              <p className="text-xs font-semibold text-gray-500 mb-1">Fleet Revenue</p>
              <p className="text-2xl font-bold text-gray-900">₹{loading ? '...' : stats.totalFleetRevenue.toLocaleString()}</p>
           </div>
           <div className="mt-4 flex items-center gap-2">
              <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded">+12%</span>
              <span className="text-xs font-semibold text-gray-500 whitespace-nowrap">vs Previous Quarter</span>
           </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between">
           <div>
              <div className="w-10 h-10 bg-yellow-100 text-yellow-600 rounded-lg flex items-center justify-center mb-4">
                 <Clock size={20} />
              </div>
              <p className="text-xs font-semibold text-gray-500 mb-1">Performance Index</p>
              <p className="text-2xl font-bold text-gray-900">{loading ? '...' : stats.performance}%</p>
           </div>
           <div className="mt-4 flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= 4 ? 'bg-yellow-400' : 'bg-gray-200'}`}></div>
              ))}
           </div>
        </div>
      </div>
    </div>
  );
};

export default FleetFinanceReport;
