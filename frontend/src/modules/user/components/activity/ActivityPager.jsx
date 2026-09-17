import React from 'react';

const ActivityPager = ({ pagination, onPrevious, onNext }) => {
  if (pagination.totalPages <= 1) {
    return null;
  }

  return (
    <div className="mt-4 border-t border-slate-200 pt-4">
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <button
          type="button"
          onClick={onPrevious}
          disabled={!pagination.hasPrevPage}
          className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[11px] font-bold tracking-[0.12em] text-slate-700 disabled:cursor-not-allowed disabled:opacity-45"
        >
          Previous
        </button>
        <div className="shrink-0 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[11px] font-bold tracking-[0.12em] text-slate-500">
          Page {pagination.page} / {pagination.totalPages}
        </div>
        <button
          type="button"
          onClick={onNext}
          disabled={!pagination.hasNextPage}
          className="flex-1 rounded-xl border border-slate-900 bg-slate-900 px-4 py-3 text-[11px] font-bold tracking-[0.12em] text-white disabled:cursor-not-allowed disabled:opacity-45"
        >
          Next
        </button>
      </div>
    </div>
  );
};

export default ActivityPager;
