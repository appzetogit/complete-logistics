import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2, PackageCheck, Wallet } from 'lucide-react';
import toast from 'react-hot-toast';
import { userAuthService } from '../../services/authService';

const safeArray = (value) => (Array.isArray(value) ? value : []);

const unwrapResults = (payload) =>
  safeArray(payload?.data?.results || payload?.results || payload?.data);

const unwrapSummary = (payload) => payload?.data || payload || {};

const formatCurrency = (value) => `₹${Number(value || 0).toFixed(2)}`;

const Subscriptions = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [buyingId, setBuyingId] = useState('');
  const [plans, setPlans] = useState([]);
  const [summary, setSummary] = useState({
    activeCount: 0,
    availableRideCredits: 0,
    hasUnlimitedPlan: false,
    activePlans: [],
    history: [],
  });
  const [walletBalance, setWalletBalance] = useState(0);

  const loadData = async () => {
    try {
      setLoading(true);
      const [plansResponse, subscriptionsResponse, walletResponse] = await Promise.all([
        userAuthService.getSubscriptionPlans(),
        userAuthService.getMySubscriptions(),
        userAuthService.getWallet(),
      ]);

      setPlans(unwrapResults(plansResponse));
      setSummary({
        activeCount: Number(subscriptionsResponse?.data?.activeCount || 0),
        availableRideCredits: Number(subscriptionsResponse?.data?.availableRideCredits || 0),
        hasUnlimitedPlan: Boolean(subscriptionsResponse?.data?.hasUnlimitedPlan),
        activePlans: safeArray(subscriptionsResponse?.data?.activePlans),
        history: safeArray(subscriptionsResponse?.data?.history),
      });
      setWalletBalance(Number(walletResponse?.data?.balance || 0));
    } catch (error) {
      toast.error(error?.message || 'Failed to load subscriptions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const activeVehicleIds = useMemo(
    () => new Set(safeArray(summary.activePlans).map((item) => String(item.vehicle_type_id || '')).filter(Boolean)),
    [summary.activePlans],
  );

  const handleBuy = async (planId) => {
    try {
      setBuyingId(planId);
      const response = await userAuthService.buySubscription(planId);
      toast.success(response?.message || 'Subscription purchased');
      await loadData();
    } catch (error) {
      toast.error(error?.message || 'Unable to purchase subscription');
    } finally {
      setBuyingId('');
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-10">
      <div className="mx-auto max-w-3xl px-4 pt-8">
        <div className="mb-6 flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/taxi/user/profile')}
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-2xl font-black text-slate-900">Subscriptions</h1>
            <p className="text-sm font-medium text-slate-500">Buy ride passes for specific vehicle categories.</p>
          </div>
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Wallet Balance</p>
            <p className="mt-2 text-2xl font-black text-slate-900">{formatCurrency(walletBalance)}</p>
          </div>
          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Active Plans</p>
            <p className="mt-2 text-2xl font-black text-slate-900">{summary.activeCount}</p>
          </div>
          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Ride Credits</p>
            <p className="mt-2 text-2xl font-black text-slate-900">
              {summary.hasUnlimitedPlan ? 'Unlimited' : summary.availableRideCredits}
            </p>
          </div>
        </div>

        <div className="mb-6 rounded-3xl bg-slate-900 p-6 text-white shadow-xl">
          <div className="flex items-start gap-3">
            <PackageCheck className="mt-0.5 h-6 w-6 text-emerald-300" />
            <div>
              <h2 className="text-lg font-black">Your Active Coverage</h2>
              {summary.activePlans.length === 0 ? (
                <p className="mt-2 text-sm text-slate-300">No active subscription yet. Buy one below to start using included rides.</p>
              ) : (
                <div className="mt-3 space-y-3">
                  {summary.activePlans.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-black">{item.name}</p>
                          <p className="text-xs text-slate-300">{item.vehicle_type?.name || 'Vehicle plan'}</p>
                        </div>
                        <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-black uppercase tracking-wide text-emerald-200">
                          {item.isUnlimited ? 'Unlimited' : `${item.rides_remaining} rides left`}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {plans.map((plan) => {
            const hasSameVehicleActivePlan = activeVehicleIds.has(String(plan.vehicle_type_id || ''));
            const isBuying = buyingId === plan.id;

            return (
              <div key={plan.id} className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="mb-2 flex items-center gap-2">
                      <h3 className="text-lg font-black text-slate-900">{plan.name}</h3>
                      {hasSameVehicleActivePlan ? (
                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-emerald-700">
                          Active on this category
                        </span>
                      ) : null}
                    </div>
                    <p className="text-sm font-medium text-slate-500">{plan.description || plan.how_it_works || 'Subscription ride plan'}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                        {plan.vehicle_type?.name || 'Vehicle category'}
                      </span>
                      <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">
                        {plan.duration} days
                      </span>
                      <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">
                        {plan.benefit_type === 'unlimited' ? 'Unlimited rides' : `${plan.ride_limit} rides included`}
                      </span>
                    </div>
                  </div>
                  <div className="md:text-right">
                    <p className="text-2xl font-black text-slate-900">{formatCurrency(plan.amount)}</p>
                    <button
                      type="button"
                      disabled={isBuying || walletBalance < Number(plan.amount || 0)}
                      onClick={() => handleBuy(plan.id)}
                      className="mt-4 inline-flex min-w-[170px] items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-black text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isBuying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet size={16} />}
                      Buy With Wallet
                    </button>
                    {walletBalance < Number(plan.amount || 0) ? (
                      <p className="mt-2 text-xs font-semibold text-rose-500">Not enough wallet balance for this plan.</p>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {summary.history.length > 0 ? (
          <div className="mt-8 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
            <h2 className="text-lg font-black text-slate-900">Subscription History</h2>
            <div className="mt-4 space-y-3">
              {summary.history.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 px-4 py-3">
                  <div>
                    <p className="text-sm font-black text-slate-900">{item.name}</p>
                    <p className="text-xs font-semibold text-slate-500">
                      {item.vehicle_type?.name || 'Vehicle plan'} • {item.isUnlimited ? 'Unlimited' : `${item.rides_used}/${item.ride_limit} used`}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-2">
                      {item.status === 'active' ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-amber-500" />
                      )}
                      <span className="text-xs font-black uppercase tracking-wide text-slate-700">{item.status}</span>
                    </div>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      {item.expiresAt ? `Ends ${new Date(item.expiresAt).toLocaleDateString()}` : 'No expiry'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default Subscriptions;
