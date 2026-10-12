# Rentol – Flutter guide: ride card push, offer-closed push, performance, support contact, rider rating

This is for the Flutter developer of the **driver app** and the **user (rider) app**. It covers the backend work for the
"Backend requirements – Rentol user & driver apps" list (items 1–5) and what each app has to change.

- Base URL: `https://<server>/api/v1`
- Auth header: `Authorization: Bearer <token>` (driver token for driver endpoints)
- Error shape for every endpoint: `{ "success": false, "message": "<human readable>" }`; use `message` in the toast.

---

## 0. Summary – what to change in which app

| # | Feature | Driver app | User app | Backend |
|---|---|---|---|---|
| 1 | Full ride card from the push | Read the new push keys in the native card | – | ✅ done |
| 2 | Close the card when the offer is gone | Handle `ride_request_closed` (already built – verify) | – | ✅ done |
| 3 | "Your Performance" numbers | Call `GET /drivers/performance` | – | ✅ done |
| 4 | Help Center contact | Call `GET /app-settings/support` | Same call | ✅ done |
| 5 | Rider rating | Show `user.rating`; add "Rate rider" after the trip | – | ✅ done |
| – | Closest driver distance | – | Use `closestDriverDistanceMeters` | already sent |
| – | Driver details in chat | – | Use the `driver` / `driverId` fields | already sent |

**Release order:** the backend is backward compatible: old app builds keep working, and they just ignore the new keys. Ship
the backend first, then the app builds.

---

## 1. Ride request push – full card data (Driver app)

### 1.1 What arrives

When a ride is offered to the driver, FCM delivers a message with `data.type == "ride_request"`.

- **Android:** a data-only message by default, with high priority and no `notification` block. The app's background
  handler must show the full-screen card itself.
- **iOS:** has an alert (`aps.alert`) as before.
- `collapseKey` / `apns-collapse-id` is `ride_<rideId>`, and the TTL is 60 s, so a stale offer is not delivered late.

> The admin setting `ride_request_push_data_only` decides between data-only (`'1'`, the default) and a message with a
> notification block (`'0'`). **The server currently has it set to `'0'`.** Once the driver build that shows the card
> from a data-only message is on the Play Store, the admin switches it to `'1'`. Handle both: with `'0'`, Android shows a
> tray notification that carries the same `data` keys.

### 1.2 Data keys

**Every value is a `String`.** A value that is unknown is `""` (never missing, never `null`).

| key | example | notes |
|---|---|---|
| `type` | `"ride_request"` | existing |
| `rideId` | `"66f1…"` | existing |
| `serviceType` | `"ride"` / `"parcel"` / `"intercity"` | existing |
| `userId` | `"66a0…"` | existing |
| `title`, `body` | `"New ride request"`, `"Pickup: MG Road"` | existing; inside `data` only when data-only |
| `pickupAddress` | `"MG Road, Indore"` | **new** |
| `dropAddress` | `"Vijay Nagar, Indore"` | **new** |
| `pickupLat`, `pickupLng` | `"22.7196"`, `"75.8577"` | **new**; parse with `double.tryParse` |
| `dropLat`, `dropLng` | `"22.7533"`, `"75.8937"` | **new** |
| `fare` | `"187.5"` | **new**; rupees |
| `paymentMethod` | `"cash"`, `"online"`, … | **new**; the same value as `paymentMethod` in the ride |
| `distanceKm` | `"4.3"` | **new**; 1 decimal, `""` if the trip distance is unknown |
| `vehicleTypeName` | `"Sedan"` | **new**; the vehicle type the rider booked |
| `acceptanceDeadlineAt` | `"2026-10-12T10:31:00.000Z"` | **new**; ISO UTC; same value as `requestExpiresAt` in the socket offer |
| `acceptTimeoutSeconds` | `"15"` | **new**; the admin's accept window (same as `expiresInSeconds` in the socket offer) |

### 1.3 Parsing (Dart)

