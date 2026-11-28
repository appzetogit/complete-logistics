# Cashfree integration: end-to-end analysis of the current payment system

Read-only analysis of `Backend` (and how the web and Flutter apps use it). Nothing was changed. Paths are relative to `Backend/src/modules/taxi` unless stated. Line numbers are approximate. Items marked *(unverified)* were not fully read.

---

## 1. Summary

- Online payments run on **Razorpay** (everything) and **PhonePe** (wallet top-up and rental advance only). **Stripe** exists only as dead config.
- Which gateway is "active" is an Admin setting (one at a time). The backend does **not** switch flows by it: every flow calls its gateway directly. The apps read the active gateway and choose the flow.
- There is **no common payment layer**. Razorpay code is copied into 6 files, the HMAC check into 8 places, PhonePe code into 2. Adding Cashfree the same way would mean touching about 25 functions.
- **Refunds, webhooks and idempotency are inconsistent**: ride and goods-advance payments are well protected (unique indexes, transactions, webhooks, refunds); wallet top-up, rental advance, pooling and tip are not.
- Cashfree needs **only the Payment Gateway APIs** (orders, payments, refunds, webhooks). **Payouts are not needed**: driver withdrawals are fully manual today.
- Recommended approach: a small **gateway adapter layer plus a persisted `PaymentOrder` record**, then move flows over in phases, starting with wallet top-up. This also removes several existing bugs.

## 2. How the gateway is configured and chosen today

| Item | Today |
| --- | --- |
| Storage | One Mongo document `AdminThirdPartySetting`, field `payment.{razor_pay, phone_pay, stripe}` (`admin/models/AdminThirdPartySetting.js`, defaults in `admin/data/defaultThirdPartySettings.js`) |
| Fields | `enabled` ('1'/'0'), `environment` (test/live; PhonePe: test/production), key fields per gateway. Razorpay: `test_/live_ api_key, secret_key`. PhonePe: `merchant_id, salt_key, salt_index` |
| Secrets | **Stored and returned in plain text** (GET payment-settings returns them to any admin; the admin UI shows them in text inputs) |
| Spec and validation | `services/paymentGatewayService.js` `PAYMENT_GATEWAY_SPECS` (required fields per environment, checked only when `enabled`) |
| One active gateway | `normalizePaymentSettingsPayload` forces a single enabled gateway (the last in spec order wins). `getActivePaymentGateway` returns the first enabled |
| Credentials | `resolveConfiguredGatewayCredentials(slug)` (403 if disabled; Razorpay also falls back to `RAZORPAY_KEY_ID/SECRET`; refuses "demo" keys) |
| Public endpoint | `GET /common/payment-gateway` and the app bootstrap return `{slug, label, supportsWalletTopUp, supportsRentalAdvance, walletTopUpMode, rentalAdvanceMode}`. Razorpay: `razorpay_checkout`; PhonePe: `phonepe_redirect`; anything else `unsupported` (hard-coded per slug). The bootstrap is cached for a short time |
| Admin API | `GET/PATCH /admin/integration-settings/payment-settings` (superadmin). Generic; works for a new spec entry |
| Admin UI | `frontend/.../PaymentGateways.jsx`: renders a hard-coded gateway array generically (one entry per gateway) |
| Webhook secret | `RAZORPAY_WEBHOOK_SECRET` **env only** (503 if unset); not in the Admin settings |

Consequence: the backend never asks "which gateway is active" when creating an order. If the Admin switches from Razorpay to Cashfree, flows that are not migrated would still call Razorpay as long as it is **enabled**, and fail with 403 once it is disabled.

## 3. Payment flows today

Rupees in the API, paise towards Razorpay/PhonePe. "Order" = server-side gateway order creation.

