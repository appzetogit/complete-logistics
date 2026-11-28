# Flutter: buying a ride pass with Cashfree (rider app)

For the Flutter developer, rider app `flutter_taxi_user`. Buying a ride pass (subscription) online was the last payment flow still bound to Razorpay, so it failed whenever Cashfree was the active gateway. The backend now supports it on Cashfree. **The rider app already ships the Cashfree calls and the routing switch, so no app release is needed.** This file is the contract the backend implements, how the switch works, what to verify, and the edge cases (pending payments, double taps, killed app, refunds).

Related: `FLUTTER_CASHFREE_PAYMENTS.md` (the other Cashfree flows and the checkout SDK call), `FLUTTER_REFUND_WALLET.md`.

## 1. How the app picks the flow

`GET /api/v1/common/payment-gateway` -> `data.activeGateway.subscriptionMode`:

| `subscriptionMode` | What the app does |
| --- | --- |
| `cashfree_checkout` | the two Cashfree routes in section 2 |
| `razorpay_checkout` | the existing Razorpay flow, unchanged |
| missing / anything else | the existing Razorpay flow |

The wallet purchase `POST /api/v1/users/subscriptions/purchase` (body `{ "planId": "..." }`) is **unchanged** and works with any gateway. Plans come from `GET /users/subscriptions/plans` (`data.results`); the rider's passes from `GET /users/subscriptions/me`.

## 2. The two calls

Both need the rider's `Authorization: Bearer <token>`. Base `/api/v1`.

### 2.1 Create the order
`POST /payments/cashfree/subscriptions/order`

```json
{ "planId": "665f1c2e9a3b4d0012ab34cd" }
```

`planId` is the **only** field to send. An `amount` is ignored: the server prices the plan.

Success `201`:

```json
{
  "success": true,
  "data": {
    "orderId": "sb_mwn6u9a3b4d0012ab",
    "paymentSessionId": "session_xxxxxxxxxxxx",
    "environment": "sandbox",
    "amount": 499,
    "currency": "INR",
    "reused": false
  }
}
```

| Field | Use |
| --- | --- |
| `orderId` | keep it, send it to verify |
| `paymentSessionId` | pass to the Cashfree SDK checkout |
| `environment` | `sandbox` or `production`: open the checkout in **this** environment. It is present on a reused order too |
| `amount` | display only ("Pay Rs 499") |
| `reused` | `true` when a double tap or a reopened sheet got the same open order back: use it exactly like a new one |

Do not treat `reused: true` as an error and do not create a second order yourself.

### 2.2 Verify
`POST /payments/cashfree/subscriptions/verify`

```json
{ "orderId": "sb_mwn6u9a3b4d0012ab" }
```

Success `200`:

```json
{ "success": true, "data": { "status": "applied", "paid": true, "orderId": "sb_mwn6u9a3b4d0012ab", "amount": 499 } }
```

| `status` | `paid` | Meaning | App behaviour |
| --- | --- | --- | --- |
| `applied` | true | The pass was just created | Success: refresh `GET /users/subscriptions/me`, show the pass |
| `already_applied` | true | The pass already exists for this order | Same as applied |
| `pending` | false | Cashfree has not confirmed the payment yet | **Not an error.** Keep polling |

**Polling:** call verify every **3 seconds for up to 90 seconds** while the status is `pending`. A UPI collect is not instant (about 30 seconds in the sandbox), so `pending` right after the checkout closes is normal. After 90 seconds without `paid`, show "We are confirming your payment. Your pass will appear automatically." (it still will, see section 4) and let the rider leave; do not show a failure.

## 3. Errors

Body: `{ "success": false, "message": "...", "code": "..." }` (`code` only on some).

| HTTP | `code` | `message` | When | What to show |
| --- | --- | --- | --- | --- |
| 400 | | Valid subscription plan id is required | `planId` missing or not an id | Generic failure (app bug) |
| 404 | | Subscription plan not found | plan removed, switched off, or not a rider plan | Show the message; refresh the plans list |
| 409 | `ALREADY_PAID` | You already have an active pass for this plan | the rider holds this pass already (not expired, rides left, or unlimited) | Show the message; go to "My passes" |
| 409 | `payment_refunded` | This payment could not be used for the pass and is being refunded | paid, but the plan was removed, switched off or re-priced after the order | Show the message: "Your payment is being refunded to the original method." Do not retry automatically |
| 403 | | Cashfree gateway is disabled | admin switched Cashfree off | The app shows "Online payment is not available right now." (it already rewrites any "... gateway is disabled") |
| 404 | | Payment order not found | verify with an order that is not this rider's or not a pass order | Generic failure |
| 502 | `cashfree_unreachable` / `cashfree_error` | Cashfree could not be reached / rejected the keys | Cashfree is down or misconfigured | "Could not start the payment. Try again." with a retry |
| 429 | | Too many payment requests | too many create calls | Wait and retry |
| 401 | | token missing / expired | session ended | Normal login handling |

**Rate limits:** creating an order is limited to **12 per 15 minutes** per rider; verify is limited to **240 per 15 minutes** (a 90 second poll is 30 calls, so several attempts fit). A `429` on verify while polling should be treated like `pending`: wait a few seconds and continue.

