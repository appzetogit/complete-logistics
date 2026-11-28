# Rentol: Flutter guide for "goods advance: partial refund when the rider cancels"

This guide is for the Flutter developer of the **user app** (`flutter_taxi_user`). Nothing changes in the driver app.

**Backend:** "Goods advance: keep 15% of the fare on rider cancel, refund the rest" (`complete-logistics`, 28 Oct 2026).
It extends section 3 of `FLUTTER_GOODS_ADVANCE.md` (paying the advance itself is unchanged).

---

## 1. What changed (summary)

A goods (parcel) booking takes an **advance** (default 20% of the fare). Before, if the rider cancelled after paying it,
the **whole advance was lost**. Now:

| | Before | Now |
|---|---|---|
| Rider cancels after paying the advance | all of it is kept, nothing comes back | **15% of the fare is kept, the rest of the advance is refunded** |

- The 15% is `goods_advance_cancel_keep_percent` (an admin setting). It is a share of the **fare**, not of the advance.
- The kept part can never be more than the advance.
- The refund goes to the same place as any other refund (refund wallet, wallet, or the original payment).
- **Paying the advance, driver cancel, no driver found, admin cancel: unchanged** (these still refund the whole advance).

Your app must change in three places: the **cancel dialog** (before cancel), the **cancel result** (after cancel), and the
**ride details / history** screens. Details below.

---

## 2. The rule, with numbers

```
kept     = min(advance, fare × keepPercent / 100)
refunded = advance − kept
```

| Fare | Advance paid | keepPercent | Kept | Refunded | `goodsAdvance.status` after |
|---|---|---|---|---|---|
| ₹1000 | ₹200 (20%) | 15 | **₹150** | **₹50** | `forfeited` |
| ₹1000 | ₹1000 (paid in full) | 15 | **₹150** | **₹850** | `forfeited` |
| ₹1000 | ₹200 | 20 or more | ₹200 | ₹0 | `forfeited` |
| ₹1000 | ₹200 | 0 | ₹0 | ₹200 | `refunded` |
| ₹1000 | none paid yet (`pending`) | any | ₹0 | ₹0 | stays `pending` (nothing was charged) |

Notes:
- Amounts are in **rupees** (numbers like `150` or `149.5`), not paise. The server rounds to 2 decimals.
- The rule is the same whether the rider cancels **before or after a driver is assigned**.
- `kept + refunded` is always equal to `goodsAdvance.amount`.

---

## 3. Where the app gets the keep percent (for the cancel dialog)

Do **not** hard-code 15. Use one of these (in this order):

1. **The booking quote** `POST /deliveries/quote` has a new field:
   ```json
   { "advancePercent": 20, "advanceAmount": 200, "remainingAmount": 800, "advanceOptions": [20, 100],
     "advanceCancelKeepPercent": 15 }
   ```
   It is `0` when the booking has no advance (free ride / subscription cover).
2. **App start** `GET /users/bootstrap` -> `data.settings.transportRide.goods_advance_cancel_keep_percent`.
   It is a **string** (for example `"15"`). If it is missing, use `15`.

(The cancel preview also returns `advanceCancelKeepPercent`; prefer the preview for the dialog.)

Keep the value with the active booking (for example in your ride state), so the dialog still works after the app is
restarted and the ride is restored from `GET /rides/active/me` or `GET /deliveries/active/me`.

---

## 4. API changes

### 4.1 The `goodsAdvance` object (in every ride / delivery payload)

Two new fields. Everything else is as before.

```json
"goodsAdvance": {
  "percent": 20,
  "amount": 200,
  "status": "forfeited",
  "provider": "wallet",
  "paidAt": "2026-10-28T09:10:00.000Z",
  "refundDestination": "refund_wallet",
  "refundedAt": "2026-10-28T09:20:00.000Z",
  "forfeitedAt": "2026-10-28T09:20:00.000Z",
  "keptAmount": 150,
  "refundedAmount": 50
}
```

| `status` | Meaning | `keptAmount` | `refundedAmount` |
|---|---|---|---|
| `none` | no advance on this booking | 0 | 0 |
| `pending` | advance not paid yet | 0 | 0 |
| `paid` | advance paid, booking active | 0 | 0 |
| `refunded` | the whole advance came back (driver cancel, no driver, admin cancel, or keep percent 0) | 0 | = `amount` |
| `forfeited` | rider cancelled: part kept, rest refunded | the kept part | the refunded part (can be 0) |