| # | Flow | Gateway | Amount source | How success is verified | Idempotency / double-credit protection |
| --- | --- | --- | --- | --- | --- |
| 1 | **Rider wallet top-up** (`/users/wallet/razorpay/*`, `/users/wallet/phonepe/*`, unauthenticated Razorpay callback) | Razorpay, PhonePe | Client | Razorpay: HMAC + `GET /orders`; PhonePe: status poll. No local record of the order | `findOne` on transaction `providerPaymentId` then `$inc`; **no unique index** (race between callback and verify) |
| 2 | **Rental advance** (`/users/rental-advance/*`) + `POST /users/rental-bookings` | Razorpay, PhonePe | **Client** (not checked against the vehicle) | Verify returns "paid"; the booking then **stores what the client sends** as payment (no re-fetch) | None found. Wallet variant is atomic |
| 3 | **Bus booking** (`/users/bus-bookings/order,verify`) | Razorpay | Server (fare + tax) | HMAC only (no order fetch); booking stored with `pending` + 10 min hold | Status check + order id lookup; seat-hold unique index |
| 4 | **Pooling booking** (`/users/pooling/bookings/order,verify`) | Razorpay | Server | **HMAC only**: the order is never fetched, so order metadata and amount are not compared with the request | `findOne` on payment id (index not unique) |
| 5 | **Subscription purchase** | Razorpay | Server (plan price) | HMAC (timing-safe) + order fetch + notes + amount | **Unique partial index** on `providerPaymentId` (best of the user flows) |
| 6 | **Ride completion payment** (`/rides/:id/complete-payment/razorpay/*`) | Razorpay | Server | HMAC + order fetch + notes + amount + **payment fetch/capture** | Transaction + compare-and-set + unique partial index on the ride's payment id; auto-refund of unusable payments |
| 7 | **Ride tip** (standalone) | Razorpay | Client (within settings limits) | HMAC (not timing-safe) + order amount vs client amount; notes not checked | Wallet-transaction check, no unique index |
| 8 | **Goods advance** (`/deliveries/advance/razorpay/*` + webhook + reconcile + wallet) | Razorpay | Server | HMAC + order fetch; **webhook** + reconcile endpoint | Compare-and-set, unique id checks, auto-refund of late/duplicate payments |
| 9 | **Driver wallet top-up** (`/drivers/wallet/top-up/razorpay/*`, `.../phonepe/*`) | Razorpay (order or payment link), PhonePe | Client | HMAC + order fetch; link path: payment + link fetch; PhonePe: status poll. Unauthenticated callback | `findOne` on payment id; **no unique index**; no webhook and no reconcile if the app dies |
| 10 | **Driver payment QR** (rider pays driver) | Razorpay QR / payment link | Server | Webhook (`qr_code.credited`, `payment_link.paid`) + status poll | Same strong ride-payment layer as #6 |
| 11 | **Refunds** | Razorpay only | n/a | Ride refunds: `refundUnusedRidePayment` (atomic claim, admin retry). Goods advance: refund API, rollback on error. Bus cancel: inline refund call | Atomic claims; no refund webhook; stuck refunds retried by admin only |
| 12 | **Driver withdrawals** | none | n/a | Admin approves, wallet is debited, **admin pays outside the system** | No payout reference stored |

Webhooks today (Razorpay only): `POST /rides/payments/razorpay/webhook` and `POST /deliveries/advance/razorpay/webhook`. Raw body is kept only for URLs containing those two strings (`src/app.js`). PhonePe's callback is a log-only acknowledgement.

Apps: the **web** frontend uses Razorpay and PhonePe (`Wallet.jsx`, `DriverWallet.jsx`, `RentalDeposit.jsx`, `RideComplete.jsx`, `PoolingConfirm.jsx`, `BusDetails.jsx`, launch and status pages) and hard-codes the mode strings. The **Flutter rider app** (wallet top-up, ride completion payment, tip) and **driver app** (wallet top-up) use only `razorpay_flutter`; neither has PhonePe.

## 4. Shared code and duplication

