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

Not yet verified: native iOS compilation of this new share bridge, the actual iPhone share/save menus, social destination behavior, or a native Android sharing interaction. Run the Codemagic compile/direct-install workflow and a brief real-phone share/save/cancel check before the App Store distribution upload. Earlier purchase-enabled build 10003 does not contain achievement sharing.

No app, website, Android update, or App Store version has been deployed/submitted by this change.
