import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Edit2, FileSearch, Loader2, Plus, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import AdminPageHeader from '../../components/ui/AdminPageHeader';

const BASE = `${globalThis.__LEGACY_BACKEND_ORIGIN__}/api/v1/admin/owner-management`;

const getDocTypeLabel = (value) => {
  const v = String(value || '').toLowerCase();
  if (v === 'front_back' || v === 'front&back' || v === 'frontandback') return 'Front&Back';
  if (v === 'front') return 'Front';
  if (v === 'back') return 'Back';
  if (!v) return '-';
  return value;
};

const OwnerNeededDocuments = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem('adminToken') || '';

  const [isLoading, setIsLoading] = useState(true);
  const [documents, setDocuments] = useState([]);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [page, setPage] = useState(1);

  useEffect(() => setPage(1), [itemsPerPage]);

  const fetchDocuments = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${BASE}/owner-needed-document`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json();
      if (json?.success) {
        const list = Array.isArray(json?.data) ? json.data : json?.data?.results || [];
        setDocuments(Array.isArray(list) ? list : []);
      }
    } catch (e) {
      console.error('Failed to fetch owner needed documents:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this document requirement?')) return;
    try {
      const res = await fetch(`${BASE}/owner-needed-document/${id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json();
      if (json?.success) fetchDocuments();
      else alert(json?.message || 'Delete failed');
    } catch (e) {
      console.error('Failed to delete owner needed document:', e);
      alert('Delete failed');
    }
  };

  const totalEntries = documents.length;
  const totalPages = Math.max(1, Math.ceil(totalEntries / itemsPerPage));
  const safePage = Math.min(page, totalPages);
  const pagedDocs = useMemo(() => {
    const start = (safePage - 1) * itemsPerPage;
    return documents.slice(start, start + itemsPerPage);
  }, [documents, itemsPerPage, safePage]);
  const showingFrom = totalEntries === 0 ? 0 : (safePage - 1) * itemsPerPage + 1;
  const showingTo = totalEntries === 0 ? 0 : Math.min(showingFrom + pagedDocs.length - 1, totalEntries);

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-950">
      <div className="p-6 lg:p-8">
        <AdminPageHeader module="Owner Management" page="Owner Needed Documents" title="Owner Needed Documents" />

        <div className="mt-6">
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
                <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-700" />
              </div>
              <span>Entries</span>
            </div>

            <button
              type="button"
              onClick={() => navigate('/admin/owners/documents/create')}
              className="flex h-10 items-center gap-2 rounded-lg bg-yellow-400 px-5 text-sm font-bold text-black shadow-sm transition-colors hover:bg-yellow-500"
            >
              <Plus size={16} /> Add Owner Needed Documents
            </button>
          </div>

          <div className="px-5">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-4 text-sm font-bold text-gray-950">Name</th>
                    <th className="px-3 py-4 text-sm font-bold text-gray-950">Document Type</th>
                    <th className="px-3 py-4 text-sm font-bold text-gray-950">Has Expiry Date</th>
                    <th className="px-3 py-4 text-sm font-bold text-gray-950">Status</th>
                    <th className="px-3 py-4 text-sm font-bold text-gray-950">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {isLoading ? (
                    <tr>
                      <td colSpan="5" className="px-3 py-24 text-center">
                        <div className="flex flex-col items-center gap-4 text-slate-400">
                          <Loader2 size={34} className="animate-spin text-teal-500" />
                          <p className="text-sm font-semibold">Loading documents...</p>
                        </div>
                      </td>
                    </tr>
                  ) : pagedDocs.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="border-b border-gray-200 px-3 py-10 text-center">
                        <div className="flex min-h-[130px] flex-col items-center justify-center text-slate-500">
                          <FileSearch size={48} strokeWidth={1.5} className="mb-3" />
                          <p className="text-sm font-medium">No documents found</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    pagedDocs.map((doc) => (
                      <tr key={doc._id} className="bg-white transition-colors hover:bg-gray-50">
                        <td className="px-3 py-4 text-sm text-gray-950">{doc?.name || '-'}</td>
                        <td className="px-3 py-4 text-sm text-gray-950">{getDocTypeLabel(doc?.image_type)}</td>
                        <td className="px-3 py-4 text-sm text-gray-950">{doc?.has_expiry_date ? 'Yes' : 'No'}</td>
                        <td className="px-3 py-4">
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                              doc?.active === false ? 'bg-gray-100 text-gray-700' : 'bg-emerald-50 text-emerald-700'
                            }`}
                          >
                            {doc?.active === false ? 'Inactive' : 'Active'}
                          </span>
                        </td>
                        <td className="px-3 py-4">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => navigate(`/admin/owners/documents/create?id=${doc._id}`)}
                              className="inline-flex h-8 w-9 items-center justify-center rounded bg-yellow-50 text-yellow-600 transition-colors hover:bg-yellow-100"
                              title="Edit"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(doc._id)}
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

          <div className="flex items-center justify-between border-t border-gray-100 px-5 py-5">
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
        </div>
        </div>
      </div>
    </div>
  );
};

export default OwnerNeededDocuments;
