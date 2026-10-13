# Rentol – Flutter guide: Wallet as a booking payment method

For the Flutter developers of the **user app** and the **driver app**.

The rider can now choose **Wallet** when booking (next to Cash and Card/UPI). The fare is reserved from the in-app
wallet at booking and paid automatically when the trip ends. There's no Razorpay sheet and no cash to the driver.

---

## 1. How it works (backend)

| When | What happens |
|---|---|
| **Booking** with `paymentMethod: "wallet"` | The amount due is **held**: moved from the spendable balance into `heldBalance`. For goods it's the fare minus the advance. Not enough balance → booking refused (`INSUFFICIENT_WALLET_BALANCE`). |
| **Trip completes** | The hold is **captured**. If the fare grew (waiting charge, bids), the extra comes from the free balance and any unused part of the hold goes back. The ride is marked **paid**, so no payment sheet. |
| **Wallet short at completion** | What the wallet couldn't cover is `walletShortfall`. The ride stays payable for **that amount only**, through the usual completion payment sheet. The wallet never goes below 0. |
| **Cancelled / no driver / expired / replaced** | The whole hold goes back. If the rider cancels with a cancellation fee, the fee is then charged from the wallet as for any ride. |
| **Driver cancels and the ride is re-offered** | The hold stays: the ride is still looking for a driver. |

Wallet must be enabled by the admin for the vehicle/zone (**Set Price → Payment Type → Wallet**). If it isn't, the
booking goes through with an allowed method and the response says `paymentMethodChanged: true`.

---

## 2. User app

### 2.1 Wallet balance

`GET /api/v1/users/wallet`:

```json
{ "success": true, "data": {
  "balance": 320,            // spendable now (the hold is already taken out)
  "availableBalance": 320,   // same as balance
  "heldBalance": 180,        // reserved for wallet rides in progress
  "totalBalance": 500,       // balance + heldBalance
  "refundWallet": 0,
  "currency": "INR",
  "recentTransactions": [
    { "id": "…", "kind": "hold",    "amount": 180, "title": "Held for ride 3f9c0a", "createdAt": "…" },
    { "id": "…", "kind": "debit",   "amount": 180, "title": "Ride payment for 3f9c0a", "createdAt": "…" },
    { "id": "…", "kind": "release", "amount": 20,  "title": "Released: unused hold for ride 3f9c0a", "createdAt": "…" }
  ] } }
```

- Show **`availableBalance`** as the wallet amount, and "₹180 on hold" when `heldBalance > 0`.
- Transaction `kind` can now also be **`hold`** and **`release`**. Show hold as "Reserved", release as "Returned", debit
  as "Paid" and credit as "Added". Don't treat unknown kinds as errors.

### 2.2 Payment option on the vehicle list

Show a third option, **Wallet · ₹<availableBalance>**, when the vehicle's `allowedPaymentMethods` contains `"wallet"`.
It comes from `GET /rides/available-drivers/summary` (`byVehicleType[<id>].allowedPaymentMethods`) or the old
`GET /rides/available-drivers` (`data.allowedPaymentMethods`).

- If `availableBalance < estimated fare`, grey the option out and show an **"Add money"** link that opens the existing
  top-up sheet.
- For goods, compare against `quote.remainingAmount` (the fare minus the advance), not the full total.

### 2.3 Booking

Send `paymentMethod: "wallet"` in `POST /rides` and `POST /deliveries` (and in the `requestRide` socket event).

```dart
try {
  final res = await dio.post('/rides', data: {...ride, 'paymentMethod': 'wallet'});
  final data = res.data['data'];
  if (data['paymentMethodChanged'] == true) {
    showSnack('Wallet is not available for this ride. Booked with ${data['ride']['paymentMethod']}.');
  }
} on DioException catch (e) {
  final body = e.response?.data ?? {};
  if (body['code'] == 'INSUFFICIENT_WALLET_BALANCE') {
    final d = body['details'] ?? {};
    showAddMoneySheet(
      message: body['message'],          // "Wallet balance ₹120 is less than the fare ₹180. Add money or choose another method."
      shortBy: (d['shortBy'] as num?)?.toDouble() ?? 0,   // pre-fill the top-up with this
    );
  }
}
```

