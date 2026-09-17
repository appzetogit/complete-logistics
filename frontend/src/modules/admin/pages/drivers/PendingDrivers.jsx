import React, { useState, useEffect } from 'react';
import {
  ChevronRight,
  CheckCircle2,
  Edit2,
  Eye,
  FileText,
  Filter,
  Key,
  Lock,
  MoreVertical,
  Plus,
  Search,
  Star,
  Trash2,
  XCircle,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { adminService } from '../../services/adminService';

const ACTION_MENU_WIDTH = 220;
const ACTION_MENU_GAP = 8;
const ACTION_MENU_MAX_HEIGHT = 300;

const PendingDrivers = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({ dateRange: '', vehicleType: '' });
  const [isLoading, setIsLoading] = useState(true);
  const [pendingDrivers, setPendingDrivers] = useState([]);
  const [error, setError] = useState('');
  const [activeMenu, setActiveMenu] = useState(null);
  const [menuPosition, setMenuPosition] = useState(null);
  const [passwordModal, setPasswordModal] = useState({ isOpen: false, driverId: null, password: '', isSubmitting: false });
  const [page, setPage] = useState(1);
  const [paginator, setPaginator] = useState(null);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const openActionMenu = (driverId, anchorEl) => {
    const rect = anchorEl.getBoundingClientRect();
    const viewportPadding = 12;
    const menuHeight = ACTION_MENU_MAX_HEIGHT;
    const spaceBelow = window.innerHeight - rect.bottom - ACTION_MENU_GAP;
    const spaceAbove = rect.top - ACTION_MENU_GAP;
    const openUp = spaceBelow < 220 && spaceAbove > spaceBelow;

    const left = Math.min(
      Math.max(viewportPadding, rect.right - ACTION_MENU_WIDTH),
      window.innerWidth - ACTION_MENU_WIDTH - viewportPadding,
    );

    const position = {
      left,
      ...(openUp
        ? {
            bottom: Math.max(viewportPadding, window.innerHeight - rect.top + ACTION_MENU_GAP),
          }
        : {
            top: Math.min(
              rect.bottom + ACTION_MENU_GAP,
              window.innerHeight - menuHeight - viewportPadding,
            ),
          }),
    };

    setMenuPosition(position);
    setActiveMenu(driverId);
  };

  const closeMenu = () => {
    setActiveMenu(null);
    setMenuPosition(null);
  };

  const handleAction = async (action, driverId) => {
    const confirmMsg = action === 'delete' ? 'Are you sure you want to delete this pending request?' : 'Are you sure you want to APPROVE this driver?';
    if (action !== 'view' && action !== 'edit' && action !== 'password' && !window.confirm(confirmMsg)) return;

    if (action === 'view') {
      navigate(`/admin/drivers/${driverId}`, { state: { from: '/admin/drivers/pending' } });
      return;
    }
    if (action === 'edit') {
      navigate(`/admin/drivers/edit/${driverId}`, { state: { from: '/admin/drivers/pending' } });
      return;
    }

    try {
      if (action === 'password') {
        setPasswordModal(prev => ({ ...prev, isSubmitting: true }));
      }

      if (action === 'approve') {
        await adminService.updateDriverStatus(driverId, { approve: true, status: 'approved' });
      } else if (action === 'delete') {
        await adminService.deleteDriver(driverId);
      } else if (action === 'password') {
        await adminService.updateDriverPassword(driverId, passwordModal.password);
      }

      if (action !== 'view' && action !== 'edit') {
        alert(`${action.charAt(0).toUpperCase() + action.slice(1)} successful`);
        if (action === 'password') {
          setPasswordModal({ isOpen: false, driverId: null, password: '', isSubmitting: false });
        }
        if (action === 'delete' || action === 'approve') {
          await fetchPendingDrivers();
        }
      }
    } catch (err) {
      alert(err?.message || `Network error during ${action}`);
      if (action === 'password') setPasswordModal(prev => ({ ...prev, isSubmitting: false }));
    } finally {
      closeMenu();
    }
  };

  const fetchPendingDrivers = async ({ nextPage = page, nextLimit = itemsPerPage, nextSearch = searchTerm } = {}) => {
    setIsLoading(true);
    setError('');
    try {
      const responseData = await adminService.getDrivers(nextPage, nextLimit, {
        approve: false,
        search: String(nextSearch || '').trim(),
      });
      const driversList = responseData.data?.results || [];
      
      const pending = driversList
        .filter((d) => String(d?.onboarding_role || '').toLowerCase() !== 'owner')
        .map((d) => ({
          id: d._id,
          name: d.name || 'Unknown',
          driverCode: d.driver_code || d.referralCode || (d.phone ? `DRV${String(d.phone).slice(-4)}${String(d._id || d.id || '').slice(-6).toUpperCase()}`.replace(/\W/g, '') : 'N/A'),
          serviceLocation: d.service_location_name || d.city || 'India',
          phone: d.phone || d.mobile || 'N/A',
          transport: d.transport_type || d.register_for || d.transport_type || 'N/A',
          docs: 'View Docs',
          status: (String(d.status || '').toUpperCase() || 'PENDING'),
          reason: d.rejectionReason || d.rejected_reason || '-',
          rating: d.rating || 0.0,
          registeredAt: d.createdAt || null,
        }));

      setPendingDrivers(pending);
      setPaginator(responseData.data?.paginator || null);
    } catch (err) {
      setError(err?.message || 'Failed to fetch pending drivers');
    } finally {
      setIsLoading(false);
    }
  };


  useEffect(() => {
    fetchPendingDrivers({ nextPage: 1, nextLimit: itemsPerPage, nextSearch: searchTerm });
    setPage(1);
  }, [itemsPerPage]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      fetchPendingDrivers({ nextPage: 1, nextLimit: itemsPerPage, nextSearch: searchTerm });
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timeoutId);
  }, [searchTerm]);

  useEffect(() => {
    fetchPendingDrivers({ nextPage: page, nextLimit: itemsPerPage, nextSearch: searchTerm });
  }, [page]);

  useEffect(() => {
    if (!activeMenu) return undefined;

    const handleOutsideMotion = () => closeMenu();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') closeMenu();
    };

    window.addEventListener('scroll', handleOutsideMotion, true);
    window.addEventListener('resize', handleOutsideMotion);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('scroll', handleOutsideMotion, true);
      window.removeEventListener('resize', handleOutsideMotion);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeMenu]);

  const formatDate = (value) => {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'N/A';
    return date.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const inputClass = "w-full sm:w-[320px] border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 outline-none transition-colors";
  const labelClass = "block text-xs font-semibold text-gray-500 mb-1.5";
  const totalPages = Math.max(1, Number(paginator?.last_page || 1));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const totalEntries = Number(paginator?.total || 0);
  const perPage = Number(paginator?.per_page || itemsPerPage);
  const startIndex = (safePage - 1) * perPage;
  const showingFrom = totalEntries === 0 ? 0 : startIndex + 1;
  const showingTo = totalEntries === 0 ? 0 : Math.min(startIndex + pendingDrivers.length, totalEntries);

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-3 lg:p-4 font-sans text-gray-900">
      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">
          {error}
        </div>
      )}
      
      <div className="mb-3">
        <div className="flex items-center gap-1.5 text-[11px] text-gray-500 mb-0.5">
          <span>Drivers</span>
          <ChevronRight size={10} />
          <span className="text-gray-700 font-medium">Pending Drivers</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-base text-gray-900 font-bold">Pending Drivers</h1>
          <button
            onClick={() => navigate('/admin/drivers/create')}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-black font-semibold bg-yellow-400 rounded-md shadow-sm hover:bg-yellow-500 transition-colors"
          >
            <Plus size={14} /> Add Drivers
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-3 mb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative w-full sm:w-auto">
             <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
             <input
               className="w-full sm:w-[280px] pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-yellow-400 focus:border-yellow-400"
               placeholder="Search by name, phone, or location"
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
             />
          </div>
          
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <span>Show</span>
              <select
                value={itemsPerPage}
                onChange={(e) => setItemsPerPage(parseInt(e.target.value, 10))}
                className="border border-gray-200 rounded-md px-1.5 py-1 text-xs text-gray-700 font-semibold focus:outline-none focus:ring-1 focus:ring-yellow-400 focus:border-yellow-400"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>
            <button 
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-md shadow-sm hover:bg-gray-50 transition-colors ml-auto sm:ml-0"
            >
              <Filter size={14} /> Filters
            </button>
          </div>
        </div>
        
        {/* Filters Panel */}
        {showFilters && (
          <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Date Range</label>
              <select 
                value={filters.dateRange}
                onChange={(e) => setFilters({...filters, dateRange: e.target.value})}
                className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-xs text-gray-700 bg-gray-50 outline-none focus:border-yellow-400 focus:bg-white"
              >
                <option value="">All Time</option>
                <option value="today">Today</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Vehicle Type</label>
              <select 
                value={filters.vehicleType}
                onChange={(e) => setFilters({...filters, vehicleType: e.target.value})}
                className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-xs text-gray-700 bg-gray-50 outline-none focus:border-yellow-400 focus:bg-white"
              >
                <option value="">All Types</option>
                <option value="sedan">Sedan</option>
                <option value="suv">SUV</option>
                <option value="hatchback">Hatchback</option>
              </select>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-visible">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">Location</th>
                <th className="px-3 py-2">Mobile</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2 text-center">Docs</th>
                <th className="px-3 py-2 text-center">Status</th>
                <th className="px-3 py-2">Registered</th>
                <th className="px-3 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-xs text-gray-700">
              {isLoading ? (
                <tr>
                  <td colSpan="9" className="px-3 py-6 text-center text-gray-400">Loading pending drivers...</td>
                </tr>
              ) : pendingDrivers.length === 0 ? (
                <tr>
                  <td colSpan="9" className="px-3 py-6 text-center text-gray-400">No pending drivers found.</td>
                </tr>
              ) : (
                pendingDrivers.map((driver) => (
                  <tr key={driver.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-1.5 font-medium text-gray-900">{driver.name}</td>
                    <td className="px-3 py-1.5">
                      <span className="font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200">
                        {driver.driverCode}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-gray-600">{driver.serviceLocation}</td>
                    <td className="px-3 py-1.5 font-medium">{driver.phone}</td>
                    <td className="px-3 py-1.5 text-gray-600">{driver.transport}</td>
                    <td className="px-3 py-1.5 text-center">
                      <button
                        onClick={() => navigate(`/admin/drivers/${driver.id}?tab=Documents`, { state: { from: '/admin/drivers/pending' } })}
                        className="inline-flex items-center justify-center w-6 h-6 rounded border border-gray-200 text-gray-500 hover:bg-gray-100 hover:text-black transition-colors"
                        title="View Documents"
                      >
                        <FileText size={12} />
                      </button>
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-yellow-100 text-yellow-800 uppercase border border-yellow-200">
                        {driver.status || 'PENDING'}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-[10px] text-gray-500">{formatDate(driver.registeredAt)}</td>
                    <td className="px-3 py-1.5 text-right">
                      <div className="relative inline-block">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (activeMenu === driver.id) {
                              closeMenu();
                              return;
                            }
                            openActionMenu(driver.id, e.currentTarget);
                          }}
                          className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-500 transition-colors"
                        >
                          <MoreVertical size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="p-3 flex items-center justify-between text-xs text-gray-500 border-t border-gray-100 bg-gray-50/50">
          <span>Showing {showingFrom} to {showingTo} of {totalEntries} entries</span>
          <div className="flex items-center gap-1">
            <button
              className="px-2 py-1 font-semibold hover:text-black disabled:opacity-50"
              disabled={safePage <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Prev
            </button>
            <button className="px-2.5 py-1 rounded bg-yellow-400 text-black font-bold">{safePage}</button>
            <button
              className="px-2 py-1 font-semibold hover:text-black disabled:opacity-50"
              disabled={safePage >= totalPages}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* PASSWORD MODAL */}
      <AnimatePresence>
        {passwordModal.isOpen && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
             <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl overflow-hidden border border-gray-100 p-6 space-y-5">
                <div className="flex items-center justify-between">
                   <div>
                     <h3 className="text-lg font-bold text-gray-900">Update Password</h3>
                     <p className="text-xs text-gray-500">Enter new password for driver</p>
                   </div>
                   <button onClick={() => setPasswordModal({ isOpen: false, driverId: null, password: '', isSubmitting: false })} className="text-gray-400 hover:text-gray-900 transition-colors">
                      <XCircle size={20} />
                   </button>
                </div>
                <div className="space-y-4">
                   <div className="relative">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                         <Lock size={16} />
                      </div>
                      <input 
                        type="text" 
                        placeholder="New password"
                        className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 transition-colors"
                        value={passwordModal.password}
                        onChange={(e) => setPasswordModal(prev => ({ ...prev, password: e.target.value }))}
                      />
                   </div>
                </div>
                <button 
                  onClick={() => handleAction('password', passwordModal.driverId)}
                  disabled={passwordModal.isSubmitting || !passwordModal.password}
                  className="w-full py-2 bg-yellow-400 text-black rounded-lg text-sm font-bold shadow-sm hover:bg-yellow-500 transition-colors disabled:opacity-50"
                >
                  {passwordModal.isSubmitting ? 'Updating...' : 'Update Password'}
                </button>
             </div>
          </div>
        )}
      </AnimatePresence>

      {activeMenu && menuPosition && createPortal(
        <>
          <div className="fixed inset-0 z-[9998] bg-transparent" onClick={closeMenu} />
          <div
            className="fixed z-[9999] bg-white border border-gray-200 shadow-xl rounded-xl p-1.5 text-left overflow-y-auto transform origin-top-right transition-all"
            style={{
              width: ACTION_MENU_WIDTH,
              maxHeight: `min(${ACTION_MENU_MAX_HEIGHT}px, calc(100vh - 24px))`,
              ...menuPosition,
            }}
          >
            <button onClick={() => handleAction('approve', activeMenu)} className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 text-gray-700 rounded-lg transition-colors text-sm font-medium">
              <CheckCircle2 size={15} className="text-green-600" /> Approve Driver
            </button>
            <button onClick={() => handleAction('edit', activeMenu)} className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 text-gray-700 rounded-lg transition-colors text-sm font-medium">
              <Edit2 size={15} className="text-yellow-600" /> Edit Details
            </button>
            <button
              onClick={() => {
                closeMenu();
                setPasswordModal({ isOpen: true, driverId: activeMenu, password: '', isSubmitting: false });
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 text-gray-700 rounded-lg transition-colors text-sm font-medium"
            >
              <Key size={15} className="text-blue-600" /> Reset Password
            </button>
            <button onClick={() => handleAction('view', activeMenu)} className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 text-gray-700 rounded-lg transition-colors text-sm font-medium">
              <Eye size={15} className="text-gray-500" /> View Profile
            </button>
            <div className="h-px bg-gray-100 my-1 mx-1" />
            <button onClick={() => handleAction('delete', activeMenu)} className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-red-50 hover:text-red-700 text-gray-700 rounded-lg transition-colors text-sm font-medium">
              <Trash2 size={15} className="text-red-600" /> Delete Request
            </button>
          </div>
        </>,
        document.body,
      )}

    </div>
  );
};

export default PendingDrivers;