```dart
class RideRequestPush {
  final String rideId, serviceType, pickupAddress, dropAddress, paymentMethod, vehicleTypeName;
  final double? pickupLat, pickupLng, dropLat, dropLng, fare, distanceKm;
  final DateTime? deadline;
  final int acceptTimeoutSeconds;

  RideRequestPush.fromData(Map<String, dynamic> d)
      : rideId = d['rideId'] ?? '',
        serviceType = d['serviceType'] ?? 'ride',
        pickupAddress = d['pickupAddress'] ?? '',
        dropAddress = d['dropAddress'] ?? '',
        paymentMethod = d['paymentMethod'] ?? '',
        vehicleTypeName = d['vehicleTypeName'] ?? '',
        pickupLat = double.tryParse(d['pickupLat'] ?? ''),
        pickupLng = double.tryParse(d['pickupLng'] ?? ''),
        dropLat = double.tryParse(d['dropLat'] ?? ''),
        dropLng = double.tryParse(d['dropLng'] ?? ''),
        fare = double.tryParse(d['fare'] ?? ''),
        distanceKm = double.tryParse(d['distanceKm'] ?? ''),
        deadline = DateTime.tryParse(d['acceptanceDeadlineAt'] ?? ''),
        acceptTimeoutSeconds = int.tryParse(d['acceptTimeoutSeconds'] ?? '') ?? 15;

  /// Seconds left to accept. Falls back to the full window when the deadline is missing.
  int secondsLeft() {
    if (deadline == null) return acceptTimeoutSeconds;
    final left = deadline!.difference(DateTime.now().toUtc()).inSeconds;
    return left.clamp(0, acceptTimeoutSeconds);
  }

  bool get expired => deadline != null && secondsLeft() == 0;
}
```

### 1.4 Card behaviour

- Show: pickup, drop, fare (`₹187.5`), distance (`4.3 km`; hide the chip when `distanceKm` is empty), vehicle type,
  payment method, and a countdown from `secondsLeft()`.
- **If `expired` is already true when the push arrives** (a phone that was offline), don't ring; drop it.
- The countdown is clamped to `acceptTimeoutSeconds`, so a phone with a wrong clock can't show a 10-minute countdown.
- **On Accept:** do the normal accept (socket `acceptRide`, or the existing accept API) with `rideId`. The push is only the
  wake-up; the server decides. If the accept fails ("already accepted" / "not available"), close the card and show a
  short toast.
- **On app open:** call `GET /drivers/ride-offers` to sync the open offers. It returns the same shape as the
  `rideRequest` socket event: `{ success, data: { results: [...], total } }`.

---

## 2. Offer withdrawn – `ride_request_closed` (Driver app)

### 2.1 What arrives

When an offer is no longer available to the driver, the driver gets **both**:
1. the socket event `rideRequestClosed` (as before), and
2. **new:** a silent data-only FCM push:

```json
{ "type": "ride_request_closed", "rideId": "66f1…", "reason": "accepted-by-another-driver" }
```

- Android: high priority, TTL 60 s, **same collapse key `ride_<rideId>`**. If the offer push has not been delivered yet,
  FCM replaces it with the close, so the driver never sees a dead offer.
- iOS: a background push (`content-available: 1`, priority 5) with no alert. iOS may delay or drop background pushes,
  so on iOS the socket and the deadline countdown remain the main signal.
- No `title` / `body`: **never show a notification for this message.**
- This works after a server restart too: the server takes the list of offered drivers from the database, not only from
  memory.

### 2.2 `reason` values

| reason | when |
|---|---|
| `accepted-by-another-driver` | another driver accepted (the driver who accepted gets no push) |
| `user-cancelled` | the rider cancelled |
| `user-replaced-booking` | the rider made a new booking instead |
| `search-window-expired` | one-by-one dispatch moved on to the next driver |
| `unmatched` | no driver accepted; the search ended |
| `driver-cancelled` | a driver cancelled (scheduled ride), or you cancelled your own ride |
| `deleted-by-admin` | an admin deleted the ride |

The reason is optional for the UI; you could show "Ride taken by another driver" for the first one and nothing for
the rest.

### 2.3 Handler (Dart)

The same function runs for foreground, background and killed (in `FirebaseMessaging.onBackgroundMessage`):

```dart
@pragma('vm:entry-point')
Future<void> firebaseBackgroundHandler(RemoteMessage message) async {
  final data = message.data;
  switch (data['type']) {
    case 'ride_request':
      final offer = RideRequestPush.fromData(data);
      if (offer.expired) return;
      await RideAlert.show(offer);            // full-screen card + ringtone, notification id = rideId.hashCode
      break;
    case 'ride_request_closed':
      await RideAlert.close(data['rideId'] ?? ''); // stop the ringtone, close the card, cancel(rideId.hashCode)
      break;
  }
}
```

`RideAlert.close` must be safe to call when no card is open: the same close can come from the socket and the push,
and also for offers that already timed out.

The driver app already has this handling per the requirements doc. Please verify it with the QA steps in §8.

---

## 3. Driver performance – `GET /drivers/performance` (Driver app)

**Request:** `GET /api/v1/drivers/performance` (driver token)

