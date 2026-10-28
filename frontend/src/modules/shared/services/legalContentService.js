import api from '../../../shared/api/axiosInstance';

// The old company name is still inside the built-in fallback texts; show the current one.
export const renameCompany = (text = '') =>
  String(text)
    .replace(/https?:\/\/Appzeto\s*24\.com/gi, 'https://rentol.in')
    .replace(/Appzeto\s+24\s+Trawler/gi, 'Rentol')
    .replace(/Appzeto\s+24(?!\w)/gi, 'Rentol');

/**
 * The published document written in the admin panel (About / Privacy / Terms / Refund / Cancellation), or null when
 * nothing is published or the request fails, so the page can show its built-in text instead.
 */
export const fetchLegalDocument = async (type, audience = 'user', lang = 'en') => {
  try {
    const response = await api.get(`/common/legal/${type}`, { params: { audience, lang } });
    const doc = response?.data?.data || response?.data || response;
    return doc && typeof doc.body === 'string' && doc.body.trim() ? doc : null;
  } catch {
    return null;
  }
};
