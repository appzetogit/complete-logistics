import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Briefcase, Users, FileText, Send, CheckCircle, Clock, Sparkles, Star, MapPin
} from 'lucide-react';

const positions = [
  { id: 'sales_mgr', title: 'Field Sales Manager', location: 'Dehradun, Uttarakhand', type: 'Full-time', salary: 'Attractive + Incentives', exp: 'Graduation Preferred', desc: 'Responsible for leading the field executives team, driver onboarding operations, document verification, and coordinate first ride completion.' },
  { id: 'sales_exec', title: 'Field Sales Executive', location: 'Uttarakhand', type: 'Full-time', salary: 'Fixed + Incentives', exp: 'Energetic / On-field Pref.', desc: 'Responsible for active driver acquisition, registration activation, document verification, and onboarding Auto, E-Rickshaw, and Cab drivers.' }
];

const mockRecruiters = [
  { name: 'Neerja V.', role: 'Sales Hiring Lead', online: true },
  { name: 'Aditya S.', role: 'Regional HR Recruiter', online: true }
];

const liveFeeds = [
  { name: 'Pooja G.', role: 'Field Sales Executive', status: 'Resume Received', time: 'Just now', dotColor: 'bg-blue-400' },
  { name: 'Sameer K.', role: 'Field Sales Executive', status: 'Offer Sent', time: '4m ago', dotColor: 'bg-emerald-400' },
  { name: 'Devendra P.', role: 'Field Sales Manager', status: 'Interview Scheduled', time: '8m ago', dotColor: 'bg-amber-400' }
];

const feedTemplates = [
  { name: 'Sunita L.', role: 'Field Sales Executive', status: 'Resume Screened', dotColor: 'bg-[#FFB300]' },
  { name: 'Rohan D.', role: 'Field Sales Manager', status: 'Screening Round', dotColor: 'bg-purple-400' },
  { name: 'Ananya S.', role: 'Field Sales Executive', status: 'Offer Accepted', dotColor: 'bg-emerald-500' }
];

