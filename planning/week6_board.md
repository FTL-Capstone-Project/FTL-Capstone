# Week 6 — Development Plan (task split, wireframe status, team norms)

> **Deadline:** Friday, **July 10, 9:00 PM PDT**. One member submits the repo link.
> Task tracking lives on our **[Trello board — Assigned Roles](https://trello.com/b/D7qoe5Tv/assigned-roles)**.
> This file is the plain-text record of the plan behind that board.

## Roles
- **Admin/logistics (assigned):** Submissions = Michael · Meetings = Ozias · Management = David.
- **Build ownership:** deferred to Week 7 (Sprint 1), once the plan is locked.

## Week 6 tasks — one per required `project_plan.md` section
Every task references the spec section it touches (traceability). Owners are a starting split — rebalance freely.

| # | Task | Owner | Section | Notes |
|---|---|---|---|---|
| 1 | Confirm repo access + `planning/` structure | Michael | (repo) | Repo exists ✅ — confirm all 3 have push access. |
| 2 | §1 Team + pod members | David | §1 | ✅ drafted in project_plan.md. |
| 3 | §2 Problem + solution | David | §2 | ✅ drafted (from project_proposal.md). |
| 4 | §3 Roles + personas | Ozias | §3 | ✅ drafted. Also finish `user_stories.md`. |
| 5 | §4 User stories (13) + AI-feature story | Ozias | §4 | ✅ drafted. |
| 6 | **Wireframes — ≥3 screens** | ALL 3 | §5 | Only genuinely new artifact. Split below. |
| 7 | §6 Data Model | David | §6 | ✅ drafted. |
| 8 | §7 API Contracts (+ request/response shapes) | Michael | §7 | ✅ drafted. |
| 9 | §8 State Architecture | Michael | §8 | ✅ drafted — review the state list. |
| 10 | §9 AI Feature Spec | Ozias | §9 | ✅ drafted (2 features, 7 fields each). |
| 11 | §10 Decisions Log | David | §10 | ✅ seeded — add any new decisions. |
| 12 | Cognitive walkthrough of wireframes (1 outsider) | Ozias | §5 | Fast usability check; recommended. |
| 13 | Final review + submit repo link | Michael | (submit) | All sections present. Fri 9 PM PDT. |

## Wireframe split — ✅ DONE (Figma → PDF), far more than 6 screens
| Screens | Owner |
|---|---|
| Login/Register · Org-member "Submit / Check a link" | David |
| Verdict Detail (Result + 3 states) · Analyst Triage Queue (Reports) | Michael |
| Analyst Dashboard (Ask Orbo) · Campaigns (grouped queue + Orbo chart) | Ozias |
> Only **3** required to pass; we delivered onboarding, core check-a-link, dashboard/Ask-Orbo (6 charts), and
> reports (3 role variants + modal). Wireframes: `wireframes/Figma Wireframes PDF.pdf`.
> Email forwarding is a backend-only pipeline (no screen — see project_plan §5/§6), so no extra wireframe needed.

## Team norms
- **Daily 10-min standup** (existing Meet): did / doing / blocked.
- Nothing is **Done** until one teammate reviews it.
- **Commit as you go** — CodePath wants to see the plan evolve.

## Biggest risks this week — updated
1. ✅ **Wireframes** — done (Figma → PDF), well beyond the 3 required.
2. ✅ `user_stories.md` — complete (15 stories, org-isolation added).
3. 📋 **Post-plan risks now tracked in `project_plan.md` §11** (urlscan limits, notifications, seed data,
   mobile, deployment) — review at the pod sync, fold into Sprint 1 planning.
