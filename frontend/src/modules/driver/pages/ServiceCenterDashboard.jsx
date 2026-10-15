import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  BadgeIndianRupee,
  Building2,
  Camera,
  CarFront,
  CheckCircle2,
  ClipboardList,
  Eye,
  ImagePlus,
  Loader2,
  LogOut,
  MapPin,
  Phone,
  Plus,
  RotateCcw,
  ShieldCheck,
  Trash2,
  UserRound,
  UserRoundPlus,
  Users,
  X,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Clock,
  Search,
  Mail,
  Shield,
  FileText,
  HandCoins,
  UserPlus
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { uploadService } from '../../../shared/services/uploadService';
import {
  captureServiceCenterBookingFingerprint,
  clearDriverAuthState,
  createServiceCenterStaff,
  deleteServiceCenterBookingFingerprint,
  deleteServiceCenterStaff,
  deleteServiceCenterVehicle,
  getCurrentDriver,
  getServiceCenterBookingBiometrics,
  getServiceCenterBookings,
  getServiceCenterStaff,
  getServiceCenterVehicles,
  updateServiceCenterBookingBiometrics,
  updateServiceCenterStaff,
  updateServiceCenterBooking,
  verifyServiceCenterBookingFingerprint,
} from '../services/registrationService';

const unwrap = (response) => response?.data?.data || response?.data || response || {};

const inputClass =
  'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100';
const labelClass = 'mb-2 block text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500';

const beforeHandoverItems = [
  { key: 'exteriorOk', label: 'Exterior checked' },
  { key: 'interiorOk', label: 'Interior cleaned' },
  { key: 'dashboardOk', label: 'Dashboard photos matched' },
  { key: 'tyresOk', label: 'Tyres look good' },
  { key: 'fuelOk', label: 'Fuel level confirmed' },
  { key: 'documentsOk', label: 'Documents available' },
];

const afterReturnItems = [
  { key: 'exteriorChecked', label: 'Exterior rechecked' },
  { key: 'interiorChecked', label: 'Interior rechecked' },
  { key: 'dashboardChecked', label: 'Dashboard rechecked' },
  { key: 'fuelChecked', label: 'Fuel level noted' },
  { key: 'tyresChecked', label: 'Tyres rechecked' },
  { key: 'damageReviewed', label: 'Damage reviewed' },
];

const inspectionPhotoSlots = [
  { key: 'front_left', label: 'Front Left', helper: 'Capture front-left exterior angle.' },
  { key: 'front_right', label: 'Front Right', helper: 'Capture front-right exterior angle.' },
  { key: 'rear_left', label: 'Rear Left', helper: 'Capture rear-left exterior angle.' },
  { key: 'rear_right', label: 'Rear Right', helper: 'Capture rear-right exterior angle.' },
  { key: 'odometer', label: 'Odometer', helper: 'Capture dashboard meter reading clearly.' },
  { key: 'fuel_meter', label: 'Fuel Meter', helper: 'Capture fuel level reading clearly.' },
  { key: 'damage_closeup', label: 'Damage Close-up', helper: 'Use for scratches, dents, or issue proof.' },
];

const biometricFingerOptions = [
  { code: 'LEFT_THUMB', label: 'Left Thumb' },
  { code: 'LEFT_INDEX', label: 'Left Index' },
  { code: 'LEFT_MIDDLE', label: 'Left Middle' },
  { code: 'LEFT_RING', label: 'Left Ring' },
  { code: 'LEFT_LITTLE', label: 'Left Little' },
  { code: 'RIGHT_THUMB', label: 'Right Thumb' },
  { code: 'RIGHT_INDEX', label: 'Right Index' },
  { code: 'RIGHT_MIDDLE', label: 'Right Middle' },
  { code: 'RIGHT_RING', label: 'Right Ring' },
  { code: 'RIGHT_LITTLE', label: 'Right Little' },
];

const enrollmentModeOptions = [
  { value: 'thumbs_only', label: 'Thumbs Only' },
  { value: 'optional', label: 'Optional Mix' },
  { value: 'all_ten', label: 'All 10 Fingers' },
];

const biometricSourceOptions = [
  {
    value: 'phone_sensor',
    label: 'Phone Sensor',
    helper: 'Use the handset fingerprint flow exposed by the Flutter WebView bridge.',
  },
  {
    value: 'usb_scanner',
    label: 'USB Scanner',
    helper: 'Use the external fingerprint device connected to the phone over USB.',
  },
];

const thumbCodeOptions = [
  { value: 'LEFT_THUMB', label: 'Left Thumb' },
  { value: 'RIGHT_THUMB', label: 'Right Thumb' },
];

const BIOMETRIC_BRIDGE_TIMEOUT_MS = 25000;
const BIOMETRIC_MIN_MATCH_SCORE = 80;

const normalizeBiometricMatchScore = (value) => {
  if (value === undefined || value === null || String(value).trim() === '') {
    return null;
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return null;
  }

  if (numericValue > 0 && numericValue <= 1) {
    return Number((numericValue * 100).toFixed(2));
  }

  return numericValue;
};

const buildBiometricDraft = (booking) => ({
  consentAccepted: Boolean(booking?.biometrics?.consentAccepted),
  consentNotes: String(booking?.biometrics?.consentNotes || ''),
  enrollmentMode: String(booking?.biometrics?.enrollmentMode || 'optional'),
  requiredFingerCount:
    booking?.biometrics?.requiredFingerCount === undefined || booking?.biometrics?.requiredFingerCount === null
      ? ''
      : String(booking.biometrics.requiredFingerCount),
  notes: String(booking?.biometrics?.notes || ''),
});

