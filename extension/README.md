# Orbis browser extension (G3·13)

Right-click any link (or selected text) → **"Check with Orbis"** → a popup runs the same
phishing check as the web app and shows the verdict card. It's a thin client over the existing
`/api/submissions` + `/api/indicators/:id` pipeline — no new backend logic.

## Auth model (dev-stub for now)

The extension sends `Authorization: Bearer <token>` exactly like the web app. In **dev-stub mode**
the server fakes one logged-in user, so **no token is needed** — that's what this build targets.
The paste-in token field (Settings) is wired for real-Clerk mode later; the token *type*
(app-issued API key vs. long-lived Clerk JWT) is the still-open decision.

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
| `manifest.json` | MV3 manifest — context menu, storage, host permission for the API |
| `background.js` | Service worker: registers the menu, stashes the target, opens the popup |
| `api.js` | The one place we call the backend (submit + poll). Mirrors `client/src/lib/api.js` |
| `popup.html/css/js` | The verdict UI — a plain-DOM mini version of the web `VerdictCard` |
| `options.html/js` | Paste + save API URL / token to `chrome.storage.sync` |

## Not done yet (follow-ups)

- **Real-mode token**: needs the auth-type decision (app-issued API key recommended) + a
  "copy token" button in the web app's Settings.
- **Publishing**: the `host_permissions` is `localhost` only; add the deployed API origin before
  shipping, and swap the placeholder icons for the real Orbo mark.
