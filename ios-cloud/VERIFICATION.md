# Velora iOS 1.0.37, build 3 — Firebase integration

Prepared October 25, 2026. Xcode source package; not a signed IPA.

## Included

- Supplied GoogleService-Info.plist matches Firebase project velora-e3a28 and bundle ID com.velorachat.app, and is included in the app resources build phase.
- Firebase Core and Firebase Messaging 12.19.3 are linked to the app target. The release tag and iOS 15 compatibility were checked against the Firebase package manifest.
- AppDelegate initializes Firebase, maps the APNs device token to FCM, forwards the FCM registration token to Capacitor, and forwards token refreshes and registration errors.
- Capacitor Push Notifications, Local Notifications, and Velora rewarded ads are registered and included with portable local Swift package sources.
- Push capability and aps-environment entitlements are included: development for Debug, production for Release.
- Frontend handles iOS notification permission, native token registration/refresh, device opt-out, and safe in-app notification navigation. Settings exposes iOS enable/disable controls.
- Backend accepts platform ios and supplies APNs alerts, badges and sounds. Android and web payload behavior is preserved.
- All previous messaging reward, API origin, privacy and local reminder fixes remain included.

## Checks

- 132 frontend tests passed across 23 files; TypeScript/Vite iOS build and Capacitor sync passed.
- 3 push payload tests passed, including Android/web compatibility; backend TypeScript check passed.
- Xcode project parsed with the xcode project parser. Firebase products, app target linkage, resource membership, release entitlement settings and build number were checked.
- Firebase and entitlement plist XML were checked. Local Swift package paths and embedded production assets were verified during staging.

## Still required

- Upload an Apple APNs authentication key to Firebase for this iOS app. The private .p8 key is intentionally not part of this source package.
- Select the Apple Developer team and matching push-enabled provisioning profile in Xcode on macOS.
- Compile, sign, archive, and validate with Xcode. No native Swift build or signed device notification delivery test was performed on this Windows machine.
- On a signed iPhone build, enable notifications in Profile/Settings and test both foreground/background delivery, notification taps, and opt-out before release.
