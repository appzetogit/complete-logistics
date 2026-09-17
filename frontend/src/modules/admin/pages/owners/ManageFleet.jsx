import React, { useState, useEffect } from 'react';
import {
  Plus,
  ChevronRight,
  Edit2,
  Trash2,
  Eye,
  ChevronDown,
  Search,
  Loader2,
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  FileSearch,
  Menu
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import AdminPageHeader from '../../components/ui/AdminPageHeader';

const BASE = globalThis.__LEGACY_BACKEND_ORIGIN__ + '/api/v1/admin';
const MotionDiv = motion.div;
const FILE_BASE = globalThis.__LEGACY_BACKEND_ORIGIN__ || '';

const resolveFleetDocumentUrl = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return '';

  if (/^(https?:|data:|blob:)/i.test(raw)) {
    return raw;
  }

  if (raw.startsWith('/')) {
    return `${FILE_BASE}${raw}`;
  }

  return `${FILE_BASE}/${raw.replace(/^\.?\//, '')}`;
};

const getFleetDocumentUrls = (documents = {}) => {
  if (!documents) return [];

  const collectUrls = (value) => {
    if (!value) return [];
    if (typeof value === 'string') return [value];
    if (Array.isArray(value)) return value.flatMap(collectUrls);

    return [
      value.previewUrl,
      value.secureUrl,
      value.url,
      value.imageUrl,
      value.image,
      value.fileUrl,
      value.document,
      value.file,
    ]
      .map(resolveFleetDocumentUrl)
      .filter(Boolean);
  };

  const urls = Array.isArray(documents)
    ? documents.flatMap(collectUrls)
    : Object.values(documents).flatMap((value) => {
        if (typeof value === 'string') {
          return [resolveFleetDocumentUrl(value)].filter(Boolean);
        }
        return collectUrls(value);
      });

  return urls.filter((url, index) => urls.indexOf(url) === index);
};

const getFleetStatusReason = (item = {}) => {
  const candidates = [
    item.reason,
    item.rejection_reason,
    item.rejectionReason,
    item.reject_reason,
    item.comment,
    item.admin_comment,
    item.adminComment,
  ];

  const match = candidates.find((value) => String(value || '').trim());
  return String(match || '').trim();
};

const inputClass = 'h-10 w-full rounded border border-gray-300 bg-white px-3 text-sm text-gray-950 outline-none transition-colors focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400';
const labelClass = 'mb-1.5 block text-xs font-bold text-gray-950';

