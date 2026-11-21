import React, { useEffect, useState } from 'react';
import { MapPinned } from 'lucide-react';
import { adminService } from '../services/adminService';

const STORAGE_KEY = 'adminSelectedState';

const readSelected = () => {
  try {
    return window.localStorage.getItem(STORAGE_KEY) || '';
  } catch {
    return '';
  }
};

/**
 * State-wise view: pick one state (or all) and every admin screen shows only that state's data. The choice is sent
 * with each admin request (x-admin-state, see shared/api/axiosInstance.js). An admin limited to a single state has
 * nothing to choose, so only a label is shown.
 */
const StateSelector = () => {
  const [states, setStates] = useState([]);
  const [selected, setSelected] = useState(readSelected);

  useEffect(() => {
    let cancelled = false;
    adminService
      .getStates()
      .then((response) => {
        if (cancelled) return;
        const list = Array.isArray(response?.data) ? response.data : response?.data?.results || [];
        const active = list.filter((item) => item.active !== false);
        setStates(active);
        // a remembered choice that is no longer allowed is dropped
        const stored = readSelected();
        if (stored && !active.some((item) => String(item._id || item.id) === stored)) {
          try {
            window.localStorage.removeItem(STORAGE_KEY);
          } catch {
            // ignore
          }
          setSelected('');
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (states.length === 0) return null;

  if (states.length === 1) {
    return (
      <div className="hidden h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-700 sm:flex">
        <MapPinned size={13} />
        {states[0].name}
      </div>
    );
  }

  const handleChange = (event) => {
    const value = event.target.value;
    try {
      if (value) window.localStorage.setItem(STORAGE_KEY, value);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setSelected(value);
    // every screen reloads its data for the chosen state
    window.location.reload();
  };

  return (
    <label className="hidden h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-700 transition-all hover:border-slate-300 hover:bg-slate-50 sm:flex">
      <MapPinned size={13} />
      <select
        value={selected}
        onChange={handleChange}
        className="cursor-pointer bg-transparent text-[13px] font-medium text-slate-700 outline-none"
        aria-label="State"
      >
        <option value="">All states</option>
        {states.map((state) => (
          <option key={state._id || state.id} value={String(state._id || state.id)}>
            {state.name}
          </option>
        ))}
      </select>
    </label>
  );
};

export default StateSelector;
