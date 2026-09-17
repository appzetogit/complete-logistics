import React, { useEffect, useState } from 'react';
import { ArrowLeft, ChevronRight, Loader2, Users, Car, UserRound } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { adminService } from '../../services/adminService';

const StatCard = ({ icon: Icon, label, value, tone }) => (
  <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-bold text-slate-500">{label}</p>
        <p className="mt-2 text-3xl font-black tracking-tight text-slate-950">{value}</p>
      </div>
      <div className={`rounded-2xl p-3 ${tone}`}>
        <Icon size={20} />
      </div>
    </div>
  </div>
);

const EmployeeDetails = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [employee, setEmployee] = useState(null);
  const [users, setUsers] = useState([]);
  const [drivers, setDrivers] = useState([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const response = await adminService.getEmployee(id);
        setEmployee(response?.data?.employee || null);
        setUsers(Array.isArray(response?.data?.users) ? response.data.users : []);
        setDrivers(Array.isArray(response?.data?.drivers) ? response.data.drivers : []);
      } catch (error) {
        toast.error(error?.message || 'Unable to load employee details.');
        navigate('/admin/employees');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [id, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-7 w-7 animate-spin text-yellow-500" />
          <p className="text-sm font-medium text-slate-500">Loading employee details...</p>
        </div>
      </div>
    );
  }

  if (!employee) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-slate-500">
              <span>Users</span>
              <ChevronRight size={12} />
              <span>Employee Management</span>
              <ChevronRight size={12} />
              <span className="text-slate-700 capitalize">{employee.name.toLowerCase()}</span>
            </div>
            <h1 className="text-3xl font-black tracking-tight text-slate-950 capitalize">{employee.name.toLowerCase()}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm font-semibold text-slate-500">
              <span>{employee.phone}</span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                {employee.employeeCode}
              </span>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${
                employee.active ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
              }`}>
                {employee.active ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => navigate('/admin/employees')}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 transition-all hover:bg-slate-50"
            >
              <ArrowLeft size={16} />
              Back
            </button>
            <button
              type="button"
              onClick={() => navigate(`/admin/employees/edit/${employee._id}`)}
              className="rounded-2xl bg-yellow-400 px-5 py-3 text-sm font-bold text-black shadow-lg shadow-yellow-200 transition-all hover:bg-yellow-500"
            >
              Edit Employee
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <StatCard icon={Users} label="Users Acquired" value={employee.totalUsersAcquired} tone="bg-sky-50 text-sky-700" />
          <StatCard icon={Car} label="Drivers Acquired" value={employee.totalDriversAcquired} tone="bg-amber-50 text-amber-700" />
          <StatCard icon={UserRound} label="Total Acquired" value={employee.totalAcquired} tone="bg-yellow-50 text-yellow-700" />
        </div>

        {employee.notes ? (
          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-bold text-slate-500">Notes</p>
            <p className="mt-3 text-sm font-semibold leading-6 text-slate-700">{employee.notes}</p>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-black text-slate-950">Users Added</h2>
              <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">{users.length} users</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px]">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="px-3 py-2 text-left text-sm font-bold text-slate-500">Name</th>
                    <th className="px-3 py-2 text-left text-sm font-bold text-slate-500">Phone</th>
                    <th className="px-3 py-2 text-left text-sm font-bold text-slate-500">Email</th>
                    <th className="px-3 py-2 text-left text-sm font-bold text-slate-500">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-8 text-center text-sm font-semibold text-slate-500">
                        No users have signed up with this employee code yet.
                      </td>
                    </tr>
                  ) : users.map((user) => (
                    <tr key={user._id}>
                      <td className="px-3 py-3 text-sm font-bold text-slate-900 capitalize">{user.name.toLowerCase()}</td>
                      <td className="px-3 py-3 text-sm font-semibold text-slate-700">{user.phone}</td>
                      <td className="px-3 py-3 text-sm font-semibold text-slate-700">{user.email || 'N/A'}</td>
                      <td className="px-3 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                          user.active ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                        }`}>
                          {user.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-black text-slate-950">Drivers Added</h2>
              <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">{drivers.length} drivers</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px]">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="px-3 py-2 text-left text-sm font-bold text-slate-500">Name</th>
                    <th className="px-3 py-2 text-left text-sm font-bold text-slate-500">Phone</th>
                    <th className="px-3 py-2 text-left text-sm font-bold text-slate-500">Type</th>
                    <th className="px-3 py-2 text-left text-sm font-bold text-slate-500">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {drivers.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-8 text-center text-sm font-semibold text-slate-500">
                        No drivers have signed up with this employee code yet.
                      </td>
                    </tr>
                  ) : drivers.map((driver) => (
                    <tr key={driver._id}>
                      <td className="px-3 py-3 text-sm font-bold text-slate-900 capitalize">{driver.name.toLowerCase()}</td>
                      <td className="px-3 py-3 text-sm font-semibold text-slate-700">{driver.phone}</td>
                      <td className="px-3 py-3 text-sm font-semibold text-slate-700">{driver.registerFor || driver.vehicleType || 'Driver'}</td>
                      <td className="px-3 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                          driver.approve ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                        }`}>
                          {driver.status || (driver.approve ? 'approved' : 'pending')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmployeeDetails;
