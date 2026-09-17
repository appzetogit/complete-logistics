import { Route } from 'react-router-dom';
import UserProtectedRoute, { UserHomeRoute } from '../guards/UserProtectedRoute';
import RideComplete from '../modules/user/pages/ride/RideComplete';
import {
  Activity,
  AddressSettings,
  AirportCab,
  AirportCabConfirm,
  BikeRentalHome,
  BusBookingDetail,
  BusBookings,
  BusConfirm,
  BusDetails,
  BusHome,
  BusList,
  BusPreview,
  BusSeats,
  CabHome,
  CabSharing,
  ComingSoon,
  DeleteAccount,
  IntercityConfirm,
  IntercityDetails,
  IntercityHome,
  IntercityVehicle,
  LegalPage,
  Login,
  Onboarding,
  ParcelSearchingDriver,
  ParcelTracking,
  ParcelType,
  PaymentSettings,
  Profile,
  ProfileSettings,
  PromoCodes,
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
  SharedTaxi,
  SharedTaxiConfirm,
  SharedTaxiSeats,
  Signup,
  SOSContacts,
  SpiritualTrip,
  SpiritualTripConfirm,
  SpiritualTripVehicle,
  Support,
  SupportTicketDetail,
  SupportTickets,
  UserNotifications,
  UserPoolingConfirm,
  UserPoolingHome,
  UserPoolingList,
  UserPoolingSeats,
  UserReferral,
  UserSubscriptions,
  VerifyOTP,
  Wallet,
  Chat,
  UserAppLayout,
  SplashScreen,
} from './lazyPages';

