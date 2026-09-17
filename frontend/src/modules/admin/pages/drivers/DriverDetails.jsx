import React, { useEffect, useMemo, useState } from 'react';
import { GoogleMap, MarkerF } from '@react-google-maps/api';
import {
  ArrowLeft,
  Calendar,
  CircleUserRound,
  ChevronRight,
  Download,
  Eye,
  PencilLine,
  Mail,
  MapPin,
  Phone,
  CheckCircle2,
} from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { adminService } from '../../services/adminService';
import { DELHI_CENTER, HAS_VALID_GOOGLE_MAPS_KEY, useBaseGoogleMapsLoader } from '../../utils/googleMaps';
import BikeIcon from '@/assets/icons/bike.png';
import CarIcon from '@/assets/icons/car.png';
import AutoIcon from '@/assets/icons/auto.png';
import TruckIcon from '@/assets/icons/truck.png';
import EhcvIcon from '@/assets/icons/ehcv.png';
import HcvIcon from '@/assets/icons/hcv.png';
import LcvIcon from '@/assets/icons/LCV.png';
import McvIcon from '@/assets/icons/mcv.png';
import LuxuryIcon from '@/assets/icons/Luxury.png';
import PremiumIcon from '@/assets/icons/Premium.png';
import SuvIcon from '@/assets/icons/SUV.png';

const mapContainerStyle = { width: '100%', height: '100%' };

const getMapIconForVehicle = (iconType = '') => {
  const raw = String(iconType || '').trim();
  if (/^(https?:|data:image\/|blob:|\/uploads\/|\/images\/|\/[^/])/.test(raw)) {
    return raw;
  }

  const value = raw.toLowerCase();

  if (value.includes('bike')) return BikeIcon;
  if (value.includes('auto')) return AutoIcon;
  if (value.includes('ehc')) return EhcvIcon;
  if (value.includes('hcv')) return HcvIcon;
  if (value.includes('lcv')) return LcvIcon;
  if (value.includes('mcv')) return McvIcon;
  if (value.includes('truck')) return TruckIcon;
  if (value.includes('lux')) return LuxuryIcon;
  if (value.includes('premium')) return PremiumIcon;
  if (value.includes('suv')) return SuvIcon;

  return CarIcon;
};

const getDocumentImages = (doc = {}) => {
  const rawImages = Array.isArray(doc?.images) && doc.images.length
    ? doc.images
    : [
        doc?.imageUrl,
        doc?.previewUrl,
        doc?.secureUrl,
        doc?.image,
        doc?.url,
        doc?.fileUrl,
        doc?.document,
        doc?.file,
      ];

  return [...new Set(rawImages.filter(Boolean).map((value) => String(value).trim()))];
};

const getDocumentReviewStatus = (doc = {}) =>
  String(
    doc?.status ??
    doc?.verificationStatus ??
    doc?.approvalStatus ??
    doc?.reviewStatus ??
    '',
  ).trim().toLowerCase();

const getDocumentReason = (doc = {}) =>
  String(
    doc?.comment ??
    doc?.remarks ??
    doc?.reason ??
    doc?.admin_comment ??
    doc?.rejection_reason ??
    '',
  ).trim();

const getDocumentProviderVerificationStatus = (doc = {}) => {
  const explicit = String(doc?.verificationStatus ?? '').trim().toLowerCase();
  if (explicit) {
    return explicit;
  }

  if (doc?.verificationResponse || doc?.verificationReferenceId || doc?.verifiedAt) {
    return 'verified';
  }

  return 'not_started';
};

const toSentenceCase = (str) => {
  if (!str) return '';
  const lower = String(str).toLowerCase().replace(/_/g, ' ');
  return lower.charAt(0).toUpperCase() + lower.slice(1);
};

const toTitleCase = (str) => {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .split(/[\s_]+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const getDocumentProviderVerificationMessage = (doc = {}) =>
  String(
    doc?.verificationMessage ??
    doc?.msg ??
    doc?.providerMessage ??
    '',
  ).trim();

const getDocumentVerificationType = (doc = {}, fallbackKey = '') => {
  const explicitType = String(doc?.verificationType ?? doc?.verification_type ?? '').trim().toLowerCase();
  if (['driving_license', 'pan', 'gstin', 'rc', 'bank_account'].includes(explicitType)) {
    return explicitType;
  }

  const haystack = [
    doc?.sourceKey,
    fallbackKey,
    doc?.key,
    doc?.documentKey,
    doc?.type,
    doc?.name,
    doc?.label,
    doc?.identify_number_key,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (/\bdriving[_\s-]*license\b|\bdl\b|\blicense\b/.test(haystack)) return 'driving_license';
  if (/\bpan\b|\bpancard\b|\bpan[_\s-]*card\b/.test(haystack)) return 'pan';
  if (/\bgst\b|\bgstin\b/.test(haystack)) return 'gstin';
  if (/\brc\b|\bvehicle[_\s-]*rc\b|\bregistration certificate\b/.test(haystack)) return 'rc';
  if (/\bbank\b|\baccount\b|\bifsc\b/.test(haystack)) return 'bank_account';
  return 'none';
};

const getDocumentVerificationLabel = (type = 'none', fallbackName = 'Document') => {
  if (type === 'pan') return 'PAN Verify';
  if (type === 'bank_account') return 'Bank Verify';
  if (type === 'driving_license') return 'DL Verify';
  if (type === 'rc') return 'RC Verify';
  if (type === 'gstin') return 'GSTIN Verify';
  return fallbackName || 'Document';
};

const toDisplayValue = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value).trim();
};

const normalizeCheckStatus = (value) => {
  if (typeof value === 'boolean') {
    return value ? 'pass' : 'fail';
  }

  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'unknown';
  if (['yes', 'true', 'active', 'valid', 'commercial', 'transport', 'available', 'present'].includes(normalized)) {
    return 'pass';
  }
  if (['no', 'false', 'expired', 'invalid', 'private', 'non transport', 'non-transport', 'missing', 'unavailable'].includes(normalized)) {
    return 'fail';
  }
  return 'unknown';
};

const getCheckTone = (status = 'unknown') => {
  if (status === 'pass') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'fail') return 'border-rose-200 bg-rose-50 text-rose-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
};

