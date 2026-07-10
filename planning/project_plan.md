# Project Plan — Orbis

**Team Name:** DOMinion  
**Project Name:** Orbis  
**Pod Members:** Michael Jissa, Ozias Tumimana, David Gonzalez-Cesar

> Master spec / source of truth. Before code is written, the relevant section here is updated first.
> Sections 3–4 carry over from the Week 5 user-stories work; 5–9 are new this week.

---

## 1. Problem Statement and Solution Description

**Problem.** Phishing is the most common entry point for organizational breaches. When someone gets a
suspicious link, the safe move is to report it and wait for an analyst, but analysts are buried in reports,
and triaging each by hand (confirming a URL is malicious, understanding what it does, spotting whether it's
part of a larger campaign) is slow, repetitive, and needs specialized expertise. Meanwhile the person who
reported it gets no quick answer. The people most targeted,
students, individuals, and small companies without a security team, have the least help.

**Solution.** Orbis takes the slow, manual work out of phishing triage. A user submits a suspicious URL;
Orbis detonates it in a secure sandbox (urlscan.io), gathers evidence about what the page does, and returns
a plain-English danger verdict with a 0–100 score and a screenshot, without anyone opening the link on their
own machine. One product serves three roles: **individuals** and **organization members** get a lightweight
"is this safe?" page and their own report history; **analysts** get a full triage dashboard (org-wide history,
keyword search, campaign clustering, and natural-language querying of the threat database). Each organization
sees only its own data.

**Target audience:** SOC/IT security analysts who triage suspicious URLs, and the everyday organization members
(and solo individuals) who encounter those links.

---

## 2. User Roles and Personas

### Roles
- **Individual** — a person vetting suspicious links for themselves, with no organization or security team to fall back on.
- **Organization Member** — a person who receives suspicious links/emails at work and wants to know if they're safe before acting, where a bad click can put the wider organization at risk.
- **Security Analyst** — a member of a security/IT team (often the only one at a small company) who investigates reported threats, issues authoritative verdicts, and monitors the org's threat landscape.

> Role rename (pod sync, Jul 1): "Employee" → **Organization Member**. See Decisions Log & `user_stories.md`.

### Personas
**Individual — Sofia (targeted college student).** 20, Phoenix AZ, phone-first. Inbox full of scholarship/
internship/financial-aid messages, many fake. No campus IT to ask in real time. Wants a fast gut-check she
can trust; pain point: a real offer and a scam look identical and she has no one to ask.

**Individual — Robert (on-his-own retiree).** 63, Tampa FL, shops and banks online. Gets constant "package
couldn't be delivered" / "account locked" links; browses unfamiliar stores. Not confident with tech, no IT
person, afraid of losing retirement savings. Wants a trustworthy second opinion; pain point: can't tell a real
site from a convincing fake, and "just don't click" isn't practical.

**Organization Member — Maria (cautious, has a security team).** 52, HR coordinator, Cleveland OH. Lives in her
inbox (résumés, invoices from strangers). Careful but not techy. Wants peace of mind and an expert backstop; pain
point: when she reports to IT she never hears back, so she never learns if she did the right thing.

**Organization Member — Deshawn (fast, no security team).** 29, sales rep at a 30-person Austin startup with no
security team. On the road, phone-first, dozens of links a day, clicks fast. Comfortable with tech, impatient. Wants
speed with a safety net; pain point: "report to security" isn't even an option where he works.

