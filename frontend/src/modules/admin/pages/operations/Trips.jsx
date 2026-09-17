import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Filter, MoreVertical, Search, Loader2, ChevronRight, Menu, X, Eye, UserPlus, MapPin, XCircle, FileText } from 'lucide-react';
import { motion } from 'framer-motion';
import { adminService } from '../../services/adminService';

const STATUS_STYLES = {
  CANCELLED: 'bg-red-100 text-red-700',
  COMPLETED: 'bg-green-100 text-green-700',
  UPCOMING: 'bg-yellow-100 text-yellow-700',
  ONGOING: 'bg-blue-100 text-blue-700',
  ACCEPTED: 'bg-blue-100 text-blue-700',
};

const PAYMENT_STYLES = {
  CASH: 'bg-gray-100 text-gray-800 border border-gray-200',
  CARD: 'bg-gray-100 text-gray-800 border border-gray-200',
  WALLET: 'bg-gray-100 text-gray-800 border border-gray-200',
};

const TAB_SET = ['All', 'Completed', 'Cancelled', 'Upcoming', 'On Trip'];

const formatDate = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const normalizeTab = (tab) => {
  if (tab === 'On Trip') return 'ongoing';
  return tab.toLowerCase();
};

const normalizeRow = (row = {}) => ({
  id: String(row._id || row.id || row.requestId || Math.random()),
  requestId: row.requestId || row.request_id || row.ride_request_id || '--',
  date: row.date || row.createdAt || row.created_at || row.trip_date || row.updatedAt,
  userName: row.userName || row.user_name || row.customer_name || row.user?.name || '--',
  driverName: row.driverName || row.driver_name || row.driver?.name || '--',
  transportType: row.transportType || row.transport_type || row.service_type || row.module || '--',
  tripStatus: String(row.tripStatus || row.trip_status || row.status || '').toUpperCase(),
  paymentOption: String(row.paymentOption || row.payment_option || row.payment_method || 'CASH').toUpperCase(),
});

