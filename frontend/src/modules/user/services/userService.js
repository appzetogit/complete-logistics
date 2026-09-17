import api from '../../../shared/api/axiosInstance';

export const userService = {
  getAppModules: async (params) => {
    const response = await api.get('/users/app-modules', { params });
    return response;
  },
  getRentalVehicles: async () => {
    const response = await api.get('/users/rental-vehicles');
    return response;
  },
  getIntercityPackages: async () => {
    const response = await api.get('/users/intercity-packages');
    return response;
  },
  createRentalQuoteRequest: async (payload) => {
    const response = await api.post('/users/rental-quote-requests', payload);
    return response;
  },
  createRentalAdvanceOrder: async (payload) => {
    const response = await api.post('/users/rental-advance/razorpay/order', payload);
    return response;
  },
  createPhonePeRentalAdvanceOrder: async (payload) => {
    const response = await api.post('/users/rental-advance/phonepe/order', payload);
    return response;
  },
  payRentalAdvanceWithWallet: async (payload) => {
    const response = await api.post('/users/rental-advance/wallet', payload);
    return response;
  },
  verifyRentalAdvancePayment: async (payload) => {
    const response = await api.post('/users/rental-advance/razorpay/verify', payload);
    return response;
  },
  verifyPhonePeRentalAdvancePayment: async (merchantTransactionId) => {
    const response = await api.get(`/users/rental-advance/phonepe/status/${merchantTransactionId}`);
    return response;
  },
  createRentalBookingRequest: async (payload) => {
    const response = await api.post('/users/rental-bookings', payload);
    return response;
  },
  getMyRentalBookings: async (params = {}) => {
    const response = await api.get('/users/rental-bookings', { params });
    return response;
  },
  getActiveRentalBooking: async () => {
    const response = await api.get('/users/rental-bookings/active');
    return response;
  },
  updateRentalLocation: async (bookingId, payload) => {
    const response = await api.post(`/users/rental-bookings/${bookingId}/location`, payload);
    return response;
  },
  endRentalRide: async (bookingId) => {
    const response = await api.post(`/users/rental-bookings/${bookingId}/end`);
    return response;
  },
  getServiceLocations: async () => {
    const response = await api.get('/users/service-locations');
    return response;
  },
  getServiceStores: async () => {
    const response = await api.get('/users/service-stores');
    return response;
  },
  getAvailablePromos: async (params) => {
    const response = await api.get('/promos/available', { params });
    return response;
  },
  validatePromo: async (payload) => {
    const response = await api.post('/promos/validate', payload);
    return response;
  },
  searchPoolingRoutes: async (params) => {
    const response = await api.get('/users/pooling/search', { params });
    return response;
  },
  getPoolingRouteDetails: async (id, params) => {
    const response = await api.get(`/users/pooling/routes/${id}`, { params });
    return response;
  },
  createPoolingBookingOrder: async (payload) => {
    const response = await api.post('/users/pooling/bookings/order', payload);
    return response;
  },
  verifyPoolingBookingPayment: async (payload) => {
    const response = await api.post('/users/pooling/bookings/verify', payload);
    return response;
  },
  createPoolingBooking: async (payload) => {
    const response = await api.post('/users/pooling/bookings', payload);
    return response;
  },
  getMyPoolingBookings: async () => {
    const response = await api.get('/users/pooling/bookings');
    return response;
  },
};
