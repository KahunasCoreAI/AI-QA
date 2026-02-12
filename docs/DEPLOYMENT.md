# Deployment Runbook (Vercel + Clerk + Neon)

This guide is for running this project as a shared team app in your own environment.

## 1. Clone and Install

```bash
git clone <your-fork-or-repo-url>
cd ai-qa
npm install
cp .env.example .env
```

## 2. Configure Team Access Policy

Set these env vars before first deploy:

- `ALLOWED_EMAIL_DOMAIN`
- `NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN`
- `SETTINGS_OWNER_EMAIL`
- `NEXT_PUBLIC_SETTINGS_OWNER_EMAIL`
- `SHARED_TEAM_ID`

Why this is required:
- Route middleware and API authorization both enforce email-domain access.
- Settings are restricted to the configured owner email.

## 3. Create Neon Database

1. Create a Neon project.
2. Copy the pooled connection string.
3. Set `DATABASE_URL` in `.env` and Vercel.

## 4. Create Clerk App

1. Create a Clerk application.
2. Enable your preferred provider(s): Google and/or email/password.
3. Configure allowed redirect/origin domains for:
   - `http://localhost:3000` (local)
   - your Vercel production domain
4. Copy keys:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - `CLERK_SECRET_KEY`

## 5. Configure Environment Variables

Set all required variables from `.env.example`:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `DATABASE_URL`
- `APP_ENCRYPTION_KEY`
- `OPENROUTER_API_KEY`

Optional provider defaults:

- `HYPERBROWSER_API_KEY`
- `HYPERBROWSER_MODEL`
- `BROWSER_USE_API_KEY`
- `BROWSER_USE_CLOUD_MODEL`
- `NEXT_PUBLIC_DEFAULT_AI_MODEL`

Access policy values:

- `ALLOWED_EMAIL_DOMAIN`
- `NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN`
- `SETTINGS_OWNER_EMAIL`
- `NEXT_PUBLIC_SETTINGS_OWNER_EMAIL`
- `SHARED_TEAM_ID`

Generate `APP_ENCRYPTION_KEY`:

```bash
openssl rand -base64 32
```

## 6. Initialize Database Schema

Run once against target DB:

```bash
npm run db:push
```

## 7. Verify Locally

```bash
npm run dev
```

Smoke check:

1. Sign in with an allowed email domain.
2. Create a project.
3. Create at least one test.
4. Execute a test.
5. Refresh page and confirm project/test/history persist.

## 8. Deploy to Vercel

1. Import repo in Vercel.
2. Add all environment variables.
3. Deploy.
4. Re-run `npm run db:push` against production DB if needed after schema changes.

## 9. Post-Deploy Validation

1. Sign in on production with an allowed email.
2. Confirm unauthorized domain is blocked.
3. Run one test end-to-end.
4. Confirm History entries persist after reload.
5. Open Settings as owner and verify provider key save works.

## Troubleshooting

### Clerk shows "Development mode"

- You are using development instance keys.
- Switch Vercel env vars to production Clerk keys.
- Ensure production domain is configured in Clerk.

### 403 "Access restricted" errors

- Email domain does not match your configured:
  - `ALLOWED_EMAIL_DOMAIN`
  - `NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN`

### State not persisting

- Confirm `DATABASE_URL` points to the intended Neon DB.
- Confirm `team_state` table exists (`npm run db:push`).
