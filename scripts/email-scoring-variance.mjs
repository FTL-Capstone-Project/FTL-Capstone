// ── tool: Tier-3 LLM VARIANCE / paraphrase test · owner: Ozias ──
//
// The deterministic scorer is reproducible by construction (same signals → same number). The LLM is
// NOT: analyzeEmailBody asks gpt-4o-mini which catalog signals a body contains, and generateSenderReport
// asks it to score a sender. So the real reproducibility question is: does a user forwarding the SAME
// scam, worded slightly differently, get the SAME verdict twice? A "SAFE then DANGER" flip on
// semantically-identical mail is a trust-killer.
//
// This picks representative corpus items, generates N paraphrases each (same sender/domain/intent,
// reworded body — via the LLM), scores ALL through the faithful pipeline, and reports the score SPREAD
// per group + any group that CROSSES a bucket boundary (SAFE/REVIEW/DANGER) — the failures that matter.
//
// Run from server/:
//   cd server && node ../scripts/email-scoring-variance.mjs [--n=8] [--groups=id1,id2,...] [corpus.json]
// Default: 8 paraphrases each of a built-in representative set. Cost ≈ groups × (N paraphrase-gen + N×2
// scoring) LLM calls ≈ small.
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, "../server/.env") });
const { env } = await import("../server/src/config/env.js");
const { chatJSON } = await import("../server/src/services/llm.js");
const { generateSenderReport } = await import("../server/src/features/askOrbo/senderReport.js");
const { analyzeEmailBody, combineEmailReports, combineLinkReports } = await import("../server/src/features/webhooks/emailAnalysis.js");
const { extractOriginalSender, extractOriginalSenderParts, extractHtmlLinks, parseAuthResults, extractEmailAddress } = await import("../server/src/features/webhooks/inboundEmail.js");
const { scoreBucket } = await import("../server/src/services/verdict.js");

const BUCKET = (s) => (s == null ? "n/a" : scoreBucket(s) === "safe" ? "SAFE" : scoreBucket(s) === "review" ? "REVIEW" : "DANGER");

const args = process.argv.slice(2);
const nArg = args.find((a) => a.startsWith("--n="));
const N = nArg ? parseInt(nArg.slice(4), 10) : 8;
const groupsArg = args.find((a) => a.startsWith("--groups="));
const corpusPath = args.find((a) => !a.startsWith("--"));

// Faithful scoring of one raw-forward item (mirrors the Tier-1 harness / runEmailPipeline).
const scoreItem = async ({ from = "", subject = "", body = "", html = null, headers = null, replyTo = null, linkScores = [] }) => {
  const senderToJudge = extractOriginalSender(body) || extractEmailAddress(from) || String(from || "");
  const senderIdentity = extractOriginalSenderParts(body);
  const htmlLinks = extractHtmlLinks(html);
  const auth = parseAuthResults(headers);
  const senderContext = [subject && `Subject: ${subject}`, body && `Message: ${body}`].filter(Boolean).join("\n");
  const link = Array.isArray(linkScores) && linkScores.length
    ? combineLinkReports(linkScores.map((sc, i) => ({ url: `https://link${i}.example.com`, report: { ai_score: sc, ai_verdict: "Link check.", ai_confidence: "medium", title: "Link", tags: [], evidence: [], screenshot_url: null } })))
    : null;
  const [sender, bodyReport] = await Promise.all([
    generateSenderReport({ email: senderToJudge, context: senderContext }).catch(() => null),
    analyzeEmailBody({ from, subject, body, senderIdentity, htmlLinks, auth, replyTo }).catch(() => null),
  ]);
  return combineEmailReports({ sender, body: bodyReport, link }).ai_score;
};

// Ask the LLM to reword ONE forwarded email's original-message text, keeping the forward header (sender,
// domain, subject) and intent identical. Returns the full item with a reworded body.
const paraphrase = async (item, i) => {
  const out = await chatJSON({
    system: "You reword emails for testing. Keep the meaning, sender, and intent identical; change only the wording of the message body.",
    user: `Reword the ORIGINAL MESSAGE inside this forwarded email (the text AFTER the blank line following the forward header). Keep the "---------- Forwarded message ---------" header block, the From line, the domain, and the subject EXACTLY as-is. Keep the same intent and any request. Just vary phrasing/sentence order like a different real sender would write it. Variation #${i}. Reply ONLY minified JSON: {"body":"<the full body including the unchanged forward header>"}.\n\nEMAIL BODY:\n${item.body}`,
    maxTokens: 700, temperature: 0.9,
  });
  return { ...item, body: typeof out?.body === "string" && out.body.includes("From:") ? out.body : item.body };
};

