import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Armchair,
  BusFront,
  CalendarDays,
  ChevronRight,
  Clock3,
  Images,
  MapPin,
  Phone,
  ShieldCheck,
  Ticket,
} from 'lucide-react';
import { buildBusRouteState } from './busNavigationState';

const getRoutePrefix = (pathname = '') => (pathname.startsWith('/taxi/user') ? '/taxi/user' : '');

const getDisplayRoute = (bus, fallbackFromCity = '', fallbackToCity = '') => ({
  fromCity: bus?.route?.originCity || bus?.fromCity || fallbackFromCity,
  toCity: bus?.route?.destinationCity || bus?.toCity || fallbackToCity,
  routeName: bus?.route?.routeName || bus?.routeName || '',
});

const formatTravelDate = (dateStr) => {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return dateStr;
  }
};

const formatDurationBrief = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return 'Direct';
  return raw
    .replace(/days?/gi, 'd')
    .replace(/hours?/gi, 'h')
    .replace(/hrs?/gi, 'h')
    .replace(/minutes?/gi, 'm')
    .replace(/mins?/gi, 'm')
    .replace(/\s+/g, ' ')
    .trim();
};

const stopBadgeTone = {
  pickup: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  drop: 'border-rose-200 bg-rose-50 text-rose-700',
  both: 'border-indigo-200 bg-indigo-50 text-indigo-700',
};

