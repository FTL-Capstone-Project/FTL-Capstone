# services/ — external integrations & core logic

Each file wraps ONE concern. Swap the internals freely without touching the routes.

| File | What it does | Needs key? | Owner |
|---|---|---|---|
| `canonicalize.js` | URL → `canonical_key` dedup rule (§5 Option D). Pure logic, testable now. | no | David |
| `urlscan.js` | urlscan.io sandbox: submit → poll → screenshot + evidence | `URLSCAN_API_KEY` | David |
| `safeBrowsing.js` | Google Safe Browsing known-bad lookup | `GOOGLE_SAFE_BROWSING_KEY` | David |
| `verdict.js` | OpenAI plain-English verdict (AI Feature A) + score floor | `OPENAI_API_KEY` | David |

**All external services are STUBBED** (return canned data) until keys are set, so the whole flow
runs and demos with zero credentials. Replace the stub body with the real call when a key arrives.
