import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ShieldCheck, FileText, CheckCircle, Scale, Star, PenTool, CheckSquare, Clock
} from 'lucide-react';

const policies = [
  { id: 'terms', title: 'Terms of Use', ver: 'v2.6.4', status: 'Compliant', desc: 'Governs overall rider and driver user accounts, terms of booking, payment gateway obligations, and platform usage limits.' },
  { id: 'privacy', title: 'Privacy Policy', ver: 'v3.1.2', status: 'Compliant', desc: 'Outlines data privacy standards, GPS telemetry tracking scope, background checks, and personal data storage protocols.' },
  { id: 'refund', title: 'Refund Rules', ver: 'v1.8.0', status: 'Compliant', desc: 'Cancellation fee triggers, passenger refund structures, automated double-charge resolutions, and bank payout timelines.' }
];

const mockLogs = [
  { id: 1, action: 'RTO License Scan', hub: 'Indore HUB', status: 'Passed', time: 'Just now' },
  { id: 2, action: 'Background Verification Check', hub: 'Bhopal HUB', status: 'Passed', time: '5m ago' },
  { id: 3, action: 'Safety Telemetry Audit', hub: 'Mumbai HUB', status: 'Passed', time: '9m ago' }
];

const logTemplates = [
  { action: 'Payment SLA Review', hub: 'Delhi HUB', status: 'Passed' },
  { action: 'Driver Onboarding Check', hub: 'Indore HUB', status: 'Passed' },
  { action: 'App Security Patch V2', hub: 'Noida HUB', status: 'Passed' }
];

