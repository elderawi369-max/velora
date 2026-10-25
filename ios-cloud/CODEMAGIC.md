# Velora iOS cloud build

Select branch `codex/ios-cloud-build` in Codemagic, then **Check for configuration files**.

This directory is the standalone 1.0.37/build-3 Firebase-enabled iOS source snapshot. The adjacent historical `frontend` directory is not used by either workflow. It includes the refreshed embedded web app and the local native packages. No npm install, CocoaPods, or Expo conversion is needed. Xcode resolves the remote Swift packages.

The cloud snapshot also includes the AdMob initialization correction identified by the first Xcode run: await SDK startup before completing consent preparation and allowing ad requests.

## Workflows

- **Velora iOS - Compile check (no signing)** compiles the Release configuration for iPhone without Apple credentials. It does not produce an installable IPA. Use it to verify native compilation while configuring signing.
- **Velora iOS - Signed IPA** requires an uploaded Apple Distribution certificate (including its private key) and an App Store provisioning profile matching `com.velorachat.app` and team `N94Z4PR968`. Configure these under Codemagic account/team settings > codemagic.yaml settings > Code signing identities. A profile for Trading AI's bundle identifier cannot be used for Velora. Enable Push Notifications on Velora's Apple identifier before creating its profile. An App Store Connect API integration can help generate/fetch signing files; it is separate from the APNs key uploaded to Firebase.

Both workflows use the M2 machine and stop after 60 minutes. There are no automatic triggers or store uploads. Run manually while free minutes remain on the Personal account. Build duration and native compilation success are only known after the first cloud run.

The signed workflow assigns Codemagic's build counter plus 4 as the build number (above the packaged build 3), retaining version 1.0.37. If this app already has a higher build on App Store Connect, raise that offset before uploading. Keep Codemagic's build counter intact for subsequent uploads.

Download the IPA and logs from build artifacts. App Store Connect/TestFlight upload can be configured after signing and the app record are ready; generating an IPA alone does not publish the app. Test login, Browse, rewarded unlock, Settings, reminders and a remote chat notification on a real iPhone before submitting for review.

## Snapshot integrity

`verify.py` checks SHA-256 hashes for the packaged `ios` and `packages` files before Xcode or signing tools modify them. The Firebase plist is client app configuration; no Apple private signing keys or provisioning profiles belong in Git.

For a future app update, regenerate this snapshot from the active app checkout, then refresh `source-sha256.json`. Do not rebuild the historical frontend on this branch.

References: [Codemagic native iOS guide](https://docs.codemagic.io/yaml-quick-start/building-a-native-ios-app/) and [pricing](https://docs.codemagic.io/billing/pricing/).
