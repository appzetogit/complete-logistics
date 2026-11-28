# Rentol: Flutter guide for the goods payment methods (`allowedPaymentMethods`)

For the Flutter developer of the **user app** (`flutter_taxi_user`). Backend commit `a01e7eb` (goods quote).
Related: `FLUTTER_GOODS_ADVANCE.md` (the advance), `FLUTTER_GOODS_ADVANCE_CANCEL_REFUND.md` (cancel).

---

## 1. The problem this fixes

In the admin panel, **Pricing > Set Price > Payment Type** decides which payment methods a goods (parcel) vehicle accepts:
Cash, Online, Wallet. If the admin unticks **Cash**, the server already refuses it when booking: it silently moves the booking
to an allowed method. But the app did not know the list, so its payment sheet always showed Cash, Wallet and Card/UPI. A rider
picked Cash and the server booked Online. Confusing.

Now the goods quote tells the app which methods are allowed, so the sheet shows **only those**.

---

## 2. API change

```
POST /deliveries/quote        (rider token; same call as before)
```

`data` has one new field, `allowedPaymentMethods`:

```json
{
  "vehicleTypeId": "6720f1...",
  "total": 1396.14,
  "advancePercent": 20,
  "advanceCancelKeepPercent": 15,
  "allowedPaymentMethods": ["online", "wallet"]
}
```

| Server value | Meaning | App name |
|---|---|---|
| `cash` | pay the driver in cash | `cash` |
| `online` | Razorpay (card / UPI / netbanking) | `razorpay` |
| `wallet` | Rentol wallet | `wallet` |

**Map the names:** the server says `online`, the app calls it `razorpay`. Everything else is the same word.

| Admin's Set Price `payment_type` | `allowedPaymentMethods` |
|---|---|
| Cash + Online + Wallet | `["cash","online","wallet"]` |
| Online + Wallet (Cash unticked) | `["online","wallet"]` |
| Online only | `["online"]` |
| nothing / invalid | `["cash","online"]` (the default; the booking uses the same) |
| no delivery Set Price for this vehicle | **field is missing** (the quote also has `priceNotSet: true` and the vehicle cannot be booked) |

The list comes from the **same Set Price row that priced the quote**: the pickup zone's row if there is one, otherwise the
"All Zones" row. So **it can differ by pickup location**: the same vehicle may allow Cash in one zone and not in another.

---

## 3. What the app must do

1. **Read `quote.allowedPaymentMethods`** every time you get a quote (not once per vehicle). It depends on the pickup, so after the
   rider changes the pickup point or the vehicle, the new quote may have a different list.
2. **Show only the allowed methods** in the payment sheet. A method that is not in the list must not be offered (hide the row,
   do not just disable it, unless your design prefers a disabled row with a short reason).
3. **If the currently selected method is not allowed**, switch to the **first allowed one** automatically and update the payment tile.
   Do this after every new quote.
4. **If the field is missing** (older server, or no Set Price): show **every** option, as before. The server still moves the
   booking to an allowed method, so nothing breaks.
5. **Send the method the rider chose** in `POST /deliveries` (`paymentMethod`: `cash` | `wallet` | `online`; use what the app
   already sends, `razorpay` is `online` on the wire as before). If it is still not allowed, the server changes it; see section 4.

Free ride or subscription cover (`coveredBy` is set in the quote): the list is still returned, but the booking is paid by the
free ride / subscription, so the rider pays nothing for the fare. Show the payment sheet as you do today for covered rides; the
list only matters for any extra amount.

The **advance** of a goods booking is a separate payment (wallet or Razorpay, see `FLUTTER_GOODS_ADVANCE.md`). It is not part of
this list.

---

## 4. If the server still changes the method

If the app sends a method that is not allowed (an old app, a stale quote, a pickup change), the server books an allowed method and
tells you in the `POST /deliveries` response:

```json
{ "paymentMethodChanged": true, "requestedPaymentMethod": "cash", "paymentMethod": "online" }
```

Show a short message, for example "Cash is not available for this vehicle, we selected Online payment.", and use `paymentMethod`
from the response as the ride's method from then on.

---

## 5. Dart sketch

```dart
/// server value -> app name
String appMethodFromServer(String m) => m == 'online' ? 'razorpay' : m;

/// app name -> server value
String serverMethodFromApp(String m) => m == 'razorpay' ? 'online' : m;

class PaymentOptions {
  PaymentOptions(this.allowed); // app names, e.g. ['razorpay', 'wallet']; empty list = "no restriction known"
  final List<String> allowed;

  factory PaymentOptions.fromQuote(Map<String, dynamic> quote) {
    final raw = quote['allowedPaymentMethods'];
    if (raw is! List || raw.isEmpty) return PaymentOptions(const []); // missing -> show everything
    return PaymentOptions(raw.map((e) => appMethodFromServer(e.toString())).toList());
  }

  bool isAllowed(String appMethod) => allowed.isEmpty || allowed.contains(appMethod);

  /// the method to select now: keep the current one if allowed, else the first allowed one
  String resolve(String current, {List<String> all = const ['cash', 'wallet', 'razorpay']}) {
    if (isAllowed(current)) return current;
    return allowed.isNotEmpty ? allowed.first : all.first;
  }
}
```

Usage:

```dart
final options = PaymentOptions.fromQuote(quoteJson);
setState(() {
  _paymentOptions = options;
  _paymentMethod = options.resolve(_paymentMethod);   // switch away from a method that is not allowed
});

// payment sheet
for (final method in ['cash', 'wallet', 'razorpay'])
  if (_paymentOptions.isAllowed(method)) PaymentRow(method: method, ...),
```

---

## 6. QA checklist

Use a goods vehicle. In the admin panel (Pricing > Set Price, the vehicle's **delivery** rows) untick **Cash** on every row that can
apply: the All Zones row and any zone rows.

- [ ] Get a quote: `allowedPaymentMethods` has no `cash`.
- [ ] Payment sheet shows no Cash row (Wallet and Online/Razorpay only).
- [ ] The rider had Cash selected before the quote: the tile switches to the first allowed method by itself.
- [ ] Book with Online/Razorpay: no "method changed" message.
- [ ] Untick Cash on the All Zones row only, but keep it on a zone row: a pickup inside the zone still offers Cash, a pickup outside does not.
- [ ] Change the pickup from outside the zone to inside it: the list updates with the new quote.
- [ ] Tick everything back: the sheet shows Cash, Wallet and Online again.
- [ ] Set only Online: the sheet shows one option and it is selected.
- [ ] Vehicle without a delivery Set Price: all options shown, the vehicle cannot be booked (`priceNotSet`).
- [ ] Old behaviour with a stale quote: send `cash` anyway; the response has `paymentMethodChanged: true` and the app shows the message.
- [ ] Free ride / subscription booking still works.

---

## 7. For backend / admin (reference)

- Code: `quoteDeliveryFare` in `user/services/deliveryService.js` returns
  `normalizeAllowedRidePaymentMethods(resolvedPricing.rule.payment_type)`; `resolvedPricing` is the same
  `resolveDeliveryPricing` result that `createDeliveryRecord` uses, so quote and booking cannot disagree.
- A vehicle can have an All Zones row **and** zone rows; each row has its own payment types. Untick Cash on all rows that apply.
- No database change, no new setting. The change is additive: old app builds ignore the field.
