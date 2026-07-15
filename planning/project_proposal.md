# Project Proposal

Team Name: **DOMinion**

Project Name: **Orbis**

Pod Members: **Michael Jissa, Ozias Tumimana, David Gonzalez-Cesar**

## Problem Statement

Phishing is the most common entry point for scams and breaches, and the moment someone receives a suspicious link is the moment of both risk and uncertainty. For most people the only options are to click and hope, ignore it and maybe miss something real, or (if they have an IT team) report it into a black hole and wait for it to be removed if it turns out to be a true positive. The people who need help most often have the least of it. Individuals, students, and small companies are heavily targeted precisely because they have looser defenses and no dedicated security team to ask.

Even organizations that do have a security team struggle. Analysts are buried under a flood of reports, most of them harmless, and they re-investigate the same attack because duplicate reports are not grouped. Large enterprises have expensive, intricate tooling and big teams for this. Small companies and startups do not, so a single phishing wave can bury a one-person security team.

**Target audience:** individuals and students protecting themselves, organization members at companies of any size, and the security and IT analysts who triage reported threats.

## Description

The main purpose of Orbis is to act as a personal security analyst for anyone who needs one. A user submits a suspicious URL or forwards an email, and Orbis detonates it in a secure sandbox, gathers evidence about what the page does, and returns a clear, plain-English danger verdict alongside a screenshot, all without anyone ever having to open the link on their own machine.

The app serves three kinds of users from one product:

- **Individuals** vet suspicious links, messages, or webpages for themselves with no organization behind them. They paste a URL or message, receive a plain-English verdict, and can see their own past reports, with no security background required.
- **Organization members** get the same lightweight "is this link safe?" check at work. Those backed by a security team have their reports forwarded to analysts, whose authoritative verdict is logged alongside the AI's. Those with no security team rely on the instant AI verdict on its own.
- **Analysts** get a full triage dashboard: organization-wide submission history, keyword search, campaign clustering (grouping related attacks together), the ability to record an authoritative verdict that overrides the automated one, and the ability to ask questions about the threat database in plain language and see the answer visualized. Each analyst sees only their own organization's data, never another company's.

Individuals and organization members use Orbis to check links before clicking and to report anything suspicious. Analysts use it as their daily triage workspace, reviewing verdicts, investigating patterns across submissions, and pulling insights from the threat history without writing database queries by hand.

## Expected Features List

**Core features**
- Account creation and login via a managed auth provider (Clerk): email + password **and** social login (Google / Apple), with distinct roles (individual, organization member, and analyst), each role seeing the appropriate view
- Organization creation, teammate invites, and email-domain auto-join (Clerk Organizations), so members and analysts belong to the same org
- Organization-scoped data isolation so a member or analyst can only see reports and threat history belonging to their own organization
- Suspicious URL submission via the web app **and** by forwarding an email to a dedicated Orbo inbox (two core interaction methods; the email path is a backend pipeline — inbound email received via SendGrid Inbound Parse, or a simulated webhook for the demo)
- Automatic escalation: anything an organization member submits is routed to their analyst for review
- Secure sandbox detonation of submitted URLs (via urlscan.io) with a captured screenshot
- Blacklist check against known malware/phishing URLs (via the free Google Safe Browsing API), fed into the AI verdict
- AI-generated danger verdict: a score from 0 to 100 across multiple threat vectors, plus a plain-English explanation
- Personal report history ("my reports") for individuals and organization members
- Read-only "Team History" for organization members: the threats their org has run into, limited to items an analyst reviewed and explicitly shared with the team (a privacy gate)
- Organization-wide threat history dashboard for analysts
- Keyword search across submissions
- Campaign clustering that groups related and duplicate threats so analysts see attack patterns, not just one-off links
- Responsive design so every screen works on desktop and mobile (one responsive build — no separate mobile app)
- Deployed and publicly reachable (frontend + backend + Postgres on free hosting tiers)
- Seeded stand-in threat data so the dashboard, trends, and campaigns are populated for the demo

**AI-powered features**
- **Plain-English danger verdict (generation):** Claude analyzes the sandbox evidence for a submitted URL and produces a human-readable verdict and risk score, so a non-expert can understand *why* a link is dangerous.
- **Ask-the-data dashboarding (conversation to visualization):** an analyst types a question about the threat database in natural language (for example, "show me the most reported domains this week"), Claude turns it into a safe, validated query, and the result renders as a chart, with no SQL required.

**Stretch / extension features (later)**
- Enterprise SSO / SAML sign-in for large orgs (e.g. via WorkOS AuthKit's test-IdP sandbox) — social + password login are core, full enterprise SSO is the stretch
- Browser extension for right-click link checking (confirmed a stretch feature at the Jul 1 pod sync)
- Configure alert rules by talking to the system in natural language
- Email and SMS notifications when a high-risk submission comes in
- Exportable reports for incident records

## Related Work

Several tools touch this space, but each leaves a gap Orbis is designed to fill:

- **VirusTotal / urlscan.io** are powerful scanning engines, but built for technical users. They return raw indicators and dense data, not a plain-English verdict an everyday person can act on. (Orbis actually uses urlscan.io under the hood as its sandbox, then layers an understandable verdict on top.)
- **PhishTool / Cofense** are enterprise phishing-analysis platforms aimed squarely at trained analysts. They are heavyweight, costly, and not approachable for the person who just wants to know "is this safe?"
- **KnowBe4 and similar tools** focus on *training* people to spot phishing, not on triaging real reported links in the moment.

**How Orbis stands out:** it serves all of these audiences in one product. Individuals and organization members get a one-click, plain-language safety check, and analysts get a real triage dashboard, with two AI features (understandable verdicts and natural-language querying of the threat database) that make expert-level analysis accessible without expert-level effort.

## Open Questions

- What's the safest, simplest way to track sandbox job status without adding a heavy queue system (we're planning DB job status plus polling rather than Celery or Redis)?
- For campaign clustering, what defines two submissions as "the same campaign": exact URL match, domain, or a canonicalized key that strips per-victim tracking tokens?
- For the natural-language querying feature, how do we keep it safe by translating questions into a whitelisted, validated set of filters rather than running raw model-generated SQL?
- How do we scope the analyst dashboard so it's genuinely useful but still buildable in the project timeline?
- ~~What's the right login and role model?~~ **Resolved:** use Clerk (managed auth provider) for login, social login, roles, orgs, invites, and domain auto-join; one codebase with a server-side role/org guard reading the Clerk session. Enterprise SSO/SAML is a stretch.
- ~~How do we enforce organization-scoped data isolation?~~ **Resolved (design):** every org-scoped table carries `org_id`; one middleware filters all analyst reads by the caller's `org_id` (see project_plan §5/§6). Still the load-bearing thing to get right in code.
