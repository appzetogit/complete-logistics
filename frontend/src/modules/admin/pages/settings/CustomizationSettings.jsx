import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Bus, ArrowUpRight, Loader2, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../../shared/api/axiosInstance';

const SectionHeader = ({ title }) => (
  <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3 bg-gray-50/30">
    <div className="w-1 h-5 bg-yellow-400 rounded-full"></div>
    <h3 className="text-[13px] font-bold text-gray-700 uppercase tracking-tight">{title}</h3>
  </div>
);

const CustomizationSettings = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busServiceEnabled, setBusServiceEnabled] = useState(false);

  useEffect(() => {
    const fetchBusSettings = async () => {
      try {
        setLoading(true);
        const response = await api.get('/admin/general-settings/transport-ride');
        const enabled = response.data?.settings?.enable_bus_service;
        setBusServiceEnabled(enabled === '1' || enabled === 1 || enabled === true);
      } catch (error) {
        console.error('Failed to load bus service settings:', error);
        toast.error('Failed to load bus service setting');
      } finally {
        setLoading(false);
      }
    };

    fetchBusSettings();
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      await api.patch('/admin/general-settings/transport-ride', {
        settings: {
          enable_bus_service: busServiceEnabled ? '1' : '0',
        },
      });
      toast.success('Bus service setting updated successfully');
    } catch (error) {
      console.error('Failed to save bus service setting:', error);
      toast.error('Failed to save bus service setting');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-yellow-500 animate-spin" />
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Loading bus service...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8 font-sans pb-32">
      <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-700">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-end gap-4">
          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
            <span>Customization Settings</span>
            <ChevronRight size={14} />
            <span className="text-gray-900">Bus Service</span>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <SectionHeader title="Bus Service" />

          <div className="p-6">
            <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-6 flex flex-col sm:flex-row items-start justify-between gap-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-yellow-50 text-yellow-600 border border-yellow-100 flex items-center justify-center shadow-sm shrink-0">
                  <Bus size={22} />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-gray-900">Bus Service</h4>
                  <p className="mt-1 text-sm text-gray-500">
                    This toggle is currently UI-only. Use the bus service module to manage routes and related setup.
                  </p>
                  
                  <button
                    type="button"
                    onClick={() => navigate('/admin/bus-service')}
                    className="mt-4 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 shadow-sm hover:border-yellow-400 hover:text-yellow-600 transition-all"
                  >
                    Manage Bus Services <ArrowUpRight size={16} />
                  </button>
                </div>
              </div>

              <button
                type="button"
                aria-pressed={busServiceEnabled}
                onClick={() => setBusServiceEnabled((prev) => !prev)}
                className={`w-12 h-6 rounded-full relative transition-colors duration-300 shrink-0 focus:outline-none ${
                  busServiceEnabled ? 'bg-yellow-400' : 'bg-gray-300'
                }`}
              >
                <div
                  className={`w-4 h-4 bg-white rounded-full absolute top-1 shadow-sm transition-all duration-300 ${
                    busServiceEnabled ? 'left-7' : 'left-1'
                  }`}
                />
              </button>
            </div>

            <div className="mt-8 flex justify-end pt-6 border-t border-gray-100">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="bg-yellow-400 text-black px-8 py-2.5 rounded-lg text-sm font-semibold shadow-sm flex items-center justify-center gap-2 hover:bg-yellow-500 active:scale-95 transition-all disabled:opacity-50"
              >
                {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                {saving ? 'Saving Changes...' : 'Save Bus Service Setting'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomizationSettings;
