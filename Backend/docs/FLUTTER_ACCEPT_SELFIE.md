# Accept Selfie: Admin-Only (User ko ab nahi dikhegi) – Flutter Developer Notes

Driver jab ride accept karta hai to selfie leta hai. Yeh selfie ab **sirf admin** ke liye hai.
**User app ko ab `acceptSelfie` kahin nahi milega** – na REST me, na socket me.
User driver ko pehchanne ke liye driver ki **profile photo**, naam, vehicle, number aur rating dekhega.

---

## 1. User app me kya badla

| Pehle | Ab |
|---|---|
| Ride payload me `acceptSelfie: { imageUrl, capturedAt }` aata tha | Yeh key **hai hi nahi** (null bhi nahi – key missing) |
| Driver ki pehchaan selfie se | `driver.profileImage` + naam + vehicle details |

### Kya karna hai (User app)
- `acceptSelfie` ka koi bhi use/parse/UI **hata do** (null-safe rakho – key missing hogi).
- Driver card me yeh fields dikhao (ride payload ke `driver` object me aate hain):
  ```json
  "driver": {
    "name": "Asha",
    "phone": "…",
    "profileImage": "https://…/asha.jpg",
    "vehicleType": "car",
    "vehicleNumber": "MP09AB1234",
    "vehicleColor": "White",
    "vehicleMake": "Maruti",
    "vehicleModel": "Dzire",
    "rating": 4.8
  }
  ```
- **`profileImage` khaali ho sakti hai** (kuch drivers ne abhi profile photo set nahi ki). Placeholder avatar
  (naam ka pehla akshar) dikhao – crash/blank mat chhodo.

Yeh sab jagah applicable hai: `GET /rides/:rideId`, `GET /rides/active/me`, ride history, `GET /deliveries/...`,
aur socket events (`ride:state`, `rideAccepted`, …).

---

## 2. Driver app me kya same rahega

Driver ka accept-selfie flow **bilkul pehle jaisa** hai:

1. Socket `acceptRide` `{ rideId, selfieUrl? }` (selfieUrl `https://` hi) – ya
2. Baad me: `PATCH /rides/:rideId/accept-selfie` `{ selfieUrl }`.

Driver ko apni selfie in jagah milti hai (`acceptSelfie: { imageUrl, capturedAt }`):
- `PATCH /rides/:rideId/accept-selfie` ka response
- `PATCH /rides/:rideId/status` ka response
- `GET /rides/active/me`, `GET /rides/:rideId` (driver token par)
- `GET /deliveries/...` (driver token par)
- Socket par `ride:rejoin-current` / `ride:join` ka direct `ride:state` reply (sirf us driver ke socket ko)

### Dhyan dene wali baat (Driver app)
**Ride room ke broadcast** (`ride:state` jo room me sab ko jaata hai, jisme user bhi hai) me ab selfie **nahi** aati.
Isliye driver app ko selfie ki state **apne upload ke response se** ya `GET /rides/active/me` se leni chahiye –
room ke live `ride:state` event par depend na karein.

---

## 3. Admin

Admin panel (Trips, Driver details) pehle jaisa selfie dikhata hai (`acceptSelfieUrl`, `acceptSelfieAt`).
Database me selfie save hoti rehti hai. Flutter ke liye koi change nahi.

---

## 4. QA checklist

- [ ] User app: ride accept hone ke baad ride payload/socket me `acceptSelfie` key nahi (REST + socket dono).
- [ ] User app: driver card me profile photo, naam, vehicle, number, rating dikhte hain.
- [ ] User app: `profileImage` khaali ho to placeholder dikhta hai, crash nahi.
- [ ] Goods/delivery screens par bhi user ko selfie nahi aati.
- [ ] Driver app: accept ke baad selfie upload (`/accept-selfie`) chalta hai, response me selfie milti hai.
- [ ] Driver app: app restart par `GET /rides/active/me` se selfie state wapas aati hai.
- [ ] Admin Trips page par selfie dikhti hai.
