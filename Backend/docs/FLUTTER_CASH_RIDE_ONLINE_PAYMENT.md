# Rentol: Flutter guide for paying a cash ride online, and payment safety

This guide is for the Flutter developers of both apps: the **driver app** (`flutterdriver`) and the **user app** (`flutter_taxi_user`).

**Backend:** "Ride payment safety" (`complete-logistics`, 14 Oct 2026). Spec: "Backend: paying a cash ride online, plus payment safety fixes".

## What the backend now does

**Rapido-style switch.** A rider who booked with **cash** can pay **online** at the drop:
- by scanning the driver's UPI QR;
- or in the app (Razorpay or the wallet).

**Safety guarantees:**
- The driver is credited **exactly once** and never loses the fare.
- The rider can never pay twice. A second payment is **refunded automatically**.
- Both apps get the "paid" state **live** over `ride:state`.

> **UI note.** The new screens ("Show QR" for the driver, "Pay online instead" for the rider) will be designed and approved separately. This guide gives the API contract plus the **small changes needed now** so the current apps stay correct (§2, §3.1, §4.1, §5.1). Everything marked *(new UI)* waits for the approved design.

---

## 1. Summary of what changed

| Before | Now |
|---|---|
| Rider could pay online only **after** completion | Also at the drop (`liveStatus` `arrived` / `goods_delivered`) |
| Pay sheet required a rating (`rating: 0` → **400**) | **Rating is optional** when paying; send it later with `PATCH /rides/:id/feedback` |
| Paying the driver's QR never credited the driver | The driver is credited once, and both apps see `isPaid: true` live |
| QR amount came from the app | **The server decides the amount**; `amount` in the request is ignored |
| Nothing recorded that the driver took cash | Completing with `paymentMethod: 'cash'` (or `cashReceived: true`) marks the ride **paid in cash** |
| Driver could send `paymentMethod: 'online'` and get credited | **Ignored**: only a real payment makes a ride online |
| A second payment was kept | **Refunded automatically**; the app gets `ALREADY_PAID` |
| Each tap on "Pay" created a new Razorpay order | A double tap gets **the same order** back (`reused: true`) |

---

## 2. Error format and codes (both apps)

Errors keep the standard body:

```json
{ "success": false, "message": "This ride is already paid", "code": "ALREADY_PAID", "details": { "code": "ALREADY_PAID", "refunded": true } }
```

**Show `message` as it is.** Decide what to do from `code`:

| HTTP | `code` | When | What the app does |
|---|---|---|---|
| 409 | `ALREADY_PAID` | the fare is already paid (cash received, QR, in-app, or a second tap) | **Treat as success.** Close the pay sheet or QR, refresh the ride, show "Paid ✓". If `details.refunded == true`, add "Your extra payment is being refunded". |
| 409 | `PAYMENT_NOT_ALLOWED` | too early (driver not at the drop yet), ride cancelled, or nothing to collect | Close the sheet and show `message` |
| 400 | `PAYMENT_NOT_ALLOWED` | the payment belongs to another ride or order | Show `message`; don't retry |
| 400 | `AMOUNT_MISMATCH` | the amount due changed since the order was made (`details.amountDue`) | Refresh the ride and open the pay sheet again (a new order is created) |
| 400 | — | `Insufficient wallet balance` | Show it and offer Razorpay |

**Required in both apps:** `ApiException` must keep `code` and `details`. The user app's
`lib/core/network/api_exception.dart` currently has only `message`, `statusCode` and `errors`. If this isn't already done (see `FLUTTER_WALLET_PAYMENT.md`), add:

```dart
class ApiException implements Exception {
  final String message;
  final int? statusCode;
  final List<String>? errors;
  final String? code;                     // NEW
  final Map<String, dynamic>? details;    // NEW
  ApiException(this.message, {this.statusCode, this.errors, this.code, this.details});

  factory ApiException.fromDioError(DioException error) {
    final response = error.response;
    if (response != null && response.data is Map) {
      final data = response.data as Map;
      return ApiException(
        data['message']?.toString() ?? 'Something went wrong',
        statusCode: response.statusCode,
        code: data['code']?.toString() ?? (data['details'] is Map ? data['details']['code']?.toString() : null),
        details: data['details'] is Map ? Map<String, dynamic>.from(data['details']) : null,
        // keep the existing `errors` parsing
      );
    }
    // keep the existing fallback
  }

  bool get isAlreadyPaid => code == 'ALREADY_PAID';
}
```

