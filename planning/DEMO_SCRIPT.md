# Orbis — Final Intern Demo · Run-of-Show & Script

**Length:** 6–8 min (target ~7:00) · **Presenters:** Michael, David, Ozias
**Deck:** `Orbis_Capstone_Final.pptx` (9 slides) · **Demo:** live on `orbis-client-8yu1.onrender.com`, **all pre-loaded — no live scans**

> **The instructor rule we're following:** don't tour features on slides and then show the same features again in the demo. So the slides *before* the demo are **framing only** (problem → how it works → who it's for); **every feature is shown inside the live demo**; the slides *after* the demo are the things you *can't* click (the deterministic core), the honest roadmap, and the conclusion.

---

## 1) Run-of-show at a glance

| # | Slide | Who | ~Time | Purpose |
|---|-------|-----|------|---------|
| 1 | Title | **Michael** | 0:15 | Who we are, one-line what Orbis is |
| 2 | The problem | **Michael** | 0:35 | The human gap + "you report and hear nothing" |
| 3 | How Orbis works | **Michael** | 0:20 | Submit → Detonate → Explain (mental model) |
| 4 | Three experiences | **Michael** | 0:25 | Individual / Member / Analyst → hand to demo |
| 5 | **LIVE DEMO** | **David → Ozias → Michael** | ~3:45 | Every feature, in the real app |
| 6 | Under the hood | **David** (Michael adds) | 0:40 | Deterministic core + AI narrator (the un-clickable idea) |
| 7 | What's next | **Ozias** | 0:25 | Honest roadmap (most of it already ships) |
| 8 | Conclusion | **Michael** | 0:35 | Restate problem → how we solved it |
| 9 | Thank you / Q&A | **All** | — | Open the floor |

**Speaking balance (talking time, excludes demo clicking):**
Michael ≈ 2:30 · David ≈ 2:10 · Ozias ≈ 2:05. Michael is ~20s heavier **only because he brackets the talk** (open + close) — that reads as intentional, not uneven. *If you want it dead-even:* give Ozias the conclusion (slide 8) instead of Michael. **If you're running long,** slide 3 is the first thing to cut — it's re-shown live in the demo anyway.

---

## 2) The turn-taking rule (so you look organized)

- **One driver at a time.** Whoever is talking also has the mouse. No talking over the driver.
- **Hand off with a named cue** — end your part with the next person's name. Those cues are written into each script below in **`»`** lines.
- **Slide vs. mouse:** the demo divider (slide 5) is just a placeholder — during the demo you're in the browser. Alt-Tab back to slide 6 when the demo ends.

---

## 3) Per-person scripts

> These are *talking points, not a teleprompter.* Say them in your own words and look up. "Say something like" throughout.

### 🟢 MICHAEL — opens (slides 1–4), closes (slide 8), demos dashboard + Ask-the-data

**Slide 1 — Title (0:15)**
> "Hi, we're Team DOMinion. This is **Orbis** — AI-assisted phishing triage. It's **expert-grade for the analysts** who triage threats, and **one-tap simple for everyone else**. We'll show you the problem, then take you straight into the live product."

**Slide 2 — The problem (0:35)**
> "Phishing is the number-one way breaches start — one click can detonate on your machine. But here's the gap we cared about: the people most targeted — students, retirees, small teams — have the least help. And the analysts who *could* help are drowning in the queue. So today, if you report a suspicious link… you usually hear **nothing** back."

*(That last line sets up the whole demo — the closure loop. Let it land.)*

**Slide 3 — How Orbis works (0:20)** *(cut this first if long)*
> "The model is three words: **submit, detonate, explain.** You paste a link or forward an email; we open it safely in a sandbox so it never touches your machine; you get a plain-English verdict and a 0-to-100 score with the reasons."

**Slide 4 — Three experiences (0:25)**
> "One codebase serves three people. An **individual** just wants 'is this safe?'. An **org member** gets that *plus* a safety net — their report automatically escalates to their analyst. And the **analyst** gets the cockpit: a triage queue, campaign clustering, an authoritative review that **overrides the AI**, and they can ask the threat data questions in plain English. Rather than walk more slides — let's show you all of it live. **David's going to start.**"
> **`»` Hand to DAVID. Bring the browser up now.**

---

### 🔵 DAVID — demos the verdict flagship, then leads slide 6

**DEMO BLOCK 1 — Check a link (~1:30).** *All results are pre-loaded — you're opening existing scans, not waiting.*
1. Open the app (already signed in). "This is the everyday view — paste a link, get an answer."
2. Open the **pre-scanned DANGEROUS result**. Walk the **verdict card**:
   > "Here's a link someone checked. We detonated it in a sandbox — here's the **screenshot**, so nobody had to open it. The score is **17 out of 100, DANGER** — and notice it's a word *and* a color *and* an icon, not just red. And here's the **plain-English why**: known-bad host, a credential-harvest form."
3. Open the **pre-scanned SAFE result** to contrast:
   > "Same flow, different answer — **82, SAFE**: legitimate domain, valid certificate, no redirects."
4. *(Optional, only if time — the email path)* Open the **forwarded-email result**:
   > "It's not just links — you can **forward a suspicious email** and we score the sender, the body, and every link inside it."

> **`»`** "That's the flagship. **Ozias is going to show what happens *after* you get that verdict** — because a verdict alone isn't the whole story." **Hand to OZIAS.**

**Slide 6 — Under the hood (0:40)** *(after the demo returns to slides)*
> "One thing you can't see by clicking, and it's important for a *security* tool: **our code owns the score.** It's a deterministic rubric — the AI only writes the *explanation*. It can polish the wording, but it can **never move a known-bad link into 'safe'.** So even if the model has a bad day, the math holds."
> *(Michael adds the data-layer line — see his part.)*

---

### 🟣 OZIAS — demos the closure loop, then leads slide 7

**DEMO BLOCK 2 — The closure loop (~1:45).** *This is the "from silence to an answer" story. Use the prepared member + analyst accounts.*
1. As the **org member**, open **Reports / history**. Point to a submission sitting at **"pending review"**:
   > "When I'm an org member and I check a link, it doesn't just give *me* an answer — it **automatically escalates** to my security team. Here it is, waiting for review."
2. Switch to the **analyst account** (prepared tab/window). Open the **triage queue**:
   > "Now I'm the analyst. This is the queue — submissions across the org, **grouped into campaigns** and prioritized. Here's the one that just came in."
3. Open that item → open the **review form**. Set **score + status "confirmed malicious" + share-with-org**, submit:
   > "I record an **authoritative verdict**. This is the part that matters: **my human review overrides the AI's guess** — and I can share it with the whole org."
4. Switch **back to the member** → show the **confirmed verdict** and the **notification in the bell**:
   > "And back on the member's side — they don't hear silence anymore. The verdict is confirmed, and they get **notified**. That's the loop closing."

> **`»`** "So that's the whole product, working today. Let me hand to **Michael to show it at scale** — the analyst dashboard and asking the data questions." **Hand to MICHAEL.**

**Slide 7 — What's next (0:25)** *(after the demo returns to slides)*
> "Quick note on the roadmap — most of what you'd normally *promise* here, we've **already shipped**: link and email triage, all three roles, the analyst override, notifications, ask-the-data, campaign clustering, even a **browser extension** that scans Gmail inline. What's genuinely next is reach and polish — **publishing** the extension, **real-time push** alerts (today it's in-app plus emailed reports), and **enterprise SSO**."

---

### 🟢 MICHAEL — demos dashboard + Ask-the-data (end of demo), then closes

**DEMO BLOCK 3 — Scale + the 2nd AI feature (~0:50).** *Stay on the analyst account.*
1. Open the **analyst dashboard**:
   > "This is the analyst's home — org-wide stats, the trend over time, the mix of verdicts, and the campaign groups. Everything you just watched Ozias create flows into here."
2. **Ask-the-data**, on the **dashboard chat rail** (not the Insights page — see prep note):
   > "And our second AI feature — analysts can just **ask the data in plain English.**" *Type:* **"How many dangerous links did we catch this week?"** → read the answer + cards it returns.
   > "No SQL, no waiting on an engineer — and it's a **validated query**, never raw SQL from a model."

> **`»`** "Let me bring it home." **Alt-Tab back to slide 6, deliver the data-layer line, then advance to slide 8.**

**Slide 6 add-on — data-layer line (0:10)** *(right after David's deterministic-core line)*
> "And two layers make it scale *and* stay private: every unique URL is scanned **once** and shared, but each organization only ever sees **its own** submissions and reviews."

**Slide 8 — Conclusion (0:35)**
> "We started with **silence** — you report a link and hear nothing. Orbis turns that into an **answer**: paste or forward, get a plain-English verdict anyone can act on — and when an analyst confirms it, the person who reported it **finally gets told**. Our code owns the score; the AI just narrates. **Expert-grade triage, made one-tap simple.** Thank you — we'd love your questions."

**Slide 9 — Q&A (all).** Keep the app up so you can answer "show me X" live.

---

## 4) Demo click-path (single card — print this)

**Everything pre-loaded. No live scans. No SSO button.**

```
DAVID     1. Everyday view (signed in)
          2. Open DANGER result   → score 17, screenshot, "why"
          3. Open SAFE result     → score 82, contrast
          4. (opt) Email result   → forwarded email, 3-part score
OZIAS     5. Member → Reports     → item at "pending review" (auto-escalated)
          6. Analyst tab → Triage queue (campaign-grouped)
          7. Open item → Review form → score + "confirmed malicious" + share → submit
          8. Back to Member       → confirmed verdict + bell notification
MICHAEL   9. Analyst dashboard    → stats, trend, donut, campaigns
         10. Ask-the-data (dashboard rail) → "How many dangerous links this week?"
```

---

## 5) ⚠️ Demo-prep checklist (do this BEFORE you present — these are real traps in our setup)

- [ ] **Pre-load the analyst org with data.** Our **prod analyst org is near-empty** — with no submissions the dashboard, queue, and campaigns look **bare**. Submit/seed several results into that org ahead of time so every analyst screen is full.
- [ ] **Use an account that is actually an analyst.** Analyst role isn't automatic — the account needs Clerk `publicMetadata.orbisRole = "analyst"`. A normal org login lands on the **member** view, not analyst. Confirm the prepared analyst account lands on the analyst dashboard.
- [ ] **Have the item for the closure demo staged at "pending review"** (so Ozias can review it live). Don't confirm it beforehand.
- [ ] **Two windows/tabs ready:** one signed in as the **member**, one as the **analyst** — so the switch in Block 2 is instant.
- [ ] **Warm the site 3–5 min before.** Render free-tier cold-starts; hit the URL so the first click isn't a spinner.
- [ ] **Ask-the-data → use the DASHBOARD chat rail**, not the Insights page. On the dashboard the answer is prose + cards (reliable). Some Insights chart prompts (heatmap / weekly report / trend) currently fall back to a plain bar/table.
- [ ] **Notifications poll** (not instant) — after Ozias submits the review, the member's bell may take a few seconds / a refresh to show it. Don't panic; refresh if needed.
- [ ] **Do NOT click "Sign in with SSO"** — enterprise SAML isn't configured; it errors.
- [ ] **Do NOT submit a brand-new URL** live — a fresh sandbox scan takes 10–75s. Only open pre-scanned results.
- [ ] Full-screen the browser, zoom to ~110–125% so the back row can read the verdict card.

---

## 6) Q&A prep — likely questions + honest answers

- **"Is this just ChatGPT wrapping?"** → No. The **score is deterministic** — our own rubric in code. The AI only writes the explanation and can't override the math; a known-bad link can never read "safe."
- **"How do you keep the AI from hallucinating a verdict?"** → Deterministic score + a rule-based fallback if the model fails + a hard floor for confirmed-bad hosts.
- **"Is the analyst view real-time?"** → Notifications are **in-app today, plus emailed reports**; real-time push is the next step. Be upfront — it reads as an upgrade, not a gap.
- **"Do the campaigns cluster automatically?"** → Today campaigns are grouped from prepared/seeded data; **auto-clustering new submissions** is on the roadmap.
- **"Enterprise SSO?"** → The button's in the UI; the SAML connection isn't configured yet — it's the "Next" column.
- **"How is org data isolated?"** → Server-side, every query scopes to your org; cross-org reads return not-found. Global threat intel is shared and deduped; verdicts/reviews are private per org.

---

## 7) Ownership crib (who built what — if a manager asks "whose is that?")

- **Michael** — auth (Clerk + dev-stub), the app shell / role-aware nav, the 7-table Prisma schema + seed everyone reads from, the personal & analyst **dashboards**, and the **Ask-the-data** LLM-to-validated-SQL rearchitecture.
- **David** — the check-link flagship: `POST /api/submissions`, the urlscan + Safe Browsing sandbox, the **deterministic verdict + score**, Vision (read a screenshot), and the browser extension.
- **Ozias** — the **closure loop**: Reports/history, the **escalation write**, the analyst **review endpoint** that overrides the AI, **notifications**, the **email-forwarding pipeline** + emailed reports, and the Insights report-charts.