const getDocumentVerificationFacts = (doc = {}) => {
  const verificationType = getDocumentVerificationType(doc, doc?.sourceKey);
  const response = doc?.verificationResponse || {};
  const result = response?.cardData?.result || {};
  const sourceOutput = result?.source_output || {};
  const bankAccountDetails = response?.cardData?.response?.account_details || {};

  if (verificationType === 'pan') {
    return [
      { label: 'PAN Number', value: doc.identify_number || result?.pan || '' },
      { label: 'Verified Name', value: result?.name || result?.registered_name || doc?.verifiedName || '' },
      { label: 'PAN Status', value: result?.status || doc?.panValid || '' },
      { label: 'Name Validated', value: result?.name_validated || '' },
    ].filter((item) => toDisplayValue(item.value));
  }

  if (verificationType === 'bank_account') {
    return [
      { label: 'Account Number', value: doc.identify_number || '' },
      { label: 'IFSC', value: doc?.ifsc || '' },
      { label: 'Verified Name', value: bankAccountDetails?.beneficiary_name || doc?.verifiedName || '' },
      { label: 'Bank', value: bankAccountDetails?.bank_name || doc?.verifiedBankName || '' },
      { label: 'Branch', value: bankAccountDetails?.branch_name || doc?.verifiedBranchName || '' },
    ].filter((item) => toDisplayValue(item.value));
  }

  if (verificationType === 'driving_license') {
    return [
      { label: 'License Number', value: doc.identify_number || '' },
      { label: 'Verified Name', value: sourceOutput?.name || doc?.verifiedName || '' },
      { label: 'DL Status', value: sourceOutput?.dl_status || doc?.dlStatus || '' },
      { label: 'DOB', value: sourceOutput?.dob || doc?.verifiedDob || doc?.birthDate || '' },
      { label: 'Issuing RTO', value: sourceOutput?.issuing_rto_name || doc?.issuingRtoName || '' },
    ].filter((item) => toDisplayValue(item.value));
  }

  if (verificationType === 'rc') {
    return [
      { label: 'RC Number', value: doc.identify_number || '' },
      { label: 'Owner Name', value: result?.owner_name || doc?.verifiedName || '' },
      { label: 'RC Status', value: result?.status || doc?.rcStatus || '' },
      { label: 'Vehicle Model', value: result?.model || doc?.vehicleModel || '' },
      { label: 'Manufacturer', value: result?.vehicle_manufacturer_name || doc?.vehicleManufacturer || '' },
      { label: 'Registration Date', value: result?.reg_date || doc?.vehicleRegistrationDate || '' },
    ].filter((item) => toDisplayValue(item.value));
  }

  return [];
};

const getRcVerificationChecks = (doc = {}) => {
  const verificationType = getDocumentVerificationType(doc, doc?.sourceKey);
  if (verificationType !== 'rc') {
    return [];
  }

  const response = doc?.verificationResponse || {};
  const result = response?.cardData?.result || {};
  const seatCapacity = result?.seat_capacity ?? result?.seating_capacity ?? result?.seating_cap ?? result?.no_of_seat ?? result?.seat ?? '';
  const insuranceUpto = result?.vehicle_insurance_upto ?? result?.insurance_upto ?? result?.insurance_expiry ?? doc?.vehicleInsuranceUpto ?? '';
  const puccUpto = result?.pucc_upto ?? result?.puc_upto ?? result?.pollution_upto ?? result?.vehicle_pucc_upto ?? '';
  const commercialValue =
    result?.commercial_vehicle ??
    result?.is_commercial ??
    result?.commercial ??
    result?.vehicle_type ??
    result?.vehicle_category ??
    result?.registration_type ??
    result?.class ??
    '';

  return [
    {
      label: 'Seat Capacity Check',
      value: seatCapacity,
      status: toDisplayValue(seatCapacity) ? 'pass' : 'unknown',
    },
    {
      label: 'Insurance Check',
      value: insuranceUpto,
      status: normalizeCheckStatus(result?.insurance_status || insuranceUpto),
    },
    {
      label: 'PUCC Check',
      value: puccUpto,
      status: normalizeCheckStatus(result?.pucc_status || result?.puc_status || puccUpto),
    },
    {
      label: 'Commercial Vehicle Check',
      value: commercialValue,
      status: normalizeCheckStatus(commercialValue),
    },
  ];
};

const getProviderStatusTone = (status = '') => {
  const normalized = String(status || '').trim().toLowerCase();
  if (['verified', 'success', 'approved', 'completed'].includes(normalized)) {
    return 'bg-sky-100 text-sky-800';
  }
  if (['failed', 'invalid', 'rejected', 'declined'].includes(normalized)) {
    return 'bg-rose-100 text-rose-800';
  }
  if (['pending', 'processing', 'queued'].includes(normalized)) {
    return 'bg-amber-100 text-amber-800';
  }
  return 'bg-slate-100 text-slate-600';
};

const toTimestamp = (value) => {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
};

const formatDateTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const humanizeDocumentKey = (value = '') =>
  String(value || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();

const formatServiceCategories = (value) => {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];

  const normalized = [...new Set(
    rawValues
      .map((item) => String(item || '').trim().toLowerCase())
      .filter(Boolean),
  )];

  if (!normalized.length) {
    return 'Not set';
  }

  return normalized
    .map((item) => item.charAt(0).toUpperCase() + item.slice(1))
    .join(', ');
};

const getDocumentFileNames = (doc = {}, imageUrls = []) => {
  const rawNames = [];

  if (Array.isArray(doc?.fileNames)) {
    rawNames.push(...doc.fileNames);
  }

  rawNames.push(
    doc?.fileName,
    doc?.filename,
    doc?.originalFilename,
    doc?.originalName,
  );

  imageUrls.forEach((url, index) => {
    try {
      const pathname = new URL(url).pathname;
      const lastSegment = pathname.split('/').filter(Boolean).pop() || '';
      if (lastSegment) {
        rawNames.push(decodeURIComponent(lastSegment));
      }
    } catch {
      const lastSegment = String(url).split('/').filter(Boolean).pop() || '';
      if (lastSegment) {
        rawNames.push(lastSegment);
      }
    }

    if (!rawNames[index]) {
      rawNames.push(`document-${index + 1}`);
    }
  });

  const normalizedNames = [...new Set(rawNames.filter(Boolean).map((value) => String(value).trim()))];

  if (normalizedNames.length > 0) {
    return normalizedNames;
  }

  return [doc?.fileName, doc?.filename, doc?.originalFilename, doc?.originalName, doc?.name, doc?.label]
    .filter(Boolean)
    .map((value) => String(value).trim())
    .filter(Boolean)
    .slice(0, 1);
};

