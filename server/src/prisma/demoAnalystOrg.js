// ============================================================
// LOCAL-ONLY demo helper (NOT the shared seed) — for the ANALYST screens.
//
// Fills ONE organization with enough realistic history to exercise every analyst
// feature at once. demoOrgHistory.js gives an org 4 reports for Team History;
// this goes further because the Insights charts need data spread over TIME:
//
//   • Insights → Weekly report      needs TWO weeks (this week + last week, for the deltas)
//   • Insights → Heatmap            needs 30 days, spread across days AND hours of day
//   • Insights → 90-day trend       needs 90 days, with several attack-type tags
//   • Insights → Score distribution needs scores across all three bands
//   • Insights → Campaigns table    needs campaigns with real submissions
//   • Triage queue                  needs a mix of review states (pending/investigating/confirmed)
//   • Campaign detail page          needs campaigns whose reviews HAVE submissions (see note below)
//   • Notifications bell            needs unread notifications for the signed-in analyst
//
// Usage (from repo root):
//   node --env-file=server/.env server/src/prisma/demoAnalystOrg.js you@email.com
//
// Re-running is safe: every row this script creates is namespaced with the
// "demo-analyst-" canonicalKey prefix, and the script deletes its OWN rows for the
// target org first. It never touches submissions/reviews it didn't create, and never
// touches another org. Individuals (no org) are rejected.
// ============================================================
import { prisma } from "../db.js";

const email = process.argv[2];
if (!email) {
  console.error("Usage: node --env-file=server/.env server/src/prisma/demoAnalystOrg.js <your-email>");
  process.exit(1);
}

const KEY_PREFIX = "demo-analyst-";

// Every timestamp is built in UTC because the Insights builders bucket by UTC day/hour
// (startOfUtcDay). Using local time here would drift rows into the wrong bucket and the
// heatmap/weekly columns wouldn't line up with what the seed intends.
const utcDaysAgoAt = (days, hour) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

// The teammates whose reports fill the queue. Stable clerkUserIds so re-runs upsert
// instead of creating duplicates. These are DEMO members, not analysts — the real
// analyst (you) stays the only reviewer, which is what the triage queue portrays.
const TEAMMATES = [
  { emailLocal: "anya.demo",   name: "Anya K.",   clerkUserId: "user_demo_anya" },
  { emailLocal: "marcus.demo", name: "Marcus T.", clerkUserId: "user_demo_marcus" },
  { emailLocal: "sarah.demo",  name: "Sarah L.",  clerkUserId: "user_demo_sarah" },
  { emailLocal: "diego.demo",  name: "Diego R.",  clerkUserId: "user_demo_diego" },
];

