# Rentol: Flutter guide for About / Privacy / Terms / Refund / Cancellation (admin-managed)

For the Flutter developers of the **user app** (`flutter_taxi_user`) and the **driver app** (`flutterdriver`).
Backend: "Legal content API" (commits `51bd2c4`, `98159e3`). Backend/admin details are in `LEGAL_CONTENT_API.md`.

---

## 1. What changed

Until now both apps showed legal text that is **hard-coded in the app** (user app: `privacyPolicyBody` / `termsBody` in
`static_content_screen.dart`, English only; driver app: `PrivacyScreen` / `TermsScreen` from local l10n strings).
Now the admin writes this text in the admin panel and the apps **read it from a public API**. Changing a policy no longer
needs an app release.

**The apps keep their built-in text as a fallback.** A screen must never be blank or show an error because the API is
down, the document is not written yet, or the phone is offline.

Which screens use it:

| App | Screen / route | Document `type` | `audience` to send |
|---|---|---|---|
| User | Privacy Policy (`/settings/privacy`) | `privacy` | `user` |
| User | Terms & Conditions (`/settings/terms`) | `terms` | `user` |
| User | About | `about` | `user` |
| User | Refund / Cancellation policy (if you have these screens) | `refund`, `cancellation` | `user` |
| Driver | Privacy (`/privacy`) | `privacy` | `driver` |
| Driver | Terms (`/terms`) | `terms` | `driver` |
| Driver | Driver agreement (if you show it) | `driver_agreement` | `driver` |
| Both | The **login screen links** to Privacy and Terms | same as above | same as above |

The login screens open these same screens **before sign-in**, so the API needs **no token** (it has none).

---

## 2. API

Base URL is the same as the other APIs: `{API_BASE}/api/v1` (for example `https://rentol.in/api/v1`).

### 2.1 Read one document

```
GET /common/legal/:type?audience=<user|driver|all>&lang=<code>
```

No login, no headers needed.

| Query | Default | Notes |
|---|---|---|
| `audience` | `all` | send `user` from the user app, `driver` from the driver app |
| `lang` | `en` | the app's selected language code: `en`, `hi`, `ta`, `te`, `kn`, `ml` |

Response `200`:

```json
{
  "success": true,
  "data": {
    "type": "terms",
    "audience": "user",
    "language": "en",
    "requestedLanguage": "hi",
    "title": "Terms & Conditions",
    "body": "A. GENERAL TERMS\nThese terms apply ...\n\nB. ...",
    "version": 4,
    "updatedAt": "2026-10-28T09:10:00.000Z"
  }
}
```

| Field | Meaning |
|---|---|
| `title` | screen title; use it instead of your own label when present |
| `body` | the text, **plain text** (see section 4) |
| `language` | the language the server **actually** used |
| `requestedLanguage` | what you asked for. If different from `language`, the text is not available in the user's language yet (the server fell back to English). You may show a small note like "Available in English only". |
| `audience` | the audience of the document found. You asked `user`; you may get a document written for `all`. |
| `version` | goes up by 1 on every publish. Use it (or `updatedAt`) as the cache key. |
| `updatedAt` | when it was last published |

How the server picks the document: **language first** (asked language, then `en`), and for each of them the asked
audience, then `all`. Drafts are never returned.

Errors:

| Status | Meaning | App |
|---|---|---|
| `404` `{ "success": false, "message": "Document not found" }` | nothing is published for this type | show the built-in text |
| `400` | unknown `type` or bad `lang` / `audience` (a bug in the app) | show the built-in text |
| `5xx`, timeout, no network | | show the cached copy, else the built-in text |

### 2.2 List what is published (optional menu)

```
GET /common/legal?audience=user&lang=hi
```

