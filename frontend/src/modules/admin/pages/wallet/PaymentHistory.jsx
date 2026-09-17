import React from 'react';
import { ArrowRight, CreditCard, Wallet } from 'lucide-react';

const PaymentHistory = () => {
  const [role, setRole] = React.useState('Driver');
  const [month, setMonth] = React.useState('April 2026');

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">Wallet</p>
        <h1 className="mt-1 text-[22px] font-black tracking-tight text-slate-900">PAYMENT HISTORY</h1>
      </div>

      <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
          <div className="space-y-2">
            <label className="text-[13px] font-medium text-slate-900">Select Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="h-12 w-full rounded-xl border-2 border-slate-200 bg-white px-4 text-[14px] font-medium text-slate-800 outline-none"
            >
              <option>Select</option>
              <option>User</option>
              <option>Driver</option>
              <option>Owner</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[13px] font-medium text-slate-900">Select Month</label>
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="h-12 w-full rounded-xl border-2 border-slate-200 bg-white px-4 text-[14px] font-medium text-slate-800 outline-none"
            >
              <option>April 2026</option>
              <option>March 2026</option>
              <option>February 2026</option>
              <option>January 2026</option>
            </select>
          </div>

          <button className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#4054b2] px-5 text-[13px] font-black uppercase tracking-[0.2em] text-white">
            <Wallet size={16} />
            View Wallet
          </button>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Role</p>
            <p className="mt-2 text-[16px] font-black text-slate-900">{role}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Selected Month</p>
            <p className="mt-2 text-[16px] font-black text-slate-900">{month}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Action</p>
            <p className="mt-2 text-[16px] font-black text-slate-900">Open payment ledger</p>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[#4054b2] shadow-sm">
              <CreditCard size={18} />
            </div>
            <div>
              <p className="text-[13px] font-black uppercase tracking-[0.18em] text-slate-900">Payment History</p>
              <p className="text-[12px] font-medium text-slate-500">
                This screen is ready for wallet transactions, balance checks, and role-based payment filters.
              </p>
            </div>
            <button className="ml-auto inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-[12px] font-black uppercase tracking-[0.18em] text-slate-700">
              Next <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentHistory;