// ── The threat catalogue ────────────────────────────────────────────────────────────────
// One entry per unique link (global Indicator). `aiScore` is a SAFETY score: 100 = safe.
// Band edges come from scoreBucket(): >=70 safe · >=35 suspicious/review · <35 dangerous.
// `campaign` groups entries into a campaign; `review` is the org's analyst verdict.
// Scores are chosen to give the histogram a spread across all three bands.
const THREATS = [
  // ── Campaign 1: Microsoft 365 credential phishing (the big one) ──
  {
    key: "ms365-signin-verify.com/login",
    domain: "ms365-signin-verify.com",
    rawUrl: "https://ms365-signin-verify.com/login?ref=hr",
    aiScore: 8,
    aiTitle: "Fake Microsoft 365 sign-in page",
    aiDescription: "Credential phishing page impersonating the Microsoft 365 login on a lookalike domain.",
    aiTags: ["Credential phishing", "Brand impersonation"],
    aiReasons: [
      { text: "Fake login form captures your Microsoft 365 password", severity: "dangerous" },
      { text: "Lookalike domain not owned by Microsoft", severity: "dangerous" },
      { text: "Domain registered 4 days ago", severity: "dangerous" },
    ],
    blacklistHit: true,
    blacklistSource: "google_safe_browsing:SOCIAL_ENGINEERING",
    campaign: "ms365",
    review: { humanScore: 5, reviewStatus: "confirmed malicious", humanVerdict: "Confirmed credential harvesting. Domain blocked at the gateway and affected users' passwords reset.", sharedWithOrg: true },
    // Reported repeatedly, by different people, over two weeks — this is what makes it a campaign.
    reports: [
      { who: 0, days: 12, hour: 9 },
      { who: 1, days: 11, hour: 14 },
      { who: 2, days: 5, hour: 10 },
      { who: 3, days: 2, hour: 9 },
      { who: 0, days: 1, hour: 15 },
    ],
  },
  {
    key: "login-microsoftonline.co/auth",
    domain: "login-microsoftonline.co",
    rawUrl: "https://login-microsoftonline.co/auth/signin",
    aiScore: 14,
    aiTitle: "Microsoft login lookalike (.co domain)",
    aiDescription: "Second-stage domain in the same campaign — same page template, different host.",
    aiTags: ["Credential phishing", "Brand impersonation"],
    aiReasons: [
      { text: "Page template byte-identical to a known phishing kit", severity: "dangerous" },
      { text: "Typosquatted TLD (.co instead of .com)", severity: "dangerous" },
    ],
    campaign: "ms365",
    review: { humanScore: 10, reviewStatus: "confirmed malicious", humanVerdict: "Same kit as ms365-signin-verify.com. Same actor.", sharedWithOrg: true },
    reports: [
      { who: 1, days: 6, hour: 11 },
      { who: 2, days: 3, hour: 16 },
    ],
  },
  {
    key: "ms-365-mfa-reset.net/verify",
    domain: "ms-365-mfa-reset.net",
    rawUrl: "https://ms-365-mfa-reset.net/verify?u=staff",
    aiScore: 21,
    aiTitle: "Fake MFA reset request",
    aiDescription: "Asks for the MFA code as well as the password — full account takeover attempt.",
    aiTags: ["Credential phishing", "MFA bypass"],
    aiReasons: [
      { text: "Requests a one-time MFA code — real providers never do this", severity: "dangerous" },
      { text: "Same registrar and nameservers as the other campaign domains", severity: "dangerous" },
    ],
    campaign: "ms365",
    review: { reviewStatus: "investigating", sharedWithOrg: false },
    reports: [{ who: 3, days: 1, hour: 8 }],
  },

  // ── Campaign 2: Payroll / invoice fraud ──
  {
    key: "payroll-update-portal.com/direct-deposit",
    domain: "payroll-update-portal.com",
    rawUrl: "https://payroll-update-portal.com/direct-deposit",
    aiScore: 18,
    aiTitle: "Fake payroll direct-deposit change form",
    aiDescription: "Business email compromise — redirects salary payments to an attacker's account.",
    aiTags: ["Business email compromise", "Financial fraud"],
    aiReasons: [
      { text: "Asks for bank routing details outside the HR system", severity: "dangerous" },
      { text: "Sender domain does not match the real payroll provider", severity: "dangerous" },
    ],
    campaign: "payroll",
    review: { humanScore: 12, reviewStatus: "confirmed malicious", humanVerdict: "BEC attempt. Finance notified; no payments were changed.", sharedWithOrg: true },
    reports: [
      { who: 2, days: 9, hour: 13 },
      { who: 3, days: 4, hour: 10 },
    ],
  },
  {
    key: "invoice-secure-view.net/inv-88214",
    domain: "invoice-secure-view.net",
    rawUrl: "https://invoice-secure-view.net/inv-88214.pdf",
    aiScore: 29,
    aiTitle: "Unpaid invoice lure with credential gate",
    aiDescription: "PDF preview behind a fake Office login. Same actor as the payroll lure.",
    aiTags: ["Business email compromise", "Credential phishing"],
    aiReasons: [
      { text: "Document preview gated behind a credential form", severity: "dangerous" },
      { text: "Domain shares an IP with payroll-update-portal.com", severity: "review" },
    ],
    campaign: "payroll",
    review: { reviewStatus: "pending review", sharedWithOrg: false },
    reports: [{ who: 0, days: 3, hour: 17 }],
  },

  // ── Ungrouped: a spread of scores + tags so the trend and histogram look real ──
  {
    key: "fedex-track-parcel.co/track",
    domain: "fedex-track-parcel.co",
    rawUrl: "https://fedex-track-parcel.co/track?x=99",
    aiScore: 44,
    aiTitle: "Unusual shipping notification",
    aiDescription: "Low-reputation domain with a redirect. No credential form found, but proceed with caution.",
    aiTags: ["Social engineering"],
    aiReasons: [
      { text: "Shortened redirect hides the true destination", severity: "review" },
      { text: "Low-reputation domain not linked to the real FedEx", severity: "review" },
      { text: "No credential form detected on the page", severity: "safe" },
    ],
    review: { reviewStatus: "pending review", sharedWithOrg: false },
    reports: [
      { who: 1, days: 20, hour: 12 },
      { who: 2, days: 4, hour: 20 },
    ],
  },
  {
    key: "hr-benefits-2026.info/enroll",
    domain: "hr-benefits-2026.info",
    rawUrl: "https://hr-benefits-2026.info/enroll",
    aiScore: 52,
    aiTitle: "Benefits enrollment page on an unfamiliar domain",
    aiDescription: "Looks like an HR page but is not on a company domain. Unverified.",
    aiTags: ["Social engineering", "Impersonation"],
    aiReasons: [
      { text: "Not hosted on a company-owned domain", severity: "review" },
      { text: "Collects employee ID but no password", severity: "review" },
    ],
    review: { reviewStatus: "investigating", sharedWithOrg: false },
    reports: [{ who: 3, days: 8, hour: 15 }],
  },
  {
    key: "smsverify-delivery.link/pkg",
    domain: "smsverify-delivery.link",
    rawUrl: "https://smsverify-delivery.link/pkg?id=4417",
    aiScore: 26,
    aiTitle: "SMS package-redelivery scam",
    aiDescription: "Smishing link asking for a card number to release a parcel.",
    aiTags: ["SMS phishing", "Financial fraud"],
    aiReasons: [
      { text: "Requests card details for a small 'redelivery fee'", severity: "dangerous" },
      { text: "Disposable .link domain, 9 days old", severity: "dangerous" },
    ],
    review: { humanScore: 20, reviewStatus: "confirmed malicious", humanVerdict: "Card-harvesting smishing page. Reported to the registrar.", sharedWithOrg: true },
    reports: [
      { who: 0, days: 30, hour: 19 },
      { who: 1, days: 17, hour: 21 },
      { who: 2, days: 7, hour: 18 },
    ],
  },
  {
    key: "docs-sharepoint-review.com/file",
    domain: "docs-sharepoint-review.com",
    rawUrl: "https://docs-sharepoint-review.com/file/shared",
    aiScore: 33,
    aiTitle: "Fake SharePoint document share",
    aiDescription: "Impersonates an internal document share to harvest Microsoft credentials.",
    aiTags: ["Credential phishing", "Impersonation"],
    aiReasons: [
      { text: "Fake Microsoft consent screen", severity: "dangerous" },
      { text: "Domain unrelated to Microsoft or the company", severity: "dangerous" },
    ],
    review: { reviewStatus: "pending review", sharedWithOrg: false },
    reports: [{ who: 2, days: 45, hour: 11 }],
  },
  {
    key: "crypto-airdrop-claim.io/wallet",
    domain: "crypto-airdrop-claim.io",
    rawUrl: "https://crypto-airdrop-claim.io/wallet/connect",
    aiScore: 11,
    aiTitle: "Wallet-drainer airdrop claim",
    aiDescription: "Requests a wallet signature that grants unlimited token transfer approval.",
    aiTags: ["Financial fraud", "Wallet drainer"],
    aiReasons: [
      { text: "Requests an unlimited setApprovalForAll signature", severity: "dangerous" },
      { text: "Impersonates a well-known token's airdrop", severity: "dangerous" },
    ],
    review: { humanScore: 8, reviewStatus: "confirmed malicious", humanVerdict: "Wallet drainer. Nobody in the org signed.", sharedWithOrg: true },
    reports: [{ who: 3, days: 60, hour: 22 }],
  },
  {
    key: "it-helpdesk-ticket.support/reset",
    domain: "it-helpdesk-ticket.support",
    rawUrl: "https://it-helpdesk-ticket.support/reset/pw",
    aiScore: 38,
    aiTitle: "IT helpdesk password reset (unverified)",
    aiDescription: "Claims to be the internal helpdesk. Not on a company domain.",
    aiTags: ["Impersonation", "Credential phishing"],
    aiReasons: [
      { text: "Not a company-owned domain", severity: "dangerous" },
      { text: "Generic helpdesk template", severity: "review" },
    ],
    review: { reviewStatus: "investigating", sharedWithOrg: false },
    reports: [{ who: 0, days: 75, hour: 9 }],
  },
  // ── Safe rows: the histogram's safe band + "not everything is a threat" ──
  {
    key: "intranet-company-benefits/portal",
    domain: "intranet.company.com",
    rawUrl: "https://intranet.company.com/benefits/portal",
    aiScore: 96,
    aiTitle: "HR benefits enrollment reminder",
    aiDescription: "Verified internal HR communication. Links point to the internal portal.",
    aiTags: ["Internal comms"],
    aiReasons: [
      { text: "Verified sender on the corporate domain", severity: "safe" },
      { text: "Links resolve to the internal HR portal only", severity: "safe" },
      { text: "Long-established domain with no blacklist history", severity: "safe" },
    ],
    review: { humanScore: 97, reviewStatus: "confirmed safe", humanVerdict: "Verified internal HR communication. Safe.", sharedWithOrg: true },
    reports: [
      { who: 1, days: 10, hour: 9 },
      { who: 3, days: 2, hour: 13 },
    ],
  },
  {
    key: "github-actions-docs/runners",
    domain: "docs.github.com",
    rawUrl: "https://docs.github.com/en/actions/hosting-your-own-runners",
    aiScore: 99,
    aiTitle: "GitHub Actions documentation",
    aiDescription: "Official GitHub documentation. No risk indicators.",
    aiTags: ["Developer tools"],
    aiReasons: [
      { text: "Official, long-established domain", severity: "safe" },
      { text: "No credential form and no redirects", severity: "safe" },
    ],
    review: { humanScore: 99, reviewStatus: "confirmed safe", humanVerdict: "Official docs. No action needed.", sharedWithOrg: true },
    reports: [{ who: 2, days: 6, hour: 14 }],
  },
  {
    key: "zoom-meeting-invite-legit/j",
    domain: "company.zoom.us",
    rawUrl: "https://company.zoom.us/j/98765432101",
    aiScore: 88,
    aiTitle: "Zoom meeting invitation",
    aiDescription: "Legitimate Zoom link on the company's own subdomain.",
    aiTags: ["Internal comms"],
    aiReasons: [
      { text: "Company-owned Zoom subdomain", severity: "safe" },
      { text: "Standard meeting-join URL format", severity: "safe" },
    ],
    review: { reviewStatus: "confirmed safe", humanScore: 90, humanVerdict: "Normal internal meeting link.", sharedWithOrg: true },
    reports: [{ who: 0, days: 5, hour: 11 }],
  },
  {
    key: "unfamiliar-survey-tool/form",
    domain: "quicksurvey-forms.app",
    rawUrl: "https://quicksurvey-forms.app/form/emp-2026",
    aiScore: 71,
    aiTitle: "Employee survey on a third-party tool",
    aiDescription: "Third-party survey host. No credentials requested, but not a vetted vendor.",
    aiTags: ["Third-party tool"],
    aiReasons: [
      { text: "No credential or payment fields", severity: "safe" },
      { text: "Vendor is not on the approved list", severity: "review" },
    ],
    review: { reviewStatus: "pending review", sharedWithOrg: false },
    reports: [{ who: 1, days: 1, hour: 10 }],
  },
];

