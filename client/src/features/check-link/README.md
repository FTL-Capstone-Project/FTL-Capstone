# feature: check-link  · owner: David

The core product loop: paste a suspicious link → Orbo checks it → verdict. Everything for this
flow lives here.

| File | What it is |
|---|---|
| `Home.jsx` | The chat surface — routes a message to a scan / sender-report / (target-less) chat, renders the thread |
| `Composer.jsx` | The message input + send/image controls (busy/disabled states) |
| `useIndicatorPoll.js` | Polls `GET /api/indicators/:id` until done/error, then hands back the verdict |
| `VerdictMessage.jsx` | Wraps a verdict in the chat: thinking bubble while polling → `VerdictCard` |
| `VerdictCard.jsx` | The result card — Safe / Review / Dangerous (data-driven) |
| `ScoreGauge.jsx` | 0–100 safety gauge (100 = safe) |
| `EvidenceList.jsx` | "Why Orbo flagged this" rows |

Talks to the backend only via `lib/api.js`. Verdict styles come from `config/constants.js`
(`VERDICT_STYLES`) and colors from `theme/tokens.css`.
