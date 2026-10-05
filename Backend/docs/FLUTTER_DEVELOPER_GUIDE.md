# Rentol Backend – Flutter Developer Guide

User app aur Driver app dono ke liye backend integration ki quick reference.
Yeh guide backend code padh kar banayi gayi hai (`Backend/src/modules/taxi`). Kuch bhi
confirm karna ho to route files dekhein: `user/routes`, `driver/routes`, `socket/`.

---

## 1. Basics

| Item | Value |
|---|---|
| Base URL | `{PUBLIC_BACKEND_URL}/api` ya `/api/v1` (dono same hain) |
| Health check | `GET {PUBLIC_BACKEND_URL}/health` |
| Content type | `application/json` (body limit 25 MB) |
| Auth header | `Authorization: Bearer <token>` |
| Token expiry | 7 din (`JWT_EXPIRES_IN`). Refresh token nahi hai – expire hone par dobara login |
| Realtime | Socket.IO, same host. Token: `auth: { token }` |

### Response format

Success:
```json
{ "success": true, "data": { } }
```
Error:
```json
{ "success": false, "message": "Human readable error", "details": null }
```
Validation error → `400`, duplicate → `409`, token missing/expired → `401`,
role/approval problem → `403`, rate limit → `429` (header `Retry-After` seconds me).

> Kuch list endpoints `data.results` dete hain, kuch top-level `results`. Parse karte waqt
> dono handle karein.

### Roles
`user`, `driver`, `owner`, `bus_driver`, `pooling_driver`, `service_center`,
`service_center_staff`. Token ke andar role hota hai; galat role ka token `403` deta hai.
Pending-approval driver ko most routes par `403 "Driver account is pending approval"` milta hai.

---

## 2. Login / Signup

### User app
1. `POST /users/auth/send-otp` `{ "phone": "9876543210" }` (10 digit)
   - Response me `exists` (account hai ya nahi) aate hain.
   - Dev/non-production server par `debugOtp` bhi aa sakta hai – **production me app is par depend na kare**.
2. `POST /users/auth/verify-otp` `{ "phone", "otp" }` (4 digit)
   - Account hai → `data.token` + `data.user` (login ho gaya).
   - Account nahi → `data.exists=false`, session verified. Ab signup karein.
3. `POST /users/signup` – `name`, `phone`, `email`, `gender`, optional `referralCode`,
   `employeeCode`, `profileImage`, `countryCode` (default `+91`). Verified OTP session zaroori.
   - Response `201` me `data.token`.
   - Agar `EMAIL_WELCOME_ENABLED=true` hai to server welcome + T&C email bhejta hai. **App me koi change nahi.**
4. `POST /users/login` `{ phone, password }` – password login (legacy).

Profile: `GET/PATCH /users/me`, FCM token: `POST /users/fcm-token`.

> **Use na karein:** `/users/otp-login`, `/users/register`, `/users/wallet/topup` – yeh security
> issues ki wajah se hata diye jayenge. Sirf upar wala OTP flow use karein.

### Driver app
Login: `POST /drivers/auth/send-otp` → `POST /drivers/auth/verify-otp`.

Naya driver (onboarding), sab `/drivers/onboarding/...`:

1. `POST send-otp` → `POST verify-otp` (response me `registrationId`)
2. `PATCH role` (driver / owner / service_center / staff / bus_driver)
3. `PATCH personal` (name, email, password…)
4. `PATCH referral` (optional), `PATCH vehicle`, `PATCH documents`
5. `POST complete` → `token` milta hai, lekin account **pending admin approval** rehta hai
6. `GET session/:registrationId` – progress wapas load karne ke liye
7. `GET signup-options`, `GET /drivers/document-templates`, `GET /drivers/vehicle-field-templates`
   – form fields admin se dynamic aate hain.

Approval status: `GET /drivers/approval-status`. Profile: `GET /drivers/me`.
Driver FCM token: `POST /drivers/fcm-token`.

---

## 3. Public / config endpoints (login ke bina)

- `GET /users/bootstrap` – app settings, modules, payment gateway config (30 sec cache)
- `GET /users/vehicle-types`, `/users/goods-types`, `/users/zones`, `/users/set-prices`
- `GET /users/service-locations`, `/users/rental-vehicles`
- `GET /rides/app-settings/tip` – tip settings
- `GET /user-home-management` – home screen content

---

## 4. Ride flow (taxi / parcel / intercity)

### User side

