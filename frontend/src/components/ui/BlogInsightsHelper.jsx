import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  BookOpen, Star, Mail, Award, ArrowRight, Rss, Clock, User, CheckCircle2, Shield
} from 'lucide-react';

const categories = ['Tech Trends', 'Rider Guides', 'Safety First'];

const featuredInsights = {
  'Tech Trends': {
    title: 'How AI Algorithms Optimize Cab Allocation in Real-Time',
    desc: 'Behind the scenes of our matchmaking systems that reduce wait times by up to 35% through demand predictive analysis.',
    readTime: '5 min read',
    author: 'Tech Lab',
    tag: 'Algorithms'
  },
  'Rider Guides': {
    title: 'Top 5 Tips for Safe and Affordable Shared Trips',
    desc: 'Make the most of our shared-cab service. Learn the etiquette, pricing split tips, and optimal pickup points.',
    readTime: '3 min read',
    author: 'Operations Team',
    tag: 'Guides'
  },
  'Safety First': {
    title: 'Our Double-Guard Verification Protocol Detailed',
    desc: 'Deep-dive into how we coordinate with local authorities to establish background screening and live emergency buttons.',
    readTime: '6 min read',
    author: 'Safety Board',
    tag: 'Security'
  }
};

export const BlogInsightsHelper = () => {
  const [activeTab, setActiveTab] = useState('Tech Trends');
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({
    readers: 12450,
    subscribers: 4892,
    articles: 18
  });

  const handleSubscribe = (e) => {
    e.preventDefault();
    if (!email || !email.includes('@')) return;
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setSubscribed(true);
      setStats(prev => ({ ...prev, subscribers: prev.subscribers + 1 }));
    }, 1500);
  };

  return (
    <div className="w-full h-full bg-slate-950 text-slate-100 flex flex-col font-sans p-4 md:p-6 overflow-hidden select-none">
      
      {/* Top Header */}
      <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-[#FFB300]/10 text-[#FFB300] rounded-xl">
            <Rss size={18} />
          </div>
          <div>
            <h3 className="font-extrabold text-[15px] tracking-wide text-white uppercase font-sans">Insight Centre</h3>
            <p className="text-[10px] text-slate-400 font-medium">Weekly reviews, technology updates, and press releases</p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1 text-xs">
          <span className="h-2 w-2 rounded-full bg-[#FFB300] animate-pulse"></span>
          <span className="text-[11px] font-bold text-slate-300">Updated today</span>
        </div>
      </div>

      {/* Grid: Featured Slider (Left 60%) + Newsletter / Metrics (Right 40%) */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-5 gap-4 overflow-hidden">
        
        {/* Left: Featured Insight Slider */}
        <div className="lg:col-span-3 bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 flex flex-col justify-between overflow-hidden">
          <div>
            <div className="flex items-center justify-between mb-3 border-b border-slate-800/50 pb-2">
              <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 flex items-center gap-1.5">
                <BookOpen size={12} className="text-[#FFB300]" /> Featured Publication
              </span>
              <span className="text-[9px] font-extrabold text-slate-500">Filter Category</span>
            </div>

            {/* Category Select tabs */}
            <div className="flex gap-2 mb-4">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveTab(cat)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-extrabold uppercase tracking-wider transition ${
                    activeTab === cat 
                      ? 'bg-[#FFB300] text-slate-950 shadow-md shadow-[#FFB300]/10' 
                      : 'bg-slate-950/40 border border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Slider Content Card */}
            <div className="relative min-h-[130px]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, x: 15 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -15 }}
                  transition={{ duration: 0.25 }}
                  className="bg-slate-950/50 border border-slate-800 rounded-xl p-3.5"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-2 py-0.5 rounded text-[8px] font-extrabold uppercase bg-[#FFB300]/10 text-[#FFB300] border border-[#FFB300]/20">
                      {featuredInsights[activeTab].tag}
                    </span>
                    <span className="text-[9px] text-slate-500 font-bold flex items-center gap-1">
                      <Clock size={10} /> {featuredInsights[activeTab].readTime}
                    </span>
                  </div>
                  <h4 className="font-extrabold text-sm text-white mb-2 leading-tight hover:text-[#FFB300] transition duration-200">
                    {featuredInsights[activeTab].title}
                  </h4>
                  <p className="text-[11px] text-slate-400 leading-relaxed line-clamp-3">
                    {featuredInsights[activeTab].desc}
                  </p>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {/* Read article button */}
          <div className="mt-4 flex items-center justify-between bg-slate-950/80 border border-slate-850 p-2.5 rounded-xl">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] font-black text-[#FFB300]">
                R
              </div>
              <span className="text-[10px] text-slate-400 font-bold">Author: {featuredInsights[activeTab].author}</span>
            </div>
            <button className="flex items-center gap-1.5 text-[10px] font-black text-[#FFB300] hover:underline uppercase tracking-wider">
              Explore Article <ArrowRight size={12} />
            </button>
          </div>
        </div>

        {/* Right: Metrics + Newsletter subscription form */}
        <div className="lg:col-span-2 flex flex-col gap-4 overflow-hidden">
          
          {/* Dashboard Metrics summary */}
          <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 flex flex-col justify-between">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 flex items-center gap-1.5 mb-3">
              <Award size={12} className="text-[#FFB300]" /> Telemetry Stats
            </span>
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5">
                <p className="text-[9px] text-slate-400 font-bold">Weekly Readers</p>
                <p className="text-lg font-black text-white">{stats.readers.toLocaleString()}</p>
              </div>
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5">
                <p className="text-[9px] text-slate-400 font-bold">Publications</p>
                <p className="text-lg font-black text-[#FFB300]">{stats.articles}</p>
              </div>
            </div>
          </div>

          {/* Interactive Newsletter Signup card */}
          <div className="flex-1 bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 flex flex-col justify-between overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-800/50 pb-2 mb-2">
              <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 flex items-center gap-1.5">
                <Mail size={12} className="text-blue-400 animate-pulse" /> Newsletter
              </span>
              <span className="text-[9px] text-slate-500 font-bold">Join 4.8k+ readers</span>
            </div>

            <div className="flex-1 flex flex-col justify-center">
              <AnimatePresence mode="wait">
                {!subscribed ? (
                  <motion.form 
                    key="form"
                    onSubmit={handleSubscribe} 
                    className="flex flex-col gap-2.5"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <p className="text-[10px] text-slate-400 leading-normal mb-1">
                      Subscribe to receive immediate email notification alerts when we publish new blogs, updates, or coupons.
                    </p>
                    <div className="flex flex-col gap-2">
                      <input
                        type="email"
                        required
                        placeholder="Enter email address..."
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-[11px] text-white focus:outline-none focus:border-[#FFB300] placeholder-slate-600 transition"
                      />
                      <button 
                        type="submit"
                        disabled={loading}
                        className="w-full bg-[#FFB300] text-slate-950 text-[11px] font-black uppercase tracking-wider py-2.5 rounded-xl hover:bg-[#e09e00] transition active:scale-97 flex items-center justify-center gap-1.5"
                      >
                        {loading ? 'Subscribing...' : 'Subscribe Now'}
                      </button>
                    </div>
                  </motion.form>
                ) : (
                  <motion.div 
                    key="success"
                    className="text-center flex flex-col items-center gap-2 py-4"
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                  >
                    <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-full">
                      <CheckCircle2 size={24} />
                    </div>
                    <h5 className="font-extrabold text-xs text-white">Subscribed Successfully</h5>
                    <p className="text-[9px] text-slate-400">
                      We've added {email} to our dispatch mailing list. Check your inbox soon!
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