Do the same in `flutterdriver`'s `ApiException`.

---

## 3. Ride payload: new and changed fields (both apps)

Ride payloads now carry these fields. That covers REST (`GET /rides`, `GET /rides/active/me`, the status update response) and the `ride:state` socket:

```json
{
  "paymentMethod": "online",
  "isPaid": true,
  "amountToCollect": 0,
  "paidBy": "qr",
  "paymentSwitchedFrom": "cash",
  "riderPaysInApp": 0,
  "canPayOnline": false,
  "driverPaymentCollection": {
    "provider": "razorpay", "providerId": "qr_Q1...", "providerOrderId": "", "providerPaymentId": "pay_Q1...",
    "providerMode": "razorpay_qr", "source": "qr", "status": "paid", "amount": 200, "currency": "INR",
    "linkUrl": "", "paidAt": "2026-10-14T10:21:07.000Z", "updatedAt": "2026-10-14T10:21:07.000Z"
  }
}
```

| Field | Meaning |
|---|---|
| `isPaid` | The fare is paid: cash received, QR, in-app, wallet, or a free ride. **Use this, not `paymentMethod`, to decide "paid".** |
| `amountToCollect` | Cash the **driver** must still take in hand. `0` once paid, and always `0` for online and wallet rides. |
| `paidBy` | How it was paid, once `isPaid`: `cash` \| `qr` \| `razorpay` \| `wallet` \| `free_ride` … Empty while unpaid. |
| `paymentSwitchedFrom` | `"cash"` when a cash ride was paid online in the end. Receipts can show "Booked: Cash · Paid: Online". |
| `paymentMethod` | `cash` \| `online` \| `wallet`. Becomes `online` when a cash ride is paid online. **The driver can no longer change it.** |
| `driverPaymentCollection.source` | Same values as `paidBy` |
| `canPayOnline` | **Show "Show QR" (driver) / "Pay online instead" (rider) only when this is `true`.** It is `true` for a **cash** booking that is unpaid, has something to pay, and is at the drop (`arrived` / `goods_delivered`) or was completed **less than 60 minutes ago**. It is always `false` for online and wallet bookings. It is sent in every ride payload (`GET /rides/:id`, active ride, history, the status update response, `ride:state`) and turns `false` live after "Cash received" or a payment. |

### 3.1 Model change (both apps)

Neither app reads these fields yet. Add them to the ride model: `flutterdriver/lib/features/ride/data/ride_model.dart` and the user app's ride model / `ride_tracking_controller.dart` state.

```dart
final bool isPaid;
final double amountToCollect;
final String paidBy;              // '' while unpaid
final String paymentSwitchedFrom; // '' or 'cash'

// fromJson
isPaid: json['isPaid'] == true,
amountToCollect: ((json['amountToCollect'] ?? 0) as num).toDouble(),
paidBy: json['paidBy']?.toString() ?? '',
paymentSwitchedFrom: json['paymentSwitchedFrom']?.toString() ?? '',
```

Both apps already listen to `ride:state` (`ride_providers.dart:124` in the driver app, `ride_tracking_controller.dart:82` in the user app). Make sure the handler **replaces the whole ride with the new payload**, so `isPaid` updates live.

---

## 4. Driver app (`flutterdriver`)

### 4.1 "Cash received" on completion (**required now**)

Today the app completes a trip with no payment info:

```dart
// lib/features/ride/presentation/active_ride_screen.dart:309
ref.read(rideProvider.notifier).updateStatus('completed');
```

Because of this, the server never knows the driver took cash, and the rider could still pay online afterwards. Change it:

| Situation | Send |
|---|---|
| Cash ride, the driver **took the cash** | `updateStatus('completed', paymentMethod: 'cash')`, or the new `cashReceived: true` |
| Cash ride, the rider **will pay online** (QR or app) and hasn't yet | `cashReceived: false`. The ride stays payable. |
| Ride already `isPaid` (paid online at the drop) | Nothing extra. The server keeps it as paid online. |
| Online or wallet ride | Nothing extra |

