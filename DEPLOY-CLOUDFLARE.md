# Deploying Grocery Hauls za Pro to Cloudflare Pages

> ⚠️ **Production safety first:** https://grocery-hauls-za.pages.dev is LIVE and working.
> Nothing in this guide touches it until you explicitly run a deploy step yourself.

## Current situation (important context)

Your existing Pages project (`grocery-hauls-za`) was deployed via **direct upload**
(`wrangler pages deploy`) from GitHub Actions — the nightly workflow
`.github/workflows/nightly-grow-deploy.yml` in this repo builds `out/` and pushes it.

**Cloudflare limitation to know:** a Pages project created via *direct upload cannot
later be switched to Git integration*. You therefore have two supported paths:

| Path | What happens | Effort | Risk to prod |
|------|--------------|--------|--------------|
| **A. Restore the automated pipeline (recommended)** | Set 3 GitHub secrets, run the nightly workflow manually once; it rebuilds and deploys to the **same project** exactly as before | ~5 min | Low — same pipeline that produced the current production site |
| **B. New Git-integrated project** | Create a *new* Pages project connected to the GitHub repo; you get a new `*.pages.dev` preview URL to verify before switching the domain | ~15 min | Zero — old site untouched until you move the domain |

## Path A — restore the automated pipeline (same project)

1. **Push the fixed branch and merge to `main`.**
2. In the GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**, add:
   - `CLOUDFLARE_API_TOKEN` — Cloudflare dashboard → My Profile → API Tokens →
     *Create Token* → template **"Cloudflare Pages — Edit"** (scoped to the account & project)
   - `CLOUDFLARE_ACCOUNT_ID` — Cloudflare dashboard → Workers & Pages (right sidebar)
   - `CLOUDFLARE_PROJECT_NAME` — the Pages project name, e.g. `grocery-hauls-za`
3. Repo → **Actions → "Nightly grow + deploy" → Run workflow** (manual trigger).
4. Watch the run: it grows the catalog (optional), builds `out/`, and deploys with
   `wrangler pages deploy out --project-name=... --branch=main`.
5. Verify https://grocery-hauls-za.pages.dev (hard-refresh Ctrl+Shift+R).

Rollback: Cloudflare dashboard → your Pages project → **Deployments** → every deploy is
retained — click **"Rollback"** on the previous one. Instant and safe.

## Path B — new Git-integrated project (preview first, zero prod risk)

1. Push the fixed branch; merge to `main` when you're happy (or point the new project at the feature branch first).
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** →
   pick the repo `rickmabz25-design/Grocery-Hauls-za-Pro`.
3. Build settings:
   - **Framework preset:** `Next.js (Static HTML Export)` — or "None"
   - **Build command:** `npm ci && node scripts/build-static.mjs`
   - **Build output directory:** `out`
   - **Environment variable:** `NEXT_PUBLIC_STATIC = 1`
     (the build script sets it too; setting it explicitly keeps the dashboard truthful)
   - Node 20+ is fine — the build now works with **Node only** (Bun optional).
4. Save & Deploy → you get `grocery-hauls-za-<something>.pages.dev` to verify.
5. When satisfied: Pages project → **Custom domains** → add `grocery-hauls-za.pages.dev`?
   *Note:* the old project holds that subdomain. Instead either rename the new project to
   take over, or keep both and switch your custom domain over. The old project is never
   modified, so the current site stays up the whole time.

## What the fixed pipeline does each night (00:00 SAST)

1. `bun scripts/grow-catalog.mjs --limit 15` — grows catalog from the seed queue (skips if empty)
2. Stamps `public/version.txt`
3. `node scripts/build-static.mjs` — regenerates `public/data/*.json` from `db/custom.db`
   (expired promos excluded), stashes `src/app/api`, runs `next build` static export
4. Commits grown catalog back to `main` (`[skip ci]`)
5. Deploys `out/` to Cloudflare Pages

## Local build & verify (what was tested)

```bash
npm ci
node scripts/build-static.mjs          # → out/
npx serve out                          # smoke test locally
```

Both `bun` and plain-Node environments produce byte-identical catalog JSON and a
successful static export.
