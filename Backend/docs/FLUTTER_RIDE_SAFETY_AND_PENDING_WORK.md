# Rentol – Flutter guide: ride safety checks and the 13 Oct pending list

The backend changes for the "Rentol backend — pending work" list (13 Oct 2026), and what each app must do.
Items 13, 14, 16, 17 and 19 were already shipped. See `FLUTTER_DRIVER_PUSH_PERFORMANCE_SUPPORT.md`.

- Base URL: `https://<server>/api/v1`
- Every error body: `{ "success": false, "message": "...", "code": "MACHINE_CODE", "details": { ... } }`.
  **Branch on `code`**, and show `message`. Socket errors (`errorMessage`) now carry the same `code` and `details`.

> ⚠️ **Driver app rollout (#1, #2).** The current driver app already sends `otp` on "Start trip" and streams its
> location, which the radius check uses when `coordinates` is not sent. If a build misbehaves after the deploy, the
> admin can switch either check off in **Transport Ride Settings** without a redeploy:
> *Start Trip Needs Rider OTP* and *When the Driver's Location Is Unknown*. Both are on by default.

---

## 0. Summary

| # | Change | Driver app | User app |
|---|---|---|---|
| 1 | Pickup / drop radius checked by the server | send `coordinates` with status updates; handle `OUT_OF_ARRIVAL_RADIUS` | – |
| 2 | Start-trip OTP verified | send `otp` with `started`; handle `INVALID_OTP` / `OTP_LOCKED` | show the OTP to the rider (as now) |
| 3 | Steps can't be skipped | follow the exact order; handle `INVALID_STATUS_TRANSITION` | – |
| 4 | Vehicle images are URLs (no base64) | – | vehicle list loads fast; just use the URLs |
| 5 | The OTP is no longer sent to the driver | **remove any code that reads `otp` from ride payloads** | – |
| 6 | Earnings/commission no longer sent to the rider | – | don't read `driverEarnings` / `commissionAmount` |
| 7 | `GET /rides/available-drivers/summary` | – | one call for all vehicle types; markers only |
| 8 | Waiting charge billed | show `waitingMinutes` / `waitingCharge` | show them on the receipt |
| 9 | `actualDistanceMeters` | show "Distance" (actual) on the trip summary | receipt |
| 10 | Active time = real online time | nothing (numbers become correct) | – |
| 11 | Fast accept + `rideAcceptFailed` | use the ack / `rideAcceptFailed` | – |
| 12 | Goods trips store distance/duration | – | send the route distance/duration in quote **and** booking |
| 15 | `/users/banners`, `/users/vehicle-map-icons`, `/users/logout` | `vehicle-map-icons` | all three |
| 18 | Driver vehicle type/icon follow the catalog | – | – (admin data) |

---

## 1. Pickup / drop radius (Driver app)

The server now refuses these steps when the driver is too far away:

| step | must be near | default radius |
|---|---|---|
| `arriving` ("arrived at pickup"), `goods_loaded` | pickup | 200 m (admin: *Arrival Radius at Pickup*) |
| `arrived` ("arrived at drop"), `goods_delivered` | drop | 300 m (admin: *Arrival Radius at Drop*) |

`completed` is not checked again, because the driver was already verified at the drop one step earlier. Moving off while
collecting cash doesn't block completion.

**The rider gets off early (passenger rides only):** add an "End trip here" button. It sends `arrived` with
`endTripEarly: true` (plus `coordinates`). The radius is skipped, and the ride gets
`earlyDrop: { at, distanceFromDropMeters }`, which both apps can show on the receipt ("Ended 2.1 km before the drop").
Goods must still reach the drop.

```dart
socket.emit('ride:status:update', { 'rideId': id, 'status': 'arrived', 'endTripEarly': true, 'coordinates': [lng, lat] });
```

The admin can change both under **Transport Ride Settings**; `0` turns a check off. Keep the app's own button lock,
but the server decides.

**Send the driver's position with every status update:**

```dart
// REST
await dio.patch('/rides/$rideId/status', data: {
  'status': 'arriving',
  'coordinates': [position.longitude, position.latitude],   // [lng, lat]
});

// or socket
socket.emit('ride:status:update', {
  'rideId': rideId,
  'status': 'arriving',
  'coordinates': [position.longitude, position.latitude],
});
```

If `coordinates` is missing, the server uses the last GPS point from `ride:driver-location:update`, else the driver's
live `driver:location` position, each only if under 2 minutes old. With no position at all it refuses with
`LOCATION_REQUIRED`, unless the admin switched *When the Driver's Location Is Unknown* to "Allow them".

**Wait for the server's answer before moving on.** Status updates sent over the socket can now be refused (radius, OTP,
order). Don't show "Trip started" or go to the trip-complete screen until `ride:status:updated` / `ride:state` shows the
new status. On `errorMessage` with a `code`, stay on the step and show the message. The REST `PATCH` returns the result
directly.

