// Which driver documents a vehicle type asks for. The admin picks them on the Vehicle Type form
// (`required_document_ids`); a vehicle with none picked asks for every active document, as before.

export const normalizeVehicleDocumentIds = (value) =>
  [
    ...new Set(
      (Array.isArray(value) ? value : [])
        .map((item) => String(item?._id ?? item?.id ?? item ?? '').trim())
        .filter((item) => /^[a-f\d]{24}$/i.test(item)),
    ),
  ];

export const filterDocumentsForVehicle = (templates = [], vehicle = null) => {
  const selected = new Set(normalizeVehicleDocumentIds(vehicle?.required_document_ids));

  if (selected.size === 0) {
    return templates;
  }

  return templates.filter((template) => selected.has(String(template?.id ?? template?._id ?? '')));
};
