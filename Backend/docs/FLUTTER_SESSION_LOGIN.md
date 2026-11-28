# Flutter: staying logged in (session length fix)

For the Flutter developer (rider `flutter_taxi_user`, driver `flutterdriver`). Users were being logged out of the apps every 7 days. This file explains the cause, what changed on the backend, and what the apps must (and must not) do.

## 1. Cause

The login returns one JWT access token (`data.token`). There is **no refresh token**, so the token's lifetime is the whole session. It expired after 7 days, the next request got `401`, and the app sent the user back to login.

## 2. Backend change

| Role | Token lifetime now |
| --- | --- |
| Rider, driver, owner, bus driver, pooling driver, service center | **90 days** (`JWT_APP_EXPIRES_IN`, default `90d`) |
| Admin panel | 7 days (unchanged) |

Nothing else about login changed: same endpoints, same response shape (`token`), same `Authorization: Bearer <token>` header. The new lifetime applies to tokens issued **after** the backend is deployed.

Important consequences:
- People who are already logged in hold an old 7-day token. They will be logged out **once more** when that token expires. After that login they get a 90-day token.
- There is still no refresh. After 90 days of the same login the user logs in again. This is expected.
- A longer token does not weaken account control: on every request the backend still checks the account (deleted, inactive, blocked, driver not approved) and refuses it immediately; rider logout ends the session at once.

## 3. What the apps must do

Most of this is probably already how the apps work; please verify each point, because a wrong 401 handler can log users out even with a valid token.

### 3.1 Store the token safely and keep it across restarts
- Use secure storage (`flutter_secure_storage`), not memory only. Read it at app start before deciding the first screen.
- Do not delete it on app update, on app start, or on a failed network call.

### 3.2 Log out only for the right errors
Clear the token and go to login **only** for a `401` from an authenticated call whose message/code means the session is really gone:

| HTTP | Message / code | Meaning | Action |
| --- | --- | --- | --- |
| 401 | `jwt expired` | Token lifetime ended | Log out, go to login |
| 401 | `Invalid authorization token` | Token broken/forged | Log out |
| 401 | `You have logged out. Please log in again.` (`code: SESSION_ENDED`) | Rider logged out elsewhere | Log out |
| 401 | `Authenticated account no longer exists` / `User account is not active` | Account deleted/blocked | Log out, show the message |
| 401 | `Authorization token is required` | Header missing (app bug) | Log, fix the call; do not loop |

Do **not** log out for:
- `403` (for example `Driver account is pending approval`, `Insufficient permissions`): the token is fine; show the message or the pending screen.
- `5xx`, timeouts, no internet, DNS errors, `502/503`: the server or network failed, the session is fine. Keep the token, show "try again".
- `400`, `404`, `409`, `429`: normal business errors.

A common mistake is a global Dio interceptor that logs out on **any** non-2xx or on any error. Check yours:

```dart
onError: (e, handler) async {
  final status = e.response?.statusCode;
  final message = (e.response?.data is Map ? e.response!.data['message'] : '')?.toString() ?? '';
  final sessionGone = status == 401 && !_isLoginRequest(e.requestOptions) && _isSessionError(message);
  if (sessionGone) {
    await authStorage.clear();
    router.go('/login');
  }
  handler.next(e);
}

bool _isSessionError(String m) =>
    m.contains('jwt expired') ||
    m.contains('Invalid authorization token') ||
    m.contains('logged out') ||
    m.contains('no longer exists') ||
    m.contains('not active');
```

Do not treat a 401 from the login / OTP-verify endpoints as "session ended" (wrong OTP is a 401 there too in some flows): skip those requests in the interceptor.

### 3.3 Several 401s at once
When the token expires, many parallel requests fail together. Log out once (guard with a flag), do not stack several navigations to `/login`.

### 3.4 Socket
The socket connects with the same token (`auth: { token }`). After login with a new token, reconnect the socket with it. On a socket `connect_error` caused by an expired token, treat it like 3.2 (log out); on other connect errors just retry.

### 3.5 Friendly expiry
If the token is expired (decode the JWT `exp` claim locally, no network needed), the app can send the user to login at start-up instead of showing a screen full of errors. Optional.

## 4. Testing

| # | Scenario | Expected |
| --- | --- | --- |
| 1 | Log in, close and reopen the app | Still logged in, home screen directly |
| 2 | Log in on a build that points to the **updated** backend, decode the token (`jwt.io`, never paste real tokens in public tools) | `exp - iat` is about 90 days |
| 3 | Turn off internet and open the app | Home/cached screen with "no connection"; **not** the login screen |
| 4 | Server returns 503 for a call | Error message, still logged in |
| 5 | Driver account pending approval (403) | Pending screen, token kept |
| 6 | Rider taps Logout, then an old token is used | 401 `SESSION_ENDED` -> login |
| 7 | Token deleted/expired on purpose (use a short-lived token from a test backend) | One redirect to login, no loop, no crash |
| 8 | Two requests fail with 401 at the same moment | Single navigation to login |

## 5. Not needed

- No new endpoint, no refresh-token code, no change to the login screens.
- No change to how the token is sent.

## 6. Backend map

`src/modules/taxi/services/tokenService.js` (lifetime per role), `src/config/env.js` (`JWT_APP_EXPIRES_IN`, default `90d`; `JWT_EXPIRES_IN` now only affects the admin panel), test in `tokenService.test.js`. The server's `.env` can set `JWT_APP_EXPIRES_IN=30d` / `180d` if the business wants a different length.
