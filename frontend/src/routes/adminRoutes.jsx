import { FileText } from 'lucide-react';
import { Navigate, Route, useLocation, useNavigate } from 'react-router-dom';
import {
  AdminAdminCreate,
  AdminAdmins,
  AdminAppModules,
  AdminAirportManagement,
  AdminBannerImage,
  AdminBidRideSettings,
  AdminBlockedFleetDrivers,
  AdminBusBookingManager,
  AdminChat,
  AdminBusCommissionManager,
  AdminBusServiceDetails,
  AdminBusServiceManager,
  AdminCareerApplications,
  AdminCMSBuilder,
  AdminCountryManagement,
  AdminCreatePackagePrice,
  AdminCustomizationSettings,
  AdminDashboard,
  AdminDeleteRequestUsers,
  AdminDeliveries,
  AdminDeletedOwners,
  AdminDispatcherAddons,
  AdminDriverAudit,
  AdminDriverBulkUpload,
  AdminDriverCreate,
  AdminDriverDeleteRequests,
  AdminDriverDetails,
  AdminDriverDocumentForm,
  AdminDriverDutyReport,
  AdminDriverEdit,
  AdminDriverImportCreate,
  AdminDriverIncentive,
  AdminDriverList,
  AdminDriverRatingDetail,
  AdminDriverRatings,
  AdminDriverReferralSettings,
  AdminDriverReport,
  AdminDriverSubscriptionCreate,
  AdminDriverSubscriptions,
  AdminDriverWallet,
  AdminEarnings,
  AdminEmployeeCreate,
  AdminEmployeeDetails,
  AdminEmployeeList,
  AdminFinance,
  AdminFinanceReport,
  AdminFirebaseSettings,
  AdminFleetDriverCreate,
  AdminFleetDrivers,
  AdminFleetFinanceReport,
  AdminFleetNeededDocuments,
  AdminFleetNeededDocumentsCreate,
  AdminGeneralSettings,
  AdminGeoFencing,
  AdminGodsEye,
  AdminGoodsTypes,
  AdminGlobalDocuments,
  AdminHeaderFooter,
  AdminHeatMap,
  AdminJobPositions,
  AdminLanguages,
  AdminLayout,
  AdminLogin,
  AdminMailSettings,
  AdminManageFleet,
  AdminManageFleetCreate,
  AdminManageOwners,
  AdminMapSettings,
  AdminNegativeBalanceDrivers,
  AdminNotificationChannels,
  AdminOngoing,
  AdminOnboardingScreens,
  AdminOwnerBookings,
  AdminOwnerCreate,
  AdminOwnerDashboard,
  AdminOwnerDetails,
  AdminOwnerNeededDocuments,
  AdminOwnerNeededDocumentsCreate,
  AdminOwnerPasswordUpdate,
  AdminOwnerReport,
  AdminPaymentGateways,
  AdminRechargeApiSettings,
  AdminPaymentMethods,
  AdminPendingBusDrivers,
  AdminPendingDrivers,
  AdminPendingOwners,
  AdminPendingPoolingDrivers,
  AdminPendingServiceStaff,
  AdminPendingServiceStores,
  AdminPoolingBookings,
  AdminPoolingCommissionManager,
  AdminPoolingManager,
  AdminPoolingVehicleForm,
  AdminPoolingVehicles,
  AdminPreferences,
  AdminPromoCodes,
  AdminReferralDashboard,
  AdminReferralTranslation,
  AdminRentalBookingRequests,
  AdminRentalCommissionManager,
  AdminRentalPackageTypes,
  AdminRentalQuoteRequests,
  AdminRentalTracking,
  AdminRentalTrackingDetail,
  AdminRentalVehicleTypes,
  AdminSMSGateways,
  AdminSafetyCenter,
  AdminSendNotification,
  AdminServiceLocation,
  AdminServiceStores,
  AdminSetPackagePrices,
  AdminSetPrices,
  AdminSupportTickets,
  AdminSupportTicketTitle,
  AdminSurgePricing,
  AdminTipSettings,
  AdminTransportRideSettings,
  AdminTrips,
  AdminUserBulkUpload,
  AdminUserCreate,
  AdminUserDetails,
  AdminUserImportCreate,
  AdminUserList,
  AdminUserReferralSettings,
  AdminUserReport,
  AdminUserSubscriptionCreate,
  AdminUserSubscriptions,
  AdminVehicleType,
  AdminWalletPayment,
  AdminWalletSettings,
  AdminWithdrawalRequestDetail,
  AdminWithdrawalRequestDrivers,
  AdminWithdrawalRequestOwnerDetail,
  AdminWithdrawalRequestOwners,
  AdminZoneManagement,
  AdminUserAppManagement,
} from './lazyPages';

