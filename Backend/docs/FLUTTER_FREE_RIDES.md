# First 3 Rides Free – Flutter Developer Notes

Naye user ki pehli **3 completed rides free** hain (passenger rides + goods/parcel dono count hote hain).
Feature backend me ek flag ke peeche hai – flag **off** ho to app ko kuch dikhana nahi hai.

---

## 1. App ko kya karna hai (summary)

1. `GET /users/me` se `freeRides` padho. `enabled == false` ho to free-ride UI **chhupa do**.
2. `enabled == true` aur `left > 0` ho to booking screen par "Free ride" banner/badge dikhao.
3. Ride book karo (normal `POST /rides` ya `POST /deliveries`). Response/ride payload me `freeRide.covered`
   dekho – `true` ho to fare ki jagah "FREE" dikhao aur payment step skip karo.
4. Ride complete hone ke baad counter server khud badhata hai. App kuch bhejta nahi.

---

## 2. API fields

### `GET /users/me`
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "...",
      "freeRides": { "enabled": true, "limit": 3, "used": 1, "left": 2 }
    }
  }
}
```
- `enabled` – server par feature on hai ya nahi.
- `limit` – kitni free rides milti hain (admin badal sakta hai, hardcode na karein).
- `used` – kitni free rides **complete** ho chuki hain.
- `left` – `limit - used` (kabhi negative nahi).

Flag off ho to bhi block aata hai: `{ "enabled": false, "limit": 3, "used": 0, "left": 3 }` – `enabled` hi dekhna hai.

### Ride payload
`GET /rides/:rideId`, `GET /rides/active/me`, socket `ride:state`, aur ride history list me:
```json
{ "freeRide": { "covered": true } }
```
`covered: true` = yeh ride free hai.

Ye teen responses me upar wala `freeRides` summary bhi aata hai (sirf **user** token par):
- `POST /rides` → `data.freeRides` (ride ke saath)
- `GET /rides/active/me` → `data.freeRides`
- `GET /rides/:rideId` → `data.freeRides`

(Driver ko `freeRides` nahi milta; driver ko sirf `freeRide.covered` ride payload me dikh sakta hai.)

---

## 3. Free ride ka behaviour

| Cheez | Free ride par kya hota hai |
|---|---|
| `fare` | Normal fare hi store hota hai (driver ki earning isi se banti hai) – app UI par user ko **₹0 / FREE** dikhao |
| `paymentMethod` | Server `online` set karta hai (user ne cash/online kuch bhi bheja ho) |
| Payment | Ride "already paid" hoti hai – user se kuch charge nahi hota |
| Promo code | Free ride ke saath **allowed nahi** → `400 "Promo codes cannot be combined with free rides"` |
| Subscription | Free ride pehle lagti hai; us ride par subscription use nahi hoti |
| Driver | Earning/commission normal settle hoti hai (platform bharta hai) |

### Free ride kab nahi lagegi (normal charged ride banegi)
- Feature off ho ya 3 free rides use ho chuki hon.
- Ride ka fare admin ke **max fare cap** (default ₹500) se zyada ho.
- **Bidding** wali ride (fare badal sakta hai).
- Pehli free ride abhi chal rahi hai aur user ne dobara free ride book ki, aur `used + chalti hui free rides >= limit` ho.

> Isliye app me "Free" badge sirf tab dikhao jab **ride create hone ke baad `freeRide.covered == true`** aaye.
> Booking se pehle sirf "You have N free rides left" jaisa hint do – guarantee mat do (fare cap ya bidding ki wajah se free na lage).

### Counter kab badhta hai
- Sirf jab ride **COMPLETED** hoti hai. Cancel, no-driver-found ya expire hui ride count **nahi** hoti.
- Har ride sirf ek baar count hoti hai.
- Complete hone ke baad `GET /users/me` dobara call karo taaki `used/left` refresh ho.

---

## 4. Payment / rating screens par dhyan

- Free ride complete hone par payment screen dikhane ki zarurat nahi (amount due = 0).
- Rating/feedback ke liye `PATCH /rides/:rideId/feedback` use karo (`rating` 1–5 zaroori).
- `POST /rides/:rideId/complete-payment/wallet` ya Razorpay order free ride par (tip 0 ke saath)
  `400 "No payable amount remains for this ride"` dega – isko error ki tarah mat dikhana, bas feedback endpoint call karo.
- Tip dena ho to tip ke liye alag tip-order endpoints use hote hain (`/rides/:rideId/tip/razorpay/...`).

---

## 5. Suggested UI states

| State | UI |
|---|---|
| `enabled=false` | Kuch nahi dikhana |
| `enabled=true, left>0` | Home/booking par "🎉 {left} free rides left" |
| `enabled=true, left=0` | Banner hata do |
| Ride `freeRide.covered=true` | Fare ki jagah "FREE", payment option hide, receipt par ₹0 |
| Ride cancel hui | Koi change nahi – free ride wapas use ke liye bachi rehti hai |

---

## 6. Backend settings (reference – Flutter ko chhedna nahi)

Admin panel/API: `PATCH /admin/general-settings/free_rides`
```json
{ "enabled": "1", "limit": "3", "max_fare": "500" }
```
Default: off, limit 3, max_fare 500 (0 = no cap). App in values ko `GET /users/me` ke `freeRides` se hi padhe.

---

## 7. Test checklist (QA)

- [ ] Flag off: `freeRides.enabled=false`, koi UI nahi, rides normal.
- [ ] Flag on, naya user: `left=3`.
- [ ] 1st–3rd ride: `freeRide.covered=true`, payment skip, complete ke baad `used` 1→2→3.
- [ ] 4th ride: `covered=false`, normal payment.
- [ ] Ride cancel karo: `used` nahi badhta.
- [ ] Parcel/goods ride bhi count hoti hai.
- [ ] Promo code ke saath free ride: 400 error handle hota hai.
- [ ] Fare cap se upar ki ride: normal charged, app crash/glitch nahi.