const BusPreview = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const routePrefix = useMemo(() => getRoutePrefix(location.pathname), [location.pathname]);
  const state = location.state || {};
  const { bus, fromCity, toCity, date } = state;
  const [activeImage, setActiveImage] = useState(bus?.coverImage || bus?.image || bus?.galleryImages?.[0] || '');

  if (!bus?.busServiceId || !bus?.scheduleId) {
    navigate(`${routePrefix}/bus`, { replace: true });
    return null;
  }

  const gallery = [
    bus?.coverImage || bus?.image || '',
    ...(Array.isArray(bus?.galleryImages) ? bus.galleryImages : []),
  ].filter(Boolean).filter((image, index, list) => list.indexOf(image) === index);
  const routeStops = Array.isArray(bus?.route?.stops) ? bus.route.stops : [];
  const displayRoute = getDisplayRoute(bus, fromCity, toCity);

  useEffect(() => {
    setActiveImage(bus?.coverImage || bus?.image || bus?.galleryImages?.[0] || '');
  }, [bus?.coverImage, bus?.galleryImages, bus?.image]);

  return (
    <div className="min-h-screen max-w-lg mx-auto bg-[linear-gradient(180deg,#fff7ed_0%,#ffffff_18%,#f8fafc_100%)] font-sans pb-28">
      <header className="sticky top-0 z-20 border-b border-white/80 bg-white/90 px-5 pb-4 pt-10 shadow-[0_4px_20px_rgba(15,23,42,0.05)] backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm"
          >
            <ArrowLeft size={18} className="text-slate-900" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-black text-slate-900">{bus.operator || 'Bus Details'}</h1>
            <p className="mt-0.5 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
              {displayRoute.fromCity} to {displayRoute.toCity} • {formatTravelDate(date)}
            </p>
          </div>
        </div>
      </header>

      <div className="space-y-5 px-5 pt-5">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="overflow-hidden rounded-[30px] border border-white/80 bg-white/95 shadow-[0_8px_24px_rgba(15,23,42,0.06)]"
        >
          <div className="relative h-56 bg-slate-900">
            {activeImage ? (
              <img src={activeImage} alt={bus.busName || bus.operator || 'Bus'} className="h-full w-full object-cover" />
            ) : (
              <div
                className="flex h-full w-full items-center justify-center"
                style={{ backgroundColor: bus.busColor || '#0f172a' }}
              >
                <BusFront size={70} className="text-white/90" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-slate-900/20 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
              <div className="flex items-end justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/70">{bus.busName || 'Coach Service'}</p>
                  <h2 className="mt-1 truncate text-[22px] font-black">{bus.operator}</h2>
                  <p className="mt-1 text-sm font-semibold text-white/75">{bus.type} • {displayRoute.routeName || 'Direct route'}</p>
                </div>
                <div className="rounded-2xl bg-white/12 px-4 py-3 text-right backdrop-blur-sm">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/70">Starts at</p>
                  <p className="mt-1 text-2xl font-black">Rs {Number(bus.price || 0)}</p>
                </div>
              </div>
            </div>
          </div>

          {gallery.length > 1 ? (
            <div className="border-t border-slate-100 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Images size={14} className="text-slate-400" />
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Gallery</p>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-1">
                {gallery.map((image, index) => (
                  <button
                    key={`${image}-${index}`}
                    type="button"
                    onClick={() => setActiveImage(image)}
                    className={`overflow-hidden rounded-2xl border-2 ${activeImage === image ? 'border-orange-400' : 'border-transparent'}`}
                  >
                    <img src={image} alt={`${bus.operator} ${index + 1}`} className="h-20 w-28 object-cover" />
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </motion.div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-[22px] border border-slate-100 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Departure</p>
            <p className="mt-2 text-lg font-black text-slate-900">{bus.departure || 'NA'}</p>
          </div>
          <div className="rounded-[22px] border border-slate-100 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Arrival</p>
            <p className="mt-2 text-lg font-black text-slate-900">{bus.arrival || 'NA'}</p>
          </div>
          <div className="rounded-[22px] border border-slate-100 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Seats Left</p>
            <p className="mt-2 text-lg font-black text-emerald-600">{bus.availableSeats || 0}</p>
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Journey Summary</p>
              <h3 className="mt-1 text-lg font-black text-slate-900">{displayRoute.fromCity} to {displayRoute.toCity}</h3>
            </div>
            <div className="rounded-full bg-orange-50 px-3 py-2 text-[11px] font-black text-orange-600">
              {formatDurationBrief(bus.duration)}
            </div>
          </div>

          <div className="mt-5 grid gap-3">
            <div className="flex items-center justify-between rounded-[20px] border border-slate-100 bg-slate-50 px-4 py-3">
              <div className="flex items-center gap-2">
                <CalendarDays size={14} className="text-slate-400" />
                <span className="text-sm font-bold text-slate-700">{formatTravelDate(date)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                <Clock3 size={14} className="text-slate-400" />
                {bus.departure} to {bus.arrival}
              </div>
            </div>
            <div className="flex items-center justify-between rounded-[20px] border border-slate-100 bg-slate-50 px-4 py-3">
              <div className="flex items-center gap-2">
                <Armchair size={14} className="text-slate-400" />
                <span className="text-sm font-bold text-slate-700">{bus.type}</span>
              </div>
              <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                <Ticket size={14} className="text-slate-400" />
                Rs {Number(bus.price || 0)} per seat
              </div>
            </div>
            {(bus.driverName || bus.driverPhone) ? (
              <div className="flex items-center justify-between rounded-[20px] border border-slate-100 bg-slate-50 px-4 py-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Bus Staff</p>
                  <p className="mt-1 text-sm font-black text-slate-900">{bus.driverName || 'Assigned crew'}</p>
                </div>
                {bus.driverPhone ? (
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                    <Phone size={14} className="text-slate-400" />
                    {bus.driverPhone}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Stops & Boarding Points</p>
          <div className="mt-4 space-y-3">
            {routeStops.length > 0 ? routeStops.map((stop, index) => (
              <div key={stop.id || `${bus.id}-stop-${index}`} className="rounded-[22px] border border-slate-100 bg-slate-50/80 px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <MapPin size={14} className="text-orange-500" />
                      <p className="truncate text-sm font-black text-slate-900">{stop.city || stop.pointName || `Stop ${index + 1}`}</p>
                    </div>
                    <p className="mt-1 truncate text-[12px] font-semibold text-slate-500">{stop.pointName || 'Point not set'}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className={`inline-flex rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-wider ${stopBadgeTone[stop.stopType] || stopBadgeTone.both}`}>
                      {stop.stopType === 'both' ? 'BP + DP' : stop.stopType === 'drop' ? 'DP' : 'BP'}
                    </span>
                    <p className="mt-1 text-[11px] font-bold text-slate-500">{stop.arrivalTime || stop.departureTime || '--:--'}</p>
                  </div>
                </div>
              </div>
            )) : (
              <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm font-semibold text-slate-500">
                No stop details added for this bus yet.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-emerald-500" />
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Policies & Comfort</p>
          </div>

          {Array.isArray(bus.amenities) && bus.amenities.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {bus.amenities.map((amenity) => (
                <span key={amenity} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-black text-slate-700">
                  {amenity}
                </span>
              ))}
            </div>
          ) : null}

          <div className="mt-4 space-y-3">
            {bus.boardingPolicy ? (
              <div className="rounded-[20px] border border-slate-100 bg-slate-50 px-4 py-4">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Boarding Policy</p>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{bus.boardingPolicy}</p>
              </div>
            ) : null}
            {bus.cancellationPolicy ? (
              <div className="rounded-[20px] border border-slate-100 bg-slate-50 px-4 py-4">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Cancellation Policy</p>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{bus.cancellationPolicy}</p>
              </div>
            ) : null}
            {bus.luggagePolicy ? (
              <div className="rounded-[20px] border border-slate-100 bg-slate-50 px-4 py-4">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Luggage Policy</p>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{bus.luggagePolicy}</p>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-1/2 z-30 w-full max-w-lg -translate-x-1/2 border-t border-slate-100 bg-white/95 px-5 pb-8 pt-4 backdrop-blur-md">
        <button
          type="button"
          onClick={() => navigate(`${routePrefix}/bus/seats`, { state: buildBusRouteState(state) })}
          className="flex w-full items-center justify-center gap-2 rounded-[20px] bg-slate-900 py-4 text-base font-black text-white shadow-lg"
        >
          Select Seats <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
};

export default BusPreview;
