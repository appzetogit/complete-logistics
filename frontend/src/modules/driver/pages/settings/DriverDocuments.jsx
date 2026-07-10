import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, BadgeCheck, CalendarDays, Camera, CheckCircle2, Eye, FileText, Loader2, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getCurrentDriver, getDriverDocumentTemplates, updateDriverDocument, verifyDriverBankDocument, verifyDriverGstinDocument, verifyDriverLicenseDocument, verifyDriverPanDocument, verifyDriverRcDocument } from '../../services/registrationService';
import { useImageUpload } from '../../../../shared/hooks/useImageUpload';
import {
  flattenDriverDocumentFields,
  getDocumentPreviewUrl,
  normalizeDriverDocumentTemplates,
} from '../../utils/documentTemplates';

const formatDate = (value) => {
  if (!value) return 'Uploaded';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
};

const getDocumentReviewStatus = (document = {}) =>
  String(
    document?.approvalStatus ||
    document?.reviewStatus ||
    document?.status ||
    '',
  ).trim().toLowerCase();

const getDocumentReason = (document = {}) =>
  String(
    document?.comment ||
    document?.remarks ||
    document?.reason ||
    document?.admin_comment ||
    document?.rejection_reason ||
    '',
  ).trim();

const getDocumentExpiryValue = (document = {}) =>
  document?.expiryDate ||
  document?.expiry_date ||
  document?.expiry ||
  document?.expiresAt ||
  null;

const getDocumentIdentifyValue = (document = {}) =>
  String(
    document?.identifyNumber ||
    document?.identify_number ||
    document?.documentNumber ||
    document?.document_number ||
    '',
  ).trim();

const getDocumentBirthDateValue = (document = {}) =>
  String(document?.birthDate || document?.birth_date || '').trim();

const getDocumentRequestNumberValue = (document = {}) =>
  String(document?.requestNumber || document?.request_no || '').trim();

const getDocumentIfscValue = (document = {}) =>
  String(document?.ifsc || document?.ifscCode || document?.ifsc_code || '').trim().toUpperCase();

const getDocumentAccountHolderNameValue = (document = {}) =>
  String(
    document?.accountHolderName ||
    document?.account_holder_name ||
    document?.beneficiaryName ||
    document?.benificiary_name ||
    '',
  ).trim();

const isDrivingLicenseDocument = (doc = {}) =>
  String(doc?.verificationType || '').trim() === 'driving_license' ||
  String(doc?.id || '').trim() === 'drivingLicense';

const isPanDocument = (doc = {}) =>
  String(doc?.verificationType || '').trim() === 'pan' ||
  /\bpan\b/i.test(String(doc?.id || '')) ||
  /\bpan\b/i.test(String(doc?.name || '')) ||
  /\bpancard\b/i.test(String(doc?.id || '')) ||
  /\bpancard\b/i.test(String(doc?.name || ''));

const isGstDocument = (doc = {}) =>
  String(doc?.verificationType || '').trim() === 'gstin' ||
  /\bgst\b/i.test(String(doc?.id || '')) ||
  /\bgstin\b/i.test(String(doc?.id || '')) ||
  /\bgst\b/i.test(String(doc?.name || '')) ||
  /\bgstin\b/i.test(String(doc?.name || ''));

const isRcDocument = (doc = {}) =>
  String(doc?.verificationType || '').trim() === 'rc' ||
  /\brc\b/i.test(String(doc?.id || '')) ||
  /\bvehicle rc\b/i.test(String(doc?.name || '')) ||
  /\bregistration certificate\b/i.test(String(doc?.name || ''));

const isBankDocument = (doc = {}) =>
  String(doc?.verificationType || '').trim() === 'bank_account' ||
  /\bbank\b/i.test(String(doc?.id || '')) ||
  /\bbank\b/i.test(String(doc?.name || ''));

const isDocumentExpired = (document = {}) => {
  const value = getDocumentExpiryValue(document);
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() < Date.now();
};

const formatExpiryDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const toDateInputValue = (value) => {
  if (!value) return '';
  const normalized = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return normalized;
  }

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return '';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const unwrapDriver = (response) => response?.data?.data || response?.data || response || null;
const toTimestamp = (value) => {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
};

