# Rentol – Flutter guide: Wallet as a booking payment method

For the Flutter developers of the **user app** (`flutter_taxi_user`) and the **driver app** (`flutterdriver`).
Backend: commits `544c6ec`, `1e31636` (pushed to `complete-logistics` main).

The rider can choose **Wallet** when booking, next to Cash and Card/UPI. The fare is **reserved** from the in-app
wallet at booking and **paid automatically** when the trip ends. There's no Razorpay sheet and no cash to the driver.

---

## 1. How it works on the server

| When | What happens |
|---|---|
| **Booking** with `paymentMethod: "wallet"` | The amount due is **held**: taken out of the spendable `balance` into `heldBalance`. For goods it's the fare minus the advance. Too little balance → booking refused with **402 `INSUFFICIENT_WALLET_BALANCE`**. |
| **Trip completed** | The hold is **captured**. If the fare grew (waiting charge, bids), the extra comes from the free balance and any unused hold goes back. The ride is marked **paid** (`isPaid: true`), so **no payment sheet**. |
| **Wallet short at completion** | What the wallet couldn't cover is `riderPaysInApp` (= `walletShortfall`). The rider pays **only that** with the usual completion payment sheet. The wallet never goes below 0. |
| **Cancelled / no driver / expired / replaced** | The whole hold goes back. If the rider cancels with a cancellation fee, the fee is then charged as for any ride. |
| **Driver cancels and the ride is re-offered** | The hold stays: the ride is still looking for a driver. |
| **Wallet not enabled** for that vehicle/zone (Admin → Set Price → Payment Type) | The booking goes through with an allowed method, and the response has `paymentMethodChanged: true`. |

---

## 2. User app – changes by file

### 2.1 Payment option (already in the app)

`features/home/presentation/confirm_booking_screen.dart` (`_showPaymentSheet`) and
`features/delivery/presentation/new_delivery_screen.dart` already offer **Wallet** (`value: 'wallet'`) next to Cash and
Card/UPI (`'razorpay'`). Until now the server turned `wallet` into online silently. **Now it is a real wallet
payment.** Changes:

1. **Show Wallet only when allowed** for the vehicle:
   - rides: `GET /rides/available-drivers/summary` → `byVehicleType[<vehicleTypeId>].allowedPaymentMethods` (or the old
     `/rides/available-drivers` → `data.allowedPaymentMethods`);
   - show the option when the list contains `"wallet"`.
2. **Show the balance** in the option: `Wallet · ₹<availableBalance>` (see 2.4).
3. **Grey it out** when `availableBalance < estimated fare` (for goods: `< quote.remainingAmount`, the part after the
   advance), with an **"Add money"** button that opens the existing top-up flow.

```dart
RadioListTile<String>(
  value: 'wallet',
  groupValue: current,
  title: Text('Wallet · ₹${wallet.availableBalance.toStringAsFixed(0)}'),
  subtitle: walletShort ? const Text('Not enough balance') : null,
  secondary: const Icon(Icons.account_balance_wallet_outlined),
  onChanged: walletAllowed && !walletShort
      ? (v) { controller.setPaymentMethod(v!); Navigator.of(context).pop(); }
      : null,
),
if (walletAllowed && walletShort)
  TextButton(onPressed: () => context.push('/wallet/topup'), child: const Text('Add money')),
```

### 2.2 Booking: handle the new answers

`POST /rides`, `POST /deliveries` and the `requestRide` socket event, with `paymentMethod: "wallet"`:

```dart
try {
  final res = await api.post(ApiConstants.rides, data: {...body, 'paymentMethod': 'wallet'});
  final data = Map<String, dynamic>.from(res);
  if (data['paymentMethodChanged'] == true) {
    final used = (data['ride']?['paymentMethod'] ?? data['paymentMethod'] ?? 'cash').toString();
    SnackbarUtils.info(context, 'Wallet isn\'t available for this ride. Booked with ${used == 'cash' ? 'Cash' : 'Card/UPI'}.');
  }
} on ApiException catch (e) {
  if (e.code == 'INSUFFICIENT_WALLET_BALANCE') {
    final shortBy = (e.details?['shortBy'] as num?)?.toDouble() ?? 0;
    showAddMoneySheet(message: e.message, prefillAmount: shortBy);   // then let the rider retry
    return;
  }
  rethrow;
}
```

