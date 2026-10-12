# Ride-request push fields, offer-closed push, driver performance, support contact – Flutter Developer Notes

Backend changes for the "Backend requirements – Rentol user & driver apps" list (items 1–4). Item 5 (rider rating for the
driver): **decision (a) – drop it**: the driver app removes the hardcoded `4.8`; no backend change.

---

## 1. Ride request push – extra fields (Driver app)

The `type: "ride_request"` push now carries what the native full-screen card shows. **Every value is a string**;
missing ones are `""`. Existing keys (`type`, `rideId`, `serviceType`, `userId`, and `title` / `body` when data-only) are unchanged.

| key | example | meaning |
|---|---|---|
| `pickupAddress`, `dropAddress` | `"MG Road"` | may be `""` |
| `pickupLat`, `pickupLng`, `dropLat`, `dropLng` | `"22.7196"` | parse with `double.tryParse` |
| `fare` | `"187.5"` | rupees |
| `paymentMethod` | `"cash"` / `"online"` | |
| `distanceKm` | `"4.3"` | 1 decimal; `""` when the trip distance is unknown |
| `vehicleTypeName` | `"Sedan"` | booked vehicle |
| `acceptanceDeadlineAt` | `"2026-10-12T10:31:00.000Z"` | same as `requestExpiresAt` in the socket offer; countdown = this − now |
| `acceptTimeoutSeconds` | `"15"` | the admin's accept window |

Still: on tap / on accept, use `GET /drivers/ride-offers` (or the socket offer) as the source of truth – the push is the wake-up.

## 2. Offer withdrawn push – `ride_request_closed` (Driver app)

Whenever an offer stops being available to a driver, the driver gets **both** the socket event `rideRequestClosed` (as before)
**and** a silent data-only push:

```json
{ "type": "ride_request_closed", "rideId": "<ride id>", "reason": "accepted-by-another-driver" }
```

- No notification block anywhere (Android draws nothing; iOS gets a background push, `content-available: 1`).
- `android.priority: high`, TTL 60 s, **collapseKey `ride_<rideId>`** = same as the offer, so an offer push not yet delivered
  is replaced by the close.
- `reason` values: `accepted-by-another-driver`, `user-cancelled`, `user-replaced-booking`, `search-window-expired`
  (one-by-one dispatch moved to the next driver), `unmatched` (no driver found), `driver-cancelled`, `deleted-by-admin`.
- The driver **who accepted** does not get this push (only the socket event).

App: on `ride_request_closed` -> close the full-screen card, stop the ringtone, cancel the notification (`rideId.hashCode`).
(Already built per the requirements doc.)

## 3. Driver performance – `GET /api/v1/drivers/performance` (Driver app)

Driver token. Response:
```json
{ "success": true, "data": { "dayStreak": 3, "ridesToday": 2, "ridesYesterday": 1, "tripsThisWeek": 6, "tripsLastWeek": 4 } }
```
- **Completed rides only**, days and weeks in **IST**, week starts **Monday** (same as Earnings).
- `dayStreak`: consecutive days with at least one completed ride, counted back from today. If there is no ride yet today, the
  streak that ended yesterday still counts (it only breaks when a whole day passes with no ride).
- "vs yesterday" = `ridesToday − ridesYesterday`; "vs last week" = `tripsThisWeek − tripsLastWeek`.
- Replace the hardcoded `2`, `3`, `↗ 1`, `↗ +2` with these.

## 4. Support contact (User app + Driver app)

`GET /api/v1/app-settings/support` (**no login**; also at `GET /api/v1/rides/app-settings/support`):
```json
{ "success": true, "data": { "support_phone": "+91 98765 43210", "support_email": "help@rentol.in", "support_whatsapp": "" } }
```
- Admin sets them in **Admin → App Settings → Support Contact**. Until then they are `""`.
- A field that is `""` -> hide that option (or show your own fallback). Remove the `support@supertaxi.com` placeholder and the
  dummy number from both apps.
- WhatsApp link: `https://wa.me/<digits only>`.

## 5. Rider rating shown to the driver

Decision (a): remove the hardcoded rider rating (`4.8`) from the driver app's Active Ride screen. The backend has no
driver→rider rating.

## App-side only (data already sent)

- **Closest driver**: the available-drivers response has `closestDriverDistanceMeters` and `closestDriverEtaMinutes` – replace the hardcoded "1.7 km".
- **Driver details for the rider**: ride payloads populate `driverId` (`name`, `phone`, `profileImage`, `vehicleNumber`,
  `vehicleType`, `vehicleColor`, `vehicleMake`, `vehicleModel`, `rating`) – use them in chat instead of "RISHI / DL01AD1234 / Bike".

## QA

- [ ] Driver app killed, ride dispatched: the native card shows real pickup/drop, fare, distance, vehicle and a countdown to `acceptanceDeadlineAt`.
- [ ] Another driver accepts (or the rider cancels): the card closes and the ringtone stops on the killed app.
- [ ] One-by-one dispatch moves to the next driver: the first driver's card closes.
- [ ] Performance tab shows real numbers; a new driver sees zeros.
- [ ] Help Center shows the admin's phone/email; empty WhatsApp hides the option.
- [ ] Xiaomi/Oppo/Vivo: Autostart allowed + battery "No restrictions", or no push reaches a killed app.
