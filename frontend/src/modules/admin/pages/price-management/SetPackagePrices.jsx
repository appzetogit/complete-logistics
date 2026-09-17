import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Edit2, Loader2, MapPin, Plus, Trash2, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { adminService } from '../../services/adminService';

const badgeClass = (value) =>
  value === 'available'
    ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
    : 'bg-rose-50 text-rose-700 border-rose-100';

const statusClass = (active) =>
  Number(active) === 1
    ? 'bg-sky-50 text-sky-700 border-sky-100'
    : 'bg-slate-100 text-slate-500 border-slate-200';

const SetPackagePrices = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchItems = async () => {
    try {
      setLoading(true);
      const response = await adminService.getSetPrices({ scope: 'package' });
      const results = response?.data?.results || response?.results || [];
      setItems(Array.isArray(results) ? results : []);
    } catch (error) {
      toast.error('Failed to load package pricing');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const filteredItems = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return items;

    return items.filter((item) =>
      [
        item.package_type_name,
        item.package_destination,
        item.service_location_name,
        ...(item.package_vehicle_prices || []).map((row) => row.vehicle_type_name),
      ]
        .join(' ')
        .toLowerCase()
        .includes(query)
    );
  }, [items, searchTerm]);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this package pricing?')) return;

    try {
      await adminService.deleteSetPrice(id);
      toast.success('Package pricing deleted');
      fetchItems();
    } catch (error) {
      toast.error('Failed to delete package pricing');
    }
  };

  return (
    <div className="min-h-screen bg-[#F3F4F9] p-4 font-sans">
      <div className="flex flex-col gap-3 border-b border-gray-100 pb-3 mb-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1E293B]" style={{ fontFamily: '"Times New Roman", Times, serif' }}>Package Pricing</h1>
          <p className="mt-1 text-xs text-slate-500">Manage package name, destination, availability, and vehicle-wise pricing in one place.</p>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-medium tracking-tight">
          <span className="hover:text-slate-600 transition-colors cursor-pointer" onClick={() => navigate('/admin/pricing/package-pricing')}>Package Pricing</span>
          <ChevronRight size={10} className="text-slate-300" />
          <span className="text-slate-800 font-bold">Listing</span>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-gray-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search package or destination"
              className="w-full lg:w-80 rounded-lg border border-gray-200 pl-10 pr-4 py-2 text-sm text-slate-700 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 font-medium bg-white shadow-sm"
            />
          </div>
          <button
            onClick={() => navigate('/admin/pricing/package-pricing/create')}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-400 px-5 py-2.5 text-sm font-bold text-slate-900 transition hover:bg-amber-500 shadow-sm"
          >
            <Plus size={16} />
            Add Package Pricing
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left">
            <thead className="bg-[#FBFCFF]">
              <tr className="border-b border-gray-100 text-sm font-semibold text-slate-700">
                <th className="px-6 py-4">Package</th>
                <th className="px-6 py-4">Destination</th>
                <th className="px-6 py-4">Location</th>
                <th className="px-6 py-4">Vehicles</th>
                <th className="px-6 py-4">Availability</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan="7" className="px-4 py-10 text-center">
                    <Loader2 className="mx-auto h-8 w-8 animate-spin text-amber-500" />
                    <p className="mt-3 text-sm font-medium text-slate-400">Loading package pricing...</p>
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-4 py-10 text-center text-sm text-slate-400">
                    No package pricing found.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3.5">
                      <p className="text-sm font-bold text-slate-900">{item.package_type_name || 'Untitled package'}</p>
                      <p className="mt-1 text-xs text-slate-400">{(item.package_vehicle_prices || []).length} vehicle price rows</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2 text-sm text-slate-700">
                        <MapPin size={14} className="text-amber-500" />
                        <span>{item.package_destination || 'No destination'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-slate-600">{item.service_location_name || item.zone_name || 'All locations'}</td>
                    <td className="px-4 py-3.5 text-sm text-slate-600">
                      {(item.package_vehicle_prices || []).slice(0, 2).map((row) => row.vehicle_type_name).filter(Boolean).join(', ') || 'No vehicles'}
                      {(item.package_vehicle_prices || []).length > 2 ? ` +${item.package_vehicle_prices.length - 2} more` : ''}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold capitalize ${badgeClass(item.package_availability)}`}>
                        {item.package_availability || 'available'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold capitalize ${statusClass(item.active)}`}>
                        {Number(item.active) === 1 ? 'active' : 'inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => navigate(`/admin/pricing/package-pricing/edit/${item.id}`)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-orange-400 transition hover:bg-orange-100"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-rose-400 transition hover:bg-rose-100"
                        >
                          <Trash2 size={14} />
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
    </div>
  );
};

export default SetPackagePrices;
