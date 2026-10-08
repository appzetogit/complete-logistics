# Push notifications not arriving – cause, fix, and how to check

## Most likely cause on the live server
The server `.env` that was shared has these **empty**:
```
FIREBASE_SERVICE_ACCOUNT_JSON=
FIREBASE_DATABASE_URL=
```
Without a Firebase service account the backend cannot send any FCM message. Before this change it did nothing and logged
nothing, so ride-request, ride-accepted and every other push were silently skipped.

## Fix (server)
1. Firebase Console -> Project settings -> **Service accounts** -> *Generate new private key* (a `.json` file).
   Use the **same Firebase project** the Flutter apps use (`google-services.json` / `GoogleService-Info.plist`).
2. Put the key on the server, either:
   - `FIREBASE_SERVICE_ACCOUNT_JSON=<the whole JSON on one line>` in `.env`, **or** (easier, no quoting problems)
   - save the file somewhere outside the repo, e.g. `/var/www/secrets/firebase.json`, and set
     `FIREBASE_SERVICE_ACCOUNT_PATH=/var/www/secrets/firebase.json`.
3. `pm2 restart complete-logistics-backend --update-env`
4. The log now says either `[push] Firebase configured (project <id>)` or `[push] PUSH NOTIFICATIONS ARE OFF - <reason>`.

Never commit that JSON key (it is a secret).

## Check it works – admin API (admin token)
- `GET /api/v1/admin/push/status`
  ```json
  { "data": {
      "firebase": { "configured": true, "projectId": "…", "clientEmail": "…", "reason": "" },
      "tokens": { "users": { "total": 120, "withToken": 80 },
                  "drivers": { "total": 30, "withToken": 25 },
                  "onlineDrivers": { "total": 6, "withToken": 5 } },
      "hints": [ "1 online driver(s) have no device token and cannot get ride-request pushes." ] } }
  ```
  `hints` lists what is wrong in plain words (no Firebase key, nobody has saved a device token, online drivers without a token).
- `POST /api/v1/admin/push/test` `{ "driverId": "<id>" }` or `{ "userId": "<id>" }` sends one real push and returns what happened:
  `deliveredCount`, `failedCount`, and `errors: [{ code, message, count }]` with the Firebase error code
  (for example `messaging/mismatched-credential` = the key belongs to a different Firebase project than the app;
  `messaging/registration-token-not-registered` = old/uninstalled token, removed automatically).

## Logs (PM2)
- `[push] NOT SENT - …` Firebase is not configured (logged at most once a minute).
- `[push] not sent: no saved FCM token for the recipient …` that user/driver never saved a token.
- `[push] N/M failed for "<title>": <code> xN (<message>)` Firebase rejected some tokens.

## If the server is configured but a phone still gets nothing
- The app must save its token after **every login**: `POST /users/fcm-token` (user token) or `POST /drivers/fcm-token`
  (driver token) with `{ "token": "<FCM token>", "platform": "android" | "ios" }`. `GET /admin/push/status` shows how many
  users/drivers have one.
- Android 13+: the app must ask for the notification permission. iOS: APNs key uploaded in the Firebase project.
- The token is stored once per account (mobile token wins over a web token), so the latest logged-in device receives pushes.
- Check the server and the apps use the same Firebase project (`projectId` from the status call vs the app's config).
