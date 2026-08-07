# Reflection #5: Week 10 Capstone Sprint 4 — Polish & Presentations

Pod Members: **David Gonzalez-Cesar, Michael Jissa, Ozias Tumimana**

## Reflection Questions

* **How was the pacing of the capstone project — too slow, just right, or too fast?**

Mostly just right, with one uneven stretch. Sprints 1 and 2 were the fullest — that's when the app
went from three separate pieces to one thing running on a shared Neon database, and then from a working
MVP to a deployed product on Render with a live URL. Those two weeks moved fast and felt productive.
The middle of the project (Sprint 3) felt slightly slow by comparison, mostly because a lot of the work
was polish and reconciliation rather than new features, and it's harder to feel momentum when you're
tightening scoring and fixing responsive layout bugs instead of shipping something visible. Sprint 4
was the right length for what it's for — cutting or disabling anything shaky, polishing the release, and
rehearsing the demo. If we changed anything, we'd have front-loaded a little more of the "make it real"
work (deploy, seed data, auth flows) into Sprint 1 so the last two sprints were pure polish instead of
polish plus catch-up.

* **To what extent did your plan change over the course of development? Knowing what you know now, what would you do differently if you were starting over?**

The vision stayed remarkably stable — Orbis was always "paste a suspicious link or email, get a
plain-English safety verdict, and give organizations an analyst who can override it." What changed was
almost everything about *how* we'd deliver it. The biggest pivots are all in the Decisions Log: we
dropped the original browser-extension/Slack-bot idea for a web dashboard after mentors flagged adoption
and rubric fit (Jun 24); we replaced hand-rolled email+password auth with Clerk once we realized we
didn't have to build auth, orgs, and invites ourselves; we ruled out Azure for inbound email (send-only)
and moved to a simulate-the-webhook demo path with SendGrid as the real path; and we un-deferred the
campaign detail page in Sprint 2. The single largest implementation change was the AI verdict: the Week 6
spec had Claude own the 0–100 score, and we deliberately moved the number to a fixed, weighted,
deterministic table so Claude only writes the words.

Starting over, we'd do three things differently. First, decide the auth provider (Clerk) and the deploy
target (Render) in Week 6, not Sprint 1 or 2 — those two choices reshaped the schema and the data-sync
model, and discovering them late cost us migration pain. Second, we'd design the score as deterministic
from day one instead of letting the model own it and then walking it back. Third, we'd keep the plan and
the slice docs in one place; splitting decisions across `project_plan.md`, `DAVID_SLICE.md`, and
`DESIGN_SPEC.md` meant some decisions lived in the wrong file and had to be reconciled later.

* **How did the spec-driven workflow hold up across the full project? When did maintaining `project_plan.md` save time or prevent confusion — and when did it feel like overhead?**

It held up best exactly where three people had to agree without talking constantly: the API contracts
(§6) and the data model (§5). Because the endpoint shapes and the two-layer global-indicator /
per-org-review model were written down, we could build our slices in parallel — David on the check-link
and verdict pipeline, Michael on auth and the data layer, Ozias on reports, notifications, and
escalation — without blocking on each other to ask "what does this response look like?" The role
derivation rules (no org = individual, in an org = member, analyst only when we explicitly set that on
the Clerk account) were clear enough to build against, though that last one drifted from what we first
wrote down — the early plan assumed an org admin would automatically be the analyst, and we ended up
gating the analyst role on an explicit flag instead so a normal team owner couldn't accidentally land in
the analyst cockpit. The Decisions Log saved us the most: every time something changed — Safe Browsing,
the trust floor, switching the LLM provider — we had a place to record *why*, so no one had to re-derive
the reasoning three weeks later or re-litigate a settled call.

Where it felt like overhead was the small reactive fixes. When we found a bug while testing — the fixed
scoring table, the typosquat detector, a domain-parsing fix — it felt faster to fix first and document
after, and often the "after" slipped. The honest tell is the git history: the plan was updated heavily in
Week 6 and Sprint 2, then went quiet, so a chunk of Sprint 3–4 behavior lived in code and slice docs
before it made it back into the canonical plan. The lesson we'd carry forward: keep the *architecture*
decisions in the spec religiously, but don't pretend every one-line fix needs a spec entry — the ceremony
only pays off above a certain size of change.

* **Where was Claude most useful during capstone development? Where did its output require the most revision, and what was missing from the spec when that happened?**

Claude was most useful for the plumbing between the pieces — wiring a React component through the
`api.js` client to an Express route to a Prisma query and back — and for writing the test suite, which
grew from 52 tests early in Sprint 1 to over 750 by the end (about 617 on the server, 134 on the client).
It was also genuinely helpful for explaining how one person's slice connected to the others', which
mattered on a team where each of us mostly stayed out of the others' files.

Where it needed the most revision was the AI verdict itself, and the root cause was almost always a spec
gap rather than a model failure. The clearest example: when Claude was asked to both *score* and *explain*
a check, it contradicted its own evidence — it once claimed "zon.com redirects to amazon.com" purely from
the Amazon-looking parts of the URL, and called the same LinkedIn sender "suspicious" in chat but "Safe 82"
on the report card. The spec never said that *where the link actually lands* is a required, separate fact,
so the model guessed. We fixed it by capturing the real redirect destination and making the score
deterministic. The pattern repeated with email scoring, where the model over-flagged benign messages until
we tightened the definitions — a delivered-package code isn't a phishing ask, and a greeting by first name
isn't the "Dear customer" tell. Every one of those revisions traced back to the spec being too vague about
what counts as evidence.

