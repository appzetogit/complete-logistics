# State-wise admin view

Every admin sees, opens and changes only the data of the states (cities) assigned to them. The super admin sees everything, or one state through the selector in the admin header.

## How it works

```
State  ->  Service Locations (cities)  ->  Zones
                 |
   rides, drivers, riders, owners, vehicles, stores, airports, set prices, wallets, support ...
```

- A **state** is a master record (Admin -> Management -> States). Each **service location** (Pricing -> Service Location) belongs to one state.
- An **admin account** can be given states, and optionally single cities and zones (Admin -> Management -> Admins). The cities of its states count automatically, also cities added later.
- The limit is enforced in the database layer: while an admin request runs, every query on a scoped model gets the filter for the allowed cities (`src/modules/taxi/admin/services/adminScopeService.js` + `adminScopeMongoose.js`). Lists, details, edits, deletes, counts, dashboard totals, graphs and exports all obey it, and opening a record of another state answers not-found. The dashboard snapshot is cached per scope.
- Apps, sockets and background jobs are not affected (the filter exists only inside an admin request).

### Who is limited

| Account | View |
| --- | --- |
| Super admin | Everything. With a state picked in the header: only that state |
| Sub-admin with states / cities / zones | Only those cities. The header selector can narrow it to one of its states, never widen it |
| Legacy sub-admin with no state, city or zone | Unchanged: not limited by this filter (the older per-screen checks still apply) |

A limited admin cannot hand out areas outside its own, cannot see super admins, and cannot manage states (super admin only).

### What carries the city

| Record | Field | Set when |
| --- | --- | --- |
| Ride | `area_location_id` | At booking: the ride's `service_location_id`, else the zone, else the zone containing the pickup, else the nearest city within 150 km |
| Rider | `area_location_id` | Set once from the first ride's pickup |
| Driver | `area_location_id` | Copied from `service_location_id` when the driver is created (backfill for the rest) |
| Owner, fleet vehicle, store, airport, zone, set price | `service_location_id` | Chosen by the admin who creates it |
| Wallet transactions, withdrawals, subscriptions, support tickets | through the driver / rider / owner | automatic |

`area_location_id` is only a label for this view. It never changes dispatch or pricing (those keep using `service_location_id`).

### Selector

`x-admin-state: <stateId>` on admin requests (the header dropdown sets it; `all` or no header means no extra filter).

## Rollout (production)

Do this before the new code serves admins, or sub-admins that already have cities assigned will see riders / rides without a city as missing.

```bash
cd /root/complete-logistics/Backend
node scripts/stateWiseSetup.js seed-states --apply          # the states of India (skips existing)
node scripts/stateWiseSetup.js map-locations                  # lists cities that have no state
node scripts/stateWiseSetup.js map-locations --map "Indore=MP,Bhopal=MP,Pune=MH" --apply
node scripts/stateWiseSetup.js backfill                       # dry run: counts only
node scripts/stateWiseSetup.js backfill --apply               # labels existing rides, drivers, riders
```

Then in the admin panel: check Management -> States, give each sub-admin its states, and open the panel as that sub-admin to confirm.

Existing sub-admins already have service locations (the form required one): they become limited to those cities as soon as the new code runs.

## Limits to know

- A record without a city (for example a rider who never booked) is invisible to limited admins and visible to the super admin with "All states".
- Populating a field that points to an out-of-scope record (for example a ride in scope whose driver is in another state) returns an empty reference.
- Raw `aggregate` stages that `$lookup` into another collection are not filtered inside the lookup (the main collection is).
- `estimatedDocumentCount` is not filterable; the code does not use it.

## Tests

`test/integration/adminStateScope.test.js`: lists, details, edits across states, selector, legacy admins, city-only admins, state management, admin-account hand-out, ride labelling, dashboard totals.
