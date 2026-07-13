# feature: submissions · owner: David

`POST /api/submissions` — the core "check a link" entry point.

Flow: validate URL → `canonicalize()` → find-or-create the **global** indicator →
if already scanned, return instantly ("seen before"); else run `scanUrl` → `checkBlacklist` →
`generateVerdict` and persist. Increments `report_count`.

Depends on: `services/canonicalize|urlscan|safeBrowsing|verdict.js`, `db.js` (once migrated).