const TripDetailsModal = ({ trip, onClose }) => {
  if (!trip) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh] animate-in slide-in-from-bottom-4">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-lg font-bold text-gray-900">Trip Details</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="p-6 overflow-y-auto space-y-5">
          <div className="grid grid-cols-2 gap-y-5 gap-x-4">
            <div>
              <p className="text-[11px] uppercase tracking-wider font-bold text-gray-400 mb-1">Request ID</p>
              <p className="text-[13px] font-bold text-gray-900 font-mono">{trip.requestId}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider font-bold text-gray-400 mb-1">Date</p>
              <p className="text-[13px] font-bold text-gray-900">{formatDate(trip.date)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider font-bold text-gray-400 mb-1">User Name</p>
              <p className="text-[13px] font-bold text-gray-900">{trip.userName}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider font-bold text-gray-400 mb-1">Driver Name</p>
              <p className="text-[13px] font-bold text-gray-900">{trip.driverName}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider font-bold text-gray-400 mb-1">Transport Type</p>
              <p className="text-[13px] font-bold text-gray-900 capitalize">{String(trip.transportType).toLowerCase()}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider font-bold text-gray-400 mb-1">Payment Option</p>
              <p className="text-[13px] font-bold text-gray-900 capitalize">{String(trip.paymentOption).toLowerCase()}</p>
            </div>
            <div className="col-span-2 pt-2 border-t border-gray-50">
              <p className="text-[11px] uppercase tracking-wider font-bold text-gray-400 mb-2">Trip Status</p>
              <span className={`inline-flex items-center px-2.5 py-1 text-xs font-bold rounded capitalize tracking-wide ${STATUS_STYLES[trip.tripStatus] || 'bg-gray-100 text-gray-600'}`}>
                {String(trip.tripStatus).toLowerCase()}
              </span>
            </div>
          </div>
        </div>
        <div className="border-t border-gray-100 p-4 bg-gray-50 flex justify-end">
          <button onClick={onClose} className="px-6 py-2 bg-black text-white text-sm font-bold rounded-lg shadow-sm hover:bg-gray-900 transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

const handlePrintInvoice = (trip) => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert("Please allow popups to print invoices.");
    return;
  }
  
  const formattedDate = formatDate(trip.date);
  
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Invoice - ${trip.requestId}</title>
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px; color: #1f2937; max-width: 800px; margin: 0 auto; }
          .header { text-align: center; border-bottom: 2px solid #e5e7eb; padding-bottom: 30px; margin-bottom: 30px; }
          .title { font-size: 28px; font-weight: 800; margin: 0; color: #111827; letter-spacing: 1px; }
          .subtitle { color: #6b7280; font-size: 14px; margin-top: 8px; }
          .details { width: 100%; border-collapse: collapse; margin-bottom: 40px; }
          .details th, .details td { padding: 16px 12px; border-bottom: 1px solid #f3f4f6; text-align: left; }
          .details th { width: 35%; color: #6b7280; font-weight: 600; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; }
          .details td { font-size: 15px; font-weight: 500; }
          .footer { text-align: center; color: #9ca3af; font-size: 13px; margin-top: 60px; padding-top: 20px; border-top: 1px dashed #e5e7eb; }
          .highlight { font-weight: bold; color: #000; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1 class="title">TRIP INVOICE</h1>
          <p class="subtitle">Request ID: <span class="highlight">${trip.requestId}</span></p>
        </div>
        <table class="details">
          <tr><th>Date</th><td>${formattedDate}</td></tr>
          <tr><th>Customer</th><td>${trip.userName}</td></tr>
          <tr><th>Driver</th><td>${trip.driverName}</td></tr>
          <tr><th>Transport Type</th><td style="text-transform: capitalize;">${String(trip.transportType).toLowerCase()}</td></tr>
          <tr><th>Payment Method</th><td style="text-transform: capitalize;">${String(trip.paymentOption).toLowerCase()}</td></tr>
          <tr><th>Trip Status</th><td style="text-transform: capitalize;">${String(trip.tripStatus).toLowerCase()}</td></tr>
        </table>
        <div class="footer">
          Thank you for choosing our service.<br/>
          This is a computer generated invoice and requires no signature.
        </div>
        <script>
          window.onload = () => { 
            setTimeout(() => { window.print(); window.close(); }, 300);
          }
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
};

// Use Portal for dropdowns or handle within table row? Handling relative to table row.
const ActionMenu = ({ row, onViewDetails, onPrintInvoice }) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isCompleted = row.tripStatus === 'COMPLETED';
  const isCancelled = row.tripStatus === 'CANCELLED';
  const isOngoing = row.tripStatus === 'ONGOING' || row.tripStatus === 'ACCEPTED';
  const hasDriver = row.driverName !== '--';

  return (
    <div className="relative" ref={menuRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
      >
        <MoreVertical size={18} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl shadow-lg border border-gray-100 py-1.5 z-50 overflow-hidden">
          <button 
            onClick={() => { setIsOpen(false); onViewDetails(); }}
            className="w-full text-left px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-yellow-50 hover:text-yellow-900 flex items-center gap-2"
          >
            <Eye size={14} /> View Details
          </button>
          <button 
            disabled={isCompleted || isCancelled || isOngoing || hasDriver}
            className="w-full text-left px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-yellow-50 hover:text-yellow-900 flex items-center gap-2 disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-gray-700"
          >
            <UserPlus size={14} /> Assign Driver
          </button>
          <button 
            disabled={!isOngoing}
            className="w-full text-left px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-yellow-50 hover:text-yellow-900 flex items-center gap-2 disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-gray-700"
          >
            <MapPin size={14} /> Track Trip
          </button>
          <button 
            disabled={isCompleted || isCancelled}
            className="w-full text-left px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 flex items-center gap-2 disabled:opacity-40 disabled:hover:bg-white"
          >
            <XCircle size={14} /> Cancel Trip
          </button>
          <button 
            onClick={() => { setIsOpen(false); onPrintInvoice(); }}
            className="w-full text-left px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-yellow-50 hover:text-yellow-900 flex items-center gap-2 border-t border-gray-50 mt-1 pt-2"
          >
            <FileText size={14} /> Print Invoice
          </button>
        </div>
      )}
    </div>
  );
};

const Trips = () => {
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [activeTab, setActiveTab] = useState('All');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({
    current_page: 1,
    last_page: 1,
    total: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filter State
  const [showFilters, setShowFilters] = useState(false);
  const [activeFilters, setActiveFilters] = useState({
    transportType: '',
    paymentOption: '',
    driverAssigned: '',
    dateFrom: '',
    dateTo: ''
  });
  const [draftFilters, setDraftFilters] = useState({
    transportType: '',
    paymentOption: '',
    driverAssigned: '',
    dateFrom: '',
    dateTo: ''
  });

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setSearch(searchInput);
    }, 350);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [searchInput]);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await adminService.getRideRequests({
        page,
        limit,
        tab: normalizeTab(activeTab),
        search,
      });
      const payload = response?.data?.data || response?.data || response || {};
      const results = Array.isArray(payload?.results) ? payload.results : [];
      const paginator = payload?.paginator || {
        current_page: page,
        last_page: 1,
        total: results.length,
      };
      setRows(results.map(normalizeRow));
      setPagination({
        current_page: Number(paginator.current_page || page || 1),
        last_page: Math.max(1, Number(paginator.last_page || 1)),
        total: Math.max(0, Number(paginator.total || results.length || 0)),
      });
    } catch (err) {
      setRows([]);
      setPagination({
        current_page: 1,
        last_page: 1,
        total: 0,
      });
      setError(err?.message || 'Failed to load trip requests');
    } finally {
      setLoading(false);
    }
  }, [activeTab, limit, page, search]);

  useEffect(() => {
    setPage(1);
  }, [activeTab, limit, search]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  // Frontend Filtering
  const filteredRows = useMemo(() => {
    return rows.filter(row => {
      if (activeFilters.transportType && row.transportType.toLowerCase() !== activeFilters.transportType.toLowerCase()) return false;
      if (activeFilters.paymentOption && row.paymentOption.toLowerCase() !== activeFilters.paymentOption.toLowerCase()) return false;
      if (activeFilters.driverAssigned === 'assigned' && row.driverName === '--') return false;
      if (activeFilters.driverAssigned === 'unassigned' && row.driverName !== '--') return false;
      
      if (activeFilters.dateFrom || activeFilters.dateTo) {
        const rowDate = new Date(row.date);
        if (!isNaN(rowDate.getTime())) {
          if (activeFilters.dateFrom) {
            const fromDate = new Date(activeFilters.dateFrom);
            if (rowDate < fromDate) return false;
          }
          if (activeFilters.dateTo) {
            const toDate = new Date(activeFilters.dateTo);
            toDate.setHours(23, 59, 59, 999);
            if (rowDate > toDate) return false;
          }
        }
      }
      return true;
    });
  }, [rows, activeFilters]);

  const applyFilters = () => {
    setActiveFilters(draftFilters);
    setShowFilters(false);
  };

  const resetFilters = () => {
    const emptyFilters = { transportType: '', paymentOption: '', driverAssigned: '', dateFrom: '', dateTo: '' };
    setDraftFilters(emptyFilters);
    setActiveFilters(emptyFilters);
    setShowFilters(false);
  };

  const activeFilterCount = Object.values(activeFilters).filter(Boolean).length;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      <div className="px-4 py-2 md:px-6 md:pt-2 md:pb-6 space-y-4 max-w-full">
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-white rounded-xl shadow-sm border border-gray-100">
          <h1 className="text-xl font-bold tracking-tight text-gray-900">Trip Requests</h1>
          <div className="hidden md:flex items-center gap-2 text-xs font-medium text-gray-400">
            <span>Operations</span>
            <ChevronRight size={14} className="text-gray-300" />
            <ChevronRight size={12} className="text-gray-300" />
            <span className="text-gray-600">Trip Requests</span>
          </div>
        </div>

        {/* Main Content Box */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm flex flex-col relative">
          
          {/* Controls Bar */}
          <div className="flex flex-col gap-4 border-b border-gray-100 px-4 py-3 lg:flex-row lg:items-center">
            
            <div className="flex items-center gap-2 text-sm font-medium text-gray-500 shrink-0">
              <span>Show</span>
              <select
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="h-9 w-16 border border-gray-200 rounded-lg bg-gray-50 px-2 outline-none focus:ring-1 focus:ring-yellow-400 focus:border-yellow-400 text-gray-700"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>

            {/* Tabs */}
            <div className="flex flex-1 items-center gap-1 overflow-x-auto no-scrollbar border-b border-gray-100 lg:border-b-0 pb-1 lg:pb-0 lg:justify-center">
              {TAB_SET.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`relative px-4 py-2 text-sm font-bold transition-colors whitespace-nowrap rounded-t-lg lg:rounded-lg ${
                    activeTab === tab ? 'text-gray-900 bg-yellow-50 lg:bg-transparent' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {tab}
                  {activeTab === tab && (
                    <motion.div layoutId="trip-tab" className="absolute -bottom-1 lg:-bottom-2 left-0 right-0 h-0.5 bg-yellow-400 rounded-t-full" />
                  )}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search requests..."
                  className="h-8 w-full sm:w-48 rounded-md border border-gray-200 bg-gray-50 pl-8 pr-3 text-[11px] outline-none focus:bg-white focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 transition-all"
                />
              </div>
              <button 
                onClick={() => setShowFilters(!showFilters)}
                className={`flex h-8 items-center gap-1.5 px-3 rounded-md text-[11px] font-bold transition-colors border relative ${activeFilterCount > 0 ? 'bg-yellow-400 text-black border-yellow-400 shadow-sm' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}
              >
                <Filter size={13} /> Filters
                {activeFilterCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-black text-white text-[9px] rounded-full flex items-center justify-center font-bold">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Filter Dropdown/Panel */}
          {showFilters && (
            <div className="absolute right-0 top-[76px] lg:top-[68px] z-40 bg-white border border-gray-200 shadow-xl rounded-xl p-4 w-[280px] m-4 sm:m-0 sm:mr-5 animate-in slide-in-from-top-2">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-gray-900 text-xs">Advanced Filters</h3>
                <button onClick={() => setShowFilters(false)} className="text-gray-400 hover:text-gray-900 bg-gray-50 p-1 rounded-md"><X size={14}/></button>
              </div>
              
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 mb-1">Transport Type</label>
                  <select 
                    value={draftFilters.transportType} 
                    onChange={e => setDraftFilters({...draftFilters, transportType: e.target.value})}
                    className="w-full h-8 border border-gray-200 rounded-md bg-gray-50 px-2 text-xs outline-none focus:border-yellow-400"
                  >
                    <option value="">All Types</option>
                    <option value="taxi">Taxi</option>
                    <option value="auto">Auto</option>
                    <option value="bike">Bike</option>
                    <option value="bus">Bus</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 mb-1">Payment Option</label>
                  <select 
                    value={draftFilters.paymentOption} 
                    onChange={e => setDraftFilters({...draftFilters, paymentOption: e.target.value})}
                    className="w-full h-8 border border-gray-200 rounded-md bg-gray-50 px-2 text-xs outline-none focus:border-yellow-400"
                  >
                    <option value="">All Methods</option>
                    <option value="cash">Cash</option>
                    <option value="online">Online</option>
                    <option value="wallet">Wallet</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-500 mb-1">Driver Assignment</label>
                  <div className="flex bg-gray-50 p-1 rounded-md border border-gray-200">
                    <button 
                      onClick={() => setDraftFilters({...draftFilters, driverAssigned: ''})}
                      className={`flex-1 py-1 text-[11px] font-bold rounded ${draftFilters.driverAssigned === '' ? 'bg-white shadow-sm text-gray-900 border border-gray-100' : 'text-gray-500'}`}
                    >All</button>
                    <button 
                      onClick={() => setDraftFilters({...draftFilters, driverAssigned: 'assigned'})}
                      className={`flex-1 py-1 text-[11px] font-bold rounded ${draftFilters.driverAssigned === 'assigned' ? 'bg-white shadow-sm text-gray-900 border border-gray-100' : 'text-gray-500'}`}
                    >Assigned</button>
                    <button 
                      onClick={() => setDraftFilters({...draftFilters, driverAssigned: 'unassigned'})}
                      className={`flex-1 py-1 text-[11px] font-bold rounded ${draftFilters.driverAssigned === 'unassigned' ? 'bg-white shadow-sm text-gray-900 border border-gray-100' : 'text-gray-500'}`}
                    >Unassigned</button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 mb-1">Date From</label>
                    <input type="date" value={draftFilters.dateFrom} onChange={e => setDraftFilters({...draftFilters, dateFrom: e.target.value})} className="w-full h-8 border border-gray-200 rounded-md bg-gray-50 px-2 text-xs outline-none focus:border-yellow-400" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 mb-1">Date To</label>
                    <input type="date" value={draftFilters.dateTo} onChange={e => setDraftFilters({...draftFilters, dateTo: e.target.value})} className="w-full h-8 border border-gray-200 rounded-md bg-gray-50 px-2 text-xs outline-none focus:border-yellow-400" />
                  </div>
                </div>

              </div>

              <div className="mt-4 flex items-center gap-2">
                <button onClick={resetFilters} className="flex-1 py-1 bg-gray-100 text-gray-700 rounded text-[11px] font-bold hover:bg-gray-200 transition-colors">Reset</button>
                <button onClick={applyFilters} className="flex-1 py-1 bg-black text-white rounded text-[11px] font-bold hover:bg-gray-900 transition-colors shadow-sm">Apply Filters</button>
              </div>
            </div>
          )}

          {/* Table Container */}
          <div className="overflow-x-auto min-h-[400px]">
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-100">
                  {['Request ID', 'Date', 'User Name', 'Driver Name', 'Transport Type', 'Trip Status', 'Payment Option', 'Action'].map((heading, i) => (
                    <th key={heading} className={`px-4 py-2.5 text-[11px] font-bold text-gray-600 tracking-wide ${i === 7 ? 'text-right pr-5' : ''}`}>
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-24 text-center">
                      <Loader2 className="animate-spin text-gray-300 mx-auto" size={32} />
                      <p className="mt-3 text-xs font-semibold text-gray-400 uppercase tracking-widest">Loading Requests...</p>
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan={8} className="py-20 text-center">
                       <div className="inline-flex items-center justify-center p-3 bg-red-50 text-red-500 rounded-full mb-3">
                          <XCircle size={24} />
                       </div>
                       <p className="text-sm font-bold text-red-600">{error}</p>
                    </td>
                  </tr>
                ) : filteredRows.length > 0 ? (
                  filteredRows.map((row) => (
                    <tr key={row.id} className="hover:bg-gray-50/50 transition-colors group">
                      <td className="px-4 py-2 text-[13px] font-bold text-gray-900 font-mono">{row.requestId}</td>
                      <td className="px-4 py-2 text-[13px] font-medium text-gray-500">{formatDate(row.date)}</td>
                      <td className="px-4 py-2 text-[13px] font-bold text-gray-700">{row.userName}</td>
                      <td className="px-4 py-2 text-[13px] font-semibold text-gray-500">
                         {row.driverName !== '--' ? row.driverName : <span className="text-gray-300 italic">Unassigned</span>}
                      </td>
                      <td className="px-4 py-2 text-[13px] font-bold text-gray-700 capitalize">{row.transportType.toLowerCase()}</td>
                      <td className="px-4 py-2">
                        <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded capitalize tracking-wide ${STATUS_STYLES[row.tripStatus] || 'bg-gray-100 text-gray-600'}`}>
                          {row.tripStatus ? row.tripStatus.toLowerCase() : 'Unknown'}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded capitalize tracking-wide ${PAYMENT_STYLES[row.paymentOption] || 'bg-gray-100 text-gray-600 border border-gray-200'}`}>
                          {row.paymentOption ? row.paymentOption.toLowerCase() : 'Cash'}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <ActionMenu 
                          row={row} 
                          onViewDetails={() => setSelectedTrip(row)} 
                          onPrintInvoice={() => handlePrintInvoice(row)}
                        />
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="py-24 text-center">
                      <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center text-gray-300 mx-auto mb-3">
                         <Filter size={24} />
                      </div>
                      <p className="text-sm font-bold text-gray-900">No requests found</p>
                      <p className="text-xs text-gray-400 font-medium mt-1">Try adjusting your active filters or search term.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          
          {/* Pagination */}
          <div className="flex flex-col gap-3 border-t border-gray-100 px-4 py-3 text-[13px] text-gray-500 lg:flex-row lg:items-center lg:justify-between bg-gray-50/30">
            <p className="text-center lg:text-left font-medium">
              Showing page <span className="font-bold text-gray-900">{pagination.current_page}</span> of{' '}
              <span className="font-bold text-gray-900">{pagination.last_page}</span>
              {' '}for <span className="font-bold text-gray-900">{pagination.total}</span> entries
            </p>

            <div className="flex justify-center items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={loading || pagination.current_page <= 1}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2 font-bold text-gray-700 hover:bg-gray-50 hover:text-gray-900 disabled:opacity-50 disabled:hover:bg-white shadow-sm transition-all"
              >
                Previous
              </button>
              <div className="min-w-[3rem] text-center font-bold text-gray-900 bg-gray-100 py-1.5 px-3 rounded-lg">
                {pagination.current_page}
              </div>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(pagination.last_page, current + 1))}
                disabled={loading || pagination.current_page >= pagination.last_page}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2 font-bold text-gray-700 hover:bg-gray-50 hover:text-gray-900 disabled:opacity-50 disabled:hover:bg-white shadow-sm transition-all"
              >
                Next
              </button>
            </div>
          </div>

        </div>
      </div>
      
      <TripDetailsModal trip={selectedTrip} onClose={() => setSelectedTrip(null)} />
    </div>
  );
};

export default Trips;