**Errors (HTTP 409):**

```json
{ "code": "OUT_OF_ARRIVAL_RADIUS", "message": "You are 3120 m from the pickup. Move within 200 m to continue.",
  "details": { "target": "pickup", "distanceMeters": 3120, "radiusMeters": 200 } }
```
```json
{ "code": "LOCATION_REQUIRED", "message": "Your current location is needed for this step. Turn on GPS and try again." }
```

Show the message, and for `OUT_OF_ARRIVAL_RADIUS` you can show "3.1 km away" from `details.distanceMeters`.

## 2. Start-trip OTP (Driver app)

`started` must carry the 4-digit OTP the rider reads out:

```dart
await dio.patch('/rides/$rideId/status', data: { 'status': 'started', 'otp': otpController.text.trim() });
```

| HTTP | `code` | meaning | `details` |
|---|---|---|---|
| 400 | `OTP_REQUIRED` | no OTP sent | |
| 400 | `INVALID_OTP` | wrong OTP | `attemptsLeft` (4, 3, 2, 1) |
| 429 | `OTP_LOCKED` | 5 wrong tries: locked for 10 min | `retryAfterSeconds` |

Show "Wrong OTP, N attempts left". On `OTP_LOCKED`, disable the button and show the wait time. The right OTP works
again after the lock ends. Every try counts, right or wrong, so sending many guesses at once still allows at most 5.

## 3. Strict step order (Driver app)

```
ride:   accepted → arriving → started → arrived → completed
parcel: accepted → arriving → goods_loaded → started → arrived → goods_delivered → completed
```

- No skipping. For example `accepted → completed` and `started → completed` are refused with 409 `INVALID_STATUS_TRANSITION`,
  and `details.allowedFrom` lists the steps it may follow.
- Repeating the current step is accepted (safe to retry), except `completed` (409 on a second try, as before).
- `arriving → accepted` still undoes a mistaken "arrived at pickup".
- Meaning: `arriving` = **at pickup**, `arrived` = **at drop**.

## 4. Vehicle images (User app)

`GET /users/vehicle-types` now returns image URLs only (no `data:` base64). Old base64 images are converted to files
automatically the first time the list is loaded. The response is cached for 60 s (`Cache-Control`). `/users/me` and
subscription history no longer carry base64 images either. The app needs no changes and just loads much faster.
Use `CachedNetworkImage` for the URLs.

## 5. The OTP is not sent to the driver anymore (Driver app)

The driver gets the OTP from the rider and nowhere else. It is removed from the driver's `ride:state`, `rideAccepted`,
`GET /rides/:id`, active ride, history and the Firebase mirror (`taxiRides/<id>`). **If the driver app pre-filled or
checked the OTP from any payload, remove that.** The OTP screen must ask the driver to type it.

The rider still gets `otp` in every rider payload, as before.

## 6. The rider no longer gets driver earnings (User app)

`driverEarnings`, `commissionAmount` and the commission settings inside `pricingSnapshot` are removed from everything
the rider receives. `pricingSnapshot` for the rider now only has `waiting_charge`, `free_waiting_before` and
`free_waiting_after`. The driver keeps all of them.

