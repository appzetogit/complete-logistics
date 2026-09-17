import React, { useState, useEffect } from 'react';
import { 
  ChevronRight, 
  Save, 
  Loader2,
  Star,
  User,
  Plus,
  X,
  GripVertical
} from 'lucide-react';
import api from '../../../../shared/api/axiosInstance';
import toast from 'react-hot-toast';

const TipSettings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({
    enable_tips: "0",
    min_tip_amount: ""
  });
  
  // UI-only state for new features (backend doesn't support these natively yet)
  const [presets, setPresets] = useState([10, 20, 30, 50, 100]);
  const [allowCustom, setAllowCustom] = useState(true);
  const [newPreset, setNewPreset] = useState('');

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/general-settings/tip');
      setSettings(res.data?.settings || res.settings || { enable_tips: "0", min_tip_amount: "10" });
    } catch (err) {
      console.error('Fetch error:', err);
      toast.error('Failed to load tip configurations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleUpdate = async () => {
    try {
      setSaving(true);
      // We only save the fields the backend actually supports to prevent errors
      await api.patch('/admin/general-settings/tip', { 
        settings: {
          enable_tips: settings.enable_tips,
          min_tip_amount: settings.min_tip_amount
        }
      });
      toast.success('Settings updated successfully.', {
        style: { background: '#151515', color: '#fff' }
      });
    } catch (err) {
      console.error('Update settings failed:', err);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleAddPreset = () => {
    if (newPreset && !isNaN(newPreset)) {
      setPresets([...presets, parseInt(newPreset)].sort((a, b) => a - b));
      setNewPreset('');
    }
  };

  const handleRemovePreset = (valToRemove) => {
    setPresets(presets.filter(p => p !== valToRemove));
  };

  const isEnabled = settings.enable_tips === "1";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F6F8]">
        <Loader2 className="w-10 h-10 text-[#F4B400] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F6F8] p-4 sm:p-6 lg:p-8 font-sans pb-32">
      
      <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">
        
        {/* Header */}
        <div className="mb-8">
           <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 mb-2">
             <span>App Settings</span>
             <ChevronRight size={14} />
             <span className="text-[#151515]">Tip Settings</span>
           </div>
           
           <div className="flex items-center gap-4">
              <div className="w-1.5 h-8 bg-[#F4B400] rounded-full"></div>
              <div>
                 <h1 className="text-2xl font-bold text-[#151515]">Tip Settings</h1>
                 <p className="text-sm text-gray-500 mt-1">Configure how customers can reward drivers with optional tips after completing a ride.</p>
              </div>
           </div>
        </div>

        {/* Enable Driver Tips Card */}
        <div className={`bg-white rounded-2xl shadow-sm border-l-4 transition-all duration-300 ${isEnabled ? 'border-l-[#F4B400] border-t border-r border-b border-[#E5E7EB]' : 'border-[#E5E7EB]'}`}>
           <div className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
              <div>
                 <h3 className="text-lg font-bold text-[#151515] flex items-center gap-2">⭐ Driver Tips</h3>
                 <p className="text-sm text-gray-500 mt-1">Allow customers to reward drivers after ride completion.</p>
                 {!isEnabled && (
                   <p className="text-xs text-gray-400 mt-2 italic border-l-2 border-gray-300 pl-2">
                     Turning this off immediately hides Tip UI inside customer app.
                   </p>
                 )}
              </div>
              <button
                type="button"
                onClick={() => setSettings(s => ({ ...s, enable_tips: isEnabled ? "0" : "1" }))}
                className={`w-14 h-7 rounded-full relative transition-colors duration-300 shrink-0 focus:outline-none focus:ring-2 focus:ring-[#F4B400] focus:ring-offset-2 ${
                  isEnabled ? 'bg-[#F4B400]' : 'bg-gray-300'
                }`}
              >
                <div
                  className={`w-5 h-5 bg-white rounded-full absolute top-1 shadow-sm transition-all duration-300 ${
                    isEnabled ? 'left-8' : 'left-1'
                  }`}
                />
              </button>
           </div>
        </div>

        {/* Main Layout 2-Col */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">
           
           {/* Left Column (60%) */}
           <div className="lg:col-span-3 space-y-6">
              
              {/* Configuration Card */}
              <div className="bg-white rounded-[20px] shadow-sm border border-[#E5E7EB] border-l-4 border-l-[#F4B400] flex flex-col overflow-hidden transition-all duration-200 hover:shadow-md relative">
                 <div className="p-6">
                    <h3 className="text-lg font-bold text-[#151515]">Tip Configuration</h3>
                    <p className="text-sm text-gray-500 mt-1 mb-8">Configure minimum tip amount and available preset values.</p>
                    
                    {/* Minimum Tip Amount */}
                    <div className="space-y-2 mb-8">
                       <label className="text-sm font-semibold text-[#151515] block">Minimum Tip Amount</label>
                       <div className="flex items-stretch relative group">
                          <div className="w-12 bg-[#F5F6F8] border border-[#E5E7EB] border-r-0 rounded-l-lg flex items-center justify-center text-gray-500 font-bold group-focus-within:border-[#F4B400] transition-colors">
                             ₹
                          </div>
                          <input 
                            type="number"
                            value={settings.min_tip_amount || ''}
                            onChange={(e) => setSettings(s => ({ ...s, min_tip_amount: e.target.value }))}
                            placeholder="Example: 10"
                            className="flex-1 bg-white border border-[#E5E7EB] rounded-r-lg py-3 px-4 text-sm text-[#151515] font-medium focus:border-[#F4B400] focus:ring-1 focus:ring-[#F4B400] transition-all outline-none"
                          />
                       </div>
                       {!settings.min_tip_amount ? (
                         <p className="text-xs font-semibold text-red-500 mt-1">Minimum value is required.</p>
                       ) : (
                         <p className="text-xs text-gray-500 mt-1">Minimum value allowed for tipping.</p>
                       )}
                    </div>

                    {/* Preset Tip Amounts (UI-Only Mockup) */}
                    <div className="space-y-3 mb-8 pt-6 border-t border-gray-100">
                       <div className="flex justify-between items-end">
                         <div>
                           <h4 className="text-sm font-semibold text-[#151515]">Preset Tip Amounts</h4>
                           <p className="text-xs text-gray-500 mt-1">Quick selection chips for the user.</p>
                         </div>
                       </div>
                       
                       <div className="flex flex-wrap gap-3 mt-4">
                          {presets.map((p, idx) => (
                             <div key={idx} className="flex items-center gap-2 bg-[#F5F6F8] border border-[#E5E7EB] rounded-full pl-4 pr-1 py-1.5 group hover:border-gray-300 transition-colors">
                                <span className="text-sm font-bold text-[#151515]">₹{p}</span>
                                <button onClick={() => handleRemovePreset(p)} className="w-6 h-6 rounded-full bg-white flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors shadow-sm">
                                   <X size={12} />
                                </button>
                             </div>
                          ))}
                       </div>
                       
                       <div className="flex items-center gap-2 mt-4 max-w-xs">
                          <input 
                            type="number" 
                            value={newPreset}
                            onChange={(e) => setNewPreset(e.target.value)}
                            placeholder="Amount" 
                            className="w-24 bg-white border border-[#E5E7EB] rounded-lg py-2 px-3 text-sm focus:border-[#F4B400] outline-none" 
                          />
                          <button onClick={handleAddPreset} className="bg-gray-100 text-gray-700 px-3 py-2 rounded-lg text-sm font-semibold hover:bg-gray-200 transition-colors flex items-center gap-1">
                             <Plus size={14} /> Add
                          </button>
                       </div>
                    </div>

                    {/* Custom Tip Amount */}
                    <div className="pt-6 border-t border-gray-100 flex items-center justify-between">
                       <div>
                          <h4 className="text-sm font-semibold text-[#151515]">Allow Custom Tip Amount</h4>
                          <p className="text-xs text-gray-500 mt-1">Customers can enter their own custom amount.</p>
                       </div>
                       <button
                         type="button"
                         onClick={() => setAllowCustom(!allowCustom)}
                         className={`w-12 h-6 rounded-full relative transition-colors duration-300 shrink-0 ${
                           allowCustom ? 'bg-[#F4B400]' : 'bg-gray-300'
                         }`}
                       >
                         <div className={`w-4 h-4 bg-white rounded-full absolute top-1 shadow-sm transition-all duration-300 ${allowCustom ? 'left-7' : 'left-1'}`} />
                       </button>
                    </div>

                 </div>

                 {/* Sticky Save Footer inside Card */}
                 <div className="sticky bottom-0 bg-gray-50 border-t border-gray-100 p-6 flex justify-end z-10">
                    <button 
                      onClick={handleUpdate}
                      disabled={saving}
                      className="bg-[#F4B400] text-[#151515] px-8 py-3 rounded-xl text-sm font-bold shadow-md flex items-center gap-2 hover:bg-[#E0A800] hover:shadow-lg active:scale-95 transition-all disabled:opacity-50"
                    >
                      {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                      {saving ? 'Saving...' : 'Save Settings'}
                    </button>
                 </div>
              </div>

              {/* Help Section */}
              <div className="bg-[#F5F6F8] rounded-[20px] p-6 border border-[#E5E7EB] transition-all duration-200 hover:shadow-sm">
                 <h4 className="text-sm font-bold text-[#151515] mb-3">How Driver Tips Work</h4>
                 <ul className="space-y-2 text-sm text-gray-600">
                    <li className="flex items-start gap-2">
                       <span className="text-[#F4B400] mt-1">•</span> Tips are strictly optional for the customer.
                    </li>
                    <li className="flex items-start gap-2">
                       <span className="text-[#F4B400] mt-1">•</span> Tips are transferred directly to driver earnings.
                    </li>
                    <li className="flex items-start gap-2">
                       <span className="text-[#F4B400] mt-1">•</span> Customers can skip tipping entirely.
                    </li>
                    <li className="flex items-start gap-2">
                       <span className="text-[#F4B400] mt-1">•</span> Minimum amount is controlled via this panel.
                    </li>
                    <li className="flex items-start gap-2">
                       <span className="text-[#F4B400] mt-1">•</span> Driver tips do not affect base fare calculation.
                    </li>
                 </ul>
              </div>

           </div>

           {/* Right Column (40%) - Sticky Preview */}
           <div className="lg:col-span-2 relative hidden md:block">
              <div className="sticky top-8 flex justify-center items-start pt-4">
                 
                 {/* Scaled down preview container */}
                 <div className="transform scale-[0.65] origin-top">
                    <div className="w-[375px] h-[812px] bg-[#F5F6F8] rounded-[60px] shadow-2xl border-[12px] border-[#151515] flex flex-col relative overflow-hidden ring-4 ring-gray-100">
                       
                       {/* Phone Notch/Header */}
                       <div className="absolute top-0 inset-x-0 h-7 flex justify-center z-20">
                          <div className="w-40 h-7 bg-[#151515] rounded-b-3xl"></div>
                       </div>
                       
                       {/* App Header */}
                       <div className="pt-12 pb-4 px-6 bg-white flex items-center justify-center border-b border-gray-100 z-10 shadow-sm">
                           <span className="text-[#151515] text-sm font-bold tracking-wide">Trip Summary</span>
                       </div>

                       <div className="flex-grow bg-[#F5F6F8] p-6 relative flex flex-col">
                           {/* Driver Info Fake Layout */}
                           <div className="bg-white p-4 rounded-2xl shadow-sm mb-6 flex items-center justify-between border border-gray-100">
                              <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 overflow-hidden">
                                   <User size={24} />
                                </div>
                                <div>
                                   <h4 className="text-sm font-bold text-[#151515]">Driver Name</h4>
                                   <div className="flex items-center gap-1 text-[#F4B400] mt-1">
                                      <Star size={12} fill="currentColor" />
                                      <Star size={12} fill="currentColor" />
                                      <Star size={12} fill="currentColor" />
                                      <Star size={12} fill="currentColor" />
                                      <Star size={12} fill="currentColor" />
                                   </div>
                                </div>
                              </div>
                              <div className="text-right">
                                 <p className="text-xs text-gray-400 font-semibold uppercase">Fare</p>
                                 <p className="text-lg font-bold text-[#151515]">₹550</p>
                              </div>
                           </div>

                           {/* Map/Path Mock */}
                           <div className="flex-1 rounded-2xl border-2 border-dashed border-gray-200 mb-6 flex items-center justify-center opacity-50">
                              <span className="text-gray-400 font-bold text-sm uppercase tracking-widest">Map View</span>
                           </div>

                           {/* Dimmed Overlay simulating Tip Modal pop-up */}
                           <div className="absolute inset-0 bg-black/40 z-20 flex flex-col justify-end">
                               
                               {/* Tip Modal Card */}
                               <div className="bg-white rounded-t-[32px] p-8 space-y-6 shadow-2xl animate-in slide-in-from-bottom-8 duration-500">
                                  
                                  <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-2"></div>
                                  
                                  <div className="text-center space-y-1">
                                     <h3 className="text-lg font-black text-[#151515]">Add a Tip?</h3>
                                     <p className="text-sm text-gray-500">Show appreciation to your driver</p>
                                  </div>

                                  {/* Tip Chips */}
                                  <div className="flex justify-center gap-3">
                                      {presets.slice(0, 4).map((val, i) => (
                                         <div key={val} className={`w-[70px] py-3 rounded-xl text-center text-sm font-bold shadow-sm transition-colors cursor-pointer border ${i === 1 ? 'bg-[#F4B400] border-[#F4B400] text-[#151515]' : 'bg-white border-gray-200 text-gray-600 hover:border-[#F4B400]'}`}>
                                            ₹{val}
                                         </div>
                                      ))}
                                  </div>
                                  
                                  {allowCustom && (
                                     <div className="text-center">
                                        <span className="text-sm font-bold text-gray-400 hover:text-[#F4B400] cursor-pointer underline underline-offset-4 decoration-2 decoration-gray-200">Enter custom amount</span>
                                     </div>
                                  )}

                                  <div className="flex gap-4 pt-2">
                                     <button className="flex-1 border-2 border-gray-200 text-gray-600 font-bold py-4 rounded-2xl text-sm hover:bg-gray-50 transition-colors">Cancel</button>
                                     <button className="flex-1 bg-[#F4B400] text-[#151515] font-bold py-4 rounded-2xl text-sm shadow-lg shadow-yellow-500/20 hover:bg-[#e0a800] transition-colors">Add Tip</button>
                                  </div>
                               </div>
                           </div>
                       </div>
                       
                       {/* Home Indicator */}
                       <div className="absolute bottom-2 inset-x-0 flex justify-center z-30">
                          <div className="w-32 h-1.5 bg-[#151515] rounded-full opacity-20"></div>
                       </div>
                    </div>
                 </div>

              </div>
           </div>

        </div>
      </div>
    </div>
  );
};

export default TipSettings;
