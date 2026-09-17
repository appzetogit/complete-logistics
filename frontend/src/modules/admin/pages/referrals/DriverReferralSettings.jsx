import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ChevronRight,
  Clock3,
  Gift,
  Info,
  Loader2,
  Plus,
  Save,
  Share2,
  Sparkles,
  Trash2,
  Trophy,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { adminService } from '../../services/adminService';

const labelClass = 'block text-sm font-semibold text-gray-700 mb-1.5';
const inputClass = 'w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-800 bg-white focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 outline-none transition-colors';

const defaultMilestone = (index = 1) => ({
  id: `milestone_${Date.now()}_${index}`,
  name: '',
  enabled: true,
  active_hours_per_day: 8,
  required_weeks: 4,
  min_trips_per_week: 40,
  payout_amount: 500,
  notes: '',
});

const defaultRewardFeatures = [
  {
    id: 'daily_active_streak',
    key: 'daily_active_streak',
    label: 'Daily active streak bonus',
    enabled: false,
    reward_amount: 150,
    target_value: 7,
    unit: 'days',
    description: 'Reward drivers for staying active every day for a full streak window.',
  },
  {
    id: 'weekly_trip_quest',
    key: 'weekly_trip_quest',
    label: 'Weekly trip quest',
    enabled: false,
    reward_amount: 600,
    target_value: 75,
    unit: 'trips',
    description: 'Uber and Ola style weekly quest for drivers who hit a trip slab.',
  },
  {
    id: 'peak_hour_booster',
    key: 'peak_hour_booster',
    label: 'Peak hour booster',
    enabled: false,
    reward_amount: 250,
    target_value: 20,
    unit: 'peak trips',
    description: 'Extra wallet reward for completing rides during demand-heavy hours.',
  },
  {
    id: 'weekend_warrior',
    key: 'weekend_warrior',
    label: 'Weekend warrior',
    enabled: false,
    reward_amount: 300,
    target_value: 2,
    unit: 'weekends',
    description: 'Bonus for maintaining availability and completing targets across weekends.',
  },
  {
    id: 'rating_guard',
    key: 'rating_guard',
    label: 'Rating guard bonus',
    enabled: false,
    reward_amount: 200,
    target_value: 4.8,
    unit: 'rating',
    description: 'Reward high-rated drivers who keep service quality consistently strong.',
  },
  {
    id: 'cancellation_guard',
    key: 'cancellation_guard',
    label: 'Low cancellation bonus',
    enabled: false,
    reward_amount: 180,
    target_value: 3,
    unit: '% cancel rate',
    description: 'Bonus for drivers who keep cancellation rate under a configured target.',
  },
];

const normalizeMilestone = (item, index = 1) => ({
  ...defaultMilestone(index),
  ...item,
  enabled: item?.enabled ?? true,
  active_hours_per_day: Number(item?.active_hours_per_day ?? 8),
  required_weeks: Number(item?.required_weeks ?? 4),
  min_trips_per_week: Number(item?.min_trips_per_week ?? 40),
  payout_amount: Number(item?.payout_amount ?? 500),
  notes: item?.notes || '',
});

const normalizeFeature = (baseFeature, storedFeature = {}) => ({
  ...baseFeature,
  ...storedFeature,
  enabled: storedFeature?.enabled ?? baseFeature.enabled,
  reward_amount: Number(storedFeature?.reward_amount ?? baseFeature.reward_amount),
  target_value: Number(storedFeature?.target_value ?? baseFeature.target_value),
  unit: storedFeature?.unit || baseFeature.unit,
  description: storedFeature?.description || baseFeature.description,
});

const normalizeDriverReferralSettings = (data = {}) => {
  const storedFeatures = Array.isArray(data.reward_features) ? data.reward_features : [];

  return {
    enabled: data.enabled ?? false,
    type: data.type || 'instant_referrer',
    amount: Number(data.amount || 0),
    ride_count: Number(data.ride_count || 0),
    milestone_program_enabled: data.milestone_program_enabled ?? false,
    milestone_programs: Array.isArray(data.milestone_programs) && data.milestone_programs.length > 0
      ? data.milestone_programs.map(normalizeMilestone)
      : [defaultMilestone()],
    reward_features: defaultRewardFeatures.map((feature) =>
      normalizeFeature(
        feature,
        storedFeatures.find((item) => item?.key === feature.key || item?.id === feature.id),
      ),
    ),
  };
};