const normalizeDocumentEntry = (doc = {}, fallbackKey = '') => {
  if (typeof doc === 'string') {
    return {
      sourceKey: fallbackKey,
      name: fallbackKey || 'Document',
      fileNames: getDocumentFileNames({}, [doc]),
      identify_number: '',
      expiry_date: '',
      status: '',
      comment: '',
      images: [doc].filter(Boolean),
    };
  }

  const images = getDocumentImages(doc);
  const fileNames = getDocumentFileNames(doc, images);

  return {
    sourceKey: doc?.key || doc?.documentKey || doc?.type || fallbackKey || doc?.name || '',
    name:
      doc?.name ||
      doc?.label ||
      humanizeDocumentKey(doc?.key || doc?.documentKey || doc?.type || fallbackKey) ||
      doc?.fileName ||
      'Document',
    fileNames,
    identify_number: doc?.identify_number ?? doc?.identifyNumber ?? doc?.number ?? doc?.id_number ?? '',
    expiry_date: doc?.expiry_date ?? doc?.expiryDate ?? doc?.expiry ?? '',
    status: getDocumentReviewStatus(doc),
    comment: getDocumentReason(doc),
    providerStatus: getDocumentProviderVerificationStatus(doc),
    providerMessage: getDocumentProviderVerificationMessage(doc),
    verificationReferenceId: String(doc?.verificationReferenceId ?? doc?.reference_id ?? '').trim(),
    verificationResponse: doc?.verificationResponse ?? null,
    verifiedAt: doc?.verifiedAt ?? null,
    images,
    uploadedAt: doc?.uploadedAt ?? doc?.updatedAt ?? doc?.createdAt ?? null,
    reviewedAt: doc?.reviewedAt ?? null,
    reverificationRequestedAt: doc?.reverificationRequestedAt ?? null,
  };
};

