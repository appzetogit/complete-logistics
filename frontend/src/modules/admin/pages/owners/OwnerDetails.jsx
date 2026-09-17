import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  Car,
  ChevronRight,
  CircleUserRound,
  CreditCard,
  Eye,
  FileText,
  Globe2,
  Loader2,
  Mail,
  Menu,
  Phone,
} from 'lucide-react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';

import { adminService } from '../../services/adminService';
import AdminPageHeader from '../../components/ui/AdminPageHeader';

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

const humanizeDocumentKey = (value = '') =>
  String(value || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();

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
  return {
    ...doc,
    rawDocument: doc,
    sourceKey: doc?.key || doc?.documentKey || doc?.type || fallbackKey || doc?.name || '',
    name:
      doc?.name ||
      doc?.label ||
      humanizeDocumentKey(doc?.key || doc?.documentKey || doc?.type || fallbackKey) ||
      'Document',
    fileNames: getDocumentFileNames(doc, images),
    identify_number: doc?.identify_number || doc?.identifyNumber || doc?.documentNumber || doc?.document_number || '',
    expiry_date: doc?.expiry_date || doc?.expiryDate || doc?.expiry || '',
    status: doc?.status || doc?.verificationStatus || doc?.approvalStatus || 'Pending',
    comment: doc?.comment || doc?.remarks || doc?.reason || doc?.admin_comment || doc?.rejection_reason || '',
    images,
  };
};

const tabs = [
  'Owner Profile',
  'Driver Details',
  'Fleet Details',
  'Payment History',
  'Withdrawal History',
  'Documents',
];

const emptyStateByTab = {
  'Driver Details': 'No driver details found for this owner.',
  'Fleet Details': 'No fleet details found for this owner.',
  'Payment History': 'No payment history found for this owner.',
  'Withdrawal History': 'No withdrawal history found for this owner.',
  Documents: 'No documents found for this owner.',
};

const formatMobile = (owner) => {
  const mobile = owner?.mobile_number || owner?.mobile || owner?.phone || '';
  if (!mobile) return '-';
  return String(mobile).startsWith('+') ? mobile : `+91${mobile}`;
};

const InfoLine = ({ icon, children }) => {
  const IconComponent = icon;

  return (
    <div className="flex items-center gap-2 text-[15px] font-medium text-gray-900">
      <IconComponent size={16} strokeWidth={1.8} className="text-gray-950" />
      <span>{children || '-'}</span>
    </div>
  );
};

const StatCard = ({ label, value, tone = 'teal' }) => {
  const toneClass =
    tone === 'rose'
      ? 'bg-rose-50 text-red-500'
      : 'bg-teal-50 text-teal-500';

  return (
    <div className="rounded border border-gray-200 bg-white px-4 py-5 shadow-sm">
      <div className={`mb-6 flex h-11 w-11 items-center justify-center rounded-full ${toneClass}`}>
        <Car size={19} strokeWidth={2.1} />
      </div>
      <p className="text-lg font-semibold leading-none text-slate-700">{value}</p>
      <p className="mt-2 text-[15px] font-semibold text-slate-400">{label}</p>
    </div>
  );
};

const OwnerDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isDocumentsPath = location.pathname.endsWith('/documents');
  
  const [activeTab, setActiveTab] = useState(location.state?.tab || (isDocumentsPath ? 'Documents' : 'Owner Profile'));
  const [owner, setOwner] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [documentActionKey, setDocumentActionKey] = useState('');

  const fetchOwner = async () => {
    setIsLoading(true);
    setError('');
    setAvatarFailed(false);

    try {
      const response = await adminService.getOwner(id);
      if (response.success) {
        setOwner(response.data);
      } else {
        setError(response.message || 'Unable to load owner profile');
      }
    } catch (err) {
      setError(err.message || 'Unable to load owner profile');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOwner();
  }, [id]);

  const documents = useMemo(() => {
    if (!owner) return [];
    const candidateSources = [
      owner.documents,
      owner.user?.documents,
      owner.user_snapshot?.documents,
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
        ) === index
    );
  }, [owner]);

  const ownerName = owner?.owner_name || owner?.name || owner?.user?.name || 'Owner';
  const companyName = owner?.company_name || '-';
  const areaName = owner?.area_name || owner?.area?.name || owner?.user?.country_name || 'India';
  const profileImage = owner?.user?.profile_picture;
  const initials = useMemo(
    () =>
      ownerName
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join('')
        .toUpperCase() || 'O',
    [ownerName],
  );

  const reportCards = [
    { label: 'Registered Fleets', value: owner?.no_of_vehicles || 0 },
    { label: 'Approved Fleets', value: 0 },
    { label: 'Fleets Awaiting Review', value: 0, tone: 'rose' },
    { label: 'Registered Drivers', value: 0 },
    { label: 'Approved Drivers', value: 0 },
    { label: 'Drivers Awaiting Review', value: 0, tone: 'rose' },
  ];

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-slate-400">
        <Loader2 size={34} className="animate-spin text-teal-500" />
        <p className="text-sm font-semibold">Loading owner profile...</p>
      </div>
    );
  }

  if (error || !owner) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-50 text-rose-500">
          <AlertCircle size={32} />
        </div>
        <p className="text-sm font-semibold text-rose-600">{error || 'Owner not found'}</p>
        <button
          type="button"
          onClick={() => navigate('/admin/owners')}
          className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
        >
          Back to Owners
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-950">
      <div className="p-6 lg:p-8">
        <AdminPageHeader module="Owner Management" page="Owner Details" title="Owner Details" backTo="/admin/owners" />

        <div className="mt-6">
          <div className="rounded border border-gray-200 bg-white shadow-sm">
        <div className="grid gap-6 px-4 py-6 md:grid-cols-[1fr_1px_1fr] md:px-5">
          <div className="flex items-center gap-4">
            <div className="flex h-[102px] w-[102px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-pink-200 via-violet-100 to-fuchsia-300 text-3xl font-bold text-indigo-950">
              {profileImage && !avatarFailed ? (
                <img
                  src={profileImage}
                  alt={ownerName}
                  className="h-full w-full object-cover"
                  onError={() => setAvatarFailed(true)}
                />
              ) : (
                initials
              )}
            </div>

            <div className="space-y-3">
              <InfoLine icon={Building2}>{companyName}</InfoLine>
              <InfoLine icon={CircleUserRound}>{ownerName}</InfoLine>
              <InfoLine icon={Globe2}>{areaName}</InfoLine>
            </div>
          </div>

          <div className="hidden bg-gray-100 md:block" />

          <div className="flex flex-col justify-center gap-4 md:pl-3">
            <InfoLine icon={Phone}>{formatMobile(owner)}</InfoLine>
            <InfoLine icon={Mail}>{owner.email}</InfoLine>
          </div>
        </div>

        <div className="border-t border-gray-100 px-4">
          <div className="flex flex-wrap gap-0">
            {tabs.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`border-b-2 px-4 py-4 text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? 'border-teal-500 bg-slate-50 text-gray-950'
                    : 'border-transparent text-gray-950 hover:bg-slate-50'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="relative mt-9 rounded border border-gray-200 bg-white p-7 shadow-sm">
        {activeTab === 'Owner Profile' ? (
          <>
            <h2 className="mb-5 text-base font-medium text-slate-700">General Report</h2>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {reportCards.map((card) => (
                <StatCard key={card.label} {...card} />
              ))}
            </div>

            <div className="mt-10">
              <h2 className="mb-4 text-base font-medium text-slate-700">Map</h2>
              <div className="flex h-64 items-center justify-center rounded border border-dashed border-gray-200 bg-gray-50 text-sm font-medium text-slate-400">
                Map location is not available for this owner yet.
              </div>
            </div>
          </>
        ) : activeTab === 'Documents' ? (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500">
                      <th className="px-6 py-3 font-semibold">Document Name</th>
                      <th className="px-4 py-3 font-semibold">Identify Number</th>
                      <th className="px-4 py-3 font-semibold">Expiry Date</th>
                      <th className="px-4 py-3 font-semibold">Admin Status</th>
                      <th className="px-4 py-3 font-semibold">Comment</th>
                      <th className="px-4 py-3 font-semibold">Document</th>
                      <th className="px-4 py-3 font-semibold text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
                    {documents.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="px-6 py-12 text-center text-gray-400 font-medium">No documents found.</td>
                      </tr>
                    ) : (
                      documents.map((doc, idx) => (
                        <tr key={`${doc.name}-${idx}`} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="font-semibold text-gray-900">{doc.name}</div>
                          </td>
                          <td className="px-4 py-4">{doc.identify_number || '-'}</td>
                          <td className="px-4 py-4">{doc.expiry_date || '-'}</td>
                          <td className="px-4 py-4">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              String(doc.status || '').toLowerCase() === 'approved' 
                                ? 'bg-emerald-100 text-emerald-800' 
                                : String(doc.status || '').toLowerCase() === 'rejected' || String(doc.status || '').toLowerCase() === 'declined'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}>
                              {doc.status || 'Pending'}
                            </span>
                          </td>
                          <td className="px-4 py-4 max-w-[200px] break-words text-xs text-gray-600">
                            {doc.comment || '-'}
                          </td>
                          <td className="px-4 py-4">
                            {doc.images?.length ? (
                              <div className="flex flex-wrap items-center gap-2">
                                {doc.images.map((url, i) => (
                                  <button
                                    key={`view-${i}`}
                                    type="button"
                                    onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
                                    className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 rounded hover:bg-indigo-100 transition-colors inline-flex items-center gap-1"
                                  >
                                    <Eye size={10} /> View
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs font-medium text-slate-400">No file</span>
                            )}
                          </td>
                          <td className="px-4 py-4 text-center">
                            <div className="inline-flex items-center gap-2 justify-center">
                              <button
                                type="button"
                                onClick={async () => {
                                  if (!doc.sourceKey) return;
                                  const confirmApprove = window.confirm(`Are you sure you want to approve "${doc.name}"?`);
                                  if (!confirmApprove) return;

                                  try {
                                    setDocumentActionKey(`${doc.sourceKey}:approve`);
                                    const ownerDocs = owner?.user?.documents || owner?.user_snapshot?.documents || owner?.documents || {};
                                    const nextDocuments = {
                                      ...ownerDocs,
                                      [doc.sourceKey]: {
                                        ...(ownerDocs[doc.sourceKey] || {}),
                                        key: doc.sourceKey,
                                        name: doc.name,
                                        fileName: doc.fileNames?.[0] || doc.name || doc.sourceKey,
                                        previewUrl: doc.images?.[0] || ownerDocs[doc.sourceKey]?.previewUrl || '',
                                        secureUrl: doc.images?.[0] || ownerDocs[doc.sourceKey]?.secureUrl || '',
                                        images: doc.images || ownerDocs[doc.sourceKey]?.images || [],
                                        fileNames: doc.fileNames || ownerDocs[doc.sourceKey]?.fileNames || [],
                                        identify_number: doc.identify_number || ownerDocs[doc.sourceKey]?.identify_number || '',
                                        expiry_date: doc.expiry_date || ownerDocs[doc.sourceKey]?.expiry_date || '',
                                        status: 'approved',
                                        comment: '',
                                        reviewedAt: new Date().toISOString(),
                                      },
                                    };

                                    const response = await adminService.updateOwner(id, { documents: nextDocuments });
                                    if (!response.success) throw new Error(response.message || 'Unable to approve');
                                    await fetchOwner();
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
                                className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
                                  documentActionKey === `${doc.sourceKey}:approve`
                                    ? 'bg-emerald-100 text-emerald-500'
                                    : !doc.images?.length || String(doc.status || '').toLowerCase() === 'approved' || documentActionKey.length > 0
                                      ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
                                      : 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100'
                                }`}
                              >
                                {documentActionKey === `${doc.sourceKey}:approve` ? 'Saving...' : 'Approve'}
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  if (!doc.sourceKey) return;
                                  const note = window.prompt(`Reason for rejecting "${doc.name}"`, doc.comment || '');
                                  if (note === null) return;

                                  try {
                                    setDocumentActionKey(`${doc.sourceKey}:reject`);
                                    const ownerDocs = owner?.user?.documents || owner?.user_snapshot?.documents || owner?.documents || {};
                                    const nextDocuments = {
                                      ...ownerDocs,
                                      [doc.sourceKey]: {
                                        ...(ownerDocs[doc.sourceKey] || {}),
                                        key: doc.sourceKey,
                                        name: doc.name,
                                        fileName: doc.fileNames?.[0] || doc.name || doc.sourceKey,
                                        previewUrl: doc.images?.[0] || ownerDocs[doc.sourceKey]?.previewUrl || '',
                                        secureUrl: doc.images?.[0] || ownerDocs[doc.sourceKey]?.secureUrl || '',
                                        images: doc.images || ownerDocs[doc.sourceKey]?.images || [],
                                        fileNames: doc.fileNames || ownerDocs[doc.sourceKey]?.fileNames || [],
                                        identify_number: doc.identify_number || ownerDocs[doc.sourceKey]?.identify_number || '',
                                        expiry_date: doc.expiry_date || ownerDocs[doc.sourceKey]?.expiry_date || '',
                                        status: 'rejected',
                                        comment: String(note || '').trim(),
                                        reviewedAt: new Date().toISOString(),
                                      },
                                    };

                                    const response = await adminService.updateOwner(id, { documents: nextDocuments });
                                    if (!response.success) throw new Error(response.message || 'Unable to reject');
                                    await fetchOwner();
                                  } catch (err) {
                                    window.alert(err?.message || 'Unable to reject');
                                  } finally {
                                    setDocumentActionKey('');
                                  }
                                }}
                                disabled={
                                  documentActionKey.length > 0 ||
                                  !doc.images?.length
                                }
                                className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
                                  documentActionKey === `${doc.sourceKey}:reject`
                                    ? 'bg-rose-100 text-rose-500'
                                    : !doc.images?.length || documentActionKey.length > 0
                                      ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
                                      : 'text-rose-600 bg-rose-50 hover:bg-rose-100'
                                }`}
                              >
                                {documentActionKey === `${doc.sourceKey}:reject` ? 'Saving...' : 'Reject'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-50 text-slate-400">
              {activeTab === 'Documents' ? <FileText size={26} /> : <CreditCard size={26} />}
            </div>
            <p className="text-sm font-semibold text-slate-400">{emptyStateByTab[activeTab]}</p>
          </div>
        )}
      </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => navigate('/admin/owners')}
        className="mt-6 inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50"
      >
        <ArrowLeft size={16} /> Back
      </button>
    </div>
  );
};

export default OwnerDetails;
