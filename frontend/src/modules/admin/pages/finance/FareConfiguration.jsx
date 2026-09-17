import React, { useState } from 'react';
import { 
  Save, 
  MapPin, 
  TrendingUp, 
  Clock, 
  Car, 
  Bike, 
  Truck, 
  Info, 
  AlertTriangle,
  History,
  ChevronDown,
  Layers,
  Settings,
  ChevronRight,
  ShieldCheck
} from 'lucide-react';

const VehiclePriceCard = ({ type, icon: Icon, base, perKm, commission, isActive, onClick }) => (
  <div 
    onClick={onClick}
    className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between h-32 ${
      isActive 
        ? 'bg-[#0F172A] border-transparent text-white shadow-xl shadow-gray-200' 
        : 'bg-white border-gray-100 text-gray-900 hover:border-gray-300'
    }`}
  >
    <div className="flex items-center justify-between">
       <div className={`p-2 rounded-lg ${isActive ? 'bg-white/10' : 'bg-gray-50 text-gray-400'}`}>
         <Icon size={20} />
       </div>
       {isActive && <div className="w-1.5 h-1.5 rounded-full bg-primary"></div>}
    </div>
    <div>
       <p className={`text-[10px] font-black uppercase tracking-widest leading-none mb-1.5 ${isActive ? 'text-gray-400' : 'text-gray-400'}`}>{type}</p>
       <div className="flex items-center justify-between">
          <span className="text-[14px] font-black tracking-tight">₹{base} Base</span>
          <span className={`text-[11px] font-bold ${isActive ? 'text-primary' : 'text-gray-400'}`}>₹{perKm}/km</span>
       </div>
    </div>
  </div>
);

const FareConfiguration = () => {
  const [selectedCity, setSelectedCity] = useState('Indore');
  const [selectedVehicle, setSelectedVehicle] = useState('Economy');
  
  const vehicleTypes = [
    { type: 'Economy', icon: Car, base: 50, perKm: 12, commission: 15 },
    { type: 'Luxury', icon: Car, base: 120, perKm: 25, commission: 20 },
    { type: 'Bike', icon: Bike, base: 20, perKm: 6, commission: 10 },
    { type: 'Auto', icon: Car, base: 30, perKm: 10, commission: 15 },
    { type: 'Truck', icon: Truck, base: 250, perKm: 45, commission: 12 },
  ];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 max-w-6xl mx-auto pb-20">
      {/* Header & City Selector */}
      <div className="flex items-center justify-between bg-white p-6 rounded-[28px] border border-gray-50 shadow-sm">
        <div className="flex items-center gap-6">
           <div className="flex items-center gap-2 cursor-pointer group">
              <div className="p-2.5 bg-primary/10 rounded-xl text-primary"><MapPin size={20} /></div>
              <div>
                 <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Operational City</p>
                 <div className="flex items-center gap-1">
                    <span className="text-xl font-black text-gray-900 tracking-tight">{selectedCity}</span>
                    <ChevronDown size={14} className="text-gray-400" />
                 </div>
              </div>
           </div>
           
           <div className="h-10 w-px bg-gray-100"></div>

           <div className="flex items-center gap-2">
              <div className="p-2.5 bg-gray-50 rounded-xl text-gray-400"><Layers size={20} /></div>
              <div>
                 <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Fare Tier</p>
                 <span className="text-sm font-bold text-gray-700">Standard Pricing</span>
              </div>
           </div>
        </div>

        <div className="flex gap-3">
           <button className="bg-gray-50 border border-gray-200 text-gray-600 px-6 py-2.5 rounded-xl text-[13px] font-black hover:bg-gray-100 transition-all flex items-center gap-2">
             <History size={18} /> VIEW HISTORY
           </button>
           <button className="bg-black text-white px-8 py-2.5 rounded-xl text-[13px] font-black hover:opacity-90 transition-all shadow-xl shadow-black/10 flex items-center gap-2">
             <Save size={18} /> UPDATING PRICING
           </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-8">
         {/* Left Side: Vehicle Type & Basic Configuration */}
         <div className="space-y-6">
            <h4 className="text-[11px] font-black text-gray-400 uppercase tracking-widest ml-1">Select Vehicle Category</h4>
            <div className="grid grid-cols-2 gap-3">
               {vehicleTypes.map((v, idx) => (
                  <VehiclePriceCard 
                    key={idx} 
                    {...v} 
                    isActive={selectedVehicle === v.type}
                    onClick={() => setSelectedVehicle(v.type)}
                  />
               ))}
            </div>

            <div className="bg-orange-50 border border-orange-100 p-6 rounded-[24px] space-y-3">
               <div className="flex items-center gap-2 text-orange-600">
                  <AlertTriangle size={18} />
                  <span className="text-[13px] font-black tracking-tight uppercase">Live Pricing Warning</span>
               </div>
               <p className="text-[12px] font-bold text-orange-800 leading-relaxed">
                  Changes made to {selectedVehicle} pricing will affect all ongoing booking calculations in {selectedCity} immediately after saving.
               </p>
            </div>
         </div>

         {/* Right Side: Detailed Input Grid */}
         <div className="col-span-2 space-y-6 bg-white rounded-[32px] border border-gray-100 p-8 shadow-sm">
            <div className="flex items-center justify-between mb-2">
               <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary"><Settings size={20} /></div>
                  <h3 className="text-xl font-black text-gray-900 tracking-tight">Pricing Engine: {selectedVehicle}</h3>
               </div>
               <span className="text-[10px] font-black text-green-500 bg-green-50 px-2 py-1 rounded tracking-widest uppercase">LATEST UPDATE: TODAY, 10:00 AM</span>
            </div>

            <div className="grid grid-cols-2 gap-x-8 gap-y-8 mt-10">
               {/* Base Fare Group */}
               <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5 mb-2.5">
                       Base Fare Amount <Info size={12} className="text-gray-300" />
                    </label>
                    <div className="relative">
                       <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₹</span>
                       <input type="number" defaultValue="50" className="w-full bg-gray-50 border-none rounded-2xl py-3.5 pl-10 pr-4 text-[15px] font-black text-gray-900 focus:ring-1 focus:ring-primary/20" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2.5 block">Included Distance (KM)</label>
                    <div className="relative">
                       <input type="number" defaultValue="2" className="w-full bg-gray-50 border-none rounded-2xl py-3.5 px-4 text-[15px] font-black text-gray-900 focus:ring-1 focus:ring-primary/20" />
                       <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-[12px]">KM</span>
                    </div>
                  </div>
               </div>

               {/* Unit Rates Group */}
               <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2.5 block">Price Per Kilometre</label>
                    <div className="relative">
                       <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₹</span>
                       <input type="number" defaultValue="14" className="w-full bg-gray-50 border-none rounded-2xl py-3.5 pl-10 pr-4 text-[15px] font-black text-gray-900 focus:ring-1 focus:ring-primary/20" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2.5 block">Price Per Minute (Wait Time)</label>
                    <div className="relative">
                       <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₹</span>
                       <input type="number" defaultValue="2" className="w-full bg-gray-50 border-none rounded-2xl py-3.5 pl-10 pr-4 text-[15px] font-black text-gray-900 focus:ring-1 focus:ring-primary/20" />
                    </div>
                  </div>
               </div>

               {/* Commission & Cancellations */}
               <div className="space-y-4">
                  <div className="p-5 bg-primary/5 rounded-2xl border border-primary/10">
                    <label className="text-[10px] font-black text-primary uppercase tracking-widest mb-2.5 block">Admin Commission (%)</label>
                    <div className="relative">
                       <input type="number" defaultValue="15" className="w-full bg-white border border-primary/20 rounded-xl py-2 px-4 text-[18px] font-black text-primary focus:ring-0" />
                       <span className="absolute right-4 top-1/2 -translate-y-1/2 text-primary font-black">%</span>
                    </div>
                  </div>
               </div>

               {/* Surge Settings Visual */}
               <div className="bg-gray-50 p-6 rounded-[24px] flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                     <span className="text-[12px] font-black text-gray-900 tracking-tight uppercase">Automatic Surge Pricing</span>
                     <div className="w-10 h-5 bg-green-500 rounded-full relative p-1 cursor-pointer">
                        <div className="w-3 h-3 bg-white rounded-full absolute right-1"></div>
                     </div>
                  </div>
                  <div className="flex items-center gap-4 mt-6">
                     <div className="flex-1">
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Current Multiplier</p>
                        <div className="flex items-center gap-2">
                           <TrendingUp size={16} className="text-primary" />
                           <span className="text-xl font-black text-gray-900">1.2x</span>
                        </div>
                     </div>
                     <button className="p-2 border border-gray-200 rounded-lg text-gray-400 hover:text-black">
                        <ChevronRight size={18} />
                     </button>
                  </div>
               </div>
            </div>

            {/* Bottom Special Charges Section */}
            <div className="mt-10 border-t border-gray-50 pt-10 flex gap-8">
               <div className="flex-1 space-y-4">
                  <h5 className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Night Operation Surcharge</h5>
                  <div className="flex items-center gap-6">
                     <div className="flex items-center gap-3">
                        <div className="p-2 bg-gray-50 rounded-lg text-gray-400"><Clock size={16} /></div>
                        <span className="text-[13px] font-bold text-gray-700">11:00 PM — 05:00 AM</span>
                     </div>
                     <div className="text-[14px] font-black text-gray-900 bg-gray-50 px-3 py-1 rounded-lg">
                        +20% FLAT
                     </div>
                  </div>
               </div>
               <div className="w-px bg-gray-50"></div>
               <div className="flex-1 flex items-center">
                  <div className="flex items-center gap-4 p-4 bg-green-50/50 border border-green-100 rounded-2xl w-full">
                     <div className="w-10 h-10 bg-green-500/10 rounded-full flex items-center justify-center text-green-600"><ShieldCheck size={20} /></div>
                     <div className="leading-tight">
                        <p className="text-[13px] font-black text-green-800 tracking-tight">Active Strategy</p>
                        <p className="text-[11px] font-bold text-green-600 mt-1">Growth-Optimized Pricing</p>
                     </div>
                  </div>
               </div>
            </div>
         </div>
      </div>
    </div>
  );
};

export default FareConfiguration;
