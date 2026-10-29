> **Update:** signup rewards were removed. All program types now pay on the referred person's first (or configured) completed ride. See REFERRAL_AUTOMATIC_ATTRIBUTION.md. Sections 4.3 and 5.3 below describe the old behaviour.

# Refer & Earn: Backend Flow (as it exists today)

Scope: backend only (`Backend/src/modules/taxi`). Two separate programs exist, one for **users (riders)** and one for **drivers**. Both share the same shape: a referral code, an admin setting, a signup hook and a ride-completion hook. Rewards are paid into wallets.

Written from reading the code; nothing here was changed.

---

## 1. Where things live

| Piece | File |
| --- | --- |
| Admin settings storage | `admin/models/AdminBusinessSetting.js` → field `referral.user` and `referral.driver` (document with `scope: 'default'`) |
| Admin settings API | `admin/routes/adminRoutes.js` (lines ~459-463) → `adminService.getReferralSettings / updateReferralSettings / getReferralDashboard` |
| Public settings and texts | `common/routes/commonRoutes.js` → `GET /common/referrals/settings`, `GET /common/referrals/translation` |
| Translations model | `admin/models/ReferralTranslation.js` |
| User signup hook | `user/controllers/userController.js` (`signupUser`, `processSignupReferralRewards`) |
| Driver signup hook | `driver/services/onboardingService.js` (`saveDriverReferral`, `completeDriverOnboarding`, `processDriverSignupReferralRewards`) |
| Ride-completion hook (user and driver) | `services/rideService.js` (`processCompletedRideReferralReward`, `processCompletedDriverReferralReward`, called at the end of ride completion) |
| Driver incentives (separate bonus program, same settings document) | `driver/controllers/driverController.js` (`getDriverIncentives`, `claimDriverIncentiveReward`) |

Routes are mounted under both `/api` and `/api/v1`.

---

## 2. Data model

**User** (`user/models/User.js`) and **Driver** (`driver/models/Driver.js`) carry the same fields:

| Field | Meaning |
| --- | --- |
| `referralCode` | The person's own shareable code. Generated lazily, not unique-indexed. |
| `referredBy` | `_id` of the referrer (a User for users, a Driver for drivers). `null` if none. |
| `referralCount` | How many signups used this person's code. Incremented at signup. |
| `referredRideCompletionCount` | Completed rides counted so far for the *referred* person (conditional programs). |
| `referralRewardGrantedAt` | Set when the reward for this *referred* person is fully paid. Acts as a "done" flag. |

`DriverRegistrationSession.referralCode` stores the code typed during driver onboarding until the account is created.

**Code format** (generated, `idPart` = last 6 chars of the Mongo id, uppercased, `phonePart` = last 4 digits of phone):

- User: `USR` + phonePart + idPart
- Driver: `DRV` + phonePart + idPart

Codes are created when the account is created or on the first profile fetch (`getCurrentUser` and the driver profile builder fill it in if empty). Codes are always compared in **UPPERCASE**.

---

## 3. Admin configuration

Stored in `AdminBusinessSetting` (`scope: 'default'`):

```
referral: {
  user:   { enabled, type, amount, ride_count },
  driver: { enabled, type, amount, ride_count,
            milestone_program_enabled, milestone_programs[], reward_features[] }
}
```

Default (nothing configured): `enabled: false`, `type: 'instant_referrer'`, `amount: 0`. With the default, **no reward is ever paid**.

`type` values the code understands:

| `type` | When paid | Who gets paid |
| --- | --- | --- |
| `instant_referrer` | At signup | Referrer only |
| `instant_referrer_new` | At signup | Referrer and the new person |
| `conditional_referrer` | When the referred person completes `ride_count` rides | Referrer only |
| `conditional_referrer_new` | When the referred person completes `ride_count` rides | Referrer and the referred person |

`amount` is a fixed rupee amount per payee. `ride_count` is the ride threshold (minimum 1) for conditional types.

**Admin endpoints** (all require an admin token, mounted under `/admin`):

| Method and path | Purpose |
| --- | --- |
| `GET /admin/referrals/settings/:type` | Read settings; `:type` is `user` or `driver` |
| `PATCH /admin/referrals/settings/:type` | Save settings. Coerces `enabled` to boolean, `amount` to number, `ride_count` to a non-negative number. For `driver` it also sanitizes `milestone_programs` and `reward_features`. |
| `GET /admin/referrals/translation` | List texts per language |
| `PATCH /admin/referrals/translation/:languageCode` | Edit texts for one language |
| `GET /admin/referral/dashboard` | See "Known gaps" below: mostly placeholder numbers |

