# Flutter: Cashfree payments (rider app and driver app)

For the Flutter developer. Backend is ready and tested against the Cashfree sandbox. This file says what to build, in order, with code. Backend contract details: `CASHFREE_INTEGRATION.md`.

Apps: rider `flutter_taxi_user`, driver `flutterdriver`.

| App | Feature | What changes |
| --- | --- | --- |
| Rider | Wallet top-up | New Cashfree path next to Razorpay |
| Rider | Ride completion payment (fare + tip) | New Cashfree path next to Razorpay |
| Driver | Wallet top-up | New Cashfree path next to Razorpay |

Not in this phase (keep as they are, Razorpay/PhonePe): rental advance, goods advance, pooling, tip-only links.

---

## 0. The one rule

**The app never decides that a payment succeeded.** The Cashfree SDK callback only means "the checkout screen closed". Only the backend's `verify` response (`paid: true`) means the money is in. Never credit the wallet UI, never mark a ride paid, never navigate to a "success" screen from the SDK callback alone.

Flow (same in all three features):

```
1. POST .../order        -> { orderId, paymentSessionId, amount, environment }
2. open Cashfree checkout with orderId + paymentSessionId + environment
3. checkout closes (success OR failure OR user pressed back)
4. POST .../verify { orderId } -> status
      applied / already_applied -> paid, show success
      pending                   -> not paid yet, poll (see 5)
      409 payment_refunded      -> paid but unusable, money goes back
```

Also call `verify` when the app comes back to the foreground with an unfinished order (see 6).

---

## 1. Phase 1: package and platform setup (both apps)

`pubspec.yaml`:

```yaml
dependencies:
  flutter_cashfree_pg_sdk: 2.5.0+53   # check pub.dev for the latest compatible version
```

- Android: minSdk 19 or higher (21+ is fine). No other manifest change is normally needed.
- iOS: deployment target 11 or higher. In `ios/Runner/Info.plist` add the UPI/wallet schemes the SDK needs to detect installed apps:

```xml
<key>LSApplicationQueriesSchemes</key>
<array>
  <string>upi</string><string>phonepe</string><string>paytmmp</string>
  <string>tez</string><string>bhim</string><string>whatsapp</string>
  <!-- the full list is on Cashfree's Flutter integration page -->
</array>
```

Keep `razorpay_flutter`: old payment paths stay until the Admin switches over and old app versions are gone.

---

## 2. Phase 2: choose the gateway from the server (both apps)

`GET /common/payment-gateway` (no login) returns the active gateway:

```json
{ "success": true, "data": { "activeGateway": {
  "slug": "cashfree", "label": "Cashfree",
  "supportsWalletTopUp": true, "walletTopUpMode": "cashfree_checkout",
  "ridePaymentMode": "cashfree_checkout"
}}}
```

| Field | Values | Use |
| --- | --- | --- |
| `walletTopUpMode` | `cashfree_checkout`, `razorpay_checkout`, `phonepe_redirect`, `unsupported` | Wallet top-up screen (rider and driver) |
| `ridePaymentMode` | `cashfree_checkout`, `razorpay_checkout`, `unsupported` | Ride payment sheet (rider) |

Rules:
- `cashfree_checkout` -> use the Cashfree path in this file.
- Anything else -> keep the existing code path unchanged.
- `ridePaymentMode` may be missing on older servers: treat missing as "use the existing Razorpay path".
- Fetch it when the screen opens (not once at app start), so an Admin switch applies without a release.

---

## 3. Phase 3: shared Cashfree service (build once per app)

Create `lib/core/services/cashfree_service.dart` next to `razorpay_service.dart`. It wraps the SDK and returns when the checkout closes. It does **not** say whether the payment worked.

