# Manual Test Checklist — Ozias's Slice (Recents, Reports, Notifications)

This covers the visual / interaction behaviors that aren't worth automating (focus
traps, `window.prompt`/`window.confirm`, layout, cross-page navigation). The pure
logic and API contracts are covered by the automated suites — run those first:

```bash
npm -w client run test    # client component/logic tests
npm -w server run test    # backend route/service tests
```

## Setup

```bash
npm run dev
```

- Server on **http://localhost:3001**, client (Vite) on **http://localhost:5173**.
- With no Clerk keys set, auth runs in **dev-stub mode**: you're auto-logged-in as the
  individual user "Dev User" (no login screen). The health check at
  `http://localhost:3001/api/health` should report `clerk: "dev-stub"`.
- To see **member / analyst** variants and real data (scores, reviews, notifications),
  seed the database and use a seeded org member:
  ```bash
  npm -w server run prisma:seed
  ```
  Seeded users include analyst **Priya S.** and members **David / Anya / Marcus / Sarah**
  (org "Acme Inc."), plus individual **Sofia**. Which seeded user the dev-stub maps to
  depends on `server/src/middleware/auth.js` — if the dev-stub individual shows no team
  data, switch the stub to a seeded org member to exercise the member views.

Watch the **terminal** (server logs) and the **browser console + Network tab** for errors
throughout.

---

## 1. Recents / chat history (left sidebar in AppShell)

- [ ] **New chat starts fresh** — click **New check**; the composer opens an empty thread
      (URL becomes `/ask-orbo?new=1`, then settles).
- [ ] **Auto-title** — send a message (e.g. paste `paypal.com`); the sidebar row titles
      itself **"Check paypal.com"**. A question titles itself as a tidied sentence.
- [ ] **Resume on navigation** — go to **Reports**, then back to **Ask Orbo**; the same
      chat is still open (not a blank one).
- [ ] **Deep-link survives refresh** — copy the `/ask-orbo?c=<id>` URL, **hard-refresh**
      the page; the thread is restored from localStorage.
- [ ] **Rename** — open a row's **⋯** menu → **Rename**; a `window.prompt` appears; the
      new title sticks and does **not** reorder the row.
- [ ] **Pin / Unpin** — **⋯** → **Pin**; the row floats to a **Pinned** group at the top
      and shows a **Pin** icon (not the Clock icon). Unpin returns it to its date group.
- [ ] **Pinned chat doesn't jump** — reopen a pinned (or any) chat; it does **not** move
      to the top just from being opened (only a new message reorders it).
- [ ] **Delete** — **⋯** → **Delete**; a `window.confirm` appears; confirming removes the row.
- [ ] **Search** — type in "Search your past chats…"; the list filters live and matches
      both titles **and** message text; clearing the box restores the grouped list.
- [ ] **Date-group headers** — with several chats of different ages, headers read
      **Pinned / Today / Yesterday / Previous 7 Days / Older** (only non-empty groups show).
- [ ] **Empty states** — a brand-new browser (clear localStorage) shows
      "Your past chats show up here"; a no-match search shows "No matching chats".

> Note: recents are stored **per-device** in localStorage (key `orbis.conversations.v1`),
> not on the server. Clearing site data wipes them. This is expected (owner comment in
> `client/src/lib/conversations.js` notes a future backend table).

---

## 2. Reports page (`/reports`)

- [ ] **My checks load** — the page lists your own submissions (needs at least one check;
      make one on the Home page if empty).
- [ ] **Verdict filter pills** — **All / Safe / Suspicious / Dangerous** filter the list.
      Confirm **"Suspicious"** shows the review-band items (yellow), not a literal "suspicious".
- [ ] **Empty states** — with no checks: "No checks yet…"; filter to a band with no matches:
      "No <band> reports."
- [ ] **Card → detail modal** — click a card title; the **ReportDetailModal** opens with the
      screenshot preview, score(s), safety analysis, and threat vectors.
- [ ] **Modal keyboard/focus** (jsdom can't verify these — check by hand):
  - [ ] **Escape** closes the modal.
  - [ ] Clicking the **dimmed backdrop** closes it.
  - [ ] On open, focus lands on the **close (X)** button; on close, focus returns to the card.
  - [ ] **Tab / Shift+Tab** cycles only within the dialog (focus is trapped).
  - [ ] Background page **doesn't scroll** while the modal is open.
- [ ] **Fetch fallback** — open a card, then in DevTools throttle/kill the network (or expect a
      bad id): the modal falls back to the list-row data and shows the "couldn't load full
      details" message under Threat vectors rather than crashing.

### Member / analyst variants (seeded org member)

- [ ] **My / Team History toggle** appears top-right (individuals do **not** see it).
- [ ] **Dual score** — cards show **ORBO SCORE** + an **ANALYST SCORE** block
      (a human number "Scored by <analyst>", or **"Pending" / "Scored by Orbo (AI)"** when
      unscored).
- [ ] **Team History privacy gate** — switch to **Team History**; only indicators an analyst
      has **shared with the org** (`sharedWithOrg`) appear. Un-shared org checks are hidden.
- [ ] **Lazy fetch** — in the Network tab, `GET /api/history?org=1` fires **only** when you
      first open the Team tab, not on page load.

---

## 3. Notification bell (top bar)

- [ ] **Badge** — with unread notifications (seeded), a red count badge shows on the bell.
      (No seeded notifications? The bell is simply empty — that's fine.)
- [ ] **Open clears the badge** — click the bell; the dropdown opens and the badge clears
      (marks all read locally).
- [ ] **Badge returns after reload** — refresh the page; the badge **comes back**. This is
      **expected** — mark-read is client-only today (`TODO(Ozias)` to PATCH
      `/api/notifications/:id/read`). Not a bug.
- [ ] **Row content** — each row shows a check-circle icon, the message, and a timestamp.
- [ ] **Empty state** — with no notifications, the dropdown reads "You're all caught up."
- [ ] **Click-outside closes** — click anywhere outside the open dropdown; it closes.

---

## 4. Sender report (Ask Orbo, email input) — smoke test

- [ ] In **Ask Orbo**, submit an **email address** (e.g. `bob@evil.com`). A verdict card
      renders (reusing `VerdictCard`) with a safety score, verdict, and evidence.
- [ ] **No API key?** If `ANTHROPIC_API_KEY` is not set in `server/.env`, expect a **503**
      from `POST /api/ask-orbo/sender-report` (check the Network tab). Record which case
      you hit — this endpoint needs a real key to produce a verdict.

> This file (`senderReport.js`) is David's; Ozias's branch only did a cosmetic
> function→arrow refactor, so behavior should be unchanged.

---

## Known gaps (expected — do NOT log these as failures)

1. **Notification mark-read isn't persisted** — the badge reappears after reload
   (`NotificationsContext.markAllRead` is optimistic/local; the PATCH is a documented TODO).
2. **`StatusChip` statuses are placeholders** — the closure statuses (pending review /
   investigating / confirmed …) are wired to demo/seed values; the analyst *write* route
   that sets real `review_status` and fires `createNotification` is a later slice.
3. **Recents are per-device** (localStorage), not synced across browsers/devices.
