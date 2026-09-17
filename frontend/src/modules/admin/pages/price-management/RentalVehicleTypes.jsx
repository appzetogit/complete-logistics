import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Armchair,
  Car,
  CheckCircle2,
  ChevronRight,
  Clock3,
  CreditCard,
  Edit2,
  ImagePlus,
  Luggage,
  Plus,
  Save,
  Trash2,
  Users,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { adminService } from '../../services/adminService';

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition-all focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100/60';
const labelClass = 'mb-2 block text-[12px] font-bold text-slate-700';

const createSeatCell = (rowNumber, seatCode, variant = 'seat') => ({
  kind: 'seat',
  id: `R${rowNumber}${seatCode}`,
  label: `${rowNumber}${seatCode}`,
  variant,
  status: 'available',
});

const createAisleCell = () => ({
  kind: 'aisle',
  id: '',
  label: '',
  variant: 'seat',
  status: 'available',
});

const createRowFromPattern = (rowNumber, pattern = []) =>
  pattern.map((cell) => {
    if (!cell || cell === 'aisle') return createAisleCell();
    if (typeof cell === 'string') return createSeatCell(rowNumber, cell);
    return createSeatCell(rowNumber, cell.code, cell.variant || 'seat');
  });

const RENTAL_BLUEPRINT_TEMPLATES = [
  {
    key: 'bike_1',
    label: 'Bike',
    category: 'Single seat',
    create: () => ({
      templateKey: 'bike_1',
      lowerDeck: [createRowFromPattern(1, ['A'])],
      upperDeck: [],
    }),
  },
  {
    key: 'auto_3',
    label: 'Auto 3',
    category: 'Rear bench',
    create: () => ({
      templateKey: 'auto_3',
      lowerDeck: [
        createRowFromPattern(1, ['A']),
        createRowFromPattern(2, ['B', 'aisle', 'C']),
      ],
      upperDeck: [],
    }),
  },
  {
    key: 'compact_4',
    label: 'Compact 4',
    category: '2 rows',
    create: () => ({
      templateKey: 'compact_4',
      lowerDeck: [
        createRowFromPattern(1, ['A', 'aisle', 'B']),
        createRowFromPattern(2, ['C', 'aisle', 'D']),
      ],
      upperDeck: [],
    }),
  },
  {
    key: 'suv_6',
    label: 'SUV 6',
    category: '3 rows',
    create: () => ({
      templateKey: 'suv_6',
      lowerDeck: [
        createRowFromPattern(1, ['A', 'aisle', 'B']),
        createRowFromPattern(2, ['C', 'aisle', 'D']),
        createRowFromPattern(3, ['E', 'aisle', 'F']),
      ],
      upperDeck: [],
    }),
  },
  {
    key: 'suv_7',
    label: 'SUV 7',
    category: 'Captain + bench',
    create: () => ({
      templateKey: 'suv_7',
      lowerDeck: [
        createRowFromPattern(1, ['A', 'aisle', 'B']),
        createRowFromPattern(2, ['C', 'D', 'E']),
        createRowFromPattern(3, ['F', 'aisle', 'G']),
      ],
      upperDeck: [],
    }),
  },
  {
    key: 'van_8',
    label: 'Van 8',
    category: 'Large carrier',
    create: () => ({
      templateKey: 'van_8',
      lowerDeck: [
        createRowFromPattern(1, ['A', 'aisle', 'B']),
        createRowFromPattern(2, ['C', 'D', 'E']),
        createRowFromPattern(3, ['F', 'G', 'H']),
      ],
      upperDeck: [],
    }),
  },
];

const DEFAULT_PRICING = [
  { id: 'pkg-6h', label: '6 Hours', durationHours: '', price: '', includedKm: '', extraHourPrice: '', extraKmPrice: '', active: true },
  { id: 'pkg-12h', label: '12 Hours', durationHours: '', price: '', includedKm: '', extraHourPrice: '', extraKmPrice: '', active: true },
  { id: 'pkg-24h', label: '24 Hours', durationHours: '', price: '', includedKm: '', extraHourPrice: '', extraKmPrice: '', active: true },
];

const clone = (value) => JSON.parse(JSON.stringify(value));

const createBlueprintFromTemplate = (templateKey = 'compact_4') => {
  const template = RENTAL_BLUEPRINT_TEMPLATES.find((item) => item.key === templateKey) || RENTAL_BLUEPRINT_TEMPLATES[2];
  return clone(template.create());
};

const countSeats = (blueprint = {}) =>
  ['lowerDeck', 'upperDeck']
    .flatMap((deckKey) => (Array.isArray(blueprint?.[deckKey]) ? blueprint[deckKey] : []))
    .flat()
    .filter((cell) => cell?.kind === 'seat').length;

const normalizeNumberInput = (value) => {
  if (value === '' || value === null || value === undefined) return '';
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : '';
};

const toNumberOrZero = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const createEmptyPricingRow = (id, label = 'Custom Package') => ({
  id,
  label,
  durationHours: '',
  price: '',
  includedKm: '',
  extraHourPrice: '',
  extraKmPrice: '',
  active: true,
});

const normalizePricing = (items = DEFAULT_PRICING) =>
  (Array.isArray(items) && items.length ? items : DEFAULT_PRICING).map((item, index) => ({
    id: String(item.id || `pkg-${index + 1}`),
    label: String(item.label || `${item.durationHours || index + 1} Hours`),
    durationHours: normalizeNumberInput(item.durationHours),
    price: normalizeNumberInput(item.price),
    includedKm: normalizeNumberInput(item.includedKm),
    extraHourPrice: normalizeNumberInput(item.extraHourPrice),
    extraKmPrice: normalizeNumberInput(item.extraKmPrice),
    active: item.active !== false,
  }));

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const normalizeMediaValue = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    return value.url || value.image || value.src || value.path || '';
  }
  return '';
};

