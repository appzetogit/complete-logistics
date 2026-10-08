# Selfies, uploads, free rides, cancel preview, subscriptions – Backend + Flutter notes

Part 2 of the checklist: C3, C8, C9, C10, C11, C12, C13 (part 1 – dispatch – is in `DISPATCH_RELIABILITY.md`).

---

## C3 – search radius near a zone edge
`matchDrivers` no longer caps the radius to the pickup's distance from the zone border. A pickup 300 m from the edge searched
only 300 m on every attempt. The radius now grows normally (and the cross-zone fallback uses the full radius). Drivers are still
matched only inside the zone (per-driver zone check is unchanged). `zoneBoundaryCapMeters` is still returned, for information.

## C8 – uploads
- `POST /common/upload/image` now **requires login** (user, driver, admin, owner, pooling/bus driver, service center; pending
  drivers allowed so onboarding documents work). Anonymous → `401`.
- Only real images are stored: `data:image/(png|jpeg|jpg|webp|gif|heic|heif);base64,…`. html/svg/other → `400`
  (files are served from `/uploads`, so scripts must never be stored).
- **One upload folder:** both stores (`utils/cloudinaryUpload.js` and `utils/localImageStore.js`) and the `/uploads` static route
  now use `UPLOAD_DIR` (or `UPLOAD_PATH`, default `<Backend>/uploads`). Point nginx `/uploads/` at the same folder.
  Before, the two stores defaulted to different folders.
- The response URL is always **absolute**: `PUBLIC_BACKEND_URL` if set, else the request's own origin
  (`x-forwarded-proto` + host). Set `PUBLIC_BACKEND_URL=https://<domain>` anyway.
- Not done (was "optional"): server-side blocking of `arrived/started` until the accept selfie exists.

## C9 – accept selfie flag (normal, scheduled and bid rides)
- Driver room event `rideAccepted` now has `acceptSelfieRequired: true|false` – sent for **normal, scheduled and bid** accepts
  (they all end in the same notification). Open the selfie screen when it is `true`.
- Driver ride payloads (`GET /rides/active/me`, `GET /rides/:id`, `ride:state` to the driver, deliveries) carry
  `acceptSelfieRequired`: true while the ride is `accepted`/`ongoing` and the selfie is missing. Riders never get this field.
- `GET /rides/active/me` for a driver now also returns an **accepted future-scheduled ride that still has no accept selfie**
  (before, future scheduled rides were never "active", so the selfie screen could not open). After the selfie is uploaded it is
  hidden again as before.

## C10 – driver selfie at goods pickup and delivery
- `PATCH /rides/:id/status` and socket `ride:status:update` accept an optional **`selfieImageUrl`** on `goods_loaded` and
  `goods_delivered` (next to `proofImageUrl`). Stored as `ride.parcel.pickupSelfie` / `ride.parcel.dropSelfie`
  `{ imageUrl, capturedAt }`.
- Admin setting **`goods_selfie_required`** (`PATCH /admin/general-settings/transport_ride`, `"1"`/`"0"`, default `"0"`).
  When on, both steps return `400 "A selfie of the driver is required for this step"` without it. Turn it on once the driver app ships.
- Hidden from riders in every payload (like `acceptSelfie`); the driver sees their own; the admin deliveries list has
  `pickupSelfieUrl`, `pickupSelfieAt`, `dropSelfieUrl`, `dropSelfieAt`.
- The goods photos (`pickupProof` / `dropProof`) are unchanged and still visible to the rider.

## C11 – free rides
- Code already existed; it is **off by default** and I did not switch it on (that is your production database).
  To turn it on: `PATCH /admin/general-settings/free_rides` `{ "enabled": "1", "limit": "3", "max_fare": "500" }`.
- `GET /users/me` → `freeRides: { enabled, limit, used, left, maxFare }` (**`maxFare` is new**; `0` = no cap). A ride whose fare is
  above `maxFare` is **not** free (kept as-is; the client still has to decide "fully free / first ₹500 free / not free" – current
  behaviour is "not free"). Bidding rides are never free (unchanged).
