# Goods Pricing (Set Price) + Booking Flow – Flutter Developer Notes

Goods ka fare ab admin ke **Pricing → Set Price** (zone-wise, *Delivery* row) se banta hai, Vehicle Type page se nahi.
App me **kuch endpoint change nahi hua** – bas fare ka source badla. Advance ka detail: `FLUTTER_GOODS_ADVANCE.md`.

---

## 1. Rule: fare ka sach sirf quote API

`POST /deliveries/quote`

```json
// request
{ "vehicleTypeId": "…", "pickup": [lng, lat], "drop": [lng, lat] }
```
```json
// response.data (relevant fields)
{
  "priced": true,
  "total": 121.15,
  "subtotal": 115.37,
  "serviceTaxPercentage": 5,
  "serviceTaxAmount": 5.77,
  "distanceKm": 3.03,
  "baseDistanceKm": 2,
  "pricingSource": "set_price",
  "setPriceId": "…",
  "advancePercent": 20,
  "advanceAmount": 24.23,
  "remainingAmount": 96.92
}
```

| Field | Matlab |
|---|---|
| `priced` | `false` → us vehicle ka goods fare set nahi hai. Vehicle ko list me **disable** karo / "Not available" dikhao, estimate khud mat banao |
| `pricingSource` | `set_price` (Set Price se) ya `vehicle` (purane values, jab tak admin ne Delivery Set Price nahi banaya). App ko dono me same behave karna hai |
| `total` | Yahi dikhao. Isme service tax, load height aur extras already included hain |
| `advanceAmount` / `remainingAmount` | "Advance now ₹X • Pay ₹Y on delivery" |

**Mat karo**
- `GET /users/vehicle-types` ke `delivery_distance_pricing` se fare calculate mat karo. Ye sirf **All Zones** ka rate hai
  ("from ₹X" jaisa label chal sakta hai). Zone ka asli fare sirf quote me aata hai (pickup ke zone se).
- Local formula (base + km × rate) mat rakho. Quote fail ho to loading/retry dikhao.

**Kab dobara quote lena hai:** pickup, drop, vehicle, load height ya extras badle (debounce ~350 ms).

---

## 2. Poora flow (user app)

```
quote ──► booking ──► (advance pending?) ──► advance pay ──► searching ──► accepted ──► …
```

1. `POST /deliveries/quote` – fare + advance dikhao.
2. `POST /deliveries` – body pehle jaisa (`fare` bhejna optional hai, server apna fare lagata hai, jo quote ke barabar hai).
3. Response me `goodsAdvance.status`:
   - `"pending"` → **abhi driver ko request nahi gayi.** Payment screen kholo (step 4).
   - `"none"` → free ride / subscription, seedha searching screen.
4. Advance pay:
   - Wallet: `POST /deliveries/advance/wallet` `{ "rideId" }`
   - Razorpay: `POST /deliveries/advance/razorpay/order` → checkout → `POST /deliveries/advance/razorpay/verify`
5. Success ke baad hi searching screen + socket events (`rideAccepted`, …) shuru karo.

> **Common bug:** advance pay kiye bina "Finding captain…" dikhana. Booking `pending` me atki rehti hai, koi driver notify nahi hota,
> aur 30 min baad auto-cancel ho jaati hai. Web app me bhi yahi bug tha, ab fix hai. Searching screen tabhi dikhao jab `goodsAdvance.status` `paid` ya `none` ho.

Payment fail / user ne checkout band kiya → error dikhao, **dobara pay** karne do (booking 30 min tak `pending` rehti hai).
User back kare to "Cancel booking" ya "Pay now" ka option do.

---

## 3. Admin ne kya badla (app par asar)

- Admin Set Price me **Delivery** row banata/edit karta hai → agla quote turant naya (cache stale nahi).
- Zone ka apna row ho to wahi, warna **All Zones** row; dusre zone ka row kabhi nahi lagta.
- Delivery row delete ho to quote vehicle ke **purane** values par wapas (`pricingSource: "vehicle"`).
- Taxi / "Both" wale Set Price rows goods fare ko kabhi nahi chhute.
- Commission aur payment methods bhi usi zone row se aate hain jisse fare bana.

---

## 4. Driver app

Koi change nahi. Ride payload me `fare`, `goodsAdvance`, `remainingFare` pehle jaise aate hain.
Driver ko "Collect ₹`remainingFare`" dikhao (`fare` nahi).

---

## 5. QA checklist

- [ ] Quote ka `total` screen par dikhne wale fare ke barabar hai (booking ke baad ride ka `fare` bhi wahi).
- [ ] Admin Set Price edit kare → app me naya quote lene par naya fare.
- [ ] Alag zone ke pickup par us zone ka rate, zone ke bahar All Zones ka.
- [ ] `priced: false` wali vehicle book nahi ho sakti.
- [ ] Booking ke baad `pending` → payment screen aata hai; wallet aur Razorpay dono se pay hone par hi searching shuru.
- [ ] Insufficient wallet → `400`, Razorpay se pay karne ka option bacha rahe.
- [ ] Pay kiye bina back → pending booking cancel ya dobara pay ho sakti hai.
- [ ] Free ride / subscription booking me payment screen nahi aati.