**Response 200**
```json
{
  "success": true,
  "data": {
    "dayStreak": 3,
    "ridesToday": 2,
    "ridesYesterday": 1,
    "tripsThisWeek": 6,
    "tripsLastWeek": 4
  }
}
```

**Rules**
- Counts **completed rides only**. Cancelled rides never count.
- Days are **IST** calendar days. Weeks start **Monday 00:00 IST**, the same as the Earnings tab.
- `dayStreak`: the number of consecutive days with at least 1 completed ride, counted back from today. If the driver
  has no ride yet today, the streak that ran up to yesterday still counts. It resets only after a full day with no
  ride. The maximum shown is 120.
- `tripsThisWeek` counts from Monday up to now. `tripsLastWeek` is the whole of last week, Monday to Sunday.
- A new driver gets all zeros.

**UI mapping** (replace the hardcoded `2`, `3`, `↗ 1`, `↗ +2`):

```dart
final p = res['data'];
final vsYesterday = p['ridesToday'] - p['ridesYesterday'];   // show ↗ +1 / ↘ -2 / "same"
final vsLastWeek  = p['tripsThisWeek'] - p['tripsLastWeek'];
streakText = '${p['dayStreak']} day streak';
```

Refresh it when the Performance tab opens and after a ride completes. Don't poll it.

**Errors:** 401 means the token is missing or expired (go to login); 403 means the token is not a driver.

---

## 4. Support contact – `GET /app-settings/support` (Driver app + User app)

**Request:** `GET /api/v1/app-settings/support`. **No login needed.** The same data is also at
`GET /api/v1/rides/app-settings/support`, next to `/rides/app-settings/tip`.

**Response 200**
```json
{
  "success": true,
  "data": {
    "support_phone": "+91 98765 43210",
    "support_email": "help@rentol.in",
    "support_whatsapp": ""
  }
}
```

- The admin sets these in **Admin panel → App Settings → Support Contact**. Until then all three are `""`.
- The server validates the values, so phones look like `+91 98765 43210` and emails are valid.
- Changes show up right away (the server cache is cleared on save).

**UI rules**
- Hide any option whose value is `""` (Call / Email / WhatsApp). If all three are empty, show "Support details coming
  soon" (or hide the section).
- **Remove the hardcoded `support@supertaxi.com` (another brand) and the dummy number from both apps.**
- Links:
  ```dart
  final digits = phone.replaceAll(RegExp(r'[^0-9+]'), '');
  launchUrl(Uri.parse('tel:$digits'));
  launchUrl(Uri.parse('mailto:$email'));
  launchUrl(Uri.parse('https://wa.me/${whatsapp.replaceAll(RegExp(r'[^0-9]'), '')}'));
  ```
- Fetch it when Help Center opens. Caching it in memory for the session is fine.

---

## 5. Rider rating (Driver app)

### 5.1 Showing the rider's rating

Every ride payload the driver receives now carries the rider's average:

- **Ride offer** (`rideRequest` socket event and `GET /drivers/ride-offers`):
  ```json
  "user": { "id": "66a0…", "name": "Asha", "phone": "9876543210", "countryCode": "+91", "rating": 4.5, "ratingCount": 12 }
  ```
- **Active ride** (`GET /rides/active/me`), **ride details** (`GET /rides/:rideId`) and **history** (`GET /rides`): the
  rider object (`user`, or the populated `userId`) has `_id`, `name`, `phone`, `rating` and `ratingCount`.

What to change:
- **Replace the hardcoded `4.8`** on the Active Ride screen with `user.rating`.
- If `ratingCount == 0` (a new rider), show **"New"** instead of `0.0`.
- `rating` is a number with 1 decimal (e.g. `4.5`). Parse it with `(json['rating'] as num?)?.toDouble() ?? 0`.

### 5.2 Rating the rider after the trip

**Request:** `PATCH /api/v1/rides/:rideId/rider-rating` (driver token)
```json
{ "rating": 4, "comment": "Polite, was on time" }
```
- `rating`: a **whole number from 1 to 5** (required).
- `comment`: optional text, up to 500 characters.

**Response 200:** the ride, now including `driverFeedback` (excerpt):
```json
{
  "success": true,
  "data": {
    "rideId": "66f1…",
    "status": "completed",
    "user": { "_id": "66a0…", "name": "Asha", "rating": 4.3, "ratingCount": 13 },
    "driverFeedback": { "rating": 4, "comment": "Polite, was on time", "submittedAt": "2026-10-12T11:07:55.154Z" }
  }
}
```

