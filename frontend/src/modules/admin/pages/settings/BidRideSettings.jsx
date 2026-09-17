import React, { useState, useEffect } from 'react';
import { 
  ChevronRight, 
  Save, 
  Loader2,
  ChevronUp,
  Info,
  X
} from 'lucide-react';
import api from '../../../../shared/api/axiosInstance';
import toast from 'react-hot-toast';

const SectionHeader = ({ title }) => (
  <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3 bg-gray-50/30">
    <div className="w-1 h-5 bg-yellow-400 rounded-full"></div>
    <h3 className="text-[13px] font-bold text-gray-800">{title}</h3>
  </div>
);

const InputField = ({ label, name, value, onChange, placeholder, type = "text", helpLink, prefix, onHelpClick }) => (
  <div className="space-y-1.5 w-full">
    <div className="flex items-center justify-between mb-1">
       <label className="text-sm font-medium text-gray-700 block ml-0.5">
         {label} {helpLink && <span className="text-red-500">*</span>}
       </label>
       {helpLink && (
         <button type="button" onClick={() => onHelpClick(label)} className="text-yellow-600 text-xs font-semibold hover:underline flex items-center gap-1">
            How it works <Info size={12} />
         </button>
       )}
    </div>
    <div className="relative group flex items-stretch">
       {prefix && (
         <div className="w-10 bg-gray-50 border border-gray-200 border-r-0 rounded-l-lg flex items-center justify-center text-gray-500 font-semibold group-focus-within:border-yellow-400 transition-colors shrink-0">
            {prefix}
         </div>
       )}
       <input
         type={type}
         name={name}
         value={value || ''}
         onChange={(e) => onChange(name, e.target.value)}
         placeholder={placeholder}
         className={`flex-1 w-full bg-white border border-gray-200 ${prefix ? 'rounded-r-lg' : 'rounded-lg'} py-2.5 px-4 text-sm text-gray-900 focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 transition-all outline-none shadow-sm`}
       />
    </div>
  </div>
);

const PreviewBox = ({ label }) => (
  <div className="w-full h-full flex flex-col items-center justify-center p-6 bg-gray-50/50 border-l border-gray-100 relative overflow-hidden hidden lg:flex">
     <div className="mb-4 z-10">
        <span className="text-xs font-semibold text-gray-600 bg-white border border-gray-200 px-3 py-1.5 rounded-full shadow-sm">{label} preview</span>
     </div>
     <div className="w-[240px] bg-white rounded-[32px] shadow-xl p-4 border-[6px] border-black aspect-[9/16] relative transition-transform hover:scale-[1.02] duration-300">
        <div className="w-16 h-1 bg-gray-200 rounded-full mx-auto mb-6"></div>
        
        <div className="mb-4">
           <p className="text-[10px] font-bold text-gray-500 mb-1 uppercase tracking-wider">SUV (Bid)</p>
           <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-yellow-400"></div>
              <div className="h-1 bg-gray-100 rounded-full flex-1"></div>
           </div>
           <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-black"></div>
              <div className="h-1 bg-gray-100 rounded-full flex-1"></div>
           </div>
        </div>

        <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-200 mb-4">
           <h4 className="text-xs font-bold text-gray-900 mb-1">Offer your fare</h4>
           <p className="text-[9px] text-gray-500 mb-3 italic">Recommended fare: $ 150.00</p>
           <div className="flex items-center justify-between gap-1 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gray-200 text-black flex items-center justify-center font-bold text-xs">-10</div>
              <div className="flex-1 bg-white border border-gray-200 rounded-lg flex items-center justify-center font-bold text-black py-1.5 text-sm shadow-sm">150</div>
              <div className="w-8 h-8 rounded-lg bg-gray-200 text-black flex items-center justify-center font-bold text-xs">+10</div>
           </div>
           <div className="w-full bg-yellow-400 text-black py-2 rounded-lg font-bold text-xs shadow-sm">Create request</div>
        </div>
        
        <div className="absolute bottom-3 left-0 right-0 flex justify-center">
           <div className="w-20 h-1 rounded-full bg-gray-200"></div>
        </div>
     </div>
  </div>
);

