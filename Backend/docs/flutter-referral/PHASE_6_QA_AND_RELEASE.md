# Phase 6: QA, edge cases and rollout

**Goal:** prove the whole journey works end to end on staging, then release safely.

## Test setup

- Staging backend with the program enabled (admin > Referral settings, amount > 0) and a known reward type.
- Two rider accounts and two driver accounts for the **inviters**. Fresh phone numbers (or a phone that has no account) for the **friends**.
- A real Android device with the Play Store build (internal testing track) for the Install Referrer path. Emulators without Play Store cannot test it.
- Admin panel access to check wallet history and the driver/user records.

## Main journeys

| # | Steps | Expected |
| --- | --- | --- |
| 1 | Inviter opens Share, sends the link | Link is `https://<domain>/r/<CODE>` |
| 2 | Friend opens the link on Android, installs from Play Store, opens the app, signs up | No code typed; signup message "reward after your first ride"; inviter's friend count +1; **no** wallet change yet |
| 3 | Friend completes first ride | Inviter wallet credited once (and the friend too, for `*_new` types); history shows "Earned" |
| 4 | Friend completes a second ride | No further reward |
| 5 | Conditional program (`ride_count` = 3) | Nothing after ride 1 and 2; reward after ride 3; history shows progress "2 of 3" before |
| 6 | Driver inviter and a new driver | Onboarding completes without typing a code; driver `referredBy` set; reward after the new driver's first ride |
| 7 | App already installed, tap link (if App Links enabled) | Token saved, no blank screen |
| 8 | iOS fresh install | No token; manual code field works |

## Edge and failure cases

| Case | Expected |
| --- | --- |
| Token older than 7 days | Signup succeeds, no referral, no error shown |
| Same link used for two signups | Only the first friend is attributed |
| Friend signs up with the inviter's own phone/account | No referral, no crash |
| Rider link used in the driver app (and reverse) | Ignored, onboarding continues |
| Admin disables the program after the link was shared | Signup works; no reward; share screen hidden |
| Airplane mode at app start | Splash not delayed, no crash |
| Airplane mode during signup | Normal signup error handling (unchanged) |
| `POST /referrals/attribute` returns 404/409/410 | Silent; token cleared |
| Existing user taps a referral link | Ignored |
| Typed (manual) code, valid | Works; reward after first ride |
| Typed code, invalid | Field error "Invalid referral code" |
| Rapid repeated Share taps | No duplicate requests or crashes |
| Backend returns 429 on link/claim | Do not retry in a loop; keep the token and move on |

## Security and privacy checks

- [ ] The token never appears in `logcat`/console, crash reports, analytics or screenshots.
- [ ] The token is stored only in secure storage and removed after signup.
- [ ] Phone numbers in history are masked.
- [ ] No amount is shown as earned before `credited`.

## Performance and UX

- [ ] Splash is not slowed by the Install Referrer (2-second timeout).
- [ ] History screen loads in pages, no jank with 100+ items.
- [ ] Share sheet works on small screens and dark mode.

## Rollout plan

1. **Backend first.** Domain, `/r/*` routing, env values and the DB migration are live (Phase 0).
2. **Release 1: Phase 1 and 5** (share link and corrected texts). Zero risk: the link works for anyone, and old code signup still works.
3. **Release 2: Phases 2, 3 and 4** (token capture, signup, history). Roll out gradually (staged rollout 10% > 50% > 100%) and watch signup success rate.
4. **Keep the manual code field** in the apps. Remove it only after the new flow has been stable for a few weeks and iOS has an automatic solution.
5. **Monitoring to ask the backend owner for:** counts of link opens, tokens converted at signup, rewards created and rewards failed/retried (the backend logs these events).

## Definition of done

- [ ] All main journeys and edge cases pass on staging for rider and driver apps.
- [ ] Security and privacy checks pass.
- [ ] Release notes mention: "Refer friends with a link; rewards after their first ride."
- [ ] Support team knows the rule (reward after first ride, not at signup) and where to see it (history screen, wallet history, admin).