Old bookings (cancelled before this change) are returned correctly too: `forfeited` shows `keptAmount = amount`,
`refundedAmount = 0`. You do not need special code for them.

### 4.2 Cancel: `PATCH /rides/:rideId/cancel`

New fields in `data`:

| Field | Type | Meaning |
|---|---|---|
| `advanceStatus` | string | the advance status after the cancel (see table above) |
| `advanceRefunded` | bool | **`true` when `advanceRefundedAmount > 0`** (it used to be always `false` for a rider cancel) |
| `advanceKeptAmount` | number | what was kept |
| `advanceRefundedAmount` | number | what was refunded |
| `advanceRefundDestination` | string | `refund_wallet`, `wallet` or `source` (empty when nothing was refunded) |

Examples (fare ₹1000, advance ₹200):

```json
// rider cancels after paying (normal case)
{ "rideId": "…", "status": "cancelled", "advanceStatus": "forfeited", "advanceRefunded": true,
  "advanceKeptAmount": 150, "advanceRefundedAmount": 50, "advanceRefundDestination": "refund_wallet" }

// keep share >= advance share: everything is kept, nothing comes back
{ "rideId": "…", "status": "cancelled", "advanceStatus": "forfeited", "advanceRefunded": false,
  "advanceKeptAmount": 200, "advanceRefundedAmount": 0, "advanceRefundDestination": "" }

// keep percent is 0: ordinary full refund
{ "rideId": "…", "status": "cancelled", "advanceStatus": "refunded", "advanceRefunded": true,
  "advanceKeptAmount": 0, "advanceRefundedAmount": 200, "advanceRefundDestination": "refund_wallet" }

// rider cancels before paying: nothing was charged
{ "rideId": "…", "status": "cancelled", "advanceStatus": "pending", "advanceRefunded": false,
  "advanceKeptAmount": 0, "advanceRefundedAmount": 0, "advanceRefundDestination": "" }
```

- **Calling cancel again** (double tap, retry after a timeout) is safe: it returns `200` with the **same amounts** and
  never refunds twice. (Note: two cancels sent at the very same instant can make one of them return `500`. This is a known
  server issue being fixed. If you get a `500` on cancel, refresh the ride before showing an error: it may already be cancelled.)
- If the refund to the original payment (`source`) fails at the payment gateway, the ride **is still cancelled** but the
  response has `advanceStatus: "paid"`, `advanceRefunded: false` and both amounts `0`. See section 7.

### 4.3 Socket event `goodsAdvance:refunded`

It already existed for full refunds. It is now **also sent for the refunded part of a rider cancel** (only when
`amount > 0`):

```json
// rider cancel (new)
{ "rideId": "…", "amount": 50, "keptAmount": 150, "destination": "refund_wallet", "reason": "cancelled_by_rider" }

// full refunds (as before)
{ "rideId": "…", "amount": 200, "destination": "refund_wallet", "reason": "no_driver_found | cancelled_by_driver | cancelled_by_admin | replaced_by_new_booking" }
```

For a rider cancel the app gets **both** the HTTP response and this event. Show **one** message: for example show the
result from the HTTP response, and use the event only to refresh the wallet. (Or de-duplicate by `rideId` + `reason`.)

---

## 5. What to build in the app

### 5.1 Cancel dialog (before the rider cancels)

Show it when `goodsAdvance.status == "paid"`. **Do not calculate: call `GET /rides/:rideId/cancel-preview` and show its numbers.**
It uses the same code as the real cancel, so the dialog and the result always agree:

```json
{ "success": true, "data": {
  "rideId": "…", "fee": 0, "feeGoesTo": null, "walletCoversFee": true,
  "advanceAmount": 200, "advanceKeptAmount": 150, "advanceRefundAmount": 50,
  "advanceRefundDestination": "refund_wallet", "advanceCancelKeepPercent": 15,
  "advanceForfeited": true, "advanceRefundable": true } }
```

