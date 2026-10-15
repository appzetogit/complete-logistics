# Rentol: Flutter guide for driver images, now returned as URLs

This guide is for the Flutter developer of the **driver app** (`flutterdriver`). The **admin panel** follows the same rules.

**Backend:** "Driver profile image: store as a file, return a URL" (`complete-logistics`, 15 Oct 2026).

---

## 1. What changed (summary)

Driver images used to be saved as **base64 text** (`data:image/jpeg;base64,...`) and sent back in every response. `GET /drivers/me` was about **2.4 MB**. Now the server stores each image as a **file** and keeps and returns only its **URL**:

```
https://logistics.buytogetherindia.com/uploads/drivers/profile/3f2a…c9.jpg
```

| Image | Request (unchanged) | Stored / returned as |
|---|---|---|
| Profile photo | `PATCH /drivers/me { profileImage }` | `profileImage`: URL |
| Document photos | `PATCH /drivers/documents/:key { document: { previewUrl, secureUrl, url, images, … } }` | every one of those fields: the same URL |
| Daily selfie (go online) | `PATCH /drivers/online { location, selfieImageUrl }` | `onlineSelfie.imageUrl`: URL |
| Vehicle photo | `PATCH /drivers/vehicle { vehicleImage }` | `vehicleImage`: URL |
| Onboarding document upload | `PATCH /drivers/onboarding/documents` | `previewUrl` / `secureUrl`: URL (as before) |

**The app keeps sending base64 data URLs exactly as today.** Nothing changes in the requests. Only the **responses** now contain URLs, and they are much smaller.

**Old drivers:** existing base64 images are converted on the server, either by a one-time script or automatically the first time `GET /drivers/me` is read. After that, the app only ever receives URLs.

---

## 2. Rules for uploads (new server checks)

| Rule | Limit |
|---|---|
| Accepted types | **JPEG, PNG, WebP** only. The server checks the real file bytes, not just the `data:image/...` label. |
| Profile photo, selfie, vehicle photo | **2 MB** after decoding |
| Document photo | **5 MB** after decoding |
| Empty string `""` | Clears the image (profile photo, vehicle photo) |
| A value that is already a URL (`http…`) | Kept as it is. Sending the same URL back unchanged is fine. |

On a bad image the server answers **400**:

```json
{ "success": false, "message": "Profile photo must be a JPEG, PNG or WebP image", "code": "INVALID_IMAGE" }
{ "success": false, "message": "Profile photo is too large (2.6 MB). The limit is 2 MB.", "code": "INVALID_IMAGE" }
```

**Show `message` as it is**, for example "Please choose a JPEG or PNG photo under 2 MB".

### Your current picker settings are already fine

```dart
// edit_profile_screen.dart:46            -> ~100 KB
picker.pickImage(source: ImageSource.camera, imageQuality: 80, maxWidth: 800);
// documents_upload_screen.dart:53, documents_screen.dart:74, home_screen.dart:229 -> a few hundred KB
picker.pickImage(source: source, imageQuality: 80, maxWidth: 1280);
```

Keep `imageQuality` and `maxWidth` on **every** picker call. They keep the files small, and on iOS they make `image_picker` re-encode **HEIC** photos to JPEG. **HEIC is not accepted**, so a gallery photo picked without these options can fail with `INVALID_IMAGE`.

The app labels every picture `data:image/jpeg;base64,…`. That's fine: if the bytes are actually PNG, the server detects it and stores a `.png`.

---

## 3. Showing the images (**check this**)

Every image field is now either:
- an **`https://…` URL**: load it from the network, with caching; or
- **empty `""`**: no image, so show the placeholder.

Until all old drivers are converted, a `data:image/...` value can still appear for a short while. Keep handling it, as `lib/shared/widgets/source_image.dart` already does in the live app.

**Bug in the local copy of the app:** `edit_profile_screen.dart:96` and `profile_screen.dart:172` use

```dart
driver?.profileImage != null ? NetworkImage(driver!.profileImage!) : null
```

That only checks for `null`. After the photo is cleared, the value is `""`, and `NetworkImage('')` throws an error. Check for empty too, and use the shared widget:

```dart
// one helper for every driver image (profile, documents, selfie, vehicle)
ImageProvider? driverImageProvider(String? source) {
  final value = (source ?? '').trim();
  if (value.isEmpty) return null;                                    // no image -> placeholder
  if (value.startsWith('data:image')) {                              // old row, until converted
    return MemoryImage(base64Decode(value.substring(value.indexOf(',') + 1)));
  }
  if (value.startsWith('http')) return CachedNetworkImageProvider(value);   // or NetworkImage(value)
  return null;
}

// usage
CircleAvatar(
  backgroundImage: driverImageProvider(driver?.profileImage),
  child: (driver?.profileImage ?? '').isEmpty ? const Icon(Icons.person) : null,
)
```

**Caching:** the same picture always gets the same URL (the file name is a hash of the picture). A **new** photo gets a **new** URL, so normal URL caching (`cached_network_image`) always shows the latest photo; no cache-busting is needed.

---

## 4. Requests (no change, for reference)

```dart
// Profile photo
await api.patch('/drivers/me', data: {'profileImage': 'data:image/jpeg;base64,$b64'});
// response: data.profileImage = "https://…/uploads/drivers/profile/<hash>.jpg"

// Remove the photo
await api.patch('/drivers/me', data: {'profileImage': ''});

// Document photo
await api.patch('/drivers/documents/$key', data: {'document': {
  'fileName': 'aadhaar.jpg',
  'previewUrl': 'data:image/jpeg;base64,$b64',
}});
// stored: previewUrl / secureUrl / imageUrl / images[0] = the same "https://…/uploads/drivers/documents/<hash>.jpg"
```

After a successful upload, **use the URL from the response** (or refresh `/drivers/me`). Don't keep the base64 in app state.

---

## 5. QA checklist

- [ ] Change the profile photo → `GET /drivers/me` returns `profileImage` as an `https://…/uploads/drivers/profile/…` URL; the photo shows everywhere (profile, edit profile, ride screens for the rider).
- [ ] Open that URL in a browser → the photo loads.
- [ ] Remove the photo → the placeholder shows, with no crash (`""`, not `null`).
- [ ] Upload a document photo → the documents screen shows it from a URL.
- [ ] Go online with a selfie → works as before.
- [ ] Pick a very large gallery image without compression → a clear "too large" message (400 `INVALID_IMAGE`), no crash.
- [ ] The app feels faster: `/drivers/me` is now a few KB instead of about 2.4 MB.

---

## 6. For the backend / admin (reference)

- Files are written to `UPLOAD_DIR` (it must be the folder nginx serves at `/uploads/`). URLs start with `PUBLIC_BACKEND_URL`; both are set in `Backend/.env`.
- One-time conversion of old drivers, run on the server:
  ```bash
  node scripts/migrateDriverInlineImages.js
  ```
  That is a dry run: it lists the drivers and the size saved, and changes nothing. Then run it again with `--apply` to convert them. A picture that cannot be converted is left as it is and listed (never deleted).
- The admin panel's create / edit driver follows the same rules: photos and documents become files, and only JPEG / PNG / WebP are accepted.
- General upload security: HTML, SVG, XML and script files can no longer be uploaded anywhere. They would be served from the admin panel's domain.
