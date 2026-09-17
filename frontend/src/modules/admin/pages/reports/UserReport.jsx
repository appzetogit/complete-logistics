import React, { useState } from 'react';
import { 
  Download, 
  ChevronRight, 
  ArrowLeft
} from 'lucide-react';
import { motion } from 'framer-motion';
import { adminService } from '../../services/adminService';
import { triggerFileDownload } from '../../../../shared/utils/downloadHelper';

const UserReport = () => {
  const [status, setStatus] = useState('');
  const [dateOption, setDateOption] = useState('');
  const [fileFormat, setFileFormat] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const response = await adminService.downloadUserReport({ 
        status, 
        date_option: dateOption, 
        from_date: fromDate,
        to_date: toDate,
        file_format: fileFormat 
      });

      const success = triggerFileDownload(response, `user_report_${Date.now()}`, fileFormat);
      if (!success) {
        throw new Error('Trigger failed');
      }
    } catch (err) {
      console.error('Download error:', err);
      alert('Failed to generate report. Please check server availability.');
    } finally {
      setIsDownloading(false);
    }
  };

  const inputClass = "w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-800 bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-colors appearance-none shadow-sm";
  const labelClass = "block text-[13px] font-bold text-gray-600 mb-2";

  return (
    <div className="min-h-screen bg-[#F9FAFB] p-6 lg:p-8">
      {/* Header Block */}
      <div className="mb-8">
        <div className="flex items-center gap-2 text-xs text-gray-400 mb-3 font-medium">
          <span>User Report</span>
          <ChevronRight size={14} className="opacity-50" />
          <span className="text-gray-600 font-semibold">User Report</span>
        </div>
        <div className="flex items-center justify-between border-b border-gray-100 pb-5">
          <h1 className="text-2xl font-bold text-[#334155] tracking-tight uppercase">User Report</h1>
          <button 
            onClick={() => window.history.back()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all shadow-sm active:scale-95"
          >
            <ArrowLeft size={16} strokeWidth={2.5} /> Back
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto">
        {/* Filter Card */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl border border-gray-100 p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)]"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Select Status */}
            <div className="space-y-1">
              <label className={labelClass}>
                Select Status <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <select 
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Select User Status</option>
                  <option value="active">Active Users</option>
                  <option value="inactive">Inactive Users</option>
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                  <ChevronRight size={18} className="rotate-90 opacity-60" />
                </div>
              </div>
            </div>

            {/* Date Option */}
            <div className="space-y-1">
              <label className={labelClass}>
                Date Option <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <select 
                  value={dateOption}
                  onChange={(e) => setDateOption(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Select</option>
                  <option value="today">Today</option>
                  <option value="yesterday">Yesterday</option>
                  <option value="this_week">This Week</option>
                  <option value="this_month">This Month</option>
                  <option value="this_year">This Year</option>
                  <option value="range">Date Range</option>
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                  <ChevronRight size={18} className="rotate-90 opacity-60" />
                </div>
              </div>
            </div>

            {dateOption === 'range' && (
              <>
                <div className="space-y-1">
                  <label className={labelClass}>From Date <span className="text-rose-500">*</span></label>
                  <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={inputClass} />
                </div>
                <div className="space-y-1">
                  <label className={labelClass}>To Date <span className="text-rose-500">*</span></label>
                  <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={inputClass} />
                </div>
              </>
            )}

            {/* File Format */}
            <div className="space-y-1">
              <label className={labelClass}>
                File Format <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <select 
                  value={fileFormat}
                  onChange={(e) => setFileFormat(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Select File Format</option>
                  <option value="csv">CSV</option>
                  <option value="excel">Excel</option>
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                  <ChevronRight size={18} className="rotate-90 opacity-60" />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-12 flex justify-end">
            <button 
              onClick={handleDownload}
              disabled={!status || !dateOption || !fileFormat || isDownloading || (dateOption === 'range' && (!fromDate || !toDate))}
              className={`flex items-center gap-3 px-8 py-3.5 rounded-xl text-[15px] font-bold tracking-wide transition-all active:scale-95 shadow-lg ${
                (!status || !dateOption || !fileFormat || isDownloading || (dateOption === 'range' && (!fromDate || !toDate)))
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none'
                : 'bg-[#4338CA] text-white hover:bg-[#3730A3] shadow-indigo-200'
              }`}
            >
              {isDownloading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Download size={18} strokeWidth={2.5} />
              )}
              {isDownloading ? 'Downloading...' : 'Download'}
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default UserReport;
