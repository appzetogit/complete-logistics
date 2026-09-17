import React, { useState, useEffect } from 'react';
import { 
  Zap, 
  ChevronRight, 
  X,
  Clock,
  ChevronDown,
  Info,
  ArrowLeft,
  Loader2,
  MapPin,
  Car,
  Type,
  FileText,
  IndianRupee,
  Plus,
  Save
} from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { adminService } from '../../services/adminService';
import toast from 'react-hot-toast';

const DriverSubscriptionCreate = () => {
  const navigate = useNavigate();
  const [transportTypes, setTransportTypes] = useState([
    { transport_type: 'taxi', label: 'Taxi' },
    { transport_type: 'delivery', label: 'Delivery' },
    { transport_type: 'all', label: 'All' }
  ]);
  const [vehicleTypes, setVehicleTypes] = useState([]);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    amount: '',
    transport_type: '',
    vehicle_type_id: '',
    duration: '',
    how_it_works: '',
  });
  const [saving, setSaving] = useState(false);

  const inputClass = "w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-800 bg-white focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 outline-none transition-colors";
  const labelClass = "block text-xs font-semibold text-gray-500 mb-1.5";

  useEffect(() => {
    const fetchVehicles = async () => {
      if (!formData.transport_type) {
        setVehicleTypes([]);
        return;
      }
      try {
        const typeFilter = formData.transport_type.toLowerCase();
        const json = await adminService.getVehicleTypes(typeFilter === 'all' ? '' : typeFilter);
        if (json.success) {
           setVehicleTypes(Array.isArray(json.data) ? json.data : (json.data?.results || []));
        }
      } catch (e) { console.error(e); }
    };
    fetchVehicles();
  }, [formData.transport_type]);

  const handleSave = async () => {
    if (!formData.name || !formData.amount || !formData.duration) {
      toast.error("Please fill all required fields");
      return;
    }
    setSaving(true);
    try {
      const data = await adminService.createSubscriptionPlan(formData);
      if (data.success) {
        toast.success("Subscription plan created successfully");
        navigate('/admin/drivers/subscription');
      } else {
        toast.error(data.message || "Failed to save subscription");
      }
    } catch (err) {
      toast.error(err.message || "Failed to save subscription");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6 lg:p-8">
      {/* HEADER */}
      <div className="mb-6">
        <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-2">
          <span>Drivers</span>
          <ChevronRight size={12} />
          <Link to="/admin/drivers/subscription" className="hover:text-gray-700">Subscription</Link>
          <ChevronRight size={12} />
          <span className="text-gray-700 uppercase font-medium">Create</span>
        </div>
        <div className="flex items-center justify-between">
          <h1 className="text-xl text-gray-900 font-bold">Create Subscription</h1>
          <button 
            onClick={() => navigate('/admin/drivers/subscription')}
            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
          >
            <ArrowLeft size={16} /> Back
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
              <div className="w-9 h-9 rounded-lg bg-yellow-100 flex items-center justify-center text-yellow-600">
                <Zap size={18} />
              </div>
              <div>
                <h3 className="text-sm text-gray-900 font-bold">Subscription Details</h3>
                <p className="text-xs text-gray-400">Configure your new subscription plan</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="col-span-2">
                <label className={labelClass}>
                  <Info size={12} className="inline mr-1 text-gray-400" />
                  How It Works *
                </label>
                <textarea 
                  value={formData.how_it_works}
                  onChange={(e) => setFormData({...formData, how_it_works: e.target.value})}
                  placeholder="Describe how this subscription works..."
                  className={`${inputClass} min-h-[80px] resize-none`}
                />
              </div>

              <div>
                <label className={labelClass}>
                  <Type size={12} className="inline mr-1 text-gray-400" />
                  Transport Type
                </label>
                <select 
                  value={formData.transport_type}
                  onChange={(e) => setFormData({...formData, transport_type: e.target.value, vehicle_type_id: ''})}
                  className={inputClass}
                >
                  <option value="">Select</option>
                  {transportTypes.map((t, idx) => (
                    <option key={idx} value={t.transport_type}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelClass}>
                  <Car size={12} className="inline mr-1 text-gray-400" />
                  Vehicle Type
                </label>
                <select 
                  value={formData.vehicle_type_id}
                  onChange={(e) => setFormData({...formData, vehicle_type_id: e.target.value})}
                  className={`${inputClass} disabled:opacity-50`}
                  disabled={!formData.transport_type}
                >
                  <option value="">Select Vehicle Type</option>
                  {vehicleTypes.length > 0 ? (
                    vehicleTypes.map(v => (
                      <option key={v._id} value={v._id}>{v.name}</option>
                    ))
                  ) : (
                    formData.transport_type && <option disabled>The list is empty</option>
                  )}
                </select>
              </div>

              <div className="col-span-2">
                <label className={labelClass}>
                  <FileText size={12} className="inline mr-1 text-gray-400" />
                  Name *
                </label>
                <input 
                  type="text" 
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  placeholder="Enter Name"
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>
                  <Clock size={12} className="inline mr-1 text-gray-400" />
                  Duration (Days) *
                </label>
                <input 
                  type="number" 
                  value={formData.duration}
                  onChange={(e) => setFormData({...formData, duration: e.target.value})}
                  placeholder="Enter Days"
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>
                  <IndianRupee size={12} className="inline mr-1 text-gray-400" />
                  Amount *
                </label>
                <input 
                  type="number" 
                  min="0"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData({...formData, amount: e.target.value})}
                  placeholder="Enter Amount"
                  className={inputClass}
                />
              </div>

              <div className="col-span-2">
                <label className={labelClass}>
                  <Info size={12} className="inline mr-1 text-gray-400" />
                  Description *
                </label>
                <textarea 
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  placeholder="Enter Description"
                  className={`${inputClass} min-h-[100px] resize-none`}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3 sticky top-6">
            <button 
              onClick={handleSave}
              disabled={saving}
              className="w-full py-3 bg-yellow-400 text-black rounded-lg text-sm font-bold hover:bg-yellow-500 transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
            >
              {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
              Save Changes
            </button>
            <button 
              onClick={() => navigate('/admin/drivers/subscription')}
              className="w-full py-3 bg-gray-50 text-gray-600 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <div className="pt-4 border-t border-gray-100">
              <button className="flex items-center gap-2 text-xs font-medium text-emerald-600 hover:text-emerald-700 transition-colors">
                <Info size={14} /> How It Works
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DriverSubscriptionCreate;