| HTTP | `code` | `details` | what to do |
|---|---|---|---|
| 402 | `INSUFFICIENT_WALLET_BALANCE` | `balance`, `required`, `shortBy` | message, plus "Add money" pre-filled with `shortBy`, or choose another method |

If `ApiException` doesn't keep `code` / `details` yet, add them. The error body is
`{ success:false, message, code, details }`.

For **deliveries** the booking response has `paymentMethodChanged` / `requestedPaymentMethod` at the top level of
`data`.

### 2.3 After the trip: don't charge again

`features/ride/presentation/rating_review_screen.dart` → `_collectFareIfDue()` opens `RideCompletionPaymentSheet` only
when `paymentMethod == 'online'`, for `ride.fare`. For wallet rides:

```dart
Future<void> _collectFareIfDue() async {
  final ride = ref.read(rideTrackingControllerProvider(widget.rideId)).ride;
  if (ride == null || !mounted) return;
  final method = (ride.paymentMethod ?? 'cash').toLowerCase();

  if (method == 'wallet') {
    // Paid from the wallet at completion. Only a shortfall (fare grew, wallet empty) is left to pay.
    if (ride.riderPaysInApp > 0) {
      await RideCompletionPaymentSheet.show(context, rideId: widget.rideId, amount: ride.riderPaysInApp);
    }
    return;                       // isPaid == true: no sheet, show "Paid from wallet"
  }

  if (method != 'online' || ride.fare <= 0) return;
  await RideCompletionPaymentSheet.show(context, rideId: widget.rideId, amount: ride.fare);
}
```

The sheet's existing "Pay from wallet" and Razorpay buttons work for the shortfall: the server already subtracts what
the wallet paid.

**Receipt:** for wallet rides show "Paid from wallet ₹<walletPayment.amount>". If `riderPaysInApp` was paid
afterwards, also show "+ ₹X by Card/UPI".

### 2.4 Wallet screen: balance and history (fix the parsing)

`GET /api/v1/users/wallet` returns:

```json
{ "success": true, "data": {
  "balance": 320,            "availableBalance": 320,
  "heldBalance": 180,        "totalBalance": 500,
  "refundWallet": 0,         "currency": "INR",
  "recentTransactions": [
    { "id": "…", "kind": "hold",    "amount": 180, "title": "Held for ride 3f9c0a",                  "createdAt": "…" },
    { "id": "…", "kind": "debit",   "amount": 180, "title": "Ride payment for 3f9c0a",               "createdAt": "…" },
    { "id": "…", "kind": "release", "amount": 20,  "title": "Released: unused hold for ride 3f9c0a", "createdAt": "…" },
    { "id": "…", "kind": "credit",  "amount": 500, "title": "Wallet Refilled",                       "createdAt": "…" }
  ] } }
```

`features/wallet/data/wallet_repository.dart` and `wallet_transaction_model.dart` need these fixes:

- `getTransactions()` reads `map['transactions'] ?? map['results']`, but the key is **`recentTransactions`**. Today the
  history is empty.
- The model reads `type` and `description`, but the keys are **`kind`** and **`title`**.
- Add `heldBalance` and `availableBalance`.

```dart
Future<WalletSummary> getWallet() async {
  final map = Map<String, dynamic>.from(await api.get(ApiConstants.wallet) as Map);
  return WalletSummary(
    availableBalance: (map['availableBalance'] ?? map['balance'] ?? 0 as num).toDouble(),
    heldBalance: (map['heldBalance'] ?? 0 as num).toDouble(),
    transactions: ((map['recentTransactions'] ?? map['transactions'] ?? []) as List)
        .map((e) => WalletTransactionModel.fromJson(Map<String, dynamic>.from(e)))
        .toList(),
  );
}

factory WalletTransactionModel.fromJson(Map<String, dynamic> json) => WalletTransactionModel(
  id: (json['id'] ?? json['_id'] ?? '').toString(),
  type: (json['kind'] ?? json['type'] ?? 'debit').toString(),      // credit | debit | hold | release
  amount: (double.tryParse('${json['amount'] ?? 0}') ?? 0).abs(),
  description: (json['title'] ?? json['description'] ?? 'Transaction').toString(),
  createdAt: DateTime.tryParse('${json['createdAt'] ?? ''}') ?? DateTime.now(),
  status: (json['status'] ?? 'success').toString(),
);
```

