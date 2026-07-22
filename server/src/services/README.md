# services/ — external integrations & core logic

Each file wraps ONE concern. Swap the internals freely without touching the routes.

| File | What it does | Needs key? | Owner |
|---|---|---|---|
| `canonicalize.js` | URL → `canonical_key` dedup rule (§5 Option D). Pure logic, testable now. | no | David |
| `urlscan.js` | urlscan.io sandbox: submit → poll → screenshot + evidence | `URLSCAN_API_KEY` | David |
| `safeBrowsing.js` | Google Safe Browsing known-bad lookup | `GOOGLE_SAFE_BROWSING_KEY` | David |
| `verdict.js` | OpenAI plain-English verdict (AI Feature A) + score floor | `OPENAI_API_KEY` | David |

All four external services are **LIVE** — they call real APIs when keys are set.
`urlscan.js` falls back to a stub result when `URLSCAN_API_KEY` is absent (safe for local dev without a key),
but `verdict.js` / `safeBrowsing.js` return errors rather than fake data if their keys are missing.
