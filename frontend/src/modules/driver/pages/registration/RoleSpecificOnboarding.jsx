import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BusFront, Building2, ChevronRight, Search, UserRound } from 'lucide-react';
import { motion } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  clearDriverRegistrationSession,
  completeDriverOnboarding,
  getDriverOnboardingSignupOptions,
  getStoredDriverRegistrationSession,
  persistDriverAuthSession,
  saveDriverOnboardingRoleDetails,
  saveDriverRegistrationSession,
} from '../../services/registrationService';

const unwrap = (response) => response?.data?.data || response?.data || response;

const ROLE_META = {
  bus_driver: {
    Icon: BusFront,
    color: 'text-blue-600',  
  },
  service_center: {
    Icon: Building2,
    color: 'text-violet-600',
  },
  service_center_staff: {
    Icon: UserRound,
    color: 'text-rose-600',
  },
};

const ROLE_STEPS = {
  bus_driver: [
    {
      key: 'bus-flow',
      badge: 'Step 2 of 4',
      title: 'Choose Bus Flow',
      subtitle: 'Join an existing bus service or create a new one with the full builder.',
    },
    {
      key: 'note',
      badge: 'Step 3 of 4',
      title: 'Add Request Note',
      subtitle: 'Tell the admin anything helpful before they review your signup.',
    },
    {
      key: 'review',
      badge: 'Step 4 of 4',
      title: 'Review & Submit',
      subtitle: 'Check your bus details and send the request.',
    },
  ],
  service_center: [
    {
      key: 'details',
      badge: 'Step 2 of 4',
      title: 'Center Basics',
      subtitle: 'Add your service center name and full address.',
    },
    {
      key: 'location',
      badge: 'Step 3 of 4',
      title: 'Choose Location',
      subtitle: 'Select the service location where your center belongs.',
    },
    {
      key: 'review',
      badge: 'Step 4 of 4',
      title: 'Review & Submit',
      subtitle: 'Confirm your center details and send the request.',
    },
  ],
  service_center_staff: [
    {
      key: 'center',
      badge: 'Step 2 of 3',
      title: 'Choose Existing Center',
      subtitle: 'Pick any approved service center you want to enroll under.',
    },
    {
      key: 'review',
      badge: 'Step 3 of 3',
      title: 'Review & Submit',
      subtitle: 'Confirm the selected center before submitting.',
    },
  ],
};

