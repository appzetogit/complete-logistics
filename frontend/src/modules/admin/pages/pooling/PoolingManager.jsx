import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CalendarDays,
  Car,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Edit2,
  IndianRupee,
  MapPin,
  Plus,
  Route,
  Save,
  Search,
  ShieldCheck,
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
const DAY_OPTIONS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const errorInputClass = 'border-rose-300 bg-rose-50/60 focus:border-rose-300 focus:ring-rose-100';
const getInputClasses = (hasError = false) => `${inputClass} ${hasError ? errorInputClass : ''}`;

const createStop = (type = 'stop', sequence = 1) => ({
  id: `stop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  name: '',
  address: '',
  landmark: '',
  stopType: type,
  sequence,
  etaMinutes: 0,
});

const createSchedule = () => ({
  id: `schedule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  label: '',
  departureTime: '',
  arrivalTime: '',
  activeDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
  status: 'active',
});

const buildDefaultForm = () => ({
  routeName: '',
  routeCode: '',
  originLabel: '',
  destinationLabel: '',
  description: '',
  assignedVehicleTypeIds: [],
  pickupPoints: [createStop('pickup', 1)],
  dropPoints: [createStop('drop', 1)],
  stops: [createStop('stop', 1)],
  schedules: [createSchedule()],
  farePerSeat: 0,
  maxSeatsPerBooking: 1,
  maxAdvanceBookingHours: 24,
  boardingBufferMinutes: 15,
  poolingRules: {
    allowInstantBooking: true,
    allowLuggage: true,
    womenOnly: false,
    autoAssignNearestPickup: true,
    maxDetourKm: 5,
  },
  status: 'active',
  active: true,
});

const clone = (value) => JSON.parse(JSON.stringify(value));

const countBlueprintSeats = (blueprint = {}) => {
  if (Array.isArray(blueprint?.layout)) {
    return blueprint.layout.filter(cell => cell.type === 'seat').length;
  }
  return 0;
};

const BlueprintMini = ({ blueprint }) => {
  const layout = blueprint?.layout || [];
  const rows = blueprint?.rows || 0;
  const cols = blueprint?.cols || 0;

  if (!layout.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-[11px] font-semibold text-slate-400">
        No layout blueprint
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2">
      <div 
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {layout.map((cell, idx) => (
          <div
            key={idx}
            className={`h-2.5 rounded-sm ${
              cell.type === 'seat' 
                ? 'bg-indigo-400' 
                : cell.type === 'driver' 
                ? 'bg-slate-900' 
                : 'bg-slate-200'
            }`}
          />
        ))}
      </div>
    </div>
  );
};