```json
{ "success": true, "data": { "results": [
  { "type": "about",   "audience": "all",  "language": "en", "title": "About Us", "version": 1, "updatedAt": "..." },
  { "type": "privacy", "audience": "all",  "language": "en", "title": "Privacy Policy", "version": 1, "updatedAt": "..." },
  { "type": "terms",   "audience": "user", "language": "en", "title": "Terms & Conditions", "version": 1, "updatedAt": "..." }
] } }
```

No `body` here. With `lang=hi` the list contains both the Hindi and the English rows; per `type` prefer the row with the
asked language, then English, and prefer the exact audience over `all`. You do **not** need this call if your menu is fixed:
just call the single-document endpoint when the user opens a screen.

### 2.3 Caching

The server sends `Cache-Control: public, max-age=300` and an `ETag`, so a published change reaches phones within about
5 minutes. HTTP caching in `dio` is not enough on its own (it is lost when the app restarts): **store the last good response
yourself** (section 5).

---

## 3. What exists right now (after the seed)

The backend seed creates these published documents (all English):

| `type` | `audience` | Notes |
|---|---|---|
| `terms` | `user` | the rider terms (long, about 77 KB) |
| `privacy` | `all` | used by riders and drivers |
| `about` | `all` | |
| `refund` | `all` | |
| `cancellation` | `all` | |

**Not written yet:** driver `terms`, `driver_agreement`, and any Hindi / Tamil / ... text. The admin writes them in the admin
panel whenever they are ready. Until then:

- The **driver app's Terms** screen gets `404` (the only `terms` document is for `user`) and must show its **built-in** text.
- Asking for `lang=hi` returns the English text with `language: "en"`, `requestedLanguage: "hi"`.

So the integration has to work with "some documents exist, some do not". That is the normal state.

---

## 4. Showing the text

`body` is **plain text**. It is never HTML or Markdown. Do not use a WebView or an HTML widget, and do not interpret it:
show it as text.

- A **blank line** separates paragraphs. A single newline is a line break inside a paragraph.
- Headings are written as normal lines. The text uses patterns like `A. GENERAL TERMS`, `OUR MISSION`, `I. DEFINITIONS`.
  A simple rule is enough to style them: a line that is **all capitals** (letters, spaces, `& ( ) / -`), or starts with
  `A.` / `I.` followed by a capital letter, is a heading. Everything else is normal text.
- The text can be long (about 80 KB). Use a `ListView.builder` / `SelectionArea` with one widget per paragraph, not one giant
  `Text`, so scrolling stays smooth.
- Keep the app's own dark/light theme, text scale and fonts. Allow text selection.
- Do not show the raw `version`. If you want a line like "Last updated 28 Oct 2026", format `updatedAt`.

---

## 5. Dart code

### 5.1 Model

```dart
class LegalDocument {
  LegalDocument({
    required this.type,
    required this.audience,
    required this.language,
    required this.requestedLanguage,
    required this.title,
    required this.body,
    required this.version,
    required this.updatedAt,
  });

  final String type;
  final String audience;
  final String language;
  final String requestedLanguage;
  final String title;
  final String body;
  final int version;
  final DateTime? updatedAt;

  bool get isFallbackLanguage => language != requestedLanguage;

  factory LegalDocument.fromJson(Map<String, dynamic> j) => LegalDocument(
        type: (j['type'] ?? '').toString(),
        audience: (j['audience'] ?? 'all').toString(),
        language: (j['language'] ?? 'en').toString(),
        requestedLanguage: (j['requestedLanguage'] ?? j['language'] ?? 'en').toString(),
        title: (j['title'] ?? '').toString(),
        body: (j['body'] ?? '').toString(),
        version: (j['version'] is num) ? (j['version'] as num).toInt() : 0,
        updatedAt: DateTime.tryParse((j['updatedAt'] ?? '').toString()),
      );

  Map<String, dynamic> toJson() => {
        'type': type,
        'audience': audience,
        'language': language,
        'requestedLanguage': requestedLanguage,
        'title': title,
        'body': body,
        'version': version,
        'updatedAt': updatedAt?.toIso8601String(),
      };
}
```