const RoleSpecificOnboarding = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const routePrefix = location.pathname.startsWith('/taxi/owner') ? '/taxi/owner' : '/taxi/driver';
  const session = getStoredDriverRegistrationSession();
  const role = String(session.role || '').toLowerCase();
  const meta = ROLE_META[role];
  const phone = String(session.phone || '').replace(/\D/g, '').slice(-10);
  const registrationId = String(session.registrationId || '').trim();
  const steps = ROLE_STEPS[role] || [];

  const [loadingOptions, setLoadingOptions] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState({
    serviceLocations: [],
    serviceCenters: [],
    busServices: [],
  });
  const [formData, setFormData] = useState(() => ({
    busSignupMode: session.roleDetails?.createNewBus ? 'create' : session.roleDetails?.busServiceId ? 'existing' : '',
    centerName: session.roleDetails?.centerName || '',
    address: session.roleDetails?.address || '',
    serviceLocationId: session.roleDetails?.serviceLocationId || '',
    serviceCenterId: session.roleDetails?.serviceCenterId || '',
    busServiceId: session.roleDetails?.busServiceId || '',
    requestNote: session.roleDetails?.requestNote || '',
    operatorName: session.roleDetails?.operatorName || '',
    busName: session.roleDetails?.busName || '',
    serviceNumber: session.roleDetails?.serviceNumber || '',
    originCity: session.roleDetails?.originCity || '',
    destinationCity: session.roleDetails?.destinationCity || '',
  }));
  const [stepIndex, setStepIndex] = useState(() => {
    if (typeof session.roleSignupStep === 'number' && session.roleSignupStep >= 0) {
      return session.roleSignupStep;
    }

    if (role === 'bus_driver') {
      if (session.roleDetails?.createNewBus && session.roleDetails?.busDraft) {
        return session.roleDetails?.requestNote ? 2 : 1;
      }
      if (session.roleDetails?.busServiceId) {
        return session.roleDetails?.requestNote ? 2 : 1;
      }
      return 0;
    }

    if (role === 'service_center') {
      if (session.roleDetails?.serviceLocationId) return 2;
      if (session.roleDetails?.centerName || session.roleDetails?.address) return 1;
      return 0;
    }

    if (role === 'service_center_staff') {
      return session.roleDetails?.serviceCenterId ? 1 : 0;
    }

    return 0;
  });

  useEffect(() => {
    if (!phone || !registrationId || !meta) {
      navigate(`${routePrefix}/login`, { replace: true });
      return;
    }

    let active = true;

    const loadOptions = async () => {
      try {
        setLoadingOptions(true);
        const response = await getDriverOnboardingSignupOptions();
        if (!active) return;
        setOptions(unwrap(response));
      } catch (requestError) {
        if (!active) return;
        setError(requestError?.message || 'Unable to load signup options');
      } finally {
        if (active) {
          setLoadingOptions(false);
        }
      }
    };

    loadOptions();
    return () => {
      active = false;
    };
  }, [meta, navigate, phone, registrationId, routePrefix]);

  useEffect(() => {
    saveDriverRegistrationSession({
      ...session,
      roleDetails: {
        ...(session.roleDetails || {}),
        ...formData,
      },
      roleSignupStep: stepIndex,
    });
  }, [formData, session, stepIndex]);

  const filteredServiceCenters = useMemo(() => {
    const term = String(search || '').trim().toLowerCase();
    const items = Array.isArray(options.serviceCenters) ? options.serviceCenters : [];
    if (!term) return items;
    return items.filter((item) =>
      [item.name, item.address, item.ownerPhone, item.serviceLocationName]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [options.serviceCenters, search]);

  const filteredBusServices = useMemo(() => {
    const term = String(search || '').trim().toLowerCase();
    const items = Array.isArray(options.busServices) ? options.busServices : [];
    if (!term) return items;
    return items.filter((item) =>
      [item.operatorName, item.busName, item.serviceNumber, item.routeName, item.originCity, item.destinationCity]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [options.busServices, search]);

  const createdBusDraft = session?.roleDetails?.busDraft || null;

  const selectedBusService = useMemo(
    () =>
      (options.busServices || []).find((item) => String(item.id) === String(formData.busServiceId)) || null,
    [formData.busServiceId, options.busServices],
  );

  const selectedServiceCenter = useMemo(
    () =>
      (options.serviceCenters || []).find((item) => String(item.id) === String(formData.serviceCenterId)) || null,
    [formData.serviceCenterId, options.serviceCenters],
  );

  const selectedServiceLocation = useMemo(
    () =>
      (options.serviceLocations || []).find(
        (item) => String(item._id || item.id) === String(formData.serviceLocationId),
      ) || null,
    [formData.serviceLocationId, options.serviceLocations],
  );

  const canCreateBusDraft = Boolean(
    String(createdBusDraft?.operatorName || '').trim()
      && String(createdBusDraft?.busName || '').trim()
      && String(createdBusDraft?.route?.originCity || '').trim()
      && String(createdBusDraft?.route?.destinationCity || '').trim(),
  );

  const currentStep = steps[stepIndex] || steps[0] || null;
  const isLastStep = stepIndex === steps.length - 1;
  const isBusDriverCreateMode = role === 'bus_driver' && formData.busSignupMode === 'create';

  const headerTitle =
    role === 'bus_driver' && stepIndex === 0
      ? !formData.busSignupMode
        ? 'Choose Bus Flow'
        : formData.busSignupMode === 'create'
          ? 'Create Bus Service'
          : 'Join Existing Bus'
      : currentStep?.title || '';
  const headerSubtitle =
    role === 'bus_driver' && stepIndex === 0
      ? !formData.busSignupMode
        ? 'Choose whether this driver joins an existing bus service or creates a new one.'
        : formData.busSignupMode === 'create'
          ? 'Open the full bus builder and use the same admin-style flow for layout, route, and schedules.'
          : 'Search and select the bus service you want to join.'
      : currentStep?.subtitle || '';

  const canSubmit =
    role === 'service_center'
      ? Boolean(formData.centerName.trim() && formData.address.trim() && formData.serviceLocationId)
      : role === 'service_center_staff'
        ? Boolean(formData.serviceCenterId)
        : isBusDriverCreateMode
          ? canCreateBusDraft
          : Boolean(formData.busServiceId);

  const canMoveForward =
    role === 'bus_driver'
      ? stepIndex === 0
        ? (
            formData.busSignupMode === 'create'
              ? canCreateBusDraft
              : formData.busSignupMode === 'existing'
                ? Boolean(formData.busServiceId)
                : false
          )
        : stepIndex === 1
          ? canSubmit
          : canSubmit
      : role === 'service_center'
        ? stepIndex === 0
          ? Boolean(formData.centerName.trim() && formData.address.trim())
          : stepIndex === 1
            ? Boolean(formData.serviceLocationId)
            : canSubmit
        : role === 'service_center_staff'
          ? stepIndex === 0
            ? Boolean(formData.serviceCenterId)
            : canSubmit
          : canSubmit;

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');

    try {
      const roleDetails =
        role === 'service_center'
          ? {
              centerName: formData.centerName,
              address: formData.address,
              serviceLocationId: formData.serviceLocationId,
            }
          : role === 'service_center_staff'
            ? {
                serviceCenterId: formData.serviceCenterId,
              }
            : {
                createNewBus: isBusDriverCreateMode,
                busServiceId: formData.busServiceId,
                requestNote: formData.requestNote,
                busDraft: createdBusDraft,
                operatorName: formData.operatorName,
                busName: formData.busName,
                serviceNumber: formData.serviceNumber,
                originCity: formData.originCity,
                destinationCity: formData.destinationCity,
              };

      await saveDriverOnboardingRoleDetails({
        registrationId,
        phone,
        roleDetails,
      });

      const response = await completeDriverOnboarding({ registrationId, phone });
      const payload = unwrap(response);

      if (payload?.token) {
        persistDriverAuthSession({ token: payload.token, role });
      }

      saveDriverRegistrationSession({
        ...session,
        roleDetails,
        completedRegistration: payload || null,
      });
      clearDriverRegistrationSession();
      navigate('/taxi/driver/registration-status', {
        replace: true,
        state: {
          role,
          completedRegistration: payload || null,
        },
      });
    } catch (requestError) {
      setError(requestError?.message || 'Unable to submit this signup request');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBack = () => {
    if (stepIndex > 0) {
      setStepIndex((current) => current - 1);
      return;
    }
    navigate(`${routePrefix}/step-personal`);
  };

  const handleNext = () => {
    if (isLastStep || !canMoveForward) {
      return;
    }
    setStepIndex((current) => Math.min(current + 1, steps.length - 1));
  };

  const openBusBuilder = () => {
    setFormData((current) => ({ ...current, busSignupMode: 'create', busServiceId: '' }));
    navigate('/taxi/driver/role-signup/bus-builder/create?step=1');
  };

  if (!meta || !currentStep) {
    return null;
  }

  return (
    <div
      className="min-h-screen overflow-x-hidden bg-[linear-gradient(180deg,#f6efe4_0%,#fcfaf6_28%,#ffffff_100%)] px-5 pb-36 pt-8 select-none"
      style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}
    >
      <main className="mx-auto max-w-sm space-y-6">
        <header className="space-y-5">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={handleBack}
              className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/70 bg-white/80 text-slate-900 shadow-sm"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="rounded-full border border-slate-900/5 bg-slate-900/5 px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">
              {currentStep.badge}
            </div>
          </div>

          <div className="space-y-3">
            <div className={`flex h-11 w-11 items-center justify-center rounded-[1.25rem] bg-white shadow-sm ${meta.color}`}>
              <meta.Icon size={22} />
            </div>
            <h1 className="font-['Outfit'] text-[42px] font-black leading-[1] tracking-[-0.04em] text-slate-900">
              {headerTitle}
            </h1>
            <p className="text-[15px] font-bold leading-relaxed text-slate-500 opacity-80">
              {headerSubtitle}
            </p>
          </div>
        </header>

        <section className="space-y-4 rounded-[2.5rem] border border-slate-100 bg-white p-6 shadow-sm">
          <div className="mb-1 flex gap-2">
            {steps.map((step, index) => (
              <div
                key={step.key}
                className={`h-2 flex-1 rounded-full ${index <= stepIndex ? 'bg-slate-900' : 'bg-slate-200'}`}
              />
            ))}
          </div>

          {role === 'bus_driver' && stepIndex === 0 ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setFormData((current) => ({ ...current, busSignupMode: 'existing' }))}
                  className={`rounded-2xl border px-4 py-4 text-sm font-black transition ${
                    formData.busSignupMode === 'existing'
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-slate-50 text-slate-900'
                  }`}
                >
                  Join Existing
                </button>
                <button
                  type="button"
                  onClick={openBusBuilder}
                  className={`rounded-2xl border px-4 py-4 text-sm font-black transition ${
                    formData.busSignupMode === 'create'
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-slate-50 text-slate-900'
                  }`}
                >
                  Create New
                </button>
              </div>

              {!formData.busSignupMode ? (
                <div className="space-y-3">
                  <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">How bus signup works</p>
                    <p className="mt-2 text-sm font-bold text-slate-900">
                      Choose an existing bus service if it is already listed, or create a new one with the same full flow used in admin.
                    </p>
                  </div>
                  <div className="rounded-[22px] border border-blue-100 bg-blue-50/70 p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-700">Full Builder Included</p>
                    <p className="mt-2 text-sm font-bold text-slate-900">
                      New bus creation opens the full multi-step builder for bus basics, media, seat layout, route, and schedules.
                    </p>
                  </div>
                </div>
              ) : null}

              {formData.busSignupMode === 'existing' ? (
                <>
                  <div className="rounded-[22px] border border-emerald-100 bg-emerald-50/70 p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">Existing Bus Services</p>
                    <p className="mt-2 text-sm font-bold text-slate-900">
                      Select any existing bus service if you're joining one that's already listed.
                    </p>
                  </div>

                  <div className="relative">
                    <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search bus service"
                      className="w-full rounded-2xl border border-slate-200 py-4 pl-11 pr-4 text-sm font-bold text-slate-900 outline-none"
                    />
                  </div>

                  <div className="space-y-3">
                    {filteredBusServices.map((item) => {
                      const isSelected = String(formData.busServiceId) === String(item.id);

                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setFormData((current) => ({ ...current, busServiceId: item.id }))}
                          className={`w-full rounded-[22px] border p-4 text-left transition ${
                            isSelected ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-slate-50 text-slate-900'
                          }`}
                        >
                          <p className="text-sm font-black">{`${item.operatorName} - ${item.busName}`}</p>
                          <p className={`mt-1 text-xs font-bold ${isSelected ? 'text-white/70' : 'text-slate-500'}`}>
                            {`${item.originCity || 'Origin'} to ${item.destinationCity || 'Destination'}${item.serviceNumber ? ` - ${item.serviceNumber}` : ''}`}
                          </p>
                        </button>
                      );
                    })}
                  </div>

                  {!filteredBusServices.length && !loadingOptions ? (
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4 text-sm font-bold text-slate-500">
                      No bus services found for this search.
                    </div>
                  ) : null}
                </>
              ) : null}

              {formData.busSignupMode === 'create' ? (
                <div className="space-y-3">
                  <div className="rounded-[22px] border border-blue-100 bg-blue-50/70 p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-700">Create New Bus Service</p>
                    <p className="mt-2 text-sm font-bold text-slate-900">
                      Open the full builder to set up the bus basics, media, seat layout, route, and schedules.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={openBusBuilder}
                    className="flex w-full items-center justify-center gap-3 rounded-[1.8rem] bg-slate-900 px-5 py-4 text-sm font-black uppercase tracking-[0.18em] text-white shadow-[0_20px_40px_rgba(0,0,0,0.12)]"
                  >
                    Open Full Bus Builder
                    <ChevronRight size={18} />
                  </button>

                  {createdBusDraft ? (
                    <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Saved Bus Draft</p>
                      <p className="mt-2 text-sm font-black text-slate-900">
                        {createdBusDraft.operatorName || 'Operator'} - {createdBusDraft.busName || 'Bus'}
                      </p>
                      <p className="mt-1 text-xs font-bold text-slate-500">
                        {createdBusDraft.route?.originCity || 'Origin'} to {createdBusDraft.route?.destinationCity || 'Destination'}
                        {createdBusDraft.serviceNumber ? ` - ${createdBusDraft.serviceNumber}` : ''}
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4 text-sm font-bold text-slate-500">
                      No bus draft saved yet. Open the builder and save your bus first.
                    </div>
                  )}

                  {canCreateBusDraft ? (
                    <button
                      type="button"
                      onClick={handleNext}
                      className="flex w-full items-center justify-center gap-3 rounded-[1.8rem] border border-slate-200 bg-white px-5 py-4 text-sm font-black uppercase tracking-[0.18em] text-slate-900"
                    >
                      Continue With This Draft
                      <ChevronRight size={18} />
                    </button>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}

          {role === 'bus_driver' && stepIndex === 1 ? (
            <>
              {formData.busSignupMode === 'existing' && selectedBusService ? (
                <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Selected Bus</p>
                  <p className="mt-2 text-sm font-black text-slate-900">
                    {selectedBusService.operatorName} - {selectedBusService.busName}
                  </p>
                  <p className="mt-1 text-xs font-bold text-slate-500">
                    {selectedBusService.originCity || 'Origin'} to {selectedBusService.destinationCity || 'Destination'}
                    {selectedBusService.serviceNumber ? ` - ${selectedBusService.serviceNumber}` : ''}
                  </p>
                </div>
              ) : null}

              {formData.busSignupMode === 'create' ? (
                <div className="space-y-3">
                  <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">New Bus Draft</p>
                    <p className="mt-2 text-sm font-black text-slate-900">
                      {createdBusDraft?.operatorName || 'Operator'} - {createdBusDraft?.busName || 'Bus'}
                    </p>
                    <p className="mt-1 text-xs font-bold text-slate-500">
                      {createdBusDraft?.route?.originCity || 'Origin'} to {createdBusDraft?.route?.destinationCity || 'Destination'}
                      {createdBusDraft?.serviceNumber ? ` - ${createdBusDraft.serviceNumber}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={openBusBuilder}
                    className="flex w-full items-center justify-center gap-3 rounded-[1.8rem] border border-slate-200 bg-white px-5 py-4 text-sm font-black uppercase tracking-[0.18em] text-slate-900"
                  >
                    Edit Bus Draft
                    <ChevronRight size={18} />
                  </button>
                </div>
              ) : null}

              <textarea
                value={formData.requestNote}
                onChange={(event) => setFormData((current) => ({ ...current, requestNote: event.target.value }))}
                placeholder="Optional note for the admin"
                rows={5}
                className="w-full rounded-2xl border border-slate-200 px-4 py-4 text-sm font-bold text-slate-900 outline-none"
              />
              <p className="text-xs font-semibold text-slate-500">
                Example: mention your city, shift preference, or who asked you to join this bus service.
              </p>
            </>
          ) : null}

          {role === 'bus_driver' && stepIndex === 2 ? (
            <div className="space-y-4">
              <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                  {isBusDriverCreateMode ? 'New Bus Service' : 'Bus Service'}
                </p>
                <p className="mt-2 text-sm font-black text-slate-900">
                  {isBusDriverCreateMode
                    ? `${createdBusDraft?.operatorName || 'Operator'} - ${createdBusDraft?.busName || 'Bus'}`
                    : selectedBusService
                      ? `${selectedBusService.operatorName} - ${selectedBusService.busName}`
                      : 'No bus selected'}
                </p>
                <p className="mt-1 text-xs font-bold text-slate-500">
                  {isBusDriverCreateMode
                    ? `${createdBusDraft?.route?.originCity || 'Origin'} to ${createdBusDraft?.route?.destinationCity || 'Destination'}${createdBusDraft?.serviceNumber ? ` - ${createdBusDraft.serviceNumber}` : ''}`
                    : selectedBusService
                      ? `${selectedBusService.originCity || 'Origin'} to ${selectedBusService.destinationCity || 'Destination'}${selectedBusService.serviceNumber ? ` - ${selectedBusService.serviceNumber}` : ''}`
                      : 'Go back and choose a bus service first.'}
                </p>
              </div>

              <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Admin Note</p>
                <p className="mt-2 text-sm font-bold text-slate-900">{formData.requestNote.trim() || 'No note added'}</p>
              </div>
            </div>
          ) : null}

          {role === 'service_center' && stepIndex === 0 ? (
            <>
              <input
                value={formData.centerName}
                onChange={(event) => setFormData((current) => ({ ...current, centerName: event.target.value }))}
                placeholder="Service center name"
                className="w-full rounded-2xl border border-slate-200 px-4 py-4 text-sm font-bold text-slate-900 outline-none"
              />
              <textarea
                value={formData.address}
                onChange={(event) => setFormData((current) => ({ ...current, address: event.target.value }))}
                placeholder="Center address"
                rows={5}
                className="w-full rounded-2xl border border-slate-200 px-4 py-4 text-sm font-bold text-slate-900 outline-none"
              />
            </>
          ) : null}

          {role === 'service_center' && stepIndex === 1 ? (
            <>
              <select
                value={formData.serviceLocationId}
                onChange={(event) => setFormData((current) => ({ ...current, serviceLocationId: event.target.value }))}
                className="w-full rounded-2xl border border-slate-200 px-4 py-4 text-sm font-bold text-slate-900 outline-none"
              >
                <option value="">Select service location</option>
                {(options.serviceLocations || []).map((item) => (
                  <option key={item._id || item.id} value={item._id || item.id}>
                    {item.service_location_name || item.name}
                  </option>
                ))}
              </select>

              <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Why this step matters</p>
                <p className="mt-2 text-sm font-bold text-slate-900">
                  Your center will be attached to this service location for approval and zoning.
                </p>
              </div>
            </>
          ) : null}

          {role === 'service_center' && stepIndex === 2 ? (
            <div className="space-y-4">
              <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Center Name</p>
                <p className="mt-2 text-sm font-black text-slate-900">{formData.centerName || 'Not added'}</p>
              </div>
              <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Address</p>
                <p className="mt-2 text-sm font-bold text-slate-900">{formData.address || 'Not added'}</p>
              </div>
              <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Service Location</p>
                <p className="mt-2 text-sm font-black text-slate-900">
                  {selectedServiceLocation?.service_location_name || selectedServiceLocation?.name || 'Not selected'}
                </p>
              </div>
            </div>
          ) : null}

          {role === 'service_center_staff' && stepIndex === 0 ? (
            <>
              <div className="rounded-[22px] border border-emerald-100 bg-emerald-50/70 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">Existing Centers Only</p>
                <p className="mt-2 text-sm font-bold text-slate-900">
                  Choose from approved centers already on the platform and enroll under one of them.
                </p>
              </div>

              <div className="relative">
                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search existing service center"
                  className="w-full rounded-2xl border border-slate-200 py-4 pl-11 pr-4 text-sm font-bold text-slate-900 outline-none"
                />
              </div>

              <div className="space-y-3">
                {filteredServiceCenters.map((item) => {
                  const isSelected = String(formData.serviceCenterId) === String(item.id);

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setFormData((current) => ({ ...current, serviceCenterId: item.id }))}
                      className={`w-full rounded-[22px] border p-4 text-left transition ${
                        isSelected ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-slate-50 text-slate-900'
                      }`}
                    >
                      <p className="text-sm font-black">{item.name}</p>
                      <p className={`mt-1 text-xs font-bold ${isSelected ? 'text-white/70' : 'text-slate-500'}`}>
                        {`${item.serviceLocationName || 'Location not set'} - ${item.address || 'Address not set'}`}
                      </p>
                    </button>
                  );
                })}
              </div>

              {!filteredServiceCenters.length && !loadingOptions ? (
                <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4 text-sm font-bold text-slate-500">
                  No approved centers found for this search.
                </div>
              ) : null}
            </>
          ) : null}

          {role === 'service_center_staff' && stepIndex === 1 ? (
            <div className="space-y-4">
              <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Selected Center</p>
                <p className="mt-2 text-sm font-black text-slate-900">{selectedServiceCenter?.name || 'No center selected'}</p>
                <p className="mt-1 text-xs font-bold text-slate-500">
                  {selectedServiceCenter
                    ? `${selectedServiceCenter.serviceLocationName || 'Location not set'} - ${selectedServiceCenter.address || 'Address not set'}`
                    : 'Go back and choose an existing center first.'}
                </p>
              </div>

              <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Enrollment</p>
                <p className="mt-2 text-sm font-bold text-slate-900">
                  Your request will be sent under this center for admin approval.
                </p>
              </div>
            </div>
          ) : null}
        </section>

        {loadingOptions ? (
          <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3 text-sm font-bold text-slate-500">
            Loading signup options...
          </div>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600">
            {error}
          </div>
        ) : null}
      </main>

      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent p-8">
        <div className="mx-auto flex max-w-sm gap-3">
          {stepIndex > 0 ? (
            <button
              type="button"
              onClick={handleBack}
              disabled={submitting}
              className="flex h-16 items-center justify-center rounded-[1.8rem] border border-slate-200 bg-white px-5 text-[14px] font-black text-slate-700"
            >
              Back
            </button>
          ) : null}

          {isLastStep ? (
            <motion.button
              whileHover={canSubmit && !submitting ? { scale: 1.02 } : {}}
              whileTap={canSubmit && !submitting ? { scale: 0.98 } : {}}
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit || submitting || loadingOptions}
              className={`flex h-16 flex-1 items-center justify-center gap-3 rounded-[1.8rem] text-[15px] font-black tracking-tight transition-all ${
                canSubmit && !loadingOptions
                  ? 'bg-slate-900 text-white shadow-[0_20px_40px_rgba(0,0,0,0.2)]'
                  : 'bg-slate-200 text-slate-400'
              }`}
            >
              {submitting ? (
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/25 border-t-white" />
              ) : (
                <>
                  <span className="uppercase tracking-widest">Submit Request</span>
                  <ChevronRight size={18} />
                </>
              )}
            </motion.button>
          ) : (
            <motion.button
              whileHover={canMoveForward && !submitting ? { scale: 1.02 } : {}}
              whileTap={canMoveForward && !submitting ? { scale: 0.98 } : {}}
              type="button"
              onClick={handleNext}
              disabled={!canMoveForward || submitting || loadingOptions}
              className={`flex h-16 flex-1 items-center justify-center gap-3 rounded-[1.8rem] text-[15px] font-black tracking-tight transition-all ${
                canMoveForward && !loadingOptions
                  ? 'bg-slate-900 text-white shadow-[0_20px_40px_rgba(0,0,0,0.2)]'
                  : 'bg-slate-200 text-slate-400'
              }`}
            >
              <span className="uppercase tracking-widest">Next Step</span>
              <ChevronRight size={18} />
            </motion.button>
          )}
        </div>
      </div>
    </div>
  );
};

export default RoleSpecificOnboarding;
