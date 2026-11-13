# Hybrid radius: backend and Admin (for the Driver App integration)

The Admin keeps the default driver search radius. Drivers can optionally pick their own radius inside an Admin-defined range. The backend works out each driver's **effective radius**; ride dispatch uses it per driver. The Driver App is not part of this change; this file is the contract for it.

## Admin settings

Stored with the existing transport settings (`AdminBusinessSetting.transport_ride`, string values, km). Edited on **Admin Panel > Settings > Business Settings > Transport Ride Settings > Driver Search Radius card** (existing page). API (existing): `GET` / `PATCH /admin/general-settings/transport-ride` with `{ "settings": { ... } }`.

| Key | Meaning | Default |
| --- | --- | --- |
| `driver_search_radius` | Default radius (existed before) | `5` |
| `driver_min_search_radius` | Smallest radius a driver may pick | `2` |
| `driver_max_search_radius` | Largest radius a driver may pick | `15` |
| `allow_driver_custom_search_radius` | `1` = drivers may use their own radius, `0` = everyone uses the default | `0` (OFF: nothing changes until the Admin turns it on) |

Rules checked on save (`400` with a message when broken): min > 0, max >= min, default inside min..max. The switch is stored as `1` / `0`. Saving drops the settings cache, so changes apply at once.

## Driver fields

On the driver record (no migration; older drivers simply have neither field and use the default): `serviceRadius` (km, `null`) and `isCustomRadius` (`false`). The saved choice is kept while the Admin switch is OFF or when it falls outside new limits.

## Resolution rule (`services/driverRadius.js`)

```
if allowCustomRadius (switch ON and limits usable) and driver.isCustomRadius
   and min <= driver.serviceRadius <= max      ->  effective = driver.serviceRadius
else                                            ->  effective = default radius
```

A saved radius outside today's limits is inactive (not deleted) until the driver picks a valid one. Limits are inclusive. Broken limits never enable custom radii.

## Driver APIs (new, driver login required)

The driver is always the one in the token; an id in the path, query or body is ignored.

`GET /drivers/service-radius` and `PATCH /drivers/service-radius` return the same shape:

```json
{ "success": true, "data": {
  "defaultRadius": 5, "minRadius": 2, "maxRadius": 15, "allowCustomRadius": true,
  "serviceRadius": 8, "isCustomRadius": true, "customRadiusActive": true, "effectiveRadius": 8
}}
```

`PATCH` body:

| Body | Effect |
| --- | --- |
| `{ "serviceRadius": 8 }` | Use my own radius (km). Checked against the live Admin limits. |
| `{ "isCustomRadius": false }` | Back to the Admin default. The saved number is kept. |

Errors (`details.code`): `custom_radius_disabled` (403, Admin switch is OFF), `radius_out_of_range` (400, includes `minRadius` / `maxRadius`), `invalid_radius` (400, not a number). `401` without a login, `403` for a non-driver token. `effectiveRadius` is always computed by the server; any value the app sends for it is ignored.

For the Driver App: show the slider only when `allowCustomRadius` is true (otherwise show that the default applies), use `minRadius` / `maxRadius` / `defaultRadius` from the GET for the slider, and show `effectiveRadius` as the active radius. Saved choices outside the limits come back with `customRadiusActive: false`.

## Ride matching

`resolveTransportDispatchConfig()` now also returns `driverRadius` (the configuration). `dispatchService` passes it to `matchDrivers`, which keeps the existing search and adds one step:

- Drivers **without** a valid custom radius keep the existing behavior: the dispatch attempt radius, which still grows with each attempt.
- A driver **with** a valid custom radius is judged by that fixed radius (it does not grow). The candidate search is widened to the Admin maximum so such a driver can be found beyond the default radius, and a driver is kept only if the pickup is inside their own radius.
- With the switch OFF the matching code path is unchanged.
- To avoid nearby drivers with small radii crowding out eligible ones, the query over-fetches and re-queries with a larger limit when needed (capped at 400 candidates).

Not changed: GPS distance code, zone rules, vehicle/wallet/online filters, broadcast or one-by-one dispatch, assignment. The rider's "available drivers" map listing (`GET /rides/available-drivers`) is a display feature with its own distance and is not affected.

## Tests

`src/modules/taxi/services/driverRadius.test.js` (rules) and `test/integration/hybridRadius.test.js` (Admin API, driver API, the business scenarios, matching, and a socket dispatch that checks which drivers are offered a ride).
