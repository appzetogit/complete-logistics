import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Search, Globe, Trash2, ChevronRight, Loader2, Edit2, X, AlertTriangle } from 'lucide-react';
import { adminService } from '../../services/adminService';
import toast from 'react-hot-toast';

const StatusToggle = ({ active, onToggle }) => (
  <button
    onClick={onToggle}
    className={`w-10 h-5 rounded-full transition-colors relative focus:outline-none ${active ? 'bg-yellow-400' : 'bg-gray-300'}`}
  >
    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${active ? 'left-[22px]' : 'left-0.5'}`} />
  </button>
);

const Languages = () => {
  const [languages, setLanguages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Table state
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({ name: '', code: '', active: 1, default_status: 0 });
  const [submitting, setSubmitting] = useState(false);
  
  // Delete confirm state
  const [deleteId, setDeleteId] = useState(null);

  const fetchLanguages = async () => {
    try {
      setIsLoading(true);
      const response = await adminService.getLanguages();
      const data = response?.paginator?.data || response?.results || (Array.isArray(response) ? response : []);
      setLanguages(data);
      setError(null);
    } catch (err) {
      console.error('Fetch Languages Error:', err);
      setError('Failed to load languages.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchLanguages(); }, []);

  const handleToggleStatus = async (id, currentStatus) => {
    try {
      await adminService.updateLanguageStatus(id, { active: currentStatus ? 0 : 1 });
      toast.success('Status updated successfully');
      fetchLanguages();
    } catch (err) {
      console.error('Toggle Status Error:', err);
      toast.error(err.response?.data?.message || 'Failed to update status');
    }
  };

  const handleDeleteClick = (lang) => {
    if (lang.default_status === 1) {
      toast.error('Cannot delete the default language.');
      return;
    }
    setDeleteId(lang._id || lang.id);
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      setSubmitting(true);
      await adminService.deleteLanguage(deleteId);
      toast.success('Language deleted successfully');
      setDeleteId(null);
      fetchLanguages();
    } catch (err) {
      console.error('Delete Error:', err);
      toast.error(err.response?.data?.message || 'Failed to delete language');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSetDefault = async (id) => {
    try {
      await adminService.updateLanguage(id, { default_status: 1 });
      toast.success('Default language updated');
      fetchLanguages();
    } catch (err) {
      console.error('Set Default Error:', err);
      toast.error('Failed to set default language');
    }
  };

  const openAddModal = () => {
    setEditingId(null);
    setFormData({ name: '', code: '', active: 1, default_status: 0 });
    setIsModalOpen(true);
  };

  const openEditModal = (lang) => {
    setEditingId(lang._id || lang.id);
    setFormData({
      name: lang.name || '',
      code: lang.code || '',
      active: lang.active ?? 1,
      default_status: lang.default_status ?? 0
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setFormData({ name: '', code: '', active: 1, default_status: 0 });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.code.trim()) {
      toast.error('Name and Code are required');
      return;
    }
    
    // Check duplicates locally
    const isDuplicate = languages.some(l => 
      l.code.toLowerCase() === formData.code.trim().toLowerCase() && 
      (l._id || l.id) !== editingId
    );
    if (isDuplicate) {
      toast.error('Language code already exists');
      return;
    }

    try {
      setSubmitting(true);
      if (editingId) {
        await adminService.updateLanguage(editingId, formData);
        toast.success('Language updated successfully');
      } else {
        await adminService.createLanguage(formData);
        toast.success('Language added successfully');
      }
      closeModal();
      fetchLanguages();
    } catch (err) {
      console.error('Save Error:', err);
      toast.error(err.response?.data?.message || 'Failed to save language');
    } finally {
      setSubmitting(false);
    }
  };

  // Filter & Pagination logic
  const filtered = useMemo(() => {
    return languages.filter(l =>
      (l.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (l.code || '').toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [languages, searchQuery]);

  const totalPages = Math.ceil(filtered.length / itemsPerPage) || 1;
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filtered.slice(start, start + itemsPerPage);
  }, [filtered, currentPage, itemsPerPage]);

  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [filtered.length, itemsPerPage, totalPages, currentPage]);

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8 font-sans">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium mb-4">
        <span>Masters</span>
        <ChevronRight size={14} />
        <span className="text-gray-900">Languages</span>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Languages</h1>
        <button 
          onClick={openAddModal}
          className="flex items-center justify-center gap-2 px-5 py-2.5 bg-yellow-400 text-black text-sm font-semibold rounded-lg hover:bg-yellow-500 transition-colors shadow-sm w-full sm:w-auto"
        >
          <Plus size={18} /> Add Language
        </button>
      </div>

      {/* Table Card */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm flex flex-col">
        {/* Toolbar */}
        <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-gray-600 font-medium">
            <span>Show</span>
            <select 
              value={itemsPerPage}
              onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 outline-none"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
            <span>entries</span>
          </div>
          <div className="relative w-full sm:w-auto">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search languages..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="w-full sm:w-64 pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 outline-none transition-colors"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 min-w-[600px]">
              <Loader2 className="w-8 h-8 text-yellow-500 animate-spin" />
              <p className="text-sm text-gray-500 font-medium">Loading languages...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 min-w-[600px]">
              <p className="text-sm text-red-500 font-medium">{error}</p>
              <button onClick={fetchLanguages} className="text-sm text-yellow-600 font-semibold hover:underline">Retry</button>
            </div>
          ) : (
            <table className="w-full text-left min-w-[600px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-6 py-4 text-xs font-semibold text-gray-600 whitespace-nowrap">Name</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-600 whitespace-nowrap">Code</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-600 whitespace-nowrap">Default</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-600 whitespace-nowrap">Status</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {paginatedData.length > 0 ? paginatedData.map((lang, idx) => (
                  <tr key={lang._id || lang.id || idx} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{lang.name}</td>
                    <td className="px-6 py-4 text-sm font-normal text-gray-600">{lang.code}</td>
                    <td className="px-6 py-4">
                      {lang.default_status === 1 ? (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700">
                          Default
                        </span>
                      ) : (
                        <button 
                          onClick={() => handleSetDefault(lang._id || lang.id)}
                          className="text-xs font-medium text-gray-500 hover:text-yellow-600 transition-colors px-2 py-1 rounded hover:bg-yellow-50"
                        >
                          Set as Default
                        </button>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <StatusToggle
                        active={lang.active === 1}
                        onToggle={() => handleToggleStatus(lang._id || lang.id, lang.active === 1)}
                      />
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={() => openEditModal(lang)}
                          className="p-1.5 text-gray-400 hover:text-yellow-600 hover:bg-yellow-50 rounded-lg transition-colors"
                          title="Edit Language"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteClick(lang)}
                          disabled={lang.default_status === 1}
                          className={`p-1.5 rounded-lg transition-colors ${
                            lang.default_status === 1 
                              ? 'text-gray-300 cursor-not-allowed' 
                              : 'text-gray-400 hover:text-red-600 hover:bg-red-50'
                          }`}
                          title={lang.default_status === 1 ? "Cannot delete default language" : "Delete Language"}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan="5" className="px-6 py-16 text-center text-sm text-gray-500 font-medium">
                      No languages found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer / Pagination */}
        {!isLoading && filtered.length > 0 && (
          <div className="px-6 py-4 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4">
            <span className="text-sm text-gray-500 font-medium">
              Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filtered.length)} of {filtered.length} entries
            </span>
            <div className="flex items-center gap-1">
              <button 
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded disabled:opacity-50 disabled:hover:bg-transparent transition-colors"
              >
                Prev
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`w-8 h-8 flex items-center justify-center rounded text-sm font-medium transition-colors ${
                      currentPage === page 
                        ? 'bg-yellow-400 text-black shadow-sm' 
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {page}
                  </button>
                ))}
              </div>
              <button 
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded disabled:opacity-50 disabled:hover:bg-transparent transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingId ? 'Edit Language' : 'Add Language'}
              </h3>
              <button 
                onClick={closeModal}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Language Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    placeholder="e.g., English"
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-yellow-400/20 focus:border-yellow-400 outline-none transition-all text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Language Code *</label>
                  <input
                    type="text"
                    required
                    value={formData.code}
                    onChange={(e) => setFormData({...formData, code: e.target.value})}
                    placeholder="e.g., en"
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-yellow-400/20 focus:border-yellow-400 outline-none transition-all text-sm"
                  />
                </div>
                
                <div className="flex items-center justify-between py-2">
                  <label className="text-sm font-medium text-gray-700">Status Active</label>
                  <StatusToggle 
                    active={formData.active === 1} 
                    onToggle={() => setFormData({...formData, active: formData.active === 1 ? 0 : 1})} 
                  />
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="default_status"
                    checked={formData.default_status === 1}
                    onChange={(e) => setFormData({...formData, default_status: e.target.checked ? 1 : 0})}
                    className="w-4 h-4 rounded border-gray-300 text-yellow-500 focus:ring-yellow-400"
                  />
                  <label htmlFor="default_status" className="text-sm font-medium text-gray-700 cursor-pointer">
                    Set as Default Language
                  </label>
                </div>
              </div>

              <div className="mt-8 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-sm font-semibold text-black bg-yellow-400 hover:bg-yellow-500 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2 shadow-sm"
                >
                  {submitting && <Loader2 size={16} className="animate-spin" />}
                  {submitting ? 'Saving...' : 'Save Language'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center animate-in fade-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={24} className="text-red-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Language?</h3>
            <p className="text-sm text-gray-500 mb-6">
              Are you sure you want to delete this language? This action cannot be undone.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors flex-1"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={submitting}
                className="px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50 flex-1 flex justify-center items-center gap-2"
              >
                {submitting && <Loader2 size={16} className="animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Languages;