const userRoutes = (
  <>
    <Route path="/taxi/user/splash" element={<SplashScreen />} />
    <Route path="/taxi/user/onboarding" element={<Onboarding />} />
    <Route path="/taxi/user/login" element={<Login />} />
    <Route path="/taxi/user/terms" element={<LegalPage />} />
    <Route path="/taxi/user/privacy" element={<LegalPage />} />
    <Route path="/taxi/user/refund" element={<LegalPage />} />
    <Route path="/taxi/user/verify-otp" element={<VerifyOTP />} />
    <Route path="/taxi/user/signup" element={<Signup />} />
    <Route element={<UserProtectedRoute />}>
      <Route element={<UserAppLayout />}>
        <Route path="/taxi/user" element={<UserHomeRoute taxiPrefixed />} />
        <Route path="/taxi/user/activity" element={<Activity />} />
        <Route path="/taxi/user/bus" element={<BusHome />} />
        <Route path="/taxi/user/support" element={<Support />} />
        <Route path="/taxi/user/profile" element={<Profile />} />
        <Route path="/taxi/user/referral" element={<UserReferral />} />
        <Route path="/taxi/user/promo" element={<PromoCodes />} />
        <Route path="/taxi/user/notifications" element={<UserNotifications />} />
      </Route>

      <Route path="/taxi/user/ride/select-category" element={<SelectCategory />} />
      <Route path="/taxi/user/ride/select-location" element={<SelectLocation />} />
      <Route path="/taxi/user/ride/select-vehicle" element={<SelectVehicle />} />
      <Route path="/taxi/user/ride/searching" element={<SearchingDriver />} />
      <Route path="/taxi/user/ride/tracking" element={<RideTracking />} />
      <Route path="/taxi/user/ride/complete" element={<RideComplete />} />
      <Route path="/taxi/user/ride/chat" element={<Chat />} />
      <Route path="/taxi/user/ride/detail/:id" element={<RideDetail />} />

      <Route path="/taxi/user/parcel/type" element={<ParcelType />} />
      <Route path="/taxi/user/parcel/details" element={<SenderReceiverDetails />} />
      <Route path="/taxi/user/parcel/contacts" element={<SenderReceiverDetails />} />
      <Route path="/taxi/user/parcel/searching" element={<ParcelSearchingDriver />} />
      <Route path="/taxi/user/parcel/tracking" element={<ParcelTracking />} />
      <Route path="/taxi/user/parcel/detail/:id" element={<RideDetail />} />

      <Route path="/taxi/user/pooling" element={<UserPoolingHome />} />
      <Route path="/taxi/user/pooling/list" element={<UserPoolingList />} />
      <Route path="/taxi/user/pooling/seats/:id" element={<UserPoolingSeats />} />
      <Route path="/taxi/user/pooling/confirm" element={<UserPoolingConfirm />} />
      <Route path="/taxi/user/rental" element={<BikeRentalHome />} />
      <Route path="/taxi/user/rental/vehicle" element={<RentalVehicleDetail />} />
      <Route path="/taxi/user/rental/schedule" element={<RentalSchedule />} />
      <Route path="/taxi/user/rental/kyc" element={<RentalKYC />} />
      <Route path="/taxi/user/rental/deposit" element={<RentalDeposit />} />
      <Route path="/taxi/user/rental/confirmed" element={<RentalConfirmed />} />
      <Route path="/taxi/user/intercity" element={<IntercityHome />} />
      <Route path="/taxi/user/intercity/vehicle" element={<IntercityVehicle />} />
      <Route path="/taxi/user/intercity/details" element={<IntercityDetails />} />
      <Route path="/taxi/user/intercity/confirm" element={<IntercityConfirm />} />
      <Route path="/taxi/user/cab-sharing" element={<CabSharing />} />
      <Route path="/taxi/user/cab" element={<CabHome />} />
      <Route path="/taxi/user/cab/shared" element={<SharedTaxi />} />
      <Route path="/taxi/user/cab/shared/seats" element={<SharedTaxiSeats />} />
      <Route path="/taxi/user/cab/shared/confirm" element={<SharedTaxiConfirm />} />
      <Route path="/taxi/user/cab/airport" element={<AirportCab />} />
      <Route path="/taxi/user/cab/airport-confirm" element={<AirportCabConfirm />} />
      <Route path="/taxi/user/cab/spiritual" element={<SpiritualTrip />} />
      <Route path="/taxi/user/cab/spiritual-vehicle" element={<SpiritualTripVehicle />} />
      <Route path="/taxi/user/cab/spiritual-confirm" element={<SpiritualTripConfirm />} />
      <Route path="/taxi/user/bus/list" element={<BusList />} />
      <Route path="/taxi/user/bus/seats" element={<BusSeats />} />
      <Route path="/taxi/user/bus/details" element={<BusPreview />} />
      <Route path="/taxi/user/bus/checkout" element={<BusDetails />} />
      <Route path="/taxi/user/bus/confirm" element={<BusConfirm />} />
      <Route path="/taxi/user/tours" element={<ComingSoon />} />

      <Route path="/taxi/user/wallet" element={<Wallet />} />

      <Route path="/taxi/user/profile/settings" element={<ProfileSettings />} />
      <Route path="/taxi/user/profile/payments" element={<PaymentSettings />} />
      <Route path="/taxi/user/profile/addresses" element={<AddressSettings />} />
      <Route path="/taxi/user/profile/bus-bookings" element={<BusBookings />} />
      <Route path="/taxi/user/profile/bus-bookings/:id" element={<BusBookingDetail />} />
      <Route path="/taxi/user/profile/subscriptions" element={<UserSubscriptions />} />
      <Route path="/taxi/user/profile/notifications" element={<UserNotifications />} />
      <Route path="/taxi/user/profile/delete-account" element={<DeleteAccount />} />
      <Route path="/taxi/user/safety/sos" element={<SOSContacts />} />
      <Route path="/taxi/user/support/tickets" element={<SupportTickets />} />
      <Route path="/taxi/user/support/ticket/:id" element={<SupportTicketDetail />} />
    </Route>
  </>
);

export default userRoutes;
