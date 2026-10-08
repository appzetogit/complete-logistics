# Ride cancellation details (`cancellation`) – Backend + Flutter notes

Every cancelled ride now stores and returns **who** cancelled it, **when**, **why**, and the **fee** that was charged.

## Field

```json
"cancellation": {
  "by": "user" | "driver" | "admin" | "system",
  "at": "2026-10-08T10:15:00.000Z",
  "code": "cancelled_by_user",
  "reason": "Driver too far away",
  "fee": 25,
  "feeStatus": "charged" | "not_charged" | "none",
  "feeGoesTo": "admin" | "driver" | "user" | ""
}
```
`cancellation` is **`null`** while the ride is not cancelled.

| `by` | `code` | When |
|---|---|---|
| `user` | `cancelled_by_user` | Rider cancels (`PATCH /rides/:id/cancel`) |
| `user` | `replaced_by_new_booking` | Rider made a new booking while this one was open |
| `driver` | `cancelled_by_driver` | Driver cancels an upcoming scheduled ride, or a **bidding** ride (a normal ride is re-opened instead and is NOT cancelled) |
| `admin` | `cancelled_by_admin` | Admin cancels / deletes an ongoing ride |
| `system` | `no_driver_found` | Search ended without any driver |
| `system` | `advance_not_paid` | Goods advance not paid within 30 minutes |

- `fee`: the cancellation fee actually taken. Rider cancel: from the rider's wallet (Set Price "user cancellation fee").
  Driver scheduled cancel: from the driver (`feeGoesTo: "user"`).
- `feeStatus: "not_charged"`: a fee was due but the rider's wallet could not cover it (`fee` is then `0`).
- `reason`: the rider's/driver's own text (max 300 characters) or a default text.

## API

- **Rider cancel:** `PATCH /rides/:rideId/cancel` now accepts an optional body `{ "reason": "…" }` and returns
  `data.cancellation` (plus the existing `advanceRefunded`, `advanceStatus`).
- **Everywhere a ride is returned:** `GET /rides/:id`, `GET /rides/active/me`, ride history, deliveries, socket `ride:state`
  carry `cancellation` (rider and driver see the same block).
- **Admin lists** (`/admin/ride-requests`, `/admin/deliveries`, …): each row has `cancellation`.
- Before cancelling, the fee can be previewed with `GET /rides/:id/cancel-preview` (see `SELFIES_FREE_RIDES_SUBSCRIPTIONS.md`).

## Flutter
- Cancel dialog: optional reason picker/text -> send as `reason`.
- Ride history / cancelled ride screen: "Cancelled by you / driver / support / system" from `by`, the `reason`, and
  "Cancellation fee ₹{fee}" when `fee > 0`. Show nothing extra when `cancellation` is `null`.
- Old rides cancelled before this change have `cancellation: null` even if their status is `cancelled` – show just "Cancelled".

## Also in this change: geo indexes at startup
Production runs MongoDB with `autoIndex` off, so the 2dsphere indexes driver matching needs may never have been built
(then every dispatch attempt fails). The server now makes sure these exist at startup (no-op when they do):
`drivers.location`, `drivers.routeBooking.anchorLocation`, `zones.geometry`, `servicelocations.location`.
Log: `[indexes] dispatch geo indexes checked` (or `[indexes] could not create …` with the reason).
