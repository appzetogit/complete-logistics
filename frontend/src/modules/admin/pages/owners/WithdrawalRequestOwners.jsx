import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Eye, FileSearch, Loader2, Menu } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { adminService } from '../../services/adminService';
import AdminPageHeader from '../../components/ui/AdminPageHeader';

const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const formatAmount = (value, currency = 'INR') => {
  const amount = Number(value || 0);
  return `${currency} ${amount.toFixed(2)}`;
};

const getOwnerName = (item) =>
  item.owner_id?.name ||
  item.owner_id?.owner_name ||
  item.owner_id?.company_name ||
  item.owner?.name ||
  item.owner?.company_name ||
  '-';

const getStatusClass = (status) => {
  const normalized = String(status || '').toLowerCase();

  if (['approved', 'processed', 'completed', 'paid'].includes(normalized)) {
    return 'bg-emerald-50 text-emerald-700';
  }

  if (['rejected', 'cancelled', 'failed'].includes(normalized)) {
    return 'bg-red-50 text-red-600';
  }

  return 'bg-amber-50 text-amber-700';
};

const WithdrawalRequestOwners = () => {
  const navigate = useNavigate();
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [page, setPage] = useState(1);
  const [requests, setRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchWithdrawals = async () => {
      setIsLoading(true);

      try {
        const response = await adminService.getWithdrawals();

        if (response.success) {
          const results = response.data?.results || response.data || [];
          setRequests(results.filter((item) => item.owner_id || item.owner));
        }
      } catch (error) {
        console.error('Owner withdrawals fetch failed:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchWithdrawals();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [itemsPerPage]);

  const totalEntries = requests.length;
  const totalPages = Math.max(1, Math.ceil(totalEntries / itemsPerPage));
  const safePage = Math.min(page, totalPages);
  const pagedRequests = useMemo(() => {
    const start = (safePage - 1) * itemsPerPage;
    return requests.slice(start, start + itemsPerPage);
  }, [itemsPerPage, requests, safePage]);
  const showingFrom = totalEntries === 0 ? 0 : (safePage - 1) * itemsPerPage + 1;
  const showingTo = totalEntries === 0 ? 0 : Math.min(showingFrom + pagedRequests.length - 1, totalEntries);

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-950">
      <div className="px-4 py-2 lg:px-6 lg:py-2">
        <AdminPageHeader module="Owner Wallet" page="Withdrawal Requests" title="Withdrawal Requests" />

        <div className="mt-4">
        <div className="relative rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 text-sm font-semibold text-slate-500">
            <span>Show</span>
            <div className="relative">
              <select
                value={itemsPerPage}
                onChange={(event) => setItemsPerPage(Number(event.target.value) || 10)}
                className="h-9 w-24 appearance-none rounded border border-gray-300 bg-white px-3 text-sm text-gray-950 outline-none transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
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

          <div className="px-5">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-4 text-sm font-bold text-gray-950">Date</th>
                    <th className="px-3 py-4 text-sm font-bold text-gray-950">Name</th>
                    <th className="px-3 py-4 text-sm font-bold text-gray-950">Requested Amount</th>
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
                          <p className="text-sm font-semibold">Loading withdrawal requests...</p>
                        </div>
                      </td>
                    </tr>
                  ) : pagedRequests.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="border-b border-gray-200 px-3 py-16 text-center">
                        <div className="flex flex-col items-center justify-center text-slate-500">
                          <FileSearch size={48} strokeWidth={1.5} className="mb-3 text-yellow-500 opacity-80" />
                          <p className="text-sm font-semibold">No withdrawal requests found</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    pagedRequests.map((item) => {
                      const ownerId = item.owner_id?._id || item.owner_id || item.owner?._id || item._id;
                      const status = item.status || 'requested';

                      return (
                        <tr key={item._id || ownerId} className="bg-white transition-colors hover:bg-gray-50 border-b border-gray-100">
                          <td className="px-3 py-4 text-sm text-gray-950">
                            {formatDate(item.createdAt || item.last_request_at)}
                          </td>
                          <td className="px-3 py-4 text-sm text-gray-950">{getOwnerName(item)}</td>
                          <td className="px-3 py-4 text-sm text-gray-950">
                            {formatAmount(item.amount || item.pending_amount, item.requested_currency || 'INR')}
                          </td>
                          <td className="px-3 py-4 text-sm">
                            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold capitalize ${getStatusClass(status)}`}>
                              {status}
                            </span>
                          </td>
                          <td className="px-3 py-4">
                            <button
                              type="button"
                              onClick={() => navigate(`/admin/owners/wallet/withdrawals/${ownerId}`)}
                              className="inline-flex h-8 w-9 items-center justify-center rounded bg-yellow-50 text-yellow-600 transition-colors hover:bg-yellow-100"
                              title="View withdrawal request"
                            >
                              <Eye size={16} />
                            </button>
                          </td>
                        </tr>
                      );
                    })
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
            <button
              type="button"
              className="rounded bg-yellow-400 px-4 py-2 text-sm font-bold text-black"
            >
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
  );
};

export default WithdrawalRequestOwners;
