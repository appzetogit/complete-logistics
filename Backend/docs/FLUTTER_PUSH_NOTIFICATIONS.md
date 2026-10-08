# Push Notifications – Flutter Developer Notes (User app + Driver app)

## Abhi ki situation (server par test kiya, 8 Oct 2026)

- Server ab Firebase project **`rentol-157dc`** ke saath push bhej raha hai (pehle Firebase key hi nahi thi, isliye koi push nahi jaata tha).
- Test result: 6 me se **3 delivered** (driver Tarun, user rudra, user vipin), **3 fail** with
  `messaging/registration-token-not-registered` (driver jhon, driver Dhruv, user varun).
- Matlab: un 3 phones ka **saved FCM token purana/dead** tha (app reinstall / data clear / token rotate hua aur app ne naya token
  server ko nahi bheja). Server dead token khud hata deta hai.

**Isliye app me neeche wala token flow zaroori hai** – warna kuch dino me phir tokens dead ho jaayenge aur push band.

---

## 1. Firebase project check (dono apps)

- `android/app/google-services.json` aur iOS `GoogleService-Info.plist` **`rentol-157dc`** project ke hone chahiye
  (`project_id` / `PROJECT_ID` = `rentol-157dc`). Doosre project ke config se bana token is server se kabhi deliver nahi hoga
  (`messaging/mismatched-credential` / `sender-id-mismatch`).
- iOS: Firebase Console -> Project settings -> Cloud Messaging -> **APNs Authentication Key** upload hona chahiye.

## 2. Token server ko bhejna – sabse zaroori

Endpoint (login token ke saath):

| App | Endpoint |
|---|---|
| User app | `POST /api/v1/users/fcm-token` |
| Driver app | `POST /api/v1/drivers/fcm-token` |

Body:
```json
{ "token": "<FCM token>", "platform": "android" }
```
`platform`: `android` | `ios` (ya `mobile`); web ke liye `web`. Response `200 { success: true, data: { message: "FCM token saved successfully" } }`.

**Kab bhejna hai (teeno jagah):**
1. **Login / OTP verify ke turant baad.**
2. **Har app start par** jab user already logged in ho (splash/bootstrap me).
3. **Jab bhi Firebase token badle** (`onTokenRefresh`).

```dart
Future<void> syncFcmToken() async {
  final messaging = FirebaseMessaging.instance;
  final token = await messaging.getToken();
  if (token == null || !isLoggedIn) return;
  await api.post(fcmTokenPath, data: {
    'token': token,
    'platform': Platform.isIOS ? 'ios' : 'android',
  });
}

// main / bootstrap, after login state is known
await syncFcmToken();
FirebaseMessaging.instance.onTokenRefresh.listen((_) => syncFcmToken());
```
`fcmTokenPath` = user app me `/users/fcm-token`, driver app me `/drivers/fcm-token`.

- Fail ho (network) to agle app start par phir bhejo – koi problem nahi, server same token overwrite karta hai.
- Server ek account par **ek mobile token** rakhta hai (latest jo bheja). Isliye har login par bhejna zaroori hai – doosre phone
  par login kiya to push wahan jaayega.
- Logout par (optional) `FirebaseMessaging.instance.deleteToken()` kar sakte ho taki purane phone par push na jaaye.

## 3. Permission (Android 13+ / iOS)

```dart
await FirebaseMessaging.instance.requestPermission(alert: true, badge: true, sound: true);
```
- Android 13+: `POST_NOTIFICATIONS` permission bina notification dikhega hi nahi (server par "delivered" aayega).
- Login ke baad ya pehli baar home screen par maango.

## 4. App open (foreground) me notification dikhana

Server **notification + data** dono bhejta hai. App background/killed ho to Android/iOS khud tray me dikhate hain.
**App open ho to Flutter khud nahi dikhata** – `onMessage` me local notification dikhao:

```dart
FirebaseMessaging.onMessage.listen((RemoteMessage m) {
  // flutter_local_notifications se dikhao (high-importance channel)
  showLocalNotification(m.notification?.title, m.notification?.body, payload: m.data);
});
```
- Android: ek **high importance** channel banao (ride request jaldi dikhe, sound ke saath).
- iOS: `FirebaseMessaging.instance.setForegroundNotificationPresentationOptions(alert: true, badge: true, sound: true);`

## 5. Notification tap -> sahi screen

`FirebaseMessaging.onMessageOpenedApp` (background se khula) aur `FirebaseMessaging.instance.getInitialMessage()` (killed se khula)
me `message.data['type']` dekho:

