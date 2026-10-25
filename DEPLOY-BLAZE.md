# Deploying Grocery Hauls Pro ZA to Firebase Hosting — groceryhaulsza-pro1.web.app

Everything is pre-configured. This app is **full-stack Next.js** (SSR pages + API
routes + Prisma), so it deploys to Firebase Hosting with **framework-aware
hosting** (SSR runs on a Cloud Functions backend that Firebase provisions
automatically — no manual functions setup).

## What is already prepared

| File | Purpose |
|---|---|
| `firebase.json` | Hosting config: `source: "."` (Next.js SSR), europe-west1 backend (lowest-latency Firebase region for South Africa), 1 GiB / max 10 instances, long-cache headers for `/icons/**` and `/brand/**` |
| `.firebaserc` | Default deploy target pinned to project **groceryhaulsza-pro1** |
| `scripts/sync-prisma-provider.mjs` | Build-time step that picks the Prisma provider from `DATABASE_URL`: `postgres://…` → postgresql, `file:`/none → sqlite. Runs inside `npm run build` locally and in Firebase's cloud build |
| `scripts/migrate-sqlite-to-postgres.mjs` | One-command data migration (all 17 tables, 1,000+ rows) from SQLite to Postgres, with verification |
| `src/lib/db.ts` | Cloud-aware DB bootstrap: prefers a real `DATABASE_URL` (Postgres), falls back to the bundled SQLite catalog on writable `/tmp` when unset |
| `package.json` | `engines.node = 20`, build chain (sync → generate → build), `deploy` and `db:to-postgres` scripts |

## One-time prerequisites

1. **Blaze plan** — Firebase Hosting SSR requires the pay-as-you-go plan on the
   `groceryhaulsza-pro1` project (Console → Usage and billing → Upgrade).
2. **Install & login** (Node 20+ machine):
   ```bash
   npm install -g firebase-tools   # v13 or newer
   firebase login
   ```
3. **Authorized domains for Google sign-in** — the app authenticates against the
   **other** Firebase project (`groceryhauls-pro-za-app`, where the Google
   provider and `src/firebase.js` config live). In that project's console:
   Authentication → Settings → Authorized domains → add **both**:
   - `groceryhaulsza-pro1.web.app`
   - `groceryhaulsza-pro1.firebaseapp.com`

## Database: choose a mode before deploying

**Mode A — Catalog-only (zero setup, data resets):** deploy as-is. Every cold
server instance copies the bundled `db/custom.db` to writable `/tmp`, so all 7
stores / products / 78 specials render immediately. User-generated data (lists,
wish lists, admin edits) resets when the instance recycles. Good for a demo.

**Mode B — Durable user data (recommended, ~10 minutes):** migrate to Postgres.

1. Create a free Postgres (Neon, Supabase, or Cloud SQL) and copy its
   connection string (`postgres://user:pass@host/db?sslmode=require`).
2. Run the migration (reads `db/custom.db`, pushes the schema, copies and
   verifies all rows, then restores local dev to SQLite automatically):
   ```bash
   bun run db:to-postgres -- --url "postgres://user:pass@host/db?sslmode=require"
   ```
3. Point the project's `.env` at Postgres (this file ships to the cloud build
   and runtime — that is how framework-aware hosting passes env vars; keep it
   out of git):
   ```
   DATABASE_URL=postgres://user:pass@host/db?sslmode=require
   ```
4. Deploy (next section). The cloud build detects the `postgres://` URL,
   generates the Postgres Prisma client automatically, and the app runs with
   durable data.

> Re-syncing later: run the migration command again after changing local data —
> it is idempotent (`ON CONFLICT DO NOTHING`) and verifies counts at the end.

## Deploy

From the project root:

```bash
firebase deploy --only hosting      # or: npm run deploy
```

The build runs in Firebase's cloud (provider sync + Prisma generate + Next
build). First deploy takes a few minutes; the CLI prints the live URL
(`https://groceryhaulsza-pro1.web.app`).

## Verify after deploy

- [ ] Home loads with specials (catalog ships inside the bundle)
- [ ] **Sign in with Google** completes (domains authorized per step 3)
- [ ] Lists / wish list / admin (`/#/admin`) respond
- [ ] Mode B: create a list, redeploy or wait ~10 min, confirm the list survives
- [ ] PWA install works (manifest + icons served from `/icons/`)

**Alternative:** Firebase **App Hosting** (Console → App Hosting → create
backend from a GitHub repo) also supports this Next.js app and manages scaling
itself; `firebase.json` hosting is not used in that mode. The CLI path above is
the fastest route to live.
