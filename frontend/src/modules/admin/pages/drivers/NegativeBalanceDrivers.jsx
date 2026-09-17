import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Eye, FileSearch, MoreHorizontal, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const BASE = () => `${globalThis.__LEGACY_BACKEND_ORIGIN__}/api/v1/admin/wallet/drivers/negative-balance`;

const NegativeBalanceDrivers = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [page, setPage] = useState(1);
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [rows, setRows] = useState([]);
  const [paginator, setPaginator] = useState(null);
  const [summary, setSummary] = useState({ total_outstanding: 0 });
  const [loading, setLoading] = useState(true);

  const fetchRows = async ({ nextPage = page, nextLimit = itemsPerPage, nextSearch = searchTerm } = {}) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('adminToken');
      const params = new URLSearchParams({
        page: String(nextPage),
        limit: String(nextLimit),
      });
      if (String(nextSearch || '').trim()) {
        params.set('search', String(nextSearch).trim());
      }
      const res = await fetch(`${BASE()}?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setRows(data.data?.results || []);
        setPaginator(data.data?.paginator || null);
        setSummary(data.data?.summary || { total_outstanding: 0 });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRows({ nextPage: 1, nextLimit: itemsPerPage, nextSearch: searchTerm });
    setPage(1);
  }, [itemsPerPage]);

  useEffect(() => {
    const id = setTimeout(() => {
      fetchRows({ nextPage: 1, nextLimit: itemsPerPage, nextSearch: searchTerm });
      setPage(1);
    }, 250);
    return () => clearTimeout(id);
  }, [searchTerm]);

  useEffect(() => {
    fetchRows({ nextPage: page, nextLimit: itemsPerPage, nextSearch: searchTerm });
  }, [page]);

  useEffect(() => {
    if (!activeMenuId) return undefined;
    const handle = () => setActiveMenuId(null);
    window.addEventListener('click', handle);
    return () => window.removeEventListener('click', handle);
  }, [activeMenuId]);

  const totalPages = useMemo(() => Math.max(1, Number(paginator?.last_page || 1)), [paginator]);
  const safePage = useMemo(() => Math.min(Math.max(1, page), totalPages), [page, totalPages]);
  const totalEntries = useMemo(() => Number(paginator?.total || 0), [paginator]);
  const perPage = useMemo(() => Number(paginator?.per_page || itemsPerPage), [paginator, itemsPerPage]);
  const startIndex = useMemo(() => (safePage - 1) * perPage, [safePage, perPage]);
  const showingFrom = totalEntries === 0 ? 0 : startIndex + 1;
  const showingTo = totalEntries === 0 ? 0 : Math.min(startIndex + rows.length, totalEntries);

  return (
    <div className="min-h-screen bg-gray-50 p-6 lg:p-8 font-sans text-gray-900">
      <div className="mb-6">
        <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-2">
          <span>Driver Wallet</span>
          <ChevronRight size={12} />
          <span className="text-gray-700">Negative Balance Drivers</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl text-gray-900 font-bold">Negative Balance Drivers</h1>
          <div className="text-sm text-gray-500">
            Total Outstanding: <span className="font-semibold text-rose-600">₹ {Number(summary.total_outstanding || 0).toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span>Show</span>
            <select
              value={itemsPerPage}
              onChange={(e) => setItemsPerPage(Number(e.target.value) || 10)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-colors"
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <span>entries</span>
          </div>

          <div className="relative w-full md:w-72">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search..."
              className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-800 bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-colors"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">            <thead className="bg-gray-50">
              <tr className="text-xs font-semibold text-gray-500">
                <th className="px-6 py-4">Name</th>
                <th className="px-6 py-4">Driver Code</th>
                <th className="px-6 py-4">Service Location</th>
                <th className="px-6 py-4">Email</th>
                <th className="px-6 py-4">Mobile Number</th>
                <th className="px-6 py-4">Transport Type</th>
                <th className="px-6 py-4">Approved Status</th>
                <th className="px-6 py-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-16 text-center text-sm text-gray-400">
                    Loading...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-3 text-gray-400">
                      <FileSearch size={44} strokeWidth={1.5} />
                      <p className="text-sm font-medium">No Data Found</p>
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((item) => (
                  <tr key={item._id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm text-gray-800">{item.name || 'Unknown'}</td>
                    <td className="px-6 py-4 text-sm font-medium">
                      <span className="font-mono font-semibold text-xs text-indigo-600 bg-indigo-50 px-2 py-1 rounded shadow-sm border border-indigo-100">
                        {item.driver_code || item.referralCode || (item.mobile ? `DRV${String(item.mobile).slice(-4)}${String(item._id || '').slice(-6).toUpperCase()}`.replace(/\W/g, '') : 'N/A')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{item.service_location_name || '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{item.email || '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{item.mobile || '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-600 capitalize">{item.transport_type || '-'}</td>
                    <td className="px-6 py-4 text-sm">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                          item.approve ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {item.approve ? 'Approved' : 'Pending'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="relative inline-flex items-center justify-end">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenuId((current) => (current === item._id ? null : item._id));
                          }}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition-colors"
                          title="Actions"
                        >
                          <MoreHorizontal size={16} />
                        </button>
 
                        {activeMenuId === item._id ? (
                          <div
                            className="absolute right-0 top-full mt-2 w-44 bg-white rounded-xl shadow-lg border border-gray-200 py-2 z-50"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setActiveMenuId(null);
                                navigate(`/admin/drivers/${item._id}`);
                              }}
                              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3 transition-colors"
                            >
                              <Eye size={16} className="text-indigo-600" />
                              View
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t border-gray-100 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-sm text-gray-500">
          <div>
            Showing {showingFrom} to {showingTo} of {totalEntries} entries
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Prev
            </button>
            <span className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm">{safePage}</span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NegativeBalanceDrivers;
