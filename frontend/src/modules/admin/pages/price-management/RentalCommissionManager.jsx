import React, { useEffect, useMemo, useState } from 'react';
import { Building2, Percent, Receipt, RefreshCcw, Save, Search, Wallet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { adminService } from '../../services/adminService';

const inputClass =
  'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 shadow-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-400/5';

const COMMISSION_SAMPLE_AMOUNT = 1000;

const clampValue = (value) => Math.max(0, Number(value || 0));

const calculatePreview = (storeDraft) => {
  const serviceStoreType = storeDraft?.serviceStoreType === 'fixed' ? 'fixed' : 'percentage';
  const ownerType = storeDraft?.ownerType === 'fixed' ? 'fixed' : 'percentage';
  const serviceStoreValue = clampValue(storeDraft?.serviceStoreValue);
  const ownerValue = clampValue(storeDraft?.ownerValue);
  const serviceTaxPercentage = clampValue(storeDraft?.serviceTaxPercentage);
  const calculateAmount = (amount, type, rawValue) =>
    type === 'fixed'
      ? Math.min(amount, rawValue)
      : Math.min(amount, (amount * rawValue) / 100);

  const serviceStoreAmount = calculateAmount(COMMISSION_SAMPLE_AMOUNT, serviceStoreType, serviceStoreValue);
  const ownerAmount = calculateAmount(
    Math.max(0, COMMISSION_SAMPLE_AMOUNT - serviceStoreAmount),
    ownerType,
    ownerValue,
  );
  const adminAmount = Math.max(0, COMMISSION_SAMPLE_AMOUNT - serviceStoreAmount - ownerAmount);
  const serviceTaxAmount = (COMMISSION_SAMPLE_AMOUNT * serviceTaxPercentage) / 100;

  return {
    serviceStoreAmount,
    ownerAmount,
    adminAmount,
    serviceTaxAmount,
    grossWithTaxAmount: COMMISSION_SAMPLE_AMOUNT + serviceTaxAmount,
  };
};

const RentalCommissionManager = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');
  const [search, setSearch] = useState('');
  const [stores, setStores] = useState([]);
  const [drafts, setDrafts] = useState({});

  const loadStores = async () => {
    setLoading(true);
    try {
      const response = await adminService.getServiceStores();
      const results =
        response?.data?.data?.results ||
        response?.data?.results ||
        response?.results ||
        [];
      setStores(results);
      setDrafts(
        results.reduce((accumulator, store) => {
          accumulator[String(store._id || store.id)] = {
            serviceStoreType:
              store?.rentalCommission?.serviceStore?.type === 'fixed' ? 'fixed' : 'percentage',
            serviceStoreValue: String(store?.rentalCommission?.serviceStore?.value ?? 0),
            ownerType: store?.rentalCommission?.owner?.type === 'fixed' ? 'fixed' : 'percentage',
            ownerValue: String(store?.rentalCommission?.owner?.value ?? 0),
            serviceTaxPercentage: String(store?.rentalCommission?.serviceTaxPercentage ?? 0),
          };
          return accumulator;
        }, {}),
      );
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to load service stores');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStores();
  }, []);

  const filteredStores = useMemo(() => {
    const query = String(search || '').trim().toLowerCase();
    if (!query) {
      return stores;
    }

    return stores.filter((store) =>
      [
        store.name,
        store.owner_name,
        store.owner_phone,
        store.zone_id?.name,
        store.service_location_id?.name,
        store.address,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [search, stores]);

  const updateDraft = (storeId, field, value) => {
    setDrafts((current) => ({
      ...current,
      [storeId]: {
        ...(current[storeId] || {}),
        [field]: value,
      },
    }));
  };

  const handleSave = async (store) => {
    const storeId = String(store._id || store.id);
    const draft = drafts[storeId] || {};
    
    const serviceVal = Number(draft.serviceStoreValue || 0);
    const ownerVal = Number(draft.ownerValue || 0);
    const taxVal = Number(draft.serviceTaxPercentage || 0);
    
    if (serviceVal < 0 || ownerVal < 0 || taxVal < 0) {
      return toast.error('Commission or tax cannot be negative');
    }
    if (draft.serviceStoreType === 'percentage' && serviceVal > 100) return toast.error('Store commission percentage cannot be above 100');
    if (draft.ownerType === 'percentage' && ownerVal > 100) return toast.error('Owner commission percentage cannot be above 100');
    if (taxVal > 100) return toast.error('Tax percentage cannot be above 100');
    
    if (draft.serviceStoreType === 'fixed' && String(draft.serviceStoreValue || '').trim() === '') return toast.error('Store fixed amount cannot be empty');
    if (draft.ownerType === 'fixed' && String(draft.ownerValue || '').trim() === '') return toast.error('Owner fixed amount cannot be empty');

    setSavingId(storeId);

    try {
      const payload = {
        rentalCommission: {
          serviceStore: {
            type: draft.serviceStoreType === 'fixed' ? 'fixed' : 'percentage',
            value: clampValue(draft.serviceStoreValue),
          },
          owner: {
            type: draft.ownerType === 'fixed' ? 'fixed' : 'percentage',
            value: clampValue(draft.ownerValue),
          },
          serviceTaxPercentage: clampValue(draft.serviceTaxPercentage),
        },
      };

      const response = await adminService.updateServiceStore(storeId, payload);
      const updated =
        response?.data?.data ||
        response?.data ||
        payload;

      setStores((current) =>
        current.map((item) => (String(item._id || item.id) === storeId ? { ...item, ...updated } : item)),
      );
      setDrafts((current) => ({
        ...current,
        [storeId]: {
          serviceStoreType: payload.rentalCommission.serviceStore.type,
          serviceStoreValue: String(payload.rentalCommission.serviceStore.value),
          ownerType: payload.rentalCommission.owner.type,
          ownerValue: String(payload.rentalCommission.owner.value),
          serviceTaxPercentage: String(payload.rentalCommission.serviceTaxPercentage),
        },
      }));
      toast.success(`Updated rental commission for ${store.name || 'service store'}`);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to save rental commission');
    } finally {
      setSavingId('');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/50 p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
              <Percent size={14} />
              Rental Commission
            </div>
            <h1 className="mt-3 text-3xl font-bold text-slate-900">Rental Commission Setup</h1>
            <p className="mt-1 text-sm font-medium text-slate-500">
              Each rental booking snapshots the selected store rules. Store share is applied first, owner share is applied on the remaining rental amount, admin keeps the rest, and service tax is calculated separately on the rental amount.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative w-full sm:w-[280px]">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                <Search size={16} className="text-slate-400" />
              </div>
              <input
                className={`${inputClass} pl-10 text-left`}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search store, owner, zone..."
              />
            </div>
            <button
              type="button"
              onClick={() => navigate('/admin/pricing/service-stores')}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-yellow-200 bg-yellow-50 px-6 py-3 text-sm font-bold text-yellow-700 shadow-sm transition hover:bg-yellow-100 whitespace-nowrap"
            >
              <Building2 size={16} />
              Open Service Stores
            </button>
          </div>
        </div>

        <div className="mb-5 rounded-[28px] border border-amber-100 bg-amber-50 px-5 py-4 text-sm font-semibold text-amber-900">
          Preview math uses `Rs {COMMISSION_SAMPLE_AMOUNT}` rental value. Example: if store is `10%`, owner is `20%`, and tax is `5%`, the store gets `Rs 100`, owner gets `Rs 180`, admin keeps `Rs 720`, and service tax adds `Rs 50`.
        </div>

        <div className="overflow-hidden rounded-[32px] border border-slate-100 bg-white shadow-sm">
          <div className="grid grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)_minmax(0,0.85fr)_minmax(0,0.75fr)_minmax(0,0.9fr)_150px] gap-4 bg-slate-100 px-6 py-5 text-sm font-black text-slate-700">
            <p>Service Store</p>
            <p>Store Commission</p>
            <p>Owner Commission</p>
            <p>Service Tax</p>
            <p>Preview on Rs 1000</p>
            <p>Action</p>
          </div>

          {loading ? (
            <div className="bg-white px-6 py-10 text-center text-sm font-bold text-slate-400">Loading rental commission settings...</div>
          ) : filteredStores.length === 0 ? (
            <div className="flex flex-col items-center justify-center bg-white px-6 py-16 text-center text-sm font-bold text-slate-400">
              <p className="mb-4 text-lg">No service stores found</p>
              <button
                type="button"
                onClick={() => navigate('/admin/pricing/service-stores')}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-yellow-200 bg-yellow-50 px-6 py-3 text-sm font-bold text-yellow-700 shadow-sm transition hover:bg-yellow-100 whitespace-nowrap"
              >
                <Building2 size={16} />
                Open Service Stores
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 bg-white">
              {filteredStores.map((store) => {
                const storeId = String(store._id || store.id);
                const draft = drafts[storeId] || {};
                const preview = calculatePreview(draft);
                const isSaving = savingId === storeId;

                return (
                  <div
                    key={storeId}
                    className="grid grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)_minmax(0,0.85fr)_minmax(0,0.75fr)_minmax(0,0.9fr)_150px] gap-4 px-6 py-5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-base font-black text-slate-900">{store.name || 'Untitled Store'}</p>
                      <p className="mt-1 truncate text-sm font-semibold text-slate-500">
                        {store.owner_name || 'Owner not set'}{store.owner_phone ? ` | ${store.owner_phone}` : ''}
                      </p>
                      <p className="mt-1 truncate text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        {store.zone_id?.name || 'No zone'} | {store.service_location_id?.name || 'No service location'}
                      </p>
                    </div>

                    <div className="space-y-3">
                      <select
                        className={inputClass}
                        value={draft.serviceStoreType ?? 'percentage'}
                        onChange={(event) => updateDraft(storeId, 'serviceStoreType', event.target.value)}
                      >
                        <option value="percentage">Percentage</option>
                        <option value="fixed">Fixed</option>
                      </select>
                      <input
                        className={inputClass}
                        type="number"
                        min="0"
                        step="0.01"
                        value={draft.serviceStoreValue ?? '0'}
                        onChange={(event) => updateDraft(storeId, 'serviceStoreValue', event.target.value)}
                        placeholder="Store value"
                      />
                    </div>

                    <div className="space-y-3">
                      <select
                        className={inputClass}
                        value={draft.ownerType ?? 'percentage'}
                        onChange={(event) => updateDraft(storeId, 'ownerType', event.target.value)}
                      >
                        <option value="percentage">Percentage</option>
                        <option value="fixed">Fixed</option>
                      </select>
                      <input
                        className={inputClass}
                        type="number"
                        min="0"
                        step="0.01"
                        value={draft.ownerValue ?? '0'}
                        onChange={(event) => updateDraft(storeId, 'ownerValue', event.target.value)}
                        placeholder="Owner value"
                      />
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-slate-500">
                        <Receipt size={15} />
                        <span className="text-sm font-semibold">Tax %</span>
                      </div>
                      <input
                        className={inputClass}
                        type="number"
                        min="0"
                        step="0.01"
                        value={draft.serviceTaxPercentage ?? '0'}
                        onChange={(event) => updateDraft(storeId, 'serviceTaxPercentage', event.target.value)}
                        placeholder="Service tax %"
                      />
                    </div>

                    <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="flex items-center gap-2 text-slate-500">
                        <Wallet size={15} />
                        <span className="text-[11px] font-black uppercase tracking-[0.18em]">Preview</span>
                      </div>
                      <p className="mt-3 text-sm font-black text-slate-900">Store: Rs {preview.serviceStoreAmount.toFixed(2)}</p>
                      <p className="mt-1 text-sm font-black text-slate-900">Owner: Rs {preview.ownerAmount.toFixed(2)}</p>
                      <p className="mt-1 text-sm font-black text-slate-900">Tax: Rs {preview.serviceTaxAmount.toFixed(2)}</p>
                      <p className="mt-1 text-sm font-black text-emerald-700">Admin: Rs {preview.adminAmount.toFixed(2)}</p>
                      <p className="mt-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                        Total with tax: Rs {preview.grossWithTaxAmount.toFixed(2)}
                      </p>
                    </div>

                    <div className="flex items-center">
                      <button
                        type="button"
                        onClick={() => handleSave(store)}
                        disabled={isSaving}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60"
                      >
                        {isSaving ? <RefreshCcw size={16} className="animate-spin" /> : <Save size={16} />}
                        Save
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RentalCommissionManager;
