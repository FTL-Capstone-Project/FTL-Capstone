# Project Plan — PIPbot

**Team Name:** DOMinion  
**Project Name:** PIPbot  
**Pod Members:** Michael Jissa, Ozias Tumimana, David Gonzalez-Cesar

> Master spec / source of truth. Before code is written, the relevant section here is updated first.
> Sections 3–4 carry over from the Week 5 user-stories work; 5–9 are new this week.

---

## 1. Problem Statement and Solution Description

**Problem.** Phishing is the most common entry point for organizational breaches. When an employee gets a
suspicious link, the safe move is to report it and wait for an analyst — but analysts are buried in reports,
and triaging each by hand (confirming a URL is malicious, understanding what it does, spotting whether it's
part of a larger campaign) is slow, repetitive, and needs specialized expertise. Meanwhile the employee who
reported it gets no quick answer, so many stop reporting and simply click. The people most targeted —
students, individuals, and small companies without a security team — have the least help.

**Solution.** PIPbot takes the slow, manual work out of phishing triage. A user submits a suspicious URL;
PIPbot detonates it in a secure sandbox (urlscan.io), gathers evidence about what the page does, and returns
a plain-English danger verdict with a 0–100 score and a screenshot — without anyone opening the link on their
own machine. One product serves two roles: **employees/individuals** get a lightweight "is this safe?" page
and their own report history; **analysts** get a full triage dashboard (org-wide history, keyword search,
campaign clustering, and natural-language querying of the threat database).

**Target audience:** SOC/IT security analysts who triage suspicious URLs, and the everyday employees (and
solo individuals) who encounter those links.

---

## 2. User Roles and Personas

### Roles
- **Individual** — a person vetting suspicious links for themselves, with no organization or security team to fall back on.
- **Employee** — a member of an organization who receives suspicious links/emails at work and wants to know if they're safe before acting.
- **Security Analyst** — a member of a security/IT team (often the only one at a small company) who investigates reported threats, issues authoritative verdicts, and monitors the org's threat landscape.

### Personas
**Individual — Sofia (targeted college student).** 20, Phoenix AZ, phone-first. Inbox full of scholarship/
internship/financial-aid messages, many fake. No campus IT to ask in real time. Wants a fast gut-check she
can trust; pain point: a real offer and a scam look identical and she has no one to ask.

**Individual — Robert (on-his-own retiree).** 63, Tampa FL, shops and banks online. Gets constant "package
couldn't be delivered" / "account locked" links; browses unfamiliar stores. Not confident with tech, no IT
person, afraid of losing retirement savings. Wants a trustworthy second opinion; pain point: can't tell a real
site from a convincing fake, and "just don't click" isn't practical.

**Employee — Maria (cautious, has a security team).** 52, HR coordinator, Cleveland OH. Lives in her inbox
(résumés, invoices from strangers). Careful but not techy. Wants peace of mind and an expert backstop; pain
point: when she reports to IT she never hears back, so she never learns if she did the right thing.

**Employee — Deshawn (fast, no security team).** 29, sales rep at a 30-person Austin startup with no security
team. On the road, phone-first, dozens of links a day, clicks fast. Comfortable with tech, impatient. Wants
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

### Individual
1. As an individual, I want to check a suspicious link myself and get a clear verdict, so that I can protect myself even with no IT team to ask.
2. As an individual, I want to safely preview what an unfamiliar webpage actually contains before I visit it, so that I can decide whether to trust a site I've never used.
3. As a student, I want to verify whether a scholarship/internship/financial-aid link is legitimate, so that I don't hand my details to a scam that targets students.

### Employee
4. As an employee, I want to submit a suspicious work link and get a verdict, so that I don't have to guess whether an unfamiliar sender is safe.
5. As an employee at a company with no security team, I want an instant expert-level verdict on my own, so that I'm still protected with no one to report to.
6. As an employee, I want to be notified when my security team confirms a verdict on something I reported, so that I get real closure and know my report mattered.
7. As a user, I want to see a history of links I've checked and their verdicts, so that I can revisit past results instead of re-checking.

### Security Analyst
8. As an analyst, I want incoming reports to arrive already scored and prioritized, so that even as a one-person team I can focus on the threats most likely to be real.
9. As an analyst, I want duplicate/related reports automatically grouped into one campaign, so that a phishing wave becomes one investigation instead of twenty fires.
10. As an analyst, I want to record my own authoritative verdict that overrides the automated one, so that my org has a trusted final decision on each threat.
11. As an analyst, I want to search past reports by keyword, so that I can quickly find a specific domain or report.

