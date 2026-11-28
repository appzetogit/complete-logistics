# Automatic referral attribution (backend)

The referred person no longer types a code. The referrer shares a **link**; the backend records the click, hands the app an **attribution token**, and the app sends that token at signup. The referrer is now found from the link. **Rewards are paid on the first completed ride, never at signup** (see "When rewards are paid").

```
User/Driver A  GET /users|drivers/referrals/me  ->  { referralCode, referralLink }
A shares       https://<domain>/r/<code>
B opens link   GET /r/<code>  -> click recorded, token issued, redirect to store/landing (?attribution_token=...)
B's app        POST /referrals/attribute { attributionToken }       (optional, marks the click as claimed)
B signs up     POST /users/signup { ..., attributionToken }          (riders)
               PATCH /drivers/onboarding/referral { registrationId, phone, attributionToken }
               POST  /drivers/onboarding/complete { registrationId, phone }   (drivers)
backend        B.referredBy = A  (no money yet)  ->  B completes a ride  ->  reward engine pays
```

Opening the link **never pays anything**.

## APIs

| Method and path | Auth | Purpose |
| --- | --- | --- |
| `GET /users/referrals/me` | user | `{ referralCode, referralLink, referralCount, program }` |
| `GET /drivers/referrals/me` | driver | same, for drivers |
| `GET /users/referrals/history`, `GET /drivers/referrals/history` | user / driver | people referred (first name, masked phone), qualification progress, reward status and amount. `?page=&limit=` |
| `GET /r/:referralCode` | none | Public, at the site **root** (not under `/api`). Browsers are redirected; `?format=json` or `Accept: application/json` returns `{ attributionToken, referralType, referralCode, expiresAt }` instead |
| `POST /referrals/attribute` | none | Body `{ attributionToken }`. Returns `{ referralType, referrerId, status: "pending", expiresAt }` |
| `POST /users/signup` | OTP-verified | New optional field `attributionToken`. Response gets `data.referral = { applied, reason }` |
| `PATCH /drivers/onboarding/referral` | onboarding session | New optional field `attributionToken` (binds the click to this onboarding) |
| `GET /common/referrals/settings` | none | Now returns only `enabled, type, amount, ride_count` (+ `milestone_program_enabled` for drivers). Milestone and reward-feature setup is admin-only |

The old `referralCode` field keeps working on signup and `PATCH /drivers/onboarding/referral`.

### Redirect from `/r/:code`

- iOS user agent -> `REFERRAL_IOS_STORE_URL`, Android -> `REFERRAL_ANDROID_STORE_URL`, anything else -> `REFERRAL_LANDING_URL` (each falls back to the others).
- Play Store URLs get `referrer=attribution_token%3D<token>` so the app can read it with the Install Referrer API. Other URLs get `?attribution_token=<token>`.
- Chat link-preview crawlers (WhatsApp, Telegram, Slack...) are redirected **without** a token and without recording a click.
- A bad, disabled or ineligible link still redirects to the app page, without a token.
- With none of the three URLs configured, the endpoint answers with JSON.

## When rewards are paid

Nothing is paid at signup, and opening the link pays nothing. Every program type pays when the referred person's ride is completed:

| Admin `type` | Paid after | Paid to |
| --- | --- | --- |
| `instant_referrer` | the first completed ride | referrer |
| `instant_referrer_new` | the first completed ride | referrer and the new person |
| `conditional_referrer` | `ride_count` completed rides (min 1) | referrer |
| `conditional_referrer_new` | `ride_count` completed rides (min 1) | referrer and the new person |

Riders count `ride` and `intercity` rides, drivers count all completed rides (unchanged). A referral that was already paid at signup under the old rule is recognised and is **not paid a second time**.

## Rules

- **First conversion wins.** A token becomes exactly one account, an account's `referredBy` is never overwritten, and a restored (previously deleted) account keeps its original referrer. The app should keep the most recent valid token it received; each click issues its own token.
- **Token statuses:** `CLICKED` -> `PENDING` (app claimed it) -> `ATTRIBUTED` (bound to a driver onboarding) -> `CONVERTED` (account created). Also `EXPIRED`, `REJECTED`. Only the SHA-256 of the token is stored.
- **Expiry:** `REFERRAL_ATTRIBUTION_TTL_HOURS` (default 168). A driver onboarding that bound its token in time may finish after expiry.
- **A stale token does not block signup.** Expired, unknown, already used, wrong account type, self-referral or ineligible referrer: the account is created without a referral and `data.referral.reason` says why. A token **plus a typed code that belong to different referrers** is rejected (`400 referral_mismatch`). An unknown typed code alone is still `400 Invalid referral code`.
- **Self-referral** is blocked (same account, or same phone as the referrer).
- Referrer must exist and be active (not deleted; drivers not blocked/rejected/suspended), and the program must be enabled when the link is opened.

