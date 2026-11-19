# Flutter: driver "Collect payment" QR (Cashfree)

For the Flutter developer, driver app `flutterdriver`. At the drop the driver can show a QR; the rider scans it with any UPI app and pays the fare. It used to run on Razorpay only and showed **"Razorpay gateway is disabled"** whenever Cashfree was the active gateway. It now runs on Cashfree. **The app calls the same two endpoints and gets the same response shape, so no app change is required.** This file is the full contract, the states, and what to verify, plus a few small hardening points worth doing.

Related: `FLUTTER_CASHFREE_PAYMENTS.md` (wallet, ride payment and goods advance on Cashfree), `FLUTTER_CAN_PAY_ONLINE.md` (when the QR button appears).

## 1. What changed

| | Before | Now |
| --- | --- | --- |
| Provider behind the QR | Razorpay QR / payment link | **Cashfree payment link** with its QR |
| Failure with Cashfree active | `403 Razorpay gateway is disabled` | works |
| Endpoints | `POST /drivers/payments/qr`, `GET /drivers/payments/qr/status` | **same** |
| Response fields | `imageUrl`, `linkUrl`, `amount`, ... | **same** |
| Amount | server | server (the app's `amount`, if any, is ignored) |
| New QR | old one closed | old one **cancelled**, it can no longer be paid |

`imageUrl` is now always a **PNG data URL** (`data:image/png;base64,...`), not an https address. The old payment-link fallback already returned a data URL, so if the screen decodes it that way nothing changes. If it uses `Image.network(imageUrl)` for the Razorpay QR, switch to the decoder below.

## 2. Calls

Base `/api/v1`, driver `Authorization: Bearer <token>`.

### 2.1 Create the QR
`POST /drivers/payments/qr`

```json
{ "rideId": "665f1c2e9a3b4d0012ab34cd" }
```

Success `200`:

```json
{
  "success": true,
  "data": {
    "id": "rc_9a3b4d0012ab_mwn6u",
    "entity": "payment_link",
    "status": "active",
    "imageUrl": "data:image/png;base64,iVBORw0KGgo...",
    "linkUrl": "https://payments.cashfree.com/links/XXXX",
    "amount": 232,
    "currency": "INR",
    "description": "Fare for ride 0012ab34cd",
    "closeBy": 1795000000,
    "providerMode": "cashfree_payment_link_qr"
  }
}
```

| Field | Use |
| --- | --- |
| `imageUrl` | The QR to draw (data URL) |
| `linkUrl` | The same payment as a link: for "Share link" / "Open in browser" |
| `amount` | What to display ("Collect Rs 232"). Always show **this**, never a number the app computed |
| `closeBy` | Unix time in **seconds**: when the QR expires (30 minutes after creation) |
| `id` | The link id (keep it if you log or show support details) |

### 2.2 Poll the status
`GET /drivers/payments/qr/status?rideId=<id>` every **5 seconds** while the screen is open.

```json
{
  "success": true,
  "data": {
    "provider": "cashfree",
    "id": "rc_9a3b4d0012ab_mwn6u",
    "providerMode": "cashfree_payment_link_qr",
    "status": "active",
    "paid": false,
    "source": "qr",
    "amount": 232,
    "currency": "INR",
    "linkUrl": "https://payments.cashfree.com/links/XXXX",
    "paidAt": null,
    "updatedAt": "2026-11-19T11:02:23.000Z"
  }
}
```

The status response has **no `imageUrl`**: keep the image from the create response in memory for as long as the screen is open.

| `status` | Meaning | App behaviour |
| --- | --- | --- |
| `active` (also `created`, `pending`) | Waiting for the rider | Keep showing the QR, keep polling |
| `paid` (`paid: true`) | The rider paid | Stop polling, show "Payment received" |
| `expired` | 30 minutes passed | Stop polling, show "QR expired" and a **Retry** button |
| `cancelled` | This QR was cancelled (for example a newer QR replaced it) | Stop polling; if the ride is not paid offer **Retry** |

If the ride is paid some other way (the rider paid in their own app, or the driver tapped "Cash received"), the same call returns `paid: true` with a different `source` (for example `cashfree` or `cash`): treat it exactly as paid.

### 2.3 Optional: the same calls under the Cashfree prefix
`POST /payments/cashfree/rides/:rideId/collect/order` and `GET /payments/cashfree/rides/:rideId/collect/status` do the same job (rideId in the path instead of the body/query). Use whichever your code already calls; do not mix them for one ride.

### 2.4 Which flow to show
`GET /common/payment-gateway` -> `data.activeGateway.driverCollectMode`:

| Value | Meaning |
| --- | --- |
| `cashfree_qr` | The QR above is available |
| `unsupported` | Online collection is off: hide the QR button and keep cash only |

## 3. Errors

The error body is `{ "success": false, "message": "...", "code": "..." }` (`code` is only on some).

| HTTP | `code` | `message` | Cause | What to show |
| --- | --- | --- | --- | --- |
| 400 | | `rideId is required` | missing / invalid id | App bug: log it |
| 404 | | `Ride not found for this driver` | not this driver's ride | "Ride not found" |
| 409 | `ALREADY_PAID` | `This ride is already paid` | fare paid (cash, app, QR) | Treat as paid: close the screen, refresh the ride |
| 409 | `PAYMENT_NOT_ALLOWED` | `The QR can be shown once you reach the drop` | too early (before `arrived`) or the cash window is over | Show the message |
| 409 | `PAYMENT_NOT_ALLOWED` | `Nothing is left to collect on this ride` | the fare is already covered | Close the screen |
| 403 | | `Cashfree gateway is disabled` | admin switched Cashfree off | "Online payment is not available. Collect cash." |
| 502 | `cashfree_unreachable` | `Cashfree could not be reached` | network to Cashfree failed | "Could not create the QR. Try again." with **Retry** |
| 502 | `cashfree_error` | `Cashfree rejected the configured keys` | wrong keys on the server | "Online payment is temporarily unavailable." Tell the backend owner |
| 429 | | rate limited | too many create calls (the `/collect/order` route) | Wait a few seconds, then Retry |

The old text **"Razorpay gateway is disabled" must never appear again**. If it does, the app is hitting an old backend build.

A failed **poll** must not hide the QR or show an error dialog: ignore it, keep the last status, try again at the next tick (back off to 10 s after a 429 or 5xx).

## 4. Rules the backend enforces (so the app need not)

1. **Amount**: the fare still owed (fare minus a paid goods advance, or what a wallet could not cover). The app sends none.
2. **When**: the driver must be at the drop (`liveStatus: arrived` / `goods_delivered`) or the ride just completed (within the cash-pay window).
3. **One live QR per ride**: Retry makes a new link and **cancels the previous one**. Never show two QRs.
4. **Paid once**: poll, webhook and the server's recovery loop can all learn about the payment; the ride is marked paid once and the driver is credited once.
5. **Late or double payments are refunded** to the rider automatically: a payment on a QR after the fare was paid some other way, or on a cancelled QR that was paid anyway.
6. **Driver credit**:
   - ride not completed yet: nothing credited now; the fare is credited when the ride is completed (as a paid online ride, fare minus commission);
   - ride already completed as cash: the fare is credited at once (commission was already deducted);
   - plus any tip the rider added.
7. **Both apps get `ride:state`** the moment it is paid; the driver also gets `driver:wallet:updated` when money was credited.

## 5. Suggested screen flow

```
Open "Collect payment"
  -> POST /drivers/payments/qr
       200  -> show imageUrl + amount + "Share link" + countdown to closeBy
       409 ALREADY_PAID -> done (paid)
       409 PAYMENT_NOT_ALLOWED / 403 / 502 -> message (+ Retry where it helps)
  -> every 5 s: GET /drivers/payments/qr/status
       paid      -> success state, stop, refresh ride
       expired   -> "QR expired" + Retry
       cancelled -> Retry (only if the ride is still unpaid)
       active    -> keep waiting
  -> "Cash received" button: unchanged (the QR link is cancelled for you)
  -> leaving the screen: stop polling (the payment still settles on the server)
```

## 6. Code sketches

### 6.1 Draw the data URL
```dart
import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';

Uint8List? decodeDataUrl(String? dataUrl) {
  if (dataUrl == null || !dataUrl.startsWith('data:')) return null;
  final comma = dataUrl.indexOf(',');
  if (comma < 0) return null;
  return base64Decode(dataUrl.substring(comma + 1));
}

Widget qrImage(String imageUrl) {
  final bytes = decodeDataUrl(imageUrl);
  if (bytes != null) {
    return Image.memory(bytes, width: 260, height: 260, filterQuality: FilterQuality.none, gaplessPlayback: true);
  }
  // an https image (older backend builds)
  return Image.network(imageUrl, width: 260, height: 260);
}
```

Decode once when the response arrives and keep the `Uint8List`; do not decode on every rebuild.

### 6.2 Model
```dart
class CollectQr {
  CollectQr({required this.id, required this.imageUrl, required this.linkUrl, required this.amount, required this.closeBy});
  final String id;
  final String imageUrl;
  final String linkUrl;
  final double amount;
  final DateTime? closeBy;

  factory CollectQr.fromJson(Map<String, dynamic> j) => CollectQr(
        id: '${j['id'] ?? ''}',
        imageUrl: '${j['imageUrl'] ?? ''}',
        linkUrl: '${j['linkUrl'] ?? ''}',
        amount: (j['amount'] as num?)?.toDouble() ?? 0,
        closeBy: j['closeBy'] is num ? DateTime.fromMillisecondsSinceEpoch((j['closeBy'] as num).toInt() * 1000) : null,
      );
}
```

### 6.3 Poll loop
```dart
Timer? _poll;

void startPolling(String rideId) {
  _poll?.cancel();
  _poll = Timer.periodic(const Duration(seconds: 5), (_) async {
    try {
      final res = await api.get('/drivers/payments/qr/status', queryParameters: {'rideId': rideId});
      final data = res.data['data'] as Map<String, dynamic>;
      final status = '${data['status']}';
      if (data['paid'] == true) { _poll?.cancel(); onPaid(); }
      else if (status == 'expired' || status == 'cancelled') { _poll?.cancel(); onClosed(status); }
    } catch (_) {
      // keep the QR on screen, try again next tick
    }
  });
}

@override
void dispose() { _poll?.cancel(); super.dispose(); }
```

### 6.4 Countdown
Use `closeBy` for a visible "Expires in 28:41" label. The server decides expiry: when the label reaches zero, call the status endpoint once and show Retry if it says `expired`.

## 7. Things to tighten (small, optional)

- Show **`data.amount`** from the response everywhere (title, button); do not recompute the fare in the app.
- Use the message from `message` for the 409 cases: it is already worded for drivers.
- Keep the screen awake while the QR is open (`wakelock`) and lift the screen brightness a little; scanning a dim QR fails often.
- Do not log the whole create response: `imageUrl` is large.

## 8. Test checklist

Setup: Cashfree is the active gateway (sandbox keys are fine: it is test money), a ride accepted and driven to the drop.

| # | Scenario | Expected |
| --- | --- | --- |
| 1 | Open Collect payment at the drop | A QR appears, amount equals the fare due, no "Razorpay" message |
| 2 | Open it before the drop (just accepted) | `409 PAYMENT_NOT_ALLOWED`, "can be shown once you reach the drop" |
| 3 | Rider scans and pays | Within one or two polls (about 5 s to 10 s) the screen shows paid |
| 4 | Kill the driver app right after the rider pays, reopen | The ride is paid; the QR screen shows paid or closes as `ALREADY_PAID` |
| 5 | Tap Retry twice | Two different QRs over time; paying the first one is not possible |
| 6 | Wait 30 minutes with the QR shown | Status `expired`, Retry offered |
| 7 | Driver taps "Cash received" with the QR open | Ride paid in cash; the QR link is cancelled |
| 8 | Rider pays in the rider app while the QR is open | Driver screen flips to paid (`source` is not `qr`), no second charge |
| 9 | Pay, then open the screen again | `409 ALREADY_PAID`, handled as paid |
| 10 | Turn off the phone's internet while the QR is shown | QR stays, polling resumes when the network is back |
| 11 | Admin switches Cashfree off | "Online payment is not available" message, cash still works |
| 12 | Ride completed as cash, QR paid within the window | Driver wallet gets the fare once (`driver:wallet:updated`) |
| 13 | Check the earnings after completion | Fare minus commission, once, not twice |

## 9. Not needed

- No new endpoint or field, no change to the response parsing (except decoding the data URL if you were using `Image.network`).
- No amount in the request. No payment SDK in the driver app: the rider's UPI app does the payment.

## 10. Backend map

`driver/controllers/driverController.js` (`createDriverPaymentQr`, `getDriverPaymentQrStatus`), `payments/services/driverCollectService.js` (create the link, sync, settle), `services/cashfreeClient.js` (payment link calls), `services/ridePaymentService.js` (settle once, refund, cancel the old link), `payments/services/paymentOrderService.js` (webhook and recovery loop), tests `test/integration/cashfreePayments.test.js`.
