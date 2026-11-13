import React, { useState, useEffect } from 'react';
import { 
  ChevronRight, 
  Save, 
  Loader2,
  ChevronUp
} from 'lucide-react';
import api from '../../../../shared/api/axiosInstance';
import toast from 'react-hot-toast';

const InputField = ({ label, name, value, onChange, placeholder, type = "text" }) => (
  <div className="space-y-1.5 w-full">
    <label className="text-sm font-medium text-gray-700 block ml-0.5">
      {label}
    </label>
    <input
      type={type}
      name={name}
      value={value || ''}
      onChange={(e) => onChange(name, e.target.value)}
      placeholder={placeholder}
      className="w-full bg-white border border-gray-200 rounded-lg py-2.5 px-4 text-sm text-gray-900 focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 transition-all outline-none shadow-sm"
    />
  </div>
);

// Same rules the backend enforces: min > 0, max >= min, default inside min..max.
const validateRadius = (s) => {
  const min = Number(s.driver_min_search_radius ?? '2');
  const max = Number(s.driver_max_search_radius ?? '15');
  const def = Number(s.driver_search_radius);

  if (!Number.isFinite(min) || min <= 0) return 'Minimum radius must be greater than 0';
  if (!Number.isFinite(max) || max < min) return 'Maximum radius must be greater than or equal to the minimum radius';
  if (!Number.isFinite(def) || def <= 0) return 'Default radius must be greater than 0';
  if (def < min || def > max) return `Default radius must be between the minimum (${min}) and maximum (${max}) radius`;
  return '';
};

