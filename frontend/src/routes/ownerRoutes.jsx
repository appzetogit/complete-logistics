import { Navigate, Route } from 'react-router-dom';
import DriverLayout from '../modules/driver/components/DriverLayout';
import { DriverEntryRedirect } from './driverRoutes';
import {
  AddDriver,
  AddVehicle,
  ApplicationStatus,
  DriverBankDetailsPage,
  DriverDeleteAccount,
  DriverDocuments,
  DriverHelpSupportOptions,
  DriverProfile,
  DriverSupportChat,
  DriverWallet,
  EditProfile,
  LegalPage,
  ManageDrivers,
  Notifications,
  OTPVerification,
  OwnerBusBookingsPage,
  OwnerBusServicePage,
  OwnerDashboard,
  OwnerPoolingVehicleForm,
  OwnerVehicleFleet,
  PhoneRegistration,
  PortalSupportPage,
  PayoutMethods,
  Referral,
  RegistrationStatus,
  RideRequests,
  RoleSelection,
  RoleSpecificOnboarding,
  SecuritySOS,
  StepDocuments,
  StepPersonal,
  StepReferral,
  StepVehicle,
  SupportTicketDetail,
  SupportTickets,
} from './lazyPages';

const ownerRoutes = (
  <Route path="/taxi/owner" element={<DriverLayout />}>
    <Route index element={<DriverEntryRedirect />} />
    <Route path="login" element={<PhoneRegistration />} />
    <Route path="terms" element={<LegalPage />} />
    <Route path="privacy" element={<LegalPage />} />
    <Route path="reg-phone" element={<Navigate to="/taxi/owner/login" replace />} />
    <Route path="otp-verify" element={<OTPVerification />} />
    <Route path="select-role" element={<RoleSelection />} />
    <Route path="lang-select" element={<Navigate to="/taxi/owner/login" replace />} />
    <Route path="step-personal" element={<StepPersonal />} />
    <Route path="role-signup" element={<RoleSpecificOnboarding />} />
    <Route path="step-referral" element={<StepReferral />} />
    <Route path="step-vehicle" element={<StepVehicle />} />
    <Route path="step-documents" element={<StepDocuments />} />
    <Route path="registration-status" element={<RegistrationStatus />} />
    <Route path="status" element={<ApplicationStatus />} />
    <Route path="home" element={<OwnerDashboard />} />
    <Route path="dashboard" element={<OwnerDashboard />} />
    <Route path="bus-service" element={<OwnerBusServicePage />} />
    <Route path="bus-service/create" element={<OwnerBusServicePage />} />
    <Route path="bus-service/edit/:id" element={<OwnerBusServicePage />} />
    <Route path="bus-service/:id" element={<OwnerBusServicePage />} />
    <Route path="bus-bookings" element={<OwnerBusBookingsPage />} />
    <Route path="pooling-vehicles" element={<OwnerPoolingVehicleForm />} />
    <Route path="pooling-vehicles/create" element={<OwnerPoolingVehicleForm />} />
    <Route path="profile" element={<DriverProfile />} />
    <Route path="profile/bank-details" element={<DriverBankDetailsPage />} />
    <Route path="wallet" element={<DriverWallet />} />
    <Route path="history" element={<RideRequests />} />
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
    <Route path="vehicle-fleet" element={<OwnerVehicleFleet />} />
    <Route path="vehicle-fleet/edit/:vehicleId" element={<OwnerVehicleFleet />} />
    <Route path="add-vehicle" element={<AddVehicle />} />
    <Route path="manage-drivers" element={<ManageDrivers />} />
    <Route path="add-driver" element={<AddDriver />} />
    <Route path="edit-driver/:driverId" element={<AddDriver />} />
  </Route>
);

export default ownerRoutes;
