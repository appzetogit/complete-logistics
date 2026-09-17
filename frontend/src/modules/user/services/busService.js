import api from '../../../shared/api/axiosInstance';

const normalizeTravelDate = (value) => {
  if (!value) return '';

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      const year = parsed.getFullYear();
      const month = String(parsed.getMonth() + 1).padStart(2, '0');
      const day = String(parsed.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    return trimmed;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return String(value).trim();
};

export const userBusService = {
  getRoutes: () => api.get('/users/buses/routes'),

  searchBuses: ({ fromCity, toCity, date }) =>
    api.get('/users/buses/search', {
      params: { fromCity, toCity, date: normalizeTravelDate(date) },
    }),

  getSeatLayout: ({ busServiceId, scheduleId, date }) =>
    api.get(`/users/buses/${busServiceId}/seats`, {
      params: { scheduleId, date: normalizeTravelDate(date) },
    }),

  getMyBookings: ({ page = 1, limit = 10, status = '', tripState = '' } = {}) =>
    api.get('/users/bus-bookings', {
      params: { page, limit, status, tripState },
    }),

  getBookingById: (bookingId) => api.get(`/users/bus-bookings/${bookingId}`),

  cancelBooking: (bookingId, payload = {}) =>
    api.post(`/users/bus-bookings/${bookingId}/cancel`, {
      ...payload,
      travelDate: normalizeTravelDate(payload?.travelDate),
    }),

  submitBookingReview: (bookingId, payload) => api.post(`/users/bus-bookings/${bookingId}/review`, payload),

  createBookingOrder: (payload) =>
    api.post('/users/bus-bookings/order', {
      ...payload,
      travelDate: normalizeTravelDate(payload?.travelDate),
    }),

  verifyBookingPayment: (payload) => api.post('/users/bus-bookings/verify', payload),
};

export default userBusService;
