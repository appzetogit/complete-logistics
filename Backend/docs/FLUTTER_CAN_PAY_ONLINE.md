# Rentol: Flutter guide for `canPayOnline` ("Show QR" / "Pay online instead")

This guide is for the Flutter developers of both apps: the **driver app** (`flutterdriver`) and the **user app** (`flutter_taxi_user`).

**Backend:** `e09a1bb` (`complete-logistics`, 14 Oct 2026). Spec: "Backend: add the `canPayOnline` flag to the ride payload".

**Read with:** `FLUTTER_CASH_RIDE_ONLINE_PAYMENT.md`. It has the full payment API (QR, Razorpay order/verify, wallet pay, error codes). This guide covers only the flag and how the UI should use it.

---

## 1. What the flag is for

Both apps already have the new UI built behind one flag:
- **Driver app:** "Rider paying online? **Show QR**" at the drop.
- **User app:** "**Pay online instead**".

The backend now sends **`canPayOnline`** in every ride payload. When it is `true`, show the button. When it is `false` or missing, hide it.

**No other condition is needed in the app.** The server applies exactly the same rule to the payment endpoints. So if the button is shown, tapping it will not get `PAYMENT_NOT_ALLOWED`, except in a race (§6).

---

## 2. When it is `true`

**`canPayOnline` is `true` only when all of these hold:**

| # | Condition |
|---|---|
| 1 | The ride was **booked as cash** (`paymentMethod: "cash"`) |
| 2 | The fare is **not paid yet**: no cash received, no QR / Razorpay / wallet payment, not a free ride |
| 3 | There is **something to pay**: fare minus any paid goods advance is more than 0 |
| 4 | The driver is **at the drop** (`liveStatus` `arrived` or `goods_delivered`), **or** the ride is `completed` and **completed less than 60 minutes ago** |
| 5 | A driver is assigned and the ride is not cancelled |

**Always `false` for:**
- **`online` bookings.** They use the normal completion pay sheet and the driver's "Collect via QR" screen.
- **`wallet` bookings.** The wallet is charged automatically at completion; a shortfall uses `riderPaysInApp`.
- **Old completed rides** (more than 60 minutes after completion). The button never appears on ride history.

---

## 3. Where it comes from

`canPayOnline` is in **every** ride payload, for both the rider and the driver, together with the other payment fields:

| Source | Has it? |
|---|---|
| `ride:state` socket (rider and driver) | ✅ |
| `GET /api/v1/rides/active/me` | ✅ |
| `GET /api/v1/rides/:rideId` (rider and driver) | ✅ (this endpoint also now has `isPaid`, `amountToCollect`, `paidBy`) |
| `GET /api/v1/rides` (history list) | ✅ |
| Driver's status update response (`PATCH /rides/:id/status`) | ✅ |

```json
{
  "rideId": "6ace12c6...",
  "status": "ongoing",
  "liveStatus": "arrived",
  "paymentMethod": "cash",
  "fare": 200,
  "isPaid": false,
  "amountToCollect": 200,
  "paidBy": "",
  "canPayOnline": true,
  "driverPaymentCollection": null
}
```

### Model (both apps)

```dart
final bool canPayOnline;
final bool isPaid;
final double amountToCollect;
final String paidBy;   // '' while unpaid: cash | qr | razorpay | wallet | free_ride

// fromJson
canPayOnline: json['canPayOnline'] == true,      // missing -> false (older backend)
isPaid: json['isPaid'] == true,
amountToCollect: ((json['amountToCollect'] ?? 0) as num).toDouble(),
paidBy: json['paidBy']?.toString() ?? '',
```

**Replace the whole ride on every `ride:state`.** Don't merge field by field, and don't keep an old `canPayOnline: true` when a payload doesn't have the field.

---

## 4. It updates live (no polling needed for the button)

| Moment | `canPayOnline` | How the app learns it |
|---|---|---|
| Driver taps **Arrived at drop** / **Hand over goods** | becomes `true` | `ride:state`, and the driver's own status response |
| Driver taps **Cash received** (completion with cash) | becomes `false`, `isPaid: true`, `paidBy: "cash"` | `ride:state`, and the driver's status response |
| A payment lands (rider in-app, QR, webhook) | becomes `false`, `isPaid: true`, `paidBy` set | `ride:state` to both apps at once |
| 60 minutes after completion, still unpaid | becomes `false` | **No socket is sent** when the time runs out: the next REST call returns `false`. Hide it if the ride screen is reopened later. |
| Ride cancelled | `false` | the existing `rideCancelled` event (the trip screen closes anyway) |

---

## 5. Driver app (`flutterdriver`)

### 5.1 The "Show QR" button

```dart
if (ride.canPayOnline)
  TextButton(
    onPressed: () => _showQr(ride),
    child: const Text('Rider paying online? Show QR'),
  ),
```

- **Amount to show:** `ride.amountToCollect`, the fare minus any paid advance. Never compute it in the app.
- **Tap:** `POST /api/v1/drivers/payments/qr { "rideId": "<id>" }`. Don't send `amount`; the server ignores it. Show `data.imageUrl`.
- **While the QR is open:**
  - listen to `ride:state`, and close the QR as **"Paid online ✓"** as soon as `isPaid == true`;
  - also poll `GET /api/v1/drivers/payments/qr/status?rideId=<id>` every 5 s, and stop when `paid == true`.
- **Errors:**
  - `ALREADY_PAID` → treat as paid;
  - `PAYMENT_NOT_ALLOWED` → close the QR and show `message`.

Full details are in `FLUTTER_CASH_RIDE_ONLINE_PAYMENT.md` §4.2.

### 5.2 Completing the trip (**required**: the "Cash received" button)