// Representative built-in set (used unless --groups + a corpus is given). Real resolving domains for
// legit, lookalikes for scams — same methodology as the main corpus.
const DEFAULT_GROUPS = [
  { id: "v-paypal-lookalike", expect: "DANGER", from: "u@x.com", subject: "Fwd: account limited", linkScores: [10],
    body: "---------- Forwarded message ---------\nFrom: PayPal Security <service@paypa1-secure.com>\nSubject: account limited\nTo: u@x.com\n\nWe limited your account. Confirm your login within 24 hours or lose access. Verify now." },
  { id: "v-github-otp", expect: "SAFE", from: "u@x.com", subject: "Fwd: your code", linkScores: [],
    body: "---------- Forwarded message ---------\nFrom: GitHub <noreply@github.com>\nSubject: your code\nTo: u@x.com\n\nHere is your one-time verification code: 481920. It expires in 10 minutes. If you didn't request it, ignore this email." },
  { id: "v-bec-giftcard", expect: "DANGER", from: "u@x.com", subject: "Fwd: quick favor", linkScores: [],
    body: "---------- Forwarded message ---------\nFrom: Mark Reyes <mark.reyes.ceo@gmail.com>\nSubject: quick favor\nTo: u@x.com\n\nI'm in meetings. Buy 5 Apple gift cards ($200 each), scratch off the codes, and send me photos. Keep it between us." },
  { id: "v-benefits-reminder", expect: "SAFE", from: "u@x.com", subject: "Fwd: enrollment closes Friday", linkScores: [85],
    body: "---------- Forwarded message ---------\nFrom: ADP <notifications@adp.com>\nSubject: enrollment closes Friday\nTo: u@x.com\n\nDear Employee, open enrollment for 2026 benefits closes Friday at 5pm. Review your elections in the portal. No action needed to keep your current plan." },
];

let groups = DEFAULT_GROUPS;
if (corpusPath && groupsArg) {
  const corpus = JSON.parse(readFileSync(corpusPath, "utf8"));
  const ids = groupsArg.slice("--groups=".length).split(",");
  groups = ids.map((id) => corpus.find((c) => c.id === id)).filter(Boolean);
}

try { await chatJSON({ system: "JSON only.", user: 'Return {"ok":true}', maxTokens: 20 }); }
catch (e) { console.error(`✗ LLM smoke-test failed: ${e.message.slice(0, 120)} — put OPENAI_API_KEY in server/.env`); process.exit(2); }

console.log(`\nOrbis email scoring — Tier-3 VARIANCE (model: ${env.llmModel}, ${N} paraphrases/group)\n`);
const report = [];
for (const g of groups) {
  // Score the original + N paraphrases.
  const variants = [g, ...(await Promise.all(Array.from({ length: N }, (_, i) => paraphrase(g, i + 1))))];
  const scores = [];
  for (const v of variants) scores.push(await scoreItem(v));
  const nums = scores.filter((s) => typeof s === "number");
  const min = Math.min(...nums), max = Math.max(...nums);
  const buckets = [...new Set(scores.map(BUCKET))];
  const crosses = buckets.length > 1;
  report.push({ id: g.id, expect: g.expect, scores, min, max, spread: max - min, buckets, crosses });
  console.log(`${crosses ? "⚠ CROSSES" : "  stable "}  ${g.id.padEnd(22)} expect=${g.expect.padEnd(7)} scores=[${scores.join(", ")}]  spread=${max - min}  buckets={${buckets.join(",")}}`);
}

const outDir = resolve(here, "out"); mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, "tier3-variance.json"), JSON.stringify(report, null, 2));
const crossing = report.filter((r) => r.crosses);
console.log(`\n${crossing.length} of ${report.length} group(s) CROSS a bucket boundary on reworded-but-identical mail${crossing.length ? ": " + crossing.map((r) => r.id).join(", ") : "."}`);
console.log(`Wrote → scripts/out/tier3-variance.json\n`);
