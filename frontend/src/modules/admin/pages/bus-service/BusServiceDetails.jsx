import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Bus, CalendarDays, Clock3, MapPin, Pencil } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { countTotalSeats, getAdminBuses } from '../../services/busService';

const statusTone = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  draft: 'bg-amber-50 text-amber-700 border-amber-200',
  paused: 'bg-slate-100 text-slate-600 border-slate-200',
};

const stopTypeTone = {
  pickup: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  drop: 'bg-rose-50 text-rose-700 border-rose-200',
  both: 'bg-indigo-50 text-indigo-700 border-indigo-200',
};

const BusServiceDetails = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [catalog, setCatalog] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const loadCatalog = async () => {
      setIsLoading(true);
      try {
        const buses = await getAdminBuses();
        if (!active) return;
        setCatalog(buses);
      } catch (error) {
        if (!active) return;
        toast.error(error?.message || 'Failed to load bus details');
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    loadCatalog();

    return () => {
      active = false;
    };
  }, []);

  const bus = useMemo(
    () => catalog.find((item) => String(item.id) === String(id)) || null,
    [catalog, id],
  );
  const stops = bus?.route?.stops || [];
  const returnStops = bus?.returnRoute?.stops || [];
  const pickupStops = stops.filter((stop) => stop.stopType === 'pickup' || stop.stopType === 'both');
  const dropStops = stops.filter((stop) => stop.stopType === 'drop' || stop.stopType === 'both');

  if (isLoading) {
    return (
      <div className="rounded-[32px] border border-slate-100 bg-white p-10 text-center text-sm font-bold text-slate-400 shadow-sm">
        Loading bus details...
      </div>
    );
  }

  if (!bus) {
    return (
      <div className="space-y-4 rounded-[32px] border border-slate-100 bg-white p-10 shadow-sm">
        <p className="text-lg font-black text-slate-900">Bus not found</p>
        <p className="text-sm font-semibold text-slate-500">This bus service may have been removed or the link is invalid.</p>
        <button
          type="button"
          onClick={() => navigate('/admin/bus-service')}
          className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-black text-white"
        >
          <ArrowLeft size={16} />
          Back To List
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="rounded-3xl bg-slate-900 p-8 text-white shadow-xl shadow-slate-200">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-300">
              <Bus size={14} />
              Bus Service Details
            </div>
            <h1 className="text-3xl font-black tracking-tight">{bus.busName || 'Untitled Bus'}</h1>
            <p className="mt-3 text-sm font-semibold text-slate-300">
              {bus.operatorName || 'Operator'} | {bus.serviceNumber || 'No service number'} | {bus.registrationNumber || 'No registration'}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => navigate('/admin/bus-service')}
              className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-900 shadow-lg transition hover:-translate-y-0.5"
            >
              <ArrowLeft size={16} />
              Back To List
            </button>
            <button
              type="button"
              onClick={() => navigate(`/admin/bus-service/edit/${bus.id}`)}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-black text-white transition hover:bg-white/15"
            >
              <Pencil size={16} />
              Edit Bus
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="space-y-6">
          {(bus.coverImage || (bus.galleryImages || []).length > 0) ? (
            <div className="rounded-[32px] border border-slate-100 bg-white p-8 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Bus Media</p>
              {bus.coverImage ? (
                <div className="mt-5 overflow-hidden rounded-[24px] bg-slate-50">
                  <img src={bus.coverImage} alt={bus.busName || 'Bus cover'} className="h-[320px] w-full object-cover" />
                </div>
              ) : null}

              {(bus.galleryImages || []).length > 0 ? (
                <div className="mt-5 grid gap-4 md:grid-cols-3">
                  {bus.galleryImages.map((image, index) => (
                    <div key={`${bus.id}-gallery-${index}`} className="overflow-hidden rounded-[22px] bg-slate-50">
                      <img src={image} alt={`${bus.busName || 'Bus'} gallery ${index + 1}`} className="h-40 w-full object-cover" />
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="rounded-[32px] border border-slate-100 bg-white p-8 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Route Overview</p>
            <h2 className="mt-3 text-2xl font-black text-slate-900">
              {bus.route?.originCity || 'Origin'} to {bus.route?.destinationCity || 'Destination'}
            </h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">{bus.route?.routeName || 'Route name not configured'}</p>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Distance</p>
                <p className="mt-2 text-base font-black text-slate-900">{bus.route?.distanceKm || 'N/A'}</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Duration</p>
                <p className="mt-2 text-base font-black text-slate-900">{bus.route?.durationHours || 'N/A'}</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Stops</p>
                <p className="mt-2 text-base font-black text-slate-900">{bus.route?.stops?.length || 0}</p>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {(bus.route?.stops || []).map((stop, index) => (
                <div key={stop.id || `${bus.id}-stop-${index}`} className="rounded-[24px] border border-slate-100 bg-slate-50/60 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-indigo-600 shadow-sm">
                        <MapPin size={16} />
                      </div>
                      <div>
                        <p className="text-sm font-black text-slate-900">{stop.city || 'City not set'}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">{stop.pointName || 'Point not set'}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{stop.stopType || 'stop'}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">{stop.arrivalTime || '--:--'} | {stop.departureTime || '--:--'}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {bus.returnRouteEnabled ? (
              <div className="mt-8 rounded-[28px] border border-emerald-100 bg-emerald-50/70 p-6">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-600">Return Route</p>
                <h3 className="mt-3 text-xl font-black text-slate-900">
                  {bus.returnRoute?.originCity || 'Destination'} to {bus.returnRoute?.destinationCity || 'Origin'}
                </h3>
                <p className="mt-1 text-sm font-semibold text-slate-600">
                  {bus.returnRoute?.routeName || 'Return path generated from the main route'}
                </p>

                <div className="mt-5 grid gap-4 md:grid-cols-3">
                  <div className="rounded-2xl border border-emerald-100 bg-white/90 p-4">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Distance</p>
                    <p className="mt-2 text-base font-black text-slate-900">{bus.returnRoute?.distanceKm || 'N/A'}</p>
                  </div>
                  <div className="rounded-2xl border border-emerald-100 bg-white/90 p-4">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Duration</p>
                    <p className="mt-2 text-base font-black text-slate-900">{bus.returnRoute?.durationHours || 'N/A'}</p>
                  </div>
                  <div className="rounded-2xl border border-emerald-100 bg-white/90 p-4">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Stops</p>
                    <p className="mt-2 text-base font-black text-slate-900">{returnStops.length}</p>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-[32px] border border-slate-100 bg-white p-8 shadow-sm lg:col-span-2">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Stops & DP Points</p>
              <div className="mt-5 grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total Stops</p>
                  <p className="mt-2 text-base font-black text-slate-900">{stops.length}</p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Boarding Points</p>
                  <p className="mt-2 text-base font-black text-slate-900">{pickupStops.length}</p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Dropping Points</p>
                  <p className="mt-2 text-base font-black text-slate-900">{dropStops.length}</p>
                </div>
              </div>

              <div className="mt-6 grid gap-5 lg:grid-cols-2">
                <div className="space-y-3">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Boarding Stops</p>
                  {pickupStops.length > 0 ? (
                    pickupStops.map((stop, index) => (
                      <div key={stop.id || `pickup-${index}`} className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-black text-slate-900">{stop.city || 'City not set'}</p>
                            <p className="mt-1 text-xs font-semibold text-slate-500">{stop.pointName || 'Point not set'}</p>
                          </div>
                          <span className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-wider ${stopTypeTone[stop.stopType] || stopTypeTone.both}`}>
                            {stop.stopType === 'both' ? 'BP + DP' : 'BP'}
                          </span>
                        </div>
                        <p className="mt-3 text-[11px] font-semibold text-slate-500">
                          {stop.arrivalTime || '--:--'} | {stop.departureTime || '--:--'}
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm font-semibold text-slate-500">
                      No boarding stops configured.
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Dropping Stops</p>
                  {dropStops.length > 0 ? (
                    dropStops.map((stop, index) => (
                      <div key={stop.id || `drop-${index}`} className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-black text-slate-900">{stop.city || 'City not set'}</p>
                            <p className="mt-1 text-xs font-semibold text-slate-500">{stop.pointName || 'Point not set'}</p>
                          </div>
                          <span className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-wider ${stopTypeTone[stop.stopType] || stopTypeTone.both}`}>
                            {stop.stopType === 'both' ? 'BP + DP' : 'DP'}
                          </span>
                        </div>
                        <p className="mt-3 text-[11px] font-semibold text-slate-500">
                          {stop.arrivalTime || '--:--'} | {stop.departureTime || '--:--'}
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm font-semibold text-slate-500">
                      No dropping stops configured.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-[32px] border border-slate-100 bg-white p-8 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Policies</p>
              <div className="mt-5 space-y-5">
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-slate-500">Boarding</p>
                  <p className="mt-2 text-sm font-semibold text-slate-700">{bus.boardingPolicy || 'Not set'}</p>
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-slate-500">Cancellation</p>
                  <p className="mt-2 text-sm font-semibold text-slate-700">{bus.cancellationPolicy || 'Not set'}</p>
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-slate-500">Luggage</p>
                  <p className="mt-2 text-sm font-semibold text-slate-700">{bus.luggagePolicy || 'Not set'}</p>
                </div>
              </div>
            </div>

            <div className="rounded-[32px] border border-slate-100 bg-white p-8 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Amenities</p>
              <div className="mt-5 flex flex-wrap gap-2">
                {(bus.amenities || []).length > 0 ? (
                  bus.amenities.map((amenity) => (
                    <span key={amenity} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-black text-slate-700">
                      {amenity}
                    </span>
                  ))
                ) : (
                  <p className="text-sm font-semibold text-slate-500">No amenities configured.</p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[32px] border border-slate-200 bg-slate-900 p-8 text-white shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Coach Summary</p>
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-1">
              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Coach Type</p>
                <p className="mt-2 text-base font-black">{bus.coachType || 'N/A'}</p>
              </div>
              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Category</p>
                <p className="mt-2 text-base font-black">{bus.busCategory || 'N/A'}</p>
              </div>
              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Seat Capacity</p>
                <p className="mt-2 text-base font-black">{countTotalSeats(bus.blueprint)}</p>
              </div>
              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Fare</p>
                <p className="mt-2 text-base font-black">Rs {bus.seatPrice || 0} {bus.fareCurrency || 'INR'}</p>
              </div>
            </div>
          </div>

          <div className="rounded-[32px] border border-slate-100 bg-white p-8 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Driver Assignment</p>
            <div className="mt-5 space-y-3">
              <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Driver Name</p>
                <p className="mt-2 text-base font-black text-slate-900">{bus.driverName || 'Not assigned'}</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Driver Phone</p>
                <p className="mt-2 text-base font-black text-slate-900">{bus.driverPhone || 'Not assigned'}</p>
              </div>
            </div>
          </div>

          <div className="rounded-[32px] border border-slate-100 bg-white p-8 shadow-sm">
            <div className="flex items-center gap-2">
              <CalendarDays size={16} className="text-slate-400" />
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Schedules</p>
            </div>
            <div className="mt-5 space-y-3">
              {(bus.schedules || []).map((schedule, index) => (
                <div key={schedule.id || `${bus.id}-schedule-${index}`} className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-slate-900">{schedule.label || `Schedule ${index + 1}`}</p>
                      <p className="mt-1 inline-flex items-center gap-2 text-xs font-semibold text-slate-500">
                        <Clock3 size={13} />
                        {schedule.departureTime || '--:--'} to {schedule.arrivalTime || '--:--'}
                      </p>
                    </div>
                    <span className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-wider ${statusTone[schedule.status] || statusTone.draft}`}>
                      {schedule.status || 'draft'}
                    </span>
                  </div>
                  <p className="mt-3 text-[11px] font-semibold text-slate-500">{(schedule.activeDays || []).join(', ') || 'No active days'}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[32px] border border-slate-100 bg-white p-8 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Cancellation Slabs</p>
            <div className="mt-5 space-y-3">
              {(bus.cancellationRules || []).length > 0 ? (
                bus.cancellationRules.map((rule, index) => (
                  <div key={rule.id || `${bus.id}-cancel-${index}`} className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-slate-900">{rule.label || `Slab ${index + 1}`}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">{rule.hoursBeforeDeparture ?? 0} hours before departure</p>
                      </div>
                      <p className="text-xs font-black uppercase tracking-wider text-slate-500">
                        {rule.refundType === 'percentage'
                          ? `${rule.refundValue ?? 0}% refund`
                          : rule.refundType === 'fixed'
                            ? `Rs ${rule.refundValue ?? 0} refund`
                            : 'No refund'}
                      </p>
                    </div>
                    <p className="mt-3 text-[11px] font-semibold text-slate-500">{rule.notes || 'No extra notes.'}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm font-semibold text-slate-500">No hourly cancellation slabs configured.</p>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default BusServiceDetails;
