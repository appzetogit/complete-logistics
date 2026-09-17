import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  User, 
  Truck, 
  Gift, 
  ShieldCheck, 
  Save, 
  Info,
  ChevronRight,
  Loader2,
  CheckCircle2
} from 'lucide-react';

const FormSection = ({ title, subTitle, icon: Icon, children }) => (
  <div className="bg-white rounded-[40px] border border-gray-100 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-700">
    <div className="px-10 py-8 border-b border-gray-50 flex items-center gap-6 bg-gray-50/30">
      <div className="w-14 h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-100">
        <Icon size={28} />
      </div>
      <div>
        <h3 className="text-[17px] font-black text-gray-950 uppercase tracking-tight leading-none mb-1">{title}</h3>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">{subTitle}</p>
      </div>
    </div>
    <div className="p-10 space-y-8">
      {children}
    </div>
  </div>
);

const InputWrapper = ({ label, description, children, required }) => (
  <div className="space-y-3">
    <label className="flex items-center gap-2">
      <span className="text-[12px] font-black text-gray-950 uppercase tracking-widest">{label}</span>
      {required && <span className="text-rose-500 font-black">*</span>}
    </label>
    {children}
    {description && (
      <div className="flex items-start gap-2 px-1">
        <Info size={14} className="text-indigo-400 mt-0.5 shrink-0" />
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tight leading-relaxed">{description}</p>
      </div>
    )}
  </div>
);

const ToggleSwitch = ({ enabled, onChange }) => (
  <button 
    onClick={(e) => { e.preventDefault(); onChange(!enabled); }}
    className={`relative inline-flex h-10 w-20 items-center rounded-full transition-all duration-500 focus:outline-none shadow-inner ${enabled ? 'bg-indigo-600' : 'bg-gray-200'}`}
  >
    <span className={`inline-block h-8 w-8 transform rounded-full bg-white transition-all shadow-md duration-500 border border-transparent ${enabled ? 'translate-x-11 bg-white' : 'translate-x-1'}`} />
  </button>
);

