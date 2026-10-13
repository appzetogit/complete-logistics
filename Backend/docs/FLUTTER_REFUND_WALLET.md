# Rentol – Flutter guide: Refund wallet ("Refund credits")

For the Flutter developer of the **user app** (`flutter_taxi_user`).
Backend: commit `5468cf2` (`complete-logistics`). Spec: "Refund wallet: make it usable" (13 Oct 2026).

The rider's refund credits (`refundWallet`) used to be stuck: visible but never spendable. Now the rider can **move them
into the spendable wallet** with one tap, every wallet entry says **which amount it touched**, and new compensation goes
straight to the spendable wallet.

> The local copy of `flutter_taxi_user` here has no refund-wallet code yet. If your build already has the
> "Refund credits" sheet (spec §3), check it against this contract. Otherwise build it from §3–§5.

---

## 1. The three amounts in a wallet

| Field | What it is | Spendable? | Show as |
|---|---|---|---|
| `balance` / `availableBalance` | top-ups, refunds to wallet, moved refund credits, released holds | ✅ yes | **Wallet balance** |
| `heldBalance` | reserved for a wallet ride in progress | ❌ not until the ride ends | "₹X on hold" |
| `refundWallet` | refund credits (older refunds, or refunds the admin sends here) | ❌ not directly, but **movable** | **Refund credits ₹X** (hide at ₹0) |

Never add `refundWallet` to the spendable balance in the UI.

---

## 2. What changed on the server

| Before | Now |
|---|---|
| Refund credits could never be used | `POST /users/wallet/refund/move` moves them into `balance` |
| Driver-cancel compensation always went to `refundWallet` | It goes to the **spendable `balance`** by default (admin setting `driver_cancel_compensation_to`) |
| Goods advance refunds went to `refundWallet` by default | Admin can choose: spendable wallet / refund wallet / original payment (`goods_advance_refund_to`) |
| History entries didn't say which amount they touched | Every entry has **`walletField`**: `"balance"` or `"refundWallet"` |
| — | `GET /users/wallet` has **`refundWalletMovable`** and **`refundWalletSpendable`** flags |

---

## 3. `GET /api/v1/users/wallet`

```json
{ "success": true, "data": {
  "balance": 158,
  "availableBalance": 158,
  "heldBalance": 0,
  "totalBalance": 158,
  "refundWallet": 108,
  "refundWalletMovable": true,
  "refundWalletSpendable": false,
  "currency": "INR",
  "recentTransactions": [
    { "id": "…", "kind": "credit", "amount": 54,  "walletField": "refundWallet", "title": "Goods advance refund for booking 1a2b3c", "createdAt": "…" },
    { "id": "…", "kind": "credit", "amount": 40,  "walletField": "balance",      "title": "Driver cancellation compensation for booking 4d5e6f", "createdAt": "…" },
    { "id": "…", "kind": "credit", "amount": 108, "walletField": "balance",      "title": "Moved from refund wallet", "createdAt": "…" }
  ] } }
```

