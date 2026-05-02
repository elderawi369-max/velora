# AI-Style Human Chat

This repository is the starting point for Velora, a text-only companionship app where real people create profiles and chat in an AI-style environment.

## Product Direction

The first version is intentionally lean:

- real user profiles
- text-only chat
- reconnect with profiles you liked before
- no off-platform contact sharing
- virtual gifts with cosmetic rewards
- low-cost moderation and anti-spam rules

## Why This Stack

We are optimizing for:

- near-zero cost to build and validate
- professional separation between `frontend` and `backend`
- a migration path if the product grows

Current planned stack:

- `frontend/`: React + TypeScript + Vite
- `backend/`: Hono + TypeScript on Cloudflare Workers
- database: Cloudflare D1
- ORM: Drizzle
- validation: Zod

## Repo Layout

```text
.
├── backend
├── docs
├── frontend
├── package.json
└── README.md
```

## Execution Order

1. Finalize product scope and data model
2. Scaffold frontend and backend apps
3. Build auth, profiles, and discovery
4. Build chat, reconnect, and favorites
5. Add moderation, limits, and gifts
6. Test the full MVP flow locally

See [docs/architecture.md](/C:/Users/user/Documents/Codex/2026-05-02/i-got-an-idea-here-is/docs/architecture.md) and [docs/roadmap.md](/C:/Users/user/Documents/Codex/2026-05-02/i-got-an-idea-here-is/docs/roadmap.md).
