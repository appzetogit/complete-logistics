import api from '../../../shared/api/axiosInstance';

export const getReferralTranslationContent = (language) =>
  api.get('/common/referrals/translation', {
    params: language ? { language } : undefined,
  });

export const getReferralSettingsContent = (type) =>
  api.get('/common/referrals/settings', {
    params: type ? { type } : undefined,
  });