export const CareersDashboardHelper = () => {
  const [selectedJob, setSelectedJob] = useState('sales_mgr');
  const [fullName, setFullName] = useState('');
  const [applied, setApplied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feed, setFeed] = useState(liveFeeds);
  const [stats, setStats] = useState({
    activeApplications: 312,
    openPositions: 12,
    onlineInterviewers: 6
  });

  const currentJob = positions.find(p => p.id === selectedJob);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!fullName) return;
    setSubmitting(true);
    setTimeout(() => {
      setSubmitting(false);
      setApplied(true);
      // Append to local live application feed
      const newEvent = {
        name: fullName,
        role: currentJob.title,
        status: 'Resume Received',
        time: 'Just now',
        dotColor: 'bg-blue-400'
      };
      setFeed(prev => [newEvent, ...prev.slice(0, 2)]);
      setStats(prev => ({ ...prev, activeApplications: prev.activeApplications + 1 }));
    }, 1500);
  };

  useEffect(() => {
    const feedInterval = setInterval(() => {
      const randomEvent = feedTemplates[Math.floor(Math.random() * feedTemplates.length)];
      const newEvent = {
        id: Date.now(),
        ...randomEvent,
        time: 'Just now'
      };
      setFeed(prev => {
        const updated = [newEvent, ...prev.slice(0, 2)];
        return updated.map((item, idx) => {
          if (idx === 0) return item;
          return {
            ...item,
            time: item.time === 'Just now' ? '1m ago' : `${idx + 1}m ago`
          };
        });
      });
    }, 8000);

    return () => clearInterval(feedInterval);
  }, []);

  return (
    <div className="w-full h-full bg-slate-950 text-slate-100 flex flex-col font-sans p-4 md:p-6 overflow-hidden select-none">
      
      {/* HUD Header */}
      <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-amber-400/10 text-amber-400 rounded-xl">
            <Briefcase size={18} />
          </div>
          <div>
            <h3 className="font-extrabold text-[15px] tracking-wide text-white uppercase font-sans">Talent Acquisition Center</h3>
            <p className="text-[10px] text-slate-400 font-medium">Hiring pipeline, live openings, and application status tracker</p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1 text-xs">
          <div className="h-2 w-2 rounded-full bg-[#FFB300] animate-ping"></div>
          <span className="text-[11px] font-bold text-slate-300">Recruiting Live</span>
        </div>
      </div>

      {/* Main Grid: Job details & apply (Left 60%) + Metrics & recruiters (Right 40%) */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-5 gap-4 overflow-hidden">
        
        {/* Left Column: Interactive Job Openings & Application form */}
        <div className="lg:col-span-3 bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 flex flex-col justify-between overflow-hidden">
          
          <div>
            <div className="flex items-center justify-between mb-3 border-b border-slate-800/50 pb-2">
              <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 flex items-center gap-1.5 font-sans">
                <Sparkles size={12} className="text-[#FFB300]" /> Open Opportunities
              </span>
              <span className="text-[9px] font-extrabold text-slate-500">Pick a role to view info</span>
            </div>

            {/* Job selector tabs */}
            <div className="flex gap-2 mb-4 overflow-x-auto">
              {positions.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setSelectedJob(p.id); setApplied(false); }}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-extrabold uppercase tracking-wider transition shrink-0 ${
                    selectedJob === p.id 
                      ? 'bg-amber-400 text-slate-950 font-black shadow-md shadow-amber-400/10' 
                      : 'bg-slate-950/40 border border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {p.title}
                </button>
              ))}
            </div>

            {/* Active Position Info Card */}
            <div className="relative min-h-[100px] mb-4">
              <AnimatePresence mode="wait">
                <motion.div
                  key={selectedJob}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="bg-slate-950/50 border border-slate-800 rounded-xl p-3.5"
                >
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="text-[8px] font-black uppercase tracking-wider bg-slate-900 text-slate-300 px-2 py-0.5 rounded border border-slate-800 flex items-center gap-1">
                      <MapPin size={9} /> {currentJob.location}
                    </span>
                    <span className="text-[8px] font-black uppercase tracking-wider bg-slate-900 text-slate-300 px-2 py-0.5 rounded border border-slate-800">
                      {currentJob.type}
                    </span>
                    <span className="text-[8px] font-black uppercase tracking-wider bg-[#FFB300]/10 text-[#FFB300] border border-[#FFB300]/20 px-2 py-0.5 rounded">
                      CTC: {currentJob.salary}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    <strong>Scope & Requirements ({currentJob.exp}):</strong> {currentJob.desc}
                  </p>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {/* Interactive Form or Applied state */}
          <div className="bg-slate-950/80 border border-slate-850 p-4 rounded-xl">
            <AnimatePresence mode="wait">
              {!applied ? (
                <motion.form 
                  key="form"
                  onSubmit={handleSubmit}
                  className="flex items-center gap-3"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <div className="flex-1">
                    <input
                      type="text"
                      required
                      placeholder="Enter full name for instant apply..."
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-2 text-[11px] text-white focus:outline-none focus:border-amber-400 placeholder-slate-600 transition"
                    />
                  </div>
                  <button 
                    type="submit"
                    disabled={submitting}
                    className="bg-[#FFB300] hover:bg-[#e09e00] text-slate-950 font-black text-[11px] uppercase tracking-wider py-2.5 px-4 rounded-xl transition shrink-0 active:scale-97 flex items-center gap-1.5"
                  >
                    {submitting ? 'Applying...' : 'Apply Now'} <Send size={12} />
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
                      <CheckCircle size={16} />
                    </div>
                    <div>
                      <h5 className="font-extrabold text-xs text-white">Application Received!</h5>
                      <p className="text-[9px] text-slate-400 font-medium">Auto-screening triggered for {fullName}. Check inbox shortly.</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => { setApplied(false); setFullName(''); }}
                    className="text-[9px] font-black text-amber-400 uppercase tracking-widest hover:underline cursor-pointer"
                  >
                    Reset
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </div>

        {/* Right Column: Hiring Analytics & Live dispatch pipeline */}
        <div className="lg:col-span-2 flex flex-col gap-4 overflow-hidden">
          
          {/* Key telemetry stats */}
          <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 flex flex-col justify-between">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 flex items-center gap-1.5 mb-3 font-sans">
              <Star size={12} className="text-[#FFB300]" /> Pipeline Telemetry
            </span>
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5">
                <p className="text-[9px] text-slate-400 font-bold">Applications Active</p>
                <p className="text-lg font-black text-white">{stats.activeApplications}</p>
              </div>
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5">
                <p className="text-[9px] text-slate-400 font-bold">Open Positions</p>
                <p className="text-lg font-black text-amber-400">{stats.openPositions}</p>
              </div>
            </div>
          </div>

          {/* Hiring feed status */}
          <div className="flex-1 bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 flex flex-col overflow-hidden min-h-[160px]">
            <div className="flex items-center justify-between mb-3 border-b border-slate-800/50 pb-2">
              <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 flex items-center gap-1.5 font-sans">
                <Users size={12} className="text-[#FFB300]" /> Live Application log
              </span>
              <span className="text-[9px] text-slate-500 font-bold">Auto updates active</span>
            </div>

            <div className="flex-1 flex flex-col gap-2 overflow-hidden">
              <AnimatePresence initial={false}>
                {feed.map((item, idx) => (
                  <motion.div
                    key={item.id || idx}
                    initial={{ opacity: 0, x: 20, scale: 0.95 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: -20, scale: 0.95 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    className="bg-slate-950/70 border border-slate-850 p-2.5 rounded-xl flex items-start gap-2.5 hover:border-slate-850 transition"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[10px] font-black text-slate-200">{item.name}</span>
                        <span className="text-[8px] text-slate-500 font-bold uppercase">{item.time}</span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-medium truncate mb-1">Applied for {item.role}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`h-1.5 w-1.5 rounded-full ${item.dotColor} shrink-0`}></span>
                        <span className="text-[8px] text-slate-400 font-bold uppercase tracking-wider">{item.status}</span>
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
