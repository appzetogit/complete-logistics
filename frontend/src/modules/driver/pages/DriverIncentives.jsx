import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Flame,
  Gift,
  Loader2,
  Star,
  Trophy,
  Zap,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import DriverBottomNav from '../../shared/components/DriverBottomNav';
import { claimDriverIncentiveReward, getCurrentDriver, getDriverIncentives } from '../services/registrationService';

const unwrap = (response) => response?.data?.data || response?.data || response || {};

const formatCurrency = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`;

const progressPercent = (current, target) => {
  const safeTarget = Math.max(1, Number(target || 0));
  const safeCurrent = Math.max(0, Number(current || 0));
  return Math.min(100, Math.round((safeCurrent / safeTarget) * 100));
};

const DriverIncentives = () => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [claimingKey, setClaimingKey] = useState('');
  const [driverRating, setDriverRating] = useState(0);

  const fetchIncentives = async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    setError('');

    try {
      const [incentiveResponse, driverResponse] = await Promise.all([
        getDriverIncentives(),
        getCurrentDriver(),
      ]);
      setData(unwrap(incentiveResponse));
      setDriverRating(Number(unwrap(driverResponse)?.rating || 0));
    } catch (requestError) {
      setError(requestError?.response?.data?.message || requestError?.message || 'Unable to load milestone progress');
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  useEffect(() => {
    fetchIncentives();
  }, []);

  const handleClaim = async (rewardType, rewardKey) => {
    setClaimingKey(`${rewardType}:${rewardKey}`);
    try {
      const response = await claimDriverIncentiveReward({ rewardType, rewardKey });
      const claimedReward = unwrap(response)?.claimedReward;
      toast.success(`${formatCurrency(claimedReward?.amount || 0)} added to your pocket!`);
      await fetchIncentives({ quiet: true });
    } catch (requestError) {
      toast.error(requestError?.response?.data?.message || requestError?.message || 'Unable to claim reward');
    } finally {
      setClaimingKey('');
    }
  };

  const summary = useMemo(() => data?.summary || {}, [data]);
  const milestones = useMemo(() => data?.milestones || [], [data]);
  const features = useMemo(() => data?.features || [], [data]);
  const claimedRewards = useMemo(() => data?.claimedRewards || [], [data]);
  const bonusEarnings = useMemo(
    () => claimedRewards.reduce((sum, item) => sum + Number(item?.amount || 0), 0),
    [claimedRewards],
  );

  // Simple Level System
  const levelData = useMemo(() => {
    const totalTrips = Number(summary.totalTrips || summary.currentWeekTrips || 0);
    const level = Math.floor(totalTrips / 50) + 1;
    const currentXP = totalTrips % 50;
    const targetXP = 50;
    
    const levels = [
      { name: 'Bronze', color: '#B45309' },
      { name: 'Silver', color: '#64748B' },
      { name: 'Gold', color: '#D97706' },
      { name: 'Platinum', color: '#4F46E5' },
    ];
    
    return {
      level,
      percent: (currentXP / targetXP) * 100,
      currentXP,
      targetXP,
      ...levels[Math.min(level - 1, levels.length - 1)]
    };
  }, [summary]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center">
        <Loader2 className="animate-spin text-black" size={24} />
        <p className="mt-4 text-xs font-semibold text-gray-400 uppercase tracking-widest">Loading Rewards</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white font-sans pb-32">
      {/* Clean Header */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md px-6 pt-10 pb-6 border-b border-gray-100">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/taxi/driver/profile')}
              className="flex h-10 w-10 items-center justify-center rounded-2xl border border-gray-100 bg-white shadow-sm"
              aria-label="Back to account"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Incentives</h1>
              <p className="text-[11px] font-medium text-gray-400 uppercase tracking-widest">Driver Earnings</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Bonus earned</p>
            <p className="text-lg font-bold text-black">{formatCurrency(bonusEarnings)}</p>
          </div>
        </div>
      </header>

      <main className="px-6 pt-6 space-y-8">
        {/* Level Overview */}
        <section className="bg-gray-50 rounded-3xl p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="h-12 w-12 rounded-2xl bg-white flex items-center justify-center shadow-sm">
              <Trophy size={24} style={{ color: levelData.color }} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">{levelData.name} Partner</h2>
              <p className="text-sm font-medium text-gray-500">Level {levelData.level}</p>
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-bold">
              <span className="text-gray-400">Next Level</span>
              <span className="text-gray-900">{levelData.currentXP} / {levelData.targetXP} trips</span>
            </div>
            <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-black rounded-full transition-all duration-1000" 
                style={{ width: `${levelData.percent}%` }}
              />
            </div>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-4 pt-6 border-t border-gray-200/50">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Streak</p>
              <p className="text-base font-bold text-gray-900 flex items-center gap-1">
                {summary.streakDays || 0} <Flame size={14} className="text-orange-500" />
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Weekly</p>
              <p className="text-base font-bold text-gray-900">{summary.currentWeekTrips || 0} trips</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Rating</p>
              <p className="text-base font-bold text-gray-900 flex items-center gap-1">
                {driverRating.toFixed(1)} <Star size={14} className="text-yellow-500 fill-yellow-500" />
              </p>
            </div>
          </div>
        </section>

        {/* Active Quests */}
        <section className="space-y-4">
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-widest">Active Quests</h3>
          
          <div className="space-y-3">
            {milestones.map((milestone) => {
              const claimKey = `milestone:${milestone.id}`;
              const progress = progressPercent(milestone.progress?.qualifyingDays, milestone.progress?.targetDays);
              const canClaim = milestone.isEligible && !milestone.isClaimed;

              return (
                <div key={milestone.id} className="border border-gray-100 rounded-3xl p-5 hover:bg-gray-50 transition-colors">
                  <div className="flex justify-between items-start mb-4">
                    <div className="space-y-1">
                      <h4 className="font-bold text-gray-900">{milestone.name}</h4>
                      <p className="text-xs text-gray-500">{milestone.required_weeks} weeks consistency challenge</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Reward</p>
                      <p className="text-sm font-bold text-green-600">{formatCurrency(milestone.payout_amount)}</p>
                    </div>
                  </div>
                  
                  <div className="space-y-1.5 mb-5">
                    <div className="flex justify-between text-[10px] font-bold text-gray-400">
                      <span>Progress</span>
                      <span>{milestone.progress?.qualifyingDays || 0}/{milestone.progress?.targetDays || 0} days</span>
                    </div>
                    <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-600 rounded-full" style={{ width: `${progress}%` }} />
                    </div>
                  </div>

                  <button
                    disabled={!canClaim || claimingKey === claimKey}
                    onClick={() => handleClaim('milestone', milestone.id)}
                    className={`w-full py-3 rounded-2xl text-xs font-bold uppercase tracking-widest transition-all ${
                      canClaim 
                        ? 'bg-black text-white shadow-lg shadow-gray-200' 
                        : milestone.isClaimed 
                        ? 'bg-green-50 text-green-600 border border-green-100' 
                        : 'bg-gray-50 text-gray-400 border border-gray-100'
                    }`}
                  >
                    {claimingKey === claimKey ? 'Claiming...' : milestone.isClaimed ? 'Reward Claimed' : 'Ongoing'}
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {/* Referral Card */}
        <section className="bg-black rounded-3xl p-6 text-white overflow-hidden relative">
          <div className="relative z-10">
            <h3 className="text-lg font-bold mb-2">Invite a Friend</h3>
            <p className="text-sm text-gray-400 mb-6">Earn {formatCurrency(data?.referralRewardAmount || 500)} for every new driver you refer.</p>
            <button 
              onClick={() => navigate('/taxi/driver/referral')}
              className="px-6 py-3 bg-white text-black rounded-2xl text-xs font-bold uppercase tracking-widest"
            >
              Invite Now
            </button>
          </div>
          <Gift className="absolute -right-4 -bottom-4 text-white/10" size={120} />
        </section>

        {/* Boosters */}
        <section className="space-y-4 pb-10">
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-widest">Bonus Boosters</h3>
          <div className="grid grid-cols-1 gap-3">
            {features.filter(f => f.enabled).map((feature) => {
              const claimKey = `feature:${feature.key}`;
              const progress = progressPercent(feature.currentValue, feature.targetValue);
              const canClaim = feature.isEligible && !feature.isClaimed;

              return (
                <div key={feature.key} className="border border-gray-100 rounded-3xl p-5 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-2xl bg-gray-50 flex items-center justify-center text-gray-400">
                      {feature.key.includes('streak') ? <Flame size={18} /> : <Zap size={18} />}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-gray-900">{feature.label}</h4>
                      <p className="text-[10px] font-medium text-gray-400">{feature.currentValue}/{feature.targetValue} {feature.unit}</p>
                    </div>
                  </div>
                  <div className="text-right flex flex-col items-end gap-2">
                    <p className="text-sm font-bold text-black">{formatCurrency(feature.reward_amount)}</p>
                    <button
                      disabled={!canClaim || claimingKey === claimKey}
                      onClick={() => handleClaim('feature', feature.key)}
                      className={`px-4 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-widest ${
                        canClaim ? 'bg-black text-white' : 'text-gray-300'
                      }`}
                    >
                      {feature.isClaimed ? 'Done' : 'Claim'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>

      <DriverBottomNav />
    </div>
  );
};

export default DriverIncentives;
