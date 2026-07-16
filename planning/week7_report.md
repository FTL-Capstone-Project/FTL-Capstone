# Week 7 — Sprint Report & Next-Sprint Plan (Orbis)

> **Purpose:** an honest report of what this sprint shipped vs. the goals in [`project_plan.md`](./project_plan.md),
> plus what's left and a proposed task split for the next sprint. Task tracking lives on our
> **[Trello board — Assigned Roles](https://trello.com/b/D7qoe5Tv/assigned-roles)**; this file is the plain-text
> record behind it (same role as [`week6_board.md`](./week6_board.md) was for Week 6).
>
> **Status:** draft for the pod sync. The next-sprint split (Part 3) and the two open decisions are for the
> team to confirm — this doc is a proposal, not a locked plan. Once agreed, we fold it into `project_plan.md` §12.

## Where we are on the calendar

`project_plan.md` §12 laid out: **Wk7** = skeleton (auth + shell + schema) + submission/dedup + reports-list;
**Wk8** = real AI verdict end-to-end ("the money demo"); **Wk9** = email pipeline + polish + deploy.

As of 2026-07-16 the team has **already cleared the Wk7 AND Wk8 goals** — auth, the data layer,
submission/dedup, reports, and the full AI verdict pipeline are all live. What remains is mostly the half the
plan deliberately deferred to "later slices": **the entire Security Analyst experience** and **AI Feature B**.

**Headline:** the rubric MVP is effectively already met — Clerk login ✓, many pages ✓, responsive ✓, 10+ Node
endpoints ✓, 1 AI feature ✓. The next sprint is about the **product vision**, not rubric survival: turning
Orbis into the *two-sided* analyst product it was designed to be.

**Decisions we're bringing into next-sprint planning:** full vision stays in scope; the next sprint **leads
with analyst review + the analyst point of view** (top priority); email-forwarding and the browser extension
stay on the list as stretch; a live deploy is intentionally pushed to the sprint *after* this one.

---

## Part 1 — What we shipped this sprint

### By slice (who did what)

**🟩 Michael — Auth + App Shell + Data Layer (the foundation that unblocked everyone).** ~11 commits.
- Clerk wired for real (`<ClerkProvider>`, `<SignIn>`/`<SignUp>`, `ProtectedRoute`); server `requireAuth`
  verifies the Clerk session and lazily upserts the mirror `User` row (webhook backstop). Dev-stub only when
  keys are absent.
- Complete Prisma data layer: **all 7 planned tables** (organizations, users, submissions, indicators,
  org_reviews, campaigns, notifications), **3 migrations**, and a **realistic seed** (1 org, 6 users across all
  roles, 4 indicators across the score bands, escalated submissions, 4 org_reviews exercising every review
  state + the share gate, 1 campaign, 2 closure notifications).
- `AppShell` (role-aware nav, collapsible sidebar, Recents, Clerk org/user buttons) and the **personal
  Dashboard** (real data, hand-built SVG/CSS charts — trend bar chart, verdict donut, stat tiles).

**🟦 David — Check-Link Core + Verdict AI (the demo centerpiece, AI Feature A). ~44 commits (most volume).**
- Real evidence pipeline: **urlscan.io** sandbox + screenshot, **Google Safe Browsing** blacklist, distilled
  into a scored verdict. All are *live* integrations (they degrade gracefully without keys — they never
  fabricate a "safe").
- **AI Feature A — plain-English verdict** via Claude on the Salesforce LLM gateway, with a deterministic score
  floor (a blacklisted URL can never be called "safe") and a rule-based fallback.
- `canonical_key` dedup ("seen before, reported N times") + typosquat detection by where a link truly lands.
- Rebuilt check-link as a **chat interface** (`Home` at `/ask-orbo`) with polling, image upload + Claude
  vision, sender reports, and persisted conversations.
- Cross-slice help: wired **Ozias's `escalateSubmission`** into the submit flow; added AI title/tags fields
  *for Ozias's Reports cards*.

**🟪 Ozias — Reports + Notifications + Escalation (the "closure loop"). ~27 commits.**
- **Reports** page, both role variants: individual (single safety score + verdict filter
  All/Safe/Suspicious/Dangerous) and org-member (dual Orbo/Analyst score, closure `StatusChip`), responsive,
  with a full accessible **Report detail modal** (focus trap, Escape, threat-vector bars).
- **Team History**: `My History | Team History` toggle (`HistoryScopeToggle`) backed by `GET /api/history?org=1`
  with a real **`shared_with_org` privacy gate** on the server (only analyst-shared items appear; individuals
  get none). Best-tested route in the codebase.
- **NotificationBell** + `NotificationsContext` with **live 1.5s polling** of `GET /api/notifications`, unread
  badge, dropdown.
- Backend: `GET /api/history` (`?mine=1` + `?org=1`), `GET/PATCH /api/notifications`, the `escalateSubmission`
  helper (**wired live** into submit — org-member submissions auto-create a `pending review` org_review), and
  the `createNotification` primitive. Real unit + route tests.

### Endpoint scorecard (12 planned + extras)

| Status | Endpoints |
|---|---|
| ✅ **Real (7)** | `POST /webhooks/clerk`, `POST /submissions`, `GET /indicators/:id`, `GET /history?mine=1`, `GET /history?org=1`, `GET /notifications`, `PATCH /notifications/:id/read` |
| ➕ **Extra, real (beyond the plan)** | `GET /dashboard`, `POST /vision/extract`, `POST /vision/read-screenshot`, `POST /ask-orbo`, `POST /ask-orbo/sender-report` |
| 🟡 **Stubbed (2)** | `POST /webhooks/inbound-email` (returns 202, does nothing), bare `GET /history` analyst stats (empty shells; not even guarded by `requireAnalyst`) |
| ❌ **Missing (5)** | `GET /search`, `PATCH /indicators/:id/review`, `GET /campaigns`, `GET /campaigns/:id`, `POST /nlp-query` |

So **10+ real first-party endpoints** — comfortably past the rubric's "5 Node endpoints."

### User-story coverage (the real "did we hit our goals" check)

| # | Story | Status |
|---|---|---|
| 1,2,3 | Individual: check a link / preview a page safely / verify a scholarship | ✅ Done |
| 4,5 | Org member: quick check / instant verdict with no team | ✅ Done |
| 6 | Org member: escalate to the security team | ✅ Done (auto-escalation wired live) |
| **7** | Org member: **notified when a verdict is confirmed** | 🟡 **Partial** — bell, polling, endpoints, and the `pending review` write all exist, but the analyst can't *confirm* a verdict yet (`PATCH …/review` missing) and `createNotification` is never triggered at runtime, so closure alerts only come from seed data. **The member half is built; the analyst trigger is the missing half.** |
| 8 | Analyst: reports arrive pre-scored + prioritized | 🟡 Scored ✓ (AI verdict + pending-review row); prioritized/triage queue ✗ |
| 9 | Analyst: duplicate/related reports grouped into a campaign | ❌ Not started (model + 1 seed row exist; no API, UI, or clustering logic) |
| 10 | Analyst: record an authoritative verdict that overrides the AI | ❌ Not started (`PATCH …/review` missing) |
| 11 | Analyst: **ask the threat history in plain English → chart (AI Feature B)** | ❌ Not started (no client or server code) |
| **12** | Org data isolation | ✅ Done — enforced via the share gate, org-scoped queries, and `requireAnalyst` (built + tested) |
| 13 | Add the message/email a link came from | ✅ Done (`contextText`, sender reports) |
| 14 | Search past reports by pasting a link | 🟡 Partial — dedup "seen before" works; the analyst keyword `GET /search` is missing |
| **15** | **AI plain-English verdict (AI Feature A)** | ✅ Done — the centerpiece |

**Verdict on goals:** every goal the plan scoped for *this* window (MVP 0: Individual + Org Member) is hit,
**plus** Wk8's AI verdict and several unplanned extras (personal dashboard, vision, ask-Orbo chat). The gaps
are exactly the items the plan pushed to "later slices" (the analyst role) — so we're **on plan and slightly
ahead on the personal/AI track**, with the whole analyst half still to build.

---

## Part 2 — What's left (the full vision)

Grouped by theme. This is the entire remaining product, not just the next sprint.

### A. The Security Analyst experience (the big one — the plan's deferred half)
1. **Analyst review / authoritative verdict** — `PATCH /api/indicators/:id/review`: upsert the org_review
   (`human_score`, `human_verdict`, `review_status`, `shared_with_org`), guarded by the existing-but-unused
   `requireAnalyst`, and **call the existing `createNotification`** to fire the closure bell. + an analyst
   verdict-authoring UI (a form inside the Report detail modal we already built). *Stories #7, #10.*
2. **Analyst dashboard (org-wide)** — make the bare `GET /api/history` real (stats + recent, analyst-guarded)
   and build the client analyst Dashboard variant (org-wide stat tiles, submission trend, verdict distribution,
   pending-review queue, recent activity). Extends the personal dashboard. *Story #8.*
3. **Analyst triage queue (analyst Reports variant)** — org-wide, **campaign-grouped rows**, priority sort
   (score × recency × count), pending-review filter front-and-center. Reuses the existing ReportCard/modal.
   *Stories #8, #9.*
4. **Campaign clustering** — `GET /api/campaigns` + `GET /api/campaigns/:id` + the clustering logic (group
   indicators/org_reviews by shared signal; extends the canonicalize/dedup work). *Story #9.*
5. **Keyword search** — `GET /api/search?q=` scoped to the analyst's org. *Story #14.*

### B. AI Feature B — Ask-the-data (analyst)
6. **`POST /api/nlp-query`** — natural-language question → **validated whitelisted filter** (never raw SQL) + a
   `chartSpec`; run a parameterized query; fallback to "try rephrasing." + the client **Ask-Orbo → chart** UI.
   *Story #11.* **Open decision:** charts today are hand-built SVG (no chart library installed) — decide
   hand-built vs. adding a lib (e.g. Recharts) before starting.

### C. Finish-the-loop cleanups (small, high-value)
7. **Persist notification read-state (O8)** — the frontend never calls the existing `PATCH /notifications/:id/read`,
   so "mark read" doesn't survive a reload (`NotificationsContext.jsx:46`).
8. **Wire `StatusChip` to real `review_status` values** (`StatusChip.jsx:1`).
9. **Dead buttons** — VerdictCard "Report it"/"Mark safe" render but do nothing (`Home` passes no `onAction`);
   AppShell top-bar Inbox icon has no handler.

### D. Stretch (explicitly on the roadmap, not required)
10. **Email-forwarding pipeline** — turn the 202 stub (`webhooks.routes.js:45`) into a real flow: match sender
    by `users.email` → extract link → create `source:"email"` submission → escalate. Demo path = simulate the
    webhook ($0, no domain); real path = SendGrid Inbound Parse. *Stories #4, #13.*
    ⚠️ **Ownership conflict to resolve:** §12 assigns `webhooks/inbound-email` to **Ozias**; §11 item 4 says
    "Wk 9, **Michael's** slice." Pick one.
11. **Browser extension** — a thin popup that sends the active tab's URL to the existing `POST /api/submissions`
    and shows the verdict. Reuses the whole backend; demoted to "optional fast-follow" in the Decisions Log,
    but we want it kept in view.
12. **Deploy** — still localhost-only. §11 wanted a "hello world" deploy *early* in Sprint 1; it slipped.
    Deferred past the next sprint by decision, but flagged so it doesn't land dangerously late.
13. **More Ask-Orbo chart variants** (6 wireframed, MVP ships 1–2), **enterprise SSO/SAML** (WorkOS), email/SMS
    notifications, backend conversation-sync for Recents.

---

## Part 3 — Proposed next-sprint split (full vision, analyst-first)

Each person **extends the slice they already own** into its analyst half — no new seams to negotiate, and it
directly delivers the two-sided product.

| Owner | Committed goal (the sprint spine) | Why it's theirs |
|---|---|---|
| **🟪 Ozias** | **Analyst review → closure loop** (A1): `PATCH /indicators/:id/review` + analyst verdict form in the modal + **wire `createNotification`** + finish O8 (persist read-state). Then the **triage-queue** analyst Reports variant (A3). | Completes *my own* closure loop — I own Reports, notifications, and escalation; the org_review *write* is the missing half of the escalation already built. **Top priority for the sprint.** |
| **🟩 Michael** | **Analyst dashboard** (A2): real analyst `GET /history` stats + client analyst dashboard variant. Then **keyword search** (A5). | Extends the personal dashboard he built; he owns the app shell + data layer. |
| **🟦 David** | **Campaign clustering** (A4): `GET /campaigns` + `/:id` + clustering logic. Then **AI Feature B** (B6): `POST /nlp-query` + Ask-Orbo→chart UI. | Clustering extends his canonicalize/dedup; Feature B is an AI/structured-output feature — his Feature-A wheelhouse. |

**Dependency order (so nobody blocks):**
1. Ozias's `PATCH …/review` unblocks real closure notifications *and* gives the triage queue real review states to show.
2. David's `GET /campaigns` unblocks the campaign-grouped rows in Ozias's triage queue — so David ships the campaigns *API* early, Ozias consumes it late.
3. Michael's analyst `GET /history` stats are independent and can start day one.

**Feasibility (honest):** full analyst vision + Feature B + email + extension in one sprint is realistically
~1.5–2 sprints for a 3-person team. Recommendation: **commit** to the analyst spine (review loop + dashboard +
triage queue + campaigns) — that alone lands stories #7–#10 and #12 and the "two-sided product" wow — and treat
**AI Feature B as the reach goal**, with email + extension as explicit stretch. That ordering guarantees even a
short sprint delivers the analyst point of view rather than spreading thin across everything and finishing none.

### Next-sprint board (Trello-style — drop these onto the board)

| # | Card | Owner | Story | Type |
|---|---|---|---|---|
| 1 | `PATCH /api/indicators/:id/review` (upsert org_review, guard with `requireAnalyst`, set `shared_with_org`) | Ozias | 7, 10 | Commit |
| 2 | Analyst verdict-authoring form inside the Report detail modal | Ozias | 10 | Commit |
| 3 | Wire `createNotification` on review → closure bell fires for real | Ozias | 7 | Commit |
| 4 | Finish O8: frontend calls `PATCH /notifications/:id/read` (persist read-state) | Ozias | 7 | Commit |
| 5 | Analyst triage-queue Reports variant (campaign-grouped, priority sort, pending filter) | Ozias | 8, 9 | Commit |
| 6 | Real analyst `GET /api/history` stats + recent (analyst-guarded) | Michael | 8 | Commit |
| 7 | Client analyst Dashboard variant (org-wide tiles, trend, distribution, pending queue) | Michael | 8 | Commit |
| 8 | `GET /api/search?q=` (org-scoped keyword search) | Michael | 14 | Commit |
| 9 | `GET /api/campaigns` + `GET /api/campaigns/:id` + clustering logic | David | 9 | Commit |
| 10 | `POST /api/nlp-query` (NL → whitelisted filter + chartSpec) | David | 11 | Reach |
| 11 | Client Ask-Orbo → chart UI | David | 11 | Reach |
| 12 | Email-forwarding pipeline (real `webhooks/inbound-email`) | Ozias/Michael* | 4, 13 | Stretch |
| 13 | Browser-extension popup (active tab → `POST /submissions`) | TBD | 4 | Stretch |

\* resolve the §12-vs-§11 ownership conflict first.

### Two decisions to make before coding
- **Charts (Feature B / analyst dashboard):** keep hand-built SVG (consistent with the current dashboard, zero
  new deps) or add a chart library (e.g. Recharts — faster for the 6 wireframed variants)? CLAUDE.md prefers not
  adding libraries without reason, so default to hand-built unless the team wants the variety.
- **Email-pipeline ownership:** Ozias (per §12) or Michael (per §11)? Resolve the doc conflict.

---

## Part 4 — Housekeeping flags (not features, but they'll bite)

- **Uncommitted work on `ozias/repo-cleanup`** (current branch): 65 files of style-only refactor
  (`function` → arrow-`const`) + deletion of orphaned `mockReports.js` and `project_plan.md.bak`. It's *even
  with main* (0 commits ahead) — everything is uncommitted. Commit or stash before starting new work so a big
  style diff doesn't tangle with feature diffs at merge time.
- **Stale docs to fix:** `server/src/services/README.md` and `.env.example` claim external services are
  "stubbed / canned data" — **false now** (urlscan, Safe Browsing, verdict, and the LLM gateway are all live).
  Update so teammates don't build against a wrong assumption. Also `App.jsx:17` calls `/dashboard` "unbuilt" —
  stale (it's done).
- **Reflections empty:** `reflections/reflection1–5.md` are all blank templates (still say "Add Pod Members
  Names"). Reflection #1 (Week 7) is likely due now.
- **`requireAnalyst` is built + tested but guards nothing yet** — ready the moment the analyst routes land.