const BidRideSettings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({});
  const [infoModal, setInfoModal] = useState({ open: false, title: '', content: '' });

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/general-settings/bid-ride');
      setSettings(res.data?.settings || {});
    } catch (err) {
      console.error('Fetch error:', err);
      toast.error('Failed to load bidding parameters');
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
      await api.patch('/admin/general-settings/bid-ride', { settings });
      toast.success('Bidding logic updated successfully!');
    } catch (err) {
      console.error('Update error:', err);
      toast.error('Failed to save bidding parameters');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (name, value) => {
    setSettings(prev => ({ ...prev, [name]: value }));
  };

  const openInfoModal = (label) => {
    let content = "This setting configures the bidding parameters for the ride.";
    if (label.includes("Low Percentage")) content = "Sets the minimum percentage below the recommended fare that can be offered.";
    if (label.includes("High Percentage")) content = "Sets the maximum percentage above the recommended fare that can be offered.";
    if (label.includes("Increase Step") || label.includes("Increase or Decrease")) content = "The increment or decrement step amount when adjusting the bid.";
    if (label.includes("Wait Time")) content = "How long a user must wait before they can increase their offer to find drivers.";
    
    setInfoModal({ open: true, title: label, content });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-yellow-500 animate-spin" />
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Loading Bid Settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8 font-sans pb-32">
      <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-700">
        
        {/* Header Breadcrumb */}
        <div className="flex items-center justify-end mb-2">
           <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
             <span>Business Settings</span>
             <ChevronRight size={14} />
             <span className="text-gray-900">Bid Ride Settings</span>
           </div>
        </div>

        {/* Driver Section */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col lg:flex-row">
           <div className="flex-1 flex flex-col justify-between">
              <div>
                 <SectionHeader title="Driver settings" />
                 <div className="p-6 space-y-6">
                    <InputField 
                       label="Driver Bidding Low Percentage (Least Bid Level)" 
                       name="bidding_low_percentage" 
                       value={settings.bidding_low_percentage} 
                       onChange={handleChange} 
                       type="number" 
                       prefix="%"
                       helpLink
                       onHelpClick={openInfoModal}
                    />
                    <InputField 
                       label="Driver Bidding High Percentage (Highest Bid Level)" 
                       name="bidding_high_percentage" 
                       value={settings.bidding_high_percentage} 
                       onChange={handleChange} 
                       type="number" 
                       prefix="%"
                       helpLink
                       onHelpClick={openInfoModal}
                    />
                    <InputField 
                       label="Driver Bid Range From Recommended Price" 
                       name="bidding_amount_increase_or_decrease" 
                       value={settings.bidding_amount_increase_or_decrease} 
                       onChange={handleChange} 
                       type="number" 
                       helpLink
                       onHelpClick={openInfoModal}
                    />
                 </div>
              </div>
              <div className="px-6 py-5 bg-gray-50/50 border-t border-gray-100 flex justify-end">
                 <button 
                  onClick={handleUpdate}
                  disabled={saving}
                  className="bg-yellow-400 text-black px-6 py-2.5 rounded-lg text-sm font-semibold shadow-sm flex items-center gap-2 hover:bg-yellow-500 active:scale-95 transition-all disabled:opacity-50"
                 >
                   {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                   Update Driver Settings
                 </button>
              </div>
           </div>
           <div className="lg:w-[350px]">
              <PreviewBox label="Driver app" />
           </div>
        </div>

        {/* User Section */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col lg:flex-row">
           <div className="flex-1 flex flex-col justify-between">
              <div>
                 <SectionHeader title="User settings" />
                 <div className="p-6 space-y-6">
                    <InputField 
                       label="User Fare Low Percentage (Starting Level)" 
                       name="user_bidding_low_percentage" 
                       value={settings.user_bidding_low_percentage} 
                       onChange={handleChange} 
                       type="number" 
                       prefix="%"
                       helpLink
                       onHelpClick={openInfoModal}
                    />
                    <InputField 
                       label="User Fare High Percentage (Highest Level)" 
                       name="user_bidding_high_percentage" 
                       value={settings.user_bidding_high_percentage} 
                       onChange={handleChange} 
                       type="number" 
                       prefix="%"
                       helpLink
                       onHelpClick={openInfoModal}
                    />
                    <InputField 
                       label="User Fare Increase Step From Recommended Price" 
                       name="user_bidding_amount_increase_or_decrease" 
                       value={settings.user_bidding_amount_increase_or_decrease} 
                       onChange={handleChange} 
                       type="number" 
                       helpLink
                       onHelpClick={openInfoModal}
                    />
                    <InputField 
                       label="Wait Time Before User Can Increase Fare (Minutes)" 
                       name="user_fare_increase_wait_minutes" 
                       value={settings.user_fare_increase_wait_minutes} 
                       onChange={handleChange} 
                       type="number" 
                       helpLink
                       onHelpClick={openInfoModal}
                    />
                 </div>
              </div>
              <div className="px-6 py-5 bg-gray-50/50 border-t border-gray-100 flex justify-end">
                 <button 
                  onClick={handleUpdate}
                  disabled={saving}
                  className="bg-yellow-400 text-black px-6 py-2.5 rounded-lg text-sm font-semibold shadow-sm flex items-center gap-2 hover:bg-yellow-500 active:scale-95 transition-all disabled:opacity-50"
                 >
                   {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                   Update User Settings
                 </button>
              </div>
           </div>
           <div className="lg:w-[350px]">
              <PreviewBox label="User app" />
           </div>
        </div>

      </div>

      <button
         onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
         className="fixed bottom-10 right-10 bg-white text-black border border-gray-200 w-12 h-12 rounded-full flex items-center justify-center shadow-md hover:bg-yellow-50 transition-all z-40 hover:-translate-y-1"
      >
         <ChevronUp size={20} />
      </button>

      {/* Info Modal */}
      {infoModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-sm overflow-hidden">
             <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                <div className="flex items-center gap-2 text-yellow-600">
                   <Info size={18} />
                   <h4 className="text-sm font-bold text-gray-900">How it works</h4>
                </div>
                <button onClick={() => setInfoModal({ open: false, title: '', content: '' })} className="text-gray-400 hover:text-gray-700">
                   <X size={18} />
                </button>
             </div>
             <div className="p-5">
                <h5 className="text-xs font-semibold text-gray-500 mb-2">{infoModal.title}</h5>
                <p className="text-sm text-gray-700 leading-relaxed">{infoModal.content}</p>
             </div>
             <div className="px-5 py-4 border-t border-gray-100 bg-gray-50/50 flex justify-end">
                <button onClick={() => setInfoModal({ open: false, title: '', content: '' })} className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-50 transition-colors">
                   Close
                </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BidRideSettings;
