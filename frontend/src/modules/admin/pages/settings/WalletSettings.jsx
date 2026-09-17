import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronRight,
  Loader2,
  Save,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../../shared/api/axiosInstance';

const AMOUNT_FIELDS = [
  {
    name: 'driver_wallet_minimum_amount_to_get_an_order',
    label: 'Driver minimum balance to get orders',
    help: 'Driver app blocks new orders when wallet balance is below this amount. Use a negative value to allow cash debt.',
    placeholder: '-500',
  },
  {
    name: 'minimum_amount_added_to_wallet',
    label: 'Minimum driver top-up amount',
    help: 'Driver cannot add less than this amount from the wallet page.',
    placeholder: '500',
  },
  {
    name: 'minimum_wallet_amount_for_transfer',
    label: 'Minimum transfer amount',
    help: 'Shown to drivers as the minimum amount for wallet transfers.',
    placeholder: '100',
  },
  {
    name: 'owner_wallet_minimum_amount_to_get_an_order',
    label: 'Owner minimum balance to get orders',
    help: 'Kept here for owner wallet rules.',
    placeholder: '-500',
  },
];

const SWITCH_FIELDS = [
  {
    name: 'show_wallet_feature_for_driver',
    label: 'Driver wallet enabled',
    help: 'Controls whether the driver wallet can be used.',
  },
  {
    name: 'enable_wallet_transfer_driver',
    label: 'Driver wallet transfer enabled',
    help: 'Controls the transfer status shown in driver wallet.',
  },
  {
    name: 'show_wallet_feature_for_owner',
    label: 'Owner wallet enabled',
    help: 'Keeps owner wallet visibility controlled from here too.',
  },
  {
    name: 'enable_wallet_transfer_owner',
    label: 'Owner wallet transfer enabled',
    help: 'Controls owner wallet transfer availability.',
  },
  {
    name: 'show_wallet_feature_on_mobile_app',
    label: 'Wallet feature on mobile app',
    help: 'Master mobile visibility flag for wallet features.',
  },
];

const isEnabled = (value) => ['1', 'true', 'yes', 'on'].includes(String(value ?? '1').trim().toLowerCase());

const Stat = ({ label, value, tone = 'gray' }) => {
  const toneClass = tone === 'green' ? 'text-green-700 bg-green-50' : 'text-gray-900 bg-gray-100';

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4">
      <p className="text-xs font-semibold text-gray-500">{label}</p>
      <p className={`mt-2 inline-flex rounded-full px-3 py-1 text-sm font-bold ${toneClass}`}>{value}</p>
    </div>
  );
};

const AmountField = ({ field, value, onChange }) => (
  <label className="block rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
    <span className="text-sm font-bold text-gray-900">{field.label}</span>
    <span className="mt-1 block text-xs font-medium leading-relaxed text-gray-500">{field.help}</span>
    <input
      type="number"
      name={field.name}
      value={value ?? ''}
      onChange={(event) => onChange(field.name, event.target.value)}
      placeholder={field.placeholder}
      className="mt-4 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-900 outline-none transition focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 focus:bg-white"
    />
  </label>
);

