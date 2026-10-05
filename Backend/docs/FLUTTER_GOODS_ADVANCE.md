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
| **User cancel** (driver assign hone se pehle ya baad) | **Refund nahi** (forfeited) |
| **Driver cancel** (scheduled ride) | **Refund** |
| **Koi driver nahi mila** (unmatched) | **Refund** |
| **Admin cancel** | **Refund** |
| User ne advance diya hi nahi (`pending`) | Kuch charge nahi hua, kuch refund nahi |

### Cancel API – `PATCH /rides/:rideId/cancel`
Response `data` me naye fields:
```json
{ "rideId": "...", "status": "cancelled", "advanceRefunded": false, "advanceStatus": "forfeited" }
```
- User cancel par hamesha `advanceRefunded: false`; paid advance ho to `advanceStatus: "forfeited"`.
- **Cancel dialog me warning dikhao** jab `goodsAdvance.status == "paid"`:
  "Cancel karne par ₹{amount} advance refund nahi hoga."

### Refund kahan jaata hai
Admin setting (`goods_advance_refund_to`): `refund_wallet` (default), `wallet`, ya `source` (original Razorpay payment).
- Refund hone par socket event aata hai:
  ```json
  // event: goodsAdvance:refunded
  { "rideId": "...", "amount": 200, "destination": "refund_wallet|wallet|source", "reason": "no_driver_found|cancelled_by_driver|cancelled_by_admin" }
  ```
  User ko toast/notification dikhao ("₹200 advance refunded to your wallet").
- Ride payload me `goodsAdvance.status = "refunded"`.
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
| `forfeited` | User cancel ke baad kata | "Advance not refundable" |

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
{ "goods_advance_percent": "20", "goods_advance_refund_to": "refund_wallet" }
```
- `goods_advance_percent`: `0` = advance band (off).
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
- [ ] User cancel (paid) → `advanceRefunded: false`, status `forfeited`, warning dialog.
- [ ] Admin cancel → refund.
- [ ] Completion: user se sirf `remainingFare` charge; driver ko wahi collect karna.
- [ ] Free ride / subscription wali goods booking → advance nahi.
- [ ] Normal ride par koi advance field/behaviour change nahi.
