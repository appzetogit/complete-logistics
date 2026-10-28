# Goods Booking: 20% Advance + Refund Rules – Flutter Developer Notes

Sirf **goods (parcel) bookings** par lagta hai, rides par nahi.

> **Rollout:** backend par yeh default **ON (20%)** hai. Jab tak app me yeh flow na ho, goods
> booking driver tak nahi jaayegi (30 min baad auto-cancel). Pehle app release karo, ya backend par
> `goods_advance_percent = 0` rakho.

---

## 1. Flow (user app)

1. **Quote:** `POST /deliveries/quote` → naye fields:
   ```json
   { "total": 1000, "advancePercent": 20, "advanceAmount": 200, "remainingAmount": 800 }
   ```
   UI par dikhao: "Advance now ₹200 • Pay ₹800 on delivery".
2. **Booking banao:** `POST /deliveries` (pehle jaisa). Response ride payload me:
   ```json
   { "rideId": "...", "goodsAdvance": { "percent": 20, "amount": 200, "status": "pending" }, "remainingFare": 800 }
   ```
   `status: "pending"` = **abhi driver ko request nahi gayi**. Payment screen kholo.
   (Free ride / subscription wali booking me advance nahi hota – `goodsAdvance.status` = `"none"`, seedha dispatch.)
3. **Advance pay karo** (dono me se ek):
   - **Razorpay:**
     1. `POST /deliveries/advance/razorpay/order` body `{ "rideId" }`
        → `data: { keyId, orderId, amount, currency, advanceAmount, remainingAmount }`
     2. Razorpay checkout kholo (`keyId`, `orderId`, `amount`).
     3. Success par `POST /deliveries/advance/razorpay/verify`
        body `{ "rideId", "razorpay_order_id", "razorpay_payment_id", "razorpay_signature" }`
   - **Wallet:** `POST /deliveries/advance/wallet` body `{ "rideId" }` (wallet balance kaafi hona chahiye, warna `400 Insufficient wallet balance`).
4. Verify/wallet success par response me ride payload aata hai, `goodsAdvance.status = "paid"`,
   aur **ab dispatch shuru ho jaata hai** – baaki flow (searching → accepted …) pehle jaisa socket events se.

### Pay in full (optional choice)
Quote me `advanceOptions` aata hai, jaise `[20, 100]`. **"Pay in full" chip tabhi dikhao jab list me `100` ho.**
- User full chune to booking me `advancePercent: 100` bhejo (default 20 chuna ho to field mat bhejo).
- Server sirf allowed values maanta hai (`advanceOptions` me se); koi aur value ya full band ho to default % lagta hai.

**Payment methods (quote):** `POST /deliveries/quote` ab `allowedPaymentMethods` bhi deta hai: `cash | online | wallet` jo admin ne is vehicle ke
delivery Set Price (Pricing > Set Price > Payment Type) me allow kiye hain (pickup zone ka rule jo fare lagata hai, wahi). Payment sheet me **sirf yahi
options dikhao** (app ke naam: `cash`, `wallet`, `razorpay` = server `online`). Chuna hua method list me na ho to pehle allowed method pe switch karo.
Field missing (Set Price nahi / purana server) = sab options dikhao; booking me server khud allowed method laga deta hai (`paymentMethodChanged: true`).
- 100% par `goodsAdvance.percent = 100`, `amount = fare`, `remainingFare = 0`. Payment endpoints wahi (`/advance/wallet`, `/advance/razorpay/...`).
- Completion par kuch due nahi: `complete-payment/*` `400 "No payable amount remains"` dete hain (Razorpay ka ₹0 order nahi banta) – app ye calls skip kare aur seedha `PATCH /rides/:id/feedback` kare. Driver ko "Collect ₹0" / collect step hide.
- Cancel/refund rules same: user cancel = fare ka 15% kata (advance se zyada nahi), baaki refund; driver/no driver/admin = poora amount refund.
- Admin switch: `goods_advance_allow_full` (`true`/`false`, default `true`).

### Important rules
- Order **hamesha latest** wala verify hota hai. Naya order banao to purana order verify nahi hoga.
- `rideId` user ki apni booking ki honi chahiye (warna `404`).
- Verify dobara call karna safe hai (same payment par `200`, double charge nahi).
- Payment ke baad booking cancel/expire ho chuki ho to `409` aata hai – paisa original payment me **auto-refund** hota hai.
- **30 minute** me advance pay nahi kiya to booking auto-cancel (`rideCancelled` socket event, reason: "Advance payment was not completed in time").
- Payment screen par user back kare to booking `pending` rehti hai – wapas aakar pay kar sakta hai (30 min tak).
  Naya ride/goods book karne par purani pending booking cancel ho jaati hai.

