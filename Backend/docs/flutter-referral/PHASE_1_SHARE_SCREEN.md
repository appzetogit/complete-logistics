# Phase 1: Share screen (rider and driver apps)

**Goal:** the member sees their code and shares the **link**. This phase is safe to ship alone: it only needs the new "my referral" endpoint.

## API

`GET /users/referrals/me` (rider) or `GET /drivers/referrals/me` (driver), with the usual login token.

```json
{ "referralCode": "USR51937DEAE",
  "referralLink": "https://yourdomain.com/r/USR51937DEAE",
  "referralCount": 3,
  "program": { "enabled": true, "type": "instant_referrer_new", "amount": 50, "rideCount": 1 } }
```

(The `ApiClient` already unwraps `data`, so in Dart you read these keys directly.)

If the member has no code yet, the backend creates one on this call.

## Rider app (`flutter_taxi_user`)

Existing screen: `lib/features/rewards/presentation/rewards_screen.dart`. It reads `user?.referralCode` and shares text containing the code.

1. **API constant** in `lib/core/constants/api_constants.dart`:
   ```dart
   static const String referralMe = '/users/referrals/me';
   ```
2. **Model** `lib/features/rewards/data/models/referral_info.dart`:
   ```dart
   class ReferralInfo {
     final String code;
     final String? link;
     final int count;
     final bool programEnabled;
     final String programType;
     final num amount;
     final int rideCount;

     const ReferralInfo({
       required this.code, required this.link, required this.count,
       required this.programEnabled, required this.programType,
       required this.amount, required this.rideCount,
     });

     factory ReferralInfo.fromJson(Map<String, dynamic> j) {
       final p = Map<String, dynamic>.from(j['program'] ?? {});
       return ReferralInfo(
         code: (j['referralCode'] ?? '').toString(),
         link: j['referralLink']?.toString(),
         count: (j['referralCount'] ?? 0) as int,
         programEnabled: p['enabled'] == true,
         programType: (p['type'] ?? '').toString(),
         amount: (p['amount'] ?? 0) as num,
         rideCount: (p['rideCount'] ?? 0) as int,
       );
     }
   }
   ```
3. **Repository** `lib/features/rewards/data/referral_repository.dart`:
   ```dart
   class ReferralRepository {
     final ApiClient api;
     ReferralRepository(this.api);

     Future<ReferralInfo> getMyReferral() async {
       final data = await api.get(ApiConstants.referralMe);
       return ReferralInfo.fromJson(Map<String, dynamic>.from(data));
     }
   }
   ```
4. **Provider** (Riverpod, same style as the other features): a `FutureProvider<ReferralInfo>` that calls the repository. Invalidate it on pull-to-refresh.
5. **Screen changes** in `rewards_screen.dart`:
   - Read `ReferralInfo` from the provider instead of `user?.referralCode`. Show loading and error states.
   - Keep the **Copy code** button.
   - Change the **Share** button to share the link:
     ```dart
     Share.share('Join me on <App name>. Sign up with this link: ${info.link ?? info.code}');
     ```
     Do not mention the code in the message; the link carries everything. If `link` is null (domain not configured), fall back to sharing the code text.
   - Show `count` ("Friends joined: 3").
   - Replace the static "how it works" steps with the program from the response (see Phase 5 for wording).
   - If `programEnabled == false`, show "Referral rewards are not available right now" instead of the share card.

## Driver app (`flutterdriver`)

Existing: a Refer & Earn tile in `lib/features/profile/presentation/profile_screen.dart` that only copies the code (and is shown only when the driver has a code).

1. Add the constant `referralMe = '/drivers/referrals/me'` in `lib/core/constants/api_constants.dart`, plus the same `ReferralInfo` model and repository (the code is identical; copy it or move it to a shared package if you have one).
2. Create a **Refer & Earn screen** and register a route in `lib/app/router.dart` (for example `/refer-and-earn`).
3. Change the tile's `onTap` from "copy code" to `context.push('/refer-and-earn')`. Keep the rule that the tile is hidden until the backend has issued a code (the `/me` call issues one, so you can now always show the tile when `programEnabled`).
4. The screen has the same content as the rider screen: code with copy, Share link button, friends count, how-it-works text.

## Edge cases

| Case | Behaviour |
| --- | --- |
| `403`/network error | Show a retry state, never crash |
| `programEnabled == false` | Hide the share card, show a short "not available" message |
| `link == null` | Fall back to sharing the code text |
| Very long names/codes | Code uses `SelectableText`/ellipsis, no overflow |

## Acceptance

- [ ] Rider and driver both open the screen and see the same code on every launch.
- [ ] **Share** opens the system sheet with a `https://<domain>/r/<CODE>` link.
- [ ] Copy code works and shows a confirmation.
- [ ] Program disabled by admin: share card hidden.
- [ ] Offline: error state with retry, no crash.
