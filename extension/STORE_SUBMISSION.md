# Chrome Web Store submission checklist — Orbis "Check with Orbo"

The gamble: submit now so the "Download Extension" button *might* become a real one-click
"Add to Chrome" by demo day. Review is usually a few days but can take 1–2+ weeks, so this is
best-effort upside — the "Load unpacked" path on the /extension page is the guaranteed fallback.

> Heads-up that's out of our hands: even once published, **enterprise-managed browsers**
> (e.g. Salesforce-managed Chrome) can still block install via policy. Mentors on managed
> laptops may not be able to install from the store regardless. Demo live in Brave to be safe.

## 1. One-time setup
- [ ] A Google account to own the listing (ideally a shared team account, not a personal one).
- [ ] Register as a Chrome Web Store developer: https://chrome.google.com/webstore/devconsole
      — **$5 one-time** registration fee.
- [ ] Verify the account (Google may require a publisher email + identity check; can add days).

## 2. Package
- [ ] Run `bash scripts/pack-extension.sh` → produces `client/public/orbis-extension.zip`.
      Upload THIS zip (the store wants a zip of the extension files, which is exactly what we build).
- [ ] Before packing, bump `version` in `extension/manifest.json` (store rejects a re-upload of the
      same version).
- [ ] Confirm `host_permissions` lists the PROD API (`orbis-api-z4vx.onrender.com`), not just localhost.

## 3. Listing content (prepare these before you start the form)
- **Name:** Orbis — Check with Orbo
- **Summary (≤132 chars):** Right-click any link or sender and Orbo checks it for phishing —
  an instant safety read before you click, powered by Orbis.
- **Category:** Productivity (or Tools).
- **Description:** what it does (right-click link/sender → verdict; inline Gmail pre-check), that a
  free Orbis account + API key connects it, and that it never sends email BODY content (privacy).
- **Screenshots (required, 1280×800 or 640×400):** at least one of the popup verdict and one of the
  inline Gmail badge. Use the ones we already have from testing.
- **Icon:** 128×128 (already in `icons/icon128.png`).
- **Privacy policy URL (required because we handle a URL/sender + an API key):** a short page on the
  Orbis site stating what's sent (the link/sender being checked, the API key), what's NOT (email
  body), and that data is used only to return a verdict. NEEDS TO EXIST before submission.

## 4. Permissions justification (the review form asks for each)
- `contextMenus` — add the "Check with Orbis" right-click item.
- `storage` — save the user's API URL + key locally.
- `host_permissions` (the Orbis API + mail.google.com) — call our API to get a verdict; read the
  clicked link in Gmail to pre-check it. Explicitly state we do NOT read message contents.
- Single purpose: "Check whether a link or email sender is a phishing/scam risk."

## 5. Submit
- [ ] Fill the form, upload the zip + assets, paste the privacy policy URL.
- [ ] Submit for review. Set visibility to **Unlisted** first if you only need the demo link (faster
      to share, avoids public-listing scrutiny), or Public if you want it discoverable.
- [ ] When approved: copy the store URL into `STORE_URL` in
      `client/src/features/auth/ExtensionInstall.jsx` → the page flips to a one-click "Add to Chrome".

## Realistic timeline
Registration + verification (0–3 days) → listing prep (hours) → review (few days to 2 weeks).
Start TODAY if you want any chance of it clearing before the demo. The Load-unpacked path ships now.
