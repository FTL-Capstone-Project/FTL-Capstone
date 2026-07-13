# SITE Capstone Project

SITE Course Year: **2026**

Team Name: **DOMinion**

Project Name: **Orbis**

Team Member Names: **Michael Jissa, Ozias Tumimana, David Gonzalez-Cesar**

Mentors Names: **Sasha, Somal, Priyanshu, Archana, Raghu**

Project Code Repository Links

* [Frontend Repo Link]() <!-- TODO: add once frontend repo is created -->
* [Backend Repo Link]() <!-- TODO: add once backend repo is created -->

## Project Overview

Orbis is an AI-assisted phishing-triage web app. A user submits a suspicious URL (via the web app or by forwarding an email); Orbis detonates it in a secure sandbox (urlscan.io), captures a screenshot, and uses Claude to return a plain-English danger verdict with a 0–100 risk score across multiple threat vectors — so no one has to open the link on their own machine. The in-app assistant is named **Orbo**.

The product serves three roles from one codebase:

- **Individuals** get a lightweight "is this link safe?" page with a plain-language verdict and their own report history, with no organization behind them.
- **Organization Members** get the same quick check at work; those with a security team can escalate a link for an authoritative review and are notified when it's confirmed.
- **Analysts** get a full triage dashboard: org-wide threat history (scoped to their own organization), keyword search, campaign clustering, and a natural-language "ask-the-data" feature that turns plain-English questions into validated queries rendered as charts.

**Objective:** make expert-level phishing triage faster for analysts and accessible to everyday users, with AI features that explain *why* a link is dangerous and let analysts query the threat database without writing SQL.

Deployment Website: **Add Link to Deployed Project**

### Open-source libraries used

- [React](https://react.dev/) — frontend UI
- [Node.js](https://nodejs.org/) / [Express](https://expressjs.com/) — backend API
- [PostgreSQL](https://www.postgresql.org/) — database
- [Clerk](https://clerk.com/) — managed auth: email/password + social login (Google/Apple), organizations, invites, domain auto-join
- [D3.js](https://d3js.org/) — dashboard data visualization
- [urlscan.io](https://urlscan.io/) — secure URL sandbox / detonation + screenshot (external API)
- [Google Safe Browsing](https://developers.google.com/safe-browsing) — free blacklist check for known malware/phishing URLs (non-commercial use)
- [Microsoft Azure](https://azure.microsoft.com/) — inbound-email pipeline for the "forward to Orbo" submission path
- [Claude API (Anthropic)](https://www.anthropic.com/api) — AI verdicts & natural-language querying
- _Additional libraries will be added here as the project develops._
- _Stretch:_ [WorkOS AuthKit](https://workos.com/) — enterprise SSO / SAML for large orgs

## Getting started (local dev)

```bash
npm run install:all            # install client + server (workspaces)
cp .env.example .env           # fill in keys (client also needs client/.env.local)
npm -w server run prisma:migrate   # set up the database (needs Postgres running)
npm run dev                    # runs client (:5173) + server (:3001) together
```

> All external services (urlscan, Safe Browsing, Claude) are **stubbed** until their keys are set,
> so the app runs end-to-end with no credentials — great for building UI/flows first.

## Repo structure — where does X live?

This is a **monorepo**: `client/` (React) + `server/` (Express), grouped **by feature** so each
person owns a couple of folders. Every major folder has its own `README.md`.

| I want to change… | Go to |
|---|---|
| A **color** / the theme | `client/src/theme/tokens.css` (guide: `theme/theme.md`) |
| How the client **calls the backend** | `client/src/lib/api.js` |
| Anything about **"check a link"** | `client/src/features/check-link/` |
| **Auth / login** | `client/src/features/auth/` |
| **My reports / notifications** | `client/src/features/reports/`, `client/src/components/NotificationBell.jsx` |
| Shared UI (shell, badge, mascot) | `client/src/components/` |
| An **API route** | `server/src/features/<name>/` |
| The **dedup rule** | `server/src/services/canonicalize.js` |
| An **external API** (urlscan / Safe Browsing / Claude) | `server/src/services/` |
| The **database shape** | `server/src/prisma/schema.prisma` |
| An **env var / secret** | `.env.example` (root) + `client/.env.example` |

### Ownership (personal side, weeks 7–9)
- 🟦 **David** — `features/check-link/` + `services/canonicalize|urlscan|safeBrowsing|verdict.js` (submit → scan → AI verdict → dedup)
- 🟩 **Michael** — `features/auth/`, `middleware/`, `prisma/`, `webhooks/clerk` (auth + data foundation)
- 🟪 **Ozias** — `features/reports/`, `features/notifications/`, escalation, `webhooks/inbound-email` (history + closure loop)
