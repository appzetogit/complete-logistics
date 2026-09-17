import React from 'react';
import { Filter, Search } from 'lucide-react';

const toneClasses = {
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-100',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  amber: 'bg-amber-50 text-amber-700 ring-amber-100',
  rose: 'bg-rose-50 text-rose-700 ring-rose-100',
  cyan: 'bg-cyan-50 text-cyan-700 ring-cyan-100',
  violet: 'bg-violet-50 text-violet-700 ring-violet-100',
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  teal: 'bg-teal-50 text-teal-700 ring-teal-100',
};

const MetricCard = ({ stat }) => (
  <div className="rounded-[24px] border border-gray-100 bg-white p-5 shadow-sm">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gray-400">{stat.label}</p>
        <p className="mt-2 text-3xl font-black tracking-tight text-slate-900">{stat.value}</p>
        {stat.helper && <p className="mt-1 text-[11px] font-bold text-gray-400">{stat.helper}</p>}
      </div>
      <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ring-1 ${toneClasses[stat.tone] || toneClasses.slate}`}>
        {stat.icon}
      </div>
    </div>
    {stat.delta && <p className="mt-4 text-[11px] font-black uppercase tracking-[0.22em] text-emerald-600">{stat.delta}</p>}
  </div>
);

const OperationShell = ({
  eyebrow,
  title,
  description,
  stats = [],
  topActions,
  tabs = [],
  activeTab,
  onTabChange,
  searchValue,
  onSearch,
  listEyebrow,
  listTitle,
  listDescription,
  children,
  rightRail,
}) => {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400">{eyebrow}</p>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">{title}</h1>
          <p className="max-w-3xl text-sm font-medium leading-6 text-gray-500">{description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">{topActions}</div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <MetricCard key={stat.label} stat={stat} />
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.55fr_0.95fr]">
        <section className="overflow-hidden rounded-[28px] border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gray-400">{listEyebrow}</p>
                <h2 className="mt-2 text-xl font-black tracking-tight text-slate-900">{listTitle}</h2>
                {listDescription && <p className="mt-1 text-sm font-medium leading-6 text-gray-500">{listDescription}</p>}
              </div>
              <div className="flex flex-col gap-3 lg:items-end">
                {tabs.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {tabs.map((tab) => (
                      <button
                        key={tab}
                        onClick={() => onTabChange?.(tab)}
                        className={`rounded-full px-4 py-2 text-[11px] font-black uppercase tracking-[0.22em] transition-all ${
                          activeTab === tab
                            ? 'bg-slate-900 text-white shadow-sm'
                            : 'border border-gray-100 bg-gray-50 text-gray-500 hover:bg-gray-100'
                        }`}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
                    <input
                      value={searchValue}
                      onChange={(e) => onSearch?.(e.target.value)}
                      placeholder="Search records"
                      className="h-10 w-full rounded-full border border-gray-100 bg-gray-50 px-10 text-[13px] font-medium text-slate-900 outline-none placeholder:text-gray-400 focus:border-slate-300 lg:w-72"
                    />
                  </div>
                  <button
                    type="button"
                    className="inline-flex h-10 items-center gap-2 rounded-full border border-gray-100 bg-gray-50 px-4 text-[11px] font-black uppercase tracking-[0.22em] text-gray-500 transition-all hover:bg-gray-100"
                  >
                    <Filter size={14} />
                    Filter
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="p-5">{children}</div>
        </section>

        <aside className="space-y-4 xl:sticky xl:top-6 self-start">{rightRail}</aside>
      </div>
    </div>
  );
};

export default OperationShell;
