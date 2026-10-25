# Velora iOS 1.0.37 (build 3, Firebase push integration)

This is the Mac-ready Xcode source project for Velora iOS.

## Release identity

- App name: Velora
- Bundle identifier: `com.velorachat.app`
- Marketing version: `1.0.37`
- Build number: `3`
- Minimum iOS version: iOS 15
- Release AdMob app ID: `ca-app-pub-8082896452517848~5002072826`
- Debug builds use Google's sample app and rewarded-ad IDs.

## Open and archive on a Mac

1. Use macOS with Xcode 26 or newer.
2. From the extracted archive, open `ios/App/App.xcodeproj` in Xcode. Keep the adjacent `packages` directory in place; all local native dependencies are included there.
3. Wait for Swift Package Manager to resolve Capacitor 8.3.1, Google Mobile Ads 13.11.0, and Firebase 12.19.3.
4. Select the `App` target, then Signing & Capabilities.
5. Choose the Apple Developer team that owns `com.velorachat.app`. Keep automatic signing enabled.
6. Select `Any iOS Device (arm64)` as the destination.
7. Choose Product > Archive.
8. In Organizer, run Validate App before Distribute App > App Store Connect > Upload.

The Release configuration already uses Swift optimization (`-O`), whole-module compilation, and dSYM generation. The Android-only Google Play DEX/R8 warning does not apply to this Xcode archive.

## Rebuild the embedded web app

From the full repository, run these commands in `frontend` before reopening Xcode:

```text
npm install
npm run ios:build:web
```

The iOS build command always embeds `https://api.velorachat.com`, the production Turnstile site key, production rewarded-ad placement IDs, and disabled free-play/test-ad flags. It normalizes Swift Package paths when run on Windows. The local webview uses `capacitor://localhost`; the API explicitly accepts this origin.

## Rewarded-ad placements

- Trivia: `ca-app-pub-8082896452517848/5984730430`
- Browse: `ca-app-pub-8082896452517848/8419322089`
- Mind Hunters: `ca-app-pub-8082896452517848/6510595610`

Browse uses the signed server-side verification callback at:

`https://api.velorachat.com/api/chat/messaging-pass/admob-ssv`

Browse now saves messaging access immediately after the native Google SDK reports that the reward was earned. The signed callback validates the reward asynchronously and cannot grant it twice. If saving is interrupted, the earned reward can be retried without showing another ad. Trivia and Mind Hunters also unlock only after the SDK earned-reward callback.

## Notifications and latest fixes

- Unfinished trivia and Mind Hunters games can schedule one local reminder after 24 hours, after notification permission is granted. Completing/resetting the game cancels its reminder. Tapping it opens the saved game.
- Updated privacy policy, production API fallback, and messaging unlock/recovery wording are included.
- The Android R8 annotation fix is Android-specific; iOS does not use DEX/R8.
- Firebase iOS configuration for `velora-e3a28` / `com.velorachat.app` is included as an app resource. Firebase Core and Messaging are linked to the app target. Capacitor push registration forwards an FCM token, including refreshes, rather than the raw APNs token.
- Settings includes notification permission and enable/disable controls for iOS. Notifications resume on launch/foreground when permission is granted and the user has not disabled them on this device.
- The Push Notifications capability and entitlements are included. Debug uses the development APNs environment; Release uses production. The selected Apple Developer team and provisioning profile must allow push for `com.velorachat.app`.
- Remaining external setup: upload an Apple APNs authentication key in Firebase Project settings > Cloud Messaging > iOS app configuration. Keep this private `.p8` key out of the source archive. Notifications cannot be declared working until APNs setup and a real signed device test pass.
- Local game reminders work independently of APNs.

## Verification boundary

This archive contains refreshed web assets and the Xcode source. It is not a signed IPA or an Xcode archive. JavaScript tests, production bundling, configuration checks, and archive dependency checks were run on Windows. Native Swift compilation, code signing, simulator/device tests, and App Store validation must be performed with Xcode on macOS.
