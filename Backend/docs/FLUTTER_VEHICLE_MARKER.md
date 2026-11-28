# Rentol: Flutter guide for the vehicle marker (a bike must not be drawn as a car)

For the Flutter developers of the **user app** (`flutter_taxi_user`, live tracking and "searching" maps) and the **driver app** (`rentol driver`, the rider's / own marker).

**Backend:** `complete-logistics`, commits `3402f84` (ride stores the booked vehicle's icon type and name) and `045f774` (scooty drivers are bikes).

---

## 1. The problem

A rider booked a ride, the driver arrived on a **TVS scooter** (`KA04JC1377`), and the rider's live-tracking map drew a **car**.

Two things caused it, both on the data side:

| Cause | Where | Fixed in |
|---|---|---|
| A scooty driver was saved as `vehicleType: "car"` (the coarse mapping only knew `bike` and `auto`, everything else became `car`) | `driver.vehicleType` | backend, `045f774` |
| New rides were stored with an **empty** `vehicleIconType` (the rider app does not send it), so both apps fell back to the generic car | `ride.vehicleIconType` | backend, `3402f84` |

The driver's precise icon type was **already correct** (`vehicleIconType: "scooty"`). An app that draws the marker from `driver.vehicleType` (coarse, was `car`) shows a car. **Use the precise fields, in the order of §3.**

---

## 2. The fields you get

### 2.1 Ride payload (`GET /rides/active/me`, `GET /rides/:id`, history, and the `ride:state` socket event)

| Field | Example | Meaning |
|---|---|---|
| `vehicleTypeId` | `"6adc94db…"` | The catalog vehicle the rider booked |
| `vehicleType` | `"Bike Direct"` | **New.** The booked vehicle's **name** (plain words) |
| `vehicleIconType` | `"bike"` | **Now filled.** The booked vehicle's family: `car` \| `bike` \| `scooty` \| `auto` \| `truck` \| `bus` \| `mini_bus` \| `LCV` |
| `vehicleIconUrl` | `"https://…/uploads/…png"` | The catalog `map_icon` image URL (`""` when none) |

### 2.2 The assigned driver (`ride.driver` / `driverId`)

| Field | Example | Meaning |
|---|---|---|
| `vehicleIconType` | `"scooty"` | **Precise.** The driver's real vehicle family. Prefer this |
| `vehicleType` | `"bike"` | Coarse class: `bike` \| `auto` \| `car` only. Do **not** draw the marker from this first |
| `vehicleMake`, `vehicleModel`, `vehicleNumber`, `vehicleColor` | `TVS`, `133.3`, `KA04JC1377` | For the driver card |

Backend note: after `045f774`, `driver.vehicleType` is `bike` for scooters, mopeds and motorcycles (it was `car`). Old data is fixed by `scripts/fixDriverVehicleType.js`.

### 2.3 Nearby drivers on the booking map (`GET /rides/available-drivers`)

Each marker has `vehicleTypeId`, `vehicleIconType`, `location`, `heading`, `etaMinutes` (no personal details). Draw by `vehicleIconType`.

### 2.4 The catalog (`GET /users/vehicle-types`)

Each vehicle has `icon_types`, `map_icon` (image URL, may be `""`), `image`, `name`. Cache the bitmaps by `vehicleTypeId` and reuse them for every marker of that type.

---

## 3. Which icon to draw: priority order

Use the **first** one that gives a usable image:

1. **`map_icon` / `vehicleIconUrl`** of the catalog vehicle (by `vehicleTypeId`): the admin's own artwork. Load with `CachedNetworkImage`, cache the `BitmapDescriptor`.
2. **`driver.vehicleIconType`** mapped to a bundled asset (table below). This is the real vehicle.
3. **`ride.vehicleIconType`** (what was booked) mapped to a bundled asset.
4. **`driver.vehicleType`** (`bike` / `auto` / `car`) mapped to a bundled asset.
5. A generic car icon. Last resort only.

| `vehicleIconType` | Bundled asset |
|---|---|
| `car` | car |
| `bike` | bike |
| `scooty` | scooty (or bike if you have no scooty art) |
| `auto` | auto (three-wheeler) |
| `truck` | truck |
| `LCV` | LCV / mini truck (or truck) |
| `bus` | bus |
| `mini_bus` | mini bus (or bus) |
| anything else / empty | fall through to the next step |

**Ambulance** is filed under `icon_types: "car"` in the catalog. If you need an ambulance icon, check `ride.vehicleType` (the name, for example `"Ambulance"`), not the family.

Compare values **case-insensitively** and trim them (`"LCV"` vs `"lcv"`).

### Example (illustrative)

```dart
/// Returns the asset path for a vehicle family, or null when unknown.
String? _assetFor(String? family) {
  switch ((family ?? '').trim().toLowerCase()) {
    case 'car':      return 'assets/markers/car.png';
    case 'bike':     return 'assets/markers/bike.png';
    case 'scooty':   return 'assets/markers/scooty.png';
    case 'auto':     return 'assets/markers/auto.png';
    case 'truck':    return 'assets/markers/truck.png';
    case 'lcv':      return 'assets/markers/lcv.png';
    case 'bus':      return 'assets/markers/bus.png';
    case 'mini_bus': return 'assets/markers/mini_bus.png';
    default:         return null;
  }
}

/// Marker image for the assigned driver on the rider's tracking map.
Future<BitmapDescriptor> markerIconFor(Ride ride) async {
  // 1. the catalog artwork of the booked vehicle (cached by vehicleTypeId)
  final url = ride.vehicleIconUrl;
  if (url != null && url.isNotEmpty) {
    final cached = await _markerCache.fromUrl(ride.vehicleTypeId, url);
    if (cached != null) return cached;
  }
  // 2. the driver's real vehicle, 3. what was booked, 4. the coarse class
  final asset = _assetFor(ride.driver.vehicleIconType)
      ?? _assetFor(ride.vehicleIconType)
      ?? _assetFor(ride.driver.vehicleType)
      ?? 'assets/markers/car.png';
  return _markerCache.fromAsset(asset);
}
```

---

## 4. Where to apply it

| Screen | App | Change |
|---|---|---|
| Live tracking ("Driver is on the way", the screen in the bug report) | user | marker from `markerIconFor(ride)` instead of a fixed car / `driver.vehicleType` |
| Searching for a driver / nearby drivers | user | per-marker `vehicleIconType` (§2.3) |
| Trip in progress and completed screens | user | same function |
| Ride history | both | `ride.vehicleIconType`, falling back as in §3 |
| The driver's own marker | driver | the driver's own `vehicleIconType` |

Do not hardcode a car anywhere in these screens.

---

## 5. Old rides

Rides booked **before** `3402f84` have `vehicleIconType: ""`. That is why the fallback chain matters: for them step 1 may still work (`vehicleIconUrl`), otherwise steps 2 and 4 use the **driver's** fields, which are correct. Do not treat an empty `ride.vehicleIconType` as an error.

---

## 6. QA checklist

1. Book a **Bike** ride, a driver on a bike accepts: the marker is a **bike** (searching, on the way, in progress).
2. Same with a **scooty** driver (TVS / Access): **scooty or bike**, never a car.
3. **Auto**, **Cab**, **Tourist Bus / Mini Traveller**, **truck / Tata Ace** (parcel): each shows its own family.
4. **Ambulance**: car family, the name says "Ambulance".
5. A vehicle with **no `map_icon`** (empty string): falls back to the bundled asset, no crash, no blank marker.
6. An **old completed ride** (empty `vehicleIconType`): history still shows the right icon from the driver's fields.
7. The marker **rotates** with `heading` and moves smoothly; changing the vehicle type does not reuse a stale cached bitmap.
8. Rider books a car but a driver's coarse `vehicleType` is `car` while the precise type is `scooty` (the old bug): shows the scooty / bike, not the car.

---

## 7. For the backend / admin (reference)

- `genericVehicleTypeOf` (`Backend/src/utils/genericVehicleType.js`): `bike | scoot | moped | motorcycle | activa` → `bike`, `auto` → `auto`, everything else → `car`.
- Existing drivers: `node scripts/fixDriverVehicleType.js` (dry run), `--apply` to write. Only `vehicleType` is changed.
- Catalog: set the right `icon_types` for each vehicle (Admin → Vehicle Types). A wrong `icon_types` there is the source of every wrong marker, and a missing `map_icon` means the app uses its bundled art.
