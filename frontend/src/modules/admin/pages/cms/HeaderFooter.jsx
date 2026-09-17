import React, { useState } from 'react';
import { 
  ChevronRight,
  Loader2,
  Plus,
  MoreVertical,
  Layout,
  Globe
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useSettings } from '../../../../shared/context/SettingsContext';

const HeaderFooter = () => {
  const { settings } = useSettings();
  const appName = settings.general?.app_name || 'App';
  const appLogo = settings.general?.logo || settings.customization?.logo || settings.general?.favicon || '';
  const [loading, setLoading] = useState(false);
  const [colors, setColors] = useState({
    headerBg: '#ffffff',
    headerText: '#212529',
    headerActive: '#4f46e5',
    footerBg: '#111827',
    footerText: '#ffffff'
  });

  const [pages] = useState([
    { title: 'Home', language: 'English' },
    { title: 'Inicio', language: 'Spanish' }
  ]);

  const handleUpdate = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      toast.success('Landing site color settings updated');
    }, 1000);
  };

  const inputClass = "w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-800 bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-colors";
  const labelClass = "block text-xs font-semibold text-gray-500 mb-1.5";
  const cardClass = "bg-white rounded-xl border border-gray-200 p-6";

  return (
    <div className="min-h-screen bg-gray-50 p-6 lg:p-8 font-sans pb-20">
      
      {/* Header Area */}
      <div className="mb-6">
        <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-2">
           <span>Landing Header-Footer</span>
           <ChevronRight size={12} />
           <span className="text-gray-700 font-medium">Index</span>
        </div>
        <div className="flex items-center justify-between">
           <h1 className="text-xl text-gray-900 tracking-tight italic decoration-indigo-200 font-bold">Index</h1>
        </div>
      </div>

      <div className="space-y-8 max-w-6xl mx-auto">
        
        {/* Colors Selection Card */}
        <div className={cardClass}>
           <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
              <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                 <Layout size={18} />
              </div>
              <div>
                 <h3 className="text-sm text-gray-900 tracking-tight font-bold">Landingsite Color Settings</h3>
                 <p className="text-xs text-gray-400 font-medium italic italic underline-offset-4">Configure the primary branding colors for your landing page header and footer</p>
              </div>
           </div>
           
           <div className="flex items-center gap-4 mb-4 bg-gray-50 p-4 rounded-lg border border-gray-100 border-dashed">
              <div className="w-8 h-8 rounded-md shadow-sm border border-white" style={{ backgroundColor: '#0ab39c' }}></div>
              <input 
                value="#0ab39c" 
                readOnly
                className="w-24 border border-gray-200 rounded-md px-2 py-1.5 text-xs font-black text-gray-400 text-center bg-white outline-none" 
              />
              <span className="text-xs font-semibold text-gray-400 italic">
                (You can choose and copy color code from here and paste to below input fields)
              </span>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                 <label className={labelClass}>Landingsite Header Background Color</label>
                 <input className={inputClass} value={colors.headerBg} onChange={(e) => setColors({...colors, headerBg: e.target.value})} />
              </div>
              <div>
                 <label className={labelClass}>Landingsite Header Text Color</label>
                 <input className={inputClass} value={colors.headerText} onChange={(e) => setColors({...colors, headerText: e.target.value})} />
              </div>
              <div>
                 <label className={labelClass}>Landingsite Header Active Text Color</label>
                 <input className={inputClass} value={colors.headerActive} onChange={(e) => setColors({...colors, headerActive: e.target.value})} />
              </div>
              <div>
                 <label className={labelClass}>Landingsite Footer Background Color</label>
                 <input className={inputClass} value={colors.footerBg} onChange={(e) => setColors({...colors, footerBg: e.target.value})} />
              </div>
              <div>
                 <label className={labelClass}>Landingsite Footer Text Color</label>
                 <input className={inputClass} value={colors.footerText} onChange={(e) => setColors({...colors, footerText: e.target.value})} />
              </div>
           </div>

           <div className="flex justify-end mt-8 border-t border-gray-50 pt-6">
              <button 
                onClick={handleUpdate}
                disabled={loading}
                className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 shadow-sm transition-all flex items-center gap-2"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : 'Update Landing Settings'}
              </button>
           </div>
        </div>

        {/* Preview Section */}
        <div className={cardClass}>
           <div className="flex items-center gap-3 mb-8">
              <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                 <Globe size={18} />
              </div>
              <div>
                 <h3 className="text-sm text-gray-900 tracking-tight font-bold">Header-Footer Page Registry</h3>
                 <p className="text-xs text-gray-400 font-medium italic italic decoration-indigo-200 underline-offset-4">Manage navigational static pages throughout your landing site</p>
              </div>
              <button className="ml-auto flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 shadow-sm transition-all">
                 <Plus size={14} /> Add New Translation
              </button>
           </div>

           {/* Preview Mockup */}
           <div className="mb-10 bg-gray-50 rounded-xl p-8 border border-gray-100 shadow-inner">
              <div className="w-full bg-white rounded-lg p-5 border border-gray-200 shadow-sm flex items-center justify-between">
                 {appLogo ? (
                   <img src={appLogo} alt={`${appName} logo`} className="h-5 opacity-80" />
                 ) : (
                   <span className="text-sm font-black tracking-tight text-slate-900">{appName}</span>
                 )}
                 <nav className="flex gap-8">
                    <span className="text-[11px] font-bold text-indigo-600 uppercase tracking-widest underline decoration-2 underline-offset-8 cursor-pointer">Home</span>
                    <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest cursor-pointer hover:text-gray-600 transition-colors">About Us</span>
                    <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest cursor-pointer hover:text-gray-600 transition-colors">Driver</span>
                    <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest cursor-pointer hover:text-gray-600 transition-colors">User</span>
                 </nav>
                 <div className="flex items-center gap-4">
                    <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center border border-indigo-100">
                       <Loader2 size={12} className="text-indigo-600 animate-spin-slow" />
                    </div>
                    <button className="bg-indigo-600 text-white text-[10px] font-bold px-5 py-2 rounded-lg uppercase tracking-widest shadow-sm">Reserve Your Ride</button>
                 </div>
              </div>
              <div className="h-1 bg-gray-900/5 mt-4 rounded-full w-full"></div>
           </div>

           {/* Table Component */}
           <div className="flex items-center justify-between mb-4 px-2">
              <div className="flex items-center gap-2 text-xs font-medium text-gray-400">
                 Show <select className="border-none bg-gray-100 rounded px-2 py-1 text-xs font-bold text-gray-700 outline-none"><option>10</option></select> entries
              </div>
              <div className="flex-1 text-center">
                 <a href="#" className="text-emerald-600 text-xs font-bold underline underline-offset-4 decoration-emerald-200 hover:text-emerald-700 transition-all">How It Works ?</a>
              </div>
              <div className="w-[100px]"></div>
           </div>

           <div className="overflow-hidden border border-gray-100 rounded-xl shadow-sm">
              <table className="w-full text-left border-collapse">
                 <thead className="bg-[#F9FAFB] border-b border-gray-100">
                    <tr>
                       <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Title</th>
                       <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest text-center">Language</th>
                       <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest text-right">Actions</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-gray-100">
                    {pages.map((row, idx) => (
                       <tr key={idx} className="hover:bg-gray-50/50 transition-all group">
                          <td className="px-6 py-5 text-sm font-semibold text-gray-700">{row.title}</td>
                          <td className="px-6 py-5 text-sm font-medium text-gray-500 text-center">
                             <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-100 text-[11px] font-bold text-gray-500 border border-gray-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                {row.language}
                             </span>
                          </td>
                          <td className="px-6 py-5 text-right">
                             <button className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-100 bg-white text-gray-400 hover:text-indigo-600 hover:border-indigo-100 hover:bg-indigo-50 transition-all shadow-sm">
                                <MoreVertical size={16} />
                             </button>
                          </td>
                       </tr>
                    ))}
                 </tbody>
              </table>
           </div>
        </div>

      </div>

    </div>
  );
};

export default HeaderFooter;
