# Project Plan - Orbis

**Team Name:** DOMinion  
**Project Name:** Orbis  
**Pod Members:** Michael Jissa, Ozias Tumimana, David Gonzalez-Cesar  
**Progress Tracker:** [Trello board - Assigned Roles](https://trello.com/b/D7qoe5Tv/assigned-roles)

> Master spec / source of truth. Before code is written, the relevant section here is updated first.

> **Sprint 4 status (final reconciliation pass).** This is the canonical, as-built version of the spec:
> every section below has been walked against the shipped code and updated to describe what Orbis
> *actually does*, not what we planned in Week 6. The app is deployed on Render (client + API) against a
> Neon Postgres database, with 751 automated tests passing (617 server, 134 client). The largest changes
> from the original plan — the score is computed by our own code and the AI only writes the words; the
> inbound-email path is a Gmail Apps Script relay, not SendGrid; the analyst "ask the data" feature writes
> guarded SQL against a read-only view instead of a whitelisted filter object; and a browser extension,
> a Vision screenshot reader, and an MCP bridge all shipped — are called out in **§13 (Sprint 4 Spec
> Reconciliation)** and folded into the Decisions Logs (§8, §10). Where a word like "danger score" or
> "structured outputs" survived from an earlier draft, it has been corrected to match the code.

---

## 1. Problem Statement and Solution Description

**Problem.** Phishing is the most common entry point for organizational breaches. When someone gets a
suspicious link, the safe move is to report it and wait for an analyst, but analysts are buried in reports,
and triaging each by hand (confirming a URL is malicious, understanding what it does, spotting whether it's
part of a larger campaign) is slow, repetitive, and needs specialized expertise. Meanwhile the person who
reported it gets no quick answer. The people most targeted,
students, individuals, and small companies without a security team, have the least help.

**Solution.** Orbis takes the slow, manual work out of phishing triage. A user submits a suspicious URL (in
the web app, by forwarding an email to Orbo's inbox, or right from Gmail through the browser extension);
Orbis detonates it in a secure sandbox (urlscan.io), gathers evidence about what the page does, and returns
a plain-English verdict with a **0-100 safety score** (100 = safe, 0 = dangerous) and a screenshot, without
anyone opening the link on their own machine. The score itself is computed by our own deterministic rubric
from the gathered signals — the AI only writes the human-readable explanation and can never move a
known-bad link into "safe." One product serves three roles: **individuals** and **organization members** get
a lightweight "is this safe?" page and their own report history; **analysts** get a full triage dashboard
(org-wide history, keyword search, campaign clustering, and natural-language querying of the threat
database). Each organization sees only its own data.

**Target audience:** SOC/IT security analysts who triage suspicious URLs, and the everyday organization members
(and solo individuals) who encounter those links.

---

## 2. User Roles and Personas

### Roles
- **Individual** - a person vetting suspicious links for themselves, with no organization or security team to fall back on.
- **Organization Member** - a person who receives suspicious links/emails at work and wants to know if they're safe before acting, where a bad click can put the wider organization at risk.
- **Security Analyst** - a member of a security/IT team (often the only one at a small company) who investigates reported threats, issues authoritative verdicts, and monitors the org's threat landscape.

> Role rename (pod sync, Jul 1): "Employee" → **Organization Member**. See Decisions Log & `user_stories.md`.

### Personas
**Individual - Sofia (targeted college student).** 20, Phoenix AZ, phone-first. Inbox full of scholarship/
internship/financial-aid messages, many fake. No campus IT to ask in real time. Wants a fast gut-check she
can trust; pain point: a real offer and a scam look identical and she has no one to ask.

**Individual - Robert (on-his-own retiree).** 63, Tampa FL, shops and banks online. Gets constant "package
couldn't be delivered" / "account locked" links; browses unfamiliar stores. Not confident with tech, no IT
person, afraid of losing retirement savings. Wants a trustworthy second opinion; pain point: can't tell a real
site from a convincing fake, and "just don't click" isn't practical.

**Organization Member - Maria (cautious, has a security team).** 52, HR coordinator, Cleveland OH. Lives in her
inbox (résumés, invoices from strangers). Careful but not techy. Wants peace of mind and an expert backstop; pain
point: when she reports to IT she never hears back, so she never learns if she did the right thing.

**Organization Member - Deshawn (fast, no security team).** 29, sales rep at a 30-person Austin startup with no
security team. On the road, phone-first, dozens of links a day, clicks fast. Comfortable with tech, impatient. Wants
speed with a safety net; pain point: "report to security" isn't even an option where he works.

**Security Analyst - Priya (startup's first security hire).** 34, the *only* security person at a 50-person
Toronto startup. No enterprise tooling - just her, a laptop, a shared inbox. Wants leverage to handle the whole
company's reports alone; pain point: a phishing wave means the same link reported 20× and no automation to group it.

**Security Analyst - Tom (accidental security lead).** 41, IT generalist at a 60-person Denver nonprofit who
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
| Login | both | Email + password **and** social login (Google/Apple) - Clerk `<SignIn>` | Clerk `<SignIn />` (styled) | ✅ drawn |
| Register | both | Create account (email/password or social) - Clerk `<SignUp>` | Clerk `<SignUp />` (styled) | ✅ drawn |
| Team setup - step 1 | member/analyst | Create an organization - Clerk org creation | Clerk `<CreateOrganization />` | ✅ drawn |
| Team setup - step 2 | member/analyst | Invite teammates / domain auto-join - Clerk | Clerk `<OrganizationProfile />` (invites) | ✅ drawn |
| Accept invite / join org | member/analyst | What an invited person sees - Clerk invite flow | Clerk invite/join UI | ✅ drawn |

### Core "check a link" flow (PDF p.2)
| Page | Role | Purpose | Key components (implied) | Status |
|---|---|---|---|---|
| Home - Individual | individual | Greeting + paste-a-link entry + quick prompts | `SubmitForm`, `OrboAvatar`, `RecentList` | ✅ drawn |
| Home - Org | member | Same, scoped to the org ("Hi David · Acme") | `SubmitForm`, `OrboAvatar`, `RecentList` | ✅ drawn |
| Check Link - Checking | both | Loading/analyzing state while sandbox runs | `StatusBadge`, `LoadingState` | ✅ drawn |
| Check Link - Result | both | Verdict: score, screenshot, plain-English explanation, evidence | `ScoreGauge`, `Screenshot`, `EvidenceList`, `VerdictCard` | ✅ drawn |
| Verdict states - Safe / Suspicious / Dangerous | both | Same card, three data-driven color/score states | `VerdictCard` (one component) | ✅ drawn |
| Check Link - Invalid Input | both | Error state when input isn't a valid URL/email | `SubmitForm` (error) | ✅ drawn |

### Reports (PDF p.4) - **tailored per role** (see note below)
| Page | Role | Purpose | Key components (implied) | Status |
|---|---|---|---|---|
| Reports - Individual | individual | My checks only: verdict, score, re-open detail | `ReportList`, `ReportCard`, `VerdictFilter` | ✅ drawn |
| Reports - Org (Personal) | member | My checks + escalation/closure status | `ReportList`, `ReportCard`, `StatusChip` | ✅ drawn |
| Reports - Analyst | analyst | Org-wide triage queue: campaign-grouped, priority-sorted, pending-review filter | `TriageQueue`, `CampaignGroupRow`, `ReportCard`, `Filters` | ✅ drawn |
| Report detail modal | all | Full analysis overlay (threat vectors, both scores; analyst can author a verdict) | `ReportModal`, `ScoreGauge`, `VectorBars`, `VerdictForm` (analyst) | ✅ drawn |

### Analyst dashboard & Ask Orbo (PDF p.3)
| Page | Role | Purpose | Key components (implied) | Status |
|---|---|---|---|---|
| Analyst dashboard | analyst | Stat tiles, submission trend, verdict distribution, pending-review queue, recent activity | `StatTiles`, `Chart`, `PendingReviewList`, `ActivityFeed` | ✅ drawn |
| Ask Orbo (chat home) | analyst | Natural-language entry to the "ask-the-data" AI feature | `NlpQueryBar`, `OrboAvatar`, `PromptChips` | ✅ drawn |
| Ask Orbo → visualization | analyst | AI answer rendered as a chart (weekly report, heatmap, trends, score distribution, **campaigns**) | `NlpQueryBar`, `Chart`, `ResultTable` | ✅ drawn (6 variants) |

**Campaign view - reconciled.** Campaigns surface in **two** wireframed places: (1) as a **grouped view
in the analyst Reports triage queue** (`CampaignGroupRow` - 20 duplicate reports collapse into one row with a
count), and (2) as an **Ask Orbo chart** (`analyst-orbo-campaigns`). The standalone "Campaign View" detail
*page* was originally **deferred**, then **un-deferred in Sprint 2** and built: `CampaignDetail` at
`/reports/campaigns/:campaignId`, reached by clicking a campaign's **name** in the triage queue (the chevron
still expands the group in place). It has **no wireframe of its own** - it reuses the analyst Reports card
layout (`ReportCard` + the report modal) so nothing new was designed. (Decisions Log.)

**Reports page, tailored per role (design decision).** The three reports variants are intentionally different,
not one layout with columns toggled:
- **Individual** - the lightest view. Just *my* checks, each verdict, score, and a verdict filter. No teammate
  names, no analyst columns, no campaigns - a solo user has none of those, and showing them implies features
  they don't have.
- **Organization Member** - my checks (**My History**) **plus escalation/closure status** ("Pending review" →
  "Confirmed by analyst"), the payoff for story #7. **Plus a read-only "Team History" tab** showing only the
  items an analyst has reviewed **and explicitly shared** with the org (`org_reviews.shared_with_org = true`).
  This is a curated, vetted feed — **not** the analyst's full org-wide analytics or campaign clustering. The
  explicit share step is a privacy gate (an analyst can withhold anything containing personal info); items
  default to unshared. See the "Team History share gate" note under §5.
- **Analyst** - a **triage queue**, not a flat list: campaign-grouped so a phishing wave is one row, sorted by
  priority (score × recency × report count), with a pending-review filter front and center. The flat filterable
  list is a secondary view. This is what makes the analyst's grouped information genuinely useful (story #9).

**Ask Orbo scope (as built):** 6 visualization variants were wireframed. We ended up building the client
renderers for **all six** (weekly report, heatmap, trend, campaign table, score histogram, bucket count) plus
generic count/bar/line/pie fallbacks — so the chart *components* over-delivered on the "ship 1-2" plan. In
practice the shipped ask-the-data engine (see §8 Feature B) reliably drives the count / bar / bucket-count /
table shapes; the richer heatmap/trend/histogram/weekly-report components render when a matching chart spec
is produced but are effectively dormant on the everyday query path. The dashboard's own charts (trend,
verdict distribution, etc.) are always populated from the analyst stats endpoint. (Decisions Log.)

**Auth screens are a custom Clerk flow (as built).** We did *not* drop in Clerk's prebuilt `<SignIn/>` /
`<SignUp/>` components. Instead every auth screen (`SignIn`, `CreateAccount`, `CreateTeam`,
`ChooseAccountType`) is hand-built on Clerk's **headless hooks** (`useSignIn`, `useSignUp`, `useClerk`,
`useOrganizationList`) so the pages match our wireframes exactly; the only Clerk-rendered piece is the OAuth
return handler (`<AuthenticateWithRedirectCallback>` on `/sso-callback`). **Social login (Google/Apple) is a
core feature** — the buttons call Clerk's `authenticateWithRedirect`. The user picks **personal / org /
analyst** on a `/get-started` screen (carried as a `?type=` hint); the *real* variant is decided after auth
by which Clerk organization is active. A known cost of the custom flow was a redirect race (a freshly
-signed-in user briefly bounced to the landing page); we fixed it by driving redirects off Clerk's settled
`isSignedIn`/`isLoaded` state rather than an imperative `navigate()`. **Enterprise SSO/SAML** (the "Sign in
with SSO" button) is present in the UI but **not configured** — it's a stretch item and is disabled in the
demo. (Decisions Log.)

**≥3 wireframed screens (required):** comfortably exceeded - Login, Register, Home, Check Link (Checking →
Result → 3 verdict states → Invalid Input), Analyst Dashboard, Ask Orbo (6), Reports (3 role variants + modal),
and the team-setup flow are all drawn.

---

## 5. Data Model

| Table | Column | Type | Description |
|---|---|---|---|
| **organizations** | id | integer | primary key (one company/team) |
| | clerk_org_id | text | unique - mirrors the Clerk Organization (source of truth for org + membership) |
| | name | text | org display name (e.g. "Acme Inc.") |
| | created_at | timestamp | org creation |
| **users** | id | integer | primary key |
| | clerk_user_id | text | unique - mirrors the Clerk user (Clerk owns login, password, social) |
| | org_id | integer | FK → organizations.id, **nullable** - `NULL` = individual (no org) |
| | email | text | copied from Clerk (used to match forwarded emails) |
| | name | text | display name |
| | role | text | `individual` \| `member` \| `analyst` - drives view + access (`member` = Organization Member). **As built:** analyst is granted only by an explicit `orbisRole: "analyst"` flag in Clerk metadata; an org admin is *not* auto-promoted to analyst (see §13). |
| | email_reports | boolean | opt-out for the emailed report we send after a forwarded-email check finishes (default `true` = opted in). **Added Sprint 3.** |
| | api_key_hash | text | SHA-256 hash of the user's browser-extension API key (never the raw key); unique; `null` = no key issued. Rotating overwrites it (instant per-user revocation). **Added Sprint 3.** |
| | created_at | timestamp | account creation |
| **submissions** | id | integer | primary key (one report event) |
| | user_id | integer | FK → users.id (who submitted) |
| | indicator_id | integer | FK → indicators.id (the judged thing) |
| | raw_url | text | URL exactly as submitted |
| | context_text | text | optional pasted email/message context |
| | org_id | integer | FK → organizations.id, nullable - `NULL` = reported as an individual. **Added:** copied onto the submission so a report's org is fixed at submit time. |
| | source | text | `web` \| `email` - how it was submitted (email = forwarded to the Orbo inbox) |
| | escalated | boolean | true when auto-routed to an analyst for review (all org-member submissions) |
| | archived_at | timestamp | soft-archive: when set, hidden from *this user's* default Reports view but not deleted (reversible); other users + the global indicator are untouched. `null` = active. **Added Sprint 3.** |
| | email_thread_id | text | Gmail thread id of the forwarded email (`source = 'email'` only); lets the report email reply *into* the user's original forward thread instead of arriving standalone. **Added Sprint 3.** |
| | created_at | timestamp | submission time |
| **indicators** | id | integer | primary key (the judged thing) - **GLOBAL / shared threat intel, one row per unique URL** |
| | canonical_key | text | dedup key (host + path + semantic params), **unique globally** - the same URL is one indicator for everyone |
| | domain | text | destination domain |
| | status | text | `pending` \| `scanning` \| `done` \| `error` |
| | ai_score | integer | **0-100 SAFETY score (100 = safe, 0 = dangerous)** - computed by our deterministic rubric (§8), not invented by the model; shared by all who report this URL. *(Corrected Sprint 4: earlier drafts called this a "danger score" — the whole system treats it as a safety score.)* |
| | ai_verdict | text | Claude plain-English explanation (shared); rule-based fallback text if the model call fails |
| | ai_confidence | text | `low` \| `medium` \| `high` (nullable) - derived from how many independent danger signals fired, not the model's self-report |
| | ai_title | text | short headline for the Reports card, e.g. "Fake PayPal login" (nullable). **Added.** |
| | ai_description | text | one-sentence summary under the title (nullable). **Added.** |
| | ai_tags | json | category chips, e.g. `["Credential phishing","Impersonation"]`, forced to agree with the score bucket (nullable). **Added.** |
| | ai_reasons | json | the "why" rows: `[{ text, severity: safe\|review\|dangerous, weight? }]`, always ≥3; for emails also carries a tagged per-leg breakdown row. **Added** (this is the shipped shape of the Week-6 `evidence_summary`). |
| | screenshot_url | text | from urlscan.io (shared) |
| | urlscan_uuid | text | scan reference |
| | final_url | text | where the link *actually* landed after redirects (urlscan `page.url`) (nullable). **Added.** |
| | final_host | text | just the landing host, e.g. `amazon.com` - powers the "goes to X" cue and the reputation check on the true destination (nullable). **Added.** |
| | redirected_to_different_host | boolean | did the link leave the domain it started on? (default false). **Added.** |
| | blacklist_hit | boolean | is the URL on a known-bad blacklist? (Google Safe Browsing) - shared signal |
| | blacklist_source | text | which list flagged it, e.g. `google_safe_browsing:SOCIAL_ENGINEERING` (nullable) |
| | domain_age_days | integer | signal (nullable) |
| | report_count | integer | total submissions across all orgs + individuals - powers "seen before, reported N times" |
| | global_review_status | text | for the VerdictCard "Report it" flow: `null` \| `pending review` \| `confirmed safe` \| `confirmed dangerous`. **Added Sprint 3.** |
| | reported_count | integer | how many users flagged this indicator via "Report it" (default 0). **Added Sprint 3.** |
| | trust_votes | integer | **parked / unused** - a community "Mark safe" vote that was built then pulled before the demo (a global count could reassure a victim next to a red verdict); column kept empty rather than run a destructive migration on the shared DB. See §13. |
| | created_at / updated_at | timestamp | first-seen / last re-scanned (enables TTL later) |
| **org_reviews** | id | integer | primary key - an org's private authoritative review of a (global) indicator |
| | org_id | integer | FK → organizations.id |
| | indicator_id | integer | FK → indicators.id - **UNIQUE (org_id, indicator_id)** |
| | human_score | integer | analyst's authoritative score (nullable) |
| | human_verdict | text | analyst's written verdict (nullable) |
| | review_status | text | `pending review` \| `investigating` \| `confirmed malicious` \| `confirmed safe` |
| | shared_with_org | boolean | **Team History gate** - has an analyst explicitly shared this review with the whole org? Defaults `false` |
| | reviewed_by | integer | FK → users.id - which analyst (nullable) |
| | campaign_id | integer | FK → campaigns.id (nullable) - per-org clustering |
| | created_at / updated_at | timestamp | |
| **campaigns** | id | integer | primary key (cluster of indicators) |
| | org_id | integer | FK → organizations.id - campaigns are always org-scoped (analyst feature) |
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
| **report_reasons** | id | integer | primary key - **Added Sprint 3.** One user's "Report it" on an indicator with their free-text *why* (≤200 words, capped server-side) |
| | indicator_id | integer | FK → indicators.id |
| | user_id | integer | FK → users.id (nullable for dev-stub / anonymous) |
| | reason | text | the user's explanation of why they're reporting |
| | created_at | timestamp | when reported |
| **user_trusts** | id | integer | primary key - **parked / unused** (empty table). The "Mark safe" community vote this backed was pulled before the demo (see `indicators.trust_votes`); left in place rather than dropped by a destructive migration on the shared DB |
| | indicator_id / user_id | integer | FKs; **UNIQUE (indicator_id, user_id)** - one vote per person per indicator (the constraint to keep if the feature is ever revived, analyst-only) |
| | created_at | timestamp | |

**Relationships:** an organization has many users, org_reviews, and campaigns; a user has many submissions,
notifications, and report_reasons; an **indicator (global) has many submissions** (this is the dedup - many
reports across the whole platform, one judged thing), many org_reviews (one per org that has reviewed it), and
many report_reasons; a campaign groups many org_reviews. **Two layers, by design:** the **indicator** holds objective, shared threat intel (AI score,
verdict, screenshot) computed **once for everyone**; an **org_review** holds one org's private authoritative
call (`human_*`, `review_status`) on that shared indicator. **Two-phase verdict:** `ai_*` on the indicator is
set instantly and globally; the `human_*` + `review_status` on an org_review are set later by that org's
analyst - both kept for the record, and one org's review never touches another's.

**Identity & orgs are managed by Clerk (auth provider).** Clerk is the source of truth for login, passwords,
social login (Google/Apple), organizations, memberships, invites, and domain auto-join. We keep only **mirror**
rows in Postgres - `users.clerk_user_id` and `organizations.clerk_org_id` - kept in sync by a Clerk webhook
(see §6). This is why there is no `password_hash` and no local `invites` table anymore: we don't build auth or
invites ourselves. Our tables foreign-key to the mirrored `users`/`organizations` so submissions, org_reviews,
and campaigns still belong to a person and an org.

**Shared threat intel + per-org isolation (story #12 - hard requirement).** The split cleanly separates what is
safe to share from what must stay private:
- **Shared globally (indicators):** the objective facts about a URL - is it malicious, the AI reasoning, the
  screenshot, and the platform-wide `report_count`. This is threat intelligence, not private data, so it is
  scanned **once** and reused by everyone. This is what powers **"Orbo's seen this before - reported N times,
  it's a known scam"** across *all* orgs and individuals, and means a URL is never scanned twice.
- **Isolated per org (submissions, org_reviews, campaigns):** *who* reported a link (`submissions.org_id`), an
  analyst's authoritative verdict (`org_reviews`), and campaign clustering. Analyst-facing reads (`/history`,
  `/search`, `/campaigns`, `/nlp-query`) filter on `org_id = the analyst's org` and join org_reviews for that
  org only - so an analyst sees the shared AI intel on the URLs **their** org reported, but never another org's
  activity, verdicts, or campaigns. Individuals (`org_id = NULL` on their submissions) are scoped to their own
  `user_id` and have no analyst review layer.

Because `canonical_key` is **globally unique**, 20 members of one org reporting the same link collapse into a
single indicator (one investigation for their analyst) **and** benefit from any scan already done for anyone
else on the platform.

**Team History share gate (`org_reviews.shared_with_org`) - a privacy catch.** Org members get a read-only
"Team History" that shows what their org has been running into - but **only** the reviews an analyst has
explicitly shared (`shared_with_org = true`). This is deliberate, not incidental: a member's submission can
carry personal information (the message it came from, an internal link, a name), so an analyst reviewing it
must **opt in** before it becomes visible to the whole team. The design follows two standard principles:
**human-in-the-loop** (a human affirmatively authorizes wider release, which catches sensitive/PII context a
rule can't) and **data minimization / need-to-know** (default to the narrowest audience; broaden only on an
explicit decision). Mechanics: the flag defaults `false`; only the analyst review action (`PATCH
/api/indicators/:id/review`) sets it `true`; `GET /api/history?org=1` returns only shared items; a member's own
submissions always stay in their **My History** regardless of the flag. Auditability is covered by the existing
`reviewed_by` + `updated_at` columns.

**How `canonical_key` is computed (the dedup rule - agreed approach).** Phishers add per-victim tracking junk
to URLs so every target gets a "unique" link (`.../verify?id=david&ref=email123` vs `.../verify?id=maria&ref=email456`),
but it's the **same attack**. We normalize a submitted URL into a stable key so those collapse into one
indicator, while genuinely different pages stay separate. The recipe (`POST /api/submissions`, before the
indicator lookup):
1. **Lowercase** scheme + host; treat `http`/`https` as the same and strip a leading `www.`.
2. **Drop the fragment** (`#…` - never changes the server response).
3. **Remove tracking/marketing query params** by name (denylist): `utm_*`, `ref`, `fbclid`, `gclid`, `id`,
   `email`, `token`, `recipient`, `_hsenc`, `mc_eid`, etc. - adjustable as new ones appear.
4. **Keep** any remaining (meaningful) query params and **sort them alphabetically** so param order can't create
   false uniques.
5. **Normalize the path** (strip a trailing slash).
6. The result (e.g. `paypa1-secure.com/verify`) is the `canonical_key`. Both example URLs above collapse to it.

We also store the untouched `submissions.raw_url` for the record. **Known limitations (accepted for MVP):** the
denylist is heuristic and will be tuned over time; and URL **shorteners** (`bit.ly/xR3` → different codes, same
destination) won't dedup on the submitted link - the refinement is to canonicalize on the **final resolved URL**
after urlscan.io follows redirects (roadmap, not MVP).

**Blacklist enrichment (Google Safe Browsing).** The `canonical_key` dedup answers "have *we* seen this before?";
the blacklist answers the complementary question "has the wider security community *already* confirmed this as
bad?" On each **new** indicator (i.e. one dedup didn't already resolve), alongside the urlscan sandbox we do a
fast yes/no lookup against the free Google Safe Browsing API. The result is stored on the **global indicator**
(`blacklist_hit`, `blacklist_source`) because "this URL is a known-bad site" is objective, shareable threat
intel, not org-private data - so, like the AI verdict, it's computed once and reused for everyone. It's a strong,
cheap signal fed into the AI verdict (see §8). Note the two are complementary, not redundant: Safe Browsing
catches *already-famous* bad URLs instantly, while our dedup is what protects users against *brand-new, targeted*
scams that no blacklist has seen yet - the case Orbis exists to cover.

**Auto-escalation to the analyst.** Anything an **org member** submits - whether pasted in the web chat or
forwarded to the Orbo inbox - is automatically routed to their org's analyst for review: the submission sets
`escalated = true`, and an `org_reviews` row is created (or reused) for that (org, indicator) with
`review_status = 'pending review'`. Members never have to manually "send to security"; the worry they felt is
enough. Individuals have no analyst and no org_review row, so their submissions are never escalated.
(Stories #6, #8.)

**Email forwarding is a backend-only pipeline (core interaction method - no dedicated UI screen).** A user
forwards a suspicious email to a dedicated Orbo inbox; an inbound-email service receives it and calls our
webhook (`POST /api/webhooks/inbound-email`); the backend matches the sender to a user by `From` address
(`users.email`), extracts the URL/content, and writes a `submission` with `source = 'email'`. From there the
flow is identical to a web submission - scan, AI verdict, and (for org members) auto-escalation. Because it has
no screen of its own, **no wireframe is needed**; the results appear on the user's existing Reports page.

**Inbound-email provider decision — as built (Ozias's slice).** ~~Microsoft Azure~~ was **ruled out** (Azure
Communication Services Email is *send-only* — it can't receive a forwarded email and hand it to a webhook). The
key insight held: only the very first hop (an email physically arriving) needs any third party; everything after
the webhook is our own code. We considered SendGrid Inbound Parse as the "real path," but **it was never built** —
it needs a domain we control, and a simpler free option turned out to work better:

1. **Simulate the webhook (still supported).** The single-email `POST /api/webhooks/inbound-email` accepts a
   realistic payload (`{ from, subject, body, links[] }`) so a "forward" can be demonstrated with a saved
   request/curl. The *entire pipeline is real*; only the delivery hop is stand-in.
2. **Gmail + Google Apps Script relay (chosen and shipped, $0, no domain).** A short Apps Script pasted into
   script.google.com runs on a ~1-minute Gmail trigger against a dedicated `orbischecks@gmail.com` inbox, and
   POSTs new forwards (in a **batch** — see below) to `POST /api/webhooks/inbound-email/batch`, authenticated by
   a shared `x-orbis-token` header. Chosen over SendGrid because it needs **no owned domain**, costs nothing, and
   rides real Gmail deliverability. The same relay pattern is reused *in reverse* for outbound: report emails are
   POSTed to a second Apps Script Web App that sends them via `GmailApp` (HTTPS, not SMTP — Render's free tier
   blocks SMTP ports), threaded back into the user's original forward via the stored `email_thread_id`. The `.gs`
   relay scripts live in `server/appsscript/` but are pasted into Google by hand — they are the deployment, not
   deployed-from-repo.

**Batch intake + bounded concurrency (Sprint 3, in response to pod-sync scaling feedback).** After a mentor
flagged that one-LLM-call-per-email would bottleneck at scale, we added `POST /api/webhooks/inbound-email/batch`
(`{ emails: [...] }`, up to 50), analyzed with a small bounded concurrency (4 in flight) and returning per-email
results in order so nothing is silently dropped. We deliberately did **not** batch several users' emails into one
LLM call — because indicators are global, a prompt-injection in one email could poison the shared verdict served
to everyone. Throughput comes from concurrency + caching instead. A durable queue and dedup-batched LLM calls are
documented as roadmap in `planning/email_forwarding_scaling.md`.

---

## 6. API Contracts

**Auth, orgs, and invites are handled by Clerk, not by our API.** Register/login/social-login, organization
creation, teammate invites, and domain auto-join are all served by Clerk's prebuilt React components + backend.
So the endpoints below are only the ones **we** build. Every protected route reads the caller's identity, role,
and `org_id` from the verified Clerk session token (no hand-rolled JWTs).

| CRUD | Verb | Endpoint | Description | Request shape | Response shape | Error cases | Stories |
|---|---|---|---|---|---|---|---|
| Create | POST | `/api/webhooks/clerk` | Clerk → us: sync user/org mirror rows on create/update/delete | Clerk event (`user.*`, `organization.*`, `organizationMembership.*`) | `200 OK` | 400 bad signature (verified via Clerk signing secret) | 1, 4, 12 |
| Create | POST | `/api/webhooks/inbound-email` | Inbound-email service (or a simulated forward) → us: a message hit the Orbo inbox | `{ from, subject, body, links[] }` | `{ submissionId, indicatorId, status }` | 400 unparseable; 202 accepted-but-unknown-sender (ignored) | 4, 13 |
| Create | POST | `/api/submissions` | Submit a URL for analysis (web chat) | `{ url, contextText? }` | `{ submissionId, indicatorId, status }` | 400 invalid/empty URL (→ Invalid Input screen); 401 unauthenticated | 1, 2, 3, 4, 5, 13 |
| Read | GET | `/api/indicators/:id` | Get a verdict (polled until done); merges the global indicator with the caller's org_review if any | - | `{ status, ai_score, ai_verdict, screenshot_url, report_count, review?: { human_score, human_verdict, review_status }, ... }` | 401; 403 not in caller's scope; 404 not found | 1, 7, 12, 15 |
| Read | GET | `/api/history?mine=1` | My reported links (individual/member); each report's `review` includes `shared_with_org` | - | `{ reports: [...] }` | 401 unauthenticated | 7, 14 |
| Read | GET | `/api/history?org=1` | **Team History** (org member): my org's reports that an analyst reviewed **and shared** (`shared_with_org = true`); scoped to the caller's org | - | `{ reports: [...] }` | 401 unauthenticated | 7, 12 |
| Read | GET | `/api/history` | Org-wide history + stats (analyst dashboard) | - | `{ recent: [...], stats: {...} }` | 401; 403 non-analyst | 8, 12 |
| Read | GET | `/api/search?q=` | Keyword search within org (analyst) | - | `{ results: [...] }` | 401; 403 non-analyst | 11, 14 |
| Update | PATCH | `/api/indicators/:id/review` | Analyst records/overrides their org's verdict - upserts the `org_reviews` row for (caller's org, indicator); sets `shared_with_org` (Team History gate); raises a notification | `{ human_score, human_verdict, review_status, shared_with_org? }` | `{ review }` | 401; 403 non-analyst or wrong org; 404 not found; 400 invalid score | 7, 10 |
| Read | GET | `/api/campaigns` | List my org's campaigns (grouped triage queue) | - | `{ campaigns: [{ id, name, indicatorCount, reportCount, last_seen }] }` | 401; 403 non-analyst | 9 |
| Read | GET | `/api/campaigns/:id` | Campaign detail: grouped indicators (analyst) | - | `{ campaign, indicators: [...], reportCount }` | 401; 403 non-analyst or wrong org; 404 not found | 9 |
| Read | GET | `/api/notifications` | My notifications (closure alerts) | - | `{ notifications: [...], unreadCount }` | 401 unauthenticated | 7 |
| Update | PATCH | `/api/notifications/:id/read` | Mark a notification read (clears the bell badge) | `{}` | `{ id, is_read: true }` | 401; 403 not mine; 404 not found | 7 |
| Create | POST | `/api/nlp-query` | English → **guarded LLM-written SQL over a read-only view** → answer + chart (analyst; members get their own scope) ★AI | `{ question }` | `{ answer, cards, data, chartSpec }` or `{ fallback }` | 401; 403 individual/no-org; rejected SQL → safe fallback | 11 |
| Read | GET | `/api/history/:id` … | *(see history routes: `?mine`, `?org`, `?org&all`, plus analyst org-wide stats when no query)* | - | - | - | 7,8,12 |
| Update | PATCH | `/api/history/:indicatorId/archive` | Soft-archive/unarchive a report in *my* view (`{ archived }`) | `{ archived }` | `{ ok }` | 401; 400 non-boolean; 404 not mine | 7,14 |
| Delete | DELETE | `/api/history/:indicatorId` | Permanently delete from *my* history - **individuals only** (org members get 403; their reports feed the analyst queue) | - | `{ ok }` | 401; 403 org member; 404 not mine | 14 |
| Update | PATCH | `/api/notifications/read-all` | Mark all my notifications read (clears the badge past the 50-row page cap) | `{}` | `{ ok }` | 401 | 7 |
| Create | POST | `/api/indicators/:id/report` | User "Report it" on a verdict → free-text reason + bumps `reported_count` / `global_review_status` | `{ reason }` | `{ ok }` | 401; 400 empty reason; 404 | 6 |
| Create | POST | `/api/ask-orbo` | Conversational, verdict-grounded security Q&A about a specific indicator ★AI | `{ indicatorId?, question, history? }` | `{ answer }` | 401; 400 empty question | 15 |
| Create | POST | `/api/ask-orbo/sender-report` | Analyze a sender email address (lookalike / webmail / brand / DNS) and persist it as an indicator ★AI | `{ email }` | `{ ...verdict, isSenderReport: true }` | 401 | 6,13 |
| Create | POST | `/api/prescreen` | Instant **deterministic-only** structural pre-check (extension click-guard; no sandbox, no LLM) | `{ sender?, urls[] }` | `{ level, score, reasons }` | 401 | 1,4 |
| Create | POST | `/api/prescreen/demo` | Public "try it" widget on the landing page (one URL, no sender, IP rate-limited) | `{ url }` | `{ level, score, reasons }` | 400; 429 | 1 |
| Create | POST | `/api/prescreen/email` | Content-aware email pre-check (extension Gmail badge) - runs the 3 legs, persists **nothing** ★AI | `{ sender, subject, body, urls[] }` | `{ level, score, ... }` | 401; 503 no LLM key; 422 nothing scorable | 4,13 |
| Create | POST | `/api/vision/read-screenshot` | Read/explain a urlscan screenshot in plain English (SSRF-guarded: `urlscan.io` host allowlist) ★AI | `{ url }` | `{ text }` | 401; 400 host not allowlisted | 2,15 |
| Create | POST | `/api/vision/extract` | Extract URLs/emails/signals from an **uploaded image** (inline data URL; no server-side fetch) ★AI | `{ imageDataUrl }` | `{ urls, emails, summary, ...score }` | 401; 400 bad image | 2,13 |
| Read | GET | `/api/dashboard` | Personal / member dashboard stats + charts | - | `{ stats, ... }` | 401 | 7 |
| Create | POST | `/api/users/api-key` | Issue/rotate the caller's browser-extension API key (raw key returned **once**) | `{}` | `{ apiKey }` | 401 | 1,4 |
| Read | GET | `/api/users/api-key` | Whether the caller has a key (`{ hasKey }`) - never leaks the key | - | `{ hasKey }` | 401 | 1,4 |
| Delete | DELETE | `/api/users/api-key` | Revoke the caller's API key | - | `{ ok }` | 401 | 1,4 |
| Create | POST | `/api/org/invite` | Analyst invites a teammate to the org (server-side Clerk op) | `{ email }` | `{ ok }` | 401; 403 non-analyst | 12 |

**Role & org enforcement (story #12):** the org-wide analyst **dashboard** reads (`/history` stats, `/search`,
`/nlp-query`, `/campaigns/*`) and the review PATCH (`/api/indicators/:id/review`) require the **analyst** role
*and* are filtered/upserted to the analyst's own `org_id`. Members are scoped to their own submissions
(`?mine=1`) **plus a read-only Team History (`?org=1`)** that returns only their org's analyst-reviewed-and-shared
items — still scoped to the caller's own `org_id`, so no org can read another org's data. One server-side
middleware verifies the Clerk session and checks role + org on every protected route, reused everywhere.
(Role is stored in Clerk's user/org metadata and mirrored to `users.role`.)

**Note - endpoint count for the rubric:** even after handing auth/orgs/invites to Clerk, we shipped ~30
first-party endpoints across 14 feature routers and full CRUD — far past the "5 Node endpoints" bar. The
table above lists the load-bearing ones; the browser extension authenticates to them with an app-issued API
key (SHA-256 hashed in `users.api_key_hash`), checked by the same auth middleware before Clerk.

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
context - so there's no `authToken`/`currentUser`/`inviteDraft` for us to manage; we read `role` and `org_id`
off the Clerk user/org and pass them down. A submitted URL sets `submissionStatus` and the ResultPage **polls**
`GET /indicators/:id` until `status === "done"` (no queue system). `notifications` lives in our own top-level
context so the closure badge shows on any screen. State flows App → pages → components via props/context.

---

## 8. AI Feature Specification

Orbis shipped **more than two** AI-touched features (the rubric requires one). The two headliners are the
danger verdict (A) and the ask-the-data query (B); Sprint 2-3 added a conversational assistant, a Vision
screenshot reader, and email/sender analysis, all described below. The governing principle across all of
them: **our own code owns every score; the model only writes words**, and every model output is treated as
untrusted and validated before it can affect anything.

### Feature A - Plain-English Safety Verdict (generation) — *as built*
- **What it does for the user:** turns raw sandbox evidence into a human-readable "is this safe?" verdict + a 0-100 safety score anyone can act on.
- **Where it lives:** triggered server-side after a scan completes; shown on the **Check Link - Result** screen, the Reports cards, and the report detail modal.
- **Input:** distilled urlscan evidence (final URL/host after redirects, redirect-off-domain flag, page resources, form/credential fields, domain age, cert/scheme, raw-IP/port) + **the Google Safe Browsing blacklist result** + a typosquat/lookalike assessment + a reputation lookup on the *landing* host + optional user-pasted context.
- **The score is deterministic (this is the core change from Week 6).** Code computes `score = clamp(100 − sum of triggered danger weights)` from a fixed weighted table (e.g. Safe Browsing hit −60, urlscan-malicious −55, domain <7 days −35, credential form on a young domain −30, brand impersonation −20, redirects off-domain −15…). The model is asked for a number too, but its number is only allowed to **nudge the rubric score by ±15**, never past the floors/ceilings below. Buckets: ≥70 safe, ≥35 review, <35 dangerous. Confidence is derived from how many independent danger signals fired, not from the model.
- **Hard overrides the model can't cross:**
  - **Ceiling ≤20** on any hard signal — a Safe Browsing blacklist hit, a credential form on a <7-day-old domain, or a confirmed typosquat that doesn't land on the real brand. When a hard signal fires the model's nudge is disabled entirely. *A confirmed known-bad URL can never be reported as "safe."*
  - **Floor ≥75** only when the link is clean *and* its landing host is a reputable domain (curated allowlist + Tranco top-list, minus a denylist of shorteners/free-hosting/UGC). Never applied over a hard signal.
- **Output written onto the indicator:** `ai_score`, `ai_verdict` (prose), `ai_confidence`, `ai_title`, `ai_description`, `ai_tags`, `ai_reasons` (≥3 `{text, severity, weight?}` rows) — plus the redirect facts (`final_url`, `final_host`, `redirected_to_different_host`). *(The Week-6 spec said `{ score, verdict_text, confidence, evidence_summary }` via "structured outputs"; shipped is the richer shape above, produced as prompt-instructed JSON parsed loosely with a rule-based fallback — not the structured-outputs API.)*
- **Endpoint:** produced during the `/api/submissions` → scan → blacklist/typosquat/reputation → score flow; read via `GET /api/indicators/:id`.
- **Fallback:** if the Claude call fails or returns junk, a rule-based writer produces the words using the *same* deterministic score and confidence — never a false "safe," never a fabricated high score.

### Feature B - Ask-the-Data (natural language → chart) — *re-architected, as built*
- **What it does for the user:** an analyst (or a scoped member) asks a question in plain English and gets a prose answer, summary cards, and a chart — no SQL by hand.
- **Where it lives:** the dashboard "Ask Orbo" rail and the Insights page. `POST /api/nlp-query`.
- **How it works now:** the model **writes a read-only PostgreSQL `SELECT`** against a single curated view (`v_reports`) that exposes only shareable columns (no Clerk ids, no email, no raw URL). *(The Week-6 plan was "model emits a validated whitelisted filter, never SQL." We rebuilt it to LLM-written SQL because it answered far more questions; the old filter engine still exists in the codebase but is dead/unused.)*
- **Validation (the safety story is preserved, just moved):** every generated query is parsed and must be a single read-only `SELECT` over only `v_reports` — no comments, no stacked statements, no schema-qualified names, one corrective retry on rejection. It's then executed inside a **parameterized, org-scoped, read-only transaction** with a statement timeout and a row cap. So the model never touches raw tables and can't widen its own scope; org isolation is enforced by the wrapping CTE, not by trusting the model.
- **Output:** `{ answer, cards, data, chartSpec }`, or `{ fallback }` if there's no LLM key or the query can't be built. On the everyday path the reliable chart shapes are count / bar / bucket-count / table.
- **Reused by the MCP bridge:** the standalone `orbis-mcp-server` package exposes one `ask_orbis` tool to Claude Desktop that calls this same endpoint with the user's API key (see §13).

### Feature C - Ask Orbo conversational assistant (Sprint 2)
An interactive, **verdict-grounded** security chatbot (`POST /api/ask-orbo`). Given an `indicatorId` it folds that verdict's facts into the prompt and answers follow-up questions. Hard guardrails in the system prompt: it declines off-topic requests, **never** re-adjudicates whether a specific URL/sender is safe (it defers to the real scanner), and treats the client-supplied transcript as forgeable/untrusted.

### Feature D - Email & sender analysis (Sprint 2-3)
A forwarded email is scored in **three independent legs** — sender, body, and each embedded link — then reconciled. Deterministic code owns each leg's number: the sender leg classifies the domain (lookalike → ≤15, free webmail → ≤60 neutral, known brand → ≥55, reputable → ≥70) and adds free DNS signals (MX/SPF/DMARC *absence* is a mild negative; *presence* proves nothing since scammers set it up too); the body leg lets the model only *observe* red-flag categories while code scores them from a signal catalog, with model-guessable signals (link/sender mismatch) admitted only when code proves them; DKIM/DMARC *fail* in the original headers is a hard "forged" signal (bare SPF fail is ignored — it fails on legit forwards). Legs combine worst-of, but a lone "log in by Friday"-style ask is corroboration-gated so benign mail isn't over-flagged. This calibration work (with a measured false-positive corpus) is captured in `scripts/out/EMAIL-SCORING-TEST-REPORT.md`.

### Feature E - Vision (Sprint 3)
`POST /api/vision/read-screenshot` reads a urlscan screenshot in plain English (SSRF-guarded by a strict `urlscan.io` host allowlist — the one place we fetch by URL). `POST /api/vision/extract` pulls URLs/emails/signals out of an **uploaded** image (inline data URL, no server-side fetch at all); code owns the score, and a clean image caps at "review," never "safe," because a picture can't be sandboxed.

#### AI Feature Decisions Log — *rebuilt Sprint 4 to match shipped behavior*
| Decision | Sprint | What changed | Why |
|---|---|---|---|
| NLP keeps the model away from raw tables | Sprint 0 (plan) | Architecture | The safety goal — no AI-driven injection, org isolation enforced in code — that every later NLP change preserved |
| Verdict returns validated JSON with a deterministic fallback | Sprint 0 (plan) → refined S1-2 | Output format | Guarantees a usable verdict even when the model fails; shipped as prompt-instructed JSON + rule-based fallback (not the structured-outputs API we first named) |
| Feed Google Safe Browsing into the verdict as a hard signal | Sprint 0 (plan) | Prompt input + validation | A confirmed known-bad URL is decisive; became the ≤20 ceiling below |
| **Code owns the score; the model only writes the words** | Sprint 1 | Scoring architecture | The model contradicted itself (scored + explained differently) and could be talked out of a bad verdict. A fixed weighted rubric makes the score repeatable, testable, and explainable — like real scanners |
| **Score direction fixed as SAFETY (100 = safe)** | Sprint 1 | Semantics | One consistent direction across verdict, email legs, prescreen, and Vision; removes the "is 80 good or bad?" ambiguity (the §5 "danger score" wording was stale until this Sprint-4 pass) |
| **Hard-signal ceiling (≤20) + reputation floor (≥75)** | Sprint 1-2 | Validation | The model's ±15 nudge can polish wording but can never move a known-bad link to "safe" or bury a clearly-reputable one; the floor judges the *landing* host so open-redirects are caught |
| **Typosquat / lookalike + confusable-script detector** | Sprint 1-2 | New deterministic signal | Catches brand-in-subdomain and homoglyph attacks a blacklist hasn't seen yet; "lands on the real brand" downgrades to safe |
| **Reputation trust floor from a popularity list** | Sprint 2 | New deterministic signal | A fresh scam domain can't retroactively appear in a pre-built top-list, so it's a trust anchor that can't be faked (unlike DKIM/WHOIS-age) |
| **Capture the real landing host after redirects** | Sprint 1 | New signal + prompt input | Fixed the "zon.com redirects to amazon.com" hallucination — where a link *actually* lands is now a required fact, not a guess |
| **Three-leg email scoring (sender / body / links), reconciled** | Sprint 2-3 | New AI surface | A scam is the whole message, not one URL; each leg scored independently by code, model only observes signals |
| **DKIM/DMARC fail = hard signal; SPF-only fail ignored** | Sprint 3 | Email validation | Auth-header failure is strong forgery evidence, but SPF nearly always fails on *forwarded* mail — using it would false-positive every forward |
| **Email FP calibration (code-delivery, personal greeting, corroboration-gated crown-jewel)** | Sprint 3 | Threshold tuning | Measured against a corpus: a delivered-package code isn't a phishing ask, a greeting by first name isn't "Dear customer," and a lone "log in" line needs corroboration before it's flagged |
| **Ask Orbo assistant is verdict-grounded and won't re-adjudicate** | Sprint 2 | New AI surface + guardrail | Keeps the chat honest — it explains a verdict but defers the safe/dangerous call to the real scanner; treats the transcript as untrusted |
| **NLP rebuilt: model writes guarded SQL over a read-only view** | Sprint 3 | Architecture pivot | The whitelisted-filter engine answered too few questions; guarded SQL over `v_reports` (parsed, read-only, org-scoped) answers far more with the same safety guarantee |
| **Vision reads screenshots; SSRF-guarded by host allowlist** | Sprint 3 | New AI surface + security | Reading a screenshot avoids opening the page; the only URL-fetch is locked to `urlscan.io`, uploads are never fetched server-side |
| **Batch email intake, but one email per LLM call** | Sprint 3 | Scale + security | Concurrency gives throughput; batching several users' emails into one prompt would let an injection in one poison the shared verdict for all |
| **Community "Mark safe" vote built then pulled** | Sprint 3 | Feature removed | A global "N people marked this safe" count could reassure a victim next to a red verdict; columns parked empty rather than run a destructive migration (see §13) |

---

## 9. Wireframes

**Status: done** (Figma, exported to PDF). At least 3 required - we have far more. Full inventory with
per-screen component hierarchy is in **§4 above**. File:
[`wireframes/Figma Wireframes PDF.pdf`](./wireframes/Figma%20Wireframes%20PDF.pdf).

Coverage by flow (all drawn):
- **Onboarding/auth** (p.1): landing, login, register, team setup (2 steps), accept-invite.
- **Core check-a-link** (p.2): home (individual + org), checking, result, Safe/Suspicious/Dangerous verdict states, invalid input.
- **Analyst dashboard & Ask Orbo** (p.3): dashboard, Ask Orbo chat, and 6 chart variants (weekly report, heatmap, trends, distribution, campaigns).
- **Reports** (p.4): three role-tailored variants (individual, org/personal, analyst) + report detail modal.

**No wireframe gap:** the **email-forwarding** path is a backend-only pipeline (Orbo inbox → webhook → DB) with no
screen of its own - its results appear on the existing Reports page, so nothing new to sketch. (See §5/§6.)

**Cognitive walkthrough:** run one quick outsider walkthrough of the core check-a-link flow before Sprint 1.

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
| Product renamed PIPbot → **Orbis** (in-app assistant = **Orbo**); team stays **DOMinion** | Wireframes were built as "Orbis/Orbo"; docs still said "PIPbot" - mismatch would confuse mentors | Keep "PIPbot"; rename team too | One-time doc churn; docs and designs now match |
| Added an **organizations** model (+ `org_id`, org-scoping middleware) | Team-setup wireframes and story #12 (org data isolation) both assume orgs, but the data model had none | Keep `role` as a lone text column | More schema + an org-scoping middleware; makes the isolation requirement real instead of implied |
| ~~MVP auth = email + password; social/SSO → stretch~~ **(superseded below)** | - | - | Replaced by the Clerk decision once we realized we don't have to build auth ourselves |
| **Use Clerk (managed auth provider) for auth, orgs, invites, domain auto-join** - so **social login (Google/Apple) is core**, and enterprise SSO/SAML (e.g. WorkOS) is the stretch | Building auth + orgs + invites by hand is a large lift; Clerk ships all of it with a free tier and drop-in React components, and covers the org/domain-auto-join flow we wireframed | Hand-rolled email+password (prior plan); build OAuth ourselves; WorkOS AuthKit as primary | We depend on a third-party service + store mirror rows synced by webhook; in exchange we get social login *and* orgs as core for near-zero auth code, and SSO becomes an easy stretch |
| **Email forwarding is a backend-only pipeline** (Orbo inbox → inbound-email webhook → DB → auto-review) | Committed to at the Jul 1 pod sync; central to the "no friction" value. It has no screen of its own | Move it to stretch; build a UI for it | No wireframe needed (no UI); results show on the existing Reports page; adds an inbound-email webhook + sender matching |
| **Inbound-email provider: ~~Azure~~ → simulate-the-webhook for demo; SendGrid Inbound Parse as the real path** (Jul 13) | Azure email is send-only (can't receive to a webhook); the pipeline after the webhook is all our own code | Azure (send-only, ✗); Cloudflare Email Workers (needs domain on Cloudflare + you write the parse Worker); Mailparser (ugly address, 3rd-party) | Demo path costs $0 and needs no domain; real path (SendGrid) needs a team-owned domain — use a free student domain to avoid paying. See §5. |
| **Auto-escalate every org-member submission to their analyst** (web chat *or* Orbo email) | Members worry about scams but "report to security" is friction; the act of submitting *is* the report | Require an explicit "send to team" click | Analysts see more items (fine - they triage by priority); members get closure with zero extra steps (stories #6, #7) |
| **Reports page tailored per role** (individual = minimal; member = personal + closure status; analyst = grouped triage queue) | One shared layout under- and over-served different roles | One unified reports table for all | 3 view variants to build; each role sees exactly what's useful (stories #7, #9, #12) |
| ~~**Campaign view = grouped queue row + Ask Orbo chart**; standalone campaign *page* deferred~~ **(superseded below)** | Wireframes surface campaigns in the triage queue and in chat, not a dedicated page | Build a separate campaign detail page for MVP | Slightly less depth per campaign; matches mentors' build order (clustering last) |
| **Campaign detail page un-deferred** (Sprint 2) - `GET /api/campaigns/:id` + a `CampaignDetail` page at `/reports/campaigns/:campaignId` | The grouped queue row alone gave an analyst no way to *open* a campaign, and the endpoint was already specified in §6; built by Ozias off the triage queue he owns | Keep it deferred; surface campaign depth inside the report modal only | Reverses the deferral above; adds a page with no wireframe (reuses the analyst Reports card layout); clustering is still David's and still open (§ Open Questions) |
| **Ask Orbo ships 1-2 chart variants at MVP** (6 are wireframed) | Six visualizations is the full vision, not the MVP; mentors warned against "boiling the ocean" | Build all 6 | Some charts are fast-follow; keeps Sprint-2 MVP achievable |
| **Responsive everywhere; deploy on free tiers; seed stand-in data** | Personas are phone-first; the app must be live and populated for the demo | Desktop-only MVP; skip deploy until later; empty dashboard | One responsive build (no separate mobile app); a bit of deploy + seed-script work up front; demo looks real and works on a phone |
| **Add Google Safe Browsing as a free blacklist signal** (urlscan = sandbox/screenshot/evidence; Safe Browsing = known-bad blacklist; Claude = final verdict) | urlscan's free tier gives evidence + screenshot but its reputation/verdict data is largely Pro-gated; we still want a real "known-bad" check | urlscan-only (no blacklist); VirusTotal (4 req/min, no commercial use); PhishTank (phishing-only) | One extra free API call per new URL; big accuracy + demo payoff. **Caveat:** Safe Browsing is *non-commercial use only* - a real product would switch to Google Web Risk. Stored on the global indicator, so checked once and shared. |
| **Deterministic score, AI narrates (Sprint 1)** — our code computes the 0-100 from a weighted rubric; the model's number may only nudge ±15 and never crosses a hard floor/ceiling | The model contradicted its own evidence and could be argued out of a bad verdict; a security tool's score must be repeatable and testable | Let the model own the number (original plan); pure rules with no model prose | More scoring code + a signal table to maintain; in exchange the score is explainable, testable, and can't be talked into calling a known-bad link "safe" |
| **Inbound email via Gmail + Apps Script relay, not SendGrid (Sprint 2-3)** — `orbischecks@gmail.com` on a 1-min trigger → batch POST to our webhook; a second relay sends threaded report emails back | SendGrid Inbound Parse needed a domain we control; the Apps Script relay is free, needs no domain, and rides real Gmail deliverability + HTTPS (Render blocks SMTP) | SendGrid Inbound Parse (planned "real path", never built); keep only the simulated webhook | `.gs` scripts are pasted into Google by hand (not deployed from repo); best-effort delivery, no auto-retry yet (roadmap) — but $0 and real end-to-end |
| **Batch email intake + bounded concurrency (Sprint 3)** — `/inbound-email/batch` (≤50), 4 in flight, per-email results in order; still one email per LLM call | Pod-sync feedback: one request + one LLM call per email bottlenecks at scale | Unbounded parallelism (trips urlscan/LLM rate limits, drains DB pool); batch several emails into one LLM prompt | Deliberately kept one-email-per-prompt to avoid a prompt-injection poisoning the shared global verdict; throughput comes from concurrency + caching. Durable queue is roadmap (`email_forwarding_scaling.md`) |
| **NLP re-architected to guarded LLM-written SQL over a read-only view (Sprint 3)** | The whitelisted-filter engine answered too few real analyst questions | Keep the filter object (original plan); let the model hit tables directly (unsafe) | Model writes SQL but only a parsed, read-only, single-view `SELECT`, executed in an org-scoped parameterized transaction; same injection/isolation guarantee, far more questions answered. Old filter engine left in place but dead |
| **Custom headless Clerk auth flow, not Clerk's prebuilt UI (Sprint 2)** | The wireframes needed pixel control the hosted components don't give | Drop in Clerk `<SignIn/>`/`<SignUp/>` (original plan) | More auth code + a redirect race to fix (solved by driving off settled `isSignedIn` state); in exchange the pages match the design exactly |
| **Analyst role is explicit metadata, not "org admin = analyst" (Sprint 2-3)** | Auto-promoting every org admin would drop normal team owners into the analyst cockpit by accident | The original "org:admin ⇒ analyst" rule | Analyst is granted only by an `orbisRole:"analyst"` flag in Clerk; noted as a tension with the org-invite guard to verify against the live Clerk config (§13) |
| **Browser extension shipped as a Sprint-3 feature (not just a stretch)** — Chromium MV3, inline Gmail auto-scan badge + click-guard + right-click check, authed by app-issued API key | The web app is universal, but scanning Gmail inline is the highest-value everyday surface; the earlier "extension is a fast-follow stretch" call was revisited once the API was stable | Leave it as a stretch; build a separate mobile app | Chromium/Gmail only; packed + distributable via download/load-unpacked but not confirmed live on the Chrome Web Store; adds an API-key issuance/rotation flow |
| **Report-it flow + community "Mark safe" vote (built, then vote pulled) (Sprint 3)** | Users wanted to flag a verdict; a "mark safe" vote seemed symmetric | Ship the safe-vote too | "Report it" (free-text reason + counter) shipped; the safe-vote was pulled because a *global* "N marked safe" count could reassure a victim next to a red verdict — columns parked empty rather than dropped (§13) |
| **Soft-archive + individual-only delete for Reports (Sprint 3)** | Users need to tidy their history without stranding an analyst's review | Hard delete for everyone; no archive | Members can archive (reversible, per-user) but not permanently delete (their reports feed the analyst queue/Team History); individuals can delete their own |
| **SSO/SAML stays a stubbed button; notifications are in-app + emailed, not push (Sprint 4 demo call)** | SAML needs a configured IdP we didn't stand up; real-time push is a larger build | Configure SAML for the demo; build push | Honest roadmap framing: the SSO button is disabled in the demo, closure is delivered in-app + by threaded email; real-time push is "next" |

---

## 11. Open Questions & Risks (beyond the rubric - for the pod sync)

Things the assignment doesn't grade but that shape Sprints 1-4. Most were resolved with the team; the rest are
flagged **OPEN** for the pod sync.

| # | Item | Status | Decision / current lean |
|---|---|---|---|
| 1 | **urlscan.io reliability** - scans are asynchronous and can be slow or fail | **Resolved (scope):** we're not serving enterprises, so rate limits/quotas aren't a real concern; free tier + stand-in data is enough. | Poll with a timeout → `status: error` + "review manually" (never a false "safe"); cache by `canonical_key`. |
| 2 | **Auth / orgs / invites** - how do users sign in, join an org, get invited? | **Resolved:** Clerk provides all of it (incl. social login core, domain auto-join); SSO/SAML is stretch. | See §5/§6 and Decisions Log. |
| 3 | **Escalation & notifications** (stories #6, #7) | **Resolved:** org-member submissions auto-escalate to the analyst; closure delivered via **in-app** notifications. | Email/SMS notifications remain a stretch feature. |
| 4 | **Email forwarding** - how does it work with no UI, and which provider? | **Resolved:** backend pipeline. **Azure ruled out (send-only).** Demo = **simulate the webhook** ($0, no domain); optional real path = **SendGrid Inbound Parse** (needs a team-owned domain — use a free student domain). | No wireframe needed; see §5/§6 + Decisions Log. Wk 9, Michael's slice. |
| 5 | **Seed/demo data** - dashboard shows thousands of checks, trends, campaigns | **Resolved:** we'll write a seed script of realistic stand-in threats + campaigns before the Sprint-2 demo. | Needed because we won't have real usage. |
| 6 | **Mobile/responsive** - personas are phone-first, wireframes are desktop | **Resolved:** one responsive build across all screens; **no separate mobile MVP**. | Apply responsive layout as we build each screen, not as a retrofit. |
| 7 | **Deployment** - frontend + backend + Postgres | **Resolved:** we will deploy, all on free hosting tiers. | Stand up a "hello world" deploy of both early in Sprint 1 before feature work (CORS, env vars, DB host). |
| 8 | **Campaign clustering definition** - what makes two submissions "the same campaign"? | **Partly resolved (as built).** Campaigns exist as a table + an org-scoped grouped triage queue + a detail page, and the demo groups from seeded/curated data. **Auto-clustering of brand-new submissions did not ship** and is on the roadmap. | The `canonical_key` dedup collapses identical URLs; grouping *related-but-different* indicators into a campaign is still analyst-/seed-driven, not automatic. |
| 9 | **Clerk ↔ Postgres sync edge cases** - webhook lag or a missed event could leave a submission with no mirrored user/org row | **Resolved (as built).** The Clerk webhook mirrors user/org rows, and the auth middleware creates-or-fetches the mirror row lazily on first authenticated request as a backstop. | Shipped exactly the lean we noted; also covers the dev-stub and API-key identity paths. |
| 10 | **Analyst-role provisioning** - how does an account actually become an analyst? | **Resolved, with a caveat to verify (§13).** Analyst is granted only by an explicit `orbisRole:"analyst"` flag in Clerk metadata; org admins are *not* auto-promoted. | This creates a tension with `requireAnalyst` on `POST /api/org/invite` (a fresh team admin derives to `member`) — verify the live Clerk metadata setup before trusting the invite path. |

---

## 12. Build Plan — Ownership & Scope

> **How to read this section:** it says *who built what*. Each slice is a **full vertical** — the same person
> owns the UI, the API route, and the logic for their feature end to end. The original narrow "MVP 0" scope is
> kept below as a historical marker; the "Sprint sequence" and "as-built" notes describe what actually shipped
> across all four sprints and all three roles.

### MVP 0 scope (Week 7, historical) — Individual + Organization Member only
Week 7 built **only** the Individual and Organization Member experience; the Security Analyst role came in
Sprint 2. This is left here as the original slice so the git/plan history reads honestly — the analyst
dashboard, triage queue, campaign detail, authoritative review, ask-the-data, email pipeline, browser
extension, and Vision all shipped in **later** sprints (see the sprint sequence and Decisions Log). Concretely
Week 7 covered:
- **Individual:** sign in → paste a link on Home → see a verdict (score, screenshot, plain-English explanation) →
  see it in their own Reports history.
- **Organization Member:** the same check, plus their submission **auto-escalates** to their org's analyst
  (a `pending review` `org_reviews` row is created) and their Reports page shows the **closure status**.
- **Organization Member — Team History:** a read-only "Team History" tab showing only the org's
  analyst-reviewed-**and-shared** items (`GET /api/history?org=1`, gated by `org_reviews.shared_with_org`).

**What shipped beyond MVP 0 (all three roles, Sprints 2-4):** the full analyst experience (dashboard with
tiles + charts + review analytics, campaign-grouped triage queue, campaign detail page, authoritative review
that overrides the AI and notifies the reporter, keyword search); the email-forwarding pipeline with threaded
report emails; a Chromium browser extension (inline Gmail auto-scan + click-guard + right-click); Vision
screenshot reading; the ask-the-data NLP feature + an MCP bridge; a member-specific dashboard; and deployment
on Render against Neon Postgres.

### Who does what (each = a full UI + API + logic vertical)
| Person | Slice | End-to-end goal | Owns |
|---|---|---|---|
| 🟦 **David** | **Check-Link Core + Verdict AI** | Paste a link → urlscan sandbox → Claude plain-English verdict → "seen-before" dedup. This is **AI Feature A** and the demo centerpiece. | `Home`, `CheckResult`, `VerdictCard`, `POST /api/submissions`, `GET /api/indicators/:id`, `canonicalize.js`, `verdict.js` |
| 🟩 **Michael** | **Auth + App Shell + Data Layer** | Clerk-protected skeleton + Prisma schema/seed that **unblocks everyone**. | `<ClerkProvider>`, `AppShell`, `middleware/auth.js`, `webhooks/clerk`, the DB (Prisma schema + seed) |
| 🟪 **Ozias** | **Reports + Notifications + Escalation** | The **"closure loop"** — users see their history (incl. read-only **Team History**) and get notified when a verdict is confirmed. | `Reports`, `HistoryScopeToggle`, `NotificationBell`, `GET /api/history?mine=1` + `?org=1`, notifications endpoints, the escalation write, the email-forward pipeline (later) |

### Critical ordering (dependencies)
1. **Michael scaffolds first** (monorepo + Clerk + Prisma schema/seed) — **auth is a day-1 dependency for
   everyone**; no protected route or `req.user` exists until this lands.
2. **David locks `canonical_key`** (the Option D recipe in §5) — dedup rests on it.
3. **Agree the `GET /api/indicators/:id` response shape** — this is the **seam** between David's Result screen and
   Ozias's Reports cards; both render the same score/verdict/status fields, so the field names must match.

### Sprint sequence (as built)
- **Sprint 1 (Wk 7):** skeleton (Clerk auth + app shell + Prisma schema/seed) · submission + dedup · reports
  list (individual + member) · escalation + closure notifications · first AI verdict, moved to a deterministic
  score. Tests 52 → 96.
- **Sprint 2 (Wk 8):** analyst experience (dashboard, triage queue, review-that-overrides-the-AI) · custom
  Clerk auth flow · Recharts charts · ask-the-data · deploy on Render · browser extension (first working
  build) · scoring hardening (typosquat, SPF/DKIM/DMARC, reputation floor). Tests → 360+.
- **Sprint 3 (Wk 9):** email-forwarding pipeline + threaded report emails + batch intake · Vision · NLP
  rebuilt to guarded SQL · member dashboard · keyword search · campaign detail · extension polish (v0.3.x) ·
  email FP calibration.
- **Sprint 4 (Wk 10):** polish, cut/disable anything shaky for the demo (SSO button disabled, auto-clustering
  and the "Mark safe" vote pulled), rehearse the demo, and this final spec reconciliation. Tests → 751 (617
  server + 134 client), all green.

### Shared seams (owned jointly — agree before coding)
- **`escalateSubmission(user, indicator)` helper** (Ozias writes it, David calls it inside `POST /api/submissions`)
  — sets `escalated = true` and upserts the `pending review` `org_reviews` row. Individuals skip it (no org).
- **`createNotification(...)` helper** (Ozias writes it) — called when a verdict is confirmed, so the closure
  badge is raised. Trigger to confirm as a team: fire on any `review_status` change, or only on
  `confirmed malicious` / `confirmed safe`.
- **The report object shape** returned by `GET /api/history?mine=1` and `GET /api/indicators/:id` — David + Ozias
  agree the exact fields a report card/row needs.

### Repository structure (as built — this is the source of truth)
The monorepo (npm workspaces) grew well past the Week-6 skeleton. Two rules still hold: **styling lives only in
`client/src/theme/`**, and **every external API is wrapped in its own file under `server/src/services/`** so each
is isolated and swappable. Code is grouped **by feature** (mirrored on client and server), not by file type.
Every major folder has its own `README.md`, and the root `README.md` has a "where does X live?" table. All
external services are **stubbed** so the app runs end-to-end with no keys.

Beyond `client/` and `server/`, the repo now also contains **`extension/`** (the Chromium browser extension),
**`mcp-server/`** (the standalone `orbis-mcp-server` bridge for Claude Desktop), **`server/appsscript/`** (the
inbound + outbound Gmail relay `.gs` scripts, pasted into Google by hand), **`scripts/`** (scoring corpora +
harnesses, the deck generators, `pack-extension.sh`), and **`planning/`** (this spec + `DEMO_SCRIPT.md` +
`email_forwarding_scaling.md`). As-built counts: **9 Prisma models** (the original 7 + `report_reasons` and
the parked `user_trusts`), **14 server feature routers**, and **751 passing tests**.

Server feature routers (`server/src/features/`): `submissions`, `indicators`, `history`, `dashboard`,
`notifications`, `webhooks` (clerk + inbound-email + batch), `vision`, `prescreen`, `users` (api-key),
`askOrbo`, `nlpQuery`, `campaigns`, `search`, `org`. Shared services (`server/src/services/`) include the
deterministic scoring core: `verdict`, `prescreen`, `typosquat`, `reputation`, `senderDns`, `nextSteps`,
`urlShape`, `canonicalize`, plus the external wrappers `urlscan`, `safeBrowsing`, `llm`, `mailer`, `apiKey`.
Client features (`client/src/features/`): `auth`, `check-link`, `reports`, `dashboard`, `insights`, `settings`.
The original skeleton diagram below is kept as the *intended* shape; the lists above are the as-built truth.

```
FTL-Capstone/
├── README.md                       # "start here" — run steps + "where does X live?" table
├── package.json                    # workspaces + scripts (npm run dev = client + server)
├── .gitignore                      # node_modules, .env, dist
├── .env.example                    # every env var, documented (real .env is gitignored)
│
├── client/                         # React + Vite
│   ├── package.json  vite.config.js  index.html  .env.example
│   └── src/
│       ├── main.jsx                # ClerkProvider + BrowserRouter + root
│       ├── App.jsx                 # <Routes>: public + protected (AppShell)
│       ├── theme/                  # ⭐ ALL colors live HERE, nowhere else
│       │   ├── tokens.css          #   the color variables (--primary #0F62FE, --safe, …)
│       │   ├── theme.md            #   plain-English guide to every token
│       │   └── global.css          #   base resets (imports tokens.css)
│       ├── config/constants.js     # API_URL, POLL_INTERVAL_MS, VERDICT_STYLES
│       ├── lib/api.js              # ⭐ EVERY backend call goes through here (adds Clerk token)
│       ├── context/NotificationsContext.jsx
│       ├── features/               # ⭐ grouped by feature (+ README + owner in each)
│       │   ├── auth/               #   Landing, Login, Register, ProtectedRoute   (Michael)
│       │   ├── check-link/         #   Home, CheckResult, SubmitForm, VerdictCard,
│       │   │                       #     ScoreGauge, EvidenceList                 (David)
│       │   └── reports/            #   Reports, ReportCard, StatusChip            (Ozias)
│       └── components/             # SHARED only: AppShell, StatusBadge, OrboAvatar, NotificationBell
│
└── server/                         # Node + Express
    ├── package.json
    └── src/
        ├── index.js                # express app; middleware order: json → (auth per route) → routers
        ├── db.js                   # PrismaClient singleton
        ├── config/env.js           # ⭐ reads/validates ALL env vars in ONE place
        ├── middleware/             # auth.js (Clerk → req.user, stubbed) · requireAnalyst.js
        ├── features/               # route file per feature (mirrors the client)
        │   ├── submissions/        #   submissions.routes.js  (David)
        │   ├── indicators/         #   indicators.routes.js   (David)
        │   ├── history/            #   history.routes.js      (Ozias / analyst later)
        │   ├── notifications/      #   notifications.routes.js (Ozias)
        │   └── webhooks/           #   webhooks.routes.js     (Michael clerk / Ozias email)
        ├── services/               # ⭐ external-API wrappers, each isolated (+ README)
        │   ├── canonicalize.js     #   dedup rule (§5 Option D) — real, tested logic
        │   ├── urlscan.js          #   urlscan.io sandbox            (stubbed)
        │   ├── safeBrowsing.js     #   Google Safe Browsing lookup   (stubbed)
        │   └── verdict.js          #   Claude verdict, AI Feature A  (stubbed)
        └── prisma/                 # schema.prisma (7 tables, §5) + seed.js
```

> **Assets:** the Orbo mascot renders from an inline SVG placeholder (`components/OrboAvatar.jsx`) so the app
> works with no image files; swap in real PNGs under `client/src/assets/` when exported.

---

## 13. Sprint 4 Spec Reconciliation

This section closes the gap between what we planned and what we shipped. It was written in the final week by
walking the whole spec against the code, and it's the honest record of where the two drifted. Nothing here is
a surprise to the team — most of these were deliberate calls made mid-sprint that never made it back into the
plan until now.

### What changed most from the Week 6 spec
- **The score became deterministic.** The Week 6 plan had Claude produce the 0-100 number. We moved that into
  a fixed weighted rubric in code; the model now only writes the explanation and can nudge the number by at
  most ±15, never past a hard floor or ceiling. This is the single biggest architectural change and it touches
  §1, §5, and §8. It was driven by the model contradicting its own evidence and by the simple fact that a
  security tool's score has to be repeatable and testable.
- **The score is a *safety* score, not a danger score.** 100 = safe, 0 = dangerous, everywhere in the code.
  The §5 data dictionary called `ai_score` a "danger score" right up until this pass — that wording was stale
  and has been corrected. This mattered enough to fix because the two readings are exact opposites.
- **Inbound email shipped on a Gmail Apps Script relay, not SendGrid.** The plan named SendGrid Inbound Parse
  as the "real path." It was never built — a free Gmail + Apps Script relay (in *and* out, with threaded
  report replies) turned out to need no owned domain and to ride real Gmail deliverability. See §5 and the
  Decisions Log.
- **Ask-the-data was rebuilt.** Planned as "model emits a validated whitelisted filter, never SQL." Shipped as
  "model writes a read-only `SELECT` over a curated view, parsed and org-scoped before it runs." Same safety
  guarantee, far more questions answered; the old filter engine is still in the tree but dead. See §8 Feature B.
- **Auth is a custom headless Clerk flow,** not Clerk's drop-in components — needed to match the wireframes,
  cost us a redirect race we fixed by driving off settled `isSignedIn` state.

### Built but never documented until now
The browser extension (Chromium, inline Gmail scanning, v0.3.x), the MCP bridge, the Vision screenshot reader,
the three-leg email/sender scoring, the prescreen endpoints, the app-issued API-key auth for the extension,
the report-it flow, soft-archive/delete on Reports, the member-specific dashboard, and the keyword-search
endpoint all shipped without a spec entry. They're now in §4, §5, §6, and §8. Two earlier reflections
(Sprints 1-2) called the member dashboard and `GET /api/search` "cut" — both actually shipped later in the
project, so those reflections describe an earlier state, not the final one.

### Cut or disabled for the demo (Sprint 4)
- **Enterprise SSO/SAML** — the button is in the UI but no IdP is configured, so it's disabled in the demo.
- **The "Mark safe" community vote** — built, then pulled before the demo. Because indicators are global, a
  "N people marked this safe" count could reassure a victim sitting next to a red verdict. The vote never moved
  the score; the *display* was the hazard. The `indicators.trust_votes` column and the `user_trusts` table are
  left in place but empty rather than run a destructive migration on the shared DB; if the feature ever comes
  back, the count must be analyst-only.
- **Auto-clustering of new submissions into campaigns** — campaigns, the grouped triage queue, and the detail
  page all shipped, but grouping brand-new submissions automatically did not; the demo groups from seeded data.
- **Real-time push notifications** — closure is delivered in-app plus a threaded email; live push is roadmap.

### Known inconsistency to verify (not a blocker)
Shipped role derivation grants **analyst only via an explicit `orbisRole:"analyst"` Clerk flag** and does *not*
auto-promote an org admin. But `POST /api/org/invite` is guarded by `requireAnalyst`, and a freshly-created
team admin derives to `member` — so on paper that admin would get a 403 inviting teammates, even though the
CreateTeam flow assumes it passes. This only resolves cleanly if the live Clerk instance also stamps team
creators with the analyst flag. Flagged here to verify against the Clerk configuration before relying on the
invite path in production; it does not affect the demo, which uses a pre-provisioned analyst account.

### Test + deployment state at reconciliation
751 automated tests pass (617 server across 48 files, 134 client across 12). The app is deployed on Render
(static client + Node API) against an external Neon Postgres; external services (urlscan, Safe Browsing, LLM,
email relays) are stubbed when their keys are absent so the app runs end-to-end locally with no credentials.

