# Phase 4: "My referrals" history screen (rider and driver)

**Goal:** the member sees who joined through them and whether the reward has been paid.

## API

`GET /users/referrals/history?page=1&limit=20` (rider) and `GET /drivers/referrals/history?page=1&limit=20` (driver). Login required. `limit` is capped at 100.

```json
{ "items": [
    { "id": "6ae3...",
      "name": "Asha",
      "phone": "XXXXXX1234",
      "joinedAt": "2026-10-29T11:58:22.000Z",
      "qualification": { "required": 1, "completed": 0, "qualified": false },
      "reward": { "status": "pending", "amount": null, "creditedAt": null } }
  ],
  "page": 1, "limit": 20, "total": 1 }
```

Field meaning:

| Field | Meaning |
| --- | --- |
| `name` | First name only |
| `phone` | Masked, last 4 digits visible |
| `joinedAt` | When the friend signed up |
| `qualification.required` | Rides needed before the reward is paid (1 for "first ride" programs) |
| `qualification.completed` | Rides the friend has completed so far |
| `qualification.qualified` | `true` once the requirement is met |
| `reward.status` | `pending`, `credited`, or `failed` (a failed credit is retried by the backend) |
| `reward.amount` | Amount paid to **you**, or `null` until paid |
| `reward.creditedAt` | When it was paid, or `null` |

## Build

1. **Constants:** `referralHistory = '/users/referrals/history'` (rider) and `'/drivers/referrals/history'` (driver).
2. **Model** `ReferralHistoryItem` (+ a small `ReferralHistoryPage` with `items`, `page`, `limit`, `total`).
3. **Repository:** `getHistory({int page = 1, int limit = 20})`.
4. **Provider:** Riverpod notifier that holds the list and the current page, with `loadMore()` and `refresh()`.
5. **Screen:** route "My referrals", opened from the Refer & Earn screen (Phase 1). Use `ListView.builder` with infinite scroll: load the next page when the user is near the end and `items.length < total`.

## Row design

| State | What to show |
| --- | --- |
| `reward.status == credited` | Green chip "Earned", amount (`+ Rs 50`), date from `creditedAt` |
| `pending` and `qualification.required > 1` | Progress "2 of 3 rides done", `LinearProgressIndicator` of `completed / required` |
| `pending` and required is 1 (or 0) | Chip "Waiting for first ride" |
| `failed` | Chip "Processing", no scary wording (the backend retries it) |

Always show first name, masked phone and the joined date ("Joined 29 Oct"). Do not try to unmask or look up the person.

Header (optional): total friends (`total`) and total earned (sum of `credited` amounts you have loaded; or leave it out).

## States

- Loading: skeleton rows (`shimmer` is already a dependency).
- Empty (`total == 0`): illustration and "Invite friends to start earning" with a Share button that goes back to Phase 1.
- Error: message with Retry, keep already loaded rows.
- Pull-to-refresh: reload page 1.

## Notes

- The wallet balance itself updates through the existing wallet screens. The reward shows up there as a normal credit.
- Do not poll. Refresh on screen open and on pull-to-refresh only.
- Amounts: show the currency the app already uses elsewhere.

## Acceptance

- [ ] Friend who just signed up appears with "Waiting for first ride".
- [ ] After the friend's first ride completes, pull-to-refresh shows "Earned" with the amount, and the same credit is in the wallet.
- [ ] More than 20 referrals: scrolling loads the next page without duplicates.
- [ ] Empty state and error state both work; no crash offline.
- [ ] Phone numbers are always masked in the UI.
