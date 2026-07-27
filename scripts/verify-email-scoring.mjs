// ── tool: end-to-end email scoring verification · owner: David ──
//
// Unit tests mock the LLM, so they can prove the WIRING is right but never that a REAL email gets a
// sane score. This harness closes that gap: it runs the ACTUAL pipeline — real DNS lookups, the real
// LLM call, the real reputation/typosquat backstops, the real combineEmailReports — against a corpus
// of messages we've actually seen, and asserts the level a user would see in the Gmail badge.
//
// It exists because every false positive we've shipped (a NY-State financial-aid notice, an Otter.ai
// digest, a coaching newsletter all reading "Be careful") passed the unit suite. Everyday users judge
// us on THESE emails, so these are the cases that need a live check before a demo or a deploy.
//
// Run it from the server/ dir (needs the real keys in server/.env):
//   node ../scripts/verify-email-scoring.mjs            # sender + body legs (no urlscan quota burn)
//   node ../scripts/verify-email-scoring.mjs --links    # also sandbox-scan the links (slow, ~30-45s/link)
//   node ../scripts/verify-email-scoring.mjs --only=legion
//
// COSTS REAL MONEY/QUOTA: one LLM call per leg per case. Exits non-zero if any case fails, so CI or a
// pre-demo check can gate on it.
//
// The bodies below are REPRESENTATIVE RECONSTRUCTIONS of the real messages (paraphrased from the same
// sender + subject + intent), not verbatim captures — we don't commit real inboxes to git. The sender
// addresses and domains ARE the real ones, which is what the deterministic backstops key off.
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Load server/.env explicitly so the harness works no matter which dir it's invoked from (env.js does
// a bare `import "dotenv/config"`, which is cwd-relative and would silently find no keys from repo root).
const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, "../server/.env") });

// Imported AFTER dotenv so env.js sees the keys.
const { generateSenderReport } = await import("../server/src/features/askOrbo/senderReport.js");
const { analyzeEmailBody, combineEmailReports, combineLinkReports } = await import("../server/src/features/webhooks/emailAnalysis.js");
const { scanLinkForReport } = await import("../server/src/features/indicators/indicators.service.js");
const { scoreBucket } = await import("../server/src/services/verdict.js");
const { env } = await import("../server/src/config/env.js");

// What the Gmail badge shows the user, from the combined safety score.
const levelForScore = (score) => {
  const bucket = scoreBucket(score);
  return bucket === "safe" ? "safe" : bucket === "review" ? "warning" : "dangerous";
};

// ── the corpus ──────────────────────────────────────────────────────────────────────────────────
// `expect` is the level a REASONABLE user would accept. "safe" for ordinary legitimate mail,
// "dangerous" for a scam. We deliberately do NOT accept "warning" for legit mail: a warning on a
// financial-aid notice is the false positive this whole harness is here to catch.
const CORPUS = [
  {
    name: "HESC financial aid (NY State, via govdelivery ESP)",
    sender: "HESC.Information@public.govdelivery.com",
    subject: "Your 2026-27 TAP application has been received",
    body: `New York State Higher Education Services Corporation

We received your 2026-27 Tuition Assistance Program (TAP) application. You can view your award
status and any outstanding requirements by signing in to your HESC account.

If you have questions, contact us at 1-888-697-4372, Monday through Friday.

This is an automated message from the New York State Higher Education Services Corporation.
You are receiving it because you applied for New York State student financial aid.`,
    urls: ["https://www.hesc.ny.gov/"],
    expect: "safe",
  },
  {
    name: "Otter.ai meeting notes digest",
    sender: "noreply@otter.ai",
    subject: "Your meeting notes are ready",
    body: `Your notes from "Capstone standup" are ready.

Otter captured 28 minutes of conversation and pulled out 4 action items. Open the conversation to
read the summary, edit the transcript, or share it with your team.

You're receiving this because you have email notifications turned on. Manage your notification
preferences in your Otter account settings.`,
    urls: ["https://otter.ai/"],
    expect: "safe",
  },
  {
    name: "Legion coaching newsletter (niche-but-legit small business)",
    sender: "contact@legionathletics.com",
    subject: "Your training check-in + this week's article",
    body: `Hey,

Quick check-in from the Legion coaching team. This week's article covers how to structure a training
block when you're short on time, and why adding volume slowly beats adding it all at once.

If you're working through the beginner program, reply to this email and let us know how week 3 went —
a coach reads every reply.

You're receiving this because you subscribed to the Legion newsletter. Unsubscribe any time.`,
    urls: ["https://legionathletics.com/"],
    expect: "safe",
  },
  {
    name: "SCAM GUARD: paypa1 credential harvest (lookalike domain)",
    sender: "service@paypa1-secure.com",
    subject: "Your account has been limited - action required within 24 hours",
    body: `Dear Customer,

We have detected unusual activity on your PayPal account and have temporarily limited it for your
protection. You must confirm your identity within 24 hours or your account will be permanently
suspended and any pending transfers will be reversed.

Click below to verify your login credentials and restore full access immediately.

Verify My Account Now

PayPal Security Team`,
    urls: [],
    expect: "dangerous",
  },
  {
    name: "SCAM GUARD: gift-card BEC from free webmail",
    sender: "michael.reyes.ceo.office@gmail.com",
    subject: "Quick favor - need this handled discreetly",
    body: `Are you at your desk?

I'm tied up in back-to-back meetings and can't take calls. I need you to purchase 5 Apple gift cards
($200 each) for a client appreciation gift today. Once you have them, scratch off the back and send
me photos of the codes right away. I'll approve the reimbursement when I'm out.

Please keep this between us until the announcement goes out.

Sent from my iPhone`,
    urls: [],
    expect: "dangerous",
  },
];

