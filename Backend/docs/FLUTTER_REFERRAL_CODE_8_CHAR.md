# Flutter: referral code is now 8 characters

For the Flutter developer (rider `flutter_taxi_user`, driver `flutterdriver`). The referral code used to be long (13 to 17 characters, for example `USR1234AB12CD` or `DRV5678EF90AB12`). New codes are exactly **8 characters**. This file says what changed on the backend, what the apps must show and accept, and what to test.

Related: `REFERRAL_AUTOMATIC_ATTRIBUTION.md` (the link and token flow, unchanged) and `REFERRAL_AND_EARN_BACKEND_FLOW.md` (rewards, unchanged).

## 1. What changed

| | Before | Now |
| --- | --- | --- |
| Rider code | `USR` + last 4 phone digits + 6 id characters (13+ chars) | `U` + 7 random characters, for example `U7K2M9QX` |
| Driver code | `DRV` + last 4 phone digits + 6 id characters (13+ chars) | `D` + 7 random characters, for example `D6NKQ7QE` |
| Characters | letters and digits | upper case `A-Z` and `2-9`, **without** `0 O 1 I L` (easy to read out and type) |
| Unique | per rider list and per driver list | across riders and drivers together |
| Phone digits in the code | yes | **no** (the code no longer contains any part of the phone number) |

Nothing else about referrals changed: same endpoints, same responses, same share link format, same rewards.

### Old codes keep working
People already shared old codes and links. The backend keeps every retired code on the account, so:
- typing an old long code at signup still finds the right referrer;
- an old link `https://<domain>/r/USR1234AB12CD` still opens and issues a token.

After the backend migration each account **shows** the new 8 character code (from `GET .../referrals/me`). The old one is only accepted as input.

## 2. What the apps must do

### 2.1 Show the code the server gives you
Always display and share `data.referralCode` and `data.referralLink` from the API. Never build a code on the phone from the phone number or user id.

```
GET /api/v1/users/referrals/me      (rider, Bearer token)
GET /api/v1/drivers/referrals/me    (driver, Bearer token)
```

```json
{
  "success": true,
  "data": {
    "referralCode": "U7K2M9QX",
    "referralLink": "https://<domain>/r/U7K2M9QX",
    "referralCount": 3,
    "program": { "enabled": true, "type": "instant_referrer", "amount": 50, "rideCount": 0 }
  }
}
```

The code is stable: the same account gets the same code on every call. Cache it for the session, refresh it when the screen opens.

### 2.2 The code input field (signup)
The field where a new user types a friend's code must accept both new and old codes:

| Setting | Value |
| --- | --- |
| Max length | **20** (not 8: a friend may still give an old long code) |
| Capitalisation | upper case (`TextCapitalization.characters` plus an upper-casing formatter) |
| Trim | remove spaces before sending |
| Allowed characters | letters and digits |
| Client side check | none besides "not empty"; the server decides if the code is valid |

Do **not** add a client rule like "must be 8 characters" or "must start with USR / DRV". Both would reject valid old codes.

```dart
class UpperCaseTrimFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    final cleaned = newValue.text.replaceAll(RegExp(r'[^A-Za-z0-9]'), '').toUpperCase();
    return newValue.copyWith(
      text: cleaned,
      selection: TextSelection.collapsed(offset: cleaned.length),
    );
  }
}

TextField(
  maxLength: 20,
  textCapitalization: TextCapitalization.characters,
  inputFormatters: [UpperCaseTrimFormatter()],
  // ...
)
```

### 2.3 Do not guess the account type from the code
Old logic in the apps (or in your own validators) may look at the prefix to decide rider or driver. Remove it. The server decides, and answers `referral_type_mismatch` (400) when a driver code is used for a rider signup or the other way round.

### 2.4 Layout
8 characters are shorter than before. Check these places so nothing looks stretched or breaks:
- the referral screen (large code text, copy button, share button);
- the share message text (WhatsApp / SMS), which should contain `referralLink` and may mention the code;
- any card or chip that used a fixed width for the old long code.

