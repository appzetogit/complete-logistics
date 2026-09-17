import React from 'react';
import { Bus, ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import BusServiceManager from '../../../admin/pages/bus-service/BusServiceManager';
import { normalizeBusCatalog } from '../../../admin/services/busService';
import {
  getStoredDriverRegistrationSession,
  saveDriverRegistrationSession,
} from '../../services/registrationService';

const getStoredBusDrafts = () => {
  const session = getStoredDriverRegistrationSession();
  const draft = session?.roleDetails?.busDraft;
  return draft ? normalizeBusCatalog([draft]) : [];
};

const saveStoredBusDraft = (payload) => {
  const normalized = normalizeBusCatalog([payload])[0];
  const session = getStoredDriverRegistrationSession();

  saveDriverRegistrationSession({
    ...session,
    roleDetails: {
      ...(session.roleDetails || {}),
      createNewBus: true,
      busDraft: normalized,
      operatorName: normalized.operatorName || '',
      busName: normalized.busName || '',
      serviceNumber: normalized.serviceNumber || '',
      originCity: normalized.route?.originCity || '',
      destinationCity: normalized.route?.destinationCity || '',
    },
  });

  return normalized;
};

const clearStoredBusDraft = () => {
  const session = getStoredDriverRegistrationSession();
  const nextRoleDetails = {
    ...(session.roleDetails || {}),
  };

  delete nextRoleDetails.busDraft;
  delete nextRoleDetails.operatorName;
  delete nextRoleDetails.busName;
  delete nextRoleDetails.serviceNumber;
  delete nextRoleDetails.originCity;
  delete nextRoleDetails.destinationCity;

  saveDriverRegistrationSession({
    ...session,
    roleDetails: nextRoleDetails,
  });

  return true;
};

const signupBusBuilderApi = {
  deleteBus: async () => clearStoredBusDraft(),
  getBuses: async () => getStoredBusDrafts(),
  getDrivers: undefined,
  getPendingBusDrivers: async () => ({ data: { data: { results: [] } } }),
  approvePendingBusDriver: async () => true,
  rejectPendingBusDriver: async () => true,
  upsertBus: async (payload) => saveStoredBusDraft(payload),
};

const BusSignupBuilderPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#f8f9fb] pb-10">
      <div className="mx-auto max-w-6xl px-4 pb-8 pt-6 sm:px-5">
        <div className="mb-5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => navigate('/taxi/driver/role-signup')}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <ChevronLeft size={16} />
            Back To Signup
          </button>
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-blue-700">
            <Bus size={14} />
            Bus Signup Builder
          </div>
        </div>

        <BusServiceManager
          api={signupBusBuilderApi}
          basePath="/taxi/driver/role-signup/bus-builder"
          badgeLabel="Bus Signup Flow"
          title="Create Your Bus Service"
          description="Use the full bus creation flow here, then return to signup and submit the bus driver request."
          emptyLabel="No bus draft created yet."
          defaultStatus="draft"
        />
      </div>
    </div>
  );
};

export default BusSignupBuilderPage;