| Field | Meaning |
|---|---|
| `advanceAmount` | advance paid (0 when not paid) |
| `advanceKeptAmount` | charged on cancel |
| `advanceRefundAmount` | comes back on cancel |
| `advanceRefundDestination` | `refund_wallet` / `wallet` / `source`, empty when nothing comes back |
| `advanceCancelKeepPercent` | % of the fare that is kept (0 when no paid advance) |
| `advanceForfeited` / `advanceRefundable` | old flags for old apps: "something is kept" / "something comes back". Both can be `true`. Use the amounts instead. |

`kept + refund == advanceAmount`. The preview changes nothing; `409` if the ride is already completed/cancelled.
The formula below is only a fallback if the call fails:

```
kept   = min(goodsAdvance.amount, fare × keepPercent / 100)
refund = goodsAdvance.amount − kept
```

Text, for example:

> **Cancel this booking?**
> ₹150 will be charged as a cancellation fee and ₹50 will be refunded to your refund wallet.
> [ Keep booking ] [ Cancel booking ]

- If `refund == 0`: "₹200 advance will be charged as a cancellation fee."
- If `kept == 0`: "Your ₹200 advance will be refunded."
- Where the refund goes (`refundDestination` is only known after the cancel, so use the admin setting if you have it, or say
  "will be refunded"): `refund_wallet` = refund wallet, `wallet` = wallet, `source` = original payment.
- If `status == "pending"` (not paid yet): no fee text, nothing was charged.
- `fare` is the ride's `fare` field.

### 5.2 After the cancel

Use the numbers from the **cancel response**, do not recalculate:

> **Booking cancelled.** ₹150 charged, ₹50 refunded to your refund wallet.

Where the money went:
- `refund_wallet` -> "refund wallet" (refresh `GET /users/wallet` -> `refundWallet`)
- `wallet` -> "wallet" (refresh `GET /users/wallet` -> `balance`)
- `source` -> "your original payment (can take a few days)"

### 5.3 Ride details / history

| `status` | Show |
|---|---|
| `pending` | "Advance not paid" |
| `paid` | "Advance ₹{amount} paid" |
| `refunded` | "₹{refundedAmount} advance refunded" |
| `forfeited` | "₹{keptAmount} cancellation fee charged" and, if `refundedAmount > 0`, "₹{refundedAmount} refunded" |

The old text "Advance not refundable" is **wrong now**. Remove it.

### 5.4 Old app versions

Old builds do not crash: they ignore the new fields. But they still say "no refund" in the cancel dialog and will show the
old text for a `forfeited` advance. Ask users to update.

---

## 6. Dart sketch

```dart
import 'dart:math';

double _round2(num v) => (v * 100).roundToDouble() / 100;

class GoodsAdvance {
  GoodsAdvance({required this.amount, required this.status, this.keptAmount = 0, this.refundedAmount = 0, this.refundDestination = ''});
  final double amount;
  final String status; // none | pending | paid | refunded | forfeited
  final double keptAmount;
  final double refundedAmount;
  final String refundDestination;

  factory GoodsAdvance.fromJson(Map<String, dynamic> j) => GoodsAdvance(
        amount: (j['amount'] ?? 0).toDouble(),
        status: (j['status'] ?? 'none').toString(),
        keptAmount: (j['keptAmount'] ?? 0).toDouble(),
        refundedAmount: (j['refundedAmount'] ?? 0).toDouble(),
        refundDestination: (j['refundDestination'] ?? '').toString(),
      );
}

/// Preview for the cancel dialog only. After the cancel, use the server's numbers.
class CancelPreview {
  CancelPreview(this.kept, this.refund);
  final double kept;
  final double refund;
}

CancelPreview cancelPreview({required num fare, required num advance, required num keepPercent}) {
  final kept = min(advance.toDouble(), _round2(fare * keepPercent / 100));
  return CancelPreview(kept, _round2(advance - kept));
}

// keepPercent: from the quote (advanceCancelKeepPercent) or bootstrap
// (settings.transportRide.goods_advance_cancel_keep_percent is a String), default 15.
double parseKeepPercent(dynamic v) => double.tryParse('${v ?? ''}') ?? 15;

// Cancel response
class CancelAdvanceResult {
  CancelAdvanceResult.fromJson(Map<String, dynamic> d)
      : status = (d['advanceStatus'] ?? 'none').toString(),
        refunded = d['advanceRefunded'] == true,
        kept = (d['advanceKeptAmount'] ?? 0).toDouble(),
        refundedAmount = (d['advanceRefundedAmount'] ?? 0).toDouble(),
        destination = (d['advanceRefundDestination'] ?? '').toString();
  final String status;
  final bool refunded;
  final double kept;
  final double refundedAmount;
  final String destination;
}
```