1. Add `cashReceived` to the socket call (`lib/core/services/socket_service.dart:126`) and to `RideNotifier.updateStatus` (`ride_providers.dart:255`):

```dart
void updateRideStatus(String rideId, String status, {
  String? paymentMethod, String? otp, String? proofImageUrl, String? proofNote, String? receivedBy,
  bool? cashReceived,                                   // NEW
}) {
  _socket?.emit(SocketEvents.rideStatusUpdate, {
    'rideId': rideId,
    'status': status,
    if (paymentMethod != null) 'paymentMethod': paymentMethod,
    if (cashReceived != null) 'cashReceived': cashReceived,   // NEW
    // ...existing fields
  });
}
```

2. In `_completeTrip`, use the ride state:

```dart
final cashRide = ride.paymentMethod.toLowerCase() == 'cash';
ref.read(rideProvider.notifier).updateStatus(
  'completed',
  cashReceived: cashRide && !ride.isPaid ? true : null,   // "Cash received" button
);
```

When the *(new UI)* "Rider will pay online" option exists, send `cashReceived: false` from it instead.

**Rules the server applies:**
- `cashReceived` wins over `paymentMethod`.
- Without `cashReceived`, `paymentMethod: 'cash'` means cash received.
- It only applies to **cash** rides.
- If the rider already paid online, the cash flag is ignored.
- Sending `paymentMethod: 'online'` **never** changes anything.

### 4.2 Show the UPI QR *(new UI, endpoints ready now)*

`ApiConstants.paymentsQr` / `paymentsQrStatus` already exist (`api_constants.dart:70`).

**Create:**
```
POST /api/v1/drivers/payments/qr        (driver token)
body: { "rideId": "<id>" }              // "amount" is ignored: the server uses what the rider still owes
```
**200**:
```json
{ "success": true, "data": {
  "id": "qr_Q1...", "entity": "qr_code", "status": "active",
  "imageUrl": "https://rzp.io/...png", "linkUrl": "https://rzp.io/...png",
  "amount": 200, "currency": "INR", "closeBy": 1760437200, "providerMode": "razorpay_qr" } }
```
- **Show `imageUrl`.** It's a full image URL for a QR, or a data-URL PNG for the payment-link fallback (`providerMode` contains `payment_link`). For a data-URL, decode it with `Image.memory`.
- **Show `amount` as the amount to pay.** Don't calculate it in the app.
- **Allowed** only at the drop (`liveStatus` `arrived` / `goods_delivered`) or after completion, and only while unpaid.
- **Errors:**
  - `PAYMENT_NOT_ALLOWED`: not at the drop yet, or nothing to collect.
  - `ALREADY_PAID`: show "Paid ✓".
- **Showing it again creates a new QR and closes the old one.** Don't create a QR in a loop. Create one when the screen opens or when the driver taps "Refresh QR".

**Wait for the payment.** Use both of these, whichever comes first:

1. **`ride:state`** with `isPaid: true` (instant; also sent when the rider pays in the app instead).
2. **Poll** every 5 s while the QR is on screen:
   ```
   GET /api/v1/drivers/payments/qr/status?rideId=<id>
   → { "data": { "id": "qr_...", "status": "paid", "paid": true, "source": "qr", "amount": 200, "paidAt": "..." } }
   ```
   Stop polling when `paid == true` or the screen closes.

On paid, show **"Paid online ✓ ₹200"**, then let the driver complete. Nothing else is needed: the server credits the driver.

```dart
Timer? _poll;
void _startWaiting(String rideId) {
  _poll = Timer.periodic(const Duration(seconds: 5), (_) async {
    try {
      final s = await api.get(ApiConstants.paymentsQrStatus, query: {'rideId': rideId});
      if (s['paid'] == true) _onPaid();
    } catch (_) {/* keep polling; ride:state may still arrive */}
  });
}
// in the ride:state listener: if (ride.isPaid) _onPaid();
void _onPaid() { _poll?.cancel(); setState(() => paid = true); }
```

**If the driver closes the app, nothing is lost.** The Razorpay webhook marks the ride paid and credits the driver.

### 4.3 The "Collect cash" screen

- Show **₹`amountToCollect`** to collect, not `fare`. It already subtracts a paid goods advance.
- If `isPaid` is already `true` (the rider paid at the drop), replace "Cash received" with **"Paid online ✓"** and a plain **Complete trip** button. Send no cash flag.

