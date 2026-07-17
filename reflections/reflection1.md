# Reflection #1 — Week 7: Capstone Sprint 1

Pod Members: **David Gonzalez-Cesar, Michael, Ozias**

## Reflection Questions

* **Name at least one thing that went well this sprint.**

We got all three vertical slices integrated on `main` and working against a shared Neon
Postgres DB — David's Check-Link + Verdict AI (Ask Orbo chat, scan pipeline, sender reports),
Michael's auth + data layer + dashboard, and Ozias's reports/notifications/escalation. The
whole app runs end-to-end: paste a link or email → real urlscan sandbox + Google Safe Browsing
+ Claude verdict → persisted, deduped, and shown in the chat. We also landed the full public
landing page and app-wide dark mode. Server test coverage grew from 52 → 96 as we added real
tests to the services layer that previously had none.

* **What challenges did your team face?**

Working on a *shared* database while integrating three slices caused the most friction — we
kept catching schema/migration collisions and role-assignment issues (users being seeded as
analysts when our primary focus is individuals). Coordinating destructive DB actions while a
teammate was live in the same DB meant a lot of "hold off until you confirm." We also hit the
usual merge churn from three people touching shared files (`AppShell`, `Landing.jsx`, the
theme tokens) — resolved cleanly by always fetching + checking for conflicts before pushing.

* **Did you finish all of your planned tasks? If not, what contributed to that?**

Mostly. The core check-link + verdict spine, sender reports, landing page, and dark mode all
shipped. What slipped was largely *scope discovered mid-sprint* rather than over-planning: the
verdict AI needed real hardening we hadn't fully specced (a deterministic scoring rubric, a
typosquat detector, fixing an AI that contradicted itself between the chat answer and the
report card). Those were the right things to build, but they weren't all in the original
sprint plan — so a few polish/QA items got pushed to Sprint 2.

* **Did your team update `project_plan.md` before beginning each feature? If not, what prevented it, and what will you change in Sprint 2?**

Partially, and honestly this is our biggest process gap. `project_plan.md` and its Decisions
Log are thorough and *were* updated for the big architectural calls (Clarke/Clerk auth, Safe
Browsing signal, two-phase verdict). But several smaller check-link fixes this sprint — the
deterministic rubric, the typosquat detector, the bare-domain/spacing parser fixes — were built
first and documented after (here and in `DAVID_SLICE.md`) rather than spec-first. What prevented
it: we were reacting to bugs we found while testing, so it felt faster to fix-then-document.
Sprint 2 change: for anything bigger than a one-line fix, add/confirm the `project_plan.md`
section *before* generating code, and make the spec commit part of "done."

* **Where did your implementation diverge from the spec? Was the divergence intentional? Did you update the spec and commit it?**

The biggest intentional divergence: the spec described the Verdict AI as "Claude turns evidence
into a 0–100 score + reasons," i.e. the model owned the number. We changed that to a
**deterministic weighted rubric** (`DANGER_WEIGHTS` in `verdict.js`) where code computes the
score and Claude only writes the words. This was a deliberate, well-reasoned change (reproducible,
auditable, testable — like VirusTotal/urlscan). We documented it in `DAVID_SLICE.md` and this
reflection, but we have **not** yet folded it back into `project_plan.md`'s AI Feature section —
that's a Sprint 2 spec-catch-up item we're logging honestly.

* **Where did Claude's output require significant revision? What was missing or misaligned with your spec?**

The clearest case: Claude, asked to both *score* and *explain* a check, produced verdicts that
contradicted its own evidence — e.g. it claimed "zon.com redirects to amazon.com" purely from
Amazon-style query params, and it gave the same LinkedIn sender "suspicious" in chat but "Safe
82" on the report card. The root cause was a spec gap: the spec never said *where the link
actually lands* was a required, separate fact — so the model guessed. We fixed it by capturing
the real redirect destination and making the score deterministic. Lesson that matches the
sprint theme exactly: vague spec → unpredictable AI output; tightening what counts as "evidence"
fixed it faster than re-prompting.

* **Which features and user stories are "at risk"? How will you adjust the plan?**

At risk: (1) **Email-forwarding pipeline** (inbound webhook → auto-review) — still a Wk-9 item,
untouched. (2) **Deploy** on Render, including swapping off the Salesforce LLM gateway (it's
POC-only) to a free provider. (3) **Sender-report accuracy in the "middle" tier** — the
deterministic layer reliably catches brand lookalikes and confirms real brands, but unknown
domains still lean on Claude's judgment (no MX/DNS/WHOIS/SPF signals yet). Plan: keep the
deterministic hardening going in Sprint 2 (expand the brand list, add sender DNS signals), and
treat vision (screenshot reading) as the last model-only feature to backstop before deploy.

* **Did the Decisions Log get updated during Sprint 1? Which decisions felt most worth recording?**

Yes — the Decisions Log in `project_plan.md` §10 is current for architectural decisions. The
ones that felt most worth recording: adding **Google Safe Browsing** as a free blacklist signal
(so we have a real "known-bad" check, not just the model), the **two-phase verdict** (AI now,
analyst later) for trust, and the **auto-escalate every org submission** flow. The gap we're
noting for Sprint 2: the *AI-hardening* decisions from this sprint (deterministic rubric,
typosquat detector) belong in the log too and aren't there yet.
