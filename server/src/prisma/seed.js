// ============================================================
// Seed a realistic Orbis demo dataset so the app looks real in a demo.
// Run: npm -w server run prisma:seed   (after `prisma migrate dev`)
//
// Creates: 1 org (Acme Inc.) + individuals, users across roles, global
// indicators (safe/suspicious/dangerous per the 100=safe scale), submissions,
// per-org reviews (two-phase verdict), a campaign, and notifications.
//
// SCORE DIRECTION: aiScore/humanScore are 0-100 SAFETY (100 = safe, low = dangerous).
// Idempotent-ish: clears the core tables first so re-runs are clean.
// ============================================================
import { prisma } from "../db.js";

async function reset() {
  // Delete in FK-safe order.
  await prisma.notification.deleteMany();
  await prisma.orgReview.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.submission.deleteMany();
  await prisma.indicator.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

async function main() {
  console.log("Seeding Orbis demo data…");
  await reset();

  // ── Organization ──
  const acme = await prisma.organization.create({
    data: { clerkOrgId: "org_demo_acme", name: "Acme Inc." },
  });

  // ── Users ──
  // Analyst (also the org admin in Clerk terms), a member, and a solo individual.
  const priya = await prisma.user.create({
    data: { clerkUserId: "user_demo_priya", orgId: acme.id, email: "priya@acme.com", name: "Priya S.", role: "analyst" },
  });
  const david = await prisma.user.create({
    data: { clerkUserId: "user_demo_david", orgId: acme.id, email: "david@acme.com", name: "David M.", role: "member" },
  });
  const sofia = await prisma.user.create({
    data: { clerkUserId: "user_demo_sofia", orgId: null, email: "sofia@example.com", name: "Sofia", role: "individual" },
  });

  // ── Campaign (analyst clustering, org-scoped) ──
  const campaign = await prisma.campaign.create({
    data: { orgId: acme.id, name: "Bank impersonation", sharedSignal: "paypal-lookalike domains" },
  });

  // ── Global indicators (shared threat intel; 100 = safe) ──
  const paypalScam = await prisma.indicator.create({
    data: {
      canonicalKey: "paypa1-secure.com/verify",
      domain: "paypa1-secure.com",
      status: "done",
      aiScore: 22, // low = dangerous
      aiVerdict: "This link doesn't go where it says. The real site is paypal.com, but this points to paypa1-secure.com. Do not enter your details.",
      aiConfidence: "high",
      screenshotUrl: null,
      blacklistHit: true,
      blacklistSource: "google_safe_browsing:SOCIAL_ENGINEERING",
      domainAgeDays: 3,
      reportCount: 12,
    },
  });
  const fedexMaybe = await prisma.indicator.create({
    data: {
      canonicalKey: "fedex-track-parcel.co/track",
      domain: "fedex-track-parcel.co",
      status: "done",
      aiScore: 54, // mid = suspicious
      aiVerdict: "This tracking link uses a shortened redirect and a low-reputation domain, but no credential form was found. Treat with caution.",
      aiConfidence: "medium",
      domainAgeDays: 180,
      reportCount: 3,
    },
  });
  const hrSafe = await prisma.indicator.create({
    data: {
      canonicalKey: "intranet.acme.com/benefits",
      domain: "intranet.acme.com",
      status: "done",
      aiScore: 91, // high = safe
      aiVerdict: "Legitimate internal communication from the Acme HR team. Sender verified, links point to the internal portal.",
      aiConfidence: "high",
      domainAgeDays: 2200,
      reportCount: 1,
    },
  });

  // ── Submissions (report events; many → one indicator) ──
  await prisma.submission.createMany({
    data: [
      { userId: david.id, orgId: acme.id, indicatorId: paypalScam.id, rawUrl: "https://paypa1-secure.com/verify?id=david", source: "web", escalated: true },
      { userId: david.id, orgId: acme.id, indicatorId: fedexMaybe.id, rawUrl: "https://fedex-track-parcel.co/track?x=99", source: "email", escalated: true },
      { userId: david.id, orgId: acme.id, indicatorId: hrSafe.id, rawUrl: "https://intranet.acme.com/benefits", source: "web", escalated: true },
      { userId: sofia.id, orgId: null, indicatorId: paypalScam.id, rawUrl: "https://paypa1-secure.com/verify?id=sofia", source: "web", escalated: false },
    ],
  });

  // ── Per-org reviews (two-phase verdict) ──
  // Priya confirmed the PayPal scam (overrode with her own score); FedEx still pending.
  await prisma.orgReview.create({
    data: {
      orgId: acme.id,
      indicatorId: paypalScam.id,
      humanScore: 18,
      humanVerdict: "Analyzed headers and registrar. Domain registered via NameCheap 72h ago. SPF/DKIM failing. Confirmed high-priority phishing campaign targeting employees.",
      reviewStatus: "confirmed malicious",
      reviewedBy: priya.id,
      campaignId: campaign.id,
    },
  });
  await prisma.orgReview.create({
    data: { orgId: acme.id, indicatorId: fedexMaybe.id, reviewStatus: "pending review" },
  });
  await prisma.orgReview.create({
    data: {
      orgId: acme.id,
      indicatorId: hrSafe.id,
      humanScore: 94,
      humanVerdict: "Verified internal HR communication. Safe.",
      reviewStatus: "confirmed safe",
      reviewedBy: priya.id,
    },
  });

  // ── Notifications (closure loop: reporter told an analyst confirmed a verdict) ──
  await prisma.notification.createMany({
    data: [
      { userId: david.id, indicatorId: paypalScam.id, type: "verdict_confirmed", message: "Priya S. confirmed your report 'Fake PayPal account-locked email' as Dangerous.", isRead: false },
      { userId: david.id, indicatorId: hrSafe.id, type: "verdict_confirmed", message: "Priya S. confirmed 'HR benefits enrollment reminder' as Safe.", isRead: true },
    ],
  });

  const counts = {
    organizations: await prisma.organization.count(),
    users: await prisma.user.count(),
    indicators: await prisma.indicator.count(),
    submissions: await prisma.submission.count(),
    orgReviews: await prisma.orgReview.count(),
    campaigns: await prisma.campaign.count(),
    notifications: await prisma.notification.count(),
  };
  console.log("Seed complete:", counts);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
