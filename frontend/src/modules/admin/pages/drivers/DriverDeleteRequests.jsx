import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ChevronRight, Search, UserX, CheckCircle2, XCircle } from 'lucide-react';
import { adminService } from '../../services/adminService';

const DriverDeleteRequests = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [drivers, setDrivers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const fetchDeleteRequests = async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await adminService.getDriverDeleteRequests();
      if (response?.success) {
        setDrivers(response?.data?.results || []);
      } else {
        setError(response?.message || 'Unable to load driver delete requests');
      }
    } catch (requestError) {
      setError(requestError?.message || 'Unable to load driver delete requests');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDeleteRequests();
  }, []);

  const handleApprove = async (id) => {
    if (!window.confirm('Approve this driver account deletion request?')) return;
    setIsSubmitting(true);

    try {
      const response = await adminService.approveDriverDeleteRequest(id);
      if (response?.success) {
        fetchDeleteRequests();
      } else {
        alert(response?.message || 'Failed to approve delete request');
      }
    } catch (requestError) {
      alert(requestError?.message || 'Failed to approve delete request');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async (id) => {
    if (!window.confirm('Reject this driver account deletion request?')) return;
    setIsSubmitting(true);

    try {
      const response = await adminService.rejectDriverDeleteRequest(id);
      if (response?.success) {
        fetchDeleteRequests();
      } else {
        alert(response?.message || 'Failed to reject delete request');
      }
    } catch (requestError) {
      alert(requestError?.message || 'Failed to reject delete request');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredDrivers = drivers.filter((item) => {
    const name = String(item.name || '').toLowerCase();
    const mobile = String(item.mobile || item.phone || '');
    const reason = String(item.deletionRequest?.reason || '').toLowerCase();
    const needle = searchTerm.toLowerCase();
    return name.includes(needle) || mobile.includes(searchTerm) || reason.includes(needle);
  });

  const formatDate = (value) => {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'N/A';
    return date.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-12 h-12 border-4 border-gray-100 border-t-black rounded-full animate-spin"></div>
        <p className="text-[12px] font-black text-gray-400 uppercase tracking-widest">Loading delete requests...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-3 lg:p-4 font-sans text-gray-900 space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] text-gray-500 mb-0.5">
            <span>Driver Management</span>
            <ChevronRight size={10} />
            <span className="text-gray-700 font-medium">Delete Requests</span>
          </div>
          <h1 className="text-base font-bold text-gray-900">Delete requests</h1>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">
          {error}
        </div>
      ) : null}

      <div className="bg-white rounded-lg border border-gray-200 p-3">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
             <div className="p-2 bg-yellow-50 rounded-lg text-yellow-600">
               <AlertCircle size={18} />
             </div>
             <div>
               <h2 className="text-sm font-bold text-gray-900">Delete requests</h2>
               <p className="text-xs text-gray-500">{drivers.length} pending requests</p>
             </div>
          </div>

          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
            <input
              type="text"
              placeholder="Search by driver name, mobile number or request ID"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-white border border-gray-200 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-yellow-400 focus:border-yellow-400 transition-colors"
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                <th className="px-3 py-2">Driver</th>
                <th className="px-3 py-2">Mobile</th>
                <th className="px-3 py-2">Reason</th>
                <th className="px-3 py-2">Requested at</th>
                <th className="px-3 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-xs text-gray-700">
              {filteredDrivers.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <UserX size={32} className="text-gray-300 mb-2" />
                      <p className="text-sm font-bold text-gray-900">No delete requests</p>
                      <p className="text-xs text-gray-500 leading-relaxed">
                        There are currently no driver account deletion requests.<br/>
                        New requests will automatically appear here.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredDrivers.map((item) => (
                  <tr key={item._id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center font-bold text-[10px] border border-gray-200">
                          {(item.name || 'D')[0]}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="text-xs font-medium text-gray-900">{item.name || 'Unknown'}</p>
                            <span className="font-mono text-[9px] font-semibold px-1 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200">
                              {item.driver_code || item.referralCode || ((item.mobile || item.phone) ? `DRV${String(item.mobile || item.phone).slice(-4)}${String(item._id || '').slice(-6).toUpperCase()}`.replace(/\W/g, '') : 'N/A')}
                            </span>
                          </div>
                          <p className="text-[10px] text-gray-500 mt-0.5">{item.email || 'No email'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 font-medium">{item.mobile || item.phone || 'N/A'}</td>
                    <td className="px-3 py-2 text-gray-600 truncate max-w-[200px]" title={item.deletionRequest?.reason}>{item.deletionRequest?.reason || 'N/A'}</td>
                    <td className="px-3 py-2 text-[10px] text-gray-500">{formatDate(item.deletionRequest?.requestedAt)}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          disabled={isSubmitting}
                          onClick={() => handleApprove(item._id)}
                          className="px-2.5 py-1 bg-green-50 text-green-700 rounded-md text-[10px] font-semibold hover:bg-green-100 transition-colors border border-green-200 disabled:opacity-50 flex items-center gap-1"
                        >
                          <CheckCircle2 size={12} /> Approve
                        </button>
                        <button
                          disabled={isSubmitting}
                          onClick={() => handleReject(item._id)}
                          className="px-2.5 py-1 bg-red-50 text-red-700 rounded-md text-[10px] font-semibold hover:bg-red-100 transition-colors border border-red-200 disabled:opacity-50 flex items-center gap-1"
                        >
                          <XCircle size={12} /> Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="p-3 bg-gray-50/50 border-t border-gray-100 flex items-center justify-between text-sm">
          <div>
            <p className="font-semibold text-gray-900 text-xs">Pending queue</p>
            <p className="text-[11px] text-gray-500">{filteredDrivers.length} requests waiting for review</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/admin/drivers')}
            className="px-3 py-1.5 border border-gray-200 rounded-md text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            &larr; Back to Drivers
          </button>
        </div>
      </div>

      <div className="rounded-xl p-4 text-xs relative overflow-hidden" style={{ backgroundColor: '#FFF8E1', borderColor: '#F4C542', borderWidth: '1px' }}>
        <div className="flex items-start gap-3 relative z-10">
          <div className="text-yellow-600 shrink-0 mt-0.5">
            <AlertCircle size={16} />
          </div>
          <div>
            <h4 className="font-bold text-gray-900 mb-1">Delete review protocol</h4>
            <p className="text-gray-700 mb-1">
              Approving a request permanently deactivates the driver's account and removes access to the platform.
            </p>
            <p className="text-gray-700">
              Rejecting a request keeps the account active. Please review all submitted information before taking action.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DriverDeleteRequests;