**Public endpoints** (no login, used by the apps to show the program):

| Method and path | Returns |
| --- | --- |
| `GET /common/referrals/settings?type=user\|driver` | The settings object (or both if no `type`) |
| `GET /common/referrals/translation?language=xx` | Texts for that language, falling back to the default language, then `en` |

---

## 4. User (rider) flow

### 4.1 Getting a code
`GET /users/me` returns `referralCode` and `referralCount`. If the user has no code yet, one is generated and saved on that call.

### 4.2 Signup with a code
1. `POST /users/auth/send-otp` then `POST /users/auth/verify-otp`: creates a verified signup session for the phone.
2. `POST /users/signup` (body includes optional `referralCode`, `employeeCode`). `POST /users/register` is now an alias of `signup`, so both need the verified OTP session.
3. In `signupUser`:
   - `referralCode` is uppercased and looked up with `User.findOne({ referralCode })`.
   - Not found → `400 Invalid referral code`. The signup fails.
   - The phone must not already be registered (`409`), unless it belongs to a soft-deleted account that can be restored.
   - The new `User` is created with `referredBy = referrer._id`. A code is generated for the new user.
   - If a referrer exists: `referrer.referralCount += 1`, then `processSignupReferralRewards`.
   - The OTP session is consumed.

### 4.3 Signup reward (`processSignupReferralRewards`)
- Skips if the program is disabled or `amount <= 0`.
- `instant_referrer` or `instant_referrer_new` → credit `amount` to the referrer's wallet. Key: `user-referral:signup:<newUserId>:referrer`.
- `instant_referrer_new` → also credit the new user. Key: `user-referral:signup:<newUserId>:new-user`. Then sets `referralRewardGrantedAt` on the new user.
- Conditional types do nothing at signup.

### 4.4 Ride-completion reward (`processCompletedRideReferralReward`)
Runs after every completed ride, once the ride is settled.
1. Load the rider. Stop if they have no `referredBy` or `referralRewardGrantedAt` is already set.
2. Stop unless the program is enabled and `type` is `conditional_referrer` or `conditional_referrer_new`.
3. Count the rider's rides with status COMPLETED and `serviceType` in (`ride`, `intercity`). Goods and other service types do not count.
4. Save that count into `referredRideCompletionCount`.
5. If `count < ride_count` (min 1) or `amount <= 0`, stop and wait for the next ride.
6. Otherwise credit the referrer (`user-referral:completed:<riderId>:<ride_count>:referrer`), and for `conditional_referrer_new` also the rider (`...:new-user`).
7. If everything required was credited (or already existed), set `referralRewardGrantedAt`. That stops any further processing for this rider.

### 4.5 How the money is credited (user side)
`creditUserWalletByReference({ userId, amount, title, referenceKey })`:
- Ensures a `UserWallet` exists.
- Looks for an existing wallet transaction with the same `referenceKey`. If found, returns `existing` and pays nothing (this is the idempotency check).
- Otherwise `$inc balance` and pushes a `credit` transaction (keeping only the last 50 transactions).
- Return values: `credited`, `existing`, `skipped` (bad amount or key).

---

## 5. Driver flow

### 5.1 Getting a code
The driver profile builder generates `DRV...` if missing, so the app can show it.

### 5.2 Signup with a code (public onboarding, no login yet)
1. `POST /drivers/onboarding/send-otp`, `verify-otp`, then role, personal, and so on, building a `DriverRegistrationSession`.
2. `PATCH /drivers/onboarding/referral` with `{ registrationId, phone, referralCode, employeeCode }` → `saveDriverReferral`:
   - If `referralCode` is given it must match an existing **Driver** code, else `400 Invalid referral code`.
   - If `employeeCode` is given it must be an active employee, else `400`.
   - Both are stored on the session. Nothing is credited yet.
3. `POST /drivers/onboarding/complete` → `completeDriverOnboarding`:
   - Re-validates the stored code (`400` if it no longer resolves).
   - Creates the `Driver` with `referredBy = referrer._id`, `approve: false`, `status: 'pending'`.
   - Generates the new driver's own `DRV...` code.
   - If a referrer exists: `referrer.referralCount += 1`, then `processDriverSignupReferralRewards`.

   Note: the owner role returns earlier in `completeDriverOnboarding` (before the referral code is read), so owner signups get no referral handling. Other non-driver roles were not traced.