// Campaign definitions, keyed by the `campaign` field above.
const CAMPAIGNS = {
  ms365: {
    name: "Microsoft 365 credential harvesting",
    sharedSignal: "Same phishing kit fingerprint + shared registrar across three lookalike domains",
  },
  payroll: {
    name: "Payroll / invoice fraud (BEC)",
    sharedSignal: "Same sending infrastructure; both target finance workflows",
  },
};

const main = async () => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`No user with email ${email}. Sign in once so the mirror row exists.`);
  if (user.orgId == null) {
    throw new Error(`${email} has no org. The analyst screens are org-scoped — create/join an org in the app first.`);
  }
  const orgId = user.orgId;
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  console.log(`Target org: ${orgId} "${org?.name}" (via ${user.name || email}, role=${user.role})`);
  if (user.role !== "analyst") {
    console.warn(`⚠ ${email} is role="${user.role}", not "analyst" — the analyst screens will 403 until that changes.`);
  }

  // 1) Demo teammates in this org (upsert by clerkUserId so re-runs don't duplicate).
  //    Email is namespaced per-org so seeding two orgs can't collide on the unique email.
  const teammates = [];
  for (const t of TEAMMATES) {
    teammates.push(
      await prisma.user.upsert({
        where: { clerkUserId: t.clerkUserId },
        update: { orgId, name: t.name },
        create: {
          clerkUserId: t.clerkUserId,
          orgId,
          email: `${t.emailLocal}+org${orgId}@orbis.local`,
          name: t.name,
          role: "member",
        },
      })
    );
  }

  // 2) Remove ONLY what a previous run of THIS script created for THIS org, so re-running is
  //    idempotent and never disturbs real submissions or another org's data. Order matters:
  //    notifications and reviews reference indicators, so they go before the campaigns.
  const mine = await prisma.indicator.findMany({
    where: { canonicalKey: { startsWith: KEY_PREFIX } },
    select: { id: true },
  });
  const mineIds = mine.map((i) => i.id);
  if (mineIds.length) {
    await prisma.notification.deleteMany({ where: { indicatorId: { in: mineIds }, user: { orgId } } });
    await prisma.orgReview.deleteMany({ where: { orgId, indicatorId: { in: mineIds } } });
    await prisma.submission.deleteMany({ where: { orgId, indicatorId: { in: mineIds } } });
  }
  // Campaigns are per-org and named by this script, so clear ours by name.
  await prisma.campaign.deleteMany({
    where: { orgId, name: { in: Object.values(CAMPAIGNS).map((c) => c.name) } },
  });

  // 3) Campaigns first — reviews need campaignId. lastSeen is @updatedAt (auto), so the
  //    triage queue orders campaigns by when this script last touched them.
  const campaignIds = {};
  for (const [key, c] of Object.entries(CAMPAIGNS)) {
    const created = await prisma.campaign.create({
      data: { orgId, name: c.name, sharedSignal: c.sharedSignal, firstSeen: utcDaysAgoAt(12, 9) },
    });
    campaignIds[key] = created.id;
  }

  // 4) Each threat: the global Indicator, one Submission per report, and the org's OrgReview.
  //    IMPORTANT: every campaign review gets at least one submission, because
  //    getCampaignDetail() skips reviews with no submission (it has no url/date to render).
  let submissionCount = 0;
  const scoredIndicators = [];
  for (const t of THREATS) {
    const canonicalKey = `${KEY_PREFIX}${t.key}`;
    const indicator = await prisma.indicator.upsert({
      where: { canonicalKey },
      update: {
        status: "done", aiScore: t.aiScore, aiVerdict: t.aiDescription, aiConfidence: "high",
        aiTitle: t.aiTitle, aiDescription: t.aiDescription, aiTags: t.aiTags, aiReasons: t.aiReasons,
        blacklistHit: t.blacklistHit ?? false, blacklistSource: t.blacklistSource ?? null,
        reportCount: t.reports.length,
      },
      create: {
        canonicalKey, domain: t.domain, status: "done",
        aiScore: t.aiScore, aiVerdict: t.aiDescription, aiConfidence: "high",
        aiTitle: t.aiTitle, aiDescription: t.aiDescription, aiTags: t.aiTags, aiReasons: t.aiReasons,
        blacklistHit: t.blacklistHit ?? false, blacklistSource: t.blacklistSource ?? null,
        reportCount: t.reports.length,
      },
    });

    // Submissions carry the timestamps every Insights chart buckets on, so they're spread
    // across days AND hours (the heatmap plots day-of-week × 3-hour slot).
    for (const r of t.reports) {
      await prisma.submission.create({
        data: {
          userId: teammates[r.who].id,
          orgId,
          indicatorId: indicator.id,
          rawUrl: t.rawUrl,
          source: r.days % 3 === 0 ? "email" : "web", // a believable mix of both intake paths
          escalated: true,
          createdAt: utcDaysAgoAt(r.days, r.hour),
        },
      });
      submissionCount += 1;
    }

    const hasVerdict = t.review.humanScore != null;
    await prisma.orgReview.upsert({
      where: { orgId_indicatorId: { orgId, indicatorId: indicator.id } },
      update: {
        reviewStatus: t.review.reviewStatus,
        humanScore: t.review.humanScore ?? null,
        humanVerdict: t.review.humanVerdict ?? null,
        sharedWithOrg: t.review.sharedWithOrg ?? false,
        reviewedBy: hasVerdict ? user.id : null,
        campaignId: t.campaign ? campaignIds[t.campaign] : null,
      },
      create: {
        orgId, indicatorId: indicator.id,
        reviewStatus: t.review.reviewStatus,
        humanScore: t.review.humanScore ?? null,
        humanVerdict: t.review.humanVerdict ?? null,
        sharedWithOrg: t.review.sharedWithOrg ?? false,
        reviewedBy: hasVerdict ? user.id : null,
        campaignId: t.campaign ? campaignIds[t.campaign] : null,
      },
    });

    if (hasVerdict) scoredIndicators.push({ id: indicator.id, title: t.aiTitle });
  }

  // 5) A few unread notifications for the signed-in analyst, so the bell has something in it.
  //    These are the "an analyst confirmed a verdict" messages the closure loop sends.
  for (const s of scoredIndicators.slice(0, 3)) {
    await prisma.notification.create({
      data: {
        userId: user.id,
        indicatorId: s.id,
        type: "verdict_confirmed",
        message: `An analyst recorded an authoritative verdict on "${s.title}".`,
        isRead: false,
      },
    });
  }

  console.log(`\nDone. Org ${orgId} now has:`);
  console.log(`  ${THREATS.length} indicators · ${submissionCount} submissions · ${Object.keys(CAMPAIGNS).length} campaigns`);
  console.log(`  ${scoredIndicators.length} analyst-scored reviews · 3 unread notifications`);
  console.log(`  Teammates: ${TEAMMATES.map((t) => t.name).join(", ")}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("Error:", e.message);
    await prisma.$disconnect();
    process.exit(1);
  });
