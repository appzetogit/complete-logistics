# Cashfree payments: wallet top-up and ride payment

Scope of this phase: **rider wallet top-up, driver wallet top-up, ride completion payment (fare + tip)**. Razorpay and PhonePe routes are unchanged. Rental advance, goods advance, pooling, tips-only links and PhonePe are not on Cashfree yet.

## 1. Admin setup

1. Admin > Settings > Payment Gateways > **CASHFREE**: environment (`test` / `live`), App ID and Secret Key for that environment.
2. In the Cashfree dashboard set the webhook URL to `https://<backend-domain>/api/v1/payments/cashfree/webhook` (event: payment success; the API version must match `CASHFREE_API_VERSION`, default `2023-08-01`).
3. Only one gateway is active at a time (existing rule). **Switching to Cashfree switches Razorpay off**, so app versions that still use the Razorpay routes stop working for payments. Release the apps with Cashfree support first, then switch.

`GET /common/payment-gateway` now returns `walletTopUpMode: "cashfree_checkout"` and `ridePaymentMode: "cashfree_checkout"` when Cashfree is active (`unsupported` for rental advance). The apps should read these before choosing a checkout.

## 2. How a payment works (all three flows)

```
app  --POST .../order-->  backend   saves a PaymentOrder (amount decided by the server), opens the Cashfree order
app  <-- paymentSessionId, orderId
app  opens the Cashfree checkout with paymentSessionId  (web JS SDK / Flutter SDK)
app  --POST .../verify { orderId }-->  backend asks Cashfree what was paid, applies it once
Cashfree --webhook--> backend         same apply step (backup when the app is closed)
backend reconcile (every sweep)       same apply step for orders nobody verified
```

The app never sends the amount of money to credit and never says "it was paid": the backend reads the payment from Cashfree. Verify, webhook and the sweep can arrive in any order or at the same time; the money moves once.

Statuses returned by every `verify`: `status` = `applied` | `already_applied` (paid and credited) | `pending` (not paid yet: keep the checkout open or poll `verify`) | `refunded` / `refund_pending` (paid but unusable). `paid` is true for the first two.

## 3. Endpoints (login required unless noted)

| Purpose | Order | Verify |
| --- | --- | --- |
| Rider wallet | `POST /payments/cashfree/user-wallet/order` `{ amount }` | `POST /payments/cashfree/user-wallet/verify` `{ orderId }` (returns `wallet`) |
| Driver wallet | `POST /payments/cashfree/driver-wallet/order` `{ amount }` | `POST /payments/cashfree/driver-wallet/verify` `{ orderId }` (returns `wallet`) |
| Ride payment (rider) | `POST /payments/cashfree/rides/:rideId/order` `{ tipAmount?, rating? }` | `POST /payments/cashfree/rides/:rideId/verify` `{ orderId, rating?, comment? }` (returns `ride`) |
| Webhook (public) | `POST /payments/cashfree/webhook` | signed by Cashfree |

Prefix with `/api/v1`. Order response:

```json
{ "success": true, "data": { "orderId": "uw_...", "paymentSessionId": "session_...", "amount": 500, "currency": "INR", "environment": "sandbox" } }
```

`environment` is `sandbox` or `production`: pass it to the Cashfree SDK (`CFEnvironment.SANDBOX` / `PRODUCTION`). The ride order response also has `fare`, `fareDue`, `tipAmount`, `totalCharge`, `reused` (opening the pay sheet twice returns the same open order).

Errors: `400` bad amount / below the driver's minimum top-up (live Admin setting) / order of another ride; `404` order is not yours; `409` `ALREADY_PAID` / `PAYMENT_NOT_ALLOWED` (ride cannot be paid), or `payment_refunded` on verify (see 4); `502` Cashfree unreachable.

## 4. Unusable payments are refunded

If the rider paid but the ride cannot take it any more (already paid in cash or by QR, cancelled), the order moves to `refund_pending` and a Cashfree refund is created with the fixed id `rf_<orderId>`, so retries never refund twice. `verify` then answers `409` with `details.code = "payment_refunded"`: show "Payment will be refunded". A refund Cashfree rejects stays `refund_pending` with `refund.error` set and is retried by the sweep.

## 5. Client work

Web (rider, driver): load `https://sdk.cashfree.com/js/v3/cashfree.js`, `Cashfree({ mode: environment === 'production' ? 'production' : 'sandbox' }).checkout({ paymentSessionId })`, then call `verify` when it returns (also on page return / app resume).

Flutter (rider and driver): add `flutter_cashfree_pg_sdk`, build a `CFSession` from `orderId` + `paymentSessionId` + environment, start `CFWebCheckoutPayment`, and call `verify` from the success and failure callbacks and when the app resumes. Do not mark anything paid in the app from the SDK callback alone: only the `verify` response counts.

## 6. Backend map

`services/cashfreeClient.js` (REST client, 15 s timeout, webhook signature check), `payments/models/PaymentOrder.js` (one row per order, unique order id, unique payment id), `payments/services/paymentOrderService.js` (create, settle, apply, refund, webhook, reconcile), `payments/controllers` + `routes` (endpoints above), reconcile runs inside the dispatch recovery sweep, tests in `test/integration/cashfreePayments.test.js` (fake Cashfree behind `fetch`).
