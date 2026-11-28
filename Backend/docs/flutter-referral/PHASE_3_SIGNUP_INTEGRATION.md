# Phase 3: Send the token at signup (rider and driver)

**Goal:** a friend who came through a link signs up **without typing anything**, and the backend links them to the inviter. Needs Phase 2 (a saved token).

## Rules the backend applies (so you know what to expect)

- The account is **always created**, even if the token is expired, used, unknown, for the wrong app type, or a self-referral. The response tells you if the referral was applied.
- **No reward at signup.** It is paid after the friend's first completed ride.
- A token and a typed code that belong to **different people** are rejected (`400 referral_mismatch`). So send the token alone when you have one.
- A wrong **typed** code is still `400 Invalid referral code` (old behaviour).

## Rider app (`flutter_taxi_user`)

Files: `lib/features/auth/presentation/profile_setup_screen.dart`, `lib/features/auth/application/auth_controller.dart`, `lib/features/auth/data/auth_repository.dart`.

### 1. Repository: add the token to the signup body

`signup(...)` currently sends `referralCode`. Add an optional `attributionToken`:

```dart
Future<AuthSession> signup({
  required String phone,
  required String name,
  String? email,
  String? gender,
  String? referralCode,
  String? attributionToken,
}) async {
  final data = await api.post(ApiConstants.signup, data: {
    'phone': phone,
    'name': name,
    if (email != null && email.isNotEmpty) 'email': email,
    if (gender != null && gender.isNotEmpty) 'gender': gender,
    if (attributionToken != null && attributionToken.isNotEmpty)
      'attributionToken': attributionToken
    else if (referralCode != null && referralCode.isNotEmpty)
      'referralCode': referralCode,   // token wins: never send both
  });
  final referral = Map<String, dynamic>.from(data['referral'] ?? {});
  return AuthSession(
    token: data['token'].toString(),
    user: UserModel.fromJson(Map<String, dynamic>.from(data['user'] ?? {})),
    referralApplied: referral['applied'] == true,
    referralReason: (referral['reason'] ?? '').toString(),
  );
}
```

Add `referralApplied` (bool, default false) and `referralReason` (String, default `''`) to `AuthSession`.

### 2. Controller: read the saved token and clear it

In `auth_controller.dart`, inside the signup method:

```dart
final token = await ref.read(referralAttributionServiceProvider).readToken();
final session = await repo.signup(
  phone: phone, name: name, email: email, gender: gender,
  referralCode: referralCode,
  attributionToken: token,
);
await ref.read(referralAttributionServiceProvider).clear();   // after ANY success
```

Clear the token after a successful signup whether `applied` is true or false: it is used or useless either way.

### 3. Screen: hide the code box when a token exists

In `profile_setup_screen.dart` (field `_referralController`, label "Referral code (optional)"):

- On open, read `readToken()` once into a `_hasToken` flag.
- If `_hasToken`: **hide** the referral code field and show a small line "You were invited by a friend". Do not ask for anything.
- If no token: keep the optional code field exactly as today (the iOS and "someone just told me a code" fallback).
- Never send both: if `_hasToken`, pass `referralCode: null`.

### 4. After signup

- `referralApplied == true`: show a short, non-blocking message: "Your friend's reward will arrive after your first ride."
- `false`: show nothing. Optionally log `referralReason` (without the token).
- Errors:
  - `400` with `details.code == referral_mismatch`: only possible if both were sent; treat as a bug, retry once without the code.
  - `400` "Invalid referral code" (typed field): show it as a field error, as today.

## Driver app (`flutterdriver`)

Files: `lib/features/auth/data/signup_repository.dart` (`saveReferral` already calls `PATCH /drivers/onboarding/referral`) and the onboarding step that calls it.

### 1. Repository

```dart
Future<void> saveReferral({
  required String registrationId,
  required String phone,
  String referralCode = '',
  String employeeCode = '',
  String attributionToken = '',
}) {
  return _api.patch(ApiConstants.onboardingReferral, data: {
    'registrationId': registrationId,
    'phone': phone,
    if (attributionToken.isNotEmpty) 'attributionToken': attributionToken
    else 'referralCode': referralCode,
    'employeeCode': employeeCode,
  });
}
```

### 2. When to call it

The token is **bound** to this onboarding when `saveReferral` succeeds, and **converted into the referral when onboarding is completed** (`POST /drivers/onboarding/complete`). So:

- If a token exists: call `saveReferral(attributionToken: token)` automatically, with no user action, at the referral step. If your flow has no referral step for this user, call it just before `complete`.
- If no token: keep today's manual code input and send `referralCode` as before.
- Call order stays: ... personal, vehicle, documents, **referral**, `complete`.

### 3. Failure handling (important)

Referral must never block onboarding:

| Response | Action |
| --- | --- |
| 200 | continue |
| 404 `invalid_attribution`, 410 `attribution_expired`, 409 `already_attributed`, 400 `referral_type_mismatch` or `self_referral` | clear the token, **continue onboarding** |
| network error | keep the token, retry once right before `complete`, then continue anyway |
| 400 "Invalid referral code" for a **typed** code | show as a field error (user can correct it) |

After `POST /drivers/onboarding/complete` succeeds, call `clear()`.

If the driver changes the referral step (token vs typed code), the backend releases the earlier link automatically.

## Edge cases

| Case | Behaviour |
| --- | --- |
| Existing user logs in (OTP says account exists) | No signup, token ignored. Optionally `clear()` |
| User abandons signup and returns later | Token still saved until `expiresAt`; works if not expired |
| Rider link used in the driver app | Ignored by the backend (`referral_type_mismatch`), onboarding continues |
| Two friends share one phone | Only one account per phone; second attempt is "already registered" as today |
| Token present but user types a different code (rider) | You hide the field, so this cannot happen |

## Acceptance

- [ ] Rider: install from a link, sign up with name and phone only. The inviter's `referralCount` increases by 1.
- [ ] Rider: signup with an expired/invalid token still succeeds.
- [ ] Rider: no token, manual code still works.
- [ ] Driver: onboarding with a token completes; `referredBy` is set in the admin/driver record.
- [ ] Driver: a 404/409/410 on the referral call never stops onboarding.
- [ ] The token is cleared after success.
- [ ] No wallet amount is shown at signup.