const getCoverImage = (item = {}) => normalizeMediaValue(item.coverImage) || normalizeMediaValue(item.image) || '';
const getGalleryImages = (item = {}) => {
  if (Array.isArray(item.galleryImages)) return item.galleryImages.map(normalizeMediaValue).filter(Boolean);
  if (Array.isArray(item.gallery)) return item.gallery.map(normalizeMediaValue).filter(Boolean);
  if (Array.isArray(item.images)) return item.images.map(normalizeMediaValue).filter(Boolean);
  return [];
};

const buildDefaultForm = () => {
  return {
    transport_type: 'rental',
    name: '',
    short_description: '',
    description: '',
    vehicleCategory: 'Car',
    image: '',
    coverImage: '',
    galleryImages: [],
    map_icon: '',
    capacity: 0,
    luggageCapacity: 2,
    amenities: [],
    serviceStoreIds: [],
    poolingEnabled: false,
    advancePayment: {
      enabled: false,
      paymentMode: 'percentage',
      amount: 20,
      label: 'Advance booking payment',
      notes: '',
    },
    blueprint: null,
    pricing: normalizePricing(),
    active: true,
    status: 'active',
  };
};

const SeatCell = ({ cell, onToggle }) => {
  if (!cell || cell.kind !== 'seat') {
    return <div className="h-12 rounded-2xl bg-slate-100/90" />;
  }

  const blocked = cell.status === 'blocked';
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`relative flex h-12 items-center justify-center rounded-xl border text-[11px] font-black tracking-wide transition-all ${
        blocked
          ? 'border-slate-200 bg-slate-100 text-slate-400 opacity-60'
          : 'border-indigo-200 bg-indigo-50 text-indigo-700 shadow-sm hover:border-indigo-400 hover:bg-indigo-100 hover:shadow-md'
      }`}
    >
      <span className={`absolute inset-x-2 top-1.5 h-1 rounded-full ${blocked ? 'bg-slate-200' : 'bg-indigo-200'}`} />
      {cell.label}
    </button>
  );
};

