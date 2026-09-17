import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronRight, Loader2, Pencil, Plus, Search, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { adminService } from '../../services/adminService';

const EmployeeList = () => {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [paginator, setPaginator] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const latestRequestId = useRef(0);
  const hasLoadedRef = useRef(false);

  const loadEmployees = useCallback(async ({ nextPage = page, nextLimit = itemsPerPage, nextSearch = searchTerm } = {}) => {
    const requestId = latestRequestId.current + 1;
    latestRequestId.current = requestId;
    const initialLoad = !hasLoadedRef.current;

    try {
      setLoading(initialLoad);
      setRefreshing(!initialLoad);
      const response = await adminService.getEmployees(nextPage, nextLimit, nextSearch);

      if (requestId !== latestRequestId.current) {
        return;
      }

      setEmployees(Array.isArray(response?.data?.results) ? response.data.results : []);
      setPaginator(response?.data?.paginator || null);
      hasLoadedRef.current = true;
    } catch (error) {
      if (requestId === latestRequestId.current) {
        toast.error(error?.message || 'Unable to load employees.');
      }
    } finally {
      if (requestId === latestRequestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [itemsPerPage, page, searchTerm]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      loadEmployees({ nextPage: page, nextLimit: itemsPerPage, nextSearch: searchTerm.trim() });
    }, searchTerm.trim() ? 300 : 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadEmployees, page, itemsPerPage, searchTerm]);

  const totalPages = Math.max(1, Number(paginator?.last_page || 1));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const totalEntries = Number(paginator?.total || 0);
  const perPage = Number(paginator?.per_page || itemsPerPage);
  const startIndex = (safePage - 1) * perPage;
  const showingFrom = totalEntries === 0 ? 0 : startIndex + 1;
  const showingTo = totalEntries === 0 ? 0 : Math.min(startIndex + employees.length, totalEntries);

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-7 w-7 animate-spin text-yellow-500" />
          <p className="text-sm font-medium text-slate-500">Loading employees...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
          <span>Users</span>
          <ChevronRight size={12} />
          <span className="text-slate-700">Employee Management</span>
        </div>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-slate-950">Employee Management</h1>
            <p className="mt-2 text-sm font-semibold text-slate-500">
              Track which employee brought each user and driver into the app.
            </p>
          </div>

          <button
            type="button"
            onClick={() => navigate('/admin/employees/create')}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-yellow-400 px-5 py-3 text-sm font-bold text-black shadow-lg shadow-yellow-200 transition-all hover:-translate-y-0.5 hover:bg-yellow-500"
          >
            <Plus size={16} />
            Add Employee
          </button>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full max-w-sm">
              <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => {
                  setSearchTerm(event.target.value);
                  setPage(1);
                }}
                placeholder="Search by name, code, or phone..."
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm font-semibold text-slate-900 outline-none transition-all focus:border-yellow-400 focus:bg-white focus:ring-4 focus:ring-yellow-100"
              />
            </div>

            <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
              <span>Show</span>
              <select
                value={itemsPerPage}
                onChange={(event) => {
                  setItemsPerPage(Number(event.target.value) || 10);
                  setPage(1);
                }}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none"
              >
                {[10, 25, 50].map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
              <span>entries</span>
            </div>
          </div>

          {refreshing ? (
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-yellow-50 px-3 py-1 text-xs font-bold text-yellow-700">
              <Loader2 size={12} className="animate-spin" />
              Updating employees
            </div>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead>
                <tr className="border-b border-slate-100 text-left">
                  <th className="px-4 py-3 text-sm font-bold text-slate-500">Employee</th>
                  <th className="px-4 py-3 text-sm font-bold text-slate-500">Phone</th>
                  <th className="px-4 py-3 text-sm font-bold text-slate-500">Code</th>
                  <th className="px-4 py-3 text-sm font-bold text-slate-500">Users</th>
                  <th className="px-4 py-3 text-sm font-bold text-slate-500">Drivers</th>
                  <th className="px-4 py-3 text-sm font-bold text-slate-500">Total</th>
                  <th className="px-4 py-3 text-sm font-bold text-slate-500">Status</th>
                  <th className="px-4 py-3 text-right text-sm font-bold text-slate-500">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employees.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-16 text-center">
                      <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
                        <div className="rounded-3xl bg-slate-100 p-4 text-slate-400">
                          <UserRound size={28} />
                        </div>
                        <div>
                          <p className="text-base font-black text-slate-900">No employees found</p>
                          <p className="mt-1 text-sm font-semibold text-slate-500">
                            Add an employee to start attribution tracking for signups.
                          </p>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : employees.map((employee) => (
                  <tr key={employee._id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-4">
                      <button
                        type="button"
                        onClick={() => navigate(`/admin/employees/${employee._id}`)}
                        className="text-left"
                      >
                        <p className="text-sm font-bold text-slate-900 hover:text-yellow-600 capitalize">{employee.name.toLowerCase()}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-400">
                          Joined {employee.createdAt ? new Date(employee.createdAt).toLocaleDateString() : 'recently'}
                        </p>
                      </button>
                    </td>
                    <td className="px-4 py-4 text-sm font-semibold text-slate-700">{employee.phone}</td>
                    <td className="px-4 py-4">
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                        {employee.employeeCode}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm font-bold text-slate-900">{employee.totalUsersAcquired}</td>
                    <td className="px-4 py-4 text-sm font-bold text-slate-900">{employee.totalDriversAcquired}</td>
                    <td className="px-4 py-4 text-sm font-black text-yellow-600">{employee.totalAcquired}</td>
                    <td className="px-4 py-4">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${
                          employee.active ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                        }`}
                      >
                        {employee.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => navigate(`/admin/employees/${employee._id}`)}
                          className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 transition-all hover:bg-slate-50"
                        >
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => navigate(`/admin/employees/edit/${employee._id}`)}
                          className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 transition-all hover:bg-slate-50"
                        >
                          <Pencil size={12} />
                          Edit
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-4 text-xs font-semibold text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <span>Showing {showingFrom} to {showingTo} of {totalEntries} employees</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={safePage <= 1}
                className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-50"
              >
                Prev
              </button>
              <span className="rounded-lg bg-yellow-400 px-3 py-1.5 font-bold text-black">{safePage}</span>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={safePage >= totalPages}
                className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-50"
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

export default EmployeeList;
