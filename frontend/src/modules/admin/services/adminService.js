import api from '../../../shared/api/axiosInstance';

export const adminService = {
  /**
   * Admin Authentication
   */
  login: (credentials) => api.post('/admin/login', credentials),
  forgotPassword: (email) => api.post('/admin/forgot-password', { email }),
  verifyResetOtp: (data) => api.post('/admin/verify-reset-otp', data),
  resetPassword: (data) => api.post('/admin/reset-password', data),
  getAdmins: () => api.get('/admin/admin-management/admins'),
  createAdminAccount: (data) => api.post('/admin/admin-management/admins', data),
  updateAdminAccount: (id, data) => api.patch(`/admin/admin-management/admins/${id}`, data),
  deleteAdminAccount: (id) => api.delete(`/admin/admin-management/admins/${id}`),
  getAdminPermissions: () => api.get('/admin/permissions'),

  /**
   * User Management
   */
  getUsers: (page = 1, limit = 50, search = '', filters = {}) => {
    const params = new URLSearchParams({ page, limit });
    if (String(search || '').trim()) {
      params.set('search', String(search).trim());
    }
    if (String(filters.employeeId || '').trim()) {
      params.set('employeeId', String(filters.employeeId).trim());
    }
    if (String(filters.referralSource || '').trim()) {
      params.set('referralSource', String(filters.referralSource).trim());
    }
    return api.get(`/admin/users?${params.toString()}`);
  },
  getEmployees: (page = 1, limit = 50, search = '') => {
    const params = new URLSearchParams({ page, limit });
    if (String(search || '').trim()) {
      params.set('search', String(search).trim());
    }
    return api.get(`/admin/employees?${params.toString()}`);
  },
  getEmployee: (id) => api.get(`/admin/employees/${id}`),
  createEmployee: (data) => api.post('/admin/employees', data),
  updateEmployee: (id, data) => api.patch(`/admin/employees/${id}`, data),
  
  bulkImportUsers: (payload) => api.post('/admin/users/bulk-import', payload),

  createUser: (userData) => api.post('/admin/users', userData),
  
  updateUser: (id, userData) => api.patch(`/admin/users/${id}`, userData),
  
  deleteUser: (id) => api.delete(`/admin/users/${id}`),
  getUserDeleteRequests: () => api.get('/admin/users/delete-requests'),
  approveUserDeleteRequest: (id) => api.patch(`/admin/users/delete-requests/${id}/approve`),
  rejectUserDeleteRequest: (id, adminNote = '') => api.patch(`/admin/users/delete-requests/${id}/reject`, { adminNote }),

  /**
   * Driver Management
   */
  getDrivers: (page = 1, limit = 50, filters = {}) => {
    const params = new URLSearchParams({ page, limit, ...filters }).toString();
    return api.get(`/admin/drivers?${params}`);
  },

  bulkImportDrivers: (payload) => api.post('/admin/drivers/bulk-import', payload),
  getDriver: (id) => api.get(`/admin/drivers/${id}`),
  createDriver: (driverData) => api.post('/admin/drivers', driverData),
  updateDriverStatus: (id, data) => api.patch(`/admin/drivers/${id}`, data),
  updateDriverPassword: (id, password) => api.patch(`/admin/drivers/update-password/${id}`, { password }),
  deleteDriver: (id) => api.delete(`/admin/drivers/${id}`),
  getDriverDeleteRequests: () => api.get('/admin/drivers/delete-requests'),
  approveDriverDeleteRequest: (id) => api.patch(`/admin/drivers/delete-requests/${id}/approve`),
  rejectDriverDeleteRequest: (id, adminNote = '') => api.patch(`/admin/drivers/delete-requests/${id}/reject`, { adminNote }),
  getDriverNeededDocuments: (templateType = 'document') =>
    api.get(`/admin/owner-management/driver-needed-document?template_type=${encodeURIComponent(templateType)}`),
  getDriverNeededDocument: (id) => api.get(`/admin/owner-management/driver-needed-document/${id}`),
  createDriverNeededDocument: (data) => api.post('/admin/owner-management/driver-needed-document', data),
  updateDriverNeededDocument: (id, data) => api.patch(`/admin/owner-management/driver-needed-document/${id}`, data),
  deleteDriverNeededDocument: (id) => api.delete(`/admin/owner-management/driver-needed-document/${id}`),
  getReferralTranslations: () => api.get('/admin/referrals/translation'),
  updateReferralTranslation: (languageCode, data) =>
    api.patch(`/admin/referrals/translation/${languageCode}`, data),
  getReferralSettings: (type) => api.get(`/admin/referrals/settings/${type}`),
  updateReferralSettings: (type, data) => api.patch(`/admin/referrals/settings/${type}`, data),
  // Wallet Payment APIs
  searchUsers: (query) => api.get(`/admin/users?search=${encodeURIComponent(query)}`),
  searchDrivers: (query) => api.get(`/admin/drivers?search=${query}`),
  searchOwners: (query) => api.get(`/admin/owners?search=${query}`),

  adjustUserWallet: (id, data) => api.post(`/admin/wallet/users/${id}/adjust`, data),
  getUserWalletHistory: (id) => api.get(`/admin/wallet/users/${id}/history`),

  adjustDriverWallet: (id, data) => api.post(`/admin/wallet/drivers/${id}/adjust`, data),
  getDriverWalletHistory: (id) => api.get(`/admin/wallet/drivers/${id}/history`),
  getDriverWithdrawalSummaries: (params = {}) => api.get('/admin/wallet/drivers/withdrawals', { params }),
  getDriverWithdrawals: (driverId, params = {}) => api.get(`/admin/wallet/drivers/${driverId}/withdrawals`, { params }),
  getDriverWithdrawalContextByRequestId: (requestId, params = {}) =>
    api.get(`/admin/wallet/drivers/withdrawals/request/${requestId}`, { params }),
  approveDriverWithdrawalRequest: (requestId) => api.patch(`/admin/wallet/drivers/withdrawals/${requestId}/approve`),
  rejectDriverWithdrawalRequest: (requestId) => api.patch(`/admin/wallet/drivers/withdrawals/${requestId}/reject`),

  adjustOwnerWallet: (id, data) => api.post(`/admin/wallet/owners/${id}/adjust`, data),
  getOwnerWalletHistory: (id) => api.get(`/admin/wallet/owners/${id}/history`),

  getReferralDashboard: () => api.get('/admin/referral/dashboard'),

  /**
   * Subscription Management
   */
  getSubscriptionPlans: () => api.get('/admin/driver-subscriptions/plans/list'),
  createSubscriptionPlan: (planData) => api.post('/admin/driver-subscriptions/plans/create', planData),
  getSubscriptionSettings: () => api.get('/admin/driver-subscriptions/settings'),
  updateSubscriptionSettings: (data) => api.post('/admin/driver-subscriptions/settings', data),
  getUserSubscriptionPlans: () => api.get('/admin/user-subscriptions/plans/list'),
  createUserSubscriptionPlan: (planData) => api.post('/admin/user-subscriptions/plans/create', planData),
  getUserSubscriptionsByUserId: (id) => api.get(`/admin/users/${id}/subscriptions`),
  
  /**
   * Common / Configuration Data
   */
  getServiceLocations: () => api.get('/admin/service-locations'),
  createServiceLocation: (data) => api.post('/admin/service-locations', data),
  updateServiceLocation: (id, data) => api.patch(`/admin/service-locations/${id}`, data),
  deleteServiceLocation: (id) => api.delete(`/admin/service-locations/${id}`),
  getServiceStores: () => api.get('/admin/service-stores'),
  getPendingServiceStores: () => api.get('/admin/service-stores/pending'),
  approvePendingServiceStore: (id) => api.patch(`/admin/service-stores/${id}/approve`),
  rejectPendingServiceStore: (id, rejectionReason = '') =>
    api.patch(`/admin/service-stores/${id}/reject`, { rejectionReason }),
  createServiceStore: (data) => api.post('/admin/service-stores', data),
  updateServiceStore: (id, data) => api.patch(`/admin/service-stores/${id}`, data),
  createServiceStoreStaff: (id, data) => api.post(`/admin/service-stores/${id}/staff`, data),
  getPendingServiceStoreStaff: () => api.get('/admin/service-stores/pending-staff'),
  approvePendingServiceStoreStaff: (id) => api.patch(`/admin/service-stores/staff/${id}/approve`),
  rejectPendingServiceStoreStaff: (id, rejectionReason = '') =>
    api.patch(`/admin/service-stores/staff/${id}/reject`, { rejectionReason }),
  deleteServiceStore: (id) => api.delete(`/admin/service-stores/${id}`),
  getCountries: () => api.get('/countries'),
  getVehicleTypes: (transportType) => api.get(`/admin/types/vehicle-types/list${transportType ? `?transport_type=${transportType}` : ''}`),
  getVehicleTypeById: (id) => api.get(`/admin/types/vehicle-types/${id}`),
  getRideModules: () => api.get('/common/ride_modules'),
  getLocationVehicleTypes: (locationId, transportType) => api.get(`/types/${locationId}?transport_type=${transportType}`),

  /**
   * Owner Management
   */
  getOwners: () => api.get('/admin/owner-management/manage-owners'),
  getOwner: (id) => api.get(`/admin/owner-management/manage-owners/${id}`),
  createOwner: (ownerData) => api.post('/admin/owner-management/manage-owners', ownerData),
  updateOwner: (id, ownerData) => api.patch(`/admin/owner-management/manage-owners/${id}`, ownerData),
  deleteOwner: (id) => api.delete(`/admin/owner-management/manage-owners/${id}`),
  approveOwner: (id, data) => api.patch(`/admin/owner-management/manage-owners/${id}/approve`, data),
  approveOwnerSignupFromDriver: (driverId) =>
    api.patch(`/admin/owner-management/pending-owners/${driverId}/approve`),
  getOwnerBookings: () => api.get('/admin/owner-management/bookings'),
  createOwnerBooking: (data) => api.post('/admin/owner-management/bookings', data),
  updateOwnerBooking: (id, data) => api.patch(`/admin/owner-management/bookings/${id}`, data),
  deleteOwnerBooking: (id) => api.delete(`/admin/owner-management/bookings/${id}`),

  /**
   * Reports Management
   * PRO-TIP: We use window.open for downloads to handle the stream directly or axios with responseType: 'blob'
   */
  downloadUserReport: (params) => {
    const query = new URLSearchParams(params).toString();
    return api.get(`/admin/reports/user/download?${query}`, { responseType: 'blob' });
  },
  downloadDriverReport: (params) => {
    const query = new URLSearchParams(params).toString();
    return api.get(`/admin/reports/driver/download?${query}`, { responseType: 'blob' });
  },
  downloadDriverDutyReport: (params) => {
    const query = new URLSearchParams(params).toString();
    return api.get(`/admin/reports/driver-duty/download?${query}`, { responseType: 'blob' });
  },
  downloadOwnerReport: (params) => {
    const query = new URLSearchParams(params).toString();
    return api.get(`/admin/reports/owner/download?${query}`, { responseType: 'blob' });
  },
  downloadFinanceReport: (params) => {
    const query = new URLSearchParams(params).toString();
    return api.get(`/admin/reports/finance/download?${query}`, { responseType: 'blob' });
  },
  downloadFleetFinanceReport: (params) => {
    const query = new URLSearchParams(params).toString();
    return api.get(`/admin/reports/fleet-finance/download?${query}`, { responseType: 'blob' });
  },
  getReportOptions: () => api.get('/admin/reports/options'),

  /**
   * Dashboard Stats & Data (New Parity Routes)
   */
  getDashboardPage: () => api.get('/admin/dashboard/page'),
  getDashboardData: () => api.get('/admin/dashboard/data'),
  getAdminEarnings: (params = {}) => api.get('/admin/dashboard/admin-earnings', { params }),
  getTodayEarnings: () => api.get('/admin/dashboard/today-earnings'),
  getOverallEarnings: () => api.get('/admin/dashboard/overall-earnings'),
  getCancelChart: () => api.get('/admin/dashboard/cancel-chart'),
  getSafetyAlerts: ({ page = 1, limit = 25, status = 'active' } = {}) =>
    api.get(`/admin/safety/alerts?page=${page}&limit=${limit}&status=${encodeURIComponent(status)}`),
  resolveSafetyAlert: (id, note = '') => api.patch(`/admin/safety/alerts/${id}/resolve`, { note }),
  getOngoingRides: ({ page = 1, limit = 10, tab = 'all', search = '' } = {}) =>
    api.get(`/admin/ongoing-rides?page=${page}&limit=${limit}&tab=${encodeURIComponent(tab)}&search=${encodeURIComponent(search)}`),
  getRideRequests: ({ page = 1, limit = 10, tab = 'all', search = '' } = {}) =>
    api.get(`/admin/ride-requests?page=${page}&limit=${limit}&tab=${encodeURIComponent(tab)}&search=${encodeURIComponent(search)}`),
  listRideRequests: ({ page = 1, limit = 10, tab = 'all', search = '' } = {}) =>
    api.get(`/admin/ride-requests?page=${page}&limit=${limit}&tab=${encodeURIComponent(tab)}&search=${encodeURIComponent(search)}`),
  getDeliveries: ({ page = 1, limit = 10, tab = 'all', search = '' } = {}) =>
    api.get(`/admin/deliveries?page=${page}&limit=${limit}&tab=${encodeURIComponent(tab)}&search=${encodeURIComponent(search)}`),
  getTrips: ({ page = 1, limit = 10, tab = 'all', search = '' } = {}) =>
    api.get(`/admin/trips?page=${page}&limit=${limit}&tab=${encodeURIComponent(tab)}&search=${encodeURIComponent(search)}`),
  deleteOngoingRide: (id) => api.delete(`/admin/ongoing-rides/${id}`),

  /**
   * Wallet & Financials
   */
  getUserWallets: () => api.get('/admin/wallet/users'),
  getDriverWallets: () => api.get('/admin/wallet/drivers'),
  getWithdrawalRequests: () => api.get('/admin/wallet/withdrawals'),
  getWithdrawals: () => api.get('/admin/wallet/withdrawals'),
  updateWithdrawalStatus: (id, status) => api.patch(`/admin/wallet/withdrawals/${id}`, { status }),

  /**
   * Notifications & Banners
   */
  getPromotionsBootstrap: () => api.get('/admin/promotions/bootstrap'),
  getNotifications: () => api.get('/admin/notifications'),
  sendNotification: (data) => api.post('/admin/notifications/send', data),
  deleteNotification: (id) => api.delete(`/admin/notifications/${id}`),
  getBanners: () => api.get('/admin/banners'),

  /**
   * Geofencing & Zone Management
   */
  getZones: () => api.get('/admin/zones'),
  createZone: (zoneData) => api.post('/admin/zones', zoneData),
  updateZone: (id, zoneData) => api.patch(`/admin/zones/${id}`, zoneData),
  deleteZone: (id) => api.delete(`/admin/zones/${id}`),
  toggleZoneStatus: (id) => api.patch(`/admin/zones/${id}/toggle-status`),
  getAirports: () => api.get('/admin/airports'),
  createAirport: (airportData) => api.post('/admin/airports', airportData),
  updateAirport: (id, airportData) => api.patch(`/admin/airports/${id}`, airportData),
  deleteAirport: (id) => api.delete(`/admin/airports/${id}`),
  getRentalPackageTypes: () => api.get('/admin/types/rental-packages'),
  createRentalPackageType: (data) => api.post('/admin/types/rental-packages', data),
  updateRentalPackageType: (id, data) => api.patch(`/admin/types/rental-packages/${id}`, data),
  deleteRentalPackageType: (id) => api.delete(`/admin/types/rental-packages/${id}`),
  getSetPrices: (params = {}) => api.get('/admin/types/set-prices', { params }),
  getSetPriceById: (id) => api.get(`/admin/types/set-prices/${id}`),
  createSetPrice: (data) => api.post('/admin/types/set-prices', data),
  updateSetPrice: (id, data) => api.patch(`/admin/types/set-prices/${id}`, data),
  deleteSetPrice: (id) => api.delete(`/admin/types/set-prices/${id}`),
  getRentalVehicleTypes: () => api.get('/admin/types/rental-vehicles'),
  createRentalVehicleType: (data) => api.post('/admin/types/rental-vehicles', data),
  updateRentalVehicleType: (id, data) => api.patch(`/admin/types/rental-vehicles/${id}`, data),
  deleteRentalVehicleType: (id) => api.delete(`/admin/types/rental-vehicles/${id}`),
  getRentalBookingRequests: () => api.get('/admin/rental-booking-requests'),
  getRentalTrackingDashboard: () => api.get('/admin/rental-tracking'),
  updateRentalBookingRequest: (id, data) => api.patch(`/admin/rental-booking-requests/${id}`, data),
  getRentalQuoteRequests: () => api.get('/admin/rental-quote-requests'),
  updateRentalQuoteRequest: (id, data) => api.patch(`/admin/rental-quote-requests/${id}`, data),
  getPoolingRoutes: () => api.get('/admin/pooling-routes'),
  createPoolingRoute: (data) => api.post('/admin/pooling-routes', data),
  updatePoolingRoute: (id, data) => api.patch(`/admin/pooling-routes/${id}`, data),
  deletePoolingRoute: (id) => api.delete(`/admin/pooling-routes/${id}`),

  getPoolingVehicles: () => api.get('/admin/pooling-vehicles'),
  getPendingPoolingVehicles: (search = '') =>
    api.get('/admin/pooling-vehicles', { params: { approve: false, search } }),
  createPoolingVehicle: (data) => api.post('/admin/pooling-vehicles', data),
  approvePoolingVehicle: (id) => api.patch(`/admin/pooling-vehicles/${id}/approve`),
  updatePoolingVehicle: (id, data) => api.patch(`/admin/pooling-vehicles/${id}`, data),
  deletePoolingVehicle: (id) => api.delete(`/admin/pooling-vehicles/${id}`),

  getPoolingBookings: () => api.get('/admin/pooling-bookings'),
  updatePoolingBookingStatus: (id, status) => api.patch(`/admin/pooling-bookings/${id}/status`, { status }),

  getAdminBusBookings: (params = {}) => api.get('/admin/bus-bookings', { params }),
  getPendingBusDrivers: () => api.get('/admin/bus-services/pending-drivers'),
  approvePendingBusDriver: (id) => api.patch(`/admin/bus-services/pending-drivers/${id}/approve`),
  rejectPendingBusDriver: (id, rejectionReason = '') =>
    api.patch(`/admin/bus-services/pending-drivers/${id}/reject`, { rejectionReason }),
  getAdminBusBookingCalendar: (params = {}) => api.get('/admin/bus-bookings/calendar', { params }),
  createAdminBusBooking: (payload) => api.post('/admin/bus-bookings/manual', payload),
  cancelAdminBusBookingSeats: (id, payload = {}) => api.post(`/admin/bus-bookings/${id}/cancel`, payload),

  uploadImage: (image) => api.post('/admin/upload-image', { image }),

  /**
   * Languages Management (Master)
   */
  getLanguages: (params) => api.get('/admin/languages', { params }),
  createLanguage: (data) => api.post('/admin/languages', data),
  getLanguage: (id) => api.get(`/admin/languages/${id}`),
  updateLanguage: (id, data) => api.patch(`/admin/languages/${id}`, data),
  updateLanguageStatus: (id, data) => api.patch(`/admin/languages/${id}/status`, data),
  deleteLanguage: (id) => api.delete(`/admin/languages/${id}`),

  /**
   * Preferences Management (Master)
   */
  getPreferences: (params) => api.get('/admin/preferences', { params: params }),
  createPreference: (data) => api.post('/admin/preferences', data),
  getPreference: (id) => api.get(`/admin/preferences/${id}`),
  updatePreference: (id, formData) => api.patch(`/admin/preferences/${id}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  updatePreferenceStatus: (id, data) => api.patch(`/admin/preferences/${id}/status`, data),
  deletePreference: (id) => api.delete(`/admin/preferences/${id}`),

  /**
   * Roles & Permissions Management
   */
  getRoles: (params) => api.get('/admin/roles', { params }),
  createRole: (roleData) => api.post('/admin/roles', roleData),
  getRole: (id) => api.get(`/admin/roles/${id}`),
  updateRole: (id, roleData) => api.patch(`/admin/roles/${id}`, roleData),
  deleteRole: (id) => api.delete(`/admin/roles/${id}`),
  getRolePermissions: (id) => api.get(`/admin/roles/${id}/permissions`),
  updateRolePermissions: (id, data) => api.put(`/roles/${id}/permissions`, data),

  getPermissions: (params) => api.get('/admin/permissions', { params }),
  createPermission: (data) => api.post('/admin/permissions', data),
  getPermission: (id) => api.get(`/admin/permissions/${id}`),
  updatePermission: (id, data) => api.patch(`/admin/permissions/${id}`, data),
  deletePermission: (id) => api.delete(`/admin/permissions/${id}`),

  /**
   * App Modules Management
   */
  getAppModules: (params) => api.get('/admin/common/app-modules', { params }),
  createAppModule: (data) => api.post('/admin/common/app-modules', data),
  updateAppModule: (id, data) => api.patch(`/admin/common/app-modules/${id}`, data),
  deleteAppModule: (id) => api.delete(`/admin/common/app-modules/${id}`),

  /**
   * Notification Channels Management
   */
  getNotificationChannels: (params) => api.get('/admin/notification-channels', { params }),
  updateNotificationChannel: (id, data) => api.patch(`/admin/notification-channels/${id}`, data),
  toggleChannelPush: (id, active) => api.patch(`/admin/notification-channels/${id}/push`, { push_notification: active ? 1 : 0 }),
  toggleChannelMail: (id, active) => api.patch(`/admin/notification-channels/${id}/mail`, { mail: active ? 1 : 0 }),

  /**
   * Integration Settings
   */
  getPaymentGateways: (params) => api.get('/admin/integration-settings/payment-gateways', { params }),
  updatePaymentGateway: (id, data) => api.patch(`/admin/integration-settings/payment-gateways/${id}`, data),
  getPaymentSettings: () => api.get('/admin/integration-settings/payment-settings'),
  updatePaymentSettings: (data) => api.patch('/admin/integration-settings/payment-settings', data),
  getSMSSettings: () => api.get('/admin/integration-settings/sms'),
  updateSMSSettings: (data) => api.patch('/admin/integration-settings/sms', data),
  getFirebaseSettings: () => api.get('/admin/integration-settings/firebase'),
  updateFirebaseSettings: (data) => api.patch('/admin/integration-settings/firebase', data),
  getMapSettings: () => api.get('/admin/integration-settings/map'),
  updateMapSettings: (data) => api.patch('/admin/integration-settings/map', data),
  getMailSettings: () => api.get('/admin/integration-settings/mail'),
  updateMailSettings: (data) => api.patch('/admin/integration-settings/mail', data),
  getRechargeApiSettings: () => api.get('/admin/integration-settings/recharge-api'),
  updateRechargeApiSettings: (data) => api.patch('/admin/integration-settings/recharge-api', data),
  generateRechargeApiToken: () => api.post('/admin/integration-settings/recharge-api/generate-token'),
  testRechargeApiSettings: () => api.post('/admin/integration-settings/recharge-api/test'),

  /**
   * Onboarding Screens Management
   */
  getOnboardingScreens: (role = 'user') => {
    const path = role === 'user' ? '/on-boarding' : `/on-boarding-${role}`;
    return api.get(path);
  },
  createOnboardingScreen: (payload) => api.post('/on-boarding', payload),
  updateOnboardingScreen: (id, payload) => api.patch(`/on-boarding/${id}`, payload),
  deleteOnboardingScreen: (id) => api.delete(`/on-boarding/${id}`),
};