```dart
import 'dart:async';
import 'package:flutter_cashfree_pg_sdk/api/cferrorresponse/cferrorresponse.dart';
import 'package:flutter_cashfree_pg_sdk/api/cfpayment/cfwebcheckoutpayment.dart';
import 'package:flutter_cashfree_pg_sdk/api/cfpaymentgateway/cfpaymentgatewayservice.dart';
import 'package:flutter_cashfree_pg_sdk/api/cfsession/cfsession.dart';
import 'package:flutter_cashfree_pg_sdk/utils/cfenums.dart';
import 'package:flutter_cashfree_pg_sdk/utils/cfexceptions.dart';

/// What the checkout screen reported. Only a hint: always call the backend verify afterwards.
class CashfreeCheckoutResult {
  final bool closedByGateway; // SDK said "done" (may still be pending/failed)
  final String? errorMessage; // SDK error, user cancel included
  const CashfreeCheckoutResult({required this.closedByGateway, this.errorMessage});
}

class CashfreeService {
  final CFPaymentGatewayService _gateway = CFPaymentGatewayService();
  Completer<CashfreeCheckoutResult>? _pending;

  CashfreeService() {
    _gateway.setCallback(_onVerify, _onError);
  }

  // Called by the SDK when the checkout returns without an error. NOT proof of payment.
  void _onVerify(String orderId) {
    _pending?.complete(const CashfreeCheckoutResult(closedByGateway: true));
    _pending = null;
  }

  void _onError(CFErrorResponse error, String orderId) {
    _pending?.complete(CashfreeCheckoutResult(closedByGateway: false, errorMessage: error.getMessage()));
    _pending = null;
  }

  /// [environment] is the string from the order response: "sandbox" or "production".
  Future<CashfreeCheckoutResult> openCheckout({
    required String orderId,
    required String paymentSessionId,
    required String environment,
  }) async {
    try {
      final session = CFSessionBuilder()
          .setEnvironment(environment == 'production' ? CFEnvironment.PRODUCTION : CFEnvironment.SANDBOX)
          .setOrderId(orderId)
          .setPaymentSessionId(paymentSessionId)
          .build();
      final payment = CFWebCheckoutPaymentBuilder().setSession(session).build();

      _pending = Completer<CashfreeCheckoutResult>();
      _gateway.doPayment(payment);
      return await _pending!.future;
    } on CFException catch (e) {
      return CashfreeCheckoutResult(closedByGateway: false, errorMessage: e.message);
    }
  }
}
```

Notes:
- Import paths are those of the current package; if your version differs, follow Cashfree's Flutter page (https://www.cashfree.com/docs/payments/online/mobile/flutter). Behaviour must stay the same.
- Create **one** `CashfreeService` per screen/flow (register the callback once), like `RazorpayService`.
- `environment` always comes from the order response, never hard-coded, so sandbox/production follows the Admin setting.

---

## 4. Phase 4: the three features

All paths are under the API base (`/api/v1`). Login token as usual. Money is in **rupees**.

### 4.1 Rider: wallet top-up

Files to change: `lib/core/constants/api_constants.dart`, `lib/features/wallet/presentation/topup_sheet.dart`.

Constants:

```dart
static const String walletCashfreeOrder  = '/payments/cashfree/user-wallet/order';
static const String walletCashfreeVerify = '/payments/cashfree/user-wallet/verify';
```

Flow:

```dart
Future<void> payWithCashfree(double amount) async {
  final order = await api.post(ApiConstants.walletCashfreeOrder, data: {'amount': amount});
  final d = order['data'];
  final result = await cashfree.openCheckout(
    orderId: d['orderId'], paymentSessionId: d['paymentSessionId'], environment: d['environment']);

  final outcome = await verifyUntilSettled(
    () => api.post(ApiConstants.walletCashfreeVerify, data: {'orderId': d['orderId']}),
  ); // see 5
  // outcome.paid -> refresh wallet from outcome.data['wallet'] (balance already updated), show success
  // otherwise show "not paid" (see 7)
}
```

`verify` response: `{ status, paid, orderId, amount, wallet }`. `wallet` has the same shape as the wallet GET (balance, transactions...), so update the wallet state from it directly.

### 4.2 Driver: wallet top-up

Files: `lib/core/constants/api_constants.dart`, `lib/features/earnings/presentation/wallet_screen.dart`.

```dart
static const String walletCashfreeOrder  = '/payments/cashfree/driver-wallet/order';
static const String walletCashfreeVerify = '/payments/cashfree/driver-wallet/verify';
```

