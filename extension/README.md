# Orbis browser extension (G3·13)

Orbo watches your inbox for phishing. Three surfaces, all reusing the existing Orbis API:

1. **Auto-scan on open (Gmail):** open an email and Orbo instantly checks the **sender + every
   link** and shows a fixed **safe / warning / danger** badge in the top-right — no clicking. This
   guards the "just clicking a link" phishing case: you see the risk before you touch anything.
2. **Click guard (Gmail):** if you click a link, Orbo re-checks it and blocks navigation behind a
   warning if it's risky.
3. **Right-click anywhere:** select a link or **sender email** → **"Check with Orbis"** → a popup
   runs the check (links use the full sandbox scan; emails get an instant sender report).

The auto-scan + click guard use the INSTANT deterministic pre-check (`/api/prescreen`, ~80ms — no
sandbox); the right-click popup uses `/api/submissions` (links) or `/api/ask-orbo/sender-report`
(emails). No new backend logic — thin client over existing endpoints.

## Privacy

The Gmail auto-scan sends the **sender address + the link URLs** in the open email to
`/api/prescreen`. It **never sends the email body text** — only the sender and the links, which is
all the deterministic detectors (lookalike sender / homoglyph / URL shape) need. The pre-check is
honest: it flags what it can prove instantly and says "no obvious red flags" otherwise — it is NOT
the full sandbox scan (that's the right-click "Check with Orbis" on a specific link).

## Auth model

The extension sends `Authorization: Bearer <token>` exactly like the web app.

- **Dev-stub mode** (local, no Clerk keys): the server fakes one logged-in user, so **no token is
  needed** — quickest way to build/demo.
- **Real mode:** use an **app-issued API key**. In the Orbis web app → **Settings → Browser
  extension → Generate key**, copy it (shown once), and paste it into the extension's Settings.
  The key is a long-lived `orbis_…` credential; the backend accepts it as an alternative to a
  Clerk session JWT. Rotating/regenerating in Settings **instantly revokes** the old key.

> Teammates: after pulling, run `cd server && npx prisma generate --schema src/prisma/schema.prisma`
> (a migration added `User.apiKeyHash`), and `npx prisma migrate deploy` if your DB is behind.

## Run it locally (dev-stub)

1. **Start the backend in dev-stub mode**, allowing the extension's origin (you'll get the id in
   step 3, then restart with it):
   ```sh
   cd server
   ORBIS_DEV_STUB=1 EXTENSION_ORIGINS="chrome-extension://<your-id>" npm run dev
   ```
2. **Load the extension:** Chrome/Edge → `chrome://extensions` → enable **Developer mode** →
   **Load unpacked** → select this `extension/` folder.
3. **Copy the extension id** shown on the card, put it in `EXTENSION_ORIGINS` (step 1), restart
   the server. (Until then, CORS blocks the extension — that's expected.)
4. **Use it:** right-click any link on any page → **"Check with Orbis"** → the popup opens and
   shows the verdict after the scan (~20–40s for a fresh URL, instant if seen before).

## Settings

Click **Settings** in the popup (or the extension's options page) to set:
- **API URL** — defaults to `http://localhost:3001`.
- **Auth token** — leave blank in dev-stub; paste your Orbis token in real mode.

## Files

| File | Role |
|---|---|
| `manifest.json` | MV3 manifest — context menu, storage, API/Gmail host perms, `web_accessible_resources` for the Orbo images |
| `background.js` | Service worker: registers the menu, stashes the target, opens the popup |
| `content-gmail.js` | Gmail auto-scan-on-open (top-right badge) + click guard |
| `api.js` | Backend calls (link scan + poll, sender report, email/URL routing). Mirrors `client/src/lib/api.js` |
| `popup.html/css/js` | The verdict UI — Orbo poses + system-themed, a plain-DOM mini `VerdictCard` |
| `options.html/js` | Save API URL / web app URL / token to `chrome.storage.sync` |
| `icons/` | Real Orbis planet-O toolbar icon (16/48/128, transparent) + `icon-source.svg` |
| `assets/` | Orbo poses + wordmark logos used by the popup and Gmail badges |

## Publishing

See `STORE_SUBMISSION.md` for the Chrome Web Store checklist. `host_permissions` already includes
the deployed API; bump `manifest.json` `version` before each store upload.
