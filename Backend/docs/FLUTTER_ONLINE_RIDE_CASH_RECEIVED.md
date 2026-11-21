# Rentol: Flutter guide for "Cash received" on an online-booked ride

For the Flutter developers of the **driver app** (`rentol driver`) and the **user app** (`flutter_taxi_user`).

**Backend:** implemented in `Backend/src/modules/taxi/services/rideService.js` (`markRideCashReceived`), tested in `Backend/test/integration/ridePaymentSafety.test.js`. Deploy the backend **before** shipping the driver-app build (see §7).

Related guides: `FLUTTER_CASH_RIDE_ONLINE_PAYMENT.md` (cash ride paid online), `FLUTTER_CASHFREE_PAYMENTS.md`, `FLUTTER_DRIVER_COLLECT_PAYMENT_QR.md`.

---

## 1. The situation

A rider booked with **Online** payment but has **not paid** when the driver reaches the drop (`isPaid: false`). Typical reasons: no network, the payment sheet was closed, the rider prefers to hand over cash.

Until now the driver could only tap *Complete trip*. If the driver had actually taken cash, the rider's app then asked for payment **again**, and the rider could pay twice.

**Now** the driver can say "I took cash". The ride then becomes a normal **cash ride**, already paid.

---

## 2. What the driver app does

At the drop, when `paymentMethod == 'online'` **and** `isPaid == false`, *Complete trip* is replaced by two choices:

| Choice | What the app does |
|---|---|
| **CASH RECEIVED ₹X** | Completes the ride with `cashReceived: true` (see §3) |
| **Collect ₹X via QR** | Opens the existing QR screen (`POST /drivers/payments/qr`). When the rider pays, `isPaid` turns `true` and the normal green *Paid online · Complete* button returns |

When `isPaid == true` already, nothing changes: show *Paid online · Complete* and complete **without** `cashReceived`.

`X` is `amountToCollect` if it is above 0. For an online ride the server sends `amountToCollect: 0` (online rides have nothing to collect), so show the fare due yourself: **`fare` minus a paid goods advance** (the same figure the QR screen already uses).

---

## 3. The API call

Same call as any completion; only one extra field.

**Socket** `ride:status:update` (driver app):

```json
{ "rideId": "…", "status": "completed", "cashReceived": true, "coordinates": [lng, lat] }
```

**REST** (same effect): `PATCH /api/rides/:rideId/status` with the driver token and the same body.

```dart
// _completeTrip(cashTaken: true)
rideNotifier.updateStatus('completed', cashReceived: true);
```

### Rules the server applies

| Case | Result |
|---|---|
| Online ride, unpaid, `cashReceived: true` | Becomes a **cash ride**: `paymentMethod: "cash"`, `paymentSwitchedFrom: "online"`, `isPaid: true`, `paidBy: "cash"` |
| Online ride, rider **already paid** (online, QR) | `cashReceived` is ignored. Stays online, paid online. Nothing is double-settled |
| Online ride, completed **without** `cashReceived` | Unchanged (online, unpaid). The rider can still pay in the app |
| Online ride, `paymentMethod: "cash"` but **no** `cashReceived: true` | **Not** converted. Only an explicit `cashReceived: true` converts an online ride |
| Cash ride | Same as before (`cashReceived: true`/`false` as in `FLUTTER_CASH_RIDE_ONLINE_PAYMENT.md` §4.1) |
| Wallet ride | Unchanged |

Send `cashReceived: true` **only** from the "CASH RECEIVED" button, never automatically.

---

## 4. Fields that change in the ride payload

The ride returned by the status call (and the `ride:state` socket event, both apps) now shows:

```json
{
  "paymentMethod": "cash",
  "paymentSwitchedFrom": "online",
  "isPaid": true,
  "paidBy": "cash",
  "amountToCollect": 0,
  "canPayOnline": false,
  "driverPaymentCollection": { "provider": "cash", "source": "cash", "status": "paid", "amount": 200, "paidAt": "…" }
}
```

**`paymentSwitchedFrom` now has two values:**

| Value | Meaning |
|---|---|
| `"cash"` | A cash ride that was paid online in the end |
| `"online"` | **New.** An online ride that was paid in cash |

**Important:** any code that treats `paymentSwitchedFrom != ''` as "paid online" is now wrong. The driver app's `paidOnline` getter must keep checking `paymentSwitchedFrom == 'cash'` (or `paymentMethod == 'online' && isPaid`). Receipts can show "Booked: Online · Paid: Cash" for `"online"`.

---

## 5. What the rider's app sees

- Right after the driver taps *Cash received*, `ride:state` arrives with `isPaid: true`, `paidBy: "cash"`. **Close any open pay sheet and show the receipt.** Do not ask for payment.
- If the rider app still tries to pay (an old sheet was open), the payment endpoints return **`409 ALREADY_PAID`**. Handle it as "already paid", not as an error.
- If the rider's payment was **already captured** at the same moment (checkout finished a second after the cash), the server **refunds it automatically**, and the ride stays a paid cash ride. Tell the rider "Paid in cash, your online payment will be refunded" if you get `details.refunded == true` on the verify response.

---

## 6. Settlement (driver earnings)

The ride is settled **as a cash ride**:

- The driver keeps the cash.
- Only the **platform commission is deducted** from the driver's wallet (for a ₹200 fare at 20 %: wallet `-₹40`).
- The fare is **not** credited to the wallet, because the driver already holds the money.

So the earnings screen shows this ride like any cash ride. No change in the wallet screen is needed.

> Product decision: this is "option A" (cash-ride settlement). The owner should confirm it. Option B (credit the fare as for online) would pay the driver twice.

---

## 7. Release order

1. Deploy the **backend** (`git pull`, `pm2 restart … --update-env`).
2. Then release the **driver app** with the new choice.

An old backend ignores `cashReceived` for online rides: the ride completes unpaid, and the rider is asked to pay again. So **do not ship the driver build before the backend.**

---

## 8. QA checklist

1. Online ride, unpaid at the drop, driver taps **CASH RECEIVED** → ride completes. Response: `paymentMethod: "cash"`, `paymentSwitchedFrom: "online"`, `isPaid: true`, `paidBy: "cash"`. Rider app shows no pay sheet.
2. Same ride: the rider app calls the pay endpoints → `409 ALREADY_PAID`.
3. Online ride, driver shows the QR, rider pays → `isPaid: true`, green *Paid online · Complete*. The cash button is not used.
4. Rider pays online **before** the driver taps cash → the cash tap changes nothing. Ride stays online, driver credited once (fare − commission).
5. Rider's checkout is open, driver takes cash, rider then pays → payment refunded, ride stays a paid cash ride, the driver is not credited the fare.
6. Driver wallet for case 1: only the commission is deducted (same as a normal cash ride).
7. Completing an online ride **without** `cashReceived` → unchanged, rider can still pay.
8. Cash rides and wallet rides behave exactly as before.

---

## 9. Quick reference

| Item | Value |
|---|---|
| Trigger | `status: "completed"` + `cashReceived: true` on an unpaid **online** ride |
| Result | `paymentMethod: "cash"`, `paymentSwitchedFrom: "online"`, `isPaid: true`, `paidBy: "cash"` |
| Rider payment after that | `409 ALREADY_PAID` (or auto refund if already captured) |
| Driver wallet | `-commission` only |
| Ignored when | The ride is already paid, or `cashReceived` is not exactly `true` |
