# feature: check-link  · owner: David

The core product loop: paste a suspicious link → Orbo checks it → verdict. Everything for this
flow lives here.

| File | What it is |
|---|---|
| `Home.jsx` | Greeting + `SubmitForm`; POSTs a submission, then routes to `/check/:id` |
| `CheckResult.jsx` | Polls `GET /api/indicators/:id` until done, then shows the verdict |
| `SubmitForm.jsx` | The paste-a-link input + "Check it" button (+ invalid-input state) |
| `VerdictCard.jsx` | The result card — Safe / Review / Dangerous (data-driven) |
| `ScoreGauge.jsx` | 0–100 safety gauge (100 = safe) |
| `EvidenceList.jsx` | "Why Orbo flagged this" rows |

Talks to the backend only via `lib/api.js`. Verdict styles come from `config/constants.js`
(`VERDICT_STYLES`) and colors from `theme/tokens.css`.
