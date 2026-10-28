# Rentol: Flutter guide for the cancel dialog (`cancel-preview`) with the goods-advance partial refund

For the Flutter developer of the **user app** (`flutter_taxi_user`). Backend commit `49f5f7c` (28 Oct 2026).
Read this together with `FLUTTER_GOODS_ADVANCE_CANCEL_REFUND.md` (the rule, the cancel result, history screens).
This file is only about **the dialog shown before the rider cancels**.

---

## 1. Why this changed

When a rider cancels a goods (parcel) booking after paying the advance, the server now **keeps 15% of the fare and
refunds the rest of the advance** (before: it kept everything). `PATCH /rides/:rideId/cancel` already did this.

But `GET /rides/:rideId/cancel-preview`, the call that feeds your cancel dialog, still said "advance will not be refunded".
That is fixed. The preview now returns the real numbers, computed by the **same code** as the real cancel, so the dialog and
the result can never disagree.

**Rule for the app: show the numbers the preview returns. Do not calculate them yourself.**

---

## 2. The call

```
GET /api/v1/rides/:rideId/cancel-preview        (rider token)
```

Call it every time the rider taps "Cancel booking", **before** you show the dialog. Do not cache it: the fare, the wallet
and the advance status can change (for example the advance gets paid while the screen is open). It changes nothing on the
server.

### 2.1 Response

```json
{
  "success": true,
  "data": {
    "rideId": "6720f1...",
    "fee": 0,
    "feeGoesTo": null,
    "walletCoversFee": true,

    "advanceAmount": 200,
    "advanceKeptAmount": 150,
    "advanceRefundAmount": 50,
    "advanceRefundDestination": "refund_wallet",
    "advanceCancelKeepPercent": 15,

    "advanceForfeited": true,
    "advanceRefundable": true
  }
}
```

| Field | Type | Meaning |
|---|---|---|
| `fee` | number (₹) | the normal cancellation fee (Set Price rule). Charged from the rider's wallet. **Separate from the advance.** |
| `feeGoesTo` | `"admin"` / `"driver"` / `null` | who gets `fee` (`null` when `fee` is 0) |
| `walletCoversFee` | bool | `false` = the wallet balance is too low to take `fee` |
| `advanceAmount` | number (₹) | advance paid. `0` when there is no paid advance |
| `advanceKeptAmount` | number (₹) | **charged** if the rider cancels |
| `advanceRefundAmount` | number (₹) | **comes back** if the rider cancels |
| `advanceRefundDestination` | string | `refund_wallet` / `wallet` / `source` (original payment). `""` when nothing comes back |
| `advanceCancelKeepPercent` | number | the % of the **fare** that is kept (admin setting). `0` when there is no paid advance |
| `advanceForfeited` | bool | **old flag.** "something is kept" (`advanceKeptAmount > 0`) |
| `advanceRefundable` | bool | **old flag.** "something comes back" (`advanceRefundAmount > 0`) |

Invariant: when the advance is paid, `advanceKeptAmount + advanceRefundAmount == advanceAmount`.
All amounts are rupees (not paise) with at most 2 decimals. Round before showing, because Dart doubles can print as
`24.049999999999997`: use `toStringAsFixed(2)` (or drop `.00`).

**Do not use `advanceForfeited` / `advanceRefundable` in new code.** They exist so old app builds do not break. Both can be
`true` at the same time now, which is why the old text "will not be refunded" would be wrong. Use the amounts.

### 2.2 Errors

| Status | Meaning | App |
|---|---|---|
| `401` | no or expired token | normal re-login flow |
| `404` | not this rider's ride | show a generic error |
| `409` | ride is already completed or cancelled | close the dialog, refresh the ride (`GET /rides/active/me`) |
| `5xx` / no network | | fall back to the formula in section 6, or show the generic dialog text |

---

## 3. What the preview returns in each situation

Fare ₹1000, advance 20% (₹200 paid). The keep percent is the admin setting `goods_advance_cancel_keep_percent`.

