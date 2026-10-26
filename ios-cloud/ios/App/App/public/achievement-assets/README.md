Official store badge artwork, bundled locally so achievement rendering makes no network request.

- Apple: https://developer.apple.com/assets/elements/badges/download-on-the-app-store.svg
- Google: https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png
- Apple usage guide: https://developer.apple.com/app-store/marketing/guidelines/
- Google usage guide: https://partnermarketinghub.withgoogle.com/brands/google-play/visual-identity/badge-guidelines/

Official store badges are drawn without alteration. The achievement is shared as a photo with two locally bundled QR codes; no separate link post or caption-pasting step is needed.

- `app-store-qr.png` encodes `https://apps.apple.com/app/id6826858824`.
- `google-play-qr.png` encodes `https://play.google.com/store/apps/details?id=com.velorachat.app`.

The QR codes were generated offline with qrcode 8.2 and independently decoded using zxing-cpp 3.1.1. Both are version 6, error correction Q, with a four-module white quiet zone, 8 pixels per module and 392 x 392 source pixels. The card draws them at 294 x 294 (six pixels per module) without smoothing. No QR service, tracking, redirect URL or runtime dependency is involved. The Apple destination is the account holder's approved expected App Store URL and becomes a download destination after the app is publicly available.
