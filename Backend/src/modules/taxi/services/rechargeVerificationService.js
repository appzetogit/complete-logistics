import { ApiError } from '../../../utils/ApiError.js';
import { ensureThirdPartySettingsDocument } from '../admin/services/thirdPartySettingsService.js';

const trimTrailingSlash = (value = '') => String(value || '').trim().replace(/\/+$/, '');
const normalizeLegacyDlEndpoint = (value = '') => {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return '/validation/verifyDL';
  }

  if (
    normalized === '/validation/driverLicenseRequest' ||
    normalized === '/validation/verifyLicenseRequest'
  ) {
    return '/validation/verifyDL';
  }

  return normalized;
};

const joinUrl = (baseUrl = '', endpointPath = '') => {
  const base = trimTrailingSlash(baseUrl);
  const path = String(endpointPath || '').trim();

  if (!path) {
    return base;
  }

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return `${base}/${path.replace(/^\/+/, '')}`;
};

const normalizeRechargeVerificationSettings = (settings = {}) => ({
  enabled: String(settings?.enabled || '0') === '1',
  providerName: String(settings?.provider_name || 'RechargeKit Verify').trim() || 'RechargeKit Verify',
  baseUrl: trimTrailingSlash(settings?.base_url || 'https://verify.rechargkit.biz') || 'https://verify.rechargkit.biz',
  apiToken: String(settings?.api_token || '').trim(),
  authHeaderName: String(settings?.auth_header_name || 'Authorization').trim() || 'Authorization',
  authHeaderPrefix: String(settings?.auth_header_prefix || 'Bearer').trim(),
  endpoints: {
    bankVerifyPennyLess: String(settings?.endpoints?.bank_verify_penny_less || '/validation/verifyBankRequest').trim() || '/validation/verifyBankRequest',
    bankVerifyPennyDrop: String(settings?.endpoints?.bank_verify_penny_drop || '/validation/penny-drop').trim() || '/validation/penny-drop',
    bankVerifyV3: String(settings?.endpoints?.bank_verify_v3 || '/validation/v3/pennyDropVerify').trim() || '/validation/v3/pennyDropVerify',
    drivingLicenseRequest: normalizeLegacyDlEndpoint(settings?.endpoints?.dl_request || '/validation/verifyDL'),
    drivingLicenseVerify: normalizeLegacyDlEndpoint(settings?.endpoints?.dl_verify || '/validation/verifyDL'),
    panVerify: String(settings?.endpoints?.pan_verify || '/validation/verifyPANRequest').trim() || '/validation/verifyPANRequest',
    upiBasic: String(settings?.endpoints?.upi_basic || '/validation/upiBasic').trim() || '/validation/upiBasic',
    upiAdvance: String(settings?.endpoints?.upi_advance || '/validation/upiAdvanceVerify').trim() || '/validation/upiAdvanceVerify',
    gstVerify: String(settings?.endpoints?.gstin_verify || '/validation/verifyGSTIN').trim() || '/validation/verifyGSTIN',
    rcVerify: String(settings?.endpoints?.rc_verify || '/validation/rcAdvanceVerify').trim() || '/validation/rcAdvanceVerify',
  },
});

export const getRechargeVerificationSettings = async () => {
  const document = await ensureThirdPartySettingsDocument();
  return normalizeRechargeVerificationSettings(document?.recharge_api || {});
};

const buildAuthHeaders = (settings) => {
  if (!settings.apiToken) {
    throw new ApiError(400, `${settings.providerName} API token is not configured in admin settings`);
  }

  return {
    [settings.authHeaderName]: settings.authHeaderPrefix
      ? `${settings.authHeaderPrefix} ${settings.apiToken}`
      : settings.apiToken,
  };
};

const callRechargeVerificationEndpoint = async (settings, endpointPath, body) => {
  if (!settings.enabled) {
    throw new ApiError(400, `${settings.providerName} integration is disabled in admin settings`);
  }

  const response = await fetch(joinUrl(settings.baseUrl, endpointPath), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildAuthHeaders(settings),
    },
    body: JSON.stringify(body),
  });

  const rawText = await response.text();
  let payload = {};

  try {
    payload = rawText ? JSON.parse(rawText) : {};
  } catch {
    payload = { raw: rawText };
  }

  if (!response.ok) {
    throw new ApiError(
      response.status,
      String(payload?.msg || payload?.message || `${settings.providerName} request failed`),
    );
  }

  return payload;
};

export const verifyBankAccountWithRecharge = async ({
  accountNumber,
  ifscCode,
  accountHolderName,
  partnerRequestId,
  mode = 'penny_less',
}) => {
  const settings = await getRechargeVerificationSettings();
  const normalizedMode = String(mode || 'penny_less').trim().toLowerCase();
  const bankAccount = String(accountNumber || '').replace(/\s/g, '');
  const ifsc = String(ifscCode || '').trim().toUpperCase();
  const beneficiaryName = String(accountHolderName || '').trim();
  const requestId = String(partnerRequestId || '').trim();

  if (!bankAccount) {
    throw new ApiError(400, 'Bank account number is required');
  }
  if (!ifsc) {
    throw new ApiError(400, 'IFSC code is required');
  }
  if (!requestId) {
    throw new ApiError(400, 'Partner request id is required');
  }

  if (normalizedMode === 'penny_drop') {
    return callRechargeVerificationEndpoint(settings, settings.endpoints.bankVerifyPennyDrop, {
      bank_account: bankAccount,
      ifsc_code: ifsc,
      payment_mode: 1,
      benificiary_name: beneficiaryName,
      partner_request_id: requestId,
    });
  }

  if (normalizedMode === 'v3') {
    return callRechargeVerificationEndpoint(settings, settings.endpoints.bankVerifyV3, {
      bank_account: bankAccount,
      ifsc_code: ifsc,
      partner_request_id: requestId,
    });
  }

  if (!beneficiaryName) {
    throw new ApiError(400, 'Account holder name is required for penny-less verification');
  }

  return callRechargeVerificationEndpoint(settings, settings.endpoints.bankVerifyPennyLess, {
    bank_account: bankAccount,
    ifsc_code: ifsc,
    benificiary_name: beneficiaryName,
    partner_request_id: requestId,
  });
};

