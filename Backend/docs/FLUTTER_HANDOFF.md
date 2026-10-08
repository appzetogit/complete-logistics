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
| 7 | Request driver tak **na pahunchna** fix (ride-offers, reconnect, advance recovery) | Driver app + User app | section 9, `DISPATCH_RELIABILITY.md` |
| 8 | **Upload** ab login maangta hai + sirf image | Saari apps | section 10 |
| 9 | Accept selfie **flag** (scheduled / bid) + goods **pickup/drop selfie** | Driver app | section 11 |
| 10 | **Cancel preview** (fee + advance warning) | User app | section 12 |
| 11 | Free ride: `maxFare`, quote me `coveredBy` | User app | section 13 |
| 12 | **Subscription**: Razorpay purchase, multi-vehicle plan | User app | section 14, `SELFIES_FREE_RIDES_SUBSCRIPTIONS.md` |

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

---

# Newer changes (dispatch, uploads, selfies, cancel preview, free rides, subscriptions)

Detail: `DISPATCH_RELIABILITY.md` aur `SELFIES_FREE_RIDES_SUBSCRIPTIONS.md`.

## 9. Request driver tak pahunchana (Driver app + User app)

**Driver app**
- App start, socket reconnect aur `ride_request` push par: `GET /drivers/ride-offers` (driver token).
  Response `{ data: { results: [ <rideRequest payload> ], total } }`. Har result ko bilkul `rideRequest` socket event ki tarah
  dikhao. **`rideId` se de-duplicate karo** – wahi offer reconnect par socket se bhi aa sakta hai (server ab socket connect hote hi
  open offers dobara bhejta hai).
- Sirf us driver ko offer milta hai jiski abhi baari hai (one-by-one mode); jinki window nikal chuki hai unhe nahi.
- `rideRequestClosed` ke `reason` me ab `"user-replaced-booking"` bhi aata hai (rider ne nayi booking ki) – offer hata do.

**User app**
- **Advance bharne ke baad verify fail/timeout** ho (network, 429) to turant error mat dikhao. Pehle
  `POST /deliveries/advance/razorpay/reconcile` `{ "rideId" }` (2-3 baar retry). `200` + ride payload = advance mil gaya, dispatch
  shuru. `404 "No completed payment…"` = abhi payment captured nahi, user dobara pay kar sakta hai. `409` = booking band ho chuki
  (paisa auto-refund). Pending booking restore karte waqt bhi yehi call karo agar order shuru ho chuka tha.
- Verify ka rate limit ab alag aur ooncha hai; order endpoint abhi bhi limited (12 / 15 min).
- Nayi booking karne par purani **paid, bina accept hui** goods booking ka advance ab **refund** hota hai: `goodsAdvance:refunded`
  event, `reason: "replaced_by_new_booking"` -> "₹X advance refunded" dikhao. Agar driver accept kar chuka tha to pehle ki tarah
  advance forfeit.

## 10. Upload (saari apps)
- `POST /common/upload/image` par **`Authorization: Bearer <token>` zaroori** (bina token `401`). Onboarding wale pending drivers bhi
  apna token bhej sakte hain.
- Sirf image: `data:image/(png|jpeg|jpg|webp|gif|heic|heif);base64,...`. Baaki sab `400`.
- Response `data.url` hamesha **absolute** URL hota hai – seedha `selfieUrl` / `selfieImageUrl` me bhej do.
- Body bada hota hai (base64 JSON, 25 MB tak): upload se pehle image compress karo.

## 11. Driver selfies (Driver app)

**Accept selfie flag**
- Driver room ke `rideAccepted` event me `acceptSelfieRequired: true|false`. **Normal, scheduled aur bid** teeno accepts me aata hai.
  `true` ho to accept-selfie screen kholo (`PATCH /rides/:id/accept-selfie` `{ selfieUrl }`).
- Driver ke ride payload (`GET /rides/active/me`, `GET /rides/:id`, `ride:state`) me bhi `acceptSelfieRequired` hai (ride
  `accepted/ongoing` aur selfie missing ho tab `true`) – app restart ke baad bhi selfie screen wapas khul sake.
- Future-scheduled ride jo accept ho chuki ho aur selfie baaki ho, ab `GET /rides/active/me` me **aati hai** (pehle nahi aati thi).
  Selfie upload ke baad wo dobara "active" nahi dikhti. Isko "ride chal rahi hai" mat samjho – `scheduledAt` future ho to normal
  scheduled ride jaisa hi treat karo, bas selfie screen kholo.
- Rider ko ye field kabhi nahi milta.

**Goods pickup / delivery selfie (naya)**
- `goods_loaded` aur `goods_delivered` status update (REST `PATCH /rides/:id/status` ya socket `ride:status:update`) me goods photo
  (`proofImageUrl`, rear camera) ke saath ab **`selfieImageUrl`** (driver ka face selfie, front camera) bhi bhejo.
