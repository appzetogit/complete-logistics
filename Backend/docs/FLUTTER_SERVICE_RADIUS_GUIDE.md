# Driver App: Service Radius (Flutter implementation guide)

For the Flutter developer of the **driver app** (`flutterdriver`). The backend and the Admin Panel are done. This guide says **where the Admin manages it**, what the API returns, and exactly what to build in the app.

Backend rules in short: `Backend/docs/HYBRID_RADIUS_BACKEND.md`.

---

## 1. What the feature is

Every driver is offered ride requests within a **service radius** around the pickup. Before, the Admin set one radius for all drivers. Now:

- The Admin still sets the **default radius**, plus a **minimum** and a **maximum**, and an **ON/OFF switch** for "driver custom radius".
- When the switch is **ON**, a driver can choose their own radius between the minimum and the maximum from the app.
- When it is **OFF**, or a driver has not chosen, the **default radius** applies.

The app only shows and saves the driver's choice. **The backend decides the real (effective) radius and who gets which ride.** Never compute eligibility in the app.

## 2. Where the Admin manages it

**Admin Panel > Settings (sidebar) > Business Settings > Transport Ride Settings** (URL path `/admin/settings/business/transport-ride`, needs the `settings.view` permission). On that page, the card **"Driver Search Radius"** has:

| Admin field | What it does | Default |
| --- | --- | --- |
| **Default Radius (km)** | Radius for every driver who has not chosen their own (and for everyone while the switch is OFF). This is the old "Driver Search Radius in Kilometer" field, moved into the card. | 5 |
| **Minimum Radius (km)** | Smallest value a driver may pick | 2 |
| **Maximum Radius (km)** | Largest value a driver may pick | 15 |
| **Enable Driver Custom Radius** (toggle) | ON: drivers can pick their own radius. OFF: everyone uses the default | **OFF** |

The Admin presses **Update Settings** to save. The page rejects a bad combination (minimum must be above 0, maximum at least the minimum, default inside the range) and shows the message.

**What the Admin's changes mean for the app (all take effect immediately, no app update):**

| Admin action | What the driver sees in the app |
| --- | --- |
| Switch OFF (the starting state) | `allowCustomRadius: false`. Show the default radius, no slider. The driver's earlier choice is kept in the backend, just inactive. |
| Switch ON | `allowCustomRadius: true`. The slider is available between min and max. |
| Changes the default radius | Drivers on the default get the new value; drivers with a valid custom radius keep theirs. |
| Changes min / max so a driver's saved radius is now outside | `customRadiusActive: false`, `effectiveRadius` falls back to the default. The saved value is **not** deleted. The driver has to pick a value inside the new range. |
| Switch OFF, then ON again | The driver's earlier valid choice is active again. |

There is no push/socket event when the Admin changes this: the app reads the current values **every time the screen opens** (see section 7).

## 3. API contract

Base URL is the same as the other driver APIs (`.../api/v1`). Driver login required. The driver is the one in the token: do not send any driver id (it is ignored).

### Read: `GET /drivers/service-radius`

```json
{ "success": true, "data": {
  "defaultRadius": 5,
  "minRadius": 2,
  "maxRadius": 15,
  "allowCustomRadius": true,
  "serviceRadius": 8,
  "isCustomRadius": true,
  "customRadiusActive": true,
  "effectiveRadius": 8
}}
```

