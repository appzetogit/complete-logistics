# Flutter: driver vehicle year (Vehicle Details screen)

For the Flutter developer (driver app `flutterdriver`). In *Profile -> Vehicle Details* Maker, Model, Number and Colour came filled from the server but **Year was always empty**, so the driver had to type it again, and that edit sent the vehicle back for admin approval. This was a backend bug. It is fixed on the backend; **no app change is required**. This file explains what changed, how the field works, and what to verify and tighten in the app.

## 1. What was wrong and what changed (backend)

| | Before | Now |
| --- | --- | --- |
| App signup | The year the driver entered was validated and kept only inside the onboarding record, never on the driver | Copied to the driver's `vehicleYear` when the account is created |
| Admin panel (create, edit, bulk import) | The panel sent a year, the backend ignored it | Saved to the same `vehicleYear` field |
| Profile API | Returned `vehicleYear`, but it was always `""` | Returns the real value |
| Existing drivers | No year | A one-time backfill copies the year from their signup / admin record (only if it is still empty) |

Nothing changed in the endpoints or response shapes. `vehicleYear` was already in the responses; it now has data.

## 2. The field

| Property | Value |
| --- | --- |
| Name | `vehicleYear` |
| Type | **string**, for example `"2021"` (not a number) |
| Empty | `""` when the year is not known |
| Valid values | 4 digits, from **1980** to the **current year** |

Keep it a `String` in the Dart model (`driver_model.dart` already does: `json['vehicleYear']`).

## 3. Where the app reads and writes it

All paths are under `/api/v1/drivers` with the driver's `Authorization: Bearer <token>`.

### 3.1 Read (already used by the screen)
`GET /me` -> `data.vehicleYear`

```json
{
  "success": true,
  "data": {
    "id": "665f...",
    "vehicleMake": "Maruti",
    "vehicleModel": "Dzire",
    "vehicleYear": "2021",
    "vehicleNumber": "MP09AB1234",
    "vehicleColor": "White"
  }
}
```

The Vehicle Details screen shows it from `driver?.vehicleYear` (`vehicle_details_screen.dart`). Keep showing the hint `2021` only when the value is empty.

### 3.2 Write at signup (unchanged)
`PATCH /onboarding/vehicle` with `year` (required, 4 digits, 1980 to the current year). Wrong value -> `400 Vehicle year must be between 1980 and <year>`.

### 3.3 Edit later from Vehicle Details (unchanged)
`PATCH /vehicle` accepts `vehicleYear` next to `vehicleMake`, `vehicleModel`, `vehicleNumber`, `vehicleColor`, `vehicleTypeId`, `vehicleImage`.

The response echoes the saved values (including `vehicleYear`) and tells you if the edit needs approval:

```json
{
  "success": true,
  "message": "Vehicle updated and sent to admin for approval",
  "data": { "vehicleYear": "2021", "approve": false, "status": "pending", "isOnline": false, "vehicleApprovalRequested": true }
}
```

## 4. Important behaviour to design around

### 4.1 Changing the vehicle sends it for approval
If **any** vehicle field in the request differs from what is saved (make, model, year, number, colour, type, photo), the backend sets `approve: false`, `status: "pending"` and takes the driver **offline**. The response has `vehicleApprovalRequested: true`.

So:
- **Send only the fields the driver actually edited.** Do not resend the whole form.
- **Never send `vehicleYear: ""` just because the field is empty.** If the server has `"2021"` and you send `""`, the year is cleared and the vehicle goes back for approval.
- Before the first save that changes the vehicle, show a short confirmation: "Changing vehicle details needs admin approval and takes you offline until approved."

### 4.2 Existing drivers now arrive with their year filled
After the backend backfill, most existing drivers already have a year, so the field is no longer empty and the driver does not have to type it. Opening and saving the screen **without touching the year** must not send the year at all (see 4.1), so it triggers no approval.

### 4.3 Some drivers still have no year
A driver whose record never had a year (very old accounts) still gets `""`. Typing a year for the first time counts as a change and sends the vehicle for approval (4.1). The confirmation message above covers it.

## 5. What to do in the app

### 5.1 Validate before sending (important)
`PATCH /vehicle` does **not** validate the year on the server (signup does). Validate in the app so a bad value never reaches the saved profile:

```dart
String? validateVehicleYear(String? value) {
  final text = (value ?? '').trim();
  if (text.isEmpty) return null; // empty = "not given", never send it (see 4.1)
  final year = int.tryParse(text);
  final current = DateTime.now().year;
  if (!RegExp(r'^\d{4}$').hasMatch(text) || year == null || year < 1980 || year > current) {
    return 'Enter a year between 1980 and $current';
  }
  return null;
}
```

Input field: numeric keyboard, `maxLength: 4`, digits only.

```dart
TextFormField(
  controller: yearController,
  keyboardType: TextInputType.number,
  maxLength: 4,
  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
  validator: validateVehicleYear,
  decoration: const InputDecoration(labelText: 'Year', hintText: '2021'),
)
```

### 5.2 Build the request from changed fields only

```dart
final body = <String, dynamic>{};
if (make != driver.vehicleMake) body['vehicleMake'] = make;
if (model != driver.vehicleModel) body['vehicleModel'] = model;
if (number != driver.vehicleNumber) body['vehicleNumber'] = number;
if (color != driver.vehicleColor) body['vehicleColor'] = color;
if (year.isNotEmpty && year != driver.vehicleYear) body['vehicleYear'] = year;
if (body.isEmpty) return; // nothing to save
await api.patch('/drivers/vehicle', data: body);
```

### 5.3 After a save
Update the local driver model from the response `data` (it contains `vehicleYear`), and if `vehicleApprovalRequested == true` show the "sent for approval" state / pending screen the app already uses.

## 6. Test checklist

| # | Scenario | Expected |
| --- | --- | --- |
| 1 | New driver signs up with year 2021, gets approved, opens Vehicle Details | Year shows `2021` without typing |
| 2 | Existing driver (after backend backfill) opens Vehicle Details | Year is filled |
| 3 | Open Vehicle Details and tap Save without changing anything | No request (or an empty body), no approval, driver stays online |
| 4 | Edit only the colour | Request has only `vehicleColor`; year untouched |
| 5 | Change the year to a valid value | Saved; response `vehicleYear` updated; approval requested, driver offline (with the confirmation shown first) |
| 6 | Enter `1975`, `2999`, `20ab` | Field error, nothing sent |
| 7 | Clear the year field and save other changes | `vehicleYear` is not in the request |
| 8 | Restart the app | Year still shown (read from `GET /me`) |
| 9 | Driver whose year is empty | Hint `2021` shown, saving without a year works |
| 10 | Admin changes the year in the admin panel | The driver app shows the new year after the next profile load |

## 7. Not needed

- No new endpoint, no new field, no change to the model or the screen's data source.
- No change to the signup flow (year was already required and validated there).

## 8. Backend map

`driver/services/onboardingService.js` (copies `session.vehicle.year` into the driver), `admin/services/adminService.js` (admin create / edit / import and the driver serializers), `driver/controllers/driverController.js` (`getCurrentDriver` for `GET /me`, `updateDriverVehicle` for `PATCH /vehicle`), one-time `scripts/backfillVehicleYear.js`, tests `test/integration/driverVehicleYear.test.js`.
