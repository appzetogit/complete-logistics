import React, { useState, useEffect } from 'react';
import { 
  Users, 
  UserCheck, 
  Zap, 
  IndianRupee, 
  ArrowUpRight, 
  ChevronRight,
  TrendingUp,
  PieChart as PieIcon,
  Activity,
  ArrowRight
} from 'lucide-react';

const StatCard = ({ title, value, change, icon: Icon, color }) => (
  <div className="bg-white rounded-[32px] p-8 border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between h-full group">
    <div className="flex items-start justify-between">
      <div className={`p-4 rounded-2xl ${color} bg-opacity-10 group-hover:scale-110 transition-transform duration-500`}>
        <Icon size={24} className={`${color.replace('bg-', 'text-')}`} />
      </div>
      <div className="flex flex-col items-end">
        <div className="flex items-center gap-1 text-[11px] font-black text-emerald-500 uppercase tracking-widest bg-emerald-50 px-2.5 py-1 rounded-full">
          <ArrowUpRight size={14} /> {change}%
        </div>
      </div>
    </div>
    <div className="mt-8">
      <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest leading-none mb-3">{title}</p>
      <h3 className="text-4xl font-black text-gray-950 tracking-tighter leading-none">{value}</h3>
    </div>
  </div>
);

const ChartSection = ({ title, children }) => (
  <div className="bg-white rounded-[40px] border border-gray-100 shadow-sm overflow-hidden flex flex-col h-full">
    <div className="px-8 py-6 border-b border-gray-50 flex items-center justify-between bg-gray-50/30">
      <h3 className="text-[13px] font-black text-gray-950 uppercase tracking-widest flex items-center gap-3">
        <div className="w-2 h-2 bg-indigo-600 rounded-full" />
        {title}
      </h3>
      <button className="text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-indigo-600 transition-colors flex items-center gap-1">
        Details <ArrowRight size={14} />
      </button>
    </div>
    <div className="p-10 flex-1 flex flex-col items-center justify-center">
      {children}
    </div>
  </div>
);

