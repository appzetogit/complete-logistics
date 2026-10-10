import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Car, ChevronRight, IndianRupee, Loader2, Plus, Save, Ticket } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { adminService } from '../../services/adminService';

const inputClass = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-bold text-gray-900 outline-none transition focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 bg-gray-50 focus:bg-white';

const BADGE_MAX = 20;
const BENEFITS_MAX = 4;
const BENEFIT_MAX_LENGTH = 40;

const idOf = (value) => String(value?._id || value?.id || value || '');

const unwrapList = (response) => {
  const data = response?.data?.data ?? response?.data ?? response;
  if (Array.isArray(data)) return data;
  return data?.results || data?.data || [];
};

// Vehicles that can carry this kind of plan: taxi plans -> taxi/both vehicles, goods plans -> delivery/both.
const vehicleFitsPlan = (vehicle, transportType) => {
  const type = String(vehicle?.transport_type || '').toLowerCase();
  if (!type || type === 'both') return true;
  return transportType === 'delivery' ? type === 'delivery' : type === 'taxi';
};

const emptyForm = {
  name: '',
  description: '',
  amount: '',
  duration: '',
  transport_type: 'taxi',
  vehicle_type_ids: [],
  benefit_type: 'limited',
  ride_limit: '',
  how_it_works: '',
  badge: '',
  benefitsText: '',
  active: true,
};

