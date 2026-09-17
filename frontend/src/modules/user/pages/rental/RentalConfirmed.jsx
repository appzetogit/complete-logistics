import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle2, MapPin, Clock, Camera, Home, Upload } from 'lucide-react';
import { useSettings } from '../../../../shared/context/SettingsContext';
import { userService } from '../../services/userService';
import { saveCurrentRide, clearCurrentRide } from '../../services/currentRideService';

const buildRentalBookingPayload = ({
  state,
  vehicle,
  bookingReference,
}) => ({
  bookingReference,
  vehicleTypeId: vehicle.id || vehicle._id,
  pickupDateTime: state.pickup,
  returnDateTime: state.returnTime,
  totalCost: Number(state.totalCost || 0),
  payableNow: Number(state.deposit || 0),
  advancePaymentLabel: state.vehicle?.advancePayment?.label || 'Advance booking payment',
  paymentStatus: state.paymentStatus || 'pending',
  paymentMethod: state.paymentMethod || '',
  paymentMethodLabel: state.paymentMethodLabel || '',
  payment: state.payment || {
    provider: state.paymentMethodLabel ? 'razorpay' : 'manual',
    status: state.paymentStatus || 'pending',
    amount: Number(state.deposit || 0),
    currency: 'INR',
  },
  kycCompleted: true,
  kycDocuments: state.rentalKyc?.documents || null,
  selectedPackage: state.selectedPackage
    ? {
        id: state.selectedPackage.id || state.selectedPackage._id || '',
        label: state.selectedPackage.label || '',
        durationHours: Number(state.selectedPackage.durationHours || 0),
        price: Number(state.selectedPackage.price || 0),
        extraHourPrice: Number(state.selectedPackage.extraHourPrice || 0),
      }
    : null,
  serviceLocation: state.serviceLocation
    ? {
        id: state.serviceLocation.id || state.serviceLocation._id || '',
        name: state.serviceLocation.name || '',
        address: state.serviceLocation.address || '',
        city: state.serviceLocation.city || state.serviceLocation.country || '',
        latitude: state.serviceLocation.latitude,
        longitude: state.serviceLocation.longitude,
        distanceKm: state.serviceLocation.distanceKm,
      }
    : null,
});

const FALLBACK_DURATION_HOURS = {
  Hourly: 1,
  'Half-Day': 6,
  Daily: 24,
};

const durationSuffix = (hours) => {
  const value = Number(hours || 0);
  if (value <= 1) return '/hr';
  if (value <= 12) return `/${value}hr`;
  return '/day';
};

const resolveRentalPricingSummary = ({
  ride = {},
  vehicle = null,
  duration = 'Hourly',
} = {}) => {
  const selectedPackage = ride?.selectedPackage || null;
  const fallbackVehiclePrice =
    Number(vehicle?.prices?.[duration] || 0) ||
    Number(ride?.totalCost || 0) ||
    Number(ride?.advancePaid || ride?.payableNow || 0) ||
    0;
  const basePrice = Math.max(
    Number(ride?.basePrice || 0),
    Number(selectedPackage?.price || 0),
    fallbackVehiclePrice,
  );
  const includedHours = Math.max(
    Number(ride?.includedHours || 0),
    Number(selectedPackage?.durationHours || 0),
    Number(ride?.requestedHours || 0) > 0 && Number(ride?.extraHourRate || selectedPackage?.extraHourPrice || 0) <= 0
      ? Number(ride?.requestedHours || 0)
      : 0,
    Number(FALLBACK_DURATION_HOURS[duration] || 1),
  );
  const extraHourRate = Math.max(
    Number(ride?.extraHourRate || 0),
    Number(selectedPackage?.extraHourPrice || 0),
    0,
  );

  return {
    label: selectedPackage?.label || duration,
    basePrice,
    includedHours,
    extraHourRate,
    suffix: durationSuffix(selectedPackage?.durationHours || includedHours),
  };
};

