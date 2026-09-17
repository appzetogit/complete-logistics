import * as XLSX from 'xlsx';

export const DRIVER_IMPORT_COLUMNS = [
  'ServiceLocation',
  'Name',
  'Email',
  'Mobile',
  'Gender',
  'Country',
  'Vehicle Type',
  'Transport Type',
  'CustomMake',
  'CustomModel',
  'CarColor',
  'CarNumber',
];

const normalizeColumn = (column = '') =>
  String(column ?? '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase();

const hasExpectedColumnsOnly = (columns = []) => {
  const normalizedColumns = columns.map(normalizeColumn);
  const normalizedExpectedColumns = DRIVER_IMPORT_COLUMNS.map(normalizeColumn);

  return (
    normalizedColumns.length === normalizedExpectedColumns.length &&
    new Set(normalizedColumns).size === normalizedExpectedColumns.length &&
    normalizedExpectedColumns.every((column) => normalizedColumns.includes(column))
  );
};

const readWorkbook = async (file) => {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const firstSheet = workbook.Sheets[firstSheetName];

  if (!firstSheet) {
    return { headers: [], rows: [] };
  }

  const rawRows = XLSX.utils.sheet_to_json(firstSheet, {
    header: 1,
    blankrows: false,
    defval: '',
  });

  return {
    headers: Array.isArray(rawRows[0]) ? rawRows[0].map((header) => String(header ?? '').trim()) : [],
    rows: rawRows.slice(1).filter((row) => Array.isArray(row) && row.some((cell) => String(cell ?? '').trim())),
  };
};

export const parseDriverImportFile = async (file) => {
  if (!file) {
    return { valid: false, message: 'Select a file before creating the import.', rows: [] };
  }

  const fileName = String(file.name || '').toLowerCase();
  if (!fileName.endsWith('.csv') && !fileName.endsWith('.xlsx')) {
    return { valid: false, message: 'Select a CSV or XLSX file.', rows: [] };
  }

  try {
    const { headers, rows } = await readWorkbook(file);

    if (!headers.length) {
      return { valid: false, message: 'Import file is empty.', rows: [] };
    }

    if (!hasExpectedColumnsOnly(headers)) {
      return {
        valid: false,
        message: `File columns must be exactly: ${DRIVER_IMPORT_COLUMNS.join(', ')}.`,
        rows: [],
      };
    }

    return {
      valid: true,
      message: '',
      rows: rows.map((row) => {
        const valuesByHeader = Object.fromEntries(
          headers.map((header, index) => [header, String(row[index] ?? '').trim()]),
        );

        return {
          service_location: valuesByHeader.ServiceLocation || '',
          name: valuesByHeader.Name || '',
          email: valuesByHeader.Email || '',
          mobile: valuesByHeader.Mobile || '',
          gender: valuesByHeader.Gender || '',
          country: valuesByHeader.Country || '',
          vehicle_type: valuesByHeader['Vehicle Type'] || '',
          transport_type: valuesByHeader['Transport Type'] || '',
          vehicle_make: valuesByHeader.CustomMake || '',
          vehicle_model: valuesByHeader.CustomModel || '',
          vehicle_color: valuesByHeader.CarColor || '',
          vehicle_number: valuesByHeader.CarNumber || '',
        };
      }),
    };
  } catch {
    return { valid: false, message: 'Could not read import file.', rows: [] };
  }
};

export const validateDriverImportFile = async (file) => {
  const result = await parseDriverImportFile(file);
  return { valid: result.valid, message: result.message };
};
