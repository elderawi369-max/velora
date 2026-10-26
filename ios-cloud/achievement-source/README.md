# Spoiler-free investigation achievements

## Current sharing behavior

The user prioritized clickable store links and explicitly authorized replacing the shared photo with a normal text post. **Share Results** now calls the native `shareResults` method with one text payload containing the safe case title, Master Detective rank, challenge and both full direct store URLs. iOS uses `UIActivityViewController(activityItems: [text])`; Android uses ACTION_SEND with text/plain and EXTRA_TEXT; Web Share receives title/text without files. The primary flow does not copy to the clipboard or depend on image generation. Save card remains a separate PNG export. Legacy native image-sharing support is retained for compatibility but the current primary button does not call it.

The receiving social app controls whether it accepts or displays the supplied text and both URLs. **Facebook retention of both clickable links is unverified**; do not claim a passing unit test or an opened share sheet proves successful posting. The previous phone test confirmed photo sharing in build 10005, not this new text-only flow. A new native build is required for the registered shareResults method. Older installed bridges return an update instruction.

This revision passed 156 frontend tests across 28 files and the TypeScript/production iOS web build. The 12 directly relevant tests cover the text-only payload, both URLs, cancellation, unsupported browsers, older native builds, saving the separate image, and sharing while image generation is pending. No Facebook SDK, Facebook login, website URL, public content hosting, or new backend service is introduced.

The chronological preparation notes below describe earlier versions of the feature and are superseded by the current behavior above.

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
