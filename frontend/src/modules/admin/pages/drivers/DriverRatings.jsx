import React, { useEffect, useState } from 'react';
import { ChevronRight, Eye, Loader2, MoreVertical, Search, Star } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const DriverRatings = () => {
  const navigate = useNavigate();
  const [drivers, setDrivers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeMenu, setActiveMenu] = useState(null);

  useEffect(() => {
    const fetchRatings = async () => {
      setIsLoading(true);
      try {
        const token = localStorage.getItem('adminToken');
        const res = await fetch(`${globalThis.__LEGACY_BACKEND_ORIGIN__}/api/v1/admin/driver-ratings`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        if (res.ok && data.success) {
          const list = data.data?.results || [];
          setDrivers(list.map((d) => ({
            id: d._id,
            name: d.name || 'Unknown',
            transport: d.transport_type || 'Taxi',
            mobile: d.mobile || '',
            rating: d.rating || 0,
          })));
        }
      } catch (err) {
        console.error('Ratings fetch error:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchRatings();
  }, []);

  const filtered = drivers.filter((d) =>
    d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.mobile.includes(searchTerm)
  );

  return (
    <div className="min-h-screen bg-gray-50 p-6 lg:p-8 font-sans text-gray-900">
      <div className="mb-6">
        <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-2">
          <span>Drivers</span>
          <ChevronRight size={12} />
          <span className="text-gray-700">Driver Rating</span>
        </div>
        <div className="flex items-center justify-between">
          <h1 className="text-xl text-gray-900 font-bold">Driver Rating</h1>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>Show</span>
            <select className="border border-gray-200 rounded px-2 py-1 text-xs bg-white">
              <option value={10}>10</option>
            </select>
            <span>entries</span>
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg w-56 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500">
                <th className="px-6 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Transport Type</th>
                <th className="px-4 py-3 text-left">Mobile Number</th>
                <th className="px-4 py-3 text-left">Rating</th>
                <th className="px-4 py-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
              {isLoading ? (
                <tr>
                  <td colSpan="5" className="py-10 text-center">
                    <Loader2 className="w-6 h-6 animate-spin text-indigo-600 mx-auto" />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan="5" className="py-10 text-center text-gray-400">No data found.</td>
                </tr>
              ) : (
                filtered.map((driver) => (
                  <tr key={driver.id} className="hover:bg-gray-50/50">
                    <td className="px-6 py-3">{driver.name}</td>
                    <td className="px-4 py-3 capitalize">{driver.transport}</td>
                    <td className="px-4 py-3">{driver.mobile}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star key={s} size={14} className={s <= Math.round(driver.rating) ? 'text-amber-400' : 'text-gray-200'} />
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="relative inline-block">
                        <button
                          onClick={() => setActiveMenu(activeMenu === driver.id ? null : driver.id)}
                          className="p-2 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-600"
                        >
                          <MoreVertical size={16} />
                        </button>
                        {activeMenu === driver.id && (
                          <div className="absolute right-0 mt-2 w-36 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                            <button
                              onClick={() => navigate(`/admin/drivers/ratings/${driver.id}`)}
                              className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                            >
                              <Eye size={14} className="text-gray-400" /> View
                            </button>
                          </div>
                        )}
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
  );
};

export default DriverRatings;
