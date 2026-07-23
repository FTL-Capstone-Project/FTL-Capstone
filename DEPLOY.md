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
| `INBOUND_EMAIL_TOKEN` | shared secret for the email-forwarding relay (see Step 7); `/inbound-email` 503s until set |
| `INBOUND_EMAIL_TOKENS` | optional plus-token map `david:david@acme.com,...` |
| `OUTBOUND_EMAIL_URL` | our reverse Apps Script Web App URL for report emails (see Step 8); report emails off until set |
| `OUTBOUND_EMAIL_TOKEN` | shared secret sent in the POST body to that relay |
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

## Step 7 — (Optional) Enable email forwarding

Lets users forward a suspicious email to Orbis; it's analyzed (sender + message + any link) and
shows up as a report an analyst can review — even a text-only scam with no link. Orbis runs **no
mail infrastructure**; a free Gmail account relays forwards to the API.

1. Set **`INBOUND_EMAIL_TOKEN`** on `orbis-api` to any long random string (the shared secret).
2. Create/pick a Gmail inbox (e.g. `orbischecks@gmail.com`) and install the Orbis inbound relay:
   open [script.google.com](https://script.google.com), paste [`server/appsscript/inbound-relay.gs`](server/appsscript/inbound-relay.gs),
   set `ORBIS_API_URL` (the **base URL only** — the script appends the path) + `ORBIS_TOKEN` (same
   token as step 1). Then **run `baselineExistingInbox()` ONCE** (labels any existing inbox+spam mail
   as processed WITHOUT sending, so you don't get a flood of reports for old mail), and add a
   **1-minute time trigger** on `relayForwards`. The relay watches **inbox AND spam** (forwarded
   scams often get auto-filed as spam), marks each processed thread read, and POSTs
   `{from,to,subject,body,html,headers,replyTo,threadId}` to `/api/webhooks/inbound-email` with the
   `x-orbis-token` header.
3. (Optional) Set **`INBOUND_EMAIL_TOKENS`** to map plus-tokens to registered emails so
   `orbischecks+<token>@gmail.com` beats a spoofable From header.

Test without Gmail (simulate a forward) — expect `201 …escalated:true` for a seed org member.
The `body` can contain MULTIPLE links (every one is scanned) and a forwarded `From:` header (the
display name vs address is checked for impersonation). The optional `headers` / `replyTo` fields
unlock the strongest checks:
```bash
curl -i -X POST https://orbis-api.onrender.com/api/webhooks/inbound-email \
  -H "content-type: application/json" -H "x-orbis-token: YOUR_TOKEN" \
  -d '{"from":"David M. <david@acme.com>","to":"orbischecks@gmail.com",
       "subject":"Fwd: account locked",
       "headers":"Authentication-Results: mx.google.com; dkim=fail; spf=fail; dmarc=fail",
       "replyTo":"attacker@evil.ru",
       "body":"From: PayPal Security <no-reply@paypa1-secure.com>\nverify https://paypa1-secure.com/verify or visit https://paypal.com"}'
```

> **Richer signals — now sent by the committed relay.** The relay forwards, in addition to the
> plain-text `body`: the original **HTML body** (`message.getBody()` → `html`), the top **header
> block** (`message.getRawContent()` → `headers`), the **Reply-To** (`message.getReplyTo()` →
> `replyTo`), and the **Gmail thread id** (`thread.getId()` → `threadId`). These unlock Orbis's
> strongest deterministic checks — SPF/DKIM/DMARC forged-sender detection, Reply-To-vs-From domain
> mismatch, and true anchor-text-vs-href link disguise — and let the outbound report **reply into
> the same thread** (Step 8). All are OPTIONAL: a plain-text relay that omits them still works.

## Step 8 — (Optional) Enable outbound report emails

After a user forwards an email and Orbis finishes checking it, email them the full report (verdict,
score, threat vectors, per-link breakdown, screenshot) so they don't have to open the app. Uses the
SAME Gmail + Apps Script pattern as Step 7, in **reverse** — no new mail infrastructure, no SMTP.

1. In the same `orbischecks@gmail.com` account, create a **second Apps Script Web App**: paste
   [`server/appsscript/outbound-relay.gs`](server/appsscript/outbound-relay.gs), set `OUTBOUND_TOKEN`,
   and deploy it as a **Web app** (execute as you; access "Anyone"). Copy its
   `https://script.google.com/…/exec` URL. Its `doPost(e)` checks the token, then — if the payload
   carries a `threadId` — **replies into that Gmail thread** (`GmailApp.getThreadById(id).reply(...)`)
   so the report nests under the user's forward; otherwise it sends a standalone
   `GmailApp.sendEmail(...)`.
2. On `orbis-api` set **`OUTBOUND_EMAIL_URL`** = that URL and **`OUTBOUND_EMAIL_TOKEN`** = a long
   random string (match it in the Apps Script). Until BOTH are set, report emails are a silent
   no-op (the in-app notification still fires).
3. Users can opt out via the `User.emailReports` flag (default on).

> **Editing the script later:** Apps Script serves the last *deployed* version, not the last saved
> one. After any edit: **Deploy → Manage deployments → Edit (✏️) → Version: New version → Deploy.**

Test end-to-end: run the Step 7 curl with `OUTBOUND_EMAIL_*` set, then confirm `orbischecks@gmail.com`
sends the forwarding address an HTML report once the check finishes. Re-forwarding the SAME email
sends the finished report again immediately (no re-scan), threaded under the original forward.

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
- **Creating a migration locally against Neon may hang on an advisory lock** (`P1002`). Neon doesn't
  reliably support Prisma's session advisory lock. Workaround: prefix with
  `PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1` (e.g.
  `PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1 npx prisma migrate dev --name <name>`, from `server/`).
  Affects only local migration creation; prod `migrate deploy` is unaffected.
- **Migrations are additive-safe** via `migrate deploy`. If you add a new migration
  later, the next deploy applies it automatically.
- **Seed data:** `deploy:build` does NOT seed. To load demo data once, run
  `npm run prisma:seed` against the prod `DATABASE_URL` (locally, with that URL, or via
  a Render one-off job).
- **Secrets** are entered in the Render dashboard (`sync: false` in render.yaml) and are
  never committed. `.env` files stay gitignored.
