# Velora Android Packaging Plan

## Goal
Ship an Android app without disrupting the working web product at:
- `https://app.velorachat.com`

Keep:
- web payments on PayPal
- web auth and messaging flows working as they are today

Add:
- a native Android shell
- Google Play Billing for gifts and boosts inside the Android app

## Recommended wrapper
Use **Capacitor** for the first Android release.

Why Capacitor fits Velora:
- frontend is already React + Vite
- app can reuse the current UI and routing
- native plugins can be added gradually
- easier path to Play Billing than a pure browser-based approach

## Target architecture

### Web
- Domain: `app.velorachat.com`
- API: `api.velorachat.com`
- Payments: PayPal

### Android app
- Shell: Capacitor Android project
- Frontend: same React app build
- API: `https://api.velorachat.com`
- Payments: Google Play Billing

## Billing split

### Keep this for web
- Gifts and boosts continue to use PayPal
- Mobile browser users can still pay with PayPal because they are using the web app

### Use this for Android app
- Gifts and boosts inside the installed Android app should use Google Play Billing
- After purchase, the app sends the Play purchase proof to:
  - `POST /api/payments/mobile/verify/google`

The backend already has the route stub for this.

## Phase 1: Native shell
Create the Android wrapper without changing product behavior yet.

Tasks:
1. Add Capacitor packages
2. Create `capacitor.config`
3. Add Android platform
4. Point the Android app at the built frontend assets
5. Verify:
   - login
   - signup
   - create profile
   - browse
   - chat
   - favorites
   - activity
   - support

Result:
- Velora runs as an Android app shell
- payments can stay hidden or web-only temporarily while Billing is not connected

## Phase 2: Android UX readiness
Before Play Billing, make the app feel native enough.

Tasks:
1. App icon + splash screen
2. Android app name and package id
3. Status bar styling
4. Back-button behavior
5. Keyboard handling in chat
6. External browser opening only when intentionally needed
7. Safe-area and viewport checks

## Phase 3: Google Play Billing integration
Replace PayPal purchase flow inside the Android app.

Tasks:
1. Add Google Play Billing plugin/library
2. Create Play Console in-app products matching:
   - `rose_aura`
   - `starlight_ring`
   - `velora_crown`
   - `spark_boost`
   - `spotlight_boost`
3. In Android app:
   - load products from Play
   - launch purchase sheet
   - receive purchase token
4. Send purchase token to:
   - `POST /api/payments/mobile/verify/google`
5. Backend verifies token and fulfills purchase idempotently

## Phase 4: Store readiness
Prepare for Play Store submission.

Tasks:
1. Privacy policy URL
2. Terms / guidelines URLs
3. Age rating and 18+ positioning
4. App screenshots
5. Content declarations
6. Test internal release track

## Product behavior recommendation during transition

### Web
- show purchase buttons normally
- use PayPal

### Android app before Billing is live
Choose one of these:

Option A:
- hide gifts/boosts purchase buttons inside Android temporarily

Option B:
- show them as `Coming soon on Android`

Recommendation:
- use **Option B** during the first internal Android builds

## Technical notes

### API base URL
Use:
- `https://api.velorachat.com`

Do not point Android at old `workers.dev` endpoints anymore.

### Auth
The custom-domain auth fixes already help here because:
- `app.velorachat.com`
- `api.velorachat.com`

are now the stable production hosts.

For Android, token-based fallback auth should still be kept because embedded webviews can behave differently from desktop browsers.

### Turnstile
Turnstile is fine for web.

For Android:
- native/webview behavior should be tested carefully
- it may remain on signup if it renders correctly
- if it causes friction later, consider a mobile-specific trust gate instead of removing anti-bot checks entirely

## Suggested implementation order
1. Add Capacitor shell
2. Test full app flows on Android emulator/device
3. Polish native UX
4. Add Google Play Billing
5. Connect backend verification route
6. Run internal Play testing

## What not to do
- Do not use PayPal inside the installed Android app for digital gifts/boosts
- Do not mix web checkout and Play Billing in the same installed app flow
- Do not change the web payment path while Android packaging is still being prepared

## Immediate next step
When ready to move from planning to implementation:
1. install Capacitor
2. add the Android platform
3. create the first internal Android build without billing