| Situation | advanceAmount | advanceKeptAmount | advanceRefundAmount | advanceRefundDestination | advanceCancelKeepPercent | advanceForfeited | advanceRefundable |
|---|---|---|---|---|---|---|---|
| Paid ₹200, keep 15% (default) | 200 | **150** | **50** | `refund_wallet` | 15 | true | true |
| Paid in full ₹1000, keep 15% | 1000 | 150 | 850 | `refund_wallet` | 15 | true | true |
| Paid ₹200, keep 30% (more than the advance) | 200 | 200 | 0 | `""` | 30 | true | false |
| Paid ₹200, keep 0% | 200 | 0 | 200 | `refund_wallet` | 0 | false | true |
| Advance **not paid yet** (`pending`) | 0 | 0 | 0 | `""` | 0 | false | false |
| Taxi ride / no advance / free ride | 0 | 0 | 0 | `""` | 0 | false | false |

The refund goes where the admin setting `goods_advance_refund_to` says: `refund_wallet` (default), `wallet`, or `source`.
`source` is only returned when the advance was really paid through Razorpay. A wallet-paid advance falls back to `wallet`.

---

## 4. The dialog

Decide the text from the amounts. Two independent parts can appear: the **cancellation fee** (`fee`) and the **advance**.

### 4.1 Advance part (only when `advanceAmount > 0`)

| Condition | Text |
|---|---|
| `kept > 0` and `refund > 0` | "₹{kept} will be charged as a cancellation fee and ₹{refund} will be refunded to your {destination}." |
| `kept > 0` and `refund == 0` | "Your ₹{kept} advance will be charged as a cancellation fee." |
| `kept == 0` and `refund > 0` | "Your ₹{refund} advance will be refunded to your {destination}." |
| `advanceAmount == 0` | say nothing about an advance |

`{destination}` wording:

| `advanceRefundDestination` | Say |
|---|---|
| `refund_wallet` | "refund wallet" |
| `wallet` | "wallet" |
| `source` | "original payment method (can take a few days)" |

### 4.2 Fee part (only when `fee > 0`)

- "A cancellation fee of ₹{fee} will be taken from your wallet."
- If `walletCoversFee == false`: "Your wallet balance is too low for the cancellation fee. Please add money first."
  and disable the confirm button (the server will not be able to take the fee).

### 4.3 Example (fare ₹1000, advance ₹200 paid, fee 0)

> **Cancel this booking?**
> ₹150 will be charged as a cancellation fee and ₹50 will be refunded to your refund wallet.
>
> [ Keep booking ]  [ Cancel booking ]

### 4.4 When nothing is at stake

`fee == 0` and `advanceAmount == 0`: show the plain "Are you sure you want to cancel?" dialog.

---

## 5. After the rider confirms

Call `PATCH /rides/:rideId/cancel` and show the numbers from **its response** (not the preview):

```json
{ "rideId": "…", "status": "cancelled", "advanceStatus": "forfeited", "advanceRefunded": true,
  "advanceKeptAmount": 150, "advanceRefundedAmount": 50, "advanceRefundDestination": "refund_wallet" }
```

They match the preview. If the rider waited long and something changed in between (for example the fare was edited),
the cancel response is the truth. Show:

> Booking cancelled. ₹150 charged, ₹50 refunded to your refund wallet.

Then refresh the wallet (`GET /users/wallet`). The socket event `goodsAdvance:refunded` (`reason: "cancelled_by_rider"`) also
arrives: use it only to refresh the wallet, do not show a second message (details in `FLUTTER_GOODS_ADVANCE_CANCEL_REFUND.md` §4.3).

---

## 6. Dart sketch

