import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useUserTheme } from '../../../../shared/context/UserThemeContext';


const ActivityHeader = ({ helperText, onBack }) => {
  const { theme } = useUserTheme();
  const isDark = theme === 'dark';
  return (
    <header className={`border-b transition-colors duration-300 ${isDark ? 'bg-slate-900 border-slate-800' : 'border-slate-200 bg-white'}`}>
      <div className="flex items-start gap-3 px-5 pb-4 pt-4">
          <button type="button" onClick={onBack} className="rounded-full p-2 -ml-2 transition-all active:scale-95 cursor-pointer">
            <ArrowLeft size={22} className={isDark ? 'text-white' : 'text-slate-900'} strokeWidth={2.6} />
          </button>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold tracking-[0.2em] text-slate-400">My bookings</p>
            <h1 className={`mt-1 truncate text-[20px] font-extrabold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Recent activity
            </h1>
            <p className="mt-1 text-[12px] opacity-60">{helperText}</p>
          </div>
      </div>
    </header>
  );
};

export default ActivityHeader;
