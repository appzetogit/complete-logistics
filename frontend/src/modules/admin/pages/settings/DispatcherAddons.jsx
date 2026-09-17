
import React, { useState } from 'react';
import { 
  ChevronRight,
  Loader2,
  ExternalLink
} from 'lucide-react';
import toast from 'react-hot-toast';

const DispatcherAddons = () => {
  const [purchaseCode, setPurchaseCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleVerify = async (e) => {
    e.preventDefault();
    if (!purchaseCode.trim()) {
      return toast.error('Please enter a purchase code');
    }

    try {
      setSubmitting(true);
      // Simulate verification
      await new Promise(r => setTimeout(r, 1500));
      toast.error('Invalid purchase code. Please check and try again.');
    } catch (_error) {
      toast.error('Verification failed');
    } finally {
      setSubmitting(false);

    }
  };

  return (
    <div className="min-h-screen bg-[#F0F2F5] font-sans pb-20">
      
      {/* Header Area */}
      <div className="px-6 py-4 flex items-center justify-between border-b border-gray-200 bg-white shadow-sm shrink-0">
        <h1 className="text-[14px] font-black text-gray-700 uppercase tracking-tight">Dispatcher Addons</h1>
        <div className="flex items-center gap-2 text-[12px] font-medium text-gray-500">
           <span>Dispatcher Addons</span>
           <ChevronRight size={12} className="text-gray-300" />
           <span className="text-gray-400">Dispatcher Addons</span>
        </div>
      </div>

      <div className="p-8">
        
        {/* Main Card */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-10 min-h-[300px]">
           
           <div className="flex justify-end mb-8">
              <a 
                href="#" 
                onClick={(e) => { e.preventDefault(); toast('Help documentation is being updated') }}
                className="text-[13px] font-bold text-[#00A99D] underline underline-offset-4 hover:text-[#008f85] transition-all"
              >
                How It Works
              </a>
           </div>

           <form onSubmit={handleVerify} className="max-w-4xl">
              <div className="flex flex-col md:flex-row items-end gap-6">
                 <div className="flex-1 space-y-2">
                    <label className="block text-[11px] font-black text-gray-700 uppercase tracking-tight">
                       Purchase Code <span className="text-orange-500">*</span>
                    </label>
                    <input 
                       type="text"
                       value={purchaseCode}
                       onChange={(e) => setPurchaseCode(e.target.value)}
                       placeholder="Enter Purchase Code"
                       className="w-full border border-gray-200 rounded-md px-4 py-3 text-[14px] font-medium text-gray-600 outline-none focus:border-[#3F51B5] transition-all"
                    />
                 </div>
                 
                 <button 
                    type="submit"
                    disabled={submitting}
                    className="px-10 py-3.5 bg-[#4B5EAA] text-white rounded-md text-[12px] font-black uppercase tracking-widest hover:bg-[#3F51B5] shadow-lg shadow-indigo-100 transition-all flex items-center gap-2"
                 >
                    {submitting ? <Loader2 size={16} className="animate-spin" /> : 'Verify'}
                 </button>
              </div>
           </form>

        </div>
      </div>

    </div>
  );
};

export default DispatcherAddons;