const TransportRideSettings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({});

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/general-settings/transport-ride');
      setSettings(res.data?.settings || res.settings || {});
    } catch (err) {
      console.error('Fetch error:', err);
      toast.error('Failed to load transport parameters');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const radiusError = validateRadius(settings);
  const customRadiusOn = String(settings.allow_driver_custom_search_radius ?? '0') === '1';

  const handleUpdate = async () => {
    if (radiusError) {
      toast.error(radiusError);
      return;
    }

    try {
      setSaving(true);
      await api.patch('/admin/general-settings/transport-ride', { settings });
      toast.success('Transport settings updated successfully!');
    } catch (err) {
      console.error('Update error:', err);
      toast.error(err?.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (name, value) => {
    setSettings(prev => ({ ...prev, [name]: value }));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-yellow-500 animate-spin" />
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Loading Settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8 font-sans pb-32">
      <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-700">
        
        {/* Header Breadcrumb */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-end gap-4">
           <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
             <span>Transport Ride Settings</span>
             <ChevronRight size={14} />
             <span className="text-gray-900">Transport Ride Settings</span>
           </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
           <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3 bg-gray-50/30">
              <div className="w-1 h-5 bg-yellow-400 rounded-full"></div>
              <h3 className="text-[13px] font-bold text-gray-700 uppercase tracking-tight">Transport Ride Settings</h3>
           </div>
           
           <div className="p-6 pb-8">
             <div className="mb-8 rounded-xl border border-gray-200 bg-gray-50/50 px-5 py-4">
               <p className="text-sm font-semibold text-gray-900">Regular ride search behavior is controlled from this page.</p>
               <p className="mt-1 text-sm text-gray-500">
                 Only the settings below are currently wired into the live dispatch flow.
               </p>
             </div>
             
             <div className="mb-8 rounded-xl border border-gray-200 overflow-hidden">
               <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3 bg-gray-50/60">
                 <div className="w-1 h-5 bg-yellow-400 rounded-full"></div>
                 <h4 className="text-[13px] font-bold text-gray-700 uppercase tracking-tight">Driver Search Radius</h4>
               </div>
               <div className="p-5 space-y-5">
                 <p className="text-sm text-gray-500">
                   The default radius applies to every driver. When custom radius is on, each driver can choose their own
                   radius between the minimum and maximum below. A driver without a valid choice, and every driver while
                   custom radius is off, uses the default radius.
                 </p>

                 <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                   <InputField
                      label="Default Radius (km)"
                      name="driver_search_radius"
                      value={settings.driver_search_radius}
                      onChange={handleChange}
                      type="number"
                   />
                   <InputField
                      label="Minimum Radius (km)"
                      name="driver_min_search_radius"
                      value={settings.driver_min_search_radius ?? '2'}
                      onChange={handleChange}
                      type="number"
                   />
                   <InputField
                      label="Maximum Radius (km)"
                      name="driver_max_search_radius"
                      value={settings.driver_max_search_radius ?? '15'}
                      onChange={handleChange}
                      type="number"
                   />
                 </div>

                 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50/50 px-4 py-3">
                   <div>
                     <p className="text-sm font-semibold text-gray-900">Enable Driver Custom Radius</p>
                     <p className="text-xs text-gray-500 mt-0.5">
                       {customRadiusOn
                         ? 'On: drivers can set their own radius within the limits. Saved choices outside the limits are ignored until the driver picks a valid one.'
                         : 'Off: all drivers use the default radius. Choices drivers saved earlier are kept and apply again when this is switched on.'}
                     </p>
                   </div>
                   <button
                     type="button"
                     role="switch"
                     aria-checked={customRadiusOn}
                     onClick={() => handleChange('allow_driver_custom_search_radius', customRadiusOn ? '0' : '1')}
                     className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${customRadiusOn ? 'bg-yellow-400' : 'bg-gray-300'}`}
                   >
                     <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${customRadiusOn ? 'translate-x-5' : 'translate-x-0.5'}`} />
                   </button>
                 </div>

                 {radiusError ? (
                   <p role="alert" className="text-sm font-medium text-red-600">{radiusError}</p>
                 ) : (
                   <p className="text-xs text-gray-500">
                     Drivers can choose between {Number(settings.driver_min_search_radius ?? '2')} and {Number(settings.driver_max_search_radius ?? '15')} km
                     {customRadiusOn ? '' : ' (when custom radius is on)'}. Default: {Number(settings.driver_search_radius)} km.
                   </p>
                 )}
               </div>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-6">
                {/* Left Column */}
                <div className="space-y-6">
                   <div className="space-y-1.5">
                      <label className="text-sm font-medium text-gray-700 block ml-0.5">Trip Dispatch Type</label>
                      <select 
                       value={settings.trip_dispatch_type || '1'} 
                       onChange={(e) => handleChange('trip_dispatch_type', e.target.value)}
                       className="w-full bg-white border border-gray-200 rounded-lg py-2.5 px-4 text-sm text-gray-900 focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 transition-all outline-none shadow-sm"
                      >
                         <option value="1">One By One</option>
                         <option value="2">Broadcast</option>
                      </select>
                   </div>

                   <InputField 
                      label="Maximum Time For Find Drivers For Regular Ride" 
                      name="maximum_time_for_find_drivers_for_regular_ride" 
                      value={settings.maximum_time_for_find_drivers_for_regular_ride} 
                      onChange={handleChange} 
                      type="number" 
                   />

                   <InputField 
                      label="Trip Accept/Reject Duration For Driver in Seconds" 
                      name="trip_accept_reject_duration_for_driver" 
                      value={settings.trip_accept_reject_duration_for_driver} 
                      onChange={handleChange} 
                      type="number" 
                   />
                </div>

                {/* Right Column */}
                <div className="space-y-6">
                   <InputField 
                      label="Arrival Radius at Pickup in Meters (0 = off)" 
                      name="arrival_radius_meters" 
                      value={settings.arrival_radius_meters ?? '200'} 
                      onChange={handleChange} 
                      type="number" 
                   />

                   <InputField 
                      label="Arrival Radius at Drop in Meters (0 = off)" 
                      name="drop_radius_meters" 
                      value={settings.drop_radius_meters ?? '300'} 
                      onChange={handleChange} 
                      type="number" 
                   />

                   <div className="space-y-1.5">
                      <label className="text-sm font-medium text-gray-700 block ml-0.5">Start Trip Needs Rider OTP</label>
                      <select
                       value={settings.start_trip_otp_required ?? '1'}
                       onChange={(e) => handleChange('start_trip_otp_required', e.target.value)}
                       className="w-full bg-white border border-gray-200 rounded-lg py-2.5 px-4 text-sm text-gray-900 focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 transition-all outline-none shadow-sm"
                      >
                         <option value="1">Yes (recommended)</option>
                         <option value="0">No</option>
                      </select>
                   </div>

                   <div className="space-y-1.5">
                      <label className="text-sm font-medium text-gray-700 block ml-0.5">When the Driver's Location Is Unknown</label>
                      <select
                       value={settings.status_location_required ?? '1'}
                       onChange={(e) => handleChange('status_location_required', e.target.value)}
                       className="w-full bg-white border border-gray-200 rounded-lg py-2.5 px-4 text-sm text-gray-900 focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 transition-all outline-none shadow-sm"
                      >
                         <option value="1">Refuse arrival steps (recommended)</option>
                         <option value="0">Allow them</option>
                      </select>
                   </div>

                   <div className="space-y-1.5">
                      <label className="text-sm font-medium text-gray-700 block ml-0.5">Goods Advance Refund Goes To</label>
                      <select
                       value={settings.goods_advance_refund_to ?? 'refund_wallet'}
                       onChange={(e) => handleChange('goods_advance_refund_to', e.target.value)}
                       className="w-full bg-white border border-gray-200 rounded-lg py-2.5 px-4 text-sm text-gray-900 focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 transition-all outline-none shadow-sm"
                      >
                         <option value="wallet">Rider wallet (spendable)</option>
                         <option value="refund_wallet">Refund wallet (rider moves it)</option>
                         <option value="source">Back to the original payment</option>
                      </select>
                   </div>

                   <InputField 
                      label="Goods Advance Kept When Rider Cancels (% of fare, 0 = refund all)" 
                      name="goods_advance_cancel_keep_percent" 
                      value={settings.goods_advance_cancel_keep_percent ?? '15'} 
                      onChange={handleChange} 
                      type="number" 
                   />

                   <div className="space-y-1.5">
                      <label className="text-sm font-medium text-gray-700 block ml-0.5">Driver Cancel Compensation Goes To</label>
                      <select
                       value={settings.driver_cancel_compensation_to ?? 'wallet'}
                       onChange={(e) => handleChange('driver_cancel_compensation_to', e.target.value)}
                       className="w-full bg-white border border-gray-200 rounded-lg py-2.5 px-4 text-sm text-gray-900 focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 transition-all outline-none shadow-sm"
                      >
                         <option value="wallet">Rider wallet (spendable)</option>
                         <option value="refund_wallet">Refund wallet (rider moves it)</option>
                      </select>
                   </div>

                   <div className="space-y-1.5">
                      <label className="text-sm font-medium text-gray-700 block ml-0.5">Pay Driver For Unpaid Online Rides After (hours)</label>
                      <input
                       type="number"
                       min="0"
                       value={settings.unpaid_online_cover_hours ?? '24'}
                       onChange={(e) => handleChange('unpaid_online_cover_hours', e.target.value)}
                       className="w-full bg-white border border-gray-200 rounded-lg py-2.5 px-4 text-sm text-gray-900 focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 transition-all outline-none shadow-sm"
                      />
                      <p className="text-xs text-gray-500 ml-0.5">
                         If a rider booked online and still has not paid this long after the trip, the platform pays the
                         driver the fare (the rider still owes it). 0 = never.
                      </p>
                   </div>

                   <div className="space-y-1.5">
                      <label className="text-sm font-medium text-gray-700 block ml-0.5">Require Admin Approval to End Rental</label>
                      <select 
                       value={settings.require_admin_approval_to_end_rental || '0'} 
                       onChange={(e) => handleChange('require_admin_approval_to_end_rental', e.target.value)}
                       className="w-full bg-white border border-gray-200 rounded-lg py-2.5 px-4 text-sm text-gray-900 focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 transition-all outline-none shadow-sm"
                      >
                         <option value="0">No (Auto-complete ride)</option>
                         <option value="1">Yes (Awaiting confirmation)</option>
                      </select>
                   </div>
                </div>
             </div>

             <div className="mt-10 flex justify-end pt-6 border-t border-gray-100">
                <button 
                  onClick={handleUpdate}
                  disabled={saving || Boolean(radiusError)}
                  className="bg-yellow-400 text-black px-8 py-2.5 rounded-lg text-sm font-semibold shadow-sm flex items-center gap-2 hover:bg-yellow-500 active:scale-95 transition-all disabled:opacity-50"
                >
                  {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                  {saving ? 'Saving...' : 'Update Settings'}
                </button>
             </div>
           </div>
        </div>
      </div>

      {/* Floating Scroll Top */}
      <button
         onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
         className="fixed bottom-10 right-10 bg-white text-gray-600 border border-gray-200 w-12 h-12 rounded-full flex items-center justify-center shadow-md hover:bg-gray-50 hover:text-black transition-all z-50 hover:-translate-y-1"
      >
         <ChevronUp size={20} />
      </button>
    </div>
  );
};

export default TransportRideSettings;
