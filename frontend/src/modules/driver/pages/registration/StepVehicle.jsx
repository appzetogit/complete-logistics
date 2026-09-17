import React, { useEffect, useRef, useState } from 'react';
import { 
    ArrowLeft, 
    Car, 
    ChevronRight, 
    MapPin, 
    ShieldCheck,
    Info
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    getStoredDriverRegistrationSession,
    getDriverDocumentTemplates,
    getDriverServiceLocations,
    saveDriverRegistrationSession,
    saveDriverVehicle,
    getDriverVehicleTypes,
    getDriverVehicleFieldTemplates,
    verifyDriverOnboardingLicenseDocument,
    verifyDriverVehicleRc,
} from '../../services/registrationService';
import { normalizeDriverDocumentTemplates } from '../../utils/documentTemplates';

const VEHICLE_NUMBER_PATTERNS = [
    /^[A-Z]{2}\d{1,2}[A-Z]{1,4}\d{4}$/,
    /^[A-Z]{2}\d{1,2}[A-Z]{1,5}\d{4}$/,
];
const getCurrentVehicleYear = () => new Date().getFullYear();
const normalizeVehicleNumber = (value = '') => String(value).replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 12);
const normalizePostalCode = (value = '') => String(value).replace(/\D/g, '').slice(0, 6);
const isValidIndianVehicleNumber = (value = '') =>
    VEHICLE_NUMBER_PATTERNS.some((pattern) => pattern.test(value));
const normalizeLabel = (value = '') => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const findAutofillCustomFieldKey = (fields, aliases = []) => {
    const normalizedAliases = aliases.map(normalizeLabel).filter(Boolean);
    return (
        fields.find((field) => {
            const fieldKey = normalizeLabel(field?.field_key);
            const fieldName = normalizeLabel(field?.name);
            return normalizedAliases.some((alias) => fieldKey === alias || fieldName.includes(alias) || alias.includes(fieldName));
        })?.field_key || ''
    );
};
const applyAutofillCustomField = (currentValue, fieldConfig, nextValue) => {
    if (!fieldConfig || !nextValue) return currentValue;

    const fieldType = String(fieldConfig.field_type || 'text').trim().toLowerCase();
    const normalizedValue = String(nextValue || '').trim();

    if (!normalizedValue) return currentValue;

    if (fieldType === 'multi_select') {
        const values = Array.isArray(currentValue) ? [...currentValue] : [];
        return values.includes(normalizedValue) ? values : [...values, normalizedValue];
    }

    return normalizedValue;
};
const normalizeVerificationType = (value = '') => {
    const normalized = String(value || 'none').trim().toLowerCase();
    return ['driving_license', 'pan', 'gstin', 'rc', 'bank_account'].includes(normalized) ? normalized : 'none';
};
const normalizeOnboardingDocument = (doc) => {
    if (!doc) return null;
    if (typeof doc === 'string') {
        return {
            previewUrl: doc,
            secureUrl: doc,
            uploaded: true,
        };
    }

    return {
        ...doc,
        previewUrl: doc.previewUrl || doc.secureUrl || doc.url || '',
        uploaded: doc.uploaded ?? Boolean(doc.previewUrl || doc.secureUrl || doc.url),
    };
};
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
const hasRcAutofillData = (formData = {}, customFields = {}, customKeys = []) =>
    Boolean(
        String(formData.make || '').trim()
        || String(formData.model || '').trim()
        || String(formData.year || '').trim()
        || String(formData.number || '').trim()
        || String(formData.color || '').trim()
        || customKeys.some((key) => {
            const value = customFields?.[key];
            return Array.isArray(value) ? value.length > 0 : Boolean(String(value || '').trim());
        }),
    );
const getRcVerificationDetailsList = (vehicle = {}) => [
    { key: 'ownerName', label: 'Owner Name' },
    { key: 'status', label: 'RC Status' },
    { key: 'registrationDate', label: 'Registration Date' },
    { key: 'insuranceUpto', label: 'Insurance Upto' },
    { key: 'fitnessUpto', label: 'Fitness Upto' },
    { key: 'permitNumber', label: 'Permit Number' },
    { key: 'permitValidUpto', label: 'Permit Valid Upto' },
    { key: 'pucNumber', label: 'PUC Number' },
    { key: 'pucValidUpto', label: 'PUC Valid Upto' },
    { key: 'fuelType', label: 'Fuel Type' },
    { key: 'seatCapacity', label: 'Seat Capacity' },
    { key: 'manufacturingMonthYear', label: 'Manufacturing Month/Year' },
]
    .map(({ key, label }) => ({
        key,
        label,
        value: String(vehicle?.[key] || '').trim(),
    }))
    .filter((item) => item.value);
const matchesVehicleFieldAccountType = (accountType, isOwner) => {
    const rawAccountType = String(accountType || '').trim().toLowerCase();
    const normalizedAccountType = rawAccountType || 'individual';

    if (isOwner) {
        if (!rawAccountType) {
            return false;
        }

        return [
            'fleet_drivers',
            'fleet drivers',
            'owner',
            'owners',
            'fleet_owner',
            'fleet_owners',
            'fleet owner',
            'fleet owners',
        ].includes(normalizedAccountType);
    }

    if (normalizedAccountType === 'both') {
        return true;
    }

    return normalizedAccountType === 'individual';
};
const normalizeServiceCategories = (value, registerFor = 'taxi') => {
    const rawValues = Array.isArray(value)
        ? value
        : typeof value === 'string'
            ? value.split(',')
            : [];

    const normalized = [...new Set(
        rawValues
            .map((item) => String(item || '').trim().toLowerCase())
            .flatMap((item) => item === 'both' ? ['taxi', 'outstation'] : item ? [item] : [])
            .filter((item) => ['taxi', 'outstation', 'delivery', 'pooling'].includes(item)),
    )];

    if (normalized.length > 0) {
        return normalized;
    }

    const fallback = String(registerFor || 'taxi').trim().toLowerCase();
    if (fallback === 'both') {
        return ['taxi', 'outstation'];
    }

    return ['taxi', 'outstation', 'delivery', 'pooling'].includes(fallback) ? [fallback] : ['taxi'];
};

const getPrimaryRegisterFor = (serviceCategories = [], fallback = 'taxi') => {
    const normalized = normalizeServiceCategories(serviceCategories, fallback);

    if (normalized.includes('taxi') && normalized.includes('outstation')) return 'both';
    if (normalized.includes('taxi')) return 'taxi';
    if (normalized.includes('outstation')) return 'outstation';
    if (normalized.includes('delivery')) return 'delivery';
    if (normalized.includes('pooling')) return 'pooling';

    return String(fallback || 'taxi').trim().toLowerCase() || 'taxi';
};

const defaultVehicleFieldConfigs = [
    { field_key: 'locationId', name: 'Operating City', account_type: 'both', is_required: true, active: true, sort_order: 10, placeholder: '', help_text: '' },
    { field_key: 'serviceCategories', name: 'Service Category', account_type: 'individual', is_required: true, active: true, sort_order: 20, placeholder: '', help_text: '' },
    { field_key: 'vehicleTypeId', name: 'Vehicle Type', account_type: 'individual', is_required: true, active: true, sort_order: 30, placeholder: '', help_text: 'Select the type of vehicle you drive.' },
    { field_key: 'rcNumber', name: 'RC / Permit Number', account_type: 'individual', is_required: true, active: true, sort_order: 35, placeholder: 'MP09AB1234', help_text: 'Enter RC number to fetch vehicle details automatically.' },
    { field_key: 'make', name: 'Brand / Make', account_type: 'individual', is_required: true, active: true, sort_order: 40, placeholder: 'e.g. Maruti Suzuki', help_text: '' },
    { field_key: 'model', name: 'Model', account_type: 'individual', is_required: true, active: true, sort_order: 50, placeholder: 'Swift, Bolt', help_text: '' },
    { field_key: 'year', name: 'Year', account_type: 'individual', is_required: true, active: true, sort_order: 60, placeholder: String(getCurrentVehicleYear()), help_text: '' },
    { field_key: 'number', name: 'Plate Number', account_type: 'individual', is_required: true, active: true, sort_order: 70, placeholder: 'DL1RT1234', help_text: '' },
    { field_key: 'color', name: 'Exterior Color', account_type: 'individual', is_required: true, active: true, sort_order: 80, placeholder: 'e.g. White, Black', help_text: '' },
    { field_key: 'companyName', name: 'Company Name', account_type: 'fleet_drivers', is_required: true, active: true, sort_order: 30, placeholder: 'Legal Company Name', help_text: '' },
    { field_key: 'companyAddress', name: 'Company Address', account_type: 'fleet_drivers', is_required: true, active: true, sort_order: 40, placeholder: 'Business Address', help_text: '' },
    { field_key: 'city', name: 'City', account_type: 'fleet_drivers', is_required: true, active: true, sort_order: 50, placeholder: 'City', help_text: '' },
    { field_key: 'postalCode', name: 'Postal Code', account_type: 'fleet_drivers', is_required: true, active: true, sort_order: 60, placeholder: 'Pincode', help_text: '' },
    { field_key: 'taxNumber', name: 'Tax Number (GST/VAT)', account_type: 'fleet_drivers', is_required: true, active: true, sort_order: 70, placeholder: 'Tax Identification', help_text: '' },
];


