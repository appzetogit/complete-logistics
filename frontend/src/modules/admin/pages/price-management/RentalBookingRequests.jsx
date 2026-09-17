import React, { useEffect, useMemo, useState } from 'react';
import { GoogleMap, MarkerF } from '@react-google-maps/api';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CreditCard,
  Eye,
  Loader2,
  MapPin,
  Phone,
  Search,
  ShieldCheck,
  User2,
  X,
  SlidersHorizontal,
  MoreVertical,
  Calendar,
  Sparkles,
  ClipboardList,
  CheckCircle2,
  PlayCircle,
  CheckSquare,
  XCircle,
  TrendingUp,
  DollarSign,
  Info,
  Activity,
  ArrowUp,
  BatteryMedium,
  Signal,
  Car,
  Zap,
  Gauge,
  ArrowLeft,
  RefreshCw,
  UserPlus,
  PowerOff,
  Download,
  Focus,
  Layers,
  Map as MapIcon,
  Maximize2,
  Minimize2,
  Star,
  Fuel,
  Key,
  FileCheck2,
  Route,
  Timer,
  ShieldAlert,
  Hash,
  Laptop,
  Smartphone,
  Globe,
  Printer,
  ChevronDown,
  Compass,
  Trash
} from 'lucide-react';
import toast from 'react-hot-toast';
import { adminService } from '../../services/adminService';
import { useBaseGoogleMapsLoader } from '../../utils/googleMaps';

const mapContainerStyle = { width: '100%', height: '100%' };

// Isolated map widget — keeps hook in its own component so it never crashes the parent page
const MapWidget = ({ coordinates }) => {
  const { isLoaded } = useBaseGoogleMapsLoader();
  if (!isLoaded) return (
    <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-400">
      <Loader2 size={18} className="animate-spin mr-1" /> Loading map...
    </div>
  );
  const center = { lat: Number(coordinates[1]), lng: Number(coordinates[0]) };
  return (
    <GoogleMap mapContainerStyle={mapContainerStyle} center={center} zoom={14}
      options={{ fullscreenControl: true, zoomControl: true, streetViewControl: false, mapTypeControl: true }}>
      <MarkerF position={center} />
    </GoogleMap>
  );
};

const statusClasses = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  confirmed: 'bg-blue-50 text-blue-700 border-blue-200',
  assigned: 'bg-violet-50 text-violet-700 border-violet-200',
  end_requested: 'bg-orange-50 text-orange-700 border-orange-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-rose-50 text-rose-700 border-rose-200',
};

const bookingStatusOptions = [
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed (Approved)' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'end_requested', label: 'End Requested' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const paymentStatusClasses = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  not_required: 'bg-slate-100 text-slate-600 border-slate-200',
  failed: 'bg-rose-50 text-rose-700 border-rose-200',
};

const formatDateTime = (value) => {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return 'Not set';
  return parsed.toLocaleString();
};

const formatAmount = (value) => `Rs.${Number(value || 0).toLocaleString()}`;

const formatCommissionRule = (type, value) =>
  type === 'fixed' ? `${formatAmount(value)} fixed` : `${Number(value || 0)}%`;

const toRentalRequestList = (response) => {
  const candidates = [
    response?.data?.data?.results,
    response?.data?.results,
    response?.results,
    response?.data?.data,
    response?.data,
  ];
  const firstArray = candidates.find((candidate) => Array.isArray(candidate));
  return Array.isArray(firstArray) ? firstArray : [];
};

