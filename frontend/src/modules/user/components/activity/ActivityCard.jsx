import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Calendar, ChevronRight, Clock } from 'lucide-react';
import { buildAvatarFallback } from './activityHelpers';

const ActivityCard = ({ type, title, address, date, time, status, statusTone, price, onClick, driverName, driverImage, vehicleImage, eyebrow }) => {
  const [vehicleBroken, setVehicleBroken] = useState(false);
  const [driverBroken, setDriverBroken] = useState(false);
  const resolvedVehicleImage = vehicleBroken ? (type === 'parcel' ? '/5_Parcel.png' : '/1_Bike.png') : vehicleImage;
  const resolvedDriverImage = driverBroken ? buildAvatarFallback(driverName) : driverImage;
  const vehicleAlt = type === 'parcel' ? 'Parcel' : type === 'bus' ? 'Bus' : type === 'pooling' ? 'Pooling vehicle' : 'Vehicle';

  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="w-full cursor-pointer rounded-2xl border border-slate-200 bg-white p-3.5 text-left shadow-sm transition-colors hover:border-slate-300 active:translate-y-0 sm:p-4"
    >
      <div className="flex items-start gap-3 sm:gap-4">
        <div className="relative h-[64px] w-[64px] shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 sm:h-[72px] sm:w-[72px]">
          <img
            src={resolvedVehicleImage}
            alt={vehicleAlt}
            className="h-full w-full object-cover"
            draggable={false}
            onError={() => setVehicleBroken(true)}
          />
          <div className="absolute bottom-1.5 right-1.5 h-7 w-7 overflow-hidden rounded-full border-2 border-white bg-white">
            <img
              src={resolvedDriverImage}
              alt={driverName}
              className="h-full w-full object-cover"
              draggable={false}
              onError={() => setDriverBroken(true)}
            />
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2 sm:gap-3">
            <div className="min-w-0 flex-1">
              <h4 className="line-clamp-2 break-words text-[14px] font-semibold leading-tight text-slate-900 sm:text-[15px]">{title}</h4>
              <p className="mt-1 line-clamp-2 break-words text-[10px] font-semibold tracking-[0.12em] text-slate-400 sm:text-[11px]">
                {eyebrow || driverName}
              </p>
              <p className="mt-2 line-clamp-2 text-[12px] text-slate-600">{address}</p>
            </div>
            <span className="shrink-0 whitespace-nowrap pl-1 text-[13px] font-semibold text-slate-900 sm:text-[14px]">Rs {price}</span>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-1 text-[10px] font-semibold leading-none text-slate-400">
              <Calendar size={11} strokeWidth={2.4} />
              <span>{date}</span>
            </div>
            <div className="flex items-center gap-1 text-[10px] font-semibold leading-none text-slate-400">
              <Clock size={11} strokeWidth={2.4} />
              <span>{time}</span>
            </div>
            <span
              className={`rounded-full border px-2 py-1 text-[9px] font-semibold leading-none sm:ml-auto ${
                statusTone === 'success'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                  : statusTone === 'danger'
                    ? 'bg-rose-50 text-rose-700 border-rose-100'
                    : 'bg-amber-50 text-amber-700 border-amber-100'
              }`}
            >
              {String(status || '').charAt(0).toUpperCase() + String(status || '').slice(1).toLowerCase()}
            </span>
          </div>
        </div>

        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-300">
          <ChevronRight size={16} strokeWidth={2.4} />
        </div>
      </div>
    </motion.button>
  );
};

export default ActivityCard;
