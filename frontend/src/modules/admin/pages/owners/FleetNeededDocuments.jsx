import React, { useCallback, useState, useEffect } from 'react';
import {
  Plus, ChevronRight, Edit2, Trash2, FileText, Save, Check,
  ChevronDown, LayoutGrid, Loader2, AlertCircle, ArrowLeft,
  Shield, ClipboardCheck, Info, FileSearch, Menu
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import AdminPageHeader from '../../components/ui/AdminPageHeader';

const BASE = globalThis.__LEGACY_BACKEND_ORIGIN__ + '/api/v1/admin/owner-management';
const MotionDiv = motion.div;

const FleetNeededDocuments = () => {
  const navigate = useNavigate();
  const [view, setView] = useState('list');
  const [documents, setDocuments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    image_type: '',
    has_expiry_date: '',
    has_identify_number: '',
    is_editable: false,
    is_required: false,
    active: true
  });

  const token = localStorage.getItem('adminToken') || '';

  const fetchDocuments = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${BASE}/driver-needed-document`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setDocuments(Array.isArray(data.data) ? data.data : (data.data?.results || []));
      }
    } catch (err) {
      console.error("Failed to fetch documents:", err);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  useEffect(() => {
    setPage(1);
  }, [itemsPerPage]);

  const resetForm = () => {
    setFormData({
      name: '',
      image_type: '',
      has_expiry_date: '',
      has_identify_number: '',
      is_editable: false,
      is_required: false,
      active: true
    });
    setEditingId(null);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.image_type || formData.has_expiry_date === '' || formData.has_identify_number === '') {
        alert("Please fill all required fields");
        return;
    }

    setSubmitting(true);
    const isEditing = !!editingId;
    const url = isEditing ? `${BASE}/driver-needed-document/${editingId}` : `${BASE}/driver-needed-document`;
    
    try {
      const res = await fetch(url, {
        method: isEditing ? 'PATCH' : 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            ...formData,
            has_expiry_date: formData.has_expiry_date === '1' ? true : false,
            has_identify_number: formData.has_identify_number === '1' ? true : false
        })
      });
      const json = await res.json();
      if (json.success) {
        setView('list');
        fetchDocuments();
        resetForm();
      } else {
        alert(json.message || "Operation failed");
      }
    } catch {
      alert("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this document requirement?")) return;
    try {
      const res = await fetch(`${BASE}/driver-needed-document/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const json = await res.json();
      if (json.success) {
        fetchDocuments();
      }
    } catch {
      alert("Error deleting document");
    }
  };

  const handleEdit = (doc) => {
    setEditingId(doc._id);
    setFormData({
      name: doc.name,
      image_type: doc.image_type,
      has_expiry_date: doc.has_expiry_date ? '1' : '0',
      has_identify_number: doc.has_identify_number ? '1' : '0',
      is_editable: doc.is_editable,
      is_required: doc.is_required,
      active: doc.active
    });
    setView('create');
  };

  const filteredDocs = documents.filter(doc => 
    !searchTerm || doc.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalEntries = filteredDocs.length;
  const totalPages = Math.max(1, Math.ceil(totalEntries / itemsPerPage));
  const safePage = Math.min(page, totalPages);
  const paginatedDocs = filteredDocs.slice((safePage - 1) * itemsPerPage, safePage * itemsPerPage);
  const showingFrom = totalEntries === 0 ? 0 : (safePage - 1) * itemsPerPage + 1;
  const showingTo = totalEntries === 0 ? 0 : Math.min(showingFrom + paginatedDocs.length - 1, totalEntries);

  const inputClass = 'h-10 w-full rounded border border-gray-300 bg-white px-3 text-sm text-gray-950 outline-none transition-colors focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400';
  const labelClass = 'mb-1.5 block text-xs font-bold text-gray-950';

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-950">
      {view === 'list' ? (
        <div className="px-5 pt-3">
          <AdminPageHeader module="Fleet Management" page="Fleet Needed Documents" title="Fleet Needed Documents" />
        </div>
      ) : (
        <div className="mb-6 flex items-center justify-between px-5 pt-3">
          <div className="flex items-center gap-4">
            <button
              onClick={() => { setView('list'); resetForm(); }}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-950 transition-colors shadow-sm"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-950">
                  {editingId ? 'Edit Fleet Needed Document' : 'Create Fleet Needed Document'}
              </h1>
            </div>
          </div>
        </div>
      )}

      <AnimatePresence mode="wait">
        {view === 'list' ? (
          <MotionDiv 
            key="list"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="px-5"
          >
            <div className="relative rounded border border-gray-200 bg-white shadow-sm">
              <div className="flex flex-col gap-5 px-5 py-5 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3 text-sm font-semibold text-slate-500">
                  <span>Show</span>
                  <div className="relative">
                    <select
                      value={itemsPerPage}
                      onChange={(event) => setItemsPerPage(Number(event.target.value) || 10)}
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

                <div className="flex items-center gap-3">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search documents..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="h-10 w-64 rounded border border-gray-300 bg-white pl-10 pr-4 text-sm outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400"
                    />
                    <FileSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate('/admin/fleet/documents/create')}
                    className="flex h-10 items-center gap-2 rounded-lg bg-yellow-400 px-5 text-sm font-bold text-black transition-colors hover:bg-yellow-500 shadow-sm"
                  >
                    <Plus size={16} /> Add Fleet Needed Documents
                  </button>
                </div>
              </div>

              <div className="px-5">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-3 text-sm font-bold text-gray-950">Name</th>
                        <th className="px-3 py-3 text-sm font-bold text-gray-950">Document Type</th>
                        <th className="px-3 py-3 text-sm font-bold text-gray-950">Has Expiry Date</th>
                        <th className="px-3 py-3 text-sm font-bold text-gray-950">Status</th>
                        <th className="px-3 py-3 text-sm font-bold text-gray-950">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {isLoading ? (
                        <tr>
                          <td colSpan="5" className="px-3 py-24 text-center">
                            <div className="flex flex-col items-center gap-4 text-slate-400">
                              <Loader2 size={34} className="animate-spin text-teal-500" />
                              <p className="text-sm font-semibold">Loading fleet needed documents...</p>
                            </div>
                          </td>
                        </tr>
                      ) : paginatedDocs.length === 0 ? (
                        <tr>
                          <td colSpan="5" className="border-b border-gray-200 px-3 py-10 text-center">
                            <div className="flex min-h-[130px] flex-col items-center justify-center text-slate-700">
                              <FileSearch size={92} strokeWidth={1.7} className="mb-2 text-indigo-950" />
                              <p className="text-xl font-medium">No Data Found</p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        paginatedDocs.map((doc) => (
                          <tr key={doc._id} className="bg-white transition-colors hover:bg-gray-50 border-b border-gray-100">
                            <td className="px-3 py-4 text-sm font-medium text-gray-950">{doc.name || '-'}</td>
                            <td className="px-3 py-4 text-sm capitalize text-gray-700">
                              {(doc.image_type || 'image').replace(/_/g, ' ')}
                            </td>
                            <td className="px-3 py-4 text-sm text-gray-700">{doc.has_expiry_date ? 'Yes' : 'No'}</td>
                            <td className="px-3 py-4">
                              <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${doc.active ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                                {doc.active ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td className="px-3 py-4">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleEdit(doc)}
                                  className="inline-flex h-8 w-9 items-center justify-center rounded bg-yellow-50 text-yellow-600 transition-colors hover:bg-yellow-100"
                                  title="Edit document"
                                >
                                  <Edit2 size={16} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDelete(doc._id)}
                                  className="inline-flex h-8 w-9 items-center justify-center rounded bg-rose-50 text-rose-600 transition-colors hover:bg-rose-100"
                                  title="Delete document"
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
          </div>

          <div className="mt-4 flex items-center justify-between pb-6">
              <p className="text-sm font-medium text-slate-400">
                Showing {showingFrom} to {showingTo} of {totalEntries} entries
              </p>
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
          </MotionDiv>
        ) : (
          <MotionDiv 
            key="form"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="flex justify-center py-4"
          >
            <div className="w-full max-w-3xl bg-white rounded-xl border border-gray-200 shadow-sm p-6 lg:p-8">
                  <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
                     <div>
                        <label className={labelClass}>
                           Document Name <span className="text-rose-500">*</span>
                        </label>
                        <input 
                          type="text" 
                          placeholder="Enter Name"
                          required
                          value={formData.name}
                          onChange={(e) => setFormData({...formData, name: e.target.value})}
                          className={inputClass}
                        />
                     </div>

                     <div>
                        <label className={labelClass}>
                           Image Type <span className="text-rose-500">*</span>
                        </label>
                        <div className="relative">
                           <select 
                             required
                             value={formData.image_type}
                             onChange={(e) => setFormData({...formData, image_type: e.target.value})}
                             className={`${inputClass} appearance-none pr-10`}
                           >
                             <option value="">Select</option>
                             <option value="front">Front</option>
                             <option value="front_back">Front & Back</option>
                           </select>
                           <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
                        </div>
                     </div>

                     <div>
                        <label className={labelClass}>
                           Has Expiry Date <span className="text-rose-500">*</span>
                        </label>
                        <div className="relative">
                           <select 
                             required
                             value={formData.has_expiry_date}
                             onChange={(e) => setFormData({...formData, has_expiry_date: e.target.value})}
                             className={`${inputClass} appearance-none pr-10`}
                           >
                             <option value="">Select</option>
                             <option value="1">Yes</option>
                             <option value="0">No</option>
                           </select>
                           <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
                        </div>
                     </div>

                     <div>
                        <label className={labelClass}>
                           Has Identify Number <span className="text-rose-500">*</span>
                        </label>
                        <div className="relative">
                           <select 
                             required
                             value={formData.has_identify_number}
                             onChange={(e) => setFormData({...formData, has_identify_number: e.target.value})}
                             className={`${inputClass} appearance-none pr-10`}
                           >
                             <option value="">Select</option>
                             <option value="1">Yes</option>
                             <option value="0">No</option>
                           </select>
                           <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
                        </div>
                     </div>

                     <div className="col-span-1 md:col-span-2 flex flex-wrap items-center gap-8 pt-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                           <input 
                             type="checkbox" 
                             checked={formData.is_editable}
                             onChange={(e) => setFormData({...formData, is_editable: e.target.checked})}
                             className="w-4 h-4 rounded border-gray-300 text-yellow-500 focus:ring-yellow-500"
                           />
                           <span className="text-sm font-semibold text-gray-900">Is Editable?</span>
                        </label>

                        <label className="flex items-center gap-2 cursor-pointer">
                           <input 
                             type="checkbox" 
                             checked={formData.is_required}
                             onChange={(e) => setFormData({...formData, is_required: e.target.checked})}
                             className="w-4 h-4 rounded border-gray-300 text-yellow-500 focus:ring-yellow-500"
                           />
                           <span className="text-sm font-semibold text-gray-900">Is Required?</span>
                        </label>
                     </div>

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
                           className="h-10 px-8 bg-black text-white rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-gray-900 transition-colors shadow-sm disabled:opacity-50"
                         >
                            {submitting ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                            {editingId ? 'Update' : 'Save'}
                         </button>
                     </div>
                  </form>
            </div>
          </MotionDiv>
        )}
      </AnimatePresence>
    </div>
  );
};

export default FleetNeededDocuments;

