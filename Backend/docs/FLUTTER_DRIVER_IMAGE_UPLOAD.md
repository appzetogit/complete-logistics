# Driver App: image upload (`POST /common/upload/image`): contract and timeout debugging

For the Flutter developer of the **driver app** (`flutterdriver`). The driver app's profile photo upload fails with a client-side timeout. This file gives the backend contract, what has already been checked on the server, and what to check in the app.

## 1. The symptom

```
POST https://logistics.buytogetherindia.com/api/v1/common/upload/image
payload: {"image":"<data-uri 24259 chars>","folder":"driver-profile"}
ERROR: The request took longer than 0:00:20.000000 to receive data. It was aborted.
```

This is Dio's `receiveTimeout` (20 s): the app sent the request and got **no response for 20 seconds**. At the same time the app's other calls work (`GET /drivers/ride-offers` returns 200 every 15 seconds).

## 2. Backend contract (verified in the code)

`POST /common/upload/image`, login required (driver, owner, user, admin and the other roles; a driver whose account is still pending may upload too).

Request (JSON):

```json
{ "image": "data:image/jpeg;base64,/9j/4AAQ...", "folder": "driver-profile" }
```

| Field | Rule |
| --- | --- |
| `image` | Required. Must start with `data:image/png`, `jpeg`/`jpg`, `webp`, `gif`, `heic` or `heif`, followed by `;base64,`. Other types (SVG, HTML, octet-stream) are refused. |
| `folder` | Optional text; used as a sub-folder name (letters, digits, `.`, `_`, `-` only). |

Limits: JSON body up to 25 MB (backend and nginx). The file is written to the server's disk, so no external service is involved.

Success (`200`):

```json
{ "success": true, "data": { "url": "https://logistics.buytogetherindia.com/uploads/.../content-driver-profile-1731...jpg", "publicId": "...", "format": "jpg" } }
```

Use `data.url` as the image link. It is always an absolute URL.

Errors come back **immediately**, never as a hang:

| HTTP | When |
| --- | --- |
| 401 | No or expired login token |
| 400 `Image data is required` | `image` missing |
| 400 `Only PNG, JPEG, WebP, GIF or HEIC images can be uploaded` | Wrong data-URI prefix |
| 400 / 413 | Body too large |

So a 20-second timeout is **not** a backend validation error.

## 3. What was checked on the server

| Check | Result |
| --- | --- |
| Disk space | 61% used, 39 GB free |
| Uploads folder permissions | Writable; files were written to it today |
| Backend route with no token | `401` in 4 ms (route is alive) |
| Backend logs | No error or crash related to upload |
| Driver app traffic reaching the server | Yes: `GET /drivers/ride-offers` every 15 s with user agent `Dart/3.13` |
| The upload request of the driver app in the backend log | **Not seen so far.** The final live test (upload while the server is watched) is still pending |

Note: the site's nginx access log is switched off, so only the backend log (printed when a request finishes) and nginx's `error.log` (for a backend that does not answer within 60 s) can show it.

Conclusion so far: the server is healthy and normal calls from this phone arrive. The request that times out has not been seen on the server yet, so please also look at the app side.

## 4. What to check in the app

1. **Is the request really leaving the phone?** Add `onSendProgress` to the Dio call and log it (bytes sent vs total). If it never reaches 100%, the problem is on the device or network side, not the server.
2. **Timeouts for uploads.** The 20-second `receiveTimeout` applies to every call. For image uploads set longer limits on that request only, for example `Options(sendTimeout: Duration(seconds: 60), receiveTimeout: Duration(seconds: 60))`. This hides slow networks, so keep the checks below too.
3. **Image size.** The payload is a base64 string. Compress before encoding (for example `image_picker` with `maxWidth: 1080`, `imageQuality: 80`) so the body is well below 1 MB. A 24 KB payload is already small, so size alone is unlikely to be the cause here.
4. **Data-URI prefix.** Make sure the string starts with `data:image/jpeg;base64,` (or `png`). A wrong prefix is answered with a quick `400`, not a hang, but it should still be right.
5. **Same call, different network.** Try the upload on WiFi and on mobile data. If only one fails, it is the network (DNS, proxy, VPN, captive portal or ISP).
6. **Does anything else send POSTs?** Compare with another POST from the same app (for example saving the profile). If those work and only the image upload hangs, compare the two requests (headers, `Content-Type`, body size, whether `Content-Length` is correct).
7. **Retry and UX.** Show a clear error, keep the chosen photo, and offer Retry. Do not block the screen after a failure.
8. **Check from outside the app.** Call the same endpoint with a driver token from a REST client (Postman / `curl`) and a small base64 JPEG:

```bash
curl -m 30 -w "%{http_code} %{time_total}s\n" -X POST "https://logistics.buytogetherindia.com/api/v1/common/upload/image" \
  -H "Content-Type: application/json" -H "Authorization: Bearer <DRIVER_TOKEN>" \
  -d '{"image":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==","folder":"driver-profile"}'
```

If this returns `200` quickly, the backend is fine and the app's request is the difference.

## 5. Logging hygiene

The Dio logger prints the request headers. Do not print or share the `Authorization` value, and never paste logs that contain a token into chats or tickets. (The log shared earlier from a second app, `couriergo.online`, contained a full bearer token; that token should be treated as exposed.) Keep `(hidden)` for the driver app's header, as it already does, and apply the same to every app and package that logs requests.

## 6. When to report back

Send the backend owner: the time of the failed upload (with timezone), whether it was WiFi or mobile data, the `onSendProgress` result, and the result of the `curl` test in 4.8. With that the server logs can be matched to the exact request.