const ReferralDashboard = () => {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const token = localStorage.getItem('adminToken') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5YzdiZTZhYmJlOTJlYjYwMGYwMmQxNiIsImVtYWlsIjoiYWRtaW5AYWRtaW4uY29tIiwibW9iaWxlIjoiOTk5OTk5OTk5OSIsInJvbGUiOiJzdXBlci1hZG1pbiIsImlhdCI6MTc3NTA0OTExNywiZXhwIjoxODA2NTg1MTE3fQ.5KJmXJwaVefWhnc97EqtArkA1z7ZOhsJwA9fbyRVPdQ';
        const res = await fetch(globalThis.__LEGACY_BACKEND_ORIGIN__ + '/api/v1/admin/referral/dashboard', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const json = await res.json();
        if (json.success) {
          setData(json.data);
        }
      } catch (err) {
        console.error("Dashboard fetch error:", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchDashboard();
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50/30 p-8">
        <div className="flex flex-col items-center gap-6">
          <div className="w-16 h-16 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
          <p className="text-[14px] font-black text-gray-400 uppercase tracking-widest animate-pulse">Syncing Viral Growth Metrics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-12 p-2 animate-in fade-in zoom-in-95 duration-700 font-sans text-gray-950">
      {/* HEADER */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-6xl font-black tracking-tighter text-gray-950 mb-3 uppercase leading-none">Referral<span className="text-indigo-600">.</span></h1>
          <div className="flex items-center gap-3 text-[12px] font-black text-gray-400">
            <span className="bg-gray-100 text-gray-950 px-3 py-1 rounded-full uppercase tracking-widest text-[10px]">Referral Dashboard</span>
            <ChevronRight size={14} />
            <span className="uppercase tracking-widest text-[10px]">Analytics Overview</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
           <div className="bg-white px-6 py-3 rounded-full border border-gray-100 shadow-sm flex items-center gap-3">
              <Activity size={18} className="text-indigo-600" />
              <span className="text-[11px] font-black uppercase tracking-widest text-gray-400">Live Status:</span>
              <span className="text-[11px] font-black uppercase tracking-widest text-emerald-500">Active</span>
           </div>
        </div>
      </div>

      {/* STATS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Total Drivers" 
          value={data?.total_drivers || "0"} 
          change="12" 
          icon={Users} 
          color="bg-indigo-600" 
        />
        <StatCard 
          title="Total Users" 
          value={data?.total_users || "0"} 
          change="8" 
          icon={UserCheck} 
          color="bg-rose-500" 
        />
        <StatCard 
          title="Active Referrals" 
          value={data?.active_referrals || "0"} 
          change="24" 
          icon={Zap} 
          color="bg-amber-400" 
        />
        <StatCard 
          title="Referral Earnings" 
          value={data?.referral_earning ? `₹${data.referral_earning}` : "₹ 0"} 
          change="18" 
          icon={IndianRupee} 
          color="bg-emerald-500" 
        />
      </div>

      {/* CHARTS ROW - USER REFERRALS */}
      <div className="space-y-6">
         <div className="flex items-center justify-between border-b border-gray-100 pb-4">
            <h2 className="text-[15px] font-black uppercase tracking-[0.2em] text-gray-400">User Referrals Overview</h2>
         </div>
         <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-[500px]">
           <div className="lg:col-span-4">
              <ChartSection title="User Distribution">
                 <div className="relative w-64 h-64 rounded-full border-[1.5em] border-indigo-600 flex items-center justify-center shadow-2xl shadow-indigo-100 transform hover:rotate-6 transition-transform duration-700">
                    <div className="absolute inset-0 rounded-full border-[1.5em] border-rose-500 border-t-transparent border-l-transparent -rotate-45"></div>
                    <div className="text-center">
                       <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Ratio</p>
                       <p className="text-4xl font-black text-gray-950 tracking-tighter">72/28</p>
                    </div>
                 </div>
                 <div className="mt-12 flex flex-col gap-4 w-full">
                    <div className="flex items-center justify-between p-4 bg-gray-50/50 rounded-2xl border border-gray-50">
                       <div className="flex items-center gap-3">
                         <div className="w-3 h-3 bg-indigo-600 rounded-full shadow-lg shadow-indigo-200"></div>
                         <span className="text-[11px] font-black uppercase tracking-widest text-gray-500">Normal User</span>
                       </div>
                       <span className="text-[13px] font-black text-gray-950">1,240</span>
                    </div>
                    <div className="flex items-center justify-between p-4 bg-gray-50/50 rounded-2xl border border-gray-50">
                       <div className="flex items-center gap-3">
                         <div className="w-3 h-3 bg-rose-500 rounded-full shadow-lg shadow-rose-200"></div>
                         <span className="text-[11px] font-black uppercase tracking-widest text-gray-500">Referral User</span>
                       </div>
                       <span className="text-[13px] font-black text-gray-950">460</span>
                    </div>
                 </div>
              </ChartSection>
           </div>
           
           <div className="lg:col-span-8">
              <ChartSection title="Monthly Growth Trend">
                 <div className="w-full flex-1 flex flex-col justify-end gap-12">
                   <div className="h-full flex items-end justify-between gap-4 px-4">
                      {[30, 45, 60, 40, 80, 55, 90, 70, 85, 50, 65, 75].map((val, idx) => (
                        <div key={idx} className="flex-1 flex flex-col items-center gap-4 group">
                           <div 
                             className="w-full bg-indigo-600 rounded-t-2xl shadow-xl shadow-indigo-100 group-hover:bg-rose-500 transition-all duration-500 transform group-hover:scale-y-105 origin-bottom"
                             style={{ height: `${val}%` }}
                           ></div>
                           <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest transform -rotate-45 lg:rotate-0 mt-4 group-hover:text-indigo-600 transition-colors">
                             {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][idx]}
                           </span>
                        </div>
                      ))}
                   </div>
                 </div>
              </ChartSection>
           </div>
         </div>
      </div>

      {/* DRIVER REFERRALS ROW */}
      <div className="space-y-6 opacity-80 filter grayscale hover:grayscale-0 transition-all duration-700">
         <div className="flex items-center justify-between border-b border-gray-100 pb-4">
            <h2 className="text-[15px] font-black uppercase tracking-[0.2em] text-gray-400">Driver Referrals Overview</h2>
         </div>
         <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-[500px]">
           <div className="lg:col-span-4">
              <ChartSection title="Driver Segmentation">
                 <div className="relative w-64 h-64 rounded-full border-[1.5em] border-indigo-950 flex items-center justify-center transform hover:-rotate-12 transition-transform duration-1000">
                    <div className="absolute inset-0 rounded-full border-[1.5em] border-indigo-400 border-t-transparent border-r-transparent rotate-45"></div>
                    <div className="text-center">
                       <p className="text-[10px] font-black text-white/50 uppercase tracking-widest mb-1">Segments</p>
                       <p className="text-4xl font-black text-gray-950 tracking-tighter">54 : 46</p>
                    </div>
                 </div>
                 <div className="mt-12 flex flex-col gap-4 w-full">
                    <div className="flex items-center justify-between p-4 bg-indigo-950 rounded-2xl">
                       <div className="flex items-center gap-3">
                         <div className="w-3 h-3 bg-white rounded-full"></div>
                         <span className="text-[11px] font-black uppercase tracking-widest text-white/70">Master Drivers</span>
                       </div>
                       <span className="text-[13px] font-black text-white">820</span>
                    </div>
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100">
                       <div className="flex items-center gap-3">
                         <div className="w-3 h-3 bg-indigo-400 rounded-full"></div>
                         <span className="text-[11px] font-black uppercase tracking-widest text-gray-500">Referral Network</span>
                       </div>
                       <span className="text-[13px] font-black text-gray-950">695</span>
                    </div>
                 </div>
              </ChartSection>
           </div>
           
           <div className="lg:col-span-8">
              <ChartSection title="Operational Trajectory">
                 <div className="w-full h-full flex flex-col">
                    <div className="flex-1 flex items-center justify-center p-12">
                       <div className="w-full h-full flex items-end">
                          <svg className="w-full h-full" viewBox="0 0 1000 300">
                             <defs>
                                <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
                                   <stop offset="0%" stopColor="#4F46E5" stopOpacity="0.2" />
                                   <stop offset="100%" stopColor="#4F46E5" stopOpacity="0" />
                                </linearGradient>
                             </defs>
                             <path 
                               d="M0,250 Q100,200 200,220 T400,150 T600,100 T800,120 T1000,50 L1000,300 L0,300 Z" 
                               fill="url(#lineGrad)" 
                             />
                             <path 
                               d="M0,250 Q100,200 200,220 T400,150 T600,100 T800,120 T1000,50" 
                               fill="none" 
                               stroke="#4F46E5" 
                               strokeWidth="8" 
                               strokeLinecap="round"
                             />
                          </svg>
                       </div>
                    </div>
                    <div className="grid grid-cols-12 px-8 mb-10 gap-4">
                      {['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'].map((m) => (
                        <div key={m} className="text-center text-[11px] font-black text-gray-300 uppercase tracking-widest hover:text-indigo-600 transition-colors cursor-help">{m}</div>
                      ))}
                    </div>
                 </div>
              </ChartSection>
           </div>
         </div>
      </div>
    </div>
  );
};

export default ReferralDashboard;

