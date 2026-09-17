export const normalizeDriverDocumentTemplates = (templates = []) => {
  if (!Array.isArray(templates) || templates.length === 0) {
    return [];
  }

  return templates
    .filter((template) => template?.active !== false)
    .map((template) => ({
      ...template,
      id: template.id || template._id || template.slug || template.name,
      fields: Array.isArray(template.fields) ? template.fields.filter((field) => field?.key) : [],
    }))
    .filter((template) => template.fields.length > 0);
};

export const flattenDriverDocumentFields = (templates = []) =>
  normalizeDriverDocumentTemplates(templates).flatMap((template) =>
    template.fields.map((field) => ({
      ...field,
      templateId: template.id,
      templateName: template.name,
      verificationType: template.verification_type || 'none',
      imageType: template.image_type,
      hasExpiryDate: Boolean(template.has_expiry_date),
      hasIdentifyNumber: Boolean(template.has_identify_number),
      isRequired: field.required ?? template.is_required ?? false,
    })),
  );

export const getDocumentPreviewUrl = (documentValue) => {
  if (!documentValue) return '';
  if (typeof documentValue === 'string') return documentValue;
  return documentValue.previewUrl || documentValue.secureUrl || documentValue.url || '';
};