const ManageFleet = () => {
  const navigate = useNavigate();
  const [view, setView] = useState('list'); // 'list' | 'create' | 'edit'
  const [editingId, setEditingId] = useState(null);
  const [fleet, setFleet] = useState([]);
  const [owners, setOwners] = useState([]); // Added owners state
  const [vehicleTypes, setVehicleTypes] = useState([]);
  const [areas, setAreas] = useState([]);
  const [transportTypes, setTransportTypes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [updatingFleetId, setUpdatingFleetId] = useState('');
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [formData, setFormData] = useState({
    owner_id: '', // Added owner_id
    service_location_id: '',
    transport_type: 'taxi',
    vehicle_type_id: '',
    car_brand: '',
    car_model: '',
    license_plate_number: '',
    car_color: ''
  });

  const token = localStorage.getItem('adminToken') || '';
  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

  /* ── Fetch initial data ── */
  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [fleetRes, ownersRes, areasRes, rideRes] = await Promise.all([
        fetch(`${BASE}/owner-management/manage-fleet`, { headers }),
        fetch(`${BASE}/owner-management/manage-owners`, { headers }), // Fetching owners
        fetch(`${BASE}/service-locations`, { headers }),
        fetch(`${globalThis.__LEGACY_BACKEND_ORIGIN__}/api/v1/common/ride_modules`, { headers })
      ]);

      const fData = await fleetRes.json();
      const oData = await ownersRes.json();
      const aData = await areasRes.json();
      const rData = await rideRes.json();

      if (fData.success) {
        setFleet(Array.isArray(fData.data) ? fData.data : (fData.data?.results || []));
      }

      if (oData.success) {
        const oList = oData.data?.results || oData.data || [];
        setOwners(Array.isArray(oList) ? oList : []);
        if (oList.length > 0 && !formData.owner_id) {
          setFormData(prev => ({ ...prev, owner_id: oList[0]._id }));
        }
      }

      if (aData.success) {
        const locs = Array.isArray(aData.data) ? aData.data : (aData.data?.results || []);
        setAreas(locs);
        if (locs.length > 0 && !formData.service_location_id) {
          setFormData(prev => ({ ...prev, service_location_id: locs[0]._id }));
        }
      }

      if (rData.success) {
        const raw = rData.data;
        const mapped = Array.isArray(raw) ? raw : Object.keys(raw).map(k => ({ transport_type: k }));
        setTransportTypes(mapped);
      }
    } catch (err) {
      console.error('Failed to fetch initial data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  /* ── Fetch vehicle types based on Area ── */
  const fetchVehicleTypes = async () => {
    try {
      const typeFilter = (formData.transport_type || 'taxi').toLowerCase();
      const res = await fetch(`${BASE}/types/vehicle-types/list?transport_type=${encodeURIComponent(typeFilter)}`, { headers });
      const data = await res.json();
      if (data.success) {
        const list = Array.isArray(data.data) ? data.data : (data.data?.results || []);
        setVehicleTypes(list);
        if (list.length > 0 && !formData.vehicle_type_id) {
          setFormData(prev => ({ ...prev, vehicle_type_id: list[0]._id || list[0].id }));
        }
      }
    } catch (err) {
      console.error('Failed to fetch vehicle types:', err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    fetchVehicleTypes();
  }, [formData.transport_type]);

  useEffect(() => {
    setPage(1);
  }, [itemsPerPage]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, statusFilter]);

  const resetForm = () => {
    setFormData({
      owner_id: owners[0]?._id || '',
      service_location_id: areas[0]?._id || '',
      transport_type: 'taxi',
      vehicle_type_id: '',
      car_brand: '',
      car_model: '',
      license_plate_number: '',
      car_color: ''
    });
    setEditingId(null);
  };

  const handleEditClick = (item) => {
    setEditingId(item._id);
    setFormData({
      owner_id: item.owner_id?._id || item.owner_id || owners[0]?._id || '',
      service_location_id: item.service_location_id?._id || item.service_location_id || areas[0]?._id || '',
      transport_type: item.transport_type || 'taxi',
      vehicle_type_id: item.vehicle_type_id?._id || item.vehicle_type_id || '',
      car_brand: item.car_brand || '',
      car_model: item.car_model || '',
      license_plate_number: item.license_plate_number || '',
      car_color: item.car_color || ''
    });
    setView('edit');
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    const isEditing = view === 'edit';
    const url = isEditing
      ? `${BASE}/owner-management/manage-fleet/${editingId}`
      : `${BASE}/owner-management/manage-fleet`;

    try {
      const res = await fetch(url, {
        method: isEditing ? 'PATCH' : 'POST',
        headers,
        body: JSON.stringify(formData)
      });
      const json = await res.json();
      if (json.success) {
        setView('list');
        fetchData(); // Refresh everything
        resetForm();
      } else {
        alert(json.message || 'Operation failed');
      }
    } catch {
      alert('Network error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this fleet vehicle?')) return;
    try {
      const res = await fetch(`${BASE}/owner-management/manage-fleet/${id}`, {
        method: 'DELETE',
        headers
      });
      const json = await res.json();
      if (json.success) fetchData();
      else alert(json.message || 'Delete failed');
    } catch {
      alert('Delete failed');
    }
  };

  const handleStatusUpdate = async (item, nextStatus) => {
    const fleetId = item?._id;
    if (!fleetId) return;

    let reason = '';
    if (nextStatus === 'rejected') {
      reason = window.prompt('Add a rejection reason for this fleet vehicle:', getFleetStatusReason(item))?.trim() || '';
      if (!reason) {
        window.alert('A rejection reason is required.');
        return;
      }
    }

    setUpdatingFleetId(fleetId);
    try {
      const res = await fetch(`${BASE}/owner-management/manage-fleet/${fleetId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          status: nextStatus,
          reason: nextStatus === 'rejected' ? reason : '',
        })
      });
      const json = await res.json();

      if (!json.success) {
        window.alert(json.message || 'Status update failed');
        return;
      }

      setFleet((current) =>
        current.map((fleetItem) =>
          fleetItem._id === fleetId
            ? {
                ...fleetItem,
                ...(json.data || {}),
                status: json.data?.status || nextStatus,
                reason: getFleetStatusReason(json.data) || (nextStatus === 'rejected' ? reason : ''),
              }
            : fleetItem
        )
      );
    } catch (error) {
      console.error('Failed to update fleet status:', error);
      window.alert('Status update failed');
    } finally {
      setUpdatingFleetId('');
    }
  };

  const filteredFleet = fleet.filter((item) => {
    const normalizedStatus = String(item?.status || 'pending').toLowerCase();
    const matchesStatus =
      statusFilter === 'all' ? true : normalizedStatus === statusFilter;

    const searchValue = searchTerm.trim().toLowerCase();
    if (!searchValue) {
      return matchesStatus;
    }

    const haystack = [
      item.vehicle_type_id?.name,
      item.vehicle_type_id?.type_name,
      item.vehicle_type,
      item.car_brand,
      item.car_model,
      item.license_plate_number,
      item.owner_id?.company_name,
      item.owner_id?.name,
      item.owner_id?.owner_name,
      getFleetStatusReason(item),
      item.status,
    ]
      .map((value) => String(value || '').toLowerCase())
      .join(' ');

    return matchesStatus && haystack.includes(searchValue);
  });

  const totalEntries = filteredFleet.length;
  const totalPages = Math.max(1, Math.ceil(totalEntries / itemsPerPage));
  const safePage = Math.min(page, totalPages);
  const pagedFleet = filteredFleet.slice((safePage - 1) * itemsPerPage, safePage * itemsPerPage);
  const showingFrom = totalEntries === 0 ? 0 : (safePage - 1) * itemsPerPage + 1;
  const showingTo = totalEntries === 0 ? 0 : Math.min(showingFrom + pagedFleet.length - 1, totalEntries);

  const handleViewDocuments = (item) => {
    const urls = getFleetDocumentUrls(item?.documents);

    if (urls.length === 0) {
      window.alert('No documents uploaded for this fleet vehicle.');
      return;
    }

    urls.forEach((url) => {
      window.open(url, '_blank', 'noopener,noreferrer');
    });
  };

  /* ── Status badge ── */
  const StatusBadge = ({ status }) => {
    const map = {
      approved: { color: 'bg-emerald-50 text-emerald-700 border-emerald-100', icon: <CheckCircle size={12} />, label: 'Approved' },
      pending: { color: 'bg-amber-50 text-amber-700 border-amber-100', icon: <Clock size={12} />, label: 'Pending' },
      rejected: { color: 'bg-rose-50 text-rose-700 border-rose-100', icon: <XCircle size={12} />, label: 'Rejected' },
    };
    const cfg = map[status?.toLowerCase()] || map.pending;
    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${cfg.color}`}>
        {cfg.icon} {cfg.label}
      </span>
    );
  };

  /* ════════════════════════════════════
       CREATE / EDIT FORM
  ════════════════════════════════════ */
  if (view === 'create' || view === 'edit') {
    return (
      <div className="min-h-screen p-1 font-sans">
        {/* Breadcrumb */}
        <div className="flex items-center justify-between mb-6 px-1">
          <h1 className="text-xl font-bold text-gray-950">
            {view === 'edit' ? 'Edit Fleet' : 'Create Fleet'}
          </h1>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 lg:p-8">
          <form onSubmit={handleSave}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">

              {/* Select Owner */}
              <div>
                <label className={labelClass}>
                  Select Fleet Owner <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    required
                    value={formData.owner_id}
                    onChange={(e) => setFormData({ ...formData, owner_id: e.target.value })}
                    className={`${inputClass} appearance-none pr-10`}
                  >
                    <option value="">Select Owner</option>
                    {owners.length > 0 ? (
                      owners.map(owner => (
                        <option key={owner._id} value={owner._id}>
                          {owner.company_name || owner.name || owner._id}
                        </option>
                      ))
                    ) : (
                      <option value="" disabled>No owners found</option>
                    )}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
                </div>
              </div>

              {/* Select Area */}
              <div>
                <label className={labelClass}>
                  Select Operating Area <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    required
                    value={formData.service_location_id}
                    onChange={(e) => setFormData({ ...formData, service_location_id: e.target.value })}
                    className={`${inputClass} appearance-none pr-10`}
                  >
                    <option value="">Select Area</option>
                    {areas.map(area => (
                      <option key={area._id} value={area._id}>
                        {area.service_location_name || area.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
                </div>
              </div>

              {/* Transport Type */}
              <div>
                <label className={labelClass}>
                  Transport Type <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    required
                    value={formData.transport_type}
                    onChange={(e) => setFormData({ ...formData, transport_type: e.target.value })}
                    className={`${inputClass} appearance-none pr-10`}
                  >
                    {transportTypes.length > 0 ? (
                      transportTypes.map(tt => (
                        <option key={tt.transport_type} value={tt.transport_type}>
                          {tt.transport_type.charAt(0).toUpperCase() + tt.transport_type.slice(1)}
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="taxi">Taxi</option>
                        <option value="delivery">Delivery</option>
                      </>
                    )}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
                </div>
              </div>

              {/* Select Type (Vehicle Type) */}
              <div>
                <label className={labelClass}>
                  Select Vehicle Type <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    required
                    value={formData.vehicle_type_id}
                    onChange={(e) => setFormData({ ...formData, vehicle_type_id: e.target.value })}
                    className={`${inputClass} appearance-none pr-10`}
                  >
                    <option value="">Select vehicle type</option>
                    {vehicleTypes.length > 0 ? (
                      vehicleTypes.map(vt => (
                        <option key={vt._id || vt.id} value={vt._id || vt.id}>
                          {vt.name || vt.type_name || vt.label || vt._id || vt.id}
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="sedan">Sedan</option>
                        <option value="suv">SUV</option>
                        <option value="mini">Mini</option>
                        <option value="bike">Bike</option>
                      </>
                    )}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
                </div>
              </div>

              {/* Car Brand */}
              <div>
                <label className={labelClass}>
                  Car Brand <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.car_brand}
                  onChange={(e) => setFormData({ ...formData, car_brand: e.target.value })}
                  placeholder="Enter Car Make"
                  className={inputClass}
                />
              </div>

              {/* Car Model */}
              <div>
                <label className={labelClass}>
                  Car Model <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.car_model}
                  onChange={(e) => setFormData({ ...formData, car_model: e.target.value })}
                  placeholder="Enter Car Model"
                  className={inputClass}
                />
              </div>

              {/* License Plate Number */}
              <div>
                <label className={labelClass}>
                  License Plate Number <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.license_plate_number}
                  onChange={(e) => setFormData({ ...formData, license_plate_number: e.target.value })}
                  placeholder="Enter License Plate Number"
                  className={inputClass}
                />
              </div>

              {/* Car Color */}
              <div className="md:col-span-1">
                <label className={labelClass}>
                  Car Color <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.car_color}
                  onChange={(e) => setFormData({ ...formData, car_color: e.target.value })}
                  placeholder="Enter Car Color"
                  className={inputClass}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="col-span-1 md:col-span-2 pt-6 flex items-center justify-end gap-3 border-t border-gray-100 mt-2">
              <button
                type="button"
                onClick={() => { setView('list'); resetForm(); }}
                className="h-10 px-6 rounded-lg text-sm font-bold text-gray-600 hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="h-10 px-8 bg-yellow-400 text-black rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-yellow-500 transition-colors shadow-sm disabled:opacity-50"
              >
                {submitting ? <Loader2 className="animate-spin" size={16} /> : null}
                Save
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  /* ════════════════════════════════════
       LIST VIEW
  ════════════════════════════════════ */
  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-950">
      <AnimatePresence mode="wait">
        <MotionDiv
          key="list"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="px-5 pt-3">
            <AdminPageHeader module="Fleet Management" page="Manage Fleet" title="Manage Fleet" />
          </div>

          <div className="px-5 pb-6">
            <div className="relative rounded border border-gray-200 bg-white shadow-sm">
            {/* Toolbar */}
            <div className="flex flex-col gap-5 px-5 py-5 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-3 text-sm font-semibold text-slate-500">
                <span>Show</span>
                <div className="relative">
                  <select
                    value={itemsPerPage}
                    onChange={(e) => setItemsPerPage(Number(e.target.value) || 10)}
                    className="h-9 w-24 appearance-none rounded border border-gray-300 bg-white px-3 text-sm text-gray-950 outline-none transition-colors focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400"
                  >
                    {[10, 25, 50, 100].map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={16}
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-700"
                  />
                </div>
                <span>Entries</span>
              </div>

              <div className="flex flex-col items-stretch gap-3 md:flex-row md:items-center">
                <div className="relative">
                  <Search
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search brand, model, plate, owner..."
                    className="h-10 w-full rounded border border-gray-300 bg-white pl-10 pr-4 text-sm text-gray-950 outline-none transition-colors focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 md:w-64"
                  />
                </div>
                <div className="relative">
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="h-10 w-full appearance-none rounded border border-gray-300 bg-white px-3 pr-10 text-sm text-gray-950 outline-none transition-colors focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 md:w-44"
                  >
                    <option value="all">All Status</option>
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                  </select>
                  <ChevronDown
                    size={16}
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-700"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/admin/fleet/manage/create')}
                  className="flex h-10 items-center gap-2 rounded-lg bg-yellow-400 px-5 text-sm font-bold text-black transition-colors hover:bg-yellow-500 shadow-sm"
                >
                  <Plus size={16} /> Add Fleet
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="px-5">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-4 text-sm font-bold text-gray-950">Vehicle Type</th>
                      <th className="px-3 py-4 text-sm font-bold text-gray-950">Car Brand</th>
                      <th className="px-3 py-4 text-sm font-bold text-gray-950">Car Model</th>
                      <th className="px-3 py-4 text-sm font-bold text-gray-950">Document View</th>
                      <th className="px-3 py-4 text-sm font-bold text-gray-950">License Plate Number</th>
                      <th className="px-3 py-4 text-sm font-bold text-gray-950">Status</th>
                      <th className="px-3 py-4 text-sm font-bold text-gray-950">Reason</th>
                      <th className="px-3 py-4 text-sm font-bold text-gray-950">Approval</th>
                      <th className="px-3 py-4 text-sm font-bold text-gray-950">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                  {isLoading ? (
                    <tr>
                      <td colSpan="9" className="px-3 py-24 text-center">
                        <div className="flex flex-col items-center gap-4 text-slate-400">
                          <Loader2 size={34} className="animate-spin text-teal-500" />
                          <p className="text-sm font-semibold">Loading fleet...</p>
                        </div>
                      </td>
                    </tr>
                  ) : pagedFleet.length === 0 ? (
                    <tr>
                      <td colSpan="9" className="border-b border-gray-200 px-3 py-10 text-center">
                        <div className="flex min-h-[130px] flex-col items-center justify-center text-slate-500">
                          <FileSearch size={48} strokeWidth={1.5} className="mb-3" />
                          <p className="text-sm font-medium">No fleet found</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    pagedFleet.map((item) => (
                      <tr
                        key={item._id}
                        className="bg-white transition-colors hover:bg-gray-50"
                      >
                        {/* Vehicle Type */}
                        <td className="px-3 py-4 text-sm font-medium text-gray-950">
                          {item.vehicle_type_id?.name || item.vehicle_type_id?.type_name || item.vehicle_type || '—'}
                        </td>

                        {/* Fleet Owner */}
                        <td className="hidden">
                          {item.owner_id?.company_name || item.owner_id?.name || '—'}
                        </td>

                        {/* Car Brand */}
                        <td className="px-3 py-4 text-sm text-gray-950">
                          {item.car_brand || '—'}
                        </td>

                        {/* Car Model */}
                        <td className="px-3 py-4 text-sm text-gray-950">
                          {item.car_model || '—'}
                        </td>

                        {/* Document View */}
                        <td className="px-3 py-4 text-sm">
                          <button
                            type="button"
                            onClick={() => handleViewDocuments(item)}
                            disabled={getFleetDocumentUrls(item?.documents).length === 0}
                            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                              getFleetDocumentUrls(item?.documents).length > 0
                                ? 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100'
                                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            }`}
                            title={
                              getFleetDocumentUrls(item?.documents).length > 0
                                ? 'View uploaded documents'
                                : 'No documents uploaded'
                            }
                          >
                            <Eye size={14} /> {getFleetDocumentUrls(item?.documents).length > 0 ? 'Document View' : 'No Docs'}
                          </button>
                        </td>

                        {/* License Plate */}
                        <td className="px-3 py-4 text-sm text-gray-950">
                          {item.license_plate_number || '—'}
                        </td>

                        {/* Status */}
                        <td className="px-3 py-4">
                          <StatusBadge status={item.status} />
                        </td>

                        {/* Reason */}
                        <td className="px-3 py-4">
                          <span className="text-xs text-gray-500">
                            {item.status?.toLowerCase() === 'rejected' ? (getFleetStatusReason(item) || 'Rejected without a reason') : '—'}
                          </span>
                        </td>

                        {/* Approval */}
                        <td className="px-3 py-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleStatusUpdate(item, 'approved')}
                              disabled={updatingFleetId === item._id || item.status?.toLowerCase() === 'approved'}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition-all hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                              title="Approve fleet"
                            >
                              {updatingFleetId === item._id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => handleStatusUpdate(item, 'rejected')}
                              disabled={updatingFleetId === item._id || item.status?.toLowerCase() === 'rejected'}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition-all hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                              title="Reject fleet"
                            >
                              {updatingFleetId === item._id ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                              Reject
                            </button>
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="px-3 py-4">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleEditClick(item)}
                              className="inline-flex h-8 w-9 items-center justify-center rounded bg-yellow-50 text-yellow-600 transition-colors hover:bg-yellow-100"
                              title="Edit"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              onClick={() => handleDelete(item._id)}
                              className="inline-flex h-8 w-9 items-center justify-center rounded bg-rose-50 text-rose-600 transition-colors hover:bg-rose-100"
                              title="Delete"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

            {/* Pagination */}
            <div className="flex items-center justify-between border-t border-gray-100 p-5">
              <span className="text-sm font-medium text-slate-400">
                Showing {showingFrom} to {showingTo} of {totalEntries} entries
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={safePage <= 1}
                  className="rounded border border-gray-200 bg-white px-4 py-2 text-sm text-slate-500 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Prev
                </button>
                <button type="button" className="rounded bg-yellow-400 px-4 py-2 text-sm font-bold text-black">
                  {safePage}
                </button>
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  disabled={safePage >= totalPages}
                  className="rounded border border-gray-200 bg-white px-4 py-2 text-sm text-slate-500 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
        </MotionDiv>
      </AnimatePresence>
    </div>
  );
};

export default ManageFleet;

