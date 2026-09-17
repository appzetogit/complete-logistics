import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronRight,
  Eye,
  Filter,
  MoreVertical,
  Search,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { adminService } from '../../services/adminService';
import AdminPageHeader from '../../components/ui/AdminPageHeader';

const ACTION_MENU_WIDTH = 238;
const ACTION_MENU_GAP = 8;
const ACTION_MENU_MAX_HEIGHT = 300;

const isDriverApproved = (driver) => {
  if (!driver) return false;

  const approveRaw = driver.approve ?? '';
  const approveNormalized = String(approveRaw).toLowerCase();
  const status = String(driver.status || '').toLowerCase();

  return (
    approveRaw === true ||
    approveRaw === 1 ||
    ['true', '1', 'yes', 'approved'].includes(approveNormalized) ||
    ['approved', 'active', 'verified'].includes(status)
  );
};

const isOwnerSignup = (driver) => String(driver?.onboarding?.role || '').toLowerCase() === 'owner';

const resolveCompanyName = (driver) =>
  driver?.onboarding?.company?.name ||
  driver?.onboarding?.companyName ||
  driver?.companyName ||
  '';

const resolveServiceLocation = (driver) =>
  driver?.onboarding?.company?.serviceLocationName ||
  driver?.service_location_name ||
  driver?.city ||
  'India';

const resolveRegisterFor = (driver) =>
  driver?.onboarding?.company?.registerFor ||
  driver?.transport_type ||
  driver?.register_for ||
  driver?.registerFor ||
  'N/A';

const isOwnerApproved = (owner) => {
  if (!owner) return false;

  const approveRaw = owner.approve ?? '';
  const approveNormalized = String(approveRaw).toLowerCase();
  const status = String(owner.status || '').toLowerCase();

  return (
    approveRaw === true ||
    approveRaw === 1 ||
    ['true', '1', 'yes', 'approved'].includes(approveNormalized) ||
    ['approved', 'active', 'verified'].includes(status)
  );
};

