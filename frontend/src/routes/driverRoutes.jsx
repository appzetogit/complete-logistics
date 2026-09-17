import { Navigate, Route } from 'react-router-dom';
import DriverLayout from '../modules/driver/components/DriverLayout';
import { getAuthenticatedDriverRole, getLocalDriverToken } from '../modules/driver/services/registrationService';
import {
  ActiveTrip,
  AddDriver,
  AddVehicle,
  ApplicationStatus,
  BusDriverHome,
  BusDriverLiveRoute,
  BusSignupBuilderPage,
  Chat,
  DriverBankDetailsPage,
  DriverDeleteAccount,
  DriverDocuments,
  DriverHelpSupportOptions,
  DriverHome,
  DriverIncentives,
  DriverProfile,
  DriverSupportChat,
  DriverWallet,
  EditProfile,
  LegalPage,
  ManageDrivers,
  Notifications,
  OTPVerification,
  PhoneRegistration,
  PoolingDriverBookings,
  PoolingDriverDashboard,
  PoolingDriverOnboarding,
  PoolingDriverPendingStatus,
  PortalSupportPage,
  PayoutMethods,
  Referral,
  RegistrationStatus,
  RideRequests,
  RoleSelection,
  RoleSpecificOnboarding,
  SecuritySOS,
  ServiceCenterDashboard,
  ServiceCenterVehicleDetails,
  StepDocuments,
  StepPersonal,
  StepReferral,
  StepVehicle,
  SupportTicketDetail,
  SupportTickets,
  VehicleFleet,
} from './lazyPages';

export const DriverEntryRedirect = () => {
  const token = getLocalDriverToken();
  const role = String(getAuthenticatedDriverRole() || 'driver').toLowerCase();

  if (!token) {
    return <Navigate to="/taxi/driver/login" replace />;
  }

  return (
    <Navigate
      to={
        role === 'owner'
          ? '/taxi/owner/dashboard'
          : role === 'service_center'
            ? '/taxi/driver/service-center'
            : role === 'service_center_staff'
              ? '/taxi/driver/service-center'
              : role === 'bus_driver'
                ? '/taxi/driver/bus-home'
                : role === 'pooling_driver'
                  ? '/taxi/driver/pooling'
                  : '/taxi/driver/home'
      }
      replace
    />
  );
};

const driverRoutes = (
  <Route path="/taxi/driver" element={<DriverLayout />}>
    <Route index element={<DriverEntryRedirect />} />
    <Route path="lang-select" element={<Navigate to="/taxi/driver/login" replace />} />
    <Route path="welcome" element={<Navigate to="/taxi/driver/login" replace />} />
    <Route path="login" element={<PhoneRegistration />} />
    <Route path="terms" element={<LegalPage />} />
    <Route path="privacy" element={<LegalPage />} />
    <Route path="reg-phone" element={<Navigate to="/taxi/driver/login" replace />} />
    <Route path="otp-verify" element={<OTPVerification />} />
    <Route path="select-role" element={<RoleSelection />} />
    <Route path="step-personal" element={<StepPersonal />} />
    <Route path="role-signup" element={<RoleSpecificOnboarding />} />
    <Route path="role-signup/bus-builder" element={<Navigate to="/taxi/driver/role-signup/bus-builder/create" replace />} />
    <Route path="role-signup/bus-builder/create" element={<BusSignupBuilderPage />} />
    <Route path="role-signup/bus-builder/edit/:id" element={<BusSignupBuilderPage />} />
    <Route path="step-referral" element={<StepReferral />} />
    <Route path="step-vehicle" element={<StepVehicle />} />
    <Route path="step-documents" element={<StepDocuments />} />
    <Route path="registration-status" element={<RegistrationStatus />} />
    <Route path="status" element={<ApplicationStatus />} />

    <Route path="home" element={<DriverHome />} />
    <Route path="bus-home" element={<BusDriverHome />} />
    <Route path="bus-home/live-route" element={<BusDriverLiveRoute />} />
    <Route path="pooling" element={<PoolingDriverDashboard />} />
    <Route path="pooling/onboarding" element={<PoolingDriverOnboarding />} />
    <Route path="pooling/status" element={<PoolingDriverPendingStatus />} />
    <Route path="pooling/bookings" element={<PoolingDriverBookings />} />
    <Route path="dashboard" element={<DriverHome />} />
    <Route path="active-trip" element={<ActiveTrip />} />
    <Route path="chat" element={<Chat />} />
    <Route path="wallet" element={<DriverWallet />} />
    <Route path="profile" element={<DriverProfile />} />
    <Route path="profile/bank-details" element={<DriverBankDetailsPage />} />
    <Route path="service-center" element={<ServiceCenterDashboard />} />
    <Route path="service-center/vehicles/new" element={<ServiceCenterVehicleDetails />} />
    <Route path="service-center/vehicles/:vehicleId" element={<ServiceCenterVehicleDetails />} />
    <Route path="history" element={<RideRequests />} />
    <Route path="incentives" element={<DriverIncentives />} />

    <Route path="edit-profile" element={<EditProfile />} />
    <Route path="documents" element={<DriverDocuments />} />
    <Route path="notifications" element={<Notifications />} />
    <Route path="payout-methods" element={<PayoutMethods />} />
    <Route path="referral" element={<Referral />} />
    <Route path="delete-account" element={<DriverDeleteAccount />} />
    <Route path="security" element={<SecuritySOS />} />
    <Route path="support" element={<PortalSupportPage />} />
    <Route path="help-support" element={<DriverHelpSupportOptions />} />
    <Route path="support/chat" element={<DriverSupportChat />} />
    <Route path="support/tickets" element={<SupportTickets />} />
    <Route path="support/ticket/:id" element={<SupportTicketDetail />} />
    <Route path="vehicle-fleet" element={<VehicleFleet />} />
    <Route path="vehicle-fleet/edit/:vehicleId" element={<VehicleFleet />} />
    <Route path="add-vehicle" element={<AddVehicle />} />
    <Route path="manage-drivers" element={<ManageDrivers />} />
    <Route path="add-driver" element={<AddDriver />} />
    <Route path="edit-driver/:driverId" element={<AddDriver />} />
  </Route>
);

export default driverRoutes;
