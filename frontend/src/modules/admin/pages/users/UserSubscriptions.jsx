import React, { useEffect, useState } from 'react';
import { ChevronRight, Loader2, Plus, Search, Ticket } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { adminService } from '../../services/adminService';

const UserSubscriptions = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const response = await adminService.getUserSubscriptionPlans();
        setPlans(Array.isArray(response?.data?.results) ? response.data.results : []);
      } catch (error) {
        toast.error(error?.message || 'Failed to load subscription plans');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const filteredPlans = plans.filter((item) =>
    `${item.name || ''} ${item.vehicle_type?.name || ''}`.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs text-gray-400">
            <span>Users</span>
            <ChevronRight size={12} />
            <span className="text-gray-700">Subscription Management</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">Customer Subscription Management</h1>
        </div>
        <button
          type="button"
          onClick={() => navigate('/admin/users/subscriptions/create')}
          className="inline-flex items-center gap-2 rounded-lg bg-yellow-400 px-4 py-2.5 text-sm font-bold text-black shadow-sm transition hover:bg-yellow-500"
        >
          <Plus size={16} />
          Add Subscription
        </button>
      </div>

      <div className="rounded-xl bg-white p-5 border border-gray-200 shadow-sm">
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-gray-200 px-4 py-2.5">
          <Search size={16} className="text-slate-400" />
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search customer subscription plans..."
            className="w-full bg-transparent text-sm font-bold text-gray-900 outline-none placeholder:text-gray-400"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-7 w-7 animate-spin text-indigo-600" />
          </div>
        ) : filteredPlans.length === 0 ? (
          <div className="py-16 text-center text-sm font-semibold text-slate-400">No customer subscription plans found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs font-bold text-gray-600">
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Vehicle Type</th>
                  <th className="px-4 py-3">Benefit</th>
                  <th className="px-4 py-3">Duration</th>
                  <th className="px-4 py-3">Price</th>
                </tr>
              </thead>
              <tbody>
                {filteredPlans.map((item) => (
                  <tr key={item._id || item.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-50 text-gray-900 border border-yellow-100">
                          <Ticket size={18} />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-900">{item.name}</p>
                          <p className="text-xs font-medium text-gray-500">{item.description || 'Customer ride pass'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-600">{item.vehicle_type?.name || 'N/A'}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-600">
                      {item.benefit_type === 'unlimited' ? 'Unlimited rides' : `${item.ride_limit} rides`}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-600">{item.duration} days</td>
                    <td className="px-4 py-3 text-sm font-bold text-gray-900">₹{Number(item.amount || 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserSubscriptions;
