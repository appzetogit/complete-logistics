import React, { useState, useEffect } from 'react';
import { 
  ChevronRight, 
  Loader2, 
  MessageSquare, 
  ShieldCheck, 
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Smartphone
} from 'lucide-react';
import { adminService } from '../../services/adminService';
import toast from 'react-hot-toast';

const SMSGateways = () => {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState({});
  const [submitting, setSubmitting] = useState({});

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await adminService.getSMSSettings();
      setSettings(res.data?.settings || {});
    } catch (err) {
      console.error('Fetch error:', err);
      toast.error('Failed to load SMS settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSave = async (slug, providerSlug) => {
    try {
      setSubmitting(prev => ({ ...prev, [slug]: true }));
      await adminService.updateSMSSettings({ [providerSlug]: settings[providerSlug] });
      toast.success(`${slug} configuration updated`);
    } catch (err) {
      toast.error('Failed to save configuration');
    } finally {
      setSubmitting(prev => ({ ...prev, [slug]: false }));
    }
  };

  const getSettingValue = (key) => {
    const parts = key.split('.');
    if (parts.length === 2) {
      return settings[parts[0]]?.[parts[1]] || '';
    }
    return settings[key] || '';
  };

  const updateLocalValue = (key, value) => {
    const [parent, child] = key.split('.');
    setSettings(prev => {
       const next = { ...prev };
       if (!next[parent]) next[parent] = {};
       next[parent][child] = value;
       return next;
    });
  };

  const handleToggle = async (slug, key) => {
    try {
      const currentValue = getSettingValue(key);
      const newValue = currentValue === "1" ? "0" : "1";
      const [parent, child] = key.split('.');
      await adminService.updateSMSSettings({ [parent]: { [child]: newValue } });
      
      setSettings(prev => {
        const next = { ...prev };
        if (!next[parent]) next[parent] = {};
        next[parent][child] = newValue;
        return next;
      });
      toast.success(`${slug} ${newValue === "1" ? 'enabled' : 'disabled'}`);
    } catch (err) {
      toast.error('Failed to toggle status');
    }
  };

  const smsProviders = [
    { name: 'Twilio', slug: 'twilio', logo: 'https://upload.wikimedia.org/wikipedia/commons/7/7e/Twilio-logo.svg', enableKey: 'twilio.enabled', fields: [
      { label: 'Sid', key: 'twilio.sid' },
      { label: 'Token', key: 'twilio.token' },
      { label: 'Twilio Mobile Number', key: 'twilio.from_number' }
    ]},
    { name: 'SMS ALA', slug: 'smsala', logo: 'https://smsala.com/wp-content/uploads/2021/04/smsala-logo-1.png', enableKey: 'smsala.enabled', fields: [
      { label: 'Api Key', key: 'smsala.api_key' },
      { label: 'Api Secret Key', key: 'smsala.secret_key' },
      { label: 'Token', key: 'smsala.token' },
      { label: 'SMS ALA Mobile Number', key: 'smsala.from_number' }
    ]},
    { name: 'SMS India Hub', slug: 'india_hub', logo: 'https://www.smsindiahub.in/wp-content/uploads/2019/11/sms-india-hub-logo-1.png', enableKey: 'india_hub.enabled', fields: [
      { label: 'SMS India Hub Api Key', key: 'india_hub.api_key' },
      { label: 'SMS India Hub SID', key: 'india_hub.sid' }
    ]}
  ];

  const inputClass = "w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-800 bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-colors";
  const labelClass = "block text-xs font-semibold text-gray-500 mb-1.5";

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <Loader2 className="animate-spin text-indigo-600" size={32} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6 lg:p-8 font-sans">
      
      {/* Header Block */}
      <div className="mb-8">
        <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-2">
          <span>Settings</span>
          <ChevronRight size={12} />
          <span>Third-party</span>
          <ChevronRight size={12} />
          <span className="text-gray-700">SMS Gateways</span>
        </div>
        <div className="flex items-center justify-between">
          <h1 className="text-xl text-gray-900 font-bold">SMS Gateways</h1>
          <button onClick={() => window.history.back()} className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors shadow-sm">
            <ArrowLeft size={16} /> Back
          </button>
        </div>
      </div>

      <div className="space-y-8">
        
        {/* Top Feature Toggle Card */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 flex items-center justify-between shadow-sm">
           <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                 <Smartphone size={20} />
              </div>
              <div>
                 <h3 className="text-sm font-bold text-gray-900">Push Notifications & OTP</h3>
                 <p className="text-xs text-gray-400">Enable Firebase OTP for user authentication</p>
              </div>
           </div>
           <label className="relative inline-flex items-center cursor-pointer">
              <input 
                 type="checkbox" 
                 checked={getSettingValue('firebase.enabled') === "1"} 
                 onChange={() => handleToggle('Firebase OTP', 'firebase.enabled')}
                 className="sr-only peer" 
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
           </label>
        </div>

        {/* SMS Provider Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
           {smsProviders.map((provider) => {
              const isEnabled = getSettingValue(provider.enableKey) === "1";
              
              return (
                 <div key={provider.slug} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-full transform transition-all duration-200 hover:shadow-md">
                    {/* Card Header */}
                    <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-white">
                       <div className="flex items-center gap-4">
                          <div className="w-14 h-14 rounded-xl flex items-center justify-center border border-gray-100 bg-white p-2">
                             <img src={provider.logo} alt={provider.name} className="w-full h-full object-contain" />
                          </div>
                          <div>
                             <h3 className="text-sm font-bold text-gray-900 tracking-tight">{provider.name} Integration</h3>
                             <p className="text-[11px] font-medium text-gray-400 flex items-center gap-1 mt-0.5">
                                {isEnabled ? (
                                   <span className="flex items-center gap-1 text-green-600 bg-green-50 px-2 py-0.5 rounded-md">
                                      <CheckCircle2 size={10} /> Enabled
                                   </span>
                                ) : (
                                   <span className="flex items-center gap-1 text-gray-400 bg-gray-50 px-2 py-0.5 rounded-md">
                                      <AlertCircle size={10} /> Disabled
                                   </span>
                                )}
                             </p>
                          </div>
                       </div>
                       <label className="relative inline-flex items-center cursor-pointer">
                          <input 
                             type="checkbox" 
                             checked={isEnabled} 
                             onChange={() => handleToggle(provider.name, provider.enableKey)}
                             className="sr-only peer" 
                          />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                       </label>
                    </div>

                    {/* Card Body */}
                    <div className="p-6 flex-1 space-y-5">
                       {provider.fields.map((field) => (
                          <div key={field.key}>
                             <label className={labelClass}>{field.label}</label>
                             <input 
                                type="text"
                                value={getSettingValue(field.key)}
                                onChange={(e) => updateLocalValue(field.key, e.target.value)}
                                placeholder={`Your ${provider.name} ${field.label}`}
                                className={inputClass}
                             />
                          </div>
                       ))}
                    </div>

                    {/* Card Footer */}
                    <div className="p-4 bg-gray-50/50 border-t border-gray-100 flex items-center justify-between">
                       <div className="flex items-center gap-2 text-[10px] text-gray-400 font-semibold uppercase tracking-widest px-2">
                          <MessageSquare size={12} className="text-gray-300" />
                          SMS Verified
                       </div>
                       <button 
                          onClick={() => handleSave(provider.name, provider.slug)}
                          disabled={submitting[provider.name]}
                          className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-all shadow-sm active:scale-95 disabled:opacity-50"
                       >
                          {submitting[provider.name] ? (
                             <><Loader2 size={16} className="animate-spin" /> Updating...</>
                          ) : (
                             'Update Integration'
                          )}
                       </button>
                    </div>
                 </div>
              );
           })}
        </div>
      </div>
    </div>
  );
};

export default SMSGateways;