* **Looking back at the spec you wrote in Week 6 vs. the final state of `project_plan.md`: what changed, and what stayed stable? What does the git history of your planning file tell you about how the project evolved?**

What stayed stable: the problem statement, the three roles and personas, the two-phase verdict (AI now,
human analyst later), the "AI never hands raw SQL to the database" safety rule, and the core check-a-link
flow. Those were right in Week 6 and never needed to move. What changed was bigger than we expected. The
auth strategy went from email/password to Clerk, which made social login core and pulled in an
organizations model and org-scoping middleware. The inbound-email path went from Azure (which we found out
can only send, not receive) to a Gmail-plus-Apps-Script relay we built ourselves — the SendGrid "real
path" we wrote into the plan never actually got built, because the relay was free, needed no domain, and
gave us real Gmail deliverability. The AI score moved from something the model produced to something our
own code computes, with the model only writing the explanation. And the analyst's ask-the-data feature got
rebuilt entirely: we'd planned for the model to emit a locked-down filter object, and we ended up letting
it write real SQL against a locked-down, read-only view instead, with a parser guarding every query —
same safety goal, completely different mechanism. A couple of things we'd written off as cut actually made
it in by the end: the org-member dashboard variant and the analyst keyword-search endpoint both shipped in
the last stretch, after the earlier sprint reflections had already called them dropped.

The git history tells the story cleanly. There are 13 commits on the planning file, clustered in two
bursts: Week 6 (the initial draft, the wireframe alignment, the Clerk adoption, the data-model split) and
mid-Sprint-2 (the inbound-email provider call, Team History, the campaign detail page), with the last
substantive plan commit on Jul 27. That shape says the plan did its heaviest lifting up front while the
architecture was still fluid, then the code outran the doc in the final sprints — which is exactly why
this Week 10 reconciliation pass exists. There's even a stray "Hello → Goodbye" print-statement commit in
the history, a small reminder that not every commit to a planning file is a real decision.

* **How did the AI Feature Decisions Log hold up? Was it useful to have a running record of how the AI feature changed across sprints?**

Honestly, the *idea* was more useful than our execution of it. We seeded the AI Feature Decisions Log in
Week 6 with three real Sprint-0 decisions — keep the model away from raw SQL, force the verdict into valid
JSON, and feed the Safe Browsing result into the verdict as a hard signal. The safety intent behind all
three held, but the mechanisms drifted: the "whitelisted filter" idea got rebuilt into an
LLM-writes-guarded-SQL engine, and "structured outputs" became prompt-instructed JSON with a rule-based
fallback. The bigger problem is the log basically stopped after Week 6. The AI feature changed a lot after
that: the score moved from model-owned to a fixed weighted table, we added a typosquat detector,
SPF/DKIM/DMARC signals, a reputation trust floor, capturing where a link actually lands after redirects,
three-part email scoring, a Vision path that reads a screenshot, and a separate conversational Ask Orbo.
Almost none of that landed in the *AI Feature* Decisions Log while it was happening — it lived in the main
Decisions Log, in the scoring-calibration notes, and in code comments instead. So the running record was
useful as a template and for the decisions we did capture, but the discipline of updating it every sprint
didn't hold, and that's the gap this final reconciliation is closing — we went back through the whole
history and rebuilt the AI log so it matches what actually shipped. The takeaway for next time: one
decisions log, not two, so AI decisions don't fall between the cracks — or a hard rule that the AI log
gets updated in the same commit as the AI behavior it describes.

* **How helpful were the labs and weekly assignments in preparing you for capstone work? What topics do you still have questions about?**

The weekly rhythm mapped well onto the capstone. The spec-driven-development framing (writing the plan in
Week 6, the endpoint sketch in Week 4, the running Decisions Log and Spec Reconciliation habit) is the
thing we leaned on most, and it's the skill we'd say transferred most directly. The PERN-stack labs gave
everyone enough shared vocabulary — components, props/state, an API call, a Prisma query, error handling —
that we could each own a full vertical slice and still read each other's work.

The topics we still have open questions about are the ones that only really surface at integration and
deploy time and were lighter in the labs: managing a *shared* database across three people (schema and
migration clashes were our biggest Sprint-1 pain), production migration workflows (a column added to Neon
by hand before the migration was recorded caused `migrate deploy` to fail with "column already exists" on
Render, and the API silently stayed on old code for days), and the specifics of a managed-auth provider —
Clerk's `useSignIn`/`useSignUp` ticket strategy and the `setActive`-vs-`navigate()` race that bounced
logged-in users back to the landing page. Those we learned by hitting them, not from a lab.

* **Which resources were most helpful during the capstone — mentors, pod syncs, wireframes, sprint planning, the bug bash, or something else?**

Mentors and the wireframes were the two that shaped the product most. The mentors' Jun 24 feedback is why
we pivoted off the browser extension to a web dashboard, and the Jul 1 pod sync is where we committed to
the email-forwarding pipeline — two calls that defined the whole project. The wireframes stayed useful far
longer than we expected: they were still the source of truth in Sprint 2 for the analyst dashboard and the
role-tailored Reports pages, and "check the wireframe before building a screen" settled a lot of small
layout debates without discussion. Sprint planning and the pod syncs were where we did the honest triage —
naming at-risk stories, deciding what to cut rather than demo broken, and rehearsing the presentation.
And the one resource we underrate is our own `project_plan.md`: having the API contracts and data model
written down was the difference between three people building in parallel and three people constantly
interrupting each other.