| Step | Call |
|---|---|
| Nearby drivers | `GET /rides/available-drivers?vehicleTypeId=&lat=&lng=` |
| Book | `POST /rides` |
| Active ride (app restart par) | `GET /rides/active/me` |
| Ride detail | `GET /rides/:rideId` |
| History | `GET /rides?page=&limit=&category=rides\|parcels\|outstation\|scheduled` |
| Cancel | `PATCH /rides/:rideId/cancel` |
| Rate + tip | `PATCH /rides/:rideId/feedback` |

`POST /rides` body (main fields): `pickup: [lng, lat]`, `drop: [lng, lat]`, `pickupAddress`,
`dropAddress`, `fare`, `estimatedDistanceMeters`, `estimatedDurationMinutes`, `vehicleTypeId`,
`paymentMethod` (`cash` | `online`), `serviceType` (`ride` | `parcel` | `intercity`), `tripMode`
(`one_way` | `round_trip`), optional `scheduledAt` (ISO), `promo_code`, `zone_id`,
`service_location_id`, `transport_type`, bidding fields (`bookingMode: "bidding"`, `userMaxBidFare`).

> **Dhyan:** coordinates hamesha **`[longitude, latitude]`** order me hain (lat/lng nahi).
> Abhi server `fare` client se leta hai; jaldi hi server-side calculation aayega, isliye
> fare ko "estimate API ka result" maan kar hi bhejein.

Ride status values:
- `status`: `searching`, `accepted`, `ongoing`, `completed`, `cancelled`
- `liveStatus`: `searching`, `accepted`, `arriving`, `goods_loaded`, `started`, `arrived`,
  `goods_delivered`, `completed`, `cancelled`  (`goods_*` sirf parcel ke liye)

Ride ka `otp` (4 digit) response me aata hai – rider ise driver ko batata hai.

### Bidding
- User: `GET /rides/:rideId/bids`, `POST /rides/:rideId/bids/:bidId/accept`,
  `PATCH /rides/:rideId/bids/ceiling` (`incrementSteps`)
- Driver bid socket se bhejta hai (`submitRideBid`).

### Driver side
- Online/offline: `PATCH /drivers/online`, `PATCH /drivers/offline` (online hone ke liye daily selfie URL chahiye)
- Accept: **socket** `acceptRide` `{ rideId, selfieUrl? }` (selfieUrl `https://` hi)
- Selfie baad me: `PATCH /rides/:rideId/accept-selfie` `{ selfieUrl }`
- Status badlo: `PATCH /rides/:rideId/status` `{ status, paymentMethod?, proofImageUrl?, proofNote?, receivedBy? }`
  - allowed: `accepted`, `arriving`, `goods_loaded`, `started`, `arrived`, `goods_delivered`, `completed`
  - Parcel: `goods_loaded` aur `goods_delivered` par photo URL (`proofImageUrl`) **zaroori**, aur
    `goods_delivered` ke baad hi `completed`.
  - Galat transition par `409`.
- Scheduled rides: `GET /drivers/scheduled-rides`, `POST /drivers/scheduled-rides/:rideId/cancel`
- Wallet: `GET /drivers/wallet` (balance minimum se neeche ho to rides accept nahi hongi → `403`)

---

## 5. Socket.IO

Connect:
```dart
final socket = io(baseUrl, OptionBuilder()
    .setTransports(['websocket'])
    .setAuth({'token': jwt})
    .build());
```
Token missing/invalid ho to connect error aata hai. Reconnect ke baad `ride:rejoin-current` bhejein.

### Client → Server
| Event | Payload | Kaun |
|---|---|---|
| `ride:join` | `{ rideId }` | user/driver |
| `joinRide` | `{ rideId }` | user/driver |
| `ride:rejoin-current` | – | user/driver |
| `locationUpdate` | `{ coordinates: [lng, lat] }` | driver (har few sec, online hote hue) |
| `ride:driver-location:update` | `{ rideId, coordinates, heading, speed }` | driver (ride ke dauran) |
| `acceptRide` | `{ rideId, selfieUrl? }` | driver |
| `rejectRide` | `{ rideId }` | driver |
| `submitRideBid` | `{ rideId, bidFare }` | driver |
| `ride:status:update` | `{ rideId, status, ... }` | driver (REST ka alternative) |
| `ride:message:send` | `{ rideId, message }` (max 1000 chars) | user/driver |
| `chat:send`, `chat:join`, `chat:read` | support chat | user/driver |

