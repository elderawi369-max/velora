# Companion Photo Identity Contract

Companion photos are a visual-identity feature, not text-to-image decoration.

## Non-negotiable rules

- Every companion receives one immutable visual identity record at creation.
- The first canonical portrait may establish the record. Every later reference and every user-visible photo must be conditioned on its canonical image plus approved reference images.
- Text traits can describe a scene but can never replace missing visual references.
- Conversational output and user memories cannot change locked traits. A permanent appearance change requires an explicit visual-identity version update.
- Seeds are optional reproducibility controls only. They are not identity controls.
- Generated photos stay private in R2 and are not returned until identity validation passes.

## Android-safe scene boundary

Photo requests may use adult, romantic, and polished styling: flattering selfies, fitted date-night clothes, dresses, stylish non-lingerie sleepwear, fully clothed cozy bedroom-at-home selfies, ordinary public-context swimwear at a beach or pool, affectionate non-explicit poses, and cinematic lighting. They must not request or generate nudity, lingerie, underwear, towel/robe-only looks, implied nudity, sexually suggestive poses, explicit body-part focus, or sexual activity. This is enforced server-side and applies even when a user asks directly.

Romantic attraction is a first-class visual requirement, not an afterthought. Companions should look clearly adult, conventionally attractive, confident, date-ready, and stylish. Fitted tops, crop tops, short skirts, shorts, fitted dresses, summer looks, visible legs, shoulders, back, midriff, and tasteful neckline are appropriate where natural to a fully clothed, public-appropriate outfit. Vary the mood between cute, casual, elegant, flirty, and more revealing-but-non-explicit so the companion does not repeat one stock-photo or one “sexy” template.

Canonical references should look like contemporary dating-profile/model-casting images: youthful adult, warm, stylish, modern, and lifestyle-oriented. Avoid blazers, suits, office shirts, corporate settings, stiff poses, passport framing, and LinkedIn-style headshots. The reference set stays clean enough for identity consistency, but must not make a romantic companion look like a corporate profile.

The desired standard is an original, aspirational dating-profile look: conventionally attractive adult faces, expressive eyes, polished hair, healthy youthful skin, flattering warm light, and confident but natural body language. Use that aesthetic direction only; never clone a real person, celebrity, or an individual face from a reference image.

Styling must reinforce persona: Playful Tease is playful and youthful; Personal Growth Companion is sporty and polished; Quiet Romantic is soft and elegant; Confident Leader is sleek and sophisticated; Sarcastic Best Friend is casual-cool and slightly edgy. Do not reuse a nearly identical face, hairstyle, or visual template across companions.

## Storage and release flow

1. Create the immutable `ai_companion_visual_identities` record.
2. Generate one canonical portrait, then use it as the reference for 2-4 approved angle/reference images.
3. Store the canonical and reference files in the private `COMPANION_IMAGES` R2 bucket.
4. Generate each requested scene with `@cf/black-forest-labs/flux-2-klein-4b` multipart inputs named `input_image_0` through `input_image_3`.
5. Run a real identity-similarity evaluator against the canonical reference. Reject and retry below threshold; never mark a photo ready from prompt compliance alone.
6. Deliver only records with `status=ready` and `validation_status=approved`.

## Required identity test grid

Before a visual identity can be released, review these six reference looks together: casual fitted top and shorts, short skirt and casual top, relaxed fully clothed home outfit, date-night outfit, outdoor daytime look, and close-up selfie. Every look must clearly be the same person at first glance.

The release question is: would a normal user immediately believe every image depicts the same adult synthetic person? If not, keep the identity in review.

After the six-look review, run a second private lifestyle test from the same canonical reference: casual at-home selfie, date-night photo, outdoor candid, and cozy-at-home photo. The results must still look like the same companion, express her persona, and avoid repeating the identity-sheet camera, setting, and pose template.