Under the hood, `ride:state` is now sent to each side in its own view, to the user's and the driver's personal rooms.
The event name and shape are unchanged.

## 7. Nearby drivers (User app)

**New: one call for every vehicle type** (login required):

```
GET /rides/available-drivers/summary?lat=22.7196&lng=75.8577
    [&vehicleTypeIds=<id>,<id>]   // optional: only these types
    [&service_location_id=<id>]   // optional
    [&transport_type=taxi]        // optional, when vehicleTypeIds is not given
```
```json
{ "success": true, "data": { "byVehicleType": {
  "66a0…": { "totalDrivers": 2, "closestDriverDistanceMeters": 71, "closestDriverEtaMinutes": 1,
             "drivers": [ { "markerId": "3f9c0a1b2c3d4e5f", "id": "3f9c0a1b2c3d4e5f", "vehicleTypeId": "66a0…",
                            "vehicleIconType": "car", "location": { "type": "Point", "coordinates": [75.8578, 22.7197] },
                            "heading": null, "distanceMeters": 71, "etaMinutes": 1 } ] } } } }
```

- Replace the per-type loop with this call, refreshed every 12–15 s.
- `markerId` is stable for the same driver, so use it as the map marker key to animate movement.
- `heading` is the driver's direction in degrees, used to rotate the car icon. It is `null` until the driver app sends it.
  **Driver app:** add `heading` (from the GPS fix, 0–360) to the `locationUpdate` socket event:
  `{ 'coordinates': [lng, lat], 'heading': position.heading }`.
- Limit: 30 calls a minute per rider (the app needs about 5).
- Drivers' names, plates, vehicle details and ratings are **no longer** returned, here or on the old
  `GET /rides/available-drivers` (which still works with the same shape, minus those fields).

## 8. Waiting charge (both apps)

When the trip starts, any wait at the pickup beyond the free minutes is billed:

```
waitingMinutes = max(0, minutes from "arrived at pickup" to "start trip" − free_waiting_before)
waitingCharge  = waitingMinutes × waiting_charge (₹ per minute, from Set Price)
```

- Scheduled rides: waiting is counted from the scheduled pickup time, not from an early arrival.
- Goods: waiting stops when loading starts (`goods_loaded`), because loading has its own detention terms.
- It is **added to `fare`**, so payment, settlement and receipts all include it automatically.
- New fields on every ride payload: `waitingMinutes`, `waitingCharge`. Show them as a line on the receipt and the driver's
  trip summary ("Waiting 7 min · ₹14").
- Free rides and subscription-covered rides are never charged for waiting.

## 9. Actual distance (both apps)

`actualDistanceMeters` is on every ride payload: the distance really driven between "Start trip" and the drop, summed
from the GPS points the driver app streams (`ride:driver-location:update`). GPS jitter under 3 m and impossible jumps are
ignored. Today's distance in the driver's `todaySummary` now uses it when available.

- Trip summary: show `actualDistanceMeters` as "Distance"; fall back to `estimatedDistanceMeters` ("Est. distance") when it
  is 0.
- Keep streaming location during the trip, since that is what feeds it.

## 10. Active time (Driver app)

"Active today" counted from midnight for a driver whose app had been killed while online. Now an online session ends
10 minutes after the app last reported its location. Nothing to change in the app: keep streaming `driver:location` while
online.

## 11. Accept (Driver app)

The driver is answered as soon as the accept is saved. The rider is told in the background.

```dart
socket.emitWithAck('acceptRide', { 'rideId': rideId, 'selfieUrl': url }, ack: (res) {
  if (res['ok'] == true) openActiveRide(res['rideId']);           // acceptSelfieRequired is in res too
  else showToast(res['reason']);                                   // res['code'], e.g. RIDE_NOT_AVAILABLE
});
```