### 5.2 Repository with cache and fallback (never throws)

```dart
import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:shared_preferences/shared_preferences.dart';

class LegalRepository {
  LegalRepository(this._dio, {required this.audience}); // 'user' in the user app, 'driver' in the driver app
  final Dio _dio;
  final String audience;

  String _key(String type, String lang) => 'legal_${audience}_${type}_$lang';

  /// Returns the freshest copy it can find, or null when the screen should show its built-in text.
  /// Order: network -> last good copy on the phone -> null.
  Future<LegalDocument?> load(String type, String lang) async {
    final prefs = await SharedPreferences.getInstance();
    try {
      final res = await _dio.get(
        '/common/legal/$type',
        queryParameters: {'audience': audience, 'lang': lang},
        options: Options(receiveTimeout: const Duration(seconds: 8)),
      );
      final data = res.data is Map ? res.data['data'] : null;
      if (data is Map<String, dynamic> && (data['body'] ?? '').toString().trim().isNotEmpty) {
        final doc = LegalDocument.fromJson(data);
        await prefs.setString(_key(type, lang), jsonEncode(doc.toJson()));
        return doc;
      }
    } on DioException catch (e) {
      if (e.response?.statusCode == 404) {
        // Not published (or unpublished by the admin): forget the old copy so the built-in text is used.
        await prefs.remove(_key(type, lang));
        return null;
      }
      // offline / timeout / 5xx: fall through to the cached copy
    } catch (_) {
      // unexpected response: fall through to the cached copy
    }

    final cached = prefs.getString(_key(type, lang));
    if (cached != null) {
      try {
        return LegalDocument.fromJson(jsonDecode(cached) as Map<String, dynamic>);
      } catch (_) {}
    }
    return null;
  }
}
```

A `404` clears the cached copy on purpose: if the admin unpublishes a document, phones should go back to the built-in text and
not keep showing a withdrawn policy. Offline or server errors keep the last good copy.

### 5.3 Screen (replace the body of `StaticContentScreen` / `TermsScreen` / `PrivacyScreen`)

```dart
class LegalContentScreen extends StatefulWidget {
  const LegalContentScreen({
    super.key,
    required this.type,
    required this.repository,
    required this.languageCode,
    required this.fallbackTitle,
    required this.fallbackBody, // the text that is in the app today
  });

  final String type;
  final LegalRepository repository;
  final String languageCode;
  final String fallbackTitle;
  final String fallbackBody;

  @override
  State<LegalContentScreen> createState() => _LegalContentScreenState();
}

class _LegalContentScreenState extends State<LegalContentScreen> {
  late Future<LegalDocument?> _future = widget.repository.load(widget.type, widget.languageCode);

  static final _heading = RegExp(r'^(?:[A-Z][A-Z\s&()/-]{3,}|[A-Z]\.\s+[A-Z].*|[IVXLCDM]+\.\s+[A-Z].*)$');

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<LegalDocument?>(
      future: _future,
      builder: (context, snapshot) {
        final loading = snapshot.connectionState != ConnectionState.done;
        final doc = snapshot.data;
        final title = (doc?.title.isNotEmpty ?? false) ? doc!.title : widget.fallbackTitle;
        final body = doc?.body ?? widget.fallbackBody; // built-in text when there is no document

        return Scaffold(
          appBar: AppBar(title: Text(title)),
          body: loading && doc == null
              ? const Center(child: CircularProgressIndicator())
              : SelectionArea(
                  child: ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      if (doc != null && doc.isFallbackLanguage)
                        const Padding(
                          padding: EdgeInsets.only(bottom: 12),
                          child: Text('This document is available in English only.'), // localize
                        ),
                      for (final paragraph in body.split(RegExp(r'\n\s*\n')).map((p) => p.trim()).where((p) => p.isNotEmpty))
                        Padding(
                          padding: const EdgeInsets.only(bottom: 14),
                          child: _paragraph(context, paragraph),
                        ),
                    ],
                  ),
                ),
        );
      },
    );
  }

  Widget _paragraph(BuildContext context, String text) {
    final theme = Theme.of(context).textTheme;
    final lines = text.split('\n');
    final firstIsHeading = _heading.hasMatch(lines.first.trim());
    if (!firstIsHeading) return Text(text, style: theme.bodyMedium?.copyWith(height: 1.5));
    final rest = lines.skip(1).join('\n').trim();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(lines.first.trim(), style: theme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
        if (rest.isNotEmpty) ...[
          const SizedBox(height: 6),
          Text(rest, style: theme.bodyMedium?.copyWith(height: 1.5)),
        ],
      ],
    );
  }
}
```

