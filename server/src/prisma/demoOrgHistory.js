// ============================================================
// LOCAL-ONLY demo helper (NOT the shared seed) — for "Team History".
// Gives the org the signed-in user belongs to a set of TEAMMATE-authored
// reports, so when you open Reports → "Team History" as yourself you see a
// realistic "what our organization has been running into" list (several
// reporters, recent dates, a spread of analyst statuses).
//
// Why this exists: with real Clerk auth on, signing in mirrors YOUR org — not
// the demo "Acme Inc." from seed.js. So seed.js alone leaves your Team History
// empty. This attaches the demo teammates + submissions to YOUR org instead.
// (Mirrors the demoMyAccount.js pattern, but for the org-wide view.)
//
// Usage (from repo root):
//   node --env-file=server/.env server/src/prisma/demoOrgHistory.js you@email.com
//
// Re-running is safe: it upserts teammates by email and clears this script's own
// submissions/reviews (by canonicalKey) for the org first. Individuals (no org)
// are rejected — Team History only makes sense inside an organization.
// ============================================================
import { prisma } from "../db.js";

const email = process.argv[2];
if (!email) {
  console.error("Usage: node --env-file=server/.env server/src/prisma/demoOrgHistory.js <your-email>");
  process.exit(1);
}

// Date helper so the demo always looks recent (relative to when it runs).
const daysAgo = (n) => {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

// The demo teammates whose reports fill Team History. They are seeded INTO the
// signed-in user's org (their clerkUserId is a stable fake so re-runs upsert).
const TEAMMATES = [
  { emailLocal: "anya.demo",   name: "Anya K.",   clerkUserId: "user_demo_anya" },
  { emailLocal: "marcus.demo", name: "Marcus T.", clerkUserId: "user_demo_marcus" },
  { emailLocal: "sarah.demo",  name: "Sarah L.",  clerkUserId: "user_demo_sarah" },
];

// The threats the org has "encountered". Each row: a global indicator, which
// teammate reported it + how many days ago, and the org's analyst review state.
const DEMO = [
  {
    canonicalKey: "demo-org-paypa1-secure.com/verify",
    domain: "paypa1-secure.com",
    rawUrl: "https://paypa1-secure.com/verify?id=team",
    reporter: 0, daysAgo: 8, source: "web",
    aiScore: 22,
    aiTitle: "Fake PayPal 'account locked' email",
    aiDescription: "Credential phishing page impersonating PayPal on a newly registered lookalike domain.",
    aiTags: ["Credential phishing", "Brand impersonation"],
    aiReasons: [
      { text: "Credential harvesting — fake login form captures your password", severity: "dangerous" },
      { text: "Brand impersonation — closely mimics PayPal's branding", severity: "dangerous" },
      { text: "Newly registered domain — created just 3 days ago", severity: "dangerous" },
    ],
    // Analyst reviewed AND shared with the team → appears in Team History.
    review: { humanScore: 18, reviewStatus: "confirmed malicious", humanVerdict: "Confirmed phishing campaign targeting employees.", sharedWithOrg: true },
  },
  {
    canonicalKey: "demo-org-microsoft365-signin-verify.com/login",
    domain: "microsoft365-signin-verify.com",
    rawUrl: "https://microsoft365-signin-verify.com/login",
    reporter: 1, daysAgo: 6, source: "email",
    aiScore: 31,
    aiTitle: "Fake Microsoft 365 sign-in page",
    aiDescription: "Credential phishing page impersonating the Microsoft 365 login on a lookalike domain.",
    aiTags: ["Credential phishing", "Impersonation"],
    aiReasons: [
      { text: "Fake login form captures your Microsoft 365 password", severity: "dangerous" },
      { text: "Lookalike domain not owned by Microsoft", severity: "dangerous" },
      { text: "Recently registered domain", severity: "review" },
    ],
    // Analyst is still investigating and has NOT shared it → hidden from Team History
    // (demonstrates the privacy gate: not everything reviewed is auto-visible).
    review: { reviewStatus: "investigating", sharedWithOrg: false },
  },
  {
    canonicalKey: "demo-org-fedex-track-parcel.co/track",
    domain: "fedex-track-parcel.co",
    rawUrl: "https://fedex-track-parcel.co/track?x=99",
    reporter: 2, daysAgo: 4, source: "email",
    aiScore: 54,
    aiTitle: "Unusual shipping notification from FedEx",
    aiDescription: "Low-reputation domain with a redirect. No credential form found, but proceed with caution.",
    aiTags: ["Social engineering"],
    aiReasons: [
      { text: "Shortened redirect hides the true destination", severity: "review" },
      { text: "Low-reputation domain not linked to the real FedEx", severity: "review" },
      { text: "No credential form detected on the page", severity: "safe" },
    ],
    // Awaiting analyst, not shared → hidden from Team History.
    review: { reviewStatus: "pending review", sharedWithOrg: false },
  },
  {
    canonicalKey: "demo-org-intranet-benefits/benefits",
    domain: "intranet.company.com",
    rawUrl: "https://intranet.company.com/benefits",
    reporter: 0, daysAgo: 2, source: "web",
    aiScore: 91,
    aiTitle: "HR benefits enrollment reminder",
    aiDescription: "Verified internal HR communication. Links point to the internal portal.",
    aiTags: ["Internal comms"],
    aiReasons: [
      { text: "Verified sender on the corporate domain", severity: "safe" },
      { text: "Links resolve to the internal HR portal only", severity: "safe" },
      { text: "Long-established domain with no blacklist history", severity: "safe" },
    ],
    // Analyst reviewed AND shared with the team → appears in Team History.
    review: { humanScore: 94, reviewStatus: "confirmed safe", humanVerdict: "Verified internal HR communication. Safe.", sharedWithOrg: true },
  },
];

const main = async () => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`No user with email ${email}. Sign in once so the mirror row exists.`);
  if (user.orgId == null) {
    throw new Error(`${email} has no org. Team History only applies to organization members — join/create an org in the app first.`);
  }
  const orgId = user.orgId;
  console.log(`Target org: ${orgId} (via ${user.name || email})`);

  // Reviewer for scored reports = an analyst in this org, else the user themselves.
  const analyst =
    (await prisma.user.findFirst({ where: { orgId, role: "analyst" } })) || user;

  // 1) Make sure the demo teammates exist IN THIS ORG (upsert by clerkUserId).
  //    Their email is namespaced per-org so two orgs' demos don't collide.
  const teammateUsers = [];
  for (const t of TEAMMATES) {
    const u = await prisma.user.upsert({
      where: { clerkUserId: t.clerkUserId },
      update: { orgId, name: t.name },
      create: {
        clerkUserId: t.clerkUserId,
        orgId,
        email: `${t.emailLocal}+org${orgId}@orbis.local`,
        name: t.name,
        role: "member",
      },
    });
    teammateUsers.push(u);
  }

  // 2) Clean up anything this script created before (idempotent re-runs).
  const oldIndicators = await prisma.indicator.findMany({
    where: { canonicalKey: { in: DEMO.map((d) => d.canonicalKey) } },
    select: { id: true },
  });
  const oldIds = oldIndicators.map((i) => i.id);
  if (oldIds.length) {
    await prisma.orgReview.deleteMany({ where: { orgId, indicatorId: { in: oldIds } } });
    await prisma.submission.deleteMany({ where: { orgId, indicatorId: { in: oldIds } } });
  }

  // 3) For each threat: upsert the global indicator, a teammate submission, and
  //    the org's analyst review (or awaiting state).
  for (const d of DEMO) {
    const indicator = await prisma.indicator.upsert({
      where: { canonicalKey: d.canonicalKey },
      update: {
        status: "done", aiScore: d.aiScore, aiVerdict: d.aiDescription, aiConfidence: "high",
        aiTitle: d.aiTitle, aiDescription: d.aiDescription, aiTags: d.aiTags, aiReasons: d.aiReasons,
      },
      create: {
        canonicalKey: d.canonicalKey, domain: d.domain, status: "done",
        aiScore: d.aiScore, aiVerdict: d.aiDescription, aiConfidence: "high",
        aiTitle: d.aiTitle, aiDescription: d.aiDescription, aiTags: d.aiTags, aiReasons: d.aiReasons,
        reportCount: 1,
      },
    });

    const reporter = teammateUsers[d.reporter];
    await prisma.submission.create({
      data: {
        userId: reporter.id, orgId, indicatorId: indicator.id, rawUrl: d.rawUrl,
        source: d.source, escalated: true, createdAt: daysAgo(d.daysAgo),
      },
    });

    await prisma.orgReview.upsert({
      where: { orgId_indicatorId: { orgId, indicatorId: indicator.id } },
      update: {
        reviewStatus: d.review.reviewStatus,
        humanScore: d.review.humanScore ?? null,
        humanVerdict: d.review.humanVerdict ?? null,
        sharedWithOrg: d.review.sharedWithOrg ?? false,
        reviewedBy: d.review.humanScore != null ? analyst.id : null,
      },
      create: {
        orgId, indicatorId: indicator.id,
        reviewStatus: d.review.reviewStatus,
        humanScore: d.review.humanScore ?? null,
        humanVerdict: d.review.humanVerdict ?? null,
        sharedWithOrg: d.review.sharedWithOrg ?? false,
        reviewedBy: d.review.humanScore != null ? analyst.id : null,
      },
    });
  }

  console.log(`Done. Org ${orgId} now has ${DEMO.length} teammate reports for Team History.`);
  console.log(`Reporters: ${TEAMMATES.map((t) => t.name).join(", ")}`);
  console.log(`Reviewer for scored reports: ${analyst.name || analyst.email}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("Error:", e.message);
    await prisma.$disconnect();
    process.exit(1);
  });