Same flow as 4.1. `verify` returns `wallet` in the driver wallet shape. The backend also checks the Admin minimum top-up amount and answers `400` "amount must be at least N": show that message. The existing socket event `driver:wallet:updated` also fires when the credit happens: keep that listener, it makes the balance update even if the app was in the background.

### 4.3 Rider: ride completion payment (fare + tip)

Files: `lib/features/ride/data/ride_repository.dart` (next to the Razorpay order/verify methods), `lib/features/ride/presentation/ride_completion_payment_sheet.dart`.

```dart
// order: the TIP is sent here; the backend prices the fare itself
Future<Map<String, dynamic>> createCashfreeRideOrder(String rideId, {double tipAmount = 0}) async {
  final r = await api.post('/payments/cashfree/rides/$rideId/order', data: {'tipAmount': tipAmount});
  return r['data'];
}

Future<Map<String, dynamic>> verifyCashfreeRidePayment(String rideId, String orderId, {int? rating, String? comment}) async {
  final r = await api.post('/payments/cashfree/rides/$rideId/verify',
      data: {'orderId': orderId, if (rating != null) 'rating': rating, if (comment != null) 'comment': comment});
  return r['data'];
}
```

Order response also has `fare`, `fareDue`, `tipAmount`, `totalCharge`, `reused`. Show `totalCharge` as the amount to pay (it is what the backend will charge; do not compute your own). `reused: true` just means the same open order was returned (double tap / reopened sheet): continue normally.

Verify response: `{ status, paid, orderId, amount, ride }`; `ride` is the full updated ride, use it to update the ride screen. `rating` / `comment` are optional and can ride along with verify (same as the Razorpay flow).

Ride-specific errors:

| HTTP | `code` / message | Meaning | UI |
| --- | --- | --- | --- |
| 409 | `ALREADY_PAID` (order step) | Ride already paid (cash / QR / earlier) | "This ride is already paid", refresh the ride |
| 409 | `PAYMENT_NOT_ALLOWED` (order step) | Not payable yet (driver not at drop) | Show the message |
| 409 | `payment_refunded` (verify step, `details.code`) | You paid, but the ride was already paid meanwhile: refund started | "Your payment will be refunded", refresh the ride |
| 400 | wrong ride for that order | Programming error | Log it |

Keep the existing wallet-pay and QR paths exactly as they are; Cashfree only replaces the "pay online" button when `ridePaymentMode == cashfree_checkout`.

---

## 5. Phase 5: the verify polling helper (important)

UPI payments are not instant. In the sandbox a UPI collect took about 30 seconds to turn `SUCCESS`. So after the checkout closes, `pending` is normal for a while.

```dart
class VerifyOutcome {
  final bool paid;
  final String status;           // applied | already_applied | pending | refunded | refund_pending
  final Map<String, dynamic>? data;
  VerifyOutcome(this.paid, this.status, this.data);
}

Future<VerifyOutcome> verifyUntilSettled(
  Future<Map<String, dynamic>> Function() callVerify, {
  Duration every = const Duration(seconds: 3),
  Duration giveUpAfter = const Duration(seconds: 90),
}) async {
  final started = DateTime.now();
  while (true) {
    final r = await callVerify();               // throws on 4xx/5xx: handle in the caller (see 7)
    final d = r['data'] as Map<String, dynamic>;
    final status = d['status'] as String;
    if (status != 'pending') return VerifyOutcome(d['paid'] == true, status, d);
    if (DateTime.now().difference(started) > giveUpAfter) return VerifyOutcome(false, 'pending', d);
    await Future.delayed(every);
  }
}
```

Behaviour:
- Show a "Confirming your payment..." state while polling. Do not let the user pay again while it runs (disable the button).
- After `giveUpAfter` still `pending`: show "Payment is being confirmed. Your wallet / ride updates automatically once it is received" and keep the order id (see 6). **Do not tell the user the payment failed**: the money may still arrive. The backend also settles it on its own (Cashfree webhook and a background sweep), and the app gets the result via the usual refresh/socket.
- If the user pressed back / the SDK reported an error and the first verify is still `pending`, one verify is enough: do not poll for 90 s on a cancel. Rule: poll only when `closedByGateway == true`; for a cancel/error do a single verify and then show "Payment not completed".

---

## 6. Phase 6: unfinished orders and app resume