const args = process.argv.slice(2);
const withLinks = args.includes("--links");
const onlyArg = args.find((a) => a.startsWith("--only="));
const only = onlyArg ? onlyArg.slice("--only=".length).toLowerCase() : null;
const cases = only ? CORPUS.filter((c) => c.name.toLowerCase().includes(only)) : CORPUS;

// One case → the combined report + the per-leg numbers, so a failure tells you WHICH leg misfired.
const runCase = async (testCase) => {
  const [senderReport, bodyReport] = await Promise.all([
    generateSenderReport({ email: testCase.sender, context: testCase.subject }).catch((e) => {
      console.error(`   sender leg threw: ${e.message}`);
      return null;
    }),
    analyzeEmailBody({ from: testCase.sender, subject: testCase.subject, body: testCase.body }).catch((e) => {
      console.error(`   body leg threw: ${e.message}`);
      return null;
    }),
  ]);

  let link = null;
  if (withLinks && env.urlscanApiKey && testCase.urls?.length) {
    const scans = await Promise.all(
      testCase.urls.map((url) => scanLinkForReport(url).then((report) => ({ url, report })).catch(() => ({ url, report: null })))
    );
    link = combineLinkReports(scans);
  }

  const combined = combineEmailReports({ sender: senderReport, body: bodyReport, link });
  return { senderReport, bodyReport, link, combined };
};

const pad = (s, n) => String(s).padEnd(n);
let failures = 0;

console.log(`\nOrbis email scoring — LIVE verification (model: ${env.llmModel}, links: ${withLinks ? "ON" : "off"})\n`);

for (const testCase of cases) {
  const { senderReport, bodyReport, link, combined } = await runCase(testCase);
  const score = combined?.ai_score ?? null;
  const level = score == null ? "n/a" : levelForScore(score);
  const ok = level === testCase.expect;
  if (!ok) failures += 1;

  console.log(`${ok ? "PASS" : "FAIL"}  ${testCase.name}`);
  console.log(`      sender=${pad(senderReport?.ai_score ?? "—", 5)} body=${pad(bodyReport?.ai_score ?? "—", 5)}` +
    `signals=${pad(bodyReport?.signalMeta?.count ?? "—", 4)} link=${pad(link?.ai_score ?? "—", 5)}` +
    `→ combined=${pad(score ?? "—", 5)} level=${pad(level, 10)} expected=${testCase.expect}`);
  // The user-facing "why" — a score can be right for the wrong reason, so always show the top rows.
  for (const row of (combined?.evidence ?? []).slice(0, 3)) {
    console.log(`      · [${row.severity}] ${String(row.text).replace(/\s+/g, " ").slice(0, 150)}`);
  }
  console.log();
}

console.log(failures === 0
  ? `All ${cases.length} case(s) passed.\n`
  : `${failures} of ${cases.length} case(s) FAILED — a real user would see the wrong badge.\n`);

process.exit(failures === 0 ? 0 : 1);