| status | meaning | app action |
|---|---|---|
| 200 | saved | close the sheet, show "Thanks" |
| 400 | rating not 1–5 / not a whole number, comment too long or not text | show `message` |
| 404 | not your ride, or the ride is not completed | close the sheet |
| 409 | already rated this ride | close the sheet silently, mark it as rated |
| 401 / 403 | token expired / not a driver | normal auth handling |

**Rules**
- The driver can rate each ride **once**. Double taps are safe (only one counts), but disable the button while the
  request is in flight anyway.
- Only **completed** rides can be rated.
- **The rider never sees** the driver's rating or comment. Only the average reaches drivers.
- No time limit: a ride that wasn't rated can be rated later from history.

### 5.3 Where to show "Rate rider"

- **Trip completed screen:** a 1–5 star sheet with an optional comment and a **Skip** button. Rating is optional and
  must never block the next ride.
- **Ride history (`GET /rides`)** for drivers: each ride has `driverFeedback`, which is `null` when not rated yet and
  `{rating, comment, submittedAt}` once rated. Show "Rate rider" on completed rides where it is `null`; otherwise show
  the stars.

---

## 6. Already sent by the server – app fixes only (User app)

- **Closest driver:** the available-drivers response (`GET /rides/available-drivers`) has `closestDriverDistanceMeters`
  and `closestDriverEtaMinutes`. Replace the hardcoded "1.7 km":
  `(meters / 1000).toStringAsFixed(1) + ' km'`, and hide it when null.
- **Driver details in chat / ride screen:** ride payloads include `driver` (or the populated `driverId`) with `name`,
  `phone`, `profileImage`, `vehicleNumber`, `vehicleType`, `vehicleColor`, `vehicleMake`, `vehicleModel` and `rating`.
  Replace the fallback "RISHI / DL01AD1234 / Bike".

---

## 7. Android setup reminders (Driver app)

- The background handler must be a top-level function with `@pragma('vm:entry-point')`, registered before `runApp`.
- Full-screen card: notification channel `ride_requests` with max importance, `fullScreenIntent`, and the
  `USE_FULL_SCREEN_INTENT` permission (Android 14 needs a user grant; check it and open settings if denied).
- **Xiaomi / Oppo / Vivo / Realme:** without **Autostart allowed** and **Battery → No restrictions**, no push reaches a
  killed app. Show a one-time setup screen that deep-links to these settings.
- After a reinstall or a logout/login, send the new FCM token to the backend as you do today. Drivers whose token is
  stale get no pushes until they log in again.

---

## 8. QA checklist

**Ride card (items 1–2)**
- [ ] Driver app killed, ride dispatched: the card shows real pickup and drop, fare, distance, vehicle and the payment
      method, with a countdown that matches the server window.
- [ ] Two drivers online (broadcast mode), driver A accepts: driver B's card closes and the ringtone stops, **with B's app
      killed**.
- [ ] Rider cancels while the card is ringing: the card closes.
- [ ] One-by-one mode: the first driver doesn't answer, so their card closes when the next driver is offered.
- [ ] A phone that was offline gets the offer after its deadline: no ringing.
- [ ] Accept after the ride was taken: a toast, and the card closes.
- [ ] With the admin setting at `'0'`: a tray notification appears and tapping it opens the offer.

**Performance (item 3)**
- [ ] A new driver sees zeros. After completing a ride, today becomes 1 and the streak becomes 1.
- [ ] The "vs yesterday" and "vs last week" arrows match the numbers.

**Support (item 4)**
- [ ] Before the admin sets anything: no fake email or number is shown anywhere.
- [ ] After the admin saves a phone and email: both apps show them (no app update needed). Empty WhatsApp hides that
      option.

**Rider rating (item 5)**
- [ ] A new rider shows "New" on the active ride. A rated rider shows e.g. 4.5.
- [ ] Rate after the trip, then rate again: the second attempt gets 409 and the UI shows the ride as rated.
- [ ] Skip works, and the ride can be rated later from history.
- [ ] The rider's app never shows what the driver wrote.

---

## 9. Endpoint quick reference

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/v1/drivers/performance` | driver | streak and ride counts |
| GET | `/api/v1/drivers/ride-offers` | driver | open offers (sync on app open) |
| PATCH | `/api/v1/rides/:rideId/rider-rating` | driver | rate the rider (once) |
| GET | `/api/v1/rides` | driver / user | history (drivers get `driverFeedback`) |
| GET | `/api/v1/app-settings/support` | none | support phone / email / WhatsApp |
| GET | `/api/v1/rides/app-settings/support` | none | the same as above |

FCM `data.type` values the driver app must handle: `ride_request`, `ride_request_closed`.