const SeatPreview = ({ blueprint, onToggleSeat, onReset }) => (
  <div className="rounded-[24px] border border-slate-200 bg-slate-50/50 p-6 shadow-sm">
    <div className="mb-6 flex items-start justify-between">
      <div>
        <h3 className="text-sm font-bold text-slate-900">Vehicle Blueprint Preview</h3>
        <p className="mt-1 text-[11px] font-medium text-slate-500">Tap seats to block/unblock them from the layout.</p>
      </div>
      <div className="flex flex-col items-end gap-2">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-indigo-700 shadow-sm">
          <Armchair size={12} />
          {countSeats(blueprint)} Selected
        </div>
        {blueprint?.lowerDeck?.length ? (
          <button
            type="button"
            onClick={onReset}
            className="text-[11px] font-bold text-slate-500 underline transition hover:text-slate-800"
          >
            Reset Blueprint
          </button>
        ) : null}
      </div>
    </div>

    <div className="space-y-3">
      {(blueprint?.lowerDeck || []).map((row, rowIndex) => (
        <div
          key={`row-${rowIndex}`}
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${Math.max(1, row.length)}, minmax(0, 1fr))` }}
        >
          {row.map((cell, cellIndex) => (
            <SeatCell
              key={`${rowIndex}-${cellIndex}-${cell?.id || 'aisle'}`}
              cell={cell}
              onToggle={() => onToggleSeat(cell?.id)}
            />
          ))}
        </div>
      ))}
      {!blueprint?.lowerDeck?.length ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm font-medium text-slate-400">
          Select a layout blueprint first.
        </div>
      ) : null}
    </div>
  </div>
);

const RentalVehicleTypes = ({ mode: propMode }) => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditor = propMode === 'create' || propMode === 'edit';
  const isView = propMode === 'view';
  const [items, setItems] = useState([]);
  const [serviceStores, setServiceStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [formData, setFormData] = useState(buildDefaultForm);
  const [togglingIds, setTogglingIds] = useState([]);
  const [galleryImageUrl, setGalleryImageUrl] = useState('');
  const [galleryTab, setGalleryTab] = useState('upload');

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);
      setErrorMessage('');
      try {
        const [response, serviceStoreResponse] = await Promise.all([
          adminService.getRentalVehicleTypes(),
          adminService.getServiceStores(),
        ]);
        const results =
          response?.data?.data?.results ||
          response?.data?.results ||
          response?.results ||
          [];
        const serviceStoreResults =
          serviceStoreResponse?.data?.data?.results ||
          serviceStoreResponse?.data?.results ||
          serviceStoreResponse?.results ||
          [];
        if (!mounted) return;
        setItems(results);
        setServiceStores(serviceStoreResults);

        if (id) {
          const selected = results.find((item) => String(item.id || item._id) === String(id));
          if (selected) {
            setFormData({
              transport_type: selected.transport_type || 'rental',
              name: selected.name || '',
              short_description: selected.short_description || '',
              description: selected.description || '',
              vehicleCategory: selected.vehicleCategory || 'Car',
              image: getCoverImage(selected),
              coverImage: getCoverImage(selected),
              galleryImages: getGalleryImages(selected),
              map_icon: selected.map_icon || '',
              capacity: Number(selected.capacity || countSeats(selected.blueprint)),
              luggageCapacity: Number(selected.luggageCapacity || 0),
              amenities: Array.isArray(selected.amenities) ? selected.amenities : [],
              serviceStoreIds: Array.isArray(selected.serviceStoreIds) ? selected.serviceStoreIds.map(String) : [],
              poolingEnabled: Boolean(selected.poolingEnabled),
              advancePayment: {
                enabled: Boolean(selected.advancePayment?.enabled),
                paymentMode: selected.advancePayment?.paymentMode || 'percentage',
                amount: Number(selected.advancePayment?.amount ?? 20),
                label: selected.advancePayment?.label || 'Advance booking payment',
                notes: selected.advancePayment?.notes || '',
              },
              blueprint: selected.blueprint?.lowerDeck?.length ? clone(selected.blueprint) : null,
              pricing: normalizePricing(selected.pricing),
              active: selected.active !== false,
              status: selected.status || 'active',
            });
          }
        } else if (propMode === 'create') {
          setFormData(buildDefaultForm());
        }
      } catch (error) {
        if (mounted) {
          setErrorMessage(error?.response?.data?.message || error.message || 'Could not load rental vehicles.');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, [id, propMode]);

  const totalActive = useMemo(() => items.filter((item) => item.active !== false).length, [items]);
  const selectedItem = useMemo(
    () => items.find((item) => String(item.id || item._id) === String(id)),
    [id, items],
  );

  const updateForm = (field, value) => {
    setFormData((current) => ({ ...current, [field]: value }));
  };

  const updateAdvancePayment = (field, value) => {
    setFormData((current) => ({
      ...current,
      advancePayment: {
        ...current.advancePayment,
        [field]: value,
      },
    }));
  };

  const toggleServiceStore = (storeId) => {
    const normalizedId = String(storeId);
    setFormData((current) => ({
      ...current,
      serviceStoreIds: current.serviceStoreIds.includes(normalizedId)
        ? current.serviceStoreIds.filter((item) => item !== normalizedId)
        : [...current.serviceStoreIds, normalizedId],
    }));
  };

  const handleTemplateChange = (templateKey) => {
    const blueprint = createBlueprintFromTemplate(templateKey);
    setFormData((current) => ({
      ...current,
      blueprint,
      capacity: countSeats(blueprint),
    }));
  };

  const toggleSeat = (seatId) => {
    if (!seatId) return;
    setFormData((current) => {
      const nextBlueprint = clone(current.blueprint);
      nextBlueprint.lowerDeck = (nextBlueprint.lowerDeck || []).map((row) =>
        row.map((cell) =>
          cell?.kind === 'seat' && cell.id === seatId
            ? { ...cell, status: cell.status === 'blocked' ? 'available' : 'blocked' }
            : cell,
        ),
      );

      return {
        ...current,
        blueprint: nextBlueprint,
        capacity: countSeats(nextBlueprint),
      };
    });
  };

  const resetBlueprint = () => {
    setFormData((current) => {
      if (!current.blueprint?.templateKey) return current;
      const originalBlueprint = createBlueprintFromTemplate(current.blueprint.templateKey);
      return {
        ...current,
        blueprint: originalBlueprint,
        capacity: countSeats(originalBlueprint),
      };
    });
  };

  const handleImageChange = async (event, field) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const result = await fileToDataUrl(file);
    updateForm(field, result);
    if (field === 'coverImage' || field === 'image') {
      updateForm('image', result);
      updateForm('coverImage', result);
    }
    event.target.value = '';
  };

  const handleGalleryImagesChange = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    const results = await Promise.all(files.map((file) => fileToDataUrl(file)));
    setFormData((current) => ({
      ...current,
      galleryImages: [...(Array.isArray(current.galleryImages) ? current.galleryImages : []), ...results.filter(Boolean)],
    }));
    event.target.value = '';
  };

  const removeGalleryImage = (indexToRemove) => {
    setFormData((current) => ({
      ...current,
      galleryImages: (Array.isArray(current.galleryImages) ? current.galleryImages : []).filter((_, index) => index !== indexToRemove),
    }));
  };

  const updateGalleryImage = (indexToUpdate, value) => {
    setFormData((current) => ({
      ...current,
      galleryImages: (Array.isArray(current.galleryImages) ? current.galleryImages : []).map((image, index) =>
        index === indexToUpdate ? value : image,
      ),
    }));
  };

  const replaceGalleryImage = async (event, indexToReplace) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const result = await fileToDataUrl(file);
    updateGalleryImage(indexToReplace, result);
    event.target.value = '';
  };

  const addGalleryImageByUrl = () => {
    const nextValue = galleryImageUrl.trim();
    if (!nextValue) return;
    setFormData((current) => ({
      ...current,
      galleryImages: [...(Array.isArray(current.galleryImages) ? current.galleryImages : []), nextValue],
    }));
    setGalleryImageUrl('');
  };

  const updatePricingRow = (pricingId, field, value) => {
    setFormData((current) => ({
      ...current,
      pricing: current.pricing.map((item) =>
        item.id === pricingId
          ? {
              ...item,
              [field]:
                ['durationHours', 'price', 'includedKm', 'extraHourPrice', 'extraKmPrice'].includes(field)
                  ? normalizeNumberInput(value)
                  : value,
            }
          : item,
      ),
    }));
  };

  const addPricingRow = () => {
    setFormData((current) => ({
      ...current,
      pricing: [
        ...current.pricing,
        {
          id: `pkg-${Date.now()}`,
          label: 'Custom Package',
          durationHours: '',
          price: '',
          includedKm: '',
          extraHourPrice: '',
          extraKmPrice: '',
          active: true,
        },
      ],
    }));
  };

  const removePricingRow = (pricingId) => {
    setFormData((current) => ({
      ...current,
      pricing: current.pricing.filter((item) => item.id !== pricingId),
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setErrorMessage('');

    try {
      const payload = {
        ...formData,
        image: formData.coverImage || formData.image || '',
        coverImage: formData.coverImage || formData.image || '',
        galleryImages: (Array.isArray(formData.galleryImages) ? formData.galleryImages : []).filter(Boolean),
        capacity: countSeats(formData.blueprint),
        active: formData.active,
        status: formData.active ? 'active' : 'inactive',
        blueprint: formData.blueprint,
        amenities: (Array.isArray(formData.amenities) ? formData.amenities : [])
          .map((item) => String(item).trim())
          .filter(Boolean),
        pricing: (Array.isArray(formData.pricing) ? formData.pricing : []).map((item) => ({
          ...item,
          durationHours: toNumberOrZero(item.durationHours),
          price: toNumberOrZero(item.price),
          includedKm: toNumberOrZero(item.includedKm),
          extraHourPrice: toNumberOrZero(item.extraHourPrice),
          extraKmPrice: toNumberOrZero(item.extraKmPrice),
        })),
      };

      if (!payload.name.trim()) {
        throw new Error('Vehicle name is required');
      }

      if (!payload.blueprint?.lowerDeck?.length) {
        throw new Error('Please select a layout blueprint');
      }

      if (id) {
        await adminService.updateRentalVehicleType(id, payload);
      } else {
        await adminService.createRentalVehicleType(payload);
      }

      toast.success(id ? 'Rental vehicle updated' : 'Rental vehicle created');
      navigate('/admin/pricing/rental-vehicles');
    } catch (error) {
      setErrorMessage(error?.response?.data?.message || error.message || 'Could not save rental vehicle.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (vehicleId) => {
    if (!window.confirm('Delete this rental vehicle type?')) return;
    try {
      await adminService.deleteRentalVehicleType(vehicleId);
      setItems((current) => current.filter((item) => String(item.id || item._id) !== String(vehicleId)));
      toast.success('Rental vehicle removed');
    } catch (error) {
      toast.error(error?.response?.data?.message || error.message || 'Could not delete rental vehicle.');
    }
  };

  const handleTogglePooling = async (item) => {
    const vehicleId = String(item.id || item._id);

    if (!vehicleId || togglingIds.includes(vehicleId)) {
      return;
    }

    const nextPoolingEnabled = !item.poolingEnabled;

    setTogglingIds((current) => [...current, vehicleId]);
    setItems((current) =>
      current.map((entry) =>
        String(entry.id || entry._id) === vehicleId
          ? { ...entry, poolingEnabled: nextPoolingEnabled }
          : entry,
      ),
    );

    try {
      const payload = {
        ...item,
        poolingEnabled: nextPoolingEnabled,
        capacity: Number(item.capacity || countSeats(item.blueprint)),
        active: item.active !== false,
        status: item.active !== false ? 'active' : 'inactive',
        amenities: Array.isArray(item.amenities) ? item.amenities : [],
        pricing: normalizePricing(item.pricing),
      };

      const response = await adminService.updateRentalVehicleType(vehicleId, payload);
      const updatedItem =
        response?.data?.data ||
        response?.data ||
        payload;

      setItems((current) =>
        current.map((entry) =>
          String(entry.id || entry._id) === vehicleId
            ? { ...entry, ...updatedItem, poolingEnabled: Boolean(updatedItem.poolingEnabled) }
            : entry,
        ),
      );
      toast.success(`Pooling ${nextPoolingEnabled ? 'enabled' : 'disabled'} for ${item.name}`);
    } catch (error) {
      setItems((current) =>
        current.map((entry) =>
          String(entry.id || entry._id) === vehicleId
            ? { ...entry, poolingEnabled: item.poolingEnabled }
            : entry,
        ),
      );
      toast.error(error?.response?.data?.message || error.message || 'Could not update pooling setting.');
    } finally {
      setTogglingIds((current) => current.filter((idValue) => idValue !== vehicleId));
    }
  };

  if (!isEditor && !isView) {
    return (
      <div className="min-h-screen bg-[#f6f7fb] p-6 lg:p-8">
        <div className="mb-6">
          <div className="mb-2 flex items-center gap-1.5 text-xs text-slate-400">
            <span>Pricing</span>
            <ChevronRight size={12} />
            <span className="text-slate-700">Rental Vehicles</span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Rental Vehicles</h1>
              <p className="mt-1 text-sm text-slate-500">Manage rental vehicles in one simple list and open any vehicle for full details.</p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/admin/pricing/rental-vehicles/create')}
              className="inline-flex items-center gap-2 rounded-xl bg-yellow-400 px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-yellow-500"
            >
              <Plus size={18} />
              Add Rental Vehicle
            </button>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-5 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                <Car size={20} />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-500">Total Types</p>
                <p className="text-2xl font-bold text-slate-900">{items.length}</p>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                <CheckCircle2 size={20} />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-500">Active Types</p>
                <p className="text-2xl font-bold text-slate-900">{totalActive}</p>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                <Clock3 size={20} />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-500">Hourly Packages</p>
                <p className="text-2xl font-bold text-slate-900">{items.reduce((sum, item) => sum + (item.pricing?.length || 0), 0)}</p>
              </div>
            </div>
          </div>
        </div>

        {errorMessage ? (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">
            {errorMessage}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-8 text-sm text-slate-400">Loading rental vehicles...</div>
        ) : items.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-8 text-sm text-slate-400">No rental vehicles configured yet.</div>
        ) : (
          <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
            <div className="grid grid-cols-[minmax(0,1.6fr)_110px_110px_120px_180px] gap-4 border-b border-slate-100 px-6 py-4 text-xs font-bold text-slate-500">
              <span>Vehicle</span>
              <span>Seats</span>
              <span>Bags</span>
              <span>Status</span>
              <span className="text-right">Actions</span>
            </div>
            {items.map((item) => (
              <div
                key={item.id || item._id}
                className="grid grid-cols-[minmax(0,1.6fr)_110px_110px_120px_180px] gap-4 border-b border-slate-100 px-6 py-4 last:border-b-0"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50">
                    {getCoverImage(item) ? (
                      <img src={getCoverImage(item)} alt={item.name} className="h-10 w-10 object-contain" />
                    ) : (
                      <Car size={20} className="text-slate-400" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">{item.name}</p>
                    <p className="truncate text-xs text-slate-500">{item.vehicleCategory || 'Rental vehicle'}</p>
                  </div>
                </div>
                <div className="flex items-center text-sm font-semibold text-slate-700">{item.capacity || 0}</div>
                <div className="flex items-center text-sm font-semibold text-slate-700">{item.luggageCapacity || 0}</div>
                <div className="flex items-center">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${item.active !== false ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {item.active !== false ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => navigate(`/admin/pricing/rental-vehicles/view/${item.id || item._id}`)}
                    className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    View details
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate(`/admin/pricing/rental-vehicles/edit/${item.id || item._id}`)}
                    className="rounded-xl p-2 text-slate-400 transition hover:bg-blue-50 hover:text-blue-600"
                    title="Edit"
                  >
                    <Edit2 size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(item.id || item._id)}
                    className="rounded-xl p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                    title="Delete"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (isView) {
    return (
      <div className="min-h-screen bg-[#f6f7fb] p-6 lg:p-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-xs text-slate-400">
              <span>Pricing</span>
              <ChevronRight size={12} />
              <span className="text-slate-700">Rental Vehicles</span>
              <ChevronRight size={12} />
              <span className="text-slate-700">View Details</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">{selectedItem?.name || 'Rental Vehicle Details'}</h1>
            <p className="mt-1 text-sm text-slate-500">A simple detail view for this rental vehicle type.</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/admin/pricing/rental-vehicles')}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <ArrowLeft size={16} />
              Back
            </button>
            {id ? (
              <button
                type="button"
                onClick={() => navigate(`/admin/pricing/rental-vehicles/edit/${id}`)}
                className="inline-flex items-center gap-2 rounded-xl bg-yellow-400 px-4 py-3 text-sm font-semibold text-black transition hover:bg-yellow-500"
              >
                <Edit2 size={16} />
                Edit
              </button>
            ) : null}
          </div>
        </div>

        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-8 text-sm text-slate-400">Loading rental vehicle details...</div>
        ) : !selectedItem ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-8 text-sm text-slate-400">Rental vehicle not found.</div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex h-52 items-center justify-center rounded-[24px] bg-slate-50">
                {getCoverImage(selectedItem) ? (
                  <img src={getCoverImage(selectedItem)} alt={selectedItem.name} className="max-h-44 w-full object-contain p-4" />
                ) : (
                  <Car size={42} className="text-slate-300" />
                )}
              </div>
              {getGalleryImages(selectedItem).length ? (
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {getGalleryImages(selectedItem).slice(0, 6).map((image, index) => (
                    <div key={`${selectedItem.id || selectedItem._id}-gallery-${index}`} className="overflow-hidden rounded-2xl bg-slate-50">
                      <img src={image} alt={`${selectedItem.name} gallery ${index + 1}`} className="h-20 w-full object-cover" />
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="mt-5">
                <p className="text-xl font-bold text-slate-900">{selectedItem.name}</p>
                <p className="mt-1 text-sm text-slate-500">{selectedItem.short_description || 'No short description added.'}</p>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Seats</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">{selectedItem.capacity || 0}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Bags</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">{selectedItem.luggageCapacity || 0}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Packages</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">{selectedItem.pricing?.length || 0}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Pooling</p>
                  <p className="mt-1 text-sm font-bold text-slate-900">{selectedItem.poolingEnabled ? 'Enabled' : 'Disabled'}</p>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-bold text-slate-900">Overview</h2>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Category</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{selectedItem.vehicleCategory || 'Rental vehicle'}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Status</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{selectedItem.active !== false ? 'Active' : 'Inactive'}</p>
                  </div>
                  <div className="md:col-span-2">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Description</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{selectedItem.description || 'No description added yet.'}</p>
                  </div>
                  <div className="md:col-span-2">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Amenities</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(selectedItem.amenities || []).length ? (
                        selectedItem.amenities.map((amenity) => (
                          <span key={amenity} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                            {amenity}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-slate-500">No amenities listed.</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-bold text-slate-900">Pricing Packages</h2>
                <div className="mt-4 space-y-3">
                  {(selectedItem.pricing || []).length ? (
                    selectedItem.pricing.map((price) => (
                      <div key={price.id} className="rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-4">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="text-sm font-bold text-slate-900">{price.label}</p>
                            <p className="text-xs text-slate-500">{price.durationHours} hours • {price.includedKm} km included</p>
                          </div>
                          <p className="text-base font-bold text-slate-900">Rs {price.price}</p>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                          <span className="rounded-full bg-white px-3 py-1">Extra hour: Rs {price.extraHourPrice}</span>
                          <span className="rounded-full bg-white px-3 py-1">Extra km: Rs {price.extraKmPrice}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-500">No pricing packages added.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
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
            <span className="text-slate-700">Rental Vehicles</span>
            <ChevronRight size={12} />
            <span className="text-slate-700">{id ? 'Edit' : 'Create'}</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{id ? 'Edit Rental Vehicle' : 'Create Rental Vehicle'}</h1>
          <p className="mt-1 text-sm text-slate-500">Configure self-drive vehicle details, pricing by hour, and a seat-based blueprint.</p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/admin/pricing/rental-vehicles')}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          <ArrowLeft size={16} />
          Back
        </button>
      </div>

      {errorMessage ? (
        <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">
          {errorMessage}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-1 gap-8 p-6 lg:grid-cols-2 lg:p-8">
          <div className="lg:col-span-2 rounded-[24px] border border-slate-200 bg-slate-50/70 px-5 py-4">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-indigo-500">Section 1</p>
            <h2 className="mt-1 text-lg font-black text-slate-900">Vehicle Identity</h2>
            <p className="mt-1 text-sm font-medium text-slate-500">
              Fill these fields to define what this rental vehicle is called, what category it belongs to, and how admins will recognize it.
            </p>
          </div>

          <div>
            <label className={labelClass}>Vehicle Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(event) => updateForm('name', event.target.value)}
              className={inputClass}
              placeholder="Honda Amaze"
            />
            <p className="mt-2 text-xs text-slate-500">This is the main vehicle title shown in the rental catalog.</p>
          </div>

          <div>
            <label className={labelClass}>Category *</label>
            <select
              value={formData.vehicleCategory}
              onChange={(event) => updateForm('vehicleCategory', event.target.value)}
              className={inputClass}
            >
              {['Bike', 'Auto', 'Car', 'SUV', 'Van'].map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-slate-500">Choose the overall class so the layout and pricing feel matched to the vehicle type.</p>
          </div>

          <div>
            <label className={labelClass}>Short Description</label>
            <input
              type="text"
              value={formData.short_description}
              onChange={(event) => updateForm('short_description', event.target.value)}
              className={inputClass}
              placeholder="Comfortable city self-drive option"
            />
            <p className="mt-2 text-xs text-slate-500">Use one short line that quickly explains the vehicle to the admin team.</p>
          </div>

          <div>
            <label className={labelClass}>Luggage Capacity</label>
            <input
              type="number"
              value={formData.luggageCapacity}
              onChange={(event) => updateForm('luggageCapacity', Number(event.target.value || 0))}
              className={inputClass}
              placeholder="2"
            />
            <p className="mt-2 text-xs text-slate-500">Set how many bags or luggage units this vehicle can comfortably carry.</p>
          </div>

          <div className="lg:col-span-2">
            <label className={labelClass}>Available Service Stores</label>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              {serviceStores.length === 0 ? (
                <p className="text-xs font-medium text-slate-500">No service stores available yet.</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    {serviceStores.map((store) => {
                      const storeId = String(store.id || store._id);
                      const selected = formData.serviceStoreIds.includes(storeId);
                      return (
                        <button
                          key={storeId}
                          type="button"
                          onClick={() => toggleServiceStore(storeId)}
                          className={`rounded-full border px-3 py-2 text-xs font-bold transition-all ${
                            selected
                              ? 'border-slate-900 bg-slate-900 text-white'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                          }`}
                        >
                          {store.name}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-3 text-xs text-slate-500">
                    Choose one or more stores where this rental vehicle will be available.
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="lg:col-span-2">
            <label className={labelClass}>Description</label>
            <textarea
              rows="4"
              value={formData.description}
              onChange={(event) => updateForm('description', event.target.value)}
              className={inputClass}
              placeholder="Add a clear rental vehicle description for admin and future app use."
            />
            <p className="mt-2 text-xs text-slate-500">Add a fuller explanation of the vehicle, comfort, or intended use.</p>
          </div>

          <div className="lg:col-span-2 rounded-[24px] border border-slate-200 bg-slate-50/70 px-5 py-4">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-indigo-500">Section 2</p>
            <h2 className="mt-1 text-lg font-black text-slate-900">Media And Preview</h2>
            <p className="mt-1 text-sm font-medium text-slate-500">
              Upload the vehicle image and review the live card preview so you can confirm the admin setup looks correct.
            </p>
          </div>

          <div>
            <label className={labelClass}>Vehicle Image</label>
            <div className="rounded-2xl border border-dashed border-slate-300 p-4">
              <div className="flex min-h-[280px] items-center justify-center overflow-hidden rounded-2xl bg-slate-50">
                {formData.coverImage ? (
                  <img src={formData.coverImage} alt="Vehicle preview" className="max-h-[240px] w-full object-contain p-4" />
                ) : (
                  <label className="flex cursor-pointer flex-col items-center gap-3 text-center">
                    <input type="file" accept="image/*" className="hidden" onChange={(event) => handleImageChange(event, 'coverImage')} />
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-indigo-600 shadow-sm">
                      <ImagePlus size={20} />
                    </span>
                    <span className="text-sm font-semibold text-slate-700">Upload cover image</span>
                  </label>
                )}
              </div>
              {formData.coverImage ? (
                <div className="mt-3 flex gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white">
                    Change
                    <input type="file" accept="image/*" className="hidden" onChange={(event) => handleImageChange(event, 'coverImage')} />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      updateForm('image', '');
                      updateForm('coverImage', '');
                    }}
                    className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-bold text-rose-600"
                  >
                    Remove
                  </button>
                </div>
              ) : null}
            </div>
            <p className="mt-2 text-xs text-slate-500">This cover image becomes the main rental vehicle card image.</p>
          </div>

          <div>
            <label className={labelClass}>Gallery Images</label>
            <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-5 border-b border-slate-100">
                <div className="flex gap-6">
                  <button
                    type="button"
                    onClick={() => setGalleryTab('upload')}
                    className={`border-b-2 py-3 text-sm font-bold transition-all ${galleryTab === 'upload' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                  >
                    Upload Images
                  </button>
                  <button
                    type="button"
                    onClick={() => setGalleryTab('url')}
                    className={`border-b-2 py-3 text-sm font-bold transition-all ${galleryTab === 'url' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                  >
                    Image URL
                  </button>
                </div>
              </div>

              {galleryTab === 'upload' ? (
                <div className="mb-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 p-6 text-center">
                  <label className="inline-flex cursor-pointer flex-col items-center gap-3">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-indigo-600 shadow-sm">
                      <ImagePlus size={20} />
                    </span>
                    <span className="text-sm font-bold text-slate-700">Click to browse gallery images</span>
                    <span className="text-xs font-medium text-slate-400">JPG, PNG up to 5MB</span>
                    <input type="file" accept="image/*" multiple className="hidden" onChange={handleGalleryImagesChange} />
                  </label>
                </div>
              ) : (
                <div className="mb-6 flex flex-col gap-3 sm:flex-row">
                  <input
                    type="text"
                    value={galleryImageUrl}
                    onChange={(event) => setGalleryImageUrl(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        addGalleryImageByUrl();
                      }
                    }}
                    className={inputClass}
                    placeholder="Paste gallery image URL"
                  />
                  <button
                    type="button"
                    onClick={addGalleryImageByUrl}
                    className="whitespace-nowrap rounded-xl bg-slate-900 px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800"
                  >
                    Add URL
                  </button>
                </div>
              )}

              <div>
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">Gallery Manager</h3>
                {formData.galleryImages.length ? (
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                    {formData.galleryImages.map((image, index) => (
                      <div key={`gallery-${index}`} className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 transition hover:border-indigo-200 hover:shadow-md">
                        <div className="overflow-hidden rounded-xl bg-slate-50">
                          <img src={image} alt={`Gallery ${index + 1}`} className="h-28 w-full object-cover" />
                        </div>
                        <div className="mt-3 flex flex-col gap-2">
                          <input
                            type="text"
                            value={image}
                            onChange={(event) => updateGalleryImage(index, event.target.value)}
                            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-[10px] text-slate-600 outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                            placeholder="Image URL"
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <label className="flex cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-white py-1.5 text-[10px] font-bold text-slate-600 transition hover:bg-slate-50">
                              Replace
                              <input type="file" accept="image/*" className="hidden" onChange={(event) => replaceGalleryImage(event, index)} />
                            </label>
                            <button
                              type="button"
                              onClick={() => removeGalleryImage(index)}
                              className="rounded-lg border border-rose-200 bg-rose-50 py-1.5 text-[10px] font-bold text-rose-600 transition hover:bg-rose-100"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 py-10 text-center text-sm font-medium text-slate-400">
                    No images in gallery yet.
                  </div>
                )}
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-500">Cover stays separate. Gallery images are shown as supporting detail shots.</p>
          </div>

          <div className="space-y-6">
            <div className="rounded-[24px] border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-slate-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Live Summary</p>
              <div className="mt-4 flex items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm">
                  {formData.coverImage ? (
                    <img src={formData.coverImage} alt={formData.name || 'Vehicle'} className="h-12 w-12 object-contain" />
                  ) : (
                    <Car size={24} className="text-slate-400" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-lg font-black text-slate-900">{formData.name || 'Rental Vehicle'}</p>
                  <p className="truncate text-sm font-semibold text-slate-500">{formData.short_description || 'Your hourly rental setup preview appears here.'}</p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-2 text-slate-500">
                    <Armchair size={15} />
                    <span className="text-[11px] font-bold uppercase tracking-wide">Seats</span>
                  </div>
                  <p className="mt-1 text-lg font-black text-slate-900">{countSeats(formData.blueprint)}</p>
                </div>
                <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-2 text-slate-500">
                    <Luggage size={15} />
                    <span className="text-[11px] font-bold uppercase tracking-wide">Bags</span>
                  </div>
                  <p className="mt-1 text-lg font-black text-slate-900">{formData.luggageCapacity}</p>
                </div>
              </div>
            </div>

            <div>
              <label className={labelClass}>Amenities</label>
              <input
                type="text"
                value={formData.amenities.join(', ')}
                onChange={(event) =>
                  updateForm(
                    'amenities',
                    event.target.value
                      .split(',')
                      .map((item) => item.trim())
                      .filter(Boolean),
                  )
                }
                className={inputClass}
                placeholder="AC, GPS, Charging Port"
              />
              <p className="mt-2 text-xs text-slate-500">Use comma separated amenities for quick admin setup.</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <label className="text-sm font-bold text-slate-900">Enable Pooling</label>
                  <p className="mt-1 text-xs text-slate-500">
                    Turn this on if this rental vehicle type is allowed to be used in pooled or shared rental flows.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => updateForm('poolingEnabled', !formData.poolingEnabled)}
                  className={`relative h-7 w-14 rounded-full transition-all ${formData.poolingEnabled ? 'bg-sky-500' : 'bg-slate-300'}`}
                  aria-pressed={formData.poolingEnabled}
                >
                  <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${formData.poolingEnabled ? 'left-8' : 'left-1'}`} />
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <CreditCard size={16} className="text-slate-400" />
                    <label className="text-sm font-bold text-slate-900">Advance Booking Payment</label>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Decide whether users must pay some amount upfront when they book this rental vehicle in advance.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => updateAdvancePayment('enabled', !formData.advancePayment?.enabled)}
                  className={`relative h-7 w-14 rounded-full transition-all ${formData.advancePayment?.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
                  aria-pressed={formData.advancePayment?.enabled}
                >
                  <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${formData.advancePayment?.enabled ? 'left-8' : 'left-1'}`} />
                </button>
              </div>

              {formData.advancePayment?.enabled ? (
                <div className="mt-4 space-y-4 rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                  <div>
                    <label className={labelClass}>Advance Payment Mode</label>
                    <select
                      value={formData.advancePayment?.paymentMode || 'percentage'}
                      onChange={(event) => updateAdvancePayment('paymentMode', event.target.value)}
                      className={inputClass}
                    >
                      <option value="percentage">Percentage of rental total</option>
                      <option value="fixed">Fixed amount</option>
                      <option value="full">Full amount</option>
                    </select>
                  </div>

                  <div>
                    <label className={labelClass}>Payment Label</label>
                    <input
                      type="text"
                      value={formData.advancePayment?.label || ''}
                      onChange={(event) => updateAdvancePayment('label', event.target.value)}
                      className={inputClass}
                      placeholder="Advance booking payment"
                    />
                  </div>

                  <div>
                    <label className={labelClass}>
                      {formData.advancePayment?.paymentMode === 'percentage'
                        ? 'Advance Percentage'
                        : formData.advancePayment?.paymentMode === 'full'
                          ? 'Full Payment Value'
                          : 'Custom Advance Amount'}
                    </label>
                    <input
                      type="number"
                      min="0"
                      max={formData.advancePayment?.paymentMode === 'percentage' ? '100' : undefined}
                      value={formData.advancePayment?.amount ?? 0}
                      onChange={(event) => updateAdvancePayment('amount', Number(event.target.value || 0))}
                      className={inputClass}
                      placeholder={formData.advancePayment?.paymentMode === 'percentage' ? '20' : '500'}
                    />
                    <p className="mt-2 text-xs text-slate-500">
                      {formData.advancePayment?.paymentMode === 'percentage'
                        ? 'Enter the percentage of the rental total that the user must pay upfront.'
                        : formData.advancePayment?.paymentMode === 'full'
                          ? 'Full payment charges the full rental total during booking. Amount is kept only as a fallback.'
                          : 'Enter the exact amount the user must pay upfront while booking this vehicle.'}
                    </p>
                  </div>

                  <div>
                    <label className={labelClass}>Admin Note</label>
                    <textarea
                      rows="3"
                      value={formData.advancePayment?.notes || ''}
                      onChange={(event) => updateAdvancePayment('notes', event.target.value)}
                      className={inputClass}
                      placeholder="Optional note about how advance booking payment works for this vehicle."
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Layout Blueprint</h2>
                <p className="text-xs font-medium text-slate-500">Choose the closest layout and customize blocked seats if needed.</p>
              </div>
              <div className="rounded-full bg-slate-50 px-4 py-2 text-xs font-bold text-slate-600">
                Capacity auto-sync: {countSeats(formData.blueprint)} seats
              </div>
            </div>

            <div className="mb-5 flex flex-wrap gap-3">
              {RENTAL_BLUEPRINT_TEMPLATES.map((template) => {
                const active = formData.blueprint?.templateKey === template.key;
                return (
                  <button
                    key={template.key}
                    type="button"
                    onClick={() => handleTemplateChange(template.key)}
                    className={`rounded-2xl border px-4 py-3 text-left transition-all ${
                      active
                        ? 'border-slate-900 bg-slate-900 text-white shadow-lg'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <p className="text-sm font-bold">{template.label}</p>
                    <p className={`text-[10px] font-bold uppercase tracking-wide ${active ? 'text-slate-300' : 'text-slate-400'}`}>
                      {template.category}
                    </p>
                </button>
              );
            })}
            </div>

            <SeatPreview blueprint={formData.blueprint} onToggleSeat={toggleSeat} onReset={resetBlueprint} />
            <p className="mt-3 text-xs text-slate-500">
              Pick the closest vehicle seating blueprint first, then block any seat positions you do not want included in the rental layout.
            </p>
          </div>

          <div className="lg:col-span-2 rounded-[24px] border border-slate-200 bg-slate-50/70 px-5 py-4">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-indigo-500">Section 3</p>
            <h2 className="mt-1 text-lg font-black text-slate-900">Pricing Setup</h2>
            <p className="mt-1 text-sm font-medium text-slate-500">
              Define how much the vehicle costs for different rental durations like 6 hours, 12 hours, or 24 hours.
            </p>
          </div>

          <div className="lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Hourly Pricing Packages</h2>
                <p className="text-xs font-medium text-slate-500">Set separate rent for 6 hours, 12 hours, 24 hours, or any custom duration.</p>
              </div>
              <button
                type="button"
                onClick={addPricingRow}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-bold text-slate-700 shadow-sm border border-slate-200"
              >
                <Plus size={15} />
                Add Package
              </button>
            </div>
            <div className="space-y-4">
              {formData.pricing.map((price) => (
                <div key={price.id} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="mb-5 flex items-center justify-between border-b border-slate-100 pb-4">
                    <div>
                      <p className="text-sm font-bold text-slate-900">{price.label || 'New Package'}</p>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Rental package configuration</p>
                    </div>
                    {formData.pricing.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => removePricingRow(price.id)}
                        className="rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-rose-600 transition hover:bg-rose-100"
                        title="Remove package"
                      >
                        <Trash2 size={16} />
                      </button>
                    ) : null}
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    <div>
                      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500">Package Name</label>
                      <input
                        value={price.label}
                        onChange={(event) => updatePricingRow(price.id, 'label', event.target.value)}
                        className={inputClass}
                        placeholder="e.g. 6 Hours"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500">Duration (Hours)</label>
                      <input
                        type="number"
                        value={price.durationHours}
                        onChange={(event) => updatePricingRow(price.id, 'durationHours', event.target.value)}
                        className={inputClass}
                        placeholder="6"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500">Base Price (Rs)</label>
                      <input
                        type="number"
                        value={price.price}
                        onChange={(event) => updatePricingRow(price.id, 'price', event.target.value)}
                        className={inputClass}
                        placeholder="799"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500">Included Distance (KM)</label>
                      <input
                        type="number"
                        value={price.includedKm}
                        onChange={(event) => updatePricingRow(price.id, 'includedKm', event.target.value)}
                        className={inputClass}
                        placeholder="60"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500">Extra Hour Fee (Rs)</label>
                      <input
                        type="number"
                        value={price.extraHourPrice}
                        onChange={(event) => updatePricingRow(price.id, 'extraHourPrice', event.target.value)}
                        className={inputClass}
                        placeholder="120"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500">Extra KM Fee (Rs)</label>
                      <input
                        type="number"
                        value={price.extraKmPrice}
                        onChange={(event) => updatePricingRow(price.id, 'extraKmPrice', event.target.value)}
                        className={inputClass}
                        placeholder="12"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="lg:col-span-2 rounded-[24px] border border-slate-200 bg-slate-50/70 px-5 py-4">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-indigo-500">Section 4</p>
            <h2 className="mt-1 text-lg font-black text-slate-900">Publish Setup</h2>
            <p className="mt-1 text-sm font-medium text-slate-500">
              Control the visibility and live status of this rental vehicle in the mobile app.
            </p>
          </div>

          <div className="lg:col-span-2 rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-slate-900">Visible in User App</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  When enabled, this rental vehicle type is publicly visible and can be booked by users. When disabled, it is hidden.
                </p>
              </div>
              <button
                type="button"
                onClick={() => updateForm('active', !formData.active)}
                className={`relative h-7 w-14 rounded-full transition-all ${formData.active ? 'bg-emerald-500' : 'bg-slate-300'}`}
                aria-pressed={formData.active}
              >
                <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${formData.active ? 'left-8' : 'left-1'}`} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky Bottom Action Bar */}
      <div className="sticky bottom-0 z-40 mt-8 -mx-6 -mb-6 border-t border-slate-200 bg-white/90 px-6 py-4 backdrop-blur-md lg:-mx-8 lg:-mb-8 lg:px-8">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-500">
            {id ? 'Ensure all changes are saved.' : 'Ensure blueprint and pricing are complete.'}
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={async () => {
                updateForm('active', false);
                setTimeout(handleSave, 0);
              }}
              disabled={isSaving}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save Draft'}
            </button>
            <button
              type="button"
              onClick={async () => {
                updateForm('active', true);
                setTimeout(handleSave, 0);
              }}
              disabled={isSaving}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-white" />
                  Saving...
                </>
              ) : (
                <>
                  <Save size={16} />
                  {id ? 'Update Vehicle' : 'Create Vehicle'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RentalVehicleTypes;
