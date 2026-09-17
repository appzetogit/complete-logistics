import React, { useState } from 'react';
import { 
  FileText, 
  Image as ImageIcon, 
  HelpCircle, 
  Settings,
  Plus,
  Save,
  Globe,
  Smartphone,
  Edit2,
  Trash2,
  Eye,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

const CMSBuilder = () => {
  const [activeTab, setActiveTab] = useState('Banners');

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 max-w-6xl mx-auto pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">CMS Builder</h1>
          <p className="text-gray-400 font-bold text-[11px] mt-1 uppercase tracking-widest leading-none">Manage App Content & Legal Documents</p>
        </div>
        <div className="flex items-center gap-3">
           <button className="bg-white border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-[13px] font-bold hover:bg-gray-50 flex items-center gap-2">
             <Eye size={16} /> Preview App
           </button>
           <button className="bg-black text-white px-6 py-2 rounded-lg text-[13px] font-bold hover:opacity-90 transition-all shadow-sm flex items-center gap-2">
             <Save size={16} /> Publish Changes
           </button>
        </div>
      </div>

      <div className="flex gap-8">
         {/* Left Side: Navigation Tabs */}
         <div className="w-64 shrink-0 space-y-2">
            {[
               { id: 'Banners', icon: <ImageIcon size={18} />, count: 3 },
               { id: 'FAQ', icon: <HelpCircle size={18} />, count: 12 },
               { id: 'Legal', icon: <FileText size={18} />, count: 4 },
               { id: 'Settings', icon: <Settings size={18} />, count: null },
            ].map((tab) => (
               <button
                 key={tab.id}
                 onClick={() => setActiveTab(tab.id)}
                 className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${
                    activeTab === tab.id 
                      ? 'bg-black text-white shadow-lg shadow-black/10' 
                      : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-100'
                 }`}
               >
                  <div className="flex items-center gap-3 font-bold text-[13px]">
                     {tab.icon} {tab.id}
                  </div>
                  {tab.count !== null && (
                     <div className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                        activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
                     }`}>
                        {tab.count}
                     </div>
                  )}
               </button>
            ))}

            <div className="mt-8 p-4 bg-blue-50 border border-blue-100 rounded-xl space-y-3">
               <div className="flex items-center gap-2 text-blue-600 font-bold text-[12px] uppercase tracking-widest">
                  <Globe size={16} /> Sync Status
               </div>
               <p className="text-[11px] font-bold text-blue-800 leading-relaxed">
                  Content automatically syncs to User & Driver mobile apps upon publishing.
               </p>
            </div>
         </div>

         {/* Right Side: Content Area */}
         <div className="flex-1">
            {activeTab === 'Banners' && (
               <div className="space-y-6 animate-in fade-in duration-500">
                  <div className="flex items-center justify-between">
                     <h3 className="text-lg font-black text-gray-900 tracking-tight">Active Promotional Banners</h3>
                     <button className="text-[12px] font-black text-primary uppercase flex items-center gap-1 hover:underline">
                        <Plus size={14} strokeWidth={3} /> Add New Banner
                     </button>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-6">
                     {/* Banner Card 1 */}
                     <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm group">
                        <div className="h-32 bg-gray-900 relative">
                           <img src="https://images.unsplash.com/photo-1611095973763-4140154a0f8b?q=80&w=600" className="w-full h-full object-cover opacity-60" alt="Banner" />
                           <div className="absolute top-3 left-3 bg-green-500 text-white px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest shadow-lg">Active</div>
                           <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 bg-black/40 transition-all">
                              <button className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-gray-900 hover:scale-110 transition-transform"><Edit2 size={16} /></button>
                              <button className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center text-white hover:scale-110 transition-transform"><Trash2 size={16} /></button>
                           </div>
                        </div>
                        <div className="p-4">
                           <h4 className="text-[14px] font-black text-gray-900 truncate">Weekend 50% Off Surge</h4>
                           <p className="text-[11px] font-bold text-gray-400 mt-1">Target: User App • Ends in 2 Days</p>
                        </div>
                     </div>

                     {/* Banner Card 2 */}
                     <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm group">
                        <div className="h-32 bg-gray-900 relative">
                           <div className="absolute inset-0 bg-primary/20"></div>
                           <div className="absolute inset-0 bg-gradient-to-r from-primary to-orange-400 opacity-80"></div>
                           <div className="absolute top-3 left-3 bg-green-500 text-white px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest shadow-lg">Active</div>
                        </div>
                        <div className="p-4">
                           <h4 className="text-[14px] font-black text-gray-900 truncate">Driver Onboarding Bonus ₹500</h4>
                           <p className="text-[11px] font-bold text-gray-400 mt-1">Target: Driver App • Standard Banner</p>
                        </div>
                     </div>

                  </div>
               </div>
            )}

            {activeTab === 'Legal' && (
               <div className="space-y-6 animate-in fade-in duration-500">
                  <div className="flex items-center justify-between">
                     <h3 className="text-lg font-black text-gray-900 tracking-tight">Legal & Policy Documents</h3>
                  </div>

                  <div className="space-y-4">
                     {['Privacy Policy', 'Terms of Service', 'Driver Agreement (SLA)', 'Refund Policy'].map((doc, i) => (
                        <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 flex items-center justify-between shadow-sm hover:border-gray-300 transition-all cursor-pointer">
                           <div className="flex items-center gap-4">
                              <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center text-gray-400">
                                 <FileText size={20} className={i === 0 ? 'text-primary' : ''} />
                              </div>
                              <div>
                                 <h4 className="text-[14px] font-black text-gray-900">{doc}</h4>
                                 <p className="text-[11px] font-bold text-gray-400 mt-0.5 uppercase tracking-widest">Last updated: 14th Feb 2024</p>
                              </div>
                           </div>
                           <button className="px-4 py-2 border border-gray-200 rounded-lg text-[12px] font-bold text-gray-600 hover:bg-gray-50 flex items-center gap-2">
                              <Edit2 size={14} /> Edit Content
                           </button>
                        </div>
                     ))}
                  </div>
               </div>
            )}

            {activeTab === 'FAQ' && (
               <div className="space-y-6 animate-in fade-in duration-500">
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                     <div className="p-6 border-b border-gray-50 flex items-center justify-between">
                        <h3 className="text-lg font-black text-gray-900 tracking-tight">Frequently Asked Questions</h3>
                        <button className="text-[12px] font-black text-primary uppercase flex items-center gap-1 hover:underline">
                           <Plus size={14} strokeWidth={3} /> Add Question
                        </button>
                     </div>
                     <div className="divide-y divide-gray-50">
                        {[
                          { q: 'How is surge pricing calculated?', target: 'User App' },
                          { q: 'When are payouts processed?', target: 'Driver App' },
                          { q: 'How to report a lost item?', target: 'Global' }
                        ].map((faq, idx) => (
                           <div key={idx} className="p-6 hover:bg-gray-50/50 transition-all group">
                              <div className="flex justify-between items-start">
                                 <div>
                                    <h4 className="text-[14px] font-bold text-gray-900 mb-2">{faq.q}</h4>
                                    <span className="text-[10px] font-black text-gray-400 bg-gray-100 px-2 py-0.5 rounded uppercase tracking-widest">{faq.target}</span>
                                 </div>
                                 <div className="flex opacity-0 group-hover:opacity-100 transition-all gap-2">
                                    <button className="p-2 text-gray-400 hover:text-primary"><Edit2 size={16} /></button>
                                    <button className="p-2 text-gray-400 hover:text-red-500"><Trash2 size={16} /></button>
                                 </div>
                              </div>
                           </div>
                        ))}
                     </div>
                  </div>
               </div>
            )}
         </div>
      </div>
    </div>
  );
};

export default CMSBuilder;
