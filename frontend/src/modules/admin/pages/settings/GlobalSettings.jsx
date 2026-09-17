import React, { useState } from 'react';
import { 
  Settings2, 
  CreditCard, 
  MessageSquare, 
  Globe, 
  Bell, 
  ShieldCheck, 
  Database,
  Save,
  CheckCircle2,
  AlertTriangle,
  Server
} from 'lucide-react';

const GlobalSettings = () => {
  const [activeTab, setActiveTab] = useState('Payment Gateways');

  const tabs = [
    { name: 'Payment Gateways', icon: <CreditCard size={18} /> },
    { name: 'SMS & Email API', icon: <MessageSquare size={18} /> },
    { name: 'Push Notifications', icon: <Bell size={18} /> },
    { name: 'Operational Toggles', icon: <Settings2 size={18} /> },
    { name: 'Data & Backups', icon: <Database size={18} /> },
  ];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 max-w-5xl mx-auto pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
           <div className="w-12 h-12 bg-gray-900 rounded-xl flex items-center justify-center text-white shadow-xl shadow-gray-200">
             <Settings2 size={24} />
           </div>
           <div>
             <h1 className="text-2xl font-black tracking-tight text-gray-900 leading-none mb-1">System Configuration</h1>
             <p className="text-gray-400 font-bold text-[11px] uppercase tracking-widest">Global API Keys & Platform Rules</p>
           </div>
        </div>
        <button className="bg-black text-white px-8 py-3 rounded-xl text-[13px] font-black hover:opacity-90 transition-all shadow-xl shadow-black/10 flex items-center gap-2">
           <Save size={18} /> SAVE CONFIGURATION
        </button>
      </div>

      <div className="flex gap-8 mt-10">
         {/* Left Sidebar Menu */}
         <div className="w-64 shrink-0 space-y-2">
            {tabs.map((tab) => (
               <button
                 key={tab.name}
                 onClick={() => setActiveTab(tab.name)}
                 className={`w-full flex items-center gap-3 p-3.5 rounded-xl transition-all font-bold text-[13px] ${
                    activeTab === tab.name 
                      ? 'bg-black text-white shadow-lg shadow-black/10' 
                      : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-100'
                 }`}
               >
                  {tab.icon} {tab.name}
               </button>
            ))}

            <div className="mt-8 p-5 bg-red-50 border border-red-100 rounded-xl space-y-3">
               <div className="flex items-center gap-2 text-red-600 font-black text-[12px] uppercase tracking-widest">
                  <ShieldCheck size={18} /> SUPER ADMIN ONLY
               </div>
               <p className="text-[11px] font-bold text-red-800 leading-relaxed uppercase tracking-tighter">
                  Changes to these core parameters impact the entire live application ecosystem.
               </p>
            </div>
         </div>

         {/* Right Settings Content */}
         <div className="flex-1 bg-white rounded-[32px] border border-gray-100 p-8 shadow-sm">
            
            {activeTab === 'Payment Gateways' && (
               <div className="space-y-8 animate-in fade-in duration-500">
                  <div className="flex items-center justify-between border-b border-gray-50 pb-6">
                     <div>
                        <h3 className="text-xl font-black text-gray-900 tracking-tight">Fintech Integrations</h3>
                        <p className="text-[11px] font-bold text-gray-400 mt-1 uppercase tracking-widest">Configure Razorpay and Stripe endpoints</p>
                     </div>
                     <span className="bg-green-50 text-green-600 px-3 py-1 rounded-lg text-[10px] font-black uppercase flex items-center gap-1.5"><Server size={14} /> LIVE MODE ACTIVE</span>
                  </div>

                  {/* Razorpay Setup */}
                  <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100 relative overflow-hidden">
                     <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl"></div>
                     <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                           <div className="w-10 h-10 bg-white shadow-sm rounded-lg flex items-center justify-center font-black text-blue-600 border border-gray-200">RZ</div>
                           <h4 className="text-[14px] font-black text-gray-900 uppercase">Razorpay Gateway (India)</h4>
                        </div>
                        <div className="w-12 h-6 bg-blue-600 rounded-full relative cursor-pointer">
                           <div className="w-4 h-4 bg-white rounded-full absolute right-1 top-1 shadow-sm"></div>
                        </div>
                     </div>
                     <div className="space-y-4">
                        <div>
                           <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Live Key ID</label>
                           <input type="password" value="rzp_live_xYzA1234567890" readOnly className="w-full bg-white border border-gray-200 rounded-xl py-2.5 px-4 text-[13px] font-bold text-gray-900 focus:outline-none" />
                        </div>
                        <div>
                           <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Live Key Secret</label>
                           <input type="password" value="••••••••••••••••••••••••" readOnly className="w-full bg-white border border-gray-200 rounded-xl py-2.5 px-4 text-[13px] font-bold text-gray-900 focus:outline-none" />
                        </div>
                        <div className="pt-2">
                           <button className="text-[11px] font-black text-primary hover:underline uppercase tracking-widest">Change Credentials</button>
                        </div>
                     </div>
                  </div>

                  {/* Stripe Setup */}
                  <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100 opacity-50 grayscale hover:grayscale-0 hover:opacity-100 transition-all">
                     <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                           <div className="w-10 h-10 bg-white shadow-sm rounded-lg flex items-center justify-center font-black text-[#635BFF] border border-gray-200">ST</div>
                           <h4 className="text-[14px] font-black text-gray-900 uppercase">Stripe Gateway (International)</h4>
                        </div>
                        <div className="w-12 h-6 bg-gray-300 rounded-full relative cursor-not-allowed">
                           <div className="w-4 h-4 bg-white rounded-full absolute left-1 top-1 shadow-sm"></div>
                        </div>
                     </div>
                     <div className="flex items-center gap-2 text-gray-500 font-bold text-[12px]">
                        <AlertTriangle size={16} /> Stripe goes online conditionally when expanding globally.
                     </div>
                  </div>
               </div>
            )}

            {activeTab === 'Operational Toggles' && (
               <div className="space-y-8 animate-in fade-in duration-500">
                  <div className="flex items-center justify-between border-b border-gray-50 pb-6">
                     <div>
                        <h3 className="text-xl font-black text-gray-900 tracking-tight">Platform Modules</h3>
                        <p className="text-[11px] font-bold text-gray-400 mt-1 uppercase tracking-widest">Enable or disable core system features globally</p>
                     </div>
                  </div>

                  <div className="space-y-4">
                     {[
                       { title: 'New Driver Onboarding', desc: 'Accept new registration requests via the Driver App.', status: true },
                       { title: 'Surge Pricing Automation', desc: 'Allow algorithm to increase prices during peak demands globally.', status: true },
                       { title: 'Cash Payments', desc: 'Allow users to select Cash as a payment method for rides.', status: true },
                       { title: 'Parcel Delivery Module', desc: 'Enable the local parcel delivery capability in the User App.', status: false },
                       { title: 'Maximum Distance Limit', desc: 'Enable maximum distance restrictions for zone-based rides.', status: true, key: 'max_distance_limit' },
                     ].map((toggle, idx) => (
                        <div key={idx} className="flex items-center justify-between p-5 bg-gray-50 rounded-2xl border border-gray-100">
                           <div className="w-2/3">
                              <h4 className="text-[14px] font-black text-gray-900 mb-1">{toggle.title}</h4>
                              <p className="text-[11px] font-bold text-gray-500 leading-relaxed pr-6">{toggle.desc}</p>
                           </div>
                           <div 
                             onClick={() => {
                               if (toggle.key === 'max_distance_limit') {
                                 const current = localStorage.getItem('enable_max_distance') === 'true';
                                 localStorage.setItem('enable_max_distance', !current);
                                 window.location.reload(); // Quick way to sync for this demo
                               }
                             }}
                             className={`w-12 h-6 rounded-full relative cursor-pointer transition-all ${((toggle.key === 'max_distance_limit' ? localStorage.getItem('enable_max_distance') === 'true' : toggle.status)) ? 'bg-primary' : 'bg-gray-300'}`}
                           >
                              <div className={`w-4 h-4 bg-white rounded-full absolute top-1 shadow-sm transition-all ${((toggle.key === 'max_distance_limit' ? localStorage.getItem('enable_max_distance') === 'true' : toggle.status)) ? 'right-1' : 'left-1'}`}></div>
                           </div>
                        </div>
                     ))}
                  </div>
               </div>
            )}

            {/* Placeholder for other tabs */}
            {(activeTab !== 'Payment Gateways' && activeTab !== 'Operational Toggles') && (
               <div className="h-64 flex flex-col items-center justify-center text-center opacity-50 space-y-4 animate-in fade-in duration-500">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center text-gray-400">
                     <Settings2 size={32} />
                  </div>
                  <div>
                     <h3 className="text-lg font-black text-gray-900 tracking-tight uppercase">Under Configuration</h3>
                     <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mt-1">This module is locked by cloud policies.</p>
                  </div>
               </div>
            )}
         </div>
      </div>
    </div>
  );
};

export default GlobalSettings;
