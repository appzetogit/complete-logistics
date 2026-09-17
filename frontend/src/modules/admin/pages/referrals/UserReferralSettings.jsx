import React, { useState, useEffect } from 'react';
import {
  ChevronRight,
  Share2,
  Save,
  Loader2,
  Info,
  UserCheck,
  ArrowLeft
} from 'lucide-react';
import { adminService } from '../../services/adminService';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

const unwrap = (response) => response?.data?.data || response?.data || response || {};

const UserReferralSettings = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [settings, setSettings] = useState({
    enabled: false,
    type: 'instant_referrer',
    amount: 0,
    ride_count: 0,
  });

  const referralTypes = [
    { value: 'instant_referrer', label: 'Instant for Referrer User' },
    { value: 'instant_referrer_new', label: 'Instant for Referrer User and New User' },
    { value: 'conditional_referrer', label: 'Conditional for Referrer User' },
    { value: 'conditional_referrer_new', label: 'Conditional for Referrer User and New User' },
  ];

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await adminService.getReferralSettings('user');
        const payload = unwrap(res);
        if (payload) {
          setSettings({
            enabled: payload.enabled ?? false,
            type: payload.type || 'instant_referrer',
            amount: payload.amount || 0,
            ride_count: payload.ride_count || 0,
          });
        }
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
      const res = await adminService.updateReferralSettings('user', {
        ...settings,
        amount: Number(settings.amount || 0),
        ride_count: Number(settings.ride_count || 0),
      });
      if (unwrap(res)) {
        setShowSuccess(true);
        toast.success('Referral settings updated successfully');
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
    const updated = { ...settings, enabled: newVal };
    setSettings(updated);
    try {
      await adminService.updateReferralSettings('user', updated);
      setShowSuccess(true);
      toast.success('Referral settings toggled successfully');
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (err) {
      toast.error('Failed to toggle settings');
      setSettings(settings); // revert
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="animate-spin text-yellow-500" size={32} />
          <span className="text-sm text-gray-500 font-medium">Loading settings...</span>
        </div>
      </div>
    );
  }

  const labelClass = "block text-sm font-semibold text-gray-700 mb-1.5";
  const inputClass = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 outline-none transition-colors";

  const isConditional = settings.type?.includes('conditional');

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-4 lg:p-6 font-sans">

      <div className="max-w-4xl space-y-4">
        {/* FORM CARD */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {/* Main Toggle Section */}
          <div className="p-4 border-b border-gray-50 flex items-center justify-between bg-gray-50/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-yellow-50 flex items-center justify-center text-yellow-600">
                <UserCheck size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">User Referral Earnings Setup</h3>
                <p className="text-xs text-gray-500 mt-0.5 font-medium">Invite others to use our app with your unique referral code and earn exciting rewards!</p>
              </div>
            </div>
            <button 
              onClick={() => handleToggle(!settings.enabled)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none ${settings.enabled ? 'bg-yellow-400' : 'bg-gray-200'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>

          <div className="p-5 sm:p-6 space-y-6">
            {/* Referral Type Selection */}
            <div className="w-full lg:w-2/3">
              <label className={labelClass}>
                Referral Commission Type <Info size={14} className="inline ml-1 text-gray-400 cursor-help" />
              </label>
              <div className="relative">
                <select
                  value={settings.type}
                  onChange={(e) => setSettings({ ...settings, type: e.target.value })}
                  className={`${inputClass} appearance-none pr-10`}
                >
                  <option value="">Select Commission Type</option>
                  {referralTypes.map((type) => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                  <ChevronRight size={16} className="rotate-90" />
                </div>
              </div>
            </div>

            {/* Referral Info Card Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border border-dashed border-gray-200 p-5 flex items-center gap-4 transition-all hover:border-yellow-300">
                <div className="w-12 h-12 rounded-xl bg-yellow-50 flex items-center justify-center text-yellow-600 shadow-sm shrink-0">
                  <Share2 size={24} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-gray-900">Share Code To Refer User</h4>
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">Offer a reward to users for each referral when they share their code.</p>
                </div>
              </div>

              <div className="flex flex-col gap-4">
                {isConditional && (
                  <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 space-y-2">
                    <label className={labelClass}>Required Ride Count</label>
                    <input
                      type="number"
                      value={settings.ride_count}
                      onChange={(e) => setSettings({ ...settings, ride_count: e.target.value })}
                      className={inputClass}
                      placeholder="e.g. 5"
                    />
                    <p className="text-xs text-gray-500 font-medium">Number of rides required before earning rewards.</p>
                  </div>
                )}

                <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 space-y-2">
                  <label className={labelClass}>Earnings per Referral (₹)</label>
                  <input
                    type="number"
                    value={settings.amount}
                    onChange={(e) => setSettings({ ...settings, amount: e.target.value })}
                    className={inputClass}
                    placeholder="e.g. 100"
                  />
                  <p className="text-xs text-gray-500 font-medium">Amount users earn for each successful referral.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Action Footer */}
          <div className="p-4 sm:p-5 bg-gray-50 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4">
            <button
              onClick={handleUpdate}
              disabled={saving}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 bg-yellow-400 text-black text-sm font-bold rounded-lg hover:bg-yellow-500 transition-colors shadow-sm disabled:opacity-50"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Update Referral Settings
            </button>

            {showSuccess && (
              <div className="w-full sm:w-auto flex items-center gap-2 text-black bg-yellow-50 px-4 py-2 rounded-lg border border-yellow-200 animate-in fade-in slide-in-from-bottom-2">
                <div className="w-5 h-5 rounded-full bg-yellow-200 flex items-center justify-center">
                  <ChevronRight size={12} className="rotate-45" />
                </div>
                <span className="text-xs font-bold">Referral settings updated!</span>
                <button onClick={() => setShowSuccess(false)} className="ml-auto text-yellow-600 hover:text-black">
                  <span className="text-lg">×</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserReferralSettings;