### Server → Client
| Event | Kab |
|---|---|
| `rideRequest` | driver ko nayi ride request (fare, pickup/drop, `expiresInSeconds`, `requestExpiresAt`) |
| `rideRequestClosed` | request band (`reason`: accepted-by-another-driver, user-cancelled, unmatched …) |
| `rideSearchUpdate` | user ko search progress (radius, attempt) |
| `rideAccepted` | user/driver ko ride accept hui (`otp`, driver info) |
| `ride:state` | poori ride state (`serializeRideRealtime`) |
| `ride:status:updated` | status change |
| `ride:driver-location:updated` / `ride:driver-route:updated` | driver ki live location / route |
| `rideCancelled` | ride cancel |
| `rideBidUpdated`, `rideBiddingUpdated` | bidding updates |
| `ride:message:new` | ride chat message |
| `driver:wallet:updated` | driver wallet change |
| `account:deleted` | account delete approve hua – logout karein |
| `errorMessage` | `{ message }` – socket action fail hua |

Driver ko request milne ke baad accept ka window `acceptRejectDurationSeconds` / `expiresInSeconds` tak hota hai.
Pehla accept jeet-ta hai; baaki ko `409 Ride is no longer available`.

---

## 6. Payments & Wallet

### User wallet
- `GET /users/wallet`
- Top-up (sirf gateway se): Razorpay `POST /users/wallet/razorpay/order` → app checkout →
  `POST /users/wallet/razorpay/verify`; PhonePe `POST /users/wallet/phonepe/order` →
  `GET /users/wallet/phonepe/status/:merchantTransactionId`
- Transfer: `POST /users/wallet/transfer`, `/users/wallet/transfer/driver`
- Gateway keys/active gateway: `GET /common/payment-gateway` ya bootstrap

### Ride payment (completion ke baad)
- Razorpay: `POST /rides/:rideId/complete-payment/razorpay/order` →
  `POST .../razorpay/verify` (`razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature`, `rating`, `tipAmount`)
- Wallet: `POST /rides/:rideId/complete-payment/wallet` (`rating`, `comment`, `tipAmount`)
- Sirf tip: `POST /rides/:rideId/tip/razorpay/order` / `/verify`
- `rating` 1–5 integer zaroori hai; tip settings se min amount check hota hai.

### Driver wallet
- `GET /drivers/wallet`, top-up `POST /drivers/wallet/top-up/razorpay/order` + `/verify`,
  PhonePe `.../phonepe/order` + `/status/:id`
- Withdrawal request: `POST /drivers/wallet/withdrawals`
- `POST /drivers/wallet/top-up` (direct) **use na karein** – hata diya jayega.

Payment verify ke liye hamesha **server se aaya order id** hi use karein, aur verify ek hi baar call karein.

---

## 7. Aur modules (short)

- **Rental:** `/users/rental-bookings`, `/users/rental-advance/{razorpay|phonepe|wallet}`, `/users/rental-quote-requests`
- **Bus:** `/users/buses/search`, `/users/buses/:id/seats`, `/users/bus-bookings/order|verify|:id/cancel`
- **Pooling:** `/users/pooling/search`, `/users/pooling/bookings/order|verify`
- **Delivery:** `/deliveries/quote`, `/deliveries`, `/deliveries/active/me`
- **Promo:** `POST /promos/validate`, `GET /promos/available`
- **Subscriptions:** `/users/subscriptions/plans|me|purchase`
- **Support tickets:** `/support/titles`, `/support/tickets`, `/support/tickets/my`, `/:ticketCode/reply`
- **Support chat:** REST `/chats/conversations`, `/chats/messages/...` + socket `chat:*`
- **SOS:** user `POST /users/sos`, driver `POST /drivers/sos`
- **Notifications:** `GET /users/notifications`, `GET /drivers/notifications`

---

## 8. Practical tips

1. Har request par `Authorization` header lagayein; `401` aaye to login screen par bhejein.
2. `403 ... pending approval` par driver ko "approval pending" screen dikhayein (`/drivers/approval-status`).
3. OTP endpoints par rate limit hai (`429`) – retry timer dikhayein.
4. App start / socket reconnect par pehle `GET /rides/active/me` call karein, phir socket join.
5. Phone number sirf 10 digit bhejein (country code alag field).
6. Images abhi base64 data URL se upload hoti hain (`/common/upload/image`, onboarding upload).
   Chhoti/compressed image bhejein; response me jo `url` mile wohi baaki APIs me use karein.
7. Time `ISO-8601` (UTC) me bhejein.

---

## 9. Backend me jo changes aane wale hain (Flutter par asar)

Security cleanup ke baad yeh badal sakta hai – app me in par hard dependency na rakhein:
- `debugOtp` response se hat jayega.
- `/users/otp-login`, `/users/register`, `/drivers/register`, direct wallet top-up endpoints band honge.
- Ride `fare` server se calculate hoga (client ka fare ignore ya validate hoga).
- Kuch public endpoints (jaise `available-drivers`, uploads) par auth/limits aa sakte hain.
