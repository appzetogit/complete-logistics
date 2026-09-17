import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Search,
  ChevronRight,
  Trash2,
  Edit2,
  ArrowLeft,
  Package,
  CheckCircle2,
  Loader2,
  Upload,
  Info,
  Save,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../../../shared/api/axiosInstance';
import { adminService } from '../../services/adminService';

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition-all focus:border-orange-300 focus:ring-2 focus:ring-orange-100';
const labelClass = 'mb-2 block text-[12px] font-bold text-slate-700';

const defaultFormData = {
  name: '',
  goods_type_for: [],
  active: 1,
  icon: '',
  iconFile: null,
};

const unwrap = (response) => response?.data?.data || response?.data || response || {};

const normalizeGoodsTypeFor = (value) => {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || '').trim()).filter(Boolean);
  }

  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const formatGoodsTypeForDisplay = (value) => {
  const items = normalizeGoodsTypeFor(value);
  return items.length ? items.join(', ') : 'Universal';
};

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read icon file'));
    reader.readAsDataURL(file);
  });

const normalizeVehicleOption = (vehicle = {}) => {
  const id = String(vehicle._id || vehicle.id || vehicle.name || vehicle.vehicle_type || '');
  const value = String(vehicle.name || vehicle.vehicle_type || '').trim();
  const transport = String(vehicle.transport_type || '').trim();

  return {
    id,
    value,
    label: transport ? `${value} (${transport})` : value,
  };
};

const normalizeGoodsItem = (item = {}) => ({
  ...item,
  id: String(item._id || item.id || ''),
  name: item.name || item.goods_type_name || '',
  goods_type_for: normalizeGoodsTypeFor(item.goods_types_for || item.goods_type_for || []),
  active: Number(item.active ?? 1),
  icon: item.icon || '',
});

