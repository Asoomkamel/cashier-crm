# Vercel Deployment

## 1. Use a clean repository

Extract this ZIP into a new empty folder. The extracted folder must contain `package.json`, `app`, `components`, and `lib` directly at its root.

Recommended approach:

```powershell
git init
git branch -M main
git add -A
git commit -m "Initial clean Cashier CRM deployment"
git remote add origin https://github.com/YOUR_ACCOUNT/YOUR_REPOSITORY.git
git push -u origin main
```

Using a new repository is preferable when an older repository contained committed secrets or corrupted merge history.

## 2. Local verification

```powershell
npm ci
npm run verify
```

The verification command runs source validation, TypeScript checking, tests, and the production build.

## 3. Vercel project configuration

Use these project values:

- Framework: Next.js
- Root directory: repository root
- Install command: `npm ci`
- Build command: `npm run build`
- Output directory: Next.js default
- Node.js: 22.x

The included `vercel.json` identifies the framework as Next.js.

## 4. Safe initial environment

For a first local-storage-only deployment:

```text
APP_URL=https://YOUR_PROJECT.vercel.app
NEXT_PUBLIC_APP_URL=https://YOUR_PROJECT.vercel.app
NEXT_PUBLIC_API_BASE_URL=https://YOUR_PROJECT.vercel.app
NEXT_PUBLIC_USE_SERVER_CHECKOUT=false
NEXT_PUBLIC_USE_SUPABASE_AUTH=false
NEXT_PUBLIC_USE_IDB_CACHE=false
```

## 5. Supabase environment

Add only through the Vercel environment-variable interface:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_ORG_ID=
NEXT_PUBLIC_BRANCH_ID=
SERVER_ACTION_SECRET=
ADMIN_ACTION_CODE=
```

Never commit `.env.local` or real values in `.env.example`.

## 6. Optional integrations

```text
AUTHENTICA_API_KEY_BASE64=
AUTHENTICA_API_KEY=
GEMINI_API_KEY=
GOOGLE_MAPS_PLATFORM_KEY=
NEXT_PUBLIC_GOOGLE_CLIENT_ID=
```

## 7. Post-deployment check

Open:

```text
https://YOUR_PROJECT.vercel.app/api/health
```

The response must contain `"ok": true` and `"framework": "nextjs"`.

## 8. Credential rotation

Rotate any key or password that appeared in an earlier Git commit, even if the current clean source no longer contains it.
