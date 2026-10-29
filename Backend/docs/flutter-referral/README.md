# Refer & Earn: Flutter work, split by phase

One file per phase. Do them **in order**; each phase can be released on its own and has its own acceptance checklist.

| Phase | File | What you deliver | Needs backend/DevOps |
| --- | --- | --- | --- |
| 0 | [PHASE_0_PREREQUISITES.md](PHASE_0_PREREQUISITES.md) | Decisions and setup, no app code | Yes |
| 1 | [PHASE_1_SHARE_SCREEN.md](PHASE_1_SHARE_SCREEN.md) | Share the referral **link** (rider + driver) | No |
| 2 | [PHASE_2_TOKEN_CAPTURE.md](PHASE_2_TOKEN_CAPTURE.md) | App picks up the hidden token from the link | Domain + store URLs |
| 3 | [PHASE_3_SIGNUP_INTEGRATION.md](PHASE_3_SIGNUP_INTEGRATION.md) | Token sent at signup, no code typing | No |
| 4 | [PHASE_4_REFERRAL_HISTORY.md](PHASE_4_REFERRAL_HISTORY.md) | "My referrals" screen with reward status | No |
| 5 | [PHASE_5_TEXTS_AND_SETTINGS.md](PHASE_5_TEXTS_AND_SETTINGS.md) | Correct wording, program settings, translations | No |
| 6 | [PHASE_6_QA_AND_RELEASE.md](PHASE_6_QA_AND_RELEASE.md) | Test matrix, edge cases, rollout | Staging env |

Apps: **rider** = `flutter_taxi_user`, **driver** = `flutterdriver`. Both use `dio` through an `ApiClient` (which already unwraps `data` from `{ success, data }`), `flutter_riverpod`, `go_router`, `flutter_secure_storage` and `share_plus`.

## The idea in 30 seconds

```
Referrer taps Share   ->  link  https://<domain>/r/<CODE>
Friend opens the link ->  backend records the click, gives a TOKEN
Friend installs app   ->  app reads the TOKEN (Phase 2)
Friend signs up       ->  app sends the TOKEN with signup (Phase 3)
Friend's first ride   ->  reward is credited to the wallet (backend)
```

- **No reward at signup.** Reward is paid when the friend completes their first ride (or the number of rides the admin set).
- The referral **code** still exists. It is shown on the share screen and stays as a manual fallback.

## Shared API reference

Base URL is the one the apps already use (`.../api/v1`). **Exception:** the link `GET /r/:code` is at the **site root**, not under `/api`.

| Purpose | Method and path | Auth |
| --- | --- | --- |
| My code and link, rider | `GET /users/referrals/me` | rider |
| My code and link, driver | `GET /drivers/referrals/me` | driver |
| History | `GET /users/referrals/history?page&limit`, `GET /drivers/referrals/history?...` | token |
| Open a link from inside the app | `GET <site-root>/r/<CODE>?format=json` | none |
| Claim token | `POST /referrals/attribute` `{ attributionToken }` | none |
| Rider signup | `POST /users/signup` + `attributionToken` | OTP-verified |
| Driver onboarding | `PATCH /drivers/onboarding/referral` `{ registrationId, phone, attributionToken }` | onboarding session |
| Program settings | `GET /common/referrals/settings?type=user\|driver` | none |
| Admin texts | `GET /common/referrals/translation?language=xx` | none |

Errors keep the existing shape. Use `details.code`, never the message text:

| `details.code` | HTTP | Meaning |
| --- | --- | --- |
| `invalid_referral`, `invalid_attribution` | 404 | unknown code or token |
| `attribution_expired` | 410 | link older than the validity window (default 7 days) |
| `already_attributed` | 409 | token already used |
| `self_referral` | 400 | cannot refer yourself |
| `referrer_not_found` | 404 | inviter inactive or deleted |
| `referral_disabled` | 403 | admin switched the program off |
| `referral_type_mismatch` | 400 | rider link used in the driver app, or the reverse |
| `referral_mismatch` | 400 | token and typed code belong to different people |

Backend rules in detail: `../REFERRAL_AUTOMATIC_ATTRIBUTION.md`. Stakeholder overview: `../REFERRAL_ARCHITECTURE.pdf`.

## Ground rules for every phase

- Never log or show the token. Do not send it to analytics.
- The referral flow must **never block** signup or onboarding. Any referral error is swallowed unless a phase says otherwise.
- Do not show an amount as "earned" before the reward status is `credited`.
- Keep the old manual code field until the new flow is verified in production.