Wiring (user app, example):

```dart
// router: /settings/terms
LegalContentScreen(
  type: 'terms',
  repository: context.read<LegalRepository>(),   // LegalRepository(dio, audience: 'user')
  languageCode: Localizations.localeOf(context).languageCode,
  fallbackTitle: l10n.termsTitle,
  fallbackBody: termsBody,                        // the constant that is in the app today
)
```

Driver app: same widget, `LegalRepository(dio, audience: 'driver')`, `type: 'terms'` / `'privacy'`, and the existing local
strings as `fallbackBody`.

**Use a Dio without the auth interceptor, or make sure it skips the token when there is none.** These calls happen on the
login screen, so a "no token, go to login" interceptor must not redirect or retry them.

---

## 6. Rules for the app

1. **Never block on this.** Show the built-in text immediately if you want, and swap to the server text when it arrives; or show
   a short spinner (max ~8 s) and then the fallback. Do not show an error dialog for a failed legal call.
2. **Keep the built-in text** in the app. It is the fallback for offline first launch, `404`, and old data.
3. **Do not hard-code which languages exist.** Always send the app's language and show what the server returns (it tells you
   `language` and `requestedLanguage`).
4. **Do not render HTML.** The server refuses HTML in the admin panel, but the app should still show `body` as text.
5. **Do not send a token** and do not require login for these screens (the login screen links to them).
6. **Terms acceptance:** if the app records "user accepted terms vN" anywhere, `version` is the number to store. It goes up
   when the admin publishes a new text.

---

## 7. QA checklist

Use a test server where the admin panel works (Settings > Legal & About Pages).

- [ ] User app, online: Privacy, Terms, About open and show the server text (compare the first lines with the admin panel).
- [ ] Driver app, online: Privacy shows the server text. **Terms shows the built-in text** (no driver terms written yet), no error.
- [ ] Admin writes a driver Terms and publishes: after the cache time (up to ~5 min, or restart the app) the driver app shows it.
- [ ] Admin edits a document and **only saves a draft**: the apps still show the old text.
- [ ] Admin publishes: the new text shows up (within ~5 minutes).
- [ ] Admin unpublishes a document: the app goes back to the built-in text (not the old cached policy).
- [ ] Airplane mode, first launch ever: built-in text, no crash, no error dialog.
- [ ] Airplane mode after one successful load: the last server text is shown.
- [ ] App language Hindi, only English exists: English text is shown (and the "English only" note if you built it).
- [ ] Login screen: tapping Privacy / Terms works before sign-in (no redirect to login).
- [ ] Long text (Terms, ~77 KB) scrolls smoothly; text can be selected; dark mode readable.
- [ ] Headings are bold (`A. GENERAL TERMS` style lines); paragraphs are separated.
- [ ] Words like `<18` or `>5` in the text show as they are.

---

## 8. For reference

- Types: `about`, `privacy`, `terms`, `refund`, `cancellation`, `driver_agreement` (the admin can add more types later: do not
  fail on a type you do not know in the list endpoint).
- Audience: `user`, `driver`, `all`.
- Admin permission to edit: `legal.manage`.
- The website (`rentol.in/terms`, `/privacy`, `/refund`, `/cancellation`, `/about`) reads the same documents, so the apps and the
  website always show the same text.
