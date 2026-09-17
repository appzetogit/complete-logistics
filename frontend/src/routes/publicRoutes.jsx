import { Route } from 'react-router-dom';
import UserProtectedRoute, { UserHomeRoute } from '../guards/UserProtectedRoute';
import RideComplete from '../modules/user/pages/ride/RideComplete';
import {
  AboutPage,
  Activity,
  AddressSettings,
  AirportCab,
  AirportCabConfirm,
  BikeRentalHome,
  BlogPage,
  BusConfirm,
  BusDetails,
  BusHome,
  BusList,
  BusSeats,
  CabHome,
  CabSharing,
  CareersPage,
  ComingSoon,
  ContactPage,
  DeleteAccount,
  FaqPage,
  IntercityConfirm,
  IntercityDetails,
  IntercityHome,
  IntercityVehicle,
  LandingPage,
  LegalPage,
  LinksPage,
  Login,
  Onboarding,
  ParcelSearchingDriver,
  ParcelTracking,
  ParcelType,
  PaymentSettings,
  Profile,
  ProfileSettings,
  PromoCodes,
  RazorpayLaunchPage,
  RazorpayStatusPage,
  RentalConfirmed,
  RentalDeposit,
  RentalKYC,
  RentalSchedule,
  RentalVehicleDetail,
  RideDetail,
  RideTracking,
  SearchingDriver,
  SelectCategory,
  SelectLocation,
  SelectVehicle,
  SenderReceiverDetails,
  ServicesPage,
  SharedTaxi,
  SharedTaxiConfirm,
  SharedTaxiSeats,
  Signup,
  SOSContacts,
  SpiritualTrip,
  SpiritualTripConfirm,
  SpiritualTripVehicle,
  Support,
  SupportPage,
  SupportTicketDetail,
  SupportTickets,
  UserNotifications,
  UserReferral,
  VerifyOTP,
  Wallet,
  PhonePeStatusPage,
  Chat,
  UserAppLayout,
} from './lazyPages';

const publicRoutes = (
  <>
    <Route path="/" element={<LandingPage />} />
    <Route path="/about" element={<AboutPage />} />
    <Route path="/contact" element={<ContactPage />} />
    <Route path="/support" element={<SupportPage />} />
    <Route path="/faq" element={<FaqPage />} />
    <Route path="/services" element={<ServicesPage />} />
    <Route path="/blog" element={<BlogPage />} />
    <Route path="/careers" element={<CareersPage />} />
    <Route path="/links" element={<LinksPage />} />
    <Route path="/terms" element={<LegalPage />} />
    <Route path="/terms-and-conditions" element={<LegalPage />} />
    <Route path="/privacy" element={<LegalPage />} />
    <Route path="/privacy-policy" element={<LegalPage />} />
    <Route path="/refund" element={<LegalPage />} />
    <Route path="/cancellation" element={<LegalPage />} />
    <Route path="/phonepe/status" element={<PhonePeStatusPage />} />
    <Route path="/razorpay/launch" element={<RazorpayLaunchPage />} />
    <Route path="/razorpay/status" element={<RazorpayStatusPage />} />
    <Route path="/login" element={<Login />} />
    <Route path="/onboarding" element={<Onboarding />} />
    <Route path="/verify-otp" element={<VerifyOTP />} />
    <Route path="/signup" element={<Signup />} />
    <Route element={<UserAppLayout />}>
      <Route path="/user" element={<UserHomeRoute />} />
    </Route>

    <Route element={<UserProtectedRoute />}>
      <Route element={<UserAppLayout />}>
        <Route path="/activity" element={<Activity />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/referral" element={<UserReferral />} />
        <Route path="/promo" element={<PromoCodes />} />
        <Route path="/notifications" element={<UserNotifications />} />
        <Route path="/bus" element={<BusHome />} />
        <Route path="/ride/support" element={<Support />} />
      </Route>

      <Route path="/ride/select-category" element={<SelectCategory />} />
      <Route path="/ride/select-location" element={<SelectLocation />} />
      <Route path="/ride/select-vehicle" element={<SelectVehicle />} />
      <Route path="/ride/searching" element={<SearchingDriver />} />
      <Route path="/ride/tracking" element={<RideTracking />} />
      <Route path="/ride/complete" element={<RideComplete />} />
      <Route path="/ride/chat" element={<Chat />} />
      <Route path="/ride/detail/:id" element={<RideDetail />} />

      <Route path="/parcel/type" element={<ParcelType />} />
      <Route path="/parcel/details" element={<SenderReceiverDetails />} />
      <Route path="/parcel/contacts" element={<SenderReceiverDetails />} />
      <Route path="/parcel/searching" element={<ParcelSearchingDriver />} />
      <Route path="/parcel/tracking" element={<ParcelTracking />} />
      <Route path="/parcel/detail/:id" element={<RideDetail />} />

      <Route path="/rental" element={<BikeRentalHome />} />
      <Route path="/rental/vehicle" element={<RentalVehicleDetail />} />
      <Route path="/rental/schedule" element={<RentalSchedule />} />
      <Route path="/rental/kyc" element={<RentalKYC />} />
      <Route path="/rental/deposit" element={<RentalDeposit />} />
      <Route path="/rental/confirmed" element={<RentalConfirmed />} />
      <Route path="/intercity" element={<IntercityHome />} />
      <Route path="/intercity/vehicle" element={<IntercityVehicle />} />
      <Route path="/intercity/details" element={<IntercityDetails />} />
      <Route path="/intercity/confirm" element={<IntercityConfirm />} />
      <Route path="/cab-sharing" element={<CabSharing />} />
      <Route path="/cab" element={<CabHome />} />
      <Route path="/cab/shared" element={<SharedTaxi />} />
      <Route path="/cab/shared/seats" element={<SharedTaxiSeats />} />
      <Route path="/cab/shared/confirm" element={<SharedTaxiConfirm />} />
      <Route path="/cab/airport" element={<AirportCab />} />
      <Route path="/cab/airport-confirm" element={<AirportCabConfirm />} />
      <Route path="/cab/spiritual" element={<SpiritualTrip />} />
      <Route path="/cab/spiritual-vehicle" element={<SpiritualTripVehicle />} />
      <Route path="/cab/spiritual-confirm" element={<SpiritualTripConfirm />} />
      <Route path="/bus/list" element={<BusList />} />
      <Route path="/bus/seats" element={<BusSeats />} />
      <Route path="/bus/details" element={<BusDetails />} />
      <Route path="/bus/confirm" element={<BusConfirm />} />
      <Route path="/tours" element={<ComingSoon />} />

      <Route path="/wallet" element={<Wallet />} />

      <Route path="/profile/settings" element={<ProfileSettings />} />
      <Route path="/profile/payments" element={<PaymentSettings />} />
      <Route path="/profile/addresses" element={<AddressSettings />} />
      <Route path="/profile/notifications" element={<UserNotifications />} />
      <Route path="/profile/delete-account" element={<DeleteAccount />} />
      <Route path="/safety/sos" element={<SOSContacts />} />
      <Route path="/support/tickets" element={<SupportTickets />} />
      <Route path="/support/ticket/:id" element={<SupportTicketDetail />} />
    </Route>
  </>
);

export default publicRoutes;
