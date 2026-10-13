# Rentol – Flutter guide: goods (parcel) prices come only from Set Price

For the Flutter developer of the **user app** (`flutter_taxi_user`), and a short part for the driver app.
Backend commits: `1ca2d7e`, `ee196d2`, `53e84bc` (live on the server since 13 Oct 2026).

---

## 1. What changed (in one minute)

| Before | Now |
|---|---|
| A goods fare came from the **Vehicle Type** page prices when no Set Price existed | Goods fares come **only** from **Admin → Pricing → Set Price** rows saved as **"Pricing for: Delivery"**. The Vehicle Type prices are never used. |
| A vehicle with no price could still be booked, at the `fare` the app sent (often 0) | A vehicle with no Delivery price is **not priced**: the quote says so and the **booking is refused** (409 `PRICE_NOT_SET`). |
| Commission and payment methods could come from a "Both" row or the vehicle | They come from the **same Delivery Set Price** that priced the fare. |
| `POST /rides` with `serviceType: "parcel"` created a goods ride at the app's price | Refused (400 `USE_DELIVERIES_ENDPOINT`). Goods are booked **only** with `POST /deliveries`. |
| `fare` in `POST /deliveries` could become the price | `fare` is **ignored**. The server's quote price is always charged. |

The current goods prices (All Zones) are:

| Vehicle | Base | Base distance | After that | Tax |
|---|---|---|---|---|
| Rentol Pickup (1 Ton) | ₹15 | 15 km | ₹30/km | 15% |
| Rentol 14 FT (4 Ton) | ₹250 | 2 km | ₹200/km | 8% |
| Rentol 17 FT (6 Ton) | ₹400 | 2 km | ₹35/km | 5% |
| Rentol 20 Ft (7 ton) | ₹600 | 2 km | ₹45/km | 5% |
| Rentol 22 Ft (10 ton) | ₹700 | 2 km | ₹55/km | 5% |

The app must **never** compute or hard-code these. Always show the quote.

---

## 2. The quote (`POST /deliveries/quote`)

Request (unchanged, plus the route distance from §5):

```json
{ "vehicleTypeId": "6acc9bde…", "pickup": [75.8577, 22.7196], "drop": [75.8937, 22.7533],
  "parcel": { "category": "Furniture" }, "loadHeightKey": "", "extraKeys": [],
  "estimatedDistanceMeters": 8200, "estimatedDurationMinutes": 26 }
```

Response when the vehicle **is priced**:

```json
{ "success": true, "data": {
  "vehicleTypeId": "6acc9bde…", "vehicleName": "Rentol 20 Ft(7 ton)",
  "priced": true, "priceNotSet": false,
  "pricingSource": "set_price", "setPriceId": "6acde4cf…",
  "distanceKm": 8.2, "baseDistanceKm": 2, "basePrice": 600, "distanceCharge": 279,
  "loadHeightCharge": 0, "extrasCharge": 0,
  "subtotal": 879, "serviceTaxPercentage": 5, "serviceTaxAmount": 43.95, "total": 922.95,
  "estimatedDistanceMeters": 8200, "estimatedDurationMinutes": 26, "distanceSource": "route",
  "advancePercent": 20, "advanceAmount": 184.59, "remainingAmount": 738.36,
  "detention": { "...": "..." }
} }
```

Response when the vehicle is **not priced** (no Delivery Set Price for this vehicle in this area):

```json
{ "success": true, "data": {
  "vehicleTypeId": "…", "priced": false, "priceNotSet": true, "pricingSource": "none",
  "setPriceId": null, "total": 0, "subtotal": 0, "...": "..."
} }
```

| field | meaning |
|---|---|
| `priced` | `true` = a real price, show `total` |
| `priceNotSet` | **new.** `true` = the admin hasn't set a goods price for this vehicle/area, so it **cannot be booked** |
| `pricingSource` | `set_price` (priced) or `none` (no Delivery Set Price). `vehicle` is no longer returned |
| `total` | what will be charged (advance + remaining). `0` when not priced |
| `distanceSource` | `route` (your route distance was used) or `straight_line` (see §5) |

---

## 3. Changes in the user app

### 3.1 `DeliveryQuote` model: add the new fields

```dart
class DeliveryQuote {
  // ...existing fields...
  final bool priced;
  final bool priceNotSet;          // NEW
  final String pricingSource;      // NEW: 'set_price' | 'none'
  final int estimatedDistanceMeters;   // NEW
  final int estimatedDurationMinutes;  // NEW
  final String distanceSource;     // NEW: 'route' | 'straight_line'

  bool get canBook => priced && !priceNotSet && total > 0;

  factory DeliveryQuote.fromJson(Map<String, dynamic> j) => DeliveryQuote(
    // ...existing...
    priced: j['priced'] == true,
    priceNotSet: j['priceNotSet'] == true,
    pricingSource: (j['pricingSource'] ?? '').toString(),
    estimatedDistanceMeters: (j['estimatedDistanceMeters'] as num?)?.toInt() ?? 0,
    estimatedDurationMinutes: (j['estimatedDurationMinutes'] as num?)?.toInt() ?? 0,
    distanceSource: (j['distanceSource'] ?? '').toString(),
  );
}
```

### 3.2 Vehicle card: "Price not set" instead of "Price on request"

Today `goods_transport_screen.dart` (`_expandedPriceLabel`) shows **"Price on request"** when `priced != true`. That
now means the vehicle **cannot be booked**, so make it clear and grey the card out:

