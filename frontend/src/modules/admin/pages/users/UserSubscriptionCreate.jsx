import React, { useEffect, useState } from 'react';
import { ArrowLeft, Car, ChevronRight, IndianRupee, Loader2, Plus, Ticket } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { adminService } from '../../services/adminService';

const inputClass = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-bold text-gray-900 outline-none transition focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 bg-gray-50 focus:bg-white';

const UserSubscriptionCreate = () => {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [vehicleTypes, setVehicleTypes] = useState([]);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    amount: '',
    duration: '',
    transport_type: 'taxi',
    vehicle_type_id: '',
    benefit_type: 'limited',
    ride_limit: '',
    how_it_works: '',
  });

  useEffect(() => {
    const loadVehicles = async () => {
      try {
        const response = await adminService.getVehicleTypes('taxi');
        const results = Array.isArray(response?.data) ? response.data : (response?.data?.results || []);
        setVehicleTypes(results);
      } catch (error) {
        toast.error(error?.message || 'Failed to load vehicle types');
      }
    };

    loadVehicles();
  }, []);

  const handleSave = async () => {
    if (!formData.name || !formData.amount || !formData.duration || !formData.vehicle_type_id) {
      toast.error('Please complete all required fields');
      return;
    }

    if (formData.benefit_type === 'limited' && !formData.ride_limit) {
      toast.error('Ride limit is required for limited plans');
      return;
    }

    try {
      setSaving(true);
      const payload = {
        ...formData,
        ride_limit: formData.benefit_type === 'unlimited' ? 0 : Number(formData.ride_limit || 0),
      };
      const response = await adminService.createUserSubscriptionPlan(payload);
      toast.success(response?.message || 'Customer subscription created');
      navigate('/admin/users/subscriptions');
    } catch (error) {
      toast.error(error?.message || 'Failed to create subscription');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs text-gray-400">
            <span>Users</span>
            <ChevronRight size={12} />
            <Link to="/admin/users/subscriptions" className="hover:text-gray-700">Subscription Management</Link>
            <ChevronRight size={12} />
            <span className="text-gray-700">Create</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">Create Customer Subscription</h1>
        </div>
        <button
          type="button"
          onClick={() => navigate('/admin/users/subscriptions')}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
        >
          <ArrowLeft size={16} />
          Back
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-200">
          <div className="mb-6 flex items-center gap-3 border-b border-gray-100 pb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-50 text-gray-900 border border-yellow-100">
              <Ticket size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900">Subscription Details</h2>
              <p className="text-xs font-medium text-gray-500">Create a ride plan customers can buy from the app.</p>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-xs font-bold text-gray-500">Plan Name</label>
              <input className={inputClass} value={formData.name} onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold text-gray-500">Vehicle Type</label>
              <select className={inputClass} value={formData.vehicle_type_id} onChange={(e) => setFormData((p) => ({ ...p, vehicle_type_id: e.target.value }))}>
                <option value="">Select vehicle type</option>
                {vehicleTypes.map((item) => (
                  <option key={item._id} value={item._id}>{item.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold text-gray-500">Benefit Type</label>
              <select className={inputClass} value={formData.benefit_type} onChange={(e) => setFormData((p) => ({ ...p, benefit_type: e.target.value }))}>
                <option value="limited">Limited rides</option>
                <option value="unlimited">Unlimited rides</option>
              </select>
            </div>
            {formData.benefit_type === 'limited' ? (
              <div>
                <label className="mb-1.5 block text-xs font-bold text-gray-500">Ride Limit</label>
                <input type="number" min="1" className={inputClass} value={formData.ride_limit} onChange={(e) => setFormData((p) => ({ ...p, ride_limit: e.target.value }))} />
              </div>
            ) : null}
            <div>
              <label className="mb-1.5 block text-xs font-bold text-gray-500">Duration In Days</label>
              <input type="number" min="1" className={inputClass} value={formData.duration} onChange={(e) => setFormData((p) => ({ ...p, duration: e.target.value }))} />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-xs font-bold text-gray-500">Price</label>
              <div className="relative">
                <IndianRupee size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="number" min="0" step="0.01" className={`${inputClass} pl-10`} value={formData.amount} onChange={(e) => setFormData((p) => ({ ...p, amount: e.target.value }))} />
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-xs font-bold text-gray-500">Description</label>
              <textarea className={`${inputClass} min-h-[96px] resize-none`} value={formData.description} onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))} />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-xs font-bold text-gray-500">How It Works</label>
              <textarea className={`${inputClass} min-h-[96px] resize-none`} value={formData.how_it_works} onChange={(e) => setFormData((p) => ({ ...p, how_it_works: e.target.value }))} />
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-200">
          <h2 className="text-sm font-bold text-gray-900 border-l-2 border-yellow-400 pl-2">Publish Plan</h2>
          <p className="mt-2 text-xs font-medium text-gray-500">Customers will be able to buy this plan from their profile using wallet balance.</p>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-yellow-400 px-4 py-3 text-sm font-bold text-black transition hover:bg-yellow-500 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus size={16} />}
            Save Subscription
          </button>
          <div className="mt-6 rounded-xl bg-gray-50 p-4 border border-gray-100">
            <div className="flex items-center gap-2 text-sm font-bold text-gray-700">
              <Car size={15} />
              Vehicle-specific ride access
            </div>
            <p className="mt-2 text-xs font-medium leading-5 text-gray-500">
              A purchased plan automatically covers rides for the selected vehicle type until the ride limit or duration ends.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserSubscriptionCreate;