### 4.4 Driver wallet, for the earnings screen

| Ride | At completion | When the rider pays later |
|---|---|---|
| Cash, cash received | `-commission` ("Commission deducted for cash ride") | — (paying again is refused) |
| Cash, paid online **before** completion | `+(fare - commission)` ("Driver earning credited for online ride") | — |
| Cash, completed unpaid, paid online **after** | `-commission` | `+fare` ("Ride completion payment credited from rider") |
| Online booking, rider not paid yet | `-commission` ("Commission deducted; the fare is credited when the rider pays") | `+fare` |
| Online booking, rider **still** not paid 24 h later (admin setting) | — | `+fare` from the platform ("Fare paid by the platform (the rider has not paid yet)"); a later rider payment adds nothing more |

The end result is always **fare − commission**, plus any tip. `driver:wallet:updated` still arrives with each credit; refresh the wallet when it does.

---

## 5. User app (`flutter_taxi_user`)

### 5.1 Fix the current pay sheet (**required now**)

`ride_completion_payment_sheet.dart` (opened from `rating_review_screen.dart:42` for online rides) calls:
- `createCompletionOrder` and `payCompletionWithWallet` with **no body** (`ride_repository.dart:102-111`);
- `verifyCompletionPayment`.

Before this change, these calls failed with **400 "rating must be an integer between 1 and 5"**. **They work now**, because the rating is optional. Also make these changes:

1. **Handle `ALREADY_PAID` as success.** It happens when the driver took cash, the QR was paid, or on a double tap. Close the sheet with `true` and refresh the ride.
2. **Double tap:** the server returns the same order (`reused: true`), but still disable the button while a request is running.
3. **Verify:** send exactly what Razorpay checkout returns. `rating` and `comment` are optional:
   ```dart
   await repo.verifyCompletionPayment(rideId, {
     'razorpay_order_id': r.orderId,
     'razorpay_payment_id': r.paymentId,
     'razorpay_signature': r.signature,
     // 'rating': 5, 'comment': '...'   optional
   });
   ```
   - The **tip amount is taken from the order**, not from the verify body.
   - If verify fails with a network error, **just retry the same call**. A repeat of a payment that was already applied returns 200. If the app never retries, the webhook applies the payment anyway.
4. **The rating screen saves the rating separately** with `PATCH /rides/:id/feedback { rating, comment }`. It's no longer tied to the payment.
5. **Show the sheet only if the ride is not paid** (`!ride.isPaid`). Use `isPaid` in `_collectFareIfDue` (`rating_review_screen.dart:35`) instead of checking `paymentMethod == 'online'` alone.

```dart
} on ApiException catch (e) {
  if (e.isAlreadyPaid) {
    ref.invalidate(rideTrackingControllerProvider(widget.rideId));
    final refunded = e.details?['refunded'] == true;
    SnackbarUtils.success(context, refunded ? 'Already paid. Your extra payment is being refunded.' : 'Already paid');
    Navigator.of(context).pop(true);
    return;
  }
  SnackbarUtils.error(context, e.message);
}
```

### 5.2 Endpoints (unchanged paths, new rules)

**Create a Razorpay order**
```
POST /api/v1/rides/:rideId/complete-payment/razorpay/order     (user token)
body: { "tipAmount": 20 }        // optional; "rating" optional and not needed
```
**201**:
```json
{ "data": { "keyId": "rzp_live_...", "orderId": "order_...", "amount": 22000, "currency": "INR",
            "fare": 200, "fareDue": 200, "tipAmount": 20, "totalCharge": 220, "reused": false } }
```
- `amount` is in **paise**; show `totalCharge`.
- `fareDue` is what's left after a paid goods advance or a wallet payment.

**Verify**
```
POST /api/v1/rides/:rideId/complete-payment/razorpay/verify
body: { razorpay_order_id, razorpay_payment_id, razorpay_signature, rating?, comment? }
→ 200 { data: <ride> }
```

**Pay from the wallet**
```
POST /api/v1/rides/:rideId/complete-payment/wallet
body: { "tipAmount": 0, "rating": 5, "comment": "" }   // all optional
→ 201 { data: <ride> }
```

