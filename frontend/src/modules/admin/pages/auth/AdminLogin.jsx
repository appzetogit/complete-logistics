import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Mail, Lock, ArrowRight, Loader2, AlertCircle, KeyRound, CheckCircle2, ArrowLeft, Building2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { adminService } from '../../services/adminService';
import { useSettings } from '../../../../shared/context/SettingsContext';

const InputField = ({ icon: Icon, type, placeholder, value, onChange, id, ...props }) => (
  <div className="relative group">
    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-900 transition-colors">
      <Icon size={18} strokeWidth={2.5} />
    </div>
    <input
      id={id}
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-[14px] font-bold text-slate-900 placeholder:text-slate-300 outline-none focus:bg-white focus:border-slate-900 focus:ring-8 focus:ring-slate-900/5 transition-all"
      {...props}
    />
  </div>
);

const AdminLogin = () => {
  const { settings } = useSettings();
  const [view, setView] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const appLogo = settings.general?.logo || settings.customization?.logo;
  const appName = settings.general?.app_name || 'Appzeto ';

  const resetMessages = () => {
    setError('');
  };

  const handleLogin = async (e) => {
    if (e) e.preventDefault();
    setIsLoading(true);
    resetMessages();

    try {
      const response = await adminService.login({ email, password });
      localStorage.setItem('adminToken', response?.token || '');
      localStorage.setItem('adminInfo', JSON.stringify(response?.admin || {}));
      setTimeout(() => navigate('/admin/dashboard'), 300);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Authentication failed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col font-sans overflow-hidden">
      {/* Immersive Decorative Elements */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-10%] right-[-5%] w-[60%] h-[60%] bg-white rounded-full blur-[160px] opacity-60" />
        <div className="absolute bottom-[-10%] left-[-5%] w-[50%] h-[50%] bg-slate-100 rounded-full blur-[140px] opacity-40" />
      </div>

      <main className="flex-1 flex flex-col items-center justify-center p-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-[440px]"
        >
          {/* Brand Header */}
          <div className="flex flex-col items-center text-center mb-12">
            <motion.div
              whileHover={{ scale: 1.05 }}
              onClick={() => navigate('/')}
              className="cursor-pointer mb-8"
            >
              {appLogo ? (
                <div className="bg-white p-4 rounded-[2.5rem] shadow-2xl shadow-slate-200/50">
                  <img src={appLogo} alt={appName} className="h-12 w-auto object-contain" />
                </div>
              ) : (
                <div className="w-20 h-20 bg-slate-900 rounded-[2.5rem] flex items-center justify-center text-white shadow-2xl shadow-slate-900/20">
                  <ShieldCheck size={36} strokeWidth={2} />
                </div>
              )}
            </motion.div>

            <div className="space-y-2">
              <h1 className="text-3xl font-black text-slate-900 tracking-tight leading-tight">Terminal Access</h1>
              <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.4em]">{appName} Cloud Services</p>
            </div>
          </div>

          {/* Card Container */}
          <div className="bg-white border border-slate-200 rounded-[3rem] p-10 shadow-2xl shadow-slate-200/40 relative">
            <AnimatePresence mode="wait">
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="mb-8 p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center gap-3 text-rose-600"
                >
                  <AlertCircle size={18} className="shrink-0" />
                  <p className="text-[12px] font-bold leading-tight">{error}</p>
                </motion.div>
              )}
            </AnimatePresence>

            <form onSubmit={handleLogin} className="space-y-6">
              <div className="space-y-5">
                <InputField
                  id="admin-email"
                  icon={Mail}
                  type="email"
                  placeholder="Administrative ID"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoFocus
                  required
                />
                <div className="space-y-3">
                  <InputField
                    id="admin-password"
                    icon={Lock}
                    type="password"
                    placeholder="Security Token"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setView('forgot')}
                      className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-colors"
                    >
                      Forgotten Identity?
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="group w-full py-5 bg-slate-900 text-white rounded-[1.5rem] text-[15px] font-black shadow-2xl shadow-slate-900/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3"
              >
                {isLoading ? (
                  <Loader2 className="animate-spin" size={20} />
                ) : (
                  <>
                    Authenticate Access
                    <ArrowRight size={20} className="transition-transform group-hover:translate-x-1" strokeWidth={2.5} />
                  </>
                )}
              </button>
            </form>
          </div>

          <div className="mt-12 flex flex-col items-center gap-4">
            <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-full border border-slate-200/50">
              <ShieldCheck size={14} className="text-slate-400" />
              <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Encrypted Terminal v4.0</span>
            </div>
            <p className="text-center text-[11px] text-slate-300 font-bold max-w-[280px]">
              Authorized personnel only. All access attempts are monitored and logged to security infrastructure.
            </p>
          </div>
        </motion.div>
      </main>

      <footer className="p-8 text-center relative z-10 border-t border-slate-100 bg-white/50 backdrop-blur-sm">
        <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.4em]">&copy; 2026 {appName} Security Ops</p>
      </footer>
    </div>
  );
};

export default AdminLogin;