The user can leave the app mid-payment (UPI app opens, then they come back, or the app is killed).

1. Right after step 1 of the flow store `{ orderId, feature, rideId? }` in local storage (e.g. `shared_preferences`).
2. On `AppLifecycleState.resumed` and on app start, if a stored order exists: call the matching `verify` once.
   - `paid == true` -> refresh wallet/ride, show success once, clear the stored order.
   - `status == pending` and the order is older than about 10 minutes -> clear it (backend keeps checking on its own).
   - `refunded`/`refund_pending` or a 409 `payment_refunded` -> show the refund message, clear it.
3. Always clear the stored order after a final result so the success message is not shown twice.

Verify is safe to call any number of times: the backend credits once.

---

## 7. Errors from the backend

All errors are `{ success: false, message, ... }`.

| HTTP | Where | Meaning | UI |
| --- | --- | --- | --- |
| 400 | order | amount missing / <= 0 / below driver minimum top-up / other validation | Show `message` |
| 401 | any | Not logged in | Normal login handling |
| 404 | verify | Order is not yours or unknown | "Payment not found" |
| 409 | ride order | already paid / not payable | See 4.3 |
| 409 | ride verify | `payment_refunded` | See 4.3 |
| 429 | order | Too many requests (or Cashfree rate limit) | "Please try again in a moment" |
| 502 | order | Cashfree unreachable or keys wrong (Admin) | "Payment service unavailable, try again later" |

Retry rules: an order step that fails with 502 can be retried (creates a new order). A `verify` step can always be retried.

---

## 8. Testing (sandbox)

The Admin sets Cashfree to `test` environment with the sandbox keys; the order response then has `environment: "sandbox"`.

- **UPI:** in the sandbox checkout, choose UPI and enter the test id `testsuccess@gocash` for a successful payment (takes about 30 s to confirm). `success@upi` is rejected by Cashfree's risk check, do not use it.
- Cards / netbanking: use Cashfree's sandbox test credentials from their docs ("Test data" page).
- Use a different amount each time to tell orders apart in the Cashfree dashboard.

Checklist (tick each in both sandbox and, before release, production with a small real amount):

Rider wallet
- [ ] Top-up succeeds, balance and transaction list update from the `verify` response
- [ ] Close the checkout without paying: no credit, "not completed" message
- [ ] Kill the app during UPI, reopen: the pending order is verified and credited once
- [ ] Verify called twice quickly (double tap): credited once
- [ ] Amount 0 / negative is blocked in the UI and refused by the backend (400)

Driver wallet
- [ ] Top-up succeeds, balance updates, `driver:wallet:updated` still works
- [ ] Amount below the Admin minimum shows the backend message
- [ ] Blocked-wallet state updates after the credit if the balance is now enough

Ride payment
- [ ] Cash ride at the drop: pay fare online, ride shows paid, driver app shows paid (`ride:state`)
- [ ] Fare + tip: `totalCharge` shown equals what Cashfree charges
- [ ] Reopen the sheet / double tap on pay: same order reused, no double charge
- [ ] Driver marks cash received while the rider is in checkout: rider sees "payment will be refunded", ride shows paid by cash, refund appears in Cashfree
- [ ] Rating and comment sent with verify are saved

Gateway switch
- [ ] Admin switches to Razorpay: screens go back to the Razorpay flow without a release
- [ ] `ridePaymentMode` missing (old server): Razorpay flow

---

## 9. What the backend does for you (so the app can stay simple)

- Decides the amount (the app only sends the top-up amount or the tip; the fare comes from the ride).
- Asks Cashfree what was paid: a forged "success" from the app cannot credit anything.
- Credits exactly once even when verify, the Cashfree webhook and a background sweep all arrive together.
- Refunds a payment the ride can no longer use, once.
- Keeps working if the app is closed: webhook + sweep settle the order; the app just shows the result when it next verifies or refreshes.

Questions about the backend side: see `CASHFREE_INTEGRATION.md`; the end-to-end sandbox run is `test/integration/cashfreeSandbox.e2e.js`.

## Goods booking advance (paid when the delivery is booked)

