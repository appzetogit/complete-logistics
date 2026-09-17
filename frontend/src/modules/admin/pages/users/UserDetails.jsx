import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowLeft, 
  ChevronRight, 
  Mail, 
  Phone, 
  Clock, 
  Filter, 
  ChevronDown, 
  CheckCircle2, 
  X, 
  CreditCard, 
  Star, 
  Car,
  TrendingUp,
  AlertCircle,
  MoreVertical,
  Plus,
  Minus,
  ArrowUpRight,
  ArrowDownRight,
  History as HistoryIcon,
  Search,
  Ticket
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';

const UserDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('Request List');
  const [isWalletModalOpen, setWalletModalOpen] = useState(false);
  const [walletType, setWalletType] = useState('credit'); // credit or debit
  const [walletAmount, setWalletAmount] = useState('');
  
  const [user, setUser] = useState(null);
  const [requests, setRequests] = useState([]);
  const [walletHistory, setWalletHistory] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterRef = useRef(null);
  
  const token = localStorage.getItem('adminToken');

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (filterRef.current && !filterRef.current.contains(event.target)) {
        setIsFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      
      // Fetch User Info
      const userRes = await fetch(`${globalThis.__LEGACY_BACKEND_ORIGIN__}/api/v1/admin/users/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const userData = await userRes.json();
      
      if (userData.success) {
        let u = userData.data;
        if (Array.isArray(u)) u = u[0];
        if (u?.user) u = u.user;
        
        if (u) {
          setUser({
            id: u._id,
            name: u.name || u.user_id?.name || 'Anonymous',
            phone: u.mobile || u.mobile_number || u.user_id?.mobile || 'N/A',
            email: u.email || u.user_id?.email || 'N/A',
            joined: (u.createdAt || u.user_id?.createdAt) ? new Date(u.createdAt || u.user_id?.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A',
            avatar: (u.name || u.user_id?.name || 'A').split(' ').map(n => n[0]).join(''),
            profileImage: u.profileImage || u.user_id?.profileImage || '',
            governmentIdProof: u.governmentIdProof || u.user_id?.governmentIdProof || null,
            stats: {
               completed: 0, 
               cancelled: 0,
               upcoming: 0
            },
            wallet: {
              total: u.wallet_balance || u.user_id?.wallet_balance || 0,
              spend: 0,
              balance: u.wallet_balance || u.user_id?.wallet_balance || 0
            },
            subscriptionSummary: u.subscriptionSummary || { activeCount: 0, activePlans: [] },
          });
        }

        const userReviews = Array.isArray(userData.data?.reviews)
          ? userData.data.reviews
          : Array.isArray(u?.reviews)
            ? u.reviews
            : [];
        setReviews(
          userReviews.map((review) => ({
            _id: review._id,
            rating: Number(review.rating || 0),
            comment: review.comment || '',
            createdAt: review.createdAt || null,
            driver_id: review.driver_id || null,
          })),
        );
      }

      const subscriptionRes = await fetch(`${globalThis.__LEGACY_BACKEND_ORIGIN__}/api/v1/admin/users/${id}/subscriptions`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const subscriptionData = await subscriptionRes.json();
      if (subscriptionData.success) {
        setSubscriptions(Array.isArray(subscriptionData.data?.results) ? subscriptionData.data.results : []);
      }

      // Fetch Requests
      const reqRes = await fetch(`${globalThis.__LEGACY_BACKEND_ORIGIN__}/api/v1/admin/users/${id}/requests`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const reqData = await reqRes.json();
      if (reqData.success) {
        const mappedRequests = (reqData.data?.results || []).map(r => ({
          id: r.request_id || 'N/A',
          date: r.trip_start_time ? new Date(r.trip_start_time).toLocaleDateString() : 'N/A',
          user: userData.data?.name || 'User',
          driver: r.driver_id?.name || 'Pending',
          status: r.is_completed ? 'Completed' : r.is_cancelled ? 'Cancelled' : 'Ongoing',
          paid: r.is_paid ? 'Paid' : 'Not Paid',
          payment: r.payment_type || 'CASH'
        }));
        setRequests(mappedRequests);
        
        // Update stats
        if (userData.success) {
          setUser(prev => ({
            ...prev,
            stats: {
              completed: mappedRequests.filter(r => r.status === 'Completed').length,
              cancelled: mappedRequests.filter(r => r.status === 'Cancelled').length,
              upcoming: mappedRequests.filter(r => r.status === 'Ongoing').length
            }
          }));
        }
      }

      // Fetch Wallet History
      const walletRes = await fetch(`${globalThis.__LEGACY_BACKEND_ORIGIN__}/api/v1/admin/users/${id}/wallet-history`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const walletData = await walletRes.json();
      if (walletData.success) {
        const history = (walletData.data?.results || []).map(w => {
          // Determine type from transaction_alias or amount sign
          const isCredit = w.transaction_alias === 'ADMIN_CREDIT' || w.amount > 0;
          return {
            id: w._id,
            amount: Math.abs(w.amount), // Use absolute for display but sign for logic
            type: isCredit ? 'credit' : 'debit',
            remarks: w.remarks || (isCredit ? 'Credit Adjustment' : 'Debit Adjustment'),
            date: w.createdAt ? new Date(w.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'N/A'
          };
        });
        setWalletHistory(history);
        
        // Calculate dynamic stats from history
        const totalCredit = history.filter(h => h.type === 'credit').reduce((sum, h) => sum + h.amount, 0);
        const totalDebit = history.filter(h => h.type === 'debit').reduce((sum, h) => sum + h.amount, 0);
        
        setUser(prev => ({
          ...prev,
          wallet: {
            total: totalCredit,
            spend: totalDebit,
            balance: totalCredit - totalDebit
          }
        }));
      }

    } catch (err) {
      setError('Failed to load user details');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [id, token]);

  const handleWalletAction = async () => {
    if (!walletAmount || isSubmitting) return;
    try {
      setIsSubmitting(true);
      const res = await fetch(`${globalThis.__LEGACY_BACKEND_ORIGIN__}/api/v1/admin/wallet/users/${id}/adjust`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: parseFloat(walletAmount),
          payment_type: walletType,
          remarks: `Admin ${walletType} action`
        })
      });
      
      const data = await res.json();
      if (data.success) {
        setWalletModalOpen(false);
        setWalletAmount('');
        // Refresh data to show new balance and history
        fetchData();
      } else {
        alert(data.message || 'Failed to adjust wallet');
      }
    } catch (err) {
      console.error(err);
      alert('Network error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[600px] gap-4">
         <div className="w-10 h-10 border-4 border-gray-100 border-t-yellow-400 rounded-full animate-spin"></div>
         <p className="text-sm font-semibold text-gray-500">Loading Profile...</p>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[600px] gap-4">
         <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center text-rose-500">
            <AlertCircle size={32} />
         </div>
         <p className="text-lg font-semibold text-gray-900">{error || 'User not found'}</p>
         <button onClick={() => navigate('/admin/users')} className="px-6 py-2 bg-black text-white rounded-lg text-sm font-medium shadow-sm">Go Back</button>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-700 text-gray-950 font-sans p-4 lg:p-8 bg-gray-50 min-h-screen">
      {/* HEADER & BREADCRUMBS */}
      <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
        <span>Users</span>
        <ChevronRight size={12} />
        <span className="text-gray-700 font-medium">User Profile</span>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate('/admin/users')}
            className="p-1.5 hover:bg-white rounded-lg border border-transparent hover:border-gray-200 transition-all text-gray-500 hover:text-gray-900"
          >
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-lg font-bold text-gray-900 tracking-tight">User Profile</h1>
        </div>
      </div>

      {/* USER INFO CARD */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 md:p-6">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-5">
            <div className="w-20 h-20 shrink-0 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 text-2xl font-bold border border-gray-200 shadow-sm">
              {user.profileImage ? (
                <img src={user.profileImage} alt={user.name} className="h-full w-full rounded-full object-cover" />
              ) : (
                user.avatar
              )}
            </div>
            <div className="text-center md:text-left space-y-1 mt-1">
              <h2 className="text-lg font-bold text-gray-900 tracking-tight leading-tight">{user.name}</h2>
              <div className="flex flex-col md:flex-row md:items-center gap-1.5 md:gap-4 text-sm font-medium text-gray-500">
                <div className="flex items-center justify-center md:justify-start gap-1.5">
                  <Phone size={14} className="text-gray-400" /> {user.phone}
                </div>
                <div className="hidden md:block w-1 h-1 rounded-full bg-gray-300"></div>
                <div className="flex items-center justify-center md:justify-start gap-1.5">
                  <Mail size={14} className="text-gray-400" /> {user.email}
                </div>
                <div className="hidden md:block w-1 h-1 rounded-full bg-gray-300"></div>
                <div className="flex items-center justify-center md:justify-start gap-1.5">
                  <Clock size={14} className="text-gray-400" /> Joined {user.joined}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center md:justify-end gap-2 shrink-0">
            {user.profileImage ? (
              <a
                href={user.profileImage}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                View Photo
              </a>
            ) : null}
            {user.governmentIdProof?.imageUrl ? (
              <a
                href={user.governmentIdProof.imageUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                View {String(user.governmentIdProof.type || 'ID').replace(/_/g, ' ')}
              </a>
            ) : (
              <span className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-600">
                ID Proof Missing
              </span>
            )}
          </div>
        </div>

        {/* PILL TABS */}
        <div className="mt-6 flex items-center gap-2 overflow-x-auto whitespace-nowrap hide-scrollbar border-t border-gray-100 pt-5">
          {['Request List', 'User Payment History', 'Review History', 'Subscriptions'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                activeTab === tab 
                  ? 'bg-yellow-400 text-black shadow-sm font-semibold' 
                  : 'text-gray-500 bg-transparent hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* TAB CONTENT */}
      <div className="min-h-[400px]">
        {activeTab === 'Request List' && (
          <div className="space-y-4 animate-in fade-in duration-300">
            {/* STAT CARDS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {[
                { label: 'Completed Rides', val: user.stats.completed, icon: CheckCircle2, color: 'emerald' },
                { label: 'Cancelled Rides', val: user.stats.cancelled, icon: AlertCircle, color: 'rose' },
                { label: 'Upcoming Rides', val: user.stats.upcoming, icon: Clock, color: 'yellow' }
              ].map((s, i) => (
                <div key={i} className="bg-white p-4 rounded-xl border border-gray-200 flex items-center justify-between shadow-sm">
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-0.5">{s.label}</p>
                    <p className="text-xl font-bold text-gray-900">{s.val}</p>
                  </div>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    s.color === 'emerald' ? 'bg-emerald-50 text-emerald-600' : 
                    s.color === 'rose' ? 'bg-rose-50 text-rose-600' : 
                    'bg-yellow-50 text-yellow-600'
                  }`}>
                    <s.icon size={18} />
                  </div>
                </div>
              ))}
            </div>

            {/* TABLE SECTION */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
              {/* TABLE CONTROLS */}
              <div className="p-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-600">
                  Show 
                  <select className="bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-gray-900 outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 transition-all">
                    <option>15</option>
                    <option>30</option>
                    <option>50</option>
                  </select>
                  Entries
                </div>
                
                <div className="relative" ref={filterRef}>
                  <button 
                    onClick={() => setIsFilterOpen(!isFilterOpen)}
                    className="flex items-center gap-2 bg-white border border-gray-200 text-gray-700 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors shadow-sm"
                  >
                    <Filter size={14} /> Filters
                  </button>
                  {isFilterOpen && (
                    <div className="absolute right-0 mt-2 w-64 bg-white border border-gray-200 rounded-xl shadow-xl z-50 p-4">
                      <h4 className="text-sm font-semibold text-gray-900 mb-3">Filter Requests</h4>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                          <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 outline-none focus:border-yellow-400 focus:bg-white transition-all">
                            <option value="all">All Statuses</option>
                            <option value="completed">Completed</option>
                            <option value="cancelled">Cancelled</option>
                            <option value="ongoing">Ongoing</option>
                          </select>
                        </div>
                        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                          <button onClick={() => setIsFilterOpen(false)} className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 transition-colors">Cancel</button>
                          <button onClick={() => setIsFilterOpen(false)} className="px-3 py-1.5 text-xs font-semibold bg-black text-white rounded-lg hover:bg-gray-900 transition-colors">Apply</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* TABLE */}
              <div className="overflow-x-auto">
                <table className="w-full text-left whitespace-nowrap">
                  <thead>
                    <tr className="bg-gray-50 text-xs font-semibold text-gray-600 border-b border-gray-200">
                      <th className="px-4 py-3">Request Id</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">User Name</th>
                      <th className="px-4 py-3">Driver Name</th>
                      <th className="px-4 py-3">Trip Status</th>
                      <th className="px-4 py-3">Paid</th>
                      <th className="px-4 py-3">Payment Option</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {requests.length > 0 ? requests.map((r, i) => (
                      <tr key={i} className="hover:bg-gray-50 transition-colors text-sm">
                        <td className="px-4 py-3 font-medium text-gray-600">#{r.id.slice(-8).toUpperCase()}</td>
                        <td className="px-4 py-3 text-gray-600">{r.date}</td>
                        <td className="px-4 py-3 font-semibold text-gray-900">{r.user}</td>
                        <td className="px-4 py-3 font-semibold text-gray-900">{r.driver}</td>
                        <td className="px-4 py-3">
                          <span className={`font-semibold ${
                            r.status === 'Completed' ? 'text-emerald-600' : 
                            r.status === 'Cancelled' ? 'text-rose-600' : 'text-yellow-600'
                          }`}>{r.status}</span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{r.paid}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${r.payment === 'CASH' ? 'bg-gray-100 text-gray-700' : 'bg-yellow-100 text-yellow-800'}`}>
                            {r.payment}
                          </span>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan="7" className="px-4 py-8 text-center text-gray-500 font-medium text-sm">
                          <div className="flex flex-col items-center gap-2">
                            <Car size={24} className="text-gray-300" />
                            No requests found for this user
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* PAGINATION */}
              <div className="p-4 border-t border-gray-100 flex items-center justify-between bg-white">
                <p className="text-xs font-medium text-gray-500">Showing {requests.length > 0 ? 1 : 0} to {requests.length} of {requests.length} entries</p>
                <div className="flex items-center gap-1">
                  <button className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:bg-gray-100 disabled:opacity-50 transition-colors">Prev</button>
                  <button className="w-7 h-7 rounded-lg bg-black text-white text-xs font-semibold flex items-center justify-center">1</button>
                  <button className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:bg-gray-100 disabled:opacity-50 transition-colors">Next</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'User Payment History' && (
          <div className="space-y-4 animate-in fade-in duration-300">
            {/* PAYMENT SUMMARY */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {[
                { label: 'Total Wallet Balance', val: user.wallet.total, icon: WalletIcon, color: 'blue' },
                { label: 'Spend Amount', val: user.wallet.spend, icon: TrendingUp, color: 'rose' },
                { label: 'Available Balance', val: user.wallet.balance, icon: WalletIcon, color: 'emerald' }
              ].map((s, i) => (
                <div key={i} className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-center">
                  <div className="flex items-center gap-2.5 mb-2">
                    <div className="p-1.5 bg-gray-50 rounded-lg border border-gray-100 text-gray-600">
                      <s.icon size={16} />
                    </div>
                    <p className="text-xs font-medium text-gray-500">{s.label}</p>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">₹ {s.val.toFixed(2)}</p>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              {/* ACTION BUTTONS HEADER */}
              <div className="p-4 border-b border-gray-100 flex flex-wrap gap-3 items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">Recent Transactions</h3>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => { setWalletType('credit'); setWalletModalOpen(true); }}
                    className="px-4 py-2 bg-black text-white rounded-lg text-xs font-semibold hover:bg-gray-900 transition-colors shadow-sm flex items-center gap-1.5"
                  >
                    <Plus size={14} /> Credit
                  </button>
                  <button 
                    onClick={() => { setWalletType('debit'); setWalletModalOpen(true); }}
                    className="px-4 py-2 bg-white text-gray-700 border border-gray-200 rounded-lg text-xs font-semibold hover:bg-gray-50 transition-colors shadow-sm flex items-center gap-1.5"
                  >
                    <Minus size={14} /> Debit
                  </button>
                </div>
              </div>

              {/* TRANSACTION LOGS */}
              <div className="p-4">
                <div className="space-y-3">
                  {walletHistory.length > 0 ? (
                    walletHistory.map((tr, i) => (
                      <div key={i} className="bg-gray-50 rounded-lg border border-gray-100 p-4 flex items-center justify-between hover:bg-white hover:border-gray-300 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${tr.type === 'credit' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                            {tr.type === 'credit' ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-900 capitalize leading-tight">{tr.remarks}</p>
                            <p className="text-xs font-medium text-gray-500 mt-1">{tr.date}</p>
                          </div>
                        </div>
                        <p className={`text-base font-bold ${tr.type === 'credit' ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {tr.type === 'credit' ? '+' : '-'} ₹{parseFloat(tr.amount).toFixed(2)}
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="py-8 flex flex-col items-center justify-center text-center">
                      <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center text-gray-300 mb-3">
                        <HistoryIcon size={24} />
                      </div>
                      <p className="text-sm font-medium text-gray-500">No recent wallet transactions found</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'Review History' && (
          <div className="space-y-4 animate-in fade-in duration-300 bg-white rounded-xl border border-gray-200 shadow-sm p-4 md:p-6">
             <div className="flex flex-wrap gap-4 items-center justify-between pb-4 border-b border-gray-100 mb-4">
                <h3 className="text-sm font-semibold text-gray-900">Captain Reviews</h3>
                {reviews.length > 0 && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-50 text-yellow-800 border border-yellow-200 rounded-full text-xs font-semibold">
                     <Star size={14} className="fill-yellow-500 text-yellow-500" /> {(reviews.reduce((acc, curr) => acc + curr.rating, 0) / (reviews.length || 1)).toFixed(1)} Avg Rating
                  </div>
                )}
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {reviews.length > 0 ? (
                  reviews.map((rev, i) => (
                    <div key={rev._id || i} className="bg-gray-50 rounded-xl border border-gray-100 p-4 flex flex-col hover:bg-white hover:border-gray-200 transition-colors shadow-sm">
                       <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-2">
                             <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-600 shrink-0">
                                {rev.driver_id?.name?.charAt(0) || 'C'}
                             </div>
                             <div>
                                <p className="text-xs font-bold text-gray-900 leading-tight">Captain {rev.driver_id?.name || 'Unknown'}</p>
                                <span className="text-[10px] font-medium text-gray-500">{rev.createdAt ? new Date(rev.createdAt).toLocaleDateString() : 'N/A'}</span>
                             </div>
                          </div>
                          <div className="flex items-center gap-0.5">
                             {[...Array(5)].map((_, starIdx) => (
                               <Star 
                                 key={starIdx} 
                                 size={12} 
                                 className={starIdx < rev.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}
                               />
                             ))}
                          </div>
                       </div>
                       <p className="text-sm text-gray-700 italic border-l-2 border-gray-200 pl-3 py-1 text-wrap line-clamp-3">
                         "{rev.comment || 'No comment provided'}"
                       </p>
                    </div>
                  ))
                ) : (
                  <div className="col-span-full py-12 flex flex-col items-center justify-center text-center">
                    <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center text-gray-300 mb-3">
                      <Star size={24} />
                    </div>
                    <p className="text-sm font-medium text-gray-500">No reviews found for this user</p>
                  </div>
                )}
             </div>
          </div>
        )}

        {activeTab === 'Subscriptions' && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-center text-center">
                <p className="text-xs font-medium text-gray-500 mb-1">Active Plans</p>
                <p className="text-2xl font-bold text-gray-900">{subscriptions.filter((item) => item.active && item.status === 'active').length}</p>
              </div>
              <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-center text-center">
                <p className="text-xs font-medium text-gray-500 mb-1">Unlimited Plans</p>
                <p className="text-2xl font-bold text-gray-900">{subscriptions.filter((item) => item.benefit_type === 'unlimited' && item.active).length}</p>
              </div>
              <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-center text-center">
                <p className="text-xs font-medium text-gray-500 mb-1">Limited Ride Credits</p>
                <p className="text-2xl font-bold text-gray-900">
                  {subscriptions
                    .filter((item) => item.active && item.benefit_type !== 'unlimited')
                    .reduce((sum, item) => sum + Number(item.rides_remaining || 0), 0)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {subscriptions.length > 0 ? subscriptions.map((item) => (
                <div key={item.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm hover:border-gray-300 transition-colors flex flex-col h-full">
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div>
                      <p className="text-base font-bold text-gray-900 leading-tight">{item.name}</p>
                      <p className="mt-1 text-xs font-medium text-gray-500">{item.vehicle_type?.name || 'Vehicle plan'} • {item.transport_type}</p>
                    </div>
                    <span className={`shrink-0 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${item.status === 'active' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-gray-100 text-gray-600 border border-gray-200'}`}>
                      {item.status}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 text-xs font-medium text-gray-600 bg-gray-50 p-3 rounded-lg border border-gray-100 mt-auto">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-gray-400 uppercase">Price</span>
                      <span className="font-bold text-gray-900">₹{Number(item.amount || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-gray-400 uppercase">Benefit</span>
                      <span className="font-bold text-gray-900">{item.benefit_type === 'unlimited' ? 'Unlimited' : `${item.ride_limit} rides`}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-gray-400 uppercase">Used</span>
                      <span className="font-bold text-gray-900">{item.rides_used}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-gray-400 uppercase">Remaining</span>
                      <span className="font-bold text-gray-900">{item.rides_remaining === null ? 'Unlimited' : item.rides_remaining}</span>
                    </div>
                  </div>
                  
                  <div className="mt-4 pt-3 border-t border-gray-100 text-[11px] font-medium text-gray-400 flex items-center gap-1.5">
                    <Clock size={12} /> Expires {item.expiresAt ? new Date(item.expiresAt).toLocaleDateString('en-IN') : 'Never'}
                  </div>
                </div>
              )) : (
                <div className="col-span-full py-12 bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col items-center justify-center text-center">
                  <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center text-gray-300 mb-3">
                    <Ticket size={24} />
                  </div>
                  <p className="text-sm font-medium text-gray-500">No subscriptions found for this user</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* WALLET MODAL */}
      {isWalletModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-xl w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
             <div className="p-5 space-y-5">
                <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                   <h3 className="text-base font-semibold text-gray-900">
                      {walletType === 'credit' ? 'Credit Balance' : 'Debit Balance'}
                   </h3>
                   <button onClick={() => setWalletModalOpen(false)} className="text-gray-400 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 rounded-lg p-1.5 transition-colors">
                      <X size={16} />
                   </button>
                </div>

                <div>
                   <label className="text-xs font-semibold text-gray-700 mb-2 block">Amount to {walletType}</label>
                   <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-base font-bold text-gray-400 pointer-events-none">₹</span>
                      <input 
                        type="number" 
                        value={walletAmount}
                        onChange={(e) => setWalletAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full h-12 pl-9 pr-4 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold text-gray-900 outline-none focus:bg-white focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 transition-all"
                      />
                   </div>
                </div>

                <div className="pt-2">
                   <button 
                     onClick={handleWalletAction}
                     disabled={isSubmitting}
                     className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-all shadow-sm flex items-center justify-center gap-2 ${
                       walletType === 'credit' ? 'bg-black text-white hover:bg-gray-900' : 'bg-rose-500 text-white hover:bg-rose-600'
                     } disabled:opacity-50`}
                   >
                     {isSubmitting ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : `Confirm ${walletType === 'credit' ? 'Credit' : 'Debit'}`}
                   </button>
                </div>
             </div>
          </div>
        </div>
      )}

    </div>
  );
};

const WalletIcon = ({ size, className }) => <CreditCard size={size} className={className} />;

export default UserDetails;