---

## 2. Baaki 80% – completion par

- Ride payload ka `remainingFare` hi user se lena hai (`fare − advance`).
- Rating/pay screen (`/rides/:rideId/complete-payment/...`) ab **sirf remaining** charge karti hai.
  Razorpay order ka `amount` already remaining hota hai – apni taraf se fare minus mat karo.
- Cash choose kiya ho to driver hath me `remainingFare` collect karega.
- **Driver app:** ride request/payload me `goodsAdvance` aur `remainingFare` aate hain.
  Driver ko "Collect ₹{remainingFare}" dikhao (`fare` nahi). Payment QR/link ka amount bhi `remainingFare` rakho.

---

## 3. Cancel / refund rules

| Kaun / kab | Advance |
|---|---|
| **User cancel** (driver assign hone se pehle ya baad) | **Fare ka 15% kata, baaki advance refund** (status `forfeited`, `keptAmount` + `refundedAmount`) |
| **Driver cancel** (scheduled ride) | **Refund** |
| **Koi driver nahi mila** (unmatched) | **Refund** |
| **Admin cancel** | **Refund** |
| User ne advance diya hi nahi (`pending`) | Kuch charge nahi hua, kuch refund nahi |

### User cancel – kitna kat-ta hai, kitna wapas aata hai
Admin setting `goods_advance_cancel_keep_percent` (default **15**) = **fare ka %** (advance ka nahi):

```
kept     = min(advance, fare × keepPercent / 100)
refunded = advance − kept
```

| Fare | Advance | Kata | Wapas |
|---|---|---|---|
| ₹1000 | ₹200 (20%) | ₹150 | ₹50 |
| ₹1000 | ₹1000 (full pay) | ₹150 | ₹850 |
| ₹1000 | ₹200, keep% = 20 ya zyada | ₹200 | ₹0 |
| ₹1000 | ₹200, keep% = 0 | ₹0 | ₹200 (status `refunded`) |

- Refund wahi jaata hai jahan normal refund jaata hai (`goods_advance_refund_to`: `refund_wallet` / `wallet` / `source`).
- `cancellation_fee_goes_to = driver` ho to driver ko sirf **kata hua hissa** milta hai (poora advance nahi).
- Double cancel / repeat call par refund sirf ek baar hota hai.

### Cancel API – `PATCH /rides/:rideId/cancel`
Response `data` me fields:
```json
{
  "rideId": "...", "status": "cancelled",
  "advanceStatus": "forfeited",
  "advanceRefunded": true,
  "advanceKeptAmount": 150,
  "advanceRefundedAmount": 50,
  "advanceRefundDestination": "refund_wallet"
}
```
- Paid advance par `advanceStatus: "forfeited"`; `advanceRefunded` tab `true` jab `advanceRefundedAmount > 0`.
- Kuch kata nahi (keep% = 0) to `advanceStatus: "refunded"`.
- Result dikhao: "₹150 charged, ₹50 refunded".
- **Cancel dialog (cancel se pehle)**: booking quote me `advanceCancelKeepPercent` aata hai (abhi 15). Dialog me dikhao jab `goodsAdvance.status == "paid"`:
  `kept = min(goodsAdvance.amount, fare × advanceCancelKeepPercent / 100)`, `refund = goodsAdvance.amount − kept`
  -> "Cancel karne par ₹{kept} kat-ega, ₹{refund} wapas milega." (percent hardcode mat karo.)

### Refund kahan jaata hai
Admin setting (`goods_advance_refund_to`): `refund_wallet` (default), `wallet`, ya `source` (original Razorpay payment).
- Refund hone par socket event aata hai:
  ```json
  // event: goodsAdvance:refunded
  { "rideId": "...", "amount": 200, "destination": "refund_wallet|wallet|source", "reason": "no_driver_found|cancelled_by_driver|cancelled_by_admin" }
  // user cancel par bhi aata hai (sirf wapas hone wale hisse ke saath, + keptAmount):
  { "rideId": "...", "amount": 50, "keptAmount": 150, "destination": "refund_wallet", "reason": "cancelled_by_rider" }
  ```
  User ko toast/notification dikhao ("₹200 advance refunded to your wallet" / "₹50 refunded, ₹150 cancellation charge").
