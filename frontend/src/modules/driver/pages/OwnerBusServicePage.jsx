import React from 'react';
import { Bus, ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSettings } from '../../../shared/context/SettingsContext';
import DriverBottomNav from '../../shared/components/DriverBottomNav';
import BusServiceManager from '../../admin/pages/bus-service/BusServiceManager';
import { normalizeBusCatalog } from '../../admin/services/busService';
import {
  getOwnerFleetDrivers,
  createOwnerBusService,
  deleteOwnerBusService,
  getOwnerBusServices,
  updateOwnerBusService,
} from '../services/registrationService';

const isEnabledFlag = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(String(value || '').trim().toLowerCase());
};

const ownerBusApi = {
  deleteBus: deleteOwnerBusService,
  getBuses: async () => {
    const response = await getOwnerBusServices();
    const rawItems = response?.data?.data || response?.data?.results || response?.data || [];
    return normalizeBusCatalog(Array.isArray(rawItems) ? rawItems : []);
  },
  getDrivers: async () => {
    const response = await getOwnerFleetDrivers();
    const rawItems = response?.data?.data?.results || response?.data?.results || [];
    return Array.isArray(rawItems) ? rawItems : [];
  },
  upsertBus: async (payload) =>
    normalizeBusCatalog([
      (
        payload.id?.startsWith('bus-')
          ? await createOwnerBusService(payload)
          : await updateOwnerBusService(payload.id, payload)
      )?.data?.data || {},
    ])[0],
};

const OwnerBusServicePage = () => {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const busEnabled = isEnabledFlag(settings.transportRide?.enable_bus_service);

  return (
    <div className="min-h-screen bg-[#f8f9fb] pb-32">
      <div className="mx-auto max-w-6xl px-4 pb-8 pt-6 sm:px-5">
        <div className="mb-5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => navigate('/taxi/owner/home')}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <ChevronLeft size={16} />
            Back
          </button>
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-emerald-700">
            <Bus size={14} />
            Owner Bus Panel
          </div>
        </div>
        <div className="mb-5 flex justify-end">
          <button
            type="button"
            onClick={() => navigate('/taxi/owner/bus-bookings')}
            className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800"
          >
            <Bus size={16} />
            View Bus Bookings
          </button>
        </div>

        {busEnabled ? (
          <BusServiceManager
            api={ownerBusApi}
            basePath="/taxi/owner/bus-service"
            badgeLabel="Owner Bus Control"
            title="Add And Manage Your Buses"
            description="Create owner bus services from the same flow as admin, then manage routes, seats, pricing, and schedules in a mobile-friendly screen."
            emptyLabel="No buses added yet."
            defaultStatus="active"
          />
        ) : (
          <div className="rounded-[28px] border border-amber-200 bg-amber-50 p-6 text-sm font-bold text-amber-800 shadow-sm">
            Bus service is currently disabled in admin settings, so the owner bus panel is hidden until it is enabled.
          </div>
        )}
      </div>

      <DriverBottomNav />
    </div>
  );
};

export default OwnerBusServicePage;
