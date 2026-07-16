# Sprint 2 — Implementation Research (newly-in-scope features)

> **Purpose:** concrete, codebase-grounded implementation approaches for the four features pulled into scope
> for the next sprint: **email-forwarding pipeline, browser extension, Ask-Orbo → charts (AI Feature B), and
> deployment.** Companion to [`week7_report.md`](./week7_report.md) (the sprint report + analyst-slice plan).
>
> Each approach was researched against the actual code, then pressure-tested by a skeptical reviewer. The
> "⚠️ Caveats caught in review" lines are the corrections that survived that second pass — read them; several
> change the plan.

---

## 0. The blocker that shapes everything: the LLM gateway

Our single LLM client, [server/src/services/llm.js](../server/src/services/llm.js), does **not** call Anthropic
directly. It POSTs to `${LLM_BASE_URL}/chat/completions` in the OpenAI wire format, and the default
`LLM_BASE_URL` (in [server/src/config/env.js](../server/src/config/env.js)) is David's **Salesforce "LLM
Gateway Express" preprod internal endpoint** (`...sfproxy.devx-preprod...aws.sfdc.cl`).

**A public deployment host almost certainly cannot reach that internal endpoint**, and the key is tied to
David's internal access. So deployment *requires* swapping the LLM backend — and the browser extension's
verdict quality secretly depends on the same swap (its verdict only appears if the scan pipeline, including
the LLM, actually resolves). Fixing this once unblocks both.

---

## 1. Deployment  ·  *effort ~1 day · suggested owner: Ozias (pair w/ David + Michael)*

**Approach — LLM swap first, then Render.** Because `llm.js` already speaks the OpenAI `/chat/completions`
dialect, the swap is **config-only, zero code**: set three env values (verified correct in review):
- `LLM_BASE_URL=https://api.anthropic.com/v1`  (no trailing slash, no `/chat/completions` — `llm.js`
  appends it → `https://api.anthropic.com/v1/chat/completions`, the real endpoint)
- `LLM_MODEL=claude-haiku-4-5` (cheapest for iteration) or `claude-sonnet-4-6` (higher-quality verdicts)
- `ANTHROPIC_API_KEY=sk-ant-...`  (a real Anthropic key — replaces David's gateway key)

The Anthropic OpenAI-compat endpoint supports the `messages` array, `image_url` vision, and system messages,
so `chatJSON` / `visionText` / `visionJSON` all keep working unchanged.

Then deploy on **Render** (already named in the plan): a **Static Site** for the Vite client build + a **Web
Service** for the Express server, both reading the existing **Neon** Postgres (no DB migration). Wire prod env
+ CORS, ship a hello-world of both halves *before* feature work (per §11), then smoke-test end-to-end.

**Reuses (unchanged):** `llm.js`, `env.js` (already reads all these vars + `PORT`), the `start` script, the
`GET /api/health` check, `constants.js`'s `VITE_API_URL` fallback, Neon.

**⚠️ Caveats caught in review (all required, not optional):**
- **SPA deep-link 404.** The client uses `BrowserRouter`. A Render Static Site 404s on any non-root refresh
  (`/reports`, `/dashboard`). **Fix:** add a rewrite rule `/*  →  /index.html` (200), or commit
  `client/public/_redirects` with `/*  /index.html  200`.
- **Node version.** `server/package.json`'s start uses `node --env-file-if-exists=.env`, which needs Node
  ≥20.12. **Fix:** add `"engines": {"node": ">=20.12"}`, or simplify the Render start command to plain
  `node src/index.js` (Render injects env via the dashboard, so no `.env` file is needed on the host anyway).
- **devDeps in the build.** `vite` and the `prisma` CLI are devDependencies; if Render builds with
  `NODE_ENV=production` they're skipped and the build fails (`vite: not found`). **Fix:** build with
  `npm install --include=dev && …`.
- **CORS.** [server/src/index.js](../server/src/index.js) allows only `env.clientUrl`. Set `CLIENT_URL` to the
  deployed Static Site origin and redeploy the server, or every browser call is blocked.
- **Clerk.** Dev instance is fine for a private capstone (accept the dev banner + limits). Add the deployed
  client origin to Clerk's allowed origins **and** register the webhook at `<server>/api/webhooks/clerk` —
  deployment finally gives the webhook a public URL (unblocks real user-sync).
- **Compat endpoint is officially a test/eval layer** ("not production-ready" per Anthropic docs). Fine for a
  non-public demo; the durable path is rewriting `llm.js` onto `@anthropic-ai/sdk` later.
- **Render free web services cold-start (~50s after ~15 min idle).** The app polls — warm `/api/health`
  before demoing, or pay ~$7/mo for always-on if the stall hurts during grading.

**Open decisions:** demo model (Haiku vs Sonnet); whose Anthropic account funds the key + its spend cap;
config-only swap (recommended) vs full `@anthropic-ai/sdk` rewrite (confirm with David — it's his file).

---

## 2. Email-forwarding pipeline  ·  *effort ~0.5–1 day (demo) · suggested owner: Ozias*

**Approach — build the real handler on top of the existing `submitUrl()`; do NOT duplicate scan/escalation
logic.** In [server/src/features/webhooks/webhooks.routes.js](../server/src/features/webhooks/webhooks.routes.js),
replace the 202 stub with: (1) verify a shared-secret token → (2) normalize payload to `{from, subject, body,
links[]}` → (3) parse the bare sender address, `prisma.user.findUnique({where:{email}})` → (4) extract the
first `http(s)` URL, run `normalizeUrl()` → (5) `submitUrl({rawUrl, user, contextText: subject,
source:"email"})` → return `201 {submissionId, indicatorId, status}`.

Because `submitUrl` (in [indicators.service.js](../server/src/features/indicators/indicators.service.js))
already dedups, records the submission, and auto-calls `escalateSubmission` for org members, **the whole
verdict + escalation + Reports flow is inherited for free.** Ship the **demo path first** (a JSON payload,
parsed by the existing `express.json()` — **zero new deps**) via a saved request or a small "Simulate a
forward" button. The real **SendGrid Inbound Parse** front door is optional and deferred (needs a team-owned
domain + MX record; and `multer` only then, because SendGrid POSTs multipart/form-data).

**Reuses:** `submitUrl()`, `escalateSubmission()` (transitively), `normalizeUrl()` from `canonicalize.js`,
`prisma.user.findUnique` on the `@unique`/indexed `email` column, the already-mounted `webhooksRouter`.

**⚠️ Caveats caught in review:**
- **The demo needs a matching user row.** In pure dev-stub mode the only reliable user is `dev@orbis.local`,
  so a forwarded `from` won't match → 202 "unknown sender" every time. **Seed a user (or use a real
  Clerk-synced account) whose email matches the demo payload's `from`, or there's nothing to demo.**
