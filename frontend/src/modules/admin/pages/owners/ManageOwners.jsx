import React, { useEffect, useState } from 'react';
import {
  Plus,
  Search,
  Filter,
  ChevronRight,
  FileText,
  Edit,
  Lock,
  Trash2,
  Eye,
  ChevronDown,
  LayoutGrid,
  List,
  Menu,
  Loader2,
  XCircle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

import { adminService } from '../../services/adminService';
import OwnerFormPanel from './OwnerFormPanel';
import AdminPageHeader from '../../components/ui/AdminPageHeader';

const initialFormData = {
  company_name: '',
  name: '',
  mobile: '',
  email: '',
  password: '',
  password_confirmation: '',
  service_location_id: '',
  transport_type: '',
};

const defaultTransportTypes = [
  { transport_type: 'all' },
  { transport_type: 'taxi' },
  { transport_type: 'delivery' },
  { transport_type: 'intercity' },
];

const MotionDiv = motion.div;
const ownerStatusOptions = ['pending', 'approved', 'rejected'];

const ManageOwners = () => {
  const navigate = useNavigate();
  const [view, setView] = useState('list');
  const [editingId, setEditingId] = useState(null);
  const [owners, setOwners] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [areas, setAreas] = useState([]);
  const [transportTypes, setTransportTypes] = useState(defaultTransportTypes);
  const [searchTerm, setSearchTerm] = useState('');
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [formData, setFormData] = useState(initialFormData);
  const [showFilters, setShowFilters] = useState(false);

  const fetchInitialData = async () => {
    setIsLoading(true);
    try {
      const [ownersResponse, locationsResponse, modulesResponse] = await Promise.all([
        adminService.getOwners(),
        adminService.getServiceLocations(),
        adminService.getRideModules(),
      ]);

      if (ownersResponse.success) {
        setOwners(ownersResponse.data?.results || []);
      }

      if (locationsResponse.success) {
        const locations = Array.isArray(locationsResponse.data)
          ? locationsResponse.data
          : locationsResponse.data?.results || [];
        setAreas(locations);
      }

      if (modulesResponse.success) {
        const rawModules = modulesResponse.data;
        const mappedModules = Array.isArray(rawModules)
          ? rawModules
          : Object.keys(rawModules || {}).map((key) => ({ transport_type: key }));

        if (mappedModules.length > 0) {
          setTransportTypes(mappedModules);
        }
      }
    } catch (error) {
      console.error('Owner fetch failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInitialData();
  }, [view]);

  const handleEditClick = (owner) => {
    setEditingId(owner._id);
    setFormData({
      company_name: owner.company_name || '',
      name: owner.name || owner.company_name || '',
      mobile: owner.mobile || '',
      email: owner.email || '',
      password: '',
      password_confirmation: '',
      service_location_id: owner.service_location_id || owner.area_id || '',
      transport_type: owner.transport_type || '',
    });
    setView('edit');
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setSubmitting(true);

    try {
      const response = await adminService.updateOwner(editingId, formData);

      if (response.success) {
        setView('list');
        setFormData(initialFormData);
        fetchInitialData();
      } else {
        alert(response.message || 'Failed to update owner');
      }
    } catch (error) {
      alert(error.message || 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const isOwnerApproved = (owner) =>
    owner?.approve === true || owner?.approve === 1 || String(owner?.status || '').toLowerCase() === 'approved';

  const getOwnerStatus = (owner) => {
    const normalizedStatus = String(owner?.status || '').trim().toLowerCase();
    if (ownerStatusOptions.includes(normalizedStatus)) {
      return normalizedStatus;
    }
    return isOwnerApproved(owner) ? 'approved' : 'pending';
  };

  const getStatusClasses = (status) => {
    switch (status) {
      case 'approved':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'rejected':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      default:
        return 'bg-amber-50 text-amber-700 border-amber-200';
    }
  };

  const handleToggleApproval = async (owner) => {
    const ownerId = owner?._id || owner?.id;
    if (!ownerId) return;

    const currentApproved = isOwnerApproved(owner);

    try {
      const response = await adminService.approveOwner(ownerId, { approve: !currentApproved });
      if (response.success) {
        const updatedOwner = response.data;
        setOwners((currentOwners) =>
          currentOwners.map((item) => (item._id === ownerId || item.id === ownerId ? updatedOwner : item))
        );
      } else {
        alert(response.message || 'Failed to update approval status');
      }
    } catch (error) {
      alert(error.message || 'Failed to update approval status');
    }
  };

  const handleStatusChange = async (ownerId, status) => {
    try {
      const response = await adminService.updateOwner(ownerId, {
        status,
        approve: status === 'approved',
      });

      if (response.success) {
        const updatedOwner = response.data;
        setOwners((currentOwners) =>
          currentOwners.map((item) => (item._id === ownerId || item.id === ownerId ? updatedOwner : item))
        );
      } else {
        alert(response.message || 'Failed to update owner status');
      }
    } catch (error) {
      alert(error.message || 'Failed to update owner status');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this owner?')) return;

    try {
      const response = await adminService.deleteOwner(id);
      if (response.success) {
        fetchInitialData();
      } else {
        alert(response.message || 'Delete failed');
      }
    } catch (error) {
      alert(error.message || 'Delete failed');
    }
  };

  const filteredOwners = owners.filter((owner) =>
    owner.company_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    owner.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    owner.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatMobile = (mobile) => {
    if (!mobile) return '-';
    return mobile.startsWith('+') ? mobile : `+91${mobile}`;
  };

  const visibleStart = filteredOwners.length > 0 ? 1 : 0;

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <div className="px-4 py-2 lg:px-6 lg:py-2">
        <AnimatePresence mode="wait">
          {view === 'list' ? (
            <MotionDiv
              key="list"
              initial={{ opacity: 0, scale: 0.99 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.99 }}
              transition={{ duration: 0.2 }}
            >
              <AdminPageHeader module="Owner Management" page="Manage Owners" title="Manage Owners" />

              <div className="mb-4">
                <button
                  onClick={() => navigate('/admin/owners/create')}
                  className="flex items-center gap-2 px-4 py-2 bg-yellow-400 text-black text-sm font-bold rounded-lg hover:bg-yellow-500 transition-colors"
                >
                  <Plus size={15} /> Add Owner
                </button>
              </div>

            <div className="bg-white rounded-xl border border-gray-200 overflow-visible">
              <div className="p-4 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <button className="w-10 h-10 bg-teal-500 text-white rounded-lg flex items-center justify-center shadow-sm">
                    <List size={18} />
                  </button>
                  <button className="w-10 h-10 bg-gray-100 text-gray-400 rounded-lg flex items-center justify-center hover:bg-indigo-50 transition-all">
                    <LayoutGrid size={18} />
                  </button>
                  <div className="flex items-center gap-2 text-xs text-gray-500 ml-4">
                    <span>Show</span>
                    <select
                      value={itemsPerPage}
                      onChange={(e) => setItemsPerPage(Number(e.target.value))}
                      className="border border-gray-200 rounded px-2 py-1 text-xs bg-white"
                    >
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                    </select>
                    <span>entries</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">

                  <button 
                    onClick={() => setShowFilters(!showFilters)}
                    className="bg-yellow-400 text-black px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 shadow-sm hover:bg-yellow-500 transition-colors"
                  >
                    <Filter size={14} /> Filters
                  </button>
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search owners..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg w-56 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Filters Panel */}
              {showFilters && (
                <div className="p-4 border-b border-gray-100 bg-gray-50 flex gap-4 animate-in slide-in-from-top-2">
                  <div className="flex-1">
                    <label className="block text-sm font-bold text-gray-700 mb-1">Company Name</label>
                    <input 
                      type="text" 
                      placeholder="Filter by company..." 
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 outline-none"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-bold text-gray-700 mb-1">Status</label>
                    <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 outline-none">
                      <option value="">All Statuses</option>
                      <option value="approved">Approved</option>
                      <option value="pending">Pending</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="px-6 py-3 text-left text-sm font-bold text-gray-500">Company Name</th>
                      <th className="px-4 py-3 text-left text-sm font-bold text-gray-500">Email</th>
                      <th className="px-4 py-3 text-left text-sm font-bold text-gray-500">Mobile Number</th>
                      <th className="px-4 py-3 text-left text-sm font-bold text-gray-500">Document View</th>
                      <th className="px-4 py-3 text-left text-sm font-bold text-gray-500">Approval Status</th>
                      <th className="px-4 py-3 text-center text-sm font-bold text-gray-500">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {isLoading ? (
                      <tr>
                        <td colSpan="6" className="py-16 text-center">
                          <div className="flex flex-col items-center gap-3">
                            <Loader2 className="w-7 h-7 text-yellow-500 animate-spin" />
                            <p className="text-sm font-bold text-gray-500">Loading owners...</p>
                          </div>
                        </td>
                      </tr>
                    ) : filteredOwners.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="px-6 py-16 text-center text-sm text-gray-400">No owners found</td>
                      </tr>
                    ) : (
                      filteredOwners.map((owner) => (
                        <tr key={owner._id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-6 py-4 text-sm font-medium text-gray-900">{owner.company_name || owner.name || '-'}</td>
                          <td className="px-4 py-4 text-sm text-gray-500">{owner.email || '-'}</td>
                          <td className="px-4 py-4 text-sm text-gray-500">{formatMobile(owner.mobile)}</td>
                          <td className="px-4 py-4">
                            <button
                              onClick={() => navigate(`/admin/owners/${owner._id}`, { state: { tab: 'Documents' } })}
                              className="p-1.5 text-yellow-500 hover:bg-yellow-50 rounded-lg transition-colors"
                            >
                              <FileText size={16} />
                            </button>
                          </td>
                          <td className="px-4 py-4">
                            <select
                              value={getOwnerStatus(owner)}
                              onChange={(e) => handleStatusChange(owner._id, e.target.value)}
                              className={`min-w-[120px] rounded-md border px-2.5 py-1.5 text-xs font-medium capitalize outline-none transition-colors ${getStatusClasses(
                                getOwnerStatus(owner),
                              )}`}
                            >
                              {ownerStatusOptions.map((status) => (
                                <option key={status} value={status}>
                                  {status}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-4 text-center">
                            <div className="inline-flex items-center gap-1">
                              <button
                                onClick={() => handleEditClick(owner)}
                                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                                title="Edit owner"
                              >
                                <Edit size={16} />
                              </button>
                              <button
                                onClick={() => handleDelete(owner._id)}
                                className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                title="Delete owner"
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

              {/* Footer */}
              {!isLoading && filteredOwners.length > 0 && (
                <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
                  <span>Showing 1 to {filteredOwners.length} of {filteredOwners.length} entries</span>
                  <div className="flex items-center gap-1">
                    <button className="px-3 py-1.5 border border-gray-200 rounded text-sm font-bold text-gray-400" disabled>Prev</button>
                    <button className="w-7 h-7 rounded bg-yellow-400 text-black text-sm font-bold">1</button>
                    <button className="px-3 py-1.5 border border-gray-200 rounded text-sm font-bold text-gray-400" disabled>Next</button>
                  </div>
                </div>
              )}
            </div>

            </MotionDiv>
          ) : (
            <MotionDiv
              key="form"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.2 }}
            >
              <OwnerFormPanel
                mode="edit"
                formData={formData}
                setFormData={setFormData}
                areas={areas}
                transportTypes={transportTypes}
                submitting={submitting}
                onSubmit={handleSave}
                onCancel={() => setView('list')}
              />
            </MotionDiv>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default ManageOwners;