### Error codes (`details.code`)

`invalid_referral` (404), `invalid_attribution` (404), `attribution_expired` (410), `already_attributed` (409), `self_referral` (400), `referrer_not_found` (404), `referral_disabled` (403), `referral_type_mismatch` (400), `referral_mismatch` (400).

## Payout safety

All referral payouts (rider, driver, signup and ride-count) go through one ledger, `TaxiReferralReward`, with a **unique `referenceKey`** (same keys as before, e.g. `user-referral:signup:<newUserId>:referrer`).

1. A ledger row is created once; one request claims it atomically.
2. Wallet credit and the ledger update run in one MongoDB transaction (falls back to ordered writes on a standalone server).
3. Repeats and concurrent requests get `existing` and pay nothing. Ten parallel requests produce one credit.
4. Payouts found already in a wallet from before the ledger existed are recorded as `legacy`, not paid again.
5. A failed payout stays `FAILED` with `lastError`, and `retryPendingReferralRewards()` (run every 5 minutes from `server.js`, also safe to call by hand) pays it exactly once. A signup no longer fails if its reward fails.

## Admin

`PATCH /admin/referrals/settings/:type` now accepts only `user` / `driver` as `:type` and only `instant_referrer`, `instant_referrer_new`, `conditional_referrer`, `conditional_referrer_new` as `type`. Other values return 400. The settings shape is unchanged.

## Environment variables

| Variable | Meaning | Default |
| --- | --- | --- |
| `REFERRAL_BASE_URL` | Public base of the shared link (`https://domain`) | `PUBLIC_BACKEND_URL`, then the request host |
| `REFERRAL_LANDING_URL` | Page non-mobile visitors land on | none |
| `REFERRAL_ANDROID_STORE_URL` | Play Store listing | none |
| `REFERRAL_IOS_STORE_URL` | App Store listing | none |
| `REFERRAL_ATTRIBUTION_TTL_HOURS` | How long an unused click stays valid | 168 |

The reverse proxy must forward `/r/*` to the backend (it is not under `/api`).

## Database

- New collections: `taxireferralattributions` (unique `tokenHash`), `taxireferralrewards` (unique `referenceKey`).
- `DriverRegistrationSession.referralAttributionId` (new field).
- Unique partial indexes on `User.referralCode` and `Driver.referralCode` (empty codes ignored). Production runs with `autoIndex` off, so run the migration **before** deploying:

```bash
node scripts/migrateReferralCodes.js            # report only: lists accounts that share a code
node scripts/migrateReferralCodes.js --apply    # oldest keeps the code, later ones get a new one, then creates both indexes
```

It changes only duplicated codes. Referral counts, `referredBy` links, rewards and wallet balances are untouched. Codes are now created collision-safely (`ensureReferralCode`).

## Logs (JSON lines, no OTPs, passwords or tokens)

`REFERRAL_LINK_CLICKED`, `REFERRAL_ATTRIBUTION_CREATED`, `REFERRAL_ATTRIBUTION_RESOLVED`, `REFERRAL_SIGNUP_CONVERTED`, `REFERRAL_REWARD_CREATED`, `REFERRAL_REWARD_ALREADY_EXISTS`, `REFERRAL_REWARD_FAILED`, `REFERRAL_ATTRIBUTION_EXPIRED`, `REFERRAL_SELF_REFERRAL_BLOCKED`.

## Tests

`test/integration/referralAttribution.test.js` (47 tests, needs a local MongoDB replica set like the other integration tests):

```bash
INTEGRATION_MONGODB_URI="mongodb://127.0.0.1:27099/?replicaSet=rs0&directConnection=true" \
  node --test --test-force-exit test/integration/referralAttribution.test.js
```

## Known limits

- Owner / service-center / bus-driver onboarding do not take part in referrals (as before).
- There is no device fingerprinting: self-referral is blocked by account and phone only.
- The conditional ride counts are the old rules (riders: `ride` + `intercity` rides; drivers: all completed rides).
- Link clicks cannot be tied to a device server-side; the app decides which token to send.