const AdminReportPlaceholder = ({ title }) => (
  <div className="flex flex-col items-center justify-center min-h-[500px] text-gray-400 bg-white rounded-[32px] border border-gray-100 shadow-sm p-10 mx-6">
    <FileText size={60} strokeWidth={1} className="mb-6 opacity-20" />
    <h2 className="text-xl font-black text-gray-900 uppercase tracking-widest">{title}</h2>
    <p className="mt-2 font-bold italic tracking-tight text-primary">Report engine initializing...</p>
  </div>
);

const AdminSectionPlaceholder = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const title = location.pathname
    .split('/')
    .filter(Boolean)
    .slice(1)
    .join(' / ')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

  return (
    <div className="flex items-center justify-center min-h-[70vh]">
      <div className="max-w-xl w-full bg-white rounded-[32px] border border-gray-100 shadow-sm p-10 text-center">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-5">
          <FileText size={28} />
        </div>
        <h2 className="text-2xl font-black text-gray-950 uppercase tracking-tight">{title || 'Page Not Found'}</h2>
        <p className="mt-3 text-sm font-medium text-gray-500 leading-6">
          The requested page could not be found or is currently under setup. Please check the URL or return to the dashboard.
        </p>
        <button
          type="button"
          onClick={() => navigate('/admin/dashboard')}
          className="mt-8 inline-flex items-center justify-center px-6 py-3 rounded-xl bg-[#2563EB] text-white text-[12px] font-black uppercase tracking-widest shadow-lg shadow-blue-900/20"
        >
          Back to Dashboard
        </button>
      </div>
    </div>
  );
};

