# Deployment Plan

## Current Recommendation

Deploy Velora in two parts:

- `backend` to Cloudflare Workers
- `frontend` to Cloudflare Pages

This keeps costs low and matches the current architecture.

## Important Production Differences

Before production:

- use HTTPS-only secure cookies
- disable development-only seed endpoints
- store the admin key as a Wrangler secret instead of in tracked config
- replace the placeholder D1 database ID

These safeguards are already supported by the code:

- local mode uses `APP_ENV=local`
- development seed endpoint only works when `ENABLE_DEV_ENDPOINTS=true`
- secure cookies are enabled automatically outside local HTTP mode

## Backend Deployment Steps

### 1. Log in to Cloudflare

```powershell
cmd /c npx wrangler login
```

### 2. Create a remote D1 database

```powershell
cmd /c npx wrangler d1 create velora-prod --config backend\wrangler.jsonc
```

Take the returned `database_id` and place it into:

`backend/wrangler.production.example.jsonc`

Then copy that file to:

`backend/wrangler.production.jsonc`

### 3. Switch backend vars for production

Recommended production values are already scaffolded in:

`backend/wrangler.production.example.jsonc`

Use these production values:

- `APP_ENV`: `production`
- `ENABLE_DEV_ENDPOINTS`: `false`

Keep `backend/wrangler.jsonc` for local development.

### 3a. Set the production admin key as a secret

```powershell
cmd /c npx wrangler secret put ADMIN_SECRET --config backend\wrangler.jsonc
```

For local development, copy:

`backend/.dev.vars.example`

to:

`backend/.dev.vars`

and keep the local admin key there instead of in Git.

### 4. Apply remote migrations

```powershell
cmd /c npx wrangler d1 migrations apply DB --remote --config backend\wrangler.production.jsonc
```

### 5. Deploy backend Worker

```powershell
cmd /c npx wrangler deploy --config backend\wrangler.production.jsonc
```

## Frontend Deployment Steps

### Option A: Cloudflare Pages with Git

This is the recommended path.

In Cloudflare Pages:

1. Connect the Git repository
2. Set build command to `npm run build`
3. Set build output to `dist`
4. Set project root to `frontend`
5. Set environment variable:

`VITE_API_BASE_URL=https://your-worker-domain.workers.dev`

Cloudflare’s Pages docs currently describe the standard Vite setup as:

- build command: `npm run build`
- output directory: `dist`

### Option B: Direct Upload

Build locally:

```powershell
cmd /c npm --workspace frontend run build
```

Then upload `frontend/dist` to a new Pages project.

## Suggested First Live Rollout

Do not open the app publicly at first.

Start with:

- private link
- 10 to 30 real test users
- manual moderation
- daily review of reports

## Recommended Next Hardening Work

- environment-specific Wrangler config for production vs local
- hidden admin route in navigation for non-admin users
- report status workflow
- audit log for admin actions
- stronger avatar/profile validation
