import React, { useEffect, useState } from 'react';
import { Clock3, LogOut, Phone, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  clearDriverAuthState,
  getCurrentDriver,
} from '../../services/registrationService';

const unwrap = (response) => response?.data?.data || response?.data || response;

const PoolingDriverPendingStatus = () => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const loadProfile = async () => {
      try {
        const response = await getCurrentDriver();
        if (active) {
          setProfile(unwrap(response));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadProfile();

    return () => {
      active = false;
    };
  }, []);

  const handleLogout = () => {
    clearDriverAuthState();
    navigate('/taxi/driver/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-[#F4F7FB] px-5 py-8">
      <div className="mx-auto max-w-lg space-y-6">
        <div className="rounded-[36px] bg-white p-7 shadow-xl shadow-slate-200/60">
          <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-4 py-2 text-[11px] font-black uppercase tracking-[0.2em] text-amber-700">
            <Clock3 size={14} />
            Pending Review
          </div>

          <h1 className="mt-6 text-3xl font-black tracking-tight text-slate-900">
            Pooling request received
          </h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-slate-500">
            Your pooling driver profile is created and waiting for admin approval. Once accepted,
            this login number will open your pooling dashboard directly.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="rounded-3xl bg-slate-50 p-5">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Driver Name</p>
              <p className="mt-2 text-lg font-black text-slate-900">
                {profile?.name || 'Pooling Driver'}
              </p>
            </div>
            <div className="rounded-3xl bg-slate-50 p-5">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                <Phone size={12} />
                Login Number
              </div>
              <p className="mt-2 text-lg font-black text-slate-900">
                +91 {profile?.phone || '-'}
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-3xl border border-teal-100 bg-teal-50 p-5 text-sm font-semibold leading-6 text-teal-900">
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-teal-700">
              <ShieldCheck size={14} />
              What happens next
            </div>
            <p className="mt-3">
              Admin will review your vehicle details, then approve the profile from the new pending pooling drivers queue.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center justify-center gap-2 rounded-3xl bg-slate-900 px-5 py-4 text-sm font-black uppercase tracking-[0.18em] text-white shadow-xl shadow-slate-300/60"
        >
          <LogOut size={16} />
          Logout
        </button>

        {loading ? (
          <p className="text-center text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
            Loading request details...
          </p>
        ) : null}
      </div>
    </div>
  );
};

export default PoolingDriverPendingStatus;
