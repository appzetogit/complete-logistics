# Phase 0: Prerequisites (no app code)

**Goal:** make sure everything the apps depend on exists before anyone writes Flutter code. Most items belong to the backend/DevOps owner. The Flutter developer's job is to **confirm each one** and write the values down.

## Checklist

| # | Item | Owner | Done when |
| --- | --- | --- | --- |
| 0.1 | **Referral domain** chosen, e.g. `https://yourdomain.com`. The share link will be `<domain>/r/<CODE>`. | Backend/DevOps | Value written into the app config (see below) |
| 0.2 | Backend env set: `REFERRAL_BASE_URL`, `REFERRAL_ANDROID_STORE_URL`, `REFERRAL_IOS_STORE_URL`, `REFERRAL_LANDING_URL` (optional `REFERRAL_ATTRIBUTION_TTL_HOURS`, default 168) | Backend | `curl -i <domain>/r/<CODE>` returns **302** to the store/landing page |
| 0.3 | Web server (nginx/proxy) forwards **`/r/*`** to the backend. It is *not* under `/api`. | DevOps | Same curl works through the public domain |
| 0.4 | Referral database migration run on production (unique codes). | Backend | Backend owner confirms |
| 0.5 | Admin has enabled the program: Admin > Referral settings > user and driver, amount > 0. | Admin | `GET /common/referrals/settings?type=user` shows `enabled: true` |
| 0.6 | A staging backend and staging builds of both apps. | Team | Test accounts available |
| 0.7 | Decide **App Links / Universal Links** (open the installed app directly from the link). Needs `assetlinks.json` (Android) and `apple-app-site-association` (iOS) hosted on the domain, plus intent filters / associated domains in the apps. The backend does **not** serve these files. | Product + DevOps | Yes/No decision recorded. If No, Phase 2 uses only the Android Install Referrer |
| 0.8 | Decide the **iOS** approach. App Store installs have no Install Referrer, so there is no automatic token after a fresh install. Launch with the manual code field as fallback (recommended), or plan a deferred-deep-link solution later. | Product | Decision recorded |

## Quick check for the developer

```bash
# 1. link is live and redirects (use a real code from GET /users/referrals/me)
curl -i https://yourdomain.com/r/USR51937DEAE

# 2. JSON mode returns a token
curl -s "https://yourdomain.com/r/USR51937DEAE?format=json"
# -> { "success": true, "data": { "attributionToken": "...", "referralType": "user", ... } }

# 3. settings are public
curl -s "https://yourdomain.com/api/v1/common/referrals/settings?type=user"
```

If step 1 returns the API's JSON error instead of a redirect, the store URLs are not configured. If it returns a web server 404, `/r/*` is not forwarded (0.3).

## What you add to the apps in this phase

Only configuration. In **both** apps, next to the existing API constants (`lib/core/constants/api_constants.dart`), add the referral domain and path helpers:

```dart
class ReferralConfig {
  // the site root, NOT the /api/v1 base URL
  static const String linkBase = String.fromEnvironment(
    'REFERRAL_LINK_BASE',
    defaultValue: 'https://yourdomain.com',
  );
  static Uri linkFor(String code) => Uri.parse('$linkBase/r/$code');
}
```

Use `--dart-define=REFERRAL_LINK_BASE=https://staging.yourdomain.com` for staging builds.

## Acceptance

- [ ] 0.1 to 0.8 are all answered and written in the ticket.
- [ ] The three `curl` checks pass on staging.
- [ ] Decisions on App Links (0.7) and iOS (0.8) are recorded, because they change Phase 2.