const StopEditor = ({ title, helper, items, stopType, onChange, onAdd, onRemove, errors = {} }) => (
  <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm flex flex-col h-full">
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h3 className="text-lg font-black text-slate-900">{title}</h3>
        <p className="mt-1 text-xs font-medium text-slate-500 leading-relaxed">{helper}</p>
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="shrink-0 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 active:scale-95"
      >
        <Plus size={16} />
        Add
      </button>
    </div>

    <div className="space-y-5 flex-1">
      {errors.group ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-600">
          {errors.group}
        </div>
      ) : null}
      {items.map((item, index) => (
        <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 transition-all hover:bg-slate-50 hover:shadow-md">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-[10px] font-black text-white">
                {index + 1}
              </span>
              <p className="text-[13px] font-black uppercase tracking-wider text-slate-900">
                {title.slice(0, -1)} Detail
              </p>
            </div>
            {items.length > 1 ? (
              <button
                type="button"
                onClick={() => onRemove(item.id)}
                className="rounded-xl border border-rose-100 bg-white p-2 text-rose-500 shadow-sm transition hover:bg-rose-50 hover:border-rose-200 active:scale-90"
              >
                <Trash2 size={16} />
              </button>
            ) : null}
          </div>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400">Point Name</label>
                <input
                  value={item.name}
                  onChange={(event) => onChange(item.id, 'name', event.target.value)}
                  className={getInputClasses(Boolean(errors[`${item.id}.name`]))}
                  placeholder="e.g. Main Gate, Tower A"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400">Address / Location</label>
                <input
                  value={item.address}
                  onChange={(event) => onChange(item.id, 'address', event.target.value)}
                  className={getInputClasses(Boolean(errors[`${item.id}.address`]))}
                  placeholder="Street name, Area"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400">Landmark</label>
                <input
                  value={item.landmark}
                  onChange={(event) => onChange(item.id, 'landmark', event.target.value)}
                  className={getInputClasses(Boolean(errors[`${item.id}.landmark`]))}
                  placeholder="Near Park, Mall"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400">ETA (Min)</label>
                <div className="relative">
                  <input
                    type="number"
                    value={item.etaMinutes}
                    onChange={(event) => onChange(item.id, 'etaMinutes', Number(event.target.value || 0))}
                    className={`${getInputClasses(Boolean(errors[`${item.id}.etaMinutes`]))} pr-12`}
                    placeholder="0"
                  />
                  <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Min</span>
                  </div>
                </div>
              </div>
            </div>
            {errors[`${item.id}.name`] || errors[`${item.id}.address`] || errors[`${item.id}.etaMinutes`] ? (
              <p className="text-xs font-semibold text-rose-600">
                {errors[`${item.id}.name`] || errors[`${item.id}.address`] || errors[`${item.id}.etaMinutes`]}
              </p>
            ) : null}

            {stopType === 'stop' ? (
              <div className="pt-2 border-t border-slate-200/60">
                <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400">Action At Stop</label>
                <select
                  value={item.stopType}
                  onChange={(event) => onChange(item.id, 'stopType', event.target.value)}
                  className={getInputClasses(Boolean(errors[`${item.id}.stopType`]))}
                >
                  <option value="stop">Middle Stop Only</option>
                  <option value="pickup">Allow Pickup</option>
                  <option value="drop">Allow Drop</option>
                  <option value="both">Allow Pickup & Drop</option>
                </select>
              </div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  </div>
);

const PoolingManager = ({ mode: propMode }) => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditor = propMode === 'create' || propMode === 'edit';
  const [routes, setRoutes] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [validationErrors, setValidationErrors] = useState({});
  const [formData, setFormData] = useState(buildDefaultForm);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);
      setErrorMessage('');
      try {
        const [routesResponse, vehiclesResponse] = await Promise.all([
          adminService.getPoolingRoutes(),
          adminService.getPoolingVehicles(),
        ]);

        const routeResults =
          routesResponse?.data?.data?.results ||
          routesResponse?.data?.results ||
          routesResponse?.results ||
          [];
        const vehicleResults = vehiclesResponse?.data || [];
        const poolingVehicles = vehicleResults.filter((item) => item.status === 'active');

        if (!mounted) return;

        setRoutes(routeResults);
        setVehicles(poolingVehicles);

        if (id) {
          const selected = routeResults.find((item) => String(item.id || item._id) === String(id));
          if (selected) {
            setFormData({
              routeName: selected.routeName || '',
              routeCode: selected.routeCode || '',
              originLabel: selected.originLabel || '',
              destinationLabel: selected.destinationLabel || '',
              description: selected.description || '',
              assignedVehicleTypeIds: Array.isArray(selected.assignedVehicleTypeIds)
                ? selected.assignedVehicleTypeIds.map(String)
                : [],
              pickupPoints:
                Array.isArray(selected.pickupPoints) && selected.pickupPoints.length
                  ? clone(selected.pickupPoints)
                  : [createStop('pickup', 1)],
              dropPoints:
                Array.isArray(selected.dropPoints) && selected.dropPoints.length
                  ? clone(selected.dropPoints)
                  : [createStop('drop', 1)],
              stops:
                Array.isArray(selected.stops) && selected.stops.length
                  ? clone(selected.stops)
                  : [createStop('stop', 1)],
              schedules:
                Array.isArray(selected.schedules) && selected.schedules.length
                  ? clone(selected.schedules)
                  : [createSchedule()],
              farePerSeat: Number(selected.farePerSeat || 0),
              maxSeatsPerBooking: Number(selected.maxSeatsPerBooking || 1),
              maxAdvanceBookingHours: Number(selected.maxAdvanceBookingHours || 24),
              boardingBufferMinutes: Number(selected.boardingBufferMinutes || 15),
              poolingRules: {
                allowInstantBooking: selected.poolingRules?.allowInstantBooking !== false,
                allowLuggage: selected.poolingRules?.allowLuggage !== false,
                womenOnly: Boolean(selected.poolingRules?.womenOnly),
                autoAssignNearestPickup: selected.poolingRules?.autoAssignNearestPickup !== false,
                maxDetourKm: Number(selected.poolingRules?.maxDetourKm || 5),
              },
              status: selected.status || 'active',
              active: selected.active !== false,
            });
          }
        } else if (propMode === 'create') {
          setFormData(buildDefaultForm());
        }
      } catch (error) {
        if (mounted) {
          setErrorMessage(error?.response?.data?.message || error.message || 'Could not load pooling routes.');
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

  const activeRoutes = useMemo(
    () => routes.filter((item) => item.status === 'active').length,
    [routes],
  );

  const selectedVehicles = useMemo(
    () =>
      vehicles.filter((vehicle) =>
        formData.assignedVehicleTypeIds.includes(String(vehicle.id || vehicle._id)),
      ),
    [vehicles, formData.assignedVehicleTypeIds],
  );

  const updateForm = (field, value) => {
    setValidationErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    setFormData((current) => ({ ...current, [field]: value }));
  };

  const updateNestedRule = (field, value) => {
    setValidationErrors((current) => {
      const key = `poolingRules.${field}`;
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
    setFormData((current) => ({
      ...current,
      poolingRules: {
        ...current.poolingRules,
        [field]: value,
      },
    }));
  };

  const updateStopGroup = (field, stopId, key, value) => {
    setValidationErrors((current) => {
      const next = { ...current };
      delete next[`${field}.group`];
      delete next[`${stopId}.${key}`];
      return next;
    });
    setFormData((current) => ({
      ...current,
      [field]: current[field].map((item) =>
        item.id === stopId ? { ...item, [key]: value } : item,
      ),
    }));
  };

  const addStopGroupItem = (field, type) => {
    setFormData((current) => ({
      ...current,
      [field]: [...current[field], createStop(type, current[field].length + 1)],
    }));
  };

  const removeStopGroupItem = (field, stopId) => {
    setFormData((current) => ({
      ...current,
      [field]: current[field].filter((item) => item.id !== stopId),
    }));
  };

  const updateSchedule = (scheduleId, key, value) => {
    setValidationErrors((current) => {
      const next = { ...current };
      delete next.schedules;
      delete next[`${scheduleId}.${key}`];
      return next;
    });
    setFormData((current) => ({
      ...current,
      schedules: current.schedules.map((item) =>
        item.id === scheduleId ? { ...item, [key]: value } : item,
      ),
    }));
  };

  const toggleScheduleDay = (scheduleId, day) => {
    setValidationErrors((current) => {
      const next = { ...current };
      delete next.schedules;
      delete next[`${scheduleId}.activeDays`];
      return next;
    });
    setFormData((current) => ({
      ...current,
      schedules: current.schedules.map((item) => {
        if (item.id !== scheduleId) return item;
        const activeDays = item.activeDays.includes(day)
          ? item.activeDays.filter((entry) => entry !== day)
          : [...item.activeDays, day];
        return { ...item, activeDays };
      }),
    }));
  };

  const addSchedule = () => {
    setFormData((current) => ({
      ...current,
      schedules: [...current.schedules, createSchedule()],
    }));
  };

  const removeSchedule = (scheduleId) => {
    setFormData((current) => ({
      ...current,
      schedules: current.schedules.filter((item) => item.id !== scheduleId),
    }));
  };

  const toggleVehicle = (vehicleId) => {
    const normalizedId = String(vehicleId);
    setValidationErrors((current) => {
      if (!current.assignedVehicleTypeIds) return current;
      const next = { ...current };
      delete next.assignedVehicleTypeIds;
      return next;
    });
    setFormData((current) => ({
      ...current,
      assignedVehicleTypeIds: current.assignedVehicleTypeIds.includes(normalizedId)
        ? current.assignedVehicleTypeIds.filter((item) => item !== normalizedId)
        : [...current.assignedVehicleTypeIds, normalizedId],
    }));
  };

  const validateStops = (items = [], field) => {
    const errors = {};
    const filledItems = items.filter((item) =>
      item.name.trim() || item.address.trim() || item.landmark.trim() || Number(item.etaMinutes || 0) > 0,
    );

    if (filledItems.length === 0) {
      errors[`${field}.group`] = `Add at least one ${field === 'pickupPoints' ? 'pickup point' : field === 'dropPoints' ? 'drop point' : 'middle stop'}.`;
      return errors;
    }

    filledItems.forEach((item) => {
      if (!item.name.trim()) {
        errors[`${item.id}.name`] = 'Point name is required.';
      } else if (!item.address.trim()) {
        errors[`${item.id}.address`] = 'Address is required.';
      } else if (Number(item.etaMinutes || 0) < 0) {
        errors[`${item.id}.etaMinutes`] = 'ETA cannot be negative.';
      }
    });

    return errors;
  };

  const validateForm = () => {
    const errors = {};
    const filledSchedules = formData.schedules.filter((item) => item.label.trim() || item.departureTime || item.arrivalTime);

    if (!formData.routeName.trim()) errors.routeName = 'Route name is required.';
    if (!formData.originLabel.trim()) errors.originLabel = 'Origin location is required.';
    if (!formData.destinationLabel.trim()) errors.destinationLabel = 'Destination is required.';
    if (formData.assignedVehicleTypeIds.length === 0) errors.assignedVehicleTypeIds = 'Select at least one pooling-enabled vehicle.';
    if (Number(formData.farePerSeat || 0) <= 0) errors.farePerSeat = 'Fare per seat must be greater than zero.';
    if (Number(formData.maxSeatsPerBooking || 0) <= 0) errors.maxSeatsPerBooking = 'Max seats per booking must be at least 1.';
    if (Number(formData.maxAdvanceBookingHours || 0) < 0) errors.maxAdvanceBookingHours = 'Advance booking window cannot be negative.';
    if (Number(formData.boardingBufferMinutes || 0) < 0) errors.boardingBufferMinutes = 'Boarding buffer cannot be negative.';
    if (Number(formData.poolingRules?.maxDetourKm || 0) < 0) errors['poolingRules.maxDetourKm'] = 'Maximum detour cannot be negative.';

    Object.assign(errors, validateStops(formData.pickupPoints, 'pickupPoints'));
    Object.assign(errors, validateStops(formData.dropPoints, 'dropPoints'));

    if (filledSchedules.length === 0) {
      errors.schedules = 'Add at least one schedule.';
    } else {
      filledSchedules.forEach((schedule) => {
        if (!schedule.label.trim()) errors[`${schedule.id}.label`] = 'Schedule label is required.';
        if (!schedule.departureTime) errors[`${schedule.id}.departureTime`] = 'Departure time is required.';
        if (!schedule.arrivalTime) errors[`${schedule.id}.arrivalTime`] = 'Arrival time is required.';
        if (!Array.isArray(schedule.activeDays) || schedule.activeDays.length === 0) errors[`${schedule.id}.activeDays`] = 'Select at least one active day.';
      });
    }

    return errors;
  };

  const handleSave = async () => {
    setIsSaving(true);
    setErrorMessage('');
    const nextValidationErrors = validateForm();
    setValidationErrors(nextValidationErrors);

    try {
      if (Object.keys(nextValidationErrors).length > 0) {
        throw new Error('Please fix the highlighted pooling route fields.');
      }

      const payload = {
        ...formData,
        pickupPoints: formData.pickupPoints
          .map((item, index) => ({ ...item, sequence: index + 1, stopType: 'pickup' }))
          .filter((item) => item.name.trim() || item.address.trim()),
        dropPoints: formData.dropPoints
          .map((item, index) => ({ ...item, sequence: index + 1, stopType: 'drop' }))
          .filter((item) => item.name.trim() || item.address.trim()),
        stops: formData.stops
          .map((item, index) => ({ ...item, sequence: index + 1 }))
          .filter((item) => item.name.trim() || item.address.trim()),
        schedules: formData.schedules.filter(
          (item) => item.label.trim() || item.departureTime || item.arrivalTime,
        ),
        status: formData.active ? formData.status : 'draft',
      };

      if (!payload.routeName.trim()) {
        throw new Error('Pooling route name is required');
      }

      if (!payload.originLabel.trim()) {
        throw new Error('Origin location is required');
      }

      if (!payload.destinationLabel.trim()) {
        throw new Error('Destination location is required');
      }

      if (payload.assignedVehicleTypeIds.length === 0) {
        throw new Error('Select at least one pooling-enabled vehicle');
      }

      if (id) {
        await adminService.updatePoolingRoute(id, payload);
      } else {
        await adminService.createPoolingRoute(payload);
      }

      toast.success(id ? 'Pooling route updated' : 'Pooling route created');
      navigate('/admin/pooling/routes');
    } catch (error) {
      setErrorMessage(error?.response?.data?.message || error.message || 'Could not save pooling route.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (routeId) => {
    if (!window.confirm('Delete this pooling route?')) return;
    try {
      await adminService.deletePoolingRoute(routeId);
      setRoutes((current) => current.filter((item) => String(item.id || item._id) !== String(routeId)));
      toast.success('Pooling route removed');
    } catch (error) {
      toast.error(error?.response?.data?.message || error.message || 'Could not delete pooling route.');
    }
  };

  const filteredRoutes = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return routes;

    return routes.filter((item) => {
      const matchName = item.routeName?.toLowerCase().includes(query) || item.routeCode?.toLowerCase().includes(query);
      const matchLocation = item.originLabel?.toLowerCase().includes(query) || item.destinationLabel?.toLowerCase().includes(query);
      const matchStatus = item.status?.toLowerCase().includes(query);
      const matchVehicle = item.assignedVehicles?.some((v) => v.name?.toLowerCase().includes(query) || v.vehicleType?.toLowerCase().includes(query));
      const matchStop = item.stops?.some((s) => s.name?.toLowerCase().includes(query) || s.address?.toLowerCase().includes(query));
      const matchPickup = item.pickupPoints?.some((s) => s.name?.toLowerCase().includes(query));
      const matchDrop = item.dropPoints?.some((s) => s.name?.toLowerCase().includes(query));

      return matchName || matchLocation || matchStatus || matchVehicle || matchStop || matchPickup || matchDrop;
    });
  }, [routes, searchTerm]);

  const handleToggleStatus = async (routeId, currentStatus) => {
    const nextStatus = currentStatus === 'active' ? 'paused' : 'active';
    try {
      await adminService.updatePoolingRoute(routeId, { status: nextStatus });
      setRoutes((current) =>
        current.map((item) =>
          String(item.id || item._id) === String(routeId)
            ? { ...item, status: nextStatus }
            : item
        )
      );
      toast.success(`Route ${nextStatus === 'active' ? 'activated' : 'paused'}`);
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  if (!isEditor) {
    return (
      <div className="min-h-screen bg-slate-50/50 p-2 lg:p-4">
        <div className="mb-3">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            <span>Operations</span>
            <ChevronRight size={10} />
            <span className="text-yellow-600">Pooling Routes</span>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl font-black text-slate-900">Pooling Routes</h1>
              <p className="text-xs font-medium text-slate-500">
                Manage pooled ride destinations, stops, schedules, and assigned vehicles.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/admin/pooling/create')}
              className="inline-flex items-center gap-1.5 rounded-xl bg-yellow-400 px-3 py-1.5 text-xs font-bold text-slate-900 shadow-sm transition hover:bg-yellow-500 active:scale-95"
            >
              <Plus size={14} />
              Add Pooling Route
            </button>
          </div>
        </div>

        <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-2 px-3 shadow-sm">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                <Route size={12} />
              </div>
              <div>
                <p className="text-[9px] font-bold text-slate-400">Total Routes</p>
                <p className="text-base font-black text-slate-900">{routes.length}</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-2 px-3 shadow-sm">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                <CheckCircle2 size={12} />
              </div>
              <div>
                <p className="text-[9px] font-bold text-slate-400">Active Routes</p>
                <p className="text-base font-black text-slate-900">{activeRoutes}</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-2 px-3 shadow-sm">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                <Car size={12} />
              </div>
              <div>
                <p className="text-[9px] font-bold text-slate-400">Fleet Active</p>
                <p className="text-base font-black text-slate-900">{vehicles.length}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              type="text"
              placeholder="Search routes by name, location, stops, or vehicle type..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs font-medium outline-none transition-all focus:border-yellow-400 focus:ring-4 focus:ring-yellow-400/10"
            />
          </div>
        </div>

        {errorMessage ? (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600">
            {errorMessage}
          </div>
        ) : null}

        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-900 border-t-transparent"></div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {filteredRoutes.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-center">
                <div className="mb-3 rounded-full bg-slate-50 p-4 text-slate-300">
                  <Route size={32} strokeWidth={1} />
                </div>
                <h3 className="text-base font-black text-slate-900">No pooling routes found</h3>
                <p className="mt-1 max-w-sm text-xs font-medium text-slate-500">
                  {searchTerm ? 'Try adjusting your search criteria.' : 'No pooling routes configured yet. Add a route to manage stops, schedules and vehicles.'}
                </p>
                {!searchTerm && (
                  <button
                    type="button"
                    onClick={() => navigate('/admin/pooling/create')}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-yellow-400 px-3 py-1.5 text-xs font-bold text-slate-900 transition hover:bg-yellow-500"
                  >
                    Add Pooling Route
                  </button>
                )}
              </div>
            ) : (
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-100">
                  <thead className="bg-slate-50">
                    <tr className="text-left">
                      <th className="px-3 py-2 !normal-case !tracking-normal !text-xs !font-bold">Route Name</th>
                      <th className="px-3 py-2 !normal-case !tracking-normal !text-xs !font-bold">Journey</th>
                      <th className="px-3 py-2 !normal-case !tracking-normal !text-xs !font-bold">Stops</th>
                      <th className="px-3 py-2 !normal-case !tracking-normal !text-xs !font-bold">Vehicles</th>
                      <th className="px-3 py-2 !normal-case !tracking-normal !text-xs !font-bold">Status</th>
                      <th className="px-3 py-2 text-right !normal-case !tracking-normal !text-xs !font-bold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredRoutes.map((item) => (
                      <tr key={item.id || item._id} className="transition hover:bg-slate-50/70">
                        <td className="px-3 py-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="truncate font-black text-slate-900">{item.routeName}</p>
                              {item.routeCode ? (
                                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-500">
                                  {item.routeCode}
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-0.5 flex items-center gap-1 text-[9px] font-semibold text-slate-500">
                              <IndianRupee size={8} />
                              {item.farePerSeat || 0} / seat
                            </p>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5 font-bold text-slate-700">
                            <div className="flex items-center gap-1">
                              <MapPin size={10} className="text-emerald-500" />
                              <span className="truncate max-w-[80px]">{item.originLabel}</span>
                            </div>
                            <ChevronRight size={10} className="text-slate-300 shrink-0" />
                            <div className="flex items-center gap-1">
                              <MapPin size={10} className="text-rose-500" />
                              <span className="truncate max-w-[80px]">{item.destinationLabel}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-bold text-slate-700">
                              {(item.pickupPoints?.length || 0) + (item.dropPoints?.length || 0) + (item.stops?.length || 0)} Total
                            </span>
                            <span className="text-[9px] font-semibold text-slate-500">
                              {item.pickupPoints?.length || 0} Pick, {item.dropPoints?.length || 0} Drop
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-bold text-slate-700">{item.vehicleAssignments?.length || 0} Assigned</span>
                            <span className="text-[9px] font-semibold text-slate-500">
                              {item.schedules?.length || 0} Schedules
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                              item.status === 'active'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
                                : 'border-slate-200 bg-slate-50 text-slate-500'
                            }`}
                          >
                            {item.status === 'active' ? 'Active' : 'Paused'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                            <button
                              onClick={() => {
                                setPropMode('editor');
                                setPropEditId(item.id || item._id);
                                navigate(`/admin/pooling/edit/${item.id || item._id}`);
                              }}
                              className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-1 text-[10px] font-bold text-slate-600 transition hover:bg-slate-100"
                              title="Edit Route"
                            >
                              <Edit2 size={10} /> Edit
                            </button>
                            <button
                              onClick={() => handleToggleStatus(item.id || item._id, item.status)}
                              className={`inline-flex items-center gap-1 rounded border px-1.5 py-1 text-[10px] font-bold transition ${
                                item.status === 'active'
                                  ? 'border-amber-200 bg-amber-50 text-amber-600 hover:bg-amber-100'
                                  : 'border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                              }`}
                              title={item.status === 'active' ? 'Pause Route' : 'Activate Route'}
                            >
                              {item.status === 'active' ? <Clock3 size={10} /> : <CheckCircle2 size={10} />}
                            </button>
                            <button
                              onClick={() => handleDelete(item.id || item._id)}
                              className="rounded border border-rose-100 bg-rose-50 p-1 text-rose-500 transition hover:bg-rose-100"
                              title="Delete Route"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f6f7fb] p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <button
          type="button"
          onClick={() => navigate('/admin/pooling/routes')}
          className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-slate-800"
        >
          <ArrowLeft size={16} />
          Back to Pooling Routes
        </button>

        <div className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <div className="border-b border-slate-100 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-900 px-6 py-6 text-white lg:px-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-indigo-200">Pooling Planner</p>
                <h1 className="mt-2 text-2xl font-black">
                  {id ? 'Edit Pooling Route' : 'Create Pooling Route'}
                </h1>
                <p className="mt-2 max-w-3xl text-sm font-medium text-indigo-100/90">
                  Configure the destination flow for pooled rides with pickup points, intermediate stops, drop locations,
                  schedules, and vehicle layouts that are approved for pooling.
                </p>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-100">Selected Vehicles</p>
                <p className="mt-1 text-2xl font-black text-white">{selectedVehicles.length}</p>
              </div>
            </div>
          </div>

          {errorMessage ? (
            <div className="mx-6 mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600 lg:mx-8">
              {errorMessage}
            </div>
          ) : null}

          <div className="grid gap-6 p-6 lg:grid-cols-2 lg:p-8">
            <div className="lg:col-span-2 rounded-[24px] border border-slate-200 bg-slate-50/70 px-5 py-4">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-indigo-500">Section 1</p>
              <h2 className="mt-1 text-lg font-black text-slate-900">Route Identity</h2>
              <p className="mt-1 text-sm font-medium text-slate-500">
                Define the pooling route name, the destination flow, and the basic description so admins know exactly what this pooled service is for.
              </p>
            </div>

            <div>
              <label className={labelClass}>Route Name *</label>
              <input
                type="text"
                value={formData.routeName}
                onChange={(event) => updateForm('routeName', event.target.value)}
                className={getInputClasses(Boolean(validationErrors.routeName))}
                placeholder="Airport Morning Pool"
              />
              {validationErrors.routeName ? <p className="mt-2 text-xs font-semibold text-rose-600">{validationErrors.routeName}</p> : null}
              <p className="mt-2 text-xs text-slate-500">Main name used by the admin team to identify this pooled route.</p>
            </div>

            <div>
              <label className={labelClass}>Route Code</label>
              <input
                type="text"
                value={formData.routeCode}
                onChange={(event) => updateForm('routeCode', event.target.value)}
                className={inputClass}
                placeholder="POOL-AM-01"
              />
              <p className="mt-2 text-xs text-slate-500">Optional short code for quick internal reference.</p>
            </div>

            <div>
              <label className={labelClass}>Origin Location *</label>
              <input
                type="text"
                value={formData.originLabel}
                onChange={(event) => updateForm('originLabel', event.target.value)}
                className={getInputClasses(Boolean(validationErrors.originLabel))}
                placeholder="Vijay Nagar"
              />
              {validationErrors.originLabel ? <p className="mt-2 text-xs font-semibold text-rose-600">{validationErrors.originLabel}</p> : null}
            </div>

            <div>
              <label className={labelClass}>Destination *</label>
              <input
                type="text"
                value={formData.destinationLabel}
                onChange={(event) => updateForm('destinationLabel', event.target.value)}
                className={getInputClasses(Boolean(validationErrors.destinationLabel))}
                placeholder="Indore Airport"
              />
              {validationErrors.destinationLabel ? <p className="mt-2 text-xs font-semibold text-rose-600">{validationErrors.destinationLabel}</p> : null}
            </div>

            <div className="lg:col-span-2">
              <label className={labelClass}>Description</label>
              <textarea
                rows="4"
                value={formData.description}
                onChange={(event) => updateForm('description', event.target.value)}
                className={inputClass}
                placeholder="Describe when riders should use this pooling route and what kind of trip it serves."
              />
            </div>

            <div className="lg:col-span-2 rounded-[24px] border border-slate-200 bg-slate-50/70 px-5 py-4">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-indigo-500">Section 2</p>
              <h2 className="mt-1 text-lg font-black text-slate-900">Pickup, Stops, And Drop</h2>
              <p className="mt-1 text-sm font-medium text-slate-500">
                Configure where the pooled ride boards riders, which middle stops are allowed, and where the trip drops riders.
              </p>
            </div>

            <div className="lg:col-span-2 grid gap-8 xl:grid-cols-2 2xl:grid-cols-3">
              <StopEditor
                title="Pickup Points"
                helper="Add the pickup locations riders can select while booking this route."
                items={formData.pickupPoints}
                stopType="pickup"
                errors={Object.fromEntries(
                  Object.entries(validationErrors).filter(([key]) =>
                    key === 'pickupPoints.group' || formData.pickupPoints.some((item) => key.startsWith(`${item.id}.`)),
                  ),
                )}
                onAdd={() => addStopGroupItem('pickupPoints', 'pickup')}
                onChange={(stopId, key, value) => updateStopGroup('pickupPoints', stopId, key, value)}
                onRemove={(stopId) => removeStopGroupItem('pickupPoints', stopId)}
              />
              <StopEditor
                title="Middle Stops"
                helper="Use this for route checkpoints, boarding stops, or service pauses between origin and destination."
                items={formData.stops}
                stopType="stop"
                errors={Object.fromEntries(
                  Object.entries(validationErrors).filter(([key]) =>
                    key === 'stops.group' || formData.stops.some((item) => key.startsWith(`${item.id}.`)),
                  ),
                )}
                onAdd={() => addStopGroupItem('stops', 'stop')}
                onChange={(stopId, key, value) => updateStopGroup('stops', stopId, key, value)}
                onRemove={(stopId) => removeStopGroupItem('stops', stopId)}
              />
              <StopEditor
                title="Drop Points"
                helper="Add the drop locations riders can choose for the final leg of this pooled ride."
                items={formData.dropPoints}
                stopType="drop"
                errors={Object.fromEntries(
                  Object.entries(validationErrors).filter(([key]) =>
                    key === 'dropPoints.group' || formData.dropPoints.some((item) => key.startsWith(`${item.id}.`)),
                  ),
                )}
                onAdd={() => addStopGroupItem('dropPoints', 'drop')}
                onChange={(stopId, key, value) => updateStopGroup('dropPoints', stopId, key, value)}
                onRemove={(stopId) => removeStopGroupItem('dropPoints', stopId)}
              />
            </div>

            <div className="lg:col-span-2 rounded-[24px] border border-slate-200 bg-slate-50/70 px-5 py-4">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-indigo-500">Section 3</p>
              <h2 className="mt-1 text-lg font-black text-slate-900">Pooling Vehicles And Layout</h2>
              <p className="mt-1 text-sm font-medium text-slate-500">
                Choose which pooling vehicles are allowed for this route. Their saved seat blueprint becomes the pooling layout for that vehicle.
              </p>
            </div>

            <div className="lg:col-span-2 grid gap-4 xl:grid-cols-3">
              {vehicles.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-sm text-slate-500 xl:col-span-3">
                  No active pooling vehicles found. Add or approve pooling vehicles first.
                </div>
              ) : (
                vehicles.map((vehicle) => {
                  const vehicleId = String(vehicle.id || vehicle._id);
                  const selected = formData.assignedVehicleTypeIds.includes(vehicleId);
                  return (
                    <button
                      key={vehicleId}
                      type="button"
                      onClick={() => toggleVehicle(vehicleId)}
                      className={`rounded-[28px] border p-4 text-left transition-all ${
                        selected
                          ? 'border-sky-300 bg-sky-50 shadow-[0_12px_35px_rgba(14,165,233,0.12)]'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm">
                            {vehicle.image ? (
                              <img src={vehicle.image} alt={vehicle.name} className="h-12 w-12 object-contain" />
                            ) : (
                              <Car size={22} className="text-slate-400" />
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-black text-slate-900">{vehicle.name}</p>
                            <p className="text-xs font-semibold text-slate-500">{vehicle.vehicleCategory || 'Vehicle'}</p>
                          </div>
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                            selected ? 'bg-sky-500 text-white' : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {selected ? 'Selected' : 'Available'}
                        </span>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <div className="rounded-2xl bg-white px-3 py-3">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Seats</p>
                          <p className="mt-1 text-sm font-black text-slate-900">
                            {vehicle.capacity || countBlueprintSeats(vehicle.blueprint)}
                          </p>
                        </div>
                        <div className="rounded-2xl bg-white px-3 py-3">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Bags</p>
                          <p className="mt-1 text-sm font-black text-slate-900">{vehicle.luggageCapacity || 0}</p>
                        </div>
                      </div>

                      <div className="mt-4">
                        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Seat Blueprint</p>
                        <BlueprintMini blueprint={vehicle.blueprint} />
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <div className="lg:col-span-2 rounded-[24px] border border-slate-200 bg-slate-50/70 px-5 py-4">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-indigo-500">Section 4</p>
              <h2 className="mt-1 text-lg font-black text-slate-900">Schedule, Fare, And Rules</h2>
              <p className="mt-1 text-sm font-medium text-slate-500">
                Set departure timings, per-seat pricing, booking limits, and the operating rules for the pooled route.
              </p>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-black text-slate-900">Schedules</h3>
                  <p className="mt-1 text-xs font-medium text-slate-500">
                    Add one or more departure plans for this pooling route.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addSchedule}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100"
                >
                  <Plus size={14} />
                  Add Schedule
                </button>
              </div>

              <div className="space-y-4">
                {formData.schedules.map((schedule) => (
                  <div key={schedule.id} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <p className="text-sm font-black text-slate-900">{schedule.label || 'New Schedule'}</p>
                      {formData.schedules.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => removeSchedule(schedule.id)}
                          className="rounded-xl border border-rose-200 bg-white p-2 text-rose-500 transition hover:bg-rose-50"
                        >
                          <Trash2 size={14} />
                        </button>
                      ) : null}
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
                      <input
                        value={schedule.label}
                        onChange={(event) => updateSchedule(schedule.id, 'label', event.target.value)}
                        className={inputClass}
                        placeholder="Morning Airport Run"
                      />
                      <input
                        type="time"
                        value={schedule.departureTime}
                        onChange={(event) => updateSchedule(schedule.id, 'departureTime', event.target.value)}
                        className={inputClass}
                      />
                      <input
                        type="time"
                        value={schedule.arrivalTime}
                        onChange={(event) => updateSchedule(schedule.id, 'arrivalTime', event.target.value)}
                        className={inputClass}
                      />
                      <select
                        value={schedule.status}
                        onChange={(event) => updateSchedule(schedule.id, 'status', event.target.value)}
                        className={inputClass}
                      >
                        <option value="active">Active</option>
                        <option value="paused">Paused</option>
                        <option value="draft">Draft</option>
                      </select>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {DAY_OPTIONS.map((day) => {
                        const active = schedule.activeDays.includes(day);
                        return (
                          <button
                            key={`${schedule.id}-${day}`}
                            type="button"
                            onClick={() => toggleScheduleDay(schedule.id, day)}
                            className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition ${
                              active
                                ? 'bg-slate-900 text-white'
                                : 'border border-slate-200 bg-white text-slate-500'
                            }`}
                          >
                            {day}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-base font-black text-slate-900">Fare Setup</h3>
                <p className="mt-1 text-xs font-medium text-slate-500">
                  These values control how riders are priced and how many seats they can reserve at once.
                </p>

                <div className="mt-4 space-y-4">
                  <div>
                    <label className={labelClass}>Fare Per Seat</label>
                    <input
                      type="number"
                      value={formData.farePerSeat}
                      onChange={(event) => updateForm('farePerSeat', Number(event.target.value || 0))}
                      className={inputClass}
                      placeholder="149"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Max Seats Per Booking</label>
                    <input
                      type="number"
                      value={formData.maxSeatsPerBooking}
                      onChange={(event) => updateForm('maxSeatsPerBooking', Number(event.target.value || 1))}
                      className={inputClass}
                      placeholder="2"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Advance Booking Window (Hours)</label>
                    <input
                      type="number"
                      value={formData.maxAdvanceBookingHours}
                      onChange={(event) => updateForm('maxAdvanceBookingHours', Number(event.target.value || 0))}
                      className={inputClass}
                      placeholder="24"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Boarding Buffer (Minutes)</label>
                    <input
                      type="number"
                      value={formData.boardingBufferMinutes}
                      onChange={(event) => updateForm('boardingBufferMinutes', Number(event.target.value || 0))}
                      className={inputClass}
                      placeholder="15"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-base font-black text-slate-900">Pooling Rules</h3>
                <p className="mt-1 text-xs font-medium text-slate-500">
                  Switch on the operating rules you want this pooled route to follow.
                </p>

                <div className="mt-4 space-y-3">
                  {[
                    ['allowInstantBooking', 'Allow instant pooled bookings'],
                    ['allowLuggage', 'Allow luggage on this route'],
                    ['womenOnly', 'Women-only pooling route'],
                    ['autoAssignNearestPickup', 'Auto-assign nearest pickup point'],
                  ].map(([key, label]) => (
                    <label key={key} className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-3">
                      <span className="text-sm font-semibold text-slate-700">{label}</span>
                      <input
                        type="checkbox"
                        checked={Boolean(formData.poolingRules[key])}
                        onChange={(event) => updateNestedRule(key, event.target.checked)}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                    </label>
                  ))}
                </div>

                <div className="mt-4">
                  <label className={labelClass}>Maximum Detour (Km)</label>
                  <input
                    type="number"
                    value={formData.poolingRules.maxDetourKm}
                    onChange={(event) => updateNestedRule('maxDetourKm', Number(event.target.value || 0))}
                    className={inputClass}
                    placeholder="5"
                  />
                </div>
              </div>

              <div className="rounded-[28px] border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-slate-50 p-5 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Live Summary</p>
                <div className="mt-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-indigo-600 shadow-sm">
                      <Route size={20} />
                    </div>
                    <div>
                      <p className="text-lg font-black text-slate-900">{formData.routeName || 'Pooling Route'}</p>
                      <p className="text-sm font-semibold text-slate-500">
                        {formData.originLabel || 'Origin'} to {formData.destinationLabel || 'Destination'}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
                      <div className="flex items-center gap-2 text-slate-500">
                        <IndianRupee size={15} />
                        <span className="text-[11px] font-bold uppercase tracking-wide">Seat Fare</span>
                      </div>
                      <p className="mt-1 text-lg font-black text-slate-900">Rs {formData.farePerSeat}</p>
                    </div>
                    <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
                      <div className="flex items-center gap-2 text-slate-500">
                        <Users size={15} />
                        <span className="text-[11px] font-bold uppercase tracking-wide">Vehicles</span>
                      </div>
                      <p className="mt-1 text-lg font-black text-slate-900">{selectedVehicles.length}</p>
                    </div>
                    <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
                      <div className="flex items-center gap-2 text-slate-500">
                        <MapPin size={15} />
                        <span className="text-[11px] font-bold uppercase tracking-wide">Pickups</span>
                      </div>
                      <p className="mt-1 text-lg font-black text-slate-900">{formData.pickupPoints.length}</p>
                    </div>
                    <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
                      <div className="flex items-center gap-2 text-slate-500">
                        <CalendarDays size={15} />
                        <span className="text-[11px] font-bold uppercase tracking-wide">Schedules</span>
                      </div>
                      <p className="mt-1 text-lg font-black text-slate-900">{formData.schedules.length}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 border-t border-slate-100 bg-slate-50/50 p-6 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="space-y-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-indigo-500">Section 5</p>
                <h2 className="mt-1 text-lg font-black text-slate-900">Publishing</h2>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  Decide whether this pooling route is active right away or should stay in draft while the route plan is still being prepared.
                </p>
              </div>

              <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                This page uses approved pooling vehicles, so the saved blueprint layout stays consistent between route setup and seat booking operations.
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={formData.active}
                    onChange={(event) => updateForm('active', event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  Route active
                </label>

                <div>
                  <label className={labelClass}>Route Status</label>
                  <select
                    value={formData.status}
                    onChange={(event) => updateForm('status', event.target.value)}
                    className={inputClass}
                  >
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="draft">Draft</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 lg:items-end">
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving || loading}
                className="inline-flex min-w-[190px] items-center justify-center gap-2 rounded-xl bg-[#2e3c78] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#24305f] disabled:opacity-60"
              >
                <Save size={16} />
                {isSaving ? 'Saving...' : id ? 'Update Pooling Route' : 'Create Pooling Route'}
              </button>
              <button
                type="button"
                onClick={() => navigate('/admin/pooling')}
                className="text-sm font-medium text-slate-500 transition hover:text-slate-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {!loading && formData.active ? (
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

export default PoolingManager;
