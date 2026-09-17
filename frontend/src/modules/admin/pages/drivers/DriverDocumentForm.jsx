import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { adminService } from '../../services/adminService';

const inputClass =
  'w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-800 bg-white focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 outline-none transition-colors';
const labelClass = 'block text-xs font-semibold text-gray-500 mb-1.5';
const selectPlaceholderClass = 'text-gray-400';
const customVehicleFieldSentinel = '__custom__';

const initialDocumentForm = {
  name: '',
  account_type: '',
  has_expiry_date: '',
  image_type: '',
  has_identify_number: '',
  identify_number_key: '',
  verification_type: 'none',
  is_editable: false,
  is_required: false,
  active: true,
};

const initialVehicleFieldForm = {
  name: '',
  account_type: '',
  field_key: customVehicleFieldSentinel,
  custom_field_key: '',
  field_type: 'text',
  field_group: 'custom',
  placeholder: '',
  help_text: '',
  sort_order: 1,
  options_text: '',
  is_editable: true,
  is_required: true,
  active: true,
};

const accountTypeOptions = [
  { value: 'individual', label: 'Individual' },
  { value: 'fleet_drivers', label: 'Fleet Drivers' },
  { value: 'both', label: 'Both' },
];

const yesNoOptions = [
  { value: '0', label: 'No' },
  { value: '1', label: 'Yes' },
];

const imageTypeOptions = [
  { value: 'front_back', label: 'Front & Back' },
  { value: 'image', label: 'Single Image' },
  { value: 'front', label: 'Front Only' },
  { value: 'back', label: 'Back Only' },
];

const verificationTypeOptions = [
  { value: 'none', label: 'General Document (No API)' },
  { value: 'driving_license', label: 'Driving License Verification' },
  { value: 'pan', label: 'PAN Verification' },
  { value: 'gstin', label: 'GSTIN Verification' },
  { value: 'rc', label: 'RC Verification' },
  { value: 'bank_account', label: 'Bank Account Verification' },
];

const documentVerificationPresets = {
  driving_license: {
    name: 'Driving License',
    image_type: 'image',
    has_expiry_date: '1',
    has_identify_number: '1',
    identify_number_key: 'license_no',
  },
  pan: {
    name: 'PAN Card',
    image_type: 'image',
    has_expiry_date: '0',
    has_identify_number: '1',
    identify_number_key: 'pan_no',
  },
  gstin: {
    name: 'GST Certificate',
    image_type: 'image',
    has_expiry_date: '0',
    has_identify_number: '1',
    identify_number_key: 'gstin',
  },
  rc: {
    name: 'Vehicle RC',
    image_type: 'image',
    has_expiry_date: '0',
    has_identify_number: '1',
    identify_number_key: 'rc_no',
  },
  bank_account: {
    name: 'Bank Proof',
    image_type: 'image',
    has_expiry_date: '0',
    has_identify_number: '1',
    identify_number_key: 'bank_account',
  },
};

