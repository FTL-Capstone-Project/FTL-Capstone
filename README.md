# SITE Capstone Project

SITE Course Year: **2026**

Team Name: **DOMinion**

Project Name: **PIPbot**

Team Member Names: **Michael Jissa, Ozias Tumimana, David Gonzalez-Cesar**

Mentors Names: **Sasha, Somal, Priyanshu**

Project Code Repository Links

* [Frontend Repo Link]() <!-- TODO: add once frontend repo is created -->
* [Backend Repo Link]() <!-- TODO: add once backend repo is created -->

## Project Overview

PIPbot is an AI-assisted phishing-triage web app. A user submits a suspicious URL; PIPbot detonates it in a secure sandbox (urlscan.io), captures a screenshot, and uses Claude to return a plain-English danger verdict with a 0–100 risk score across multiple threat vectors — so no one has to open the link on their own machine.

The product serves two roles from one codebase:

- **Employees** get a lightweight "is this link safe?" page with a plain-language verdict and their own report history.
- **Analysts** get a full triage dashboard: org-wide threat history, keyword search, campaign clustering, and a natural-language "ask-the-data" feature that turns plain-English questions into validated queries rendered as charts.

**Objective:** make expert-level phishing triage faster for analysts and accessible to everyday employees, with AI features that explain *why* a link is dangerous and let analysts query the threat database without writing SQL.

Deployment Website: **Add Link to Deployed Project**

### Open-source libraries used

- [React](https://react.dev/) — frontend UI
- [Node.js](https://nodejs.org/) / [Express](https://expressjs.com/) — backend API
- [PostgreSQL](https://www.postgresql.org/) — database
- [D3.js](https://d3js.org/) — dashboard data visualization
- [urlscan.io](https://urlscan.io/) — secure URL sandbox / detonation (external API)
- [Claude API (Anthropic)](https://www.anthropic.com/api) — AI verdicts & natural-language querying
- _Additional libraries will be added here as the project develops._
