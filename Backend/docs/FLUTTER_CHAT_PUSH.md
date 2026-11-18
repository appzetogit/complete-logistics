# Flutter: ride chat push notifications (rider app and driver app)

For the Flutter developer. The backend now sends a push when a ride chat message arrives. The app-side basics (tap handling, channel, collapsing) are already in both apps; this file is the contract, what to verify, and the optional improvements.

Apps: rider `flutter_taxi_user`, driver `flutterdriver`.

## 1. Why this exists

Before, a chat message reached the other person only through the socket, and only while their app was open and had joined the ride room. A backgrounded or killed app was told nothing. Now the backend also sends a push to the person who did not send the message.

## 2. Backend contract (what arrives on the phone)

Sent from the server right after the socket event `ride:message:new`.

| Item | Value |
| --- | --- |
| Recipient | The other participant only: rider sends -> driver gets it; driver sends -> rider gets it. The sender never gets a push |
| Kind | A normal FCM **notification** message (with a `notification` block). **Not data-only** |
| `notification.title` | The sender's name; "Rider" or "Driver" when the name is empty |
| `notification.body` | The message text, whitespace collapsed, at most 120 characters (ends with `…` when cut) |
| `data.type` | `ride_message` |
| `data.rideId` | The ride id (string) |

Not sent when: no driver is assigned yet, the ride is completed or cancelled, or there is nobody to notify.

Because it is a notification message, Android shows it in the system tray by itself while the app is in the background or killed. Your Dart background handler does **not** need to draw anything for it.

## 3. What each app must do

### 3.1 Both apps: recognise the type

A chat push must never be treated as a ride request. Use the `type` field, not the presence of `rideId` (`rideId` is also in ride-offer pushes):

```dart
bool isChatPush(Map<String, dynamic> data) => data['type'] == 'ride_message';
```

### 3.2 Driver app (`flutterdriver`)

Already done, keep these behaviours:
- `core/services/notification_service.dart`: `type == 'ride_message'` is excluded from `isRide` (no ride channel, no full-screen intent, no call category, no `bringToForeground()`). It is shown on the general channel and collapsed per ride (one tray entry per ride).
- `features/auth/application/auth_providers.dart`: tapping the notification opens `/ride-chat`; falls back to `/home` when the active ride is not loaded yet.
- The native `NEW_ORDER` handler only claims `ride_request` and `ride_request_closed`: a chat push must pass through to the normal notification path.

### 3.3 Rider app (`flutter_taxi_user`)

Already done:
- `main.dart`: tapping a `ride_message` push opens `/ride/<rideId>/chat` (not the tracking map).
- Foreground: `onMessage` already shows a local notification for every message, so a chat push while the app is open still shows.

## 4. Behaviour to verify (test checklist)

Setup: a ride that is accepted (driver assigned), both phones logged in, push permission granted, Firebase configured on the server.

| # | Scenario | Expected |
| --- | --- | --- |
| 1 | Driver app killed, rider sends a message | Driver phone shows a notification titled with the rider's name, body = the message. No ringtone, no full-screen takeover, app does not jump to the front |
| 2 | Tap that notification | Driver app opens the ride chat with the message visible |
| 3 | Driver app in background (not killed) | Same as 1 |
| 4 | Driver sends, rider app killed or in background | Rider gets the notification; tapping opens `/ride/<rideId>/chat` |
| 5 | Sender's own phone | Shows nothing for their own message |
| 6 | Recipient has the app open (foreground) | Socket message appears in the chat; the local notification shows as before (see 5.2 for hiding it while the chat is open) |
| 7 | Rider sends 5 messages fast, driver app killed | The tray shows one collapsed entry for that ride, not five (app-side collapse by `rideId`) |
| 8 | Ride completed or cancelled, someone sends a message | No push is sent |
| 9 | Tap a chat push when the active ride is not loaded yet (driver) | Falls back to `/home`, no crash |
| 10 | Notification permission denied | No notification; the message is still in the chat when the app is opened |

Debug on the driver device: `adb logcat -s NEW_ORDER:V flutter:V`. You should see the push arrive and `NEW_ORDER` ignore it.

If nothing arrives at all: ask the backend owner to check the server log for `[push] NOT SENT` (Firebase key missing on the server) and that the user's FCM token is registered (the same token registration used for ride requests and wallet credits).

## 5. Optional improvements (not required for the feature)

### 5.1 Unread badge
Neither app counts unread chat messages. Add a counter where the socket messages are appended (driver: `ride_providers.dart`, rider: `ride_tracking_controller.dart`), increment for messages whose `senderRole` is the other side, and clear it when the chat screen opens. Show it on the chat button.

### 5.2 Do not alert someone who is already reading
When the chat screen is the top route, skip the local notification for `ride_message` (the message is already visible). Only the app knows this; the server cannot.

### 5.3 Tray tidiness
The app collapses per ride with a notification id derived from `rideId`. If you prefer server-side collapsing later, the backend can set an FCM collapse key `chat_<rideId>`; note that an offline phone then receives only the latest message's push.

## 6. Payload examples

Rider -> driver (shown on the driver phone):

```json
{
  "notification": { "title": "Asha", "body": "I am at the gate" },
  "data": { "type": "ride_message", "rideId": "665f1c2e9a3b4d0012ab34cd" }
}
```

Handling a tap (both apps), sketch:

```dart
void onNotificationTap(Map<String, dynamic> data) {
  if (data['type'] == 'ride_message') {
    final rideId = data['rideId'] as String?;
    if (rideId == null || rideId.isEmpty) return;
    // rider:  router.go('/ride/$rideId/chat');
    // driver: router.go(activeRideLoaded ? '/ride-chat' : '/home');
  }
}
```

## 7. Backend map

`services/rideChatPushService.js` (who gets the push and its payload), `socket/handlers/rideSocketHandler.js` (sends it after `ride:message:new`), `services/rideService.js` (`appendRideMessageWithParticipants`), tests in `test/integration/rideChatPush.test.js`. The push uses the existing `sendPushNotificationToEntities`; no change to ride-request pushes.
