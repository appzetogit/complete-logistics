# Flutter Developer Handoff – Saare naye backend changes (ek file me)

Ye file **User app** aur **Driver app** dono ke liye hai. Har feature ka poora detail alag file me hai (link neeche),
lekin yahan se aap ek jagah dekh kar kaam shuru kar sakte ho.

Base URL / login / socket ki basic jaankari: `FLUTTER_DEVELOPER_GUIDE.md`.

| # | Feature | Kiska kaam | Detail file |
|---|---|---|---|
| 1 | Goods booking par **20% advance** (dispatch se pehle) | User app (zaroori) + Driver app (chhota) | `FLUTTER_GOODS_ADVANCE.md` |
| 2 | Goods ka fare ab **Set Price se** (quote API hi sach) | User app | `FLUTTER_GOODS_PRICING.md` |
| 3 | Pehli **3 rides free** | User app | `FLUTTER_FREE_RIDES.md` |
| 4 | Driver **cancel** + din ke 3 cancel par block | Driver app (zyada) + User app (2 events) | `FLUTTER_DRIVER_CANCEL_LIMIT.md` |
| 5 | Accept **selfie** user ko nahi dikhegi | User app + Driver app | `FLUTTER_ACCEPT_SELFIE.md` |
| 6 | Welcome + T&C email | Koi app change nahi | (neeche) |

> **Sabse zaroori:** Feature 1 (advance) app me na ho to goods booking driver tak jaati hi nahi
> (30 min baad auto-cancel). Pehle ye bana lo.

---

## 1. Goods advance (User app – MUST)

Sirf **goods/parcel** booking par. Taxi ride par kuch nahi badla.

Flow:
```
POST /deliveries/quote  →  POST /deliveries  →  goodsAdvance.status == "pending" ?
        →  advance pay (wallet ya Razorpay)  →  searching screen  →  accepted …
```

1. Quote me `advancePercent`, `advanceAmount`, `remainingAmount` aate hain → "Advance now ₹X • Pay ₹Y on delivery".
2. Booking ke response me `goodsAdvance.status`:
   - `"pending"` → **abhi driver ko request nahi gayi.** Payment screen kholo.
   - `"none"` → free ride / subscription: seedha searching.
3. Advance pay:
   - **Wallet:** `POST /deliveries/advance/wallet` `{ "rideId" }` (kam balance → `400`).
   - **Razorpay:** `POST /deliveries/advance/razorpay/order` `{ "rideId" }` → `{ keyId, orderId, amount, currency }`
     → Razorpay checkout → `POST /deliveries/advance/razorpay/verify`
     `{ "rideId", "razorpay_order_id", "razorpay_payment_id", "razorpay_signature" }`.
4. Success ke baad hi searching screen dikhao. Dispatch server khud shuru karta hai.

Pay in full (optional): quote ke `advanceOptions` me `100` ho tabhi "Pay in full" chip dikhao; chune to booking me
`advancePercent: 100` bhejo. Tab `remainingFare = 0` hota hai – completion par payment skip, sirf feedback (`complete-payment/*` `400 "No payable amount"`),
driver ko "Collect ₹0" hide. Server galat/unallowed value ko default % se badal deta hai.

Rules:
- **Pay kiye bina "Finding captain…" mat dikhao.** Booking `pending` me atki rehti hai, koi driver notify nahi hota.
  (Web app me yahi bug tha, ab fix hai.)
- 30 min me pay nahi kiya → booking auto-cancel (`rideCancelled` event).
- Verify dobara call karna safe hai (double charge nahi).
- App restart par `GET /deliveries/active/me` / `GET /rides/active/me` me `status == "pending"` mile to seedha payment screen.
- Razorpay `keyId` hamesha order response se lo, app me hardcode mat karo.

Baaki 80%:
- Ride payload ka `remainingFare` hi user se lena hai. Completion payment endpoints sirf remaining charge karte hain.
- **Driver app:** "Collect ₹`remainingFare`" dikhao (`fare` nahi). QR/link ka amount bhi `remainingFare`.

Cancel / refund:

| Kab | Advance |
|---|---|
| User cancel | **Refund nahi** → cancel dialog me warning dikhao jab `goodsAdvance.status == "paid"` |
| Driver cancel (scheduled) / koi driver nahi mila / admin cancel | **Refund** (`goodsAdvance:refunded` socket event) |
| Advance diya hi nahi (`pending`) | Kuch charge/refund nahi |

