# Orbis — Design Spec (derived from high-fidelity wireframes)

> Source of truth for the **visual build**. Derived by studying all 32 hi-fi wireframes in
> `client/Wireframes/` (All / Personal / Organizational / Analyst). The final UI should match
> these. Product = **Orbis**; in-app assistant/mascot = **Orbo**.

## Scoring convention (CONFIRMED)
**One safety score, 0–100, where 100 = safe / 0 = dangerous** (high = good). The exact numbers
in the wireframes are placeholder samples, not real. Bands:
- **Safe** = green, high score (≈67–100)
- **Suspicious / Review** = amber/gold (≈34–66)
- **Dangerous** = red (≈0–33)

## Brand
- **Orbo mascot:** navy-blue planet-robot, Saturn ring, glowing cyan eyes. Emotional variants map
  to `client/src/assets/orbo/`: `orbo-happy`/`orbo-wave` (default), `orbo-safe` (green shield),
  `orbo-caution` (Suspicious), `orbo-danger` (red shield/blocking), `orbo-thinking` (scanning spin).
- **Logo:** "Orbis" wordmark, the **O is a ringed planet**, navy text.
- **Voice:** first-person from Orbo, plain-English, reassuring ("Great news — this link is safe",
  "I'd recommend not clicking it").

## Color tokens (approx — reconcile with `client/src/theme/tokens.css`)
- **Primary blue** `~#2563EB` — buttons, active nav, links, user chat bubbles, progress bars
- **Navy/ink** `~#0F172A` — headings, logo
- **Safe green** `~#16A34A` · **Suspicious amber** `~#CA8A04` · **Danger red** `~#DC2626`
- **Canvas** `~#F8FAFC` light gray; **cards** white; **sidebar** white
- **Verdict cards** use a full-bleed verdict-tinted bg (mint / cream / rose)

## App shell (all authenticated screens)
- **Left sidebar (~260px, white):** Orbis logo → [Org switcher "Acme Inc. ▾" — org/analyst only] →
  **+ New check** (blue) → "Search your past checks…" → role nav → **RECENTS** list → **Settings** (bottom).
- **Nav by role:**
  - **Personal / Org member:** Home (*Chat with Orbo*) · Dashboard (*Your safety stats*) · Reports (*Full check history*)
  - **Analyst:** Dashboard (first/default) · Ask Orbo (*Chat with Orbo*) · Reports — **no Home**
- **Top-right (all screens):** inbox/tray icon + badge, notification bell + red dot, circular user avatar (initial).
- Nav item = icon + title + gray subtitle. Active item = light-blue pill, blue text/icon.

## Core flow — Home is a CHAT with Orbo (not a plain form)
1. **Empty state:** large Orbo, "Hi {Name} 👋" (org: "Hi {Name} · {Org} 👋"), "Paste anything
   suspicious and I'll check it for you", 3 prompt chips (Check a link / Is this email a scam? /
   Verify a sender), bottom input "Paste a link or email address…" with 📎 attach + blue send.
2. **Submitted:** user link = blue chat bubble (right-aligned).
3. **Checking:** Orbo "Checking this link… •••" typing bubble; title bar "Check Link — Checking";
   send button becomes stop ■.
4. **Result:** VerdictCard renders **inline in the chat**, on a verdict-tinted bg.
5. **Invalid:** Orbo replies "Hmm, that doesn't look like a link or email address…".

## VerdictCard (one data-driven component, 3 states)
Layout: verdict pill (top-left, e.g. "✓ Safe" / "⚠ Review" / "⛔ Danger") · **score ring** (top-right,
colored, `N/100` + "Confidence: High/Medium/Low") · Orbo's plain-English sentence (deceptive domain
highlighted amber/red) · **urlscan.io screenshot** (dashed placeholder box, verdict-colored border) ·
"WHY ORBO FLAGGED/CHECKED THIS" evidence bullets with per-item colored dots · action buttons.
- **Safe:** "✓ Looks good" (green) + "Ask Orbo more" (blue outline)
- **Suspicious:** "Report it" (amber) + "Mark safe" (amber outline) + "Ask Orbo more"
- **Danger:** "Report it" (red) + "Ask Orbo more"

## Dashboard (3 variants, shared skeleton)
4 stat tiles → 2 charts (bar "submission history/trends" + **donut** Safe/Suspicious/Dangerous %) →
right rail (Activity feed + inline Ask-Orbo mini-box).
- **Personal** ("My Dashboard"): My checks this week · Threats found · My safety score · Checks
  remaining (e.g. 47/50 w/ progress bar); "My Recent Submissions" list; rail = "My Activity".
- **Org member** ("Organization Dashboard"): Team checks · Threats detected · Active members (26/30)
  · Org safety score; **Member Overview table** (member · checks · threats · safety score) +
  "Manage Team"; rail = "Team Activity" + "Generate team summary".
- **Analyst** ("Analyst Dashboard"): Total checks · Threats detected · **Pending review (38)** · Avg
  analyst score; **"Pending Your Review"** queue (title · by-whom · Orbo score · [Analyst score |
  "Pending"]); rail = "Recent Activity" + "Generate weekly report" / "Assign batch to team".

## Reports (3 variants)
Search bar + filter chips (Mass Reported · Campaigns · Dangerous · Suspicious · Safe · This Week ·
Emails · Links · Confirmed by Analyst · Pending Review) + Filters. Row = thumbnail + title + verdict
pill + "Reported by {avatar} {Name} · {date}" + snippet + tags (e.g. "Credential phishing",
"Campaign: Bank impersonation") + right-side score(s).
- **Personal:** "My History" only; single Orbo score; the **lightest** view. Individuals have **no
  team and no analyst**, so build this WITHOUT teammate names, "Reported by {other person}",
  "Campaign:" tags, dual/Analyst scores, or the "Confirmed by Analyst" / "Pending Review" /
  "Team History" / "Mass Reported" filters. The current Personal wireframe mistakenly reused org
  content — ignore that; the stripped-down version above is correct. (Confirmed by Michael 2026-07-13.)