const buildThumbParticipantKey = (participantType = 'co_passenger') =>
  `${participantType}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;

const buildThumbParticipantsDraft = (booking) => {
  const participants = Array.isArray(booking?.biometrics?.thumbParticipants) ? booking.biometrics.thumbParticipants : [];
  return participants.map((item, index) => ({
    participantKey: String(item?.participantKey || buildThumbParticipantKey(item?.participantType || 'co_passenger')),
    participantType: String(item?.participantType || 'co_passenger'),
    participantLabel: String(item?.participantLabel || item?.name || 'Participant'),
    userType: String(item?.userType || item?.participantType || 'participant'),
    name: String(item?.name || ''),
    phone: String(item?.phone || ''),
    linkedUserId: String(item?.linkedUserId || ''),
    linkedStaffId: String(item?.linkedStaffId || ''),
    isPrimary: item?.isPrimary === true,
    sortOrder: Number.isFinite(Number(item?.sortOrder)) ? Number(item.sortOrder) : index,
  }));
};

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Unable to read selected image'));
    reader.onloadend = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(file);
  });

const getBiometricTargetCount = (biometrics = {}, draft = null) => {
  if (draft) {
    const draftCount = Number(draft.requiredFingerCount);
    return Number.isInteger(draftCount) && draftCount >= 0 ? draftCount : 0;
  }

  const savedCount = Number(biometrics?.requiredFingerCount);
  return Number.isInteger(savedCount) && savedCount >= 0 ? savedCount : 0;
};

const getBiometricSourceLabel = (source = '') =>
  biometricSourceOptions.find((item) => item.value === source)?.label || 'Manual';

const getBiometricBridgeStatus = (preferredSource = 'usb_scanner') => {
  if (typeof window === 'undefined') return 'unknown';
  if (window.isBiometricBridgeAvailable === true && window?.flutter_inappwebview?.callHandler) {
    return 'flutter-ready';
  }
  if (window?.FingerprintBridge?.captureFinger) {
    if (typeof window.FingerprintBridge.getAvailability === 'function') {
      try {
        const availability = window.FingerprintBridge.getAvailability();
        if (availability && availability[preferredSource] === true) {
          return 'device-ready';
        }
      } catch {
        // Fall through to the generic bridge-ready state below.
      }
    }
    return 'device-ready';
  }
  if (window?.flutter_inappwebview?.callHandler) return 'flutter-handler';
  return 'demo-mode';
};

const getBiometricBridgeBadge = (status, preferredSource = 'usb_scanner') => {
  if (status === 'device-ready') return `${getBiometricSourceLabel(preferredSource)} bridge ready`;
  if (status === 'flutter-ready') return `Flutter biometric bridge ready for ${getBiometricSourceLabel(preferredSource)}`;
  if (status === 'flutter-handler') return `Flutter bridge ready for ${getBiometricSourceLabel(preferredSource)}`;
  if (status === 'unknown') return 'Bridge status unavailable';
  return `${getBiometricSourceLabel(preferredSource)} demo fallback`;
};

const getBiometricSourceActionLabel = (source = 'usb_scanner') =>
  source === 'phone_sensor' ? 'Phone sensor' : 'USB scanner';

const isRdServiceTemplateFormat = (templateFormat = '') =>
  ['uidai-pid-xml', 'rd-pid-xml', 'rd_service_pid_xml'].includes(String(templateFormat || '').trim().toLowerCase());

const isRdServiceFingerRecord = (fingerRecord = {}) =>
  isRdServiceTemplateFormat(fingerRecord?.templateFormat);

const getBiometricModeStorageKey = (bookingId = '') =>
  `service-center-biometric-source:${String(bookingId || 'global')}`;

const readStoredBiometricSource = (bookingId = '') => {
  if (typeof window === 'undefined') {
    return 'usb_scanner';
  }

  const saved = window.localStorage.getItem(getBiometricModeStorageKey(bookingId))
    || window.localStorage.getItem(getBiometricModeStorageKey('global'))
    || '';

  return biometricSourceOptions.some((item) => item.value === saved) ? saved : 'usb_scanner';
};

const persistBiometricSource = (bookingId, source) => {
  if (typeof window === 'undefined') {
    return;
  }

  const normalizedSource = biometricSourceOptions.some((item) => item.value === source) ? source : 'usb_scanner';
  window.localStorage.setItem(getBiometricModeStorageKey('global'), normalizedSource);
  if (bookingId) {
    window.localStorage.setItem(getBiometricModeStorageKey(bookingId), normalizedSource);
  }
};

const getBridgeCommandAction = (action = '') => {
  if (action === 'captureFinger') return 'capture';
  if (action === 'verifyFinger') return 'verify';
  if (action === 'getStatus') return 'status';
  return action;
};

const normalizeBiometricCaptureSource = (source = '', fallback = 'usb_scanner') => {
  const normalized = String(source || '').trim().toLowerCase();

  if (normalized === 'phone_sensor' || normalized === 'phone_sensoor') {
    return 'phone_sensor';
  }

  if (normalized === 'usb_scanner' || normalized === 'usbscanner' || normalized === 'usb-scanner') {
    return 'usb_scanner';
  }

  if (normalized === 'bluetooth_scanner' || normalized === 'bluetoothscanner' || normalized === 'bluetooth-scanner') {
    return 'bluetooth_scanner';
  }

  if (normalized === 'manual' || normalized === 'unknown') {
    return normalized;
  }

  return biometricSourceOptions.some((item) => item.value === fallback) ? fallback : 'unknown';
};

const withImageDataUrlPrefix = (value = '') => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('data:image/')) return trimmed;
  if (/^[A-Za-z0-9+/=]+$/.test(trimmed) && trimmed.length > 120) {
    return `data:image/png;base64,${trimmed}`;
  }
  return trimmed;
};

const pickFirstBiometricValue = (...values) => {
  const found = values.find((value) => {
    if (value === undefined || value === null) return false;
    if (typeof value === 'object') return false;
    const s = String(value).trim();
    return (
      s !== '' &&
      s.toLowerCase() !== 'undefined' &&
      s.toLowerCase() !== 'null' &&
      s !== '[object Object]' &&
      s.length > 5
    );
  });
  return found !== undefined ? String(found).trim() : '';
};

const pickFirstBiometricPreviewValue = (...values) =>
  withImageDataUrlPrefix(
    values.find((value) => value !== undefined && value !== null && String(value).trim() !== '') || '',
  );

const escapePrintHtml = (value = '') =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const parseBridgeObject = (result) => {
  if (!result) return result;
  if (typeof result === 'string') {
    const trimmed = result.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return result;
      }
    }
  }
  return result;
};

const normalizeBridgeResult = (result, preferredSource, action) => {
  const parsedResult = parseBridgeObject(result);
  if (!parsedResult || typeof parsedResult !== 'object') {
    return parsedResult;
  }

  const payload =
    (parsedResult.data && typeof parsedResult.data === 'object' && parsedResult.data)
    || (parsedResult.payload && typeof parsedResult.payload === 'object' && parsedResult.payload)
    || parsedResult.result
    || parsedResult;

  if (!payload || typeof payload !== 'object') {
    return result;
  }

  const normalizedSource = normalizeBiometricCaptureSource(
    payload.captureSource || payload.source || parsedResult.captureSource || parsedResult.source,
    preferredSource,
  );

  if (action === 'captureFinger') {
    return {
      ...parsedResult,
      ...payload,
      templateData: String(
        pickFirstBiometricValue(
          payload.templateData,
          payload.template,
          payload.fingerprintTemplate,
          payload.isoTemplate,
          payload.ansiTemplate,
          payload.wsqTemplate,
          payload.rawTemplate,
          parsedResult.templateData,
          parsedResult.template,
          parsedResult.fingerprintTemplate,
          parsedResult.isoTemplate,
        ),
      ).trim(),
      templateFormat: String(
        pickFirstBiometricValue(
          payload.templateFormat,
          payload.format,
          payload.templateType,
          parsedResult.templateFormat,
          parsedResult.format,
          'vendor-template',
        ),
      ).trim(),
      previewImage: withImageDataUrlPrefix(
        pickFirstBiometricValue(
          payload.previewImage,
          payload.imageBase64,
          payload.base64Image,
          payload.previewBase64,
          payload.bitmap,
          payload.bitmapBase64,
          payload.bmpBase64,
          payload.imageData,
          payload.fingerprintImage,
          payload.fingerImage,
          payload.image,
          payload.imageUrl,
          parsedResult.previewImage,
          parsedResult.imageBase64,
          parsedResult.base64Image,
          parsedResult.previewBase64,
          parsedResult.bitmap,
          parsedResult.bitmapBase64,
          parsedResult.bmpBase64,
          parsedResult.imageData,
          parsedResult.fingerprintImage,
          parsedResult.fingerImage,
          parsedResult.image,
          parsedResult.imageUrl,
        ),
      ),
      qualityScore: payload.qualityScore ?? payload.quality ?? parsedResult.qualityScore ?? parsedResult.quality,
      captureSource: normalizedSource,
      deviceLabel: pickFirstBiometricValue(payload.deviceLabel, payload.deviceName, parsedResult.deviceLabel, parsedResult.deviceName),
      scannerSerial: pickFirstBiometricValue(payload.scannerSerial, payload.deviceId, payload.scannerSerial, parsedResult.scannerSerial, parsedResult.deviceId, parsedResult.serialNumber),
      sampleCount: payload.sampleCount ?? payload.captureCount ?? parsedResult.sampleCount ?? parsedResult.captureCount,
      notes: pickFirstBiometricValue(payload.notes, payload.message, parsedResult.notes, parsedResult.message),
    };
  }

  if (action === 'verifyFinger') {
    const localMatch = payload.localMatch ?? payload.match ?? payload.matched ?? payload.isMatch ?? payload.isMatched ?? parsedResult.localMatch ?? parsedResult.match ?? parsedResult.matched ?? parsedResult.isMatch ?? parsedResult.isMatched;
    return {
      ...parsedResult,
      ...payload,
      localMatch: typeof localMatch === 'boolean' ? localMatch : undefined,
      verificationStatus: (() => {
        const raw = String(
          payload.verificationStatus ||
          payload.status ||
          parsedResult.verificationStatus ||
          parsedResult.status ||
          (localMatch === true ? 'matched' : localMatch === false ? 'failed' : ''),
        ).trim().toLowerCase();
        if (['matched', 'match', 'verified'].includes(raw)) return 'matched';
        if (['failed', 'fail', 'rejected', 'mismatch', 'no_match', 'nomatch', 'not_matched'].includes(raw)) return 'failed';
        if (['low_quality', 'lowquality', 'low-quality', 'poor', 'retry'].includes(raw)) return 'low_quality';
        if (['success', 'ok', 'pass', 'passed', 'true', 'yes', 'done', 'complete', 'captured'].includes(raw)) return '';
        return raw;
      })(),
      templateData: String(
        pickFirstBiometricValue(
          payload.templateData,
          payload.template,
          payload.fingerprintTemplate,
          payload.isoTemplate,
          parsedResult.templateData,
          parsedResult.template,
          parsedResult.fingerprintTemplate,
          parsedResult.isoTemplate,
        ),
      ).trim(),
      captureSource: normalizedSource,
      matchScore: normalizeBiometricMatchScore(
        payload.matchScore ?? payload.score ?? parsedResult.matchScore ?? parsedResult.score,
      ),
      referenceTemplateHash: pickFirstBiometricValue(
        payload.referenceTemplateHash,
        payload.enrolledTemplateHash,
        payload.referenceHash,
        parsedResult.referenceTemplateHash,
        parsedResult.enrolledTemplateHash,
        parsedResult.referenceHash,
      ),
      matchedTemplateHash: pickFirstBiometricValue(
        payload.matchedTemplateHash,
        payload.templateHash,
        payload.matchedHash,
        parsedResult.matchedTemplateHash,
        parsedResult.templateHash,
        parsedResult.matchedHash,
      ),
      matchedFingerCode: pickFirstBiometricValue(
        payload.matchedFingerCode,
        payload.comparedFingerCode,
        payload.fingerCode,
        parsedResult.matchedFingerCode,
        parsedResult.comparedFingerCode,
        parsedResult.fingerCode,
      ),
      previewImage: pickFirstBiometricPreviewValue(
        payload.previewImage,
        payload.imageBase64,
        payload.base64Image,
        payload.previewBase64,
        payload.bitmap,
        payload.bitmapBase64,
        payload.bmpBase64,
        payload.imageData,
        payload.fingerprintImage,
        payload.fingerImage,
        payload.image,
        payload.imageUrl,
        parsedResult.previewImage,
        parsedResult.imageBase64,
        parsedResult.base64Image,
        parsedResult.previewBase64,
        parsedResult.bitmap,
        parsedResult.bitmapBase64,
        parsedResult.bmpBase64,
        parsedResult.imageData,
        parsedResult.fingerprintImage,
        parsedResult.fingerImage,
        parsedResult.image,
        parsedResult.imageUrl,
      ),
      notes: pickFirstBiometricValue(payload.notes, payload.message, parsedResult.notes, parsedResult.message),
    };
  }

  return {
    ...parsedResult,
    ...payload,
    captureSource: normalizedSource,
  };
};

const withBridgeTimeout = (promise, timeoutMs = BIOMETRIC_BRIDGE_TIMEOUT_MS) =>
  Promise.race([
    promise,
    new Promise((_, reject) => {
      const timer = setTimeout(() => {
        clearTimeout(timer);
        reject(new Error('The scanner is taking too long to respond. Check the USB device connection and try again.'));
      }, timeoutMs);
    }),
  ]);

const buildInspectionCameraInputId = (field = '', slotIndex = 0) =>
  `service-center-inspection-camera-${String(field)}-${String(slotIndex)}`;

const normalizeInspectionPhotoBridgeResult = (result) => {
  if (!result) {
    return null;
  }

  if (typeof result === 'string') {
    const trimmed = result.trim();
    if (trimmed.startsWith('data:image/')) {
      return { dataUrl: trimmed };
    }
    if (/^https?:\/\//i.test(trimmed)) {
      return { imageUrl: trimmed };
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
    || result.imageBase64
    || result.base64Image
    || result.previewImage
    || (rawBase64 ? `data:${mimeType};base64,${rawBase64}` : '')
    || '',
  ).trim();
  const imageUrl = String(result.imageUrl || result.url || '').trim();

  if (dataUrl.startsWith('data:image/')) {
    return {
      ...result,
      dataUrl,
      capturedAt: result.capturedAt || result.timestamp || result.dateTime || null,
      latitude:
        result.latitude ?? result.lat ?? result.location?.latitude ?? result.gps?.latitude ?? null,
      longitude:
        result.longitude ?? result.lng ?? result.location?.longitude ?? result.gps?.longitude ?? null,
      address: result.address || result.locationName || result.formattedAddress || '',
      source: result.source || result.captureSource || '',
      fileName: result.fileName || '',
      mimeType,
      deviceModel: result.deviceModel || result.deviceName || result.deviceLabel || '',
      watermarkText: result.watermarkText || '',
      exif: result.exif && typeof result.exif === 'object' ? result.exif : {},
    };
  }

  if (imageUrl) {
    return {
      ...result,
      imageUrl,
      capturedAt: result.capturedAt || result.timestamp || result.dateTime || null,
      latitude:
        result.latitude ?? result.lat ?? result.location?.latitude ?? result.gps?.latitude ?? null,
      longitude:
        result.longitude ?? result.lng ?? result.location?.longitude ?? result.gps?.longitude ?? null,
      address: result.address || result.locationName || result.formattedAddress || '',
      source: result.source || result.captureSource || '',
      fileName: result.fileName || '',
      mimeType,
      deviceModel: result.deviceModel || result.deviceName || result.deviceLabel || '',
      watermarkText: result.watermarkText || '',
      exif: result.exif && typeof result.exif === 'object' ? result.exif : {},
    };
  }

  return null;
};

const isInspectionCameraBridgeAvailable = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.isServiceCenterCameraBridgeAvailable === true
    || typeof window.__nativeServiceCenterCamera === 'function'
    || Boolean(window?.flutter_inappwebview?.callHandler);
};

const stopMediaStream = (stream) => {
  if (!stream || typeof stream.getTracks !== 'function') {
    return;
  }

  stream.getTracks().forEach((track) => {
    try {
      track.stop();
    } catch {
      // Ignore cleanup errors while closing the camera stream.
    }
  });
};


const canCompleteBooking = (booking) => {
  const inspection = booking?.rentalInspection || {};
  const meter = Number(inspection.returnMeterReading);
  return (
    Number.isFinite(meter) &&
    meter >= 0 &&
    String(inspection.returnFuelLevel || '').trim() &&
    String(inspection.returnNotes || '').trim() &&
    Array.isArray(inspection.afterConditionImages) &&
    inspection.afterConditionImages.filter(Boolean).length > 0
  );
};

const canRequestEndRide = (booking) => {
  const status = String(booking?.status || '').toLowerCase();
  return ['confirmed', 'assigned'].includes(status);
};

const canFinalizeBooking = (booking) => {
  const status = String(booking?.status || '').toLowerCase();
  return canCompleteBooking(booking) && !['completed', 'cancelled'].includes(status);
};

const getCompletionRequirements = (booking) => {
  const inspection = booking?.rentalInspection || {};
  const missing = [];
  const meter = Number(inspection.returnMeterReading);

  if (!Number.isFinite(meter) || meter < 0) {
    missing.push('return KM reading');
  }

  if (!String(inspection.returnFuelLevel || '').trim()) {
    missing.push('return fuel level');
  }

  if (!String(inspection.returnNotes || '').trim()) {
    missing.push('return notes');
  }

  if (!Array.isArray(inspection.afterConditionImages) || inspection.afterConditionImages.filter(Boolean).length === 0) {
    missing.push('at least one return photo');
  }

  return missing;
};

const getCompletionValidationMessage = (booking) => {
  const missing = getCompletionRequirements(booking);

  if (missing.length === 0) {
    return '';
  }

  return `Before marking this booking as completed, finish the Return Inspection section: ${missing.join(', ')}.`;
};

const buildStaffForm = () => ({
  id: '',
  name: '',
  phone: '',
});

const mergeRentalInspection = (current = {}, patch = {}) => ({
  ...current,
  ...patch,
  beforeHandover: {
    ...(current?.beforeHandover || {}),
    ...(patch?.beforeHandover || {}),
  },
  afterReturn: {
    ...(current?.afterReturn || {}),
    ...(patch?.afterReturn || {}),
  },
});

const normalizeConditionImages = (images = []) => {
  const list = Array.isArray(images) ? images.slice(0, inspectionPhotoSlots.length) : [];
  while (list.length < inspectionPhotoSlots.length) {
    list.push('');
  }
  return list.map((item) => String(item || ''));
};

const setConditionImageAtSlot = (images = [], slotIndex, imageUrl = '') => {
  const nextImages = normalizeConditionImages(images);
  nextImages[slotIndex] = String(imageUrl || '');
  return nextImages;
};

const normalizeConditionImageDetails = (items = []) => {
  const list = Array.isArray(items) ? items.slice(0, inspectionPhotoSlots.length) : [];
  while (list.length < inspectionPhotoSlots.length) {
    list.push(null);
  }

  return list.map((item) => {
    if (!item || typeof item !== 'object') {
      return null;
    }

    const imageUrl = String(item.imageUrl || item.url || '').trim();
    if (!imageUrl) {
      return null;
    }

    return {
      imageUrl,
      capturedAt: item.capturedAt || item.timestamp || item.dateTime || null,
      latitude:
        item.latitude === null || item.latitude === undefined || item.latitude === ''
          ? null
          : Number(item.latitude),
      longitude:
        item.longitude === null || item.longitude === undefined || item.longitude === ''
          ? null
          : Number(item.longitude),
      address: String(item.address || item.locationName || item.formattedAddress || '').trim(),
      source: String(item.source || item.captureSource || '').trim(),
      fileName: String(item.fileName || '').trim(),
      mimeType: String(item.mimeType || '').trim(),
      deviceModel: String(item.deviceModel || item.deviceName || item.deviceLabel || '').trim(),
      watermarkText: String(item.watermarkText || '').trim(),
      exif: item.exif && typeof item.exif === 'object' ? item.exif : {},
    };
  });
};

const setConditionImageDetailAtSlot = (items = [], slotIndex, detail = null) => {
  const nextItems = normalizeConditionImageDetails(items);
  nextItems[slotIndex] = detail && detail.imageUrl ? detail : null;
  return nextItems;
};

const getConditionImageDetailsField = (field = '') =>
  field === 'afterConditionImages' ? 'afterConditionImageDetails' : 'beforeConditionImageDetails';

const formatCoordinate = (value) =>
  value === null || value === undefined || Number.isNaN(Number(value)) ? '' : Number(value).toFixed(6);

const formatDateTime = (value) => {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not set';
  return date.toLocaleString();
};

const getCustomerDocumentCards = (booking) => {
  const docs = booking?.customerDocuments || {};
  return [
    {
      key: 'drivingLicense',
      label: 'Driving License',
      imageUrl: docs.drivingLicense?.imageUrl || '',
      fileName: docs.drivingLicense?.fileName || '',
      uploadedAt: docs.drivingLicense?.uploadedAt || null,
    },
    {
      key: 'aadhaarCard',
      label: 'Aadhaar Card',
      imageUrl: docs.aadhaarCard?.imageUrl || '',
      fileName: docs.aadhaarCard?.fileName || '',
      uploadedAt: docs.aadhaarCard?.uploadedAt || null,
    },
  ];
};

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Unable to read selected image'));
    reader.readAsDataURL(file);
  });

const loadImageFromDataUrl = (dataUrl) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to process selected image'));
    image.src = dataUrl;
  });

const compressInspectionImageForUpload = async (file) => {
  const originalDataUrl = await fileToDataUrl(file);

  if (
    typeof document === 'undefined'
    || !String(file?.type || '').toLowerCase().startsWith('image/')
    || originalDataUrl.length <= 8_500_000
  ) {
    return originalDataUrl;
  }

  const image = await loadImageFromDataUrl(originalDataUrl);
  const maxSide = 1600;
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

  let quality = 0.82;
  let compressed = canvas.toDataURL('image/jpeg', quality);

  while (compressed.length > 8_500_000 && quality > 0.45) {
    quality -= 0.1;
    compressed = canvas.toDataURL('image/jpeg', quality);
  }

  return compressed;
};

const getBrowserCaptureLocation = () =>
  new Promise((resolve) => {
    if (!navigator?.geolocation) {
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords?.latitude ?? null,
          longitude: position.coords?.longitude ?? null,
        });
      },
      () => resolve(null),
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 30000,
      },
    );
  });

const statusBadgeClass = (status = '') => {
  const value = String(status || '').toLowerCase();
  if (value === 'completed') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (value === 'assigned') return 'bg-violet-50 text-violet-700 border-violet-200';
  if (value === 'confirmed') return 'bg-sky-50 text-sky-700 border-sky-200';
  if (value === 'cancelled') return 'bg-rose-50 text-rose-700 border-rose-200';
  if (value === 'end_requested') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
};

const CollapsibleSection = ({ title, icon: Icon, children, badge }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="border-b border-slate-100 last:border-0">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-5 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-slate-100 rounded-xl text-slate-600">
            <Icon size={18} />
          </div>
          <div className="text-left">
            <h4 className="font-['Outfit'] text-[15px] font-bold text-slate-900">{title}</h4>
            {badge && <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{badge}</span>}
          </div>
        </div>
        <ChevronDown size={18} className={`text-slate-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const InspectionPhotoSlots = ({
  title,
  accent = 'emerald',
  bookingId,
  field,
  images = [],
  imageDetails = [],
  uploadingTarget = '',
  onFileSelect,
  onCameraCapture,
  onPreview,
  onRemove,
}) => {
  const normalizedImages = normalizeConditionImages(images);
  const normalizedDetails = normalizeConditionImageDetails(imageDetails);
  const accentClass =
    accent === 'amber'
      ? {
        button: 'text-amber-700 border-amber-200 bg-amber-50 hover:bg-amber-100',
        primary: 'bg-amber-500 hover:bg-amber-600 text-white',
        ring: 'focus:ring-amber-500/20',
        badge: 'bg-amber-50 text-amber-700',
      }
      : {
        button: 'text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100',
        primary: 'bg-emerald-500 hover:bg-emerald-600 text-white',
        ring: 'focus:ring-emerald-500/20',
        badge: 'bg-emerald-50 text-emerald-700',
      };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{title}</label>
          <p className="mt-1 text-xs font-medium text-slate-500">
            Use the fixed slots below so inspection photos stay consistent across bookings.
          </p>
        </div>
        <div className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${accentClass.badge}`}>
          {normalizedImages.filter(Boolean).length}/{inspectionPhotoSlots.length}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {inspectionPhotoSlots.map((slot, index) => {
          const imageUrl = normalizedImages[index];
          const detail = normalizedDetails[index];
          const cameraTarget = `${field}:${index}:camera`;
          const uploadTarget = `${field}:${index}:upload`;
          const busy = uploadingTarget === cameraTarget || uploadingTarget === uploadTarget;

          return (
            <div key={`${field}:${slot.key}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-700">{slot.label}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{slot.helper}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] ${imageUrl ? 'bg-white text-slate-700' : 'bg-slate-200 text-slate-500'}`}>
                  {imageUrl ? 'Captured' : 'Missing'}
                </span>
              </div>

              <div className="mt-3">
                {imageUrl ? (
                  <button
                    type="button"
                    onClick={() => onPreview(imageUrl)}
                    className="group relative block aspect-[4/3] w-full overflow-hidden rounded-2xl border border-slate-200 bg-white"
                  >
                    <img src={imageUrl} alt={slot.label} className="h-full w-full object-cover" />
                    <div className="absolute inset-0 bg-slate-950/0 transition group-hover:bg-slate-950/10" />
                  </button>
                ) : (
                  <div className="flex aspect-[4/3] w-full items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white text-center">
                    <div className="px-4">
                      <Camera size={20} className="mx-auto text-slate-300" />
                      <p className="mt-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-400">No photo yet</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <label
                  className={`relative flex cursor-pointer items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[11px] font-black uppercase tracking-[0.12em] transition ${imageUrl ? accentClass.button : accentClass.primary} ${busy ? 'pointer-events-none opacity-60' : ''}`}
                  onClick={(event) => {
                    if (busy) {
                      return;
                    }

                    event.preventDefault();
                    onCameraCapture(field, index, slot.label);
                  }}
                >
                  {busy && uploadingTarget === cameraTarget ? <Loader2 size={14} className="animate-spin" /> : imageUrl ? <RotateCcw size={14} /> : <Camera size={14} />}
                  {imageUrl ? 'Retake' : 'Take Photo'}
                  <input
                    id={buildInspectionCameraInputId(field, index)}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    disabled={busy}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    aria-label={`${imageUrl ? 'Retake' : 'Take'} ${slot.label} photo`}
                    onChange={(event) => {
                      const files = Array.from(event.target.files || []);
                      onFileSelect(field, index, files, 'camera');
                      event.target.value = '';
                    }}
                  />
                </label>
                <label className={`relative flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[11px] font-black uppercase tracking-[0.12em] text-slate-700 transition hover:bg-slate-100 ${busy ? 'pointer-events-none opacity-60' : ''}`}>
                  {busy && uploadingTarget === uploadTarget ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
                  Upload
                  <input
                    type="file"
                    accept="image/*"
                    disabled={busy}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    aria-label={`Upload ${slot.label} photo`}
                    onChange={(event) => {
                      const files = Array.from(event.target.files || []);
                      onFileSelect(field, index, files, 'upload');
                      event.target.value = '';
                    }}
                  />
                </label>
              </div>

              {imageUrl ? (
                <div className="mt-2 space-y-2">
                  {detail ? (
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                      <div className="grid grid-cols-1 gap-1 text-[11px] text-slate-600">
                        <p>
                          <span className="font-black uppercase tracking-[0.12em] text-slate-400">Time </span>
                          <span className="font-semibold text-slate-800">
                            {detail.capturedAt ? formatDateTime(detail.capturedAt) : 'Not available'}
                          </span>
                        </p>
                        {(detail.latitude !== null && detail.longitude !== null) || detail.address ? (
                          <p>
                            <span className="font-black uppercase tracking-[0.12em] text-slate-400">Location </span>
                            <span className="font-semibold text-slate-800">
                              {detail.address
                                || `${formatCoordinate(detail.latitude)}, ${formatCoordinate(detail.longitude)}`}
                            </span>
                          </p>
                        ) : null}
                        {detail.deviceModel ? (
                          <p>
                            <span className="font-black uppercase tracking-[0.12em] text-slate-400">Device </span>
                            <span className="font-semibold text-slate-800">{detail.deviceModel}</span>
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => onPreview(imageUrl)}
                      className={`flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-slate-700 transition hover:bg-slate-100 ${accentClass.ring}`}
                    >
                      <Eye size={14} />
                      Preview
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemove(bookingId, field, index)}
                      className="flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-rose-600 transition hover:bg-rose-100"
                    >
                      <Trash2 size={14} />
                      Remove
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const ServiceCenterDashboard = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [profile, setProfile] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [staff, setStaff] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [bookingStaffOptions, setBookingStaffOptions] = useState([]);
  const [permissions, setPermissions] = useState({
    canManageStaff: false,
    canManageVehicles: false,
    canAssignBookings: false,
  });
  const [loading, setLoading] = useState(true);
  const [savingStaff, setSavingStaff] = useState(false);
  const [updatingBookingId, setUpdatingBookingId] = useState('');
  const [uploadingConditionSection, setUploadingConditionSection] = useState('');
  const [showStaffForm, setShowStaffForm] = useState(false);
  const [error, setError] = useState('');
  const [staffForm, setStaffForm] = useState(buildStaffForm);
  const [previewImage, setPreviewImage] = useState('');
  const [legalModal, setLegalModal] = useState(null);
  const [cameraCaptureState, setCameraCaptureState] = useState({
    open: false,
    field: '',
    slotIndex: -1,
    slotLabel: '',
    bookingId: '',
  });
  const [cameraStream, setCameraStream] = useState(null);
  const [cameraCaptureError, setCameraCaptureError] = useState('');
  const [cameraCaptureBusy, setCameraCaptureBusy] = useState(false);
  const cameraVideoRef = useRef(null);
  const [bookingDraft, setBookingDraft] = useState({
    assignedStaffId: '',
    status: 'pending',
    serviceCenterNote: '',
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [biometricDraft, setBiometricDraft] = useState(buildBiometricDraft());
  const [thumbParticipantsDraft, setThumbParticipantsDraft] = useState([]);
  const [biometricAction, setBiometricAction] = useState('');
  const [biometricSource, setBiometricSource] = useState(() => readStoredBiometricSource());
  const [biometricStatus, setBiometricStatus] = useState({
    tone: 'idle',
    message: '',
    fingerCode: '',
    action: '',
  });
  const [thumbAction, setThumbAction] = useState('');
  const bookingsPerPage = 8;

  const role = String(profile?.onboarding?.role || '').toLowerCase();
  const isStaffUser = role === 'service_center_staff';

  const openLegal = (type) => {
    const contentMap = {
      driver_app: {
        title: 'Driver Application',
        Icon: UserPlus,
        description: 'Join the Appzeto 24 fleet as a certified driver.',
        content: `Appzeto 24 is always looking for professional, dedicated drivers to join our growing ecosystem. 

Steps to apply:
1. Ensure you have a valid Commercial Driving License.
2. Visit the Appzeto 24 Driver Onboarding center or use the Mobile App.
3. Submit required documents: Aadhaar, PAN, License, and Police Verification.
4. Complete the Biometric enrollment process at any authorized Service Center.
5. Once approved, you can start accepting rides and managing your earnings via the dashboard.`
      },
      terms: {
        title: 'Terms and Conditions',
        Icon: FileText,
        description: 'General rules for using the Appzeto 24 platform.',
        content: `By using the Appzeto 24 platform, you agree to comply with all applicable transport regulations and our safety standards.

Key Highlights:
• Professionalism: Drivers and Staff must maintain a high standard of service.
• Vehicle Readiness: All vehicles listed must be in active, roadworthy condition.
• Compliance: You must ensure all permits and insurance are valid.
• Platform Fees: Appzeto 24 charges a service fee for every successful booking handled.
• Account Security: You are responsible for keeping your credentials and biometric data secure.`
      },
      privacy: {
        title: 'Privacy Policy',
        Icon: Shield,
        description: 'How we handle your data and biometrics.',
        content: `Appzeto 24 takes data security seriously. We collect specific information to ensure safety and service quality.

Data Collected:
• Biometrics: Fingerprint hashes are stored encrypted (AES-256) for verification only. Raw images are never stored permanently.
• Location: Live GPS tracking is used during active bookings for safety.
• Contact: Phone and email are used for booking updates and support.
• Vehicle Data: Inspection logs and photos are kept for insurance purposes.

We do not share your biometric data with third-party advertising networks.`
      },
      refund: {
        title: 'Refund Policy',
        Icon: HandCoins,
        description: 'Cancellation and refund guidelines.',
        content: `Transparent refund rules for customers and partners.

Booking Cancellations:
• Customer-initiated: Refund varies based on how close the pickup time is.
• Operator-initiated: If a vehicle fails inspection, a full refund is processed to the customer.
• Service Center Fees: Fees for inspections are non-refundable once the inspection report is generated.

Processing Time: Refunds are typically credited back to the original payment method within 5-7 working days.`
      }
    };
    setLegalModal(contentMap[type]);
  };

  const loadDashboard = async () => {
    setLoading(true);
    setError('');

    try {
      const profileResponse = await getCurrentDriver();
      const nextProfile = unwrap(profileResponse);
      setProfile(nextProfile);

      const normalizedRole = String(nextProfile?.onboarding?.role || nextProfile?.role || '').toLowerCase();
      const isStaffProfile = normalizedRole === 'service_center_staff';

      const [bookingResponse, vehicleResponse] = await Promise.allSettled([
        getServiceCenterBookings(),
        isStaffProfile ? Promise.resolve({ results: [] }) : getServiceCenterVehicles(),
      ]);

      if (bookingResponse.status !== 'fulfilled') {
        throw bookingResponse.reason;
      }

      const bookingData = unwrap(bookingResponse.value);
      setBookings(bookingData?.results || []);
      setPermissions(
        bookingData?.permissions || {
          canManageStaff: false,
          canManageVehicles: false,
          canAssignBookings: false,
        },
      );
      setBookingStaffOptions(bookingData?.staff || []);

      if (vehicleResponse.status === 'fulfilled') {
        setVehicles(unwrap(vehicleResponse.value)?.results || []);
      } else {
        const vehicleStatus = Number(
          vehicleResponse.reason?.status || vehicleResponse.reason?.response?.status || 0,
        );

        if (vehicleStatus === 401) {
          throw vehicleResponse.reason;
        }

        setVehicles([]);
      }

      if (bookingData?.permissions?.canManageStaff) {
        const staffResponse = await getServiceCenterStaff();
        setStaff(unwrap(staffResponse)?.results || []);
      } else {
        setStaff([]);
      }
    } catch (err) {
      const status = Number(err?.status || err?.response?.status || 0);
      if (status === 401) {
        clearDriverAuthState();
        navigate('/taxi/driver/login', { replace: true });
        return;
      }
      setError(err?.message || 'Could not load service center dashboard.');
    } finally {
      setLoading(false);
    }
  };

  const filteredBookings = useMemo(() => {
    if (!searchQuery) return bookings;
    const lowerQuery = searchQuery.toLowerCase();
    return bookings.filter(b =>
      (b.bookingReference || '').toLowerCase().includes(lowerQuery) ||
      (b.customer?.name || '').toLowerCase().includes(lowerQuery) ||
      (b.vehicleName || '').toLowerCase().includes(lowerQuery)
    );
  }, [bookings, searchQuery]);

  const paginatedBookings = useMemo(() => {
    const startIndex = (currentPage - 1) * bookingsPerPage;
    return filteredBookings.slice(startIndex, startIndex + bookingsPerPage);
  }, [filteredBookings, currentPage]);

  const totalPages = Math.ceil(filteredBookings.length / bookingsPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  useEffect(() => {
    loadDashboard();
  }, []);

  const stats = useMemo(() => {
    const activeVehicles = vehicles.filter((item) => item.active !== false && item.status !== 'inactive').length;
    const pendingBookings = bookings.filter((item) => item.status === 'pending').length;
    const assignedBookings = bookings.filter((item) => item.status === 'assigned').length;
    const completedBookings = bookings.filter((item) => item.status === 'completed').length;

    return {
      activeVehicles,
      pendingBookings,
      assignedBookings,
      completedBookings,
    };
  }, [bookings, vehicles]);

  const activeBookingCountByStaffId = useMemo(() => {
    const counts = new Map();

    bookings.forEach((item) => {
      const staffId = String(item?.assignedStaff?.id || item?.assignedStaffId || '').trim();
      const status = String(item?.status || '').toLowerCase();
      if (!staffId || ['completed', 'cancelled'].includes(status)) {
        return;
      }

      counts.set(staffId, (counts.get(staffId) || 0) + 1);
    });

    return counts;
  }, [bookings]);

  const tabs = useMemo(() => {
    const nextTabs = [
      { id: 'overview', label: 'Overview', shortLabel: 'Home', helper: 'Center info', Icon: Building2 },
      { id: 'bookings', label: 'Bookings', shortLabel: 'Jobs', helper: `${bookings.length} queue`, Icon: ClipboardList },
    ];

    if (!isStaffUser) {
      nextTabs.push(
        { id: 'staff', label: 'Staff', shortLabel: 'Team', helper: `${staff.length} team`, Icon: Users },
        { id: 'vehicles', label: 'Vehicles', shortLabel: 'Fleet', helper: `${vehicles.length} listed`, Icon: CarFront },
      );
    }

    nextTabs.push({ id: 'profile', label: 'Profile', shortLabel: 'Me', helper: 'Account', Icon: UserRound });

    return nextTabs;
  }, [bookings.length, isStaffUser, staff.length, vehicles.length]);

  const selectedBookingId = searchParams.get('booking') || '';
  const selectedFingerprintCode = String(searchParams.get('fingerprint') || '').trim().toUpperCase();
  const selectedBooking = useMemo(
    () =>
      bookings.find((item) => String(item.id || item._id) === String(selectedBookingId)) || null,
    [bookings, selectedBookingId],
  );
  const selectedFingerprintRecord = useMemo(() => {
    const fingers = Array.isArray(selectedBooking?.biometrics?.fingers) ? selectedBooking.biometrics.fingers : [];
    const matchedRecord =
      fingers.find((item) => String(item?.fingerCode || '').trim().toUpperCase() === selectedFingerprintCode) || null;
    if (!matchedRecord) {
      return null;
    }
    return {
      ...matchedRecord,
      previewImage: pickFirstBiometricPreviewValue(
        matchedRecord.previewImage,
        matchedRecord.imageBase64,
        matchedRecord.base64Image,
        matchedRecord.previewBase64,
        matchedRecord.bitmap,
        matchedRecord.bitmapBase64,
        matchedRecord.bmpBase64,
        matchedRecord.imageData,
        matchedRecord.fingerprintImage,
        matchedRecord.fingerImage,
        matchedRecord.image,
        matchedRecord.imageUrl,
      ),
    };
  }, [selectedBooking, selectedFingerprintCode]);
  const bookingDraftDirty = useMemo(() => {
    if (!selectedBooking) {
      return false;
    }

    return (
      String(bookingDraft.assignedStaffId || '') !== String(selectedBooking.assignedStaff?.id || '') ||
      String(bookingDraft.status || 'pending') !== String(selectedBooking.status || 'pending') ||
      String(bookingDraft.serviceCenterNote || '') !== String(selectedBooking.serviceCenterNote || '')
    );
  }, [bookingDraft.assignedStaffId, bookingDraft.serviceCenterNote, bookingDraft.status, selectedBooking]);
  const validTabIds = useMemo(() => tabs.map((tab) => tab.id), [tabs]);
  const fallbackTab = tabs[0]?.id || 'overview';
  const rawTab = searchParams.get('tab') || '';
  const activeTab = validTabIds.includes(rawTab) ? rawTab : fallbackTab;

  useEffect(() => {
    if (rawTab === activeTab) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('tab', activeTab);
    if (activeTab !== 'bookings') {
      nextParams.delete('booking');
      nextParams.delete('fingerprint');
    }
    setSearchParams(nextParams, { replace: true });
  }, [activeTab, rawTab, searchParams, setSearchParams]);

  const handleTabChange = (tabId) => {
    if (tabId === activeTab) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('tab', tabId);
    nextParams.delete('booking');
    nextParams.delete('fingerprint');
    setSearchParams(nextParams);
  };

  const handleBookingOpen = (bookingId) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('tab', 'bookings');
    nextParams.set('booking', String(bookingId));
    nextParams.delete('fingerprint');
    setSearchParams(nextParams);
  };

  const handleBookingClose = () => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('tab', 'bookings');
    nextParams.delete('booking');
    nextParams.delete('fingerprint');
    setSearchParams(nextParams);
  };

  const handleFingerprintOpen = (fingerCode) => {
    if (!selectedBooking || !fingerCode) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('tab', 'bookings');
    nextParams.set('booking', String(selectedBooking.id || selectedBooking._id));
    nextParams.set('fingerprint', String(fingerCode).toUpperCase());
    setSearchParams(nextParams);
  };

  const handleFingerprintClose = () => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('fingerprint');
    setSearchParams(nextParams);
  };

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeTab]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const markBridgeReady = () => {
      window.isBiometricBridgeAvailable = true;
    };

    window.addEventListener('biometricBridgeReady', markBridgeReady);
    if (window?.flutter_inappwebview?.callHandler) {
      markBridgeReady();
    }

    return () => {
      window.removeEventListener('biometricBridgeReady', markBridgeReady);
    };
  }, []);

  useEffect(() => {
    const videoElement = cameraVideoRef.current;
    if (!videoElement) {
      return undefined;
    }

    if (cameraCaptureState.open && cameraStream) {
      videoElement.srcObject = cameraStream;
      const playPromise = videoElement.play?.();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => { });
      }
      return undefined;
    }

    videoElement.srcObject = null;
    return undefined;
  }, [cameraCaptureState.open, cameraStream]);

  useEffect(() => () => {
    stopMediaStream(cameraStream);
  }, [cameraStream]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const markInspectionCameraBridgeReady = () => {
      window.isServiceCenterCameraBridgeAvailable = true;
    };

    window.addEventListener('serviceCenterCameraBridgeReady', markInspectionCameraBridgeReady);

    return () => {
      window.removeEventListener('serviceCenterCameraBridgeReady', markInspectionCameraBridgeReady);
    };
  }, []);

  useEffect(() => {
    if (!selectedBooking) {
      setBookingDraft({
        assignedStaffId: '',
        status: 'pending',
        serviceCenterNote: '',
      });
      setBiometricDraft(buildBiometricDraft());
      setThumbParticipantsDraft([]);
      setBiometricSource(readStoredBiometricSource());
      setBiometricStatus({
        tone: 'idle',
        message: '',
        fingerCode: '',
        action: '',
      });
      return;
    }

    setBookingDraft({
      assignedStaffId: String(selectedBooking.assignedStaff?.id || ''),
      status: String(selectedBooking.status || 'pending'),
      serviceCenterNote: String(selectedBooking.serviceCenterNote || ''),
    });
    setBiometricDraft(buildBiometricDraft(selectedBooking));
    setThumbParticipantsDraft(buildThumbParticipantsDraft(selectedBooking));
    setBiometricSource(readStoredBiometricSource(selectedBooking.id || selectedBooking._id));
    setBiometricStatus({
      tone: 'idle',
      message: '',
      fingerCode: '',
      action: '',
    });
  }, [selectedBooking]);

  const headerContent = useMemo(() => {
    if (activeTab === 'bookings') {
      return {
        badge: isStaffUser ? 'Booking Workbench' : 'Bookings Command',
        title: isStaffUser ? 'Assigned Bookings' : 'Bookings Queue',
        description: isStaffUser
          ? 'Handle the jobs assigned to your login, update status, and keep notes in one place.'
          : 'Track incoming requests, assign team members, and move bookings through the workflow.',
      };
    }

    if (activeTab === 'staff') {
      return {
        badge: 'Team Management',
        title: 'Service Team',
        description: 'Add staff, review your active team, and manage who can handle booking assignments.',
      };
    }

    if (activeTab === 'vehicles') {
      return {
        badge: 'Fleet Management',
        title: 'Rental Vehicles',
        description: 'Open any vehicle to view full details, edit pricing, and control what stays live in your catalog.',
      };
    }

    if (activeTab === 'profile') {
      return {
        badge: 'Account',
        title: 'Profile & Access',
        description: 'See account details tied to this service center login and manage your session.',
      };
    }

    return {
      badge: isStaffUser ? 'Service Center Staff Panel' : 'Service Center Owner Panel',
      title: profile?.vehicleMake || profile?.name || 'Service Center',
      description: isStaffUser
        ? 'Assigned work, updates, and progress all live in one mobile-friendly flow.'
        : 'Switch between overview, bookings, staff, and vehicles like a proper app screen.',
    };
  }, [activeTab, isStaffUser, profile?.name, profile?.vehicleMake]);

  const handleLogout = () => {
    clearDriverAuthState();
    navigate('/taxi/driver/login', { replace: true });
  };

  const handleStaffChange = (field, value) => {
    setStaffForm((current) => ({ ...current, [field]: value }));
  };

  const handleDeleteVehicle = async (vehicleId) => {
    if (!window.confirm('Delete this rental vehicle?')) {
      return;
    }

    try {
      await deleteServiceCenterVehicle(vehicleId);
      setVehicles((current) => current.filter((item) => String(item.id || item._id) !== String(vehicleId)));
    } catch (err) {
      setError(err?.message || 'Unable to delete vehicle');
    }
  };

  const openCreateVehicleForm = () => {
    navigate('/taxi/driver/service-center/vehicles/new');
  };

  const handleSaveStaff = async () => {
    if (!staffForm.name.trim()) {
      setError('Staff name is required');
      return;
    }

    if (staffForm.phone.replace(/\D/g, '').length !== 10) {
      setError('Staff number must be a valid 10-digit mobile number');
      return;
    }

    setSavingStaff(true);
    setError('');

    try {
      if (staffForm.id) {
        const response = await updateServiceCenterStaff(staffForm.id, {
          name: staffForm.name.trim(),
          phone: staffForm.phone.replace(/\D/g, '').slice(-10),
        });
        const updated = unwrap(response);
        setStaff((current) =>
          current.map((item) => (String(item.id || item._id) === String(updated.id || updated._id) ? updated : item)),
        );
        setBookingStaffOptions((current) =>
          current.map((item) => (String(item.id || item._id) === String(updated.id || updated._id) ? updated : item)),
        );
      } else {
        const response = await createServiceCenterStaff({
          name: staffForm.name.trim(),
          phone: staffForm.phone.replace(/\D/g, '').slice(-10),
        });
        const created = unwrap(response);
        setStaff((current) => [created, ...current]);
        setBookingStaffOptions((current) => [created, ...current]);
      }

      setStaffForm(buildStaffForm());
      setShowStaffForm(false);
    } catch (err) {
      setError(err?.message || `Unable to ${staffForm.id ? 'update' : 'add'} staff`);
    } finally {
      setSavingStaff(false);
    }
  };

  const handleEditStaff = (member) => {
    setStaffForm({
      id: String(member?.id || member?._id || ''),
      name: String(member?.name || ''),
      phone: String(member?.phone || ''),
    });
    setShowStaffForm(true);
    setError('');
  };

  const handleDeleteStaff = async (member) => {
    const staffId = member?.id || member?._id;
    if (!staffId) {
      return;
    }

    if (!window.confirm(`Delete ${member?.name || 'this staff member'}?`)) {
      return;
    }

    setSavingStaff(true);
    setError('');

    try {
      await deleteServiceCenterStaff(staffId);
      setStaff((current) => current.filter((item) => String(item.id || item._id) !== String(staffId)));
      setBookingStaffOptions((current) => current.filter((item) => String(item.id || item._id) !== String(staffId)));
      if (String(staffForm.id || '') === String(staffId)) {
        setStaffForm(buildStaffForm());
        setShowStaffForm(false);
      }
    } catch (err) {
      setError(err?.message || 'Unable to delete staff');
    } finally {
      setSavingStaff(false);
    }
  };

  const openVehicleEditor = (vehicle) => {
    const id = vehicle?.id || vehicle?._id;
    if (!id) {
      return;
    }
    navigate(`/taxi/driver/service-center/vehicles/${id}`);
  };

  const patchBookingLocal = (bookingId, patch) => {
    setBookings((current) =>
      current.map((item) =>
        String(item.id || item._id) === String(bookingId)
          ? {
            ...item,
            ...patch,
            rentalInspection: patch?.rentalInspection
              ? mergeRentalInspection(item.rentalInspection, patch.rentalInspection)
              : item.rentalInspection,
            biometrics: patch?.biometrics || item.biometrics,
          }
          : item,
      ),
    );
  };

  const patchBookingInspectionLocal = (bookingId, patch) => {
    patchBookingLocal(bookingId, {
      rentalInspection: patch,
    });
  };

  const updateBookingInspection = async (bookingId, section, key, value) => {
    await handleBookingUpdate(bookingId, {
      rentalInspection: {
        [section]: {
          [key]: value,
        },
      },
    });
  };

  const updateBookingInspectionNotes = async (bookingId, key, value) => {
    await handleBookingUpdate(bookingId, {
      rentalInspection: {
        [key]: value,
      },
    });
  };

  const attachInspectionImageToBooking = async (bookingId, field, slotIndex, imageSource, metadata = null) => {
    const uploadResult = await uploadService.uploadImage(imageSource, 'service-center-condition');
    const imageUrl = uploadResult?.url || uploadResult?.secureUrl || '';
    if (!imageUrl) {
      throw new Error('Unable to upload selected image');
    }

    const currentBooking =
      bookings.find((item) => String(item.id || item._id) === String(bookingId)) || null;
    const currentInspection = currentBooking?.rentalInspection || {};
    const currentImages = normalizeConditionImages(currentInspection[field]);
    const detailsField = getConditionImageDetailsField(field);
    const currentDetails = normalizeConditionImageDetails(currentInspection[detailsField]);
    const nextDetail = {
      imageUrl,
      capturedAt: metadata?.capturedAt || new Date().toISOString(),
      latitude:
        metadata?.latitude === null || metadata?.latitude === undefined || metadata?.latitude === ''
          ? null
          : Number(metadata.latitude),
      longitude:
        metadata?.longitude === null || metadata?.longitude === undefined || metadata?.longitude === ''
          ? null
          : Number(metadata.longitude),
      address: String(metadata?.address || '').trim(),
      source: String(metadata?.source || '').trim(),
      fileName: String(metadata?.fileName || '').trim(),
      mimeType: String(metadata?.mimeType || '').trim(),
      deviceModel: String(metadata?.deviceModel || '').trim(),
      watermarkText: String(metadata?.watermarkText || '').trim(),
      exif: metadata?.exif && typeof metadata.exif === 'object' ? metadata.exif : {},
    };

    await handleBookingUpdate(bookingId, {
      rentalInspection: {
        [field]: setConditionImageAtSlot(currentImages, slotIndex, imageUrl),
        [detailsField]: setConditionImageDetailAtSlot(currentDetails, slotIndex, nextDetail),
      },
    });
  };

  const uploadConditionImages = async (bookingId, field, slotIndex, fileList, source = 'upload') => {
    const files = Array.from(fileList || []).filter(Boolean);
    if (!files.length) {
      return;
    }

    const uploadTarget = `${field}:${slotIndex}:${source}`;
    setUploadingConditionSection(uploadTarget);
    setError('');

    try {
      const file = files[0];
      const dataUrl = await compressInspectionImageForUpload(file);
      const location = source === 'camera' ? await getBrowserCaptureLocation() : null;
      await attachInspectionImageToBooking(bookingId, field, slotIndex, dataUrl, {
        capturedAt: new Date().toISOString(),
        latitude: location?.latitude ?? null,
        longitude: location?.longitude ?? null,
        source,
        fileName: String(file?.name || '').trim(),
        mimeType: String(file?.type || 'image/jpeg').trim(),
      });
    } catch (err) {
      setError(err?.message || 'Unable to upload condition images');
    } finally {
      setUploadingConditionSection('');
    }
  };

  const removeConditionImage = async (bookingId, field, slotIndex) => {
    const currentBooking =
      bookings.find((item) => String(item.id || item._id) === String(bookingId)) || null;
    const currentInspection = currentBooking?.rentalInspection || {};
    const currentImages = normalizeConditionImages(currentInspection[field]);
    const detailsField = getConditionImageDetailsField(field);
    const currentDetails = normalizeConditionImageDetails(currentInspection[detailsField]);

    await handleBookingUpdate(bookingId, {
      rentalInspection: {
        [field]: setConditionImageAtSlot(currentImages, slotIndex, ''),
        [detailsField]: setConditionImageDetailAtSlot(currentDetails, slotIndex, null),
      },
    });
  };

  const handleBookingUpdate = async (bookingId, payload) => {
    setUpdatingBookingId(String(bookingId));
    setError('');

    try {
      const response = await updateServiceCenterBooking(bookingId, payload);
      const updated = unwrap(response);
      patchBookingLocal(bookingId, updated);
    } catch (err) {
      setError(err?.message || 'Unable to update booking');
    } finally {
      setUpdatingBookingId('');
    }
  };

  const closeCameraCaptureModal = () => {
    stopMediaStream(cameraStream);
    setCameraStream(null);
    setCameraCaptureBusy(false);
    setCameraCaptureError('');
    setCameraCaptureState({
      open: false,
      field: '',
      slotIndex: -1,
      slotLabel: '',
      bookingId: '',
    });
  };

  const openCameraCaptureModal = async (bookingId, field, slotIndex, slotLabel = '') => {
    if (!navigator?.mediaDevices?.getUserMedia) {
      triggerInspectionCameraInput(field, slotIndex);
      return;
    }

    setCameraCaptureBusy(true);
    setCameraCaptureError('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
        },
        audio: false,
      });

      stopMediaStream(cameraStream);
      setCameraStream(stream);
      setCameraCaptureState({
        open: true,
        field,
        slotIndex,
        slotLabel,
        bookingId: String(bookingId || ''),
      });
    } catch (captureError) {
      triggerInspectionCameraInput(field, slotIndex);
      setError(captureError?.message || 'Unable to access the camera');
    } finally {
      setCameraCaptureBusy(false);
    }
  };

  const captureInspectionCameraFrame = async () => {
    const videoElement = cameraVideoRef.current;
    if (!videoElement || !cameraCaptureState.open || !cameraCaptureState.bookingId) {
      return;
    }

    setCameraCaptureBusy(true);
    setCameraCaptureError('');

    try {
      const width = Math.max(1, videoElement.videoWidth || 1280);
      const height = Math.max(1, videoElement.videoHeight || 720);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Unable to capture the camera frame');
      }

      context.drawImage(videoElement, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      const uploadTarget = `${cameraCaptureState.field}:${cameraCaptureState.slotIndex}:camera`;
      setUploadingConditionSection(uploadTarget);
      const location = await getBrowserCaptureLocation();
      await attachInspectionImageToBooking(
        cameraCaptureState.bookingId,
        cameraCaptureState.field,
        cameraCaptureState.slotIndex,
        dataUrl,
        {
          capturedAt: new Date().toISOString(),
          latitude: location?.latitude ?? null,
          longitude: location?.longitude ?? null,
          source: 'browser_camera',
          mimeType: 'image/jpeg',
        },
      );

      closeCameraCaptureModal();
    } catch (captureError) {
      setCameraCaptureError(captureError?.message || 'Unable to capture photo');
    } finally {
      setUploadingConditionSection('');
      setCameraCaptureBusy(false);
    }
  };

  const triggerInspectionCameraInput = (field, slotIndex) => {
    if (typeof document === 'undefined') {
      return;
    }

    const input = document.getElementById(buildInspectionCameraInputId(field, slotIndex));
    if (input && typeof input.click === 'function') {
      input.click();
    }
  };

  const requestInspectionCameraCapture = async (field, slotIndex, slotLabel = '') => {
    const bookingId = selectedBooking?.id || selectedBooking?._id || '';

    if (!isInspectionCameraBridgeAvailable() && bookingId) {
      await openCameraCaptureModal(bookingId, field, slotIndex, slotLabel);
      return;
    }

    if (!isInspectionCameraBridgeAvailable()) {
      triggerInspectionCameraInput(field, slotIndex);
      return;
    }

    const uploadTarget = `${field}:${slotIndex}:camera`;
    setUploadingConditionSection(uploadTarget);
    setError('');

    const payload = {
      type: 'service_center_inspection_photo',
      action: 'capture',
      field,
      slotIndex,
      slotLabel,
      bookingId,
      source: 'service_center_dashboard',
    };

    try {
      if (typeof window.__nativeServiceCenterCamera === 'function') {
        const nativeResult = await window.__nativeServiceCenterCamera(payload);
        const normalized = normalizeInspectionPhotoBridgeResult(nativeResult);
        if (normalized?.dataUrl) {
          await attachInspectionImageToBooking(bookingId, field, slotIndex, normalized.dataUrl, normalized);
          return;
        }
      }

      if (window?.flutter_inappwebview?.callHandler) {
        const handlers = [
          'openCamera',
          'serviceCenterCamera',
          'serviceCenterInspectionPhoto',
          'captureInspectionPhoto',
          'cameraCapture',
        ];

        for (const handlerName of handlers) {
          try {
            const result = handlerName === 'openCamera'
              ? await window.flutter_inappwebview.callHandler(handlerName)
              : await window.flutter_inappwebview.callHandler(handlerName, payload);
            const normalized = normalizeInspectionPhotoBridgeResult(result);
            if (normalized?.dataUrl) {
              await attachInspectionImageToBooking(bookingId, field, slotIndex, normalized.dataUrl, normalized);
              return;
            }
          } catch {
            // Try the next known handler name before falling back to the file input.
          }
        }
      }
    } finally {
      setUploadingConditionSection('');
    }

    if (bookingId) {
      await openCameraCaptureModal(bookingId, field, slotIndex, slotLabel);
      return;
    }

    triggerInspectionCameraInput(field, slotIndex);
  };

  const refreshBookingBiometrics = async (bookingId) => {
    const response = await getServiceCenterBookingBiometrics(bookingId);
    const payload = unwrap(response);
    if (payload?.booking) {
      patchBookingLocal(bookingId, payload.booking);
      return payload.booking;
    }
    return null;
  };

  const persistThumbParticipants = async (nextParticipants) => {
    if (!selectedBooking) {
      return null;
    }

    const payload = nextParticipants.map((item, index) => ({
      participantKey: String(item?.participantKey || buildThumbParticipantKey(item?.participantType || 'co_passenger')),
      participantType: String(item?.participantType || 'co_passenger'),
      participantLabel: String(item?.participantLabel || item?.name || 'Participant'),
      userType: String(item?.userType || item?.participantType || 'participant'),
      name: String(item?.name || '').trim(),
      phone: String(item?.phone || '').replace(/\D/g, '').slice(0, 10),
      linkedUserId: String(item?.linkedUserId || ''),
      linkedStaffId: String(item?.linkedStaffId || ''),
      isPrimary: item?.isPrimary === true,
      sortOrder: Number.isFinite(Number(item?.sortOrder)) ? Number(item.sortOrder) : index,
    }));

    const response = await updateServiceCenterBookingBiometrics(selectedBooking.id || selectedBooking._id, {
      thumbParticipants: payload,
    });
    const updated = unwrap(response)?.booking || unwrap(response);
    if (updated?.id || updated?._id) {
      patchBookingLocal(selectedBooking.id || selectedBooking._id, updated);
      setThumbParticipantsDraft(buildThumbParticipantsDraft(updated));
      return updated;
    }
    return refreshBookingBiometrics(selectedBooking.id || selectedBooking._id);
  };

  const addCoPassengerParticipant = async () => {
    const nextParticipants = [
      ...thumbParticipantsDraft,
      {
        participantKey: buildThumbParticipantKey('co_passenger'),
        participantType: 'co_passenger',
        participantLabel: `Co-passenger ${thumbParticipantsDraft.filter((item) => item.participantType === 'co_passenger').length + 1}`,
        userType: 'co_passenger',
        name: '',
        phone: '',
        linkedUserId: '',
        linkedStaffId: '',
        isPrimary: false,
        sortOrder: thumbParticipantsDraft.length,
      },
    ];
    setThumbParticipantsDraft(nextParticipants);
    await persistThumbParticipants(nextParticipants);
  };

  const handleThumbParticipantFieldBlur = async (participantKey, field, value) => {
    const nextParticipants = thumbParticipantsDraft.map((item) =>
      item.participantKey === participantKey
        ? {
          ...item,
          [field]: field === 'phone' ? String(value || '').replace(/\D/g, '').slice(0, 10) : value,
        }
        : item,
    );
    setThumbParticipantsDraft(nextParticipants);
    await persistThumbParticipants(nextParticipants);
  };

  const invokeThumbCaptureBridge = async (payload = {}, preferredSource = biometricSource) => {
    const bridgePayload = {
      ...payload,
      preferredSource,
      biometricSource: preferredSource,
      mode: 'raw_image_only',
      imageOnly: true,
      allowedFormats: ['png', 'jpg', 'jpeg', 'bmp'],
      runtime: window?.flutter_inappwebview?.callHandler ? 'flutter-webview' : 'browser',
    };

    if (window?.ServiceCenterBiometricBridge?.captureThumbImage) {
      return window.ServiceCenterBiometricBridge.captureThumbImage(bridgePayload);
    }

    if (window?.flutter_inappwebview?.callHandler) {
      const attempts = [
        ['thumbCapture', [`thumb-capture:${preferredSource}`, bridgePayload]],
        ['thumbCapture', [bridgePayload]],
        ['biometricThumbCapture', [bridgePayload]],
        ['fingerprint', [`fingerprint:${preferredSource}:capture-image`, bridgePayload]],
      ];

      for (const [handlerName, args] of attempts) {
        try {
          const result = await withBridgeTimeout(window.flutter_inappwebview.callHandler(handlerName, ...args));
          if (result) {
            return parseBridgeObject(result);
          }
        } catch {
          // Try the next native bridge signature.
        }
      }
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/bmp';
    const selectedFile = await new Promise((resolve) => {
      input.onchange = () => resolve(input.files?.[0] || null);
      input.click();
    });

    if (!selectedFile) {
      throw new Error('Thumb capture was cancelled.');
    }

    const imageBase64 = await readFileAsDataUrl(selectedFile);
    return {
      imageBase64,
      mimeType: selectedFile.type || 'image/png',
      fileName: selectedFile.name || '',
      captureSource: preferredSource || 'manual',
      deviceLabel: preferredSource === 'phone_sensor' ? 'Phone Capture' : 'Manual Upload',
    };
  };

  const handleThumbCapture = async (participant, thumbCode) => {
    if (!selectedBooking || !participant?.participantKey) {
      return;
    }

    if (!biometricDraft.consentAccepted && !selectedBooking?.biometrics?.consentAccepted) {
      setBiometricStatus({
        tone: 'error',
        message: 'Save customer consent before capturing thumb images.',
        fingerCode: thumbCode,
        action: 'capture',
      });
      return;
    }

    const actionKey = `thumb:${participant.participantKey}:${thumbCode}`;
    setThumbAction(actionKey);
    setBiometricStatus({
      tone: 'loading',
      message: `Waiting for ${participant.participantLabel} ${thumbCode === 'LEFT_THUMB' ? 'left' : 'right'} thumb capture...`,
      fingerCode: thumbCode,
      action: 'capture',
    });

    try {
      await saveBiometricDraft();

      const bridgeResult = await invokeThumbCaptureBridge({
        bookingId: selectedBooking.id || selectedBooking._id,
        participantKey: participant.participantKey,
        participantType: participant.participantType,
        participantLabel: participant.participantLabel,
        userType: participant.userType,
        thumbCode,
      }, biometricSource);

      const imageBase64 = pickFirstBiometricPreviewValue(
        bridgeResult?.imageBase64,
        bridgeResult?.base64Image,
        bridgeResult?.previewImage,
        bridgeResult?.image,
        bridgeResult?.imageUrl,
        bridgeResult?.path,
      );

      if (!imageBase64) {
        throw new Error('The scanner did not return a thumb image.');
      }

      const uploadResult = imageBase64.startsWith('data:image/')
        ? await uploadService.uploadImage(imageBase64, `service-center/booking-${selectedBooking.id || selectedBooking._id}/thumbs`)
        : { data: { url: imageBase64 }, url: imageBase64 };
      const uploadedUrl = uploadResult?.data?.url || uploadResult?.url || uploadResult?.secureUrl || '';

      if (!uploadedUrl) {
        throw new Error('Unable to upload the captured thumb image.');
      }

      const existingCaptures = Array.isArray(selectedBooking?.biometrics?.thumbCaptures) ? selectedBooking.biometrics.thumbCaptures : [];
      const nextCaptures = [
        ...existingCaptures.filter(
          (item) => !(String(item?.participantKey || '') === String(participant.participantKey) && String(item?.thumbCode || '') === String(thumbCode)),
        ),
        {
          captureId: `${participant.participantKey}:${thumbCode}`,
          participantKey: participant.participantKey,
          participantType: participant.participantType,
          participantLabel: participant.participantLabel,
          userType: participant.userType,
          thumbCode,
          imageUrl: uploadedUrl,
          mimeType: bridgeResult?.mimeType || 'image/png',
          fileName: bridgeResult?.fileName || '',
          captureSource: normalizeBiometricCaptureSource(bridgeResult?.captureSource, biometricSource),
          deviceLabel: bridgeResult?.deviceLabel || '',
          scannerSerial: bridgeResult?.scannerSerial || '',
          notes: bridgeResult?.notes || '',
          capturedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      const response = await updateServiceCenterBookingBiometrics(selectedBooking.id || selectedBooking._id, {
        thumbParticipants: thumbParticipantsDraft,
        thumbCaptures: nextCaptures,
      });
      const updated = unwrap(response)?.booking || unwrap(response);
      if (updated?.id || updated?._id) {
        patchBookingLocal(selectedBooking.id || selectedBooking._id, updated);
      } else {
        await refreshBookingBiometrics(selectedBooking.id || selectedBooking._id);
      }

      setBiometricStatus({
        tone: 'success',
        message: `${participant.participantLabel} ${thumbCode === 'LEFT_THUMB' ? 'left' : 'right'} thumb captured successfully.`,
        fingerCode: thumbCode,
        action: 'capture',
      });
    } catch (err) {
      setBiometricStatus({
        tone: 'error',
        message: err?.message || 'Unable to capture thumb image.',
        fingerCode: thumbCode,
        action: 'capture',
      });
    } finally {
      setThumbAction('');
    }
  };

  const handleDeleteThumbCapture = async (captureId) => {
    if (!selectedBooking || !captureId) {
      return;
    }

    const existingCaptures = Array.isArray(selectedBooking?.biometrics?.thumbCaptures) ? selectedBooking.biometrics.thumbCaptures : [];
    const nextCaptures = existingCaptures.filter((item) => String(item?.captureId || '') !== String(captureId));
    const response = await updateServiceCenterBookingBiometrics(selectedBooking.id || selectedBooking._id, {
      thumbParticipants: thumbParticipantsDraft,
      thumbCaptures: nextCaptures,
    });
    const updated = unwrap(response)?.booking || unwrap(response);
    if (updated?.id || updated?._id) {
      patchBookingLocal(selectedBooking.id || selectedBooking._id, updated);
    } else {
      await refreshBookingBiometrics(selectedBooking.id || selectedBooking._id);
    }
  };

  const handlePrintAgreement = () => {
    if (!selectedBooking) {
      return;
    }

    const captures = Array.isArray(selectedBooking?.biometrics?.thumbCaptures) ? selectedBooking.biometrics.thumbCaptures : [];
    const participants = thumbParticipantsDraft.length > 0
      ? thumbParticipantsDraft
      : (Array.isArray(selectedBooking?.biometrics?.thumbParticipants) ? selectedBooking.biometrics.thumbParticipants : []);
    const groupedCaptures = participants.map((participant) => ({
      participant,
      captures: captures.filter((item) => String(item?.participantKey || '') === String(participant.participantKey)),
    }));
    const matchedParticipantKeys = new Set(groupedCaptures.map((entry) => String(entry?.participant?.participantKey || '')));
    const orphanCaptures = captures.filter(
      (item) => !matchedParticipantKeys.has(String(item?.participantKey || '')),
    );
    if (orphanCaptures.length > 0) {
      groupedCaptures.push({
        participant: {
          participantKey: 'unmatched-captures',
          participantLabel: 'Additional Thumb Captures',
          name: '',
          phone: '',
        },
        captures: orphanCaptures,
      });
    }

    const html = `<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Rental Agreement ${escapePrintHtml(selectedBooking.bookingReference || '')}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #0f172a; }
            h1,h2,h3 { margin: 0 0 8px; }
            .card { border: 1px solid #cbd5e1; border-radius: 16px; padding: 16px; margin: 16px 0; }
            .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
            .thumb { border: 1px solid #cbd5e1; border-radius: 12px; padding: 12px; text-align: center; }
            .thumb img { max-width: 100%; max-height: 180px; object-fit: contain; display: block; margin: 0 auto 8px; }
            .muted { color: #64748b; font-size: 12px; }
            @media print {
              body { padding: 12px; }
              .card { break-inside: avoid; }
              .thumb { break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <h1>Rental Agreement</h1>
          <p class="muted">Booking ${escapePrintHtml(selectedBooking.bookingReference || '')}</p>
          <div class="card">
            <h3>Customer</h3>
            <p>${escapePrintHtml(selectedBooking.customer?.name || 'N/A')} | ${escapePrintHtml(selectedBooking.customer?.phone || 'N/A')}</p>
            <p>${escapePrintHtml(selectedBooking.vehicleName || 'Vehicle')} | ${escapePrintHtml(selectedBooking.pickupDateTime ? new Date(selectedBooking.pickupDateTime).toLocaleString() : 'N/A')}</p>
          </div>
          ${groupedCaptures.map(({ participant, captures: participantCaptures }) => `
            <div class="card">
              <h3>${escapePrintHtml(participant.participantLabel || 'Participant')}</h3>
              <p class="muted">${escapePrintHtml(participant.name || '')} ${participant.phone ? `| ${escapePrintHtml(participant.phone)}` : ''}</p>
              <div class="grid">
                ${participantCaptures.length > 0 ? participantCaptures.map((capture) => `
                  <div class="thumb">
                    <img src="${escapePrintHtml(capture.imageUrl || capture.previewImage || '')}" alt="${escapePrintHtml(capture.thumbCode || 'Thumb')}" />
                    <div><strong>${capture.thumbCode === 'LEFT_THUMB' ? 'Left Thumb' : capture.thumbCode === 'RIGHT_THUMB' ? 'Right Thumb' : 'Thumb'}</strong></div>
                    <div class="muted">${escapePrintHtml(capture.captureSource || 'unknown')}${capture.capturedAt ? ` | ${escapePrintHtml(new Date(capture.capturedAt).toLocaleString())}` : ''}</div>
                  </div>
                `).join('') : '<p class="muted">No thumb capture saved yet.</p>'}
              </div>
            </div>
          `).join('')}
          <script>
            (function () {
              const images = Array.from(document.images || []);
              const done = () => {
                setTimeout(() => {
                  window.focus();
                  window.print();
                }, 250);
              };
              if (!images.length) {
                if (document.readyState === 'complete') done();
                else window.addEventListener('load', done, { once: true });
                return;
              }
              let settled = 0;
              const finish = () => {
                settled += 1;
                if (settled >= images.length) done();
              };
              images.forEach((img) => {
                if (img.complete) {
                  finish();
                } else {
                  img.addEventListener('load', finish, { once: true });
                  img.addEventListener('error', finish, { once: true });
                }
              });
              setTimeout(done, 3000);
            })();
          </script>
        </body>
      </html>`;

    const printWindow = window.open('', '_blank', 'width=980,height=720');
    if (!printWindow) {
      setError('Popup blocked by the browser. Allow popups for this page and try printing again.');
      return;
    }
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const saveBiometricDraft = async () => {
    if (!selectedBooking) {
      return null;
    }

    const normalizedRequiredFingerCount =
      biometricDraft.requiredFingerCount === '' || biometricDraft.requiredFingerCount === null
        ? 0
        : Number(biometricDraft.requiredFingerCount);
    if (!Number.isInteger(normalizedRequiredFingerCount) || normalizedRequiredFingerCount < 0 || normalizedRequiredFingerCount > 10) {
      setError('Target finger count must be between 0 and 10');
      return;
    }

    setBiometricAction('settings');
    setError('');

    try {
      const response = await updateServiceCenterBookingBiometrics(selectedBooking.id || selectedBooking._id, {
        consentAccepted: biometricDraft.consentAccepted,
        consentNotes: biometricDraft.consentNotes,
        enrollmentMode: biometricDraft.enrollmentMode,
        requiredFingerCount: normalizedRequiredFingerCount,
        notes: biometricDraft.notes,
      });
      const updated = unwrap(response)?.booking || unwrap(response);
      if (updated?.id || updated?._id) {
        patchBookingLocal(selectedBooking.id || selectedBooking._id, updated);
        setBiometricDraft(buildBiometricDraft(updated));
        return updated;
      }
      return null;
    } catch (err) {
      setError(err?.message || 'Unable to save biometric enrollment settings');
      throw err;
    } finally {
      setBiometricAction('');
    }
  };

  const getBiometricPreflightMessage = (action, finger, bridgeStatus, enrolled = false) => {
    if (!selectedBooking) {
      return 'Open a booking before starting biometric capture.';
    }

    if (action === 'captureFinger' && !biometricDraft.consentAccepted && !selectedBooking?.biometrics?.consentAccepted) {
      return 'Save customer consent before starting fingerprint capture.';
    }

    if (action === 'verifyFinger' && !enrolled) {
      return `Capture ${finger.label} before trying to verify it.`;
    }

    if (action === 'verifyFinger') {
      const enrolledFingers = Array.isArray(selectedBooking?.biometrics?.fingers)
        ? selectedBooking.biometrics.fingers
        : [];
      const enrolledRecord = enrolledFingers.find(
        (item) => String(item?.fingerCode || '').trim().toUpperCase() === String(finger.code).toUpperCase(),
      );
      if (isRdServiceFingerRecord(enrolledRecord)) {
        return 'This finger was enrolled through IDEMIA RD Service. RD capture returns secured PID XML for authentication, so local re-verify is not available in this flow. Use Rescan if you need to refresh the enrolled capture.';
      }
    }

    if (biometricSource === 'usb_scanner' && bridgeStatus === 'demo-mode') {
      return 'USB scanner bridge is not connected in this browser. Use the Flutter APK bridge or connect a desktop FingerprintBridge first.';
    }

    if (biometricSource === 'usb_scanner' && bridgeStatus === 'unknown') {
      return 'USB scanner bridge status is unavailable right now. Reopen the booking and reconnect the device.';
    }

    if (biometricSource === 'phone_sensor' && bridgeStatus === 'demo-mode') {
      return 'Phone sensor flow needs the Flutter WebView bridge. Open this booking inside the APK to test it.';
    }

    return '';
  };

  const invokeFingerprintBridge = async (action, payload = {}, preferredSource = biometricSource) => {
    const bridgePayload = {
      ...payload,
      preferredSource,
      biometricSource: preferredSource,
      runtime: window?.flutter_inappwebview?.callHandler ? 'flutter-webview' : 'browser',
    };
    const bridgeAction = getBridgeCommandAction(action);

    if (window?.FingerprintBridge && typeof window.FingerprintBridge[action] === 'function') {
      const result = await window.FingerprintBridge[action](bridgePayload);
      return normalizeBridgeResult(result, preferredSource, action);
    }

    if (window?.flutter_inappwebview?.callHandler) {
      const command = `fingerprint:${preferredSource}:${bridgeAction}`;
      const legacyCommand = `fingerprint:${bridgeAction}`;
      const handlerAttempts = [
        { handlerName: 'fingerprint', args: [command, bridgePayload] },
        { handlerName: 'fingerprint', args: [legacyCommand, bridgePayload] },
        { handlerName: command, args: [bridgePayload] },
        { handlerName: legacyCommand, args: [bridgePayload] },
        { handlerName: action, args: [bridgePayload] },
        { handlerName: bridgeAction, args: [bridgePayload] },
      ];

      try {
        for (const attempt of handlerAttempts) {
          try {
            const result = await withBridgeTimeout(
              window.flutter_inappwebview.callHandler(
                attempt.handlerName,
                ...attempt.args,
              ),
            );
            if (result !== undefined && result !== null && result !== '') {
              return normalizeBridgeResult(result, preferredSource, action);
            }
          } catch {
            // Try the next known Flutter bridge signature.
          }
        }
      } catch (error) {
        if (window.isBiometricBridgeAvailable === true) {
          throw error;
        }
      }

      if (window.isBiometricBridgeAvailable === true) {
        throw new Error(
          `The ${getBiometricSourceActionLabel(preferredSource).toLowerCase()} bridge is connected, but the APK did not return any scan result. Check the Flutter WebView handler names and make sure it returns ${action === 'verifyFinger' ? 'a verification result' : 'capture data'} for ${bridgeAction}.`,
        );
      }
    }

    if (action === 'captureFinger') {
      const templateData = window.prompt(
        `No ${getBiometricSourceActionLabel(preferredSource).toLowerCase()} bridge is connected yet.\nPaste a demo template/token for ${payload?.fingerLabel || payload?.fingerCode || 'finger'} to continue testing the website flow.`,
      );
      if (!templateData) {
        throw new Error('Fingerprint capture was cancelled');
      }
      return {
        templateData,
        templateFormat: 'demo-template',
        qualityScore: 82,
        captureSource: preferredSource === 'phone_sensor' ? 'phone_sensor' : 'manual',
        deviceLabel: preferredSource === 'phone_sensor' ? 'Phone Demo' : 'Browser Demo',
        scannerSerial: preferredSource === 'phone_sensor' ? 'PHONE-DEMO' : 'WEB-DEMO',
        sampleCount: 1,
      };
    }

    if (action === 'verifyFinger') {
      const status = window.prompt(
        `No ${getBiometricSourceActionLabel(preferredSource).toLowerCase()} verifier bridge is connected yet.\nType one of: matched, failed, low_quality`,
        'matched',
      );
      if (!status) {
        throw new Error('Fingerprint verification was cancelled');
      }
      return {
        verificationStatus: status,
        localMatch: status === 'matched',
        matchScore: status === 'matched' ? 92 : 41,
        captureSource: preferredSource,
      };
    }

    return null;
  };

  const handleCaptureFinger = async (finger) => {
    if (!selectedBooking) {
      return;
    }

    const bridgeStatus = getBiometricBridgeStatus(biometricSource);
    const preflightMessage = getBiometricPreflightMessage('captureFinger', finger, bridgeStatus, false);
    if (preflightMessage) {
      setBiometricStatus({
        tone: 'error',
        message: preflightMessage,
        fingerCode: finger.code,
        action: 'capture',
      });
      return;
    }

    setBiometricAction(`capture:${finger.code}`);
    setBiometricStatus({
      tone: 'loading',
      message:
        biometricSource === 'usb_scanner'
          ? `Waiting for the USB scanner to capture ${finger.label}. Place the finger on the device now.`
          : `Waiting for ${finger.label} capture from the phone sensor.`,
      fingerCode: finger.code,
      action: 'capture',
    });
    setError('');

    try {
      if (!selectedBooking?.biometrics?.id) {
        setBiometricStatus({
          tone: 'loading',
          message: 'Saving biometric consent and enrollment settings before capture…',
          fingerCode: finger.code,
          action: 'capture',
        });
        await saveBiometricDraft();
      }

      setBiometricStatus({
        tone: 'loading',
        message:
          biometricSource === 'usb_scanner'
            ? `Scanner connected. Capture in progress for ${finger.label}…`
            : `Capture in progress for ${finger.label}…`,
        fingerCode: finger.code,
        action: 'capture',
      });
      const bridgeResult = await invokeFingerprintBridge('captureFinger', {
        fingerCode: finger.code,
        fingerLabel: finger.label,
        bookingId: selectedBooking.id || selectedBooking._id,
      }, biometricSource);

      if (bridgeResult && typeof bridgeResult === 'object' && bridgeResult.success === false) {
        throw new Error(String(bridgeResult.message || `Unable to capture ${finger.label}`));
      }

      const templateData = String(
        pickFirstBiometricValue(
          bridgeResult?.templateData,
          bridgeResult?.template,
          bridgeResult?.fingerprintTemplate,
          bridgeResult?.isoTemplate,
          bridgeResult?.ansiTemplate,
          bridgeResult?.wsqTemplate,
          bridgeResult?.rawTemplate,
          bridgeResult?.payload,
        ),
      ).trim();

      if (!templateData) {
        throw new Error(
          biometricSource === 'phone_sensor'
            ? 'Phone sensor capture needs the Flutter bridge to return templateData. Android local-auth alone only confirms identity, so use the USB scanner for enrollment unless your APK bridge exposes raw template data.'
            : 'Fingerprint capture did not return template data.',
        );
      }

      const response = await captureServiceCenterBookingFingerprint(selectedBooking.id || selectedBooking._id, {
        fingerCode: finger.code,
        templateData,
        templateFormat: bridgeResult?.templateFormat || 'vendor-template',
        previewImage: pickFirstBiometricPreviewValue(
          bridgeResult?.previewImage,
          bridgeResult?.imageBase64,
          bridgeResult?.base64Image,
          bridgeResult?.previewBase64,
          bridgeResult?.bitmap,
          bridgeResult?.bitmapBase64,
          bridgeResult?.bmpBase64,
          bridgeResult?.imageData,
          bridgeResult?.fingerprintImage,
          bridgeResult?.fingerImage,
          bridgeResult?.image,
          bridgeResult?.imageUrl,
        ),
        qualityScore: bridgeResult?.qualityScore,
        captureSource: normalizeBiometricCaptureSource(bridgeResult?.captureSource, biometricSource || 'manual'),
        deviceLabel: bridgeResult?.deviceLabel || bridgeResult?.deviceName || '',
        scannerSerial: bridgeResult?.scannerSerial || bridgeResult?.deviceId || '',
        sampleCount: bridgeResult?.sampleCount || 1,
        notes: bridgeResult?.notes || '',
      });

      const updated = unwrap(response)?.booking || unwrap(response);
      if (updated?.id || updated?._id) {
        patchBookingLocal(selectedBooking.id || selectedBooking._id, updated);
        setBiometricDraft(buildBiometricDraft(updated));
      } else {
        await refreshBookingBiometrics(selectedBooking.id || selectedBooking._id);
      }
      const resolvedTemplateFormat = String(bridgeResult?.templateFormat || '').trim().toLowerCase();
      setBiometricStatus({
        tone: 'success',
        message: isRdServiceTemplateFormat(resolvedTemplateFormat)
          ? `${finger.label} captured successfully from the IDEMIA RD USB scanner. This enrollment is stored as RD PID XML, so local verify is disabled in this flow.`
          : `${finger.label} captured successfully from ${getBiometricSourceLabel(biometricSource)}.`,
        fingerCode: finger.code,
        action: 'capture',
      });
    } catch (err) {
      const message = err?.message || `Unable to capture ${finger.label}`;
      setBiometricStatus({
        tone: 'error',
        message,
        fingerCode: finger.code,
        action: 'capture',
      });
    } finally {
      setBiometricAction('');
    }
  };

  const handleVerifyFinger = async (finger) => {
    if (!selectedBooking) {
      return;
    }

    const bridgeStatus = getBiometricBridgeStatus(biometricSource);
    const enrolledFingerSet = new Set(
      Array.isArray(selectedBooking?.biometrics?.enrolledFingerCodes) ? selectedBooking.biometrics.enrolledFingerCodes : [],
    );
    const preflightMessage = getBiometricPreflightMessage('verifyFinger', finger, bridgeStatus, enrolledFingerSet.has(finger.code));
    if (preflightMessage) {
      setBiometricStatus({
        tone: 'error',
        message: preflightMessage,
        fingerCode: finger.code,
        action: 'verify',
      });
      return;
    }

    setBiometricAction(`verify:${finger.code}`);
    setBiometricStatus({
      tone: 'loading',
      message:
        biometricSource === 'usb_scanner'
          ? `Waiting for USB scanner verification for ${finger.label}. Ask the customer to place the same finger on the device.`
          : `Verification in progress for ${finger.label}…`,
      fingerCode: finger.code,
      action: 'verify',
    });
    setError('');

    try {
      const enrolledFingers = Array.isArray(selectedBooking?.biometrics?.fingers)
        ? selectedBooking.biometrics.fingers
        : [];
      const enrolledRecord = enrolledFingers.find(
        (item) => String(item?.fingerCode || '').trim().toUpperCase() === String(finger.code).toUpperCase(),
      );

      const bridgeResult = await invokeFingerprintBridge('verifyFinger', {
        fingerCode: finger.code,
        fingerLabel: finger.label,
        bookingId: selectedBooking.id || selectedBooking._id,
        enrolledTemplateHash: enrolledRecord?.templateHashPreview || enrolledRecord?.templateHash || '',
        enrolledTemplateFormat: enrolledRecord?.templateFormat || '',
        enrolledCaptureSource: enrolledRecord?.captureSource || '',
      }, biometricSource);

      if (bridgeResult && typeof bridgeResult === 'object' && bridgeResult.success === false) {
        throw new Error(String(bridgeResult.message || `Unable to verify ${finger.label}`));
      }

      const resolvedBridgeStatus = String(bridgeResult?.verificationStatus || '').trim().toLowerCase();
      const resolvedBridgeScore = normalizeBiometricMatchScore(bridgeResult?.matchScore);
      const hasBridgeTemplate = Boolean(String(bridgeResult?.templateData || bridgeResult?.template || '').trim());
      const hasBridgeBooleanMatch = typeof bridgeResult?.localMatch === 'boolean' || typeof bridgeResult?.match === 'boolean';
      const hasBridgeDecision = Boolean(resolvedBridgeStatus) || hasBridgeBooleanMatch || Number.isFinite(resolvedBridgeScore);
      const hasBridgeEvidence =
        resolvedBridgeStatus
        || typeof bridgeResult?.localMatch === 'boolean'
        || typeof bridgeResult?.match === 'boolean'
        || hasBridgeTemplate
        || Number.isFinite(resolvedBridgeScore);

      if (!hasBridgeEvidence) {
        throw new Error('The scanner did not return a fingerprint result. Ask the customer to scan again.');
      }

      if ((biometricSource === 'usb_scanner' || biometricSource === 'bluetooth_scanner') && !hasBridgeTemplate && !Number.isFinite(resolvedBridgeScore)) {
        throw new Error(
          `${getBiometricSourceLabel(biometricSource)} verification must return templateData or a numeric matchScore. A generic success response is not enough to verify a fingerprint.`,
        );
      }

      if ((biometricSource === 'usb_scanner' || biometricSource === 'bluetooth_scanner') && Number.isFinite(resolvedBridgeScore)) {
        const referenceHash = String(
          bridgeResult?.referenceTemplateHash || bridgeResult?.enrolledTemplateHash || enrolledRecord?.templateHash || '',
        ).trim();
        if (!referenceHash) {
          throw new Error(
            `${getBiometricSourceLabel(biometricSource)} verification score is missing the enrolled template reference. Reconnect the APK scanner bridge and try again.`,
          );
        }
      }

      if (!hasBridgeDecision && !hasBridgeTemplate) {
        throw new Error(
          `${getBiometricSourceLabel(biometricSource)} verification did not return any result. Ask the customer to scan again.`,
        );
      }

      const response = await verifyServiceCenterBookingFingerprint(selectedBooking.id || selectedBooking._id, {
        fingerCode: finger.code,
        verificationStatus: resolvedBridgeStatus,
        localMatch: bridgeResult?.localMatch ?? bridgeResult?.match,
        templateData: bridgeResult?.templateData || bridgeResult?.template || '',
        referenceTemplateHash: bridgeResult?.referenceTemplateHash || bridgeResult?.enrolledTemplateHash || enrolledRecord?.templateHash || '',
        matchedTemplateHash: bridgeResult?.matchedTemplateHash || bridgeResult?.templateHash || '',
        matchedFingerCode: bridgeResult?.matchedFingerCode || bridgeResult?.comparedFingerCode || '',
        previewImage:
          bridgeResult?.previewImage
          || bridgeResult?.imageBase64
          || bridgeResult?.base64Image
          || bridgeResult?.previewBase64
          || bridgeResult?.bitmap
          || bridgeResult?.bitmapBase64
          || bridgeResult?.bmpBase64
          || bridgeResult?.imageData
          || bridgeResult?.fingerprintImage
          || bridgeResult?.fingerImage
          || bridgeResult?.imageUrl
          || '',
        captureSource: normalizeBiometricCaptureSource(bridgeResult?.captureSource, biometricSource),
        matchScore: Number.isFinite(resolvedBridgeScore) ? resolvedBridgeScore : undefined,
        notes: bridgeResult?.notes || '',
      });

      const responseData = unwrap(response);
      const updated = responseData?.booking || responseData;
      if (updated?.id || updated?._id) {
        patchBookingLocal(selectedBooking.id || selectedBooking._id, updated);
      } else {
        await refreshBookingBiometrics(selectedBooking.id || selectedBooking._id);
      }
      const verificationStatus = String(
        responseData?.verification?.verificationStatus
        || updated?.biometrics?.verificationSummary?.lastVerificationStatus
        || '',
      ).trim().toLowerCase();
      const responseMatchScore =
        responseData?.verification?.matchScore === undefined || responseData?.verification?.matchScore === null
          ? resolvedBridgeScore
          : Number(responseData.verification.matchScore);

      const successMessage = Number.isFinite(responseMatchScore)
        ? `${finger.label} verified successfully at ${responseMatchScore}% match.`
        : `${finger.label} verified successfully.`;
      const lowQualityMessage = Number.isFinite(responseMatchScore)
        ? `Re-verify failed: ${finger.label} scan quality was too low at ${responseMatchScore}% match. Ask the customer to place the same finger again.`
        : `Re-verify failed: ${finger.label} scan quality was too low. Ask the customer to place the same finger again.`;
      const failedMessage = Number.isFinite(responseMatchScore)
        ? `Re-verify failed: ${finger.label} fingerprint does not match. Minimum required is ${BIOMETRIC_MIN_MATCH_SCORE}%, but this scan returned ${responseMatchScore}%.`
        : `Re-verify failed: ${finger.label} fingerprint does not match the enrolled fingerprint.`;

      const resultIsMatch = responseData?.verification?.isMatch ?? (verificationStatus === 'matched');
      const backendMessage = responseData?.verification?.message;

      setBiometricStatus({
        tone: resultIsMatch ? 'success' : 'error',
        message:
          backendMessage || (resultIsMatch
            ? successMessage
            : (verificationStatus === 'low_quality' ? lowQualityMessage : failedMessage)),
        fingerCode: finger.code,
        action: 'verify',
      });
    } catch (err) {
      const message = err?.message || `Unable to verify ${finger.label}`;
      setBiometricStatus({
        tone: 'error',
        message,
        fingerCode: finger.code,
        action: 'verify',
      });
    } finally {
      setBiometricAction('');
    }
  };

  const handleDeleteFinger = async (finger) => {
    if (!selectedBooking || !finger?.code) {
      return;
    }

    if (!window.confirm(`Delete ${finger.label} fingerprint data for this booking?`)) {
      return;
    }

    setBiometricAction(`delete:${finger.code}`);
    setBiometricStatus({
      tone: 'loading',
      message: `Deleting ${finger.label} fingerprint data…`,
      fingerCode: finger.code,
      action: 'delete',
    });
    setError('');

    try {
      const response = await deleteServiceCenterBookingFingerprint(
        selectedBooking.id || selectedBooking._id,
        finger.code,
      );

      const updated = unwrap(response)?.booking || unwrap(response);
      if (updated?.id || updated?._id) {
        patchBookingLocal(selectedBooking.id || selectedBooking._id, updated);
        setBiometricDraft(buildBiometricDraft(updated));
      } else {
        await refreshBookingBiometrics(selectedBooking.id || selectedBooking._id);
      }

      if (selectedFingerprintCode === finger.code) {
        handleFingerprintClose();
      }

      setBiometricStatus({
        tone: 'success',
        message: `${finger.label} fingerprint data deleted successfully.`,
        fingerCode: finger.code,
        action: 'delete',
      });
    } catch (err) {
      const message = err?.message || `Unable to delete ${finger.label} fingerprint data`;
      setBiometricStatus({
        tone: 'error',
        message,
        fingerCode: finger.code,
        action: 'delete',
      });
    } finally {
      setBiometricAction('');
    }
  };

  const saveBookingDraft = async () => {
    if (!selectedBooking || !bookingDraftDirty) {
      return;
    }

    if (bookingDraft.status === 'completed' && !canCompleteBooking(selectedBooking)) {
      setError(getCompletionValidationMessage(selectedBooking));
      return;
    }

    const payload = {
      status: bookingDraft.status,
      serviceCenterNote: bookingDraft.serviceCenterNote,
    };

    if (bookingDraft.status === 'completed' && selectedBooking?.rentalInspection) {
      payload.rentalInspection = selectedBooking.rentalInspection;
    }

    if (permissions.canAssignBookings) {
      payload.assignedStaffId = bookingDraft.assignedStaffId;
    }

    await handleBookingUpdate(selectedBooking.id || selectedBooking._id, payload);
  };

  const requestEndRide = async () => {
    if (!selectedBooking || !canRequestEndRide(selectedBooking)) {
      return;
    }

    await handleBookingUpdate(selectedBooking.id || selectedBooking._id, {
      status: 'end_requested',
    });
  };

  const completeRide = async () => {
    if (!selectedBooking) {
      return;
    }

    if (!canFinalizeBooking(selectedBooking)) {
      setError(getCompletionValidationMessage(selectedBooking));
      return;
    }

    await handleBookingUpdate(selectedBooking.id || selectedBooking._id, {
      status: 'completed',
      rentalInspection: selectedBooking.rentalInspection,
    });
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#eefbf5_0%,#ffffff_100%)]">
        <Loader2 size={34} className="animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-[linear-gradient(180deg,#eefbf5_0%,#f8fffb_34%,#ffffff_100%)] px-4 pb-36 pt-4"
      style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}
    >
      <main className="mx-auto max-w-3xl space-y-4">
        {activeTab === 'overview' ? (
          <section className="rounded-[28px] border border-white/80 bg-white/92 p-5 shadow-[0_24px_70px_rgba(16,185,129,0.12)] backdrop-blur-sm">
            <div className="min-w-0 space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-700">
                <ShieldCheck size={14} />
                {headerContent.badge}
              </div>
              <div>
                <h1 className="truncate text-[28px] font-semibold tracking-[-0.05em] text-slate-950">
                  {headerContent.title}
                </h1>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {headerContent.description}
                </p>
              </div>
            </div>
          </section>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">
            {error}
          </div>
        ) : null}

        {activeTab === 'overview' && (
          <section className="space-y-6">
            <section className="grid grid-cols-2 gap-3">
              <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Pending Queue</p>
                <p className="mt-3 text-3xl font-black tracking-tight text-slate-900">{stats.pendingBookings}</p>
                <p className="mt-2 text-sm font-medium text-slate-500">Requests waiting for action</p>
              </div>
              <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Assigned Jobs</p>
                <p className="mt-3 text-3xl font-black tracking-tight text-slate-900">{stats.assignedBookings}</p>
                <p className="mt-2 text-sm font-medium text-emerald-600">Live bookings in progress</p>
              </div>
              <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Completed Jobs</p>
                <p className="mt-3 text-3xl font-black tracking-tight text-slate-900">{stats.completedBookings}</p>
                <p className="mt-2 text-sm font-medium text-slate-500">Closed rental requests</p>
              </div>
              <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
                  {isStaffUser ? 'My Queue' : 'Fleet Snapshot'}
                </p>
                <p className="mt-3 text-3xl font-black tracking-tight text-slate-900">
                  {isStaffUser ? stats.pendingBookings : stats.activeVehicles}
                </p>
                <p className="mt-2 text-sm font-medium text-slate-500">
                  {isStaffUser ? 'Pending or active work items' : 'Active listed vehicles'}
                </p>
              </div>
            </section>

            <section className="grid gap-4 md:grid-cols-[1.2fr,0.8fr]">
              <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-slate-950">Overview</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      {isStaffUser
                        ? 'See the current booking workload and your assigned service-center activity at a glance.'
                        : 'Keep an eye on the live service-center workload, team activity, and fleet readiness.'}
                    </p>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-slate-600">
                    <Building2 size={14} />
                    {isStaffUser ? 'staff view' : 'owner view'}
                  </div>
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Pending Queue</p>
                    <p className="mt-2 text-2xl font-black tracking-tight text-slate-900">{stats.pendingBookings}</p>
                    <p className="mt-1 text-sm text-slate-500">Requests waiting for action</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Assigned Jobs</p>
                    <p className="mt-2 text-2xl font-black tracking-tight text-slate-900">{stats.assignedBookings}</p>
                    <p className="mt-1 text-sm text-slate-500">Live bookings being handled now</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Completed Jobs</p>
                    <p className="mt-2 text-2xl font-black tracking-tight text-slate-900">{stats.completedBookings}</p>
                    <p className="mt-1 text-sm text-slate-500">Finished rental requests</p>
                  </div>
                </div>
              </div>

              <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-bold text-slate-950">Operations Snapshot</h2>
                <p className="mt-1 text-sm text-slate-500">Quick breakdown of what is live on this center right now.</p>

                <div className="mt-5 space-y-3">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Total Bookings</p>
                    <p className="mt-2 text-2xl font-black tracking-tight text-slate-900">{bookings.length}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">{isStaffUser ? 'Work Mode' : 'Team Members'}</p>
                    <p className="mt-2 text-2xl font-black tracking-tight text-slate-900">{isStaffUser ? 'Staff' : staff.length}</p>
                    <p className="mt-1 text-sm text-slate-500">{isStaffUser ? 'Assigned workflow access' : 'Registered center staff'}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Live Snapshot</p>
                    <p className="mt-2 text-base font-bold text-slate-900">{isStaffUser ? 'Staff workflow' : 'Owner controls'}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {isStaffUser
                        ? 'Use Bookings to update assigned work quickly.'
                        : 'Use Bookings, Staff, Vehicles, and Profile for daily control.'}
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </section>
        )}

        {activeTab === 'profile' && (
          <section className="space-y-4">
            <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">
                    <UserRound size={14} />
                    {headerContent.badge}
                  </div>
                  <h2 className="mt-3 text-2xl font-bold tracking-[-0.04em] text-slate-950">{headerContent.title}</h2>
                  <p className="mt-1 text-sm text-slate-500">{headerContent.description}</p>
                </div>
                <div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
                  {role || 'service_center'}
                </div>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Account Name</p>
                  <p className="mt-2 text-base font-bold text-slate-900">{profile?.name || '-'}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Phone Number</p>
                  <p className="mt-2 text-base font-bold text-slate-900">{profile?.phone || profile?.ownerPhone || '-'}</p>
                </div>
                {isStaffUser ? (
                  <>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Assigned Center</p>
                      <p className="mt-2 text-sm font-semibold text-slate-800">{profile?.vehicleMake || profile?.ownerName || '-'}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Service Location</p>
                      <p className="mt-2 text-sm font-semibold text-slate-800">{profile?.serviceLocation?.name || 'No service location'}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4 md:col-span-2">
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Work Access</p>
                      <p className="mt-2 text-sm font-medium leading-6 text-slate-700">This login can work on assigned rental bookings and update inspection details for the linked service center.</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Zone</p>
                      <p className="mt-2 text-sm font-semibold text-slate-800">{profile?.zone?.name || '-'}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Service Location</p>
                      <p className="mt-2 text-sm font-semibold text-slate-800">{profile?.serviceLocation?.name || 'No service location'}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4 md:col-span-2">
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Address</p>
                      <p className="mt-2 text-sm font-medium leading-6 text-slate-700">{profile?.address || '-'}</p>
                    </div>
                  </>
                )}
              </div>
            </section>

            <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-bold text-slate-950">Support & Legal</h3>
              <p className="mt-1 text-sm text-slate-500">Contact owner or review platform policies.</p>

              <div className="mt-5 space-y-4">
                <div className="flex items-center gap-4 rounded-2xl bg-slate-50 p-4 border border-slate-100">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 shadow-sm">
                    <Mail size={24} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Email Owner</p>
                    <a href="mailto:customercare@Appzeto 24.com" className="text-base font-bold text-slate-900 hover:text-emerald-600 transition">customercare@Appzeto 24.com</a>
                  </div>
                </div>

                <div className="flex items-center gap-4 rounded-2xl bg-slate-50 p-4 border border-slate-100">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-sky-600 shadow-sm">
                    <Phone size={24} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Call Owner</p>
                    <a href="tel:91-93-911-911" className="text-base font-bold text-slate-900 hover:text-sky-600 transition">91-93-911-911</a>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  {[
                    { type: 'driver_app', label: 'Driver App', Icon: UserPlus, color: 'emerald' },
                    { type: 'terms', label: 'Terms', Icon: FileText, color: 'slate' },
                    { type: 'privacy', label: 'Privacy', Icon: Shield, color: 'indigo' },
                    { type: 'refund', label: 'Refunds', Icon: HandCoins, color: 'rose' }
                  ].map((link) => (
                    <button
                      key={link.type}
                      type="button"
                      onClick={() => openLegal(link.type)}
                      className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:bg-slate-50 active:scale-95"
                    >
                      <link.Icon size={20} className={`text-${link.color}-600`} />
                      <span className="text-xs font-bold text-slate-700">{link.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="rounded-[28px] border border-rose-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-bold text-slate-950">Session</h3>
              <p className="mt-1 text-sm text-slate-500">Use this action when you want to sign out from the service-center panel.</p>
              <button
                type="button"
                onClick={handleLogout}
                className="mt-5 inline-flex items-center justify-center gap-2 rounded-2xl bg-rose-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-rose-600"
              >
                <LogOut size={16} />
                Logout
              </button>
            </section>
          </section>
        )}

        {activeTab === 'bookings' && (
          <section className="rounded-[28px] border border-slate-200 bg-white p-4 sm:p-6 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-['Outfit'] text-lg font-bold text-slate-950">
                  {selectedFingerprintRecord
                    ? selectedFingerprintRecord.displayName || 'Fingerprint Detail'
                    : selectedBooking
                      ? selectedBooking.bookingReference || 'Booking Details'
                      : 'Bookings Queue'}
                </h2>
                <p className="mt-1 text-xs sm:text-sm text-slate-500">
                  {selectedFingerprintRecord
                    ? 'Open fingerprint detail page with preview support from the Flutter bridge.'
                    : selectedBooking
                      ? 'Review details, assign staff, and update notes.'
                      : isStaffUser
                        ? 'Bookings assigned to your login.'
                        : 'Assign staff and review details.'}
                </p>
              </div>
              {selectedBooking ? (
                <button
                  type="button"
                  onClick={selectedFingerprintRecord ? handleFingerprintClose : handleBookingClose}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
                >
                  <ArrowLeft size={14} />
                  {selectedFingerprintRecord ? 'Back To Booking' : 'Back To List'}
                </button>
              ) : (
                <div className="inline-flex items-center w-fit gap-2 rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">
                  <ClipboardList size={12} />
                  {bookings.length} bookings
                </div>
              )}
            </div>

            <div className="mt-6 space-y-4">
              {selectedBooking ? (() => {
                const inspection = selectedBooking.rentalInspection || {};
                const biometrics = selectedBooking.biometrics || {};
                const targetFingerCount = getBiometricTargetCount(biometrics, biometricDraft);
                const biometricBadge =
                  targetFingerCount > 0
                    ? `${biometrics.enrolledFingerCount || 0}/${targetFingerCount} enrolled`
                    : `${biometrics.enrolledFingerCount || 0} enrolled · optional`;
                const beforeInspection = inspection.beforeHandover || {};
                const afterInspection = inspection.afterReturn || {};
                const beforeConditionImages = Array.isArray(inspection.beforeConditionImages) ? inspection.beforeConditionImages : [];
                const afterConditionImages = Array.isArray(inspection.afterConditionImages) ? inspection.afterConditionImages : [];
                const beforeConditionImageDetails = Array.isArray(inspection.beforeConditionImageDetails) ? inspection.beforeConditionImageDetails : [];
                const afterConditionImageDetails = Array.isArray(inspection.afterConditionImageDetails) ? inspection.afterConditionImageDetails : [];
                const enrolledFingerSet = new Set(Array.isArray(biometrics.enrolledFingerCodes) ? biometrics.enrolledFingerCodes : []);
                const fingerDetailMap = new Map(
                  (Array.isArray(biometrics.fingers) ? biometrics.fingers : []).map((item) => [item.fingerCode, item]),
                );
                const thumbCaptureMap = new Map(
                  (Array.isArray(biometrics.thumbCaptures) ? biometrics.thumbCaptures : []).map((item) => [
                    `${item.participantKey}:${item.thumbCode}`,
                    item,
                  ]),
                );
                const thumbParticipants = thumbParticipantsDraft.length > 0
                  ? thumbParticipantsDraft
                  : buildThumbParticipantsDraft(selectedBooking);
                const bridgeStatus = getBiometricBridgeStatus(biometricSource);
                const customerDocumentCards = getCustomerDocumentCards(selectedBooking);
                const getPossessionTime = () => {
                  const start = new Date(selectedBooking.pickupDateTime);
                  const end = selectedBooking.status === 'completed' ? new Date(selectedBooking.updatedAt) : new Date();
                  const diffMs = Math.max(0, end - start);
                  const hours = Math.floor(diffMs / (1000 * 60 * 60));
                  const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                  const days = Math.floor(hours / 24);
                  if (days > 0) return `${days}d ${hours % 24}h`;
                  if (hours > 0) return `${hours}h ${mins}m`;
                  return `${mins}m`;
                };

                if (selectedFingerprintRecord) {
                  return (
                    <section className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-[0_8px_40px_rgba(0,0,0,0.08)] sm:p-6">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700">
                            <ShieldCheck size={14} />
                            Fingerprint Detail
                          </div>
                          <h3 className="mt-3 font-['Outfit'] text-2xl font-bold text-slate-950">
                            {selectedFingerprintRecord.displayName || selectedFingerprintCode || 'Fingerprint'}
                          </h3>
                          <p className="mt-1 text-sm text-slate-500">
                            Booking {selectedBooking.bookingReference || 'N/A'} for {selectedBooking.customer?.name || 'customer'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={handleFingerprintClose}
                          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
                        >
                          <ArrowLeft size={14} />
                          Back To Booking
                        </button>
                      </div>

                      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
                        <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-slate-950">
                          {selectedFingerprintRecord.previewImage ? (
                            <img
                              src={selectedFingerprintRecord.previewImage}
                              alt={`${selectedFingerprintRecord.displayName || 'Fingerprint'} preview`}
                              className="h-full min-h-[320px] w-full object-contain bg-[radial-gradient(circle_at_top,#1e293b_0%,#020617_78%)] p-4"
                            />
                          ) : (
                            <div className="flex min-h-[320px] flex-col items-center justify-center px-6 py-10 text-center text-white">
                              <ShieldCheck size={42} className="text-emerald-400" />
                              <p className="mt-4 text-lg font-bold">Fingerprint preview will appear here</p>
                              <p className="mt-2 max-w-sm text-sm text-slate-300">
                                No fingerprint preview was saved for this finger yet. Re-scan or re-verify from the scanner bridge so the app can attach a visual preview here.
                              </p>
                            </div>
                          )}
                        </div>

                        <div className="space-y-4">
                          <div className="rounded-[28px] border border-amber-200 bg-amber-50 p-4">
                            <p className="text-sm font-bold text-amber-900">Current status</p>
                            <p className="mt-1 text-sm text-amber-800">
                              {selectedFingerprintRecord.previewImage
                                ? 'Preview image received from the capture or verify bridge.'
                                : isRdServiceFingerRecord(selectedFingerprintRecord)
                                  ? 'This RD enrollment stores secured PID XML and device metadata. The RD response does not provide a reusable fingerprint impression image to this app.'
                                  : 'Template is stored, but this saved finger record still has no visual preview attached from the scanner bridge.'}
                            </p>
                          </div>

                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Finger Code</p>
                              <p className="mt-1 text-sm font-bold text-slate-900">{selectedFingerprintRecord.fingerCode || 'N/A'}</p>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Capture Source</p>
                              <p className="mt-1 text-sm font-bold text-slate-900">{getBiometricSourceLabel(selectedFingerprintRecord.captureSource || 'unknown')}</p>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Template Format</p>
                              <p className="mt-1 text-sm font-bold text-slate-900">{selectedFingerprintRecord.templateFormat || 'N/A'}</p>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Quality Score</p>
                              <p className="mt-1 text-sm font-bold text-slate-900">{selectedFingerprintRecord.qualityScore ?? 'N/A'}</p>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Captured At</p>
                              <p className="mt-1 text-sm font-bold text-slate-900">{selectedFingerprintRecord.capturedAt ? formatDateTime(selectedFingerprintRecord.capturedAt) : 'N/A'}</p>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Last Verified</p>
                              <p className="mt-1 text-sm font-bold text-slate-900">{selectedFingerprintRecord.lastVerifiedAt ? formatDateTime(selectedFingerprintRecord.lastVerifiedAt) : 'Not verified yet'}</p>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Verification Count</p>
                              <p className="mt-1 text-sm font-bold text-slate-900">{selectedFingerprintRecord.verificationCount ?? 0}</p>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Template Stored</p>
                              <p className="mt-1 text-sm font-bold text-slate-900">{selectedFingerprintRecord.templateStored ? 'Yes' : 'No'}</p>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 gap-3">
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Device Label</p>
                              <p className="mt-1 break-words text-sm font-bold text-slate-900">{selectedFingerprintRecord.deviceLabel || 'N/A'}</p>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Scanner Serial</p>
                              <p className="mt-1 break-words text-sm font-bold text-slate-900">{selectedFingerprintRecord.scannerSerial || 'N/A'}</p>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Template Hash Preview</p>
                              <p className="mt-1 break-all text-sm font-bold text-slate-900">{selectedFingerprintRecord.templateHashPreview || 'N/A'}</p>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Operator Notes</p>
                              <p className="mt-1 break-words text-sm font-bold text-slate-900">{selectedFingerprintRecord.notes || 'No notes added'}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </section>
                  );
                }

                return (
                  <div className="rounded-[32px] border border-slate-200 bg-white shadow-[0_8px_40px_rgba(0,0,0,0.08)] overflow-hidden">
                    <div className="flex flex-col h-full">
                      {/* Header Summary */}
                      <div className="p-6 bg-slate-50/50 border-b border-slate-100">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div className="space-y-1">
                            <h3 className="font-['Outfit'] text-xl font-bold text-slate-900 leading-tight">
                              {selectedBooking.bookingReference || 'Rental Booking'}
                            </h3>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[9px] font-black uppercase tracking-widest ${statusBadgeClass(selectedBooking.status)}`}>
                                {selectedBooking.status}
                              </span>
                              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-900 text-white shadow-sm">
                                <Clock size={10} className="text-emerald-400" />
                                <span className="text-[9px] font-black uppercase tracking-widest">{getPossessionTime()}</span>
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                              {new Date(selectedBooking.pickupDateTime).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                            </p>
                            <div className="mt-1 flex items-center justify-end gap-1 text-lg font-black text-slate-950">
                              <BadgeIndianRupee size={18} className="text-emerald-600" />
                              {Number(selectedBooking.totalCost || 0)}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Collapsible Content Area */}
                      <div className="divide-y divide-slate-100">
                        {/* 1. Customer & Documents */}
                        <CollapsibleSection
                          title="Customer & Documents"
                          icon={UserRound}
                          badge={`${customerDocumentCards.filter(d => d.imageUrl).length}/2 Uploaded`}
                        >
                          <div className="space-y-4">
                            <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100">
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Customer</p>
                                  <p className="text-sm font-bold text-slate-900 mt-0.5">{selectedBooking.customer?.name || 'N/A'}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Phone</p>
                                  <p className="text-sm font-bold text-slate-900 mt-0.5">{selectedBooking.customer?.phone || 'N/A'}</p>
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              {customerDocumentCards.map((doc) => (
                                <div key={doc.key} className="relative group overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/70 aspect-[4/3]">
                                  {doc.imageUrl ? (
                                    <>
                                      <img src={doc.imageUrl} className="h-full w-full object-cover transition group-hover:scale-105" alt={doc.label} />
                                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex flex-col justify-end p-3">
                                        <p className="text-[10px] font-black text-white/90 uppercase tracking-widest">{doc.label}</p>
                                        <button
                                          onClick={() => setPreviewImage(doc.imageUrl)}
                                          className="mt-2 w-full py-1.5 bg-white/20 backdrop-blur-md rounded-lg text-white text-[10px] font-bold hover:bg-white/30 transition"
                                        >
                                          View Full
                                        </button>
                                      </div>
                                    </>
                                  ) : (
                                    <div className="h-full flex flex-col items-center justify-center p-4 text-center">
                                      <ShieldCheck size={24} className="text-slate-300 mb-2" />
                                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Awaiting {doc.label}</p>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        </CollapsibleSection>

                        <CollapsibleSection
                          title="Customer Biometrics"
                          icon={ShieldCheck}
                          badge={biometricBadge}
                        >
                          <div className="space-y-4">
                            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                                    Capture Source
                                  </p>
                                  <p className="mt-1 text-sm font-bold text-slate-900">
                                    {getBiometricSourceLabel(biometricSource)}
                                  </p>
                                  <p className="mt-1 text-xs text-slate-500">
                                    This selection is passed into the Flutter WebView handler so the APK can switch between the phone sensor and the USB-connected scanner.
                                  </p>
                                </div>
                                <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-600">
                                  {biometricSource === 'phone_sensor' ? 'WebView Phone Flow' : 'External Scanner Flow'}
                                </span>
                              </div>

                              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                {biometricSourceOptions.map((option) => {
                                  const active = biometricSource === option.value;
                                  return (
                                    <button
                                      key={option.value}
                                      type="button"
                                      onClick={() => {
                                        setBiometricSource(option.value);
                                        persistBiometricSource(selectedBooking.id || selectedBooking._id, option.value);
                                      }}
                                      className={`rounded-2xl border p-4 text-left transition ${active
                                        ? 'border-emerald-300 bg-emerald-50 shadow-sm'
                                        : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                                        }`}
                                    >
                                      <div className="flex items-center justify-between gap-3">
                                        <p className="text-sm font-bold text-slate-900">{option.label}</p>
                                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${active ? 'bg-emerald-600 text-white' : 'bg-white text-slate-500'
                                          }`}>
                                          {active ? 'Selected' : 'Available'}
                                        </span>
                                      </div>
                                      <p className="mt-2 text-xs text-slate-500">{option.helper}</p>
                                    </button>
                                  );
                                })}
                              </div>

                              {biometricSource === 'phone_sensor' ? (
                                <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                                  This flow runs in raw thumb image mode only. The Android WebView bridge should return a capture image as base64 or file path. Do not use Aadhaar, RD service auth, or fingerprint template matching here.
                                </p>
                              ) : null}
                            </div>

                            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">
                                    Bridge Status
                                  </p>
                                  <p className="mt-1 text-sm font-bold text-slate-900">{getBiometricBridgeBadge(bridgeStatus, biometricSource)}</p>
                                  <p className="mt-1 text-xs text-slate-500">
                                    Flutter can return a raw thumb image payload to the WebView for each participant capture request. The MERN app stores the uploaded image against this booking.
                                  </p>
                                </div>
                                <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700 shadow-sm">
                                  {String(biometrics.status || 'not_started').replace(/_/g, ' ')}
                                </span>
                              </div>
                            </div>

                            {biometricStatus.message ? (
                              <div
                                className={`rounded-2xl border px-4 py-3 ${biometricStatus.tone === 'error'
                                  ? 'border-rose-200 bg-rose-50'
                                  : biometricStatus.tone === 'success'
                                    ? 'border-emerald-200 bg-emerald-50'
                                    : 'border-sky-200 bg-sky-50'
                                  }`}
                              >
                                <div className="flex items-start gap-3">
                                  {biometricStatus.tone === 'loading' ? (
                                    <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin text-sky-600" />
                                  ) : biometricStatus.tone === 'success' ? (
                                    <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                                  ) : (
                                    <X size={16} className="mt-0.5 shrink-0 text-rose-600" />
                                  )}
                                  <div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                                      {biometricStatus.action ? `${biometricStatus.action} status` : 'Scanner status'}
                                    </p>
                                    <p className="mt-1 text-sm font-bold text-slate-900">{biometricStatus.message}</p>
                                  </div>
                                </div>
                              </div>
                            ) : null}

                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                              <label className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <div className="flex items-start gap-3">
                                  <input
                                    type="checkbox"
                                    checked={biometricDraft.consentAccepted}
                                    onChange={(event) => setBiometricDraft((current) => ({ ...current, consentAccepted: event.target.checked }))}
                                    className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                  />
                                  <div>
                                    <p className="text-sm font-bold text-slate-900">Customer consent collected</p>
                                    <p className="mt-1 text-xs text-slate-500">Required before capturing customer, co-passenger, or employee thumb images.</p>
                                  </div>
                                </div>
                              </label>

                              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Last verification</p>
                                <p className="mt-1 text-sm font-bold text-slate-900">
                                  {biometrics.verificationSummary?.lastVerificationStatus
                                    ? `${biometrics.verificationSummary.lastVerificationStatus} via ${biometrics.verificationSummary.lastVerifiedFingerCode || 'finger'}`
                                    : 'No verification yet'}
                                </p>
                                <p className="mt-1 text-xs text-slate-500">
                                  {biometrics.verificationSummary?.lastVerifiedAt
                                    ? formatDateTime(biometrics.verificationSummary.lastVerifiedAt)
                                    : 'Verification records will appear here after a scan.'}
                                </p>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                              <div>
                                <label className={labelClass}>Enrollment Mode</label>
                                <select
                                  value={biometricDraft.enrollmentMode}
                                  onChange={(event) => setBiometricDraft((current) => ({ ...current, enrollmentMode: event.target.value }))}
                                  className={inputClass}
                                >
                                  {enrollmentModeOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className={labelClass}>Target Thumb Count (Optional)</label>
                                <input
                                  type="number"
                                  min={0}
                                  max={10}
                                  value={biometricDraft.requiredFingerCount}
                                  onChange={(event) => setBiometricDraft((current) => ({ ...current, requiredFingerCount: event.target.value }))}
                                  className={inputClass}
                                  placeholder="0"
                                />
                                <p className="mt-1 text-xs text-slate-500">
                                  Leave this blank or set it to 0 if no minimum thumb image count is required for this booking.
                                </p>
                              </div>
                            </div>

                            <div className="space-y-3">
                              <div>
                                <label className={labelClass}>Consent Notes</label>
                                <textarea
                                  rows={2}
                                  value={biometricDraft.consentNotes}
                                  onChange={(event) => setBiometricDraft((current) => ({ ...current, consentNotes: event.target.value }))}
                                  className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                                  placeholder="Add operator notes, consent wording, or language confirmation..."
                                />
                              </div>
                              <div>
                                <label className={labelClass}>Enrollment Notes</label>
                                <textarea
                                  rows={2}
                                  value={biometricDraft.notes}
                                  onChange={(event) => setBiometricDraft((current) => ({ ...current, notes: event.target.value }))}
                                  className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                                  placeholder="Example: customer left thumb captured, co-passenger right thumb pending."
                                />
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={saveBiometricDraft}
                              disabled={biometricAction === 'settings'}
                              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-60"
                            >
                              {biometricAction === 'settings' ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                              Save Enrollment Setup
                            </button>

                            <div className="flex flex-wrap gap-3">
                              <button
                                type="button"
                                onClick={addCoPassengerParticipant}
                                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                              >
                                <Plus size={16} />
                                Add Co-passenger
                              </button>
                              <button
                                type="button"
                                onClick={handlePrintAgreement}
                                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700 transition hover:bg-emerald-100"
                              >
                                <FileText size={16} />
                                Print Agreement PDF
                              </button>
                            </div>

                            <div className="space-y-4">
                              {thumbParticipants.map((participant, participantIndex) => (
                                <div key={participant.participantKey} className="rounded-3xl border border-slate-200 bg-slate-50/60 p-4">
                                  <div className="grid gap-3 md:grid-cols-2">
                                    <div>
                                      <label className={labelClass}>Section Label</label>
                                      <input
                                        type="text"
                                        defaultValue={participant.participantLabel}
                                        readOnly={participant.participantType !== 'co_passenger'}
                                        onBlur={(event) => handleThumbParticipantFieldBlur(participant.participantKey, 'participantLabel', event.target.value)}
                                        className={`${inputClass} ${participant.participantType !== 'co_passenger' ? 'bg-slate-100 text-slate-500' : ''}`}
                                      />
                                    </div>
                                    <div>
                                      <label className={labelClass}>Person Name</label>
                                      <input
                                        type="text"
                                        defaultValue={participant.name}
                                        readOnly={participant.participantType !== 'co_passenger'}
                                        onBlur={(event) => handleThumbParticipantFieldBlur(participant.participantKey, 'name', event.target.value)}
                                        className={`${inputClass} ${participant.participantType !== 'co_passenger' ? 'bg-slate-100 text-slate-500' : ''}`}
                                      />
                                    </div>
                                    <div>
                                      <label className={labelClass}>Phone</label>
                                      <input
                                        type="tel"
                                        defaultValue={participant.phone}
                                        readOnly={participant.participantType !== 'co_passenger'}
                                        onBlur={(event) => handleThumbParticipantFieldBlur(participant.participantKey, 'phone', event.target.value)}
                                        className={`${inputClass} ${participant.participantType !== 'co_passenger' ? 'bg-slate-100 text-slate-500' : ''}`}
                                      />
                                    </div>
                                    <div className="flex items-end">
                                      <div className="rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-600 shadow-sm">
                                        {participant.participantType === 'co_passenger' ? `Co-passenger ${participantIndex + 1}` : participant.participantLabel}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                                    {thumbCodeOptions.map((thumb) => {
                                      const capture = thumbCaptureMap.get(`${participant.participantKey}:${thumb.value}`);
                                      const busy = thumbAction === `thumb:${participant.participantKey}:${thumb.value}`;
                                      return (
                                        <div key={`${participant.participantKey}:${thumb.value}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                          <div className="flex items-start justify-between gap-3">
                                            <div>
                                              <p className="text-sm font-bold text-slate-900">{thumb.label}</p>
                                              <p className="mt-1 text-xs text-slate-500">
                                                {capture?.capturedAt ? `Captured ${formatDateTime(capture.capturedAt)}` : 'No image captured yet'}
                                              </p>
                                            </div>
                                            <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${capture?.imageUrl ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                              {capture?.imageUrl ? 'Saved' : 'Pending'}
                                            </span>
                                          </div>
                                          <div className="mt-4 overflow-hidden rounded-2xl border border-dashed border-slate-200 bg-slate-50">
                                            {capture?.imageUrl ? (
                                              <img src={capture.imageUrl} alt={`${participant.participantLabel} ${thumb.label}`} className="h-44 w-full object-contain bg-white p-3" />
                                            ) : (
                                              <div className="flex h-44 flex-col items-center justify-center px-4 text-center text-slate-400">
                                                <ShieldCheck size={28} />
                                                <p className="mt-2 text-xs font-bold uppercase tracking-[0.18em]">Awaiting Capture</p>
                                              </div>
                                            )}
                                          </div>
                                          <div className="mt-4 grid grid-cols-2 gap-2">
                                            <button
                                              type="button"
                                              onClick={() => handleThumbCapture(participant, thumb.value)}
                                              disabled={Boolean(thumbAction && !busy)}
                                              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                                            >
                                              {busy ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
                                              {busy ? 'Capturing...' : capture?.imageUrl ? 'Retake' : 'Capture'}
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleDeleteThumbCapture(capture?.captureId)}
                                              disabled={!capture?.captureId || Boolean(thumbAction)}
                                              className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-3 py-2.5 text-xs font-bold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
                                            >
                                              <Trash2 size={14} />
                                              Remove
                                            </button>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              ))}
                            </div>

                            {false && (
                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                {biometricFingerOptions.map((finger) => {
                                  const enrolled = enrolledFingerSet.has(finger.code);
                                  const fingerInfo = fingerDetailMap.get(finger.code);
                                  const captureBusy = biometricAction === `capture:${finger.code}`;
                                  const verifyBusy = biometricAction === `verify:${finger.code}`;
                                  const deleteBusy = biometricAction === `delete:${finger.code}`;
                                  const rdServiceFlow = isRdServiceFingerRecord(fingerInfo);

                                  return (
                                    <div key={finger.code} className={`rounded-2xl border p-4 ${enrolled ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-slate-50'}`}>
                                      <div className="flex items-start justify-between gap-3">
                                        <div>
                                          <p className="text-sm font-bold text-slate-900">{finger.label}</p>
                                          <p className="mt-1 text-xs text-slate-500">
                                            {enrolled
                                              ? `Captured ${formatDateTime(fingerInfo?.capturedAt)}`
                                              : 'Not captured yet'}
                                          </p>
                                          {fingerInfo?.captureSource ? (
                                            <p className="mt-1 text-[11px] font-semibold text-slate-500">
                                              Source {getBiometricSourceLabel(fingerInfo.captureSource)}
                                            </p>
                                          ) : null}
                                          {rdServiceFlow ? (
                                            <p className="mt-1 text-[11px] font-semibold text-sky-700">
                                              IDEMIA RD Service enrollment
                                            </p>
                                          ) : null}
                                          {fingerInfo?.qualityScore ? (
                                            <p className="mt-1 text-[11px] font-semibold text-slate-500">
                                              Quality {fingerInfo.qualityScore}
                                            </p>
                                          ) : null}
                                        </div>
                                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${enrolled ? 'bg-emerald-600 text-white' : 'bg-white text-slate-500'}`}>
                                          {enrolled ? 'Enrolled' : 'Pending'}
                                        </span>
                                      </div>

                                      <div className="mt-4 grid grid-cols-3 gap-2">
                                        <button
                                          type="button"
                                          onClick={() => handleCaptureFinger(finger)}
                                          disabled={Boolean(biometricAction && biometricAction !== `capture:${finger.code}` && biometricAction !== `verify:${finger.code}` && biometricAction !== `delete:${finger.code}`)}
                                          className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                                        >
                                          {captureBusy ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                                          {captureBusy ? 'Capturing…' : enrolled ? 'Rescan' : 'Capture'}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleVerifyFinger(finger)}
                                          disabled={!enrolled || rdServiceFlow || Boolean(biometricAction && biometricAction !== `verify:${finger.code}`)}
                                          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                                          title={rdServiceFlow ? 'IDEMIA RD Service captures are stored as secured PID XML. Local verify is not available in this flow.' : ''}
                                        >
                                          {verifyBusy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                                          {verifyBusy ? 'Verifying...' : rdServiceFlow ? 'RD Flow' : 'Verify'}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteFinger(finger)}
                                          disabled={!enrolled || Boolean(biometricAction && biometricAction !== `delete:${finger.code}`)}
                                          className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-3 py-2.5 text-xs font-bold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
                                        >
                                          {deleteBusy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                          {deleteBusy ? 'Deleting…' : 'Delete'}
                                        </button>
                                      </div>

                                      {biometricStatus.fingerCode === finger.code ? (
                                        <p
                                          className={`mt-2 text-[11px] font-semibold ${biometricStatus.tone === 'error'
                                            ? 'text-rose-600'
                                            : biometricStatus.tone === 'success'
                                              ? 'text-emerald-700'
                                              : 'text-sky-700'
                                            }`}
                                        >
                                          {biometricStatus.message}
                                        </p>
                                      ) : null}

                                      {rdServiceFlow ? (
                                        <p className="mt-2 text-[11px] font-medium text-slate-500">
                                          This finger was captured through the IDEMIA registered-device flow. Use Rescan to refresh the stored RD capture. Local verify is intentionally disabled for this device path.
                                        </p>
                                      ) : null}

                                      {enrolled ? (
                                        <button
                                          type="button"
                                          onClick={() => handleFingerprintOpen(finger.code)}
                                          className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
                                        >
                                          <Eye size={14} />
                                          View Fingerprint
                                        </button>
                                      ) : null}
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {Array.isArray(biometrics.auditLogs) && biometrics.auditLogs.length > 0 ? (
                              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Recent Activity</p>
                                <div className="mt-3 space-y-2">
                                  {biometrics.auditLogs.slice(0, 5).map((log, index) => (
                                    <div key={`${log.createdAt || index}-${log.action || index}`} className="rounded-xl bg-slate-50 px-3 py-2">
                                      <p className="text-xs font-bold text-slate-900">
                                        {(log.action || 'updated').replace(/_/g, ' ')} {log.fingerCode ? `• ${log.fingerCode}` : ''}
                                      </p>
                                      <p className="mt-1 text-[11px] text-slate-500">
                                        {log.notes || 'No notes'} • {formatDateTime(log.createdAt)}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </CollapsibleSection>

                        {/* 2. Before Handover */}
                        <CollapsibleSection title="Pickup Inspection" icon={ClipboardList} badge="Before Handover">
                          <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-2">
                              {beforeHandoverItems.map((item) => {
                                const active = beforeInspection[item.key] === true;
                                return (
                                  <button
                                    key={item.key}
                                    type="button"
                                    onClick={() => updateBookingInspection(selectedBooking.id || selectedBooking._id, 'beforeHandover', item.key, !active)}
                                    className={`rounded-xl border p-3 text-left transition-all ${active ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'}`}
                                  >
                                    <div className="flex items-center gap-2">
                                      {active ? <CheckCircle2 size={14} /> : <div className="w-3.5 h-3.5 rounded-full border-2 border-slate-300" />}
                                      <span className="text-[11px] font-bold">{item.label}</span>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>

                            <InspectionPhotoSlots
                              title="Handover Photos"
                              accent="emerald"
                              bookingId={selectedBooking.id || selectedBooking._id}
                              field="beforeConditionImages"
                              images={beforeConditionImages}
                              imageDetails={beforeConditionImageDetails}
                              uploadingTarget={uploadingConditionSection}
                              onFileSelect={(field, slotIndex, fileList, source) =>
                                uploadConditionImages(selectedBooking.id || selectedBooking._id, field, slotIndex, fileList, source)
                              }
                              onCameraCapture={requestInspectionCameraCapture}
                              onPreview={setPreviewImage}
                              onRemove={removeConditionImage}
                            />

                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <p className="text-[10px] font-black uppercase text-slate-400">Pickup KM</p>
                                <input
                                  type="number"
                                  className="w-full bg-slate-50 border-none rounded-xl text-sm font-bold p-3 focus:ring-2 focus:ring-emerald-500/20"
                                  value={inspection.pickupMeterReading ?? ''}
                                  onChange={(e) => patchBookingInspectionLocal(selectedBooking.id || selectedBooking._id, { pickupMeterReading: e.target.value })}
                                  onBlur={(e) => updateBookingInspectionNotes(selectedBooking.id || selectedBooking._id, 'pickupMeterReading', e.target.value)}
                                />
                              </div>
                              <div className="space-y-1">
                                <p className="text-[10px] font-black uppercase text-slate-400">Fuel Level</p>
                                <input
                                  type="text"
                                  className="w-full bg-slate-50 border-none rounded-xl text-sm font-bold p-3 focus:ring-2 focus:ring-emerald-500/20"
                                  value={inspection.pickupFuelLevel || ''}
                                  onChange={(e) => patchBookingInspectionLocal(selectedBooking.id || selectedBooking._id, { pickupFuelLevel: e.target.value })}
                                  onBlur={(e) => updateBookingInspectionNotes(selectedBooking.id || selectedBooking._id, 'pickupFuelLevel', e.target.value)}
                                />
                              </div>
                            </div>
                          </div>
                        </CollapsibleSection>

                        {/* 3. After Return */}
                        <CollapsibleSection title="Return Inspection" icon={CheckCircle2} badge="After Return">
                          <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-2">
                              {afterReturnItems.map((item) => {
                                const active = afterInspection[item.key] === true;
                                return (
                                  <button
                                    key={item.key}
                                    type="button"
                                    onClick={() => updateBookingInspection(selectedBooking.id || selectedBooking._id, 'afterReturn', item.key, !active)}
                                    className={`rounded-xl border p-3 text-left transition-all ${active ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'}`}
                                  >
                                    <div className="flex items-center gap-2">
                                      {active ? <CheckCircle2 size={14} /> : <div className="w-3.5 h-3.5 rounded-full border-2 border-slate-300" />}
                                      <span className="text-[11px] font-bold">{item.label}</span>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>

                            <InspectionPhotoSlots
                              title="Return Photos"
                              accent="amber"
                              bookingId={selectedBooking.id || selectedBooking._id}
                              field="afterConditionImages"
                              images={afterConditionImages}
                              imageDetails={afterConditionImageDetails}
                              uploadingTarget={uploadingConditionSection}
                              onFileSelect={(field, slotIndex, fileList, source) =>
                                uploadConditionImages(selectedBooking.id || selectedBooking._id, field, slotIndex, fileList, source)
                              }
                              onCameraCapture={requestInspectionCameraCapture}
                              onPreview={setPreviewImage}
                              onRemove={removeConditionImage}
                            />

                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <p className="text-[10px] font-black uppercase text-slate-400">Return KM</p>
                                <input
                                  type="number"
                                  className="w-full bg-slate-50 border-none rounded-xl text-sm font-bold p-3 focus:ring-2 focus:ring-amber-500/20"
                                  value={inspection.returnMeterReading ?? ''}
                                  onChange={(e) => patchBookingInspectionLocal(selectedBooking.id || selectedBooking._id, { returnMeterReading: e.target.value })}
                                  onBlur={(e) => updateBookingInspectionNotes(selectedBooking.id || selectedBooking._id, 'returnMeterReading', e.target.value)}
                                />
                              </div>
                              <div className="space-y-1">
                                <p className="text-[10px] font-black uppercase text-slate-400">Return Fuel</p>
                                <input
                                  type="text"
                                  className="w-full bg-slate-50 border-none rounded-xl text-sm font-bold p-3 focus:ring-2 focus:ring-amber-500/20"
                                  value={inspection.returnFuelLevel || ''}
                                  onChange={(e) => patchBookingInspectionLocal(selectedBooking.id || selectedBooking._id, { returnFuelLevel: e.target.value })}
                                  onBlur={(e) => updateBookingInspectionNotes(selectedBooking.id || selectedBooking._id, 'returnFuelLevel', e.target.value)}
                                />
                              </div>
                            </div>

                            <div className="space-y-1">
                              <p className="text-[10px] font-black uppercase text-slate-400">Return Notes</p>
                              <textarea
                                rows={3}
                                className="w-full resize-none rounded-xl bg-slate-50 p-3 text-sm font-medium text-slate-800 focus:ring-2 focus:ring-amber-500/20 border-none"
                                placeholder="Add return condition notes, damage observations, fuel remarks, or handover comments..."
                                value={inspection.returnNotes || ''}
                                onChange={(e) => patchBookingInspectionLocal(selectedBooking.id || selectedBooking._id, { returnNotes: e.target.value })}
                                onBlur={(e) => updateBookingInspectionNotes(selectedBooking.id || selectedBooking._id, 'returnNotes', e.target.value)}
                              />
                            </div>
                          </div>
                        </CollapsibleSection>
                      </div>

                      {/* Bottom Action Section */}
                      <div className="p-5 sm:p-6 bg-slate-900 text-white mt-auto rounded-t-[32px] shadow-[0_-10px_40px_rgba(0,0,0,0.1)]">
                        <div className="space-y-5">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {permissions.canAssignBookings && (
                              <div className="space-y-1.5">
                                <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Assign Staff</label>
                                <select
                                  value={bookingDraft.assignedStaffId}
                                  onChange={(e) => setBookingDraft(c => ({ ...c, assignedStaffId: e.target.value }))}
                                  className="w-full bg-white/10 border-none rounded-xl text-[12px] sm:text-[13px] font-bold py-2.5 px-3 focus:ring-2 focus:ring-white/20 appearance-none"
                                >
                                  <option value="" className="text-slate-900">Unassigned</option>
                                  {bookingStaffOptions.map(s => <option key={s.id || s._id} value={s.id || s._id} className="text-slate-900">{s.name}</option>)}
                                </select>
                              </div>
                            )}
                            <div className="space-y-1.5">
                              <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Status</label>
                              <select
                                value={bookingDraft.status}
                                onChange={(e) => setBookingDraft(c => ({ ...c, status: e.target.value }))}
                                className="w-full bg-white/10 border-none rounded-xl text-[12px] sm:text-[13px] font-bold py-2.5 px-3 focus:ring-2 focus:ring-white/20 appearance-none"
                              >
                                <option value="pending" className="text-slate-900">Pending</option>
                                <option value="confirmed" className="text-slate-900">Confirmed</option>
                                <option value="assigned" className="text-slate-900">Assigned</option>
                                <option value="end_requested" className="text-slate-900">End Requested</option>
                                <option value="completed" className="text-slate-900">Completed</option>
                              </select>
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Internal Handling Notes</label>
                            <textarea
                              rows={2}
                              value={bookingDraft.serviceCenterNote}
                              onChange={(e) => setBookingDraft(c => ({ ...c, serviceCenterNote: e.target.value }))}
                              className="w-full bg-white/10 border-none rounded-xl text-[12px] sm:text-sm font-medium py-2 px-3 focus:ring-2 focus:ring-white/20 resize-none"
                              placeholder="Add notes for the team..."
                            />
                          </div>

                          <div className="flex items-center gap-3 pt-2">
                            <button
                              onClick={saveBookingDraft}
                              disabled={!bookingDraftDirty || updatingBookingId === String(selectedBooking.id || selectedBooking._id)}
                              className="flex-1 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-700 disabled:opacity-50 text-white py-3 sm:py-3.5 rounded-2xl text-[13px] sm:text-sm font-black transition-all"
                            >
                              {updatingBookingId === String(selectedBooking.id || selectedBooking._id) ? 'Saving...' : 'Update Booking'}
                            </button>
                            {canFinalizeBooking(selectedBooking) && (
                              <button onClick={completeRide} className="bg-white text-slate-900 px-4 sm:px-6 py-3 sm:py-3.5 rounded-2xl text-[13px] sm:text-sm font-black hover:bg-slate-100 transition-all">
                                Finalize
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })() : (
                <>
                  <div className="relative mb-6">
                    <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search by ID, name, or vehicle..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-slate-50 border-slate-100 rounded-[20px] py-3.5 pl-12 pr-4 text-sm font-medium focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-200 transition-all"
                    />
                  </div>

                  {paginatedBookings.length > 0 ? (
                    <>
                      <div className="space-y-3">
                        {paginatedBookings.map((booking) => (
                          <motion.button
                            key={booking.id || booking._id}
                            whileHover={{ x: 4 }}
                            whileTap={{ scale: 0.99 }}
                            onClick={() => handleBookingOpen(booking.id || booking._id)}
                            className="w-full flex items-center gap-3 rounded-[24px] border border-slate-100 bg-white p-3 sm:p-4 text-left shadow-sm transition-all hover:border-emerald-200 hover:shadow-md group relative"
                          >
                            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${statusBadgeClass(booking.status).replace('text-', 'bg-').split(' ')[0]} opacity-10 group-hover:opacity-20 transition-opacity`} />
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl absolute left-3 sm:left-4">
                              <ClipboardList size={18} className={statusBadgeClass(booking.status).split(' ')[1]} />
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <h3 className="font-['Outfit'] text-[13px] sm:text-[15px] font-bold text-slate-900 truncate">
                                  {booking.bookingReference || 'Rental Booking'}
                                </h3>
                              </div>

                              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                <p className="text-[10px] sm:text-[12px] font-bold text-slate-500">
                                  {booking.vehicleName || 'Vehicle'}
                                </p>
                                <span className="hidden sm:block h-1 w-1 rounded-full bg-slate-300" />
                                <p className="text-[9px] sm:text-[11px] font-medium text-slate-400">
                                  {booking.customer?.name || 'Customer'}
                                </p>
                              </div>
                              <div className="mt-1 sm:hidden">
                                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[8px] font-black uppercase tracking-widest ${statusBadgeClass(booking.status)}`}>
                                  {booking.status}
                                </span>
                              </div>
                            </div>

                            <div className="shrink-0 text-right space-y-0.5">
                              <p className="text-[12px] sm:text-[13px] font-black text-slate-900">₹{Number(booking.totalCost || 0)}</p>
                              <p className="text-[9px] font-bold text-slate-400">{new Date(booking.pickupDateTime).toLocaleDateString([], { month: 'short', day: 'numeric' })}</p>
                            </div>

                            <div className="hidden sm:flex ml-1 shrink-0 h-7 w-7 rounded-full bg-slate-50 items-center justify-center text-slate-300 group-hover:text-emerald-500 group-hover:bg-emerald-50 transition-all">
                              <ChevronRight size={14} strokeWidth={3} />
                            </div>
                          </motion.button>
                        ))}
                      </div>

                      {totalPages > 1 && (
                        <div className="mt-8 flex items-center justify-between px-2">
                          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Page {currentPage} of {totalPages}</p>
                          <div className="flex items-center gap-2">
                            <button
                              disabled={currentPage === 1}
                              onClick={() => setCurrentPage(c => c - 1)}
                              className="h-9 w-9 flex items-center justify-center rounded-xl bg-slate-50 text-slate-400 disabled:opacity-30 transition hover:bg-slate-100 hover:text-slate-600"
                            >
                              <ChevronRight size={16} className="rotate-180" />
                            </button>
                            <button
                              disabled={currentPage === totalPages}
                              onClick={() => setCurrentPage(c => c + 1)}
                              className="h-9 w-9 flex items-center justify-center rounded-xl bg-slate-50 text-slate-400 disabled:opacity-30 transition hover:bg-slate-100 hover:text-slate-600"
                            >
                              <ChevronRight size={16} />
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                      <Search size={32} className="mx-auto text-slate-200 mb-3" />
                      <p className="text-sm font-bold text-slate-500">No matching bookings found</p>
                      <p className="mt-1 text-xs text-slate-400">Try searching for a different name or reference</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </section>
        )}

        {!isStaffUser && activeTab === 'staff' && (
          <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-950">Staff Members</h2>
                <p className="mt-1 text-sm text-slate-500">Add staff with their login number so they can handle assigned bookings.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowStaffForm(true)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 sm:w-auto"
              >
                <UserRoundPlus size={16} />
                Add Staff
              </button>
            </div>

            <div className="mt-6 grid gap-4">
              {staff.length > 0 ? (
                staff.map((member) => (
                  <div key={member.id || member._id} className="rounded-[24px] border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 shadow-sm">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex items-start gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                          <UserRoundPlus size={18} />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-slate-900">{member.name}</p>
                          <p className="mt-1 text-sm text-slate-500">{member.phone}</p>
                          <div className="mt-3 inline-flex rounded-full bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600 shadow-sm">
                            {String(member.status || (member.active !== false ? 'active' : 'inactive'))}
                          </div>
                        </div>
                      </div>
                      <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
                        <div className="rounded-full bg-white px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-slate-600 shadow-sm">
                          {(activeBookingCountByStaffId.get(String(member.id || member._id)) ?? member.bookingCount ?? 0)} bookings
                        </div>
                        <div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-emerald-700 shadow-sm">
                          {Number(member?.biometrics?.enrolledFingerCount || 0)} biometric fingers
                        </div>
                        <div className="grid w-full grid-cols-2 gap-2 sm:w-auto">
                          <button
                            type="button"
                            onClick={() => handleEditStaff(member)}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={savingStaff}
                            onClick={() => handleDeleteStaff(member)}
                            className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-600 transition hover:bg-rose-50 disabled:opacity-60"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm font-medium text-slate-500">
                  No staff added yet.
                </div>
              )}
            </div>
          </section>
        )}

        {!isStaffUser && activeTab === 'vehicles' && (
          <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-950">Rental Vehicles</h2>
                <p className="mt-1 text-sm text-slate-500">Vehicles listed here are visible under this center's rental catalog.</p>
              </div>
              <button
                type="button"
                onClick={openCreateVehicleForm}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
              >
                <Plus size={16} />
                Add Vehicle
              </button>
            </div>

            <div className="mt-6 space-y-3">
              {vehicles.length > 0 ? (
                vehicles.map((vehicle) => (
                  <div
                    key={vehicle.id || vehicle._id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openVehicleEditor(vehicle)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openVehicleEditor(vehicle);
                      }
                    }}
                    className="w-full cursor-pointer rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-left transition hover:border-emerald-300 hover:bg-emerald-50/70"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                          <CarFront size={18} />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900">{vehicle.name}</p>
                          <p className="mt-1 text-sm text-slate-500">{`${vehicle.vehicleCategory || 'Car'} - ${vehicle.capacity || 0} seats`}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDeleteVehicle(vehicle.id || vehicle._id);
                        }}
                        className="rounded-xl border border-rose-200 bg-white p-2 text-rose-500 transition hover:bg-rose-50"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3 text-xs font-semibold">
                      <span className="rounded-full bg-white px-3 py-1 text-slate-500">
                        Tap to view full details
                      </span>
                      <span className={`rounded-full px-3 py-1 ${vehicle?.status === 'inactive' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {vehicle?.status === 'inactive' ? 'Inactive' : 'Active'}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm font-medium text-slate-500">
                  No rental vehicles added yet.
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-40 bg-transparent px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-2">
        <div className="mx-auto max-w-3xl rounded-[26px] border border-slate-200/90 bg-white/95 p-1.5 shadow-[0_-10px_28px_rgba(15,23,42,0.1)] backdrop-blur-xl">
          <div className={`grid gap-1.5 ${isStaffUser ? 'grid-cols-3' : 'grid-cols-5'}`}>
            {tabs.map(({ id, label, shortLabel, helper, Icon }) => {
              const isActive = activeTab === id;

              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => handleTabChange(id)}
                  className={`rounded-[18px] px-1.5 py-2.5 text-center transition sm:px-2 ${isActive ? 'bg-emerald-600 text-white shadow-lg' : 'bg-slate-50 text-slate-600 hover:bg-emerald-50'
                    }`}
                >
                  <div className="flex flex-col items-center gap-1 sm:flex-row sm:items-center sm:gap-2">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${isActive ? 'bg-white/15' : 'bg-slate-100 text-slate-700'}`}>
                      <Icon size={16} />
                    </div>
                    <div className="min-w-0 text-center sm:text-left">
                      <p className="text-[10px] font-black uppercase tracking-[0.06em] sm:hidden">
                        {shortLabel || label}
                      </p>
                      <p className="hidden truncate text-[13px] font-bold sm:block">{label}</p>
                      <p className={`hidden truncate text-[11px] font-medium sm:block ${isActive ? 'text-emerald-50' : 'text-slate-400'}`}>{helper}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {cameraCaptureState.open ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-slate-950/90 p-4 backdrop-blur-sm">
            <div className="mx-auto flex min-h-full max-w-xl items-center justify-center">
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} className="w-full overflow-hidden rounded-[28px] border border-white/10 bg-slate-950 shadow-[0_28px_100px_rgba(15,23,42,0.45)]">
                <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4 text-white">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/45">Live Camera</p>
                    <h3 className="mt-1 text-lg font-black">{cameraCaptureState.slotLabel || 'Inspection Photo'}</h3>
                  </div>
                  <button type="button" onClick={closeCameraCaptureModal} className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20">
                    <X size={18} />
                  </button>
                </div>

                <div className="p-4">
                  <div className="overflow-hidden rounded-[24px] border border-white/10 bg-black">
                    <video ref={cameraVideoRef} autoPlay playsInline muted className="aspect-[3/4] w-full object-cover" />
                  </div>

                  {cameraCaptureError ? (
                    <p className="mt-3 rounded-2xl bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-200">
                      {cameraCaptureError}
                    </p>
                  ) : null}

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={closeCameraCaptureModal}
                      disabled={cameraCaptureBusy}
                      className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-bold text-white transition hover:bg-white/10 disabled:opacity-60"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={captureInspectionCameraFrame}
                      disabled={cameraCaptureBusy}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-400 disabled:opacity-60"
                    >
                      {cameraCaptureBusy ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
                      Capture
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.div>
        ) : null}

        {previewImage ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-slate-950/75 p-4 backdrop-blur-sm">
            <div className="mx-auto flex min-h-full max-w-5xl items-center justify-center">
              <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} className="relative w-full overflow-hidden rounded-[28px] border border-white/15 bg-slate-950 shadow-[0_28px_100px_rgba(15,23,42,0.4)]">
                <button
                  type="button"
                  onClick={() => setPreviewImage('')}
                  className="absolute right-4 top-4 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
                >
                  <X size={18} />
                </button>
                <img src={previewImage} alt="Rental vehicle preview" className="max-h-[80vh] w-full object-contain" />
              </motion.div>
            </div>
          </motion.div>
        ) : null}

        {showStaffForm ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-slate-950/40 p-4 backdrop-blur-sm">
            <div className="mx-auto flex min-h-full max-w-xl items-center justify-center">
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="w-full rounded-[30px] bg-white p-6 shadow-[0_28px_100px_rgba(15,23,42,0.22)]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-2xl font-bold tracking-[-0.04em] text-slate-950">{staffForm.id ? 'Edit Staff Member' : 'Add Staff Member'}</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      {staffForm.id
                        ? 'Update the staff member details used for service-center login.'
                        : 'The staff member can log into the same panel using this number.'}
                    </p>
                  </div>
                  <button type="button" onClick={() => setShowStaffForm(false)} className="rounded-2xl border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50">
                    <X size={18} />
                  </button>
                </div>

                <div className="mt-6 space-y-4">
                  <div>
                    <label className={labelClass}>Staff Name</label>
                    <input value={staffForm.name} onChange={(event) => handleStaffChange('name', event.target.value)} className={inputClass} placeholder="Enter staff name" />
                  </div>
                  <div>
                    <label className={labelClass}>Login Number</label>
                    <input value={staffForm.phone} onChange={(event) => handleStaffChange('phone', event.target.value.replace(/\D/g, ''))} className={inputClass} maxLength={10} placeholder="Enter 10 digit number" />
                  </div>
                </div>

                <div className="mt-6 flex items-center justify-end gap-3">
                  <button type="button" onClick={() => setShowStaffForm(false)} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
                    Cancel
                  </button>
                  <button type="button" disabled={savingStaff} onClick={handleSaveStaff} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60">
                    {savingStaff ? <Loader2 size={16} className="animate-spin" /> : <Users size={16} />}
                    {staffForm.id ? 'Update Staff' : 'Save Staff'}
                  </button>
                </div>
              </motion.div>
            </div>
          </motion.div>
        ) : null}

      </AnimatePresence>
    </div>
  );
};

export default ServiceCenterDashboard;
