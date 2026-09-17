import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Filter, LoaderCircle, MoreVertical, Search, CheckCircle, Clock, XCircle, MapPin, Truck, ChevronRight, X, FileText, UserPlus, Eye, Download, User, CreditCard } from 'lucide-react';
import { adminService } from '../../services/adminService';
import toast from 'react-hot-toast';

const STATUS_STYLES = {
  COMPLETED: 'bg-green-100 text-green-700 border border-green-200',
  CANCELLED: 'bg-red-100 text-red-700 border border-red-200',
  PENDING: 'bg-yellow-100 text-yellow-700 border border-yellow-200',
  UPCOMING: 'bg-yellow-100 text-yellow-700 border border-yellow-200',
  ON_TRIP: 'bg-blue-100 text-blue-700 border border-blue-200',
  ONGOING: 'bg-blue-100 text-blue-700 border border-blue-200',
  ASSIGNED: 'bg-purple-100 text-purple-700 border border-purple-200',
};

const PAYMENT_STYLES = {
  CASH: 'bg-gray-100 text-gray-700 border border-gray-200',
  ONLINE: 'bg-blue-50 text-blue-600 border border-blue-100',
  UPI: 'bg-indigo-50 text-indigo-600 border border-indigo-100',
  CARD: 'bg-purple-50 text-purple-600 border border-purple-100',
  WALLET: 'bg-teal-50 text-teal-600 border border-teal-100',
  COD: 'bg-orange-50 text-orange-600 border border-orange-100',
};

const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const optionsDate = { day: '2-digit', month: 'short', year: 'numeric' };
  const optionsTime = { hour: '2-digit', minute: '2-digit', hour12: true };
  const dPart = d.toLocaleDateString('en-GB', optionsDate);
  const tPart = d.toLocaleTimeString('en-US', optionsTime);
  return `${dPart} • ${tPart}`;
};

const handlePrintInvoice = (delivery) => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert("Please allow popups to print invoices.");
    return;
  }
  
  const formattedDate = formatDate(delivery.date);
  
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Delivery Invoice - ${delivery.requestId}</title>
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
          <h1 class="title">DELIVERY INVOICE</h1>
          <p class="subtitle">Request ID: <span class="highlight">${delivery.requestId || 'N/A'}</span></p>
        </div>
        <table class="details">
          <tr><th>Date</th><td>${formattedDate}</td></tr>
          <tr><th>Customer</th><td>${delivery.userName || 'N/A'}</td></tr>
          <tr><th>Driver</th><td>${delivery.driverName || 'N/A'}</td></tr>
          <tr><th>Transport Type</th><td style="text-transform: capitalize;">${String(delivery.transportType || '').toLowerCase()}</td></tr>
          <tr><th>Payment Method</th><td style="text-transform: capitalize;">${String(delivery.paymentOption || '').toLowerCase()}</td></tr>
          <tr><th>Delivery Status</th><td style="text-transform: capitalize;">${String(delivery.tripStatus || '').toLowerCase()}</td></tr>
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