const DriverDocuments = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const routePrefix = location.pathname.startsWith('/taxi/owner') ? '/taxi/owner' : '/taxi/driver';
  const focusDocumentKey = String(location.state?.focusDocumentKey || '').trim();
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [driver, setDriver] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploadingDocumentKey, setUploadingDocumentKey] = useState('');
  const [expiryModal, setExpiryModal] = useState({ isOpen: false, docId: '', name: '', value: '', isSubmitting: false });
  const [metaModal, setMetaModal] = useState({
    isOpen: false,
    mode: 'license',
    docId: '',
    name: '',
    identifyNumber: '',
    birthDate: '',
    requestNumber: '',
    ifsc: '',
    accountHolderName: '',
    isSubmitting: false,
    isVerifying: false,
  });
  const uploadingDocumentKeyRef = useRef('');
  const documentInputRefs = useRef({});
  const autoOpenedDocumentRef = useRef('');

  const {
    uploading: imageUploading,
    handleFileChange: onDocumentImageChange,
  } = useImageUpload({
    folder: 'driver-documents',
    onSuccess: async (url) => {
      const activeDocumentKey = uploadingDocumentKeyRef.current;

      if (!activeDocumentKey) {
        return;
      }

      const updatedDocument = {
        key: activeDocumentKey,
        fileName: activeDocumentKey,
        previewUrl: url,
        secureUrl: url,
        uploaded: true,
        uploadedAt: new Date().toISOString(),
      };

      try {
        const response = await updateDriverDocument(activeDocumentKey, updatedDocument);
        const documents = response?.data?.documents || {
          ...(driver?.documents || {}),
          [activeDocumentKey]: updatedDocument,
        };
        setDriver((prev) => ({ ...(prev || {}), documents }));
      } catch (requestError) {
        setError(requestError?.message || 'Unable to update document image');
      } finally {
        uploadingDocumentKeyRef.current = '';
        setUploadingDocumentKey('');
      }
    },
    onError: () => {
      uploadingDocumentKeyRef.current = '';
      setUploadingDocumentKey('');
    },
  });

  const loadDriver = async () => {
    setIsSyncing(true);
    setError('');

    try {
      const [driverResponse, templateResponse] = await Promise.all([
        getCurrentDriver(),
        getDriverDocumentTemplates(),
      ]);

      setDriver(unwrapDriver(driverResponse));
      setTemplates(normalizeDriverDocumentTemplates(templateResponse?.data?.data?.results || templateResponse?.data?.results || []));
    } catch (err) {
      setError(err?.message || 'Unable to load driver documents');
    } finally {
      setIsLoading(false);
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    loadDriver();
  }, []);

  const docs = useMemo(() => {
    const documents = driver?.documents || {};

    return flattenDriverDocumentFields(templates).map((field, index) => {
      const doc = documents[field.key] || null;
      const previewUrl = getDocumentPreviewUrl(doc);
      const uploadedAt = doc?.uploadedAt || doc?.createdAt || doc?.updatedAt || '';
      const hasDoc = Boolean(previewUrl || doc);
      const expiryDate = getDocumentExpiryValue(doc);
      const identifyNumber = getDocumentIdentifyValue(doc);
      const birthDate = getDocumentBirthDateValue(doc);
      const requestNumber = getDocumentRequestNumberValue(doc);
      const ifsc = getDocumentIfscValue(doc);
      const accountHolderName = getDocumentAccountHolderNameValue(doc);
      const expired = isDocumentExpired(doc);
      const rejected = ['rejected', 'declined'].includes(getDocumentReviewStatus(doc));
      const verified = ['verified', 'approved'].includes(getDocumentReviewStatus(doc));
      const reason = getDocumentReason(doc);
      const reverificationPending =
        getDocumentReviewStatus(doc) === 'pending' &&
        Math.max(
          toTimestamp(doc?.reverificationRequestedAt),
          toTimestamp(doc?.uploadedAt),
          toTimestamp(doc?.updatedAt),
        ) > toTimestamp(doc?.reviewedAt);

      return {
        id: field.key,
        name: field.label,
        templateName: field.templateName,
        verificationType: field.verificationType,
        hasExpiryDate: field.hasExpiryDate,
        rawDocument: doc,
        reviewStatus: getDocumentReviewStatus(doc),
        hasDocument: hasDoc,
        status: verified
          ? 'Verified'
          : rejected
            ? 'Rejected'
            : reverificationPending
              ? 'Pending Reverification'
              : expired
                ? 'Expired'
                : hasDoc
                  ? 'Uploaded'
                  : 'Missing',
        date: hasDoc ? formatDate(uploadedAt) : 'Not uploaded',
        previewUrl,
        fileName: doc?.fileName || field.label,
        uploadedAt,
        expiryDate,
        identifyNumber,
        birthDate,
        requestNumber,
        ifsc,
        accountHolderName,
        hasIdentifyNumber: field.hasIdentifyNumber,
        expired,
        rejected,
        reverificationPending,
        reason,
        verified,
        order: index,
      };
    });
  }, [driver?.documents, templates]);

  const uploadedCount = docs.filter((doc) => doc.hasDocument).length;
  const actionRequiredCount = docs.filter((doc) => !doc.verified).length;

  useEffect(() => {
    if (!focusDocumentKey || isLoading || imageUploading) {
      return;
    }

    if (autoOpenedDocumentRef.current === focusDocumentKey) {
      return;
    }

    const targetDoc = docs.find((doc) => doc.id === focusDocumentKey);
    const targetInput = documentInputRefs.current[focusDocumentKey];

    if (!targetDoc || !targetInput) {
      return;
    }

    autoOpenedDocumentRef.current = focusDocumentKey;
    setTimeout(() => {
      targetInput.click();
    }, 0);
  }, [docs, focusDocumentKey, imageUploading, isLoading]);

  const closeExpiryModal = () => {
    setExpiryModal({ isOpen: false, docId: '', name: '', value: '', isSubmitting: false });
  };

  const closeMetaModal = () => {
    setMetaModal({
      isOpen: false,
      mode: 'license',
      docId: '',
      name: '',
      identifyNumber: '',
      birthDate: '',
      requestNumber: '',
      ifsc: '',
      accountHolderName: '',
      isSubmitting: false,
      isVerifying: false,
    });
  };

  const handleExpirySave = async () => {
    if (!expiryModal.docId || !expiryModal.value) {
      return;
    }

    const currentDocument = driver?.documents?.[expiryModal.docId] || {};
    const nextExpiryDate = String(expiryModal.value).trim();

    try {
      setExpiryModal((prev) => ({ ...prev, isSubmitting: true }));
      setError('');

      const response = await updateDriverDocument(expiryModal.docId, {
        ...currentDocument,
        key: expiryModal.docId,
        expiryDate: nextExpiryDate,
        expiry_date: nextExpiryDate,
        expiresAt: nextExpiryDate,
        uploaded: currentDocument?.uploaded ?? true,
      });

      const documents = response?.data?.documents || {
        ...(driver?.documents || {}),
        [expiryModal.docId]: {
          ...currentDocument,
          key: expiryModal.docId,
          expiryDate: nextExpiryDate,
          expiry_date: nextExpiryDate,
          expiresAt: nextExpiryDate,
        },
      };

      setDriver((prev) => ({ ...(prev || {}), documents }));
      closeExpiryModal();
    } catch (requestError) {
      setError(requestError?.message || 'Unable to update document expiry date');
      setExpiryModal((prev) => ({ ...prev, isSubmitting: false }));
    }
  };

  const handleMetaSave = async ({ verify = false } = {}) => {
    if (!metaModal.docId) {
      return;
    }

    const currentDocument = driver?.documents?.[metaModal.docId] || {};
    const identifyNumber = String(metaModal.identifyNumber || '').trim().toUpperCase();
    const birthDate = String(metaModal.birthDate || '').trim();
    const requestNumber = String(metaModal.requestNumber || '').trim();
    const ifsc = String(metaModal.ifsc || '').trim().toUpperCase();
    const accountHolderName = String(metaModal.accountHolderName || '').trim();

    try {
      setMetaModal((prev) => ({
        ...prev,
        isSubmitting: !verify,
        isVerifying: verify,
      }));
      setError('');

      const saveResponse = await updateDriverDocument(metaModal.docId, {
        ...currentDocument,
        key: metaModal.docId,
        identifyNumber,
        identify_number: identifyNumber,
        documentNumber: identifyNumber,
        document_number: identifyNumber,
        birthDate,
        birth_date: birthDate,
        requestNumber,
        request_no: requestNumber,
        ifsc,
        ifscCode: ifsc,
        ifsc_code: ifsc,
        accountHolderName,
        account_holder_name: accountHolderName,
        beneficiaryName: accountHolderName,
        benificiary_name: accountHolderName,
        uploaded: currentDocument?.uploaded ?? true,
      });

      let documents = saveResponse?.data?.documents || {
        ...(driver?.documents || {}),
        [metaModal.docId]: {
          ...currentDocument,
          key: metaModal.docId,
          identifyNumber,
          identify_number: identifyNumber,
          documentNumber: identifyNumber,
          document_number: identifyNumber,
          birthDate,
          birth_date: birthDate,
          requestNumber,
          request_no: requestNumber,
        },
      };

      if (verify) {
        const verifyResponse =
          metaModal.mode === 'pan'
            ? await verifyDriverPanDocument(metaModal.docId)
            : metaModal.mode === 'gst'
              ? await verifyDriverGstinDocument(metaModal.docId)
              : metaModal.mode === 'rc'
                ? await verifyDriverRcDocument(metaModal.docId)
                : metaModal.mode === 'bank'
                  ? await verifyDriverBankDocument(metaModal.docId, {
                      accountNumber: identifyNumber,
                      ifsc,
                      accountHolderName,
                    })
                : await verifyDriverLicenseDocument(metaModal.docId);
        documents = verifyResponse?.data?.data?.documents || verifyResponse?.data?.documents || documents;
      }

      setDriver((prev) => ({ ...(prev || {}), documents }));
      closeMetaModal();
    } catch (requestError) {
      setError(requestError?.response?.data?.message || requestError?.message || 'Unable to update document details');
      setMetaModal((prev) => ({
        ...prev,
        isSubmitting: false,
        isVerifying: false,
      }));
    }
  };

  return (
    <div className="min-h-screen bg-[#f8f9fb] font-sans p-6 pt-10 pb-32 overflow-x-hidden">
      <header className="flex items-center gap-4 mb-8">
        <button onClick={() => navigate(`${routePrefix}/profile`)} className="w-9 h-9 bg-white rounded-xl shadow-sm border border-slate-100 flex items-center justify-center text-slate-600 hover:text-slate-900 active:scale-95 transition-all">
          <ArrowLeft size={18} strokeWidth={2.5} />
        </button>
        <div>
          <h1 className="text-lg font-black text-slate-900 uppercase tracking-tight">Documents</h1>
          <div className="h-0.5 w-8 bg-emerald-500 rounded-full mt-0.5" />
        </div>
      </header>

      <AnimatePresence>
        {selectedDoc ? (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-6">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white p-6 rounded-[1.8rem] shadow-2xl space-y-4 max-w-[320px] w-full text-center">
              <div className="flex justify-between items-start">
                <div className="w-10 h-10 bg-slate-50 text-slate-900 rounded-xl flex items-center justify-center border border-slate-100">
                  <FileText size={20} strokeWidth={2.5} />
                </div>
                <button onClick={() => setSelectedDoc(null)} className="w-8 h-8 bg-slate-50 hover:bg-slate-100 rounded-full flex items-center justify-center text-slate-400 transition-colors">
                  <X size={18} strokeWidth={2.5} />
                </button>
              </div>
              <div className="text-left space-y-0.5">
                <h4 className="text-base font-black text-slate-900 leading-tight uppercase tracking-tight">{selectedDoc.name}</h4>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{selectedDoc.templateName}</p>
              </div>
              <div className="aspect-[4/3] bg-slate-50 rounded-2xl flex items-center justify-center border border-slate-100 shadow-inner group overflow-hidden">
                {selectedDoc.previewUrl ? (
                  <img src={selectedDoc.previewUrl} alt={selectedDoc.name} className="w-full h-full object-cover" />
                ) : (
                  <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">No Preview Available</p>
                )}
              </div>
              {selectedDoc.reason ? (
                <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-left">
                  <p className="text-[9px] font-black uppercase tracking-widest text-rose-500">Admin Feedback</p>
                  <p className="mt-1 text-[11px] font-semibold leading-relaxed text-rose-700">{selectedDoc.reason}</p>
                </div>
              ) : null}
              <button onClick={() => setSelectedDoc(null)} className="w-full h-11 bg-slate-900 text-white rounded-xl text-[12px] font-black uppercase tracking-widest active:scale-95 transition-all">
                Close Viewer
              </button>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {expiryModal.isOpen ? (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-6">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white p-6 rounded-[1.8rem] shadow-2xl space-y-5 max-w-[360px] w-full">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h4 className="text-base font-black text-slate-900 uppercase tracking-tight">Update Expiry Date</h4>
                  <p className="mt-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{expiryModal.name}</p>
                </div>
                <button onClick={closeExpiryModal} className="w-8 h-8 bg-slate-50 hover:bg-slate-100 rounded-full flex items-center justify-center text-slate-400 transition-colors">
                  <X size={18} strokeWidth={2.5} />
                </button>
              </div>

              <label className="block">
                <span className="mb-2 inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                  <CalendarDays size={13} />
                  Expiry Date
                </span>
                <input
                  type="date"
                  value={expiryModal.value}
                  onChange={(event) => setExpiryModal((prev) => ({ ...prev, value: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900 outline-none transition-colors focus:border-emerald-200 focus:bg-white"
                />
              </label>

              <div className="flex gap-3">
                <button onClick={closeExpiryModal} className="flex-1 h-11 rounded-xl bg-slate-100 text-[12px] font-black uppercase tracking-widest text-slate-600 transition-all active:scale-95">
                  Cancel
                </button>
                <button
                  onClick={handleExpirySave}
                  disabled={expiryModal.isSubmitting || !expiryModal.value}
                  className={`flex-1 h-11 rounded-xl text-[12px] font-black uppercase tracking-widest text-white transition-all ${
                    expiryModal.isSubmitting || !expiryModal.value
                      ? 'bg-slate-300'
                      : 'bg-emerald-600 active:scale-95'
                  }`}
                >
                  {expiryModal.isSubmitting ? 'Saving...' : 'Save Date'}
                </button>
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {metaModal.isOpen ? (
          <div className="fixed inset-0 z-[111] flex items-center justify-center bg-black/60 backdrop-blur-sm p-6">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white p-6 rounded-[1.8rem] shadow-2xl space-y-5 max-w-[360px] w-full">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h4 className="text-base font-black text-slate-900 uppercase tracking-tight">Document Details</h4>
                  <p className="mt-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{metaModal.name}</p>
                </div>
                <button onClick={closeMetaModal} className="w-8 h-8 bg-slate-50 hover:bg-slate-100 rounded-full flex items-center justify-center text-slate-400 transition-colors">
                  <X size={18} strokeWidth={2.5} />
                </button>
              </div>

              <label className="block">
                <span className="mb-2 inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                  <BadgeCheck size={13} />
                  {metaModal.mode === 'pan'
                    ? 'PAN Number'
                    : metaModal.mode === 'gst'
                      ? 'GSTIN'
                      : metaModal.mode === 'rc'
                        ? 'RC Number'
                        : metaModal.mode === 'bank'
                          ? 'Bank Account Number'
                        : 'License Number'}
                </span>
                <input
                  type="text"
                  value={metaModal.identifyNumber}
                  onChange={(event) => setMetaModal((prev) => ({ ...prev, identifyNumber: event.target.value.toUpperCase() }))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900 outline-none transition-colors focus:border-emerald-200 focus:bg-white"
                  placeholder={
                    metaModal.mode === 'pan'
                      ? 'Enter PAN number'
                      : metaModal.mode === 'gst'
                        ? 'Enter GSTIN'
                        : metaModal.mode === 'rc'
                          ? 'Enter RC number'
                          : metaModal.mode === 'bank'
                            ? 'Enter bank account number'
                          : 'Enter DL number'
                  }
                />
              </label>

              {metaModal.mode === 'bank' ? (
              <label className="block">
                <span className="mb-2 inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                  <BadgeCheck size={13} />
                  IFSC Code
                </span>
                <input
                  type="text"
                  value={metaModal.ifsc}
                  onChange={(event) => setMetaModal((prev) => ({ ...prev, ifsc: event.target.value.toUpperCase() }))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900 outline-none transition-colors focus:border-emerald-200 focus:bg-white"
                  placeholder="Enter IFSC code"
                />
              </label>
              ) : null}

              {metaModal.mode === 'bank' ? (
              <label className="block">
                <span className="mb-2 inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                  <BadgeCheck size={13} />
                  Account Holder Name
                </span>
                <input
                  type="text"
                  value={metaModal.accountHolderName}
                  onChange={(event) => setMetaModal((prev) => ({ ...prev, accountHolderName: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900 outline-none transition-colors focus:border-emerald-200 focus:bg-white"
                  placeholder="Enter account holder name"
                />
              </label>
              ) : null}

              {metaModal.mode === 'license' ? (
              <label className="block">
                <span className="mb-2 inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                  <CalendarDays size={13} />
                  Birth Date
                </span>
                <input
                  type="date"
                  value={metaModal.birthDate}
                  onChange={(event) => setMetaModal((prev) => ({ ...prev, birthDate: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900 outline-none transition-colors focus:border-emerald-200 focus:bg-white"
                />
              </label>
              ) : null}

              {metaModal.mode === 'license' ? (
              <label className="block">
                <span className="mb-2 inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                  <BadgeCheck size={13} />
                  Request No
                </span>
                <input
                  type="text"
                  value={metaModal.requestNumber}
                  onChange={(event) => setMetaModal((prev) => ({ ...prev, requestNumber: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900 outline-none transition-colors focus:border-emerald-200 focus:bg-white"
                  placeholder="Optional override, otherwise generated automatically"
                />
              </label>
              ) : null}

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleMetaSave({ verify: false })}
                  disabled={
                    metaModal.isSubmitting ||
                    metaModal.isVerifying ||
                    !metaModal.identifyNumber ||
                    (metaModal.mode === 'license' && !metaModal.birthDate) ||
                    (metaModal.mode === 'bank' && (!metaModal.ifsc || !metaModal.accountHolderName))
                  }
                  className="h-11 rounded-xl bg-slate-100 text-[12px] font-black uppercase tracking-widest text-slate-700 transition-all active:scale-95 disabled:opacity-50"
                >
                  {metaModal.isSubmitting ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={() => handleMetaSave({ verify: true })}
                  disabled={
                    metaModal.isSubmitting ||
                    metaModal.isVerifying ||
                    !metaModal.identifyNumber ||
                    (metaModal.mode === 'license' && !metaModal.birthDate) ||
                    (metaModal.mode === 'bank' && (!metaModal.ifsc || !metaModal.accountHolderName))
                  }
                  className="h-11 rounded-xl bg-emerald-600 text-[12px] font-black uppercase tracking-widest text-white transition-all active:scale-95 disabled:opacity-50"
                >
                  {metaModal.isVerifying
                    ? 'Verifying...'
                    : metaModal.mode === 'pan'
                      ? 'Verify PAN'
                      : metaModal.mode === 'gst'
                        ? 'Verify GST'
                        : metaModal.mode === 'rc'
                          ? 'Verify RC'
                          : metaModal.mode === 'bank'
                            ? 'Verify Bank'
                          : 'Verify DL'}
                </button>
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>

      <main className="space-y-6">
        <div className="bg-white p-4.5 rounded-[1.8rem] border border-slate-100 shadow-[0_10px_30px_rgba(0,0,0,0.03)] flex items-center justify-between group active:scale-[0.99] transition-all">
          <div className="flex gap-4 items-center">
            <div className="w-12 h-12 bg-emerald-50 text-emerald-500 rounded-2xl flex items-center justify-center border border-emerald-100 shadow-sm">
              <CheckCircle2 size={24} strokeWidth={2.5} />
            </div>
            <div className="space-y-0.5">
              <h3 className="text-[14px] font-black tracking-tight leading-none text-slate-900 uppercase">
                {isLoading ? 'Loading Documents' : `${uploadedCount} Uploaded`}
              </h3>
              <p className="text-[10px] font-bold text-slate-400 opacity-60 leading-tight tracking-widest">
                {actionRequiredCount} Action Required
              </p>
            </div>
          </div>
          <button
            onClick={loadDriver}
            className={`text-[10px] font-black uppercase tracking-widest px-4 py-2.5 rounded-xl transition-all shadow-sm ${isSyncing ? 'bg-slate-100 text-slate-300' : 'bg-slate-900 text-white hover:bg-slate-800 active:scale-95'}`}
            disabled={isSyncing}
          >
            {isSyncing ? <Loader2 size={14} className="animate-spin" /> : 'Refresh'}
          </button>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest opacity-60 ml-2">Uploaded Documents</h3>
            <button className="text-[10px] font-black text-slate-600 uppercase tracking-widest border-b border-slate-200 pb-0.5">Audit Feed</button>
          </div>

          <div className="space-y-3">
            {error ? (
              <div className="bg-rose-50 border border-rose-100 text-rose-600 px-4 py-3 rounded-2xl text-[11px] font-bold">
                {error}
              </div>
            ) : null}

            {!error && docs.length === 0 ? (
              <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm text-center text-[11px] font-bold text-slate-400">
                No documents uploaded yet.
              </div>
            ) : (
              docs.map((doc) => (
                <div
                  key={doc.id}
                  onClick={() => setSelectedDoc(doc)}
                  className="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-[0_2px_15px_rgba(0,0,0,0.02)] flex items-center justify-between group active:scale-[0.99] transition-all relative cursor-pointer"
                >
                  <div className={`absolute top-3 bottom-3 left-0 w-1 rounded-r-full ${doc.verified ? 'bg-emerald-500' : doc.status === 'Uploaded' ? 'bg-blue-500' : 'bg-rose-500'}`} />

                  <div className="flex items-center gap-3.5 overflow-hidden">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-slate-50 text-slate-400 group-hover:bg-slate-900 group-hover:text-white transition-all flex-shrink-0">
                      <FileText size={18} strokeWidth={2.5} />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-[13px] font-black text-slate-900 leading-tight uppercase truncate">{doc.name}</h4>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">{doc.date}</p>
                        {doc.expiryDate && (
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 ${doc.expired ? 'text-rose-500' : 'text-slate-500'}`}>
                            {doc.expired ? 'Expired' : 'Exp'} {formatExpiryDate(doc.expiryDate)}
                          </span>
                        )}
                        {doc.identifyNumber && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                            {doc.identifyNumber}
                          </span>
                        )}
                        {doc.requestNumber && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                            Req {doc.requestNumber.slice(0, 8)}
                          </span>
                        )}
                      </div>
                      
                      {doc.reverificationPending && (
                        <p className="text-[9px] font-bold text-blue-500 mt-1 leading-tight max-w-[180px]">
                          Waiting for admin verification
                        </p>
                      )}
                      {doc.reason && !doc.reverificationPending && (
                        <p className="text-[9px] font-bold text-rose-500 mt-1 leading-tight max-w-[180px] line-clamp-1">
                          {doc.reason}
                        </p>
                      )}
                      {doc.rawDocument?.verificationMessage && doc.verified && (
                        <p className="text-[9px] font-bold text-emerald-600 mt-1 leading-tight max-w-[180px] line-clamp-1">
                          {doc.rawDocument.verificationMessage}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border shadow-sm ${
                      doc.verified
                        ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                        : doc.reverificationPending
                          ? 'bg-blue-50 text-blue-600 border-blue-100'
                        : doc.rejected || doc.expired
                          ? 'bg-rose-50 text-rose-600 border-rose-100'
                        : doc.status === 'Uploaded'
                          ? 'bg-blue-50 text-blue-600 border-blue-100'
                          : 'bg-rose-50 text-rose-600 border-rose-100'
                    }`}>
                      {doc.status === 'Pending Reverification' ? 'Pending' : doc.status}
                    </span>
                    
                    <div className="flex items-center gap-1.5 ml-1">
                      {isDrivingLicenseDocument(doc) || isPanDocument(doc) || isGstDocument(doc) || isRcDocument(doc) || isBankDocument(doc) ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setMetaModal({
                              isOpen: true,
                              mode: isPanDocument(doc)
                                ? 'pan'
                                : isGstDocument(doc)
                                  ? 'gst'
                                  : isRcDocument(doc)
                                    ? 'rc'
                                    : isBankDocument(doc)
                                      ? 'bank'
                                    : 'license',
                              docId: doc.id,
                              name: doc.name,
                              identifyNumber: doc.identifyNumber || '',
                              birthDate: toDateInputValue(doc.birthDate),
                              requestNumber: doc.requestNumber || '',
                              ifsc: doc.ifsc || '',
                              accountHolderName: doc.accountHolderName || '',
                              isSubmitting: false,
                              isVerifying: false,
                            });
                          }}
                          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 text-[10px] font-black uppercase tracking-widest text-emerald-600 transition-all hover:bg-emerald-100 active:scale-90"
                        >
                          <ShieldCheck size={13} strokeWidth={2.5} />
                          <span>
                            {isPanDocument(doc)
                              ? doc.verified ? 'View PAN' : 'Verify PAN'
                              : isGstDocument(doc)
                                ? doc.verified ? 'View GST' : 'Verify GST'
                                : isRcDocument(doc)
                                  ? doc.verified ? 'View RC' : 'Verify RC'
                                  : isBankDocument(doc)
                                    ? doc.verified ? 'View Bank' : 'Verify Bank'
                              : doc.verified ? 'View DL' : 'Verify DL'}
                          </span>
                        </button>
                      ) : null}
                      {doc.hasExpiryDate ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setExpiryModal({
                              isOpen: true,
                              docId: doc.id,
                              name: doc.name,
                              value: toDateInputValue(doc.expiryDate),
                              isSubmitting: false,
                            });
                          }}
                          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-amber-50 px-2.5 text-[10px] font-black uppercase tracking-widest text-amber-600 transition-all hover:bg-amber-100 active:scale-90"
                        >
                          <CalendarDays size={13} strokeWidth={2.5} />
                          <span>{doc.expiryDate ? 'Edit Date' : 'Add Date'}</span>
                        </button>
                      ) : null}
                      <label
                        onClick={(event) => event.stopPropagation()}
                        className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-2.5 text-[10px] font-black uppercase tracking-widest transition-all ${
                          imageUploading && uploadingDocumentKey === doc.id
                            ? 'bg-slate-100 text-slate-400 cursor-wait'
                            : 'bg-blue-50 text-blue-600 cursor-pointer hover:bg-blue-100 active:scale-90'
                        }`}
                      >
                        {imageUploading && uploadingDocumentKey === doc.id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Camera size={13} strokeWidth={2.5} />
                        )}
                        <span>{doc.hasDocument ? 'Re-upload' : 'Upload'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          ref={(node) => {
                            if (node) documentInputRefs.current[doc.id] = node;
                            else delete documentInputRefs.current[doc.id];
                          }}
                          disabled={imageUploading}
                          onChange={(event) => {
                            uploadingDocumentKeyRef.current = doc.id;
                            setUploadingDocumentKey(doc.id);
                            onDocumentImageChange(event);
                          }}
                        />
                      </label>
                      <div className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-300 group-hover:text-slate-400 transition-colors">
                        <Eye size={14} strokeWidth={2.5} />
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default DriverDocuments;
