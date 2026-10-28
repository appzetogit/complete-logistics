# Rentol: OTP autofill in the user app and the driver app

For the Flutter developers. The change is already made in the two shared OTP widgets, but **it was written without a Flutter SDK
and has not been compiled or run**. Follow section 3 to build and test it.

## 1. What was changed

| App | File | What |
|---|---|---|
| User app (`flutter_taxi_user`) | `lib/shared/widgets/otp_field.dart` (`OtpField`) | now a `StatefulWidget` that listens for the OTP SMS on Android |
| User app | `pubspec.yaml` | added `smart_auth: ^3.2.0` |
| Driver app (`flutterdriver`) | `lib/shared/widgets/otp_field.dart` (`OtpFieldWidget`) | same |
| Driver app | `pubspec.yaml` | added `smart_auth: ^3.2.0` |

Nothing else changed. Both apps use these widgets on every OTP screen (user login, driver login, driver signup), so all of
them get autofill. **No backend change and no change to the SMS text.**

## 2. How it works

| Platform | How the code gets in the boxes |
|---|---|
| **Android** | The widget calls the **SMS User Consent API** (`smart_auth`). When the OTP SMS arrives, Android shows a small dialog "Allow Rentol to read this message?". After the user taps **Allow**, the 4-digit code is put in the boxes and `onCompleted` runs, so the screen verifies it by itself. The app needs **no SMS permission** (no `READ_SMS` / `RECEIVE_SMS`, which Play Store would reject). |
| **iOS** | iOS shows the code above the keyboard ("From Messages") and the user taps it. `pin_code_fields` turns on the one-time-code autofill for this. **Not verified for version 8.0.1; see the test below.** |

Details of the Android part:
- It starts when the OTP screen opens and stops when it closes.
- After a code is filled it **listens again**, so a code from "Resend" is also picked up.
- If the user taps **Deny** in the dialog it does not ask again on that screen.
- It stops after 3 failed attempts in a row (no loops, no crash). Any error is swallowed: the user can always type the code.
- Only a code with exactly the OTP length (`length`, 4) is accepted.
- It does nothing on iOS and web.

Why User Consent and not SMS Retriever: Retriever needs an 11-character app hash inside the SMS text. Our SMS text is fixed by the
DLT-registered template, and adding the hash would need a new DLT approval. User Consent works with the current text:
`Welcome to the Rentol powered by Appzeto.Your OTP for registration is 1234.BGADEC`.
Android only needs the message to contain a 4 to 10 digit code and to come from a sender that is not in the user's contacts.

## 3. Build and test

```bash
cd flutter_taxi_user   # and then flutterdriver
flutter pub get
flutter analyze
flutter build apk --debug
```

If the Android build fails because of `smart_auth`, the apps use a very new toolchain (Android Gradle Plugin 9.0.1, Kotlin
2.3.20, Gradle 9.1) and `smart_auth 3.2.0` is about two years old. In that case either
- check the plugin's `android/build.gradle` for the compile errors it reports, or
- use `smart_auth` from its GitHub main branch, or another maintained plugin with the same API (`sms_autofill`, SMS Retriever only), or
- remove the Android listener and keep only the manual entry. The widget is the only place that uses it.

Test on a **real Android phone with Google Play Services** (an emulator without Play Services does not support the API):

1. Install the debug APK, enter a phone number, tap Send OTP.
2. When the SMS arrives, the "Allow ... to read this message?" dialog appears. Tap Allow. The four boxes fill and the screen verifies.
3. Tap Resend after the cooldown. A new SMS arrives, the dialog appears again, and the boxes fill again.
4. Tap Deny: the dialog does not come back on this screen; typing the code by hand still works.
5. Open the OTP screen and leave it before the SMS arrives: no crash, no dialog later.
6. Repeat on the driver login and the driver signup OTP screens.
7. **iPhone:** request the OTP and check that the code is offered above the keyboard. If it is **not**, `pin_code_fields 8.0.1` does
   not turn it on. Then either set `enablePinAutofill: true` on `PinCodeTextField` (if that parameter exists in 8.0.1), or wrap the field in
   an `AutofillGroup` and give it `autofillHints: [AutofillHints.oneTimeCode]`, or upgrade `pin_code_fields` (the current major
   version has `enableAutofill` and `autofillHints`).

### Test numbers

The fixed-OTP test logins (customer `1111111111`, driver `2222222222`, code `123456`) send **no real SMS**, so there is nothing to
autofill. Type the code by hand. (The apps use 4 boxes, so for those logins use the 4-digit code the backend accepts.)

## 4. Things to know

- The consent dialog is shown by Android, with its own wording. It cannot be styled.
- Google Play Services is required. On phones without it the call fails quietly and the user types the code.
- The listener is a loop inside the widget. If you later move the OTP boxes to another widget, move this code with it.
- The old behaviour is unchanged for everything else: `controller`, `onChanged`, `onCompleted` work as before.