const adminRoutes = (
  <>
    <Route path="/admin/login" element={<AdminLogin />} />
    <Route path="/user-import/create" element={<AdminLayout />}>
      <Route index element={<AdminUserImportCreate />} />
    </Route>
    <Route path="/driver-import/create" element={<AdminLayout />}>
      <Route index element={<AdminDriverImportCreate />} />
    </Route>
    <Route path="/owner/create" element={<AdminLayout />}>
      <Route index element={<AdminOwnerCreate />} />
    </Route>
    <Route path="/admin" element={<AdminLayout />}>
      <Route index element={<Navigate to="/admin/dashboard" />} />
      <Route path="dashboard" element={<AdminDashboard />} />
      <Route path="earnings" element={<AdminEarnings />} />
      <Route path="chat" element={<AdminChat />} />
      <Route path="trips" element={<AdminTrips />} />
      <Route path="deliveries" element={<AdminDeliveries />} />
      <Route path="ongoing" element={<AdminOngoing />} />
      <Route path="bus-service" element={<AdminBusServiceManager />} />
      <Route path="bus-service/pending-drivers" element={<AdminPendingBusDrivers />} />
      <Route path="bus-service/create" element={<AdminBusServiceManager mode="create" />} />
      <Route path="bus-service/edit/:id" element={<AdminBusServiceManager mode="edit" />} />
      <Route path="bus-service/commission" element={<AdminBusCommissionManager />} />
      <Route path="bus-service/bookings" element={<AdminBusBookingManager />} />
      <Route path="bus-service/:id" element={<AdminBusServiceDetails />} />
      <Route path="pooling" element={<Navigate to="/admin/pooling/routes" replace />} />
      <Route path="pooling/routes" element={<AdminPoolingManager />} />
      <Route path="pooling/pending-drivers" element={<AdminPendingPoolingDrivers />} />
      <Route path="pooling/create" element={<AdminPoolingManager mode="create" />} />
      <Route path="pooling/edit/:id" element={<AdminPoolingManager mode="edit" />} />
      <Route path="pooling/vehicles" element={<AdminPoolingVehicles />} />
      <Route path="pooling/commission" element={<AdminPoolingCommissionManager />} />
      <Route path="pooling/vehicles/create" element={<AdminPoolingVehicleForm />} />
      <Route path="pooling/vehicles/edit/:id" element={<AdminPoolingVehicleForm />} />
      <Route path="pooling/vehicles/view/:id" element={<AdminPoolingVehicleForm mode="view" />} />
      <Route path="pooling/bookings" element={<AdminPoolingBookings />} />
      <Route path="wallet/payment" element={<AdminWalletPayment />} />
      <Route path="users" element={<AdminUserList />} />
      <Route path="users/create" element={<AdminUserCreate />} />
      <Route path="users/subscriptions" element={<AdminUserSubscriptions />} />
      <Route path="users/subscriptions/create" element={<AdminUserSubscriptionCreate />} />
      <Route path="users/:id" element={<AdminUserDetails />} />
      <Route path="users/delete-requests" element={<AdminDeleteRequestUsers />} />
      <Route path="users/bulk-upload" element={<AdminUserBulkUpload />} />
      <Route path="user-import/create" element={<AdminUserImportCreate />} />

      <Route path="drivers" element={<AdminDriverList />} />
      <Route path="drivers/active" element={<AdminDriverList mode="active" />} />
      <Route path="drivers/create" element={<AdminDriverCreate />} />
      <Route path="drivers/edit/:id" element={<AdminDriverEdit />} />
      <Route path="drivers/:id" element={<AdminDriverDetails />} />
      <Route path="drivers/pending" element={<AdminPendingDrivers />} />
      <Route path="drivers/subscription" element={<AdminDriverSubscriptions />} />
      <Route path="drivers/subscription/create" element={<AdminDriverSubscriptionCreate />} />
      <Route path="drivers/ratings" element={<AdminDriverRatings />} />
      <Route path="drivers/ratings/:id" element={<AdminDriverRatingDetail />} />
      <Route path="drivers/wallet" element={<AdminDriverWallet />} />
      <Route path="drivers/wallet/negative" element={<AdminNegativeBalanceDrivers />} />
      <Route path="drivers/wallet/withdrawals" element={<AdminWithdrawalRequestDrivers />} />
      <Route path="drivers/wallet/withdrawals/:id" element={<AdminWithdrawalRequestDetail />} />
      <Route path="drivers/delete-requests" element={<AdminDriverDeleteRequests />} />
      <Route path="drivers/documents" element={<AdminGlobalDocuments />} />
      <Route path="drivers/documents/create" element={<AdminDriverDocumentForm />} />
      <Route path="drivers/documents/edit/:id" element={<AdminDriverDocumentForm />} />
      <Route path="drivers/bulk-upload" element={<AdminDriverBulkUpload />} />
      <Route path="driver-import/create" element={<AdminDriverImportCreate />} />
      <Route path="drivers/payment-methods" element={<AdminPaymentMethods />} />
      <Route path="drivers/audit/:id" element={<AdminDriverAudit />} />
      <Route path="employees" element={<AdminEmployeeList />} />
      <Route path="employees/create" element={<AdminEmployeeCreate />} />
      <Route path="employees/edit/:id" element={<AdminEmployeeCreate />} />
      <Route path="employees/:id" element={<AdminEmployeeDetails />} />
      <Route path="referrals/dashboard" element={<AdminReferralDashboard />} />
      <Route path="referrals/user-settings" element={<AdminUserReferralSettings />} />
      <Route path="referrals/driver-settings" element={<AdminDriverReferralSettings />} />
      <Route path="referrals/translation" element={<AdminReferralTranslation />} />
      <Route path="promotions/promo-codes" element={<AdminPromoCodes />} />
      <Route path="promotions/promo-codes/create" element={<AdminPromoCodes />} />
      <Route path="promotions/promo-codes/edit/:id" element={<AdminPromoCodes />} />
      <Route path="promotions/send-notification" element={<AdminSendNotification />} />
      <Route path="promotions/send-notification/create" element={<AdminSendNotification />} />
      <Route path="promotions/banner-image" element={<AdminBannerImage />} />
      <Route path="promotions/banner-image/create" element={<AdminBannerImage />} />

      <Route path="management/admins" element={<AdminAdmins />} />
      <Route path="management/admins/create" element={<AdminAdminCreate />} />
      <Route path="management/admins/edit/:id" element={<AdminAdminCreate />} />

      <Route path="owners/dashboard" element={<AdminOwnerDashboard />} />
      <Route path="owners/pending" element={<AdminPendingOwners />} />
      <Route path="owners" element={<AdminManageOwners />} />
      <Route path="owners/create" element={<AdminOwnerCreate />} />
      <Route path="owners/:id/password" element={<AdminOwnerPasswordUpdate />} />
      <Route path="owners/:id" element={<AdminOwnerDetails />} />
      <Route path="owners/:id/documents" element={<AdminOwnerDetails />} />
      <Route path="owners/wallet/withdrawals" element={<AdminWithdrawalRequestOwners />} />
      <Route path="owners/wallet/withdrawals/:id" element={<AdminWithdrawalRequestOwnerDetail />} />
      <Route path="fleet/drivers" element={<AdminFleetDrivers />} />
      <Route path="fleet/drivers/create" element={<AdminFleetDriverCreate />} />
      <Route path="fleet/blocked" element={<AdminBlockedFleetDrivers />} />
      <Route path="fleet/documents" element={<AdminFleetNeededDocuments />} />
      <Route path="fleet/documents/create" element={<AdminFleetNeededDocumentsCreate />} />
      <Route path="fleet/manage" element={<AdminManageFleet />} />
      <Route path="fleet/manage/create" element={<AdminManageFleetCreate />} />
      <Route path="owners/documents" element={<AdminOwnerNeededDocuments />} />
      <Route path="owners/documents/create" element={<AdminOwnerNeededDocumentsCreate />} />
      <Route path="owners/deleted" element={<AdminDeletedOwners />} />
      <Route path="owners/bookings" element={<AdminOwnerBookings />} />
      <Route
        path="referrals/config"
        element={
          <div className="flex items-center justify-center min-h-[500px] text-gray-400 font-bold uppercase tracking-widest">
            Referral Configuration - Under Setup
          </div>
        }
      />
      <Route
        path="referrals/active"
        element={
          <div className="flex items-center justify-center min-h-[500px] text-gray-400 font-bold uppercase tracking-widest">
            Active Referrals Logs - Under Setup
          </div>
        }
      />
      <Route path="geo/heatmap" element={<AdminHeatMap />} />
      <Route path="geo/gods-eye" element={<AdminGodsEye />} />
      <Route path="geo/peak-zone" element={<AdminGeoFencing />} />
      <Route path="geo/*" element={<AdminGeoFencing />} />
      <Route path="finance" element={<AdminFinance />} />
      <Route path="pricing">
        <Route index element={<Navigate to="service-location" />} />
        <Route path="service-location" element={<AdminServiceLocation />} />
        <Route path="service-location/jurisdictions" element={<AdminServiceLocation mode="jurisdictions" />} />
        <Route path="service-location/jurisdictions/:jurisdictionName" element={<AdminServiceLocation mode="jurisdictions" />} />
        <Route path="service-location/add" element={<AdminServiceLocation mode="create" />} />
        <Route path="service-location/edit/:id" element={<AdminServiceLocation mode="edit" />} />
        <Route path="service-stores" element={<AdminServiceStores />} />
        <Route path="service-stores/pending" element={<AdminPendingServiceStores />} />
        <Route path="service-stores/pending-staff" element={<AdminPendingServiceStaff />} />
        <Route path="rental-commission" element={<AdminRentalCommissionManager />} />
        <Route path="service-stores/add" element={<AdminServiceStores mode="create" />} />
        <Route path="service-stores/edit/:id" element={<AdminServiceStores mode="edit" />} />
        <Route path="app-modules" element={<AdminAppModules />} />
        <Route path="app-modules/create" element={<AdminAppModules mode="create" />} />
        <Route path="app-modules/edit/:id" element={<AdminAppModules mode="edit" />} />
        <Route path="zone" element={<AdminZoneManagement />} />
        <Route path="zone/create" element={<AdminZoneManagement mode="create" />} />
        <Route path="zone/edit/:id" element={<AdminZoneManagement mode="edit" />} />
        <Route path="zone/view/:id" element={<AdminZoneManagement mode="view" />} />
        <Route path="airport" element={<AdminAirportManagement />} />
        <Route path="airport/create" element={<AdminAirportManagement mode="create" />} />
        <Route path="airport/edit/:id" element={<AdminAirportManagement mode="edit" />} />
        <Route path="vehicle-type" element={<AdminVehicleType />} />
        <Route path="vehicle-type/create" element={<AdminVehicleType mode="create" />} />
        <Route path="vehicle-type/edit/:id" element={<AdminVehicleType mode="edit" />} />
        <Route path="rental-vehicles" element={<AdminRentalVehicleTypes />} />
        <Route path="rental-vehicles/create" element={<AdminRentalVehicleTypes mode="create" />} />
        <Route path="rental-vehicles/edit/:id" element={<AdminRentalVehicleTypes mode="edit" />} />
        <Route path="rental-vehicles/view/:id" element={<AdminRentalVehicleTypes mode="view" />} />
        <Route path="rental-tracking" element={<AdminRentalTracking />} />
        <Route path="rental-tracking/:id" element={<AdminRentalTrackingDetail />} />
        <Route path="rental-requests" element={<AdminRentalBookingRequests />} />
        <Route path="rental-quotes" element={<AdminRentalQuoteRequests />} />
        <Route path="rental-packages" element={<AdminRentalPackageTypes />} />
        <Route path="rental-packages/create" element={<AdminRentalPackageTypes mode="create" />} />
        <Route path="rental-packages/edit/:id" element={<AdminRentalPackageTypes mode="edit" />} />
        <Route path="set-price" element={<AdminSetPrices />} />
        <Route path="set-price/create" element={<AdminSetPrices mode="create" />} />
        <Route path="set-price/edit/:id" element={<AdminSetPrices mode="edit" />} />
        <Route path="set-price/packages/:id" element={<AdminSetPackagePrices />} />
        <Route path="set-price/packages/create/:id" element={<AdminCreatePackagePrice mode="create" />} />
        <Route path="set-price/packages/edit/:packageId" element={<AdminCreatePackagePrice mode="edit" />} />
        <Route path="package-pricing" element={<AdminSetPackagePrices />} />
        <Route path="package-pricing/create" element={<AdminCreatePackagePrice mode="create" />} />
        <Route path="package-pricing/edit/:packageId" element={<AdminCreatePackagePrice mode="edit" />} />
        <Route path="set-price/incentive/:id" element={<AdminDriverIncentive />} />
        <Route path="set-price/surge/:id" element={<AdminSurgePricing />} />
        <Route path="goods-types" element={<AdminGoodsTypes />} />
        <Route path="goods-types/create" element={<AdminGoodsTypes mode="create" />} />
        <Route path="goods-types/edit/:id" element={<AdminGoodsTypes mode="edit" />} />
      </Route>
      <Route path="safety" element={<AdminSafetyCenter />} />
      <Route path="cms" element={<AdminCMSBuilder />} />
      <Route path="settings/cms/header-footer" element={<AdminHeaderFooter />} />
      <Route path="support/ticket-title" element={<AdminSupportTicketTitle />} />
      <Route path="support/tickets" element={<AdminSupportTickets />} />
      <Route path="careers/jobs" element={<AdminJobPositions />} />
      <Route path="careers/applications" element={<AdminCareerApplications />} />
      <Route path="*" element={<AdminSectionPlaceholder />} />

      <Route path="reports/user" element={<AdminUserReport />} />
      <Route path="reports/driver" element={<AdminDriverReport />} />
      <Route path="reports/driver-duty" element={<AdminDriverDutyReport />} />
      <Route path="reports/owner" element={<AdminOwnerReport />} />
      <Route path="reports/finance" element={<AdminFinanceReport />} />
      <Route path="reports/fleet-finance" element={<AdminFleetFinanceReport />} />

      <Route path="masters/languages" element={<AdminLanguages />} />
      <Route path="masters/countries" element={<AdminCountryManagement />} />
      <Route path="masters/preferences" element={<AdminPreferences />} />
      <Route path="masters/roles" element={<Navigate to="/admin/management/admins" replace />} />

      <Route path="settings/business/general" element={<AdminGeneralSettings />} />
      <Route path="settings/business/customization" element={<AdminCustomizationSettings />} />
      <Route path="settings/business/transport-ride" element={<AdminTransportRideSettings />} />
      <Route path="settings/business/bid-ride" element={<AdminBidRideSettings />} />

      <Route path="settings/app/wallet" element={<AdminWalletSettings />} />
      <Route path="settings/app/tip" element={<AdminTipSettings />} />
      <Route path="settings/app/country" element={<AdminCountryManagement />} />
      <Route path="settings/app/onboard" element={<AdminOnboardingScreens />} />

      <Route path="settings/user-app/home-sections" element={<AdminUserAppManagement tab="home-sections" />} />
      <Route path="settings/user-app/everything-in-minutes" element={<AdminUserAppManagement tab="everything" />} />
      <Route path="settings/user-app/explore-cards" element={<AdminUserAppManagement tab="explore" />} />
      <Route path="settings/user-app/promo-banners" element={<AdminUserAppManagement tab="promos" />} />
      <Route path="settings/user-app/go-places" element={<AdminUserAppManagement tab="go-places" />} />
      <Route path="settings/user-app/footer-content" element={<AdminUserAppManagement tab="footer" />} />

      <Route path="settings/business/*" element={<AdminGeneralSettings />} />
      <Route path="settings/app/*" element={<AdminGeneralSettings />} />

      <Route path="settings/third-party/payment" element={<AdminPaymentGateways />} />
      <Route path="settings/third-party/sms" element={<AdminSMSGateways />} />
      <Route path="settings/third-party/firebase" element={<AdminFirebaseSettings />} />
      <Route path="settings/third-party/map-apis" element={<AdminMapSettings />} />
      <Route path="settings/third-party/mail" element={<AdminMailSettings />} />
      <Route path="settings/third-party/notification-channel" element={<AdminNotificationChannels />} />
      <Route path="settings/third-party/recharge-api" element={<AdminRechargeApiSettings />} />
      <Route path="settings/addons/dispatcher" element={<AdminDispatcherAddons />} />
      <Route path="settings/addons/*" element={<AdminReportPlaceholder title="Addons Management" />} />
      <Route path="settings/cms/*" element={<AdminReportPlaceholder title="CMS Management" />} />
    </Route>

    <Route path="*" element={<Navigate to="/" />} />
  </>
);

export default adminRoutes;
