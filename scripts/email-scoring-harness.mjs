// ── tool: Tier-1 email-scoring HARNESS (faithful runEmailPipeline replica, NO DB) · owner: Ozias ──
//
// Runs the REAL forwarded-email scoring over a labeled corpus of RAW FORWARDS, reporting FALSE
// POSITIVES and FALSE NEGATIVES as SEPARATE counts (per the scoring-calibration skill — one "accuracy"
// number hides the direction of the error, and the direction is the whole point).
//
// WHY A REPLICA, NOT THE ROUTE: the local DATABASE_URL points at the SHARED PROD Neon DB. Driving the
// real POST /api/webhooks/inbound-email would write ~250 Indicators/Submissions/notifications into the
// team's live DB, pollute analyst triage/campaigns/charts, and email real users. So this reproduces the
// SCORING SECTION of runEmailPipeline (indicators.service.js ~268-312) EXACTLY — same parsing, same
// three legs, same combine — but with zero DB write, zero notification, zero report email.
//
// FIDELITY (line-for-line with runEmailPipeline):
//   senderToJudge  = extractOriginalSender(body) || envelope from      (judge the SUSPECT, not forwarder)
//   senderIdentity = extractOriginalSenderParts(body)                   → deterministic sender_mismatch
//   htmlLinks      = extractHtmlLinks(html)                             → deterministic link_mismatch
//   auth           = parseAuthResults(headers)                          → deterministic forged-sender
//   senderContext  = "Subject: …\nMessage: …"                           (both legs see the same message)
//   sender leg     = generateSenderReport({ email: senderToJudge, context })
//   body leg       = analyzeEmailBody({ from, subject, body, senderIdentity, htmlLinks, auth, replyTo })
//   link leg       = combineLinkReports(scans)  — REAL scanLinkForReport with --links, else simulated
//   combined       = combineEmailReports({ sender, body, link })
//
// LINK LEG default = SIMULATED from per-item `linkScores` (e.g. [88] safe, [12] dangerous). The link
// leg's OWN scoring is David's separately-tested urlscan+SafeBrowsing code; the feature UNDER TEST here
// is the sender leg + body leg + the COMBINE. Simulating avoids burning the urlscan free tier and
// ~30-45s/scan on 250 items. Pass --links to REALLY scan (small subsets only — Tier 2).
//
// Run from the SERVER dir so env.js finds the keys:
//   cd server && node ../scripts/email-scoring-harness.mjs ../scripts/email-scoring-corpus.json
//   … --links               also REALLY sandbox-scan (slow, Tier 2)
//   … --only=bec            filter cases whose id/persona/archetype contains "bec"
//   … --json                machine-readable results (for the judging Workflow) — no human table
//
// COST: sender leg + body leg = 2 LLM calls/case (~$0.0002 each on gpt-4o-mini). ~250 cases ≈ $0.10.
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

// Load server/.env explicitly (env.js does a bare cwd-relative `import "dotenv/config"`), so this works
// from any dir. MUST precede the env.js import below so the keys are visible.
const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, "../server/.env") });

const { env } = await import("../server/src/config/env.js");
const { chatJSON } = await import("../server/src/services/llm.js");
const { generateSenderReport } = await import("../server/src/features/askOrbo/senderReport.js");
const { analyzeEmailBody, combineEmailReports, combineLinkReports } = await import("../server/src/features/webhooks/emailAnalysis.js");
const { scanLinkForReport } = await import("../server/src/features/indicators/indicators.service.js");
const { extractOriginalSender, extractOriginalSenderParts, extractHtmlLinks, parseAuthResults, extractEmailAddress } = await import("../server/src/features/webhooks/inboundEmail.js");
const { scoreBucket } = await import("../server/src/services/verdict.js");

// 0-100 SAFETY score → the label a user sees. We map to the SAME 3 buckets everywhere: SAFE >=70,
// REVIEW 35-69, DANGER <35 (verdict.js scoreBucket). Corpus `expect` uses these three words.
const LEVEL = (score) => (score == null ? "n/a" : scoreBucket(score) === "safe" ? "SAFE" : scoreBucket(score) === "review" ? "REVIEW" : "DANGER");

const args = process.argv.slice(2);
const corpusPath = args.find((a) => !a.startsWith("--"));
const withLinks = args.includes("--links");
const asJson = args.includes("--json");
const onlyArg = args.find((a) => a.startsWith("--only="));
const only = onlyArg ? onlyArg.slice("--only=".length).toLowerCase() : null;
if (!corpusPath) { console.error("usage: node email-scoring-harness.mjs <corpus.json> [--links] [--only=x] [--json]"); process.exit(1); }