| HTTP | `code` | details | app action |
|---|---|---|---|
| 402 | `INSUFFICIENT_WALLET_BALANCE` | `balance`, `required`, `shortBy` | "Add money" (pre-fill `shortBy`) or choose another method |

The booking response for deliveries is the same: `paymentMethodChanged` and `requestedPaymentMethod` are at the top
level of `data`.

### 2.4 During and after the trip

New fields on every ride payload (REST, `ride:state`, history):

| field | meaning |
|---|---|
| `paymentMethod` | `"wallet"` |
| `walletHold` | `{ amount, status: "held" \| "captured" \| "released" }` or null |
| `walletPayment` | `{ amount, at }` once paid from the wallet, else null |
| `walletShortfall` | what the wallet couldn't cover (0 normally) |
| `isPaid` | `true` when nothing is left to pay |
| `amountToCollect` | cash the **driver** collects in hand: only on cash rides, always 0 for wallet rides |
| `riderPaysInApp` | for a wallet ride with a shortfall: what the **rider** still pays in the app (else 0) |

**On completion:**
- `isPaid == true` → **don't open the payment sheet.** Show the receipt "Paid from wallet ₹<walletPayment.amount>".
  Rating and tip work as today.
- `walletShortfall > 0` (so `isPaid == false`) → open the **existing completion payment sheet for `walletShortfall`
  only**. Razorpay or "Pay from wallet" after a top-up both work, and the server already counts what the wallet paid.

### 2.5 Old "Wallet" option in `confirm_booking_screen.dart`

It used to become online silently. Wire it to `paymentMethod: "wallet"` with the behaviour above.

---

## 3. Driver app

- The ride offer, the active ride and history show `paymentMethod: "wallet"`.
- **Offer card:** show "Wallet" (paid in app) next to the fare, like "Online".
- **Active ride / completion:**
  - `amountToCollect == 0` → the main button is **"COMPLETE TRIP"**, with no "Cash received" step. The summary shows
    "Paid via wallet".
  - `riderPaysInApp > 0` (a wallet shortfall) → show "Rider pays ₹<riderPaysInApp> in the app". **Don't collect it
    in cash**: the driver's earnings were already credited at completion.
- **Don't send `paymentMethod: "cash"` when completing a wallet ride.** The server ignores a method change on wallet
  rides anyway, and a driver can never turn a ride into a wallet ride (`"wallet"` from the driver counts as online).
- If a status update gets **409 `RIDE_STATE_CHANGED`**, the ride was changed meanwhile (for example the rider
  cancelled). Reload the active ride.
- **Earnings:** the driver is credited fare minus commission to their driver wallet at completion, like an online ride
  (`driver:wallet:updated` is emitted as today).

---

## 4. QA checklist

**User app**
- [ ] Wallet ₹500, fare ₹180, book with Wallet: the wallet shows ₹320 available and ₹180 on hold.
- [ ] Complete: no payment sheet; the receipt says "Paid from wallet ₹180"; the wallet shows ₹320 and nothing on hold.
- [ ] Waiting adds ₹10 with free balance: ₹190 paid from the wallet. With 0 free balance: the sheet opens for ₹10 only.
- [ ] Wallet ₹100, fare ₹180: the Wallet option is greyed out. Forcing it gives the `INSUFFICIENT_WALLET_BALANCE` message with "Add money".
- [ ] Cancel before a driver accepts: ₹500 available again, with a "Returned" entry in history.
- [ ] Cancel after accept with a ₹20 fee: ₹480.
- [ ] Wallet disabled in Set Price for the vehicle: the booking says it used another method.
- [ ] Goods with a 20% advance: the advance is paid by Razorpay and only the remaining 80% is held.

**Driver app**
- [ ] A wallet ride shows "Wallet" on the offer, "COMPLETE TRIP" at the end with no cash step, and earnings credited.
