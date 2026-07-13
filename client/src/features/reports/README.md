# feature: reports  · owner: Ozias

The personal "my checks" history + the closure loop. (The analyst-side org-wide dashboard is a
SEPARATE track, not here.)

| File | What it is |
|---|---|
| `Reports.jsx` | My checks. Individual variant = verdict/score/filter. Org-member variant = + escalation/closure status |
| `ReportCard.jsx` | One row: the URL, its verdict badge, score, timestamp |
| `StatusChip.jsx` | "Pending review" → "Confirmed" chip (org members only) |

Reads `GET /api/history?mine=1` via `lib/api.js`. Notifications/bell live in `components/` +
`context/NotificationsContext.jsx`.