- Razorpay REST wrapper: `services/razorpayClient.js` (the only one with a 15 s timeout) plus copies in `userController`, `rideController`, `poolingController` and three in `driverController`.
- Credential resolvers: copies in 6 files, all wrapping `resolveConfiguredGatewayCredentials`.
- HMAC `order_id|payment_id` check: inlined in 8 places; only some use the timing-safe `signaturesMatch`.
- PhonePe SDK wrapper: duplicated in `userController` and `driverController`. Frontend base URL helper `getFrontendBaseUrl`: duplicated.
- Refund code: three separate implementations (ride payments, goods advance, bus cancel).
- `services/paymentDiagnostics.js` is PhonePe-specific logging.
- Order-level storage exists only for rides (`riderPaymentOrder`, `driverPaymentCollection`, `goodsAdvance`) and bus bookings. Wallet top-up, rental advance and pooling keep **nothing** at order time and trust the gateway's order notes.

## 5. Existing problems to fix (before or with Cashfree)

| Priority | Problem |
| --- | --- |
| High | Wallet top-up (rider and driver) can **double-credit**: check-then-credit with no unique index, and the unauthenticated callback and the app's verify normally both fire |
| High | Pooling verify never fetches the order: a paid order could be reused for a different route or seats |
| High | Rental advance: amount is client-supplied and the booking trusts the client's "paid" payload |
| High | PhonePe: a transaction id is not bound to the user or driver at creation; no webhook and no reconcile, so an app crash after paying loses the credit |
| Medium | Ride tip verify does not check the order's ride/user notes; no unique index |
| Medium | Driver top-up payment-link path credits `authorized` (uncaptured) payments |
| Medium | Gateway secrets plain text, readable by any admin; webhook secret only in env |
| Medium | Several Razorpay wrappers have no timeout; refund-on-error rollback in goods advance can double-refund after a timeout that actually succeeded |
| Medium | No scheduled reconcile for top-ups or pending refunds; no refund webhook |
| Low | Withdrawals: balance not held, no payout reference, owner wallet adjust is not atomic |

## 6. Cashfree: what the integration needs

Details below are from general knowledge of Cashfree's PG API (v3 style) and **must be checked against Cashfree's current docs** (API version header, field names) before coding.

- **Auth/base URL:** headers `x-client-id`, `x-client-secret`, `x-api-version`. Sandbox `https://sandbox.cashfree.com/pg`, production `https://api.cashfree.com/pg`. Credentials = App ID + Secret Key per environment.
- **Create order:** `POST /orders` with `order_id` (unique, ours), `order_amount` (**rupees**, not paise), `order_currency`, `customer_details` (customer id, **phone required**, email), `order_meta.return_url` and `notify_url` (webhook), optional `order_tags`/`order_note`. Returns `payment_session_id`.
- **Checkout:** the app/web opens Cashfree's checkout with the `payment_session_id` (Flutter: Cashfree's Flutter PG SDK; web: Cashfree JS SDK or hosted page). Unlike Razorpay there is **no client-side signature**, so success must always be confirmed on the server.
- **Verify:** `GET /orders/{order_id}` (status `PAID` and so on) and `GET /orders/{order_id}/payments` (payment id, status, amount).
- **Webhook:** `POST` to our URL with headers `x-webhook-signature` and `x-webhook-timestamp`; signature is a base64 HMAC-SHA256 of `timestamp + rawBody` with the secret key. Events for payment success, failure, user dropped and refund status.
- **Refund:** `POST /orders/{order_id}/refunds` with our own `refund_id` (idempotency) and amount.
- **Payouts** (bank/UPI transfers) are a separate Cashfree product; **not needed** for parity.
- Production needs Cashfree account activation, a whitelisted domain and the Android/iOS app setup for the SDK.

## 7. Proposed design