const DriverDetails = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const [activeTab, setActiveTab] = useState('Driver Profile');
  const [profile, setProfile] = useState(null);
  const [walletForm, setWalletForm] = useState({ amount: '', operation: 'credit', isSubmitting: false });
  const [walletHistory, setWalletHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [documentActionKey, setDocumentActionKey] = useState('');

  const tabs = [
    'Driver Profile',
    'Request List',
    'Payment History',
    'Withdrawal History',
    'Review History',
    'Documents',
    'Subscription',
  ];

  const fetchProfile = async () => {
    setIsLoading(true);
    setError('');
    setAvatarFailed(false);
    try {
      const token = localStorage.getItem('adminToken');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const [res, walletRes] = await Promise.all([
        fetch(
          `${globalThis.__LEGACY_BACKEND_ORIGIN__}/api/v1/admin/drivers/${id}/profile?t=${Date.now()}`,
          {
            headers,
            cache: 'no-store',
          },
        ),
        adminService.getDriverWalletHistory(id).catch(() => null),
      ]);
      const data = await res.json();
      if (res.ok && data.success) {
        setProfile(data.data);
        const walletPayload = walletRes?.data?.data || walletRes?.data || walletRes || {};
        setWalletHistory(Array.isArray(walletPayload?.results) ? walletPayload.results : []);
      } else {
        setError(data.message || 'Unable to load driver profile');
      }
    } catch (err) {
      setError('Unable to load driver profile');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [id]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    if (tab && tabs.includes(tab)) {
      setActiveTab(tab);
    }
  }, [location.search]);

  const mapCenter = useMemo(() => {
    if (!profile?.location?.lat || !profile?.location?.lng) return DELHI_CENTER;
    return { lat: profile.location.lat, lng: profile.location.lng };
  }, [profile]);
  const shouldLoadMap = activeTab === 'Driver Profile';
  const { isLoaded, loadError } = useBaseGoogleMapsLoader();
  const vehicleMapIconUrl = useMemo(
    () => getMapIconForVehicle(profile?.vehicleIconType || profile?.vehicle_image || profile?.vehicle?.type),
    [profile],
  );
  const vehicleMarkerIcon = useMemo(() => {
    if (!isLoaded || !globalThis.google?.maps || !vehicleMapIconUrl) {
      return undefined;
    }

    return {
      url: vehicleMapIconUrl,
      scaledSize: new globalThis.google.maps.Size(42, 42),
      anchor: new globalThis.google.maps.Point(21, 21),
    };
  }, [isLoaded, vehicleMapIconUrl]);

  const stats = profile?.stats || {};
  const earnings = profile?.earnings || {};
  const wallet = profile?.wallet || {};
  const requests = profile?.requests || [];
  const withdrawals = profile?.withdrawals || [];
  const backRoute = location.state?.from || '/admin/drivers';
  const onboardingVehicle = profile?.onboarding?.vehicle || {};
  const vehicleFieldSummary = useMemo(() => ([
    {
      label: 'Operating City',
      value:
        onboardingVehicle.locationName ||
        profile?.service_location?.name ||
        profile?.service_location?.service_location_name ||
        profile?.city ||
        'Not set',
    },
    {
      label: 'Service Categories',
      value: formatServiceCategories(
        onboardingVehicle.serviceCategories ||
        profile?.service_categories ||
        profile?.serviceCategories ||
        profile?.registerFor ||
        profile?.register_for ||
        profile?.transport_type,
      ),
    },
    {
      label: 'Vehicle Type',
      value:
        onboardingVehicle.vehicleType ||
        profile?.vehicle?.type ||
        profile?.vehicle_type ||
        profile?.car_type ||
        'Not set',
    },
    {
      label: 'Brand / Make',
      value: onboardingVehicle.make || profile?.vehicle?.make || profile?.vehicle_make || profile?.car_make || 'Not set',
    },
    {
      label: 'Model',
      value: onboardingVehicle.model || profile?.vehicle?.model || profile?.vehicle_model || profile?.car_model || 'Not set',
    },
    {
      label: 'Year',
      value: onboardingVehicle.year || profile?.vehicle?.year || profile?.vehicle_year || profile?.car_year || 'Not set',
    },
    {
      label: 'Plate Number',
      value: onboardingVehicle.number || profile?.vehicle?.number || profile?.vehicle_number || profile?.car_number || 'Not set',
    },
    {
      label: 'Exterior Color',
      value: onboardingVehicle.color || profile?.vehicle?.color || profile?.vehicle_color || profile?.car_color || 'Not set',
    },
  ]), [onboardingVehicle, profile]);
  const documents = useMemo(() => {
    const candidateSources = [
      profile?.documents,
      profile?.onboarding?.documents,
      profile?.user_snapshot?.documents,
      profile?.owner_snapshot?.documents,
    ].filter(Boolean);

    const normalized = candidateSources.flatMap((raw) => {
      if (Array.isArray(raw)) {
        return raw.map((doc) => normalizeDocumentEntry(doc));
      }

      if (!raw || typeof raw !== 'object') {
        return [];
      }

      return Object.entries(raw).flatMap(([key, value]) => {
        if (!value) return [];
        return Array.isArray(value)
          ? value.map((doc) => normalizeDocumentEntry(doc, key))
          : [normalizeDocumentEntry(value, key)];
      });
    });

    return normalized.filter(
      (doc, index, items) =>
        (doc.images.length > 0 || doc.name || doc.sourceKey) &&
        items.findIndex(
          (item) =>
            item.sourceKey === doc.sourceKey &&
            item.name === doc.name &&
            JSON.stringify(item.images) === JSON.stringify(doc.images),
        ) === index,
    ).map((doc) => {
      const uploadedAtTime = Math.max(
        toTimestamp(doc.uploadedAt),
        toTimestamp(doc.reverificationRequestedAt),
      );
      const reviewedAtTime = toTimestamp(doc.reviewedAt);

      return {
        ...doc,
        verificationType: getDocumentVerificationType(doc, doc.sourceKey),
        verificationLabel: getDocumentVerificationLabel(getDocumentVerificationType(doc, doc.sourceKey), doc.name),
        verificationFacts: getDocumentVerificationFacts(doc),
        rcChecks: getRcVerificationChecks(doc),
        isReuploaded:
          String(doc.status || '').toLowerCase() === 'pending' &&
          uploadedAtTime > 0 &&
          reviewedAtTime > 0 &&
          uploadedAtTime >= reviewedAtTime,
      };
    });
  }, [profile]);
  const chart = profile?.chart || { months: [], earnings: [], trips: { completed: [], cancelled: [] } };
  const profileImage = String(profile?.image || '').trim();
  const onlineSelfieImage = String(profile?.online_selfie?.imageUrl || '').trim();

  const acceptanceRate = requests.length
    ? Math.round((stats.completed_trips / requests.length) * 100)
    : 0;
  const cancellationRate = requests.length
    ? Math.round((stats.cancelled_trips / requests.length) * 100)
    : 0;

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
          <p className="text-sm text-gray-500">Loading driver profile...</p>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-sm font-semibold text-rose-600">{error || 'Driver not found'}</p>
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-4 lg:p-6 font-sans text-gray-900">
      <div className="mb-6">
        <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-2">
          <span>Drivers</span>
          <ChevronRight size={12} />
          <span className="text-gray-700">Driver Profile</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl text-gray-900 font-bold">Driver Profile</h1>
          <button
            onClick={() => navigate(backRoute)}
            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft size={16} /> Back
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-100 border border-gray-200">
              {profileImage && !avatarFailed ? (
                <img
                  src={profileImage}
                  alt={profile.name}
                  className="w-full h-full object-cover"
                  onError={() => setAvatarFailed(true)}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-400">
                  <CircleUserRound size={32} strokeWidth={1.75} />
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg text-gray-900 font-bold">{profile.name}</h2>
                <span className="font-mono font-bold text-[10px] uppercase tracking-wider text-black bg-yellow-400 px-2 py-0.5 rounded shadow-sm">
                  {profile.driver_code || profile.referralCode || (profile.phone ? `DRV${String(profile.phone).slice(-4)}${String(profile._id || profile.id || '').slice(-6).toUpperCase()}`.replace(/\W/g, '') : 'N/A')}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-gray-500 font-medium">
                <div className="flex items-center gap-1"><Phone size={12} /> {profile.phone || profile.mobile || 'N/A'}</div>
                <div className="flex items-center gap-1"><Mail size={12} /> {profile.email || 'N/A'}</div>
                <div className="flex items-center gap-1"><MapPin size={12} /> {profile.city || 'India'}</div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 sm:ml-auto">
             <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 border border-gray-200">
              <img
                src={profile.vehicle_image || ''}
                alt="Vehicle"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="text-xs text-gray-600">
              <p className="text-gray-900 font-bold">{profile.vehicle?.type || 'Vehicle'}</p>
              <p>{profile.vehicle?.make} {profile.vehicle?.model}</p>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-start gap-3 border-t border-gray-100 pt-4">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${profile.isOnline ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${profile.isOnline ? 'bg-green-500' : 'bg-gray-400'}`} />
            {profile.isOnline ? 'Driver Online' : 'Driver Offline'}
          </span>

          {onlineSelfieImage ? (
            <div className="flex items-center gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/60 px-3 py-2">
              <img
                src={onlineSelfieImage}
                alt={`${profile.name} online selfie`}
                className="h-14 w-14 rounded-xl object-cover border border-indigo-100 bg-white"
              />
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500">Daily online selfie</p>
                <p className="break-words text-xs font-semibold leading-relaxed text-slate-700">
                  {profile?.online_selfie?.forDate || 'Latest check-in'}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-xs font-bold rounded-full transition-colors ${
              activeTab === tab
                ? 'bg-yellow-400 text-black shadow-sm'
                : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab !== 'Driver Profile' ? (
        <>
          {activeTab === 'Request List' && (
            <div className="space-y-6">
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="border border-gray-100 rounded-lg p-4">
                    <p className="text-sm text-gray-500">Completed Rides</p>
                    <p className="text-2xl font-semibold text-gray-900">{stats.completed_trips || 0}</p>
                  </div>
                  <div className="border border-gray-100 rounded-lg p-4">
                    <p className="text-sm text-gray-500">Acceptance Rate</p>
                    <p className="text-2xl font-semibold text-gray-900">{acceptanceRate}%</p>
                  </div>
                  <div className="border border-gray-100 rounded-lg p-4">
                    <p className="text-sm text-gray-500">Cancellation Rate</p>
                    <p className="text-2xl font-semibold text-gray-900">{cancellationRate}%</p>
                  </div>
                  <div className="border border-gray-100 rounded-lg p-4">
                    <p className="text-sm text-gray-500">Cancelled Rides</p>
                    <p className="text-2xl font-semibold text-gray-900">{stats.cancelled_trips || 0}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500">
                        <th className="px-6 py-3">Request Id</th>
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3">User Name</th>
                        <th className="px-4 py-3">Driver Name</th>
                        <th className="px-4 py-3">Trip Status</th>
                        <th className="px-4 py-3">Paid</th>
                        <th className="px-4 py-3">Payment Option</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
                      {requests.length === 0 ? (
                        <tr>
                          <td colSpan="7" className="px-6 py-12 text-center text-gray-400">No data found.</td>
                        </tr>
                      ) : (
                        requests.map((item) => (
                          <tr key={item.request_id}>
                            <td className="px-6 py-3">{item.request_id.slice(-8).toUpperCase()}</td>
                            <td className="px-4 py-3">
                              {item.date ? new Date(item.date).toLocaleString('en-IN') : 'N/A'}
                            </td>
                            <td className="px-4 py-3">{item.user_name}</td>
                            <td className="px-4 py-3">{item.driver_name}</td>
                            <td className="px-4 py-3 capitalize">{item.trip_status}</td>
                            <td className="px-4 py-3">{item.paid ? 'Yes' : 'No'}</td>
                            <td className="px-4 py-3 capitalize">{item.payment_option}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'Payment History' && (
            <div className="space-y-6">
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="border border-gray-100 rounded-lg p-4">
                    <p className="text-sm text-gray-500">Total Credited</p>
                    <p className="text-2xl font-semibold text-gray-900">₹ {wallet.total_credits || 0}</p>
                  </div>
                  <div className="border border-gray-100 rounded-lg p-4">
                    <p className="text-sm text-gray-500">Total Debited</p>
                    <p className="text-2xl font-semibold text-gray-900">₹ {wallet.total_debits || 0}</p>
                  </div>
                  <div className="border border-gray-100 rounded-lg p-4">
                    <p className="text-sm text-gray-500">Available Balance</p>
                    <p className="text-2xl font-semibold text-gray-900">₹ {wallet.balance || 0}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="text-sm text-gray-900 mb-4 font-bold">Credit or Debit wallet</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5">Amount *</label>
                    <input
                      type="number"
                      min="0"
                      className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-800 bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-colors"
                      placeholder="Enter Amount"
                      value={walletForm.amount}
                      onChange={(e) => setWalletForm((prev) => ({ ...prev, amount: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5">Operation *</label>
                    <select
                      className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-800 bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-colors"
                      value={walletForm.operation}
                      onChange={(e) => setWalletForm((prev) => ({ ...prev, operation: e.target.value }))}
                    >
                      <option value="credit">Credit</option>
                      <option value="debit">Debit</option>
                    </select>
                  </div>
                </div>
                <div className="mt-4">
                  <button
                    type="button"
                    disabled={walletForm.isSubmitting || !walletForm.amount}
                    onClick={async () => {
                      setWalletForm((prev) => ({ ...prev, isSubmitting: true }));
                      try {
                        const token = localStorage.getItem('adminToken');
                        await fetch(
                          `${globalThis.__LEGACY_BACKEND_ORIGIN__}/api/v1/admin/wallet/drivers/${id}/adjust`,
                          {
                            method: 'POST',
                            headers: {
                              ...(token ? { Authorization: `Bearer ${token}` } : {}),
                              'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                              amount: Number(walletForm.amount),
                              operation: walletForm.operation,
                            }),
                          },
                        );
                        setWalletForm({ amount: '', operation: 'credit', isSubmitting: false });
                        await fetchProfile();
                      } catch (err) {
                        setWalletForm((prev) => ({ ...prev, isSubmitting: false }));
                      }
                    }}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
                  >
                    {walletForm.isSubmitting ? 'Saving...' : 'Submit'}
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100">
                  <h3 className="text-sm text-gray-900 font-bold">Wallet Transactions</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500">
                        <th className="px-6 py-3">Date</th>
                        <th className="px-4 py-3">Type</th>
                        <th className="px-4 py-3">Amount</th>
                        <th className="px-4 py-3">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
                      {walletHistory.length === 0 ? (
                        <tr>
                          <td colSpan="4" className="px-6 py-12 text-center text-gray-400">No wallet transactions found.</td>
                        </tr>
                      ) : (
                        walletHistory.map((item) => (
                          <tr key={item._id}>
                            <td className="px-6 py-3">{item.createdAt ? new Date(item.createdAt).toLocaleString('en-IN') : 'N/A'}</td>
                            <td className="px-4 py-3 capitalize">{String(item.type || '').replace(/_/g, ' ') || 'N/A'}</td>
                            <td className={`px-4 py-3 font-semibold ${Number(item.amount || 0) < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                              ₹ {Math.abs(Number(item.amount || 0))}
                            </td>
                            <td className="px-4 py-3">{item.description || '-'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'Withdrawal History' && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500">
                      <th className="px-6 py-3">Date</th>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Mobile Number</th>
                      <th className="px-4 py-3">Requested Amount</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
                    {withdrawals.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="px-6 py-12 text-center text-gray-400">No data found.</td>
                      </tr>
                    ) : (
                      withdrawals.map((item) => (
                        <tr key={item._id}>
                          <td className="px-6 py-3">{item.date ? new Date(item.date).toLocaleString('en-IN') : 'N/A'}</td>
                          <td className="px-4 py-3">{item.name}</td>
                          <td className="px-4 py-3">{item.mobile}</td>
                          <td className="px-4 py-3">₹ {item.requested_amount}</td>
                          <td className="px-4 py-3 capitalize">{item.status}</td>
                          <td className="px-4 py-3">-</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'Review History' && (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-500">
              No reviews found.
            </div>
          )}

          {activeTab === 'Documents' && (
            <div className="space-y-6">
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h3 className="text-base text-gray-900 font-bold">Vehicle Onboarding Details</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      These values mirror the fields collected from the driver on the vehicle setup step.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate(`/admin/drivers/edit/${id}`, { state: { from: location.pathname + location.search } })}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                  >
                    <PencilLine size={15} />
                    Edit Driver Fields
                  </button>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {vehicleFieldSummary.map((item) => (
                    <div key={item.label} className="rounded-xl border border-gray-100 bg-gray-50/70 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{item.label}</p>
                      <p className="mt-2 text-sm font-semibold text-gray-900">{item.value || 'Not set'}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                {documents.length === 0 ? (
                  <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
                    No documents found.
                  </div>
                ) : (
                  documents.map((doc, idx) => (
                    <div key={`${doc.name}-${idx}`} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                      {/* Header */}
                      <div className="px-5 py-3 border-b border-gray-100 bg-white flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <h4 className="text-sm font-semibold text-gray-900">{toTitleCase(doc.verificationLabel || doc.name)}</h4>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${
                            String(doc.status || '').toLowerCase() === 'approved' 
                              ? 'bg-emerald-50 text-emerald-700' 
                              : String(doc.status || '').toLowerCase() === 'rejected' || String(doc.status || '').toLowerCase() === 'declined'
                              ? 'bg-rose-50 text-rose-700'
                              : 'bg-amber-50 text-amber-700'
                          }`}>
                            {String(doc.status || '').toLowerCase() === 'approved' && <CheckCircle2 size={12} />}
                            {toTitleCase(doc.status || 'Pending')}
                          </span>
                        </div>
                      </div>

                      {/* Content Grid */}
                      <div className="p-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {/* Column 1: Document Details */}
                        <div>
                          <h5 className="text-sm font-semibold text-gray-900 mb-4">Document details</h5>
                          <div className="space-y-3">
                            <div className="flex justify-between items-start text-sm border-b border-gray-50 pb-2">
                              <span className="text-gray-500 font-medium">Identify number</span>
                              <span className="font-semibold text-gray-900">{doc.identify_number || '-'}</span>
                            </div>
                            <div className="flex justify-between items-start text-sm border-b border-gray-50 pb-2">
                              <span className="text-gray-500 font-medium">Expiry date</span>
                              <span className="font-semibold text-gray-900">{doc.expiry_date || '-'}</span>
                            </div>
                            {doc.isReuploaded && (
                              <div className="mt-2 text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded inline-block">
                                Re-uploaded for review
                              </div>
                            )}
                            
                            {/* API Verification Message Compact */}
                            {doc.providerMessage && (
                              <div className="mt-4 flex items-start gap-2">
                                <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                                <div>
                                  <p className="text-sm font-semibold text-gray-900">{doc.providerMessage}</p>
                                  {doc.verifiedAt && <p className="text-xs text-gray-500">Checked: {formatDateTime(doc.verifiedAt)}</p>}
                                </div>
                              </div>
                            )}

                            {/* Compact Rejection/Comment */}
                            {['rejected', 'declined'].includes(String(doc.status || '').toLowerCase()) && doc.comment && (
                              <div className="mt-4 flex items-start gap-2">
                                <div className="text-xs text-rose-600 font-medium">
                                  <span className="font-semibold">Rejection reason:</span> {doc.comment}
                                </div>
                              </div>
                            )}
                            {!['rejected', 'declined'].includes(String(doc.status || '').toLowerCase()) && doc.comment && (
                              <div className="mt-4 flex items-start gap-2">
                                <div className="text-xs text-gray-600 font-medium">
                                  <span className="font-semibold">Comment:</span> {doc.comment}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Column 2: Verification Data */}
                        <div>
                          <h5 className="text-sm font-semibold text-gray-900 mb-4">Verification details</h5>
                          <div className="space-y-3">
                            {doc.verificationFacts?.map((fact) => (
                              <div key={`${doc.sourceKey}-${fact.label}`} className="flex justify-between items-start text-sm border-b border-gray-50 pb-2">
                                <span className="text-gray-500 font-medium pr-4">{toSentenceCase(fact.label)}</span>
                                <span className="font-semibold text-gray-900 text-right">{toTitleCase(toDisplayValue(fact.value)) || '-'}</span>
                              </div>
                            ))}
                            {doc.rcChecks?.map((check) => (
                              <div key={`${doc.sourceKey}-${check.label}`} className="flex justify-between items-start text-sm border-b border-gray-50 pb-2">
                                <span className="text-gray-500 font-medium pr-4">{toSentenceCase(check.label)}</span>
                                <span className="font-semibold text-gray-900 text-right">{toTitleCase(toDisplayValue(check.value)) || '-'}</span>
                              </div>
                            ))}
                            {doc.verificationReferenceId && (
                               <div className="flex justify-between items-start text-sm border-b border-gray-50 pb-2">
                                 <span className="text-gray-500 font-medium pr-4">Verification reference</span>
                                 <span className="font-semibold text-gray-900 text-right">{doc.verificationReferenceId}</span>
                               </div>
                            )}
                            {(!doc.verificationFacts?.length && !doc.rcChecks?.length && !doc.verificationReferenceId) && (
                              <div className="text-sm text-gray-400 py-2">No verification data available</div>
                            )}
                          </div>
                        </div>

                        {/* Column 3: Activity & Actions */}
                        <div className="flex flex-col justify-between">
                          <div>
                            <h5 className="text-sm font-semibold text-gray-900 mb-4">Activity</h5>
                            <div className="space-y-4">
                              {doc.uploadedAt && (
                                <div className="flex gap-3 text-sm">
                                  <div className="flex flex-col items-center">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5"></div>
                                    <div className="w-px h-full bg-gray-200 mt-1"></div>
                                  </div>
                                  <div className="pb-1">
                                    <p className="font-semibold text-gray-900">Uploaded</p>
                                    <p className="text-xs text-gray-500">{formatDateTime(doc.uploadedAt)}</p>
                                  </div>
                                </div>
                              )}
                              {doc.verifiedAt && (
                                <div className="flex gap-3 text-sm">
                                  <div className="flex flex-col items-center">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5"></div>
                                    <div className="w-px h-full bg-gray-200 mt-1"></div>
                                  </div>
                                  <div className="pb-1">
                                    <p className="font-semibold text-gray-900">API Verified</p>
                                    <p className="text-xs text-gray-500">{formatDateTime(doc.verifiedAt)}</p>
                                  </div>
                                </div>
                              )}
                              {doc.reviewedAt && (
                                <div className="flex gap-3 text-sm">
                                  <div className="flex flex-col items-center">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5"></div>
                                  </div>
                                  <div>
                                    <p className="font-semibold text-gray-900">Reviewed</p>
                                    <p className="text-xs text-gray-500">{formatDateTime(doc.reviewedAt)}</p>
                                  </div>
                                </div>
                              )}
                              {(!doc.uploadedAt && !doc.verifiedAt && !doc.reviewedAt) && (
                                <p className="text-xs text-gray-400">No activity logged.</p>
                              )}
                            </div>
                          </div>
                          
                          <div className="mt-6 pt-4 border-t border-gray-100 flex gap-2 w-full">
                            <button
                                type="button"
                                onClick={() => doc.images?.length && window.open(doc.images[0], '_blank', 'noopener,noreferrer')}
                                disabled={!doc.images?.length}
                                className="flex-1 py-2 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors disabled:opacity-50"
                            >
                                View doc
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                if (!doc.sourceKey) return;
                                const confirmApprove = window.confirm(`Are you sure you want to approve "${doc.name}"?`);
                                if (!confirmApprove) return;

                                try {
                                  setDocumentActionKey(`${doc.sourceKey}:approve`);
                                  const token = localStorage.getItem('adminToken');
                                  const nextDocuments = {
                                    ...(profile?.documents || {}),
                                    [doc.sourceKey]: {
                                      ...(profile?.documents?.[doc.sourceKey] || {}),
                                      key: doc.sourceKey,
                                      name: doc.name,
                                      fileName: doc.fileNames?.[0] || doc.name || doc.sourceKey,
                                      previewUrl: doc.images?.[0] || profile?.documents?.[doc.sourceKey]?.previewUrl || '',
                                      secureUrl: doc.images?.[0] || profile?.documents?.[doc.sourceKey]?.secureUrl || '',
                                      images: doc.images || profile?.documents?.[doc.sourceKey]?.images || [],
                                      fileNames: doc.fileNames || profile?.documents?.[doc.sourceKey]?.fileNames || [],
                                      identify_number: doc.identify_number || profile?.documents?.[doc.sourceKey]?.identify_number || '',
                                      expiry_date: doc.expiry_date || profile?.documents?.[doc.sourceKey]?.expiry_date || '',
                                      status: 'approved',
                                      comment: '',
                                      remarks: '',
                                      reason: '',
                                      admin_comment: '',
                                      rejection_reason: '',
                                      reviewedAt: new Date().toISOString(),
                                      reverificationRequestedAt: null,
                                    },
                                  };

                                  const response = await fetch(
                                    `${globalThis.__LEGACY_BACKEND_ORIGIN__}/api/v1/admin/drivers/${id}`,
                                    {
                                      method: 'PATCH',
                                      headers: {
                                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                                        'Content-Type': 'application/json',
                                      },
                                      body: JSON.stringify({ documents: nextDocuments }),
                                    },
                                  );
                                  const data = await response.json();
                                  if (!response.ok || !data?.success) throw new Error(data?.message || 'Unable to approve');
                                  await fetchProfile();
                                } catch (err) {
                                  window.alert(err?.message || 'Unable to approve');
                                } finally {
                                  setDocumentActionKey('');
                                }
                              }}
                              disabled={
                                documentActionKey.length > 0 ||
                                !doc.images?.length ||
                                String(doc.status || '').toLowerCase() === 'approved'
                              }
                              className={`flex-1 py-2 text-xs font-semibold rounded-md transition-colors text-center ${
                                documentActionKey === `${doc.sourceKey}:approve`
                                  ? 'bg-emerald-100 text-emerald-500'
                                  : !doc.images?.length || String(doc.status || '').toLowerCase() === 'approved' || documentActionKey.length > 0
                                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                    : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                              }`}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                if (!doc.sourceKey) return;
                                const note = window.prompt(`Reason for rejecting "${doc.name}"`, doc.comment || '');
                                if (note === null) return;

                                try {
                                  setDocumentActionKey(`${doc.sourceKey}:reject`);
                                  const token = localStorage.getItem('adminToken');
                                  const nextDocuments = {
                                    ...(profile?.documents || {}),
                                    [doc.sourceKey]: {
                                      ...(profile?.documents?.[doc.sourceKey] || {}),
                                      key: doc.sourceKey,
                                      name: doc.name,
                                      fileName: doc.fileNames?.[0] || doc.name || doc.sourceKey,
                                      previewUrl: doc.images?.[0] || profile?.documents?.[doc.sourceKey]?.previewUrl || '',
                                      secureUrl: doc.images?.[0] || profile?.documents?.[doc.sourceKey]?.secureUrl || '',
                                      images: doc.images || profile?.documents?.[doc.sourceKey]?.images || [],
                                      fileNames: doc.fileNames || profile?.documents?.[doc.sourceKey]?.fileNames || [],
                                      identify_number: doc.identify_number || profile?.documents?.[doc.sourceKey]?.identify_number || '',
                                      expiry_date: doc.expiry_date || profile?.documents?.[doc.sourceKey]?.expiry_date || '',
                                      status: 'rejected',
                                      comment: String(note || '').trim(),
                                      remarks: String(note || '').trim(),
                                      reason: String(note || '').trim(),
                                      admin_comment: String(note || '').trim(),
                                      rejection_reason: String(note || '').trim(),
                                      reviewedAt: new Date().toISOString(),
                                      reverificationRequestedAt: null,
                                    },
                                  };

                                  const response = await fetch(
                                    `${globalThis.__LEGACY_BACKEND_ORIGIN__}/api/v1/admin/drivers/${id}`,
                                    {
                                      method: 'PATCH',
                                      headers: {
                                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                                        'Content-Type': 'application/json',
                                      },
                                      body: JSON.stringify({ documents: nextDocuments }),
                                    },
                                  );
                                  const data = await response.json();

                                  if (!response.ok || !data?.success) {
                                    throw new Error(data?.message || 'Unable to reject document');
                                  }

                                  await fetchProfile();
                                } catch (err) {
                                  window.alert(err?.message || 'Unable to reject document');
                                } finally {
                                  setDocumentActionKey('');
                                }
                              }}
                              disabled={
                                documentActionKey.length > 0 ||
                                !doc.images?.length ||
                                ['rejected', 'declined'].includes(String(doc.status || '').toLowerCase())
                              }
                              className={`flex-1 py-2 text-xs font-semibold rounded-md transition-colors text-center ${
                                documentActionKey === `${doc.sourceKey}:reject`
                                  ? 'bg-rose-100 text-rose-500'
                                  : !doc.images?.length || ['rejected', 'declined'].includes(String(doc.status || '').toLowerCase()) || documentActionKey.length > 0
                                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                    : 'text-rose-700 bg-rose-50 hover:bg-rose-100'
                              }`}
                            >
                              Decline
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'Subscription' && (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-500">
              No subscription data available.
            </div>
          )}
        </>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
            <h3 className="text-sm text-gray-900 mb-3 font-bold">Wallet Overview</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <div className="border border-gray-100 bg-gray-50/50 rounded-xl p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Wallet Balance</p>
                <p className="text-xl font-bold text-gray-900 mt-1">₹ {wallet.balance || 0}</p>
              </div>
              <div className="border border-gray-100 bg-gray-50/50 rounded-xl p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Cash Limit</p>
                <p className="text-xl font-bold text-gray-900 mt-1">₹ {wallet.cash_limit || 0}</p>
              </div>
              <div className="border border-gray-100 bg-gray-50/50 rounded-xl p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Total Credited</p>
                <p className="text-xl font-bold text-gray-900 mt-1">₹ {wallet.total_credits || 0}</p>
              </div>
              <div className="border border-gray-100 bg-gray-50/50 rounded-xl p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Total Debited</p>
                <p className="text-xl font-bold text-gray-900 mt-1">₹ {wallet.total_debits || 0}</p>
              </div>
              <div className="border border-gray-100 bg-gray-50/50 rounded-xl p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Wallet Status</p>
                <p className={`text-xl font-bold mt-1 ${wallet.is_blocked ? 'text-red-600' : 'text-green-600'}`}>
                  {wallet.is_blocked ? 'Blocked' : 'Active'}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6"> 
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-base text-gray-900 mb-4 font-bold">Driver Location</h3>
              <div className="h-80 rounded-xl overflow-hidden border border-gray-100">
                {loadError ? (
                  <div className="h-full flex items-center justify-center text-sm text-gray-500 bg-gray-50">
                    Map unavailable.
                  </div>
                ) : !profile?.location ? (
                  <div className="h-full flex items-center justify-center text-sm text-gray-500 bg-gray-50">
                    Live driver location is not available yet.
                  </div>
                ) : shouldLoadMap && HAS_VALID_GOOGLE_MAPS_KEY && isLoaded ? (
                  <GoogleMap
                    mapContainerStyle={mapContainerStyle}
                    center={mapCenter}
                    zoom={13}
                    options={{ streetViewControl: false, mapTypeControl: true, fullscreenControl: true }}
                  >
                    <MarkerF position={mapCenter} icon={vehicleMarkerIcon} />
                  </GoogleMap>
                ) : (
                  <div className="h-full flex items-center justify-center text-sm text-gray-500 bg-gray-50">
                    {HAS_VALID_GOOGLE_MAPS_KEY ? 'Loading map...' : 'Configure `VITE_GOOGLE_MAPS_API_KEY` to show map.'}
                  </div>
                )}
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 text-xs text-gray-500">
                <span>
                  {profile?.vehicle?.type || 'Vehicle'} marker
                </span>
                {profile?.location ? (
                  <span>
                    {Number(profile.location.lat).toFixed(4)}, {Number(profile.location.lng).toFixed(4)}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-base text-gray-900 mb-4 font-bold">Earnings</h3>
              <div className="h-52 rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4">
                <div className="relative h-full">
                  <ChartGrid height={170} />
                  <svg viewBox="0 0 400 170" className="absolute inset-0 w-full h-full">
                    <polyline
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="2.5"
                      points={buildLinePoints(chart.earnings || [], 400, 170)}
                    />
                  </svg>
                </div>
                <div className="mt-3 grid grid-cols-4 text-xs text-gray-400">
                  {(chart.months || []).map((m) => (
                    <span key={m} className="text-center">{m}</span>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
                <div className="border border-gray-100 bg-gray-50/50 rounded-xl p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Today Earnings</p>
                  <p className="text-lg font-bold text-gray-900 mt-1">₹ {earnings.today_earnings || 0}</p>
                </div>
                <div className="border border-gray-100 bg-gray-50/50 rounded-xl p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Admin Commission</p>
                  <p className="text-lg font-bold text-gray-900 mt-1">₹ {earnings.admin_commission || 0}</p>
                </div>
                <div className="border border-gray-100 bg-gray-50/50 rounded-xl p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Drivers Earnings</p>
                  <p className="text-lg font-bold text-gray-900 mt-1">₹ {earnings.driver_earnings || 0}</p>
                </div>
                <div className="border border-gray-100 bg-gray-50/50 rounded-xl p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">By Cash</p>
                  <p className="text-lg font-bold text-gray-900 mt-1">₹ {earnings.by_cash || 0}</p>
                </div>
                <div className="border border-gray-100 bg-gray-50/50 rounded-xl p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">By Wallet</p>
                  <p className="text-lg font-bold text-gray-900 mt-1">₹ {earnings.by_wallet || 0}</p>
                </div>
                <div className="border border-gray-100 bg-gray-50/50 rounded-xl p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">By Card/Online</p>
                  <p className="text-lg font-bold text-gray-900 mt-1">₹ {earnings.by_card || 0}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-base text-gray-900 mb-4 font-bold">Trips</h3>
            <div className="h-52 rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4">
              <div className="relative h-full">
                <ChartGrid height={170} />
                <svg viewBox="0 0 400 170" className="absolute inset-0 w-full h-full">
                  <polyline
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="2.5"
                    points={buildLinePoints(chart.trips?.completed || [], 400, 170)}
                  />
                  <polyline
                    fill="none"
                    stroke="#f97316"
                    strokeWidth="2.5"
                    points={buildLinePoints(chart.trips?.cancelled || [], 400, 170)}
                  />
                </svg>
              </div>
              <div className="mt-3 grid grid-cols-4 text-xs text-gray-400">
                {(chart.months || []).map((m) => (
                  <span key={m} className="text-center">{m}</span>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  Completed
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                  Cancelled
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-4">
              <div className="border border-gray-100 bg-gray-50/50 rounded-xl p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Completed Trips</p>
                <p className="text-lg font-bold text-gray-900 mt-1">{stats.completed_trips || 0}</p>
              </div>
              <div className="border border-gray-100 bg-gray-50/50 rounded-xl p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Cancelled Trips</p>
                <p className="text-lg font-bold text-gray-900 mt-1">{stats.cancelled_trips || 0}</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default DriverDetails;
  const buildLinePoints = (values, width, height, padding = 16) => {
    if (!values.length) return '';
    const maxValue = Math.max(...values, 1);
    const stepX = (width - padding * 2) / (values.length - 1 || 1);
    return values
      .map((value, index) => {
        const x = padding + index * stepX;
        const y = height - padding - (Number(value) / maxValue) * (height - padding * 2);
        return `${x},${y}`;
      })
      .join(' ');
  };

  const ChartGrid = ({ height = 180 }) => (
    <svg viewBox={`0 0 400 ${height}`} className="w-full h-full">
      {[0, 1, 2, 3].map((i) => (
        <line
          key={i}
          x1="24"
          x2="376"
          y1={24 + i * ((height - 48) / 3)}
          y2={24 + i * ((height - 48) / 3)}
          stroke="#e5e7eb"
          strokeDasharray="4 4"
        />
      ))}
    </svg>
  );