const UserSubscriptionCreate = () => {
  const navigate = useNavigate();
  const { id: planId } = useParams();
  const isEdit = Boolean(planId);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [vehicleTypes, setVehicleTypes] = useState([]);
  const [formData, setFormData] = useState(emptyForm);

  useEffect(() => {
    const loadVehicles = async () => {
      try {
        const response = await adminService.getVehicleTypes();
        setVehicleTypes(unwrapList(response));
      } catch (error) {
        toast.error(error?.message || 'Failed to load vehicle types');
      }
    };
    loadVehicles();
  }, []);

  // Edit: load the plan from the plan list (there is no single-plan admin endpoint).
  useEffect(() => {
    if (!isEdit) return;
    const loadPlan = async () => {
      try {
        const response = await adminService.getUserSubscriptionPlans();
        const plan = unwrapList(response).find((item) => idOf(item) === planId);
        if (!plan) {
          toast.error('Subscription plan not found');
          navigate('/admin/users/subscriptions');
          return;
        }
        const vehicleIds = [...new Set([
          ...(plan.vehicle_type_ids || []).map(idOf),
          idOf(plan.vehicle_type_id),
        ].filter(Boolean))];
        setFormData({
          name: plan.name || '',
          description: plan.description || '',
          amount: plan.amount ?? '',
          duration: plan.duration ?? '',
          transport_type: plan.transport_type === 'delivery' ? 'delivery' : 'taxi',
          vehicle_type_ids: vehicleIds,
          benefit_type: plan.benefit_type === 'unlimited' ? 'unlimited' : 'limited',
          ride_limit: plan.ride_limit || '',
          how_it_works: plan.how_it_works || '',
          badge: plan.badge || '',
          benefitsText: (plan.benefits || []).join('\n'),
          active: plan.active !== false,
        });
      } catch (error) {
        toast.error(error?.message || 'Failed to load the plan');
      } finally {
        setLoading(false);
      }
    };
    loadPlan();
  }, [isEdit, planId, navigate]);

  const availableVehicles = useMemo(
    () => vehicleTypes.filter((vehicle) => vehicleFitsPlan(vehicle, formData.transport_type)
      || formData.vehicle_type_ids.includes(idOf(vehicle))),
    [vehicleTypes, formData.transport_type, formData.vehicle_type_ids],
  );

  const benefits = formData.benefitsText.split('\n').map((line) => line.trim()).filter(Boolean);
  const benefitError = benefits.length > BENEFITS_MAX
    ? `At most ${BENEFITS_MAX} benefits`
    : benefits.find((item) => item.length > BENEFIT_MAX_LENGTH)
      ? `Each benefit must be ${BENEFIT_MAX_LENGTH} characters or fewer`
      : '';

  const toggleVehicle = (vehicleId) => {
    setFormData((previous) => ({
      ...previous,
      vehicle_type_ids: previous.vehicle_type_ids.includes(vehicleId)
        ? previous.vehicle_type_ids.filter((item) => item !== vehicleId)
        : [...previous.vehicle_type_ids, vehicleId],
    }));
  };

  const handleSave = async () => {
    if (!formData.name || !formData.amount || !formData.duration || formData.vehicle_type_ids.length === 0) {
      toast.error('Please complete all required fields and pick at least one vehicle');
      return;
    }
    if (formData.benefit_type === 'limited' && !formData.ride_limit) {
      toast.error('Ride limit is required for limited plans');
      return;
    }
    if (formData.badge.trim().length > BADGE_MAX) {
      toast.error(`Badge must be ${BADGE_MAX} characters or fewer`);
      return;
    }
    if (benefitError) {
      toast.error(benefitError);
      return;
    }

    const payload = {
      name: formData.name.trim(),
      description: formData.description,
      amount: Number(formData.amount),
      duration: Number(formData.duration),
      transport_type: formData.transport_type,
      vehicle_type_ids: formData.vehicle_type_ids,
      vehicle_type_id: formData.vehicle_type_ids[0],
      benefit_type: formData.benefit_type,
      ride_limit: formData.benefit_type === 'unlimited' ? 0 : Number(formData.ride_limit || 0),
      how_it_works: formData.how_it_works,
      badge: formData.badge.trim(),
      benefits,
      active: formData.active,
    };

    try {
      setSaving(true);
      const response = isEdit
        ? await adminService.updateUserSubscriptionPlan(planId, payload)
        : await adminService.createUserSubscriptionPlan(payload);
      toast.success(response?.message || (isEdit ? 'Subscription updated' : 'Customer subscription created'));
      navigate('/admin/users/subscriptions');
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || 'Failed to save subscription');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-7 w-7 animate-spin text-gray-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs text-gray-400">
            <span>Users</span>
            <ChevronRight size={12} />
            <Link to="/admin/users/subscriptions" className="hover:text-gray-700">Subscription Management</Link>
            <ChevronRight size={12} />
            <span className="text-gray-700">{isEdit ? 'Edit' : 'Create'}</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">{isEdit ? 'Edit Customer Subscription' : 'Create Customer Subscription'}</h1>
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
              <p className="text-xs font-medium text-gray-500">A ride plan customers can buy from the app.</p>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-xs font-bold text-gray-500">Plan Name</label>
              <input className={inputClass} value={formData.name} onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))} />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold text-gray-500">Plan For</label>
              <select className={inputClass} value={formData.transport_type} onChange={(e) => setFormData((p) => ({ ...p, transport_type: e.target.value }))}>
                <option value="taxi">Passenger rides (taxi)</option>
                <option value="delivery">Goods (delivery)</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold text-gray-500">Benefit Type</label>
              <select className={inputClass} value={formData.benefit_type} onChange={(e) => setFormData((p) => ({ ...p, benefit_type: e.target.value }))}>
                <option value="limited">Limited rides</option>
                <option value="unlimited">Unlimited rides</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="mb-1.5 block text-xs font-bold text-gray-500">
                Vehicle Types <span className="font-medium text-gray-400">(the plan covers every vehicle you tick)</span>
              </label>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="plan-vehicles">
                {availableVehicles.length === 0 ? (
                  <p className="text-xs font-medium text-gray-400">No vehicle types for this plan type.</p>
                ) : availableVehicles.map((vehicle) => {
                  const vehicleId = idOf(vehicle);
                  const checked = formData.vehicle_type_ids.includes(vehicleId);
                  const disabled = Number(vehicle.status ?? 1) === 0 || vehicle.active === false;
                  return (
                    <label
                      key={vehicleId}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold ${checked ? 'border-yellow-400 bg-yellow-50 text-gray-900' : 'border-gray-200 bg-gray-50 text-gray-600'}`}
                    >
                      <input type="checkbox" checked={checked} onChange={() => toggleVehicle(vehicleId)} />
                      <span className="truncate">{vehicle.name}</span>
                      {disabled ? <span className="ml-auto text-[10px] font-bold uppercase text-red-500">off</span> : null}
                    </label>
                  );
                })}
              </div>
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

            <div>
              <label className="mb-1.5 block text-xs font-bold text-gray-500">
                Badge <span className="font-medium text-gray-400">(optional, e.g. "Most popular")</span>
              </label>
              <input
                className={inputClass}
                maxLength={BADGE_MAX}
                value={formData.badge}
                onChange={(e) => setFormData((p) => ({ ...p, badge: e.target.value }))}
              />
              <p className="mt-1 text-[11px] font-medium text-gray-400">{formData.badge.trim().length}/{BADGE_MAX} · shown as a ribbon; the badged plan is pre-selected in the app.</p>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold text-gray-500">
                Benefits <span className="font-medium text-gray-400">(optional, one per line, max {BENEFITS_MAX})</span>
              </label>
              <textarea
                className={`${inputClass} min-h-[96px] resize-none`}
                value={formData.benefitsText}
                onChange={(e) => setFormData((p) => ({ ...p, benefitsText: e.target.value }))}
              />
              <p className={`mt-1 text-[11px] font-medium ${benefitError ? 'text-red-500' : 'text-gray-400'}`}>
                {benefitError || `${benefits.length}/${BENEFITS_MAX} · each up to ${BENEFIT_MAX_LENGTH} characters.`}
              </p>
            </div>
            <div className="md:col-span-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-800">
              Only list benefits the ride flow really gives. Covered rides are free for the rider; cancellation fees and
              bidding rides are <b>not</b> covered, so do not promise "Free cancellation".
            </div>

            {isEdit ? (
              <label className="md:col-span-2 flex items-center gap-2 text-sm font-bold text-gray-700">
                <input type="checkbox" checked={formData.active} onChange={(e) => setFormData((p) => ({ ...p, active: e.target.checked }))} />
                Active (customers can buy this plan)
              </label>
            ) : null}
          </div>
        </div>

        <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-200 h-fit">
          <h2 className="text-sm font-bold text-gray-900 border-l-2 border-yellow-400 pl-2">{isEdit ? 'Save Changes' : 'Publish Plan'}</h2>
          <p className="mt-2 text-xs font-medium text-gray-500">
            {isEdit
              ? 'Changes apply to new purchases. Passes already bought keep the terms they were bought with.'
              : 'Customers can buy this plan in the app with wallet balance or online payment.'}
          </p>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-yellow-400 px-4 py-3 text-sm font-bold text-black transition hover:bg-yellow-500 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : (isEdit ? <Save size={16} /> : <Plus size={16} />)}
            {isEdit ? 'Save Changes' : 'Save Subscription'}
          </button>
          <div className="mt-6 rounded-xl bg-gray-50 p-4 border border-gray-100">
            <div className="flex items-center gap-2 text-sm font-bold text-gray-700">
              <Car size={15} />
              Vehicle-specific ride access
            </div>
            <p className="mt-2 text-xs font-medium leading-5 text-gray-500">
              A purchased plan covers rides on every selected vehicle type until the ride limit or duration ends.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserSubscriptionCreate;
