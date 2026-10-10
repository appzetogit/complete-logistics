# Subscriptions (vehicle-first) – Flutter Developer Notes (User app)

Backend ab live hai (`logistics/main` `02c0b34`). Subscription page **vehicle first** chal sakta hai: har vehicle ka card
(photo ke saath) -> tap -> us vehicle ke passes -> wallet ya Razorpay se kharido.
Saare naye fields **additive** hain – purane keys wahi hain. `GET /users/vehicle-types` se join karne ki zarurat ab nahi.

---

## 1. Plans list – `GET /api/v1/users/subscriptions/plans`

Response `data.results[]`, har plan:

```json
{
  "id": "6650…",
  "name": "Monthly Bike Pass",
  "description": "Unlimited bike rides for 30 days",
  "amount": 599,
  "duration": 30,
  "transport_type": "taxi",
  "vehicle_type_id": "64a1…",
  "vehicle_type": { "id": "64a1…", "name": "Bike", "image": "https://…/bike.webp", "icon_types": "bike" },
  "vehicle_type_ids": ["64a1…", "64a2…"],
  "vehicle_types": [
    { "id": "64a1…", "name": "Bike",   "image": "https://…/bike.webp",   "icon_types": "bike", "transport_type": "taxi" },
    { "id": "64a2…", "name": "Scooty", "image": "",                       "icon_types": "bike", "transport_type": "taxi" }
  ],
  "benefit_type": "unlimited",
  "ride_limit": 0,
  "how_it_works": "…",
  "badge": "Most popular",
  "benefits": ["Covers the full fare"],
  "active": true
}
```

| Field | Use |
|---|---|
| `vehicle_types[]` | **Vehicle cards isi se banao.** Ek plan kai vehicles cover kar sakta hai -> wo plan har us vehicle ke card me dikhe. Switched-off vehicle (admin ne band kiya) is list me **nahi aata**. |
| `vehicle_types[].image` | Photo (https URL). Khaali ho sakta hai -> `icon_types` (`bike`/`auto`/`car`/`truck`…) se fallback icon. `data:` URI bhi aa sakta hai (purane vehicles) – handle karo. |
| `vehicle_type_ids` | Sirf ids (switched-off vehicle ki id bhi isme reh sakti hai) – cards ke liye `vehicle_types` use karo. |
| `transport_type` | `taxi` -> "Passenger" tab, `delivery` -> "Goods" tab. Sirf ek type ke plans hon to tabs chhupao. |
| `badge` | Khaali na ho to plan card par ribbon; badged plan pre-select karo. |
| `benefits` | Max 4, tick list; khaali ho to section chhupao. Admin set karta hai – app me koi claim hardcode mat karo. |
| `benefit_type` / `ride_limit` | `unlimited` -> "Unlimited rides", `limited` -> "{ride_limit} rides". |
| `duration` | Din. "Save N%" app khud nikalta hai (same vehicle ke plans ka per-day price). |

Purana response (bina `vehicle_types`) aaye to purana fallback rakhna theek hai, par backend ab hamesha bhejta hai.

## 2. Mere passes – `GET /api/v1/users/subscriptions/me`

`data: { activeCount, hasUnlimitedPlan, availableRideCredits, activePlans[], history[] }`. Har pass me ab:
- `vehicle_types[]` (same shape) – "Valid on Bike, Scooty" dikhane ke liye.
- `vehicle_type` me `image`, `icon_types`.
- Baaki: `status` (`active`/`expired`/`consumed`/`cancelled`), `active`, `rides_used`, `rides_remaining` (`null` = unlimited),
  `expiresAt`, `purchaseSource` (`wallet`/`razorpay`/`admin`).

**Active badge:** `activePlans` ke har pass ke `vehicle_types[].id` -> jin vehicle cards ki id match ho un par "Active".

## 3. Kharidna

**Wallet:** `POST /users/subscriptions/purchase` `{ "planId": "…" }`
- `201` -> `{ subscription, wallet: { balance, refundWallet } }` (subscription me `vehicle_types` bhi).
- `400 "Insufficient wallet balance"` -> message dikhao aur Razorpay option do.
- Ab ye **atomic** hai: double-tap / slow network par bhi ek hi pass, ek hi debit. Phir bhi button ko request ke dauran disable rakho.

**Razorpay:**
1. `POST /users/subscriptions/razorpay/order` `{ planId }` -> `{ keyId, orderId, amount, currency, plan }` (`plan` me `vehicle_types`).
2. Checkout (`keyId`, `orderId`, `amount` – app me key hardcode mat karo).
3. `POST /users/subscriptions/razorpay/verify` `{ razorpay_order_id, razorpay_payment_id, razorpay_signature }`
   -> `201 { subscription, alreadyPurchased: false }`, same payment dobara -> `200 { alreadyPurchased: true }`.
   **Retry safe hai** – checkout success ke baad verify fail ho to 3 baar retry + "Retry confirmation" button; dobara charge mat karo.
   Error: `400` (signature/amount/order galat), `404` (plan band ho gaya).

Kharidne ke baad `GET /users/subscriptions/me` refresh karo.

## 4. Ride par asar (offers ke neeche dikhane layak)

- Covered ride: ride payload me `subscriptionUsage: { covered: true, planName, … }` aur `paymentMethod: "online"` -> payment sheet skip.
- **Bidding rides kabhi cover nahi hoti** – ye line offers ke neeche dikhao.
- Goods quote (`POST /deliveries/quote`) me active pass ho to `coveredBy: "subscription"` aur advance `0`.
- Limited pass: booked-par-complete-na-hui ride bhi ek ride credit rokti hai.
- **Cancellation fee subscription par maaf nahi hai** – covered ride cancel karne par bhi normal fee lagti hai (cancel-preview se dikhao).
  Isliye app me "Free cancellation" jaisa kuch mat likho.

## 5. QA checklist

- [ ] 2 vehicles wala plan dono vehicle cards me dikhta hai; vehicle ki photo, photo na ho to icon.
- [ ] Admin vehicle band kare -> uska card / us plan me wo vehicle nahi dikhta.
- [ ] Badge wala plan ribbon ke saath aur pre-selected; benefits khaali ho to list nahi.
- [ ] Passenger / Goods tabs sirf tab jab dono type ke plans hon.
- [ ] Wallet se kharido -> balance ghata, pass "Active", sahi vehicle cards par Active badge.
- [ ] Wallet me paisa kam -> message + Razorpay option.
- [ ] Razorpay: success -> pass; verify network fail -> retry se same pass, double charge nahi.
- [ ] Active pass par "Valid on Bike, Scooty".
- [ ] Covered ride par payment sheet skip; bidding ride covered nahi.