`goodsAdvance.status`: `none`, `pending`, `paid`, `refunded`, `forfeited`. Percent hardcode mat karo (quote se lo).

---

## 2. Goods fare (User app)

- Fare **sirf** `POST /deliveries/quote` se dikhao. `priced: false` ho to us vehicle ko "Not available" karo.
- `GET /users/vehicle-types` ke `delivery_distance_pricing` se fare mat banao (wo sirf All Zones ka rate hai).
- App me local formula mat rakho. Quote fail ho to loading/retry.
- Pickup, drop, vehicle, load height ya extras badle to dobara quote (debounce ~350 ms).
- Booking ka fare == quote ka `total`.
- `pricingSource`: `set_price` ya `vehicle` – app ko dono me same behave karna hai.

---

## 3. Free rides (User app)

- `GET /users/me` → `freeRides: { enabled, limit, used, left }`. `enabled == false` ho to UI chhupa do.
- `left > 0` → "N free rides left" hint (guarantee mat do).
- Ride create hone ke baad `freeRide.covered == true` ho tabhi "FREE" dikhao aur payment skip karo.
- Cancel hui ride count nahi hoti. Complete ke baad `GET /users/me` refresh karo.
- Free ride ke saath promo code → `400` (handle karo).
- Free ride par `complete-payment` endpoints `400 "No payable amount remains"` denge – error mat dikhao, sirf `PATCH /rides/:id/feedback`.

---

## 4. Driver cancel + limit (Driver app mukhya)

`POST /rides/:rideId/driver-cancel` `{ "reason"? }` – sirf `accepted`/`arriving` par.
Start ho chuki ride → `409` (button hide). Future scheduled ride → `400`.

- `GET /drivers/me` → `cancelLimit`, `cancelsToday`, `cancelsLeft`, `cancelBlocked`, `blockedUntil`.
- Cancel dialog: `cancelsLeft == 1` ho to **"Yeh aakhri cancel hai, aaj ke liye block ho jaoge"**.
- 3rd cancel: response `cancelBlocked: true`, socket `driver:blocked`, toggle **OFF** dikhao.
- Block me online / accept / bid → `403` `details.code == "DRIVER_CANCEL_BLOCKED"` (message + `blockedUntil` local time dikhao).
- Limit hardcode mat karo (`cancelLimit`), `0` = off. Counter IST midnight par reset.
- Reject karna / scheduled cancel count nahi hota.

**User app:** socket `rideDriverCancelled` → "Naya driver dhundh rahe hain…" + searching screen, purane driver ka card hatao.
`rideCancelled` → home.

---

## 5. Accept selfie

- **User app:** `acceptSelfie` ka koi use hata do (key hi nahi aayegi, null-safe rakho). Driver card me
  `driver.profileImage`, naam, vehicle, number, rating. `profileImage` khaali ho sakti hai → placeholder avatar.
- **Driver app:** selfie flow same (`acceptRide` ke saath `selfieUrl` ya `PATCH /rides/:id/accept-selfie`).
  Selfie ki state **apne upload response** ya `GET /rides/active/me` se lo, room ke live `ride:state` par depend mat karo.

---

## 6. Welcome email

Signup/onboarding par backend khud welcome + T&C email bhejta hai (agar email di ho aur server par on ho).
App ko kuch nahi karna. Email galat ho ya mail server down ho to bhi signup chalta hai.

---

## 7. Test credentials / environment

- Razorpay keys backend/admin me set hoti hain; app ko sirf order response ka `keyId` use karna hai.
- Test card/UPI Razorpay test mode ke hi use karo.

---

## 8. Final QA (sab milake)

- [ ] Goods booking → `pending` → payment screen → pay (wallet + Razorpay) → tabhi searching.
- [ ] Kam wallet balance par Razorpay ka option bacha rahe.
- [ ] Pay kiye bina back: booking pending rehti hai, wapas aakar pay ho sakti hai ya cancel.
- [ ] Quote total == booking fare; `priced: false` vehicle book nahi hoti.
- [ ] Completion par user se sirf `remainingFare`; driver ko wahi collect.
- [ ] User cancel (paid advance) → warning, refund nahi. No driver found / admin cancel → refund event.
- [ ] Free ride: badge sirf `covered == true` par; payment skip.
- [ ] Driver cancel: warning, 3rd cancel par block + toggle OFF; user ko `rideDriverCancelled`.
- [ ] User app me `acceptSelfie` kahin nahi; driver card me profile photo/placeholder.
