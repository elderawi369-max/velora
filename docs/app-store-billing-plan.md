# Velora Billing Architecture Plan

## Goal
Keep the product catalog and fulfillment logic shared across platforms while using the billing method that each platform expects.

## Platform split
- Web: PayPal checkout
- iOS app: Apple In-App Purchase via StoreKit
- Android app: Google Play Billing

## Why the split exists
- Web checkout can keep using PayPal for gifts and boosts.
- Apple expects digital goods and subscriptions sold inside an iOS app to use In-App Purchase / StoreKit.
- Google Play generally expects digital goods sold inside Play-distributed Android apps to use Google Play Billing, subject to regional policy exceptions and program enrollment.

## Shared product catalog
Use the same internal product keys everywhere:
- `rose_aura`
- `starlight_ring`
- `velora_crown`
- `spark_boost`
- `spotlight_boost`

Each platform maps those product keys to its own storefront identifiers.

## Shared backend model
The backend should continue to own:
- purchase records
- fulfillment
- gift delivery
- boost activation
- timers and expiry
- activity feed and notifications

The client should only decide how payment starts.

## Recommended provider model

### Web
- Provider: PayPal
- Flow:
  1. Create hosted checkout order
  2. Redirect user to PayPal
  3. Return to Velora success page
  4. Capture and fulfill purchase
  5. Webhook reconciles if browser return fails

### iOS
- Provider: Apple In-App Purchase / StoreKit
- Flow:
  1. App requests product from App Store
  2. User buys in native purchase sheet
  3. App receives signed transaction
  4. App sends transaction proof to Velora backend
  5. Backend verifies and fulfills

### Android
- Provider: Google Play Billing
- Flow:
  1. App loads in-app product from Play
  2. User buys in Google Play sheet
  3. App receives purchase token
  4. App sends purchase token to Velora backend
  5. Backend verifies and fulfills

## Backend interfaces to add later

### Purchase request
- `POST /api/payments/checkout`
- keep for web only

### Native purchase verification
- `POST /api/payments/mobile/verify/apple`
- `POST /api/payments/mobile/verify/google`

These endpoints should:
- accept platform receipt / transaction proof
- validate it with the platform
- locate the internal product key
- create or update a purchase row
- fulfill the gift or boost idempotently

## Data model notes
Current purchase rows should evolve away from provider-specific naming.

Recommended direction:
- rename `stripeSessionId` to a neutral field such as `externalPaymentId`
- add `provider` column:
  - `paypal`
  - `apple`
  - `google`
- add optional platform-specific metadata field if needed

## Product catalog mapping
Add a config layer like:

```ts
{
  rose_aura: {
    web: { provider: "paypal", priceCents: 99 },
    ios: { productId: "com.velora.gift.rose_aura" },
    android: { productId: "rose_aura" },
  }
}
```

This keeps the Velora product identity stable while storefront ids vary by platform.

## Rollout order
1. Keep web payments on PayPal
2. Build native billing abstraction in the backend
3. Add Apple receipt verification endpoints
4. Add Google purchase token verification endpoints
5. When packaging native apps, connect each client to the right purchase flow

## Near-term implementation recommendation
Before building native billing:
- keep purchase code provider-agnostic where possible
- move any remaining provider-specific naming to neutral terms
- centralize product mapping in one file

That will make the iOS and Android billing work much easier when the native app phase begins.
