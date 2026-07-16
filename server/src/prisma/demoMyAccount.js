// ============================================================
// LOCAL-ONLY demo helper (NOT the shared seed).
// Gives the currently-signed-in Orbis user a set of reports that exercise all
// THREE report-modal states, so you can see the modal as YOURSELF:
//   1. an analyst-CONFIRMED dangerous report (two score cards: Orbo + Analyst)
//   2. an AWAITING-review suspicious report (Orbo score + "awaiting analyst")
//   3. an analyst-CONFIRMED safe report
//
// Usage (from repo root):
//   node --env-file=server/.env server/src/prisma/demoMyAccount.js you@email.com
//
// It attaches the reports to the org the user already belongs to, and uses an
// existing analyst in that org as the reviewer (or the user themselves if they
// are the only analyst). Re-running is safe: it upserts by canonicalKey and
// clears this script's own submissions/reviews for the user first.
// ============================================================
import { prisma } from "../db.js";

const email = process.argv[2];
if (!email) {
  console.error("Usage: node --env-file=server/.env server/src/prisma/demoMyAccount.js <your-email>");
  process.exit(1);
}

// The three demo indicators — each drives one modal state.
const DEMO = [
  {
    canonicalKey: "demo-paypal-secure-login.xyz/verify",
    domain: "paypal-secure-login.xyz",
    rawUrl: "https://paypal-secure-login.xyz/verify",
    aiScore: 22,
    aiTitle: "Fake PayPal 'account locked' email",
    aiDescription:
      "This email is impersonating PayPal and attempting to trick you into entering your login credentials on a fake website. The link leads to a domain registered just 3 days ago with no legitimate affiliation to PayPal.",
    aiTags: ["Credential phishing", "Brand impersonation"],
    aiReasons: [
      { text: "Credential harvesting — fake login form captures your password", severity: "dangerous" },
      { text: "Brand impersonation — closely mimics PayPal's branding", severity: "dangerous" },
      { text: "Newly registered domain — created just 3 days ago", severity: "dangerous" },
      { text: "Urgency manipulation — 'account locked' pressure tactic", severity: "review" },
    ],
    review: { humanScore: 18, reviewStatus: "confirmed malicious", humanVerdict: "Confirmed phishing campaign targeting employees." },
  },
  {
    canonicalKey: "demo-fedex-track-parcel.co/track",
    domain: "fedex-track-parcel.co",
    rawUrl: "https://fedex-track-parcel.co/track",
    aiScore: 54,
    aiTitle: "Unusual shipping notification from FedEx",
    aiDescription:
      "This tracking link uses a shortened redirect and a low-reputation domain, but no credential form was found. Treat with caution.",
    aiTags: ["Social engineering"],
    aiReasons: [
      { text: "Shortened redirect hides the true destination", severity: "review" },
      { text: "Low-reputation domain not linked to the real FedEx", severity: "review" },
      { text: "No credential form detected on the page", severity: "safe" },
    ],
    review: { reviewStatus: "pending review" }, // AWAITING analyst → no humanScore
  },
  {
    canonicalKey: "demo-intranet.acme.com/benefits",
    domain: "intranet.acme.com",
    rawUrl: "https://intranet.acme.com/benefits",
    aiScore: 91,
    aiTitle: "HR benefits enrollment reminder",
    aiDescription: "Legitimate internal communication from the HR team. Sender verified, links point to the internal portal.",
    aiTags: ["Internal comms"],
    aiReasons: [
      { text: "Verified sender on the corporate domain", severity: "safe" },
      { text: "Links resolve to the internal HR portal only", severity: "safe" },
      { text: "Long-established domain with no blacklist history", severity: "safe" },
    ],
    review: { humanScore: 94, reviewStatus: "confirmed safe", humanVerdict: "Verified internal HR communication. Safe." },
  },
];

const main = async () => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`No user with email ${email}. Sign in once so the mirror row exists.`);
  console.log(`Target: ${user.name || email} (id=${user.id}, org=${user.orgId}, role=${user.role})`);

  // The analyst score/review only applies to ORG MEMBERS. If this user has no org
  // (an individual), we still seed the reports so the INDIVIDUAL one-card modal is
  // testable — just without any analyst review rows.
  const isOrgUser = user.orgId != null;
  if (!isOrgUser) {
    console.log("Note: user has no org → seeding INDIVIDUAL reports only (no analyst scores).");
  }

  // Reviewer = an analyst in the same org, else the user themselves.
  const analyst = isOrgUser
    ? (await prisma.user.findFirst({ where: { orgId: user.orgId, role: "analyst" } })) || user
    : null;

  // Clean up anything this script created before (idempotent re-runs).
  const oldIndicators = await prisma.indicator.findMany({
    where: { canonicalKey: { in: DEMO.map((d) => d.canonicalKey) } },
    select: { id: true },
  });
  const oldIds = oldIndicators.map((i) => i.id);
  if (oldIds.length) {
    await prisma.notification.deleteMany({ where: { userId: user.id, indicatorId: { in: oldIds } } });
    if (isOrgUser) {
      await prisma.orgReview.deleteMany({ where: { orgId: user.orgId, indicatorId: { in: oldIds } } });
    }
    await prisma.submission.deleteMany({ where: { userId: user.id, indicatorId: { in: oldIds } } });
  }

  for (const d of DEMO) {
    // Upsert the global indicator.
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

    // The user's submission (their report of this link).
    await prisma.submission.create({
      data: { userId: user.id, orgId: user.orgId, indicatorId: indicator.id, rawUrl: d.rawUrl, source: "web", escalated: isOrgUser },
    });

    // The org's analyst review (or awaiting state) — ORG MEMBERS ONLY.
    if (isOrgUser) {
      await prisma.orgReview.upsert({
        where: { orgId_indicatorId: { orgId: user.orgId, indicatorId: indicator.id } },
        update: {
          reviewStatus: d.review.reviewStatus,
          humanScore: d.review.humanScore ?? null,
          humanVerdict: d.review.humanVerdict ?? null,
          reviewedBy: d.review.humanScore != null ? analyst.id : null,
        },
        create: {
          orgId: user.orgId, indicatorId: indicator.id,
          reviewStatus: d.review.reviewStatus,
          humanScore: d.review.humanScore ?? null,
          humanVerdict: d.review.humanVerdict ?? null,
          reviewedBy: d.review.humanScore != null ? analyst.id : null,
        },
      });
    }
  }

  const variant = isOrgUser ? "org-member (two-card + analyst)" : "individual (one-card)";
  console.log(`Done. ${user.name || email} now has 3 demo reports — ${variant} variant.`);
  if (isOrgUser) console.log(`Reviewer for scored reports: ${analyst.name || analyst.email}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("Error:", e.message);
    await prisma.$disconnect();
    process.exit(1);
  });
