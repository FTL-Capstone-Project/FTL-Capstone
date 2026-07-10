# Week 6 — Development Plan Board (source for GitHub Issues / Milestones / Project Board)

> **Deadline:** Friday, **July 10, 9:00 PM PDT**. One member submits the repo link.
> This file is the plan for the GitHub board — copy each row into a GitHub Issue, assign it,
> and drop it in the right Milestone/column. Keep or delete once the board is live.

## Stand up the GitHub board first (~10 min)
1. `FTL-Capstone` repo → **Projects** → **New project** → **Board**. Name it "Capstone".
2. Columns: **To Do · In Progress · Needs Review · Done**.
3. **Issues** → create one Issue per row below; set the owner as Assignee.
4. **Milestones** → create: `Week 6 — Project Plan`, `Sprint 1 (Wk 7)`, `Sprint 2 (Wk 8) — MVP`,
   `Sprint 3 (Wk 9)`, `Sprint 4 (Wk 10)`. Assign every Week 6 Issue to `Week 6 — Project Plan`.
5. Add all Issues to the board in **To Do**.
> ⚠️ CodePath requires **GitHub** Issues + Milestones + Project Board in this repo — a Trello board does
> not satisfy the submission. Use Trello only for casual chat; the graded board lives here.

## Roles
- **Admin/logistics (assigned):** Submissions = Michael · Meetings = Ozias · Management = David.
- **Build ownership:** deferred to Week 7 (Sprint 1), once the plan is locked.

## Week 6 Issues — one per required `project_plan.md` section
Every Issue references the spec section it touches (traceability). Owners are a starting split — rebalance freely.

| # | Issue title | Owner | Section | Notes |
|---|---|---|---|---|
| 1 | Confirm repo access + `planning/` structure | Michael | (repo) | Repo exists ✅ — confirm all 3 have push access. |
| 2 | Create GitHub Project Board + 5 Milestones | David | (board) | Replaces Trello. Steps above. |
| 3 | §1 Team + pod members | David | §1 | ✅ drafted in project_plan.md. |
| 4 | §2 Problem + solution | David | §2 | ✅ drafted (from project_proposal.md). |
| 5 | §3 Roles + personas | Ozias | §3 | ✅ drafted. Also finish `user_stories.md` (still a stub!). |
| 6 | §4 User stories (13) + AI-feature story | Ozias | §4 | ✅ drafted. |
| 7 | **Wireframes — ≥3 screens** | ALL 3 | §5 | Only genuinely new artifact. Split below. |
| 8 | §6 Data Model | David | §6 | ✅ drafted. |
| 9 | §7 API Contracts (+ request/response shapes) | Michael | §7 | ✅ drafted. |
| 10 | §8 State Architecture | Michael | §8 | ✅ drafted — review the state list. |
| 11 | §9 AI Feature Spec | Ozias | §9 | ✅ drafted (2 features, 7 fields each). |
| 12 | §10 Decisions Log | David | §10 | ✅ seeded — add any new decisions. |
| 13 | Cognitive walkthrough of wireframes (1 outsider) | Ozias | §5 | Fast usability check; recommended. |
| 14 | Final review + submit repo link | Michael | (submit) | All sections present, board live. Fri 9 PM PDT. |

## Wireframe split (Issue #7) — ✅ DONE (Figma → PDF), far more than 6 screens
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
- Nothing is **Done** until one teammate reviews it (that's the "Needs Review" column).
- **Commit as you go** — CodePath wants to see the plan evolve.

## Biggest risks this week — updated
1. ✅ **Wireframes** — done (Figma → PDF), well beyond the 3 required.
2. ✅ `user_stories.md` — complete (15 stories, org-isolation added).
3. ⚠️ **GitHub board still to create** — Issues + Milestones + Project Board on GitHub (not Trello) is a
   submission requirement and isn't set up yet. A human needs to do this before Fri 9 PM PDT (`gh` CLI not
   installed locally). Rows above are the copy-paste source.
4. 📋 **Post-plan risks now tracked in `project_plan.md` §11** (urlscan limits, notifications, seed data,
   mobile, deployment) — review at the pod sync, fold into Sprint 1 planning.