Without the ack, listen for the events:
- `rideAccepted` `{ rideId, room, status, liveStatus, acceptedAt, acceptSelfieRequired }`
- **`rideAcceptFailed` `{ rideId, reason, code }`** (new). `code` is one of `RIDE_NOT_AVAILABLE` (taken or cancelled),
  `NOT_ALLOWED`, `INVALID_REQUEST`, `INVALID_SELFIE_URL` or `ACCEPT_FAILED`. Close the offer card and show `reason`.
- `errorMessage` is still sent too, for older builds.

## 12. Goods trips (User app)

Send the road distance and time from the app's route (Google Directions) with **both** the quote and the booking. The server
prices from it, so the rider is charged what they were quoted:

```dart
final body = {
  'vehicleTypeId': id, 'pickup': [pLng, pLat], 'drop': [dLng, dLat],
  'estimatedDistanceMeters': route.distanceMeters,      // int
  'estimatedDurationMinutes': route.durationMinutes,    // int
};
await dio.post('/deliveries/quote', data: body);
await dio.post('/deliveries', data: { ...body, 'paymentMethod': 'cash', 'parcel': {...} });
```

- The quote returns `estimatedDistanceMeters`, `estimatedDurationMinutes` and `distanceSource` (`route` or `straight_line`).
- A distance that is impossible for the two points (shorter than the straight line, or more than about 4× it) is ignored,
  and the straight line is used.
- Without these fields the server uses the straight-line distance (as today's prices do), and the ride no longer stores 0.

## 15. New routes (User app, and the driver app for map icons)

**Banners:** `GET /users/banners` (no login)
```json
{ "success": true, "data": { "results": [
  { "id": "…", "title": "Monsoon offer", "imageUrl": "https://…/banner.png", "linkType": "deep_link",
    "deepLink": "rentol://offers", "externalLink": "", "url": "rentol://offers", "order": 1, "active": true } ] } }
```
These are the active banners from **Admin → Promotions → Banner Image**, newest first. Open `url` on tap.

**Map icons:** `GET /users/vehicle-map-icons` (no login)
```json
{ "success": true, "data": { "results": [
  { "vehicleTypeId": "…", "name": "Sedan", "transportType": "taxi", "iconType": "car",
    "mapIconUrl": "https://…/uploads/vehicles/<sha1>.png", "imageUrl": "https://…" } ] } }
```

**Logout:** `POST /users/logout` (user token)
- Clears this account's push tokens and ends every login token issued before now (on every device).
- After it, the old token gets 401 with `code: "SESSION_ENDED"`. Clear local storage and go to login.
- Call it before clearing the token locally.

## 18. Driver vehicle data (admin)

The admin driver edit and driver create now take `vehicleType` and `vehicleIconType` from the selected catalog vehicle, and
refuse an unknown vehicle type with 400. To find and fix existing bad records, the server team runs:

```bash
node scripts/reportVehicleDataIssues.js
```
```bash
node scripts/reportVehicleDataIssues.js --apply
```

The first only reports; the second aligns drivers' type and icon with their catalog vehicle. Names like "RENTOL TEXI" and
values like "gvfr" are reported only; fix them in the admin panel.

---

## QA checklist

**Driver app**
- [ ] "Arrived at pickup" from 3 km away: refused with the distance. At the pickup: works.
- [ ] Start trip with a wrong OTP: "N attempts left". 5 wrong: locked message. The right OTP after the lock: works.
- [ ] The OTP is never visible anywhere in the driver app until the rider tells it.
- [ ] Trying to complete before "arrived at drop": refused.
- [ ] Two drivers accept the same ride: the second gets the "already taken" toast immediately and the card closes.
- [ ] The trip summary shows the waiting charge (wait more than the free minutes first) and the actual distance.

**User app**
- [ ] The vehicle list loads in under 2 s on 4G.
- [ ] One `available-drivers/summary` call per refresh; markers move smoothly (stable `markerId`).
- [ ] Ride screens and receipts show no driver earnings or commission.
- [ ] Goods: quote and booking send the route distance; the fare matches the quote.
- [ ] Home banners load from `/users/banners`. Logout, then the old token is rejected and the app returns to login.
