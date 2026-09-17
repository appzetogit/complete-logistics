import React, { useEffect, useMemo, useRef, useState } from 'react';
import { 
    ArrowLeft, 
    Camera, 
    CheckCircle2, 
    FileText, 
    ImagePlus,
    ShieldCheck, 
    AlertCircle,
    ChevronRight,
    UploadCloud
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  clearDriverRegistrationSession,
  completeDriverOnboarding,
  getDriverDocumentTemplates,
  getStoredDriverRegistrationSession,
  persistDriverAuthSession,
  saveDriverDocuments,
  saveDriverRegistrationSession,
  verifyDriverOnboardingLicenseDocument,
} from '../../services/registrationService';
import {
  flattenDriverDocumentFields,
  getDocumentPreviewUrl,
  normalizeDriverDocumentTemplates,
} from '../../utils/documentTemplates';

const unwrap = (response) => response?.data?.data || response?.data || response;

const normalizeDocument = (doc) => {
  if (!doc) {
    return null;
  }

  if (typeof doc === 'string') {
    return {
      previewUrl: doc,
      secureUrl: doc,
      uploaded: true,
    };
  }

  return {
    ...doc,
    previewUrl: getDocumentPreviewUrl(doc),
    uploaded: doc.uploaded ?? Boolean(getDocumentPreviewUrl(doc)),
    identifyNumber: String(doc.identifyNumber || doc.identify_number || doc.documentNumber || doc.document_number || '').trim(),
    expiryDate: String(doc.expiryDate || doc.expiry_date || doc.expiry || doc.expiresAt || '').trim(),
  };
};

const getDocumentIdentifyValue = (doc) =>
  String(doc?.identifyNumber || doc?.identify_number || doc?.documentNumber || doc?.document_number || '').trim();

const getDocumentExpiryValue = (doc) =>
  String(doc?.expiryDate || doc?.expiry_date || doc?.expiry || doc?.expiresAt || '').trim();

const getDocumentBirthDateValue = (doc) =>
  String(doc?.birthDate || doc?.birth_date || '').trim();

const getDocumentRequestNumberValue = (doc) =>
  String(doc?.requestNumber || doc?.request_no || '').trim();

const getDocumentIfscValue = (doc) =>
  String(doc?.ifsc || doc?.ifscCode || doc?.ifsc_code || '').trim().toUpperCase();

const getDocumentAccountHolderNameValue = (doc) =>
  String(
    doc?.accountHolderName ||
    doc?.account_holder_name ||
    doc?.beneficiaryName ||
    doc?.benificiary_name ||
    '',
  ).trim();

const normalizeVerificationType = (value) => {
  const normalized = String(value || 'none').trim().toLowerCase();
  return ['driving_license', 'pan', 'gstin', 'rc', 'bank_account'].includes(normalized) ? normalized : 'none';
};

const templateNeedsBirthDate = (template = {}) =>
  normalizeVerificationType(template?.verification_type) === 'driving_license';

const templateSupportsRequestNumber = (template = {}) =>
  normalizeVerificationType(template?.verification_type) === 'driving_license';

const getDrivingLicenseVerificationDetails = (document = {}) =>
  [
    { key: 'verifiedName', label: 'Name' },
    { key: 'verifiedDob', label: 'Date of Birth' },
    { key: 'dlStatus', label: 'DL Status' },
    { key: 'issuingRtoName', label: 'Issuing RTO' },
    { key: 'relativeName', label: 'Relative Name' },
    { key: 'requestNumber', label: 'Request Number' },
  ]
    .map(({ key, label }) => ({
      key,
      label,
      value: String(document?.[key] || document?.[key === 'requestNumber' ? 'request_no' : ''] || '').trim(),
    }))
    .filter((item) => item.value);

const buildTemplateMetaState = (templates = [], documents = {}) =>
  Object.fromEntries(
    templates.map((template) => {
      const templateFields = Array.isArray(template.fields) ? template.fields : [];
      const firstDocument = templateFields
        .map((field) => normalizeDocument(documents?.[field.key]))
        .find(Boolean);

      return [
        template.id,
        {
          identifyNumber: getDocumentIdentifyValue(firstDocument),
          expiryDate: getDocumentExpiryValue(firstDocument),
          birthDate: getDocumentBirthDateValue(firstDocument),
          requestNumber: getDocumentRequestNumberValue(firstDocument),
          ifsc: getDocumentIfscValue(firstDocument),
          accountHolderName: getDocumentAccountHolderNameValue(firstDocument),
        },
      ];
    }),
  );

const formatMetaLabel = (value) =>
  String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });

const NATIVE_CAMERA_BRIDGE_TIMEOUT_MS = 20_000;
const buildDocumentCameraInputId = (key = '') => `driver-document-camera-${String(key)}`;

const loadImageFromDataUrl = (dataUrl) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to process image'));
    image.src = dataUrl;
  });

const optimizeImageFileForUpload = async (
  file,
  {
    maxSide = 1600,
    initialQuality = 0.82,
    minQuality = 0.45,
    maxDataUrlLength = 8_500_000,
  } = {},
) => {
  const originalDataUrl = await fileToDataUrl(file);
  if (!String(originalDataUrl || '').startsWith('data:image/')) {
    throw new Error('Please upload an image file');
  }

  if (typeof document === 'undefined') {
    return originalDataUrl;
  }

  const image = await loadImageFromDataUrl(originalDataUrl);
  const largestSide = Math.max(image.width, image.height, 1);
  const scale = largestSide > maxSide ? maxSide / largestSide : 1;
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement('canvas');

  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) {
    return originalDataUrl;
  }

  context.drawImage(image, 0, 0, width, height);

  let quality = initialQuality;
  let compressed = canvas.toDataURL('image/jpeg', quality);

  while (compressed.length > maxDataUrlLength && quality > minQuality) {
    quality -= 0.08;
    compressed = canvas.toDataURL('image/jpeg', quality);
  }

  return compressed;
};

