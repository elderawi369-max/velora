# Local Development

## What Works Now

The local Velora workflow is set up for:

- local D1 migrations
- local backend with Wrangler
- local frontend with Vite
- end-to-end auth, profile creation, conversation creation, and messaging

## Start Commands

From `I:\Velora`:

### 1. Install dependencies

```powershell
cmd /c npm install
```

### 2. Apply local D1 migrations

```powershell
cmd /c npx wrangler d1 migrations apply DB --local --config backend\wrangler.jsonc
```

### 3. Start backend

```powershell
cmd /c npm --workspace backend run dev
```

Backend runs at:

`http://127.0.0.1:8787`

### 4. Start frontend

```powershell
cmd /c npm --workspace frontend run dev
```

Frontend runs at:

`http://localhost:5173`

## Seed Sample Profiles

For local testing only:

```powershell
curl.exe -X POST http://127.0.0.1:8787/api/dev/seed
```

This creates sample profiles including:

- `softnightowl`
- `calmcurrent`

## Current Local Notes

- The session cookie is intentionally non-secure in local development so auth works over plain HTTP.
- Before production deployment, secure cookies must be restored for HTTPS.
- The seed endpoint is for development only and should not stay exposed in production.
- `frontend/.env` is for local development and should point to `http://localhost:8787`.
- `frontend/.env.production` can point to the deployed Worker URL for production builds.

## Proven Local Flow

This flow has been verified locally:

1. sign up
2. create profile
3. browse profiles
4. open conversation with a seeded profile
5. send message
6. fetch conversation messages
