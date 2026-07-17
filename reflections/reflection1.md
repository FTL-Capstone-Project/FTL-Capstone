# Reflection #1: Week 7 Capstone Sprint 1

Pod Members: **David Gonzalez-Cesar, Michael, Ozias**

## Reflection Questions

* **Name at least one thing that went well this sprint.**

We got all three parts of the app working together on `main`, running on one shared Neon
Postgres database. David built the Check-Link and Verdict AI (the Ask Orbo chat, the scan
pipeline, and sender reports). Michael built auth, the data layer, and the dashboard. Ozias
built reports, notifications, and escalation. The whole app now runs start to finish: you paste
a link or email, it gets scanned by urlscan and Google Safe Browsing, Claude writes a verdict,
and the result is saved and shown in the chat. We also finished the public landing page and
added dark mode. Our server tests went from 52 to 96 because we added real tests to the parts
that had none.

* **What challenges did your team face?**

Working on one shared database while combining three people's work caused the most trouble. We
kept running into schema and migration clashes, plus a role problem where users were being saved
as analysts when our main focus is individual users. Because we were all in the same database at
once, one person often had to wait and confirm before another ran anything that deletes data. We
also had normal merge friction from three people editing the same shared files, but we handled it
by always pulling and checking for conflicts before pushing.

* **Did you finish all of your planned tasks? If not, what contributed to that?**

Mostly yes. The main link-and-verdict flow, sender reports, landing page, and dark mode all
shipped. What slipped was mostly extra work we discovered while testing, not over-planning. The
Verdict AI needed real hardening we had not fully planned for, like a fixed scoring system, a
typosquat detector, and a fix for the AI contradicting itself between the chat answer and the
report card. Those were the right things to build, but they were not in the original plan, so a
few polish and testing tasks got pushed to Sprint 2.

* **Did your team update `project_plan.md` before beginning each feature? If not, what prevented it, and what will you change in Sprint 2?**

Only partly, and this is our biggest process gap. The plan and its Decisions Log are detailed and
were updated for the big architecture calls (using Clerk for auth, adding Safe Browsing, the
two-phase verdict). But several smaller fixes this sprint, like the fixed scoring system, the
typosquat detector, and the domain parsing fixes, were built first and written up after. The
reason was that we were reacting to bugs we found while testing, so it felt faster to fix first
and document later. Our Sprint 2 change: for anything bigger than a one-line fix, update or
confirm the plan section before writing code, and treat the spec commit as part of being done.

* **Where did your implementation diverge from the spec? Was the divergence intentional? Did you update the spec and commit it?**

The biggest change on purpose: the plan said Claude turns the evidence into a 0 to 100 score plus
reasons, so the model owned the number. We changed that so code computes the score from a fixed
weighted table and Claude only writes the words. This was a deliberate choice because it makes the
score repeatable, explainable, and testable, the way real scanners like VirusTotal and urlscan
work. We wrote it up in `DAVID_SLICE.md` and here, but we have not yet added it back into the AI
section of `project_plan.md`. That is a Sprint 2 catch-up item we are noting honestly.

* **Where did Claude's output require significant revision? What was missing or misaligned with your spec?**

The clearest case: when Claude was asked to both score and explain a check, it sometimes
contradicted its own evidence. It once claimed "zon.com redirects to amazon.com" just from the
Amazon-style parts of the URL, and it called the same LinkedIn sender "suspicious" in chat but
"Safe 82" on the report card. The root cause was a spec gap. The spec never said that where the
link actually lands is a required, separate fact, so the model guessed. We fixed it by capturing
the real redirect destination and making the score deterministic. The lesson matches this week's
theme: a vague spec leads to unpredictable AI output, and tightening what counts as evidence
fixed it faster than re-prompting.

* **Which features and user stories are "at risk"? How will you adjust the plan?**

At risk: (1) the email-forwarding pipeline (inbound email to auto-review) is still a Week 9 item
and untouched. (2) Deploy on Render, including moving off the Salesforce LLM gateway, which is
only meant for testing, to a free provider. (3) Sender-report accuracy in the middle range. The
code reliably catches brand lookalikes and confirms real brands, but unknown domains still lean
on Claude's judgment because we do not yet check DNS, WHOIS, or SPF/DMARC. Our plan: keep the
deterministic hardening going in Sprint 2 (grow the brand list, add sender DNS checks), and treat
vision (reading a screenshot) as the last model-only feature to back up before we deploy.

* **Did the Decisions Log get updated during Sprint 1? Which decisions felt most worth recording?**

Yes. The Decisions Log in `project_plan.md` is current for the architecture decisions. The ones
that felt most worth recording were adding Google Safe Browsing as a free known-bad check (so we
do not rely only on the model), the two-phase verdict (AI now, analyst later) for trust, and
auto-escalating every org submission to an analyst. The gap we are noting for Sprint 2: the
AI-hardening decisions from this sprint (the fixed scoring system and the typosquat detector)
belong in the log too and are not there yet.
