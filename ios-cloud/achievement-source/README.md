# Spoiler-free investigation achievements

## Current sharing behavior

The user explicitly rejected Facebook's single-link text-share result and requested restoration of the working photo flow with QR codes on the image. **Share Results** now shares only the prepared PNG. iOS uses the previously phone-tested `exportCard` / UIActivityViewController([file]) path; Android sends image/png with the file URI; Web Share sends files/title with no text or URL field. Automatic clipboard copying and all caption-pasting instructions are removed. Older text-only native methods remain for compatibility but are not called by the current primary action.

The locally rendered 1080 x 1350 card includes two large, labeled QR codes beneath the official store badges. Each directly encodes its approved App Store or Google Play URL. No redirects, QR service, website, SDK, tracking, reward ad, new backend or app dependency is involved. The QR images are bundled static assets generated with qrcode 8.2 and independently decoded with zxing-cpp 3.1.1. Each code uses version 6, error correction Q, a four-module white quiet zone and six whole canvas pixels per module. The destination values and asset hashes are documented in public/achievement-assets/README.md and the source-file record. The Apple QR uses the approved expected product URL; public availability still depends on the app's release.

Verification: all 156 frontend tests across 28 files passed, TypeScript and the production iOS web build passed, and the Android Java bridge compiled offline. All three actual generated cards were visually inspected or checked for their shared layout. Both codes independently decoded to their exact approved URLs in all 15 whole-card variants: original PNG, JPEG, and resized/compressed JPEG down to 540 pixels wide at quality 50. The three completed-game screens at 375 pixels each showed one ready sharing panel without horizontal overflow. Save card remains available; sharing waits for the complete QR-bearing image, cancellation preserves the win, and opening a share destination is not described as a published post.

The user-confirmed working photo build 10005 was restored on the registered iPhone without uninstalling the app. That restored binary has the earlier card without QRs. The new QR artwork still requires a new native build to reach the phone, then a real shared-image scan check; the local decode tests do not establish Facebook's final recompression behavior. Do not submit the old text-sharing build as this new feature. No app review or public release was performed.

The chronological preparation notes below describe earlier versions and are superseded by the behavior above.

Prepared October 26, 2026. Completion controls are added to Lighthouse, The Drowned Bell, and Blackwood: The Last Exhibit. Existing saved wins retain sharing access; unfinished and failed cases do not unlock it.

The card is drawn locally as a 1080 × 1350 PNG using a fixed case-title allowlist, Velora's mark, the Master Detective badge, a challenge, and the official App Store / Google Play badges. It does not capture the ending screen or accept evidence, answers, suspects, profile data, or score/timing data. Share text includes both direct store URLs, including the user-approved expected Apple URL. There is no website link or coming-soon copy.

Native sharing uses the iOS activity controller and Android system chooser, with no social SDK, social login, server image generation, upload, tracking, or advertisement requirement. Save card uses the native document picker (or a browser download); Copy store links has a manual-copy fallback. Cancelling sharing leaves the win unchanged. A handed-off image is not presented as a successfully published social post. The destination apps decide which share formats they accept.

The maintained frontend and Android source are recorded in `implementation.patch` and `source-files.json`; badge artwork and the production web bundle are embedded under `ios/App/App/public`. The new iOS bridge is in the existing local native package and is registered alongside StoreKit. Existing Apple purchase delivery, Android billing/ads, and IPA resource-repair/audit logic are preserved.

Validation completed:

- 153 frontend tests passed across 28 files, including new sharing/cancellation/fallback/completion checks and the existing purchase tests.
- Frontend TypeScript and production iOS web bundle passed.
- All three generated cards were rendered and visually inspected. All three actual completed-game pages showed one ready sharing panel at 375-pixel width without horizontal overflow.
- Android `:app:compileDebugJavaWithJavac` passed using the existing offline toolchain.
- The standalone iOS snapshot integrity check passed with 179 files, native plugin registration, both store links, badge assets, and the Save Image purpose description.

October 26 follow-up: the original bridge compiled and installed in direct build 10004. The user reported that Facebook dropped the card when image and URL text were shared together. The iOS bridge now sends only the PNG and copies the caption containing both store links. The maintained source, staging source, native package, and production web bundle have been reconciled. The share button says "Share Results" at the user's request, and a visible instruction explains that the photo is shared separately and the caption must be pasted into the destination before posting. Cancellation does not claim publication. The source record includes the matching native-file hash, and verify.py checks the bundled instructions, all seven purchase IDs, and the native/source record match.

Current validation: 155 frontend tests across 28 files, TypeScript and the production iOS web build passed. The standalone 179-file snapshot integrity check passed. The staging convenience script's later Capacitor sync step could not run because this source staging directory has no root Capacitor configuration; the reviewed native project and fresh web bundle are packaged explicitly instead, with their configuration and hashes verified.

Direct build 10005 was installed and the user confirmed the photo was shared. Their Facebook composer screenshot shows the correct Drowned Bell achievement card with an empty caption field. Manual caption pasting remains unconfirmed. The subsequent Share Results text change passed 11 relevant sharing/component tests and a production iOS web build; it still needs a new native build to reach installed apps. No native Android sharing interaction has been verified. Earlier purchase-enabled build 10003 does not contain achievement sharing.

No app, website, Android update, or App Store version has been deployed/submitted by this change.