export const LegalDashboardHelper = () => {
  const [selectedPol, setSelectedPol] = useState('terms');
  const [signer, setSigner] = useState('');
  const [signed, setSigned] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [logs, setLogs] = useState(mockLogs);
  const [stats, setStats] = useState({
    complianceScore: 100,
    activeLicenses: 24,
    auditedDrivers: 1540
  });

  const activePolicy = policies.find(p => p.id === selectedPol);

  const handleSign = (e) => {
    e.preventDefault();
    if (!signer) return;
    setSubmitting(true);
    setTimeout(() => {
      setSubmitting(false);
      setSigned(true);
      setStats(prev => ({ ...prev, auditedDrivers: prev.auditedDrivers + 1 }));
    }, 1500);
  };

  useEffect(() => {
    const logInterval = setInterval(() => {
      const randomLog = logTemplates[Math.floor(Math.random() * logTemplates.length)];
      const newLog = {
        id: Date.now(),
        ...randomLog,
        time: 'Just now'
      };
      setLogs(prev => {
        const updated = [newLog, ...prev.slice(0, 2)];
        return updated.map((item, idx) => {
          if (idx === 0) return item;
          return {
            ...item,
            time: item.time === 'Just now' ? '1m ago' : `${idx + 1}m ago`
          };
        });
      });
    }, 7000);

    return () => clearInterval(logInterval);
  }, []);

  return (
    <div className="w-full h-full bg-slate-950 text-slate-100 flex flex-col font-sans p-4 md:p-6 overflow-hidden select-none">
      
      {/* Top HUD Header */}
      <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-amber-400/10 text-amber-400 rounded-xl">
            <Scale size={18} />
          </div>
          <div>
            <h3 className="font-extrabold text-[15px] tracking-wide text-white uppercase font-sans">Legal & Compliance Hub</h3>
            <p className="text-[10px] text-slate-400 font-medium">Verify policy versions, RTO licenses, and driver compliance logs</p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1 text-xs">
          <ShieldCheck className="text-emerald-400" size={14} />
          <span className="text-[11px] font-bold text-slate-300">ISO 27001 Certified</span>
        </div>
      </div>

      {/* Main Grid: Policy & Sign (Left 60%) + Metrics & Logs (Right 40%) */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-5 gap-4 overflow-hidden">
        
        {/* Left Column: Interactive Policy Selector & Signature box */}
        <div className="lg:col-span-3 bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 flex flex-col justify-between overflow-hidden">
          
          <div>
            <div className="flex items-center justify-between mb-3 border-b border-slate-800/50 pb-2">
              <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 flex items-center gap-1.5 font-sans">
                <FileText size={12} className="text-[#FFB300]" /> Active Policies
              </span>
              <span className="text-[9px] font-extrabold text-slate-500">Select policy tag</span>
            </div>

            {/* Policy Selector Tabs */}
            <div className="flex gap-2 mb-4">
              {policies.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setSelectedPol(p.id); setSigned(false); }}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-extrabold uppercase tracking-wider transition ${
                    selectedPol === p.id 
                      ? 'bg-amber-400 text-slate-950 font-black shadow-md shadow-amber-400/10' 
                      : 'bg-slate-950/40 border border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {p.title}
                </button>
              ))}
            </div>

            {/* Selected Policy Info */}
            <div className="relative min-h-[90px] mb-4">
              <AnimatePresence mode="wait">
                <motion.div
                  key={selectedPol}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  transition={{ duration: 0.2 }}
                  className="bg-slate-950/50 border border-slate-800 rounded-xl p-3.5"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[8px] font-black uppercase tracking-wider bg-slate-900 text-slate-400 px-2 py-0.5 rounded border border-slate-800">
                      Version: {activePolicy.ver}
                    </span>
                    <span className="text-[8px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20 flex items-center gap-1">
                      <CheckCircle size={8} /> {activePolicy.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed line-clamp-3">
                    {activePolicy.desc}
                  </p>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {/* Simulated Signature form */}
          <div className="bg-slate-950/80 border border-slate-850 p-4 rounded-xl">
            <AnimatePresence mode="wait">
              {!signed ? (
                <motion.form
                  key="form"
                  onSubmit={handleSign}
                  className="flex items-center gap-3"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <div className="flex-1">
                    <input
                      type="text"
                      required
                      placeholder="Type full name to verify terms..."
                      value={signer}
                      onChange={(e) => setSigner(e.target.value)}
                      className="w-full bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-2 text-[11px] text-white focus:outline-none focus:border-amber-400 placeholder-slate-600 transition"
                    />
                  </div>
                  <button 
                    type="submit"
                    disabled={submitting}
                    className="bg-[#FFB300] hover:bg-[#e09e00] text-slate-950 font-black text-[11px] uppercase tracking-wider py-2.5 px-4 rounded-xl transition shrink-0 active:scale-97 flex items-center gap-1.5"
                  >
                    {submitting ? 'Verifying...' : 'Sign Agreement'} <PenTool size={12} />
                  </button>
                </motion.form>
              ) : (
                <motion.div
                  key="success"
                  className="flex items-center justify-between"
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 450, damping: 20 }}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded-full shrink-0">
                      <CheckSquare size={16} />
                    </div>
                    <div>
                      <h5 className="font-extrabold text-xs text-white">Terms Agreed</h5>
                      <p className="text-[9px] text-slate-400 font-medium">Compliance log signed by {signer}. Receipt saved.</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => { setSigned(false); setSigner(''); }}
                    className="text-[9px] font-black text-amber-400 uppercase tracking-widest hover:underline cursor-pointer"
                  >
                    Reset
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </div>

        {/* Right Column: Compliance Stats & Live audits */}
        <div className="lg:col-span-2 flex flex-col gap-4 overflow-hidden">
          
          {/* Compliance Stats HUD */}
          <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 flex flex-col justify-between">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 flex items-center gap-1.5 mb-3 font-sans">
              <Star size={12} className="text-[#FFB300]" /> Compliance Health
            </span>
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5">
                <p className="text-[9px] text-slate-400 font-bold">Audit Score</p>
                <p className="text-lg font-black text-emerald-400">{stats.complianceScore}%</p>
              </div>
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5">
                <p className="text-[9px] text-slate-400 font-bold">RTO Audits Run</p>
                <p className="text-lg font-black text-white">{stats.auditedDrivers}</p>
              </div>
            </div>
          </div>

          {/* Live audits log feed */}
          <div className="flex-1 bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 flex flex-col overflow-hidden min-h-[160px]">
            <div className="flex items-center justify-between mb-3 border-b border-slate-800/50 pb-2">
              <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 flex items-center gap-1.5 font-sans">
                <Clock size={12} className="text-[#FFB300]" /> Live Audit log
              </span>
              <span className="text-[9px] text-slate-500 font-bold">Telemetry active</span>
            </div>

            <div className="flex-1 flex flex-col gap-2 overflow-hidden">
              <AnimatePresence initial={false}>
                {logs.map((log, idx) => (
                  <motion.div
                    key={log.id || idx}
                    initial={{ opacity: 0, x: 20, scale: 0.95 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: -20, scale: 0.95 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    className="bg-slate-950/70 border border-slate-850 p-2.5 rounded-xl flex items-start gap-2.5 hover:border-slate-850 transition"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[10px] font-black text-slate-200">{log.action}</span>
                        <span className="text-[8px] text-slate-500 font-bold uppercase">{log.time}</span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-medium truncate mb-1">Executed in {log.hub}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0"></span>
                        <span className="text-[8px] text-slate-400 font-bold uppercase tracking-wider">{log.status}</span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
