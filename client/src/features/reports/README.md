# feature: reports  · owner: Ozias

The personal "my checks" history + the closure loop. (The analyst-side org-wide dashboard is a
SEPARATE track, not here.)

| File | What it is |
|---|---|
| `Reports.jsx` | My checks. Individual variant = verdict/score/filter. Org-member variant = + a My/Team History toggle |
| `ReportCard.jsx` | One row: URL, verdict badge, timestamp, and the score column. Org members see a dual score (ORBO SCORE + ANALYST SCORE / "Pending"); individuals see a single SAFETY SCORE |
| `StatusChip.jsx` | "Pending review" → "Confirmed" chip — used by the detail modal (`ReportDetailModal`) |
| `HistoryScopeToggle.jsx` | "My History \| Team History" toggle (org members only) — switches the list dataset |

Reads `GET /api/history?mine=1` (My History) and, for org members, `GET /api/history?org=1`
(Team History) via `lib/api.js`. Notifications/bell live in `components/` +
`context/NotificationsContext.jsx`.

**Team History** lets an org member see what scams their organization has been running into. It's a
separate dataset shown by the toggle (not a separate route); individuals never see the toggle. The
backend scopes it by the verified session's `orgId`, so a member only ever sees their own org's reports.

**Privacy gate (`shared_with_org`):** Team History returns **only** reviews an analyst has explicitly
shared with the org (`org_reviews.shared_with_org = true`) — not every org submission. This is a
deliberate catch so submissions containing personal info aren't exposed team-wide by default. A
member's own submissions always stay in **My History** regardless of the flag. The analyst UI that
*sets* the flag (`PATCH /api/indicators/:id/review`, guarded by `requireAnalyst`) is a **later slice**;
until it ships, the flag is populated by the demo/seed data below.

Demo data (never run the destructive `seed.js` against the shared DB): to fill *your own* org's
Team History when signed in with real Clerk, run the additive, upsert-only helper:
`node --env-file=server/.env server/src/prisma/demoOrgHistory.js you@email.com`