### 5.3 Signup reward (`processDriverSignupReferralRewards`)
Same rules as users, paid to **driver wallets**:
- `instant_referrer(_new)` → referrer credited. Key: `driver-referral:signup:<newDriverId>:referrer`.
- `instant_referrer_new` → new driver also credited (`...:new-driver`) and `referralRewardGrantedAt` set.
- It fires at **account creation**, not at admin approval.

### 5.4 Ride-completion reward (`processCompletedDriverReferralReward`)
Same as 4.4 but for the driver who completed the ride:
- Counts **all** COMPLETED rides of that driver (no service-type filter).
- Pays the referring driver (`driver-referral:completed:<driverId>:<ride_count>:referrer`, metadata has `referredDriverId`, `completedRideCount`) and for `conditional_referrer_new` the driver too (`...:new-driver`).
- Sets `referralRewardGrantedAt` when done.

### 5.5 How the money is credited (driver side)
`creditDriverWalletByReference`:
- Checks `WalletTransaction` for the same `metadata.referenceKey` for that driver → `existing` if found.
- Otherwise calls `applyDriverWalletAdjustment` with `type: 'adjustment'` and `metadata.source = 'driver_referral'`, which updates the driver wallet balance and writes a ledger row.

### 5.6 Driver incentives (adjacent program, same settings)
`referral.driver.milestone_programs` and `reward_features` configure a separate bonus program, not a referral reward:
- `GET /drivers/incentives` builds a progress snapshot from the driver's rides and online-time tracking.
- `POST /drivers/incentives/claim` (`rewardType` = `milestone` or `feature`, plus `rewardKey`) checks eligibility, records the claim on the driver and credits the wallet.

---

## 6. Sequence summary

```
ADMIN  PATCH /admin/referrals/settings/{user|driver}
        └─> AdminBusinessSetting.referral.{user|driver} = { enabled, type, amount, ride_count }

NEW PERSON signs up with code X
   user  : /users/auth/verify-otp → /users/signup { referralCode }
   driver: /drivers/onboarding/referral → /drivers/onboarding/complete
        └─> look up referrer by code X (400 if invalid)
        └─> new account.referredBy = referrer
        └─> referrer.referralCount += 1
        └─> if type = instant_*  : credit wallet(s) now          (key ends :referrer / :new-*)

REFERRED PERSON completes a ride
        └─> (conditional_* only) count completed rides
        └─> when count >= ride_count : credit wallet(s) once, set referralRewardGrantedAt
```

---

## 7. Idempotency and safety rules in place

- Every payout has a unique `referenceKey`; a repeat call returns `existing` instead of paying twice.
- `referralRewardGrantedAt` stops the ride hook once the reward is complete.
- An invalid code blocks signup (it does not silently ignore the code).
- Signup rewards are only paid when `enabled` is true and `amount > 0`.

---

## 8. Known gaps and risks (found while reading, not fixed)

1. **Reward idempotency is check-then-write.** The lookup for an existing `referenceKey` and the credit are separate steps, so two concurrent requests can both pass the check and pay twice. There is no unique index on the key.
2. **Self-referral and fake signups are not blocked.** Nothing compares the new person with the referrer (phone, device, IP), and an `instant_*` reward is paid on signup alone. For drivers it is paid at account creation, before admin approval or any ride, so fake accounts can farm wallet credit.
3. **Referral codes are not unique-indexed.** They are derived from phone and id, so collisions are unlikely but not prevented.
4. **Dashboard is placeholder.** `GET /admin/referral/dashboard` returns real totals for `total_drivers` and `total_users`, but `active_referrals`, `referral_earning`, `referral_user`, `referral_driver` and the monthly arrays are hard-coded zeros.
5. **Dead or half-wired options.**
   - The translation model mentions `...earnings` and `dual_conditional...` variants, but the reward code only implements the four `type` values in section 3. Earnings-based conditions do not exist.
   - Conditional rewards for users count only `ride` and `intercity`, so goods rides never qualify.
6. **User wallet history is capped.** User wallet transactions keep only the latest 50 (`$slice: -50`), so older referral credits drop out of the visible history (the balance stays correct).
7. **Failures in the reward step are not retried.** In `completeDriverOnboarding` and `signupUser` the reward runs inline after the account is created; if it throws, the account exists but the reward may be missing and there is no retry job. In the ride hook, `referralRewardGrantedAt` is only set when everything succeeded, so a later ride will retry for conditional types.
8. **Public settings endpoint** exposes the full `referral` object (including driver milestone and reward configuration) without login.
9. **Settings are not validated beyond coercion.** Any `type` string is stored; an unknown value just results in no payout.
10. **Only one referral level.** There is no multi-level reward or per-referral cap, and no admin report of who referred whom.
