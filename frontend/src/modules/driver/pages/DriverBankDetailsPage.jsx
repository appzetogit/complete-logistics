import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, Landmark, Loader2, QrCode, Save, ShieldCheck, Upload } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getCurrentDriver, updateDriverProfile, verifyDriverBankDetails, verifyDriverUpiDetails } from '../services/registrationService';
import { uploadService } from '../../../shared/services/uploadService';

const unwrapDriver = (response) => response?.data?.data || response?.data || response || null;

const normalizeBankDetails = (bankDetails = {}) => ({
  accountHolderName: String(bankDetails?.accountHolderName || '').trim(),
  upiId: String(bankDetails?.upiId || '').trim(),
  qrCodeImage: String(bankDetails?.qrCodeImage || '').trim(),
  accountNumber: String(bankDetails?.accountNumber || '').trim(),
  ifsc: String(bankDetails?.ifsc || '').trim().toUpperCase(),
  branchName: String(bankDetails?.branchName || '').trim(),
  verificationStatus: String(bankDetails?.verificationStatus || '').trim(),
  verificationMode: String(bankDetails?.verificationMode || '').trim(),
  verificationMessage: String(bankDetails?.verificationMessage || '').trim(),
  verificationReferenceId: String(bankDetails?.verificationReferenceId || '').trim(),
  verifiedBankName: String(bankDetails?.verifiedBankName || '').trim(),
  verifiedBranchName: String(bankDetails?.verifiedBranchName || '').trim(),
  verifiedAccountHolderName: String(bankDetails?.verifiedAccountHolderName || '').trim(),
  verifiedAt: bankDetails?.verifiedAt || null,
  upiVerificationStatus: String(bankDetails?.upiVerificationStatus || '').trim(),
  upiVerificationMode: String(bankDetails?.upiVerificationMode || '').trim(),
  upiVerificationMessage: String(bankDetails?.upiVerificationMessage || '').trim(),
  upiVerificationReferenceId: String(bankDetails?.upiVerificationReferenceId || '').trim(),
  upiVerifiedName: String(bankDetails?.upiVerifiedName || '').trim(),
  upiAccountIfsc: String(bankDetails?.upiAccountIfsc || '').trim(),
  upiAccountType: String(bankDetails?.upiAccountType || '').trim(),
  upiVerifiedAt: bankDetails?.upiVerifiedAt || null,
  updatedAt: bankDetails?.updatedAt || null,
});

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read image'));
    reader.readAsDataURL(file);
  });

const extractUploadUrl = (payload) =>
  payload?.data?.url ||
  payload?.data?.secureUrl ||
  payload?.url ||
  payload?.secureUrl ||
  '';