const DeliveryDetailsDrawer = ({ delivery, onClose }) => {
  if (!delivery) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md shadow-2xl flex flex-col rounded-xl overflow-hidden max-h-[90vh] animate-in slide-in-from-bottom-4">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-5">
          <h2 className="text-xl font-bold text-gray-900 tracking-tight">Delivery Details</h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          
          {/* Status & ID */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-wider font-bold text-gray-400 mb-1">Request ID</p>
              <p className="text-[14px] font-bold text-gray-900 font-mono">{delivery.requestId || 'N/A'}</p>
            </div>
            <span className={`inline-flex items-center px-3 py-1 text-[11px] font-bold rounded-full capitalize tracking-wide ${STATUS_STYLES[delivery.tripStatus] || 'bg-gray-100 text-gray-600'}`}>
              {String(delivery.tripStatus || '').toLowerCase()}
            </span>
          </div>

          {/* Core Info */}
          <div className="grid grid-cols-2 gap-y-6 gap-x-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
            <div>
              <p className="text-[11px] uppercase tracking-wider font-bold text-gray-400 mb-1">Date & Time</p>
              <p className="text-[13px] font-bold text-gray-900">{formatDate(delivery.date)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider font-bold text-gray-400 mb-1">Transport</p>
              <p className="text-[13px] font-bold text-gray-900 capitalize flex items-center gap-1">
                <Truck size={14} className="text-gray-400"/>
                {String(delivery.transportType || '').toLowerCase()}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider font-bold text-gray-400 mb-1">Customer</p>
              <p className="text-[13px] font-bold text-gray-900 flex items-center gap-1">
                <User size={14} className="text-gray-400"/>
                {delivery.userName || 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider font-bold text-gray-400 mb-1">Driver</p>
              <p className="text-[13px] font-bold text-gray-900 flex items-center gap-1">
                <User size={14} className="text-gray-400"/>
                {delivery.driverName || 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider font-bold text-gray-400 mb-1">Payment Option</p>
              <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded capitalize tracking-wide ${PAYMENT_STYLES[delivery.paymentOption] || 'bg-gray-100 text-gray-600'}`}>
                {String(delivery.paymentOption || '').toLowerCase()}
              </span>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider font-bold text-gray-400 mb-1">Distance / Fare</p>
              <p className="text-[13px] font-bold text-gray-900">{delivery.distance || '-'} / {delivery.fare || '-'}</p>
            </div>
          </div>
          
        </div>
        <div className="border-t border-gray-100 p-5 bg-white flex justify-end gap-3">
          <button onClick={() => handlePrintInvoice(delivery)} className="px-5 py-2 text-sm font-bold text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2">
            <FileText size={16} /> Print
          </button>
          <button onClick={onClose} className="px-5 py-2 text-sm font-bold text-white bg-black rounded-lg shadow-sm hover:bg-gray-900 transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

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

  const handleNotImplemented = (action) => {
    toast.error(`Backend API for '${action}' is not implemented yet.`);
    setIsOpen(false);
  };

  const isCompleted = row.tripStatus === 'COMPLETED';
  const isCancelled = row.tripStatus === 'CANCELLED';
  const isOngoing = row.tripStatus === 'ON_TRIP' || row.tripStatus === 'ONGOING';
  const hasDriver = row.driverName && row.driverName !== '--' && row.driverName !== 'N/A';

  return (
    <div className="relative" ref={menuRef}>
      <button 
        onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
        className="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-yellow-400"
        aria-label="Actions"
        aria-expanded={isOpen}
      >
        <MoreVertical size={18} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl shadow-lg border border-gray-100 py-1.5 z-50">
          <button 
            onClick={() => { setIsOpen(false); onViewDetails(); }}
            className="w-full text-left px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-yellow-50 hover:text-yellow-900 flex items-center gap-2"
          >
            <Eye size={14} /> View Details
          </button>
          <button 
            disabled={isCompleted || isCancelled || isOngoing || hasDriver}
            onClick={() => handleNotImplemented('Assign Driver')}
            className="w-full text-left px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-yellow-50 hover:text-yellow-900 flex items-center gap-2 disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-gray-700"
          >
            <UserPlus size={14} /> Assign Driver
          </button>
          <button 
            onClick={() => handleNotImplemented('Change Status')}
            className="w-full text-left px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-yellow-50 hover:text-yellow-900 flex items-center gap-2"
          >
            <CheckCircle size={14} /> Change Status
          </button>
          <button 
            disabled={!isOngoing}
            onClick={() => handleNotImplemented('Track Delivery')}
            className="w-full text-left px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-yellow-50 hover:text-yellow-900 flex items-center gap-2 disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-gray-700"
          >
            <MapPin size={14} /> Track Delivery
          </button>
          <div className="h-px bg-gray-100 my-1"></div>
          <button 
            onClick={() => handleNotImplemented('Customer Details')}
            className="w-full text-left px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-yellow-50 hover:text-yellow-900 flex items-center gap-2"
          >
            <User size={14} /> Customer Details
          </button>
          <button 
            onClick={() => handleNotImplemented('Driver Details')}
            className="w-full text-left px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-yellow-50 hover:text-yellow-900 flex items-center gap-2"
          >
            <Truck size={14} /> Driver Details
          </button>
          <button 
            onClick={() => handleNotImplemented('Payment Details')}
            className="w-full text-left px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-yellow-50 hover:text-yellow-900 flex items-center gap-2"
          >
            <CreditCard size={14} /> Payment Details
          </button>
          <div className="h-px bg-gray-100 my-1"></div>
          <button 
            onClick={() => { setIsOpen(false); onPrintInvoice(); }}
            className="w-full text-left px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-yellow-50 hover:text-yellow-900 flex items-center gap-2"
          >
            <FileText size={14} /> Print Invoice
          </button>
          <button 
            onClick={() => { setIsOpen(false); onPrintInvoice(); }}
            className="w-full text-left px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-yellow-50 hover:text-yellow-900 flex items-center gap-2"
          >
            <Download size={14} /> Download Invoice
          </button>
          <div className="h-px bg-gray-100 my-1"></div>
          <button 
            disabled={isCompleted || isCancelled}
            onClick={() => handleNotImplemented('Cancel Delivery')}
            className="w-full text-left px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 flex items-center gap-2 disabled:opacity-40 disabled:hover:bg-white"
          >
            <XCircle size={14} /> Cancel Delivery
          </button>
        </div>
      )}
    </div>
  );
};

const StatCard = ({ title, value, icon: Icon, colorClass }) => (
  <div className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm flex items-center gap-3 transition-transform hover:-translate-y-0.5 duration-200">
    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${colorClass}`}>
      <Icon size={14} />
    </div>
    <div>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">{title}</p>
      <p className="text-base font-black text-gray-900 leading-none">{value}</p>
    </div>
  </div>
);

const Deliveries = () => {
  const [selectedDelivery, setSelectedDelivery] = useState(null);
  const [activeTab, setActiveTab] = useState('All');
  const [pageSize, setPageSize] = useState('10');
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [rows, setRows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Stats
  const [stats, setStats] = useState({
    total: 0,
    completed: 0,
    pending: 0,
    cancelled: 0,
    onTrip: 0,
    today: 0,
  });

  const [draftFilters, setDraftFilters] = useState({
    status: '',
    transportType: '',
    paymentType: '',
    driverAssigned: '',
    dateFrom: '',
    dateTo: '',
    city: ''
  });
  
  const [activeFilters, setActiveFilters] = useState({
    status: '',
    transportType: '',
    paymentType: '',
    driverAssigned: '',
    dateFrom: '',
    dateTo: '',
    city: ''
  });

  useEffect(() => {
    let active = true;
    const loadDeliveries = async () => {
      setIsLoading(true);
      setError('');
      try {
        const response = await adminService.getDeliveries({
          page: 1,
          limit: Number(pageSize) || 10,
          tab: activeTab.toLowerCase(),
          search,
          ...activeFilters // if API supports them
        });
        
        const payload = response?.data || response || {};
        const results = payload?.results || [];
        
        if (!active) return;
        setRows(results);
        
        // Derive stats if backend doesn't provide them yet
        if (payload?.stats) {
          setStats(payload.stats);
        } else {
          // Mock stats derived from results for visual placeholder until backend API provides it
          const completed = results.filter(r => r.tripStatus === 'COMPLETED').length;
          const cancelled = results.filter(r => r.tripStatus === 'CANCELLED').length;
          const onTrip = results.filter(r => r.tripStatus === 'ON_TRIP' || r.tripStatus === 'ONGOING').length;
          const pending = results.filter(r => r.tripStatus === 'PENDING' || r.tripStatus === 'UPCOMING').length;
          setStats({
            total: payload.paginator?.total || results.length || 0,
            completed,
            pending,
            cancelled,
            onTrip,
            today: results.length > 0 ? Math.floor(results.length / 2) : 0, 
          });
        }
      } catch (loadError) {
        if (active) {
          setRows([]);
          setError(loadError?.message || 'Could not load deliveries.');
        }
      } finally {
        if (active) setIsLoading(false);
      }
    };
    loadDeliveries();
    return () => { active = false; };
  }, [activeTab, pageSize, search, activeFilters]);

  const applyFilters = () => {
    setActiveFilters(draftFilters);
    setShowFilters(false);
  };

  const resetFilters = () => {
    const emptyFilters = { status: '', transportType: '', paymentType: '', driverAssigned: '', dateFrom: '', dateTo: '', city: '' };
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
          <div>
            <h1 className="text-lg font-bold tracking-tight text-gray-900">Delivery Requests</h1>
            <p className="text-xs text-gray-500 mt-0.5 font-medium">Manage and monitor all delivery requests across the platform.</p>
          </div>
          <div className="hidden md:flex items-center gap-2 text-xs font-medium text-gray-400">
            <span>Operations</span>
            <ChevronRight size={14} className="text-gray-300" />
            <span className="text-gray-600">Delivery Requests</span>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          <StatCard title="Total Requests" value={stats.total} icon={Truck} colorClass="bg-gray-100 text-gray-700" />
          <StatCard title="Completed" value={stats.completed} icon={CheckCircle} colorClass="bg-green-100 text-green-600" />
          <StatCard title="Pending" value={stats.pending} icon={Clock} colorClass="bg-yellow-100 text-yellow-600" />
          <StatCard title="Cancelled" value={stats.cancelled} icon={XCircle} colorClass="bg-red-100 text-red-600" />
          <StatCard title="On Trip" value={stats.onTrip} icon={MapPin} colorClass="bg-blue-100 text-blue-600" />
          <StatCard title="Today" value={stats.today} icon={Clock} colorClass="bg-purple-100 text-purple-600" />
        </div>

        {/* Main Content Box */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm flex flex-col relative">
          
          {/* Controls Bar */}
          <div className="flex flex-col gap-4 border-b border-gray-100 px-4 py-3 lg:flex-row lg:items-center">
            
            <div className="flex items-center gap-2 text-xs font-medium text-gray-500 shrink-0">
              <span>Show</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(e.target.value)}
                className="h-8 w-14 border border-gray-200 rounded-md bg-gray-50 px-1.5 outline-none focus:ring-1 focus:ring-yellow-400 focus:border-yellow-400 text-gray-700 font-bold text-[11px]"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
              <span>Entries</span>
            </div>

            {/* Tabs */}
            <div className="flex flex-1 items-center gap-1 overflow-x-auto no-scrollbar border-b border-gray-100 lg:border-b-0 pb-1 lg:pb-0 lg:justify-center">
              {['All', 'Completed', 'Cancelled', 'Upcoming', 'On Trip'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`relative px-3 py-1.5 text-xs font-bold transition-colors whitespace-nowrap rounded-t-md lg:rounded-md ${
                    activeTab === tab ? 'text-gray-900 bg-yellow-50 lg:bg-transparent' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {tab}
                  {activeTab === tab && (
                    <div className="absolute -bottom-1 lg:-bottom-2 left-0 right-0 h-0.5 bg-yellow-400 rounded-t-full hidden lg:block" />
                  )}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <div className="relative w-full sm:w-48">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search deliveries..."
                  className="h-8 w-full rounded-md border border-gray-200 bg-gray-50 pl-8 pr-3 text-[11px] outline-none focus:bg-white focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 transition-all font-medium"
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
              <button 
                onClick={() => handleNotImplemented('Refresh')}
                className="hidden sm:flex h-8 items-center justify-center px-3 rounded-md border border-gray-200 bg-white text-[11px] font-bold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Refresh
              </button>
            </div>
          </div>

          {/* Filter Dropdown */}
          {showFilters && (
            <div className="absolute right-0 top-[110px] lg:top-[60px] z-40 bg-white border border-gray-200 shadow-xl rounded-xl p-4 w-72 max-w-[calc(100vw-2rem)] mr-4 lg:mr-6 animate-in slide-in-from-top-2">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-gray-900 border-l-2 border-yellow-400 pl-2">Advanced Filters</h3>
                <button onClick={() => setShowFilters(false)} className="text-gray-400 hover:text-gray-800"><X size={16}/></button>
              </div>
              
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 mb-1">Status</label>
                  <select 
                    value={draftFilters.status} 
                    onChange={e => setDraftFilters({...draftFilters, status: e.target.value})}
                    className="w-full h-8 border border-gray-200 rounded-md bg-gray-50 px-2 text-xs outline-none focus:border-yellow-400 font-medium"
                  >
                    <option value="">All Statuses</option>
                    <option value="pending">Pending</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="on_trip">On Trip</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-500 mb-1">Transport Type</label>
                  <select 
                    value={draftFilters.transportType} 
                    onChange={e => setDraftFilters({...draftFilters, transportType: e.target.value})}
                    className="w-full h-8 border border-gray-200 rounded-md bg-gray-50 px-2 text-xs outline-none focus:border-yellow-400 font-medium"
                  >
                    <option value="">All Types</option>
                    <option value="bike">Bike</option>
                    <option value="van">Van</option>
                    <option value="truck">Truck</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 mb-1">Payment Type</label>
                  <select 
                    value={draftFilters.paymentType} 
                    onChange={e => setDraftFilters({...draftFilters, paymentType: e.target.value})}
                    className="w-full h-8 border border-gray-200 rounded-md bg-gray-50 px-2 text-xs outline-none focus:border-yellow-400 font-medium"
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
                    <button onClick={() => setDraftFilters({...draftFilters, driverAssigned: ''})} className={`flex-1 py-1 text-[11px] font-bold rounded ${draftFilters.driverAssigned === '' ? 'bg-white shadow-sm text-gray-900 border border-gray-100' : 'text-gray-500'}`}>All</button>
                    <button onClick={() => setDraftFilters({...draftFilters, driverAssigned: 'assigned'})} className={`flex-1 py-1 text-[11px] font-bold rounded ${draftFilters.driverAssigned === 'assigned' ? 'bg-white shadow-sm text-gray-900 border border-gray-100' : 'text-gray-500'}`}>Assigned</button>
                    <button onClick={() => setDraftFilters({...draftFilters, driverAssigned: 'unassigned'})} className={`flex-1 py-1 text-[11px] font-bold rounded ${draftFilters.driverAssigned === 'unassigned' ? 'bg-white shadow-sm text-gray-900 border border-gray-100' : 'text-gray-500'}`}>Unassigned</button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 mb-1">Date From</label>
                    <input type="date" value={draftFilters.dateFrom} onChange={e => setDraftFilters({...draftFilters, dateFrom: e.target.value})} className="w-full h-8 border border-gray-200 rounded-md bg-gray-50 px-2 text-[10px] outline-none focus:border-yellow-400 font-medium" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 mb-1">Date To</label>
                    <input type="date" value={draftFilters.dateTo} onChange={e => setDraftFilters({...draftFilters, dateTo: e.target.value})} className="w-full h-8 border border-gray-200 rounded-md bg-gray-50 px-2 text-[10px] outline-none focus:border-yellow-400 font-medium" />
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2">
                <button onClick={resetFilters} className="flex-1 py-1 bg-gray-100 text-gray-700 rounded text-[11px] font-bold hover:bg-gray-200 transition-colors">Clear Filters</button>
                <button onClick={applyFilters} className="flex-1 py-1 bg-black text-white rounded text-[11px] font-bold hover:bg-gray-900 transition-colors shadow-sm">Apply Filters</button>
              </div>
            </div>
          )}

          {/* Table Container */}
          <div className="overflow-x-auto min-h-[400px]">
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead className="sticky top-0 z-10 bg-white">
                <tr className="bg-gray-50/80 border-b border-gray-100">
                  {['Request ID', 'Date', 'User Name', 'Driver Name', 'Transport Type', 'Trip Status', 'Payment Option', 'Actions'].map((heading, i) => (
                    <th key={heading} className={`px-4 py-2.5 text-[11px] font-bold text-gray-600 tracking-wide ${i === 7 ? 'text-right pr-6' : ''}`}>
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="py-24 text-center">
                      <LoaderCircle className="animate-spin text-yellow-400 mx-auto" size={32} />
                      <p className="mt-3 text-xs font-bold text-gray-400 uppercase tracking-widest">Loading Deliveries...</p>
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan={8} className="py-24 text-center">
                      <div className="bg-red-50 text-red-500 p-4 rounded-lg inline-block border border-red-100">
                        <XCircle size={24} className="mx-auto mb-2" />
                        <p className="text-sm font-bold">{error}</p>
                        <button onClick={() => window.location.reload()} className="mt-3 px-4 py-1.5 bg-red-100 text-red-700 rounded text-xs font-bold hover:bg-red-200">
                          Retry
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-24 text-center">
                      <div className="mx-auto flex flex-col items-center justify-center opacity-50">
                        <Truck size={48} className="text-gray-300 mb-3" />
                        <p className="text-sm font-bold text-gray-500">No delivery requests found</p>
                        <p className="text-xs text-gray-400 font-medium mt-1">Try adjusting your filters or search term.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id || row.requestId || Math.random()} className="hover:bg-yellow-50/30 transition-colors group cursor-pointer" onClick={() => setSelectedDelivery(row)}>
                      <td className="px-4 py-2 text-[13px] font-bold text-gray-900 font-mono">{row.requestId || '-'}</td>
                      <td className="px-4 py-2 text-[12px] font-medium text-gray-600">{formatDate(row.date)}</td>
                      <td className="px-4 py-2 text-[13px] font-bold text-gray-800">{row.userName || '-'}</td>
                      <td className="px-4 py-2 text-[13px] font-medium text-gray-700">{row.driverName || '--'}</td>
                      <td className="px-4 py-2 text-[13px] font-bold text-gray-700 capitalize">{String(row.transportType || '').toLowerCase()}</td>
                      <td className="px-4 py-2">
                        <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded capitalize tracking-wide ${STATUS_STYLES[row.tripStatus] || 'bg-gray-100 text-gray-600 border border-gray-200'}`}>
                          {row.tripStatus ? String(row.tripStatus).replace('_', ' ').toLowerCase() : 'Unknown'}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded capitalize tracking-wide ${PAYMENT_STYLES[row.paymentOption] || 'bg-gray-100 text-gray-600 border border-gray-200'}`}>
                          {row.paymentOption ? String(row.paymentOption).toLowerCase() : 'Cash'}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <ActionMenu 
                          row={row} 
                          onViewDetails={() => setSelectedDelivery(row)} 
                          onPrintInvoice={() => handlePrintInvoice(row)}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {!isLoading && rows.length > 0 && (
            <div className="border-t border-gray-100 px-4 py-3 bg-gray-50/50 flex flex-col sm:flex-row items-center justify-between gap-3">
              <span className="text-xs font-medium text-gray-500">
                Showing <span className="font-bold text-gray-900">1–{rows.length}</span> of <span className="font-bold text-gray-900">{stats.total || rows.length}</span> entries
              </span>
              <div className="flex items-center gap-1">
                <button className="px-3 py-1.5 text-xs font-bold text-gray-600 bg-white border border-gray-200 rounded hover:bg-gray-50 transition-colors disabled:opacity-50">Previous</button>
                <button className="px-3 py-1.5 text-xs font-bold text-white bg-black rounded hover:bg-gray-900 transition-colors shadow-sm disabled:opacity-50">Next</button>
              </div>
            </div>
          )}
        </div>
      </div>

      <DeliveryDetailsDrawer 
        delivery={selectedDelivery} 
        onClose={() => setSelectedDelivery(null)} 
      />
    </div>
  );
};

export default Deliveries;
