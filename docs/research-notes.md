# Research Notes

This plan is based on current official documentation checked on May 2, 2026.

## Confirmed Points

- React documentation currently recommends using a framework for many production apps, but a separate frontend/backend architecture is still reasonable when we explicitly want an API-first split and static hosting.
- Vite remains a fast, modern choice for client-side React apps.
- Cloudflare Pages static asset requests are documented as free and unlimited.
- Cloudflare Workers Free includes 100,000 requests per day.
- Cloudflare D1 Free includes 5 GB storage, 5 million rows read per day, and 100,000 rows written per day.
- Cloudflare Turnstile has a free plan suitable for small to medium businesses and most production applications.
- Vercel Hobby is free, but its documentation says it is aimed at personal, non-commercial use, so it is not my preferred first recommendation for this startup path.

## Product Implication

The lowest-risk first deployment path is:

- frontend on Cloudflare Pages
- backend on Cloudflare Workers
- data on Cloudflare D1

That gives us a clear professional structure without forcing paid hosting on day one.