const RentalBookingRequests = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [page, setPage] = useState(1);
  const [vehicles, setVehicles] = useState([]);
  const [activeActionMenuId, setActiveActionMenuId] = useState(null);
  const [showAssignVehicleDialog, setShowAssignVehicleDialog] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: 'createdAt', direction: 'desc' });

  // Advanced Filters State
  const [showFilters, setShowFilters] = useState(false);
  const [filterState, setFilterState] = useState({
    search: '',
    dateRange: 'all', // 'today', 'yesterday', 'this_week', 'this_month', 'custom'
    startDate: '',
    endDate: '',
    status: 'all',
    paymentStatus: 'all',
    vehicleType: 'all',
    storeId: 'all',
    duration: 'all',
    location: 'all',
  });

  const [activeFilters, setActiveFilters] = useState({ ...filterState });

  // Load Main Booking Requests
  const load = async () => {
    setLoading(true);
    try {
      const response = await adminService.getRentalBookingRequests();
      const results = toRentalRequestList(response);
      setItems(results);
    } catch (error) {
      toast.error(error?.message || 'Could not load rental requests.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    
    // Load Vehicles list for assignments and metadata
    const loadVehicles = async () => {
      try {
        const vRes = await adminService.getRentalVehicleTypes();
        setVehicles(vRes?.data?.results || vRes?.results || []);
      } catch (e) {
        console.error('Could not load vehicles', e);
      }
    };
    loadVehicles();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [itemsPerPage, activeFilters]);

  // Click outside listener for actions menu
  useEffect(() => {
    const handleOutsideClick = () => setActiveActionMenuId(null);
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

  const safeItems = useMemo(() => (Array.isArray(items) ? items : []), [items]);

  // Stats Derived
  const totalCount = safeItems.length;
  const pendingCount = useMemo(() => safeItems.filter((item) => item?.status === 'pending').length, [safeItems]);
  const approvedCount = useMemo(() => safeItems.filter((item) => item?.status === 'confirmed').length, [safeItems]);
  const activeRentalsCount = useMemo(() => safeItems.filter((item) => item?.status === 'assigned' || item?.status === 'end_requested').length, [safeItems]);
  const completedCount = useMemo(() => safeItems.filter((item) => item?.status === 'completed').length, [safeItems]);
  const cancelledCount = useMemo(() => safeItems.filter((item) => item?.status === 'cancelled').length, [safeItems]);
  const paidCount = useMemo(() => safeItems.filter((item) => item?.paymentStatus === 'paid').length, [safeItems]);

  const revenueToday = useMemo(() => {
    const todayStr = new Date().toDateString();
    return safeItems
      .filter((item) => item.paymentStatus === 'paid' && item.createdAt && new Date(item.createdAt).toDateString() === todayStr)
      .reduce((sum, item) => sum + (item.totalCost || item.payableNow || 0), 0);
  }, [safeItems]);

  // Dynamic filter lists from dataset
  const uniqueStores = useMemo(() => {
    const list = safeItems.map((item) => item.serviceLocation?.name || item.commissionSnapshot?.serviceStoreName).filter(Boolean);
    return Array.from(new Set(list));
  }, [safeItems]);

  const uniqueLocations = useMemo(() => {
    const list = safeItems.map((item) => item.serviceLocation?.city).filter(Boolean);
    return Array.from(new Set(list));
  }, [safeItems]);

  // Advanced Client Side Filtering
  const filteredItems = useMemo(() => {
    let result = safeItems;

    // Search query
    const query = activeFilters.search.trim().toLowerCase();
    if (query) {
      result = result.filter((item) =>
        [
          item?.bookingReference,
          item?.vehicleName,
          item?.vehicleCategory,
          item?.selectedPackage?.label,
          item?.userId?.name,
          item?.contactName,
          item?.userId?.phone,
          item?.contactPhone,
          item?.serviceLocation?.name,
          item?.status,
          item?.paymentStatus,
        ]
          .filter(Boolean)
          .some((val) => String(val).toLowerCase().includes(query))
      );
    }

    // Date Filter Range
    const now = new Date();
    const todayStr = now.toDateString();
    if (activeFilters.dateRange === 'today') {
      result = result.filter(item => item.createdAt && new Date(item.createdAt).toDateString() === todayStr);
    } else if (activeFilters.dateRange === 'yesterday') {
      const yesterdayStr = new Date(Date.now() - 86400000).toDateString();
      result = result.filter(item => item.createdAt && new Date(item.createdAt).toDateString() === yesterdayStr);
    } else if (activeFilters.dateRange === 'this_week') {
      const sunday = new Date(now.setDate(now.getDate() - now.getDay()));
      sunday.setHours(0, 0, 0, 0);
      result = result.filter(item => item.createdAt && new Date(item.createdAt) >= sunday);
    } else if (activeFilters.dateRange === 'this_month') {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      result = result.filter(item => item.createdAt && new Date(item.createdAt) >= startOfMonth);
    } else if (activeFilters.dateRange === 'custom') {
      if (activeFilters.startDate) {
        const start = new Date(activeFilters.startDate);
        start.setHours(0, 0, 0, 0);
        result = result.filter(item => item.createdAt && new Date(item.createdAt) >= start);
      }
      if (activeFilters.endDate) {
        const end = new Date(activeFilters.endDate);
        end.setHours(23, 59, 59, 999);
        result = result.filter(item => item.createdAt && new Date(item.createdAt) <= end);
      }
    }

    // Status Filter
    if (activeFilters.status !== 'all') {
      if (activeFilters.status === 'approved') {
        result = result.filter(item => item.status === 'confirmed');
      } else if (activeFilters.status === 'running') {
        result = result.filter(item => item.status === 'assigned' || item.status === 'end_requested');
      } else {
        result = result.filter(item => item.status === activeFilters.status);
      }
    }

    // Payment Status Filter
    if (activeFilters.paymentStatus !== 'all') {
      result = result.filter(item => item.paymentStatus === activeFilters.paymentStatus);
    }

    // Vehicle Type Filter
    if (activeFilters.vehicleType !== 'all') {
      const vt = activeFilters.vehicleType.toLowerCase();
      result = result.filter(item => {
        const cat = String(item.vehicleCategory || item.vehicleTypeId?.vehicleCategory || '').toLowerCase();
        const name = String(item.vehicleName || item.vehicleTypeId?.name || '').toLowerCase();
        return cat.includes(vt) || name.includes(vt);
      });
    }

    // Store Filter
    if (activeFilters.storeId !== 'all') {
      result = result.filter(item => {
        const storeName = item.serviceLocation?.name || item.commissionSnapshot?.serviceStoreName || '';
        return storeName === activeFilters.storeId;
      });
    }

    // Duration Filter
    if (activeFilters.duration !== 'all') {
      result = result.filter(item => {
        const hours = Number(item.requestedHours || item.selectedPackage?.durationHours || 0);
        if (activeFilters.duration === 'hourly') return hours < 24;
        if (activeFilters.duration === 'daily') return hours >= 24 && hours < 168;
        if (activeFilters.duration === 'weekly') return hours >= 168;
        return true;
      });
    }

    // Location (City) Filter
    if (activeFilters.location !== 'all') {
      result = result.filter(item => {
        const city = item.serviceLocation?.city || '';
        return city.toLowerCase() === activeFilters.location.toLowerCase();
      });
    }

    return result;
  }, [safeItems, activeFilters]);

  // Table Column Header Click Sorting
  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedItems = useMemo(() => {
    const sortable = [...filteredItems];
    if (sortConfig.key) {
      sortable.sort((a, b) => {
        let valA, valB;
        if (sortConfig.key === 'bookingReference') {
          valA = a.bookingReference || '';
          valB = b.bookingReference || '';
        } else if (sortConfig.key === 'customer') {
          valA = a.userId?.name || a.contactName || '';
          valB = b.userId?.name || b.contactName || '';
        } else if (sortConfig.key === 'totalCost') {
          valA = a.totalCost || 0;
          valB = b.totalCost || 0;
        } else if (sortConfig.key === 'pickupDateTime') {
          valA = a.pickupDateTime ? new Date(a.pickupDateTime).getTime() : 0;
          valB = b.pickupDateTime ? new Date(b.pickupDateTime).getTime() : 0;
        } else if (sortConfig.key === 'status') {
          valA = a.status || '';
          valB = b.status || '';
        } else {
          valA = a[sortConfig.key] || '';
          valB = b[sortConfig.key] || '';
        }

        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return sortable;
  }, [filteredItems, sortConfig]);

  // Pagination logic
  const totalEntries = sortedItems.length;
  const totalPages = Math.max(1, Math.ceil(totalEntries / itemsPerPage));
  const safePage = Math.min(page, totalPages);
  
  const paginatedItems = useMemo(() => {
    const start = (safePage - 1) * itemsPerPage;
    return sortedItems.slice(start, start + itemsPerPage);
  }, [sortedItems, itemsPerPage, safePage]);

  const showingFrom = totalEntries === 0 ? 0 : (safePage - 1) * itemsPerPage + 1;
  const showingTo = totalEntries === 0 ? 0 : showingFrom + paginatedItems.length - 1;

  const selectedRequest = useMemo(
    () => safeItems.find((item) => String(item?.id || item?._id) === String(selectedId)) || null,
    [safeItems, selectedId]
  );

  // Completed bookings count for selected user (for detail modal KYC/User stats)
  const completedBookingsForUser = useMemo(() => {
    if (!selectedRequest?.userId?.id) return 0;
    return safeItems.filter(item => item.userId?.id === selectedRequest.userId?.id && item.status === 'completed').length;
  }, [safeItems, selectedRequest]);

  // Local state update
  const updateLocal = (id, patch) => {
    setItems((current) =>
      (Array.isArray(current) ? current : []).map((item) =>
        String(item?.id || item?._id) === String(id) ? { ...item, ...patch } : item
      )
    );
  };

  // Status Change API Save
  const handleStatusChange = async (newStatus) => {
    if (!selectedRequest) return;
    const id = String(selectedRequest.id || selectedRequest._id);
    setSavingId(id);
    try {
      const updated = await adminService.updateRentalBookingRequest(id, {
        status: newStatus,
        adminNote: selectedRequest.adminNote || '',
      });
      const payload = updated?.data?.data || updated?.data || updated;
      updateLocal(id, payload);
      toast.success('Booking status updated');
    } catch (error) {
      toast.error(error?.message || 'Could not update status');
    } finally {
      setSavingId('');
    }
  };

  // Notes Auto-Save on Blur (Auto-saves changes without manual buttons)
  const handleNotesBlur = async () => {
    if (!selectedRequest) return;
    const id = String(selectedRequest.id || selectedRequest._id);
    setSavingId(id);
    try {
      const updated = await adminService.updateRentalBookingRequest(id, {
        adminNote: selectedRequest.adminNote || '',
      });
      const payload = updated?.data?.data || updated?.data || updated;
      updateLocal(id, payload);
      toast.success('Admin notes auto-saved');
    } catch (error) {
      toast.error(error?.message || 'Could not auto-save notes');
    } finally {
      setSavingId('');
    }
  };

  // Assign Vehicle Confirmation Action
  const handleAssignVehicleConfirm = async (vehicleId) => {
    if (!selectedRequest) return;
    const id = String(selectedRequest.id || selectedRequest._id);
    setSavingId(id);
    try {
      const updated = await adminService.updateRentalBookingRequest(id, {
        assignedVehicleId: vehicleId,
      });
      const payload = updated?.data?.data || updated?.data || updated;
      updateLocal(id, payload);
      toast.success('Vehicle assigned successfully');
      setShowAssignVehicleDialog(false);
    } catch (error) {
      toast.error(error?.message || 'Could not assign vehicle');
    } finally {
      setSavingId('');
    }
  };

  // End Trip confirmation action
  const handleEndTripConfirm = async () => {
    if (!selectedRequest) return;
    const id = String(selectedRequest.id || selectedRequest._id);
    setSavingId(id);
    try {
      const updated = await adminService.updateRentalBookingRequest(id, {
        status: 'completed',
      });
      const payload = updated?.data?.data || updated?.data || updated;
      updateLocal(id, payload);
      toast.success('Trip completed and closed');
    } catch (error) {
      toast.error(error?.message || 'Could not close trip');
    } finally {
      setSavingId('');
    }
  };

  // Apply Filter Action
  const handleApplyFilters = () => {
    setActiveFilters({ ...filterState });
    setShowFilters(false);
  };

  // Reset Filter Action
  const handleResetFilters = () => {
    const reset = {
      search: '',
      dateRange: 'all',
      startDate: '',
      endDate: '',
      status: 'all',
      paymentStatus: 'all',
      vehicleType: 'all',
      storeId: 'all',
      duration: 'all',
      location: 'all',
    };
    setFilterState(reset);
    setActiveFilters(reset);
  };

  return (
    <div className="min-h-screen bg-[#f6f7fb] p-4 lg:p-5">
      
      {/* Dynamic Assign Vehicle Dialog */}
      {showAssignVehicleDialog && selectedRequest && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">Assign Rental Vehicle</h3>
              <button onClick={() => setShowAssignVehicleDialog(false)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Select a matching rental fleet vehicle type to assign to Booking **{selectedRequest.bookingReference}**.
            </p>
            
            <div className="mt-4 max-h-[300px] overflow-y-auto space-y-2 pr-1">
              {vehicles.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400 italic">No vehicle types configured.</div>
              ) : (
                vehicles.map((v) => (
                  <button
                    key={v.id || v._id}
                    onClick={() => handleAssignVehicleConfirm(v.id || v._id)}
                    className="flex w-full items-center justify-between rounded-xl border border-slate-100 p-2.5 hover:bg-slate-50 transition text-left"
                  >
                    <div className="flex items-center gap-3">
                      {v.image ? (
                        <img src={v.image} alt={v.name} className="h-10 w-10 object-contain rounded-md bg-slate-50 p-1" />
                      ) : (
                        <div className="h-10 w-10 flex items-center justify-center rounded-md bg-slate-100 text-slate-400"><Car size={20} /></div>
                      )}
                      <div>
                        <p className="text-xs font-bold text-slate-800">{v.name}</p>
                        <p className="text-[10px] text-slate-400 font-medium">{v.vehicleCategory} · {formatAmount(v.basePrice || v.price)}</p>
                      </div>
                    </div>
                    <span className="rounded-lg bg-indigo-50 px-2 py-1 text-[9px] font-black uppercase text-indigo-600 tracking-wider">Select</span>
                  </button>
                ))
              )}
            </div>
            
            <button
              onClick={() => setShowAssignVehicleDialog(false)}
              className="mt-4 w-full rounded-xl border border-slate-200 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Header and Title */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-md shadow-indigo-600/10">
              <ClipboardList size={18} />
            </div>
            <h1 className="text-xl lg:text-[22px] font-bold text-slate-900 tracking-tight">Rental Requests</h1>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            Enterprise overview of customer rental request flows, tracking status, store assignments, and live maps.
          </p>
        </div>
      </div>

      {/* 1. RENTAL REQUESTS DASHBOARD OVERVIEW */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3 mb-5">
        
        {/* Total Requests */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-2 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold capitalize text-slate-400">Total Requests</span>
            <div className="text-slate-400"><ClipboardList size={14} /></div>
          </div>
          <p className="mt-1.5 text-lg font-black text-slate-800 leading-none">{totalCount}</p>
          <span className="mt-1 block text-[9px] text-slate-400">In system</span>
        </div>

        {/* Pending */}
        <div className="rounded-xl border border-amber-200 bg-amber-50/20 p-2 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold capitalize text-amber-600">Pending</span>
            <div className="text-amber-500"><Clock3 size={14} /></div>
          </div>
          <p className="mt-1.5 text-lg font-black text-amber-700 leading-none">{pendingCount}</p>
          <span className="mt-1 block text-[9px] text-amber-500">Requires review</span>
        </div>

        {/* Approved */}
        <div className="rounded-xl border border-blue-200 bg-blue-50/20 p-2 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold capitalize text-blue-600">Approved</span>
            <div className="text-blue-500"><CheckCircle2 size={14} /></div>
          </div>
          <p className="mt-1.5 text-lg font-black text-blue-700 leading-none">{approvedCount}</p>
          <span className="mt-1 block text-[9px] text-blue-500">Confirmed bookings</span>
        </div>

        {/* Active Rentals */}
        <div className="rounded-xl border border-violet-200 bg-violet-50/20 p-2 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold capitalize text-violet-600">Active</span>
            <div className="text-violet-500"><PlayCircle size={14} /></div>
          </div>
          <p className="mt-1.5 text-lg font-black text-violet-700 leading-none">{activeRentalsCount}</p>
          <span className="mt-1 block text-[9px] text-violet-500">Vehicles on road</span>
        </div>

        {/* Completed */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/20 p-2 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold capitalize text-emerald-600">Completed</span>
            <div className="text-emerald-500"><CheckSquare size={14} /></div>
          </div>
          <p className="mt-1.5 text-lg font-black text-emerald-700 leading-none">{completedCount}</p>
          <span className="mt-1 block text-[9px] text-emerald-500">Successfully closed</span>
        </div>

        {/* Cancelled */}
        <div className="rounded-xl border border-rose-200 bg-rose-50/20 p-2 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold capitalize text-rose-600">Cancelled</span>
            <div className="text-rose-500"><XCircle size={14} /></div>
          </div>
          <p className="mt-1.5 text-lg font-black text-rose-700 leading-none">{cancelledCount}</p>
          <span className="mt-1 block text-[9px] text-rose-500">Voided rentals</span>
        </div>

        {/* Paid */}
        <div className="rounded-xl border border-teal-200 bg-teal-50/20 p-2 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold capitalize text-teal-600">Paid Bookings</span>
            <div className="text-teal-500"><CreditCard size={14} /></div>
          </div>
          <p className="mt-1.5 text-lg font-black text-teal-700 leading-none">{paidCount}</p>
          <span className="mt-1 block text-[9px] text-teal-500">Advance cleared</span>
        </div>

        {/* Revenue Today */}
        <div className="rounded-xl border border-purple-200 bg-purple-50/20 p-2 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold capitalize text-purple-600">Revenue Today</span>
            <div className="text-purple-500"><TrendingUp size={14} /></div>
          </div>
          <p className="mt-1.5 text-sm font-black text-purple-800 leading-none">{formatAmount(revenueToday)}</p>
          <span className="mt-1 block text-[9px] text-purple-500">Today's transactions</span>
        </div>
      </div>

      {/* Main Container */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        
        {/* Search & Collapse Toggle Button */}
        <div className="flex flex-col gap-2.5 border-b border-slate-100 px-4 py-3 lg:flex-row lg:items-center lg:justify-between bg-slate-50/40">
          <div className="flex items-center gap-2 w-full max-w-lg">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={filterState.search}
                onChange={(e) => setFilterState({ ...filterState, search: e.target.value })}
                placeholder="Search booking ID, customer name, phone, vehicle model..."
                className="w-full rounded-xl border border-slate-200 bg-white py-1.5 pl-8.5 pr-4 text-xs font-medium text-slate-700 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition hover:bg-slate-50 ${showFilters ? 'bg-indigo-50 text-indigo-600 border-indigo-200' : 'bg-white text-slate-700 border-slate-200'}`}
            >
              <SlidersHorizontal size={13} />
              Filters
            </button>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <button
                onClick={handleApplyFilters}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 transition"
              >
                Apply Filters
              </button>
              <button
                onClick={handleResetFilters}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
              >
                Reset
              </button>
            </div>
            
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              <span>Show</span>
              <select
                value={itemsPerPage}
                onChange={(e) => setItemsPerPage(Math.max(1, Number(e.target.value) || 10))}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-700 outline-none"
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={30}>30</option>
              </select>
            </div>
          </div>
        </div>

        {/* 2. ADVANCED FILTER BAR GRID (COLLAPSIBLE) */}
        {showFilters && (
          <div className="border-b border-slate-100 bg-slate-50/80 p-4 transition-all">
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-6">
              
              {/* Date Filter Dropdown */}
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Date Range</label>
                <select
                  value={filterState.dateRange}
                  onChange={(e) => setFilterState({ ...filterState, dateRange: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs font-bold text-slate-700"
                >
                  <option value="all">All Time</option>
                  <option value="today">Today</option>
                  <option value="yesterday">Yesterday</option>
                  <option value="this_week">This Week</option>
                  <option value="this_month">This Month</option>
                  <option value="custom">Custom Range</option>
                </select>
              </div>

              {/* Custom Date Pickers */}
              {filterState.dateRange === 'custom' && (
                <>
                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Start Date</label>
                    <input
                      type="date"
                      value={filterState.startDate}
                      onChange={(e) => setFilterState({ ...filterState, startDate: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 bg-white p-1.5 text-xs font-bold text-slate-700"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">End Date</label>
                    <input
                      type="date"
                      value={filterState.endDate}
                      onChange={(e) => setFilterState({ ...filterState, endDate: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 bg-white p-1.5 text-xs font-bold text-slate-700"
                    />
                  </div>
                </>
              )}

              {/* Rental Status */}
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Booking Status</label>
                <select
                  value={filterState.status}
                  onChange={(e) => setFilterState({ ...filterState, status: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs font-bold text-slate-700"
                >
                  <option value="all">All Statuses</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved (Confirmed)</option>
                  <option value="running">Running (Assigned)</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              {/* Payment Status */}
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Payment Status</label>
                <select
                  value={filterState.paymentStatus}
                  onChange={(e) => setFilterState({ ...filterState, paymentStatus: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs font-bold text-slate-700"
                >
                  <option value="all">All Payments</option>
                  <option value="pending">Pending</option>
                  <option value="paid">Paid</option>
                  <option value="failed">Failed / Refunded</option>
                </select>
              </div>

              {/* Vehicle Type */}
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Vehicle Type</label>
                <select
                  value={filterState.vehicleType}
                  onChange={(e) => setFilterState({ ...filterState, vehicleType: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs font-bold text-slate-700"
                >
                  <option value="all">All Vehicles</option>
                  <option value="bike">Bike</option>
                  <option value="auto">Auto</option>
                  <option value="car">Car</option>
                  <option value="suv">SUV</option>
                  <option value="van">Van</option>
                </select>
              </div>

              {/* Dynamic Stores list */}
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Assigned Store</label>
                <select
                  value={filterState.storeId}
                  onChange={(e) => setFilterState({ ...filterState, storeId: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs font-bold text-slate-700"
                >
                  <option value="all">All Stores</option>
                  {uniqueStores.map(store => (
                    <option key={store} value={store}>{store}</option>
                  ))}
                </select>
              </div>

              {/* Duration filter */}
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Rental Duration</label>
                <select
                  value={filterState.duration}
                  onChange={(e) => setFilterState({ ...filterState, duration: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs font-bold text-slate-700"
                >
                  <option value="all">All Durations</option>
                  <option value="hourly">Hourly (&lt; 24h)</option>
                  <option value="daily">Daily (1 - 7 Days)</option>
                  <option value="weekly">Weekly (&gt;= 7 Days)</option>
                </select>
              </div>

              {/* Location filter */}
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Location City</label>
                <select
                  value={filterState.location}
                  onChange={(e) => setFilterState({ ...filterState, location: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs font-bold text-slate-700"
                >
                  <option value="all">All Locations</option>
                  {uniqueLocations.map(loc => (
                    <option key={loc} value={loc}>{loc}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* 3. RENTAL TABLE VIEW */}
        <div className="p-0">
          {loading ? (
            <div className="flex min-h-[300px] items-center justify-center bg-white">
              <Loader2 className="animate-spin text-slate-400" size={30} />
            </div>
          ) : paginatedItems.length === 0 ? (
            <div className="border border-dashed border-slate-100 bg-slate-50/40 py-16 text-center">
              <h3 className="text-sm font-bold text-slate-800">No matching requests found</h3>
              <p className="mt-1 text-xs text-slate-400">Adjust your filter parameters or try a different search phrase.</p>
            </div>
          ) : (
            <div className="overflow-x-auto relative scrollbar-thin">
              <table className="w-full text-left border-collapse whitespace-nowrap min-w-max">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/80 text-left sticky top-0 z-10 select-none">
                    
                    {/* Headers with Local Sort */}
                    <th onClick={() => requestSort('bookingReference')} className="px-3.5 py-3 text-[10px] font-black uppercase tracking-wider text-slate-500 cursor-pointer hover:bg-slate-100/80 transition">
                      <div className="flex items-center gap-1">
                        Booking ID
                        {sortConfig.key === 'bookingReference' && (sortConfig.direction === 'asc' ? <ArrowUp size={10} className="rotate-180" /> : <ArrowUp size={10} />)}
                      </div>
                    </th>
                    <th onClick={() => requestSort('customer')} className="px-3.5 py-3 text-[10px] font-black uppercase tracking-wider text-slate-500 cursor-pointer hover:bg-slate-100/80 transition">
                      <div className="flex items-center gap-1">
                        Customer
                        {sortConfig.key === 'customer' && (sortConfig.direction === 'asc' ? <ArrowUp size={10} className="rotate-180" /> : <ArrowUp size={10} />)}
                      </div>
                    </th>
                    <th className="px-3.5 py-3 text-[10px] font-black uppercase tracking-wider text-slate-500">Vehicle</th>
                    <th onClick={() => requestSort('pickupDateTime')} className="px-3.5 py-3 text-[10px] font-black uppercase tracking-wider text-slate-500 cursor-pointer hover:bg-slate-100/80 transition">
                      <div className="flex items-center gap-1">
                        Pickup
                        {sortConfig.key === 'pickupDateTime' && (sortConfig.direction === 'asc' ? <ArrowUp size={10} className="rotate-180" /> : <ArrowUp size={10} />)}
                      </div>
                    </th>
                    <th className="px-3.5 py-3 text-[10px] font-black uppercase tracking-wider text-slate-500">Return</th>
                    <th className="px-3.5 py-3 text-[10px] font-black uppercase tracking-wider text-slate-500">Duration</th>
                    <th className="px-3.5 py-3 text-[10px] font-black uppercase tracking-wider text-slate-500">Advance</th>
                    <th onClick={() => requestSort('totalCost')} className="px-3.5 py-3 text-[10px] font-black uppercase tracking-wider text-slate-500 cursor-pointer hover:bg-slate-100/80 transition">
                      <div className="flex items-center gap-1">
                        Rental Total
                        {sortConfig.key === 'totalCost' && (sortConfig.direction === 'asc' ? <ArrowUp size={10} className="rotate-180" /> : <ArrowUp size={10} />)}
                      </div>
                    </th>
                    <th className="px-3.5 py-3 text-[10px] font-black uppercase tracking-wider text-slate-500">Payment</th>
                    <th onClick={() => requestSort('status')} className="px-3.5 py-3 text-[10px] font-black uppercase tracking-wider text-slate-500 cursor-pointer hover:bg-slate-100/80 transition">
                      <div className="flex items-center gap-1">
                        Booking Status
                        {sortConfig.key === 'status' && (sortConfig.direction === 'asc' ? <ArrowUp size={10} className="rotate-180" /> : <ArrowUp size={10} />)}
                      </div>
                    </th>
                    <th className="px-3.5 py-3 text-[10px] font-black uppercase tracking-wider text-slate-500 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {paginatedItems.map((item) => {
                    const id = String(item.id || item._id);
                    const hasVehicle = !!item.assignedVehicle?.vehicleId;
                    const hasDriver = !!item.assignedStaff?.id;
                    const isRunning = item.status === 'assigned' || item.status === 'end_requested';
                    const isEnded = item.status === 'completed' || item.status === 'cancelled';
                    
                    return (
                      <tr key={id} className="hover:bg-slate-50/70 transition-all group">
                        
                        {/* Booking ID Reference */}
                        <td className="px-3.5 py-2.5">
                          <p className="text-xs font-black text-slate-800 group-hover:text-indigo-600 transition">{item.bookingReference || 'RNT-PENDING'}</p>
                          <p className="mt-0.5 text-[10px] text-slate-400 font-semibold">{formatDateTime(item.createdAt)}</p>
                        </td>

                        {/* Customer Avatar, Name, Phone */}
                        <td className="px-3.5 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="h-6 w-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-600 border border-slate-200">
                              {String(item.userId?.name || item.contactName || '?').charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-xs font-bold text-slate-800 leading-tight">{item.userId?.name || item.contactName || 'Anonymous User'}</p>
                              <p className="text-[10px] text-slate-400 font-semibold">{item.userId?.phone || item.contactPhone || 'No Phone Number'}</p>
                            </div>
                          </div>
                        </td>

                        {/* Vehicle name & registration */}
                        <td className="px-3.5 py-2.5">
                          <p className="text-xs font-bold text-slate-800">{item.vehicleName || 'Rental Vehicle'}</p>
                          <p className="text-[10px] text-slate-400 font-semibold uppercase">{item.vehicleCategory || item.selectedPackage?.label || 'General'}</p>
                        </td>

                        {/* Pickup */}
                        <td className="px-3.5 py-2.5">
                          <p className="text-xs font-bold text-slate-800">{formatDateTime(item.pickupDateTime)}</p>
                          <span className="text-[9px] font-semibold text-slate-400">Scheduled Pick</span>
                        </td>

                        {/* Return */}
                        <td className="px-3.5 py-2.5">
                          <p className="text-xs font-bold text-slate-800">{formatDateTime(item.returnDateTime)}</p>
                          <span className="text-[9px] font-semibold text-slate-400">Scheduled Drop</span>
                        </td>

                        {/* Duration */}
                        <td className="px-3.5 py-2.5">
                          <p className="text-xs font-bold text-slate-800">{Number(item.requestedHours || 0)} Hrs</p>
                          <span className="text-[9px] text-slate-400 font-semibold">Total Term</span>
                        </td>

                        {/* Advance Paid */}
                        <td className="px-3.5 py-2.5">
                          <p className="text-xs font-black text-slate-800">{formatAmount(item.payableNow)}</p>
                          <p className="text-[9px] text-slate-400 font-medium truncate max-w-[100px]">{item.paymentMethodLabel || item.paymentMethod || 'Gateway'}</p>
                        </td>

                        {/* Rental Total */}
                        <td className="px-3.5 py-2.5">
                          <p className="text-xs font-black text-slate-800">{formatAmount(item.totalCost)}</p>
                          <span className="text-[9px] text-slate-400 font-semibold">Gross Sum</span>
                        </td>

                        {/* Payment Status */}
                        <td className="px-3.5 py-2.5">
                          <span className={`inline-flex rounded-lg border px-2 py-0.5 text-xs font-semibold capitalize ${paymentStatusClasses[item.paymentStatus] || paymentStatusClasses.pending}`}>
                            {item.paymentStatus}
                          </span>
                        </td>

                        {/* Booking Status */}
                        <td className="px-3.5 py-2.5">
                          <span className={`inline-flex rounded-lg border px-2 py-0.5 text-xs font-semibold capitalize ${statusClasses[item.status] || statusClasses.pending}`}>
                            {item.status}
                          </span>
                        </td>

                        {/* Row Actions Trigger Dropdown Menu */}
                        <td className="px-3.5 py-2.5 text-right">
                          <div className="flex justify-end items-center gap-1.5">
                            
                            {/* Actions Dropdown Wrapper */}
                            <div className="relative inline-block text-left">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveActionMenuId(activeActionMenuId === id ? null : id);
                                }}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50"
                              >
                                <MoreVertical size={14} />
                              </button>
                              
                              {/* 4. ACTIONS MENU LIST */}
                              {activeActionMenuId === id && (
                                <div className="absolute right-0 mt-1.5 z-[100] w-44 origin-top-right rounded-xl border border-slate-100 bg-white py-1.5 shadow-xl ring-1 ring-black/5">
                                  
                                  {/* View Details */}
                                  <button
                                    onClick={() => setSelectedId(id)}
                                    className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
                                  >
                                    <Eye size={13} className="text-slate-400" />
                                    View Details
                                  </button>
                                  
                                  {/* Assign Vehicle */}
                                  <button
                                    onClick={() => {
                                      setSelectedId(id);
                                      setShowAssignVehicleDialog(true);
                                    }}
                                    disabled={isEnded}
                                    className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                                  >
                                    <Car size={13} className="text-slate-400" />
                                    Assign Vehicle
                                  </button>
                                  
                                  {/* Assign Driver */}
                                  <button
                                    onClick={() => {
                                      toast.info('Navigating to Drivers roster.');
                                      window.location.href = '/admin/drivers';
                                    }}
                                    disabled={isEnded || hasDriver}
                                    className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                                  >
                                    <UserPlus size={13} className="text-slate-400" />
                                    Assign Driver
                                  </button>
                                  
                                  {/* Track Vehicle */}
                                  <button
                                    onClick={() => window.location.href = `/admin/pricing/rental-tracking/${id}`}
                                    disabled={!isRunning}
                                    className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                                  >
                                    <MapPin size={13} className="text-slate-400" />
                                    Track Vehicle
                                  </button>
                                  
                                  {/* Print Invoice */}
                                  <button
                                    onClick={() => {
                                      setSelectedId(id);
                                      setTimeout(() => window.print(), 300);
                                    }}
                                    disabled={item.status === 'pending' || item.status === 'cancelled'}
                                    className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                                  >
                                    <Printer size={13} className="text-slate-400" />
                                    Print Invoice
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer pagination */}
        <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 lg:flex-row lg:items-center lg:justify-between bg-slate-50/20">
          <p className="text-xs font-semibold text-slate-500">
            Showing {showingFrom} to {showingTo} of {totalEntries} requests
          </p>
          <div className="flex items-center gap-2 self-end lg:self-auto">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={safePage === 1}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={13} />
              Prev
            </button>
            <span className="text-xs font-black text-slate-800">
              Page {safePage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={safePage === totalPages}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
              <ChevronRight size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* REDESIGNED VIEW DETAILS MODAL */}
      {selectedRequest && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="relative w-full max-w-[900px] flex flex-col bg-white rounded-xl shadow-2xl overflow-hidden max-h-[90vh]">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <div className="flex items-center gap-3">
                <h2 className="text-[20px] lg:text-[22px] font-bold text-gray-900">
                  Rental Request #{selectedRequest.bookingReference || 'PENDING'}
                </h2>
                <span className={`px-2.5 py-1 rounded-md text-[13px] font-semibold capitalize ${statusClasses[selectedRequest.status] || statusClasses.pending}`}>
                  {selectedRequest.status}
                </span>
                <span className={`px-2.5 py-1 rounded-md text-[13px] font-semibold capitalize ${paymentStatusClasses[selectedRequest.paymentStatus] || paymentStatusClasses.pending}`}>
                  {selectedRequest.paymentStatus}
                </span>
              </div>
              <button onClick={() => setSelectedId('')} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition">
                <X size={20} />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gray-50">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Customer Info */}
                <div className="bg-white p-5 rounded-lg border-t-4 border-t-amber-400 border-l border-r border-b border-gray-200 shadow-sm">
                  <h3 className="text-[15px] lg:text-[16px] font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <User2 size={18} className="text-gray-500" /> Customer Information
                  </h3>
                  <div className="space-y-3 text-[13px] lg:text-[14px]">
                    <div className="flex justify-between border-b border-gray-100 pb-2">
                      <span className="text-gray-500">Name</span>
                      <span className="font-semibold text-gray-900">{selectedRequest.userId?.name || selectedRequest.contactName || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-100 pb-2">
                      <span className="text-gray-500">Phone</span>
                      <span className="font-semibold text-gray-900">{selectedRequest.userId?.phone || selectedRequest.contactPhone || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-100 pb-2">
                      <span className="text-gray-500">Email</span>
                      <span className="font-semibold text-gray-900">{selectedRequest.userId?.email || selectedRequest.contactEmail || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between pb-1">
                      <span className="text-gray-500">KYC Status</span>
                      <span className={`font-semibold ${selectedRequest.kycCompleted ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {selectedRequest.kycCompleted ? 'Verified' : 'Pending'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Vehicle & Package Info */}
                <div className="bg-white p-5 rounded-lg border-t-4 border-t-amber-400 border-l border-r border-b border-gray-200 shadow-sm">
                  <h3 className="text-[15px] lg:text-[16px] font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <Car size={18} className="text-gray-500" /> Vehicle Details
                  </h3>
                  <div className="space-y-3 text-[13px] lg:text-[14px]">
                    <div className="flex justify-between border-b border-gray-100 pb-2">
                      <span className="text-gray-500">Requested Vehicle</span>
                      <span className="font-semibold text-gray-900">{selectedRequest.vehicleName || 'N/A'} ({selectedRequest.vehicleCategory || 'Any'})</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-100 pb-2">
                      <span className="text-gray-500">Assigned Vehicle</span>
                      <span className="font-semibold text-gray-900">{selectedRequest.assignedVehicle?.name || 'Not Assigned'}</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-100 pb-2">
                      <span className="text-gray-500">Package Duration</span>
                      <span className="font-semibold text-gray-900">{selectedRequest.requestedHours || 0} Hours</span>
                    </div>
                    <div className="flex justify-between pb-1">
                      <span className="text-gray-500">Distance</span>
                      <span className="font-semibold text-gray-900">{selectedRequest.serviceLocation?.distanceKm ? `${Number(selectedRequest.serviceLocation.distanceKm).toFixed(1)} km` : 'TBD'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Pickup/Return Details */}
              <div className="bg-white p-5 rounded-lg border-t-4 border-t-amber-400 border-l border-r border-b border-gray-200 shadow-sm">
                <h3 className="text-[15px] lg:text-[16px] font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <MapPin size={18} className="text-gray-500" /> Schedule & Location
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-[13px] lg:text-[14px]">
                  <div>
                    <h4 className="font-semibold text-gray-700 mb-2">Pickup</h4>
                    <p className="text-gray-900 font-medium">{formatDateTime(selectedRequest.pickupDateTime)}</p>
                    <p className="text-gray-500 mt-1">{selectedRequest.serviceLocation?.address || selectedRequest.serviceLocation?.name || 'Not specified'}</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-700 mb-2">Return</h4>
                    <p className="text-gray-900 font-medium">{formatDateTime(selectedRequest.returnDateTime)}</p>
                    <p className="text-gray-500 mt-1">{selectedRequest.serviceLocation?.address || selectedRequest.serviceLocation?.city || 'Not specified'}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Payment Summary */}
                <div className="bg-white p-5 rounded-lg border-t-4 border-t-amber-400 border-l border-r border-b border-gray-200 shadow-sm">
                  <h3 className="text-[15px] lg:text-[16px] font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <CreditCard size={18} className="text-gray-500" /> Payment Summary
                  </h3>
                  <div className="space-y-3 text-[13px] lg:text-[14px]">
                    <div className="flex justify-between border-b border-gray-100 pb-2">
                      <span className="text-gray-500">Method</span>
                      <span className="font-semibold text-gray-900">{selectedRequest.paymentMethodLabel || selectedRequest.paymentMethod || 'Gateway'}</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-100 pb-2">
                      <span className="text-gray-500">Advance Paid</span>
                      <span className="font-semibold text-gray-900">{formatAmount(selectedRequest.payment?.amount || selectedRequest.payableNow)}</span>
                    </div>
                    <div className="flex justify-between pb-1">
                      <span className="text-gray-800 font-bold">Total Cost</span>
                      <span className="font-bold text-gray-900 text-[15px] lg:text-[16px]">{formatAmount(selectedRequest.totalCost)}</span>
                    </div>
                  </div>
                </div>

                {/* Booking Status Update */}
                <div className="bg-white p-5 rounded-lg border-t-4 border-t-amber-400 border-l border-r border-b border-gray-200 shadow-sm">
                  <h3 className="text-[15px] lg:text-[16px] font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <Activity size={18} className="text-gray-500" /> Update Status
                  </h3>
                  <div className="space-y-4 text-[13px] lg:text-[14px]">
                    <div>
                      <label className="block text-gray-600 font-medium mb-1">Current Status</label>
                      <select
                        value={selectedRequest.status}
                        disabled={savingId === String(selectedRequest.id || selectedRequest._id)}
                        onChange={(e) => handleStatusChange(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-400"
                      >
                        {bookingStatusOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Admin Notes */}
              <div className="bg-white p-5 rounded-lg border-t-4 border-t-amber-400 border-l border-r border-b border-gray-200 shadow-sm">
                <h3 className="text-[15px] lg:text-[16px] font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <ClipboardList size={18} className="text-gray-500" /> Admin Notes
                </h3>
                <textarea
                  rows="3"
                  value={selectedRequest.adminNote || ''}
                  onChange={(e) => updateLocal(selectedRequest.id || selectedRequest._id, { adminNote: e.target.value })}
                  onBlur={handleNotesBlur}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-[13px] lg:text-[14px] text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  placeholder="Add private notes..."
                />
              </div>

            </div>

            {/* Bottom Actions */}
            <div className="border-t border-gray-200 bg-white px-6 py-4 flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => window.location.href = '/admin/drivers'}
                  disabled={selectedRequest.status === 'completed' || selectedRequest.status === 'cancelled' || !!selectedRequest.assignedStaff?.id}
                  className="px-4 py-2 bg-slate-800 text-white rounded-md text-[13px] lg:text-[14px] font-medium hover:bg-slate-700 transition disabled:opacity-50"
                  title={selectedRequest.status === 'completed' || selectedRequest.status === 'cancelled' ? 'Cannot assign driver to closed rental' : (!!selectedRequest.assignedStaff?.id ? 'Driver already assigned' : '')}
                >
                  Assign Driver
                </button>
                <button
                  onClick={() => setShowAssignVehicleDialog(true)}
                  disabled={selectedRequest.status === 'completed' || selectedRequest.status === 'cancelled'}
                  className="px-4 py-2 bg-slate-800 text-white rounded-md text-[13px] lg:text-[14px] font-medium hover:bg-slate-700 transition disabled:opacity-50"
                  title={selectedRequest.status === 'completed' || selectedRequest.status === 'cancelled' ? 'Cannot assign vehicle to closed rental' : ''}
                >
                  Assign Vehicle
                </button>
                <button
                  onClick={() => window.location.href = `/admin/pricing/rental-tracking/${selectedRequest.id || selectedRequest._id}`}
                  disabled={selectedRequest.status !== 'assigned' && selectedRequest.status !== 'end_requested'}
                  className="px-4 py-2 bg-slate-800 text-white rounded-md text-[13px] lg:text-[14px] font-medium hover:bg-slate-700 transition disabled:opacity-50"
                  title={selectedRequest.status !== 'assigned' && selectedRequest.status !== 'end_requested' ? 'Tracking only available for active rentals' : ''}
                >
                  Track
                </button>
                <button
                  onClick={() => window.print()}
                  disabled={selectedRequest.status === 'pending' || selectedRequest.status === 'cancelled'}
                  className="px-4 py-2 bg-slate-800 text-white rounded-md text-[13px] lg:text-[14px] font-medium hover:bg-slate-700 transition disabled:opacity-50"
                  title={selectedRequest.status === 'pending' || selectedRequest.status === 'cancelled' ? 'Invoice not available for this status' : ''}
                >
                  Print Invoice
                </button>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => toast.success('Refund initialized internally')}
                  disabled={selectedRequest.paymentStatus !== 'paid'}
                  className="px-4 py-2 border border-slate-800 text-slate-800 rounded-md text-[13px] lg:text-[14px] font-medium hover:bg-gray-50 transition disabled:opacity-50"
                  title={selectedRequest.paymentStatus !== 'paid' ? 'No payment to refund' : ''}
                >
                  Refund
                </button>
                <button
                  onClick={handleEndTripConfirm}
                  disabled={selectedRequest.status !== 'assigned' && selectedRequest.status !== 'end_requested'}
                  className="px-4 py-2 border border-slate-800 text-slate-800 rounded-md text-[13px] lg:text-[14px] font-medium hover:bg-gray-50 transition disabled:opacity-50"
                  title={selectedRequest.status !== 'assigned' && selectedRequest.status !== 'end_requested' ? 'Rental must be active to end' : ''}
                >
                  End Rental
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};

export default RentalBookingRequests;