- Ride payload me `goodsAdvance.status = "refunded"` (poora refund) ya `"forfeited"` (user cancel, `keptAmount` + `refundedAmount` ke saath).
- `destination: "refund_wallet"` wala paisa `GET /users/wallet` me `refundWallet` field me dikhta hai
  (abhi yeh normal wallet balance se alag hai).

---

## 4. `goodsAdvance.status` values aur UI

| status | Matlab | UI |
|---|---|---|
| `none` | Advance nahi (ride, free ride, subscription, ya % = 0) | Kuch nahi |
| `pending` | Advance baaki, **dispatch nahi hua** | "Pay ₹X advance to confirm" button/screen |
| `paid` | Advance mil gaya, request chal rahi hai | "Advance ₹X paid • Pay ₹remaining on delivery" |
| `refunded` | Wapas mil gaya | "₹X refunded" |
| `forfeited` | User cancel ke baad kuch hissa kata (`keptAmount`), baaki wapas (`refundedAmount`, 0 bhi ho sakta hai) | "₹{keptAmount} charged, ₹{refundedAmount} refunded" |

`goodsAdvance` payload me ab `keptAmount` aur `refundedAmount` bhi hain (`refundDestination`, `refundedAt` pehle se). Purani
rows (jinme ye fields nahi the): `forfeited` = poora `amount` kata, `refunded` = poora `amount` wapas.

Active delivery restore (`GET /deliveries/active/me`, `GET /rides/active/me`) par `status == "pending"` mile to seedha
payment screen kholo.

---

## 5. Error cases

| Code | Message (approx.) | Kya karein |
|---|---|---|
| 400 | Insufficient wallet balance | Razorpay option dikhao / top-up |
| 400 | Invalid payment signature / does not belong / does not match | Payment verify fail – naya order banao |
| 404 | Goods booking with an advance was not found | Galat rideId ya booking me advance nahi |
| 409 | The advance for this booking is not payable | Booking already paid/cancelled – ride state refresh karo |
| 409 | This payment was already used for another booking | Support se sampark |
| 409 | This booking is no longer open… | Booking expire/cancel; paisa refund ho jaata hai |
| 429 | Too many payment requests | Retry timer |

---

## 6. Admin settings (reference)

`PATCH /admin/general-settings/transport_ride`
```json
{ "goods_advance_percent": "20", "goods_advance_refund_to": "refund_wallet", "goods_advance_cancel_keep_percent": "15" }
```
- `goods_advance_percent`: `0` = advance band (off).
- `goods_advance_cancel_keep_percent`: user cancel par **fare ka** kitna % kata jaye (default `15`, `0` = poora refund). Admin panel: Settings > Transport Ride.
- App me % hardcode na karein – quote ke `advancePercent` se lein.

---

## 7. QA checklist

- [ ] Quote me `advanceAmount`/`remainingAmount` sahi (20% / 80%).
- [ ] Booking ke baad `pending` – driver ko request **nahi** gayi.
- [ ] Razorpay advance success → `paid`, dispatch chalu, driver ko `rideRequest` me `remainingFare`.
- [ ] Wallet advance success; kam balance par 400.
- [ ] Verify dobara call → double charge nahi.
- [ ] 30 min bina payment → booking auto-cancel.
- [ ] Koi driver nahi mila → `goodsAdvance:refunded` event, status `refunded`.
- [ ] User cancel (paid, 20% advance) → `advanceKeptAmount` = fare ka 15%, `advanceRefundedAmount` = baaki, `advanceRefunded: true`, status `forfeited`, `goodsAdvance:refunded` event.
- [ ] User cancel (full pay) → fare ka 15% kata, baaki refund.
- [ ] Cancel dialog quote ke `advanceCancelKeepPercent` se amounts dikhata hai (hardcode nahi).
- [ ] Cancel dobara/double-tap → refund ek hi baar.
- [ ] Admin cancel → refund.
- [ ] Completion: user se sirf `remainingFare` charge; driver ko wahi collect karna.
- [ ] Free ride / subscription wali goods booking → advance nahi.
- [ ] Normal ride par koi advance field/behaviour change nahi.
