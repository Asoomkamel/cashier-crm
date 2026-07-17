# Cashier CRM

A Next.js 15 + React + TypeScript cashier, CRM, inventory, work-order, reporting, accounting, and Supabase-enabled application.

## Requirements

- Node.js 22.x
- npm 10.x
- A Supabase project when cloud features are enabled

## Local setup

```bash
npm ci
copy .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

## Validation

```bash
npm run typecheck
npm test
npm run build
```

Or run all checks:

```bash
npm run verify
```

## Vercel

Import the repository as a Next.js project. Use Node.js 22.x and add environment variables in Vercel rather than committing `.env.local`.

See [VERCEL_DEPLOYMENT.md](./VERCEL_DEPLOYMENT.md) for the deployment procedure and security notes.

## Repository hygiene

Do not commit:

- `.env.local`
- `.next`
- `node_modules`
- `.vercel`
- ZIP archives

The project must remain at the repository root; do not place a second Git repository inside it.