1. **Gateway adapters** (`services/gateways/`): one module per gateway (`razorpay`, `phonepe`, `cashfree`) with the same small interface: `getCredentials`, `createOrder`, `fetchOrder` (normalised `paid | pending | failed`, amount, payment id), `verifyClientPayment`, `refund`, `verifyWebhook`. A shared HTTP helper with timeout. Flows call `adapterFor(order.gateway)`.
2. **`PaymentOrder` collection** (new): one row per online payment attempt: `orderId` (unique), `gateway`, `purpose` (wallet, rental advance, bus, ride, tip, subscription, goods advance, driver wallet...), owner (`userId`/`driverId`), `amount`, `status`, gateway ids, free-form `context` (route, seats, ride id), `appliedAt`. It gives the missing server-side binding (fixes the PhonePe/top-up gaps), a **unique idempotency key** for "apply this payment once", and lets an order always be completed with the gateway it was created with, even if the Admin switches gateways meanwhile.
3. **One `applyPayment` step** per purpose, called by verify, callback, webhook and a periodic reconcile, using compare-and-set on `PaymentOrder` so all four paths are safe together.
4. **Routes:** keep the existing Razorpay/PhonePe routes working unchanged for old app versions; add gateway-neutral routes (for example `/payments/:gateway/orders` and `/payments/orders/:orderId/verify`) plus `POST /payments/cashfree/webhook`. Add the webhook URL to the raw-body whitelist in `src/app.js` (better: a generic marker).
5. **Config:** add `cashfree` to `PAYMENT_GATEWAY_SPECS` (App ID, Secret Key, test/production), defaults with `enabled '0'`, a **backfill** for existing databases (the settings document already exists), a `cashfree_checkout` mode string and `supports*` flags, and an entry in the Admin payment page. Consider masking secrets in the Admin GET and a Cashfree webhook toggle.
6. **Apps:** web: new checkout launch and status pages (Cashfree JS SDK or redirect) and handling of the new mode in the wallet, rental, ride, pooling and bus pages. Flutter rider and driver apps: Cashfree PG SDK next to `razorpay_flutter`, a gateway switch based on the public gateway endpoint, and new endpoints. Old app versions keep using Razorpay, so Razorpay must stay enabled while they are in use (only one gateway can be active today).

## 8. Suggested phases

| Phase | Scope | Why this order |
| --- | --- | --- |
| 0 | Decisions, Cashfree sandbox account, API version, webhook URL | Unblocks everything |
| 1 | Foundation: config spec and backfill, Cashfree client, adapter interface (Razorpay wrapped, behavior unchanged), `PaymentOrder`, webhook endpoint, raw-body marker, Admin page entry, tests with a fake Cashfree | No user-visible change |
| 2 | **Wallet top-up** (rider and driver) on Cashfree and on `PaymentOrder`; fixes the double-credit race and the missing reconcile | Simplest flow, biggest existing bug |
| 3 | Ride completion payment and tip (reuse the strong ride-payment layer), driver QR left on Razorpay unless Cashfree offers an equivalent you want | Core revenue flow |
| 4 | Rental advance, bus, pooling, subscription, goods advance (+ their refunds) | Booking-coupled flows |
| 5 | Refund adapter everywhere, refund webhook, reconcile job, pending-refund retry | Hardening |
| 6 | Web and Flutter apps (can start in parallel after Phase 2's API is stable), staged rollout, monitoring | Client work |
| Optional | Payouts for driver withdrawals; moving Razorpay/PhonePe fully onto the adapters | Only if wanted |

## 9. Decisions needed

1. **Scope:** all flows, or start with wallet top-up and ride payment?
2. **Razorpay/PhonePe:** keep them (recommended; the Admin picks the active one) or retire them? Old app versions depend on Razorpay until users update.
3. **Platforms:** web, Flutter rider app, Flutter driver app: which ones now?
4. **Withdrawals:** keep manual or add Cashfree Payouts?
5. **Account:** do you have Cashfree sandbox (and production) credentials and the API version your account uses? Webhook secret handling (Cashfree uses the account secret key).
6. **Fix first:** should the High-priority existing bugs in section 5 be fixed first or together with Phase 2?
