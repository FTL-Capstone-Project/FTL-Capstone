# User Stories

Team Name: **DOMinion**

Project Name: **PIPbot**

Pod Members: **Michael Jissa, Ozias Tumimana, David Gonzalez-Cesar**

## Problem Statement

Phishing is the most common entry point for scams and breaches, and the moment someone receives a suspicious link is the moment of risk *and* uncertainty. For most people the only options are to click and hope, ignore it and maybe miss something real, or — if they have an IT team — report it into a black hole and wait for it to be removed if it's a true positive. The people who need help most often have the least of it: individuals, students, and small companies are heavily targeted precisely because they have looser defenses and no dedicated security team to ask.

Even organizations that *do* have a security team struggle. Analysts are buried under a flood of reports — most of them harmless — and re-investigate the same attack because duplicate reports may not be grouped. Large enterprises have expensive, intricate tooling and big teams for this; small companies and startups don't, so a single phishing wave can bury a one-person security team.

PIPbot acts as a personal security analyst for anyone who needs one. A user submits a suspicious URL or forwards an email and gets an instant, plain-English safety report — including a screenshot of the page detonated safely in an isolated sandbox and a 1–100 safety score — without ever opening the link themselves. For users backed by a security team, the report is forwarded to analysts whose authoritative human verdict is logged alongside the AI's; for everyone else, the instant AI verdict stands on its own. Analysts — especially at small organizations — get a lightweight triage workspace that auto-scores reports, groups related attacks into campaigns, and answers questions about the threat history in plain language.

**Target audience:** individuals and students protecting themselves, employees at organizations of any size, and the security/IT analysts who triage reported threats.

## User Roles

- **Individual**: a person using PIPbot on their own to vet suspicious links, messages, or webpages for themselves, with no organization or security team to fall back on.
- **Employee**: a member of an organization who receives suspicious links or emails at work and wants to know whether they are safe before acting on them.
- **Security Analyst**: a member of a security/IT team — often the only one at a small company or startup — who investigates reported threats, issues authoritative verdicts, and monitors the organization's threat landscape.

## User Personas

### Individual Personas

**Sofia — the college student**
Sofia is a 20-year-old university student in Phoenix, Arizona. Her inbox is a constant stream of scholarship offers, paid-internship invitations, and financial-aid notices — and scammers know students are broke, trusting, and easy to target, so many of those messages are fake. She has no campus IT desk that will answer her in real time, and she doesn't want to fall for a fake "tuition refund" link that steals her bank login. Her motivation is a fast gut-check she can trust; her pain point is that a real internship offer and a scam can look identical and she has no one to ask.

**Robert — the online thrifter**
Robert is a 63-year-old retiree in Tampa, Florida who shops online and manages his savings from his laptop and phone. He gets a steady drip of "your package couldn't be delivered," "your bank account is locked," and too-good-to-be-true deal links, and he likes to browse unfamiliar online stores for bargains. He isn't confident with technology, has no IT person in his life, and is afraid of downloading malware or getting his information stolen. His motivation is a trustworthy second opinion before he taps a link or visits an unfamiliar site; his pain point is that he can't tell a legitimate site from a convincing fake, and "just don't click" isn't practical advice.

### Employee Personas

**Maria — the cautious employee with a security team**
Maria is a 52-year-old HR coordinator at a mid-sized company in Cleveland, Ohio. She lives in her inbox, receiving résumés, invoices, and benefits notices from people she's never met, so she can't just ignore unfamiliar senders. She's careful but not confident with technology. Her motivation is peace of mind — she's terrified of being the employee who clicks the link that takes the company down — and knowing a real expert has her back. Her pain point is that when she reports something to IT she never hears back, so she never learns whether it was actually a malicious attack or not.

**Deshawn — the fast employee with no security team**
Deshawn is a 29-year-old sales rep at a 30-person startup in Austin, Texas that has no dedicated security team at all. He's on the road constantly, works almost entirely from his personal laptop, and receives dozens of links a day — calendar invites, shared docs, prospect sites — often clicking before thinking. He's comfortable with technology but impatient with anything that slows him down. His motivation is speed with a safety net: since there's no IT department to protect him, he needs an instant expert verdict without leaving his current window. His pain point is that "report to security" isn't even an option where he works, so today he just takes the risk.

### Security Analyst Personas