**When paying is allowed**
- `liveStatus` is `arrived` or `goods_delivered` (driver at the drop), or the ride is `completed`, **and** `isPaid == false`.
- Earlier → `409 PAYMENT_NOT_ALLOWED`.
- A **wallet** booking is paid automatically at completion. Only a `walletShortfall` (`riderPaysInApp > 0`) is payable here.

### 5.3 "Pay online instead" at the drop *(new UI, endpoints ready now)*

On a **cash** ride:
1. When `liveStatus` becomes `arrived` (driver at the drop), the ride screen can show **"Pay online instead"**.
2. It opens the same pay sheet, with the same endpoints as §5.2.
3. The sheet can be offered **without** a rating, before the trip is completed.
4. After payment, the rider sees "Paid ✓". The driver's app gets `ride:state` with `isPaid: true` at the same moment and shows "Paid online ✓".
5. Hide the option when `isPaid` is `true`, or when the driver already completed with cash received (any attempt returns `ALREADY_PAID`).

### 5.4 Receipts and history

- Use `isPaid` and `paidBy` for "Paid by: Cash / UPI QR / Online / Wallet".
- If `paymentSwitchedFrom == 'cash'`, show "Booked as cash, paid online".

---

## 6. Sequences

**A. The driver takes cash**
```
driver: completed + paymentMethod 'cash'   ->  ride: isPaid true, paidBy 'cash', amountToCollect 0
rider:  any pay attempt                    ->  409 ALREADY_PAID (treat as paid)
driver wallet: -commission
```

**B. The rider scans the driver's QR at the drop**
```
driver: POST /drivers/payments/qr {rideId}   ->  QR for ₹amountToCollect
rider:  pays in their UPI app
server: webhook (or the driver's poll)  ->  ride paid, ride:state isPaid true to both apps
driver: completes (no cash flag)        ->  wallet +(fare - commission)
```

**C. The rider pays in the app at the drop**
```
rider:  order -> Razorpay checkout -> verify   (or wallet pay)
server: ride:state isPaid true -> driver shows "Paid online ✓"
driver: completes                             ->  wallet +(fare - commission)
```

**D. The rider pays twice (QR and app, or two orders)**
```
the first payment counts; the second -> refunded automatically, 409 ALREADY_PAID with details.refunded = true
```

---

## 7. QA checklist

**Driver app**
- [ ] Cash ride, tap **Cash received** → the rider app's pay sheet / "Pay online" gets `ALREADY_PAID`; the driver wallet shows −commission only.
- [ ] Driver at the drop, rider pays in the app → the driver screen switches to **"Paid online ✓"** by itself (no refresh); completing it gives +(fare − commission).
- [ ] Show QR → the amount equals `amountToCollect` (try a goods ride with a paid advance: the QR is fare − advance).
- [ ] Show QR, the rider pays, the **driver app is killed** → open the app again: the ride is paid and the wallet is credited once.
- [ ] Show QR twice → only the latest QR can be paid.
- [ ] Before the drop, Show QR → `PAYMENT_NOT_ALLOWED` message.

**User app**
- [ ] Online ride: the pay sheet works **without** a rating (it used to fail with 400).
- [ ] Double tap "Pay" → one Razorpay checkout, one charge.
- [ ] Kill the app right after paying in Razorpay → reopen: the ride shows paid (webhook).
- [ ] Pay, then try again → "Already paid", no second charge.
- [ ] Rate after paying → the rating is saved (`PATCH /rides/:id/feedback`).

---

## 8. For the backend / admin (reference)

- **Razorpay dashboard → Webhooks → Add:**
  - URL: `https://logistics.buytogetherindia.com/api/v1/rides/payments/razorpay/webhook`
  - Events: `payment.captured`, `qr_code.credited`, `payment_link.paid`
  - Secret: the same value as `RAZORPAY_WEBHOOK_SECRET` in `Backend/.env`.

  Without it, everything works except catching a QR payment while the driver app is closed. That payment is then picked up the next time the driver opens the QR status.
- **Refunds** made automatically are recorded on the ride (`paymentRefunds`). A refund that Razorpay rejected has `status: "failed"` and must be refunded by hand.
- **Admin reports** now show `paymentSwitchedFrom` and `settledAs`. The driver finance summary has `by_card_switched_from_cash`.
