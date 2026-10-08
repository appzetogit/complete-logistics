# Driver ride request push = data-only (Android) – Flutter Developer Notes (Driver app)

## Kya badla (backend)

Driver ko jaane wala **`ride_request`** push ab **data-only** hai (koi `notification` block nahi). Baaki saare push
(user ka ride accepted, driver cancelled, wallet credit, admin broadcast) pehle jaise `notification` ke saath hain.

**Kyun:** pehle Android khud ek plain tray notification dikhata tha aur app apna full-screen ride alert bhi – driver ko 2 alert
dikhte the, aur tap par plain wala khulta tha (na full-screen, na ringtone channel, na lock-screen wake).
Ab Android kuch nahi dikhata; sirf app ka **background handler** jaagta hai aur **ek** full-screen alert dikhata hai.

### Payload jo aata hai
```json
{
  "data": {
    "type": "ride_request",
    "rideId": "6ac0…",
    "serviceType": "ride" | "parcel",
    "userId": "6abb…",
    "title": "New ride request" | "New delivery request",
    "body": "Pickup: MG Road",
    "click_action": "FLUTTER_NOTIFICATION_CLICK"
  },
  "android": { "priority": "high", "ttl": "60s", "collapseKey": "ride_<rideId>" },
  "apns": { "aps": { "alert": { "title": "...", "body": "..." }, "sound": "default" } }
}
```
- `message.notification` **null** hoga (Android). Text `message.data['title']` / `message.data['body']` se lo.
- Saari `data` values string hain.
- TTL 60 s: purana offer late nahi aata. Collapse key: same ride ki doosri dispatch wave pehle wale ko replace karti hai.
- iPhone: `apns` se normal visible alert aata hai (iOS data-only par handler reliable nahi chalata). APNs key + `GoogleService-Info.plist` zaroori.

---

## ⚠️ Zaroori app change (current code me gap hai)

`flutterdriver/lib/core/services/notification_service.dart` me jo code humne dekha:
- `firebaseMessagingBackgroundHandler` sirf `AppLauncherService.bringToForeground()` call karta hai – **koi notification nahi
  dikhata**. Background isolate me ye MethodChannel aksar kaam nahi karta, aur Android 10+ background se activity start
  rokta hai.
- Full-screen alert (`_showLocalNotification`, `fullScreenIntent`, `ride_requests` channel) **sirf foreground** `onMessage` me chalta hai.

Matlab data-only ke baad, app background/killed ho to **driver ko kuch bhi nahi dikhega**. Isliye background handler me
khud local full-screen notification dikhana zaroori hai:

```dart
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

const _rideChannel = AndroidNotificationChannel(
  'ride_requests',
  'Ride Requests',
  description: 'New ride offers and trip status updates',
  importance: Importance.max,
  playSound: true,
  enableVibration: true,
);

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
  final data = message.data;
  if (data['type'] != 'ride_request') return;

  // Background isolate: plugin yahin initialise karo.
  final plugin = FlutterLocalNotificationsPlugin();
  await plugin.initialize(const InitializationSettings(
    android: AndroidInitializationSettings('@mipmap/ic_launcher'),
    iOS: DarwinInitializationSettings(),
  ));
  await plugin
      .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
      ?.createNotificationChannel(_rideChannel);

  final rideId = data['rideId'] ?? '';
  await plugin.show(
    rideId.hashCode, // same id as cancelRideOfferNotification() -> offer close par hat jaata hai
    message.notification?.title ?? data['title'] ?? 'New ride request',
    message.notification?.body ?? data['body'] ?? 'A new booking is waiting for your response.',
    const NotificationDetails(
      android: AndroidNotificationDetails(
        'ride_requests',
        'Ride Requests',
        importance: Importance.max,
        priority: Priority.max,
        fullScreenIntent: true,
        category: AndroidNotificationCategory.call,
        visibility: NotificationVisibility.public,
        ongoing: true,
        autoCancel: true,
        timeoutAfter: 60000, // offer 60 s baad bekaar
      ),
    ),
    payload: 'ride_request:$rideId',
  );
}
```

- Foreground (`onMessage`) wala `_showLocalNotification` bhi `data['title']` / `data['body']` padhe (abhi wo default text use karta hai).
- `bringToForeground()` rakhna ho to rakho, par notification **pehle** dikhao – sirf us par depend mat karo.

### Tap handling (local notification)
Data-only ke saath `FirebaseMessaging.onMessageOpenedApp` / `getInitialMessage` **fire nahi hote** (tray me jo hai wo app ki
local notification hai). Isliye `flutter_local_notifications` se handle karo:

```dart
await plugin.initialize(
  initSettings,
  onDidReceiveNotificationResponse: (response) => _openRideOffer(response.payload),
);
// app killed tha aur notification se khula:
final launch = await plugin.getNotificationAppLaunchDetails();
if (launch?.didNotificationLaunchApp ?? false) _openRideOffer(launch!.notificationResponse?.payload);

void _openRideOffer(String? payload) {
  if (payload == null || !payload.startsWith('ride_request:')) return;
  // GET /api/v1/drivers/ride-offers -> rideId wala offer request card me dikhao
}
```
`GET /drivers/ride-offers` sirf wahi offer deta hai jo abhi bhi open hai aur jiski is driver ki baari hai – expired/taken offer
ke liye khaali list aaye to "Request expired" dikhao.

### Offer close hone par alert hatao
Socket `rideRequestClosed` / accept / reject par `cancelRideOfferNotification(rideId)` (id = `rideId.hashCode`) – already hai, wahi
id use karo jo background handler me.

---

## Android permissions / settings

- `AndroidManifest.xml`: `USE_FULL_SCREEN_INTENT` (already hai), `POST_NOTIFICATIONS`, `WAKE_LOCK`.
- **Android 14+:** full-screen intent ke liye user permission chahiye. Check/maango:
  `androidPlugin.canUseFullScreenIntent()` / `androidPlugin.requestFullScreenIntentPermission()` (flutter_local_notifications 17+).
  Bina iske notification heads-up banega, full-screen nahi.
- Android 13+: `requestPermission()` (notification permission).
- **Xiaomi / MIUI / Oppo / Vivo:** driver ko Autostart ON, Battery saver "No restrictions", aur
  "Display pop-up windows while running in background" allow karna hoga – app me ek one-time guide screen dikhao.

## Backend switch (agar alert na aaye)
Admin setting `ride_request_push_data_only` (`PATCH /admin/general-settings/transport_ride`):
- `"1"` (default) = data-only (upar wala flow).
- `"0"` = purana tareeka (notification block ke saath) – jab tak app ka naya background handler release nahi hota,
  ye safe fallback hai: driver ko kam se kam system notification to dikhega.

## QA checklist
- [ ] App background me, ride dispatch -> **ek** full-screen ride alert, extra plain notification nahi.
- [ ] Phone locked / screen off -> alert call ki tarah screen jagata hai; tap -> request card (`/drivers/ride-offers`).
- [ ] App killed (swipe away, force-stop nahi) -> alert phir bhi aata hai.
- [ ] Same ride ki 2 dispatch wave -> ek hi alert.
- [ ] 60 s se purana offer late nahi aata; offer close/accept par alert hat jaata hai.
- [ ] Android 14 par full-screen permission na ho to bhi heads-up alert dikhta hai.
- [ ] User app ke push (ride accepted etc.) aur admin broadcast normal dikhte hain.
- [ ] iPhone driver -> alert dikhta hai (apns).
- [ ] MIUI phone (settings allow karke) -> background me alert aata hai.
