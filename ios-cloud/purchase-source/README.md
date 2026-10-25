# Apple consumable purchases — implementation prepared October 26, 2026

The packaged app now includes a StoreKit 2 Capacitor bridge, localized storefront
prices, gift/boost/credit controls, server-bound purchase intents, and interrupted
transaction recovery. `implementation.patch` preserves the source changes against
the reviewed frontend/backend snapshot. The full maintained source is in the
existing `velora-blackwood` development checkout, not the historical frontend on
this branch's root.

All seven products are **consumables**. Purchase IDs, English descriptions, USD
reference prices and global availability are configured in App Store Connect.
Product IDs are listed in `app-store-products.json`. They have not been submitted
for review. Review screenshots and real sandbox transaction tests are pending.

## Delivery security

- The authenticated server creates an intent UUID before showing payment. Its
  account, product and gift recipient cannot be changed during verification.
- StoreKit purchases use this UUID as `appAccountToken`.
- The server retrieves transaction information directly from Apple's authenticated
  HTTPS App Store Server API. Client-provided transaction content is not trusted.
- Bundle, product, account token, environment, quantity, purchase date, ownership
  and revocation state are checked before delivery.
- D1 atomically records the transaction and grants the item. Retries cannot grant
  the same gift, boost or credits twice. Credits have no expiry.
- StoreKit transactions remain unfinished until the server confirms delivery;
  launch/foreground recovery and a visible retry action resume interrupted work.
- Native and website billing remain separate; Android uses its existing Google
  Play implementation. The website does not acquire purchasing controls.

## Configuration and remaining checks

1. The Paid Apps Agreement is active, as confirmed by the account holder.
2. A separate In-App Purchase key has passed Apple Sandbox authentication.
3. The private key, key ID and issuer ID are installed as encrypted API Worker secrets:
   `APPLE_IAP_PRIVATE_KEY`, `APPLE_IAP_KEY_ID`, `APPLE_IAP_ISSUER_ID`.
   `APPLE_BUNDLE_ID` is `com.velorachat.app`. Never place private keys in this repo,
   the web bundle, Codemagic artifacts or an IPA.
4. Build the updated native app with Codemagic and test sandbox purchases,
   cancellation, pending approval, interruption/recovery, gifts and both boosts.
   The current Windows checks do not constitute an Xcode compile or device test.
5. Capture the purchase UI for Apple's product-review screenshots and attach the
   seven products to the first App Store version submission.
6. Update App Privacy to include **Purchases / Purchase History** for the new iOS
   version. Records are linked to the buyer account and used for App Functionality
   (and revenue analytics), not advertising tracking. No payment-card details are
   collected by Velora.

The production purchase configuration now returns `available: true`. Apple production
access returns HTTP 401 before the first release; verification retries the Sandbox
API for production 401/404 responses and still validates the returned transaction. The app cannot initiate a charge without
successfully creating a server intent. This build is not yet purchase-tested or
ready for submission.