- **Goods quote** (`POST /deliveries/quote`) now knows about cover: `coveredBy: "free_ride" | "subscription" | null`,
  `freeRide: { covered }`, `subscriptionCovered`. When covered, `advanceAmount`, `advancePercent`, `remainingAmount` are `0` and
  `advanceOptions` is `[]` – matching what the booking really does (it waives the advance). Show "FREE" from this.
- No admin screen for `free_rides` yet (API only).

## C12 – cancel preview
`GET /rides/:rideId/cancel-preview` (rider token) →
```json
{ "success": true, "data": {
  "rideId": "…", "fee": 25, "feeGoesTo": "admin" | "driver" | null,
  "walletCoversFee": true, "advanceForfeited": false, "advanceAmount": 0, "advanceRefundable": false } }
```
- `fee` = the Set Price user cancellation fee that `PATCH /rides/:id/cancel` really charges from the rider's wallet (tested equal).
  With too little wallet balance the fee cannot be taken: `walletCoversFee: false`.
- `advanceForfeited: true` + `advanceAmount` when a goods advance has been paid (user cancel never refunds it).
- `404` for someone else's ride, `409` if already completed/cancelled. Nothing is changed by the call.
- Use it in the cancel confirmation dialog: "Cancellation fee ₹25" and/or "₹X advance will not be refunded".

## C13 – subscriptions
1. **Razorpay purchase:** `POST /users/subscriptions/razorpay/order` `{ planId }` → `{ keyId, orderId, amount, currency, plan }`;
   after checkout `POST /users/subscriptions/razorpay/verify` `{ razorpay_order_id, razorpay_payment_id, razorpay_signature }`
   → `201 { subscription, alreadyPurchased:false }` (`200 alreadyPurchased:true` if the same payment is sent again – one payment
   never makes two subscriptions). Checked: signature, order notes (`purpose: user_subscription`, same rider), amount == plan price.
   Wallet purchase (`POST /users/subscriptions/purchase`) is unchanged.
2. **Admin plan management:** `PATCH /admin/user-subscriptions/plans/:id` (edit; `{ "active": false|true }` deactivates /
   reactivates) and `DELETE /admin/user-subscriptions/plans/:id` (`409` if customers bought it – deactivate instead).
   Editing never changes subscriptions already bought. Create/list endpoints unchanged.
3. **Several vehicle types per plan:** create/edit accept `vehicle_type_ids: [...]` (old single `vehicle_type_id` still works;
   the first id is kept in `vehicle_type_id`). Plans and subscriptions return `vehicle_type_ids`. Matching uses any of them;
   older subscriptions (single id) keep working.
4. **Bidding rides are never covered** (their fare can rise after booking).
5. **Limited plans:** a booked-but-not-completed ride that holds a credit counts against the limit when the next booking is
   priced. (A new booking by the same rider replaces their open ride, so this mostly protects against concurrent bookings.)
6. **Ride payload:** `subscriptionUsage: { covered: true, planId, planName, subscriptionId, vehicleTypeId, benefitType, … }`
   was already sent on every covered ride (ride, active ride, socket state) – covered rides also get `paymentMethod: "online"`.
   Skip the payment sheet when `subscriptionUsage.covered` is true.

---

## Flutter checklist
- [ ] Driver: open the accept-selfie screen on `rideAccepted.acceptSelfieRequired` / ride `acceptSelfieRequired` (also after restart via `GET /rides/active/me`, including future scheduled rides).
- [ ] Driver: send `selfieImageUrl` with `goods_loaded` and `goods_delivered` (upload with `/common/upload/image`, which now needs the login token).
- [ ] All apps: add the `Authorization` header to `/common/upload/image`; handle `400` for non-images.
- [ ] User: cancel dialog uses `GET /rides/:id/cancel-preview`.
- [ ] User: "FREE" from `freeRide.covered` / quote `coveredBy`; `freeRides.maxFare` for the hint; no advance UI when `coveredBy` is set.
- [ ] User: subscription purchase by Razorpay (order → checkout → verify).

## Ops
- nginx: serve `/uploads/` from `UPLOAD_DIR`; `client_max_body_size 25m`.
- `.env`: `UPLOAD_DIR`, `PUBLIC_BACKEND_URL`.
- Integration tests: `npm run test:integration` now runs 4 files at a time (`--test-concurrency=4`) – with more, a laptop MongoDB timed out.
