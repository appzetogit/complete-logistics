import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Search, User, Wallet } from 'lucide-react';
import { useParams } from 'react-router-dom';

import AdminPageHeader from '../../components/ui/AdminPageHeader';
import { adminCardClass, adminInputClass } from '../../components/ui/adminUi';

const statusPillClass = (status) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'processed' || normalized === 'approved') {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }
  if (normalized === 'rejected' || normalized === 'failed') {
    return 'bg-red-50 text-red-700 border-red-200';
  }
  return 'bg-amber-50 text-amber-700 border-amber-200';
};

const WithdrawalRequestOwnerDetail = () => {
  const { id } = useParams();

  const [itemsPerPage] = useState(10);
  const [history, setHistory] = useState([]);
  const [owner, setOwner] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const token = localStorage.getItem('adminToken');
        const res = await fetch(
          `${globalThis.__LEGACY_BACKEND_ORIGIN__}/api/v1/admin/wallet/owners/${id}/withdrawals?limit=${itemsPerPage}`,
          {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          },
        );

        const data = await res.json();
        if (data.success) {
          setOwner(data.data?.owner ?? null);
          const mapped = (data.data?.results || []).map((withdrawal) => ({
            id: withdrawal._id,
            date: new Date(withdrawal.createdAt).toLocaleDateString('en-GB', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            }),
            time: new Date(withdrawal.createdAt).toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
            }),
            amount: `${withdrawal.requested_currency || 'INR'} ${withdrawal.amount}`,
            status: withdrawal.status,
          }));
          setHistory(mapped);
        } else {
          setOwner(null);
          setHistory([]);
        }
      } catch (err) {
        console.error('Fetch error:', err);
        setOwner(null);
        setHistory([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [id, itemsPerPage]);

  const filteredHistory = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return history;
    return history.filter((tx) => {
      const ref = `ref-${tx.id.slice(-8)}`.toLowerCase();
      return (
        ref.includes(needle) ||
        tx.status?.toLowerCase?.().includes(needle) ||
        tx.amount?.toLowerCase?.().includes(needle) ||
        tx.date?.toLowerCase?.().includes(needle)
      );
    });
  }, [history, query]);

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <div className="p-6 lg:p-8">
        <AdminPageHeader
          module="Owner Wallet"
          page="Withdrawal Requests"
          title="Withdrawal Details"
          backTo="/admin/owners/wallet/withdrawals"
        />

        <div className="mt-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-4">
          <div className={adminCardClass}>
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
              <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                <User size={18} />
              </div>
              <div>
                <h3 className="text-sm text-gray-900 font-bold">{owner?.name || 'Owner'}</h3>
                <p className="text-xs text-gray-400">
                  {owner?.mobile ? `+91${owner.mobile}` : 'No phone available'}
                </p>
              </div>
            </div>

            <div className="space-y-5">
              <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                <span className="text-xs font-semibold text-gray-500">Wallet Balance</span>
                <span className="text-sm font-semibold text-gray-900">{owner?.wallet_balance ?? '0.00'}</span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
                  <p className="text-xs font-semibold text-gray-500">Total Earned</p>
                  <p className="mt-1 text-sm font-semibold text-gray-900">{`\u20B9${owner?.total_earned ?? '0'}`}</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
                  <p className="text-xs font-semibold text-gray-500">Total Withdrawn</p>
                  <p className="mt-1 text-sm font-semibold text-gray-900">{`\u20B9${owner?.total_withdrawn ?? '0'}`}</p>
                </div>
              </div>
            </div>
          </div>

          <div className={adminCardClass}>
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
              <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                <Wallet size={18} />
              </div>
              <div>
                <h3 className="text-sm text-gray-900 font-bold">Summary</h3>
                <p className="text-xs text-gray-400">Withdrawal history overview.</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                <p className="text-xs font-semibold text-gray-500">Total Requests</p>
                <p className="mt-1 text-sm font-semibold text-gray-900">{filteredHistory.length}</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                <p className="text-xs font-semibold text-gray-500">Processed</p>
                <p className="mt-1 text-sm font-semibold text-gray-900">
                  {filteredHistory.filter((item) => String(item.status).toLowerCase() === 'processed').length}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-8">
          <div className={adminCardClass}>
            <div className="flex flex-col gap-4 border-b border-gray-100 pb-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-sm text-gray-900 font-bold">Transactions</h3>
                <p className="text-xs text-gray-400">Recent withdrawal requests for this owner.</p>
              </div>
              <div className="relative w-full md:w-72">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search by ref, status, amount..."
                  className={`${adminInputClass} pl-9`}
                />
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="py-3 pr-4 text-xs font-semibold text-gray-500">Date</th>
                    <th className="py-3 pr-4 text-xs font-semibold text-gray-500">Reference</th>
                    <th className="py-3 pr-4 text-xs font-semibold text-gray-500">Amount</th>
                    <th className="py-3 text-right text-xs font-semibold text-gray-500">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {isLoading ? (
                    <tr>
                      <td colSpan={4} className="py-10 text-center">
                        <Loader2 className="mx-auto animate-spin text-indigo-600" size={22} />
                      </td>
                    </tr>
                  ) : filteredHistory.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-14 text-center text-sm text-gray-500">
                        No transactions found.
                      </td>
                    </tr>
                  ) : (
                    filteredHistory.map((tx) => (
                      <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                        <td className="py-4 pr-4 text-sm text-gray-700">
                          <div className="flex flex-col">
                            <span className="font-medium text-gray-900">{tx.date}</span>
                            <span className="text-xs text-gray-400">{tx.time}</span>
                          </div>
                        </td>
                        <td className="py-4 pr-4 text-sm text-gray-700">
                          <span className="font-mono text-xs text-indigo-700">{`REF-${tx.id
                            .slice(-8)
                            .toUpperCase()}`}</span>
                        </td>
                        <td className="py-4 pr-4 text-sm font-medium text-gray-900">{tx.amount}</td>
                        <td className="py-4 text-right">
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${statusPillClass(
                              tx.status,
                            )}`}
                          >
                            {tx.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        </div>
        </div>
      </div>
    </div>
  );
};

export default WithdrawalRequestOwnerDetail;