- All amounts are rounded to paise (two decimals).
- **Flags (read them, don't hard-code):**

| `refundWalletMovable` | `refundWalletSpendable` | What the Refunds sheet shows |
|---|---|---|
| `true` (live now) | `false` | the amount + **"Move to wallet"** button |
| `false` / missing | `false` / missing | the amount + explanation only, no button |
| any | `true` (not live, reserved for later) | "Used automatically on your next payment" |

- **History:** `recentTransactions` (not `transactions`). Each entry has `kind` (`credit` / `debit` / `hold` / `release`),
  `title` (not `description`) and **`walletField`**.

---

## 4. Move refund credits to the wallet

```
POST /api/v1/users/wallet/refund/move        (user token)
body: {}                     // move everything
body: { "amount": 50 }       // move part (rounded to 2 decimals)
```

**200** → the same `data` as `GET /users/wallet`, already updated (`refundWallet` lower, `balance` higher, and a new
entry `"Moved from refund wallet"` with `walletField: "balance"` at the top of `recentTransactions`).

**Errors** (standard body `{ success:false, message, code, details }`; show `message` as-is):

| HTTP | `code` | when | `details` |
|---|---|---|---|
| 400 | `REFUND_WALLET_EMPTY` | nothing to move (also when a second tap arrives after the first moved it all) | `available: 0` |
| 400 | `INVALID_AMOUNT` | amount ≤ 0 or not a number | – |
| 400 | `AMOUNT_EXCEEDS_REFUND_WALLET` | amount > refund credits | `available` |

- The move is atomic: a double tap or two devices can never move more than was there. Still, disable the button
  while the request is running.

```dart
Future<void> moveRefundToWallet() async {
  final moved = ref.read(walletProvider).refundWallet;   // everything is moved when no amount is sent
  setState(() => moving = true);
  try {
    final data = await api.post('${ApiConstants.wallet}/refund/move', data: {});
    final wallet = WalletSummary.fromJson(Map<String, dynamic>.from(data as Map));  // same shape as GET /users/wallet
    ref.read(walletProvider.notifier).set(wallet);
    SnackbarUtils.success(context, '₹${moved.toStringAsFixed(0)} moved to your wallet');
    Navigator.of(context).pop();                                              // refund line hides at ₹0
  } on ApiException catch (e) {
    if (e.code == 'REFUND_WALLET_EMPTY') ref.invalidate(walletProvider);      // refresh, the line disappears
    SnackbarUtils.error(context, e.message);
  } finally {
    if (mounted) setState(() => moving = false);
  }
}
```

---

## 5. UI

**Wallet screen**
```
Wallet balance           ₹158        ← availableBalance (big)
₹180 on hold                         ← only when heldBalance > 0
Refund credits ₹108  ›               ← only when refundWallet > 0; tap opens the Refunds sheet
```

**Refunds sheet** (when `refundWalletMovable == true`)
```
Refund credits                ₹108
Refunds from cancelled bookings. Move them to your wallet to use them for rides and deliveries.
[ Move ₹108 to wallet ]
```
When `refundWalletMovable` is false or missing: the same sheet, with no button and the text "Refund credits are kept
separately and can't be used for payments yet."

**History list and totals**
- Show every entry, with a small "Refund credits" tag when `walletField == "refundWallet"`.
- **"Money in / Money out" totals and filters skip entries with `walletField == "refundWallet"`**, so they match the
  spendable balance. The "Moved from refund wallet" entry (`walletField: "balance"`) is counted as money in.
- `kind` labels: `credit` → Added (+), `debit` → Paid (−), `hold` → Reserved (grey), `release` → Returned (+).

**Model**
```dart
class WalletSummary {
  final double availableBalance, heldBalance, refundWallet;
  final bool refundWalletMovable, refundWalletSpendable;
  final List<WalletTransactionModel> transactions;

  factory WalletSummary.fromJson(Map<String, dynamic> j) => WalletSummary(
    availableBalance: ((j['availableBalance'] ?? j['balance'] ?? 0) as num).toDouble(),
    heldBalance: ((j['heldBalance'] ?? 0) as num).toDouble(),
    refundWallet: ((j['refundWallet'] ?? 0) as num).toDouble(),
    refundWalletMovable: j['refundWalletMovable'] == true,
    refundWalletSpendable: j['refundWalletSpendable'] == true,
    transactions: ((j['recentTransactions'] ?? const []) as List)
        .map((e) => WalletTransactionModel.fromJson(Map<String, dynamic>.from(e)))
        .toList(),
  );
}

// in WalletTransactionModel.fromJson:
walletField: (json['walletField'] ?? 'balance').toString(),   // 'balance' | 'refundWallet'
bool get isRefundCredit => walletField == 'refundWallet';
```

---

## 6. QA checklist

- [ ] A rider with refund credits sees **"Refund credits ₹X"**, separate from the wallet balance and not added to it.
- [ ] Tap "Move to wallet": refund credits ₹0 (line hidden), wallet balance +X, and a "Moved from refund wallet" entry
      at the top of the history.
- [ ] Tapping twice quickly: one move only; the second shows "There is nothing in your refund wallet to move."
- [ ] A rider with no refund credits: no refund line, no sheet.
- [ ] A driver cancels a booking with a fine: the compensation appears in the **wallet balance** (spendable).
- [ ] History: refund-credit entries have the "Refund credits" tag, and Money in / out totals don't include them.
- [ ] If the server ever returns `refundWalletMovable: false`, the button disappears without an app update.

---

## 7. For the admin (reference)

- **Admin → Transport Ride Settings**
  - **Goods Advance Refund Goes To:** set **Rider wallet (spendable)** so new advance refunds are usable at once.
  - **Driver Cancel Compensation Goes To:** default **Rider wallet (spendable)**.
- One-time, optional (server shell), move everyone's existing refund credits into their wallet:
  ```bash
  node scripts/moveRefundWalletToBalance.js
  ```
  Check the list, then:
  ```bash
  node scripts/moveRefundWalletToBalance.js --apply
  ```
