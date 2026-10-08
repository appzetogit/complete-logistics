# Ride / Delivery cancellation details – Flutter Developer Notes (User app + Driver app)

Cancelled booking ab server se batati hai **kisne cancel kiya, kab, kyun, aur kitna paisa laga**.
Ride/Delivery Details screen par ye dikhana hai: *"Cancelled by you · 04:01 PM · ₹25 cancellation fee"*.

Detail backend doc: `RIDE_CANCELLATION_DETAILS.md`.

---

## 1. Field

```json
"cancellation": {
  "by": "user",
  "at": "2026-10-08T10:31:00.000Z",
  "reason": "Changed my mind",
  "fee": 25,
  "feeCharged": true
}
```

| Field | Matlab |
|---|---|
| `by` | `user` / `driver` / `admin` / `system` |
| `at` | Cancel ka time (UTC ISO) – local time me dikhao |
| `reason` | Cancel karne wale ka text, ya default text |
| `fee` | **Rider** ki cancellation fee jo is cancel par tay hui (`0` jab driver/admin/system ne cancel kiya) |
| `feeCharged` | `true` sirf tab jab fee sach me wallet se kati |

- Ride cancel **nahi** hui ho to `cancellation: null`.
- Purani rides (is change se pehle cancel hui) me bhi `null` aa sakta hai -> sirf "Cancelled" dikhao.
- Extra fields bhi aate hain (ignore kar sakte ho): `code`, `feeStatus`, `feeGoesTo`, `driverFee`.
- Null-safe parse karo: koi bhi field missing ho to wo line chhupa do.

## 2. Kahan milta hai

| API / event | |
|---|---|
| `PATCH /rides/:rideId/cancel` | response `data.cancellation` |
| `GET /rides/:rideId` | ride detail |
| `GET /rides` | history list (har item me) |
| `GET /deliveries` | delivery history |
| socket `ride:state` | live ride state |

Rider aur driver dono ko same block milta hai.

## 3. Cancel karte waqt reason bhejna (User app)

`PATCH /rides/:rideId/cancel` body (optional):
```json
{ "reason": "Changed my mind" }
```
- Max 300 characters. Na bhejo to reason `"Cancelled by rider"` hota hai.
- Cancel dialog me reason list do (e.g. "Changed my mind", "Driver too far", "Booked by mistake", "Other" + text).
- Cancel se **pehle** fee dikhane ke liye: `GET /rides/:rideId/cancel-preview` ->
  `{ fee, walletCoversFee, advanceForfeited, advanceAmount }` – "Cancel karne par ₹25 fee lagegi" / "₹54 advance wapas nahi milega".

## 4. Screen par kya dikhana hai

**"Cancelled by …" line (`by` + `reason`):**

| `by` | `reason` | User app | Driver app |
|---|---|---|---|
| `user` | (rider ka text) | "Cancelled by you" | "Cancelled by rider" |
| `driver` | (driver ka text) | "Cancelled by driver" | "Cancelled by you" |
| `admin` | "Cancelled by admin" | "Cancelled by support" | "Cancelled by support" |
| `system` | "No driver accepted the request" | "No driver found" | – |
| `system` | "Advance payment was not completed in time" | "Advance not paid in time" | – |
| `system` | `replaced_by_new_booking` | "Replaced by a new booking" | "Rider made a new booking" |

Time: `at` ko local time me format karo, e.g. "Cancelled by you · 04:01 PM".
Reason dikhana ho to `reason` (sirf `user`/`driver` wale text user-friendly hote hain).

**Fee line (User app):**

| Case | Dikhao |
|---|---|
| `fee > 0` aur `feeCharged == true` | Fee row "Cancellation fee ₹{fee}" + "Total charged ₹{fee}" |
| `fee > 0` aur `feeCharged == false` | "Nothing was charged" (wallet me paisa kam tha) |
| `fee == 0` | "Nothing was charged" |

Driver app: driver ki khud ki fee (scheduled ride cancel) `driverFee` me hoti hai – rider ko kabhi nahi dikhani.

**Goods advance line (Delivery):** `goodsAdvance` se:
```json
"goodsAdvance": { "percent": 20, "amount": 54, "status": "forfeited", "provider": "razorpay", "paidAt": "…",
                  "refundDestination": "", "refundedAt": null, "forfeitedAt": "…" }
```

| `goodsAdvance.status` | Dikhao |
|---|---|
| `paid` | "Advance paid ₹{amount} · {Online/Wallet} · {paidAt time}" |
| `refunded` | "Advance ₹{amount} · Refunded to your wallet" (`refundDestination`: `refund_wallet` / `wallet` / `source` = original payment) |
| `forfeited` | "Advance ₹{amount} · Not refunded" |
| `none` / `pending` | Advance line nahi |

`provider`: `razorpay` -> "Online", `wallet` -> "Wallet".

## 5. Baaki fields jo screen use karti hai (naam same hain)

`remainingFare`, `paymentMethod`, `freeRide.covered`, `subscriptionUsage.{covered, planName}` (history me bhi),
`feedback.tipAmount`, `createdAt`, `updatedAt`, `completedAt`.

## 6. Kab `cancellation` set NAHI hota

- Ride chal rahi hai / complete hui -> `null`.
- Driver ne normal ride cancel ki -> ride cancel nahi hoti, **naya driver dhoondha jaata hai** (`rideDriverCancelled` event).
  Is case me `cancellation` nahi aata; searching screen dikhao.

## 7. QA checklist

- [ ] Driver assign hone se pehle rider cancel -> "Cancelled by you · {time}", fee pricing ke hisaab se (aksar 0) -> "Nothing was charged".
- [ ] Driver accept ke baad cancel (fee ₹25) -> `fee: 25, feeCharged: true` -> fee row + "Total charged ₹25".
- [ ] Wallet me paisa kam -> `feeCharged: false` -> "Nothing was charged".
- [ ] Koi driver nahi mila -> "No driver found"; paid goods advance -> "Refunded to your wallet".
- [ ] Goods booking advance pay karke rider cancel -> "Cancelled by you", "Advance ₹54 · Not refunded".
- [ ] Nayi booking ki to purani -> "Replaced by a new booking".
- [ ] Ride detail, history list aur live `ride:state` teeno me same info.
- [ ] `cancellation: null` / missing fields par crash nahi, lines chhup jaati hain.
- [ ] Cancel dialog me reason bhejne par wahi reason detail screen par dikhe.
