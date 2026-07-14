# Orbis — Project Context

AI-assisted phishing-triage web app. Team **DOMinion** (Michael Jissa, Ozias Tumimana,
David Gonzalez-Cesar). Capstone project, ~3-week build.

- **Source of truth:** [planning/project_plan.md](planning/project_plan.md). When a decision
  changes, that doc is updated first, then code. Treat it as canonical over this file.
- **Progress tracker:** [Trello](https://trello.com/b/D7qoe5Tv/assigned-roles).
- **In-app assistant is named "Orbo"**; product is "Orbis"; team stays "DOMinion".

## What it does (one paragraph)
A user submits a suspicious URL (or email/attachment); Orbis detonates it in a sandbox (urlscan.io),
enriches with Google Safe Browsing, and returns a plain-English safety verdict + 0-100 score +
screenshot. The Home experience is a **conversational chat, powered by Claude** (ChatGPT/Gemini-style).
**Four roles:** **individual**, **organization member**, **security analyst**, **admin**. Analysts get an
org-wide triage dashboard (history, search, campaign clustering, natural-language querying) and can
score/override Orbo; admins additionally create the org and invite members/analysts. Each org sees
only its own data.

**Score direction:** ONE safety score, 0–100, **100 = safe** (high = good). Wireframe numbers are
placeholder samples.

**Visual source of truth:** [client/Wireframes/DESIGN_SPEC.md](client/Wireframes/DESIGN_SPEC.md),
derived from the 32 hi-fi wireframes in `client/Wireframes/`.

## Stack (as-built)
- **Monorepo** via npm workspaces: `client/` + `server/`. Root scripts: `npm run dev`
  (both), `npm run dev:client`, `npm run dev:server`.
- **client/** — Vite + React 19. Auth via **Clerk** (`@clerk/clerk-react`, `<ClerkProvider>`
  in `src/main.jsx`). Structure is **feature-based**: `src/features/{auth,check-link,reports}/`,
  with `src/components/` for SHARED-only components, `src/theme/` (all colors/tokens live here),
  `src/lib/api.js` (every backend call goes through here), `src/config/`.
- **server/** — Node/Express 5 (ESM, `"type":"module"`). Auth via `@clerk/express`
  (`clerkMiddleware`, `requireAuth`, `getAuth`). Feature-based: `src/features/{submissions,
  indicators,history,notifications,webhooks}/`, `src/services/` (one file per external API:
  urlscan, safeBrowsing, verdict, canonicalize), `src/middleware/` (auth, requireAnalyst),
  `src/prisma/` (schema + seed). **Prisma** ORM → PostgreSQL. Dev port 3001.
- Deploy target: Render, free tiers (Week 9).

## Data model (the key idea)
**Two layers.** GLOBAL `indicators` = objective, shared threat intel about a URL (ai_score,
ai_verdict, screenshot, blacklist_hit, report_count) — scanned ONCE, reused by everyone,
deduped by a globally-unique `canonical_key`. PER-ORG (`submissions`, `org_reviews`,
`campaigns`, `notifications`) = who reported it + an org's private analyst verdict, isolated by
`org_id`. A **submission** = a report event; an **indicator** = the thing judged; many
submissions → one indicator. Identity (`users`, `organizations`) is mirrored from Clerk via
webhook — no local passwords. Full spec in project_plan.md §5.

## Conventions & guardrails
- **Env/secrets:** `.env.local` (client) and `.env` (server) are gitignored — NEVER commit or
  print secret values. `CLERK_SECRET_KEY` (`sk_...`) is server-only; publishable key
  (`pk_...`, `VITE_`-prefixed) is client-safe. `.env.example` documents var names.
- **AI features stay** — the product is intentionally AI-powered (verdict generation + Ask Orbo
  NLP→chart). Don't strip them. (Prose docs, though, are kept plain: no em-dashes, no
  AI-scaffolding meta-text — see project_plan.md style.)
- **Feature-folder rule:** a component used by 2+ features → `components/`; used by one →
  that feature's folder.

## Authentication model (recommended — for team decision; 2026-07-13)
The wireframes/verbal spec imply four roles and two very different signup paths. Recommended
implementation with **Clerk** (already integrated):
- **Individuals:** Clerk **personal accounts** (email/password + Google/Apple social). Self-service
  signup with any email. `org_id = NULL`, `role = individual`. No Clerk Organization involved.
- **Orgs use Clerk Organizations.** An **admin** creates the org (CreateTeam flow → Clerk
  `<CreateOrganization>`), which makes them the Clerk org **admin** role. They then **invite** members
  and analysts (Clerk invitations + optional **domain auto-join**). Members/analysts **cannot
  self-create** an org — they only get in via invite/allowed domain, matching the spec.
- **Analyst vs member vs admin = Clerk roles/permissions** stored on the Clerk org membership
  (org:admin, plus custom `analyst` / `member`), mirrored to `users.role`. Analyst + admin get the
  triage/override/manage-team surfaces; the server's `requireAnalyst`/role middleware enforces it.
- **"Sign in with SSO"** on the wireframe = **stretch** (enterprise SAML via WorkOS or Clerk
  enterprise) — the invite/domain flow covers MVP.
- **Auth screens** are styled Clerk components, not hand-built forms; the hi-fi auth wireframes are the
  *styling target*. Org sign-in shows the "{Name} invited you to join {Org}" banner (Clerk invite ctx).
- **DECIDED (2026-07-13):** admin is **NOT** a separate `users.role`. Keep
  `users.role ∈ {individual, member, analyst}`; "admin" = the Clerk **org:admin** permission layered on
  top (can invite/manage team, sees the analyst surfaces + "Manage Team"). Fewer states; Clerk models it.

## Product decisions (2026-07-13)
- **Chat scope:** the Claude-powered Home chat is **check-focused + light** for MVP — it runs the check
  flow, answers short follow-ups about the current result ("Ask Orbo more"), and gives friendly
  redirects on invalid input. Full open-ended security chat is a **fast-follow**, not MVP.
- **Build order:** **Personal end-to-end first** (auth → chat Home → submit → Orbo verdict → Dashboard
  → Reports → modal). It's the spine; org/analyst reuse these components. Then org/member, then analyst.

## Git lessons (learned the hard way — 2026-07-13)
- **Verify state before destructive ops**, and **ask before rewriting history** (rebase/reset).
- There was a **file-vs-directory collision**: remote had `Wireframes/Enterprise` as an empty
  FILE; a local commit wanted it as a DIRECTORY of PNGs. Rebasing collided. If touching
  `Wireframes/`, watch for this.
- `git reset --hard origin/main` is the clean "match the repo" move; untracked files
  (`planning/Orbis_Demo.pptx`, `client/.env.local`) survive it.
- Remote: `origin` → `github.com:FTL-Capstone-Project/FTL-Capstone`, branch `main`.

## Known local-only files (not in repo)
`client/.env.local` (Clerk keys), `planning/Orbis_Demo.pptx` + `planning/build_deck.py`
(the demo slide deck), `planning/project_plan.md.bak`.