const DriverBankDetailsPage = () => {
  const navigate = useNavigate();
  const role = localStorage.getItem('role') || 'driver';
  const routePrefix = role === 'owner' ? '/taxi/owner' : '/taxi/driver';

  const [driver, setDriver] = useState(null);
  const [bankForm, setBankForm] = useState(() => normalizeBankDetails());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyingUpi, setVerifyingUpi] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    let active = true;

    const loadDriver = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await getCurrentDriver();
        if (!active) return;
        const nextDriver = unwrapDriver(response);
        setDriver(nextDriver);
        setBankForm(normalizeBankDetails(nextDriver?.bankDetails));
      } catch (err) {
        if (!active) return;
        setError(err?.message || 'Unable to load bank details');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadDriver();
    return () => {
      active = false;
    };
  }, []);

  const summary = useMemo(() => {
    if (bankForm.upiId) return bankForm.upiId;
    if (bankForm.accountNumber) return `A/C ${bankForm.accountNumber.slice(-4).padStart(bankForm.accountNumber.length, '*')}`;
    return 'Add your payout details for withdrawals';
  }, [bankForm.accountNumber, bankForm.upiId]);

  const handleFieldChange = (field, value) => {
    setSuccess('');
    setBankForm((current) => ({
      ...current,
      [field]: field === 'ifsc' ? String(value || '').toUpperCase() : value,
    }));
  };

  const handleQrUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError('');
    setSuccess('');

    try {
      const dataUrl = await readFileAsDataUrl(file);
      if (!dataUrl.startsWith('data:image/')) {
        throw new Error('Please choose an image file');
      }

      const uploadPayload = await uploadService.uploadImage(dataUrl, 'driver-bank-qr');
      const qrCodeImage = extractUploadUrl(uploadPayload);

      if (!qrCodeImage) {
        throw new Error('QR upload failed');
      }

      setBankForm((current) => ({ ...current, qrCodeImage }));
    } catch (err) {
      setError(err?.message || 'QR upload failed');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const handleSave = async () => {
    if (saving || uploading) return;

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const response = await updateDriverProfile({
        bankDetails: {
          accountHolderName: bankForm.accountHolderName,
          upiId: bankForm.upiId,
          qrCodeImage: bankForm.qrCodeImage,
          accountNumber: bankForm.accountNumber,
          ifsc: bankForm.ifsc,
          branchName: bankForm.branchName,
        },
      });
      const updated = unwrapDriver(response);
      const nextBankDetails = normalizeBankDetails(updated?.bankDetails || bankForm);
      setDriver((current) => ({ ...(current || {}), bankDetails: nextBankDetails }));
      setBankForm(nextBankDetails);
      setSuccess('Bank details saved successfully.');
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Unable to save bank details');
    } finally {
      setSaving(false);
    }
  };

  const handleVerify = async () => {
    if (saving || uploading || verifying) return;

    setVerifying(true);
    setError('');
    setSuccess('');

    try {
      await updateDriverProfile({
        bankDetails: {
          accountHolderName: bankForm.accountHolderName,
          upiId: bankForm.upiId,
          qrCodeImage: bankForm.qrCodeImage,
          accountNumber: bankForm.accountNumber,
          ifsc: bankForm.ifsc,
          branchName: bankForm.branchName,
        },
      });

      const response = await verifyDriverBankDetails('penny_less');
      const payload = unwrapDriver(response);
      const nextBankDetails = normalizeBankDetails(payload?.bankDetails || {});

      setDriver((current) => ({ ...(current || {}), bankDetails: nextBankDetails }));
      setBankForm(nextBankDetails);
      setSuccess(payload?.verification?.msg || 'Bank account verified successfully.');
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Unable to verify bank details');
    } finally {
      setVerifying(false);
    }
  };

  const handleVerifyUpi = async () => {
    if (saving || uploading || verifyingUpi) return;

    setVerifyingUpi(true);
    setError('');
    setSuccess('');

    try {
      await updateDriverProfile({
        bankDetails: {
          accountHolderName: bankForm.accountHolderName,
          upiId: bankForm.upiId,
          qrCodeImage: bankForm.qrCodeImage,
          accountNumber: bankForm.accountNumber,
          ifsc: bankForm.ifsc,
          branchName: bankForm.branchName,
        },
      });

      const response = await verifyDriverUpiDetails('advance');
      const payload = unwrapDriver(response);
      const nextBankDetails = normalizeBankDetails(payload?.bankDetails || {});

      setDriver((current) => ({ ...(current || {}), bankDetails: nextBankDetails }));
      setBankForm(nextBankDetails);
      setSuccess(payload?.verification?.msg || 'UPI verified successfully.');
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Unable to verify UPI details');
    } finally {
      setVerifyingUpi(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] px-4 pb-10 pt-4 font-sans text-slate-950 sm:px-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(`${routePrefix}/profile`)}
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">Driver Profile</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">Bank Details</h1>
          </div>
        </div>

        <div className="rounded-[32px] bg-slate-950 p-6 text-white shadow-xl">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-white">
              <Landmark size={24} />
            </div>
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Payout Setup</p>
              <p className="mt-2 text-lg font-black tracking-tight">{summary}</p>
              <p className="mt-2 text-sm font-medium text-slate-300">
                These details will be used when you send a withdrawal request.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          {loading ? (
            <div className="py-16 text-center text-sm font-semibold text-slate-500">Loading bank details...</div>
          ) : (
            <div className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <Field
                  label="Account Holder Name"
                  value={bankForm.accountHolderName}
                  placeholder="Enter account holder name"
                  onChange={(value) => handleFieldChange('accountHolderName', value)}
                />
                <Field
                  label="UPI ID"
                  value={bankForm.upiId}
                  placeholder="name@upi"
                  inputMode="email"
                  onChange={(value) => handleFieldChange('upiId', value)}
                />
              </div>

              {driver?.bankDetails?.upiVerificationStatus ? (
                <div className={`rounded-[24px] border px-4 py-3 ${
                  driver.bankDetails.upiVerificationStatus === 'verified'
                    ? 'border-emerald-200 bg-emerald-50'
                    : 'border-amber-200 bg-amber-50'
                }`}>
                  <div className="flex items-start gap-3">
                    <div className={driver.bankDetails.upiVerificationStatus === 'verified' ? 'text-emerald-600' : 'text-amber-600'}>
                      {driver.bankDetails.upiVerificationStatus === 'verified' ? <CheckCircle2 size={18} /> : <ShieldCheck size={18} />}
                    </div>
                    <div>
                      <p className={`text-sm font-black ${
                        driver.bankDetails.upiVerificationStatus === 'verified' ? 'text-emerald-800' : 'text-amber-800'
                      }`}>
                        {driver.bankDetails.upiVerificationStatus === 'verified' ? 'UPI verified' : 'UPI verification attempted'}
                      </p>
                      <p className="mt-1 text-xs font-medium text-slate-600">
                        {driver.bankDetails.upiVerificationMessage || 'UPI verification response received from provider.'}
                      </p>
                      {(driver.bankDetails.upiVerifiedName || driver.bankDetails.upiAccountIfsc) ? (
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          {driver.bankDetails.upiVerifiedName || bankForm.upiId}
                          {driver.bankDetails.upiAccountIfsc ? ` • ${driver.bankDetails.upiAccountIfsc}` : ''}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div className="flex h-36 w-full items-center justify-center overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-white sm:w-36">
                    {bankForm.qrCodeImage ? (
                      <img src={bankForm.qrCodeImage} alt="UPI QR code" className="h-full w-full object-cover" />
                    ) : (
                      <QrCode size={42} className="text-slate-300" />
                    )}
                  </div>
                  <div className="flex-1 space-y-3">
                    <div>
                      <p className="text-[13px] font-bold text-slate-900">UPI QR Code</p>
                      <p className="mt-1 text-xs font-medium text-slate-500">Upload your payout QR image from gallery or camera.</p>
                    </div>
                    <label className={`relative flex h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl text-[12px] font-bold uppercase tracking-wider transition ${
                      uploading ? 'bg-slate-200 text-slate-400' : 'bg-slate-950 text-white active:scale-[0.99]'
                    }`}>
                      <Upload size={15} />
                      {uploading ? 'Uploading...' : 'Upload QR'}
                      <input
                        type="file"
                        accept="image/*"
                        disabled={uploading}
                        onChange={handleQrUpload}
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                        aria-label="Upload UPI QR code"
                      />
                    </label>
                  </div>
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <Field
                  label="Account Number"
                  value={bankForm.accountNumber}
                  placeholder="Enter account number"
                  inputMode="numeric"
                  onChange={(value) => handleFieldChange('accountNumber', value.replace(/\D/g, ''))}
                />
                <Field
                  label="IFSC"
                  value={bankForm.ifsc}
                  placeholder="ABCD0123456"
                  maxLength={11}
                  className="uppercase"
                  onChange={(value) => handleFieldChange('ifsc', value)}
                />
              </div>

              <Field
                label="Branch Name"
                value={bankForm.branchName}
                placeholder="Enter branch name"
                onChange={(value) => handleFieldChange('branchName', value)}
              />

              {driver?.bankDetails?.verificationStatus ? (
                <div className={`rounded-[24px] border px-4 py-3 ${
                  driver.bankDetails.verificationStatus === 'verified'
                    ? 'border-emerald-200 bg-emerald-50'
                    : 'border-amber-200 bg-amber-50'
                }`}>
                  <div className="flex items-start gap-3">
                    <div className={driver.bankDetails.verificationStatus === 'verified' ? 'text-emerald-600' : 'text-amber-600'}>
                      {driver.bankDetails.verificationStatus === 'verified' ? <CheckCircle2 size={18} /> : <ShieldCheck size={18} />}
                    </div>
                    <div>
                      <p className={`text-sm font-black ${
                        driver.bankDetails.verificationStatus === 'verified' ? 'text-emerald-800' : 'text-amber-800'
                      }`}>
                        {driver.bankDetails.verificationStatus === 'verified' ? 'Bank account verified' : 'Verification attempted'}
                      </p>
                      <p className="mt-1 text-xs font-medium text-slate-600">
                        {driver.bankDetails.verificationMessage || 'Verification response received from provider.'}
                      </p>
                      {(driver.bankDetails.verifiedAccountHolderName || driver.bankDetails.verifiedBankName) ? (
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          {driver.bankDetails.verifiedAccountHolderName || 'Account holder'}
                          {driver.bankDetails.verifiedBankName ? ` • ${driver.bankDetails.verifiedBankName}` : ''}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}

              {driver?.bankDetails?.updatedAt ? (
                <p className="text-xs font-medium text-slate-400">
                  Last updated: {new Date(driver.bankDetails.updatedAt).toLocaleString('en-IN')}
                </p>
              ) : null}

              {error ? (
                <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600">{error}</p>
              ) : null}
              {success ? (
                <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{success}</p>
              ) : null}

              <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-4">
                <button
                  type="button"
                  onClick={() => navigate(`${routePrefix}/profile`)}
                  className="h-12 rounded-2xl border border-slate-200 text-[13px] font-bold text-slate-700"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleVerify}
                  disabled={saving || uploading || verifying}
                  className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 text-[13px] font-bold text-emerald-700 disabled:opacity-60"
                >
                  {verifying ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <ShieldCheck size={15} />
                  )}
                  Verify
                </button>
                <button
                  type="button"
                  onClick={handleVerifyUpi}
                  disabled={saving || uploading || verifyingUpi}
                  className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-sky-200 bg-sky-50 text-[13px] font-bold text-sky-700 disabled:opacity-60"
                >
                  {verifyingUpi ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <ShieldCheck size={15} />
                  )}
                  Verify UPI
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || uploading || verifying || verifyingUpi}
                  className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 text-[13px] font-bold text-white disabled:opacity-60"
                >
                  {saving ? (
                    <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  ) : (
                    <Save size={15} />
                  )}
                  Save
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const Field = ({
  label,
  value,
  onChange,
  placeholder,
  inputMode,
  maxLength,
  className = '',
}) => (
  <div className="space-y-2">
    <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500">{label}</label>
    <input
      type="text"
      inputMode={inputMode}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      className={`h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-[15px] font-bold text-slate-900 outline-none focus:border-slate-900 focus:bg-white ${className}`}
    />
  </div>
);

export default DriverBankDetailsPage;