const prepareImageFileForUpload = async (file) => {
  const originalDataUrl = await fileToDataUrl(file);
  if (!String(originalDataUrl || '').startsWith('data:image/')) {
    throw new Error('Please upload an image file');
  }

  try {
    return await optimizeImageFileForUpload(file);
  } catch (error) {
    console.warn('Image optimization skipped; uploading original image instead.', error);
    return originalDataUrl;
  }
};

const withBridgeTimeout = (promise, timeoutMs = NATIVE_CAMERA_BRIDGE_TIMEOUT_MS) =>
  Promise.race([
    promise,
    new Promise((_, reject) => {
      const timer = setTimeout(() => {
        clearTimeout(timer);
        reject(new Error('The camera is taking too long to respond. Please try again.'));
      }, timeoutMs);
    }),
  ]);

const isNativeCameraBridgeAvailable = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  return Boolean(
    window?.Rydon24Native?.captureInspectionPhoto
      || window?.__nativeServiceCenterCamera
      || window?.flutter_inappwebview?.callHandler,
  );
};

const normalizeNativeCameraBridgeResult = (result) => {
  if (!result) {
    return null;
  }

  if (typeof result === 'string') {
    const trimmed = result.trim();
    if (trimmed.startsWith('data:image/')) {
      return { dataUrl: trimmed, mimeType: 'image/jpeg', fileName: '' };
    }
    return null;
  }

  if (result.success === false) {
    return null;
  }

  const mimeType = String(result.mimeType || result.type || 'image/jpeg').trim() || 'image/jpeg';
  const rawBase64 = String(result.base64 || result.base64Data || result.imageBase64 || result.previewBase64 || '').trim();
  const dataUrl = String(
    result.dataUrl
      || result.image
      || result.base64Image
      || result.previewImage
      || (rawBase64 ? `data:${mimeType};base64,${rawBase64}` : '')
      || '',
  ).trim();

  if (!dataUrl.startsWith('data:image/')) {
    return null;
  }

  return {
    dataUrl,
    mimeType,
    fileName: String(result.fileName || '').trim(),
  };
};

const normalizeSignupRole = (role) =>
  String(role || 'driver').toLowerCase() === 'owner' ? 'owner' : 'driver';

const matchesDocumentRole = (accountType, role) => {
  const rawAccountType = String(accountType || '').trim().toLowerCase();
  const normalizedAccountType = rawAccountType || 'individual';
  const normalizedRole = normalizeSignupRole(role);

  if (normalizedAccountType === 'both') {
    return true;
  }

  if (normalizedRole === 'owner') {
    if (!rawAccountType) {
      return true;
    }

    return ['fleet_drivers', 'owner', 'owners', 'fleet_owner', 'fleet_owners'].includes(normalizedAccountType);
  }

  return normalizedAccountType === 'individual';
};

const isImageLikeFile = (file) => {
  if (!file) {
    return false;
  }

  if (String(file.type || '').startsWith('image/')) {
    return true;
  }

  return /\.(jpg|jpeg|png|webp|heic|heif|bmp|gif)$/i.test(String(file.name || ''));
};

const inferImageMeta = (file, dataUrl) => {
  const mimeMatch = String(dataUrl || '').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/i);
  const mimeType = String(file?.type || mimeMatch?.[1] || 'image/jpeg').toLowerCase();
  const extension = mimeType.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
  const originalName = String(file?.name || '').trim();

  return {
    mimeType,
    fileName: originalName || `capture-${Date.now()}.${extension}`,
  };
};

