# Phase 5: Texts, program settings and translations

**Goal:** what the apps say about the reward is correct and driven by the admin's settings, not hard-coded.

## Why this matters

The old rule was "reward at signup". The new rule is **reward after the friend's first ride** (or after N rides). Any text that says otherwise is now wrong. In the rider app, `rewards_screen.dart` still reads "Share your code ... when they complete their first trip" and a step "Share your referral code with friends": review every string.

## Program settings (public API)

`GET /common/referrals/settings?type=user` or `?type=driver` (no login):

```json
{ "enabled": true, "type": "instant_referrer_new", "amount": 50, "ride_count": 1 }
```

Drivers may also include `milestone_program_enabled`. (Milestone and reward-feature details are admin-only; do not expect them here.) Without `type` you get `{ "user": {...}, "driver": {...} }`.

The Share screen (Phase 1) also returns the same values in `program` from `GET .../referrals/me`, so you usually do not need a second call. Use this public endpoint only where the user is not logged in.

### Reward type to wording

| `type` | When it is paid | Who is paid | Suggested text (`{amt}` = `amount`, `{n}` = `ride_count`) |
| --- | --- | --- | --- |
| `instant_referrer` | after the friend's **first** ride | you | "You earn Rs {amt} when your friend completes their first ride." |
| `instant_referrer_new` | after the friend's **first** ride | you and your friend | "You and your friend each get Rs {amt} after your friend's first ride." |
| `conditional_referrer` | after `{n}` rides | you | "You earn Rs {amt} when your friend completes {n} rides." |
| `conditional_referrer_new` | after `{n}` rides | you and your friend | "You and your friend each get Rs {amt} after {n} rides." |

Notes:
- For `instant_*` ignore `ride_count`: it is always the first ride.
- For `conditional_*`, `ride_count` below 1 means 1.
- If `enabled` is false, hide referral entry points or show "not available right now".
- Unknown `type`: show the neutral text "Invite friends and earn rewards" instead of guessing.

## Translations

`GET /common/referrals/translation?language=xx` returns admin-managed texts (banner text and descriptions per program type). Keep using it wherever the apps already display those texts; fall back to the local strings above when the call fails or a field is empty.

## Strings to review (checklist)

| App | Where | Fix |
| --- | --- | --- |
| Rider | `rewards_screen.dart` headline, subtitle and the 3 steps | Say: share the **link**, friend signs up, reward after first ride |
| Rider | `profile_setup_screen.dart` "Referral code (optional)" | Keep for fallback; hint "Have a code? Enter it" |
| Rider | Share message | Link-based text from Phase 1 |
| Driver | Profile tile "Refer & Earn", subtitle "Your code: ..." | Subtitle: "Invite drivers and earn" (code is on the screen) |
| Both | Any "earn on signup / sign up bonus" wording | Remove |
| Both | Success message after signup | "Your friend's reward will arrive after your first ride" only when `referral.applied == true` |

## Localization

If the apps are localised (`intl` is a dependency), add the new strings to the existing ARB/string files. Do not concatenate sentences from fragments; use one string with placeholders so translators can reorder words.

## Acceptance

- [ ] Changing amount/type in the admin panel changes the text in the app after a refresh.
- [ ] No screen says the reward comes at signup.
- [ ] Program disabled: no broken "Rs 0" messages.
- [ ] Network failure on settings: local fallback text appears.
