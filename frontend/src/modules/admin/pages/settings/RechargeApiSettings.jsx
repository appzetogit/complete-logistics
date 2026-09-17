import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  ChevronRight,
  Copy,
  FileCode2,
  Globe,
  KeyRound,
  Loader2,
  Network,
  PlayCircle,
  RefreshCw,
  Save,
  ShieldCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { adminService } from '../../services/adminService';

const TABS = [
  { id: 'token', label: 'Setup API Token', icon: KeyRound },
  { id: 'callback', label: 'Setup Callback URL', icon: Globe },
  { id: 'ip', label: 'Setup IP Address', icon: Network },
  { id: 'testing', label: 'API Testing', icon: PlayCircle },
  { id: 'docs', label: 'API Doc', icon: BookOpen },
];

const unwrapPayload = (response) => response?.data?.data || response?.data || {};

const RechargeApiSettings = () => {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [testing, setTesting] = useState(false);
  const [activeTab, setActiveTab] = useState('token');
  const [settings, setSettings] = useState({
    enabled: '0',
    provider_name: 'RechargeKit Verify',
    base_url: 'https://verify.rechargkit.biz',
    auth_header_name: 'Authorization',
    auth_header_prefix: 'Bearer',
    api_token: '',
    token_generated_at: null,
    callback_mode: 'auto',
    callback_url: '',
    callback_secret: '',
    allowed_ip_addresses: [],
    notes: '',
    endpoints: {
      bank_verify_penny_less: '/validation/verifyBankRequest',
      bank_verify_penny_drop: '/validation/penny-drop',
      bank_verify_v3: '/validation/v3/pennyDropVerify',
      dl_request: '/validation/driverLicenseRequest',
      dl_verify: '/validation/verifyLicenseRequest',
      pan_verify: '/validation/verifyPANRequest',
    },
    resolved_callback_url: '',
  });
  const [metadata, setMetadata] = useState({});
  const [testResult, setTestResult] = useState(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await adminService.getRechargeApiSettings();
      const payload = unwrapPayload(response);
      setSettings((prev) => ({
        ...prev,
        ...(payload.settings || {}),
      }));
      setMetadata(payload.metadata || {});
    } catch (error) {
      console.error('Failed to load recharge api settings', error);
      toast.error('Failed to load recharge API settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const updateField = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const ipTextareaValue = useMemo(
    () => (Array.isArray(settings.allowed_ip_addresses) ? settings.allowed_ip_addresses.join('\n') : ''),
    [settings.allowed_ip_addresses],
  );

  const handleSave = async () => {
    try {
      setSubmitting(true);
      const response = await adminService.updateRechargeApiSettings({
        ...settings,
        endpoints: settings.endpoints || {},
        allowed_ip_addresses: ipTextareaValue
          .split(/\r?\n|,/)
          .map((entry) => entry.trim())
          .filter(Boolean),
      });
      const payload = unwrapPayload(response);
      setSettings((prev) => ({ ...prev, ...(payload.settings || {}) }));
      setMetadata(payload.metadata || {});
      toast.success('Recharge API settings saved');
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to save recharge API settings');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGenerateToken = async () => {
    try {
      setGenerating(true);
      const response = await adminService.generateRechargeApiToken();
      const payload = unwrapPayload(response);
      setSettings((prev) => ({ ...prev, ...(payload.settings || {}) }));
      setMetadata(payload.metadata || {});
      toast.success('New API token generated');
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to generate token');
    } finally {
      setGenerating(false);
    }
  };

  const handleRunTest = async () => {
    try {
      setTesting(true);
      const response = await adminService.testRechargeApiSettings();
      setTestResult(unwrapPayload(response));
      setActiveTab('testing');
      toast.success('Test preview generated');
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to run API test');
    } finally {
      setTesting(false);
    }
  };

  const handleCopy = async (value, label) => {
    try {
      await navigator.clipboard.writeText(String(value || ''));
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Failed to copy ${label.toLowerCase()}`);
    }
  };

  const updateEndpoint = (key, value) => {
    setSettings((prev) => ({
      ...prev,
      endpoints: {
        ...(prev.endpoints || {}),
        [key]: value,
      },
    }));
  };

  const maskedToken = settings.api_token
    ? `${settings.api_token.slice(0, 12)}...${settings.api_token.slice(-8)}`
    : 'No API token generated yet';

  const cardClass = 'bg-white rounded-[20px] border border-gray-200 shadow-sm';
  const inputClass =
    'w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-900 outline-none transition focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400';
  const labelClass = 'mb-1.5 block text-[12px] font-bold text-gray-700';

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FFFDF4]">
        <Loader2 size={32} className="animate-spin text-yellow-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FFFDF4] p-6 lg:p-8">
      <div className="mb-6 flex items-center gap-1.5 text-xs text-gray-500 font-medium">
        <span>Settings</span>
        <ChevronRight size={12} />
        <span>Third-party</span>
        <ChevronRight size={12} />
        <span className="text-gray-900">Recharge API Setup</span>
      </div>

      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="w-1 h-6 bg-yellow-400 rounded-full"></div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Recharge API Setup</h1>
            <p className="mt-1 text-sm text-gray-500">
              Configure token access, callback delivery, IP allowlisting, and test payloads.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => window.history.back()}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
          >
            <ArrowLeft size={16} />
            Back
          </button>
          <button
            type="button"
            onClick={handleRunTest}
            disabled={testing}
            className="inline-flex items-center gap-2 rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-60"
          >
            {testing ? <Loader2 size={16} className="animate-spin" /> : <PlayCircle size={16} />}
            Run Test
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-lg bg-yellow-400 px-5 py-2 text-sm font-semibold text-black transition hover:bg-yellow-500 disabled:opacity-60 shadow-sm"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Save Settings
          </button>
        </div>
      </div>

      <div className="mb-8 grid gap-4 lg:grid-cols-3">
        <div className={`${cardClass} p-5 border-l-4 border-l-yellow-400`}>
          <p className="text-xs font-bold text-gray-500">Token status</p>
          <p className="mt-1 text-lg font-bold text-gray-900">
            {settings.api_token ? 'Active token available' : 'Token missing'}
          </p>
          <p className="mt-1 text-sm font-medium text-gray-500 truncate">{maskedToken}</p>
        </div>
        <div className={`${cardClass} p-5 border-l-4 border-l-gray-300`}>
          <p className="text-xs font-bold text-gray-500">Resolved callback</p>
          <p className="mt-1 break-all text-sm font-semibold text-gray-900">
            {settings.resolved_callback_url || metadata.callback_url || 'Not available'}
          </p>
        </div>
        <div className={`${cardClass} p-5 border-l-4 border-l-gray-300`}>
          <p className="text-xs font-bold text-gray-500">Allowlisted IPs</p>
          <p className="mt-1 text-lg font-bold text-gray-900">
            {Array.isArray(settings.allowed_ip_addresses) ? settings.allowed_ip_addresses.length : 0}
          </p>
          <p className="mt-1 text-xs font-medium text-gray-500">
            Restrict callbacks to trusted sources.
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="bg-white rounded-[20px] border border-gray-200 shadow-sm overflow-hidden flex flex-col h-fit">
          <div className="p-6 bg-gray-50/50 border-b border-gray-100">
            <h3 className="text-sm font-bold text-gray-900">Integration Console</h3>
            <p className="mt-1 text-xs text-gray-500">
              Match the provider’s setup steps and keep your callback ready.
            </p>
          </div>

          <div className="p-4 space-y-1">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex w-full items-center justify-between rounded-lg px-4 py-3 text-left transition-colors ${
                    isActive ? 'bg-yellow-50 text-yellow-800 font-bold border border-yellow-200/50' : 'bg-transparent text-gray-600 hover:bg-gray-50 font-medium'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <Icon size={18} className={isActive ? "text-yellow-600" : "text-gray-400"} />
                    <span className="text-sm">{tab.label}</span>
                  </span>
                  <ChevronRight size={16} className={isActive ? 'text-yellow-600' : 'text-gray-300'} />
                </button>
              );
            })}
          </div>
        </div>

        <section className={`${cardClass} overflow-hidden h-fit`}>
          <div className="border-b border-gray-100 bg-gray-50/30 px-6 py-5 flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-yellow-400"></div>
            <h2 className="text-sm font-bold text-gray-900">
              {TABS.find((tab) => tab.id === activeTab)?.label || 'Recharge API Setup'}
            </h2>
          </div>

          <div className="p-6">
            {activeTab === 'token' && (
              <div className="space-y-6">
                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
                  <div>
                    <div className="mb-6 grid gap-4 lg:grid-cols-2">
                      <div>
                        <label className={labelClass}>Provider Name</label>
                        <input
                          type="text"
                          value={settings.provider_name || ''}
                          onChange={(event) => updateField('provider_name', event.target.value)}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Base URL</label>
                        <input
                          type="text"
                          value={settings.base_url || ''}
                          onChange={(event) => updateField('base_url', event.target.value)}
                          className={inputClass}
                        />
                      </div>
                    </div>

                    <div className="mb-6 grid gap-4 lg:grid-cols-2">
                      <div>
                        <label className={labelClass}>Auth Header</label>
                        <input
                          type="text"
                          value={settings.auth_header_name || ''}
                          onChange={(event) => updateField('auth_header_name', event.target.value)}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Auth Prefix</label>
                        <input
                          type="text"
                          value={settings.auth_header_prefix || ''}
                          onChange={(event) => updateField('auth_header_prefix', event.target.value)}
                          className={inputClass}
                        />
                      </div>
                    </div>

                    <label className={labelClass}>API Token</label>
                    <div className="flex overflow-hidden rounded-lg border border-gray-200">
                      <input
                        type="text"
                        readOnly
                        value={settings.api_token || ''}
                        placeholder="Generate token to begin"
                        className="min-w-0 flex-1 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-900 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleCopy(settings.api_token || '', 'API token')}
                        className="inline-flex items-center justify-center bg-gray-100 border-l border-gray-200 px-4 text-gray-700 transition hover:bg-gray-200"
                      >
                        <Copy size={16} />
                      </button>
                    </div>
                    <p className="mt-2 text-xs font-semibold text-gray-500">
                      Use this token in the provider dashboard or in outgoing authenticated requests.
                    </p>
                  </div>

                  <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-5 h-fit">
                    <p className="text-xs font-bold text-gray-600">Generated at</p>
                    <p className="mt-2 text-sm font-bold text-gray-900">
                      {settings.token_generated_at
                        ? new Date(settings.token_generated_at).toLocaleString()
                        : 'Not generated yet'}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 pt-4 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={handleGenerateToken}
                    disabled={generating}
                    className="inline-flex items-center gap-2 rounded-lg bg-yellow-400 px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-yellow-500 disabled:opacity-60 shadow-sm"
                  >
                    {generating ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                    Generate Token
                  </button>

                  <label className="inline-flex items-center gap-3 rounded-lg border border-gray-200 px-4 py-2.5 bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={String(settings.enabled) === '1'}
                      onChange={(event) => updateField('enabled', event.target.checked ? '1' : '0')}
                      className="h-4 w-4 rounded border-gray-300 text-yellow-500 focus:ring-yellow-500"
                    />
                    <span className="text-sm font-semibold text-gray-700">Enable recharge API configuration</span>
                  </label>
                </div>
              </div>
            )}

            {activeTab === 'callback' && (
              <div className="space-y-6">
                <div className="grid gap-6 lg:grid-cols-2">
                  <div>
                    <label className={labelClass}>Callback Mode</label>
                    <select
                      value={settings.callback_mode || 'auto'}
                      onChange={(event) => updateField('callback_mode', event.target.value)}
                      className={inputClass}
                    >
                      <option value="auto">Auto generated callback URL</option>
                      <option value="manual">Manual callback URL</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Callback Secret</label>
                    <input
                      type="text"
                      value={settings.callback_secret || ''}
                      onChange={(event) => updateField('callback_secret', event.target.value)}
                      placeholder="Optional shared secret"
                      className={inputClass}
                    />
                  </div>
                </div>

                <div>
                  <label className={labelClass}>Manual Callback URL</label>
                  <input
                    type="text"
                    value={settings.callback_url || ''}
                    onChange={(event) => updateField('callback_url', event.target.value)}
                    placeholder="https://your-domain.com/api/recharge/callback"
                    disabled={settings.callback_mode !== 'manual'}
                    className={`${inputClass} disabled:bg-gray-50 disabled:text-gray-400`}
                  />
                </div>

                <div className="rounded-xl border border-yellow-200 bg-yellow-50/50 p-5">
                  <p className="text-xs font-bold text-yellow-800">Resolved callback URL</p>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <p className="min-w-0 flex-1 break-all text-sm font-bold text-gray-900">
                      {settings.resolved_callback_url || metadata.callback_url}
                    </p>
                    <button
                      type="button"
                      onClick={() => handleCopy(settings.resolved_callback_url || metadata.callback_url || '', 'Callback URL')}
                      className="inline-flex items-center gap-2 rounded-lg bg-white border border-yellow-200 px-3 py-1.5 text-xs font-bold text-yellow-800 shadow-sm transition hover:bg-yellow-100"
                    >
                      <Copy size={14} />
                      Copy
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'ip' && (
              <div className="space-y-6">
                <div>
                  <label className={labelClass}>Allowed IP Addresses</label>
                  <textarea
                    value={ipTextareaValue}
                    onChange={(event) =>
                      updateField(
                        'allowed_ip_addresses',
                        event.target.value
                          .split(/\r?\n|,/)
                          .map((entry) => entry.trim())
                          .filter(Boolean),
                      )
                    }
                    rows={8}
                    placeholder={'103.10.10.5\n103.10.10.6'}
                    className={`${inputClass} resize-y`}
                  />
                  <p className="mt-2 text-xs font-semibold text-gray-500">
                    Enter one IP per line. These values are stored for provider-side allowlisting and audit readiness.
                  </p>
                </div>

                <div>
                  <label className={labelClass}>Internal Notes</label>
                  <textarea
                    value={settings.notes || ''}
                    onChange={(event) => updateField('notes', event.target.value)}
                    rows={4}
                    placeholder="Who approved the IPs, provider ticket ID, or rollout notes."
                    className={`${inputClass} resize-y`}
                  />
                </div>
              </div>
            )}

            {activeTab === 'testing' && (
              <div className="space-y-6">
                <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold text-gray-500">Test status</p>
                      <p className="mt-1 text-lg font-bold text-gray-900">
                        {testResult?.success ? 'Ready for callback test' : 'Setup still incomplete'}
                      </p>
                      <p className="mt-1 text-sm font-medium text-gray-500">
                        {testResult?.message || 'Run a test to generate a callback preview.'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleRunTest}
                      disabled={testing}
                      className="inline-flex items-center gap-2 rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-60"
                    >
                      {testing ? <Loader2 size={16} className="animate-spin" /> : <PlayCircle size={16} />}
                      Refresh Test
                    </button>
                  </div>
                </div>

                <div>
                  <label className={labelClass}>cURL Preview</label>
                  <div className="overflow-auto rounded-xl border border-yellow-200 bg-yellow-50 p-5 text-sm text-gray-900 font-medium">
                    <pre className="whitespace-pre-wrap break-all">{testResult?.curl || 'Run a test to generate cURL.'}</pre>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                  <div>
                    <label className={labelClass}>Penny Less Endpoint</label>
                    <input
                      type="text"
                      value={settings.endpoints?.bank_verify_penny_less || ''}
                      onChange={(event) => updateEndpoint('bank_verify_penny_less', event.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Penny Drop Endpoint</label>
                    <input
                      type="text"
                      value={settings.endpoints?.bank_verify_penny_drop || ''}
                      onChange={(event) => updateEndpoint('bank_verify_penny_drop', event.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>V3 Endpoint</label>
                    <input
                      type="text"
                      value={settings.endpoints?.bank_verify_v3 || ''}
                      onChange={(event) => updateEndpoint('bank_verify_v3', event.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div>
                    <label className={labelClass}>Driving License Request Endpoint</label>
                    <input
                      type="text"
                      value={settings.endpoints?.dl_request || ''}
                      onChange={(event) => updateEndpoint('dl_request', event.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Driving License Endpoint</label>
                    <input
                      type="text"
                      value={settings.endpoints?.dl_verify || ''}
                      onChange={(event) => updateEndpoint('dl_verify', event.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>PAN Endpoint</label>
                    <input
                      type="text"
                      value={settings.endpoints?.pan_verify || ''}
                      onChange={(event) => updateEndpoint('pan_verify', event.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'docs' && (
              <div className="space-y-6">
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
                    <div className="flex items-center gap-3">
                      <FileCode2 size={18} className="text-yellow-500" />
                      <p className="text-sm font-bold text-gray-900">Request Rules</p>
                    </div>
                    <ul className="mt-4 space-y-2 text-sm font-medium text-gray-600">
                      <li>Send the API token in the <code className="bg-white px-1 py-0.5 border border-gray-200 rounded">x-api-token</code> header.</li>
                      <li>Deliver callbacks as <code className="bg-white px-1 py-0.5 border border-gray-200 rounded">POST</code> JSON requests.</li>
                      <li>Use the resolved callback URL shown in the callback tab.</li>
                    </ul>
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
                    <div className="flex items-center gap-3">
                      <ShieldCheck size={18} className="text-green-600" />
                      <p className="text-sm font-bold text-gray-900">Recommended Checks</p>
                    </div>
                    <ul className="mt-4 space-y-2 text-sm font-medium text-gray-600">
                      <li>Rotate the API token before production cutover.</li>
                      <li>Allowlist provider IPs where supported.</li>
                      <li>Store a callback secret if the provider supports request signing.</li>
                    </ul>
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 overflow-hidden">
                  <div className="border-b border-gray-200 bg-gray-50/50 px-5 py-4">
                    <p className="text-sm font-bold text-gray-900">Sample Endpoints</p>
                  </div>
                  <div className="divide-y divide-gray-200">
                    {Object.entries(metadata.sample_endpoints || {}).map(([key, value]) => (
                      <div key={key} className="flex flex-col gap-2 px-5 py-4 lg:flex-row lg:items-center lg:justify-between bg-white">
                        <div>
                          <p className="text-xs font-bold text-gray-500 uppercase">{key}</p>
                          <p className="mt-1 break-all text-sm font-semibold text-gray-900">{value}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopy(value, `${key} endpoint`)}
                          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-700 transition hover:bg-gray-50 shrink-0"
                        >
                          <Copy size={14} />
                          Copy
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 overflow-hidden">
                  <div className="border-b border-gray-200 bg-gray-50/50 px-5 py-4">
                    <p className="text-sm font-bold text-gray-900">Provider Verification Endpoints</p>
                  </div>
                  <div className="divide-y divide-gray-200">
                    {Object.entries(metadata.provider_endpoints || {}).map(([key, value]) => (
                      <div key={key} className="px-5 py-4 bg-white">
                        <p className="text-xs font-bold text-gray-500 uppercase">{key}</p>
                        <p className="mt-1 break-all text-sm font-semibold text-gray-900">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default RechargeApiSettings;