### AI Feature Stories
12. As a user, I want an instant, plain-English safety verdict with a score and a screenshot of where a link leads, so that I get an expert-level assessment in seconds without understanding the technical evidence myself.
13. As an analyst, I want to ask questions about our threat history in plain English and get back a chart, so that I can understand what we're being targeted with without writing database queries.

---

## 4. Pages / Screens

Wireframes for ≥3 of these are in **[link to wireframes — Figma / images, TODO]** (drafts in `../DOMinion_Wireframes.html`).

| Page | Role | Purpose | Key components (implied) |
|---|---|---|---|
| Login / Register | both | Auth; role stored on account | `AuthForm`, `RoleToggle` |
| Submit a Link | both | Paste URL → kick off scan | `SubmitForm`, `StatusBadge` |
| Verdict Detail | both | Score, screenshot, plain-English verdict (employee = friendly; analyst = full signals) | `ScoreGauge`, `Screenshot`, `EvidenceList` |
| My Reports | employee/individual | The links *I* submitted | `ReportList`, `ReportCard` |
| Dashboard (org-wide) | analyst | Recent activity + stats + NLP query bar | `StatTiles`, `NlpQueryBar`, `Chart` |
| History / Search | analyst | Keyword search over submissions | `SearchBar`, `ResultsList`, `ResultCard` |
| Campaign View | analyst | Grouped related attacks | `CampaignCard`, `IndicatorList` |

**≥3 wireframed screens (required):** Login, Submit a Link, Verdict Detail (minimum); ideally all 7.

---

## 5. Data Model

| Table | Column | Type | Description |
|---|---|---|---|
| **users** | id | integer | primary key |
| | email | text | unique login |
| | password_hash | text | bcrypt hash |
| | name | text | display name |
| | role | text | `individual` \| `employee` \| `analyst` — drives view + access |
| | created_at | timestamp | account creation |
| **submissions** | id | integer | primary key (one report event) |
| | user_id | integer | FK → users.id (who submitted) |
| | indicator_id | integer | FK → indicators.id (the judged thing) |
| | raw_url | text | URL exactly as submitted |
| | context_text | text | optional pasted email/message context |
| | created_at | timestamp | submission time |
| **indicators** | id | integer | primary key (the thing under judgment) |
| | canonical_key | text | unique dedup key (host + path + semantic params) |
| | domain | text | destination domain |
| | status | text | `pending` \| `scanning` \| `done` \| `error` |
| | ai_score | integer | 0–100 AI danger score |
| | ai_verdict | text | Claude plain-English explanation |
| | human_score | integer | analyst's authoritative score (nullable) |
| | human_verdict | text | analyst's written verdict (nullable) |
| | review_status | text | `pending review` \| `investigating` \| `confirmed malicious` \| `confirmed safe` |
| | screenshot_url | text | from urlscan.io |
| | urlscan_uuid | text | scan reference |
| | domain_age_days | integer | signal (nullable) |
| | campaign_id | integer | FK → campaigns.id (nullable) |
| | created_at / updated_at | timestamp | first-seen / last-updated |
| **campaigns** | id | integer | primary key (cluster of indicators) |
| | name | text | e.g. "Okta credential kit" |
| | shared_signal | text | what links them (shared domain/pattern) |
| | first_seen / last_seen | timestamp | campaign window |

**Relationships:** a user has many submissions; an indicator has many submissions (this is the dedup — many
reports, one judged thing); a campaign has many indicators. **Two-phase verdict:** `ai_*` fields are set
instantly; `human_*` + `review_status` are set later by an analyst — both kept for the record.

---

## 6. API Contracts