**Security Analyst — Priya (startup's first security hire).** 34, the *only* security person at a 50-person
Toronto startup. No enterprise tooling — just her, a laptop, a shared inbox. Wants leverage to handle the whole
company's reports alone; pain point: a phishing wave means the same link reported 20× and no automation to group it.

**Security Analyst — Tom (accidental security lead).** 41, IT generalist at a 60-person Denver nonprofit who
inherited "security" on top of the help desk. Technical but not a phishing specialist; handles threats
reactively between tickets. Wants tooling to do the heavy analysis and answer "are we being targeted?"; pain
point: enterprise platforms are too costly/complex, and past incidents aren't organized or searchable.

---

## 3. User Stories

> Source of truth: [`user_stories.md`](./user_stories.md). Numbering here matches it exactly (used by the
> "Stories" column in §6). 15 stories total.

### Individual
1. As an individual, I want to check a suspicious link myself and get a clear verdict, so that I can protect myself even though I have no IT department or security team to ask.
2. As an individual, I want to safely preview what an unfamiliar webpage actually contains before I visit it, so that I can decide whether to shop on or trust a site I've never used.
3. As a student, I want to verify whether a scholarship, internship, or financial-aid link is legitimate, so that I don't hand my personal or bank details to a scam that targets students like me.

### Organization Member
4. As an organization member, I want to check a link quickly without derailing what I'm working on, so that staying safe doesn't cost me my focus or my time.
5. As an organization member at a company with no security team, I want an instant expert-level verdict on my own, so that I'm still protected even though there's no one at work to report to.
6. As an organization member at a company that has a security team, I want to send a suspicious link to that team for an authoritative review, so that an expert makes the final call whenever the automated verdict leaves me unsure.
7. As an organization member, I want to be notified when my company's security team confirms a verdict on something I reported, so that I get real closure and know my report actually mattered.

### Security Analyst
8. As a security analyst, I want incoming reports to arrive already scored and prioritized, so that even as a one-person team I can focus on the threats most likely to be real.
9. As a security analyst, I want duplicate and related reports automatically grouped into a single campaign, so that a phishing wave becomes one investigation instead of twenty separate fires.
10. As a security analyst, I want to record my own authoritative verdict that overrides the automated one, so that my organization has a trusted final decision on each threat.
11. As a security analyst, I want to ask questions about our threat history in plain language and see the answer visualized, so that I can understand what we're being targeted with without buying expensive tooling or writing database queries.
12. As a security analyst, I want the reports and threat history I can see to be limited to my own organization, so that another company can never view our sensitive security data.

### Shared / Cross-Role
13. As any user, I want to add the message or email a link came from, so that the verdict accounts for the whole scam and not just the URL in isolation.
14. As any user, I want to search past reports by pasting a link or message, so that I can instantly reuse an existing verdict instead of waiting on a fresh analysis of something already investigated.

### AI Feature Story
15. As a user, I want an instant, plain-English safety verdict that weighs everything known about a link and the context I submitted it with, so that I get an expert-level assessment in seconds without having to interpret the technical evidence myself.

---

## 4. Pages / Screens

Wireframes live in [`wireframes/Figma Wireframes PDF.pdf`](./wireframes/Figma%20Wireframes%20PDF.pdf) (4 pages,
grouped by flow). The **Status** column marks what is drawn vs. planned-but-not-yet-drawn. Far more than the
required 3 screens are wireframed.

### Onboarding & auth (PDF p.1)
| Page | Role | Purpose | Key components (implied) | Status |
|---|---|---|---|---|
| Landing page | public | Marketing entry; explains Orbis, routes to sign up | `Hero`, `StatRow`, `FeatureCard`, `Footer` | ✅ drawn |
| Login | both | Email + password **and** social login (Google/Apple) — Clerk `<SignIn>` | Clerk `<SignIn />` (styled) | ✅ drawn |
| Register | both | Create account (email/password or social) — Clerk `<SignUp>` | Clerk `<SignUp />` (styled) | ✅ drawn |
| Team setup — step 1 | member/analyst | Create an organization — Clerk org creation | Clerk `<CreateOrganization />` | ✅ drawn |
| Team setup — step 2 | member/analyst | Invite teammates / domain auto-join — Clerk | Clerk `<OrganizationProfile />` (invites) | ✅ drawn |
| Accept invite / join org | member/analyst | What an invited person sees — Clerk invite flow | Clerk invite/join UI | ✅ drawn |

### Core "check a link" flow (PDF p.2)
| Page | Role | Purpose | Key components (implied) | Status |
|---|---|---|---|---|
| Home — Individual | individual | Greeting + paste-a-link entry + quick prompts | `SubmitForm`, `OrboAvatar`, `RecentList` | ✅ drawn |
| Home — Org | member | Same, scoped to the org ("Hi David · Acme") | `SubmitForm`, `OrboAvatar`, `RecentList` | ✅ drawn |
| Check Link — Checking | both | Loading/analyzing state while sandbox runs | `StatusBadge`, `LoadingState` | ✅ drawn |
| Check Link — Result | both | Verdict: score, screenshot, plain-English explanation, evidence | `ScoreGauge`, `Screenshot`, `EvidenceList`, `VerdictCard` | ✅ drawn |
| Verdict states — Safe / Suspicious / Dangerous | both | Same card, three data-driven color/score states | `VerdictCard` (one component) | ✅ drawn |
| Check Link — Invalid Input | both | Error state when input isn't a valid URL/email | `SubmitForm` (error) | ✅ drawn |

### Reports (PDF p.4) — **tailored per role** (see note below)
| Page | Role | Purpose | Key components (implied) | Status |
|---|---|---|---|---|
| Reports — Individual | individual | My checks only: verdict, score, re-open detail | `ReportList`, `ReportCard`, `VerdictFilter` | ✅ drawn |
| Reports — Org (Personal) | member | My checks + escalation/closure status | `ReportList`, `ReportCard`, `StatusChip` | ✅ drawn |
| Reports — Analyst | analyst | Org-wide triage queue: campaign-grouped, priority-sorted, pending-review filter | `TriageQueue`, `CampaignGroupRow`, `ReportCard`, `Filters` | ✅ drawn |
| Report detail modal | all | Full analysis overlay (threat vectors, both scores; analyst can author a verdict) | `ReportModal`, `ScoreGauge`, `VectorBars`, `VerdictForm` (analyst) | ✅ drawn |

### Analyst dashboard & Ask Orbo (PDF p.3)
| Page | Role | Purpose | Key components (implied) | Status |
|---|---|---|---|---|
| Analyst dashboard | analyst | Stat tiles, submission trend, verdict distribution, pending-review queue, recent activity | `StatTiles`, `Chart`, `PendingReviewList`, `ActivityFeed` | ✅ drawn |
| Ask Orbo (chat home) | analyst | Natural-language entry to the "ask-the-data" AI feature | `NlpQueryBar`, `OrboAvatar`, `PromptChips` | ✅ drawn |
| Ask Orbo → visualization | analyst | AI answer rendered as a chart (weekly report, heatmap, trends, score distribution, **campaigns**) | `NlpQueryBar`, `Chart`, `ResultTable` | ✅ drawn (6 variants) |

**Campaign view — reconciled.** Campaigns surface in **two** places, both wireframed: (1) as a **grouped view
in the analyst Reports triage queue** (`CampaignGroupRow` — 20 duplicate reports collapse into one row with a
count), and (2) as an **Ask Orbo chart** (`analyst-orbo-campaigns`). The earlier standalone "Campaign View"
detail *page* is **deferred** — the grouped queue row + `GET /api/campaigns/:id` behind the report modal cover
the MVP need without a separate page. (Decisions Log.)

**Reports page, tailored per role (design decision).** The three reports variants are intentionally different,
not one layout with columns toggled:
- **Individual** — the lightest view. Just *my* checks, each verdict, score, and a verdict filter. No teammate
  names, no analyst columns, no campaigns — a solo user has none of those, and showing them implies features
  they don't have.
- **Organization Member** — my checks **plus escalation/closure status** ("Pending review" → "Confirmed by
  analyst"), which is the payoff for story #7. Still personal; no org-wide analytics or campaign clustering.
- **Analyst** — a **triage queue**, not a flat list: campaign-grouped so a phishing wave is one row, sorted by
  priority (score × recency × report count), with a pending-review filter front and center. The flat filterable
  list is a secondary view. This is what makes the analyst's grouped information genuinely useful (story #9).

**Ask Orbo scope:** 6 visualization variants are wireframed to show the vision; **MVP ships 1–2** (weekly
report + one chart), the rest are fast-follow. (Decisions Log — avoids "boiling the ocean.")

**Auth screens are Clerk components (design decision).** Login, Register, org creation, and invites are Clerk's
prebuilt, themeable React components, not hand-built forms — so **social login (Google/Apple) is a core MVP
feature** (Clerk provides it out of the box) and **domain auto-join** (a company email auto-joins its org) works
in Clerk's dev mode for the demo. We style the components to match the wireframes. **Enterprise SSO/SAML** (the
20k-employee "Sign in with SSO" scenario, e.g. via WorkOS AuthKit's test-IdP sandbox) is a **stretch** feature,
easy to layer on later since auth is already provider-based. (Decisions Log.)

**≥3 wireframed screens (required):** comfortably exceeded — Login, Register, Home, Check Link (Checking →
Result → 3 verdict states → Invalid Input), Analyst Dashboard, Ask Orbo (6), Reports (3 role variants + modal),
and the team-setup flow are all drawn.

---

## 5. Data Model

| Table | Column | Type | Description |
|---|---|---|---|
| **organizations** | id | integer | primary key (one company/team) |
| | clerk_org_id | text | unique — mirrors the Clerk Organization (source of truth for org + membership) |
| | name | text | org display name (e.g. "Acme Inc.") |
| | created_at | timestamp | org creation |
| **users** | id | integer | primary key |
| | clerk_user_id | text | unique — mirrors the Clerk user (Clerk owns login, password, social) |
| | org_id | integer | FK → organizations.id, **nullable** — `NULL` = individual (no org) |
| | email | text | copied from Clerk (used to match forwarded emails) |
| | name | text | display name |
| | role | text | `individual` \| `member` \| `analyst` — drives view + access (`member` = Organization Member) |
| | created_at | timestamp | account creation |
| **submissions** | id | integer | primary key (one report event) |
| | user_id | integer | FK → users.id (who submitted) |
| | indicator_id | integer | FK → indicators.id (the judged thing) |
| | raw_url | text | URL exactly as submitted |
| | context_text | text | optional pasted email/message context |
| | source | text | `web` \| `email` — how it was submitted (email = forwarded to the Orbo inbox) |
| | escalated | boolean | true when auto-routed to an analyst for review (all org-member submissions) |
| | created_at | timestamp | submission time |
| **indicators** | id | integer | primary key (the judged thing) — **GLOBAL / shared threat intel, one row per unique URL** |
| | canonical_key | text | dedup key (host + path + semantic params), **unique globally** — the same URL is one indicator for everyone |
| | domain | text | destination domain |
| | status | text | `pending` \| `scanning` \| `done` \| `error` |
| | ai_score | integer | 0–100 AI danger score — shared by all who report this URL |
| | ai_verdict | text | Claude plain-English explanation (shared) |
| | ai_confidence | text | `low` \| `medium` \| `high` (nullable) |
| | screenshot_url | text | from urlscan.io (shared) |
| | urlscan_uuid | text | scan reference |
| | blacklist_hit | boolean | is the URL on a known-bad blacklist? (Google Safe Browsing) — shared signal |
| | blacklist_source | text | which list flagged it, e.g. `google_safe_browsing:SOCIAL_ENGINEERING` (nullable) |
| | domain_age_days | integer | signal (nullable) |
| | report_count | integer | total submissions across all orgs + individuals — powers "seen before, reported N times" |
| | created_at / updated_at | timestamp | first-seen / last re-scanned (enables TTL later) |
| **org_reviews** | id | integer | primary key — an org's private authoritative review of a (global) indicator |
| | org_id | integer | FK → organizations.id |
| | indicator_id | integer | FK → indicators.id — **UNIQUE (org_id, indicator_id)** |
| | human_score | integer | analyst's authoritative score (nullable) |
| | human_verdict | text | analyst's written verdict (nullable) |
| | review_status | text | `pending review` \| `investigating` \| `confirmed malicious` \| `confirmed safe` |
| | reviewed_by | integer | FK → users.id — which analyst (nullable) |
| | campaign_id | integer | FK → campaigns.id (nullable) — per-org clustering |
| | created_at / updated_at | timestamp | |
| **campaigns** | id | integer | primary key (cluster of indicators) |
| | org_id | integer | FK → organizations.id — campaigns are always org-scoped (analyst feature) |
| | name | text | e.g. "Okta credential kit" |
| | shared_signal | text | what links them (shared domain/pattern) |
| | first_seen / last_seen | timestamp | campaign window |
| **notifications** | id | integer | primary key (one alert to one user) |
| | user_id | integer | FK → users.id (who to notify) |
| | indicator_id | integer | FK → indicators.id (what it's about, nullable) |
| | type | text | e.g. `verdict_confirmed` (analyst closed something I reported) |
| | message | text | human-readable notification text |
| | is_read | boolean | has the user seen it |
| | created_at | timestamp | when raised |

**Relationships:** an organization has many users, org_reviews, and campaigns; a user has many submissions and
notifications; an **indicator (global) has many submissions** (this is the dedup — many reports across the whole
platform, one judged thing) and many org_reviews (one per org that has reviewed it); a campaign groups many
org_reviews. **Two layers, by design:** the **indicator** holds objective, shared threat intel (AI score,
verdict, screenshot) computed **once for everyone**; an **org_review** holds one org's private authoritative
call (`human_*`, `review_status`) on that shared indicator. **Two-phase verdict:** `ai_*` on the indicator is
set instantly and globally; the `human_*` + `review_status` on an org_review are set later by that org's
analyst — both kept for the record, and one org's review never touches another's.

**Identity & orgs are managed by Clerk (auth provider).** Clerk is the source of truth for login, passwords,
social login (Google/Apple), organizations, memberships, invites, and domain auto-join. We keep only **mirror**
rows in Postgres — `users.clerk_user_id` and `organizations.clerk_org_id` — kept in sync by a Clerk webhook
(see §6). This is why there is no `password_hash` and no local `invites` table anymore: we don't build auth or
invites ourselves. Our tables foreign-key to the mirrored `users`/`organizations` so submissions, org_reviews,
and campaigns still belong to a person and an org.

**Shared threat intel + per-org isolation (story #12 — hard requirement).** The split cleanly separates what is
safe to share from what must stay private:
- **Shared globally (indicators):** the objective facts about a URL — is it malicious, the AI reasoning, the
  screenshot, and the platform-wide `report_count`. This is threat intelligence, not private data, so it is
  scanned **once** and reused by everyone. This is what powers **"Orbo's seen this before — reported N times,
  it's a known scam"** across *all* orgs and individuals, and means a URL is never scanned twice.
- **Isolated per org (submissions, org_reviews, campaigns):** *who* reported a link (`submissions.org_id`), an
  analyst's authoritative verdict (`org_reviews`), and campaign clustering. Analyst-facing reads (`/history`,
  `/search`, `/campaigns`, `/nlp-query`) filter on `org_id = the analyst's org` and join org_reviews for that
  org only — so an analyst sees the shared AI intel on the URLs **their** org reported, but never another org's
  activity, verdicts, or campaigns. Individuals (`org_id = NULL` on their submissions) are scoped to their own
  `user_id` and have no analyst review layer.

Because `canonical_key` is **globally unique**, 20 members of one org reporting the same link collapse into a
single indicator (one investigation for their analyst) **and** benefit from any scan already done for anyone
else on the platform.

**Blacklist enrichment (Google Safe Browsing).** Alongside the urlscan sandbox, each new indicator is checked
against the free Google Safe Browsing API — a fast yes/no lookup for URLs the security community has already
confirmed as malware or phishing. The result is stored on the **global indicator** (`blacklist_hit`,
`blacklist_source`) because "this URL is a known-bad site" is objective, shareable threat intel, not org-private
data — so, like the AI verdict, it's computed once and reused for everyone. It's a strong, cheap signal fed into
the AI verdict (see §8).

**Auto-escalation to the analyst.** Anything an **org member** submits — whether pasted in the web chat or
forwarded to the Orbo inbox — is automatically routed to their org's analyst for review: the submission sets
`escalated = true`, and an `org_reviews` row is created (or reused) for that (org, indicator) with
`review_status = 'pending review'`. Members never have to manually "send to security"; the worry they felt is
enough. Individuals have no analyst and no org_review row, so their submissions are never escalated.
(Stories #6, #8.)

**Email forwarding is a backend-only pipeline (core interaction method — no dedicated UI screen).** We stand up
a dedicated Orbo inbox address (e.g. `check@orbis...`). An inbound-email service (Microsoft Azure) receives the
message and calls our webhook; the backend matches the sender to a user by `From` address (`users.email`),
extracts the URL/content, and writes a `submission` with `source = 'email'`. From there the flow is identical to
a web submission — scan, AI verdict, and (for org members) auto-escalation. Because it has no screen of its own,
**no wireframe is needed**; the results appear on the user's existing Reports page.

---

## 6. API Contracts

**Auth, orgs, and invites are handled by Clerk, not by our API.** Register/login/social-login, organization
creation, teammate invites, and domain auto-join are all served by Clerk's prebuilt React components + backend.
So the endpoints below are only the ones **we** build. Every protected route reads the caller's identity, role,
and `org_id` from the verified Clerk session token (no hand-rolled JWTs).

| CRUD | Verb | Endpoint | Description | Request shape | Response shape | Error cases | Stories |
|---|---|---|---|---|---|---|---|
| Create | POST | `/api/webhooks/clerk` | Clerk → us: sync user/org mirror rows on create/update/delete | Clerk event (`user.*`, `organization.*`, `organizationMembership.*`) | `200 OK` | 400 bad signature (verified via Clerk signing secret) | 1, 4, 12 |
| Create | POST | `/api/webhooks/inbound-email` | Azure email service → us: a message hit the Orbo inbox | `{ from, subject, body, links[] }` | `{ submissionId, indicatorId, status }` | 400 unparseable; 202 accepted-but-unknown-sender (ignored) | 4, 13 |
| Create | POST | `/api/submissions` | Submit a URL for analysis (web chat) | `{ url, contextText? }` | `{ submissionId, indicatorId, status }` | 400 invalid/empty URL (→ Invalid Input screen); 401 unauthenticated | 1, 2, 3, 4, 5, 13 |
| Read | GET | `/api/indicators/:id` | Get a verdict (polled until done); merges the global indicator with the caller's org_review if any | — | `{ status, ai_score, ai_verdict, screenshot_url, report_count, review?: { human_score, human_verdict, review_status }, ... }` | 401; 403 not in caller's scope; 404 not found | 1, 7, 12, 15 |
| Read | GET | `/api/history?mine=1` | My reported links (individual/member) | — | `{ reports: [...] }` | 401 unauthenticated | 7, 14 |
| Read | GET | `/api/history` | Org-wide history + stats (analyst) | — | `{ recent: [...], stats: {...} }` | 401; 403 non-analyst | 8, 12 |
| Read | GET | `/api/search?q=` | Keyword search within org (analyst) | — | `{ results: [...] }` | 401; 403 non-analyst | 11, 14 |
| Update | PATCH | `/api/indicators/:id/review` | Analyst records/overrides their org's verdict — upserts the `org_reviews` row for (caller's org, indicator); raises a notification | `{ human_score, human_verdict, review_status }` | `{ review }` | 401; 403 non-analyst or wrong org; 404 not found; 400 invalid score | 7, 10 |
| Read | GET | `/api/campaigns/:id` | Campaign detail: grouped indicators (analyst) | — | `{ campaign, indicators: [...], reportCount }` | 401; 403 non-analyst or wrong org; 404 not found | 9 |
| Read | GET | `/api/notifications` | My notifications (closure alerts) | — | `{ notifications: [...] }` | 401 unauthenticated | 7 |
| Create | POST | `/api/nlp-query` | English → validated filter → results + chart (analyst) ★AI | `{ question }` | `{ filter, results: [...], chartSpec }` | 401; 403 non-analyst; 422 unmappable question (→ "try rephrasing") | 11 |

**Role & org enforcement (story #12):** org-wide reads (`/history`, `/search`, `/nlp-query`, `/campaigns/*`)
and the review PATCH (`/api/indicators/:id/review`) require the **analyst** role *and* are filtered/upserted to the analyst's own `org_id`;
individuals/members are scoped to their own submissions (`?mine=1`). One server-side middleware verifies the
Clerk session and checks role + org on every protected route, reused everywhere — so no org can ever read
another org's data. (Role is stored in Clerk's user/org metadata and mirrored to `users.role`.)

**Note — endpoint count for the rubric:** even after handing auth/orgs/invites to Clerk, we still build 10
first-party endpoints across full CRUD, comfortably past the "5 Node endpoints" bar.

---

## 7. State Architecture (client-side)

| State variable | Type | Initial | Owner | Trigger |
|---|---|---|---|---|
| `user` (Clerk) | object \| null | `null` | Clerk `<ClerkProvider>` / `useUser()` | Clerk manages login/logout; we read `role` from its metadata |
| `organization` (Clerk) | object \| null | `null` | Clerk `useOrganization()` | Clerk manages the active org + membership |
| `submissionStatus` | string | `"idle"` | HomePage | submit start → poll → done |
| `currentVerdict` | object \| null | `null` | ResultPage | `GET /indicators/:id` resolves |
| `myReports` | array | `[]` | ReportsPage | fetch on load (individual/member) |
| `history` | array | `[]` | DashboardPage | fetch on load (analyst) |
| `searchQuery` | string | `""` | SearchBar | user input |
| `nlpQuestion` | string | `""` | AskOrboBar | user input |
| `nlpResult` | object \| null | `null` | AskOrboPage | `POST /nlp-query` resolves |
| `notifications` | array | `[]` | App (context) | fetch on load; new closure alerts (story #7) |
| `isLoading` | boolean | `false` | App | any API call start/end |

**Key decisions:** **auth/org state comes from Clerk's hooks** (`useUser`, `useOrganization`), not a hand-rolled
context — so there's no `authToken`/`currentUser`/`inviteDraft` for us to manage; we read `role` and `org_id`
off the Clerk user/org and pass them down. A submitted URL sets `submissionStatus` and the ResultPage **polls**
`GET /indicators/:id` until `status === "done"` (no queue system). `notifications` lives in our own top-level
context so the closure badge shows on any screen. State flows App → pages → components via props/context.

---

## 8. AI Feature Specification

Orbis has **two** AI features (rubric requires one).

### Feature A — Plain-English Danger Verdict (generation)
- **What it does for the user:** turns raw sandbox evidence into a human-readable "is this safe?" verdict + score anyone can act on.
- **Where it lives:** triggered server-side after a scan completes; shown on the **Check Link — Result** screen and the report detail modal.
- **Input:** distilled urlscan evidence (final domain, redirect chain, page resources, form/credential fields, domain age, cert info) + **the Google Safe Browsing blacklist result** (`blacklist_hit`/`blacklist_source`) + optional user-pasted context.
- **Output:** structured JSON — `{ score: 0–100, verdict_text, confidence, evidence_summary }` (via structured outputs, so it's always valid JSON).
- **Validation:** score within 0–100; verdict_text non-empty and references at least one concrete signal; a deterministic floor forces a high score on hard signals (e.g. **a Google Safe Browsing blacklist hit**, or a credential form on a <7-day-old domain) regardless of model output — a confirmed known-bad URL can never be reported as "safe."
- **Endpoint:** produced during the `/api/submissions` → scan → **blacklist check** → score flow; read via `GET /api/indicators/:id`.
- **Fallback:** if the Claude call fails, show the raw evidence + a "verdict unavailable, review manually" state (score `null`, status `error`) — never a false "safe."

### Feature B — Ask-the-Data Dashboarding (conversation → visualization)
- **What it does for the user:** an analyst asks a question in plain English and gets a chart — no SQL.
- **Where it lives:** the **Ask Orbo** query bar (reachable from the analyst Dashboard). Wireframes show 6 chart variants; MVP ships 1–2.
- **Input:** the analyst's natural-language question + the allowed field/filter schema.
- **Output:** a **validated, whitelisted filter object** (not raw SQL) + a `chartSpec` describing what to render.
- **Validation:** the filter must match the allowlist (fields, operators, date ranges); anything off-list is rejected and the query is not run. Backend runs a parameterized query from the validated filter.
- **Endpoint:** `POST /api/nlp-query`.
- **Fallback:** if Claude returns an invalid/unmappable filter, show "couldn't understand that — try rephrasing" and offer the keyword search instead.

#### AI Feature Decisions Log
| Decision | Sprint | What changed | Why |
|---|---|---|---|
| _(seed)_ NLP emits a whitelisted filter object, not SQL | Sprint 0 (plan) | Architecture | Eliminates AI-driven SQL-injection risk; safer + simpler to validate |
| _(seed)_ Verdict uses structured outputs | Sprint 0 (plan) | Output format | Guarantees valid JSON, no hand-rolled parsing |
| _(seed)_ Feed Google Safe Browsing blacklist result into the verdict + as a deterministic high-score floor | Sprint 0 (plan) | Prompt input + validation | A confirmed known-bad URL is a decisive signal; the floor guarantees Orbo never calls a blacklisted URL "safe" |

---

## 9. Wireframes

**Status: done** (Figma, exported to PDF). At least 3 required — we have far more. Full inventory with
per-screen component hierarchy is in **§4 above**. File:
[`wireframes/Figma Wireframes PDF.pdf`](./wireframes/Figma%20Wireframes%20PDF.pdf).

Coverage by flow (all drawn):
- **Onboarding/auth** (p.1): landing, login, register, team setup (2 steps), accept-invite.
- **Core check-a-link** (p.2): home (individual + org), checking, result, Safe/Suspicious/Dangerous verdict states, invalid input.
- **Analyst dashboard & Ask Orbo** (p.3): dashboard, Ask Orbo chat, and 6 chart variants (weekly report, heatmap, trends, distribution, campaigns).
- **Reports** (p.4): three role-tailored variants (individual, org/personal, analyst) + report detail modal.

**No wireframe gap:** the **email-forwarding** path is a backend-only pipeline (Orbo inbox → Azure → DB) with no
screen of its own — its results appear on the existing Reports page, so nothing new to sketch. (See §5/§6.)

**Cognitive walkthrough:** run one quick outsider walkthrough of the core check-a-link flow before Sprint 1 (see `week6_board.md`, Issue #13).

---

## 10. Decisions Log

| Decision | Context | Alternatives considered | Tradeoffs |
|---|---|---|---|
| Pivot from browser-extension/Slack-bot to a web dashboard | Mentors (Jun 24) flagged extension adoption + a chatbot doesn't fit the rubric (pages, login, responsive) | Native app; keep extension as primary | Lost the always-on overlay; gained rubric fit, taught stack, and mentor-endorsed audience |
| Node/Express/React/PostgreSQL/Render stack | It's the taught stack; mentors/TAs can support it; satisfies "5 Node endpoints" | Python/FastAPI/Celery/Redis | Slightly less "impressive" infra; far easier to build/deploy/support in the timeline |
| DB job-status + polling instead of a queue | Simpler to deploy on Render; 3-person team | Celery/Redis queue | Slight polling overhead; avoids heavy infra we can't maintain |
| Two-phase verdict (AI now, human later) | Analysts don't trust black-box auto-verdicts; makes the app two-sided | AI-only auto-verdict | More work (analyst role + authoring flow); big trust + rubric payoff |
| NLP → validated whitelisted filter, not raw SQL | Security: raw model SQL is an injection risk | Model emits SQL directly | A bit more backend validation; removes the injection path |
| Browser extension demoted to optional fast-follow stretch | Honors mentor adoption point; web app is the universal surface | Build extension in MVP | No extension at MVP; keeps the spine safe, still on the roadmap |
| Product renamed PIPbot → **Orbis** (in-app assistant = **Orbo**); team stays **DOMinion** | Wireframes were built as "Orbis/Orbo"; docs still said "PIPbot" — mismatch would confuse mentors | Keep "PIPbot"; rename team too | One-time doc churn; docs and designs now match |
| Added an **organizations** model (+ `org_id`, org-scoping middleware) | Team-setup wireframes and story #12 (org data isolation) both assume orgs, but the data model had none | Keep `role` as a lone text column | More schema + an org-scoping middleware; makes the isolation requirement real instead of implied |
| ~~MVP auth = email + password; social/SSO → stretch~~ **(superseded below)** | — | — | Replaced by the Clerk decision once we realized we don't have to build auth ourselves |
| **Use Clerk (managed auth provider) for auth, orgs, invites, domain auto-join** — so **social login (Google/Apple) is core**, and enterprise SSO/SAML (e.g. WorkOS) is the stretch | Building auth + orgs + invites by hand is a large lift; Clerk ships all of it with a free tier and drop-in React components, and covers the org/domain-auto-join flow we wireframed | Hand-rolled email+password (prior plan); build OAuth ourselves; WorkOS AuthKit as primary | We depend on a third-party service + store mirror rows synced by webhook; in exchange we get social login *and* orgs as core for near-zero auth code, and SSO becomes an easy stretch |
| **Email forwarding is a backend-only pipeline** (dedicated Orbo inbox → Microsoft Azure inbound-email → webhook → DB → auto-review) | Committed to at the Jul 1 pod sync; central to the "no friction" value. It has no screen of its own | Move it to stretch; build a UI for it | No wireframe needed (no UI); results show on the existing Reports page; adds an inbound-email webhook + sender matching |
| **Auto-escalate every org-member submission to their analyst** (web chat *or* Orbo email) | Members worry about scams but "report to security" is friction; the act of submitting *is* the report | Require an explicit "send to team" click | Analysts see more items (fine — they triage by priority); members get closure with zero extra steps (stories #6, #7) |
| **Reports page tailored per role** (individual = minimal; member = personal + closure status; analyst = grouped triage queue) | One shared layout under- and over-served different roles | One unified reports table for all | 3 view variants to build; each role sees exactly what's useful (stories #7, #9, #12) |
| **Campaign view = grouped queue row + Ask Orbo chart**; standalone campaign *page* deferred | Wireframes surface campaigns in the triage queue and in chat, not a dedicated page | Build a separate campaign detail page for MVP | Slightly less depth per campaign; matches mentors' build order (clustering last) |
| **Ask Orbo ships 1–2 chart variants at MVP** (6 are wireframed) | Six visualizations is the full vision, not the MVP; mentors warned against "boiling the ocean" | Build all 6 | Some charts are fast-follow; keeps Sprint-2 MVP achievable |
| **Responsive everywhere; deploy on free tiers; seed stand-in data** | Personas are phone-first; the app must be live and populated for the demo | Desktop-only MVP; skip deploy until later; empty dashboard | One responsive build (no separate mobile app); a bit of deploy + seed-script work up front; demo looks real and works on a phone |
| **Add Google Safe Browsing as a free blacklist signal** (urlscan = sandbox/screenshot/evidence; Safe Browsing = known-bad blacklist; Claude = final verdict) | urlscan's free tier gives evidence + screenshot but its reputation/verdict data is largely Pro-gated; we still want a real "known-bad" check | urlscan-only (no blacklist); VirusTotal (4 req/min, no commercial use); PhishTank (phishing-only) | One extra free API call per new URL; big accuracy + demo payoff. **Caveat:** Safe Browsing is *non-commercial use only* — a real product would switch to Google Web Risk. Stored on the global indicator, so checked once and shared. |

---

## 11. Open Questions & Risks (beyond the rubric — for the pod sync)

Things the assignment doesn't grade but that shape Sprints 1–4. Most were resolved with the team; the rest are
flagged **OPEN** for the pod sync.

| # | Item | Status | Decision / current lean |
|---|---|---|---|
| 1 | **urlscan.io reliability** — scans are asynchronous and can be slow or fail | **Resolved (scope):** we're not serving enterprises, so rate limits/quotas aren't a real concern; free tier + stand-in data is enough. | Poll with a timeout → `status: error` + "review manually" (never a false "safe"); cache by `canonical_key`. |
| 2 | **Auth / orgs / invites** — how do users sign in, join an org, get invited? | **Resolved:** Clerk provides all of it (incl. social login core, domain auto-join); SSO/SAML is stretch. | See §5/§6 and Decisions Log. |
| 3 | **Escalation & notifications** (stories #6, #7) | **Resolved:** org-member submissions auto-escalate to the analyst; closure delivered via **in-app** notifications. | Email/SMS notifications remain a stretch feature. |
| 4 | **Email forwarding** — how does it work with no UI? | **Resolved:** backend pipeline — Orbo inbox → Azure inbound-email → webhook → DB → auto-review. | No wireframe needed; see §5/§6. |
| 5 | **Seed/demo data** — dashboard shows thousands of checks, trends, campaigns | **Resolved:** we'll write a seed script of realistic stand-in threats + campaigns before the Sprint-2 demo. | Needed because we won't have real usage. |
| 6 | **Mobile/responsive** — personas are phone-first, wireframes are desktop | **Resolved:** one responsive build across all screens; **no separate mobile MVP**. | Apply responsive layout as we build each screen, not as a retrofit. |
| 7 | **Deployment** — frontend + backend + Postgres | **Resolved:** we will deploy, all on free hosting tiers. | Stand up a "hello world" deploy of both early in Sprint 1 before feature work (CORS, env vars, DB host). |
| 8 | **Campaign clustering definition** — what makes two submissions "the same campaign"? | **OPEN** (for the pod sync) | Lean: a canonicalized key that strips per-victim tracking tokens (host + path + semantic params); refine once we see real/seed data. |
| 9 | **Clerk ↔ Postgres sync edge cases** — webhook lag or a missed event could leave a submission with no mirrored user/org row | **OPEN** (raise with mentors) | Lean: create-or-fetch the mirror row lazily on first authenticated request as a backstop to the webhook. |

---

***Reminder: set up GitHub Issues, Milestones, and a Project Board — see `week6_board.md`. The board is a
submission requirement and must be created on GitHub (not Trello) — this still needs a human before Fri 9 PM PDT.***