**Priya — the startup's first security hire**
Priya is a 34-year-old analyst who is the *only* security person at a fast-growing 50-person startup in Toronto. She doesn't have the expensive, intricate systems that big enterprises rely on — it's just her, a laptop, and a shared inbox. Her motivation is leverage: handling the whole company's reports without a team behind her. Her pain point is that she gets countless false positives and when a phishing campaign hits, the same malicious link gets reported by twenty coworkers, and with no logging system in place, she has to triage each one as a separate fire.

**Tom — the accidental security lead**
Tom is a 41-year-old IT generalist at a 60-person nonprofit in Denver who inherited "security" on top of managing laptops, accounts, and the help desk. He's technical but not a phishing specialist and handles threats reactively between other tickets. His motivation is to let tooling do the heavy analysis for him and answer leadership's questions ("are we being targeted?") without deep expertise. His pain point is that enterprise security platforms are far too expensive and complex for his org, and nothing about past incidents is organized or searchable.

## User Stories

### Individual

1. **As an individual, I want to check a suspicious link myself and get a clear verdict, so that I can protect myself even though I have no IT department or security team to ask.**
2. **As an individual, I want to safely preview what an unfamiliar webpage actually contains before I visit it, so that I can decide whether to shop on or trust a site I've never used.**
3. **As a student, I want to verify whether a scholarship, internship, or financial-aid link is legitimate, so that I don't hand my personal or bank details to a scam that targets students like me.**

### Employee

4. **As an employee, I want to check a link quickly without derailing what I'm working on, so that staying safe doesn't cost me my focus or my time.**
5. **As an employee at a company with no security team, I want an instant expert-level verdict on my own, so that I'm still protected even though there's no one at work to report to.**
6. **As an employee, I want to be notified when my company's security team confirms a verdict on something I reported, so that I get real closure and know my report actually mattered.**

### Security Analyst

7. **As a security analyst, I want incoming reports to arrive already scored and prioritized, so that even as a one-person team I can focus on the threats most likely to be real.**
8. **As a security analyst, I want duplicate and related reports automatically grouped into a single campaign, so that a phishing wave becomes one investigation instead of twenty separate fires.**
9. **As a security analyst, I want to record my own authoritative verdict that overrides the automated one, so that my organization has a trusted final decision on each threat.**
10. **As a security analyst, I want to ask questions about our threat history in plain language and see the answer visualized, so that I can understand what we're being targeted with without buying expensive tooling or writing database queries.**

### Shared / Cross-Role

11. **As any user, I want to add the message or email a link came from, so that the verdict accounts for the whole scam and not just the URL in isolation.**
12. **As any user, I want to search past reports by pasting a link or message, so that I can instantly reuse an existing verdict instead of waiting on a fresh analysis of something already investigated.**

### AI Feature Story

13. **As a user, I want an instant, plain-English safety verdict that weighs everything known about a link and the context I submitted it with, so that I get an expert-level assessment in seconds without having to interpret the technical evidence myself.**

## Decisions Log — User Stories

- **Story we debated the scope of**: Employee story #4 ("check a link quickly without derailing what I'm working on"). We originally wrote it as *"without leaving the email or window I'm working in,"* which quietly assumed a specific mechanism — a browser extension or in-page overlay.
  **How we resolved it**: We stripped the mechanism out and kept only the user value (low friction, don't break focus). Whether that ships as an extension, a bookmarklet, or a fast standalone page is a downstream component-spec decision, not something the story should pre-decide.

- **Story we cut (and why)**: We cut *"As a security analyst, I want reports stored in a searchable threat_reports table with indexed domains, so that lookups are fast."* It was written from the developer's perspective and prescribed a specific schema and index — that belongs in the database schema spec, not in a user story. The underlying user need is already covered by the plain-language search value in story #12.

- **Story that changed after Claude's feedback**: Analyst story #10 originally ended *"...and get back a chart."* Claude flagged "chart" as an implementation/output-format decision. We revised it to *"...and see the answer visualized,"* which keeps the real user benefit (understanding the threat landscape without SQL or expensive tooling) while leaving the exact rendering to the API contract and component spec.

- **AI feature story: user benefit we landed on**: The benefit is getting an expert-level, trustworthy assessment *in seconds* without needing to understand the technical evidence — reduced uncertainty and friction at the exact moment of risk. We deliberately removed earlier phrasing that leaned on outputs like "1–100 score" and "screenshot"; those are how the system delivers the benefit and live in the API contract, not in the story. The story describes what the user experiences, not what the model or sandbox does.

## Wireframe (Bonus)

*To be added next week — low-fidelity mockups of the submission page, the individual/employee verdict report, and the analyst triage dashboard.*