const referralTypes = [
  { value: 'instant_referrer', label: 'Instant for Referrer Driver' },
  { value: 'instant_referrer_new', label: 'Instant for Referrer Driver and New Driver' },
  { value: 'conditional_referrer', label: 'Conditional for Referrer Driver' },
  { value: 'conditional_referrer_new', label: 'Conditional for Referrer Driver and New Driver' },
];

const DriverReferralSettings = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [settings, setSettings] = useState(() => normalizeDriverReferralSettings());

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await adminService.getReferralSettings('driver');
        setSettings(normalizeDriverReferralSettings(res.data || {}));
      } catch (err) {
        console.error('Fetch error:', err);
        toast.error('Failed to load settings');
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, []);

  const handleUpdate = async () => {
    setSaving(true);

    try {
      const payload = {
        ...settings,
        amount: Number(settings.amount || 0),
        ride_count: Number(settings.ride_count || 0),
        milestone_programs: settings.milestone_programs.map((item, index) => ({
          ...item,
          id: item.id || `milestone_${index + 1}`,
          active_hours_per_day: Number(item.active_hours_per_day || 0),
          required_weeks: Number(item.required_weeks || 0),
          min_trips_per_week: Number(item.min_trips_per_week || 0),
          payout_amount: Number(item.payout_amount || 0),
        })),
        reward_features: settings.reward_features.map((item, index) => ({
          ...item,
          id: item.id || `feature_${index + 1}`,
          reward_amount: Number(item.reward_amount || 0),
          target_value: Number(item.target_value || 0),
        })),
      };

      const res = await adminService.updateReferralSettings('driver', payload);
      if (res) {
        setShowSuccess(true);
        toast.success('Driver incentive settings updated');
        setTimeout(() => setShowSuccess(false), 3000);
      }
    } catch (err) {
      console.error('Update error:', err);
      toast.error('Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (newVal) => {
    const previous = settings;
    const updated = { ...settings, enabled: newVal };
    setSettings(updated);

    try {
      await adminService.updateReferralSettings('driver', updated);
      setShowSuccess(true);
      toast.success('Driver referral settings toggled');
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (err) {
      toast.error('Failed to toggle settings');
      setSettings(previous);
    }
  };

  const updateMilestone = (index, key, value) => {
    setSettings((current) => ({
      ...current,
      milestone_programs: current.milestone_programs.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [key]: value } : item,
      ),
    }));
  };

  const addMilestone = () => {
    setSettings((current) => ({
      ...current,
      milestone_programs: [...current.milestone_programs, defaultMilestone(current.milestone_programs.length + 1)],
    }));
  };

  const removeMilestone = (index) => {
    setSettings((current) => ({
      ...current,
      milestone_programs:
        current.milestone_programs.length === 1
          ? [defaultMilestone(1)]
          : current.milestone_programs.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const updateRewardFeature = (key, field, value) => {
    setSettings((current) => ({
      ...current,
      reward_features: current.reward_features.map((item) =>
        item.key === key ? { ...item, [field]: value } : item,
      ),
    }));
  };

  const isConditional = settings.type?.includes('conditional');
  const enabledFeatureCount = useMemo(
    () => settings.reward_features.filter((item) => item.enabled).length,
    [settings.reward_features],
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="animate-spin text-yellow-600" size={32} />
          <span className="text-sm text-gray-500 font-medium">Loading settings...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-4 lg:p-6 font-sans">

      <div className="max-w-6xl space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-yellow-50 flex items-center justify-center text-yellow-600">
                <Gift size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900 ">Driver Referral Earnings Setup</h3>
                <p className="text-xs text-gray-400 mt-0.5 font-medium">Configure referral rewards plus long-term milestone programs for drivers.</p>
              </div>
            </div>
            <button
              onClick={() => handleToggle(!settings.enabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${settings.enabled ? 'bg-yellow-400' : 'bg-gray-200'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>

          <div className="p-8 space-y-8">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <div className="space-y-5">
                <div className="max-w-xl space-y-2">
                  <label className={labelClass}>
                    Driver Referral Type <Info size={14} className="inline ml-1 text-gray-400" />
                  </label>
                  <div className="relative">
                    <select
                      value={settings.type}
                      onChange={(e) => setSettings({ ...settings, type: e.target.value })}
                      className={`${inputClass} appearance-none pr-10`}
                    >
                      <option value="">Select</option>
                      {referralTypes.map((type) => (
                        <option key={type.value} value={type.value}>{type.label}</option>
                      ))}
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                      <ChevronRight size={16} className="rotate-90" />
                    </div>
                  </div>
                </div>

                {isConditional && (
                  <div className="bg-gray-50/50 rounded-xl border border-gray-200 p-6 space-y-3">
                    <label className={labelClass}>Required Ride Count</label>
                    <input
                      type="number"
                      value={settings.ride_count}
                      onChange={(e) => setSettings({ ...settings, ride_count: e.target.value })}
                      className={inputClass}
                      placeholder="5"
                    />
                    <p className="text-[11px] text-gray-400 font-medium">Number of rides required before referral rewards unlock.</p>
                  </div>
                )}

                <div className="bg-gray-50/50 rounded-xl border border-gray-200 p-6 space-y-3">
                  <label className={labelClass}>Earnings to Each Referral</label>
                  <input
                    type="number"
                    value={settings.amount}
                    onChange={(e) => setSettings({ ...settings, amount: e.target.value })}
                    className={inputClass}
                    placeholder="100"
                  />
                  <p className="text-[11px] text-gray-400 font-medium">Wallet amount credited for each successful driver referral.</p>
                </div>
              </div>

              <div className="rounded-2xl border border-dashed border-yellow-200 bg-gradient-to-br from-yellow-50 to-white p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-white text-yellow-600 border border-yellow-100 flex items-center justify-center shadow-sm">
                    <Share2 size={22} />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-gray-900">Driver growth stack</h4>
                    <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                      Mix normal referral payout with Ola/Uber style milestone rewards like active-hour streaks,
                      weekly quests, peak bonuses, rating protection, and cancellation discipline.
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-white border border-yellow-100 p-4">
                    <p className="text-[10px] font-black  text-slate-400">Milestones</p>
                    <p className="mt-2 text-2xl font-black text-slate-900">{settings.milestone_programs.length}</p>
                  </div>
                  <div className="rounded-xl bg-white border border-yellow-100 p-4">
                    <p className="text-[10px] font-black  text-slate-400">Active features</p>
                    <p className="mt-2 text-2xl font-black text-slate-900">{enabledFeatureCount}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 overflow-hidden">
              <div className="px-6 py-5 bg-slate-50 border-b border-gray-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-yellow-50 text-yellow-600 flex items-center justify-center">
                    <Trophy size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 ">Driver Milestone Program</h3>
                    <p className="text-xs text-gray-500">Create milestone payout slabs based on daily active time and sustained weekly performance.</p>
                  </div>
                </div>
                <button
                  onClick={() => setSettings((current) => ({ ...current, milestone_program_enabled: !current.milestone_program_enabled }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${settings.milestone_program_enabled ? 'bg-yellow-400' : 'bg-gray-200'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.milestone_program_enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              <div className="p-6 space-y-5">
                {settings.milestone_programs.map((item, index) => (
                  <div key={item.id} className="rounded-2xl border border-gray-200 p-5 bg-white space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-yellow-50 text-yellow-600 flex items-center justify-center">
                          <Clock3 size={18} />
                        </div>
                        <div>
                          <p className="text-[11px] font-black  text-slate-400">Milestone {index + 1}</p>
                          <p className="text-sm font-bold text-slate-900">{item.name || 'Untitled milestone'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => updateMilestone(index, 'enabled', !item.enabled)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${item.enabled ? 'bg-yellow-400' : 'bg-gray-200'}`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${item.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeMilestone(index)}
                          className="h-10 w-10 rounded-xl border border-rose-100 bg-rose-50 text-rose-500 flex items-center justify-center hover:bg-rose-100 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
                      <div className="xl:col-span-2">
                        <label className={labelClass}>Milestone Name</label>
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => updateMilestone(index, 'name', e.target.value)}
                          className={inputClass}
                          placeholder="30-day active streak"
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Active Hours / Day</label>
                        <input
                          type="number"
                          value={item.active_hours_per_day}
                          onChange={(e) => updateMilestone(index, 'active_hours_per_day', e.target.value)}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Required Weeks</label>
                        <input
                          type="number"
                          value={item.required_weeks}
                          onChange={(e) => updateMilestone(index, 'required_weeks', e.target.value)}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Payout Amount</label>
                        <input
                          type="number"
                          value={item.payout_amount}
                          onChange={(e) => updateMilestone(index, 'payout_amount', e.target.value)}
                          className={inputClass}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className={labelClass}>Minimum Trips / Week</label>
                        <input
                          type="number"
                          value={item.min_trips_per_week}
                          onChange={(e) => updateMilestone(index, 'min_trips_per_week', e.target.value)}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Admin Note</label>
                        <input
                          type="text"
                          value={item.notes}
                          onChange={(e) => updateMilestone(index, 'notes', e.target.value)}
                          className={inputClass}
                          placeholder="Credit after compliance review"
                        />
                      </div>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={addMilestone}
                  className="inline-flex items-center gap-2 rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-2.5 text-xs font-black  text-yellow-700 hover:bg-yellow-100 transition-colors"
                >
                  <Plus size={14} />
                  Add Milestone
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 overflow-hidden">
              <div className="px-6 py-5 bg-slate-50 border-b border-gray-200 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-yellow-50 text-yellow-600 flex items-center justify-center">
                  <Sparkles size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900 ">Extra Driver Reward Features</h3>
                  <p className="text-xs text-gray-500">Popular incentive mechanics inspired by Ola, Uber, and large fleet growth programs.</p>
                </div>
              </div>

              <div className="p-6 grid grid-cols-1 xl:grid-cols-2 gap-4">
                {settings.reward_features.map((feature) => (
                  <div key={feature.key} className="rounded-2xl border border-gray-200 p-5 bg-white space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">{feature.label}</h4>
                        <p className="mt-1 text-xs text-slate-500 leading-relaxed">{feature.description}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => updateRewardFeature(feature.key, 'enabled', !feature.enabled)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${feature.enabled ? 'bg-yellow-400' : 'bg-gray-200'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${feature.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className={labelClass}>Reward Amount</label>
                        <input
                          type="number"
                          value={feature.reward_amount}
                          onChange={(e) => updateRewardFeature(feature.key, 'reward_amount', e.target.value)}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Target Value</label>
                        <input
                          type="number"
                          value={feature.target_value}
                          onChange={(e) => updateRewardFeature(feature.key, 'target_value', e.target.value)}
                          className={inputClass}
                        />
                      </div>
                    </div>

                    <div>
                      <label className={labelClass}>Unit / Metric</label>
                      <input
                        type="text"
                        value={feature.unit}
                        onChange={(e) => updateRewardFeature(feature.key, 'unit', e.target.value)}
                        className={inputClass}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="p-6 bg-gray-50 border-t border-gray-100 flex flex-col gap-4">
            <button
              onClick={handleUpdate}
              disabled={saving}
              className="w-fit flex items-center gap-2 px-6 py-2.5 bg-yellow-400 text-black text-xs font-bold  rounded-lg hover:bg-yellow-500 transition-colors shadow-sm disabled:opacity-50"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Update Driver Incentive Settings
            </button>

            {showSuccess && (
              <div className="flex items-center gap-2 text-yellow-600 bg-yellow-50 px-4 py-3 rounded-lg border border-yellow-200 animate-in fade-in slide-in-from-bottom-2">
                <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center">
                  <ChevronRight size={12} className="rotate-45" />
                </div>
                <span className="text-xs font-bold ">Driver incentive settings updated successfully</span>
                <button onClick={() => setShowSuccess(false)} className="ml-auto text-yellow-600 hover:text-yellow-600">
                  <span className="text-lg">x</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DriverReferralSettings;