## 4. What the backend does behind the scenes

1. **One pass per paid order.** Verify, the Cashfree webhook and the server's recovery loop all settle the same order, and the pass is created once, however many of them run.
2. **The app being killed does not lose the purchase.** If the rider is inside their UPI app and the app dies, the webhook (or the recovery loop a few minutes later) still creates the pass. The app keeps no pending-order record for passes, so on the next start just load `GET /users/subscriptions/me`.
3. **Price protection.** The amount charged is the plan price at the time of the order. If the plan is removed, switched off or re-priced before the payment lands, no pass is created and the payment is refunded once (`409 payment_refunded` on verify).
4. **Open order reuse.** One open order per rider per plan (for 24 hours). Reopening the sheet returns it with `reused: true`; once the pass exists the same call answers `409 ALREADY_PAID`.
5. **Source tag.** A pass bought this way has `purchaseSource: "cashfree"` in `GET /users/subscriptions/me`.

Note: the `ALREADY_PAID` rule applies to the **Cashfree** purchase only. The wallet purchase and the Razorpay purchase still allow buying a plan again.

## 5. Suggested flow

```
Rider taps "Pay online" on a plan
  -> GET /common/payment-gateway (cached): subscriptionMode == cashfree_checkout ?
  -> POST /payments/cashfree/subscriptions/order { planId }
       201 -> open Cashfree checkout with paymentSessionId in data.environment
       409 ALREADY_PAID -> message, go to My passes
       404 -> message, refresh plans
       403 / 502 -> message, retry
  -> checkout closes (paid, failed or cancelled)
  -> POST .../subscriptions/verify { orderId } every 3 s, up to 90 s
       paid true  -> refresh /users/subscriptions/me, success screen
       pending    -> keep polling
       409 payment_refunded -> refund message
       timeout    -> "confirming your payment", leave the screen
```

If the SDK reports the payment as cancelled or failed by the rider, you may skip polling; calling verify once is harmless and returns `pending`.

## 6. Code sketch (verify poll)

```dart
Future<PassPaymentResult> verifyUntilSettled(String orderId) async {
  final deadline = DateTime.now().add(const Duration(seconds: 90));
  while (DateTime.now().isBefore(deadline)) {
    try {
      final res = await api.post('/payments/cashfree/subscriptions/verify', data: {'orderId': orderId});
      final data = res.data['data'] as Map<String, dynamic>;
      if (data['paid'] == true) return PassPaymentResult.paid;
      // pending: fall through and wait
    } on DioException catch (e) {
      final code = e.response?.data is Map ? e.response!.data['code'] : null;
      if (code == 'payment_refunded') return PassPaymentResult.refunded;
      if (e.response?.statusCode != 429 && (e.response?.statusCode ?? 500) < 500) rethrow; // real failure
      // 429 / 5xx / network: treat like pending
    }
    await Future.delayed(const Duration(seconds: 3));
  }
  return PassPaymentResult.confirming; // the pass still appears by itself
}
```

## 7. Test checklist

Setup: Cashfree is the active gateway (sandbox keys are fine, it is test money), a rider with no active pass.

| # | Scenario | Expected |
| --- | --- | --- |
| 1 | Open `/common/payment-gateway` | `subscriptionMode` is `cashfree_checkout` |
| 2 | Tap Pay online on a plan | Cashfree sheet opens, amount equals the plan price |
| 3 | Pay | Verify turns `applied` within a poll or two, the pass shows in My passes |
| 4 | Pay by UPI collect | `pending` first (no error shown), then `applied` |
| 5 | Tap Pay twice quickly | One order (`reused: true` on the second), one charge |
| 6 | Kill the app right after paying | After the restart the pass is there (webhook) |
| 7 | Buy the same plan again while the pass is active | `409 ALREADY_PAID`, message shown |
| 8 | Call verify twice for one payment | One pass, not two |
| 9 | Reopen the pay sheet on a production build | The response has `environment: "production"` and the checkout opens in production |
| 10 | Admin switches Cashfree off | "Online payment is not available right now." |
| 11 | Admin switches back to Razorpay | `subscriptionMode` is `razorpay_checkout`, the old flow works |
| 12 | Wallet purchase | Unchanged, works on either gateway |
| 13 | Admin removes or re-prices the plan after the rider opened the sheet, then the rider pays | `409 payment_refunded`, no pass, the payment is refunded |

## 8. Not needed

- No new field in the plans or the passes responses; no app update (the calls and the switch already exist).
- No amount, no plan details in the create request: only `planId`.

## 9. Backend map

`payments/controllers/cashfreeController.js` (`createSubscriptionOrder`, `verifySubscriptionOrder`), `payments/routes/cashfreeRoutes.js` (routes and rate limits), `payments/services/paymentOrderService.js` (the pass is created when the paid order is applied; webhook and recovery loop), `user/services/subscriptionService.js` (`findPlanForPaidOrder`, `createSubscriptionFromPayment`, `findHeldPlanSubscription`), `services/paymentGatewayService.js` (`subscriptionMode`), tests `test/integration/cashfreePayments.test.js`.