const ReferralSettings = () => {
  const [activeTab, setActiveTab] = useState('user');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  
  const [userSettings, setUserSettings] = useState({});
  const [driverSettings, setDriverSettings] = useState({});

  const token = localStorage.getItem('adminToken') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5YzdiZTZhYmJlOTJlYjYwMGYwMmQxNiIsImVtYWlsIjoiYWRtaW5AYWRtaW4uY29tIiwibW9iaWxlIjoiOTk5OTk5OTk5OSIsInJvbGUiOiJzdXBlci1hZG1pbiIsImlhdCI6MTc3NTA0OTExNywiZXhwIjoxODA2NTg1MTE3fQ.5KJmXJwaVefWhnc97EqtArkA1z7ZOhsJwA9fbyRVPdQ';

  useEffect(() => {
    const fetchAllSettings = async () => {
      try {
        const [uRes, dRes] = await Promise.all([
          fetch(globalThis.__LEGACY_BACKEND_ORIGIN__ + '/api/v1/admin/referral/settings/user', { headers: { 'Authorization': `Bearer ${token}` } }),
          fetch(globalThis.__LEGACY_BACKEND_ORIGIN__ + '/api/v1/admin/referral/settings/driver', { headers: { 'Authorization': `Bearer ${token}` } }),
        ]);

        const uData = await uRes.json();
        const dData = await dRes.json();

        if (uData.success) setUserSettings(uData.data || {});
        if (dData.success) setDriverSettings(dData.data || {});
      } catch (err) {
        console.error("Settings fetch error:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchAllSettings();
  }, []);

  const handleUpdate = async (type) => {
    setSaving(true);
    let url = '';
    let body = {};
    
    if (type === 'user') { url = 'user'; body = userSettings; }
    if (type === 'driver') { url = 'driver'; body = driverSettings; }

    try {
      const res = await fetch(`${globalThis.__LEGACY_BACKEND_ORIGIN__}/api/v1/admin/referral/settings/${url}`, {
        method: 'PATCH',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      }
    } catch (err) {
      alert("Update failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
     return (
        <div className="min-h-screen flex items-center justify-center p-12">
           <Loader2 className="animate-spin text-indigo-600" size={48} />
        </div>
     );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-12 p-2 animate-in fade-in duration-1000 font-sans text-gray-950">
      {/* HEADER */}
      <div className="flex items-end justify-between border-b border-gray-100 pb-8">
        <div>
          <h1 className="text-6xl font-black tracking-tighter text-gray-950 mb-3 uppercase leading-none">Rewards<span className="text-indigo-600">.</span></h1>
          <div className="flex items-center gap-3 text-[12px] font-black text-gray-400">
            <span className="bg-indigo-950 text-white px-3 py-1 rounded-full uppercase tracking-widest text-[10px]">Policy Config</span>
            <ChevronRight size={14} />
            <span className="uppercase tracking-widest text-[10px]">Viral Growth Parameters</span>
          </div>
        </div>
        <div className="flex bg-gray-100 p-1.5 rounded-[20px] transition-all">
          {[
            { id: 'user', icon: User, label: 'Riders' },
            { id: 'driver', icon: Truck, label: 'Drivers' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-3 px-6 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all ${activeTab === tab.id ? 'bg-white text-indigo-600 shadow-xl scale-105' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <tab.icon size={16} /> {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* SUCCESS BANNER */}
      {success && (
        <div className="bg-emerald-500 text-white p-6 rounded-[32px] flex items-center justify-between animate-in slide-in-from-top-4 duration-500 shadow-xl shadow-emerald-100">
           <div className="flex items-center gap-4">
              <CheckCircle2 size={24} />
              <p className="text-[12px] font-black uppercase tracking-widest">Configuration Comitted Successfully to Mainnet</p>
           </div>
        </div>
      )}

      {/* FORMS */}
      <div className="space-y-10">
        
        {/* USER REFERRAL SETTINGS */}
        {activeTab === 'user' && (
          <FormSection title="Rider Referral Policy" subTitle="Manage viral growth for standard users" icon={User}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <InputWrapper label="Enable Earning" description="Allow users to earn rewards for successful invites.">
                <ToggleSwitch 
                  enabled={userSettings.enable_user_referral_earnings} 
                  onChange={(val) => setUserSettings({...userSettings, enable_user_referral_earnings: val})} 
                />
              </InputWrapper>
              <InputWrapper label="Referral Amount (Flat ₹)" description="Base reward per successful activation." required>
                <div className="relative group">
                  <span className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-indigo-600 transition-colors font-black">₹</span>
                  <input 
                    type="number" 
                    value={userSettings.referral_commission_amount_for_user}
                    onChange={(e) => setUserSettings({...userSettings, referral_commission_amount_for_user: e.target.value})}
                    className="w-full pl-12 pr-6 py-5 bg-gray-50 border-none rounded-3xl text-[15px] font-black text-gray-950 focus:bg-white focus:ring-4 focus:ring-indigo-50 outline-none transition-all shadow-inner"
                  />
                </div>
              </InputWrapper>
              <InputWrapper label="Referral Type" description="Instant reward vs milestone based.">
                <select 
                  value={userSettings.referral_type}
                  onChange={(e) => setUserSettings({...userSettings, referral_type: e.target.value})}
                  className="w-full px-6 py-5 bg-gray-50 border-none rounded-3xl text-[13px] font-black text-gray-950 focus:bg-white focus:ring-4 focus:ring-indigo-50 outline-none transition-all shadow-inner appearance-none uppercase"
                >
                  <option value="instant">Instant Activation</option>
                  <option value="milestone">Milestone Based</option>
                </select>
              </InputWrapper>
              <div className="p-8 bg-indigo-50/50 rounded-[32px] border border-indigo-50 space-y-4">
                 <div className="flex items-center gap-3">
                    <ShieldCheck className="text-indigo-600" size={20} />
                    <span className="text-[12px] font-black uppercase text-indigo-950 tracking-widest">Global Constraints</span>
                 </div>
                 <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-tight leading-relaxed">
                   User referral policies are subject to regional fraud detection algorithms. Max referral limit per user is currently set to 50 active nodes.
                 </p>
              </div>
            </div>
            <button 
              onClick={() => handleUpdate('user')}
              disabled={saving}
              className="w-full py-6 bg-indigo-950 text-white rounded-[32px] text-[13px] font-black uppercase tracking-[0.3em] hover:bg-gray-900 transition-all shadow-2xl flex items-center justify-center gap-3 active:scale-[0.98]"
            >
              {saving ? <Loader2 className="animate-spin" /> : <Save size={20} />}
              Commit Policy Changes
            </button>
          </FormSection>
        )}

        {/* DRIVER REFERRAL SETTINGS */}
        {activeTab === 'driver' && (
          <FormSection title="Driver Fleet Referral" subTitle="Manage recruitment incentives for fleet" icon={Truck}>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                <InputWrapper label="Enable Driver Earning" description="Toggle reward systems for driver recruits.">
                  <ToggleSwitch 
                    enabled={driverSettings.enable_user_referral_earnings} 
                    onChange={(val) => setDriverSettings({...driverSettings, enable_user_referral_earnings: val})} 
                  />
                </InputWrapper>
                <InputWrapper label="Commission Rate (₹)">
                   <input 
                    type="number" 
                    value={driverSettings.referral_commission_amount_for_user}
                    onChange={(e) => setDriverSettings({...driverSettings, referral_commission_amount_for_user: e.target.value})}
                    className="w-full px-6 py-5 bg-gray-50 border-none rounded-3xl text-[15px] font-black text-gray-950 focus:bg-white focus:ring-4 focus:ring-indigo-50 outline-none transition-all shadow-inner"
                  />
                </InputWrapper>
             </div>
             <button 
              onClick={() => handleUpdate('driver')}
              disabled={saving}
              className="w-full py-6 bg-gray-950 text-white rounded-[32px] text-[13px] font-black uppercase tracking-[0.3em] transition-all shadow-2xl flex items-center justify-center gap-3"
            >
              {saving ? <Loader2 className="animate-spin" /> : <Save size={20} />}
              Update Fleet Incentives
            </button>
          </FormSection>
        )}

      </div>
    </div>
  );
};

export default ReferralSettings;