const SwitchField = ({ field, checked, onToggle }) => (
  <button
    type="button"
    onClick={() => onToggle(field.name)}
    className="flex w-full items-center justify-between gap-4 rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-sm hover:bg-gray-50 transition-colors"
  >
    <span>
      <span className="block text-sm font-bold text-gray-900">{field.label}</span>
      <span className="mt-1 block text-xs font-medium leading-relaxed text-gray-500">{field.help}</span>
    </span>
    <span className={`relative flex items-center h-7 w-12 shrink-0 rounded-full p-1 transition-colors ${checked ? 'bg-yellow-400' : 'bg-gray-300'}`}>
      <span className={`h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
    </span>
  </button>
);

const WalletSettings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({});

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/general-settings/wallet');
      setSettings(res.data?.settings || res.settings || {});
    } catch (err) {
      console.error('Fetch error:', err);
      toast.error('Failed to load wallet settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const preview = useMemo(() => {
    const driverMinimum = Number(settings.driver_wallet_minimum_amount_to_get_an_order || 0);
    const sampleBalance = -47.55;

    return {
      driverMinimum,
      sampleBalance,
      canReceiveOrders: isEnabled(settings.show_wallet_feature_for_driver) && sampleBalance >= driverMinimum,
    };
  }, [settings]);

  const handleUpdate = async () => {
    try {
      setSaving(true);
      const response = await api.patch('/admin/general-settings/wallet', { settings });
      setSettings(response.data?.settings || response.settings || settings);
      toast.success('Wallet settings saved');
    } catch (err) {
      toast.error('Failed to save wallet settings');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (name, value) => {
    setSettings((prev) => ({ ...prev, [name]: value }));
  };

  const handleToggle = (name) => {
    setSettings((prev) => ({ ...prev, [name]: isEnabled(prev[name]) ? '0' : '1' }));
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-10 w-10 animate-spin text-gray-900" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-4 lg:p-6 font-sans">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-2">
            <span>App Settings</span>
            <ChevronRight size={14} />
            <span className="text-gray-900">Wallet Settings</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Wallet Settings</h1>
        </div>
        <button
          onClick={handleUpdate}
          disabled={saving}
          className="flex h-11 w-full lg:w-auto min-w-[120px] items-center justify-center gap-2 rounded-lg bg-yellow-400 px-6 text-sm font-bold text-black shadow-sm transition-colors hover:bg-yellow-500 disabled:opacity-60"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.25fr_0.75fr] pb-10">
        <section className="space-y-6">
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-gray-900">
                <Wallet size={20} />
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900">Amounts</h2>
                <p className="text-xs text-gray-500">These numbers directly control driver wallet behavior.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {AMOUNT_FIELDS.map((field) => (
                <AmountField key={field.name} field={field} value={settings[field.name]} onChange={handleChange} />
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-green-600">
                <ShieldCheck size={20} />
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900">Feature Controls</h2>
                <p className="text-xs text-gray-500">Switch wallet features on or off without touching code.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {SWITCH_FIELDS.map((field) => (
                <SwitchField key={field.name} field={field} checked={isEnabled(settings[field.name])} onToggle={handleToggle} />
              ))}
            </div>
          </div>
        </section>

        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <p className="text-sm font-bold text-gray-900">Driver Preview</p>
            <div className="mt-4 rounded-2xl bg-yellow-50 p-5 text-gray-900 border border-yellow-100">
              <p className="text-xs font-semibold text-gray-600">Sample Wallet Balance</p>
              <h3 className="mt-2 text-3xl font-black">₹{preview.sampleBalance.toFixed(2)}</h3>
              <p className={`mt-4 inline-flex rounded-full px-3 py-1 text-xs font-bold ${preview.canReceiveOrders ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {preview.canReceiveOrders ? 'Ready for orders' : 'Top up to receive orders'}
              </p>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3">
              <Stat label="Driver Order Minimum" value={`₹${preview.driverMinimum.toFixed(2)}`} tone="green" />
              <Stat label="Driver Wallet" value={isEnabled(settings.show_wallet_feature_for_driver) ? 'Enabled' : 'Disabled'} />
              <Stat label="Driver Transfer" value={isEnabled(settings.enable_wallet_transfer_driver) ? 'Enabled' : 'Disabled'} />
            </div>
          </div>

          <div className="rounded-2xl border border-yellow-100 bg-yellow-50/50 p-5">
            <p className="text-sm font-bold text-yellow-900">How driver control works</p>
            <p className="mt-2 text-xs font-medium leading-relaxed text-yellow-800">
              The driver wallet page reads these settings from the backend. Top-up minimum is enforced by the API, and order eligibility uses the driver minimum balance.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WalletSettings;