| `data.type` | Kisko | Extra `data` | Kya karna hai |
|---|---|---|---|
| `ride_request` | Driver | `rideId`, `serviceType`, `userId`, `title`, `body` | **Data-only** (neeche dekho). Background handler full-screen ride alert dikhaye; tap par `GET /drivers/ride-offers` -> request card |
| `ride_accepted` | User | `rideId`, `serviceType`, `driverId` | Ride tracking screen (`GET /rides/active/me`) |
| `ride_cancelled_by_driver` | User | `rideId`, `serviceType` | Active ride refresh – naya driver dhundh rahe hain ya home |
| `driver_wallet_credit` | Driver | `amount`, `transferId` | Wallet screen refresh |
| `test_push` | Dono | – | Kuch nahi (sirf test) |
| admin broadcast | Dono | `notificationId`, `sendTo` | Notifications list |

Saari `data` values **string** hoti hain. `click_action` = `FLUTTER_NOTIFICATION_CLICK` bhi aata hai.

> Ride request ka **asli** source abhi bhi socket `rideRequest` event hai. Push sirf backup hai jab app background me ho –
> tap par `GET /drivers/ride-offers` se fresh data lo, push ke data par bharosa mat karo.

## 5b. Driver ride request = data-only push (Android)

Driver ka `ride_request` push ab **data-only** jaata hai (koi `notification` block nahi):
- Android khud koi tray notification nahi banata – sirf app ka `firebaseMessagingBackgroundHandler` jaagta hai, jo **ek** full-screen
  "incoming call" style ride alert `ride_requests` channel par dikhata hai (max importance, sound, lock-screen wake).
  Pehle Android ki plain notification + app ka alert dono aate the, aur tap par plain wala jeet jaata tha.
- Text `data.title` / `data.body` me aata hai (notification block nahi hai).
- `android.priority: high` (killed/Doze app ko jagata hai), **TTL 60 s** (purana offer late deliver nahi hota),
  **collapse key `ride_<rideId>`** (same ride ki doosri dispatch wave pehle wale ko replace karti hai, do alert nahi).
- iPhone: data-only par handler reliable nahi, isliye iOS ko `apns` se normal visible alert jaata hai (APNs key chahiye).
- Baaki saare push (`ride_accepted`, `ride_cancelled_by_driver`, `driver_wallet_credit`, admin broadcast) pehle jaise notification ke saath.
- Device note: Xiaomi/MIUI par driver ko Autostart, Battery saver "No restrictions" aur "Display pop-up windows while running in
  background" allow karna hoga, warna MIUI background delivery rok deta hai.

## 6. Background handler (Android)

```dart
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
}

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp();
  FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
  runApp(const App());
}
```

## 7. Test kaise karein

Server team ke paas admin endpoints hain:
- `GET /api/v1/admin/push/status` – Firebase configured hai ya nahi, kitne users/drivers ka token saved hai.
- `POST /api/v1/admin/push/test` `{ "driverId": "…" }` ya `{ "userId": "…" }` – ek real push bhejta hai aur result deta hai
  (`deliveredCount`, ya Firebase error code).

| Result | Matlab | Fix |
|---|---|---|
| `deliveredCount: 1` par phone par kuch nahi | Firebase ne deliver kiya, phone/app nahi dikha raha | Permission (sec 3), foreground display (sec 4), battery saver, iOS APNs key |
| `registration-token-not-registered` | Saved token dead | App me section 2 ka flow; user phir login kare / app khole |
| `mismatched-credential` / `sender-id-mismatch` | App doosre Firebase project ka | `google-services.json` / plist `rentol-157dc` wala lagao |
| `targetCount: 0`, "No saved FCM tokens" | App ne token kabhi bheja hi nahi | Section 2 |

## 8. QA checklist

- [ ] Fresh install -> login -> `POST …/fcm-token` call hoti hai (network log me dikhe).
- [ ] App kill karke dobara kholo (logged in) -> phir se `fcm-token` call.
- [ ] Reinstall / clear data -> login -> admin test push `delivered 1` aur phone par dikhe.
- [ ] Android 13+ par permission dialog aata hai; deny karne par kya hota hai wo handle.
- [ ] App open me push aaye to local notification dikhe.
- [ ] Driver: app background me, ride request push aaye -> tap -> request card (ride-offers se).
- [ ] User: ride accept / driver cancel push -> tap -> sahi screen.
- [ ] iPhone par bhi (APNs key ke saath) push aata hai.