- **Org member:** **My History / Team History** toggle; **dual score (Orbo + Analyst)**; "Scored by
  {Name}" or "Pending".
- **Analyst:** subtitle "Organization-wide view"; shows reporter dept ("Sarah K. (HR)"); "Waiting for
  review" state; defaults to **Pending Review** filter.

## Report detail modal (role-differentiated)
Centered white modal over dimmed bg. Header: title + verdict pill + ✕. Browser-chrome screenshot mock
(malicious domain shown in red). Score block:
- **Personal:** single "Orbo score N/100 · Scored by Orbo (AI)".
- **Org / Analyst:** two side-by-side cards — **Orbo score** + **Analyst score** ("Scored by {Name}").
Then "Safety analysis" paragraph + **"Threat vectors"** (labeled horizontal blue bars: e.g. Credential
harvesting 95%, Brand impersonation 88%, Newly registered domain 82%, Urgency manipulation 70%).
- **Analyst only:** **"Analyst Review" form** — notes textarea, "Your Score /100", "Verdict" dropdown,
  blue **Submit Review**; prior analyst review shown below (avatar, date, verdict pill, notes). This is
  the two-phase-verdict authoring UI.

## Ask Orbo (analyst only) — AI dashboarding
Chat like Home but "Ask Orbo to build a report…"; chips (Weekly threat report / Batch summary / Top
risks this week). Orbo renders **rich widgets inline in chat**, each followed by contextual action
chips. **6 variants seen:**
1. **Score distribution** — bar histogram, red→amber→green buckets, legend w/ counts + %.
2. **Weekly Threat Report** — Share / Export PDF, stat row (Total/Dangerous/Suspicious/Safe), stacked
   daily bars, "Top threats this week" table, "Key findings".
3. **Submission Activity Heatmap** — day × hour grid, red intensity, Low→High legend.
4. **90-Day Threat Trend** — multi-line chart by attack type + trend deltas (↑41% etc.).
5. **Active Threat Campaigns** — ranked bars + table (Campaign · Items · Avg score · Trend ·
   Status: Active/Monitoring/Contained).
6. (Score distribution variant / dashboard-style composite.)

## Auth screens
White centered card on soft gradient; Orbis logo; hero Orbo mascot. **Social-first:** "Continue with
Google", "Continue with Apple", "Sign in with SSO" (work) → divider "or" → email/password. Sign-up:
"At least 15 characters". Variants: Personal sign-in / create-account; **Org sign-in shows "{Name}
invited you to join {Org}" banner**; **CreateTeam** 2-step (Step 1: company name + work email +
password + "auto-add anyone with your company email" domain toggle; Step 2: invite teammates / Skip
for now). Footer: "🔒 Protected by Orbis. We never share your data."

## Open design questions
1. Auth is Clerk components (per plan) — these hand-drawn auth screens are the *styling target* for the themed Clerk components, not hand-built forms.

## Interaction details & flows (verbal walkthrough, 2026-07-13)
- **Collapsible sidebar:** clicking the **Orbis logo** toggles the sidebar open/closed.
- **Chat model:** the Home chat is a full conversational interface (ChatGPT/Gemini/Claude-style),
  **powered by Claude**. **+ New check** starts a **new chat**. **Search** searches past chats.
  **RECENTS** = recent chats. Chat input supports **attachments** (📎) + recommended prompt chips.
- **Settings:** exists (bottom of sidebar) but contents are **TBD**.
- **Top-right icons (profile / notifications / inbox):** for **individuals**, exact behavior is TBD.
  For **org/analyst**, the **notification bell** is the notifier for new **Orbo / analyst / team
  updates** (e.g. "an analyst scored something you reported").
- **Org reporting → analyst flow:** when an **org member** reports something → it goes to **Orbo**
  (AI score) → then **both the report and Orbo's score are sent to the org's analysts instantly**.
  When an **analyst scores/overrides** it, the **reporter is notified** and can then view the analyst
  score too. (This is the two-phase verdict + notification loop.)
- **Report modal opens on card click** (all roles); analyst modal includes the editable Analyst
  Review form.

## Roles & account model (verbal walkthrough, 2026-07-13)
Four roles: **individual · member · analyst · admin**.
- **Individual (Personal):** self-service signup with **any email**; standard generic login/signup UX
  (the wireframes also show Google/Apple/SSO options). No org. Lightest views.
- **Member (Organizational):** **cannot self-create** an org account — can only log in once an **admin
  has granted them access** to the team. Reports auto-route to analysts (see flow above).
- **Analyst:** a security analyst at the org. Receives reports; can **score and override Orbo's
  score**; has **admin-level access to the team's data**. Nav leads with Dashboard + Ask Orbo (no Home).
- **Admin:** creates the organization (via the CreateTeam 2-step flow), then **invites analysts and
  members**. "Manage Team" (Org Dashboard) is the admin surface. Admin has everything an analyst does
  plus membership management.

See CLAUDE.md → "Authentication model" for the recommended implementation.

## Resolved
- **Personal Reports scope (2026-07-13):** individuals have no team and no analyst → the Personal
  Reports/Dashboard views are stripped of all teammate/campaign/analyst content. The org content in
  the Personal wireframe was a mistake.
- **Score direction:** one safety score 0–100, 100 = safe (re-confirmed).