How to show each `kind`:

| kind | label | sign / colour |
|---|---|---|
| `credit` | Added | + green |
| `debit` | Paid | − red |
| `hold` | Reserved for ride | grey, with the hold icon (not yet spent) |
| `release` | Returned | + green |

Show `availableBalance` as the wallet amount, plus "₹180 on hold" while `heldBalance > 0`.

### 2.5 New fields on ride payloads (`RideModel`)

Every ride payload (REST, `ride:state`, history) now has:

| field | type | meaning |
|---|---|---|
| `paymentMethod` | `"cash" \| "online" \| "wallet"` | how the rider pays |
| `isPaid` | bool | nothing left to pay |
| `riderPaysInApp` | number | wallet shortfall the rider still pays in the app (0 normally) |
| `amountToCollect` | number | cash the **driver** collects (only cash rides) |
| `walletHold` | `{ amount, status }` or null | `status`: `held`, `captured` or `released` |
| `walletPayment` | `{ amount, at }` or null | what was paid from the wallet |
| `walletShortfall` | number | same as `riderPaysInApp` for wallet rides |

---

## 3. Driver app

- `paymentMethod` can now be **`"wallet"`** on the offer (`rideRequest`, `/drivers/ride-offers`, the `ride_request`
  push), the active ride and history. Show it as **"Wallet"** (paid in app), like "Online".
- **Completion:**
  - wallet ride → `amountToCollect` is **0**, so the button is **"COMPLETE TRIP"** with no "Cash received" step;
    the summary says "Paid via wallet";
  - `riderPaysInApp > 0` → show "Rider pays ₹X in the app". **Don't collect it in cash**: the driver was already
    credited.
- **Don't send `paymentMethod: "cash"` (or `"wallet"`) when completing.** The server ignores a change on wallet rides,
  and a driver can never make a ride a wallet ride.
- **Earnings:** credited to the driver wallet at completion (fare minus commission), like online rides;
  `driver:wallet:updated` is emitted as before.
- A status update can now get **409 `RIDE_STATE_CHANGED`**, when the ride changed meanwhile (for example the rider
  cancelled at the same moment). Reload the active ride.

---

## 4. QA checklist

**User app**
- [ ] The Wallet option appears only for vehicles where the admin enabled it, showing `₹<availableBalance>`.
- [ ] Wallet ₹500, fare ₹180, book: the wallet screen shows ₹320 available, ₹180 on hold, and a "Reserved" entry.
- [ ] Trip completes: **no payment sheet**; the receipt says "Paid from wallet ₹180"; ₹320 available, nothing on hold.
- [ ] Waiting adds ₹10 with free balance: ₹190 paid automatically. With 0 free balance: the sheet opens for **₹10 only**.
- [ ] Wallet ₹100, fare ₹180: the option is greyed out. Forcing it gives the "Add money" sheet pre-filled with ₹80.
- [ ] Cancel before a driver accepts: ₹500 available again and a "Returned" entry.
- [ ] Cancel after accept with a ₹20 fee: ₹480.
- [ ] Wallet disabled for the vehicle: the booking says it used another method.
- [ ] Goods with a 20% advance: the advance is paid by Razorpay and only the remaining 80% is held.
- [ ] Wallet history is no longer empty, and shows Added / Paid / Reserved / Returned correctly.

**Driver app**
- [ ] A wallet ride shows "Wallet" on the offer; at the end "COMPLETE TRIP" with no cash step; earnings are credited.
- [ ] With a shortfall: "Rider pays ₹X in the app" and no cash collection.
