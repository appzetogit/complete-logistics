import React, { useEffect, useMemo, useState } from 'react';
import { Car, LoaderCircle, LogOut, Phone, ShieldCheck, Users } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { clearDriverAuthState, getCurrentDriver } from '../services/registrationService';

const unwrap = (response) => response?.data?.data || response?.data || response;

const PoolingDriverDashboard = () => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const loadProfile = async () => {
      try {
        const response = await getCurrentDriver();
        const data = unwrap(response);
        if (!active) {
          return;
        }

        if (data?.approve === false || String(data?.status || '').toLowerCase() === 'pending') {
          navigate('/taxi/driver/pooling/status', { replace: true });
          return;
        }

        setProfile(data);
      } catch (err) {
        if (active) {
          setError(err?.message || 'Unable to load pooling driver profile');
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
  }, [navigate]);

  const vehicle = profile?.poolingVehicle || {};
  const image = profile?.vehicleImage || vehicle?.images?.[0] || '';

  const summary = useMemo(() => [
    {
      label: 'Phone',
      value: profile?.phone ? `+91 ${profile.phone}` : '-',
      icon: Phone,
    },
    {
      label: 'Capacity',
      value: `${vehicle?.capacity || 0} seats`,
      icon: Users,
    },
    {
      label: 'Status',
      value: profile?.status || 'active',
      icon: ShieldCheck,
    },
  ], [profile, vehicle?.capacity]);

  const handleLogout = () => {
    clearDriverAuthState();
    navigate('/taxi/driver/login', { replace: true });
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <LoaderCircle className="animate-spin text-slate-900" size={32} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F8FC] px-5 py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-teal-600">Pooling Console</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
              {profile?.name || 'Pooling Driver'}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="inline-flex rounded-2xl bg-white p-1 shadow-sm">
              <Link to="/taxi/driver/pooling" className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-black text-white">
                Overview
              </Link>
              <Link to="/taxi/driver/pooling/bookings" className="rounded-xl px-4 py-2 text-sm font-black text-slate-500">
                Bookings
              </Link>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm"
              aria-label="Logout"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>

        {error ? (
          <div className="rounded-3xl border border-rose-100 bg-rose-50 p-5 text-sm font-bold text-rose-600">
            {error}
          </div>
        ) : null}

        <div className="overflow-hidden rounded-[36px] bg-white shadow-xl shadow-slate-200/60">
          <div className="bg-slate-900 p-6 text-white">
            <div className="flex items-center justify-between">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest">
                <ShieldCheck size={12} />
                Approved
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                {profile?.status || 'active'}
              </span>
            </div>

            <div className="mt-8 flex flex-col gap-5 md:flex-row md:items-center">
              <div className="flex h-28 w-32 shrink-0 items-center justify-center overflow-hidden rounded-3xl bg-white/10">
                {image ? (
                  <img src={image} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Car size={40} className="text-white/60" />
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-3xl font-black">{profile?.vehicleMake || vehicle?.name || 'Pooling Vehicle'}</p>
                <p className="mt-2 text-xs font-black uppercase tracking-[0.18em] text-teal-300">
                  {profile?.vehicleNumber || vehicle?.vehicleNumber || 'No plate'}
                </p>
                <p className="mt-4 text-sm font-semibold text-slate-300">
                  {[profile?.vehicleModel, profile?.vehicleColor].filter(Boolean).join(' - ') || 'Vehicle details'}
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 p-6 md:grid-cols-3">
            {summary.map((item) => (
              <div key={item.label} className="rounded-3xl bg-slate-50 p-5">
                <item.icon className="text-teal-600" size={22} />
                <p className="mt-4 text-[10px] font-black uppercase tracking-widest text-slate-400">{item.label}</p>
                <p className="mt-1 text-sm font-black text-slate-900">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[32px] bg-white p-6 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Vehicle Snapshot</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="rounded-3xl bg-slate-50 p-5">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Driver Name</p>
                <p className="mt-2 text-lg font-black text-slate-900">{profile?.name || '-'}</p>
              </div>
              <div className="rounded-3xl bg-slate-50 p-5">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Vehicle Type</p>
                <p className="mt-2 text-lg font-black text-slate-900">{vehicle?.vehicleType || 'sedan'}</p>
              </div>
              <div className="rounded-3xl bg-slate-50 p-5">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Model</p>
                <p className="mt-2 text-lg font-black text-slate-900">{vehicle?.vehicleModel || '-'}</p>
              </div>
              <div className="rounded-3xl bg-slate-50 p-5">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Color</p>
                <p className="mt-2 text-lg font-black text-slate-900">{vehicle?.color || '-'}</p>
              </div>
            </div>
          </div>

          <div className="rounded-[32px] border border-teal-100 bg-teal-50 p-6 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-teal-700">Next</p>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-900">Check bookings separately</h2>
            <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
              Your trip assignments live in a separate bookings screen so the profile stays simple and easy to scan.
            </p>
            <Link
              to="/taxi/driver/pooling/bookings"
              className="mt-6 inline-flex rounded-2xl bg-slate-900 px-5 py-3 text-sm font-black uppercase tracking-[0.18em] text-white"
            >
              Open Bookings
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PoolingDriverDashboard;
