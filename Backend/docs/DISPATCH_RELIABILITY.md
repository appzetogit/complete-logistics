# Dispatch reliability (goods requests not reaching drivers) – Backend + Flutter notes

Part 1 of the "dispatch, selfie, free rides, subscription" checklist: C1, C2, C4, C5, C6, C7.
(C3 zone-edge cap, C8–C10 selfies, C11–C13 free rides / subscription are separate.)

---

## 1. What changed

| # | Change | Where |
|---|---|---|
| C1 | **`GET /drivers/ride-offers`** (driver token) → `{ data: { results: [<rideRequest payload>], total } }`. Searching rides this driver was offered, has not rejected, and whose advance is not pending. Max 10, newest first. Same fields as the `rideRequest` socket event. | `driverRoutes.js`, `dispatchService.getOpenRideOffersForDriver` |
| C2 | When a driver's socket **connects**, every open offer for that driver is re-sent as `rideRequest`. | `socket/index.js`, `dispatchService.emitOpenRideOffersToDriver` |
| C4 | Advance paid but verify lost: **webhook**, **reconcile endpoint**, verify off the shared rate limit, every order id remembered (`goodsAdvance.providerOrderIds`). Details below. | `goodsAdvanceService.js`, `deliveryRoutes.js` |
| C5 | A dispatch **error no longer cancels** the ride: the same attempt is retried 3 times (5 s apart, `DISPATCH_ERROR_RETRY_DELAY_MS`), only then it is closed as unmatched. Errors are logged. | `dispatchService.dispatchAttempt` |
| C6 | A new booking that replaces an old searching one now stops its dispatch and sends `rideRequestClosed` (`reason: user-replaced-booking`) to drivers. A **paid advance on a ride no driver had accepted is refunded** (`goodsAdvance:refunded`, reason `replaced_by_new_booking`). If a driver had already accepted, the advance is still forfeited. | `rideService.clearUserActiveRideIfPresent`, `dispatchService.releaseReplacedRide` |
| C7 | The 30 s recovery sweep clears a stale `isOnRide: true` for drivers with no accepted/ongoing ride. (Complete/cancel paths already reset it.) | `dispatchService.healStaleDriverOnRideFlags` |

---

## 2. C4 – advance paid but the ride never dispatched

Three independent ways now start dispatch, all idempotent against each other:

1. **Checkout verify** (`POST /deliveries/advance/razorpay/verify`) – unchanged, but now on its own limiter
   (`goods_advance_confirm`, 60 / 15 min) instead of the shared `payment_order` one (12 / 15 min).
2. **Webhook** `POST /api/v1/deliveries/advance/razorpay/webhook` (no login; authenticated by signature).
3. **Reconcile** `POST /deliveries/advance/razorpay/reconcile` `{ "rideId" }` (user token): asks Razorpay about **every**
   order created for the booking and applies a captured payment. `200` + ride payload on success
   (dispatch starts), `404` "No completed payment was found yet" if nothing captured, `409` if the booking closed
   (the money is refunded automatically).

### Server setup for the webhook (needed once)
1. Razorpay Dashboard → Settings → Webhooks → add
   `https://<your-domain>/api/v1/deliveries/advance/razorpay/webhook`
   events: **`payment.captured`** and **`order.paid`**.
2. Put the same secret in the server env and restart:
   ```
   RAZORPAY_WEBHOOK_SECRET=<the secret you typed in the dashboard>
   ```
   Without it the endpoint answers `503` (it never accepts unsigned calls).
3. nginx must pass the body through untouched (default is fine; do not rewrite JSON).

Rules enforced when applying a payment: the order notes must say `purpose: goods_advance` for this ride and rider, the
amount must equal the advance, the booking must still be searching and `pending`. A second payment on an
already-settled advance (or a booking that closed meanwhile) is **refunded** automatically. The same payment twice is a no-op.

### Flutter
- After `verify` fails or times out following a successful Razorpay checkout, call **reconcile** (retry a few times) before
  showing an error. Also call it when restoring a `goodsAdvance.status == "pending"` booking that has an order started.
- Do not tell the user the payment failed until reconcile returns `404`.

---

## 3. Flutter (Driver app)

- On app start, reconnect and when a `ride_request` push arrives: `GET /drivers/ride-offers`, then show each result exactly
  like a `rideRequest` socket event (de-duplicate by `rideId`; the same offer may also arrive by socket after connect).
- Handle `rideRequestClosed` with `reason: "user-replaced-booking"` like any closed offer: remove it.

## 4. Flutter (User app)

- `goodsAdvance:refunded` can now also arrive with `reason: "replaced_by_new_booking"` (user started a new booking while an
  unaccepted paid one was searching) – show "₹X advance refunded".

---

## 5. Not done in this part (need server access / decisions)

Checks S1–S7 (deployed commit, Redis socket adapter with `instances: 2`, Mongo replica set, upload folder, nginx
`client_max_body_size`, 2dsphere indexes, logs of a failed booking) must be done on the server. **S2 (Redis) is the most
likely reason half of the requests are lost:** with 2 PM2 instances and no Redis adapter a request emitted on worker A never
reaches a driver connected to worker B. Until Redis is configured, run `instances: 1`.
