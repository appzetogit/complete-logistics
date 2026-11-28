# Rentol: Flutter notes for the database move and the public-URL change

For the Flutter developers of the **driver app** (`rentol driver`) and the **user app** (`flutter_taxi_user`).

**Date:** 21 Nov 2026. **Backend:** `complete-logistics` (pm2 `complete-logistics-backend`, port 5012, behind `https://rentol.in`).

**Short answer: you do not have to change the API base URL**, as long as the apps already call `https://rentol.in/api/v1`. There is nothing to release for the database move. Two small things need a quick check (§3 and §4).

---

## 1. What changed on the server

| Change | Does the Flutter app see it? |
|---|---|
| The MongoDB database moved to a new Atlas cluster (same database name `appzeto_taxi`, all 74 collections, 535 documents, all indexes copied and verified) | **No.** It is internal to the backend. |
| `PUBLIC_BACKEND_URL` and `PUBLIC_FRONTEND_URL` in the server `.env` now point to `https://rentol.in` (they used to point to `https://logistics.buytogetherindia.com`) | **Yes, in three places**, see §2. |
| `CORS_ORIGIN`, `PHONEPE_REDIRECT_BASE_URL` now `https://rentol.in` | No. CORS only matters for browsers. The apps are not affected. |

API paths, request bodies, response shapes and auth (JWT) are **unchanged**. Tokens already issued stay valid (same `JWT_SECRET`), so users and drivers should not need to log in again. Please confirm this in QA (§5).

---

## 2. What the new public URL changes

The backend builds some absolute URLs from `PUBLIC_BACKEND_URL`:

| What | Before | Now |
|---|---|---|
| **Newly uploaded images** (profile photo, documents, selfies, proofs): the `url` returned by the upload endpoints | `https://logistics.buytogetherindia.com/uploads/...` | `https://rentol.in/uploads/...` |
| **Referral share link** | `https://logistics.buytogetherindia.com/r/<code>` | `https://rentol.in/r/<code>` |
| Server-side payment callback and health-check URLs | old domain | `https://rentol.in/...` (server only) |

**Old images keep their old URL.** Records saved before the change still hold `https://logistics.buytogetherindia.com/uploads/...` in the database, and the API returns them as they are. That domain still serves `/uploads`, so old images keep loading. **Do not block or rewrite that domain in the app.**

---

## 3. Check 1: the base URL (no change expected)

In both apps, the API base URL must be:

```
https://rentol.in/api/v1
```

Socket and any asset base should use `https://rentol.in` as well. If an app still uses `https://logistics.buytogetherindia.com`, it keeps working for now (the old domain is still up), but plan to move it to `rentol.in` in the next release.

---

## 4. Check 2: nothing may depend on the old domain

Search the Flutter code for the old domain and make sure none of these exist:

```
grep -rn "buytogetherindia" lib/
```

| Pattern to look for | Problem | Fix |
|---|---|---|
| Image code that checks `url.startsWith('https://logistics.buytogetherindia.com')` to decide "is this one of our images" | New images are on `rentol.in`, so the check fails and the image may not show | Treat any `https` image URL as valid, or check the path `/uploads/` only |
| A hardcoded image base joined with a relative path | Wrong host for new uploads | Use the full `url` the API returns, as is |
| Referral link built in the app (`'https://logistics.../r/$code'`) | Old domain in shared links | Use the link the API returns, or `https://rentol.in/r/<code>` |
| Deep links / app links (`AndroidManifest`, `Info.plist`, `assetlinks.json`) registered for the old domain | Links on `rentol.in` will not open the app | Add `rentol.in` (see below), keep the old host too |

**Deep links:** if the app opens from referral links, add `rentol.in` as an allowed host (Android `intent-filter` with `android:host="rentol.in"`, iOS associated domains `applinks:rentol.in`) and host the matching `assetlinks.json` / `apple-app-site-association` on `rentol.in`. Keep the old host as well until old shared links stop being used.

If none of the patterns above exist, **no code change and no new build** are needed.

---

## 5. QA checklist

1. User app and driver app: log in with an **existing** account. No forced re-login, and the profile loads.
2. Ride list, wallet, and earnings show the same data as before the move.
3. Upload a **new** profile photo. The returned URL starts with `https://rentol.in/uploads/`, and the image displays.
4. An **old** profile photo (saved before the move) still displays.
5. Referral screen: the share link starts with `https://rentol.in/r/`. Opening it works (and opens the app if deep links are set up).
6. Book and complete a test ride, and check a payment (Cashfree) returns to the app correctly.
7. Chat and live ride updates (socket) connect.

---

## 6. For the backend / admin (reference)

- Server `.env` (`~/complete-logistics/Backend/.env`): `MONGODB_URI` (new cluster, database `appzeto_taxi`), `PUBLIC_BACKEND_URL`, `PUBLIC_FRONTEND_URL`, `CORS_ORIGIN`, `PHONEPE_REDIRECT_BASE_URL`.
- pm2 does **not** read `.env` changes on a plain restart if the variable is already stored in pm2's own environment. Use `pm2 restart complete-logistics-backend --update-env`, and if a stale value persists, `pm2 delete` and start again from `Backend/` so the process picks up `.env`.
- Optional follow-up: a one-off script can rewrite stored image URLs from `https://logistics.buytogetherindia.com/uploads/` to `https://rentol.in/uploads/`. Until then the old domain must stay online.
