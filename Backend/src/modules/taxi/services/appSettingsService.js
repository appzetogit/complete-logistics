import { createDefaultAppSettings } from '../admin/data/defaultAppSettings.js';
import { AdminAppSetting } from '../admin/models/AdminAppSetting.js';
import { getOrLoadCachedValue } from '../../../utils/cache.js';

const defaultAppSettings = createDefaultAppSettings();
const SETTINGS_CACHE_TTL_MS = 30_000;

export const getTipSettings = async () => {
  return getOrLoadCachedValue(
    'cache:settings:tip',
    {
      ttlMs: SETTINGS_CACHE_TTL_MS,
      load: async () => {
        const settings = await AdminAppSetting.findOne({ scope: 'default' })
          .select('tip_setting')
          .maxTimeMS(8000)
          .lean();

        return {
          ...(defaultAppSettings.tip_setting || {}),
          ...(settings?.tip_setting || {}),
        };
      },
    },
  );
};

const SUPPORT_KEYS = ['support_phone', 'support_email', 'support_whatsapp'];

// Public help-center contact (no login): only these three keys, always strings.
export const getSupportSettings = async () => getOrLoadCachedValue(
  'cache:settings:support',
  {
    ttlMs: SETTINGS_CACHE_TTL_MS,
    load: async () => {
      const { AdminBusinessSetting } = await import('../admin/models/AdminBusinessSetting.js');
      const row = await AdminBusinessSetting.findOne({ scope: 'default' }).select('support').maxTimeMS(8000).lean();
      const stored = row?.support || {};
      return Object.fromEntries(SUPPORT_KEYS.map((key) => [key, String(stored[key] ?? '').trim()]));
    },
  },
);

const SUPPORT_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUPPORT_PHONE_PATTERN = /^\+?[0-9][0-9 -]{5,18}[0-9]$/;

/** Validates and normalizes an admin update of the support contact. Throws a message string when invalid. */
export const normalizeSupportSettings = (input = {}) => {
  const out = {};
  for (const key of SUPPORT_KEYS) {
    if (input[key] === undefined) continue;
    const value = String(input[key] ?? '').trim();
    if (value && key === 'support_email' && !SUPPORT_EMAIL_PATTERN.test(value)) {
      throw new Error('Support email is not a valid email address');
    }
    if (value && key !== 'support_email' && !SUPPORT_PHONE_PATTERN.test(value)) {
      throw new Error(`${key === 'support_phone' ? 'Support phone' : 'Support WhatsApp'} must be a phone number (digits, optional +, spaces or dashes)`);
    }
    out[key] = value;
  }
  return out;
};

export const getWalletSettings = async () => {
  return getOrLoadCachedValue(
    'cache:settings:wallet',
    {
      ttlMs: SETTINGS_CACHE_TTL_MS,
      load: async () => {
        const settings = await AdminAppSetting.findOne({ scope: 'default' })
          .select('wallet_setting')
          .lean();

        return {
          ...(defaultAppSettings.wallet_setting || {}),
          ...(settings?.wallet_setting || {}),
        };
      },
    },
  );
};
