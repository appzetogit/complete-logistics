export const USER_REFERRAL_TRANSLATION_FIELDS = [
  {
    key: 'instant_referrer_user',
    label: 'instant referrer user',
  },
  {
    key: 'instant_referrer_user_and_new_user',
    label: 'instant referrer user and new user',
  },
  {
    key: 'conditional_referrer_user_ride_count',
    label: 'conditional for referrer user ride count',
  },
  {
    key: 'conditional_referrer_user_earnings',
    label: 'conditional for referrer user earnings',
  },
  {
    key: 'dual_conditional_referrer_user_and_new_user_ride_count',
    label: 'dual conditional for referrer user and new user ride count',
  },
  {
    key: 'dual_conditional_referrer_user_and_new_user_earnings',
    label: 'dual conditional for referrer user and new user earnings',
  },
  {
    key: 'banner_text',
    label: 'user banner text',
    plainText: true,
  },
];

export const DRIVER_REFERRAL_TRANSLATION_FIELDS = [
  {
    key: 'instant_referrer_user',
    label: 'instant referrer driver',
  },
  {
    key: 'instant_referrer_user_and_new_user',
    label: 'instant referrer driver and new driver',
  },
  {
    key: 'conditional_referrer_user_ride_count',
    label: 'conditional for referrer driver ride count',
  },
  {
    key: 'conditional_referrer_user_earnings',
    label: 'conditional for referrer driver earnings',
  },
  {
    key: 'dual_conditional_referrer_user_and_new_user_ride_count',
    label: 'dual conditional for referrer driver and new driver or new user ride count',
  },
  {
    key: 'dual_conditional_referrer_user_and_new_user_earnings',
    label: 'dual conditional for referrer driver and new driver or new user earnings',
  },
  {
    key: 'banner_text',
    label: 'driver banner text',
    plainText: true,
  },
];

export const createEmptyReferralTranslationSection = () => ({
  instant_referrer_user: '',
  instant_referrer_user_and_new_user: '',
  conditional_referrer_user_ride_count: '',
  conditional_referrer_user_earnings: '',
  dual_conditional_referrer_user_and_new_user_ride_count: '',
  dual_conditional_referrer_user_and_new_user_earnings: '',
  banner_text: '',
});

export const createEmptyReferralTranslationRecord = () => ({
  language_code: 'en',
  language_name: 'English',
  active: true,
  default_status: false,
  user_referral: createEmptyReferralTranslationSection(),
  driver_referral: createEmptyReferralTranslationSection(),
});

const stripHtml = (value = '') =>
  String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const formatReferralAmount = (value) => {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? `₹${amount}` : '₹0';
};

export const applyReferralSettingPlaceholders = (section = {}, settings = {}) => {
  const amount = formatReferralAmount(settings.amount || 0);
  const rideCount = String(settings.ride_count || 0);
  const replacements = {
    amount,
    referral_amount: amount,
    referred_user_amount: amount,
    referred_driver_amount: amount,
    new_user_amount: amount,
    new_driver_amount: amount,
    user_spent_amount: amount,
    driver_earning_amount: amount,
    ride_count: rideCount,
    user_ride_count: rideCount,
    driver_ride_count: rideCount,
  };

  return Object.entries(section || {}).reduce((accumulator, [key, value]) => {
    let nextValue = String(value || '');

    Object.entries(replacements).forEach(([placeholder, replacement]) => {
      nextValue = nextValue.replaceAll(`{${placeholder}}`, replacement);
    });

    accumulator[key] = nextValue;
    return accumulator;
  }, {});
};

export const buildReferralPreviewBlocks = (section = {}, fields = []) =>
  fields
    .filter((field) => field.key !== 'banner_text')
    .map((field) => ({
      key: field.key,
      label: field.label,
      html: String(section?.[field.key] || ''),
      text: stripHtml(section?.[field.key] || ''),
    }))
    .filter((item) => item.html || item.text);

export const getStoredReferralLanguageCode = (audience = 'user') => {
  if (typeof window === 'undefined') {
    return 'en';
  }

  const driverLanguage = String(localStorage.getItem('driver_lang') || '').trim().toLowerCase();
  const explicitLanguage =
    String(localStorage.getItem(`${audience}_lang`) || localStorage.getItem('app_lang') || '').trim().toLowerCase();
  const browserLanguage = String(window.navigator?.language || 'en').split('-')[0].toLowerCase();

  const mapAliasToCode = (value) => {
    switch (value) {
      case 'english':
        return 'en';
      case 'hindi':
        return 'hi';
      case 'arabic':
        return 'ar';
      case 'spanish':
        return 'es';
      case 'french':
        return 'fr';
      case 'tamil':
        return 'ta';
      case 'kannada':
        return 'kn';
      case 'marathi':
        return 'mr';
      case 'gujarati':
        return 'gu';
      default:
        return value || 'en';
    }
  };

  if (audience === 'driver' && driverLanguage) {
    return mapAliasToCode(driverLanguage);
  }

  return mapAliasToCode(explicitLanguage || browserLanguage || 'en');
};
