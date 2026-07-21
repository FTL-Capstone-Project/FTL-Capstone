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

// Small date helper so the demo always looks "recent" (dates are relative to
// whenever the seed runs, not hard-coded). Returns a Date N days before now.
const daysAgo = (n) => {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

const reset = async () => {
  // Delete in FK-safe order.
  await prisma.notification.deleteMany();
  await prisma.orgReview.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.submission.deleteMany();
  await prisma.indicator.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}

const main = async () => {
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

  // More Acme members so "Team History" shows several teammates, not just David.
  const anya = await prisma.user.create({
    data: { clerkUserId: "user_demo_anya", orgId: acme.id, email: "anya@acme.com", name: "Anya K.", role: "member" },
  });
  const marcus = await prisma.user.create({
    data: { clerkUserId: "user_demo_marcus", orgId: acme.id, email: "marcus@acme.com", name: "Marcus T.", role: "member" },
  });
  const sarah = await prisma.user.create({
    data: { clerkUserId: "user_demo_sarah", orgId: acme.id, email: "sarah@acme.com", name: "Sarah L.", role: "member" },
  });

  // ── Campaign (analyst clustering, org-scoped) ──
  // Clusters the PayPal + Microsoft phishing indicators (both brand-impersonation
  // lookalike-domain attacks) so the analyst triage queue can collapse them into one
  // campaign row (G1·06). Two indicators = a visible cluster in the demo.
  const campaign = await prisma.campaign.create({
    data: { orgId: acme.id, name: "Brand impersonation", sharedSignal: "brand-lookalike login domains" },
  });

  // ── Global indicators (shared threat intel; 100 = safe) ──
  const paypalScam = await prisma.indicator.create({
    data: {
      canonicalKey: "paypa1-secure.com/verify",
      domain: "paypa1-secure.com",
      status: "done",
      aiScore: 22,
      aiVerdict: "This link doesn't go where it says. The real site is paypal.com, but this points to paypa1-secure.com. Do not enter your details.",
      aiTitle: "Fake PayPal 'account locked' email",
      aiDescription: "Credential phishing page impersonating PayPal on a newly registered lookalike domain.",
      aiTags: ["Credential phishing", "Campaign: Brand impersonation"],
      // Threat vectors shown in the report detail modal (the "why" rows).
      aiReasons: [
        { text: "Credential harvesting — fake login form captures your password", severity: "dangerous" },
        { text: "Brand impersonation — closely mimics PayPal's branding", severity: "dangerous" },
        { text: "Newly registered domain — created just 3 days ago", severity: "dangerous" },
        { text: "Urgency manipulation — 'account locked' pressure tactic", severity: "review" },
      ],
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
      aiScore: 54,
      aiVerdict: "This tracking link uses a shortened redirect and a low-reputation domain, but no credential form was found. Treat with caution.",
      aiTitle: "Unusual shipping notification from FedEx",
      aiDescription: "Low-reputation domain with a redirect. No credential form found, but proceed with caution.",
      aiTags: ["Social engineering"],
      aiReasons: [
        { text: "Shortened redirect hides the true destination", severity: "review" },
        { text: "Low-reputation domain not linked to the real FedEx", severity: "review" },
        { text: "No credential form detected on the page", severity: "safe" },
      ],
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
      aiScore: 91,
      aiVerdict: "Legitimate internal communication from the Acme HR team. Sender verified, links point to the internal portal.",
      aiTitle: "HR benefits enrollment reminder",
      aiDescription: "Verified internal HR communication. Links point to the Acme internal portal.",
      aiTags: ["Internal comms"],
      aiReasons: [
        { text: "Verified sender on the Acme corporate domain", severity: "safe" },
        { text: "Links resolve to the internal HR portal only", severity: "safe" },
        { text: "Long-established domain with no blacklist history", severity: "safe" },
      ],
      aiConfidence: "high",
      domainAgeDays: 2200,
      reportCount: 1,
    },
  });

  const microsoftScam = await prisma.indicator.create({
    data: {
      canonicalKey: "microsoft365-signin-verify.com/login",
      domain: "microsoft365-signin-verify.com",
      status: "done",
      aiScore: 31,
      aiVerdict: "This is not a Microsoft domain. The real sign-in is login.microsoftonline.com. This lookalike is collecting Microsoft 365 passwords.",
      aiTitle: "Fake Microsoft 365 sign-in page",
      aiDescription: "Credential phishing page impersonating the Microsoft 365 login on a lookalike domain.",
      aiTags: ["Credential phishing", "Impersonation"],
      aiReasons: [
        { text: "Fake login form captures your Microsoft 365 password", severity: "dangerous" },
        { text: "Lookalike domain not owned by Microsoft", severity: "dangerous" },
        { text: "Recently registered domain", severity: "review" },
      ],
      aiConfidence: "high",
      blacklistHit: true,
      blacklistSource: "google_safe_browsing:SOCIAL_ENGINEERING",
      domainAgeDays: 9,
      reportCount: 6,
    },
  });

  // ── Submissions (report events; many → one indicator) ──
  // Spread across Acme teammates and the last ~10 days so "Team History" looks
  // like a real, recent stream of things the org has been encountering.
  // Org submissions are `escalated: true` (auto-escalation, story #4).
  await prisma.submission.createMany({
    data: [
      { userId: david.id,  orgId: acme.id, indicatorId: paypalScam.id,    rawUrl: "https://paypa1-secure.com/verify?id=david", source: "web",   escalated: true, createdAt: daysAgo(8) },
      { userId: anya.id,   orgId: acme.id, indicatorId: microsoftScam.id, rawUrl: "https://microsoft365-signin-verify.com/login", source: "email", escalated: true, createdAt: daysAgo(6) },
      { userId: marcus.id, orgId: acme.id, indicatorId: fedexMaybe.id,    rawUrl: "https://fedex-track-parcel.co/track?x=99",  source: "email", escalated: true, createdAt: daysAgo(4) },
      { userId: sarah.id,  orgId: acme.id, indicatorId: hrSafe.id,        rawUrl: "https://intranet.acme.com/benefits",        source: "web",   escalated: true, createdAt: daysAgo(2) },
      // David also personally checked the FedEx link earlier (proves dedup: one card, newest wins).
      { userId: david.id,  orgId: acme.id, indicatorId: fedexMaybe.id,    rawUrl: "https://fedex-track-parcel.co/track?x=99",  source: "web",   escalated: true, createdAt: daysAgo(9) },
      // Sofia is an individual (no org) → never appears in Acme's Team History.
      { userId: sofia.id,  orgId: null,    indicatorId: paypalScam.id,    rawUrl: "https://paypa1-secure.com/verify?id=sofia", source: "web",   escalated: false, createdAt: daysAgo(3) },
    ],
  });

  // ── Per-org reviews (two-phase verdict) ──
  // Priya confirmed the PayPal scam (overrode with her own score); FedEx still pending.
  // `sharedWithOrg: true` = Priya deemed it safe/useful to show the whole team, so it
  // appears in Team History. Pending/investigating reviews stay unshared (the gate).
  await prisma.orgReview.create({
    data: {
      orgId: acme.id,
      indicatorId: paypalScam.id,
      humanScore: 18,
      humanVerdict: "Analyzed headers and registrar. Domain registered via NameCheap 72h ago. SPF/DKIM failing. Confirmed high-priority phishing campaign targeting employees.",
      reviewStatus: "confirmed malicious",
      sharedWithOrg: true,
      reviewedBy: priya.id,
      campaignId: campaign.id,
    },
  });
  await prisma.orgReview.create({
    data: { orgId: acme.id, indicatorId: fedexMaybe.id, reviewStatus: "pending review" },
  });
  // Microsoft phishing — Priya is actively looking into it (the 4th status word).
  // Part of the same "Brand impersonation" campaign as the PayPal scam → the triage
  // queue clusters both under one campaign row (G1·06).
  await prisma.orgReview.create({
    data: {
      orgId: acme.id,
      indicatorId: microsoftScam.id,
      reviewStatus: "investigating",
      reviewedBy: priya.id,
      campaignId: campaign.id,
    },
  });
  await prisma.orgReview.create({
    data: {
      orgId: acme.id,
      indicatorId: hrSafe.id,
      humanScore: 94,
      humanVerdict: "Verified internal HR communication. Safe.",
      reviewStatus: "confirmed safe",
      sharedWithOrg: true,
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