const computeRentalLiveCharge = (ride = {}, pricingSummary = {}, elapsedSeconds = 0) => {
  const elapsedHours = Math.max(0, Number(elapsedSeconds || 0) / 3600);
  const basePrice = Math.max(
    Number(pricingSummary?.basePrice || 0),
    Number(ride?.advancePaid || ride?.payableNow || 0),
    0,
  );
  const includedHours = Math.max(1, Number(pricingSummary?.includedHours || 0));
  const extraHourRate = Math.max(0, Number(pricingSummary?.extraHourRate || 0));
  const packageCharge = elapsedHours <= includedHours
    ? basePrice
    : basePrice + Math.ceil(Math.max(0, elapsedHours - includedHours)) * extraHourRate;

  return Math.max(Number(ride?.advancePaid || ride?.payableNow || 0), packageCharge);
};

const RentalConfirmed = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { settings } = useSettings();
  const appName = settings.general?.app_name || 'App';
  const state = location.state || {};
  const [clockNow, setClockNow] = useState(() => Date.now());

  const [activeRentalRide, setActiveRentalRide] = useState(() => {
    return state?.serviceType === 'rental' && state?.rideId ? state : null;
  });
  const [fetchingActive, setFetchingActive] = useState(false);

  useEffect(() => {
    if (activeRentalRide) return;

    let mounted = true;
    const fetchActive = async () => {
      try {
        setFetchingActive(true);
        const response = await userService.getActiveRentalBooking();
        const payload = response?.data?.data || response?.data || null;
        if (mounted && payload) {
          const assignedVehicle = payload.assignedVehicle || {};
          const vehicleName = assignedVehicle?.name || payload.vehicleName || 'Assigned Vehicle';
          const vehicleImage = assignedVehicle?.image || payload.vehicleImage || '';
          const vehicleCategory = assignedVehicle?.vehicleCategory || payload.vehicleCategory || 'Rental';
          const nextRide = {
            ...payload,
            rideId: payload.id || payload.rideId,
            serviceType: 'rental',
            liveStatus: payload.status || payload.liveStatus || 'assigned',
            vehicleName,
            vehicleImage,
            vehicleCategory,
            vehicle: {
              name: vehicleName,
              image: vehicleImage,
              vehicleIconUrl: vehicleImage,
            },
            driver: {
              name: vehicleName,
              vehicle: vehicleCategory,
              vehicleType: vehicleCategory,
              vehicleIconUrl: vehicleImage,
            },
            vehicleIconUrl: vehicleImage,
          };
          setActiveRentalRide(nextRide);
        }
      } catch (err) {
        console.error('Failed to fetch active rental booking:', err);
      } finally {
        if (mounted) setFetchingActive(false);
      }
    };
    fetchActive();
    return () => { mounted = false; };
  }, [activeRentalRide]);

  const isCompletedRentalRide = Boolean(activeRentalRide?.completedAt || state?.summaryMode === 'completed');
  
  useEffect(() => {
    if (isCompletedRentalRide) {
      clearCurrentRide();
    }
  }, [isCompletedRentalRide]);
  const isEndRequestPending = String(activeRentalRide?.status || '').toLowerCase() === 'end_requested' && !isCompletedRentalRide;
  const [distanceToHub, setDistanceToHub] = useState(null);
  const [locationError, setLocationError] = useState(null);

  useEffect(() => {
    if (!activeRentalRide || isCompletedRentalRide || isEndRequestPending) return undefined;

    let watchId;
    const hubLat = activeRentalRide?.serviceLocation?.latitude;
    const hubLon = activeRentalRide?.serviceLocation?.longitude;

    if (navigator.geolocation && hubLat && hubLon) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const dist = calculateDistance(pos.coords.latitude, pos.coords.longitude, hubLat, hubLon);
          setDistanceToHub(dist);
          setLocationError(null);
        },
        (err) => {
          console.error('Location error:', err);
          setLocationError('Please enable location access to end the ride.');
        },
        { enableHighAccuracy: true },
      );
    }

    return () => {
      if (watchId) navigator.geolocation.clearWatch(watchId);
    };
  }, [activeRentalRide, isCompletedRentalRide, isEndRequestPending]);

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3; // meters
    const q1 = (lat1 * Math.PI) / 180;
    const q2 = (lat2 * Math.PI) / 180;
    const dq = ((lat2 - lat1) * Math.PI) / 180;
    const dl = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dq / 2) * Math.sin(dq / 2) + Math.cos(q1) * Math.cos(q2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const isWithinHubRange = distanceToHub !== null && distanceToHub <= 100;

  useEffect(() => {
    if (!activeRentalRide || isCompletedRentalRide || isEndRequestPending) return undefined;

    const timer = window.setInterval(() => {
      setClockNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [activeRentalRide, isCompletedRentalRide, isEndRequestPending]);

  const {
    vehicle,
    duration,
    pickup,
    returnTime,
    totalCost,
    deposit,
    serviceLocation,
    selectedPackage,
    paymentMethodLabel,
    bookingReference,
  } = state;
  const bookingPricingSummary = resolveRentalPricingSummary({
    ride: { ...state, advancePaid: deposit },
    vehicle,
    duration: duration || 'Hourly',
  });
  const liveElapsedSeconds = activeRentalRide?.assignedAt
    ? isEndRequestPending && Number(activeRentalRide?.finalElapsedMinutes || 0) > 0
      ? Number(activeRentalRide.finalElapsedMinutes || 0) * 60
      : Math.max(1, Math.floor((clockNow - new Date(activeRentalRide.assignedAt || activeRentalRide.createdAt).getTime()) / 1000))
    : Number(activeRentalRide?.elapsedMinutes || 0) * 60;
  const liveElapsedMinutes = Math.max(1, Math.ceil(liveElapsedSeconds / 60));

  const liveElapsedLabel = `${Math.floor(liveElapsedSeconds / 3600)}h ${String(Math.floor((liveElapsedSeconds % 3600) / 60)).padStart(2, '0')}m ${String(liveElapsedSeconds % 60).padStart(2, '0')}s`;
  const activePricingSummary = useMemo(
    () =>
      resolveRentalPricingSummary({
        ride: activeRentalRide || {},
        vehicle: activeRentalRide?.assignedVehicle || activeRentalRide?.vehicle || state.vehicle,
        duration: state.duration || 'Hourly',
      }),
    [activeRentalRide, state.duration, state.vehicle],
  );

  const liveCharge = activeRentalRide
    ? isEndRequestPending && Number(activeRentalRide?.finalCharge || 0) > 0
      ? Number(activeRentalRide.finalCharge || 0)
      : computeRentalLiveCharge(activeRentalRide, activePricingSummary, liveElapsedSeconds)
    : 0;
  const completedCharge = Number(activeRentalRide?.finalCharge || activeRentalRide?.fare || 0);
  const activeVehicleImage = activeRentalRide?.assignedVehicle?.image || activeRentalRide?.vehicle?.image || state.vehicle?.image;
  const activeVehicleName = activeRentalRide?.assignedVehicle?.name || activeRentalRide?.vehicle?.name || state.vehicle?.name || 'Rental Vehicle';
  const activeVehicleCategory = activeRentalRide?.assignedVehicle?.vehicleCategory || activeRentalRide?.driver?.vehicle || state.vehicle?.vehicleCategory || 'Rental';
  const [conditionPhoto, setConditionPhoto] = useState(null);
  const [resolvedBookingReference, setResolvedBookingReference] = useState(bookingReference || '');
  const [endingRide, setEndingRide] = useState(false);
  const inputRef = useRef();
  const bookingId = resolvedBookingReference || `RNT-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  useEffect(() => {
    if (activeRentalRide) {
      setResolvedBookingReference(activeRentalRide.bookingReference || '');
      return undefined;
    }

    let mounted = true;

    const ensureRentalBookingRequest = async () => {
      const alreadySaved = state.bookingRequest?.id || state.bookingRequest?._id || bookingReference;
      const canPersist =
        vehicle &&
        pickup &&
        returnTime &&
        ['paid', 'not_required'].includes(String(state.paymentStatus || '').toLowerCase());

      if (alreadySaved || !canPersist) {
        return;
      }

      try {
        const response = await userService.createRentalBookingRequest(
          buildRentalBookingPayload({
            state,
            vehicle,
            bookingReference: '',
          }),
        );
        const saved = response?.data || response || {};
        if (mounted && saved.bookingReference) {
          setResolvedBookingReference(saved.bookingReference);
        }
      } catch (error) {
        console.error('Could not persist rental booking from confirmation page', error);
      }
    };

    ensureRentalBookingRequest();

    return () => {
      mounted = false;
    };
  }, [activeRentalRide, bookingReference, pickup, returnTime, state, vehicle]);

  const finalTotal = useMemo(() => {
    if (isCompletedRentalRide) {
      return completedCharge;
    }
    return liveCharge;
  }, [completedCharge, isCompletedRentalRide, liveCharge]);

  if (fetchingActive) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-bold text-slate-550 uppercase tracking-widest animate-pulse">Loading Booking Details...</span>
        </div>
      </div>
    );
  }

  if (!state.vehicle && !activeRentalRide) {
    navigate('/rental');
    return null;
  }

  const handleEndRide = async () => {
    if (!activeRentalRide?.rideId) return;

    try {
      setEndingRide(true);
      const response = await userService.endRentalRide(activeRentalRide.rideId);
      const payload = response?.data || null;
      const nextRideState = {
        ...activeRentalRide,
        ...payload,
        rideId: payload?.id || activeRentalRide.rideId,
        fare: payload?.finalCharge || payload?.rideMetrics?.currentCharge || finalTotal,
        completionRequestedAt: payload?.completionRequestedAt || new Date().toISOString(),
        status: payload?.status || 'end_requested',
        liveStatus: payload?.status || 'end_requested',
        finalCharge: payload?.finalCharge || payload?.rideMetrics?.currentCharge || finalTotal,
        finalElapsedMinutes: payload?.finalElapsedMinutes || payload?.rideMetrics?.elapsedMinutes || liveElapsedMinutes,
      };
      saveCurrentRide(nextRideState);
      navigate('/rental/confirmed', {
        replace: true,
        state: nextRideState,
      });
    } catch (error) {
      console.error(error);
    } finally {
      setEndingRide(false);
    }
  };

  if (activeRentalRide) {
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,#F8FAFC_0%,#F3F4F6_38%,#EEF2F7_100%)] max-w-lg mx-auto font-sans pb-28 relative overflow-hidden">
        <div className="absolute -top-16 right-[-40px] h-44 w-44 rounded-full bg-emerald-100/60 blur-3xl pointer-events-none" />

        <div className="px-5 pt-14 space-y-5">
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.35 }}
            className="flex flex-col items-center text-center gap-3 py-5"
          >
            <div className={`w-16 h-16 rounded-full flex items-center justify-center shadow-[0_8px_24px_rgba(16,185,129,0.15)] ${isCompletedRentalRide ? 'bg-emerald-50' : 'bg-orange-50'}`}>
              <CheckCircle2 size={32} className={isCompletedRentalRide ? 'text-emerald-500' : 'text-orange-500'} strokeWidth={2} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500/80">
                {isCompletedRentalRide ? 'Ride Completed' : isEndRequestPending ? 'End Review Pending' : 'Rental In Progress'}
              </p>
              <h1 className="text-[22px] font-extrabold text-slate-950 tracking-tight mt-0.5">
                {isCompletedRentalRide ? 'Final rental total' : isEndRequestPending ? 'Awaiting admin confirmation' : 'Vehicle assigned'}
              </h1>
              {isEndRequestPending && (
                <p className="text-[13px] font-bold text-orange-600 mt-1">
                  Your ride end request is under admin review.
                </p>
              )}
              <p className="text-[12px] font-bold text-slate-400 mt-1">
                Booking ID: <span className="text-slate-700 font-bold">{activeRentalRide.bookingReference || bookingId}</span>
              </p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="rounded-[20px] border border-white/80 bg-white/90 shadow-[0_4px_14px_rgba(15,23,42,0.05)] overflow-hidden"
          >
            <div className="px-5 py-4 flex items-center gap-4 bg-[linear-gradient(135deg,#FFF7ED_0%,#FEF3C7_100%)]">
              {activeVehicleImage ? (
                <img src={activeVehicleImage} alt={activeVehicleName} className="h-16 w-20 object-contain drop-shadow-lg shrink-0" />
              ) : (
                <div className="h-16 w-20 rounded-2xl bg-white/70 shrink-0" />
              )}
              <div>
                <p className="text-[15px] font-bold text-slate-950">{activeVehicleName}</p>
                <p className="text-[11px] font-medium text-slate-500/80 mt-0.5">{activeVehicleCategory}</p>
              </div>
            </div>
            <div className="px-5 py-4 space-y-3 border-t border-slate-50">
              <div className="flex items-center justify-between rounded-[14px] bg-slate-50 px-4 py-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500/80">Time Elapsed</p>
                  <p className="mt-1 text-[18px] font-extrabold text-slate-950">{liveElapsedLabel}</p>
                </div>
                <Clock size={18} className="text-orange-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-[14px] bg-slate-50 px-4 py-3">
                  <p className="text-[10px] font-bold text-slate-400">Advance paid</p>
                  <p className="mt-1 text-[16px] font-black text-emerald-600">Rs.{Number(activeRentalRide.advancePaid || activeRentalRide.payableNow || 0).toFixed(0)}</p>
                </div>
                <div className="rounded-[14px] bg-slate-50 px-4 py-3">
                  <p className="text-[10px] font-medium text-slate-400">{isCompletedRentalRide ? 'Final total' : isEndRequestPending ? 'Frozen total for review' : 'Charge till now'}</p>
                  <p className="mt-1 text-[16px] font-bold text-slate-900">Rs.{finalTotal.toFixed(0)}</p>
                </div>
              </div>
              <div className="rounded-[14px] bg-slate-50 px-4 py-3">
                <p className="text-[10px] font-bold text-slate-400">{isCompletedRentalRide ? 'Final payable balance' : isEndRequestPending ? 'Pending settlement after review' : 'Current remaining due'}</p>
                <p className="mt-1 text-[16px] font-black text-slate-900">
                  Rs.{Math.max(0, finalTotal - Number(activeRentalRide.advancePaid || activeRentalRide.payableNow || 0)).toFixed(0)}
                </p>
              </div>
              <div className="rounded-[14px] bg-slate-50 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500/80">Pricing Plan</p>
                    <p className="mt-1 text-[14px] font-bold text-slate-950">
                      {activePricingSummary.label} - Rs.{Number(activePricingSummary.basePrice || 0).toFixed(0)}
                      <span className="ml-1 text-[11px] font-medium text-slate-400">{activePricingSummary.suffix}</span>
                    </p>
                    <p className="mt-1 text-[11px] font-bold text-slate-500">
                      Includes {Number(activePricingSummary.includedHours || 0)} hr
                      {Number(activePricingSummary.includedHours || 0) === 1 ? '' : 's'}
                      {Number(activePricingSummary.extraHourRate || 0) > 0
                        ? `, then Rs.${Number(activePricingSummary.extraHourRate || 0).toFixed(0)}/extra hr`
                        : ' with no extra-hour charge'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-slate-400">Live billed</p>
                    <p className="mt-1 text-[16px] font-black text-slate-900">Rs.{liveCharge.toFixed(0)}</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <MapPin size={13} className="text-orange-400 shrink-0" />
                <p className="text-[11px] font-black text-slate-700">
                  {activeRentalRide.serviceLocation?.name || `${appName} Hub`}
                </p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 }}
            className="flex items-start gap-3 rounded-[16px] border border-white/80 bg-white/90 px-4 py-3.5 shadow-[0_4px_14px_rgba(15,23,42,0.04)]"
          >
            <div className="w-8 h-8 rounded-[10px] bg-emerald-50 flex items-center justify-center shrink-0">
              <CheckCircle2 size={15} className="text-emerald-500" strokeWidth={2} />
            </div>
            <p className="text-[12px] font-bold text-slate-500 leading-relaxed">
              {isCompletedRentalRide
                ? `Your rental ride has ended. Final total is Rs.${finalTotal.toFixed(0)} and the remaining amount is payable at drop-off.`
                : isEndRequestPending
                  ? `Your end-ride request has been sent to admin for review. The current elapsed time and charge are now frozen until admin confirms the closure.`
                  : `Your rental is active now. The live charge keeps updating based on elapsed time until you end the ride.`}
            </p>
          </motion.div>
        </div>

        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg px-5 pb-6 pt-3 bg-gradient-to-t from-[#EEF2F7] via-[#F3F4F6]/95 to-transparent pointer-events-none z-30">
          {isCompletedRentalRide || isEndRequestPending ? (
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate('/taxi/user')}
              className="pointer-events-auto w-full bg-slate-900 py-4 rounded-[18px] text-[15px] font-black text-white shadow-[0_8px_24px_rgba(15,23,42,0.18)] flex items-center justify-center gap-2"
            >
              <Home size={16} strokeWidth={2.5} /> {isCompletedRentalRide ? 'Back to Home' : 'Track from Home'}
            </motion.button>
          ) : (
            <div className="pointer-events-auto w-full space-y-3">
              {!isWithinHubRange && !locationError && (
                <div className="bg-orange-50 border border-orange-100 rounded-[14px] px-4 py-2 text-center">
                  <p className="text-[11px] font-black text-orange-600">
                    {distanceToHub !== null 
                      ? `Return to hub to end ride (${Math.round(distanceToHub)}m away)` 
                      : 'Calculating distance to hub...'}
                  </p>
                </div>
              )}
              {locationError && (
                <div className="bg-rose-50 border border-rose-100 rounded-[14px] px-4 py-2 text-center">
                  <p className="text-[11px] font-black text-rose-600">{locationError}</p>
                </div>
              )}
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={handleEndRide}
                disabled={endingRide || !isWithinHubRange}
                className="w-full bg-slate-900 py-4 rounded-[18px] text-[15px] font-black text-white shadow-[0_8px_24px_rgba(15,23,42,0.18)] flex items-center justify-center gap-2 disabled:opacity-50 disabled:grayscale-[0.5]"
              >
                <CheckCircle2 size={16} strokeWidth={2.5} /> {endingRide ? 'Sending end request...' : 'Request End Ride'}
              </motion.button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#F8FAFC_0%,#F3F4F6_38%,#EEF2F7_100%)] max-w-lg mx-auto font-sans pb-28 relative overflow-hidden">
      <div className="absolute -top-16 right-[-40px] h-44 w-44 rounded-full bg-emerald-100/60 blur-3xl pointer-events-none" />

      <div className="px-5 pt-14 space-y-5">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col items-center text-center gap-3 py-6"
        >
          <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center shadow-[0_8px_24px_rgba(16,185,129,0.15)]">
            <CheckCircle2 size={32} className="text-emerald-500" strokeWidth={2} />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500/80">
              Booking Confirmed
            </p>
            <h1 className="text-[22px] font-extrabold text-slate-950 tracking-tight mt-0.5">
              You're all set!
            </h1>
            <p className="text-[12px] font-bold text-slate-400 mt-1">
              Booking ID: <span className="text-slate-700 font-black">{bookingId}</span>
            </p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-[20px] border border-white/80 bg-white/90 shadow-[0_4px_14px_rgba(15,23,42,0.05)] overflow-hidden"
        >
          <div
            className="px-5 py-4 flex items-center gap-4"
            style={{ background: `linear-gradient(135deg, ${vehicle.gradientFrom} 0%, ${vehicle.gradientTo} 100%)` }}
          >
            <img src={vehicle.image} alt={vehicle.name} className="h-16 w-20 object-contain drop-shadow-lg shrink-0" />
            <div>
              <p className="text-[15px] font-black text-slate-900">{vehicle.name}</p>
              <p className="text-[11px] font-bold text-slate-500 mt-0.5">
                {selectedPackage?.label || duration}
              </p>
            </div>
          </div>
          <div className="px-5 py-4 space-y-2.5 border-t border-slate-50">
            <div className="flex items-center gap-2.5">
              <Clock size={13} className="text-slate-400 shrink-0" />
              <div>
                <p className="text-[11px] font-black text-slate-700">
                  Pickup: {pickup?.slice(0, 16).replace('T', ' ')}
                </p>
                <p className="text-[11px] font-bold text-slate-400">
                  Return: {returnTime?.slice(0, 16).replace('T', ' ')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <MapPin size={13} className="text-orange-400 shrink-0" />
              <p className="text-[11px] font-black text-slate-700">
                {serviceLocation?.name || `${appName} Hub`}
              </p>
            </div>
            <div className="border-t border-slate-50 pt-2.5 flex justify-between">
              <div>
                <p className="text-[10px] font-bold text-slate-400">Rental cost (at pickup)</p>
                <p className="text-[15px] font-black text-slate-900">Rs.{totalCost}</p>
                <p className="mt-0.5 text-[10px] font-bold text-slate-400">
                  {bookingPricingSummary.label} - Rs.{Number(bookingPricingSummary.basePrice || 0).toFixed(0)}
                  {bookingPricingSummary.suffix}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold text-slate-400">Advance paid</p>
                <p className="text-[15px] font-black text-emerald-600">Rs.{deposit}</p>
                {paymentMethodLabel ? (
                  <p className="text-[10px] font-bold text-slate-400 mt-0.5">{paymentMethodLabel} via Razorpay</p>
                ) : null}
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="rounded-[20px] border border-white/80 bg-white/90 shadow-[0_4px_14px_rgba(15,23,42,0.05)] px-5 py-4 space-y-3"
        >
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-[9px] bg-orange-50 flex items-center justify-center">
              <Camera size={13} className="text-orange-500" strokeWidth={2.5} />
            </div>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500/80">
              Condition Photo at Pickup
            </p>
          </div>
          <p className="text-[12px] font-bold text-slate-400">
            Capture the vehicle condition before you ride. This protects you during return inspection.
          </p>
          {conditionPhoto ? (
            <div className="relative rounded-[14px] overflow-hidden">
              <img src={URL.createObjectURL(conditionPhoto)} alt="condition" className="w-full h-40 object-cover" />
              <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                <CheckCircle2 size={28} className="text-white" strokeWidth={2} />
              </div>
            </div>
          ) : (
            <button
              onClick={() => inputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-[14px] border-2 border-dashed border-slate-200 text-[12px] font-black text-slate-500 active:bg-slate-50 transition-all"
            >
              <Upload size={14} strokeWidth={2.5} /> Upload Condition Photo
            </button>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => setConditionPhoto(e.target.files?.[0])}
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex items-start gap-3 rounded-[16px] border border-white/80 bg-white/90 px-4 py-3.5 shadow-[0_4px_14px_rgba(15,23,42,0.04)]"
        >
          <div className="w-8 h-8 rounded-[10px] bg-emerald-50 flex items-center justify-center shrink-0">
            <CheckCircle2 size={15} className="text-emerald-500" strokeWidth={2} />
          </div>
          <p className="text-[12px] font-bold text-slate-500 leading-relaxed">
            Your booking advance of Rs.{deposit} has been received. The remaining rental cost is payable at pickup.
          </p>
        </motion.div>
      </div>

      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg px-5 pb-6 pt-3 bg-gradient-to-t from-[#EEF2F7] via-[#F3F4F6]/95 to-transparent pointer-events-none z-30">
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={() => navigate('/taxi/user')}
          className="pointer-events-auto w-full bg-slate-950 py-4 rounded-[18px] text-[15px] font-bold text-white shadow-[0_8px_24px_rgba(15,23,42,0.18)] flex items-center justify-center gap-2"
        >
          <Home size={16} strokeWidth={2} /> Go to Home Dashboard
        </motion.button>
      </div>
    </div>
  );
};

export default RentalConfirmed;