When `GET /common/payment-gateway` returns `goodsAdvanceMode: "cashfree_checkout"`, use these instead of `/deliveries/advance/razorpay/*` (which answers `403 Razorpay gateway is disabled` while Cashfree is the active gateway). `razorpay_checkout` keeps the old calls.

1. Book the delivery as before (`POST /deliveries`). The response has `rideId` and `goodsAdvance.status = "pending"`. The request is NOT dispatched until the advance is paid.
2. `POST /deliveries/advance/cashfree/order` with `{ "rideId": "<rideId>" }` -> `201` `{ orderId, paymentSessionId, amount, advanceAmount, remainingAmount, environment, reused }`. The amount is the booking's own advance; the app cannot change it. Calling again (double tap) returns the same open order with `reused: true`.
3. Open Cashfree checkout with `paymentSessionId` + `orderId` (same SDK call as the wallet top-up).
4. After checkout returns, `POST /deliveries/advance/cashfree/verify` with `{ "rideId", "orderId" }` -> `200` `{ status, paid, orderId, amount, delivery }`.
   - `paid: true`: `delivery.goodsAdvance.status` is `paid` and the request has been dispatched to drivers.
   - `status: "pending"`: not paid yet; poll verify every 3-5 s (up to about 60 s).
   - `409` with `code: "payment_refunded"`: the booking was cancelled/closed meanwhile; the money is refunded automatically. Show the message, do not retry.
5. If the app is closed after paying, the webhook/reconcile loop still marks the advance paid and dispatches the request.

Refunds (driver cancel, no driver found) go back to the wallet or to the original Cashfree payment, following the admin's "refund to" setting. Cashfree rental advance is still not supported.

## Driver "Collect payment" QR (at the drop)

The driver's QR used to be Razorpay-only, so with Cashfree active the screen showed **"Razorpay gateway is disabled"**. It now runs on Cashfree. **The driver app needs no change**: same two calls, same response shape.

| When | Request |
| --- | --- |
| Screen opens / Retry | `POST /api/v1/drivers/payments/qr` body `{ "rideId": "<id>" }` |
| Every 5 s while open | `GET /api/v1/drivers/payments/qr/status?rideId=<id>` |

The same two exist as `POST /api/v1/payments/cashfree/rides/:rideId/collect/order` and `GET /api/v1/payments/cashfree/rides/:rideId/collect/status` (driver token); both pairs do the same thing.

### Create (`POST .../qr`)
```json
{
  "success": true,
  "data": {
    "id": "rc_9a3b4d0012ab_mwn6u",
    "status": "active",
    "imageUrl": "data:image/png;base64,iVBOR...",
    "linkUrl": "https://payments.cashfree.com/links/...",
    "amount": 232,
    "currency": "INR",
    "closeBy": 1795000000,
    "providerMode": "cashfree_payment_link_qr"
  }
}
```
- `imageUrl` is a **PNG data URL**: draw it with `Image.memory(base64Decode(imageUrl.split(',').last))`. (It is the same kind of value the older payment-link fallback returned.) `linkUrl` is the pay page: offer "Share link" with it.
- The amount is decided by the server (what the rider still owes). Any `amount` the app sends is ignored.
- The link lives 30 minutes. **Retry** makes a new link and cancels the old one, so an old QR can never be paid.
- `409 ALREADY_PAID` ("This ride is already paid") and `409 PAYMENT_NOT_ALLOWED` ("The QR can be shown once you reach the drop") are handled by name, as before.

### Status (`GET .../qr/status`)
`data.paid` flips to `true` and `data.status` becomes `paid` once the rider has paid; other values: `active`, `expired`, `cancelled`. After `paid` the ride is settled once and the driver is credited once; both apps get the usual `ride:state` event, the driver also `driver:wallet:updated`. If the driver closes the app right after the rider pays, the webhook and the server's recovery loop still settle it.

### Choosing the flow
`GET /common/payment-gateway` -> `data.activeGateway.driverCollectMode`:

| Value | Meaning |
| --- | --- |
| `cashfree_qr` | Use the QR above |
| `unsupported` | Online collection is not available (hide the QR button, cash only) |

A payment that arrives for a ride that is already paid (cash taken meanwhile, or the rider paid in the app) is refunded to the rider automatically, once.
