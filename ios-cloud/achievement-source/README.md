# Spoiler-free investigation achievements

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

October 26 follow-up: the original bridge compiled and installed in direct build 10004. The user reported that Facebook dropped the card when image and URL text were shared together. The iOS bridge now sends only the PNG and copies the caption containing both store links. The maintained source, staging source, native package, and production web bundle have been reconciled. The share button says "Share Card + Copy Store Links" and a visible instruction explains pasting the caption before the native menu opens. Cancellation does not claim publication. The source record includes the matching native-file hash, and verify.py checks the bundled instructions, all seven purchase IDs, and the native/source record match.

Current validation: 155 frontend tests across 28 files, TypeScript and the production iOS web build passed. The standalone 179-file snapshot integrity check passed. The staging convenience script's later Capacitor sync step could not run because this source staging directory has no root Capacitor configuration; the reviewed native project and fresh web bundle are packaged explicitly instead, with their configuration and hashes verified.

Still required: compile this final web/native snapshot in Codemagic and check image sharing, manual caption pasting, save, and cancel on the actual iPhone. Neither a successful build nor the source checks establish that a Facebook post contains the card. No native Android sharing interaction has been verified. Earlier purchase-enabled build 10003 does not contain achievement sharing.

No app, website, Android update, or App Store version has been deployed/submitted by this change.
