# Architecture Plan

## Core Decision

Build the first version as a split app:

- `frontend`: static React application
- `backend`: API service for auth, profiles, chat, gifts, and moderation

This keeps the project professional and maintainable while staying cheap to run.

## Recommended Stack

### Frontend

- React 19
- TypeScript
- Vite
- React Router
- TanStack Query
- Tailwind CSS

Why:

- fast local development
- clean SPA architecture
- easy static deployment
- no backend hosting lock-in

### Backend

- Hono
- TypeScript
- Cloudflare Workers runtime
- Zod for request validation

Why:

- low hosting cost
- easy deployment path
- good fit for API-first architecture
- simple to keep in a dedicated `backend` folder

### Data

- Cloudflare D1 for the MVP
- Drizzle ORM for schema and migrations

Why:

- free-tier friendly
- enough for an MVP with text chat
- structured schema management from the start

## Why Not Realtime First

The MVP should use short polling instead of WebSockets.

Reason:

- cheaper
- easier to debug
- enough to validate the core loop

If the idea works, we can upgrade selected flows to Durable Objects or another realtime layer later.

## Initial Feature Boundaries

The first version should include:

- username and password auth
- public profiles
- vibe tags and boundaries
- favorites
- reconnect to previous chats
- text-only messaging
- virtual gifts
- moderation rules

The first version should not include:

- image messages
- voice notes
- video calls
- meetups
- off-platform sharing
- AI writing assist
- cash payouts

## Cost Strategy

Keep launch costs near zero by using:

- Cloudflare Pages for static frontend hosting
- Cloudflare Workers free tier for API traffic
- Cloudflare D1 free tier for database
- rule-based moderation
- preset avatars instead of uploaded media

## Future Upgrade Path

If traction is real, we can later upgrade:

- D1 to Postgres if needed
- polling to realtime sockets
- manual rules to smarter moderation
- preset avatars to storage-backed uploads