const PendingOwners = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingOwners, setPendingOwners] = useState([]);
  const [error, setError] = useState('');
  const [activeMenu, setActiveMenu] = useState(null);
  const [menuPosition, setMenuPosition] = useState(null);
  const [showFilters, setShowFilters] = useState(false);

  const openActionMenu = (id, anchorEl) => {
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
        ? { bottom: Math.max(viewportPadding, window.innerHeight - rect.top + ACTION_MENU_GAP) }
        : {
            top: Math.min(
              rect.bottom + ACTION_MENU_GAP,
              window.innerHeight - menuHeight - viewportPadding,
            ),
          }),
    };

    setMenuPosition(position);
    setActiveMenu(id);
  };

  const closeMenu = () => {
    setActiveMenu(null);
    setMenuPosition(null);
  };

  const handleAction = async (action, id) => {
    const record = pendingOwners.find((item) => item.id === id);

    if (action === 'view') {
      navigate(
        record?.source === 'driver-signup'
          ? `/admin/drivers/${id}`
          : `/admin/owners/${id}`,
      );
      return;
    }

    if (action === 'approve' && !window.confirm('Approve this owner request?')) {
      return;
    }

    try {
      if (action === 'approve') {
        if (record?.source === 'driver-signup') {
          await adminService.approveOwnerSignupFromDriver(id);
        } else {
          await adminService.approveOwner(id, { approve: true });
        }
        await fetchPendingOwners();
      }
    } catch (err) {
      alert(err?.message || `Network error during ${action}`);
    } finally {
      closeMenu();
    }
  };

  const fetchPendingOwners = async () => {
    setIsLoading(true);
    setError('');

    try {
      const [ownersResponse, driversResponse] = await Promise.all([
        adminService.getOwners(),
        adminService.getDrivers(1, 200),
      ]);

      const ownersList = ownersResponse?.data?.results || [];
      const pendingOwnersFromOwners = ownersList
        .filter((owner) => !isOwnerApproved(owner))
        .map((owner) => ({
          id: owner._id || owner.id,
          ownerName: owner.name || owner.owner_name || 'Unknown',
          companyName: owner.company_name || '-',
          serviceLocation: owner.area_name || owner.city || 'India',
          phone: owner.mobile || owner.phone || 'N/A',
          transport: owner.transport_type || 'N/A',
          status: String(owner.status || 'pending').toUpperCase(),
          registeredAt: owner.createdAt || owner.created_at || null,
          source: 'owner',
        }));

      const driversList = driversResponse?.data?.results || [];
      const pendingOwnersFromDriverSignups = driversList
        .filter((d) => isOwnerSignup(d) && !isDriverApproved(d))
        .map((d) => ({
          id: d._id,
          ownerName: d.name || 'Unknown',
          companyName: resolveCompanyName(d) || '-',
          serviceLocation: resolveServiceLocation(d),
          phone: d.phone || d.mobile || 'N/A',
          transport: resolveRegisterFor(d),
          status: String(d.status || 'pending').toUpperCase(),
          registeredAt: d.createdAt || null,
          source: 'driver-signup',
        }));

      const merged = [...pendingOwnersFromOwners, ...pendingOwnersFromDriverSignups];
      const seen = new Set();
      const deduped = merged
        .sort((left, right) => {
          const leftTime = left?.registeredAt ? new Date(left.registeredAt).getTime() : 0;
          const rightTime = right?.registeredAt ? new Date(right.registeredAt).getTime() : 0;
          return rightTime - leftTime;
        })
        .filter((item) => {
          const key = String(item.id || '');
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        });

      setPendingOwners(deduped);
    } catch (err) {
      setError(err?.message || 'Failed to fetch pending owners');
      setPendingOwners([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingOwners();
  }, []);

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
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return pendingOwners;

    return pendingOwners.filter((item) =>
      String(item.ownerName || '').toLowerCase().includes(term) ||
      String(item.companyName || '').toLowerCase().includes(term) ||
      String(item.phone || '').includes(searchTerm) ||
      String(item.serviceLocation || '').toLowerCase().includes(term)
    );
  }, [pendingOwners, searchTerm]);

  const rows = filtered.slice(0, itemsPerPage);
  const inputClass =
    'w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-800 bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-colors';
  const labelClass = 'block text-xs font-semibold text-gray-500 mb-1.5';

  return (
    <div className="min-h-screen bg-gray-50 p-6 lg:p-8 font-sans text-gray-900">
      {error && (
        <div className="mb-4 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">
          {error}
        </div>
      )}

      <AdminPageHeader module="Owner Management" page="Pending Owners" title="Pending Owners" />

      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-4 items-end">
          <div>
            <label className={labelClass}>
              Search
            </label>
            <input
              className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-800 bg-white focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 outline-none transition-colors"
              placeholder="Search by owner, company, phone, or location"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <label className={labelClass}>Show</label>
            <select
              value={itemsPerPage}
              onChange={(e) => setItemsPerPage(parseInt(e.target.value, 10))}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 outline-none transition-colors"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={200}>200</option>
            </select>
          </div>
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-black bg-yellow-400 rounded-lg hover:bg-yellow-500 transition-colors"
          >
            <Filter size={16} /> Filters
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6 animate-in slide-in-from-top-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Filter by Service Location</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-800 bg-white focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 outline-none transition-colors"
                placeholder="Enter city or location..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Filter by Transport Type</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-800 bg-white focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 outline-none transition-colors"
                placeholder="Enter transport type..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-visible">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500">
                <th className="px-6 py-4">Owner Name</th>
                <th className="px-4 py-4">Company</th>
                <th className="px-4 py-4">Service Location</th>
                <th className="px-4 py-4">Mobile Number</th>
                <th className="px-4 py-4">Transport Type</th>
                <th className="px-4 py-4 text-center">Status</th>
                <th className="px-4 py-4 text-center">Registered at</th>
                <th className="px-6 py-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-20 text-center text-gray-400 text-sm italic">
                    Loading pending owners...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-3 text-slate-300">
                      <XCircle size={44} strokeWidth={1.5} />
                      <p className="text-sm font-semibold">No pending owners found</p>
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-semibold text-gray-900">{item.ownerName}</td>
                    <td className="px-4 py-4 text-sm text-gray-900">{item.companyName}</td>
                    <td className="px-4 py-4 text-sm text-gray-700">{item.serviceLocation}</td>
                    <td className="px-4 py-4 text-sm text-gray-900">{item.phone}</td>
                    <td className="px-4 py-4 text-sm text-gray-700">{item.transport}</td>
                    <td className="px-4 py-4 text-center">
                      <span className="inline-flex items-center rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-600">
                        {item.status || 'PENDING'}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center text-sm text-gray-600">{formatDate(item.registeredAt)}</td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={(e) => openActionMenu(item.id, e.currentTarget)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                        aria-label="Owner actions"
                      >
                        <MoreVertical size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {activeMenu && menuPosition
        ? createPortal(
            <div
              className="fixed z-[1000] rounded-xl border border-gray-200 bg-white shadow-xl overflow-hidden"
              style={{ width: ACTION_MENU_WIDTH, maxHeight: ACTION_MENU_MAX_HEIGHT, ...menuPosition }}
            >
              <button
                onClick={() => handleAction('view', activeMenu)}
                className="w-full px-4 py-3 flex items-center gap-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                <Eye size={16} className="text-gray-400" /> View Details
              </button>
              <button
                onClick={() => handleAction('approve', activeMenu)}
                className="w-full px-4 py-3 flex items-center gap-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
              >
                <UserCheck size={16} className="text-emerald-500" /> Approve Owner
              </button>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
};

export default PendingOwners;
