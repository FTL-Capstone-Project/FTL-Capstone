# Project Proposal

Team Name: **DOMinion**

Project Name: **PIPbot**

Pod Members: **Michael Jissa, Ozias Tumimana, David Gonzalez-Cesar**

## Problem Statement

Phishing is the most common entry point for scams and breaches, and the moment someone receives a suspicious link is the moment of risk *and* uncertainty. For most people the only options are to click and hope, ignore it and maybe miss something real, or — if they have an IT team — report it into a black hole and wait for it to be removed if it's a true positive. The people who need help most often have the least of it: individuals, students, and small companies are heavily targeted precisely because they have looser defenses and no dedicated security team to ask.

Even organizations that *do* have a security team struggle. Analysts are buried under a flood of reports — most of them harmless — and re-investigate the same attack because duplicate reports may not be grouped. Large enterprises have expensive, intricate tooling and big teams for this; small companies and startups don't, so a single phishing wave can bury a one-person security team.

**Target audience:** individuals and students protecting themselves, employees at organizations of any size, and the security/IT analysts who triage reported threats.

## Description

The main purpose of PIPbot is to act as a personal security analyst for anyone who needs one. A user submits a suspicious URL or forwards an email; PIPbot detonates it in a secure sandbox, gathers evidence about what the page does, and returns a clear, plain-English danger verdict alongside a screenshot — without anyone ever having to open the link on their own machine.

The app serves three kinds of users from one product:

- **Individuals** vet suspicious links, messages, or webpages for themselves with no organization behind them. They paste a URL or message, receive a plain-English verdict, and can see their own past reports — no security background required.
- **Employees** get the same lightweight "is this link safe?" check at work. Those backed by a security team have their reports forwarded to analysts, whose authoritative verdict is logged alongside the AI's; those with no security team rely on the instant AI verdict on its own.
- **Analysts** get a full triage dashboard: organization-wide submission history, keyword search, campaign clustering (grouping related attacks together), the ability to record an authoritative verdict that overrides the automated one, and the ability to ask questions about the threat database in plain language and see the answer visualized.

Individuals and employees use PIPbot to check links before clicking and to report anything suspicious. Analysts use it as their daily triage workspace — reviewing verdicts, investigating patterns across submissions, and pulling insights from the threat history without writing database queries by hand.

## Expected Features List

**Core features**
- Account creation / login with distinct roles (individual, employee, and analyst), each role seeing the appropriate view
- Suspicious URL submission form
- Secure sandbox detonation of submitted URLs (via urlscan.io) with a captured screenshot
- AI-generated danger verdict: a 0–100 score across multiple threat vectors, plus a plain-English explanation
- Personal report history ("my reports") for individuals and employees
- Organization-wide threat history dashboard for analysts
- Keyword search across submissions
- Campaign clustering — grouping related/duplicate threats so analysts see attack patterns, not just one-off links
- Responsive design so the app works on desktop and mobile

**AI-powered features**
- **Plain-English danger verdict (generation):** Claude analyzes the sandbox evidence for a submitted URL and produces a human-readable verdict and risk score, so a non-expert can understand *why* a link is dangerous.
- **Ask-the-data dashboarding (conversation → visualization):** an analyst types a question about the threat database in natural language (e.g., "show me the most reported domains this week"); Claude turns it into a safe, validated query and the result renders as a chart — no SQL required.

**Stretch / extension features (later)**
- Configure alert rules by talking to the system in natural language
- Email / SMS notifications when a high-risk submission comes in
- Exportable reports for incident records

## Related Work

Several tools touch this space, but each leaves a gap PIPbot is designed to fill:

- **VirusTotal / urlscan.io** — powerful scanning engines, but built for technical users. They return raw indicators and dense data, not a plain-English verdict an everyday employee can act on. (PIPbot actually uses urlscan.io under the hood as its sandbox, then layers an understandable verdict on top.)
- **PhishTool / Cofense** — enterprise phishing-analysis platforms aimed squarely at trained analysts; they are heavyweight, costly, and not approachable for the employee who just wants to know "is this safe?"
- **KnowBe4 and similar** — focus on *training* employees to spot phishing, not on triaging real reported links in the moment.

**How PIPbot stands out:** it serves all of these audiences in one product. Individuals and employees get a one-click, plain-language safety check, and analysts get a real triage dashboard — with two AI features (understandable verdicts and natural-language querying of the threat database) that make expert-level analysis accessible without expert-level effort.

## Open Questions

- What's the safest, simplest way to track sandbox job status without adding a heavy queue system (we're planning DB job status + polling rather than Celery/Redis)?
- For campaign clustering, what defines two submissions as "the same campaign" — exact URL match, domain, or a canonicalized key that strips per-victim tracking tokens?
- For the natural-language querying feature, how do we keep it safe — i.e., translate questions into a whitelisted/validated set of filters rather than running raw model-generated SQL?
- How do we scope the analyst dashboard so it's genuinely useful but still buildable in the project timeline?
- What's the right login/role model — one codebase with a server-side role guard deciding the view, vs. separate flows?