- Abhi optional hai. Admin setting `goods_selfie_required` on hote hi dono steps par zaroori ho jaata hai; bina selfie ke
  `400 "A selfie of the driver is required for this step"`. Pehle app me selfie step banao, phir admin setting on hogi.
- Selfie rider ko kabhi nahi dikhti (sirf admin ko); driver ko apni dikhti hai. Goods photo pehle ki tarah rider ko dikhti hai.

## 12. Cancel preview (User app)

Cancel confirm dialog se pehle: `GET /rides/:rideId/cancel-preview`
```json
{ "data": { "rideId": "…", "fee": 25, "feeGoesTo": "admin|driver|null", "walletCoversFee": true,
            "advanceForfeited": false, "advanceAmount": 0, "advanceRefundable": false } }
```
- `fee > 0` -> "Cancellation fee ₹{fee} aapke wallet se katega".
- `walletCoversFee == false` -> wallet me paisa kam hai, fee nahi kat sakti (user ko batao).
- `advanceForfeited == true` -> "₹{advanceAmount} advance wapas nahi milega".
- `404` = ride aapki nahi, `409` = ride pehle hi complete/cancel. Ye call kuch badalti nahi.

## 13. Free rides (User app)

- `GET /users/me` -> `freeRides: { enabled, limit, used, left, maxFare }`. **`maxFare` naya hai** (`0` = koi cap nahi): fare isse
  upar ho to ride free **nahi** hogi. Hint dikhao ("N free rides, ₹{maxFare} tak"), guarantee nahi.
- **Goods quote** (`POST /deliveries/quote`) ab batata hai ki booking cover hogi ya nahi:
  `coveredBy: "free_ride" | "subscription" | null`, `freeRide: { covered }`, `subscriptionCovered`.
  `coveredBy` set ho to `advanceAmount`, `advancePercent`, `remainingAmount` = `0` aur `advanceOptions = []`:
  "FREE" dikhao, **advance / payment UI mat dikhao**. (Booking me bhi advance nahi lagta.)
- Feature backend par abhi band hai; admin on karega (`enabled`). `enabled == false` ho to koi free-ride UI nahi.

## 14. Subscription (User app)

- **Razorpay se kharidna:** `POST /users/subscriptions/razorpay/order` `{ planId }` -> `{ keyId, orderId, amount, currency, plan }`
  -> Razorpay checkout -> `POST /users/subscriptions/razorpay/verify`
  `{ razorpay_order_id, razorpay_payment_id, razorpay_signature }` -> `201 { subscription, alreadyPurchased: false }`
  (same payment dobara bhejo to `200 alreadyPurchased: true`, doosri subscription nahi banti). Wallet se kharidna
  (`POST /users/subscriptions/purchase`) pehle jaisa.
- **Plan me kai vehicle:** plans aur subscriptions me ab `vehicle_type_ids: [...]` hai (purana `vehicle_type_id` pehla id).
  "Ye plan in vehicles par chalega" in sab ke naam dikhao.
- **Covered ride:** ride payload me `subscriptionUsage: { covered: true, planName, planId, subscriptionId, … }` aur
  `paymentMethod: "online"`. `covered == true` ho to payment sheet **skip** karo.
- **Bidding rides kabhi cover nahi hoti**; limited plan me booked-par-incomplete ride bhi ek credit rokti hai.
- Goods quote me active subscription ho to `coveredBy: "subscription"` (upar section 13).

## 15. Final QA (naye changes)

- [ ] Driver: app band/socket down rakh kar request bhejo -> reconnect par `rideRequest` aati hai, `GET /drivers/ride-offers` me dikhti hai, duplicate card nahi banta.
- [ ] Driver: baari nikal chuki request (one-by-one) dobara nahi dikhti; `rideRequestClosed` par card hat jaata hai.
- [ ] User: Razorpay pay karke verify fail simulate karo -> reconcile se booking aage badhti hai, driver ko request jaati hai.
- [ ] User: nayi booking par purani paid booking ka advance refund event/toast.
- [ ] Upload: token ke saath chalta hai, bina token 401, non-image 400, URL absolute.
- [ ] Driver: scheduled aur bid accept par bhi `acceptSelfieRequired` se selfie screen khulti hai; restart ke baad bhi.
- [ ] Driver: goods pickup/drop par `selfieImageUrl` jaata hai (setting on karke test), rider ko selfie nahi dikhti.
- [ ] User: cancel dialog `cancel-preview` se fee aur advance warning dikhata hai.
- [ ] User: `coveredBy` set ho to advance/payment UI nahi, "FREE"/"covered" dikhta hai.
- [ ] User: subscription Razorpay se kharido, multi-vehicle plan par dono vehicles covered, payment sheet skip.
