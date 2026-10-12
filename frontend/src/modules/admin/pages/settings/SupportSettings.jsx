import React, { useEffect, useState } from 'react';
import { ChevronRight, Loader2, Mail, MessageCircle, Phone, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../../shared/api/axiosInstance';

const inputClass = 'w-full rounded-xl border border-[#E5E7EB] bg-gray-50 px-4 py-3 text-sm font-semibold text-[#151515] outline-none transition focus:border-[#F4B400] focus:bg-white focus:ring-1 focus:ring-[#F4B400]';

const FIELDS = [
  { key: 'support_phone', label: 'Support phone', icon: Phone, placeholder: '+91 98765 43210', hint: 'Shown as "Call support" in the user and driver apps.' },
  { key: 'support_email', label: 'Support email', icon: Mail, placeholder: 'support@yourdomain.com', hint: 'Shown as "Email support".' },
  { key: 'support_whatsapp', label: 'Support WhatsApp (optional)', icon: MessageCircle, placeholder: '+91 98765 43210', hint: 'Leave empty to hide the WhatsApp option.' },
];

const SupportSettings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({ support_phone: '', support_email: '', support_whatsapp: '' });

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get('/admin/general-settings/support');
        const loaded = res?.data?.settings || res?.settings || {};
        setSettings({
          support_phone: loaded.support_phone || '',
          support_email: loaded.support_email || '',
          support_whatsapp: loaded.support_whatsapp || '',
        });
      } catch (error) {
        toast.error('Failed to load support contact');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      await api.patch('/admin/general-settings/support', { settings });
      toast.success('Support contact saved');
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || 'Failed to save support contact');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F6F8]">
        <Loader2 className="w-10 h-10 text-[#F4B400] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F6F8] p-4 sm:p-6 lg:p-8 font-sans pb-32">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 mb-2">
            <span>App Settings</span>
            <ChevronRight size={14} />
            <span className="text-[#151515]">Support Contact</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-1.5 h-8 bg-[#F4B400] rounded-full" />
            <div>
              <h1 className="text-2xl font-bold text-[#151515]">Support Contact</h1>
              <p className="text-sm text-gray-500 mt-1">The phone, email and WhatsApp the user and driver apps show in their Help Center.</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-[20px] shadow-sm border border-[#E5E7EB] border-l-4 border-l-[#F4B400] p-6 space-y-6">
          {FIELDS.map(({ key, label, icon: Icon, placeholder, hint }) => (
            <div key={key} className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-bold text-[#151515]" htmlFor={key}>
                <Icon size={16} className="text-gray-500" />
                {label}
              </label>
              <input
                id={key}
                name={key}
                className={inputClass}
                type={key === 'support_email' ? 'email' : 'tel'}
                placeholder={placeholder}
                value={settings[key]}
                onChange={(event) => setSettings((previous) => ({ ...previous, [key]: event.target.value }))}
              />
              <p className="text-xs text-gray-400">{hint}</p>
            </div>
          ))}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-[#F4B400] px-6 py-3 text-sm font-bold text-[#151515] transition hover:bg-[#e0a600] disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save size={16} />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default SupportSettings;
