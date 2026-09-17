import { AdminThirdPartySetting } from '../models/AdminThirdPartySetting.js';
import { createDefaultThirdPartySettings } from '../data/defaultThirdPartySettings.js';

export const ensureThirdPartySettingsDocument = async () => {
  let settings = await AdminThirdPartySetting.findOne({ scope: 'default' });
  if (!settings) {
    settings = await AdminThirdPartySetting.create(createDefaultThirdPartySettings());
  }
  return settings;
};
