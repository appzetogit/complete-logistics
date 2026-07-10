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
          .lean();

        return {
          ...(defaultAppSettings.tip_setting || {}),
          ...(settings?.tip_setting || {}),
        };
      },
    },
  );
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