const StatusToggle = ({ active, onToggle }) => (
  <button
    type="button"
    onClick={(e) => {
      e.stopPropagation();
      onToggle();
    }}
    className={`relative h-6 w-12 rounded-full transition-all ${active ? 'bg-emerald-500' : 'bg-slate-300'}`}
  >
    <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${active ? 'left-7' : 'left-1'}`} />
  </button>
);

const GoodsTypes = ({ mode }) => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditor = mode === 'create' || mode === 'edit';

  const [goods, setGoods] = useState([]);
  const [vehicleOptions, setVehicleOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [formData, setFormData] = useState(defaultFormData);

  useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      setLoading(true);
      setErrorMessage('');

      try {
        const [goodsResponse, vehiclesResponse] = await Promise.all([
          api.get('/admin/goods-types'),
          adminService.getVehicleTypes(),
        ]);

        if (!mounted) return;

        const goodsPayload = unwrap(goodsResponse);
        const goodsResults = Array.isArray(goodsPayload?.results)
          ? goodsPayload.results
          : Array.isArray(goodsPayload?.goods_types)
            ? goodsPayload.goods_types
            : Array.isArray(goodsPayload)
              ? goodsPayload
              : [];

        const vehiclePayload = unwrap(vehiclesResponse);
        const vehicleResults = Array.isArray(vehiclePayload?.results)
          ? vehiclePayload.results
          : Array.isArray(vehiclePayload)
            ? vehiclePayload
            : [];

        const normalizedGoods = goodsResults.map(normalizeGoodsItem);
        const normalizedVehicleOptions = vehicleResults
          .map(normalizeVehicleOption)
          .filter((option) => option.value);

        setGoods(normalizedGoods);
        setVehicleOptions(normalizedVehicleOptions);

        if (mode === 'edit' && id) {
          const existing = normalizedGoods.find((item) => String(item.id) === String(id));
          if (existing) {
            setFormData({
              name: existing.name,
              goods_type_for: existing.goods_type_for,
              active: existing.active,
              icon: existing.icon,
              iconFile: null,
            });
          }
        } else if (mode === 'create') {
          setFormData((current) => ({
            ...defaultFormData,
            goods_type_for: current.goods_type_for.length
              ? current.goods_type_for
              : normalizedVehicleOptions[0]
                ? [normalizedVehicleOptions[0].value]
                : [],
          }));
        }
      } catch (error) {
        if (mounted) {
          setErrorMessage(error.message || 'Could not load goods types.');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadData();

    return () => {
      mounted = false;
    };
  }, [id, mode]);

  const filteredGoods = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return goods;
    return goods.filter((item) => item.name.toLowerCase().includes(query));
  }, [goods, searchTerm]);

  const availableForOptions = useMemo(() => {
    const options = [...vehicleOptions];

    formData.goods_type_for.forEach((value) => {
      if (value && !options.some((option) => option.value === value)) {
        options.unshift({
          id: value,
          value,
          label: `${value} (Current)`,
        });
      }
    });

    return options;
  }, [formData.goods_type_for, vehicleOptions]);

  const previewIcon = useMemo(() => {
    if (formData.iconFile) {
      return URL.createObjectURL(formData.iconFile);
    }
    return formData.icon;
  }, [formData.icon, formData.iconFile]);

  useEffect(() => () => {
    if (previewIcon && formData.iconFile) {
      URL.revokeObjectURL(previewIcon);
    }
  }, [previewIcon, formData.iconFile]);

  const updateForm = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const toggleAvailableVehicle = (value) => {
    setFormData((current) => {
      const exists = current.goods_type_for.includes(value);
      return {
        ...current,
        goods_type_for: exists
          ? current.goods_type_for.filter((entry) => entry !== value)
          : [...current.goods_type_for, value],
      };
    });
  };

  const handleSave = async (event) => {
    event.preventDefault();

    if (!formData.name.trim()) {
      setErrorMessage('Goods type name is required.');
      return;
    }

    if (!formData.goods_type_for.length) {
      setErrorMessage('Select at least one supported vehicle type.');
      return;
    }

    setSaving(true);
    setErrorMessage('');

    try {
      const iconData = formData.iconFile ? await readFileAsDataUrl(formData.iconFile) : formData.icon;
      const payload = {
        name: formData.name.trim(),
        goods_type_name: formData.name.trim(),
        goods_type_for: formData.goods_type_for.join(','),
        goods_types_for: formData.goods_type_for.join(','),
        active: Number(formData.active),
        icon: iconData || '',
      };

      if (id && mode === 'edit') {
        await api.patch(`/admin/goods-types/${id}`, payload);
      } else {
        await api.post('/admin/goods-types', payload);
      }

      navigate('/admin/pricing/goods-types');
    } catch (error) {
      setErrorMessage(error.message || 'Could not save goods type.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (itemId) => {
    if (!window.confirm('Delete this goods type?')) {
      return;
    }

    try {
      await api.delete(`/admin/goods-types/${itemId}`);
      setGoods((prev) => prev.filter((item) => String(item.id) !== String(itemId)));
    } catch (error) {
      setErrorMessage(error.message || 'Could not delete goods type.');
    }
  };

  const handleToggleStatus = async (item) => {
    const nextActive = item.active === 1 ? 0 : 1;

    try {
      await api.patch(`/admin/goods-types/${item.id}`, { active: nextActive });
      setGoods((prev) =>
        prev.map((entry) => (entry.id === item.id ? { ...entry, active: nextActive } : entry)),
      );
    } catch (error) {
      setErrorMessage(error.message || 'Could not update goods type status.');
    }
  };

  if (!isEditor) {
    return (
      <div className="min-h-screen bg-[#f6f7fb] p-6 lg:p-8">
        <div className="mb-6">
          <div className="mb-2 flex items-center gap-1.5 text-xs text-slate-400">
            <span>Pricing</span>
            <ChevronRight size={12} />
            <span className="text-slate-700">Goods Types</span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Goods Types</h1>
              <p className="mt-1 text-sm text-slate-500">Manage cargo categories and their compatible vehicle types.</p>
            </div>
            <button
              onClick={() => navigate('/admin/pricing/goods-types/create')}
              className="inline-flex items-center gap-2 rounded-xl bg-[#ff6b4a] px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-200 transition hover:bg-[#f55a37]"
            >
              <Plus size={18} />
              Add Goods Type
            </button>
          </div>
        </div>

        {errorMessage ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
            {errorMessage}
          </div>
        ) : null}

        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-5">
            <div className="relative max-w-sm">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search goods types"
                className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm outline-none focus:border-slate-300"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Name</th>
                  <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Compatible With</th>
                  <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Status</th>
                  <th className="px-6 py-4 text-right text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-20 text-center text-sm text-slate-400">Loading goods types...</td>
                  </tr>
                ) : !filteredGoods.length ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-20 text-center text-sm text-slate-400">No goods types found.</td>
                  </tr>
                ) : filteredGoods.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100">
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50">
                          {item.icon ? (
                            <img src={item.icon} alt={item.name} className="h-10 w-10 object-contain" />
                          ) : (
                            <Package size={20} className="text-slate-400" />
                          )}
                        </div>
                        <p className="text-sm font-semibold text-slate-900">{item.name}</p>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                        {formatGoodsTypeForDisplay(item.goods_type_for)}
                      </span>
                    </td>
                    <td className="px-6 py-5">
                      <StatusToggle active={item.active === 1} onToggle={() => handleToggleStatus(item)} />
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => navigate(`/admin/pricing/goods-types/edit/${item.id}`)}
                          className="rounded-xl p-2 text-slate-400 transition hover:bg-blue-50 hover:text-blue-600"
                        >
                          <Edit2 size={15} />
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="rounded-xl p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f6f7fb] p-6 lg:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs text-slate-400">
            <span>Pricing</span>
            <ChevronRight size={12} />
            <span className="text-slate-700">Goods Types</span>
            <ChevronRight size={12} />
            <span className="text-slate-700">{id ? 'Edit' : 'Create'}</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{id ? 'Edit Goods Type' : 'Create Goods Type'}</h1>
          <p className="mt-1 text-sm text-slate-500">Define cargo categories, supported vehicle types, and listing status.</p>
        </div>
        <button
          onClick={() => navigate('/admin/pricing/goods-types')}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          <ArrowLeft size={16} />
          Back
        </button>
      </div>

      {errorMessage ? (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
          {errorMessage}
        </div>
      ) : null}

      <form onSubmit={handleSave} className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-1 gap-8 p-6 lg:grid-cols-2 lg:p-8">
          <div>
            <label className={labelClass}>Goods Type Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => updateForm('name', e.target.value)}
              className={inputClass}
              placeholder="Fragile items"
            />
          </div>

          <div>
            <label className={labelClass}>Status</label>
            <div className="flex h-[50px] items-center rounded-xl border border-slate-200 px-4">
              <StatusToggle
                active={formData.active === 1}
                onToggle={() => updateForm('active', formData.active === 1 ? 0 : 1)}
              />
              <span className="ml-3 text-sm font-medium text-slate-700">
                {formData.active === 1 ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>

          <div className="lg:col-span-2">
            <label className={labelClass}>Available For *</label>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              {loading ? (
                <p className="text-sm text-slate-400">Loading vehicle types...</p>
              ) : availableForOptions.length ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {availableForOptions.map((option) => {
                    const checked = formData.goods_type_for.includes(option.value);
                    return (
                      <label
                        key={option.id}
                        className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium transition-all ${
                          checked
                            ? 'border-orange-200 bg-orange-50 text-orange-700'
                            : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleAvailableVehicle(option.value)}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        <span>{option.label}</span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-slate-400">No vehicle types found.</p>
              )}
            </div>
          </div>

          <div className="lg:col-span-2">
            <label className={labelClass}>Goods Icon</label>
            <div className="flex flex-col gap-5 rounded-2xl border border-slate-200 p-5 lg:flex-row lg:items-center">
              <div className="flex h-36 w-full max-w-[220px] items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50">
                {previewIcon ? (
                  <img src={previewIcon} alt="Goods type preview" className="h-full w-full object-contain p-4" />
                ) : (
                  <div className="text-center text-slate-400">
                    <Package size={28} className="mx-auto mb-2" />
                    <p className="text-[11px] font-semibold uppercase tracking-wider">No Icon</p>
                  </div>
                )}
              </div>

              <div className="flex-1 space-y-3">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[#2e3c78] px-4 py-3 text-[11px] font-bold uppercase tracking-widest text-white transition hover:bg-[#24305f]">
                  <Upload size={15} />
                  Upload Icon
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={(e) => updateForm('iconFile', e.target.files?.[0] || null)}
                  />
                </label>
                <p className="text-[11px] text-slate-500">Upload a simple square icon for the admin and app listing screens.</p>
                {(formData.icon || formData.iconFile) ? (
                  <button
                    type="button"
                    onClick={() => setFormData((current) => ({ ...current, icon: '', iconFile: null }))}
                    className="text-[11px] font-semibold text-rose-500 transition-colors hover:text-rose-600"
                  >
                    Remove current icon
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 border-t border-slate-100 bg-slate-50/50 p-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="flex items-start gap-3 rounded-2xl bg-amber-50 px-4 py-3">
            <Info size={16} className="mt-0.5 shrink-0 text-amber-600" />
            <p className="text-sm text-amber-800">
              Assign each goods type only to compatible vehicle categories so dispatch and pricing stay consistent.
            </p>
          </div>

          <div className="flex flex-col gap-3 lg:items-end">
            <button
              type="submit"
              disabled={saving || loading}
              className="inline-flex min-w-[180px] items-center justify-center gap-2 rounded-xl bg-[#2e3c78] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#24305f] disabled:opacity-60"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {saving ? 'Saving...' : id ? 'Update' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/admin/pricing/goods-types')}
              className="text-sm font-medium text-slate-500 transition hover:text-slate-700"
            >
              Cancel
            </button>
          </div>
        </div>
      </form>

      <AnimatePresence>
        {!loading && formData.active === 1 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="fixed bottom-8 right-8 flex h-14 w-14 items-center justify-center rounded-full bg-[#14b8a6] text-white shadow-2xl"
          >
            <CheckCircle2 size={24} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};

export default GoodsTypes;
