# SITE Capstone Project

SITE Course Year: **2026**

Team Name: **DOMinion**

Project Name: **Orbis**

Team Member Names: **Michael Jissa, Ozias Tumimana, David Gonzalez-Cesar**

Mentors Names: **Sasha, Somal, Priyanshu**

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
- [urlscan.io](https://urlscan.io/) — secure URL sandbox / detonation (external API)
- [Microsoft Azure](https://azure.microsoft.com/) — inbound-email pipeline for the "forward to Orbo" submission path
- [Claude API (Anthropic)](https://www.anthropic.com/api) — AI verdicts & natural-language querying
- _Additional libraries will be added here as the project develops._
- _Stretch:_ [WorkOS AuthKit](https://workos.com/) — enterprise SSO / SAML for large orgs