export const verifyDrivingLicenseWithRecharge = async ({
  licenseNumber,
  birthDate,
  partnerRequestId,
  requestNumber = '',
}) => {
  const settings = await getRechargeVerificationSettings();
  const normalizedLicenseNumber = String(licenseNumber || '').trim().toUpperCase();
  const normalizedBirthDate = String(birthDate || '').trim();
  const normalizedPartnerRequestId = String(partnerRequestId || '').trim();

  if (!normalizedLicenseNumber) {
    throw new ApiError(400, 'Driving license number is required');
  }

  const yyyyMmDdMatch = normalizedBirthDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const ddMmYyyyMatch = normalizedBirthDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const providerBirthDate = yyyyMmDdMatch
    ? `${yyyyMmDdMatch[3]}/${yyyyMmDdMatch[2]}/${yyyyMmDdMatch[1]}`
    : ddMmYyyyMatch
      ? normalizedBirthDate
      : '';

  if (!providerBirthDate) {
    throw new ApiError(400, 'Birth date must use YYYY-MM-DD or DD/MM/YYYY format');
  }

  if (!normalizedPartnerRequestId) {
    throw new ApiError(400, 'Partner request id is required');
  }

  return callRechargeVerificationEndpoint(settings, settings.endpoints.drivingLicenseVerify, {
    license_no: normalizedLicenseNumber,
    birth_date: providerBirthDate,
    partner_request_id: normalizedPartnerRequestId,
  });
};

export const requestDrivingLicenseVerificationWithRecharge = async ({
  licenseNumber,
  birthDate,
}) => {
  return verifyDrivingLicenseWithRecharge({
    licenseNumber,
    birthDate,
    partnerRequestId: `DLREQ-${Date.now()}`,
    requestNumber: '',
  });
};

export const verifyPanWithRecharge = async ({
  panNumber,
  partnerRequestId,
}) => {
  const settings = await getRechargeVerificationSettings();
  const normalizedPanNumber = String(panNumber || '').trim().toUpperCase();
  const normalizedPartnerRequestId = String(partnerRequestId || '').trim();

  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(normalizedPanNumber)) {
    throw new ApiError(400, 'PAN number must be a valid 10-character PAN');
  }

  if (!normalizedPartnerRequestId) {
    throw new ApiError(400, 'Partner request id is required');
  }

  return callRechargeVerificationEndpoint(settings, settings.endpoints.panVerify, {
    pan_no: normalizedPanNumber,
    partner_request_id: normalizedPartnerRequestId,
  });
};

export const verifyUpiWithRecharge = async ({
  upiId,
  partnerRequestId,
  mode = 'basic',
}) => {
  const settings = await getRechargeVerificationSettings();
  const normalizedUpiId = String(upiId || '').trim().toLowerCase();
  const normalizedPartnerRequestId = String(partnerRequestId || '').trim();
  const normalizedMode = String(mode || 'basic').trim().toLowerCase();

  if (!/^[a-z0-9.\-_]{2,}@[a-z0-9.\-_]{2,}$/i.test(normalizedUpiId)) {
    throw new ApiError(400, 'UPI ID must be valid');
  }

  if (!normalizedPartnerRequestId) {
    throw new ApiError(400, 'Partner request id is required');
  }

  return callRechargeVerificationEndpoint(
    settings,
    normalizedMode === 'advance' ? settings.endpoints.upiAdvance : settings.endpoints.upiBasic,
    {
      upi_id: normalizedUpiId,
      partner_request_id: normalizedPartnerRequestId,
    },
  );
};

export const verifyGstinWithRecharge = async ({
  gstin,
  partnerRequestId,
}) => {
  const settings = await getRechargeVerificationSettings();
  const normalizedGstin = String(gstin || '').trim().toUpperCase();
  const normalizedPartnerRequestId = String(partnerRequestId || '').trim();

  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/i.test(normalizedGstin)) {
    throw new ApiError(400, 'GSTIN must be valid');
  }

  if (!normalizedPartnerRequestId) {
    throw new ApiError(400, 'Partner request id is required');
  }

  return callRechargeVerificationEndpoint(settings, settings.endpoints.gstVerify, {
    GSTIN: normalizedGstin,
    partner_request_id: normalizedPartnerRequestId,
  });
};

export const verifyRcWithRecharge = async ({
  rcNumber,
  partnerRequestId,
}) => {
  const settings = await getRechargeVerificationSettings();
  const normalizedRcNumber = String(rcNumber || '').trim().toUpperCase();
  const normalizedPartnerRequestId = String(partnerRequestId || '').trim();

  if (!normalizedRcNumber) {
    throw new ApiError(400, 'RC number is required');
  }

  if (!normalizedPartnerRequestId) {
    throw new ApiError(400, 'Partner request id is required');
  }

  return callRechargeVerificationEndpoint(settings, settings.endpoints.rcVerify, {
    rc_no: normalizedRcNumber,
    partner_request_id: normalizedPartnerRequestId,
  });
};
