import { Employee } from '../models/Employee.js';

export const normalizeEmployeeCode = (value = '') =>
  String(value || '')
    .trim()
    .toUpperCase();

export const normalizeEmployeePhone = (value = '') => {
  const digits = String(value || '').replace(/\D/g, '').trim();
  return digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
};

export const findActiveEmployeeByCode = async (employeeCode) => {
  const normalizedCode = normalizeEmployeeCode(employeeCode);

  if (!normalizedCode) {
    return null;
  }

  return Employee.findOne({
    employeeCode: normalizedCode,
    active: true,
  });
};
