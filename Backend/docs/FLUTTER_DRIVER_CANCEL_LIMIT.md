# Driver Cancel + Daily Limit (3 cancels = block) – Flutter Developer Notes

Driver ne ride **accept** kar li hai lekin abhi **start nahi** hui – ab wo cancel kar sakta hai.
Ek din (IST) me **3 cancel** tak allowed; **3rd cancel ke baad driver us din ke baaki time ke liye block** ho jaata hai.

Zyada tar kaam **Driver app** ka hai. User app ko sirf 2 naye events handle karne hain (section 5).

---

## 1. Driver app – Cancel API

`POST /rides/:rideId/driver-cancel`  (driver token)
```json
{ "reason": "Customer not reachable" }
```
`reason` optional hai (max 300 chars) – ek dropdown/text se bhejna better hai.

### Kab allowed hai
- Ride `accepted` ya `arriving` ho (start/`started` se pehle).
- Scheduled ride jo abhi **future** me hai → `400` (iske liye purana scheduled-rides cancel screen: `POST /drivers/scheduled-rides/:rideId/cancel`).
- Ride start ho chuki → `409 "This ride can no longer be cancelled by the driver"` (button hide kar do jab `liveStatus == started` ya uske baad).

### Success response
```json
{
  "success": true,
  "data": {
    "rideId": "...",
    "status": "searching",
    "liveStatus": "searching",
    "redispatched": true,
    "advanceRefunded": false,
    "cancelLimit": 3,
    "cancelsToday": 1,
    "cancelsLeft": 2,
    "cancelBlocked": false,
    "blockedUntil": null
  }
}
```
- `redispatched: true` → ride dusre drivers ko offer ho rahi hai (driver ke liye ride khatam – home par wapas).
- Bidding wali ride me `redispatched: false`, `status: "cancelled"` (poori booking cancel ho jaati hai).
- Cancel ke baad driver `isOnRide = false` ho jaata hai aur online hi rehta hai (jab tak block na ho).
- Cancel hone par driver ko **us ride ke live updates band** ho jaate hain (ride room se hata diya jaata hai) – local ride state clear kar do.

---

## 2. Cancel se pehle warning dikhao

`GET /drivers/me` ab ye fields deta hai:
```json
{ "cancelLimit": 3, "cancelsToday": 1, "cancelsLeft": 2, "cancelBlocked": false, "blockedUntil": null }
```
Cancel button dabane par dialog:
- `cancelsLeft > 1`: "Cancel karne par aaj {cancelsLeft − 1} cancel bachenge."
- `cancelsLeft == 1`: **"Yeh aapka aakhri cancel hai. Cancel karne par aap aaj ke liye block ho jaayenge."**
- `cancelsLeft == 0` / `cancelBlocked == true`: cancel option hi nahi (driver already blocked hai).

`cancelLimit` admin badal sakta hai (setting `driver_daily_cancel_limit`) – hardcode na karein.
`cancelLimit == 0` ka matlab limit off hai (`cancelsLeft` `null` aayega) – warning mat dikhao.

Counter **IST midnight** par reset hota hai.

---

## 3. Block hone par

3rd cancel par:
1. Response me `cancelBlocked: true`, `blockedUntil: "2026-03-10T18:30:00.000Z"` (UTC me; yeh agle din 00:00 IST hai).
2. Socket event driver ko:
   ```json
   // event: driver:blocked
   { "reason": "daily_cancel_limit", "cancelLimit": 3, "cancelsToday": 3, "cancelsLeft": 0, "cancelBlocked": true, "blockedUntil": "..." }
   ```
3. Driver **server se offline** kar diya jaata hai – app ka online toggle **OFF** dikhao.

Block ke dauran:
- `PATCH /drivers/online` → `403` :
  ```json
  { "success": false, "message": "You have cancelled too many rides today and are blocked until the next day. Contact support if this is a mistake.",
    "details": { "code": "DRIVER_CANCEL_BLOCKED", "blockedUntil": "..." } }
  ```
