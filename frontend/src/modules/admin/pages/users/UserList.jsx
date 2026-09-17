import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { 
  Search, Download, UserPlus, MoreHorizontal,
  ChevronRight, UserCheck, Edit2, Lock, Trash2,
  Loader2, Ban, FileText
} from 'lucide-react';

const StatusToggle = ({ status, onToggle }) => (
  <button 
    onClick={(e) => { e.stopPropagation(); onToggle(); }}
    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${status === 'Active' ? 'bg-emerald-500' : 'bg-gray-300'}`}
  >
    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${status === 'Active' ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
  </button>
);

import UserModal from './UserModal';
import { adminService } from '../../services/adminService';

const GENDER_LABELS = {
  male: 'Male',
  female: 'Female',
  other: 'Other',
};

const UserList = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [referralSource, setReferralSource] = useState('all');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [employeeOptions, setEmployeeOptions] = useState([]);
  const [activeMenu, setActiveMenu] = useState(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [users, setUsers] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [page, setPage] = useState(1);
  const [paginator, setPaginator] = useState(null);
  const latestRequestId = useRef(0);
  const hasLoadedUsersRef = useRef(false);

  const fetchUsers = useCallback(async ({
    nextPage = page,
    nextLimit = itemsPerPage,
    nextSearch = searchTerm,
    nextReferralSource = referralSource,
    nextEmployeeId = selectedEmployeeId,
  } = {}) => {
    const requestId = latestRequestId.current + 1;
    latestRequestId.current = requestId;
    const showInitialLoader = !hasLoadedUsersRef.current;

    try {
      setIsLoading(showInitialLoader);
      setIsRefreshing(!showInitialLoader);
      setError(null);
      const resData = await adminService.getUsers(nextPage, nextLimit, String(nextSearch || '').trim(), {
        referralSource: nextReferralSource,
        employeeId: nextEmployeeId,
      });
      if (requestId !== latestRequestId.current) return;

      if (resData.success) {
        const mapped = (resData.data?.results || []).map(u => ({
          id: u._id,
          name: u.name || 'Anonymous',
          gender: GENDER_LABELS[u.gender] || 'N/A',
          email: u.email || 'N/A',
          phone: u.mobile || 'N/A',
          profileImage: u.profileImage || '',
          governmentIdProof: u.governmentIdProof || null,
          acquiredByEmployeeId: u.acquiredByEmployeeId || '',
          acquiredByEmployeeCode: u.acquiredByEmployeeCode || '',
          acquiredByEmployeeName: u.acquiredByEmployeeName || '',
          status: u.active ? 'Active' : 'Suspended',
        }));
        setUsers(mapped);
        setPaginator(resData.data?.paginator || null);
        hasLoadedUsersRef.current = true;
      } else {
        setError(resData.message || 'Failed to fetch users');
      }
    } catch (err) {
      if (requestId !== latestRequestId.current) return;
      setError(err.message || 'Network error');
    } finally {
      if (requestId === latestRequestId.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [itemsPerPage, page, referralSource, searchTerm, selectedEmployeeId]);

  useEffect(() => {
    let mounted = true;

    const loadEmployees = async () => {
      try {
        const resData = await adminService.getEmployees(1, 100, '');
        if (!mounted || !resData?.success) return;

        setEmployeeOptions(
          Array.isArray(resData.data?.results)
            ? resData.data.results.map((employee) => ({
                id: employee._id,
                name: employee.name || 'Unnamed employee',
                code: employee.employeeCode || '',
              }))
            : [],
        );
      } catch (err) {
        if (mounted) {
          setEmployeeOptions([]);
        }
      }
    };

    loadEmployees();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const trimmedSearch = String(searchTerm || '').trim();
    const timeoutId = window.setTimeout(() => {
      fetchUsers({
        nextPage: page,
        nextLimit: itemsPerPage,
        nextSearch: trimmedSearch,
        nextReferralSource: referralSource,
        nextEmployeeId: selectedEmployeeId,
      });
    }, trimmedSearch ? 350 : 0);

    return () => window.clearTimeout(timeoutId);
  }, [fetchUsers, page, itemsPerPage, referralSource, searchTerm, selectedEmployeeId]);

  useEffect(() => {
    const closeMenu = () => setActiveMenu(null);
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, []);

  const handleToggleStatus = async (userId, currentStatus) => {
    const newStatus = currentStatus === 'Active' ? false : true;
    const confirmed = window.confirm(`Are you sure you want to ${newStatus ? 'activate' : 'block'} this user?`);
    if (!confirmed) return;
    try {
      const resData = await adminService.updateUser(userId, { active: newStatus });
      if (resData.success) {
        setUsers(users.map(u => u.id === userId ? { ...u, status: newStatus ? 'Active' : 'Suspended' } : u));
        toast?.success?.(`User ${newStatus ? 'activated' : 'blocked'} successfully`) || console.log('Status updated');
      }
    } catch (err) {
      console.error('Failed to toggle status', err);
      alert('Failed to update status');
    }
  };

  const handleBlockUser = async (user) => {
    if (!user) return;
    const shouldBlock = user.status === 'Active';
    const confirmed = window.confirm(
      shouldBlock
        ? `Block ${user.name}? They will not be able to log in, open their profile, or register again with ${user.phone}.`
        : `Unblock ${user.name}? They will be able to use their account again.`
    );

    if (!confirmed) return;

    await handleToggleStatus(user.id, user.status);
    setActiveMenu(null);
  };

  const handleAddUser = () => { navigate('/admin/users/create'); };
  const handleEditUser = (user) => { setEditingUser(user); setIsModalOpen(true); };

  const handleDeleteUser = async (userId) => {
    if (window.confirm('Are you sure you want to delete this user?')) {
      try {
        const resData = await adminService.deleteUser(userId);
        if (resData.success) setUsers(users.filter(u => u.id !== userId));
      } catch (err) {
        console.error('Failed to delete user', err);
      }
    }
  };

  const handleModalSubmit = async (formData) => {
    try {
      setIsSubmitting(true);
      const resData = editingUser 
        ? await adminService.updateUser(editingUser.id, formData)
        : await adminService.createUser(formData);
      if (resData.success) {
        setIsModalOpen(false);
        fetchUsers();
      } else {
        alert(resData.message || 'Operation failed');
      }
    } catch (err) {
      alert(err.message || 'Network error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleMenu = (e, userId) => {
    e.stopPropagation();
    if (activeMenu === userId) {
      setActiveMenu(null);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const menuWidth = 176;
    const menuHeight = 210;
    const gap = 8;
    let left = rect.right - menuWidth;
    left = Math.max(12, Math.min(left, window.innerWidth - menuWidth - 12));

    let top = rect.bottom + gap;
    if (top + menuHeight > window.innerHeight - 12) {
      top = Math.max(12, rect.top - gap - menuHeight);
    }

    setMenuPosition({ top, left });
    setActiveMenu(userId);
  };

  const totalPages = Math.max(1, Number(paginator?.last_page || 1));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const totalEntries = Number(paginator?.total || 0);
  const perPage = Number(paginator?.per_page || itemsPerPage);
  const startIndex = (safePage - 1) * perPage;
  const showingFrom = totalEntries === 0 ? 0 : startIndex + 1;
  const showingTo = totalEntries === 0 ? 0 : Math.min(startIndex + users.length, totalEntries);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <Loader2 className="w-7 h-7 text-indigo-600 animate-spin" />
        <p className="text-sm text-gray-400">Loading users...</p>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 bg-gray-50 min-h-screen">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
        <span>Users</span>
        <ChevronRight size={12} />
        <span className="text-gray-700 font-medium">All Users</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg text-gray-900 font-bold">Passengers</h1>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 transition-colors">
            <Download size={14} /> Export
          </button>
          <button 
            onClick={handleAddUser}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-400 text-black text-sm font-semibold rounded-lg shadow-sm hover:bg-yellow-500 transition-colors"
          >
            <UserPlus size={14} /> New User
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full max-w-sm">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search by name, mobile, or email..." 
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-200 rounded-lg bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
            />
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span>Show</span>
            <select
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value) || 10);
                setPage(1);
              }}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold text-gray-800 bg-white focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 outline-none transition-colors"
            >
              {[10, 25, 50].map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
            <span>Entries</span>
          </div>
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-gray-500">Referral Source</label>
            <select
              value={referralSource}
              onChange={(e) => {
                const nextValue = e.target.value;
                setReferralSource(nextValue);
                if (nextValue !== 'employee') {
                  setSelectedEmployeeId('');
                }
                setPage(1);
              }}
              className="min-w-[220px] border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold text-gray-800 bg-white focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 outline-none transition-colors"
            >
              <option value="all">All Users</option>
              <option value="employee">Employee Referred Only</option>
              <option value="organic">No Employee Referral</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-gray-500">Employee</label>
            <select
              value={selectedEmployeeId}
              onChange={(e) => {
                setSelectedEmployeeId(e.target.value);
                setReferralSource('employee');
                setPage(1);
              }}
              className="min-w-[260px] border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold text-gray-800 bg-white focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 outline-none transition-colors"
            >
              <option value="">All Employees</option>
              {employeeOptions.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}{employee.code ? ` (${employee.code})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-visible">
        {isRefreshing && (
          <div className="border-b border-gray-100 px-4 py-2 text-xs font-medium text-indigo-600 flex items-center gap-2">
            <Loader2 size={13} className="animate-spin" />
            Updating users...
          </div>
        )}
        <div className="overflow-x-auto overflow-y-visible">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900">User</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900">Gender</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900">Mobile</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900">Email</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900">ID Proof</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900">Employee Referral</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-900">Status</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-900">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 font-medium text-xs flex items-center justify-center">
                        {user.profileImage ? (
                          <img src={user.profileImage} alt={user.name} className="h-full w-full rounded-full object-cover" />
                        ) : (
                          user.name.split(' ').map(n => n[0]).join('')
                        )}
                      </div>
                      <div>
                        <button
                          type="button"
                          onClick={() => navigate(`/admin/users/${user.id}`)}
                          className="text-left text-sm font-medium text-gray-900 hover:text-indigo-600 hover:underline transition-colors"
                        >
                          {user.name}
                        </button>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">{user.gender}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{user.phone}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{user.email}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {user.governmentIdProof?.imageUrl ? (
                      <a
                        href={user.governmentIdProof.imageUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <FileText size={13} />
                        {String(user.governmentIdProof.type || 'ID').replace(/_/g, ' ')}
                      </a>
                    ) : (
                      <span className="text-xs font-medium text-rose-500">Missing</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {user.acquiredByEmployeeName ? (
                      <div className="flex flex-col">
                        <span className="font-medium text-gray-900">{user.acquiredByEmployeeName}</span>
                        <span className="text-xs text-gray-500">
                          {user.acquiredByEmployeeCode || 'Employee referral'}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs font-medium text-gray-500">Not employee referred</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <StatusToggle status={user.status} onToggle={() => handleToggleStatus(user.id, user.status)} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="relative">
                      <button 
                        onClick={(e) => toggleMenu(e, user.id)}
                        className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <MoreHorizontal size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!isLoading && (
          <div className="border-t border-gray-100 px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-xs text-gray-500">
            <span>Showing {showingFrom} to {showingTo} of {totalEntries} entries</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={safePage <= 1}
                className="px-3 py-1.5 border border-gray-200 rounded text-xs text-gray-500 disabled:opacity-60"
              >
                Prev
              </button>
              <span className="px-3 py-1.5 rounded bg-black text-white text-xs font-bold">{safePage}</span>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={safePage >= totalPages}
                className="px-3 py-1.5 border border-gray-200 rounded text-xs text-gray-700 font-bold disabled:opacity-60 hover:bg-gray-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {activeMenu &&
        createPortal(
          <div className="fixed inset-0 z-[9999]" onClick={() => setActiveMenu(null)}>
            <div
              className="absolute w-44 bg-white rounded-lg shadow-2xl border border-gray-200 py-1"
              style={{ top: menuPosition.top, left: menuPosition.left }}
              onClick={(e) => e.stopPropagation()}
            >
              <button onClick={() => { setActiveMenu(null); navigate(`/admin/users/${activeMenu}`); }} className="w-full text-left px-3 py-2 text-xs font-bold text-gray-700 hover:bg-yellow-50 flex items-center gap-2">
                <UserCheck size={13} className="text-gray-500" /> View Profile
              </button>
              <button onClick={() => { setActiveMenu(null); handleEditUser(users.find((item) => item.id === activeMenu)); }} className="w-full text-left px-3 py-2 text-xs font-bold text-gray-700 hover:bg-yellow-50 flex items-center gap-2">
                <Edit2 size={13} className="text-gray-500" /> Edit
              </button>
              <button onClick={() => { setActiveMenu(null); handleEditUser(users.find((item) => item.id === activeMenu)); }} className="w-full text-left px-3 py-2 text-xs font-bold text-gray-700 hover:bg-yellow-50 flex items-center gap-2">
                <Lock size={13} className="text-gray-500" /> Update Password
              </button>
              <button
                onClick={() => { setActiveMenu(null); handleBlockUser(users.find((item) => item.id === activeMenu)); }}
                className="w-full text-left px-3 py-2 text-xs font-bold text-gray-700 hover:bg-yellow-50 flex items-center gap-2"
              >
                <Ban size={13} className="text-gray-500" />
                {users.find((item) => item.id === activeMenu)?.status === 'Active' ? 'Block User' : 'Unblock User'}
              </button>
              <div className="h-px bg-gray-100 my-1" />
              <button onClick={() => { setActiveMenu(null); handleDeleteUser(activeMenu); }} className="w-full text-left px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 flex items-center gap-2">
                <Trash2 size={13} className="text-red-500" /> Delete
              </button>
            </div>
          </div>,
          document.body,
        )}

      <UserModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSubmit={handleModalSubmit}
        editingUser={editingUser}
        isLoading={isSubmitting}
      />
    </div>
  );
};

export default UserList;