| Field | Meaning |
| --- | --- |
| `defaultRadius`, `minRadius`, `maxRadius` | Admin values, in km |
| `allowCustomRadius` | The Admin switch. `false` means no custom radius at all right now |
| `serviceRadius` | The driver's saved number (km), or `null` if never chosen |
| `isCustomRadius` | `true` if the driver chose to use their own radius |
| `customRadiusActive` | `true` only if the saved radius is **in force right now** (switch ON, chosen, and inside today's min..max) |
| `effectiveRadius` | **The radius actually used by the backend now.** Show this as "Your active radius" |

### Save: `PATCH /drivers/service-radius`

| Body | Effect |
| --- | --- |
| `{ "serviceRadius": 8 }` | Use my own radius (km). Decimals are allowed (stored to 2 places). Limits are inclusive. |
| `{ "isCustomRadius": false }` | Go back to the Admin default. The saved number stays stored. |

Returns the same JSON as the GET (already updated), plus `"message": "Service radius saved"`. Use the returned values to refresh the screen.

### Errors

The usual shape: `{ "success": false, "message": "...", "details": { "code": "..." } }`.

| HTTP | `details.code` | When | What the app does |
| --- | --- | --- | --- |
| 403 | `custom_radius_disabled` | Admin switch is OFF | Refetch (GET) and show the "default radius is active" state |
| 400 | `radius_out_of_range` | Below the minimum or above the maximum (`details.minRadius`, `details.maxRadius` are included) | Show the message, refetch to get the latest limits |
| 400 | `invalid_radius` | Missing or not a number | Should not happen with a slider |
| 401 | none | Not logged in / token expired | Existing logout flow |
| 403 | none | Not a driver token (for example an owner account) | Hide the feature for non-driver roles |

**Important:** the app's `ApiException` (`lib/core/network/api_exception.dart`) currently keeps only `message`, `statusCode` and `errors`. To read `details.code`, add a small field, for example:

```dart
class ApiException implements Exception {
  final String message;
  final int? statusCode;
  final List<String>? errors;
  final String? code;               // new: details.code from the backend

  ApiException(this.message, {this.statusCode, this.errors, this.code});

  factory ApiException.fromDioError(DioException error) {
    final response = error.response;
    if (response != null && response.data is Map) {
      final data = response.data as Map;
      final details = data['details'];
      return ApiException(
        data['message']?.toString() ?? _fallbackMessage(error),
        statusCode: response.statusCode,
        errors: data['errors'] is List ? (data['errors'] as List).map((e) => e.toString()).toList() : null,
        code: details is Map ? details['code']?.toString() : null,   // new
      );
    }
    return ApiException(_fallbackMessage(error), statusCode: response?.statusCode);
  }
  // ...rest unchanged
}
```

It is an additive change; nothing else needs updating.

## 4. What to build

New feature folder following the existing pattern (`features/profile`): data layer, a provider, one screen, one route, one menu entry.

### 4.1 API constant: `lib/core/constants/api_constants.dart`

```dart
// Service radius (Admin-defined range, driver-chosen value)
static const String serviceRadius = '/drivers/service-radius';
```

### 4.2 Model: `lib/features/profile/data/service_radius.dart`

```dart
class ServiceRadius {
  final double defaultRadius;
  final double minRadius;
  final double maxRadius;
  final bool allowCustomRadius;
  final double? serviceRadius;      // saved choice, null if never chosen
  final bool isCustomRadius;
  final bool customRadiusActive;
  final double effectiveRadius;

  const ServiceRadius({
    required this.defaultRadius,
    required this.minRadius,
    required this.maxRadius,
    required this.allowCustomRadius,
    required this.serviceRadius,
    required this.isCustomRadius,
    required this.customRadiusActive,
    required this.effectiveRadius,
  });

  factory ServiceRadius.fromJson(Map<String, dynamic> j) {
    double n(dynamic v, [double fallback = 0]) => v is num ? v.toDouble() : double.tryParse('$v') ?? fallback;
    return ServiceRadius(
      defaultRadius: n(j['defaultRadius']),
      minRadius: n(j['minRadius']),
      maxRadius: n(j['maxRadius']),
      allowCustomRadius: j['allowCustomRadius'] == true,
      serviceRadius: j['serviceRadius'] == null ? null : n(j['serviceRadius']),
      isCustomRadius: j['isCustomRadius'] == true,
      customRadiusActive: j['customRadiusActive'] == true,
      effectiveRadius: n(j['effectiveRadius']),
    );
  }

  /// Where the slider starts: the active custom value, else the saved one if it still fits, else the default.
  double get sliderStart {
    final saved = serviceRadius;
    if (saved != null && saved >= minRadius && saved <= maxRadius) return saved;
    final d = defaultRadius;
    return d.clamp(minRadius, maxRadius).toDouble();
  }
}
```

### 4.3 Repository: add to `features/profile/data/profile_repository.dart`

```dart
Future<ServiceRadius> getServiceRadius() async {
  final data = await _api.get(ApiConstants.serviceRadius);
  return ServiceRadius.fromJson(Map<String, dynamic>.from(data as Map));
}

Future<ServiceRadius> saveServiceRadius(double radiusKm) async {
  final data = await _api.patch(ApiConstants.serviceRadius, data: {'serviceRadius': radiusKm});
  return ServiceRadius.fromJson(Map<String, dynamic>.from(data as Map));
}

Future<ServiceRadius> useDefaultServiceRadius() async {
  final data = await _api.patch(ApiConstants.serviceRadius, data: {'isCustomRadius': false});
  return ServiceRadius.fromJson(Map<String, dynamic>.from(data as Map));
}
```

(`ApiClient` already unwraps `data`, as in the other repositories. Match the field name the repository uses for the client.)

### 4.4 Provider: `features/profile/application/profile_providers.dart`

```dart
final serviceRadiusProvider = FutureProvider.autoDispose<ServiceRadius>((ref) {
  return ref.watch(profileRepositoryProvider).getServiceRadius();
});
```

`autoDispose` means it reloads every time the screen is opened, which is what we want (the Admin may have changed the settings).

### 4.5 Screen: `features/profile/presentation/service_radius_screen.dart`

Use `CustomAppBar(title: 'Service Radius')`, `AppColors` and `SnackbarUtils` like the other profile screens.

Content, top to bottom:

1. **Active radius** card: "Your active radius" with `effectiveRadius` (for example "8 km") and a small line explaining the source: "Your own radius" when `customRadiusActive`, otherwise "Default radius set by the admin".
2. **Limits row**: "Minimum 2 km", "Default 5 km", "Maximum 15 km" (from the API, never hard-coded).
3. **Slider**, only when `allowCustomRadius`:
   - `min: minRadius`, `max: maxRadius`, value starts at `sliderStart`.
   - `divisions: ((maxRadius - minRadius) / 0.5).round()` (0.5 km steps; use 1 if you prefer), `label: '${v.toStringAsFixed(1)} km'`.
   - A marker or text for the default value is enough.
4. **Save Radius** button: disabled while saving, and when the slider value equals the current `effectiveRadius` with `customRadiusActive` true. Shows a spinner while saving (this is also the duplicate-tap guard).
5. **"Use default radius"** text button: shown when `isCustomRadius` is true. Calls `useDefaultServiceRadius()`.
6. When **`allowCustomRadius` is false**: do not show the slider or the buttons. Show an info box: "Custom radius is turned off. The default radius of X km is used for everyone." Do not tell the driver to contact anyone unless your product wants that.
7. When `isCustomRadius` is true but `customRadiusActive` is false (limits changed): show a warning box: "Your saved radius (Y km) is outside the current allowed range (min to max km). The default radius is used until you choose a new one." Keep the slider enabled.

Skeleton:

```dart
class ServiceRadiusScreen extends ConsumerStatefulWidget {
  const ServiceRadiusScreen({super.key});
  @override
  ConsumerState<ServiceRadiusScreen> createState() => _ServiceRadiusScreenState();
}

class _ServiceRadiusScreenState extends ConsumerState<ServiceRadiusScreen> {
  double? _value;       // slider value while the driver is choosing
  bool _saving = false;

  Future<void> _save(ServiceRadius info) async {
    if (_saving) return;
    setState(() => _saving = true);
    try {
      final next = await ref.read(profileRepositoryProvider).saveServiceRadius(_value ?? info.sliderStart);
      ref.invalidate(serviceRadiusProvider);
      _value = next.sliderStart;
      SnackbarUtils.success('Service radius saved');
    } on ApiException catch (e) {
      SnackbarUtils.error(e.message);
      ref.invalidate(serviceRadiusProvider);          // the Admin limits may have changed: reload them
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(serviceRadiusProvider);
    return Scaffold(
      appBar: const CustomAppBar(title: 'Service Radius'),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => /* message + Retry: ref.invalidate(serviceRadiusProvider) */ const SizedBox(),
        data: (info) => /* build the sections above using info and _value ?? info.sliderStart */ const SizedBox(),
      ),
    );
  }
}
```

### 4.6 Route and menu entry

- `lib/app/router.dart`: `GoRoute(path: '/service-radius', builder: (context, state) => const ServiceRadiusScreen()),`
- `lib/features/profile/presentation/settings_screen.dart`: add a `_SettingsTile(icon: Icons.social_distance_outlined, title: 'Service Radius', onTap: () => context.push('/service-radius'))` (for example under "Preferences").
- Optional shortcut on the home screen is not needed.

Show the entry only for the **driver** role (the API answers 403 for owners and other roles).

## 5. UI states checklist

| State | Behaviour |
| --- | --- |
| Loading | Spinner |
| Error loading | Message with Retry (`ref.invalidate(serviceRadiusProvider)`) |
| `allowCustomRadius == false` | Info box, no slider, no buttons |
| `allowCustomRadius == true`, never chosen | Slider at the default, "Default radius" as the source |
| Chosen and in force | Slider at the saved value, source "Your own radius", "Use default radius" button |
| Chosen but outside new limits | Warning box, default is active, slider asks for a new value |
| Saving | Buttons disabled, spinner; ignore extra taps |
| Save success | Success snackbar, screen shows the returned values |
| Save error | Error snackbar with the server message, then reload |

Make the layout scroll (`ListView`) so it works on small phones; follow the existing spacing and colors.

## 6. What the driver will notice (set expectations)

- A **smaller** radius means fewer ride requests (only closer pickups). A **larger** radius means more requests, including farther pickups.
- Rides are still assigned by the backend. A saved radius does not guarantee any request count.
- The change applies to **new** ride requests from the moment it is saved. No app restart is needed.
- A custom radius is fixed. The default radius grows during a long search for rides, but a custom radius does not.

## 7. When to call the API

| When | Call |
| --- | --- |
| Opening the Service Radius screen | `GET` (via the `autoDispose` provider) |
| Driver taps Save Radius | `PATCH` with `serviceRadius` |
| Driver taps Use default radius | `PATCH` with `isCustomRadius: false` |
| After any `403 custom_radius_disabled` or `400 radius_out_of_range` | `GET` again |

Do not cache the response between screen openings, and do not poll. There is no socket event for this.

## 8. Test checklist (with the Admin page open)

1. Admin: switch **OFF**. App: Service Radius screen shows the info box and the default radius, no slider.
2. Admin: switch **ON** (default 5, min 2, max 15) and save. Reopen the screen: slider from 2 to 15.
3. Choose 8 km, Save. The active radius shows 8 km; reopen the screen: still 8 km.
4. Admin: change the default to 6. The driver with 8 km still shows 8 km; a driver who never chose shows 6 km.
5. Admin: switch OFF. The driver's screen shows the default; reopen after switching ON: the 8 km choice is back.
6. Admin: change the maximum to 6 (default 5 stays valid). The driver's screen shows the warning box and the default; choosing 8 now fails with the range message; choosing 4 works.
7. Try a PATCH from a REST client with 1 or 100: rejected with `radius_out_of_range`. The app's slider never sends these.
8. Tap Save quickly several times: only one request is sent.
9. Airplane mode: error state with Retry, no crash.
10. Owner / non-driver login: the Service Radius entry is not shown.
11. With a second device, confirm a driver with a small radius is not offered a far pickup, and a driver with a large radius is (ask the backend owner for the test pickup if needed).

## 9. FAQ

**Can the driver choose a decimal radius?** Yes (the slider uses 0.5 km steps). The backend keeps two decimals.

**What if the Admin sets min greater than max?** The Admin page refuses to save it. If a broken value ever exists, the backend turns `allowCustomRadius` off and the default is used.

**Does this change how rides are accepted or priced?** No. Only which drivers are offered a ride changes.

**Where can I see the Admin's values quickly?** In the same `GET /drivers/service-radius` response (`defaultRadius`, `minRadius`, `maxRadius`, `allowCustomRadius`). The Admin Panel path is in section 2.