```dart
double _num(dynamic v) => (v is num) ? v.toDouble() : double.tryParse('$v') ?? 0;
String rupees(double v) => v == v.roundToDouble() ? '₹${v.toInt()}' : '₹${v.toStringAsFixed(2)}';

class CancelPreview {
  CancelPreview.fromJson(Map<String, dynamic> d)
      : fee = _num(d['fee']),
        feeGoesTo = d['feeGoesTo'] as String?,
        walletCoversFee = d['walletCoversFee'] != false,
        advanceAmount = _num(d['advanceAmount']),
        advanceKept = _num(d['advanceKeptAmount']),
        advanceRefund = _num(d['advanceRefundAmount']),
        refundDestination = (d['advanceRefundDestination'] ?? '').toString(),
        keepPercent = _num(d['advanceCancelKeepPercent']);

  final double fee;
  final String? feeGoesTo;
  final bool walletCoversFee;
  final double advanceAmount;
  final double advanceKept;
  final double advanceRefund;
  final String refundDestination;
  final double keepPercent;

  bool get hasAdvance => advanceAmount > 0;
  bool get canConfirm => fee <= 0 || walletCoversFee;

  String get destinationLabel {
    switch (refundDestination) {
      case 'refund_wallet':
        return 'refund wallet';
      case 'source':
        return 'original payment method (can take a few days)';
      default:
        return 'wallet';
    }
  }

  /// null when there is nothing to say about the advance
  String? get advanceText {
    if (!hasAdvance) return null;
    if (advanceKept > 0 && advanceRefund > 0) {
      return '${rupees(advanceKept)} will be charged as a cancellation fee and '
          '${rupees(advanceRefund)} will be refunded to your $destinationLabel.';
    }
    if (advanceKept > 0) {
      return 'Your ${rupees(advanceKept)} advance will be charged as a cancellation fee.';
    }
    return 'Your ${rupees(advanceRefund)} advance will be refunded to your $destinationLabel.';
  }

  String? get feeText {
    if (fee <= 0) return null;
    return walletCoversFee
        ? 'A cancellation fee of ${rupees(fee)} will be taken from your wallet.'
        : 'Your wallet balance is too low for the cancellation fee. Please add money first.';
  }
}

// Fallback ONLY if the preview call fails (offline / 5xx). The server does the real calculation on cancel.
CancelPreview? fallbackPreview({required double fare, required double advance, required double keepPercent}) {
  if (advance <= 0) return null;
  final kept = ((fare * keepPercent / 100) * 100).roundToDouble() / 100;
  final k = kept > advance ? advance : kept;
  return CancelPreview.fromJson({
    'advanceAmount': advance,
    'advanceKeptAmount': k,
    'advanceRefundAmount': ((advance - k) * 100).roundToDouble() / 100,
    'advanceCancelKeepPercent': keepPercent,
    'advanceRefundDestination': 'refund_wallet',
  });
}
```

`keepPercent` for the fallback: `advanceCancelKeepPercent` from the quote, or
`settings.transportRide.goods_advance_cancel_keep_percent` (a String) from `GET /users/bootstrap`, default `15`.

---

## 7. Old app builds

They read only `advanceForfeited` / `advanceAmount`, so they still say "advance will not be refunded" for a paid advance
(and the rider then gets part of it back). They do not crash. Ask users to update; no server switch is needed.

---

## 8. QA checklist

Goods booking, fare ₹1000, advance 20% (₹200), default keep 15%, refund to `refund_wallet`.

- [ ] Before paying the advance: dialog has **no** advance text (all advance amounts are 0).
- [ ] After paying: dialog says "₹150 will be charged ... ₹50 will be refunded to your refund wallet".
- [ ] Confirm: cancel result says the same two numbers. Refund wallet goes up by exactly ₹50.
- [ ] Pay in full (100% option): dialog says ₹150 charged, ₹850 refunded.
- [ ] Admin keep percent 30: dialog says "Your ₹200 advance will be charged ..." (no refund text).
- [ ] Admin keep percent 0: dialog says "Your ₹200 advance will be refunded ...".
- [ ] Admin `goods_advance_refund_to` = `wallet`: dialog says "wallet". `source` + Razorpay-paid advance: says original payment method.
- [ ] Set Price cancellation fee > 0 with a low wallet: fee text shows, confirm is disabled.
- [ ] Taxi (non-goods) ride: dialog behaves as before (fee only).
- [ ] Ride already cancelled (409): dialog closes and the screen refreshes.
- [ ] No amount ever prints like `24.049999999999997`.

---

## 9. For backend / admin (reference)

- Code: `previewAdvanceOnRiderCancel` in `goodsAdvanceService.js`, used by `previewUserCancellation` in `dispatchService.js`.
  It uses the same `splitAdvanceOnRiderCancel` and refund-destination functions as the real cancel
  (`forfeitGoodsAdvance`). If the settings cannot be loaded, both fall back to 15% and `refund_wallet`.
- Settings: `goods_advance_cancel_keep_percent` (default 15, 0 = refund everything), `goods_advance_refund_to`
  (`refund_wallet` / `wallet` / `source`). Admin: Settings > Transport Ride.
- No database change and no migration. Old response keys are unchanged.