```dart
final quote = booking.quote;
if (quote == null) return const _PriceShimmer();
if (!quote.canBook) {
  return const Text('Price not set',
      style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: Color(0xFFB91C1C)));
}
return Text('₹${_money(quote.total)}', /* ...existing style... */);
```

### 3.3 Disable "Book" when the vehicle can't be booked

Today the confirm button (`_confirmVehicle`, `delivery_address_screen.dart` `_confirm`) is enabled even with an
unpriced quote, and the app sent `fare: 0`. The server now refuses that, so disable it in the UI:

```dart
final quote = ref.watch(deliveryBookingProvider).quote;
final canBook = quote != null && quote.canBook && !_booking;

ElevatedButton(
  onPressed: canBook ? () => _confirmVehicle(vehicle) : null,
  child: Text(canBook ? 'Book ${vehicle.name}' : 'Price not set for this vehicle'),
);
```

In `DeliveryBookingController.confirm()`, also guard:

```dart
final quote = state.quote;
if (quote == null || !quote.canBook) {
  throw ApiException('This vehicle has no price set for this area yet. Please choose another vehicle.');
}
```

### 3.4 Handle the booking errors

`POST /deliveries` can now answer:

| HTTP | `code` | when | what to show |
|---|---|---|---|
| 409 | `PRICE_NOT_SET` | no Delivery Set Price for this vehicle at the pickup (for example the admin removed it after the quote) | "This vehicle has no price set for this area yet. Please choose another vehicle." Refresh the quote and keep the rider on the vehicle list |
| 400 | `USE_DELIVERIES_ENDPOINT` | a goods booking was sent to `POST /rides` | developer error: goods must use `POST /deliveries` |

```dart
try {
  final rideId = await ref.read(deliveryBookingProvider.notifier).confirm();
  context.go('/delivery/searching/$rideId');
} on ApiException catch (e) {
  if (e.code == 'PRICE_NOT_SET') {
    await ref.read(deliveryBookingProvider.notifier).retryQuote();   // card turns to "Price not set"
  }
  showSnack(e.message);
}
```

(If your `ApiException` doesn't keep the body's `code` yet, add it: the error body is
`{ "success": false, "message": "...", "code": "PRICE_NOT_SET", "details": {...} }`.)

### 3.5 `fare` in `POST /deliveries` is ignored

You can keep sending `fare: quote.total`, but the server always charges its own price (the same as the quote). Never
show a locally computed price.

### 3.6 Show goods vehicles that are "Both"

`deliveryVehicleTypesProvider` keeps only `transportType == 'delivery'`. Vehicles the admin set as **Both** (taxi and
goods) are then missing from the goods list. Include them:

```dart
.where((v) => const {'delivery', 'both'}.contains(v.transportType.toLowerCase()))
```

---

## 4. Vehicle catalog (`GET /users/vehicle-types`)

If any screen reads prices from the catalog instead of the quote:

- `delivery_pricing_source`: `"set_price"` (an All Zones Delivery price exists) or **`"none"`** (no All Zones price).
- With `"none"`, `delivery_distance_pricing` is `{ "enabled": false, "base_price": 0, "distance_price": 0, ... }`
  and `service_tax` is `0`.
- A **zone-specific** price is not visible in the catalog. Only the quote knows it. So use the catalog only for a
  "from ₹…" hint, and **the quote for the real price and for deciding whether the vehicle can be booked**.

---

## 5. Send the route distance (recommended)

Goods are priced by distance. Send the road distance and time from your maps route with **both** the quote and the
booking, so the charged price equals the quoted one:

```dart
'estimatedDistanceMeters': route.distanceMeters,              // int, meters
'estimatedDurationMinutes': (route.durationSeconds / 60).round(),
```

- If the distance is impossible for the two points (shorter than the straight line, or far longer than it), the server
  uses the straight line instead (`distanceSource: "straight_line"`).
- Without these fields, the straight-line distance is used.
- **Send the same values in the quote and the booking**, otherwise the two prices can differ.

`DeliveryRepository.createDelivery()` and `getQuote()` need two optional parameters for this.

---

## 6. Driver app

Nothing to change for pricing. Goods rides come with the server's `fare`, and the driver's earnings are calculated from
it after the Delivery Set Price commission. The trip-card push (`ride_request`) already carries `fare` as a string.

---

## 7. QA checklist (user app)

- [ ] Goods list shows all five vehicles (including any set to "Both").
- [ ] Each card shows the quoted price, for example 20 Ft for an 8 km trip ≈ ₹600 + 6 × ₹45 + 5% tax.
- [ ] The quote and the booked fare are the same (send the route distance in both).
- [ ] Ask the admin to temporarily remove one vehicle's Delivery price in Set Price: the card shows **"Price not set"**,
      the Book button is disabled, and no booking is created. Then restore the price.
- [ ] Forcing a booking for an unpriced vehicle shows the `PRICE_NOT_SET` message and keeps the rider on the vehicle list.
- [ ] No goods booking is ever sent to `POST /rides`.

---

## 8. For the admin (reference)

- Set goods prices in **Admin → Pricing → Set Price → Create**: pick the vehicle, **Pricing for: Delivery**, **Zone: All
  Zones** (so the card also shows it), then fill Base Price, Base Distance and Price/Distance.
- From the server shell, the same can be done with:
  ```bash
  node scripts/setDeliveryPrice.js --list
  ```
  ```bash
  node scripts/setDeliveryPrice.js --vehicle="Rentol 20 Ft(7 ton)" --base=600 --base-km=2 --per-km=45 --tax=5 --apply
  ```
