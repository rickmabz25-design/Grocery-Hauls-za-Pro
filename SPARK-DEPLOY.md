# Deploying on the Firebase Spark (free) plan — static hosting

This mode ships the app as a **fully static site** on standard Firebase Hosting.
No Cloud Functions, no App Hosting, no server APIs, no Storage — everything
runs within the free Spark plan.

## What works on the static build

| Feature | Status |
|---|---|
| Home, Specials & filters, What's New feed, store pages | ✅ Full (catalog baked at build) |
| Google sign-in (Firebase Authentication) | ✅ Full (client-side) |
| Create / My Lists / Compare / Split / Shop Mode persistence | ⏳ Spark Pass 2 (Firestore on the free plan) — views show a friendly notice |
| Admin console (/#/admin) | ❌ Needs server — manage catalog in the local preview, then redeploy |

## Deploy steps

```bash
# 1. Build the static site (generates public/data/*.json from db/custom.db,
#    runs `next build` in export mode, restores the API routes afterwards)
bun run build:static

# 2. Deploy to Firebase Hosting (project groceryhauls-pro-za-app)
firebase deploy --only hosting
```

Or in one step: `bun run deploy` (builds then deploys).

Requires `firebase login` once beforehand. No Blaze upgrade needed.

## After deploying

1. Open https://groceryhauls-pro-za-app.web.app
2. Google sign-in needs no setup — hosting and Authentication are now the
   SAME project, and a project's own web.app domain is authorized by default.
3. Browse the catalog and sign in.

## Updating the catalog

The deployed catalog is a **snapshot taken at build time**. To publish new
specials: edit the data in the local preview (admin console) or directly in
`db/custom.db`, then run `bun run deploy` again.

## Spark Pass 2 (planned)

User data (lists, wish list, shop sessions, notifications) moves to
**Firestore**, which runs on the free Spark plan:
- Collections keyed by Firebase UID with per-user security rules
- No Cloud Functions required — the client talks to Firestore directly
- The catalog can stay static (zero quota use) or move to Firestore later

## Blaze escape hatch (kept, not required)

The full SSR deployment remains available for when you ever upgrade to Blaze:
- `firebase.ssr.json` — framework-aware hosting config (SSR via Cloud Functions)
- `bun run deploy:ssr` — deploys the SSR build (Blaze required)
- `bun run build` — the SSR build chain (unchanged)
- `DEPLOY-BLAZE.md` — the previous Blaze deployment guide (incl. Postgres Mode B)
