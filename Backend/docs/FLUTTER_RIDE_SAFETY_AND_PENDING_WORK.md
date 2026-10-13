# Rentol – Flutter guide: ride safety checks and the 13 Oct pending list (detailed)

This guide is for the Flutter developers of the **driver app** (`flutterdriver`) and the **user app**
(`flutter_taxi_user`). It covers every backend change from the "Rentol backend — pending work" list (13 Oct 2026),
what each app has to change, ready-to-use Dart code, and a QA checklist.

Items 13, 14, 16, 17 and 19 were shipped earlier: see `FLUTTER_DRIVER_PUSH_PERFORMANCE_SUPPORT.md`.

**Contents**
- [Part A – Common rules (both apps)](#part-a--common-rules-both-apps)
- [Part B – Driver app](#part-b--driver-app)
  - [B1 Status flow and the strict order](#b1-status-flow-and-the-strict-order)
  - [B2 Sending a status update correctly](#b2-sending-a-status-update-correctly-wait-for-the-server)
  - [B3 Pickup / drop radius](#b3-pickup--drop-radius)
  - [B4 Start-trip OTP](#b4-start-trip-otp)
  - [B5 Rider got off early](#b5-the-rider-gets-off-early-passenger-rides)
  - [B6 Accept](#b6-accept-ack-and-rideacceptfailed)
  - [B7 Location streaming and heading](#b7-location-streaming-heading-and-active-time)
  - [B8 Trip summary: waiting, distance](#b8-trip-summary-waiting-charge-actual-distance-early-drop)
  - [B9 Things to remove](#b9-things-to-remove-from-the-driver-app)
- [Part C – User app](#part-c--user-app)
- [Part D – Reference](#part-d--reference)
- [Part E – QA checklist](#part-e--qa-checklist)

---

## Part A – Common rules (both apps)

- Base URL: `https://<server>/api/v1`, with `Authorization: Bearer <token>` header.
- **Every error** has this shape:
  ```json
  { "success": false, "message": "Human readable text", "code": "MACHINE_CODE", "details": { "...": "..." } }
  ```
  `code` and `details` are present when the server has a specific reason. **Branch on `code`, and show `message`.**
- **Socket errors** arrive as the `errorMessage` event with the same `code` and `details`:
  ```json
  { "message": "Wrong OTP. 3 attempts left.", "code": "INVALID_OTP", "details": { "code": "INVALID_OTP", "attemptsLeft": 3 } }
  ```
- Coordinates are always **`[longitude, latitude]`** (lng first).
- Status meaning, used everywhere: **`arriving` = driver is AT THE PICKUP**, **`arrived` = driver is AT THE DROP**.

A small error helper that both apps can share:

```dart
class ApiFailure {
  final int status;
  final String code;      // '' when the server sent none
  final String message;
  final Map<String, dynamic> details;
  ApiFailure(this.status, this.code, this.message, this.details);

  factory ApiFailure.fromDio(DioException e) {
    final body = (e.response?.data is Map) ? Map<String, dynamic>.from(e.response!.data) : <String, dynamic>{};
    return ApiFailure(
      e.response?.statusCode ?? 0,
      (body['code'] ?? '').toString(),
      (body['message'] ?? e.message ?? 'Something went wrong').toString(),
      (body['details'] is Map) ? Map<String, dynamic>.from(body['details']) : {},
    );
  }

  factory ApiFailure.fromSocket(dynamic data) {
    final m = (data is Map) ? Map<String, dynamic>.from(data) : <String, dynamic>{};
    return ApiFailure(
      0,
      (m['code'] ?? '').toString(),
      (m['message'] ?? 'Something went wrong').toString(),
      (m['details'] is Map) ? Map<String, dynamic>.from(m['details']) : {},
    );
  }
}
```

---

## Part B – Driver app

### B1 Status flow and the strict order

The server now enforces the order. **No step can be skipped.**

```
Passenger ride:  accepted → arriving → started → arrived → completed
Goods (parcel):  accepted → arriving → goods_loaded → started → arrived → goods_delivered → completed
```

| Button in the app | status sent | what the server checks |
|---|---|---|
| "Arrived at pickup" | `arriving` | driver within **pickup radius** (default 200 m) |
| "Goods loaded" (parcel, with photo) | `goods_loaded` | within pickup radius; `proofImageUrl` required |
| "Start trip" (after the PIN) | `started` | **OTP** must match |
| "Arrived at drop" | `arrived` | within **drop radius** (default 300 m), or `endTripEarly` (B5) |
| "Goods delivered" (parcel, with photo) | `goods_delivered` | within drop radius; `proofImageUrl` required |
| "Complete trip" | `completed` | only the order (no radius check) |
| "Undo arrived" | `accepted` | allowed only from `arriving` |

Rules:
- A wrong step gets **409 `INVALID_STATUS_TRANSITION`** with `details.currentStatus` and `details.allowedFrom`.
  Usually this means the app's state is out of date: reload the active ride (`GET /rides/active/me`) and show the right
  button.
- Sending the **current** step again is safe (a no-op), for example a retry after a network error. Exception: `completed`
  twice gets 409 (the ride is already finished).
- **Goods must go through `goods_loaded` before `started`, and `goods_delivered` before `completed`.**

### B2 Sending a status update correctly (wait for the server)

> ⚠️ **Important change for the current driver app.** Today `updateStatus()` emits `ride:status:update` and the screen
> immediately shows "Trip started" / "Arrived", and for `completed` goes straight to `/trip-complete`. The server can
> now **refuse** a step (radius, OTP, order). The UI must wait for the server's answer.

**Recommended: REST** (you get the answer directly):

```dart
Future<RideModel> updateRideStatus(
  String rideId,
  String status, {
  Position? position,          // geolocator Position
  String? otp,
  String? proofImageUrl,
  String? receivedBy,
  String? paymentMethod,
  bool endTripEarly = false,
}) async {
  try {
    final res = await dio.patch('/rides/$rideId/status', data: {
      'status': status,
      if (position != null) 'coordinates': [position.longitude, position.latitude],
      if (otp != null) 'otp': otp,
      if (proofImageUrl != null) 'proofImageUrl': proofImageUrl,
      if (receivedBy != null) 'receivedBy': receivedBy,
      if (paymentMethod != null) 'paymentMethod': paymentMethod,
      if (endTripEarly) 'endTripEarly': true,
    });
    return RideModel.fromJson(res.data['data']);   // driver view of the ride (earnings included)
  } on DioException catch (e) {
    throw ApiFailure.fromDio(e);
  }
}
```

Using it in a button:

```dart
Future<void> onArrivedAtPickup() async {
  setState(() => busy = true);
  try {
    final pos = await Geolocator.getCurrentPosition(desiredAccuracy: LocationAccuracy.high);
    final ride = await repo.updateRideStatus(rideId, 'arriving', position: pos);
    ref.read(rideProvider.notifier).setActiveRide(ride);
    SnackbarUtils.success('Marked arrived at pickup');
  } on ApiFailure catch (f) {
    SnackbarUtils.error(messageFor(f));   // see Part D for the codes
  } finally {
    if (mounted) setState(() => busy = false);
  }
}
```

**If you keep the socket** (`ride:status:update`): add `coordinates` (and `otp`, `endTripEarly`) to the payload. Show
success only when `ride:status:updated` (or `ride:state`) arrives with the new `liveStatus`. On `errorMessage` with a
`code`, stay on the step, set `busy = false` and show the message. **Do not navigate to `/trip-complete` before
`completed` is confirmed.**

### B3 Pickup / drop radius

| step | must be near | default | admin setting (Transport Ride Settings) |
|---|---|---|---|
| `arriving`, `goods_loaded` | pickup | 200 m | *Arrival Radius at Pickup in Meters* |
| `arrived`, `goods_delivered` | drop | 300 m | *Arrival Radius at Drop in Meters* |

`0` in a setting turns that check off. `completed` is **not** checked again: the driver was verified at the drop one step
earlier, so moving off while collecting cash doesn't block completion.

**Where the server gets the driver's position**, in order:
1. `coordinates` sent with the request. **Always send this**, from a fresh `getCurrentPosition()`.
2. Else the last ride GPS point from `ride:driver-location:update`, if under 2 minutes old.
3. Else the driver's live location from `locationUpdate` / the ride heartbeat, if under 2 minutes old.
4. Else **409 `LOCATION_REQUIRED`**, unless the admin set *When the Driver's Location Is Unknown* to "Allow them".

**Errors:**

```json
{ "code": "OUT_OF_ARRIVAL_RADIUS",
  "message": "You are 3120 m from the pickup. Move within 200 m to continue.",
  "details": { "code": "OUT_OF_ARRIVAL_RADIUS", "target": "pickup", "distanceMeters": 3120, "radiusMeters": 200 } }
```
```json
{ "code": "LOCATION_REQUIRED", "message": "Your current location is needed for this step. Turn on GPS and try again." }
```

Suggested UI:
- `OUT_OF_ARRIVAL_RADIUS`: "You are 3.1 km from the pickup. Move closer." Use `details.distanceMeters` / 1000 with one
  decimal. Keep the button.
- `LOCATION_REQUIRED`: open a "Turn on location" prompt (`Geolocator.openLocationSettings()`).
- Keep the app's own button lock (200 m / 300 m), but the **server decides**. Read the radius from the error's
  `details.radiusMeters` if you want to show it.

### B4 Start-trip OTP

The driver **types** the 4-digit PIN the rider shows. The app no longer receives the OTP (see B9).

```dart
Future<void> onStartTrip() async {
  final pin = otpController.text.trim();
  if (pin.length != 4) return SnackbarUtils.error('Enter the 4-digit PIN');
  setState(() => busy = true);
  try {
    final ride = await repo.updateRideStatus(rideId, 'started', otp: pin);
    ref.read(rideProvider.notifier).setActiveRide(ride);
    otpController.clear();
    SnackbarUtils.success('Trip started');
  } on ApiFailure catch (f) {
    switch (f.code) {
      case 'INVALID_OTP':
        otpError = 'Wrong PIN. ${f.details['attemptsLeft']} attempt(s) left.';
        break;
      case 'OTP_LOCKED':
        final secs = (f.details['retryAfterSeconds'] ?? 600) as num;
        otpLockedUntil = DateTime.now().add(Duration(seconds: secs.toInt()));
        otpError = f.message;   // "Too many wrong OTPs. Try again in 10 min."
        break;
      case 'OTP_REQUIRED':
        otpError = 'Enter the PIN the passenger shows.';
        break;
      default:
        otpError = f.message;
    }
    setState(() {});
  } finally {
    if (mounted) setState(() => busy = false);
  }
}
```

| HTTP | `code` | meaning | `details` |
|---|---|---|---|
| 400 | `OTP_REQUIRED` | no PIN sent | – |
| 400 | `INVALID_OTP` | wrong PIN | `attemptsLeft`: 4, 3, 2, 1 |
| 429 | `OTP_LOCKED` | 5 tries used: start is locked for 10 min | `retryAfterSeconds`, `attemptsLeft: 0` |

- **Every try counts, right or wrong.** At most 5 tries per 10 minutes, even if requests are sent in parallel.
- While locked, disable the Start button and show a countdown from `retryAfterSeconds`. After the lock the counting
  starts over.
- The admin can turn the OTP requirement off (*Start Trip Needs Rider OTP*), for a rollout problem only.

### B5 The rider gets off early (passenger rides)

If the rider wants to get off before the booked drop, "Arrived at drop" would be refused (outside 300 m). Add an
**"End trip here"** action (for example in the trip menu, with a confirm dialog):

```dart
final ride = await repo.updateRideStatus(rideId, 'arrived', position: pos, endTripEarly: true);
// then "Complete trip" as usual
```

- The radius is skipped, and the ride gets `earlyDrop: { at, distanceFromDropMeters }`. Both apps can show it
  ("Ended 2.1 km before the drop").
- **Not for goods.** Parcels must reach the drop, and `endTripEarly` is ignored for them.
- The fare is not changed automatically.

### B6 Accept (ack and `rideAcceptFailed`)

The server now answers **as soon as the accept is saved**. The rider is notified in the background, so the accept no
longer lags. Use the **ack callback**:

```dart
void acceptRide(String rideId, {String? selfieUrl}) {
  socket.emitWithAck('acceptRide', {
    'rideId': rideId,
    if (selfieUrl != null) 'selfieUrl': selfieUrl,
  }, ack: (res) {
    final m = Map<String, dynamic>.from(res as Map);
    if (m['ok'] == true) {
      stopRingtone();
      openActiveRide(m['rideId'], selfieRequired: m['acceptSelfieRequired'] == true);
    } else {
      stopRingtone();
      closeOfferCard();
      SnackbarUtils.error(m['reason'] ?? 'This ride is no longer available');
    }
  });
}
```

Ack on success: `{ ok: true, rideId, room, status, liveStatus, acceptedAt, acceptSelfieRequired }`.
Ack on failure: `{ ok: false, rideId, reason, code }`.

The events are still sent too (for code that listens instead of using the ack):
- `rideAccepted`: `{ rideId, room, status, liveStatus, acceptedAt, acceptSelfieRequired }`
- **`rideAcceptFailed` (new)**: `{ rideId, reason, code }`
- `errorMessage` (older builds)

| `code` | meaning | UI |
|---|---|---|
| `RIDE_NOT_AVAILABLE` | another driver took it, the rider cancelled, or the offer expired | close the card, toast "Ride no longer available" |
| `NOT_ALLOWED` | blocked (cancel limit, wallet, not this driver's offer) | show `reason` |
| `INVALID_REQUEST` / `INVALID_SELFIE_URL` | bad input (selfie must be an `https://` URL) | show `reason` |
| `ACCEPT_FAILED` | server error | show `reason`, allow retry |

The server also no longer drops events sent right after the socket connects (for example accepting straight from a
tapped push).

### B7 Location streaming, heading and active time

| when | event | payload |
|---|---|---|
| Online, **not** on a ride | `locationUpdate` | `{ coordinates: [lng, lat], heading?: 0-360 }` |
| On a ride | `ride:driver-location:update` | `{ rideId, coordinates: [lng, lat], heading?, speed? }` |

- **Add `heading`** (from the GPS fix, `position.heading`) to `locationUpdate`. Riders' maps rotate the car icon with it.
- Keep streaming **every few seconds** in both states. The stream now feeds:
  - the **radius check** (B3), as the fallback when `coordinates` isn't sent;
  - the **actual distance** of the trip (B8);
  - **active time**. An online session counts only while the app reports. 10 minutes after the last update it stops
    counting, so a killed app no longer shows "active since midnight". Nothing to change in the app.

```dart
void sendLocationUpdate(double lat, double lng, {double? heading}) {
  _socket?.emit('locationUpdate', {
    'coordinates': [lng, lat],
    if (heading != null && heading >= 0) 'heading': heading,
  });
}
```

### B8 Trip summary: waiting charge, actual distance, early drop

New fields on **every ride payload** (REST responses, `ride:state`, history):

| field | type | meaning |
|---|---|---|
| `waitingMinutes` | int | billed waiting minutes (after the free minutes) |
| `waitingCharge` | number ₹ | `waitingMinutes × waiting_charge`, **already included in `fare`** |
| `actualDistanceMeters` | int | distance really driven from "Start trip" to the drop (0 if no GPS trail) |
| `earlyDrop` | object or null | `{ at, distanceFromDropMeters }` when the trip ended early (B5) |

**Waiting charge rules** (for display; the server calculates it when the trip starts):
- From "arrived at pickup" (`arrivedAt`), or from the **scheduled time** if the driver arrived early for a scheduled ride,
  until "Start trip". For goods it stops at "Goods loaded".
- Minus `pricingSnapshot.free_waiting_before` free minutes, times `pricingSnapshot.waiting_charge` ₹ per minute.
- Never on free rides or subscription-covered rides.

The waiting clock on the OTP screen can use `pricingSnapshot.free_waiting_before` and `waiting_charge` from the driver
view, but **show the server's `waitingCharge` after start**.

Trip summary example:
```dart
final distance = ride.actualDistanceMeters > 0
    ? 'Distance ${(ride.actualDistanceMeters / 1000).toStringAsFixed(1)} km'
    : 'Est. distance ${(ride.estimatedDistanceMeters / 1000).toStringAsFixed(1)} km';
if (ride.waitingCharge > 0) lines.add('Waiting ${ride.waitingMinutes} min · ₹${ride.waitingCharge}');
if (ride.earlyDrop != null) lines.add('Ended ${(ride.earlyDrop!.distanceFromDropMeters / 1000).toStringAsFixed(1)} km before the drop');
```

`todaySummary.distanceMeters` (driver profile) now adds the actual distance when available.

### B9 Things to remove from the driver app

- **Any use of `otp` from a ride payload.** The driver never receives it now: not in `ride:state`, `rideAccepted`,
  `GET /rides/:id`, the active ride, history or the Firebase node `taxiRides/<id>`. If the app pre-filled, displayed or
  locally compared the PIN, remove that. The server checks the PIN.
- The success snackbar / navigation that runs **before** the server confirms a status change (B2).
- Reading other drivers' names or plates from `available-drivers` (not sent any more).

---

## Part C – User app

### C1 Vehicle list is fast now (no change needed)

`GET /users/vehicle-types` returned about 41 MB because of base64 images. It now returns **image URLs only**.
- Old base64 images are converted to files on the server automatically.
- The response has `Cache-Control: public, max-age=60`.
- `/users/me` (subscription history) and ride payloads also carry URLs only.

Use `CachedNetworkImage` for `image` / `map_icon`. An empty string means no image, so show the default icon.

### C2 OTP and earnings

- The rider **still receives `otp`** in every rider payload. Keep showing it on the "Driver arrived" screen.
- The rider **no longer receives** `driverEarnings`, `commissionAmount`, or the commission fields of `pricingSnapshot`.
  `pricingSnapshot` for the rider has only `waiting_charge`, `free_waiting_before` and `free_waiting_after`. Remove any
  code that reads the removed fields.

### C3 Nearby drivers: one call for all types

Replace the per-vehicle-type loop over `GET /rides/available-drivers` with:

```
GET /rides/available-drivers/summary?lat=22.7196&lng=75.8577
      [&vehicleTypeIds=<id>,<id>]   optional, only these types
      [&service_location_id=<id>]   optional
      [&transport_type=taxi]        optional, used when vehicleTypeIds is not given
```
Login required (user token). Limit: 30 calls a minute per rider (the app needs about 5).

```json
{ "success": true, "data": { "byVehicleType": {
  "66a0f…": {
    "totalDrivers": 2,
    "closestDriverDistanceMeters": 71,
    "closestDriverEtaMinutes": 1,
    "drivers": [
      { "markerId": "3f9c0a1b2c3d4e5f", "id": "3f9c0a1b2c3d4e5f", "vehicleTypeId": "66a0f…",
        "vehicleIconType": "car", "location": { "type": "Point", "coordinates": [75.8578, 22.7197] },
        "heading": 90, "distanceMeters": 71, "etaMinutes": 1 }
    ] } } } }
```

```dart
Future<Map<String, VehicleAvailability>> fetchAvailability(LatLng at, List<String> typeIds) async {
  final res = await dio.get('/rides/available-drivers/summary', queryParameters: {
    'lat': at.latitude, 'lng': at.longitude,
    if (typeIds.isNotEmpty) 'vehicleTypeIds': typeIds.join(','),
  });
  final by = Map<String, dynamic>.from(res.data['data']['byVehicleType']);
  return by.map((id, v) => MapEntry(id, VehicleAvailability.fromJson(Map<String, dynamic>.from(v))));
}

// markers: key = markerId (stable), rotation = heading ?? 0
Marker toMarker(Map<String, dynamic> d, BitmapDescriptor icon) {
  final c = d['location']['coordinates'] as List;
  return Marker(
    markerId: MarkerId(d['markerId']),
    position: LatLng((c[1] as num).toDouble(), (c[0] as num).toDouble()),
    rotation: (d['heading'] as num?)?.toDouble() ?? 0,
    icon: icon, flat: true, anchor: const Offset(0.5, 0.5),
  );
}
```

- Refresh every 12–15 s while the vehicle-selection screen is open. Stop when it closes.
- `markerId` is the same for the same driver between refreshes, so animate markers by key.
- Use `closestDriverEtaMinutes` for "2 min away" and `totalDrivers == 0` for "No cabs nearby".
- No names, plates, vehicle details, ratings or phone numbers are sent (here or on the old endpoint).

### C4 Goods (parcel): send the route distance

The server prices goods from the distance. Send the road distance and time from your maps route with **both the quote
and the booking**, so the price charged equals the price quoted:

```dart
final route = await directions.route(pickup, drop);           // your Google Directions call
final common = {
  'vehicleTypeId': vehicleTypeId,
  'pickup': [pickup.longitude, pickup.latitude],
  'drop':   [drop.longitude, drop.latitude],
  'estimatedDistanceMeters': route.distanceMeters,            // int
  'estimatedDurationMinutes': (route.durationSeconds / 60).round(),
};
final quote = await dio.post('/deliveries/quote', data: common);
// ...rider confirms...
await dio.post('/deliveries', data: {
  ...common,
  'paymentMethod': 'cash',
  'parcel': parcelDetails,
});
```

The quote response now also has `estimatedDistanceMeters`, `estimatedDurationMinutes` and `distanceSource` (`route`
or `straight_line`).
- A distance impossible for the two points (shorter than the straight line, or far longer than it) is ignored and the
  straight line is used (`distanceSource: straight_line`).
- Without the fields, the straight-line distance is used. The ride no longer stores 0 km / 0 min.

### C5 Ride screens and receipt

Show the new fields from B8 on the rider's receipt:
- Waiting: "Waiting 7 min · ₹14" (it is already inside `fare`, so don't add it again).
- Distance: `actualDistanceMeters` if > 0, else "Est. distance" from `estimatedDistanceMeters`.
- Early drop: "Trip ended 2.1 km before the drop" when `earlyDrop` is not null.

### C6 Home banners

`GET /users/banners` (no login, cached 60 s):

```json
{ "success": true, "data": { "results": [
  { "id": "6701…", "title": "Monsoon offer", "imageUrl": "https://…/banner.png",
    "linkType": "deep_link", "deepLink": "rentol://offers", "externalLink": "",
    "url": "rentol://offers", "order": 1, "active": true } ] } }
```

- Active banners from **Admin → Promotions → Banner Image**, newest first (`order` 1, 2, …).
- On tap, open `url`: a deep link with your router, or an `https://` link with `launchUrl`.
- An empty list means the banner carousel is hidden.

### C7 Vehicle map icons (both apps)

`GET /users/vehicle-map-icons` (no login, cached 60 s):

```json
{ "success": true, "data": { "results": [
  { "vehicleTypeId": "66a0f…", "name": "Sedan", "transportType": "taxi", "iconType": "car",
    "mapIconUrl": "https://…/uploads/vehicles/<sha1>.png", "imageUrl": "https://…/uploads/vehicles/<sha1>.png" } ] } }
```

Load once at start, cache the bitmaps by `vehicleTypeId`, and use them for the markers in C3. Fall back to a bundled icon
per `iconType` when `mapIconUrl` is empty.

### C8 Logout

`POST /users/logout` (user token), body `{}`:
- Clears this account's push tokens and **ends every login token issued before now, on every device**.
- Afterwards the old token gets **401 with `code: "SESSION_ENDED"`**, and the socket refuses it.

```dart
Future<void> logout() async {
  try { await dio.post('/users/logout'); } catch (_) { /* log out locally anyway */ }
  socket.disconnect();
  await secureStorage.deleteAll();
  router.go('/login');
}
```

Also treat any 401 with `code == 'SESSION_ENDED'` as "logged out" (clear storage, go to login).

---

## Part D – Reference

### D1 Error codes

| `code` | HTTP | where | meaning | app action |
|---|---|---|---|---|
| `OUT_OF_ARRIVAL_RADIUS` | 409 | status update | too far from pickup/drop | "You are X km away", stay on step |
| `LOCATION_REQUIRED` | 409 | status update | no position known | ask to enable GPS |
| `INVALID_STATUS_TRANSITION` | 409 | status update | step out of order | reload active ride |
| `OTP_REQUIRED` | 400 | `started` | no PIN | ask for PIN |
| `INVALID_OTP` | 400 | `started` | wrong PIN | show `attemptsLeft` |
| `OTP_LOCKED` | 429 | `started` | too many tries | countdown `retryAfterSeconds` |
| `RIDE_NOT_AVAILABLE` | – | `acceptRide` ack / `rideAcceptFailed` | ride gone | close the offer |
| `NOT_ALLOWED` / `INVALID_REQUEST` / `INVALID_SELFIE_URL` / `ACCEPT_FAILED` | – | accept | see B6 | show `reason` |
| `SESSION_ENDED` | 401 | any user API | logged out elsewhere | go to login |

### D2 Endpoints

| Method | Path | Auth | App | Notes |
|---|---|---|---|---|
| PATCH | `/rides/:rideId/status` | driver | driver | `status`, `coordinates`, `otp`, `endTripEarly`, `proofImageUrl`, … |
| socket | `ride:status:update` | driver | driver | same fields as above |
| socket | `acceptRide` (with ack) | driver | driver | B6 |
| socket | `locationUpdate` | driver | driver | `coordinates`, `heading` |
| GET | `/rides/available-drivers/summary` | user | user | C3 |
| GET | `/rides/available-drivers` | none | user | old, per type, markers only |
| POST | `/deliveries/quote`, `/deliveries` | user | user | + `estimatedDistanceMeters`, `estimatedDurationMinutes` |
| GET | `/users/banners` | none | user | C6 |
| GET | `/users/vehicle-map-icons` | none | both | C7 |
| POST | `/users/logout` | user | user | C8 |
| GET | `/users/vehicle-types` | none | user | URLs only now |

### D3 Ride payload: new and removed fields

| field | rider | driver | notes |
|---|---|---|---|
| `otp` | ✅ | ❌ removed | the driver asks the rider |
| `driverEarnings`, `commissionAmount` | ❌ removed | ✅ | |
| `pricingSnapshot.admin_commission_*` | ❌ removed | ✅ | |
| `pricingSnapshot.waiting_charge`, `free_waiting_before`, `free_waiting_after` | ✅ | ✅ | |
| `waitingMinutes`, `waitingCharge` | ✅ new | ✅ new | `waitingCharge` already inside `fare` |
| `actualDistanceMeters` | ✅ new | ✅ new | |
| `earlyDrop` | ✅ new | ✅ new | null unless ended early |
| `user.rating`, `user.ratingCount` | – | ✅ | from the rider-rating release |

### D4 Admin switches (Transport Ride Settings)

| setting | default | effect |
|---|---|---|
| Arrival Radius at Pickup in Meters | 200 | `0` = no pickup check |
| Arrival Radius at Drop in Meters | 300 | `0` = no drop check |
| Start Trip Needs Rider OTP | Yes | "No" = start without a PIN (rollout emergency only) |
| When the Driver's Location Is Unknown | Refuse | "Allow" = a step goes through when no position is known (a far position is still refused) |

---

## Part E – QA checklist

**Driver app**
- [ ] "Arrived at pickup" 3 km away: refused, "3.1 km away". At the pickup: accepted.
- [ ] GPS off on "Arrived at pickup": "Turn on location" (`LOCATION_REQUIRED`).
- [ ] Start trip with a wrong PIN: "Wrong PIN, 4 attempts left", then 3, 2, 1. The 5th wrong: locked with a countdown. The
      right PIN during the lock is still refused. After the lock: works.
- [ ] The PIN is not visible anywhere in the driver app until the rider tells it.
- [ ] "Arrived at drop" 1 km before the drop: refused. "End trip here": accepted, and the summary shows "Ended 1.0 km
      before the drop".
- [ ] Goods: no "End trip here"; goods_loaded and goods_delivered need photos, in order.
- [ ] Completing while 400 m from the drop after "Arrived at drop": accepted.
- [ ] Nothing shows "success" or navigates before the server confirms.
- [ ] Two drivers accept the same ride: the loser gets "Ride no longer available" right away, and the card closes.
- [ ] Wait 5+ min past the free minutes before starting: the summary shows the waiting charge, and the fare includes it.
- [ ] The trip summary shows the actual distance.
- [ ] Kill the app while online for 1 hour: "active today" grows by at most about 10 min for that time.

**User app**
- [ ] The vehicle list loads in under 2 s on 4G.
- [ ] One `available-drivers/summary` call per refresh; cars rotate with the heading and move smoothly.
- [ ] No driver names or plates appear for nearby cars.
- [ ] The rider still sees the PIN on "Driver arrived".
- [ ] Receipt: waiting line, actual distance, early-drop line when relevant; no driver earnings or commission anywhere.
- [ ] Goods: the quote and the booking send the route distance; the booked fare equals the quoted fare.
- [ ] Banners load from `/users/banners`; tapping opens the link.
- [ ] Logout, then the old token gets `SESSION_ENDED` and the app is on the login screen; logging in again works.