const vehicleFieldOptions = [
  { value: 'locationId', label: 'Operating City', field_type: 'location_select', field_group: 'common', placeholder: '', account_type: 'both' },
  { value: 'serviceCategories', label: 'Service Category', field_type: 'multi_select', field_group: 'driver', placeholder: '', account_type: 'individual', options: ['taxi', 'outstation', 'delivery', 'pooling'] },
  { value: 'vehicleTypeId', label: 'Vehicle Type', field_type: 'vehicle_type_select', field_group: 'driver', placeholder: '', account_type: 'individual' },
  { value: 'make', label: 'Brand / Make', field_type: 'text', field_group: 'driver', placeholder: 'e.g. Maruti Suzuki', account_type: 'individual' },
  { value: 'model', label: 'Model', field_type: 'text', field_group: 'driver', placeholder: 'Swift, Bolt', account_type: 'individual' },
  { value: 'year', label: 'Year', field_type: 'number', field_group: 'driver', placeholder: 'e.g. 2024', account_type: 'individual' },
  { value: 'number', label: 'Plate Number', field_type: 'text', field_group: 'driver', placeholder: 'DL1RT1234', account_type: 'individual' },
  { value: 'color', label: 'Exterior Color', field_type: 'text', field_group: 'driver', placeholder: 'e.g. White, Black', account_type: 'individual' },
  { value: 'companyName', label: 'Company Name', field_type: 'text', field_group: 'owner', placeholder: 'Legal Company Name', account_type: 'fleet_drivers' },
  { value: 'companyAddress', label: 'Company Address', field_type: 'text', field_group: 'owner', placeholder: 'Business Address', account_type: 'fleet_drivers' },
  { value: 'city', label: 'City', field_type: 'text', field_group: 'owner', placeholder: 'City', account_type: 'fleet_drivers' },
  { value: 'postalCode', label: 'Postal Code', field_type: 'number', field_group: 'owner', placeholder: 'Pincode', account_type: 'fleet_drivers' },
  { value: 'taxNumber', label: 'Tax Number (GST/VAT)', field_type: 'text', field_group: 'owner', placeholder: 'Tax Identification', account_type: 'fleet_drivers' },
];

const vehicleFieldTypeOptions = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'textarea', label: 'Textarea' },
  { value: 'select', label: 'Select' },
  { value: 'multi_select', label: 'Multi Select' },
  { value: 'location_select', label: 'Location Select' },
  { value: 'vehicle_type_select', label: 'Vehicle Type Select' },
];

const getOptionLabel = (options, value, fallback = 'Not selected') =>
  options.find((option) => option.value === value)?.label || fallback;

const normalizeBooleanLike = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return Boolean(value);
};

const fromDocumentResponse = (payload = {}) => ({
  name: payload.name || '',
  account_type: payload.account_type || '',
  has_expiry_date:
    payload.has_expiry_date === true ? '1' : payload.has_expiry_date === false ? '0' : '',
  image_type: payload.image_type || '',
  has_identify_number:
    payload.has_identify_number === true ? '1' : payload.has_identify_number === false ? '0' : '',
  identify_number_key: payload.identify_number_key || '',
  verification_type: payload.verification_type || 'none',
  is_editable: normalizeBooleanLike(payload.is_editable, false),
  is_required: normalizeBooleanLike(payload.is_required, false),
  active: normalizeBooleanLike(payload.active, true),
});

const fromVehicleFieldResponse = (payload = {}) => ({
  name: payload.name || '',
  account_type: payload.account_type || '',
  field_key: vehicleFieldOptions.some((option) => option.value === payload.field_key) ? payload.field_key || '' : customVehicleFieldSentinel,
  custom_field_key: vehicleFieldOptions.some((option) => option.value === payload.field_key) ? '' : payload.field_key || '',
  field_type: payload.field_type || '',
  field_group: payload.field_group || '',
  placeholder: payload.placeholder || '',
  help_text: payload.help_text || '',
  sort_order: Number(payload.sort_order || 0),
  options_text: Array.isArray(payload.options) ? payload.options.join(', ') : '',
  is_editable: normalizeBooleanLike(payload.is_editable, true),
  is_required: normalizeBooleanLike(payload.is_required, true),
  active: normalizeBooleanLike(payload.active, true),
});

const DriverDocumentForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditMode = Boolean(id);
  const [searchParams] = useSearchParams();
  const requestedType = String(searchParams.get('type') || 'document').trim().toLowerCase();
  const [templateType, setTemplateType] = useState(requestedType === 'vehicle_field' ? 'vehicle_field' : 'document');
  const [documentForm, setDocumentForm] = useState(initialDocumentForm);
  const [vehicleFieldForm, setVehicleFieldForm] = useState(initialVehicleFieldForm);
  const [loading, setLoading] = useState(isEditMode);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const isCustomVehicleField = templateType === 'vehicle_field' && vehicleFieldForm.field_key === customVehicleFieldSentinel;

  useEffect(() => {
    if (!isEditMode) {
      return;
    }

    const loadItem = async () => {
      setLoading(true);
      setError('');

      try {
        const response = await adminService.getDriverNeededDocument(id);
        const payload = response?.data?.data || response?.data || {};
        const nextType = String(payload.template_type || requestedType || 'document').trim().toLowerCase();
        setTemplateType(nextType === 'vehicle_field' ? 'vehicle_field' : 'document');

        if (nextType === 'vehicle_field') {
          setVehicleFieldForm(fromVehicleFieldResponse(payload));
        } else {
          setDocumentForm(fromDocumentResponse(payload));
        }
      } catch (err) {
        setError(err?.message || 'Unable to load onboarding item');
      } finally {
        setLoading(false);
      }
    };

    loadItem();
  }, [id, isEditMode, requestedType]);

  const selectedVehicleField = useMemo(
    () => vehicleFieldOptions.find((option) => option.value === vehicleFieldForm.field_key),
    [vehicleFieldForm.field_key],
  );

  const handleDocumentChange = (key, value) => {
    setDocumentForm((current) => ({
      ...current,
      [key]: value,
      ...(key === 'has_identify_number' && value !== '1' ? { identify_number_key: '' } : {}),
      ...(key === 'verification_type'
        ? {
            ...(value !== 'none' ? documentVerificationPresets[value] || {} : {}),
            verification_type: value,
          }
        : {}),
    }));
  };

  const handleVehicleFieldChange = (key, value) => {
    setVehicleFieldForm((current) => {
      const next = { ...current, [key]: value };

      if (key === 'field_key') {
        const selected = vehicleFieldOptions.find((option) => option.value === value);
        if (selected) {
          next.name = current.name || selected.label;
          next.field_type = selected.field_type;
          next.field_group = selected.field_group;
          next.placeholder = current.placeholder || selected.placeholder || '';
          next.account_type = current.account_type || selected.account_type;
          next.options_text = current.options_text || (selected.options || []).join(', ');
          next.custom_field_key = '';
        } else if (value === customVehicleFieldSentinel) {
          next.field_type = current.field_type || 'text';
          next.field_group = current.field_group || 'custom';
        }
      }

      return next;
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      if (templateType === 'vehicle_field') {
        const resolvedFieldKey = vehicleFieldForm.field_key === customVehicleFieldSentinel
          ? String(vehicleFieldForm.custom_field_key || '').trim()
          : vehicleFieldForm.field_key;

        if (!vehicleFieldForm.name.trim() || !vehicleFieldForm.account_type || !resolvedFieldKey) {
          setError('Please fill all required vehicle field settings.');
          setSubmitting(false);
          return;
        }

        const payload = {
          template_type: 'vehicle_field',
          name: String(vehicleFieldForm.name || '').trim(),
          account_type: vehicleFieldForm.account_type,
          field_key: resolvedFieldKey,
          field_type: vehicleFieldForm.field_type,
          field_group: vehicleFieldForm.field_group,
          placeholder: String(vehicleFieldForm.placeholder || '').trim(),
          help_text: String(vehicleFieldForm.help_text || '').trim(),
          sort_order: Number(vehicleFieldForm.sort_order || 0),
          options: String(vehicleFieldForm.options_text || '')
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean),
          is_editable: Boolean(vehicleFieldForm.is_editable),
          is_required: Boolean(vehicleFieldForm.is_required),
          active: Boolean(vehicleFieldForm.active),
        };

        if (isEditMode) {
          await adminService.updateDriverNeededDocument(id, payload);
        } else {
          await adminService.createDriverNeededDocument(payload);
        }
      } else {
        if (
          !documentForm.name.trim() ||
          !documentForm.account_type ||
          documentForm.has_expiry_date === '' ||
          !documentForm.image_type ||
          documentForm.has_identify_number === '' ||
          (documentForm.has_identify_number === '1' && !documentForm.identify_number_key.trim())
        ) {
          setError('Please fill all required document fields.');
          setSubmitting(false);
          return;
        }

        const payload = {
          template_type: 'document',
          name: String(documentForm.name || '').trim(),
          account_type: documentForm.account_type,
          has_expiry_date: documentForm.has_expiry_date === '1',
          image_type: documentForm.image_type,
          has_identify_number: documentForm.has_identify_number === '1',
          identify_number_key:
            documentForm.has_identify_number === '1' ? String(documentForm.identify_number_key || '').trim() : '',
          verification_type: documentForm.verification_type || 'none',
          is_editable: Boolean(documentForm.is_editable),
          is_required: Boolean(documentForm.is_required),
          active: Boolean(documentForm.active),
        };

        if (isEditMode) {
          await adminService.updateDriverNeededDocument(id, payload);
        } else {
          await adminService.createDriverNeededDocument(payload);
        }
      }

      navigate('/admin/drivers/documents');
    } catch (err) {
      setError(err?.message || 'Unable to save onboarding configuration');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 lg:p-8">
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">Loading configuration...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-4 lg:p-6 font-sans">
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-1.5 text-xs text-gray-400">
          <span>Driver Onboarding Config</span>
          <ChevronRight size={12} />
          <span className="text-gray-700">{isEditMode ? 'Edit' : 'Create'}</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h1 className="text-xl text-gray-900 font-bold">
            {isEditMode ? 'Edit' : 'Create'} {templateType === 'vehicle_field' ? 'Vehicle Field' : 'Document'}
          </h1>
          <button
            type="button"
            onClick={() => navigate('/admin/drivers/documents')}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft size={16} />
            Back
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="rounded-xl border border-gray-200 bg-white p-6">
        {!isEditMode ? (
          <div className="mb-6 grid grid-cols-1 gap-5 md:grid-cols-2">
            <div>
              <label className={labelClass}>Config Type *</label>
              <select
                value={templateType}
                onChange={(event) => setTemplateType(event.target.value)}
                className={`${inputClass} ${!templateType ? selectPlaceholderClass : ''}`}
              >
                <option value="document">Document</option>
                <option value="vehicle_field">Vehicle Field</option>
              </select>
            </div>
          </div>
        ) : null}

        {templateType === 'vehicle_field' ? (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div className="md:col-span-2 rounded-xl border border-gray-200 bg-gray-50/70 p-4">
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => handleVehicleFieldChange('field_key', customVehicleFieldSentinel)}
                  className={`rounded-lg px-4 py-2 text-sm font-bold transition-colors ${
                    isCustomVehicleField
                      ? 'bg-yellow-400 text-black shadow-sm'
                      : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Create Custom Field
                </button>
                <button
                  type="button"
                  onClick={() => handleVehicleFieldChange('field_key', vehicleFieldOptions[0]?.value || '')}
                  className={`rounded-lg px-4 py-2 text-sm font-bold transition-colors ${
                    !isCustomVehicleField
                      ? 'bg-yellow-400 text-black shadow-sm'
                      : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Use Built-in Field
                </button>
              </div>
              <p className="mt-3 text-xs text-gray-500">
                Create Custom Field adds a brand new field key for the vehicle step. Use Built-in Field when you only want to rename or reconfigure one of the existing onboarding fields.
              </p>
            </div>

            <div>
              <label className={labelClass}>{isCustomVehicleField ? 'Field Mode' : 'Field Key *'}</label>
              {isCustomVehicleField ? (
                <input
                  type="text"
                  value="Custom Field"
                  className={`${inputClass} bg-gray-50 text-gray-500`}
                  readOnly
                />
              ) : (
                <select
                  value={vehicleFieldForm.field_key}
                  onChange={(event) => handleVehicleFieldChange('field_key', event.target.value)}
                  className={`${inputClass} ${!vehicleFieldForm.field_key ? selectPlaceholderClass : ''}`}
                  required
                >
                  <option value="" disabled>Select vehicle field</option>
                  {vehicleFieldOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {isCustomVehicleField ? (
              <div>
                <label className={labelClass}>Custom Field Key *</label>
                <input
                  type="text"
                  value={vehicleFieldForm.custom_field_key}
                  onChange={(event) => handleVehicleFieldChange('custom_field_key', event.target.value.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase())}
                  placeholder="e.g. permit_zone"
                  className={inputClass}
                  required
                />
              </div>
            ) : null}

            <div>
              <label className={labelClass}>Field Label *</label>
              <input
                type="text"
                value={vehicleFieldForm.name}
                onChange={(event) => handleVehicleFieldChange('name', event.target.value)}
                placeholder="Enter display label"
                className={inputClass}
                required
              />
            </div>

            <div>
              <label className={labelClass}>Account Type *</label>
              <select
                value={vehicleFieldForm.account_type}
                onChange={(event) => handleVehicleFieldChange('account_type', event.target.value)}
                className={`${inputClass} ${!vehicleFieldForm.account_type ? selectPlaceholderClass : ''}`}
                required
              >
                <option value="" disabled>Select account type</option>
                {accountTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Field Type</label>
              <select
                value={vehicleFieldForm.field_type}
                onChange={(event) => handleVehicleFieldChange('field_type', event.target.value)}
                className={inputClass}
              >
                {vehicleFieldTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Field Group</label>
              <input
                type="text"
                value={vehicleFieldForm.field_group}
                onChange={(event) => handleVehicleFieldChange('field_group', event.target.value)}
                placeholder="driver, owner, common"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Position</label>
              <input
                type="number"
                value={vehicleFieldForm.sort_order}
                onChange={(event) => handleVehicleFieldChange('sort_order', event.target.value)}
                placeholder="1"
                min={1}
                className={inputClass}
              />
            </div>

            <div className="md:col-span-2">
              <label className={labelClass}>Placeholder</label>
              <input
                type="text"
                value={vehicleFieldForm.placeholder}
                onChange={(event) => handleVehicleFieldChange('placeholder', event.target.value)}
                placeholder="Input placeholder"
                className={inputClass}
              />
            </div>

            <div className="md:col-span-2">
              <label className={labelClass}>Help Text</label>
              <input
                type="text"
                value={vehicleFieldForm.help_text}
                onChange={(event) => handleVehicleFieldChange('help_text', event.target.value)}
                placeholder="Optional helper text below the field"
                className={inputClass}
              />
            </div>

            <div className="md:col-span-2">
              <label className={labelClass}>Options</label>
              <input
                type="text"
                value={vehicleFieldForm.options_text}
                onChange={(event) => handleVehicleFieldChange('options_text', event.target.value)}
                placeholder="Comma separated values"
                className={inputClass}
              />
            </div>

            <div className="md:col-span-2 rounded-xl border border-gray-200 bg-gray-50/70 p-4">
              <div className="flex flex-wrap gap-6">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 text-yellow-500 border-gray-300 rounded focus:ring-yellow-400 cursor-pointer"
                    checked={vehicleFieldForm.is_editable}
                    onChange={(event) => handleVehicleFieldChange('is_editable', event.target.checked)}
                  />
                  Is Editable?
                </label>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-800 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 text-yellow-500 border-gray-300 rounded focus:ring-yellow-400 cursor-pointer"
                    checked={vehicleFieldForm.is_required}
                    onChange={(event) => handleVehicleFieldChange('is_required', event.target.checked)}
                  />
                  Is Required?
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 text-yellow-500 border-gray-300 rounded focus:ring-yellow-400 cursor-pointer"
                    checked={vehicleFieldForm.active}
                    onChange={(event) => handleVehicleFieldChange('active', event.target.checked)}
                  />
                  Active?
                </label>
              </div>
              {selectedVehicleField ? (
                <p className="mt-3 text-xs text-gray-500">
                  Default mapping: {selectedVehicleField.label} will be shown in the {selectedVehicleField.field_group || 'selected'} group.
                </p>
              ) : isCustomVehicleField ? (
                <p className="mt-3 text-xs text-gray-500">
                  Custom fields are saved as dynamic vehicle-step data and will appear in the Additional Details section for the selected account type.
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div>
              <label className={labelClass}>Document Name *</label>
              <input
                type="text"
                value={documentForm.name}
                onChange={(event) => handleDocumentChange('name', event.target.value)}
                placeholder="Enter Name"
                className={inputClass}
                required
              />
            </div>

            <div>
              <label className={labelClass}>Account Type *</label>
              <select
                value={documentForm.account_type}
                onChange={(event) => handleDocumentChange('account_type', event.target.value)}
                className={`${inputClass} ${!documentForm.account_type ? selectPlaceholderClass : ''}`}
                required
              >
                <option value="" disabled>Select account type</option>
                {accountTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Verification Mapping</label>
              <select
                value={documentForm.verification_type}
                onChange={(event) => handleDocumentChange('verification_type', event.target.value)}
                className={inputClass}
              >
                {verificationTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Has Expiry Date *</label>
              <select
                value={documentForm.has_expiry_date}
                onChange={(event) => handleDocumentChange('has_expiry_date', event.target.value)}
                className={`${inputClass} ${documentForm.has_expiry_date === '' ? selectPlaceholderClass : ''}`}
                required
              >
                <option value="" disabled>Select expiry requirement</option>
                {yesNoOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Image Type *</label>
              <select
                value={documentForm.image_type}
                onChange={(event) => handleDocumentChange('image_type', event.target.value)}
                className={`${inputClass} ${!documentForm.image_type ? selectPlaceholderClass : ''}`}
                required
              >
                <option value="" disabled>Select image type</option>
                {imageTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Has Identify Number *</label>
              <select
                value={documentForm.has_identify_number}
                onChange={(event) => handleDocumentChange('has_identify_number', event.target.value)}
                className={`${inputClass} ${documentForm.has_identify_number === '' ? selectPlaceholderClass : ''}`}
                required
              >
                <option value="" disabled>Select identity number requirement</option>
                {yesNoOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {documentForm.has_identify_number === '1' ? (
              <div>
                <label className={labelClass}>Identify Number Key</label>
                <input
                  type="text"
                  value={documentForm.identify_number_key}
                  onChange={(event) => handleDocumentChange('identify_number_key', event.target.value)}
                  placeholder="Enter Identify Number Key"
                  className={inputClass}
                />
              </div>
            ) : (
              <div />
            )}

            <div className="md:col-span-2 rounded-xl border border-gray-200 bg-gray-50/70 p-4">
              <div className="flex flex-wrap gap-6">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 text-yellow-500 border-gray-300 rounded focus:ring-yellow-400 cursor-pointer"
                    checked={documentForm.is_editable}
                    onChange={(event) => handleDocumentChange('is_editable', event.target.checked)}
                  />
                  Is Editable?
                </label>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-800 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 text-yellow-500 border-gray-300 rounded focus:ring-yellow-400 cursor-pointer"
                    checked={documentForm.is_required}
                    onChange={(event) => handleDocumentChange('is_required', event.target.checked)}
                  />
                  Is Required?
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 text-yellow-500 border-gray-300 rounded focus:ring-yellow-400 cursor-pointer"
                    checked={documentForm.active}
                    onChange={(event) => handleDocumentChange('active', event.target.checked)}
                  />
                  Active?
                </label>
              </div>
              <p className="mt-3 text-xs text-gray-500">
                When required is enabled, this document must be completed in the signup flow before registration can finish.
              </p>
              <p className="mt-2 text-xs text-gray-500">
                Pick a verification mapping for documents like Driving License, PAN, GST, or RC so the driver app shows the matching RechargeKit verify action automatically.
              </p>
            </div>
          </div>
        )}

        {error ? (
          <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div>
        ) : null}

        <div className="mt-6 flex justify-end">
          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-2.5 bg-yellow-400 text-black rounded-lg text-sm font-bold shadow-sm hover:bg-yellow-500 transition-colors disabled:opacity-60"
          >
            {submitting ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default DriverDocumentForm;