Show the code in a monospace or letter spaced style so `U7K2M9QX` reads clearly.

## 3. API calls that take a code (unchanged, listed for reference)

### Rider signup
`POST /api/v1/users/signup`

```json
{
  "name": "Asha",
  "phone": "9876543210",
  "email": "asha@example.com",
  "referralCode": "U7K2M9QX",
  "attributionToken": "<token from an opened link, if any>"
}
```

The token (from `GET /r/<code>`) wins over a typed code. Send `referralCode` only when the person typed it.

### Driver onboarding
`PATCH /api/v1/drivers/onboarding/referral`

```json
{ "registrationId": "...", "phone": "98...", "referralCode": "D6NKQ7QE" }
```

An unknown code answers `400 Invalid referral code`.

### Opening a shared link
`GET https://<domain>/r/<code>` (no `/api`), unchanged. With `?format=json` it returns `{ attributionToken, referralType, referralCode, expiresAt }`. Old and new codes both work.

### Errors you may get for a code

| HTTP | `code` | Message | What to show |
| --- | --- | --- | --- |
| 404 | `invalid_referral` | Invalid referral code | "This referral code was not found. Check it and try again." |
| 400 | `self_referral` | You cannot refer yourself | The message |
| 400 | `referral_type_mismatch` | This referral link is for a different kind of account | The message |
| 403 | `referral_disabled` | Referral program is disabled | The message |
| 404 | `referrer_not_found` | Referrer not found | "This referral code is no longer active" |

A bad **link token** does not block creating the account (the app is told why and continues). A bad **typed code** is a 400 on the rider signup and on the driver onboarding referral step: show the message and let the person fix or clear the code.

## 4. Backend behaviour worth knowing

- A code is created the first time the account opens the referral screen or signs up. Until then `referralCode` can be empty: just call `referrals/me`.
- New codes never contain the phone number, so sharing a code does not leak part of a mobile number (the older codes did).
- The backend team converts existing accounts with a one-time script. Until it runs, an account still shows its old long code; after it runs the app shows the new short one without any app change.

## 5. Test checklist

| # | Scenario | Expected |
| --- | --- | --- |
| 1 | New rider opens the referral screen | An 8 character code starting with `U`, link `https://<domain>/r/<code>` |
| 2 | New driver opens the referral screen | An 8 character code starting with `D` |
| 3 | Open the screen again, restart the app | Same code every time |
| 4 | Copy and Share | The new code and link are copied / shared |
| 5 | Signup with a friend's new code in the field | Accepted, referrer set (check `referrals/history` of the friend) |
| 6 | Signup with an old long code (ask backend for one) | Accepted, same referrer |
| 7 | Type lower case with spaces (`u7k2 m9qx`) | Field turns it into `U7K2M9QX` |
| 8 | Paste a code longer than 8 characters | Not cut off (up to 20) |
| 9 | Unknown code `ZZZZZZZZ` | "Invalid referral code" message, no crash |
| 10 | Own code on own signup | `self_referral` message |
| 11 | Driver code in the rider signup field | `referral_type_mismatch` message |
| 12 | Open an old link `/r/<old code>` and a new link | Both open the app and give a token |
| 13 | Layout on a small phone and with large font | Code and buttons fit, no overflow |

## 6. Not needed

- No new endpoint, no new field, no change to rewards or to `referralLink` handling.
- No change to deep link setup (the `/r/<code>` path is the same).

## 7. Backend map

`referral/services/referralAttributionService.js` (`generateReferralCode`, `allocateReferralCode`, `ensureReferralCode`, `findReferrerByCode`), `referral/controllers/referralController.js` (`getMyReferral`), models `User` and `Driver` (`referralCode`, `legacyReferralCodes`), one-time conversion `scripts/shortenReferralCodes.js`, tests `test/integration/referralAttribution.test.js`.
