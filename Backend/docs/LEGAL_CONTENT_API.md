# Legal & About content (About, Privacy, Terms, Refund, Cancellation, Driver agreement)

Written in the admin panel, read by the user app, the driver app and the website. Backend commit: "Legal content API".

## 1. Types, audience, language

| `type` | Used for |
|---|---|
| `about` | About us |
| `privacy` | Privacy Policy |
| `terms` | Terms & Conditions |
| `refund` | Refund policy |
| `cancellation` | Cancellation policy |
| `driver_agreement` | Driver agreement |

`audience`: `user`, `driver` or `all`. `language`: `en`, `hi`, `ta`, `te`, `kn`, `ml` (any `xx` / `xxx` / `xx-yy` code is accepted).
One document per (type, audience, language). Add a type: one line in `LEGAL_DOCUMENT_TYPES` (`admin/models/LegalDocument.js`).

## 2. Public API (no login: the login screens show it before sign-in)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/common/legal` | Menu: what is published (`type`, `audience`, `language`, `title`, `version`, `updatedAt`), no text. Query `audience`, `lang`. |
| GET | `/api/v1/common/legal/:type` | One published document with `body`. Query `audience` (default `all`), `lang` (default `en`). |

Lookup order: asked language, then `en`; for each of them the asked audience, then `all`. A draft is never returned.
`404 { success:false, message:"Document not found" }` when nothing is published; `400` for an unknown type.
`Cache-Control: public, max-age=300` (changes show up within 5 minutes) and an ETag.

```json
{ "success": true, "data": {
  "type": "terms", "audience": "user", "language": "en", "requestedLanguage": "hi",
  "title": "Terms & Conditions", "body": "A. GENERAL TERMS\nThese terms ...\n\nB. ...",
  "version": 4, "updatedAt": "2026-10-28T09:10:00.000Z" } }
```

`language` is the language actually used (here the app asked for `hi`, only English exists). `body` is **plain text**: a blank line
starts a new paragraph; render it as text (never as HTML).

## 3. Admin API (admin token + `legal.manage` permission; superadmin always has it)

| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/legal` | List (no text). Filters: `type`, `audience`, `language_code`, `status`. |
| GET | `/admin/legal/:id` | One document with text (`body` = what the admin edits, `live_body` = what the apps see). |
| PUT | `/admin/legal/:type` | Create or save a **draft**. Body `{ audience, language_code, title, body }`. The apps keep showing the published text. |
| POST | `/admin/legal/:id/publish` | Draft goes live, `version + 1`, `published_at = now`. Publishing again with no new draft changes nothing. |
| POST | `/admin/legal/:id/unpublish` | Hidden from the apps (`404` / fallback). The text is kept as a draft. |
| DELETE | `/admin/legal/:id` | Remove this audience/language variant. |

Rules: plain text only (HTML tags are refused with `400`, not stripped), title up to 150 characters, body up to 500 KB,
`type` / `audience` / `language_code` validated. `updated_by` records the admin who last saved or published.
Give a sub-admin the permission **"Legal & About content"** (`legal.manage`) in Admin Management.

## 4. Admin panel

Sidebar **Settings > Legal & About Pages** (`/admin/cms`) > tab **Legal**: one card per type, rows per audience/language with status
(Draft / Published / Unpublished changes), **Edit Content** (text box, Save draft, Publish, Unpublish, Delete). The page header's
dead "Publish Changes" button was removed.

## 5. Website

`/terms`, `/privacy`, `/refund`, `/cancellation` (`LegalPage.jsx`) and `/about` (`AboutPage.jsx`) load the published text with
`audience=user`. If nothing is published or the request fails they show the built-in text (the `.txt` files / page text), with the
old company name replaced by "Rentol" at display time. The refund page keeps its indicative vehicle price table under the admin text.

## 6. Seed (first time on a server)

```bash
cd ~/complete-logistics/Backend && node scripts/seedLegalDocuments.js
```

Creates published, version 1 documents from the website text (`terms` for `user`, `privacy` for `all`) with "Appzeto 24 (Trawler)"
replaced by "Rentol", plus short starting `about`, `refund` and `cancellation` texts. Safe to run twice: existing documents are
skipped, so text edited in the admin panel is never overwritten. **Have the client / legal confirm the wording before relying on it.**
`driver_agreement` and a separate driver `terms` are not seeded: write them in the admin panel.

## 7. Flutter (user app, driver app): still to do

- User app: `StaticContentScreen` (`/settings/terms`, `/settings/privacy`, about) fetches
  `GET /api/v1/common/legal/:type?audience=user&lang=<app language>` and shows `title` + `body`.
- Driver app: `TermsScreen` / `PrivacyScreen` fetch with `audience=driver`.
- On any failure (offline, 404) show the built-in text, so the screens never go blank. Cache the last good response.
- No login is needed, so the login-screen links work before sign-in.

## 8. Not done yet

- Welcome emails still use the built-in terms text (`services/emailTemplates.js`); passing the published `terms` into it is a follow-up.
- Version history (a copy of every published version) is not stored; only the current version number.
