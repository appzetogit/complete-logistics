# Phase 2: Capture the token from the link

**Goal:** when a friend arrives through a shared link, the app ends up holding an **attribution token** before signup. This is the core of the feature and the riskiest phase, so build it as one small, well-tested service.

Do Phase 0 first: you need the domain, store URLs and the App Links / iOS decisions.

## How a token is born

`GET https://<domain>/r/<CODE>` is handled by the backend:

- Browser: records the click, then redirects (302). Android users go to the Play Store URL with `referrer=attribution_token%3D<token>`. Other visitors go to the landing page with `?attribution_token=<token>`.
- With `?format=json` (or `Accept: application/json`): returns `{ "attributionToken": "...", "referralType": "user|driver", "referralCode": "...", "expiresAt": "..." }`.
- Chat link-preview bots get a redirect without a token (they are not people).
- A bad or disabled link still redirects, just without a token.

A token is valid for 7 days by default (`expiresAt`), becomes exactly one account, and every link open creates a **new** token.

## The service (build this in both apps)

File: `lib/core/referral/referral_attribution_service.dart`

```dart
class ReferralAttributionService {
  ReferralAttributionService(this._api, this._storage);
  final ApiClient _api;               // existing client
  final FlutterSecureStorage _storage; // or the project's SecureStorageService

  static const _kToken = 'referral_attribution_token';
  static const _kExpires = 'referral_attribution_expires_at';

  /// Latest valid token, or null. Drops expired ones.
  Future<String?> readToken() async {
    final token = await _storage.read(key: _kToken);
    if (token == null || token.isEmpty) return null;
    final exp = DateTime.tryParse(await _storage.read(key: _kExpires) ?? '');
    if (exp != null && exp.isBefore(DateTime.now())) {
      await clear();
      return null;
    }
    return token;
  }

  Future<void> save(String token, {DateTime? expiresAt}) async {
    await _storage.write(key: _kToken, value: token);
    await _storage.write(key: _kExpires, value: expiresAt?.toIso8601String() ?? '');
  }

  Future<void> clear() async {
    await _storage.delete(key: _kToken);
    await _storage.delete(key: _kExpires);
  }

  /// Tell the backend this device holds the token. Never throws.
  Future<void> claim(String token) async {
    try {
      await _api.post('/referrals/attribute', data: {'attributionToken': token});
    } on ApiException catch (e) {
      // 404 invalid, 410 expired, 409 used: this token is useless, drop it silently
      if ([404, 409, 410].contains(e.statusCode)) await clear();
    } catch (_) {/* offline etc.: keep the token, signup will try again */}
  }
}
```

Match the real `ApiClient`/`ApiException` names in `lib/core/network/` (the snippet shows the intent, not exact signatures). Register the service in Riverpod like the other services.

Rules:
- **Latest valid token wins.** If the user opens two links, the later token replaces the earlier one.
- Never log the token, never show it, never send it to analytics.
- Every failure is silent. This service must not break app start.

## Capture paths

### A. Android, app installed from the Play Store link (main path)

1. On the **first launch after install only**, read the Play Install Referrer. Use a maintained plugin such as `android_play_install_referrer` (check the current version and API on pub.dev; add it to `pubspec.yaml`).
2. The referrer string looks like `attribution_token=<token>` (possibly with other keys). Parse it with `Uri.splitQueryString` and take `attribution_token`.
3. Call `save(token)` then `claim(token)`.
4. Remember that you already read it (a `SharedPreferences` flag) so it runs once.
5. Run this during splash, **before** the signup/onboarding screens are shown. Do not make the user wait: use a short timeout (about 2 seconds) and continue if it fails.

```dart
Future<void> captureFromInstallReferrer() async {
  final prefs = await SharedPreferences.getInstance();
  if (prefs.getBool('install_referrer_read') == true) return;
  try {
    final details = await AndroidPlayInstallReferrer.installReferrer
        .timeout(const Duration(seconds: 2));
    final params = Uri.splitQueryString(details.installReferrer ?? '');
    final token = params['attribution_token'];
    if (token != null && token.isNotEmpty) {
      await save(token);
      await claim(token);
    }
  } catch (_) {/* not from Play Store, or no referrer */}
  await prefs.setBool('install_referrer_read', true);
}
```

(Adapt the class and property names to the plugin you choose.)

### B. App already installed, user taps the link (needs Phase 0 item 0.7)

1. Configure Android App Links and iOS Universal Links for `https://<domain>/r/*` (intent filter and associated domains, plus the files from DevOps).
2. Listen for incoming links (for example the `app_links` package, and make go_router ignore `/r/...` as a screen route).
3. For an incoming URI:
   - If it has `attribution_token=<token>`: `save(token)` then `claim(token)`.
   - Else if the path is `/r/<CODE>`: the backend was **not** involved in this tap, so ask for a token yourself:
     `GET <ReferralConfig.linkBase>/r/<CODE>?format=json`, then save `data.attributionToken` with `data.expiresAt`, then `claim`.
4. Do this on cold start (initial link) and while running (link stream).
5. If the member is **already logged in**, do nothing: an existing account cannot be referred. Do not show an error.

### C. iOS fresh install

There is no Install Referrer on iOS, so there is no automatic token after a fresh App Store install. For launch:

- Rely on path B when the app is already installed.
- Keep the **manual code field** at signup (Phase 3) as the fallback for new installs.
- A future improvement (landing page that passes the token through the clipboard, or a deferred deep-link service) is a separate product decision. Do not build it in this phase.

## Where to call it

In app start (splash/bootstrap), before routing to onboarding:

```dart
await ref.read(referralAttributionServiceProvider).captureFromInstallReferrer();
```

and register the link listener for path B once at startup. Skip all of it if the user is already logged in.

## Driver app note

Same service, same code. A rider link used in the driver app (or the reverse) is not an error for the user: the backend answers `referral_type_mismatch` later and the app ignores it.

## Edge cases

| Case | Behaviour |
| --- | --- |
| No network at first launch | Install Referrer is local and still works; `claim` fails silently, token kept |
| Token expired before signup | `readToken()` returns null; signup proceeds without referral |
| User opens link, then another link | Newer token replaces the older |
| App reinstalled | Install Referrer runs again on the new install; old token is gone |
| Logged-in member taps a link | Ignore |
| Link without a valid code | `GET /r/<CODE>?format=json` returns 404: ignore |

## Acceptance

- [ ] Clean Android install from a shared Play Store link: before the signup screen appears, `readToken()` returns a value.
- [ ] Install without a link: `readToken()` is null and nothing is shown or logged.
- [ ] With App Links (if enabled): tapping a `/r/<CODE>` link on an installed app saves a token and does not open a blank screen.
- [ ] Airplane mode at launch does not crash or delay splash.
- [ ] The token never appears in logs, crash reports or analytics.
