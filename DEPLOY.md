# Deploying Orbis to Render

Orbis deploys as **two Render services** driven by [`render.yaml`](./render.yaml):

- **`orbis-api`** — the Express API (Web Service)
- **`orbis-client`** — the React client (Static Site)

The database is **external (Neon)** — Render doesn't host it; you paste the Neon
connection string into `DATABASE_URL`.

> There's a chicken-and-egg with URLs: the two services need each other's URLs, which
> you only know *after* they're first created. So the flow is: deploy once → grab the
> URLs → set the two cross-reference env vars → redeploy. Steps below call this out.

---

## Prerequisites

1. Code pushed to GitHub (the branch Render will deploy — usually `main`).
2. A **Neon** database (you already have one). Have its connection string ready.
3. Your **Clerk** keys. For a real launch, create a **Clerk _production_ instance**
   (separate `pk_live_`/`sk_live_` keys + a production webhook) — the current
   `pk_test_` dev instance has strict limits and shows a dev banner. For a course
   demo, the dev instance is fine.

---

## Step 1 — Create the Blueprint

1. Render dashboard → **New +** → **Blueprint**.
2. Connect the GitHub repo. Render detects `render.yaml` and shows both services.
3. Click **Apply**. Both services are created but will need env vars (next step).

## Step 2 — Set environment variables

In the Render dashboard, on each service → **Environment**:

### `orbis-api` (Web Service)
| Var | Value |
|---|---|
| `DATABASE_URL` | your Neon **pooled** connection string (see note ⬇) |
| `CLERK_SECRET_KEY` | `sk_...` |
| `CLERK_PUBLISHABLE_KEY` | `pk_...` |
| `CLERK_WEBHOOK_SECRET` | `whsec_...` (from the Clerk webhook endpoint) |
| `ANTHROPIC_API_KEY` | LLM gateway key |
| `URLSCAN_API_KEY` | urlscan.io key (optional; stubs without it) |
| `GOOGLE_SAFE_BROWSING_KEY` | Safe Browsing key (optional) |
| `CLIENT_URL` | **fill in Step 4** (the client's URL) |
| `NODE_ENV` | `production` (already set in render.yaml) |

> ⚠️ **Do NOT set `ORBIS_DEV_STUB` in production.** Its absence makes auth fail
> closed — if the Clerk keys are ever missing, the API refuses rather than logging
> everyone in as one fake user.

### `orbis-client` (Static Site)
| Var | Value |
|---|---|
| `VITE_CLERK_PUBLISHABLE_KEY` | `pk_...` (same publishable key) |
| `VITE_API_URL` | **fill in Step 4** (the API's URL) |

## Step 3 — First deploy

Trigger a deploy of both. The API's build runs `npm run deploy:build`
(`prisma generate && prisma migrate deploy`) — this **applies migrations to Neon
safely** (no data reset, unlike `migrate dev`). The client build runs `vite build`.

## Step 4 — Wire the cross-service URLs, then redeploy

After the first deploy, copy each service's Render URL, then:

- `orbis-api` → set **`CLIENT_URL`** = the client's URL (e.g. `https://orbis-client.onrender.com`) — this is the CORS allowlist.
- `orbis-client` → set **`VITE_API_URL`** = the API's URL (e.g. `https://orbis-api.onrender.com`).

Redeploy both (the client MUST rebuild — Vite bakes `VITE_API_URL` in at build time).

## Step 5 — Point the Clerk webhook at prod

In the Clerk dashboard → Webhooks → set the endpoint URL to
`https://orbis-api.onrender.com/api/webhooks/clerk`, and put its signing secret in
the API's `CLERK_WEBHOOK_SECRET`. (Locally this webhook can't be reached, so mirror-row
sync relied on the lazy backstop; in prod the webhook does the real-time sync.)

## Step 6 — Verify

- `https://orbis-api.onrender.com/api/health` → `{"ok":true,"clerk":"live"}`
- Open the client URL, sign up / sign in, run a check.

---

## Notes & gotchas

- **Use Neon's POOLED connection string** for `DATABASE_URL`. In the Neon dashboard the
  pooled host contains `-pooler` (e.g. `ep-xxx-pooler.<region>.aws.neon.tech`). A Render
  web service opens many connections; the *direct* (non-pooler) endpoint hits Neon's
  connection cap → intermittent "too many connections" errors. The pooled string avoids it.
- **Node is pinned to 22.x** (`engines` in each package.json) so Render builds with a
  known version. Don't remove that unless you also test on the new version.

- **Free tier sleeps.** Render free web services spin down when idle; the first request
  after a nap takes a few seconds. Fine for a demo.
- **Migrations are additive-safe** via `migrate deploy`. If you add a new migration
  later, the next deploy applies it automatically.
- **Seed data:** `deploy:build` does NOT seed. To load demo data once, run
  `npm run prisma:seed` against the prod `DATABASE_URL` (locally, with that URL, or via
  a Render one-off job).
- **Secrets** are entered in the Render dashboard (`sync: false` in render.yaml) and are
  never committed. `.env` files stay gitignored.