// Fail fast on a bad key — never spend a whole run to discover a 401 at the end.
try {
  await chatJSON({ system: "Reply only minified JSON.", user: 'Return {"ok":true}', maxTokens: 20 });
} catch (e) {
  console.error(`\n✗ LLM smoke-test FAILED (${e.message.slice(0, 120)}).`);
  console.error(`  base=${env.llmBaseUrl} model=${env.llmModel} keyPresent=${Boolean(env.llmApiKey)}`);
  console.error("  Fix: put the deployed OPENAI_API_KEY (+ LLM_MODEL=gpt-4o-mini) in server/.env, then retry.\n");
  process.exit(2);
}

let corpus = JSON.parse(readFileSync(corpusPath, "utf8"));
if (only) corpus = corpus.filter((c) => [c.id, c.persona, c.archetype].some((f) => String(f || "").toLowerCase().includes(only)));
if (!corpus.length) { console.error(`No cases match --only=${only}`); process.exit(1); }

// Score ONE raw forward through the faithful replica. Returns the combined report + per-leg detail.
const scoreCase = async (item) => {
  const { from = "", to = "", subject = "", body = "", html = null, headers = null, replyTo = null, linkScores = [] } = item;

  // ── EXACT prod parsing (indicators.service.js runEmailPipeline) ──
  const senderToJudge = extractOriginalSender(body) || extractEmailAddress(from) || String(from || "");
  const senderIdentity = extractOriginalSenderParts(body);
  const htmlLinks = extractHtmlLinks(html);
  const auth = parseAuthResults(headers);
  const senderContext = [subject && `Subject: ${subject}`, body && `Message: ${body}`].filter(Boolean).join("\n");

  // ── LINK LEG: real scan with --links, else simulate from linkScores ──
  let link = null;
  if (withLinks && env.urlscanApiKey && Array.isArray(item.urls) && item.urls.length) {
    const scans = await Promise.all(item.urls.map((url) =>
      scanLinkForReport(url).then((report) => ({ url, report })).catch(() => ({ url, report: null }))));
    link = combineLinkReports(scans);
  } else if (Array.isArray(linkScores) && linkScores.length) {
    link = combineLinkReports(linkScores.map((sc, i) => ({
      url: `https://link${i}.example.com`,
      report: { ai_score: sc, ai_verdict: "Link check.", ai_confidence: "medium", title: "Link", tags: [], evidence: [], screenshot_url: null },
    })));
  }

  // ── SENDER + BODY legs, each best-effort (exactly as prod: a failed leg is simply absent) ──
  const [sender, bodyReport] = await Promise.all([
    generateSenderReport({ email: senderToJudge, context: senderContext }).catch((e) => { if (!asJson) console.error(`   sender leg threw: ${e.message}`); return null; }),
    analyzeEmailBody({ from, subject, body, senderIdentity, htmlLinks, auth, replyTo }).catch((e) => { if (!asJson) console.error(`   body leg threw: ${e.message}`); return null; }),
  ]);

  const combined = combineEmailReports({ sender, body: bodyReport, link });
  return { sender, bodyReport, link, combined, senderToJudge };
};

const pad = (s, n) => String(s ?? "—").padEnd(n);
const results = [];
for (const item of corpus) {
  const { combined, sender, bodyReport, link, senderToJudge } = await scoreCase(item);
  const score = combined?.ai_score ?? null;
  const got = LEVEL(score);
  results.push({
    id: item.id, persona: item.persona, archetype: item.archetype, expect: item.expect, got,
    ok: got === item.expect, score,
    legs: { sender: sender?.ai_score ?? null, body: bodyReport?.ai_score ?? null, link: link?.ai_score ?? null },
    signalCount: bodyReport?.signalMeta?.count ?? null,
    confidence: combined?.ai_confidence ?? null,
    title: combined?.title ?? null,
    verdict: combined?.ai_verdict ?? null,
    // The judged sender (should be the ORIGINAL suspect, not the forwarder) — surfaces the plain-text gap.
    senderJudged: senderToJudge,
    // Full evidence rows so the judge sees exactly what the user would.
    evidence: (combined?.evidence ?? []).map((r) => ({ severity: r.severity, text: r.text })),
    desc: item.desc,
    // The raw forwarded email, so a BLIND judge can decide the level itself from what the user saw
    // (subject + body + any headers). Capped so a huge HTML body can't bloat the judge prompt.
    emailPreview: `Subject: ${item.subject || ""}\n\n${String(item.body || "").slice(0, 2200)}${item.headers ? `\n\n[headers] ${String(item.headers).slice(0, 300)}` : ""}`,
  });
}