- Ride accept (socket `acceptRide`) / bid (`submitRideBid`) bhi isi error se fail hote hain (socket par `errorMessage` event).
- Driver ko ride requests aati hi nahi.

### UI
- `details.code == "DRIVER_CANCEL_BLOCKED"` par block screen/dialog dikhao: "Aap {blockedUntil local time} tak block hain." + support button.
- `blockedUntil` UTC ISO hai – local time me convert karke dikhao (countdown optional).
- App start par `GET /drivers/me` se `cancelBlocked` check karo taaki block state restart ke baad bhi dikhe.
- Block apne aap agle IST din khul jaata hai; **admin** bhi panel se turant hata sakta hai
  (`PATCH /admin/drivers/:id/clear-cancel-block`) – to dobara online karne par kaam karega.

---

## 4. Kya count NAHI hota
- Ride request **reject** karna.
- **Scheduled ride** cancel (purana scheduled-rides flow).
- Ride start hone ke baad cancel (allowed hi nahi).

---

## 5. User app – kya handle karna hai

Driver cancel karne par user ko yeh milta hai:

| Event (socket) | Matlab | UI |
|---|---|---|
| `rideDriverCancelled` `{ rideId, reason, message }` | Driver ne cancel kiya, **ride dobara driver dhundh rahi hai** | "Aapke driver ne cancel kiya. Naya driver dhundh rahe hain…" + searching screen |
| `rideCancelled` `{ rideId, reason }` | Poori ride cancel (bidding ride par) | Home par wapas |
| `ride:status:updated` | `status/liveStatus` = `searching` | Driver card hata do, searching UI |
| `rideSearchUpdate` | Nayi search ka progress | Pehle jaisa |

Aur push notification: "Driver cancelled" / "Ride cancelled".

Dhyan:
- `rideDriverCancelled` aane par **purane driver ka card/location tracking hata do**; `ride.driver` ab `null` hoga jab tak naya driver accept na kare.
- Ride ka `otp`, fare, payment method **same** rehte hain (ride wahi hai).
- **Goods booking:** paid advance **hold par rehta hai** (refund nahi hota) kyunki booking chal rahi hai.
  Agar naya driver nahi mila ya ride cancel ho gayi to advance refund hota hai – `goodsAdvance:refunded` event
  (details: `FLUTTER_GOODS_ADVANCE.md`).
- Free ride / subscription cover ride par koi asar nahi.

---

## 6. Admin (reference)

- Admin driver data me `cancel_tracking: { date_key, count, blocked_until, last_cancel_at }`.
- Block hatane ke liye: `PATCH /admin/drivers/:id/clear-cancel-block` → `{ cancelsLeft, cancelBlocked, … }`.
- Limit badalne ke liye: `PATCH /admin/general-settings/transport_ride` `{ "driver_daily_cancel_limit": "3" }`.

---

## 7. QA checklist

- [ ] Accepted/arriving ride par driver cancel → ride user ko dobara offer hoti hai, driver ko nahi.
- [ ] Cancel ke baad driver ko us ride ke socket updates nahi aate.
- [ ] 1st/2nd cancel: `cancelsLeft` 2 → 1; dialog sahi warning dikhata hai.
- [ ] 3rd cancel: `cancelBlocked: true`, `driver:blocked` event, toggle OFF.
- [ ] Block me online karne / accept / bid par `403 DRIVER_CANCEL_BLOCKED`, message + time dikhta hai.
- [ ] Started ride par cancel → 409, button hidden.
- [ ] Future scheduled ride par is endpoint se cancel → 400.
- [ ] Reject karna / scheduled cancel count nahi hota.
- [ ] Agle IST din (ya admin clear ke baad) driver online ja sakta hai, count 0.
- [ ] User app: `rideDriverCancelled` par searching screen, purane driver ka card gayab.
- [ ] Goods booking: driver cancel par advance refund nahi, booking re-dispatch; koi driver na mile to refund.
- [ ] Bidding ride par driver cancel → poori ride cancel (`rideCancelled`).