- **`normalizeUrl()` validation is required, not a nicety.** `submitUrl` swallows canonicalize failures and
  will create a junk Indicator for a non-URL — so the inbound-email handler is the *only* place to reject a
  malformed link with a 400. Do it before calling `submitUrl`.
- **Pass the full `findUnique` row** (id, orgId, …) to `submitUrl`, never a bare email string — else it falls
  into the dev-stub branch and drops `orgId` (no escalation).
- **Prefer the `x-orbis-token` header** over `?token=` (query strings leak into logs). It's a shared secret,
  not cryptographic verification — honest for a non-deployed capstone; note From-spoofing as a known limit.
- **Merge hazard:** `webhooks.routes.js` is co-owned with Michael (the `/clerk` handler). Touch only the
  `/inbound-email` handler + a tightly-scoped import line.

**Ownership conflict (bigger than a typo — resolve at standup):** §12 + the route-file comment assign
inbound-email to **Ozias**; but §5 *and* §11 both say "Wk 9, **Michael's** slice." Recommendation: **Ozias**
owns it (it's the tail of his closure loop and reuses his escalation seam); fix §5 and §11 to match.

---

## 3. Ask-Orbo → charts (AI Feature B)  ·  *effort ~1–2 days · suggested owner: David (Ozias pairs on client)*

**Approach — new analyst-guarded `POST /api/nlp-query` that emits a validated whitelisted filter, never
SQL.** New feature folder `server/src/features/nlpQuery/`: route guarded by `[requireAuth, requireAnalyst]`
(both exist) → call the existing `chatJSON()` from `llm.js` to map the question into a **filter object**
(`{groupBy ∈ [verdict|day|source], dateRange on createdAt clamped ≤365d, where[] from an allowlist}`) →
`validateFilter()` rejects anything off-list (**422 "try rephrasing"**) → run a **parameterized Prisma query
scoped to `req.user.orgId`** → group in-memory (mirroring `dashboard.service.js`) → return `{filter, results,
chartSpec}`. The whitelist-not-SQL design is the plan's explicit anti-injection requirement (§8).

**Charts: keep hand-built SVG, reuse the dashboard components** — no new dependency (honors CLAUDE.md), no
Recharts. Ship **2 MVP variants** that map 1:1 onto what Michael already built: **verdict distribution →
`ResultsDonut`**, **submissions-over-time → `SubmissionHistoryChart`**.

**Reuses:** `chatJSON()` (import only — David's file), `requireAnalyst`, `scoreBucket()` from `verdict.js`,
the `dashboard.service.js` fetch-then-group-in-JS pattern, `ResultsDonut` / `SubmissionHistoryChart` /
`StatTile`, `useApi()`.

**⚠️ Caveats caught in review — these change the plan:**
- **Route-name COLLISION.** `/ask-orbo` **already exists** — it's David's check-link chat `Home`, and
  "Ask Orbo" is already the nav label for all three roles. Do **not** invent a second `AskOrbo.jsx` page.
  **Either** (a) build the analyst chart surface *into* the existing `/ask-orbo` Home as an analyst-only
  branch (coordinate with David), **or** (b) use a distinct route + label like **`/insights`**. Either way
  this is a real coordination point, not conflict-free.
- **"No teammate files touched" is FALSE on the client.** A new analyst page + nav entry edits `App.jsx`,
  `constants.js` (`NAV_BY_ROLE`), and `AppShell.jsx` (`NAV_ICON`) — all Michael's App-Shell slice. Plus one
  `index.js` router-mount line. Coordinate all four.
- **The reused charts hard-code their titles** ("My Results", "My Submission History", "Past 30 days"). Reused
  as-is, an org-wide donut will still say "My Results" and the `chartSpec.title` is dead. **Fix:** wrap them in
  a titled card in the dispatcher, or accept generic titles — don't claim both zero-edits and custom titles.
- **`SubmissionHistoryChart` needs zero-filled day buckets** (the component doesn't fill gaps —
  `dashboard.service.js` pre-seeds all 30 days). Replicate its `ymd()`/`daysAgo()` zero-fill for arbitrary
  ranges or a sparse trend misrenders. Also dedupe to unique indicators if you want donut semantics to match
  the personal dashboard.
- **`orgId=null` guard must be a hard early-return** (empty result), never an omitted where-clause (cross-org
  leak). Test it, plus a test asserting the query is never built from unvalidated LLM output.
- **Not locally testable end-to-end:** dev-stub mode gives role `individual` → `requireAnalyst` 403s, and the
  LLM default is the internal gateway. Realistic local testing is the mocked `validateFilter()` unit test
  (plus the deployed environment once the LLM swap + a real analyst account exist).
- **Ownership:** §12 puts AI Feature B under **David** (he owns `llm.js` + AI surfaces). Confirm before Ozias
  builds it; if shared, it needs David + Michael sign-off since it touches their files.

---

## 4. Browser extension  ·  *effort a few hours (dev-stub) · suggested owner: Ozias*

**Approach — dependency-free, no-build Manifest V3 popup** in a new top-level `extension/` folder (loaded
"unpacked", **not** an npm workspace — no deps, no bundler). `popup.js`: read the active tab URL via
`chrome.tabs.query({active:true,currentWindow:true})` → `POST /api/submissions` → poll `GET
/api/indicators/:id` (mirror the 1500ms / 40-try / stop-on-`done`/`error` logic from
[useIndicatorPoll.js](../client/src/features/check-link/useIndicatorPoll.js)) → render a ~30-line vanilla verdict
card reusing `VerdictCard.jsx`'s score buckets (≥70 safe / ≥35 review / else dangerous).

**Auth — the free bypass:** run the demo server in **dev-stub mode** (no Clerk keys). `auth.js` injects a stub
user when `env.clerkEnabled` is false, so the extension needs **no token at all**. This collapses the only
genuinely hard problem (Clerk-in-an-extension) to nothing. The real `@clerk/chrome-extension` path (Sync Host,
pinned CRX id, dashboard allowed-origins, a React build) is multi-day and explicitly **out of scope** — a
roadmap note only.

**Reuses (backend unchanged):** `POST /api/submissions`, `GET /api/indicators/:id`, the `auth.js` dev-stub,
the poll contract + score buckets copied (not imported — the React `VerdictCard` depends on Clerk/lucide/CSS
vars that don't exist in a bare extension).

**⚠️ Caveats caught in review:**
- **#1 caveat (above auth): the verdict depends on the scan pipeline, which depends on the LLM swap.** If the
  Salesforce internal gateway is unreachable or keys are unset, `POST /api/submissions` still returns
  `pending` but the indicator never reaches a verdict — the popup spins ~60s then times out. **Precondition:
  confirm the web app produces real verdicts against the same dev-stub server *before* building the popup.**
- **Dev-stub only fires when *both* Clerk keys are absent.** If your `.env` has real Clerk keys, the server
  boots in live mode and the tokenless extension gets 401. Run a dedicated no-Clerk-keys server for the demo.
- **CORS:** MV3 `host_permissions` for the API origin usually exempts the popup from CORS — **try with no
  server change first.** Only if Chrome still blocks it, widen `index.js` CORS to also accept
  `chrome-extension://` origins (keep methods/headers identical) — and clear that shared-file edit with the
  `index.js` owner.
- **Honesty:** every check is attributed to the one shared stub user (not per-real-user), and it only works
  against a local dev-stub server — fine for a demo, misleading if shown as a shipping feature.
- **Effort reality:** it's ~3 static files + a render function → a few hours, not 1–2 days. Don't let it crowd
  out Ozias's higher-priority owned slice (Reports/Notifications/Escalation).

---

## Cross-cutting themes

- **The LLM swap (§0) is the keystone.** It unblocks deployment *and* the extension's verdicts, and makes
  Feature B testable in the deployed env. Do it first.
- **"No merge conflicts" was over-claimed twice.** Feature B and the extension both touch shared App-Shell /
  `index.js` files. Treat `App.jsx`, `constants.js`, `AppShell.jsx`, and `index.js` as coordination points
  with Michael/David on every one of these.
- **Two ownership/naming conflicts to resolve at standup:** email-pipeline owner (§5/§11 say Michael, §12 says
  Ozias) and the `/ask-orbo` route collision (reuse David's chat vs. a new `/insights` route).
- **Local testability is limited** until the LLM swap + a deployed env + a real analyst account exist — lean on
  unit tests (`validateFilter`, the inbound-email handler) meanwhile.
