import React from 'react';
import { Bus, CalendarDays, ClipboardList, LayoutDashboard, LogOut } from 'lucide-react';

const NAV_ITEMS = [
  { id: 'overview', label: 'Home', Icon: LayoutDashboard },
  { id: 'schedule', label: 'Schedule', Icon: CalendarDays },
  { id: 'desk', label: 'Desk', Icon: Bus },
  { id: 'bookings', label: 'Bookings', Icon: ClipboardList },
  { id: 'logout', label: 'Logout', Icon: LogOut },
];

const BusDriverBottomNav = ({ activeTab = 'overview', onChangeTab, onLogout }) => (
  <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-100 bg-white/95 px-2 pb-[max(env(safe-area-inset-bottom),8px)] pt-2 backdrop-blur-md shadow-[0_-10px_30px_rgba(0,0,0,0.03)]">
    <div className="mx-auto grid h-[68px] w-full max-w-lg grid-cols-5 items-stretch gap-0.5">
      {NAV_ITEMS.map((item) => {
        const isActive = item.id !== 'logout' && activeTab === item.id;

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => (item.id === 'logout' ? onLogout?.() : onChangeTab?.(item.id))}
            className={`relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-center transition-all duration-300 ${
              isActive
                ? 'bg-slate-50 text-black translate-y-[-1px]'
                : item.id === 'logout'
                  ? 'text-rose-500/85 font-bold'
                  : 'text-black/60 font-bold opacity-80'
            }`}
          >
            <div className={`transition-all duration-300 ${isActive ? 'scale-105' : ''}`}>
              <item.Icon strokeWidth={isActive ? 2.5 : 2} size={20} />
            </div>
            <span
              className={`max-w-full truncate text-[8px] uppercase tracking-[0.04em] transition-all duration-300 ${
                isActive ? 'opacity-100 scale-100 font-black' : 'opacity-80 scale-95 font-bold'
              }`}
            >
              {item.label}
            </span>
            {isActive ? <div className="absolute -top-2 h-[2px] w-7 rounded-full bg-slate-900" /> : null}
          </button>
        );
      })}
    </div>
  </nav>
);

export default BusDriverBottomNav;