---

## 7. Edge cases

| Case | What the server sends | What the app should do |
|---|---|---|
| Rider cancels twice | `200`, same amounts | show the same result; no second refund |
| Keep share >= advance | `forfeited`, `refundedAmount: 0`, no socket event | "₹200 charged", no refund text |
| Keep percent set to 0 | `refunded`, full amount | "₹200 refunded" |
| Free ride / subscription booking | no advance (`status: "none"`) | no advance text |
| **Refund to the original payment failed at the gateway** | cancel is `200`, `advanceStatus: "paid"`, amounts `0` | the ride is cancelled but the advance is **not settled yet**. Show: "Booking cancelled. Your advance refund is being processed. Please contact support if it does not arrive." Do not say "charged" or "refunded". |
| Cancel returns `500` right after a double tap | - | refresh the ride (`GET /rides/active/me`); if it is cancelled, treat it as success |
| Booking cancelled by driver / admin / no driver found | full refund event, `refunded` | unchanged |

**Backend note for the gateway-failure row:** there is no automatic retry yet for an unsettled advance on a cancelled ride
(this was already true for full refunds). It is rare (only when Razorpay is down during a cancel with refund destination
`source`). Support can see it as a cancelled goods ride whose `goodsAdvance.status` is still `paid`.

---

## 8. QA checklist

Use a goods booking with fare ₹1000 and the default 20% advance (so ₹200 is paid). Default keep percent 15.

- [ ] Quote shows `advanceCancelKeepPercent: 15`.
- [ ] Cancel dialog says "₹150 charged, ₹50 refunded" (not "no refund").
- [ ] Cancel (driver already assigned): response has `advanceKeptAmount: 150`, `advanceRefundedAmount: 50`, `advanceRefunded: true`, `advanceStatus: "forfeited"`.
- [ ] Cancel before any driver is assigned: same numbers.
- [ ] Refund wallet increases by exactly ₹50 (`GET /users/wallet` -> `refundWallet`). Not ₹200, not ₹0.
- [ ] Only **one** message is shown (HTTP result + socket event are not shown twice).
- [ ] Tap cancel twice: no second refund, same result.
- [ ] Pay in full (`advancePercent: 100`), then cancel: ₹150 charged, ₹850 refunded.
- [ ] Booking cancelled before paying the advance: no fee text, nothing charged.
- [ ] Driver cancel / admin cancel / no driver found: **full** refund, unchanged text.
- [ ] Ride history shows both numbers for a `forfeited` advance.
- [ ] Admin sets keep percent to 30 (more than the 20% advance): ₹200 charged, no refund, no refund event.
- [ ] Admin sets keep percent to 0: full ₹200 refund, status `refunded`.
- [ ] Old cancelled bookings still open and show "₹200 charged".

---

## 9. For backend / admin (reference)

- Setting: `goods_advance_cancel_keep_percent` (default `15`, `0` = refund everything, max `100`).
  Admin panel: **Settings > Transport Ride > "Goods Advance Kept When Rider Cancels"**.
  API: `PATCH /admin/general-settings/transport_ride` with `{ "goods_advance_cancel_keep_percent": "15" }`.
- Refund destination (unchanged): `goods_advance_refund_to` = `refund_wallet` (default) | `wallet` | `source`.
- If cancellation fees go to the driver (`cancellation_fee_goes_to = driver`) and a driver is assigned, the driver wallet gets
  **only the kept part**, not the whole advance. Otherwise the platform keeps it.
- Every state change is an atomic `paid -> final state` compare-and-set, so a repeated cancel never refunds twice.
  A wallet refund, the driver credit and the status change happen in one transaction. A Razorpay refund claims the status
  first and puts it back to `paid` if the gateway fails.
- If the settings cannot be loaded at cancel time, the defaults (15%, refund wallet) are used.
