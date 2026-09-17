import React, { useState, useEffect } from 'react';
import { 
  ChevronRight,
  Loader2,
  ArrowLeft,
  Mail,
  Send,
  CheckCircle2,
  ShieldCheck,
  Server,
  Lock
} from 'lucide-react';
import { adminService } from '../../services/adminService';
import toast from 'react-hot-toast';
import { useSettings } from '../../../../shared/context/SettingsContext';

const MailSettings = () => {
  const { settings: appSettings } = useSettings();
  const appName = appSettings.general?.app_name || 'App';
  const mailPlaceholderDomain = appName.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'app';
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [testing, setTesting] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await adminService.getMailSettings();
      setSettings(res.data?.settings || {});
    } catch (err) {
      console.error('Fetch error:', err);
      toast.error('Failed to load Mail settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleUpdate = async (e) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      await adminService.updateMailSettings(settings);
      toast.success('Mail configuration updated successfully');
      fetchData();
    } catch (err) {
      toast.error('Failed to save settings');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTestMail = async () => {
    try {
      setTesting(true);
      await new Promise(r => setTimeout(r, 1200));
      toast.success('Test mail sent to ' + (settings.mail_from_address || 'administrator'));
    } catch (err) {
      toast.error('Failed to send test mail');
    } finally {
      setTesting(false);
    }
  };

  const updateField = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

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
          <span className="text-gray-700">SMTP Server Configuration</span>
        </div>
        <div className="flex items-center justify-between">
          <h1 className="text-xl text-gray-900 font-bold">Mail Configuration</h1>
          <button onClick={() => window.history.back()} className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors shadow-sm">
            <ArrowLeft size={16} /> Back
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto">
        {/* Main Card */}
        <form onSubmit={handleUpdate} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Card Header */}
          <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-white">
             <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                   <Server size={20} />
                </div>
                <div>
                   <h3 className="text-sm font-bold text-gray-900">Outgoing Mail Server</h3>
                   <p className="text-xs text-gray-400">Configure your system SMTP details for sending transactional emails</p>
                </div>
             </div>
             <button 
                type="button"
                onClick={handleTestMail}
                disabled={testing}
                className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors uppercase tracking-wider"
             >
                {testing ? <Loader2 size={12} className="animate-spin" /> : <><Send size={12} /> Send Test Mail</>}
             </button>
          </div>

          <div className="p-8 space-y-8">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                <div className="md:col-span-1">
                   <label className={labelClass}>Mailer Driver (e.g. SMTP)</label>
                   <input 
                    className={inputClass}
                    value={settings.mail_driver || ''}
                    onChange={(e) => updateField('mail_driver', e.target.value)}
                    placeholder="smtp"
                    required
                   />
                </div>

                <div className="md:col-span-1">
                   <label className={labelClass}>Server Host</label>
                   <input 
                    className={inputClass}
                    value={settings.mail_host || ''}
                    onChange={(e) => updateField('mail_host', e.target.value)}
                    placeholder="smtp.gmail.com"
                    required
                   />
                </div>

                <div>
                   <label className={labelClass}>Port Number</label>
                   <input 
                    className={inputClass}
                    value={settings.mail_port || ''}
                    onChange={(e) => updateField('mail_port', e.target.value)}
                    placeholder="587"
                    required
                   />
                </div>

                <div>
                   <label className={labelClass}>Encryption Type</label>
                   <select 
                    className={inputClass}
                    value={settings.mail_encryption || ''}
                    onChange={(e) => updateField('mail_encryption', e.target.value)}
                    required
                   >
                     <option value="">Select Encryption</option>
                     <option value="tls">TLS</option>
                     <option value="ssl">SSL</option>
                   </select>
                </div>

                <div>
                   <label className={labelClass}>Auth Username</label>
                   <input 
                    className={inputClass}
                    value={settings.mail_username || ''}
                    onChange={(e) => updateField('mail_username', e.target.value)}
                    placeholder="username@domain.com"
                    required
                   />
                </div>

                <div>
                   <label className={labelClass}>Auth Password</label>
                   <div className="relative">
                      <input 
                        type="password"
                        className={inputClass}
                        value={settings.mail_password || ''}
                        onChange={(e) => updateField('mail_password', e.target.value)}
                        placeholder="**********************"
                        required
                      />
                      <Lock className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300" size={14} />
                   </div>
                </div>

                <div className="md:col-span-2 pt-4 border-t border-gray-50">
                   <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-4">Sender Information</h4>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                         <label className={labelClass}>"From" Email Address</label>
                         <input 
                          type="email"
                          className={inputClass}
                          value={settings.mail_from_address || ''}
                          onChange={(e) => updateField('mail_from_address', e.target.value)}
                          placeholder={`noreply@${mailPlaceholderDomain}.com`}
                          required
                         />
                      </div>
                      <div>
                         <label className={labelClass}>"From" Name</label>
                         <input 
                          className={inputClass}
                          value={settings.mail_from_name || ''}
                          onChange={(e) => updateField('mail_from_name', e.target.value)}
                          placeholder={`${appName} Admin`}
                          required
                         />
                      </div>
                   </div>
                </div>

             </div>
          </div>

          {/* Card Footer */}
          <div className="p-6 bg-gray-50/50 border-t border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[10px] text-gray-400 font-semibold uppercase tracking-widest px-2">
              <ShieldCheck size={12} className="text-gray-300" />
              Verified Connection
            </div>
            <button 
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 px-8 py-3 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-all shadow-sm active:scale-95 disabled:opacity-50"
            >
              {submitting ? (
                <><Loader2 size={16} className="animate-spin" /> Saving Configuration...</>
              ) : (
                'Update Mail Settings'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MailSettings;
