import React, { useEffect, useState } from 'react';
import { ArrowLeft, ChevronRight, Loader2, UserRound } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { adminService } from '../../services/adminService';

const inputClass =
  'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-yellow-400 focus:ring-4 focus:ring-yellow-400/20';
const labelClass = 'mb-2 block text-sm font-bold text-slate-700';

const EmployeeCreate = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    employeeCode: '',
    active: true,
    notes: '',
  });
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isEdit) {
      return;
    }

    const loadEmployee = async () => {
      setLoading(true);
      try {
        const response = await adminService.getEmployee(id);
        const employee = response?.data?.employee;

        if (!employee) {
          toast.error('Employee not found.');
          navigate('/admin/employees');
          return;
        }

        setForm({
          name: employee.name || '',
          phone: employee.phone || '',
          employeeCode: employee.employeeCode || '',
          active: employee.active !== false,
          notes: employee.notes || '',
        });
      } catch (error) {
        toast.error(error?.message || 'Unable to load employee.');
        navigate('/admin/employees');
      } finally {
        setLoading(false);
      }
    };

    loadEmployee();
  }, [id, isEdit, navigate]);

  const setField = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!form.name.trim()) {
      toast.error('Employee name is required.');
      return;
    }

    if (!form.phone.trim()) {
      toast.error('Employee phone is required.');
      return;
    }

    if (!form.employeeCode.trim()) {
      toast.error('Employee code is required.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        employeeCode: form.employeeCode.trim().toUpperCase(),
        active: form.active,
        notes: form.notes.trim(),
      };

      if (isEdit) {
        await adminService.updateEmployee(id, payload);
        toast.success('Employee updated.');
        navigate(`/admin/employees/${id}`);
      } else {
        const response = await adminService.createEmployee(payload);
        toast.success('Employee created.');
        navigate(`/admin/employees/${response?.data?._id || ''}`);
      }
    } catch (error) {
      toast.error(error?.message || 'Unable to save employee.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-7 w-7 animate-spin text-yellow-500" />
          <p className="text-sm font-medium text-slate-500">Loading employee...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FFFDF5] p-4 lg:p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-slate-500">
              <span>Users</span>
              <ChevronRight size={12} />
              <span>Employee Management</span>
              <ChevronRight size={12} />
              <span className="text-slate-700">{isEdit ? 'Edit Employee' : 'Add Employee'}</span>
            </div>
            <h1 className="text-3xl font-black tracking-tight text-slate-950">
              {isEdit ? 'Update Employee' : 'Create Employee'}
            </h1>
            <p className="mt-2 text-sm font-semibold text-slate-500">
              Assign a unique employee code that can be used during user and driver signup.
            </p>
          </div>

          <button
            type="button"
            onClick={() => navigate('/admin/employees')}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 transition-all hover:bg-slate-50"
          >
            <ArrowLeft size={16} />
            Back to Employees
          </button>
        </div>

        <form onSubmit={handleSubmit} className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/50">
          <div className="mb-6 flex items-center gap-3">
            <div className="rounded-2xl bg-yellow-50 p-3 text-yellow-700">
              <UserRound size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Employee Master</h2>
              <p className="text-xs font-semibold text-slate-500">Identity and attribution configuration</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div>
              <label className={labelClass}>Employee Name</label>
              <input
                value={form.name}
                onChange={(event) => setField('name', event.target.value)}
                placeholder="Enter employee name"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Phone Number</label>
              <input
                value={form.phone}
                onChange={(event) => setField('phone', event.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="Enter 10-digit phone"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Employee Code</label>
              <input
                value={form.employeeCode}
                onChange={(event) => setField('employeeCode', event.target.value.toUpperCase())}
                placeholder="EMP-INDORE-01"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Status</label>
              <button
                type="button"
                onClick={() => setField('active', !form.active)}
                className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-sm font-bold transition-all ${
                  form.active
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-rose-200 bg-rose-50 text-rose-700'
                }`}
              >
                <span>{form.active ? 'Active' : 'Inactive'}</span>
                <span className="text-xs font-bold">
                  {form.active ? 'Accepting codes' : 'Blocked'}
                </span>
              </button>
            </div>
          </div>

          <div className="mt-5">
            <label className={labelClass}>Notes</label>
            <textarea
              rows={4}
              value={form.notes}
              onChange={(event) => setField('notes', event.target.value)}
              placeholder="Optional notes about this employee"
              className={`${inputClass} resize-none`}
            />
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => navigate('/admin/employees')}
              className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition-all hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-yellow-400 px-6 py-3 text-sm font-bold text-black shadow-lg shadow-yellow-200 transition-all hover:bg-yellow-500 disabled:opacity-70"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : null}
              {isEdit ? 'Update Employee' : 'Create Employee'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EmployeeCreate;
