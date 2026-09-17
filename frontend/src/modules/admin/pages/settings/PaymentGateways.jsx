import React, { useState, useEffect } from 'react';
import { 
  ChevronRight, 
  Loader2, 
  ShieldCheck, 
  CreditCard,
  ArrowLeft,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { adminService } from '../../services/adminService';
import toast from 'react-hot-toast';

const PaymentGateways = () => {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState({});
  const [submitting, setSubmitting] = useState({});
  const [activeGateway, setActiveGateway] = useState(null);

  const unwrapPayload = (response) => response?.data?.data || response?.data || {};

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await adminService.getPaymentSettings();
      const payload = unwrapPayload(res);
      setSettings(payload.settings || {});
      setActiveGateway(payload.active_gateway || null);
    } catch (err) {
      console.error('Fetch error:', err);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSave = async (slug, data) => {
    try {
      setSubmitting(prev => ({ ...prev, [slug]: true }));
      const response = await adminService.updatePaymentSettings(data);
      const payload = unwrapPayload(response);
      setSettings(payload.settings || {});
      setActiveGateway(payload.active_gateway || null);
      toast.success(`Configuration for ${slug} updated`);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to save configuration');
    } finally {
      setSubmitting(prev => ({ ...prev, [slug]: false }));
    }
  };

  const handleToggle = async (gateway, currentValue) => {
    try {
      setSubmitting(prev => ({ ...prev, [gateway.slug]: true }));
      const newValue = currentValue === "1" ? "0" : "1";
      const response = await adminService.updatePaymentSettings({
        [gateway.slug]: {
          ...(settings[gateway.slug] || {}),
          enabled: newValue,
        },
      });

      const payload = unwrapPayload(response);
      setSettings(payload.settings || {});
      setActiveGateway(payload.active_gateway || null);
      toast.success(`${gateway.name} ${newValue === "1" ? 'enabled' : 'disabled'}`);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to toggle status');
    } finally {
      setSubmitting(prev => ({ ...prev, [gateway.slug]: false }));
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

  const gatewayGroups = [
    { 
      name: 'RAZOR PAY', 
      slug: 'razor_pay', 
      logo: 'https://cdn.razorpay.com/logo.svg', 
      enableKey: 'razor_pay.enabled', 
      color: 'indigo',
      fields: [
        { label: 'Environment', key: 'razor_pay.environment', type: 'select', options: ['test', 'live'] },
        { label: 'Test Api Key', key: 'razor_pay.test_api_key' },
        { label: 'Test Secret Key', key: 'razor_pay.test_secret_key' },
        { label: 'Live Api Key', key: 'razor_pay.live_api_key' },
        { label: 'Live Secret Key', key: 'razor_pay.live_secret_key' }
      ]
    },
    { 
      name: 'PHONEPE', 
      slug: 'phone_pay', 
      logo: 'https://www.phonepe.com/webstatic/8101/static/m/83f6ed9f4a0a996dc7a69b7.svg', 
      enableKey: 'phone_pay.enabled', 
      color: 'purple',
      fields: [
        { label: 'Environment', key: 'phone_pay.environment', type: 'select', options: ['test', 'production'] },
        { label: 'Client ID / Merchant ID', key: 'phone_pay.merchant_id' },
        { label: 'Client Secret / Salt Key', key: 'phone_pay.salt_key' },
        { label: 'Client Version / Salt Index', key: 'phone_pay.salt_index' }
      ]
    },
    { 
      name: 'STRIPE', 
      slug: 'stripe', 
      logo: 'https://upload.wikimedia.org/wikipedia/commons/b/ba/Stripe_Logo%2C_revised_2016.svg', 
      enableKey: 'stripe.enabled', 
      color: 'sky',
      fields: [
        { label: 'Environment', key: 'stripe.environment', type: 'select', options: ['test', 'live'] },
        { label: 'Test Secret Key', key: 'stripe.test_secret_key' },
        { label: 'Test Publishable Key', key: 'stripe.test_publishable_key' },
        { label: 'Production Secret Key', key: 'stripe.live_secret_key' },
        { label: 'Production Publishable Key', key: 'stripe.live_publishable_key' }
      ]
    }
  ];

  const inputClass = "w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-800 bg-white focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 outline-none transition-colors";
  const labelClass = "block text-xs font-semibold text-gray-500 mb-1.5";

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <Loader2 className="animate-spin text-yellow-600" size={32} />
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
          <span className="text-gray-700">Payment Gateways</span>
        </div>
        <div className="flex items-center justify-between">
          <h1 className="text-xl text-gray-900 font-bold">Payment Gateways</h1>
          <button onClick={() => window.history.back()} className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors shadow-sm">
            <ArrowLeft size={16} /> Back
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {gatewayGroups.map((gw) => {
          const isEnabled = getSettingValue(gw.enableKey) === "1";
          const isSubmitting = Boolean(submitting[gw.slug]);
          
          return (
            <div key={gw.slug} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-full transform transition-all duration-200 hover:shadow-md">
              {/* Card Header */}
              <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-white">
                <div className="flex items-center gap-4">
                  <div className={`w-14 h-14 rounded-xl flex items-center justify-center border border-gray-100 bg-white p-2`}>
                    <img src={gw.logo} alt={gw.name} className="w-full h-full object-contain" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 tracking-tight">{gw.name}</h3>
                    <p className="text-[11px] font-medium text-gray-400 flex items-center gap-1 mt-0.5">
                      {isEnabled ? (
                        <span className="flex items-center gap-1 text-green-600 bg-green-50 px-2 py-0.5 rounded-md">
                          <CheckCircle2 size={10} /> Active
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
                    onChange={() => handleToggle(gw, getSettingValue(gw.enableKey))}
                    disabled={isSubmitting}
                    className="sr-only peer" 
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-yellow-400"></div>
                </label>
              </div>

              {/* Card Body */}
              <div className="p-6 flex-1">
                <div className="mb-5 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-semibold text-slate-500">Runtime status</p>
                  <p className="mt-1 text-sm font-bold text-slate-900">
                    {isEnabled
                      ? `${gw.name} is the live gateway for the app right now.`
                      : activeGateway?.slug === gw.slug
                        ? `${gw.name} was last marked active.`
                        : 'This gateway is currently inactive.'}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    Only one payment gateway can stay enabled at a time, and enabling requires valid credentials for that gateway.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {gw.fields.map((field) => (
                    <div key={field.key} className={field.key.includes('environment') ? 'md:col-span-2' : ''}>
                      <label className={labelClass}>
                        {field.label}
                      </label>
                      {field.type === 'select' ? (
                        <select 
                          value={getSettingValue(field.key)} 
                          onChange={(e) => updateLocalValue(field.key, e.target.value)}
                          className={inputClass}
                        >
                          {field.options.map(opt => <option key={opt} value={opt}>{opt.charAt(0).toUpperCase() + opt.slice(1)}</option>)}
                        </select>
                      ) : (
                        <div className="relative group">
                          <input 
                            type="text"
                            value={getSettingValue(field.key)}
                            onChange={(e) => updateLocalValue(field.key, e.target.value)}
                            placeholder={`Enter ${field.label.toLowerCase()}`}
                            className={inputClass}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Card Footer */}
              <div className="p-4 bg-gray-50/50 border-t border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-gray-400 font-semibold px-2">
                  <ShieldCheck size={12} className="text-gray-300" />
                  SSL Secured
                </div>
                <button 
                  onClick={() => handleSave(gw.name, { [gw.slug]: settings[gw.slug] })}
                  disabled={isSubmitting}
                  className="flex items-center gap-2 px-6 py-2.5 bg-yellow-400 text-black rounded-lg text-sm font-semibold hover:bg-yellow-500 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                >
                  {isSubmitting ? (
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
  );
};

export default PaymentGateways;
