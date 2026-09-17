import React, { useEffect, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  ChevronRight,
  Clock,
  History,
  Loader2,
  Search,
  Send,
  Truck,
  User,
  Wallet,
} from 'lucide-react';
import { adminService } from '../../services/adminService';
import { toast } from 'react-hot-toast';

const roleOptions = [
  { id: 'user', label: 'User', icon: User },
  { id: 'driver', label: 'Driver', icon: Truck },
  { id: 'owner', label: 'Owner', icon: Building2 },
];

const inputClass =
  'w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-800 bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-colors disabled:bg-gray-50 disabled:text-gray-400';
const labelClass = 'block text-xs font-semibold text-gray-500 mb-1.5';

const WalletPayment = () => {
  const [role, setRole] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [searching, setSearching] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [history, setHistory] = useState([]);
  const [balance, setBalance] = useState(0);
  
  const [amount, setAmount] = useState('');
  const [operation, setOperation] = useState('credit');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (searchQuery.length >= 3 && role) {
        handleSearch();
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, role]);

  const handleSearch = async () => {
    setSearching(true);
    try {
      let res;
      if (role === 'user') res = await adminService.searchUsers(searchQuery);
      else if (role === 'driver') res = await adminService.searchDrivers(searchQuery);
      else if (role === 'owner') res = await adminService.searchOwners(searchQuery);
      
      setSearchResults(res.data.results || []);
    } catch (err) {
      toast.error('Search failed');
    } finally {
      setSearching(false);
    }
  };

  const fetchHistory = async (entity) => {
    setLoadingHistory(true);
    try {
      let res;
      if (role === 'user') res = await adminService.getUserWalletHistory(entity._id);
      else if (role === 'driver') res = await adminService.getDriverWalletHistory(entity._id);
      else if (role === 'owner') res = await adminService.getOwnerWalletHistory(entity._id);
      
      setHistory(res.data.results || []);
      setBalance(res.data.balance || 0);
    } catch (err) {
      toast.error('Failed to load history');
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleSelectEntity = (entity) => {
    setSelectedEntity(entity);
    setSearchResults([]);
    setSearchQuery(`${entity.name || entity.owner_name} (${entity.phone || entity.mobile})`);
    fetchHistory(entity);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!amount || amount <= 0) return toast.error('Enter valid amount');
    if (!selectedEntity) return toast.error('Select a user/driver/owner');

    setSubmitting(true);
    try {
      const data = { amount: Number(amount), operation, description };
      if (role === 'user') await adminService.adjustUserWallet(selectedEntity._id, data);
      else if (role === 'driver') await adminService.adjustDriverWallet(selectedEntity._id, data);
      else if (role === 'owner') await adminService.adjustOwnerWallet(selectedEntity._id, data);

      toast.success(`Successfully ${operation}ed ₹${amount}`);
      setAmount('');
      setDescription('');
      fetchHistory(selectedEntity);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Adjustment failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 lg:p-6">
      <div className="mb-4">
        <div className="mb-2 flex items-center gap-1.5 text-xs text-gray-400">
          <span>Wallet</span>
          <ChevronRight size={12} />
          <span className="text-gray-700 font-medium">Wallet Payment</span>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg text-gray-900 font-bold">Wallet Payment</h1>
            <p className="mt-1 text-sm text-gray-500">
              Manage and adjust balances for Users, Drivers, and Fleet Owners
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-5">
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <div className="mb-6 flex items-center gap-3 border-b border-gray-100 pb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                <Search size={18} />
              </div>
              <div>
                <h2 className="text-sm text-gray-900 font-bold">Select Account</h2>
                <p className="text-xs text-gray-400">
                  Choose role and search account before wallet adjustment
                </p>
              </div>
            </div>

            <div className="space-y-5">
              <div>
                <label className={labelClass}>Select Role</label>
                <div className="grid grid-cols-3 gap-2">
                  {roleOptions.map((roleOption) => (
                    <button
                      key={roleOption.id}
                      type="button"
                      onClick={() => {
                        setRole(roleOption.id);
                        setSelectedEntity(null);
                        setSearchQuery('');
                        setSearchResults([]);
                        setHistory([]);
                        setBalance(0);
                      }}
                      className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                        role === roleOption.id
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-600'
                          : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-gray-700'
                      }`}
                    >
                      <roleOption.icon size={15} />
                      <span>{roleOption.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="relative">
                <label className={labelClass}>Search Account</label>
                <div className="relative">
                  <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                    {searching ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />}
                  </div>
                  <input
                    type="text"
                    disabled={!role}
                    placeholder={role ? 'Search name, email or mobile...' : 'Select role first'}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={`${inputClass} pl-10 pr-20`}
                  />
                  {selectedEntity && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedEntity(null);
                        setSearchQuery('');
                        setHistory([]);
                        setBalance(0);
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-500 hover:bg-gray-50"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {searchResults.length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                    {searchResults.map((item) => (
                      <button
                        key={item._id}
                        type="button"
                        onClick={() => handleSelectEntity(item)}
                        className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-gray-50"
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-700">
                          {(item.name || item.owner_name || '?')[0].toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-900">
                            {item.name || item.owner_name}
                          </p>
                          <p className="truncate text-xs text-gray-500">
                            {item.phone || item.mobile || item.email}
                          </p>
                        </div>
                        <ChevronRight size={14} className="text-gray-300" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {selectedEntity && (
                <form onSubmit={handleSubmit} className="space-y-4 border-t border-gray-100 pt-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>Amount (INR)</label>
                      <input
                        type="number"
                        min="0"
                        required
                        placeholder="0.00"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Operation</label>
                      <select
                        value={operation}
                        onChange={(e) => setOperation(e.target.value)}
                        className={inputClass}
                      >
                        <option value="credit">Credit</option>
                        <option value="debit">Debit</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>Description</label>
                    <textarea
                      placeholder="Reason for adjustment..."
                      rows={2}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className={inputClass}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
                    Submit Adjustment
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6 lg:col-span-7">
          {selectedEntity && (
            <div className="rounded-xl border border-gray-200 bg-white p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Current Balance
                  </p>
                  <h3 className="mt-2 text-3xl text-gray-900 font-bold">
                    INR{' '}
                    {Number(balance || 0).toLocaleString('en-IN', {
                      minimumFractionDigits: 2,
                    })}
                  </h3>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                  <Wallet size={18} />
                </div>
              </div>
              <div className="mt-4 flex items-center gap-3 rounded-lg bg-gray-50 p-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-xs font-semibold text-gray-700">
                    {(selectedEntity.name || selectedEntity.owner_name || '?')[0].toUpperCase()}
                  </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {selectedEntity.name || selectedEntity.owner_name}
                  </p>
                  <p className="text-xs text-gray-500">{selectedEntity.phone || selectedEntity.mobile}</p>
                </div>
              </div>
            </div>
          )}

          <div className="min-h-[420px] rounded-xl border border-gray-200 bg-white p-6">
            <div className="mb-5 flex items-center justify-between border-b border-gray-100 pb-4">
              <h2 className="flex items-center gap-2 text-sm text-gray-900 font-bold">
                <Clock size={16} className="text-gray-400" /> Transaction History
              </h2>
              {loadingHistory && <Loader2 className="animate-spin text-indigo-500" size={16} />}
            </div>

            {!selectedEntity ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-50 text-gray-300">
                  <Search size={26} />
                </div>
                <h3 className="text-sm text-gray-900 font-bold">No Account Selected</h3>
                <p className="mt-1 max-w-xs text-xs text-gray-500">
                  Select a role and search an account to view wallet transactions.
                </p>
              </div>
            ) : history.length === 0 && !loadingHistory ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-50 text-gray-300">
                  <History size={26} />
                </div>
                <h3 className="text-sm text-gray-900 font-bold">No Transactions Found</h3>
                <p className="mt-1 text-xs text-gray-500">This account has no wallet entries yet.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {history.map((tx) => (
                  <div
                    key={tx._id}
                    className="flex items-center justify-between rounded-lg border border-gray-100 px-4 py-3 transition-colors hover:bg-gray-50"
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                          tx.type === 'credit'
                            ? 'bg-emerald-50 text-emerald-600'
                            : 'bg-rose-50 text-rose-600'
                        }`}
                      >
                        {tx.type === 'credit' ? <ArrowUpRight size={18} /> : <ArrowDownLeft size={18} />}
                      </div>
                      <div className="min-w-0">
                        <h4 className="truncate text-sm text-gray-900 font-bold">
                          {tx.description || 'Wallet adjustment'}
                        </h4>
                        <p className="mt-1 text-xs text-gray-500">
                          {new Date(tx.createdAt).toLocaleDateString()} {' • '}
                          {new Date(tx.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p
                        className={`text-sm font-semibold ${
                          tx.type === 'credit' ? 'text-emerald-600' : 'text-rose-600'
                        }`}
                      >
                        {tx.type === 'credit' ? '+' : '-'} INR {Number(tx.amount || 0).toLocaleString('en-IN')}
                      </p>
                      <p className="mt-0.5 text-[11px] uppercase text-gray-400">{tx.type}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WalletPayment;