| CRUD | Verb | Endpoint | Description | Request shape | Response shape |
|---|---|---|---|---|---|
| Create | POST | `/api/auth/register` | Create account | `{ email, password, name, role }` | `{ user, token }` |
| Create | POST | `/api/auth/login` | Log in | `{ email, password }` | `{ user, token }` |
| Create | POST | `/api/submissions` | Submit a URL for analysis | `{ url, contextText? }` | `{ submissionId, indicatorId, status }` |
| Read | GET | `/api/indicators/:id` | Get a verdict (polled until done) | — | `{ status, ai_score, ai_verdict, human_score, review_status, screenshot_url, ... }` |
| Read | GET | `/api/history?mine=1` | My reported links (employee/individual) | — | `{ reports: [...] }` |
| Read | GET | `/api/history` | Org-wide history + stats (analyst) | — | `{ recent: [...], stats: {...} }` |
| Read | GET | `/api/search?q=` | Keyword search (analyst) | — | `{ results: [...] }` |
| Update | PATCH | `/api/indicators/:id/verdict` | Analyst records/overrides verdict | `{ human_score, human_verdict, review_status }` | `{ indicator }` |
| Read | GET | `/api/campaigns/:id` | Campaign detail (analyst) | — | `{ campaign, indicators: [...], reportCount }` |
| Create | POST | `/api/nlp-query` | English → validated filter → results + chart (analyst) ★AI | `{ question }` | `{ filter, results: [...], chartSpec }` |

**Role enforcement:** org-wide `/history`, `/search`, `/nlp-query`, `/campaigns/*`, and the verdict PATCH
require the analyst role; employees/individuals are scoped to their own submissions (`?mine=1`). One
server-side middleware, reused everywhere.

---

## 7. State Architecture (client-side)

| State variable | Type | Initial | Owner | Trigger |
|---|---|---|---|---|
| `currentUser` | object \| null | `null` | App (context) | successful login/logout |
| `authToken` | string \| null | `null` | App (context) | login; cleared on logout |
| `submissionStatus` | string | `"idle"` | SubmitPage | submit start → poll → done |
| `currentVerdict` | object \| null | `null` | VerdictPage | `GET /indicators/:id` resolves |
| `myReports` | array | `[]` | MyReportsPage | fetch on load |
| `history` | array | `[]` | DashboardPage | fetch on load (analyst) |
| `searchQuery` | string | `""` | SearchBar | user input |
| `nlpQuestion` | string | `""` | NlpQueryBar | user input |
| `nlpResult` | object \| null | `null` | DashboardPage | `POST /nlp-query` resolves |
| `isLoading` | boolean | `false` | App | any API call start/end |

**Key decisions:** auth state (`currentUser` + `authToken`) lives in a top-level context so every page can
gate on role. A submitted URL sets `submissionStatus` and the VerdictPage **polls** `GET /indicators/:id`
until `status === "done"` (no queue system). State flows App → pages → components via props/context.

---

## 8. AI Feature Specification

PIPbot has **two** AI features (rubric requires one).

### Feature A — Plain-English Danger Verdict (generation)
- **What it does for the user:** turns raw sandbox evidence into a human-readable "is this safe?" verdict + score anyone can act on.
- **Where it lives:** triggered server-side after a scan completes; shown on the Verdict Detail page.
- **Input:** distilled urlscan evidence (final domain, redirect chain, page resources, form/credential fields, domain age, cert info) + optional user-pasted context.
- **Output:** structured JSON — `{ score: 0–100, verdict_text, confidence, evidence_summary }` (via structured outputs, so it's always valid JSON).
- **Validation:** score within 0–100; verdict_text non-empty and references at least one concrete signal; a deterministic floor forces a high score on hard signals (e.g. credential form on a <7-day-old domain) regardless of model output.
- **Endpoint:** produced during the `/api/submissions` → scan → score flow; read via `GET /api/indicators/:id`.
- **Fallback:** if the Claude call fails, show the raw evidence + a "verdict unavailable, review manually" state (score `null`, status `error`) — never a false "safe."

### Feature B — Ask-the-Data Dashboarding (conversation → visualization)
- **What it does for the user:** an analyst asks a question in plain English and gets a chart — no SQL.
- **Where it lives:** the NLP query bar on the analyst Dashboard.
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

---

## 9. Wireframes

At least 3 screens required. **Status: to be sketched this week** (Figma or paper photos), split across the pod:
- David: Login/Register · Employee "Submit / Check a link"
- Michael: Verdict Detail · Analyst Triage Queue
- Ozias: Analyst Dashboard (NLP) · Campaign View

Starting reference: `../DOMinion_Wireframes.html`. **Insert link/images here once done.**

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

---

***Reminder: set up GitHub Issues, Milestones, and a Project Board — see `week6_board.md`.***