const StepVehicle = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const routePrefix = location.pathname.startsWith('/taxi/owner')
        ? '/taxi/owner'
        : '/taxi/driver';
    const session = getStoredDriverRegistrationSession();
    const isHandlingHistoryNavigationRef = useRef(false);
    const role = session.role || 'driver';
    const isOwner = role === 'owner';
    const phone = String(session.phone || '').replace(/\D/g, '').slice(-10);
    const registrationId = String(session.registrationId || '').trim();

    const [locations, setLocations] = useState([]);
    const [locationsLoading, setLocationsLoading] = useState(true);
    const [locationsError, setLocationsError] = useState('');

    const [vehicleTypes, setVehicleTypes] = useState([]);
    const [vehicleTypesLoading, setVehicleTypesLoading] = useState(false);
    const [vehicleFieldConfigs, setVehicleFieldConfigs] = useState(defaultVehicleFieldConfigs);
    const [documentTemplates, setDocumentTemplates] = useState([]);

    const [formData, setFormData] = useState({
        registerFor: getPrimaryRegisterFor(session.serviceCategories || session.vehicleSession?.vehicle?.serviceCategories || [], session.registerFor || 'taxi'),
        serviceCategories: normalizeServiceCategories(session.serviceCategories || session.vehicleSession?.vehicle?.serviceCategories || [], session.registerFor || 'taxi'),
        locationId: session.locationId || '',
        vehicleTypeId: session.vehicleTypeId || '',
        rcNumber: session.rcNumber || session.vehicleSession?.vehicle?.rcNumber || '',
        make: session.make || '',
        model: session.model || '',
        year: session.year || '',
        number: session.number || '',
        color: session.color || '',
        // Company info for owners
        companyName: session.companyName || '',
        companyAddress: session.companyAddress || '',
        city: session.city || '',
        postalCode: session.postalCode || '',
        taxNumber: session.taxNumber || '',
        customFields: session.customFields || session.vehicleSession?.vehicle?.customFields || {},
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [fieldErrors, setFieldErrors] = useState({});
    const [submitAttempted, setSubmitAttempted] = useState(false);
    const [rcVerificationLoading, setRcVerificationLoading] = useState(false);
    const [rcVerificationMessage, setRcVerificationMessage] = useState('');
    const [rcVerificationError, setRcVerificationError] = useState('');
    const [rcVerificationDetails, setRcVerificationDetails] = useState(session.rcVerificationDetails || null);
    const [dlMeta, setDlMeta] = useState(() => ({
        identifyNumber: '',
        birthDate: '',
        requestNumber: '',
    }));
    const [dlVerificationLoading, setDlVerificationLoading] = useState(false);
    const [dlVerificationMessage, setDlVerificationMessage] = useState(session.dlVerificationMessage || '');
    const [dlVerificationError, setDlVerificationError] = useState('');
    const [dlVerificationDetails, setDlVerificationDetails] = useState(null);
    const lastVerifiedRcRef = useRef('');

    useEffect(() => {
        saveDriverRegistrationSession({
            ...session,
            ...formData,
        });
    }, [formData]);

    useEffect(() => {
        saveDriverRegistrationSession({
            ...getStoredDriverRegistrationSession(),
            ...session,
            ...formData,
            rcVerificationDetails,
            rcVerificationMessage,
            dlVerificationMessage,
        });
    }, [formData, rcVerificationDetails, rcVerificationMessage, dlVerificationMessage]);

    useEffect(() => {
        if (isOwner) {
            return;
        }

        const storedSession = getStoredDriverRegistrationSession();
        const storedTemplates = normalizeDriverDocumentTemplates(documentTemplates);
        const dlTemplate = storedTemplates.find(
            (template) => normalizeVerificationType(template?.verification_type) === 'driving_license',
        );

        if (!dlTemplate) {
            return;
        }

        const templateId = String(dlTemplate.id || '').trim();
        const docKey = String(dlTemplate.fields?.[0]?.key || '').trim();
        const storedMeta = storedSession.documentMeta?.[templateId] || session.documentMeta?.[templateId] || {};
        const storedDoc = normalizeOnboardingDocument(
            storedSession.documents?.[docKey] || session.documents?.[docKey] || null,
        );
        const nextDlMeta = {
            identifyNumber: String(storedMeta.identifyNumber || storedDoc?.identifyNumber || storedDoc?.identify_number || '').trim(),
            birthDate: String(storedMeta.birthDate || storedDoc?.birthDate || storedDoc?.birth_date || '').trim(),
            requestNumber: String(storedMeta.requestNumber || storedDoc?.requestNumber || storedDoc?.request_no || '').trim(),
        };

        setDlMeta((current) =>
            current.identifyNumber === nextDlMeta.identifyNumber &&
            current.birthDate === nextDlMeta.birthDate &&
            current.requestNumber === nextDlMeta.requestNumber
                ? current
                : nextDlMeta,
        );
        setDlVerificationDetails((current) => {
            const currentPreview = String(current?.previewUrl || current?.secureUrl || '').trim();
            const nextPreview = String(storedDoc?.previewUrl || storedDoc?.secureUrl || '').trim();
            const currentIdentifyNumber = String(current?.identifyNumber || current?.identify_number || '').trim();
            const nextIdentifyNumber = String(storedDoc?.identifyNumber || storedDoc?.identify_number || '').trim();
            const currentRequestNumber = String(current?.requestNumber || current?.request_no || '').trim();
            const nextRequestNumber = String(storedDoc?.requestNumber || storedDoc?.request_no || '').trim();

            return currentPreview === nextPreview &&
                currentIdentifyNumber === nextIdentifyNumber &&
                currentRequestNumber === nextRequestNumber
                ? current
                : storedDoc;
        });
    }, [documentTemplates, isOwner]);

    useEffect(() => {
        if (!phone || !registrationId) {
            navigate(`${routePrefix}/reg-phone`, { replace: true });
        }
    }, [navigate, phone, registrationId, routePrefix]);

    const buildCurrentSession = () => saveDriverRegistrationSession({
        ...getStoredDriverRegistrationSession(),
        ...session,
        ...formData,
    });

    const handleBackNavigation = () => {
        const shouldLeave = window.confirm(
            'Go back to the previous step? Your vehicle details will stay saved.',
        );

        if (!shouldLeave) {
            return false;
        }

        isHandlingHistoryNavigationRef.current = true;
        buildCurrentSession();
        navigate(`${routePrefix}/step-referral`, { replace: true });
        return true;
    };

    useEffect(() => {
        window.history.pushState({ onboardingStep: 'vehicle' }, '', window.location.href);

        const handlePopState = () => {
            if (isHandlingHistoryNavigationRef.current) {
                return;
            }

            const didLeave = handleBackNavigation();
            if (!didLeave) {
                window.history.pushState({ onboardingStep: 'vehicle' }, '', window.location.href);
            }
        };

        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [routePrefix, formData]);

    useEffect(() => {
        let active = true;

        const loadLocations = async () => {
            try {
                setLocationsLoading(true);
                setLocationsError('');

                const response = await getDriverServiceLocations();
                const results = response?.data?.results || response?.data || [];

                if (active) {
                    setLocations(Array.isArray(results) ? results : []);
                }
            } catch (err) {
                if (active) {
                    setLocationsError(err?.message || 'Unable to load service locations');
                    setLocations([]);
                }
            } finally {
                if (active) {
                    setLocationsLoading(false);
                }
            }
        };

        const loadVehicleTypes = async () => {
            try {
                setVehicleTypesLoading(true);
                const response = await getDriverVehicleTypes();
                const results = response?.data?.results || response?.data || [];
                if (active) {
                    setVehicleTypes(Array.isArray(results) ? results : []);
                }
            } catch (err) {
                console.error('Failed to load vehicle types:', err);
            } finally {
                if (active) {
                    setVehicleTypesLoading(false);
                }
            }
        };

        const loadVehicleFieldConfigs = async () => {
            try {
                const response = await getDriverVehicleFieldTemplates(isOwner ? 'owner' : 'driver');
                const results = response?.data?.results || response?.data?.data?.results || [];
                if (active && Array.isArray(results) && results.length > 0) {
                    setVehicleFieldConfigs(results);
                }
            } catch (err) {
                console.error('Failed to load vehicle field configs:', err);
            }
        };

        const loadDocumentTemplates = async () => {
            if (isOwner) {
                if (active) {
                    setDocumentTemplates([]);
                }
                return;
            }

            try {
                const response = await getDriverDocumentTemplates('driver');
                const results = response?.data?.data?.results || response?.data?.results || [];
                if (active) {
                    setDocumentTemplates(normalizeDriverDocumentTemplates(results));
                }
            } catch (err) {
                console.error('Failed to load driver document templates:', err);
                if (active) {
                    setDocumentTemplates([]);
                }
            }
        };

        loadLocations();
        loadVehicleTypes();
        loadVehicleFieldConfigs();
        loadDocumentTemplates();

        return () => {
            active = false;
        };
    }, [isOwner]);

    const activeVehicleFields = vehicleFieldConfigs
        .filter((item) => item?.active !== false)
        .sort((a, b) => Number(a?.sort_order || 0) - Number(b?.sort_order || 0));

    const builtInVehicleFieldKeys = new Set([
        'locationId',
        'serviceCategories',
        'vehicleTypeId',
        'rcNumber',
        'make',
        'model',
        'year',
        'number',
        'color',
        'companyName',
        'companyAddress',
        'city',
        'postalCode',
        'taxNumber',
    ]);

    const fieldConfigMap = activeVehicleFields.reduce((acc, item) => {
        acc[String(item.field_key || '').trim()] = item;
        return acc;
    }, {});

    const getFieldConfig = (key, fallback = {}) => ({
        name: fallback.name || '',
        placeholder: fallback.placeholder || '',
        help_text: fallback.help_text || '',
        is_required: fallback.is_required ?? true,
        ...fieldConfigMap[key],
    });

    const shouldShowField = (key, fallback = true) => {
        if (!fieldConfigMap[key]) return fallback;
        return fieldConfigMap[key].active !== false;
    };

    const isFieldRequired = (key, fallback = true) => {
        if (!fieldConfigMap[key]) return fallback;
        return fieldConfigMap[key].is_required !== false;
    };

    const isFilled = (value) => Array.isArray(value) ? value.length > 0 : Boolean(String(value || '').trim());
    const handleCustomFieldChange = (key, value) => {
        setFormData((previous) => ({
            ...previous,
            customFields: {
                ...(previous.customFields || {}),
                [key]: value,
            },
        }));
    };
    const customVehicleFields = activeVehicleFields.filter((item) => !builtInVehicleFieldKeys.has(String(item?.field_key || '').trim()));
    const visibleCustomVehicleFields = customVehicleFields.filter((item) =>
        matchesVehicleFieldAccountType(item?.account_type, isOwner),
    );
    const fuelTypeFieldKey = findAutofillCustomFieldKey(visibleCustomVehicleFields, ['fuel type', 'fuel', 'vehicle fuel']);
    const seatCapacityFieldKey = findAutofillCustomFieldKey(visibleCustomVehicleFields, ['seat capacity', 'seating capacity', 'seats']);
    const manufacturerFieldKey = findAutofillCustomFieldKey(visibleCustomVehicleFields, ['manufacturer', 'vehicle manufacturer', 'brand']);
    const rcAutofillCustomFieldKeys = [fuelTypeFieldKey, seatCapacityFieldKey, manufacturerFieldKey].filter(Boolean);
    const showRcAutofilledFields = isOwner || hasRcAutofillData(formData, formData.customFields, rcAutofillCustomFieldKeys);
    const drivingLicenseTemplate = documentTemplates.find(
        (template) => normalizeVerificationType(template?.verification_type) === 'driving_license',
    ) || null;
    const drivingLicenseTemplateId = String(
        drivingLicenseTemplate?.id ||
        session.drivingLicenseTemplateId ||
        'driving_license'
    ).trim();
    const drivingLicenseDocumentKey = String(
        drivingLicenseTemplate?.fields?.[0]?.key ||
        session.drivingLicenseDocumentKey ||
        'driving_license'
    ).trim();

    useEffect(() => {
        if (!drivingLicenseTemplateId) {
            return;
        }

        const storedSession = getStoredDriverRegistrationSession();
        saveDriverRegistrationSession({
            ...storedSession,
            ...session,
            ...formData,
            rcVerificationDetails,
            rcVerificationMessage,
            dlVerificationMessage,
            drivingLicenseTemplateId,
            drivingLicenseDocumentKey,
            documents: dlVerificationDetails && drivingLicenseDocumentKey
                ? {
                    ...(storedSession.documents || {}),
                    [drivingLicenseDocumentKey]: dlVerificationDetails,
                }
                : (storedSession.documents || {}),
            documentMeta: {
                ...(storedSession.documentMeta || {}),
                [drivingLicenseTemplateId]: {
                    ...(storedSession.documentMeta?.[drivingLicenseTemplateId] || {}),
                    identifyNumber: String(dlMeta.identifyNumber || '').trim(),
                    birthDate: String(dlMeta.birthDate || '').trim(),
                    requestNumber: String(dlMeta.requestNumber || '').trim(),
                },
            },
        });
    }, [
        dlMeta,
        dlVerificationDetails,
        dlVerificationMessage,
        drivingLicenseDocumentKey,
        drivingLicenseTemplateId,
        formData,
        rcVerificationDetails,
        rcVerificationMessage,
        session,
    ]);

    const handleVerifyRc = async () => {
        if (isOwner || rcVerificationLoading) {
            return;
        }

        const normalizedRcNumber = normalizeVehicleNumber(formData.rcNumber);

        if (!normalizedRcNumber) {
            setFieldErrors((previous) => ({ ...previous, rcNumber: 'RC number is required' }));
            setRcVerificationError('');
            setRcVerificationMessage('');
            return;
        }

        if (!isValidIndianVehicleNumber(normalizedRcNumber)) {
            setFieldErrors((previous) => ({ ...previous, rcNumber: 'Invalid RC format - e.g. DL1RT1234 or MH12AB1234' }));
            setRcVerificationError('');
            setRcVerificationMessage('');
            return;
        }

        if (!registrationId || !phone) {
            setRcVerificationError('Registration session expired. Please restart onboarding.');
            setRcVerificationMessage('');
            return;
        }

        clearFieldError('rcNumber');
        setRcVerificationError('');
        setRcVerificationMessage('');

        try {
            setRcVerificationLoading(true);
            const response = await verifyDriverVehicleRc({
                registrationId,
                phone: session.phone,
                rcNumber: normalizedRcNumber,
            });

            const vehicle = response?.data?.data?.vehicle || response?.data?.vehicle || {};
            const verificationMessage = response?.data?.data?.message || response?.data?.message || 'RC verified successfully';

            setFormData((previous) => {
                const nextCustomFields = {
                    ...(previous.customFields || {}),
                };

                if (fuelTypeFieldKey) {
                    nextCustomFields[fuelTypeFieldKey] = applyAutofillCustomField(
                        previous.customFields?.[fuelTypeFieldKey],
                        fieldConfigMap[fuelTypeFieldKey],
                        vehicle.fuelType,
                    );
                }

                if (seatCapacityFieldKey) {
                    nextCustomFields[seatCapacityFieldKey] = applyAutofillCustomField(
                        previous.customFields?.[seatCapacityFieldKey],
                        fieldConfigMap[seatCapacityFieldKey],
                        vehicle.seatCapacity,
                    );
                }

                if (manufacturerFieldKey) {
                    nextCustomFields[manufacturerFieldKey] = applyAutofillCustomField(
                        previous.customFields?.[manufacturerFieldKey],
                        fieldConfigMap[manufacturerFieldKey],
                        vehicle.make,
                    );
                }

                return {
                    ...previous,
                    rcNumber: normalizedRcNumber,
                    make: vehicle.make || previous.make,
                    model: vehicle.model || previous.model,
                    year: vehicle.year || previous.year,
                    number: vehicle.number || previous.number,
                    color: vehicle.color || previous.color,
                    customFields: nextCustomFields,
                };
            });

            setFieldErrors((previous) => {
                const next = { ...previous };
                delete next.rcNumber;
                delete next.make;
                delete next.model;
                delete next.year;
                delete next.number;
                delete next.color;
                if (fuelTypeFieldKey) delete next[`custom_${fuelTypeFieldKey}`];
                if (seatCapacityFieldKey) delete next[`custom_${seatCapacityFieldKey}`];
                if (manufacturerFieldKey) delete next[`custom_${manufacturerFieldKey}`];
                return next;
            });

            lastVerifiedRcRef.current = normalizedRcNumber;
            setRcVerificationDetails(vehicle);
            setRcVerificationMessage(verificationMessage);
            setRcVerificationError('');
        } catch (err) {
            lastVerifiedRcRef.current = '';
            setRcVerificationDetails(null);
            setRcVerificationMessage('');
            setRcVerificationError(err?.message || 'Unable to verify RC number');
        } finally {
            setRcVerificationLoading(false);
        }
    };

    const handleVerifyDl = async () => {
        if (isOwner || dlVerificationLoading) {
            return;
        }

        if (!registrationId || !phone) {
            setDlVerificationError('Registration session expired. Please restart onboarding.');
            setDlVerificationMessage('');
            return;
        }

        const identifyNumber = String(dlMeta.identifyNumber || '').trim().toUpperCase();
        const birthDate = String(dlMeta.birthDate || '').trim();
        const requestNumber = String(dlMeta.requestNumber || '').trim();

        if (!identifyNumber) {
            setDlVerificationError('Driving license number is required');
            setDlVerificationMessage('');
            return;
        }

        if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
            setDlVerificationError('Birth date must use YYYY-MM-DD format');
            setDlVerificationMessage('');
            return;
        }

        setDlVerificationLoading(true);
        setDlVerificationError('');
        setDlVerificationMessage('');

        try {
            const response = await verifyDriverOnboardingLicenseDocument(drivingLicenseDocumentKey, {
                registrationId,
                phone: session.phone,
                licenseNumber: identifyNumber,
                birthDate,
                requestNumber,
            });

            const payload = response?.data?.data || response?.data || {};
            const verifiedDocument = normalizeOnboardingDocument(payload?.document);
            const nextRequestNumber = String(
                verifiedDocument?.requestNumber ||
                verifiedDocument?.request_no ||
                requestNumber,
            ).trim();
            const nextMessage = String(payload?.message || 'Driving license verified successfully').trim();

            setDlMeta({
                identifyNumber,
                birthDate,
                requestNumber: nextRequestNumber,
            });
            setDlVerificationDetails(verifiedDocument);
            setDlVerificationMessage(nextMessage);

            const storedSession = getStoredDriverRegistrationSession();
            saveDriverRegistrationSession({
                ...storedSession,
                ...session,
                ...formData,
                rcVerificationDetails,
                rcVerificationMessage,
                dlVerificationMessage: nextMessage,
                drivingLicenseTemplateId,
                drivingLicenseDocumentKey,
                documents: {
                    ...(storedSession.documents || {}),
                    [drivingLicenseDocumentKey]: verifiedDocument,
                },
                documentMeta: {
                    ...(storedSession.documentMeta || {}),
                    [drivingLicenseTemplateId]: {
                        ...(storedSession.documentMeta?.[drivingLicenseTemplateId] || {}),
                        identifyNumber,
                        birthDate,
                        requestNumber: nextRequestNumber,
                    },
                },
            });
        } catch (err) {
            setDlVerificationDetails(null);
            setDlVerificationMessage('');
            setDlVerificationError(err?.message || 'Unable to verify driving license');
        } finally {
            setDlVerificationLoading(false);
        }
    };

    const validateFields = () => {
        const errors = {};
        const currentYear = getCurrentVehicleYear();

        if (isFieldRequired('locationId', true) && !isFilled(formData.locationId)) {
            errors.locationId = 'Please select your operating city';
        }

        if (isOwner) {
            if (isFieldRequired('companyName', true) && !isFilled(formData.companyName)) {
                errors.companyName = 'Company name is required';
            }
            if (isFieldRequired('companyAddress', true) && !isFilled(formData.companyAddress)) {
                errors.companyAddress = 'Company address is required';
            }
            if (isFieldRequired('city', true) && !isFilled(formData.city)) {
                errors.city = 'City is required';
            }
            if (isFieldRequired('postalCode', true) && !isFilled(formData.postalCode)) {
                errors.postalCode = 'Postal code is required';
            } else if (isFilled(formData.postalCode) && !/^\d{6}$/.test(formData.postalCode)) {
                errors.postalCode = 'Must be a 6-digit number';
            }
            if (isFieldRequired('taxNumber', true) && !isFilled(formData.taxNumber)) {
                errors.taxNumber = 'GST/VAT number is required';
            }
        } else {
            if (isFieldRequired('vehicleTypeId', true) && !isFilled(formData.vehicleTypeId)) {
                errors.vehicleTypeId = 'Please select a vehicle type';
            }
            if (!isFilled(formData.rcNumber)) {
                errors.rcNumber = 'RC number is required';
            } else {
                const normalizedRcNumber = normalizeVehicleNumber(formData.rcNumber);
                if (!isValidIndianVehicleNumber(normalizedRcNumber)) {
                    errors.rcNumber = 'Invalid RC format - e.g. DL1RT1234 or MH12AB1234';
                }
            }
            if (!showRcAutofilledFields) {
                errors.rcNumber = errors.rcNumber || 'Verify the RC number to fetch vehicle details';
            }
            if (isFieldRequired('make', true) && !isFilled(formData.make)) {
                errors.make = 'Brand / make is required';
            }
            if (isFieldRequired('model', true) && !isFilled(formData.model)) {
                errors.model = 'Model is required';
            } else if (isFilled(formData.model) && /^\d+$/.test(String(formData.model).trim())) {
                errors.model = 'Model cannot be only numbers';
            }
            if (isFieldRequired('year', true) && !isFilled(formData.year)) {
                errors.year = 'Year is required';
            } else if (isFilled(formData.year)) {
                const vehicleYear = Number(formData.year);
                if (!/^\d{4}$/.test(formData.year) || vehicleYear < 1980 || vehicleYear > currentYear) {
                    errors.year = `Must be between 1980 and ${currentYear}`;
                }
            }
            if (isFieldRequired('number', true) && !isFilled(formData.number)) {
                errors.number = 'Plate number is required';
            } else if (isFilled(formData.number)) {
                const normalizedNum = normalizeVehicleNumber(formData.number);
                if (!isValidIndianVehicleNumber(normalizedNum)) {
                    errors.number = 'Invalid format â€” e.g. DL1RT1234 or MH12AB1234';
                }
            }
            if (isFieldRequired('color', true) && !isFilled(formData.color)) {
                errors.color = 'Exterior color is required';
            }
        }

        // Custom fields
        visibleCustomVehicleFields.forEach((field) => {
            if (field?.is_required !== false && !isFilled(formData.customFields?.[field.field_key])) {
                errors[`custom_${field.field_key}`] = `${field.name || 'This field'} is required`;
            }
        });

        return errors;
    };

    const handleContinue = async () => {
        setSubmitAttempted(true);
        const errors = validateFields();
        setFieldErrors(errors);

        if (Object.keys(errors).length > 0) {
            // Show first specific error message in the banner
            const firstError = Object.values(errors)[0];
            setError(firstError || (isOwner ? 'Please fill all required company information fields' : 'Please fill all required vehicle information fields'));
            return;
        }

        setLoading(true);
        setError('');
        setFieldErrors({});

        try {
            const normalizedRcNumber = normalizeVehicleNumber(formData.rcNumber);
            const normalizedNumber = normalizeVehicleNumber(formData.number);
            const selectedServiceLocation = locations.find(
                (item) => String(item._id || item.id) === String(formData.locationId)
            );

            const response = await saveDriverVehicle({
                registrationId: session.registrationId,
                phone: session.phone,
                registerFor: formData.registerFor,
                serviceCategories: formData.serviceCategories,
                locationId: formData.locationId,
                locationName: selectedServiceLocation?.name || selectedServiceLocation?.service_location_name || '',
                serviceLocation: selectedServiceLocation || null,
                vehicleTypeId: formData.vehicleTypeId,
                rcNumber: normalizedRcNumber,
                make: formData.make,
                model: formData.model,
                year: formData.year,
                number: normalizedNumber,
                color: formData.color,
                companyName: formData.companyName,
                companyAddress: formData.companyAddress,
                city: isOwner ? formData.city : selectedServiceLocation?.name || selectedServiceLocation?.service_location_name || formData.city,
                postalCode: formData.postalCode,
                taxNumber: formData.taxNumber,
                customFields: formData.customFields,
            });

            saveDriverRegistrationSession({
                ...session,
                ...formData,
                rcNumber: normalizedRcNumber,
                number: normalizedNumber,
                vehicleSession: response?.data?.session || null,
            });

            navigate(`${routePrefix}/step-documents`);
        } catch (err) {
            setError(err?.message || 'Unable to save vehicle details');
        } finally {
            setLoading(false);
        }
    };

    // Clear field error when user edits a field
    const clearFieldError = (key) => {
        if (fieldErrors[key]) {
            setFieldErrors((prev) => { const next = { ...prev }; delete next[key]; return next; });
        }
    };

    const locationField = getFieldConfig('locationId', { name: 'Operating City' });
    const vehicleTypeField = getFieldConfig('vehicleTypeId', { name: 'Vehicle Type', help_text: 'Select the type of vehicle you drive.' });
    const rcNumberField = getFieldConfig('rcNumber', { name: 'RC / Permit Number', placeholder: 'MP09AB1234', help_text: 'Enter RC number to fetch vehicle details automatically.' });
    const companyNameField = getFieldConfig('companyName', { name: 'Company Name', placeholder: 'Legal Company Name' });
    const companyAddressField = getFieldConfig('companyAddress', { name: 'Company Address', placeholder: 'Business Address' });
    const cityField = getFieldConfig('city', { name: 'City', placeholder: 'City' });
    const postalCodeField = getFieldConfig('postalCode', { name: 'Postal Code', placeholder: 'Pincode' });
    const taxNumberField = getFieldConfig('taxNumber', { name: 'Tax Number (GST/VAT)', placeholder: 'Tax Identification' });
    const makeField = getFieldConfig('make', { name: 'Brand / Make', placeholder: 'e.g. Maruti Suzuki' });
    const modelField = getFieldConfig('model', { name: 'Model', placeholder: 'Swift, Bolt' });
    const yearField = getFieldConfig('year', { name: 'Year', placeholder: String(getCurrentVehicleYear()) });
    const numberField = getFieldConfig('number', { name: 'Plate Number', placeholder: 'DL1RT1234' });
    const colorField = getFieldConfig('color', { name: 'Exterior Color', placeholder: 'e.g. White, Black' });
    const ownerHasVisibleFields = ['companyName', 'companyAddress', 'city', 'postalCode', 'taxNumber'].some((key) => shouldShowField(key, true));
    const driverHasTechnicalFields = ['rcNumber', 'make', 'model', 'year', 'number', 'color'].some((key) => shouldShowField(key, true));
    const canContinue = isOwner
        ? [
            !isFieldRequired('locationId', true) || isFilled(formData.locationId),
            !isFieldRequired('companyName', true) || isFilled(formData.companyName),
            !isFieldRequired('companyAddress', true) || isFilled(formData.companyAddress),
            !isFieldRequired('city', true) || isFilled(formData.city),
            !isFieldRequired('postalCode', true) || isFilled(formData.postalCode),
            !isFieldRequired('taxNumber', true) || isFilled(formData.taxNumber),
        ].every(Boolean)
        : [
            !isFieldRequired('locationId', true) || isFilled(formData.locationId),
            !isFieldRequired('vehicleTypeId', true) || isFilled(formData.vehicleTypeId),
            isFilled(formData.rcNumber),
            !isFieldRequired('make', true) || isFilled(formData.make),
            !isFieldRequired('model', true) || isFilled(formData.model),
            !isFieldRequired('year', true) || isFilled(formData.year),
            !isFieldRequired('number', true) || isFilled(formData.number),
            !isFieldRequired('color', true) || isFilled(formData.color),
        ].every(Boolean);
    const hasRequiredCustomFields = visibleCustomVehicleFields.every(
        (field) => field?.is_required === false || isFilled(formData.customFields?.[field.field_key]),
    );
    const rcVerificationDetailsList = getRcVerificationDetailsList(rcVerificationDetails || {});
    const dlVerificationDetailsList = getDrivingLicenseVerificationDetails(dlVerificationDetails || {});

    return (
        <div 
            className="min-h-screen bg-[linear-gradient(180deg,#f6efe4_0%,#fcfaf6_28%,#ffffff_100%)] px-5 pb-32 pt-8 select-none overflow-x-hidden"
            style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}
        >
            <main className="mx-auto max-w-sm space-y-6">
                <header className="space-y-6">
                    <div className="flex items-center justify-between">
                        <motion.button
                            whileTap={{ scale: 0.9 }}
                            onClick={handleBackNavigation}
                            className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white border border-slate-100 text-slate-900 shadow-sm transition-all"
                        >
                            <ArrowLeft size={18} strokeWidth={2.5} />
                        </motion.button>
                        <div className="rounded-full bg-slate-900/5 px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.15em] text-slate-500 border border-slate-900/5">
                            Step 3 of 4
                        </div>
                    </div>

                    <section className="space-y-3">
                        <div className="flex items-center gap-3">
                             <div className="flex h-11 w-11 items-center justify-center rounded-[1.25rem] bg-slate-900 text-white shadow-xl shadow-slate-900/10">
                                <Car size={22} strokeWidth={2.5} />
                            </div>
                            <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 opacity-60">
                                Vehicle Details
                            </span>
                        </div>
                        <h1 className="font-['Outfit'] text-[48px] font-black leading-[1] tracking-[-0.04em] text-slate-900">
                            {isOwner ? 'Fleet' : 'Vehicle'} <span className="text-slate-400">Setup</span>
                        </h1>
                        <p className="text-[15px] leading-relaxed text-slate-500 font-bold opacity-80 max-w-[28ch]">
                            {isOwner ? 'Setup your business profile to start managing your fleet.' : 'Tell us about the vehicle you\'ll be using for your services.'}
                        </p>
                    </section>
                </header>

                <div className="space-y-5">
                    <section className="space-y-5 rounded-[2.5rem] border border-slate-100 bg-white p-6 shadow-[0_10px_40px_rgba(0,0,0,0.04)]">
                        {shouldShowField('locationId', true) ? (
                        <div className={`group rounded-[1.8rem] border-2 transition-all p-4 focus-within:shadow-xl focus-within:shadow-slate-900/5 ${
                            fieldErrors.locationId
                                ? 'border-rose-200 bg-rose-50/30 focus-within:border-rose-300'
                                : 'border-slate-50 bg-slate-50 focus-within:border-slate-900/10 focus-within:bg-white'
                        }`}>
                            <div className="flex items-center gap-4">
                                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl shadow-sm transition-all ${
                                    fieldErrors.locationId ? 'bg-rose-100 text-rose-400' : 'bg-white text-slate-400 group-focus-within:bg-slate-900 group-focus-within:text-white'
                                }`}>
                                    <MapPin size={20} strokeWidth={2.5} />
                                </div>
                                <div className="min-w-0 flex-1 space-y-0.5 overflow-hidden">
                                    <label className={`block text-[10px] font-black uppercase tracking-[0.15em] opacity-70 ${
                                        fieldErrors.locationId ? 'text-rose-400' : 'text-slate-400'
                                    }`}>{locationField.name}</label>
                                    <select 
                                        value={formData.locationId}
                                        onChange={(e) => {
                                            clearFieldError('locationId');
                                            const nextLocationId = e.target.value;
                                            const selectedServiceLocation = locations.find(
                                                (item) => String(item._id || item.id) === String(nextLocationId),
                                            );

                                            setFormData((p) => ({
                                                ...p,
                                                locationId: nextLocationId,
                                                vehicleTypeId: '',
                                                ...(isOwner
                                                    ? {
                                                        companyAddress: p.companyAddress || String(selectedServiceLocation?.address || '').trim(),
                                                        city:
                                                            p.city ||
                                                            String(
                                                                selectedServiceLocation?.service_location_name ||
                                                                selectedServiceLocation?.name ||
                                                                '',
                                                            ).trim(),
                                                    }
                                                    : {}),
                                            }));
                                        }}
                                        disabled={locationsLoading || locations.length === 0}
                                        className="w-full bg-transparent border-none p-0 text-lg font-black text-slate-900 focus:outline-none focus:ring-0 appearance-none cursor-pointer disabled:opacity-50"
                                    >
                                        <option value="">{locationsLoading ? 'Loading...' : 'Select City'}</option>
                                        {locations.map(loc => (
                                            <option key={loc._id || loc.id} value={loc._id || loc.id}>
                                                {loc.service_location_name || loc.name}
                                            </option>
                                        ))}
                                    </select>
                                    {fieldErrors.locationId && (
                                        <p className="text-[10px] font-bold text-rose-500 pt-0.5">{fieldErrors.locationId}</p>
                                    )}
                                </div>
                            </div>
                        </div>
                        ) : null}

                        {isOwner ? (
                            <div className="space-y-3.5 animate-in fade-in slide-in-from-top-2 duration-300">
                                {ownerHasVisibleFields && shouldShowField('companyName', true) ? (
                                    <div className={`group rounded-[1.8rem] border-2 transition-all p-4 focus-within:shadow-xl focus-within:shadow-slate-900/5 ${
                                        fieldErrors.companyName ? 'border-rose-200 bg-rose-50/30' : 'border-slate-50 bg-slate-50 focus-within:border-slate-900/10 focus-within:bg-white'
                                    }`}>
                                        <label className={`block text-[10px] font-black uppercase tracking-[0.15em] opacity-70 px-1 mb-1 ${
                                            fieldErrors.companyName ? 'text-rose-400' : 'text-slate-400'
                                        }`}>{companyNameField.name}</label>
                                        <input 
                                            value={formData.companyName}
                                            onChange={(e) => { clearFieldError('companyName'); setFormData(p => ({ ...p, companyName: e.target.value })); }}
                                            placeholder={companyNameField.placeholder || 'Legal Company Name'}
                                            className="w-full bg-transparent border-none p-0 text-lg font-black text-slate-900 focus:outline-none focus:ring-0 placeholder:text-slate-200"
                                        />
                                        {fieldErrors.companyName && <p className="text-[10px] font-bold text-rose-500 pt-1 px-1">{fieldErrors.companyName}</p>}
                                    </div>
                                ) : null}

                                {shouldShowField('companyAddress', true) ? (
                                    <div className={`group rounded-[1.8rem] border-2 transition-all p-4 focus-within:shadow-xl focus-within:shadow-slate-900/5 ${
                                        fieldErrors.companyAddress ? 'border-rose-200 bg-rose-50/30' : 'border-slate-50 bg-slate-50 focus-within:border-slate-900/10 focus-within:bg-white'
                                    }`}>
                                        <label className={`block text-[10px] font-black uppercase tracking-[0.15em] opacity-70 px-1 mb-1 ${
                                            fieldErrors.companyAddress ? 'text-rose-400' : 'text-slate-400'
                                        }`}>{companyAddressField.name}</label>
                                        <input 
                                            value={formData.companyAddress}
                                            onChange={(e) => { clearFieldError('companyAddress'); setFormData(p => ({ ...p, companyAddress: e.target.value })); }}
                                            placeholder={companyAddressField.placeholder || 'Business Address'}
                                            className="w-full bg-transparent border-none p-0 text-lg font-black text-slate-900 focus:outline-none focus:ring-0 placeholder:text-slate-200"
                                        />
                                        {fieldErrors.companyAddress && <p className="text-[10px] font-bold text-rose-500 pt-1 px-1">{fieldErrors.companyAddress}</p>}
                                    </div>
                                ) : null}

                                <div className="grid grid-cols-2 gap-3">
                                    {shouldShowField('city', true) ? (
                                        <div className={`group rounded-[1.8rem] border-2 transition-all p-4 focus-within:shadow-xl focus-within:shadow-slate-900/5 ${
                                            fieldErrors.city ? 'border-rose-200 bg-rose-50/30' : 'border-slate-50 bg-slate-50 focus-within:border-slate-900/10 focus-within:bg-white'
                                        }`}>
                                            <label className={`block text-[10px] font-black uppercase tracking-[0.15em] opacity-70 px-1 mb-1 ${
                                                fieldErrors.city ? 'text-rose-400' : 'text-slate-400'
                                            }`}>{cityField.name}</label>
                                            <input 
                                                value={formData.city}
                                                onChange={(e) => { clearFieldError('city'); setFormData(p => ({ ...p, city: e.target.value })); }}
                                                placeholder={cityField.placeholder || 'City'}
                                                className="w-full bg-transparent border-none p-0 text-lg font-black text-slate-900 focus:outline-none focus:ring-0 placeholder:text-slate-200"
                                            />
                                            {fieldErrors.city && <p className="text-[10px] font-bold text-rose-500 pt-1">{fieldErrors.city}</p>}
                                        </div>
                                    ) : null}
                                    {shouldShowField('postalCode', true) ? (
                                        <div className={`group rounded-[1.8rem] border-2 transition-all p-4 focus-within:shadow-xl focus-within:shadow-slate-900/5 ${
                                            fieldErrors.postalCode ? 'border-rose-200 bg-rose-50/30' : 'border-slate-50 bg-slate-50 focus-within:border-slate-900/10 focus-within:bg-white'
                                        }`}>
                                            <label className={`block text-[10px] font-black uppercase tracking-[0.15em] opacity-70 px-1 mb-1 ${
                                                fieldErrors.postalCode ? 'text-rose-400' : 'text-slate-400'
                                            }`}>{postalCodeField.name}</label>
                                            <input 
                                                value={formData.postalCode}
                                                onChange={(e) => { clearFieldError('postalCode'); setFormData(p => ({ ...p, postalCode: normalizePostalCode(e.target.value) })); }}
                                                placeholder={postalCodeField.placeholder || 'Pincode'}
                                                inputMode="numeric"
                                                maxLength={6}
                                                className="w-full bg-transparent border-none p-0 text-lg font-black text-slate-900 focus:outline-none focus:ring-0 placeholder:text-slate-200"
                                            />
                                            {fieldErrors.postalCode && <p className="text-[10px] font-bold text-rose-500 pt-1">{fieldErrors.postalCode}</p>}
                                        </div>
                                    ) : null}
                                </div>

                                {shouldShowField('taxNumber', true) ? (
                                    <div className={`group rounded-[1.8rem] border-2 transition-all p-4 focus-within:shadow-xl focus-within:shadow-slate-900/5 ${
                                        fieldErrors.taxNumber ? 'border-rose-200 bg-rose-50/30' : 'border-slate-50 bg-slate-50 focus-within:border-slate-900/10 focus-within:bg-white'
                                    }`}>
                                        <label className={`block text-[10px] font-black uppercase tracking-[0.15em] opacity-70 px-1 mb-1 ${
                                            fieldErrors.taxNumber ? 'text-rose-400' : 'text-slate-400'
                                        }`}>{taxNumberField.name}</label>
                                        <input 
                                            value={formData.taxNumber}
                                            onChange={(e) => { clearFieldError('taxNumber'); setFormData(p => ({ ...p, taxNumber: e.target.value.toUpperCase() })); }}
                                            placeholder={taxNumberField.placeholder || 'Tax Identification'}
                                            className="w-full bg-transparent border-none p-0 text-lg font-black text-slate-900 focus:outline-none focus:ring-0 placeholder:text-slate-200 uppercase"
                                        />
                                        {fieldErrors.taxNumber && <p className="text-[10px] font-bold text-rose-500 pt-1 px-1">{fieldErrors.taxNumber}</p>}
                                    </div>
                                ) : null}

                                {/* Custom fields for fleet owners */}
                                {visibleCustomVehicleFields.length > 0 && (
                                    <div className="space-y-5 pt-1">
                                        <div className="space-y-1 px-1">
                                            <h2 className="text-lg font-black tracking-tight text-slate-900">Additional Details</h2>
                                            <p className="text-[12px] font-black text-slate-400 uppercase tracking-widest opacity-60">Required information</p>
                                        </div>
                                        <div className="grid grid-cols-1 gap-3">
                                            {visibleCustomVehicleFields.map((field) => {
                                                const fieldKey = String(field.field_key || '').trim();
                                                const fieldType = String(field.field_type || 'text').trim().toLowerCase();
                                                const value = formData.customFields?.[fieldKey] || (fieldType === 'multi_select' ? [] : '');
                                                const optionList = Array.isArray(field.options) ? field.options : [];
                                                const hasErr = Boolean(fieldErrors[`custom_${fieldKey}`]);

                                                if (fieldType === 'select') {
                                                    return (
                                                        <div key={fieldKey} className={`group rounded-[1.8rem] border-2 transition-all p-4 focus-within:shadow-xl focus-within:shadow-slate-900/5 ${hasErr ? 'border-rose-200 bg-rose-50/30' : 'border-slate-50 bg-slate-50 focus-within:border-slate-900/10 focus-within:bg-white'}`}>
                                                            <label className={`block text-[10px] font-black uppercase tracking-[0.15em] opacity-70 px-1 mb-1 ${hasErr ? 'text-rose-400' : 'text-slate-400'}`}>{field.name}</label>
                                                            <select value={value} onChange={(e) => { clearFieldError(`custom_${fieldKey}`); handleCustomFieldChange(fieldKey, e.target.value); }} className="w-full bg-transparent border-none p-0 text-lg font-black text-slate-900 focus:outline-none focus:ring-0 appearance-none">
                                                                <option value="">{field.placeholder || `Select ${field.name}`}</option>
                                                                {optionList.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                                                            </select>
                                                            {hasErr && <p className="text-[10px] font-bold text-rose-500 pt-1 px-1">{fieldErrors[`custom_${fieldKey}`]}</p>}
                                                        </div>
                                                    );
                                                }

                                                return (
                                                    <div key={fieldKey} className={`group rounded-[1.8rem] border-2 transition-all p-4 focus-within:shadow-xl focus-within:shadow-slate-900/5 ${hasErr ? 'border-rose-200 bg-rose-50/30' : 'border-slate-50 bg-slate-50 focus-within:border-slate-900/10 focus-within:bg-white'}`}>
                                                        <label className={`block text-[10px] font-black uppercase tracking-[0.15em] opacity-70 px-1 mb-1 ${hasErr ? 'text-rose-400' : 'text-slate-400'}`}>{field.name}</label>
                                                        <input
                                                            type={fieldType === 'number' ? 'tel' : 'text'}
                                                            value={value}
                                                            onChange={(e) => { clearFieldError(`custom_${fieldKey}`); handleCustomFieldChange(fieldKey, fieldType === 'number' ? e.target.value.replace(/\D/g, '') : e.target.value); }}
                                                            placeholder={field.placeholder || ''}
                                                            className="w-full bg-transparent border-none p-0 text-lg font-black text-slate-900 focus:outline-none focus:ring-0 placeholder:text-slate-200"
                                                        />
                                                        {hasErr && <p className="text-[10px] font-bold text-rose-500 pt-1 px-1">{fieldErrors[`custom_${fieldKey}`]}</p>}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-5 animate-in fade-in slide-in-from-top-4 duration-500">
                                {shouldShowField('vehicleTypeId', true) && (
                                    <div className="space-y-4 pt-1">
                                         <div className="space-y-1 px-1">
                                            <h2 className={`text-base font-semibold tracking-[-0.03em] ${ fieldErrors.vehicleTypeId ? 'text-rose-600' : 'text-slate-950' }`}>{vehicleTypeField.name}</h2>
                                            <p className="text-sm text-slate-500">
                                                {formData.locationId
                                                    ? (vehicleTypeField.help_text || 'Select the type of vehicle you drive.')
                                                    : 'Select a vehicle type now. Choosing your city later will refine availability if needed.'}
                                            </p>
                                        </div>
                                         <div className="grid grid-cols-2 gap-3">
                                             {vehicleTypesLoading ? (
                                                 Array.from({ length: 4 }).map((_, i) => (
                                                     <div key={i} className="h-32 bg-slate-50/50 rounded-2xl animate-pulse" />
                                                 ))
                                             ) : (
                                                 vehicleTypes.map((type) => (
                                                     <button
                                                         key={type._id || type.id}
                                                         type="button"
                                                         onClick={() => { clearFieldError('vehicleTypeId'); setFormData(p => ({ ...p, vehicleTypeId: type._id || type.id })); }}
                                                         className={`relative h-32 rounded-3xl border transition-all flex flex-col group overflow-hidden cursor-pointer touch-manipulation text-left ${
                                                             formData.vehicleTypeId === (type._id || type.id)
                                                             ? 'border-slate-900 bg-slate-900/[0.02] ring-1 ring-slate-900/5' 
                                                             : fieldErrors.vehicleTypeId
                                                                 ? 'border-rose-200 bg-rose-50/20 hover:border-rose-300'
                                                                 : 'border-slate-100 bg-[#FCFCFB] hover:border-slate-200'
                                                         }`}
                                                     >
                                                         <div className="flex-1 flex items-center justify-center p-3">
                                                            {type.image || type.icon || type.map_icon ? (
                                                                <img 
                                                                    src={type.image || type.icon || type.map_icon} 
                                                                    alt={type.name} 
                                                                    className="max-h-14 w-auto object-contain transition-transform duration-500"
                                                                />
                                                            ) : (
                                                                <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300">
                                                                    <Car size={24} />
                                                                </div>
                                                            )}
                                                         </div>
                                                         <div className={`p-2.5 text-center transition-colors ${
                                                             formData.vehicleTypeId === (type._id || type.id) ? 'bg-slate-900 text-white font-bold' : 'bg-white/50 text-slate-700 font-semibold'
                                                         }`}>
                                                             <span className="text-[11px] tracking-tight uppercase">{type.name || type.vehicle_type_name}</span>
                                                         </div>
                                                     </button>
                                                 ))
                                             )}
                                         </div>
                                         {fieldErrors.vehicleTypeId && (
                                             <p className="text-[11px] font-bold text-rose-500 px-1">{fieldErrors.vehicleTypeId}</p>
                                         )}
                                    </div>
                                )}

                                {driverHasTechnicalFields ? (
                                <div className="space-y-5 pt-1">
                                    <div className="space-y-1 px-1">
                                        <h2 className="text-lg font-black tracking-tight text-slate-900">Technical Specs</h2>
                                        <p className="text-[12px] font-black text-slate-400 uppercase tracking-widest opacity-60">Verified from RC/Permit</p>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        {shouldShowField('rcNumber', true) ? (
                                        <div className={`group rounded-[1.8rem] border-2 transition-all p-4 focus-within:shadow-xl focus-within:shadow-slate-900/5 col-span-2 ${
                                            fieldErrors.rcNumber ? 'border-rose-200 bg-rose-50/30' : 'border-slate-50 bg-slate-50 focus-within:border-slate-900/10 focus-within:bg-white'
                                        }`}>
                                            <label className={`block text-[10px] font-black uppercase tracking-[0.15em] opacity-70 px-1 mb-1 ${ fieldErrors.rcNumber ? 'text-rose-400' : 'text-slate-400' }`}>{rcNumberField.name}</label>
                                            <input
                                                value={formData.rcNumber}
                                                onChange={(e) => {
                                                    clearFieldError('rcNumber');
                                                    lastVerifiedRcRef.current = '';
                                                    setRcVerificationDetails(null);
                                                    setRcVerificationMessage('');
                                                    setRcVerificationError('');
                                                    setFormData((p) => ({ ...p, rcNumber: normalizeVehicleNumber(e.target.value) }));
                                                }}
                                                placeholder={rcNumberField.placeholder || 'MP09AB1234'}
                                                className="w-full bg-transparent border-none p-0 text-[16px] font-semibold text-slate-950 focus:outline-none focus:ring-0 placeholder:text-slate-300 uppercase tracking-widest"
                                            />
                                            <div className="mt-3 flex justify-end">
                                                <button
                                                    type="button"
                                                    onClick={handleVerifyRc}
                                                    disabled={rcVerificationLoading}
                                                    className={`rounded-full px-4 py-2 text-[11px] font-black uppercase tracking-[0.15em] transition-colors ${
                                                        rcVerificationLoading
                                                            ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                                                            : 'bg-slate-900 text-white hover:bg-black'
                                                    }`}
                                                >
                                                    {rcVerificationLoading ? 'Verifying...' : 'Verify RC'}
                                                </button>
                                            </div>
                                            {fieldErrors.rcNumber ? <p className="text-[10px] font-bold text-rose-500 pt-1 px-1">{fieldErrors.rcNumber}</p> : null}
                                            {!fieldErrors.rcNumber && !isOwner && rcVerificationLoading ? (
                                                <p className="text-[10px] font-bold text-sky-600 pt-1 px-1">Verifying RC and fetching vehicle details...</p>
                                            ) : null}
                                            {!fieldErrors.rcNumber && !isOwner && !rcVerificationLoading && rcVerificationMessage ? (
                                                <p className="text-[10px] font-bold text-emerald-600 pt-1 px-1">{rcVerificationMessage}</p>
                                            ) : null}
                                            {!fieldErrors.rcNumber && !isOwner && !rcVerificationLoading && rcVerificationError ? (
                                                <p className="text-[10px] font-bold text-amber-600 pt-1 px-1">{rcVerificationError}</p>
                                            ) : null}
                                        </div>
                                        ) : null}

                                        {rcVerificationDetailsList.length > 0 ? (
                                        <div className="col-span-2 rounded-[1.8rem] border border-emerald-100 bg-emerald-50/50 p-4">
                                            <div className="flex items-center gap-2 px-1">
                                                <ShieldCheck size={15} className="text-emerald-600" />
                                                <p className="text-[10px] font-black uppercase tracking-[0.15em] text-emerald-700">
                                                    Verified RC Details
                                                </p>
                                            </div>
                                            <p className="mt-1 px-1 text-[11px] font-semibold text-emerald-800/70">
                                                RC details only, including permit, insurance, fitness and PUC info when available.
                                            </p>
                                            <div className="mt-3 grid grid-cols-2 gap-3">
                                                {rcVerificationDetailsList.map((item) => (
                                                    <div key={item.key} className="rounded-2xl bg-white/90 px-3 py-2">
                                                        <p className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-400">{item.label}</p>
                                                        <p className="mt-1 text-[12px] font-bold text-slate-900 break-words">{item.value}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        ) : null}

                                        {showRcAutofilledFields && shouldShowField('make', true) ? (
                                        <div className={`group rounded-[1.8rem] border-2 transition-all p-4 focus-within:shadow-xl focus-within:shadow-slate-900/5 col-span-2 ${
                                            fieldErrors.make ? 'border-rose-200 bg-rose-50/30' : 'border-slate-50 bg-slate-50 focus-within:border-slate-900/10 focus-within:bg-white'
                                        }`}>
                                            <label className={`block text-[10px] font-black uppercase tracking-[0.15em] opacity-70 px-1 mb-1 ${ fieldErrors.make ? 'text-rose-400' : 'text-slate-400' }`}>{makeField.name}</label>
                                            <input 
                                                value={formData.make}
                                                onChange={(e) => { clearFieldError('make'); setFormData(p => ({ ...p, make: e.target.value })); }}
                                                placeholder={makeField.placeholder || 'e.g. Maruti Suzuki'}
                                                className="w-full bg-transparent border-none p-0 text-lg font-black text-slate-900 focus:outline-none focus:ring-0 placeholder:text-slate-200"
                                            />
                                            {fieldErrors.make && <p className="text-[10px] font-bold text-rose-500 pt-1 px-1">{fieldErrors.make}</p>}
                                        </div>
                                        ) : null}

                                        {showRcAutofilledFields && shouldShowField('model', true) ? (
                                        <div className={`group rounded-[1.8rem] border-2 transition-all p-4 focus-within:shadow-xl focus-within:shadow-slate-900/5 ${
                                            fieldErrors.model ? 'border-rose-200 bg-rose-50/30' : 'border-slate-50 bg-slate-50 focus-within:border-slate-900/10 focus-within:bg-white'
                                        }`}>
                                            <label className={`block text-[10px] font-black uppercase tracking-[0.15em] opacity-70 px-1 mb-1 ${ fieldErrors.model ? 'text-rose-400' : 'text-slate-400' }`}>{modelField.name}</label>
                                            <input 
                                                value={formData.model}
                                                onChange={(e) => { clearFieldError('model'); setFormData(p => ({ ...p, model: e.target.value })); }}
                                                placeholder={modelField.placeholder || 'Swift, Bolt'}
                                                className="w-full bg-transparent border-none p-0 text-lg font-black text-slate-900 focus:outline-none focus:ring-0 placeholder:text-slate-200"
                                            />
                                            {fieldErrors.model && <p className="text-[10px] font-bold text-rose-500 pt-1 px-1">{fieldErrors.model}</p>}
                                        </div>
                                        ) : null}

                                        {showRcAutofilledFields && shouldShowField('year', true) ? (
                                        <div className={`group rounded-[1.8rem] border-2 transition-all p-4 focus-within:shadow-xl focus-within:shadow-slate-900/5 ${
                                            fieldErrors.year ? 'border-rose-200 bg-rose-50/30' : 'border-slate-50 bg-slate-50 focus-within:border-slate-900/10 focus-within:bg-white'
                                        }`}>
                                            <label className={`block text-[10px] font-black uppercase tracking-[0.15em] opacity-70 px-1 mb-1 ${ fieldErrors.year ? 'text-rose-400' : 'text-slate-400' }`}>{yearField.name}</label>
                                            <input 
                                                type="tel"
                                                maxLength={4}
                                                value={formData.year}
                                                onChange={(e) => { clearFieldError('year'); setFormData(p => ({ ...p, year: e.target.value.replace(/\D/g, '') })); }}
                                                placeholder={yearField.placeholder || String(getCurrentVehicleYear())}
                                                className="w-full bg-transparent border-none p-0 text-lg font-black text-slate-900 focus:outline-none focus:ring-0 placeholder:text-slate-200"
                                            />
                                            {fieldErrors.year && <p className="text-[10px] font-bold text-rose-500 pt-1 px-1">{fieldErrors.year}</p>}
                                        </div>
                                        ) : null}

                                        {showRcAutofilledFields && shouldShowField('number', true) ? (
                                        <div className={`group rounded-[1.8rem] border-2 transition-all p-4 focus-within:shadow-xl focus-within:shadow-slate-900/5 col-span-2 ${
                                            fieldErrors.number ? 'border-rose-200 bg-rose-50/30' : 'border-slate-50 bg-slate-50 focus-within:border-slate-900/10 focus-within:bg-white'
                                        }`}>
                                            <label className={`block text-[10px] font-black uppercase tracking-[0.15em] opacity-70 px-1 mb-1 ${ fieldErrors.number ? 'text-rose-400' : 'text-slate-400' }`}>{numberField.name}</label>
                                            <input 
                                                value={formData.number}
                                                onChange={(e) => { clearFieldError('number'); setFormData(p => ({ ...p, number: normalizeVehicleNumber(e.target.value) })); }}
                                                placeholder={numberField.placeholder || 'DL1RT1234'}
                                                className="w-full bg-transparent border-none p-0 text-[16px] font-semibold text-slate-950 focus:outline-none focus:ring-0 placeholder:text-slate-300 uppercase tracking-widest"
                                            />
                                            {fieldErrors.number && <p className="text-[10px] font-bold text-rose-500 pt-1 px-1">{fieldErrors.number}</p>}
                                        </div>
                                        ) : null}

                                        {showRcAutofilledFields && shouldShowField('color', true) ? (
                                        <div className={`group rounded-[1.8rem] border-2 transition-all p-4 focus-within:shadow-xl focus-within:shadow-slate-900/5 col-span-2 ${
                                            fieldErrors.color ? 'border-rose-200 bg-rose-50/30' : 'border-slate-50 bg-slate-50 focus-within:border-slate-900/10 focus-within:bg-white'
                                        }`}>
                                            <label className={`block text-[10px] font-black uppercase tracking-[0.15em] opacity-70 px-1 mb-1 ${ fieldErrors.color ? 'text-rose-400' : 'text-slate-400' }`}>{colorField.name}</label>
                                            <input 
                                                value={formData.color}
                                                onChange={(e) => { clearFieldError('color'); setFormData(p => ({ ...p, color: e.target.value })); }}
                                                placeholder={colorField.placeholder || 'e.g. White, Black'}
                                                className="w-full bg-transparent border-none p-0 text-lg font-black text-slate-900 focus:outline-none focus:ring-0 placeholder:text-slate-200"
                                            />
                                            {fieldErrors.color && <p className="text-[10px] font-bold text-rose-500 pt-1 px-1">{fieldErrors.color}</p>}
                                        </div>
                                        ) : null}
                                    </div>
                                </div>
                                ) : null}

                                {!isOwner ? (
                                <div className="space-y-5 pt-1">
                                    <div className="space-y-1 px-1">
                                        <h2 className="text-lg font-black tracking-tight text-slate-900">Driving License</h2>
                                        <p className="text-[12px] font-black text-slate-400 uppercase tracking-widest opacity-60">Separate DL verification</p>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="group rounded-[1.8rem] border-2 transition-all p-4 border-slate-50 bg-slate-50 focus-within:border-slate-900/10 focus-within:bg-white focus-within:shadow-xl focus-within:shadow-slate-900/5 col-span-2">
                                            <label className="block text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 opacity-70 px-1 mb-1">License Number</label>
                                            <input
                                                value={dlMeta.identifyNumber}
                                                onChange={(e) => {
                                                    setDlVerificationDetails(null);
                                                    setDlVerificationMessage('');
                                                    setDlVerificationError('');
                                                    setDlMeta((prev) => ({ ...prev, identifyNumber: e.target.value.toUpperCase() }));
                                                }}
                                                placeholder="Enter DL number"
                                                className="w-full bg-transparent border-none p-0 text-[16px] font-semibold text-slate-950 focus:outline-none focus:ring-0 placeholder:text-slate-300 uppercase tracking-wide"
                                            />
                                        </div>

                                        <div className="group rounded-[1.8rem] border-2 transition-all p-4 border-slate-50 bg-slate-50 focus-within:border-slate-900/10 focus-within:bg-white focus-within:shadow-xl focus-within:shadow-slate-900/5">
                                            <label className="block text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 opacity-70 px-1 mb-1">Birth Date</label>
                                            <input
                                                type="date"
                                                value={dlMeta.birthDate}
                                                onChange={(e) => {
                                                    setDlVerificationDetails(null);
                                                    setDlVerificationMessage('');
                                                    setDlVerificationError('');
                                                    setDlMeta((prev) => ({ ...prev, birthDate: e.target.value }));
                                                }}
                                                className="w-full bg-transparent border-none p-0 text-[16px] font-semibold text-slate-950 focus:outline-none focus:ring-0"
                                            />
                                        </div>

                                        <div className="group rounded-[1.8rem] border-2 transition-all p-4 border-slate-50 bg-slate-50 focus-within:border-slate-900/10 focus-within:bg-white focus-within:shadow-xl focus-within:shadow-slate-900/5">
                                            <label className="block text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 opacity-70 px-1 mb-1">Request Number</label>
                                            <input
                                                value={dlMeta.requestNumber}
                                                onChange={(e) => {
                                                    setDlVerificationDetails(null);
                                                    setDlVerificationMessage('');
                                                    setDlVerificationError('');
                                                    setDlMeta((prev) => ({ ...prev, requestNumber: e.target.value }));
                                                }}
                                                placeholder="Optional"
                                                className="w-full bg-transparent border-none p-0 text-[16px] font-semibold text-slate-950 focus:outline-none focus:ring-0 placeholder:text-slate-300"
                                            />
                                        </div>

                                        <div className="col-span-2 flex justify-end">
                                            <button
                                                type="button"
                                                onClick={handleVerifyDl}
                                                disabled={dlVerificationLoading}
                                                className={`rounded-full px-4 py-2 text-[11px] font-black uppercase tracking-[0.15em] transition-colors ${
                                                    dlVerificationLoading
                                                        ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                                                        : 'bg-slate-900 text-white hover:bg-black'
                                                }`}
                                            >
                                                {dlVerificationLoading ? 'Verifying...' : 'Verify DL'}
                                            </button>
                                        </div>

                                        {dlVerificationMessage ? (
                                            <p className="col-span-2 text-[10px] font-bold text-emerald-600 px-1">{dlVerificationMessage}</p>
                                        ) : null}
                                        {dlVerificationError ? (
                                            <p className="col-span-2 text-[10px] font-bold text-amber-600 px-1">{dlVerificationError}</p>
                                        ) : null}

                                        {dlVerificationDetailsList.length > 0 ? (
                                        <div className="col-span-2 rounded-[1.8rem] border border-emerald-100 bg-emerald-50/50 p-4">
                                            <div className="flex items-center gap-2 px-1">
                                                <ShieldCheck size={15} className="text-emerald-600" />
                                                <p className="text-[10px] font-black uppercase tracking-[0.15em] text-emerald-700">
                                                    Verified From DL
                                                </p>
                                            </div>
                                            <p className="mt-1 px-1 text-[11px] font-semibold text-emerald-800/70">
                                                DL details only, kept separate from RC verification.
                                            </p>
                                            <div className="mt-3 grid grid-cols-2 gap-3">
                                                {dlVerificationDetailsList.map((item) => (
                                                    <div key={item.key} className="rounded-2xl bg-white/90 px-3 py-2">
                                                        <p className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-400">{item.label}</p>
                                                        <p className="mt-1 text-[12px] font-bold text-slate-900 break-words">{item.value}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        ) : null}
                                    </div>
                                </div>
                                ) : null}

                                {visibleCustomVehicleFields.length > 0 && showRcAutofilledFields ? (
                                    <div className="space-y-5 pt-1">
                                        <div className="space-y-1 px-1">
                                            <h2 className="text-lg font-black tracking-tight text-slate-900">Additional Details</h2>
                                            <p className="text-[12px] font-black text-slate-400 uppercase tracking-widest opacity-60">
                                                Configured from admin
                                            </p>
                                        </div>

                                        <div className="grid grid-cols-1 gap-3">
                                            {visibleCustomVehicleFields.map((field) => {
                                                const fieldKey = String(field.field_key || '').trim();
                                                const fieldType = String(field.field_type || 'text').trim().toLowerCase();
                                                const value = formData.customFields?.[fieldKey] || (fieldType === 'multi_select' ? [] : '');
                                                const optionList = Array.isArray(field.options) ? field.options : [];

                                                if (fieldType === 'textarea') {
                                                    return (
                                                        <div key={fieldKey} className="group rounded-[1.8rem] border-2 transition-all p-4 border-slate-50 bg-slate-50 focus-within:border-slate-900/10 focus-within:bg-white focus-within:shadow-xl focus-within:shadow-slate-900/5">
                                                            <label className="block text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 opacity-70 px-1 mb-1">{field.name}</label>
                                                            <textarea
                                                                value={value}
                                                                onChange={(event) => handleCustomFieldChange(fieldKey, event.target.value)}
                                                                placeholder={field.placeholder || ''}
                                                                rows={3}
                                                                className="w-full resize-none bg-transparent border-none p-0 text-lg font-black text-slate-900 focus:outline-none focus:ring-0 placeholder:text-slate-200"
                                                            />
                                                            {field.help_text ? <p className="mt-2 text-xs text-slate-400">{field.help_text}</p> : null}
                                                        </div>
                                                    );
                                                }

                                                if (fieldType === 'select') {
                                                    return (
                                                        <div key={fieldKey} className="group rounded-[1.8rem] border-2 transition-all p-4 border-slate-50 bg-slate-50 focus-within:border-slate-900/10 focus-within:bg-white focus-within:shadow-xl focus-within:shadow-slate-900/5">
                                                            <label className="block text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 opacity-70 px-1 mb-1">{field.name}</label>
                                                            <select
                                                                value={value}
                                                                onChange={(event) => handleCustomFieldChange(fieldKey, event.target.value)}
                                                                className="w-full bg-transparent border-none p-0 text-lg font-black text-slate-900 focus:outline-none focus:ring-0 appearance-none"
                                                            >
                                                                <option value="">{field.placeholder || `Select ${field.name}`}</option>
                                                                {optionList.map((option) => (
                                                                    <option key={option} value={option}>{option}</option>
                                                                ))}
                                                            </select>
                                                            {field.help_text ? <p className="mt-2 text-xs text-slate-400">{field.help_text}</p> : null}
                                                        </div>
                                                    );
                                                }

                                                if (fieldType === 'multi_select') {
                                                    const selectedValues = Array.isArray(value) ? value : [];
                                                    return (
                                                        <div key={fieldKey} className="space-y-3 rounded-[1.8rem] border-2 border-slate-50 bg-slate-50 p-4">
                                                            <div>
                                                                <label className="block text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 opacity-70 px-1 mb-1">{field.name}</label>
                                                                {field.help_text ? <p className="text-xs text-slate-400 px-1">{field.help_text}</p> : null}
                                                            </div>
                                                            <div className="flex flex-wrap gap-2">
                                                                {optionList.map((option) => {
                                                                    const selected = selectedValues.includes(option);
                                                                    return (
                                                                        <button
                                                                            key={option}
                                                                            type="button"
                                                                            onClick={() => {
                                                                                const nextValues = selected
                                                                                    ? selectedValues.filter((item) => item !== option)
                                                                                    : [...selectedValues, option];
                                                                                handleCustomFieldChange(fieldKey, nextValues);
                                                                            }}
                                                                            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                                                                                selected
                                                                                    ? 'bg-slate-900 text-white'
                                                                                    : 'bg-white text-slate-700 border border-slate-200'
                                                                            }`}
                                                                        >
                                                                            {option}
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    );
                                                }

                                                return (
                                                    <div key={fieldKey} className="group rounded-[1.8rem] border-2 transition-all p-4 border-slate-50 bg-slate-50 focus-within:border-slate-900/10 focus-within:bg-white focus-within:shadow-xl focus-within:shadow-slate-900/5">
                                                        <label className="block text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 opacity-70 px-1 mb-1">{field.name}</label>
                                                        <input
                                                            type={fieldType === 'number' ? 'tel' : 'text'}
                                                            value={value}
                                                            onChange={(event) => handleCustomFieldChange(
                                                                fieldKey,
                                                                fieldType === 'number'
                                                                    ? event.target.value.replace(/\D/g, '')
                                                                    : event.target.value,
                                                            )}
                                                            placeholder={field.placeholder || ''}
                                                            className="w-full bg-transparent border-none p-0 text-lg font-black text-slate-900 focus:outline-none focus:ring-0 placeholder:text-slate-200"
                                                        />
                                                        {field.help_text ? <p className="mt-2 text-xs text-slate-400">{field.help_text}</p> : null}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        )}
                    </section>
                </div>

                <div className="bg-blue-50/50 p-4 rounded-3xl flex gap-3 mt-4 border border-blue-100">
                    <Info size={18} className="text-blue-500 shrink-0" />
                    <p className="text-xs font-medium text-slate-600 leading-relaxed">
                        Your vehicle information will be visible to passengers for safety and identification.
                    </p>
                </div>

                {error && (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 shadow-[0_10px_30px_rgba(244,63,94,0.08)]">
                        {error}
                    </div>
                )}

                <div className="fixed bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent">
                    <div className="mx-auto max-w-sm">
                        <motion.button
                            whileHover={!loading ? { scale: 1.02, y: -2 } : {}}
                            whileTap={!loading ? { scale: 0.98 } : {}}
                            onClick={handleContinue}
                            disabled={loading}
                            className={`group flex h-16 w-full items-center justify-center gap-3 rounded-[1.8rem] text-[15px] font-black tracking-tight transition-all relative overflow-hidden ${
                                loading
                                    ? 'bg-slate-700 text-white/70 cursor-not-allowed'
                                    : 'bg-slate-900 text-white shadow-[0_20px_40px_rgba(0,0,0,0.2)] active:bg-black cursor-pointer'
                            }`}
                        >
                            {loading ? (
                                <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <>
                                    <span className="relative z-10 uppercase tracking-widest">Save &amp; Continue</span>
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

export default StepVehicle;