if (asJson) { console.log(JSON.stringify(results, null, 2)); process.exit(0); }

// ── Human table ──
console.log(`\nOrbis email scoring — Tier-1 (model: ${env.llmModel}, links: ${withLinks ? "REAL" : "simulated"}, cases: ${results.length})\n`);
console.log(pad("ID", 30), pad("EXP", 7), pad("GOT", 8), pad("SCORE", 6), pad("s/b/l", 16), "TITLE");
console.log("".padEnd(120, "─"));
for (const r of results) {
  const legs = `${r.legs.sender ?? "-"}/${r.legs.body ?? "-"}/${r.legs.link ?? "-"}`;
  console.log(pad(r.id.slice(0, 29), 30), pad(r.expect, 7), pad(r.ok ? r.got : "✗" + r.got, 8), pad(r.score, 6), pad(legs, 16), `"${r.title}"`);
}
console.log("".padEnd(120, "─"));

// ── Confusion matrix ──
const LABELS = ["SAFE", "REVIEW", "DANGER"];
const cm = Object.fromEntries(LABELS.map((e) => [e, Object.fromEntries(LABELS.map((g) => [g, 0]))]));
for (const r of results) if (cm[r.expect] && cm[r.expect][r.got] != null) cm[r.expect][r.got]++;
console.log("\nCONFUSION (rows=expected, cols=got):");
console.log("            " + LABELS.map((l) => pad(l, 9)).join(""));
for (const e of LABELS) console.log(pad(e, 12) + LABELS.map((g) => pad(cm[e][g], 9)).join(""));

// ── FP / FN as SEPARATE counts (the skill's core rule) ──
// FALSE POSITIVE = legit mail (expect SAFE) scored not-SAFE — annoying, over-flagging.
// FALSE NEGATIVE = a scam (expect DANGER) scored not-DANGER — DANGEROUS, someone gets phished.
const fp = results.filter((r) => r.expect === "SAFE" && r.got !== "SAFE");
const fn = results.filter((r) => r.expect === "DANGER" && r.got !== "DANGER");
const reviewMiss = results.filter((r) => r.expect === "REVIEW" && r.got !== "REVIEW");
console.log(`\nTOTAL ${results.length}  |  FALSE POSITIVES (safe→flagged): ${fp.length}  |  FALSE NEGATIVES (scam→not-danger): ${fn.length}  |  review-band misses: ${reviewMiss.length}`);
if (fp.length) console.log("  FP:", fp.map((r) => `${r.id}(${r.got}@${r.score})`).join(", "));
if (fn.length) console.log("  FN:", fn.map((r) => `${r.id}(${r.got}@${r.score})`).join(", "));

// ── Per-archetype FP/FN (so we know WHICH family regresses, per the skill) ──
console.log("\nPER-ARCHETYPE (n | correct | FP | FN):");
const byArch = {};
for (const r of results) {
  const a = r.archetype || "?";
  byArch[a] ??= { n: 0, ok: 0, fp: 0, fn: 0 };
  byArch[a].n++; if (r.ok) byArch[a].ok++;
  if (r.expect === "SAFE" && r.got !== "SAFE") byArch[a].fp++;
  if (r.expect === "DANGER" && r.got !== "DANGER") byArch[a].fn++;
}
for (const [a, s] of Object.entries(byArch).sort()) console.log(`  ${pad(a, 26)} n=${pad(s.n, 4)} ok=${pad(s.ok, 4)} FP=${pad(s.fp, 3)} FN=${s.fn}`);

// ── Persist machine-readable results for the judging Workflow ──
const outDir = resolve(here, "out");
mkdirSync(outDir, { recursive: true });
const outPath = resolve(outDir, "tier1-results.json");
writeFileSync(outPath, JSON.stringify(results, null, 2));
console.log(`\nWrote ${results.length} results → ${outPath}`);
console.log(fp.length + fn.length === 0
  ? "No FP/FN in this corpus.\n"
  : `${fp.length} FP + ${fn.length} FN — root-cause each to a MECHANISM before proposing any fix.\n`);