const StepDocuments = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const routePrefix = location.pathname.startsWith('/taxi/owner')
    ? '/taxi/owner'
    : '/taxi/driver';
  const session = getStoredDriverRegistrationSession();
  const isHandlingHistoryNavigationRef = useRef(false);
  const isMetaInitializedRef = useRef(false);
  const normalizedRole = normalizeSignupRole(session.role);
  const phone = String(session.phone || '').replace(/\D/g, '').slice(-10);
  const registrationId = String(session.registrationId || '').trim();

  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [docs, setDocs] = useState(() =>
    Object.fromEntries(
      Object.entries(session.documents || {}).map(([key, value]) => [key, normalizeDocument(value)]),
    ),
  );
  const [documentMeta, setDocumentMeta] = useState(() => session.documentMeta || {});
  const [uploading, setUploading] = useState(null);
  const [verifyingTemplateId, setVerifyingTemplateId] = useState('');
  const [verificationMessages, setVerificationMessages] = useState({});
  const [verificationErrors, setVerificationErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!phone || !registrationId) {
      navigate(`${routePrefix}/reg-phone`, { replace: true });
    }
  }, [navigate, phone, registrationId, routePrefix]);

  useEffect(() => {
    const loadTemplates = async () => {
      setTemplatesLoading(true);

      try {
        const response = await getDriverDocumentTemplates(normalizedRole);
        const results = response?.data?.data?.results || response?.data?.results || [];
        setTemplates(normalizeDriverDocumentTemplates(results));
      } catch {
        setTemplates(normalizeDriverDocumentTemplates([]));
      } finally {
        setTemplatesLoading(false);
      }
    };

    loadTemplates();
  }, [normalizedRole]);

  const documentTemplates = useMemo(
    () =>
      normalizeDriverDocumentTemplates(templates).filter((template) =>
        matchesDocumentRole(template.account_type, normalizedRole),
      ),
    [normalizedRole, templates],
  );
  const uploadFields = useMemo(
    () => flattenDriverDocumentFields(documentTemplates),
    [documentTemplates],
  );
  const requiredUploadFields = useMemo(
    () => uploadFields.filter((item) => Boolean(item.isRequired)),
    [uploadFields],
  );
  const templateFieldMap = useMemo(
    () =>
      Object.fromEntries(
        documentTemplates.map((template) => [template.id, Array.isArray(template.fields) ? template.fields : []]),
      ),
    [documentTemplates],
  );

  useEffect(() => {
    if (documentTemplates.length > 0 && !isMetaInitializedRef.current) {
      setDocumentMeta(buildTemplateMetaState(documentTemplates, docs));
      isMetaInitializedRef.current = true;
    }
  }, [documentTemplates, docs]);

  useEffect(() => {
    saveDriverRegistrationSession({
      ...getStoredDriverRegistrationSession(),
      ...session,
      documents: docs,
      documentMeta,
    });
  }, [docs, documentMeta]);

  const buildCurrentSession = () => saveDriverRegistrationSession({
    ...getStoredDriverRegistrationSession(),
    ...session,
    documents: docs,
    documentMeta,
  });

  const handleBackNavigation = () => {
    const shouldLeave = window.confirm(
      'Go back to vehicle setup? Your uploaded documents will stay saved.',
    );

    if (!shouldLeave) {
      return false;
    }

    isHandlingHistoryNavigationRef.current = true;
    buildCurrentSession();
    navigate(`${routePrefix}/step-vehicle`, { replace: true });
    return true;
  };

  useEffect(() => {
    window.history.pushState({ onboardingStep: 'documents' }, '', window.location.href);

    const handlePopState = () => {
      if (isHandlingHistoryNavigationRef.current) {
        return;
      }

      const didLeave = handleBackNavigation();
      if (!didLeave) {
        window.history.pushState({ onboardingStep: 'documents' }, '', window.location.href);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [routePrefix, docs, documentMeta]);

  const applyTemplateMetaToDocuments = (templateId, templateDocuments, metaOverride = null) => {
    const meta = metaOverride || documentMeta[templateId] || {
      identifyNumber: '',
      expiryDate: '',
      birthDate: '',
      requestNumber: '',
      ifsc: '',
      accountHolderName: '',
    };
    const identifyNumber = String(meta.identifyNumber || '').trim();
    const expiryDate = String(meta.expiryDate || '').trim();
    const birthDate = String(meta.birthDate || '').trim();
    const requestNumber = String(meta.requestNumber || '').trim();
    const ifsc = String(meta.ifsc || '').trim().toUpperCase();
    const accountHolderName = String(meta.accountHolderName || '').trim();

    return Object.fromEntries(
      Object.entries(templateDocuments).map(([docKey, docValue]) => [
        docKey,
        docValue
          ? {
              ...docValue,
              identifyNumber,
              identify_number: identifyNumber,
              documentNumber: identifyNumber,
              document_number: identifyNumber,
              expiryDate,
              expiry_date: expiryDate,
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
            }
          : docValue,
      ]),
    );
  };

  const handleMetaChange = (templateId, fieldName, nextValue) => {
    const nextMeta = {
      ...(documentMeta[templateId] || {}),
      [fieldName]: nextValue,
    };

    setDocumentMeta((current) => ({
      ...current,
      [templateId]: nextMeta,
    }));

    const templateFields = templateFieldMap[templateId] || [];
    if (templateFields.length === 0) {
      return;
    }

    setDocs((current) => {
      const nextDocuments = { ...current };
      for (const field of templateFields) {
        if (!nextDocuments[field.key]) {
          continue;
        }

        nextDocuments[field.key] = applyTemplateMetaToDocuments(
          templateId,
          { [field.key]: nextDocuments[field.key] },
          nextMeta,
        )[field.key];
      }
      return nextDocuments;
    });
  };

  const uploadDocumentFromSource = async ({ templateId, key, dataUrl, fileName = '', mimeType = 'image/jpeg' }) => {
    setUploading(key);
    setError('');

    try {
      const effectiveMimeType = String(mimeType || '').trim() || 'image/jpeg';
      const effectiveFileName = String(fileName || '').trim()
        || `capture-${Date.now()}.${effectiveMimeType.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg'}`;

      setDocs((prev) => ({
        ...prev,
        [key]: {
          ...(prev[key] || {}),
          previewUrl: dataUrl,
          fileName: effectiveFileName,
          mimeType: effectiveMimeType,
          uploaded: false,
          uploading: true,
        },
      }));

      const response = await saveDriverDocuments({
        registrationId: session.registrationId,
        phone: session.phone,
        documents: {
          [key]: {
            dataUrl,
            fileName: effectiveFileName,
            mimeType: effectiveMimeType,
            identifyNumber: documentMeta[templateId]?.identifyNumber || '',
            expiryDate: documentMeta[templateId]?.expiryDate || '',
            birthDate: documentMeta[templateId]?.birthDate || '',
            requestNumber: documentMeta[templateId]?.requestNumber || '',
            ifsc: documentMeta[templateId]?.ifsc || '',
            accountHolderName: documentMeta[templateId]?.accountHolderName || '',
          },
        },
      });
      const payload = unwrap(response);

      const uploadedDoc = payload?.documents?.[key] || payload?.session?.documents?.[key];
      const nextDoc = normalizeDocument(uploadedDoc) || {
        previewUrl: dataUrl,
        secureUrl: dataUrl,
        fileName: effectiveFileName,
        mimeType: effectiveMimeType,
        uploaded: true,
      };
      const nextDocWithMeta = applyTemplateMetaToDocuments(templateId, {
        [key]: {
          ...(docs[key] || {}),
          ...nextDoc,
        },
      })[key];

      setDocs((prev) => ({
        ...prev,
        [key]: nextDocWithMeta,
      }));

      const storedSession = getStoredDriverRegistrationSession();
      saveDriverRegistrationSession({
        ...storedSession,
        ...session,
        documents: {
          ...(storedSession.documents || {}),
          [key]: nextDocWithMeta,
        },
      });
    } catch (uploadError) {
      setError(uploadError?.message || 'Unable to upload document');
      setDocs((prev) => ({
        ...prev,
        [key]: normalizeDocument(session.documents?.[key]),
      }));
    } finally {
      setUploading(null);
    }
  };

  const handleFileChange = async (templateId, key, event) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    try {
      const dataUrl = isImageLikeFile(file)
        ? await prepareImageFileForUpload(file)
        : await fileToDataUrl(file);
      const inferred = inferImageMeta(file, dataUrl);

      await uploadDocumentFromSource({
        templateId,
        key,
        dataUrl,
        fileName: inferred.fileName,
        mimeType: inferred.mimeType,
      });
    } catch (error) {
      setError(error?.message || 'Unable to upload document');
    }
  };

  const triggerCameraFileInput = (key) => {
    if (typeof document === 'undefined') {
      return;
    }

    document.getElementById(buildDocumentCameraInputId(key))?.click();
  };

  const handleCameraCapture = async (templateId, key, label) => {
    if (!isNativeCameraBridgeAvailable()) {
      triggerCameraFileInput(key);
      return;
    }

    const payload = {
      type: 'driver_document_capture',
      action: 'capture',
      key,
      label,
      registrationId: session.registrationId,
      phone: session.phone,
      source: 'driver_documents',
    };

    try {
      let normalizedResult = null;

      if (typeof window?.Rydon24Native?.captureInspectionPhoto === 'function') {
        normalizedResult = normalizeNativeCameraBridgeResult(
          await withBridgeTimeout(window.Rydon24Native.captureInspectionPhoto(payload)),
        );
      }

      if (!normalizedResult && typeof window?.__nativeServiceCenterCamera === 'function') {
        normalizedResult = normalizeNativeCameraBridgeResult(
          await withBridgeTimeout(window.__nativeServiceCenterCamera(payload)),
        );
      }

      if (!normalizedResult && window?.flutter_inappwebview?.callHandler) {
        const handlers = [
          'captureInspectionPhoto',
          'cameraCapture',
          'serviceCenterInspectionPhoto',
          'serviceCenterCamera',
          'openCamera',
        ];

        for (const handlerName of handlers) {
          try {
            const result = handlerName === 'openCamera'
              ? await withBridgeTimeout(window.flutter_inappwebview.callHandler(handlerName))
              : await withBridgeTimeout(window.flutter_inappwebview.callHandler(handlerName, payload));
            normalizedResult = normalizeNativeCameraBridgeResult(result);
            if (normalizedResult?.dataUrl) {
              break;
            }
          } catch {
            // Try the next bridge handler name.
          }
        }
      }

      if (!normalizedResult?.dataUrl) {
        triggerCameraFileInput(key);
        return;
      }

      await uploadDocumentFromSource({
        templateId,
        key,
        dataUrl: normalizedResult.dataUrl,
        fileName: normalizedResult.fileName,
        mimeType: normalizedResult.mimeType,
      });
    } catch (error) {
      setError(error?.message || 'Unable to open the camera');
      triggerCameraFileInput(key);
    }
  };

  const handleVerifyDrivingLicense = async (template) => {
    const templateId = String(template?.id || '').trim();
    const templateFields = templateFieldMap[templateId] || [];
    const primaryField = templateFields[0];
    const documentKey = String(primaryField?.key || '').trim();
    const meta = documentMeta[templateId] || {};
    const identifyNumber = String(meta.identifyNumber || '').trim().toUpperCase();
    const birthDate = String(meta.birthDate || '').trim();
    const requestNumber = String(meta.requestNumber || '').trim();

    if (!templateId || !documentKey) {
      setVerificationErrors((prev) => ({
        ...prev,
        [templateId]: 'Driving license document is not configured properly',
      }));
      return;
    }

    if (!identifyNumber) {
      setVerificationErrors((prev) => ({
        ...prev,
        [templateId]: 'Enter the driving license number first',
      }));
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
      setVerificationErrors((prev) => ({
        ...prev,
        [templateId]: 'Enter the birth date in YYYY-MM-DD format',
      }));
      return;
    }

    setVerifyingTemplateId(templateId);
    setVerificationErrors((prev) => ({ ...prev, [templateId]: '' }));
    setVerificationMessages((prev) => ({ ...prev, [templateId]: '' }));
    setError('');

    try {
      const response = await verifyDriverOnboardingLicenseDocument(documentKey, {
        registrationId: session.registrationId,
        phone: session.phone,
        licenseNumber: identifyNumber,
        birthDate,
        requestNumber,
      });

      const payload = unwrap(response);
      const verifiedDocument = normalizeDocument(payload?.document);

      if (verifiedDocument) {
        setDocs((current) => ({
          ...current,
          [documentKey]: {
            ...(current[documentKey] || {}),
            ...verifiedDocument,
            uploaded: current[documentKey]?.uploaded ?? verifiedDocument.uploaded ?? false,
          },
        }));
      }

      const nextRequestNumber = String(
        verifiedDocument?.requestNumber ||
        verifiedDocument?.request_no ||
        requestNumber,
      ).trim();

      setDocumentMeta((current) => ({
        ...current,
        [templateId]: {
          ...(current[templateId] || {}),
          identifyNumber,
          birthDate,
          requestNumber: nextRequestNumber,
        },
      }));

      setVerificationMessages((prev) => ({
        ...prev,
        [templateId]: String(payload?.message || 'Driving license verified successfully').trim(),
      }));
    } catch (requestError) {
      setVerificationErrors((prev) => ({
        ...prev,
        [templateId]: requestError?.message || 'Unable to verify driving license',
      }));
    } finally {
      setVerifyingTemplateId('');
    }
  };

  const isComplete =
    requiredUploadFields.every((item) => Boolean(docs[item.key]?.uploaded || docs[item.key]?.secureUrl)) &&
    documentTemplates.every((template) => {
      if (!template.is_required) {
        return true;
      }

      const meta = documentMeta[template.id] || {};
      const hasIdentifyNumber = !template.has_identify_number || Boolean(String(meta.identifyNumber || '').trim());
      const hasExpiryDate = !template.has_expiry_date || Boolean(String(meta.expiryDate || '').trim());
      const hasBirthDate = !templateNeedsBirthDate(template) || /^\d{4}-\d{2}-\d{2}$/.test(String(meta.birthDate || '').trim());
      const needsBankMeta = normalizeVerificationType(template.verification_type) === 'bank_account';
      const hasBankMeta = !needsBankMeta || (
        Boolean(String(meta.ifsc || '').trim()) &&
        Boolean(String(meta.accountHolderName || '').trim())
      );
      return hasIdentifyNumber && hasExpiryDate && hasBirthDate && hasBankMeta;
    }) &&
    !uploading &&
    !templatesLoading;

  const handleSubmit = async () => {
    if (!isComplete) {
      setError(uploading ? 'Please wait for the current upload to finish' : 'Please upload every required document image');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const submittedDocuments = Object.fromEntries(
        Object.entries(docs).filter(([, value]) => Boolean(value?.uploaded || value?.secureUrl)),
      );
      const submittedDocumentsWithMeta = { ...submittedDocuments };

      for (const template of documentTemplates) {
        const templateFields = Array.isArray(template.fields) ? template.fields : [];
        const templateDocuments = Object.fromEntries(
          templateFields
            .filter((field) => submittedDocumentsWithMeta[field.key])
            .map((field) => [field.key, submittedDocumentsWithMeta[field.key]]),
        );

        if (Object.keys(templateDocuments).length === 0) {
          continue;
        }

        Object.assign(
          submittedDocumentsWithMeta,
          applyTemplateMetaToDocuments(template.id, templateDocuments),
        );
      }

      const submittedDocumentSummary = uploadFields.map((field) => ({
        key: field.key,
        label: field.label || field.templateName || field.key,
        status: submittedDocumentsWithMeta[field.key] ? 'pending' : 'missing',
        reason: '',
        verificationType: field.verificationType || 'none',
        providerStatus:
          submittedDocumentsWithMeta[field.key] && String(field.verificationType || 'none') !== 'none'
            ? 'queued'
            : 'not_started',
        providerMessage:
          submittedDocumentsWithMeta[field.key] && String(field.verificationType || 'none') !== 'none'
            ? 'Verification will start shortly'
            : '',
        previewUrl: String(
          submittedDocumentsWithMeta[field.key]?.previewUrl ||
          submittedDocumentsWithMeta[field.key]?.secureUrl ||
          submittedDocumentsWithMeta[field.key]?.url ||
          '',
        ).trim(),
        reverificationPending: false,
      }));

      const completeResponse = await completeDriverOnboarding({
        registrationId: session.registrationId,
        phone: session.phone,
        documents: submittedDocumentsWithMeta,
      });
      const payload = unwrap(completeResponse);

      const token = payload?.token;
      if (token) {
        const normalizedRole =
          String(session.role || 'driver').toLowerCase() === 'owner' ? 'owner' : 'driver';
        persistDriverAuthSession({ token, role: normalizedRole });
      }

      saveDriverRegistrationSession({
        ...session,
        documents: docs,
        completedRegistration: payload || null,
      });
      clearDriverRegistrationSession();
      navigate(`${routePrefix}/registration-status`, {
        replace: true,
        state: {
          role: normalizedRole,
          completedRegistration: payload || null,
          submittedDocumentSummary,
        },
      });
    } catch (submitError) {
      setError(submitError?.message || 'Unable to complete registration');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
        className="min-h-screen bg-[linear-gradient(180deg,#f6efe4_0%,#fcfaf6_28%,#ffffff_100%)] px-5 pb-32 pt-8 select-none overflow-x-hidden"
        style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}
    >
      <main className="mx-auto max-w-sm space-y-6">
        <header className="space-y-5">
            <div className="flex items-center justify-between">
                <button
                    onClick={handleBackNavigation}
                    className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/70 bg-white/80 text-slate-900 shadow-[0_10px_30px_rgba(15,23,42,0.08)] backdrop-blur-sm transition-transform active:scale-95"
                >
                    <ArrowLeft size={18} strokeWidth={2.5} />
                </button>
                <div className="rounded-full bg-slate-900/5 px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.15em] text-slate-500 border border-slate-900/5">
                    Step 4 of 4
                </div>
            </div>

            <section className="space-y-3">
                <div className="flex items-center gap-3">
                     <div className="flex h-11 w-11 items-center justify-center rounded-[1.25rem] bg-slate-900 text-white shadow-xl shadow-slate-900/10">
                        <ShieldCheck size={22} strokeWidth={2.5} />
                    </div>
                    <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 opacity-60">
                        Identity Verification
                    </span>
                </div>
                <h1 className="font-['Outfit'] text-[48px] font-black leading-[1] tracking-[-0.04em] text-slate-900">
                    KYC <span className="text-slate-400">Vault</span>
                </h1>
                <p className="text-[15px] leading-relaxed text-slate-500 font-bold opacity-80 max-w-[28ch]">
                    Upload clear photos of the required documents to verify your identity.
                </p>
            </section>
        </header>

        {error && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 shadow-[0_10px_30px_rgba(244,63,94,0.08)]">
                {error}
            </div>
        )}

        <div className="space-y-6">
          {templatesLoading ? (
            <div className="bg-white rounded-[2.5rem] p-12 text-center space-y-4 shadow-[0_10px_40px_rgba(0,0,0,0.04)] border border-slate-100">
              <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto animate-pulse">
                <FileText size={20} className="text-slate-300" />
              </div>
              <p className="text-[12px] font-black text-slate-400 uppercase tracking-widest">Loading checklist...</p>
            </div>
          ) : (
            documentTemplates.map((template) => (
              <section key={template.id} className="space-y-5 rounded-[2.5rem] border border-slate-100 bg-white p-6 shadow-[0_10px_40px_rgba(0,0,0,0.04)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1.5">
                    <h3 className="text-lg font-black tracking-tight text-slate-900">{template.name}</h3>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest opacity-60">
                           {template.fields.length > 1 ? 'Multiple Sides' : 'Single Side'}
                        </span>
                        <div className="w-1 h-1 rounded-full bg-slate-200" />
                        <span className={`text-[10px] font-black uppercase tracking-widest ${template.is_required ? 'text-emerald-600' : 'text-slate-400 opacity-60'}`}>
                          {template.is_required ? 'Mandatory' : 'Optional'}
                        </span>
                    </div>
                  </div>
                  <div className="rounded-full bg-slate-900/5 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-slate-500 border border-slate-900/5">
                    {template.account_type || 'individual'}
                  </div>
                </div>

                <div className="space-y-6">
                  {template.fields.map((field) => {
                    const document = docs[field.key];
                    const isUploading = uploading === field.key;
                    const isRequired = Boolean(field.required ?? field.isRequired);

                    return (
                      <div key={field.key} className="space-y-3">
                        <div className="flex items-center justify-between gap-2 px-1">
                          <label className="block text-[11px] font-black uppercase tracking-widest text-slate-400 opacity-80">{field.label}</label>
                          <span className={`text-[9px] font-black uppercase tracking-[0.15em] px-2 py-0.5 rounded-md ${isRequired ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-400'}`}>
                            {isRequired ? 'Required' : 'Optional'}
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-1 gap-3">
                            <div
                                className={`relative min-h-[160px] rounded-[1.8rem] border-2 transition-all overflow-hidden flex flex-col items-center justify-center gap-2 ${
                                    document?.previewUrl
                                        ? 'border-emerald-500/20 bg-emerald-50/10'
                                        : 'border-dashed border-slate-100 bg-slate-50 hover:border-slate-200'
                                }`}
                            >
                                {isUploading ? (
                                    <div className="flex flex-col items-center gap-3">
                                        <div className="w-6 h-6 border-2 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Uploading</span>
                                    </div>
                                ) : document?.previewUrl ? (
                                    <>
                                        <img src={document.previewUrl} alt={field.label} className="absolute inset-0 h-full w-full object-cover" />
                                        <div className="absolute inset-0 bg-black/10" />
                                        <div className="absolute bottom-4 right-4 w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center text-white shadow-xl border-2 border-white">
                                            <CheckCircle2 size={16} strokeWidth={3} />
                                        </div>
                                        <div className="absolute top-4 left-4 bg-black/40 backdrop-blur-md rounded-xl px-3 py-1.5 flex items-center gap-2 border border-white/20">
                                            <Camera size={12} className="text-white" />
                                            <span className="text-[10px] font-black text-white uppercase tracking-widest">Retake Photo</span>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="w-12 h-12 rounded-2xl bg-white text-slate-400 flex items-center justify-center shadow-sm border border-slate-100">
                                            <UploadCloud size={20} />
                                        </div>
                                        <div className="text-center">
                                            <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Tap to upload</p>
                                        </div>
                                        <div className="absolute top-4 right-4 w-8 h-8 rounded-xl bg-slate-900/5 flex items-center justify-center">
                                            <Camera size={14} className="text-slate-400" />
                                        </div>
                                    </>
                                )}
                            </div>

                            <div className="flex gap-2">
                                <label className={`flex-1 relative flex h-12 items-center justify-center gap-2 text-center rounded-2xl border text-[11px] font-black uppercase tracking-widest transition-all ${
                                    isUploading
                                    ? 'cursor-not-allowed border-slate-50 bg-slate-50 text-slate-300'
                                    : 'cursor-pointer border-slate-100 bg-white text-slate-600 hover:bg-slate-50 active:scale-[0.98]'
                                }`}>
                                    <ImagePlus size={16} />
                                    Gallery
                                    <input
                                    type="file"
                                    accept="image/*"
                                    disabled={isUploading}
                                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                                    aria-label={`Upload ${field.label} from gallery`}
                                    onChange={(event) => handleFileChange(template.id, field.key, event)}
                                    />
                                </label>
                                <button
                                    type="button"
                                    disabled={isUploading}
                                    onClick={() => handleCameraCapture(template.id, field.key, field.label)}
                                    className={`flex-1 relative flex h-12 items-center justify-center gap-2 text-center rounded-2xl border text-[11px] font-black uppercase tracking-widest transition-all ${
                                      isUploading
                                        ? 'cursor-not-allowed border-slate-50 bg-slate-50 text-slate-300'
                                        : 'cursor-pointer border-slate-900 bg-slate-900 text-white hover:bg-black shadow-lg shadow-slate-900/10 active:scale-[0.98]'
                                    }`}
                                >
                                    <Camera size={16} />
                                    Camera
                                    <input
                                    id={buildDocumentCameraInputId(field.key)}
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    disabled={isUploading}
                                    className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
                                    aria-label={`Capture ${field.label} from camera`}
                                    onChange={(event) => handleFileChange(template.id, field.key, event)}
                                    />
                                </button>
                            </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {(template.has_identify_number || template.has_expiry_date || normalizeVerificationType(template.verification_type) === 'bank_account') ? (
                  <div className="space-y-2 pt-2">
                    {normalizeVerificationType(template.verification_type) !== 'none' ? (
                      <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">
                        Verification details required for API check
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {(template.has_identify_number || template.has_expiry_date || templateNeedsBirthDate(template) || templateSupportsRequestNumber(template) || normalizeVerificationType(template.verification_type) === 'bank_account') ? (
                  <div className="space-y-4 pt-2">
                    {template.has_identify_number ? (
                      <div className="group rounded-[1.8rem] border-2 transition-all p-4 border-slate-50 bg-slate-50 focus-within:border-slate-900/10 focus-within:bg-white focus-within:shadow-xl focus-within:shadow-slate-900/5">
                        <div className="flex items-center gap-4">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm group-focus-within:bg-slate-900 group-focus-within:text-white transition-all">
                                <FileText size={20} strokeWidth={2.5} />
                            </div>
                            <div className="min-w-0 flex-1 space-y-0.5">
                                <label className="block text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 opacity-70">
                                    {formatMetaLabel(template.identify_number_key) || `${template.name} Number`}
                                </label>
                                <input
                                    type="text"
                                    value={documentMeta[template.id]?.identifyNumber || ''}
                                    onChange={(event) => handleMetaChange(template.id, 'identifyNumber', event.target.value.toUpperCase())}
                                    placeholder={`Enter ${formatMetaLabel(template.identify_number_key) || 'Number'}`}
                                    className="w-full border-none bg-transparent p-0 text-lg font-black text-slate-900 outline-none focus:ring-0 placeholder:text-slate-200"
                                />
                            </div>
                        </div>
                      </div>
                    ) : null}

                    {templateNeedsBirthDate(template) ? (
                      <div
                        onClick={(e) => {
                          const input = e.currentTarget.querySelector('input[type="date"]');
                          if (input) {
                            try {
                              input.showPicker();
                            } catch {
                              input.focus();
                              input.click();
                            }
                          }
                        }}
                        className="group cursor-pointer rounded-[1.8rem] border-2 transition-all p-4 border-slate-50 bg-slate-50 focus-within:border-slate-900/10 focus-within:bg-white focus-within:shadow-xl focus-within:shadow-slate-900/5"
                      >
                        <div className="flex items-center gap-4">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm group-focus-within:bg-slate-900 group-focus-within:text-white transition-all">
                            <AlertCircle size={20} strokeWidth={2.5} />
                          </div>
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <label className="block text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 opacity-70">
                              Birth Date
                            </label>
                            <input
                              type="date"
                              value={documentMeta[template.id]?.birthDate || ''}
                              onChange={(event) => handleMetaChange(template.id, 'birthDate', event.target.value)}
                              className="w-full border-none bg-transparent p-0 text-lg font-black text-slate-900 outline-none focus:ring-0"
                            />
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {template.has_expiry_date ? (
                      <div 
                        onClick={(e) => {
                          const input = e.currentTarget.querySelector('input[type="date"]');
                          if (input) {
                            try {
                              input.showPicker();
                            } catch {
                              input.focus();
                              input.click();
                            }
                          }
                        }}
                        className="group cursor-pointer rounded-[1.8rem] border-2 transition-all p-4 border-slate-50 bg-slate-50 focus-within:border-slate-900/10 focus-within:bg-white focus-within:shadow-xl focus-within:shadow-slate-900/5"
                      >
                        <div className="flex items-center gap-4">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm group-focus-within:bg-slate-900 group-focus-within:text-white transition-all">
                                <AlertCircle size={20} strokeWidth={2.5} />
                            </div>
                            <div className="min-w-0 flex-1 space-y-0.5">
                                <label className="block text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 opacity-70">
                                    Expiry Date
                                </label>
                                <input
                                    type="date"
                                    value={documentMeta[template.id]?.expiryDate || ''}
                                    onChange={(event) => handleMetaChange(template.id, 'expiryDate', event.target.value)}
                                    className="w-full border-none bg-transparent p-0 text-lg font-black text-slate-900 outline-none focus:ring-0"
                                />
                            </div>
                        </div>
                      </div>
                    ) : null}

                    {templateSupportsRequestNumber(template) ? (
                      <div className="group rounded-[1.8rem] border-2 transition-all p-4 border-slate-50 bg-slate-50 focus-within:border-slate-900/10 focus-within:bg-white focus-within:shadow-xl focus-within:shadow-slate-900/5">
                        <div className="flex items-center gap-4">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm group-focus-within:bg-slate-900 group-focus-within:text-white transition-all">
                            <FileText size={20} strokeWidth={2.5} />
                          </div>
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <label className="block text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 opacity-70">
                              Request Number
                            </label>
                            <input
                              type="text"
                              value={documentMeta[template.id]?.requestNumber || ''}
                              onChange={(event) => handleMetaChange(template.id, 'requestNumber', event.target.value)}
                              placeholder="Optional, auto-generated later if left blank"
                              className="w-full border-none bg-transparent p-0 text-lg font-black text-slate-900 outline-none focus:ring-0 placeholder:text-slate-200"
                            />
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {normalizeVerificationType(template.verification_type) === 'driving_license' ? (
                      <div className="space-y-3">
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => handleVerifyDrivingLicense(template)}
                            disabled={verifyingTemplateId === template.id}
                            className={`rounded-full px-4 py-2 text-[11px] font-black uppercase tracking-[0.15em] transition-colors ${
                              verifyingTemplateId === template.id
                                ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                                : 'bg-slate-900 text-white hover:bg-black'
                            }`}
                          >
                            {verifyingTemplateId === template.id ? 'Verifying...' : 'Verify DL'}
                          </button>
                        </div>
                        {verificationMessages[template.id] ? (
                          <p className="text-[10px] font-bold text-emerald-600 px-1">{verificationMessages[template.id]}</p>
                        ) : null}
                        {verificationErrors[template.id] ? (
                          <p className="text-[10px] font-bold text-amber-600 px-1">{verificationErrors[template.id]}</p>
                        ) : null}
                        {(() => {
                          const primaryField = (templateFieldMap[template.id] || [])[0];
                          const verifiedDoc = primaryField ? docs[primaryField.key] : null;
                          const details = getDrivingLicenseVerificationDetails(verifiedDoc);

                          if (details.length === 0) {
                            return null;
                          }

                          return (
                            <div className="rounded-[1.8rem] border border-emerald-100 bg-emerald-50/50 p-4">
                              <div className="flex items-center gap-2 px-1">
                                <ShieldCheck size={15} className="text-emerald-600" />
                                <p className="text-[10px] font-black uppercase tracking-[0.15em] text-emerald-700">
                                  Verified From DL
                                </p>
                              </div>
                              <div className="mt-3 grid grid-cols-2 gap-3">
                                {details.map((item) => (
                                  <div key={item.key} className="rounded-2xl bg-white/90 px-3 py-2">
                                    <p className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-400">{item.label}</p>
                                    <p className="mt-1 text-[12px] font-bold text-slate-900 break-words">{item.value}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    ) : null}

                    {normalizeVerificationType(template.verification_type) === 'bank_account' ? (
                      <div className="group rounded-[1.8rem] border-2 transition-all p-4 border-slate-50 bg-slate-50 focus-within:border-slate-900/10 focus-within:bg-white focus-within:shadow-xl focus-within:shadow-slate-900/5">
                        <div className="flex items-center gap-4">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm group-focus-within:bg-slate-900 group-focus-within:text-white transition-all">
                            <FileText size={20} strokeWidth={2.5} />
                          </div>
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <label className="block text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 opacity-70">
                              IFSC Code
                            </label>
                            <input
                              type="text"
                              value={documentMeta[template.id]?.ifsc || ''}
                              onChange={(event) => handleMetaChange(template.id, 'ifsc', event.target.value.toUpperCase())}
                              placeholder="Enter IFSC code"
                              className="w-full border-none bg-transparent p-0 text-lg font-black text-slate-900 outline-none focus:ring-0 placeholder:text-slate-200"
                            />
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {normalizeVerificationType(template.verification_type) === 'bank_account' ? (
                      <div className="group rounded-[1.8rem] border-2 transition-all p-4 border-slate-50 bg-slate-50 focus-within:border-slate-900/10 focus-within:bg-white focus-within:shadow-xl focus-within:shadow-slate-900/5">
                        <div className="flex items-center gap-4">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm group-focus-within:bg-slate-900 group-focus-within:text-white transition-all">
                            <FileText size={20} strokeWidth={2.5} />
                          </div>
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <label className="block text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 opacity-70">
                              Account Holder Name
                            </label>
                            <input
                              type="text"
                              value={documentMeta[template.id]?.accountHolderName || ''}
                              onChange={(event) => handleMetaChange(template.id, 'accountHolderName', event.target.value)}
                              placeholder="Enter account holder name"
                              className="w-full border-none bg-transparent p-0 text-lg font-black text-slate-900 outline-none focus:ring-0 placeholder:text-slate-200"
                            />
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </section>
            ))
          )}
        </div>

        <div className="bg-white/40 backdrop-blur-sm p-5 rounded-[2rem] flex gap-4 mt-6 border border-white/50 shadow-sm">
          <div className="w-10 h-10 rounded-2xl bg-amber-100 flex items-center justify-center shrink-0">
            <AlertCircle size={20} className="text-amber-600" />
          </div>
          <p className="text-[12px] font-black text-amber-900/60 leading-relaxed uppercase tracking-tight">
            Choose Gallery or Camera for each document. Ensure all photos are well-lit and all text is clearly readable to avoid rejection.
          </p>
        </div>

        <div className="fixed bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent">
            <div className="mx-auto max-w-sm">
                <motion.button
                    whileHover={{ scale: 1.02, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleSubmit}
                    disabled={loading || !isComplete}
                    className={`group flex h-16 w-full items-center justify-center gap-3 rounded-[1.8rem] text-[15px] font-black tracking-tight transition-all relative overflow-hidden ${
                        isComplete
                            ? 'bg-slate-900 text-white shadow-[0_20px_40px_rgba(0,0,0,0.2)] active:bg-black'
                            : 'pointer-events-none bg-slate-200 text-slate-400 shadow-none'
                    }`}
                >
                    {loading ? (
                        <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                        <>
                            <span className="relative z-10 uppercase tracking-widest">Review & Submit</span>
                            <ChevronRight size={18} strokeWidth={3} className="relative z-10 group-hover:translate-x-1 transition-transform" />
                        </>
                    )}
                </motion.button>
            </div>
        </div>
      </main>
    </div>
  );
};

export default StepDocuments;
