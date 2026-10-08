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
  "feeCharged": true,
  "feeStatus": "charged" | "not_charged" | "none",
  "feeGoesTo": "admin" | "driver" | "",
  "driverFee": 0
}
```
`cancellation` is **`null`** while the ride is not cancelled.

| `by` | `code` | When |
|---|---|---|
| `user` | `cancelled_by_user` | Rider cancels (`PATCH /rides/:id/cancel`) |
| `system` | `replaced_by_new_booking` | Rider made a new booking while this one was open (`reason` is also `replaced_by_new_booking`) |
| `driver` | `cancelled_by_driver` | Driver cancels an upcoming scheduled ride, or a **bidding** ride (a normal ride is re-opened instead and is NOT cancelled) |
| `admin` | `cancelled_by_admin` | Admin cancels / deletes an ongoing ride |
| `system` | `no_driver_found` | Search ended without any driver |
| `system` | `advance_not_paid` | Goods advance not paid within 30 minutes |

- `fee`: the **rider's** cancellation fee decided for this cancel (Set Price "user cancellation fee"); `0` when the
  driver, admin or system cancelled.
- `feeCharged`: `true` only if that fee was really debited from the rider's wallet. `false` + `feeStatus: "not_charged"`
  when the wallet could not cover it (`fee` still shows the amount that was due).
- `feeGoesTo`: who received a charged fee (`driver` only if the driver's wallet really got it, else `admin`).
- `driverFee`: a driver's own fee when the driver cancelled a scheduled ride (never charged to the rider).
- `reason`: the rider's/driver's own text (max 300 characters) or a default text.

## API

- **Rider cancel:** `PATCH /rides/:rideId/cancel` now accepts an optional body `{ "reason": "…" }` and returns
  `data.cancellation` (plus the existing `advanceRefunded`, `advanceStatus`).
- **Everywhere a ride is returned:** `GET /rides/:id`, `GET /rides/active/me`, ride history, deliveries, socket `ride:state`
  carry `cancellation` (rider and driver see the same block).
- **Admin lists** (`/admin/ride-requests`, `/admin/deliveries`, …): each row has `cancellation`.
- Before cancelling, the fee can be previewed with `GET /rides/:id/cancel-preview` (see `SELFIES_FREE_RIDES_SUBSCRIPTIONS.md`).

## Related fields in the same payloads
- `goodsAdvance: { percent, amount, status, provider, paidAt, refundDestination, refundedAt, forfeitedAt }` –
  `provider` is `wallet` or `razorpay` ("Advance paid ₹54 · Online · 03:46 PM").
- History list (`GET /rides`) now also has `subscriptionUsage: { covered, planId, planName }` (or `null`), `createdAt`, `updatedAt`.
- `ride:state` / ride payloads carry `createdAt` and `updatedAt`.

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