The app must tell the server whether the driver took cash. Today `active_ride_screen.dart` completes with `updateStatus('completed')` and sends nothing, so the server can't know.

| Driver's choice at the drop | Send with `status: "completed"` |
|---|---|
| **Cash received** | `cashReceived: true` (or `paymentMethod: "cash"`) |
| Rider will pay online (QR / app), not paid yet | `cashReceived: false` |
| Already `isPaid` (rider paid at the drop) | nothing extra: show **"Paid online ✓"** and a plain **Complete trip** button |

Add `cashReceived` to the socket call in `socket_service.dart` and to `RideNotifier.updateStatus`. The code is in `FLUTTER_CASH_RIDE_ONLINE_PAYMENT.md` §4.1.

**Why this matters for the flag:**
- With `cashReceived: true` → `canPayOnline` becomes `false` at once, and the rider can't pay a second time online.
- Without it → the ride stays open for online payment for 60 minutes after completion, so the rider app may still show "Pay online instead" even though the driver has the cash.

### 5.3 Screen states at the drop (cash ride)

| State | Show |
|---|---|
| `canPayOnline == true`, `isPaid == false` | Amount ₹`amountToCollect` · **Cash received** · "Rider paying online? **Show QR**" |
| `isPaid == true` (paid at the drop) | **Paid online ✓** ₹fare · **Complete trip** |
| `canPayOnline == false`, `isPaid == false` (rare: e.g. nothing due) | **Complete trip** only |

---

## 6. User app (`flutter_taxi_user`)

### 6.1 The "Pay online instead" button

```dart
if (ride.canPayOnline)
  OutlinedButton(
    onPressed: () => RideCompletionPaymentSheet.show(context, rideId: ride.id, amount: ride.amountToCollect),
    child: const Text('Pay online instead'),
  ),
```

- **Amount:** `ride.amountToCollect`. For a cash ride, that's what is left to pay.
- **The sheet** uses the existing endpoints. No rating is needed; send it later with `PATCH /rides/:id/feedback`.
  - `POST /rides/:id/complete-payment/razorpay/order` → Razorpay checkout → `.../verify`
  - or `POST /rides/:id/complete-payment/wallet`
- **After payment:** the sheet closes with "Paid ✓". `ride:state` brings `canPayOnline: false` and `isPaid: true`, so the button disappears.

### 6.2 Race: the driver takes cash while the sheet is open

The button can be visible and then the driver taps "Cash received" a second later. The payment endpoints then return **409 `ALREADY_PAID`**:
- **Treat it as success.** Close the sheet, refresh the ride and show "Already paid".
- **If the rider had already paid in Razorpay**, the server **refunds that payment automatically**. The error then has `details.refunded == true`; show "Already paid. Your payment is being refunded."

`PAYMENT_NOT_ALLOWED` (the 60-minute window ran out while the sheet was open): close the sheet and show `message`.

### 6.3 Where to show the button

- **On the live ride screen** while the driver is at the drop.
- **On the trip-completed / rating screen**, for up to 60 minutes. Always read `canPayOnline` from the latest payload.
- **Never on history.** The server sends `false` for old rides, so nothing special is needed.

### 6.4 The existing completion pay sheet (online bookings)

Unchanged by this flag. It opens for **online** bookings when `!isPaid`, as described in `FLUTTER_CASH_RIDE_ONLINE_PAYMENT.md` §5.1. Don't use `canPayOnline` for online bookings; it is always `false` for them.

---

## 7. Sequences

**A. The driver takes cash**
```
arrived           -> both apps: canPayOnline true
driver: completed + cashReceived:true
                  -> both apps: canPayOnline false, isPaid true, paidBy "cash"
```

**B. The rider pays in the app at the drop**
```
arrived           -> rider taps "Pay online instead" -> Razorpay / wallet
payment lands     -> both apps: canPayOnline false, isPaid true, paidBy "razorpay" | "wallet"
driver app        -> "Paid online ✓" -> Complete trip (no cash flag)
```

**C. The rider scans the driver's QR**
```
arrived           -> driver taps "Show QR" -> rider pays in their UPI app
payment lands     -> both apps: canPayOnline false, isPaid true, paidBy "qr"
```

**D. The driver completes with "Rider will pay online", the rider pays a few minutes later**
```
completed + cashReceived:false -> canPayOnline stays true (60 min)
rider pays from the trip-completed screen -> canPayOnline false, isPaid true
```

---

## 8. QA checklist

**Driver app**
- [ ] Cash ride before the drop: no "Show QR".
- [ ] Tap **Arrived at drop**: "Show QR" appears without a refresh.
- [ ] Tap **Cash received**: the rider's "Pay online instead" disappears by itself.
- [ ] Rider pays in their app: the driver screen switches to **"Paid online ✓"** by itself.
- [ ] Online and wallet bookings at the drop: no "Show QR" (they keep their existing flows).

**User app**
- [ ] Cash ride at the drop: "Pay online instead" appears; paying hides it and shows "Paid ✓".
- [ ] Driver takes cash while the sheet is open: "Already paid", no second charge.
- [ ] Completed cash ride with "Rider will pay online": the button stays on the trip-completed screen and is gone about 60 minutes later.
- [ ] Ride history: never shows "Pay online instead".

---

## 9. For the backend / admin (reference)

- **Pay-online window:** 60 minutes after completion. Change it with `CASH_PAY_ONLINE_WINDOW_MINUTES` in `Backend/.env`, then restart.
- **Admin → Payment Refunds** lists payments the server refunded automatically. Failed refunds can be retried there or marked as refunded by hand.
- **Admin → Transport Ride Settings → "Pay Driver For Unpaid Online Rides After (hours)"** (default 24). This applies to **online** bookings the rider never paid: the platform pays the driver, and the rider still owes the fare. Not related to `canPayOnline`.
