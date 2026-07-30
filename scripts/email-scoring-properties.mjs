// ── tool: Tier-0 email-scoring PROPERTY tests · owner: Ozias ──
//
// FREE, deterministic, no-network, no-LLM invariants over the REAL scoring code. Unlike a labeled
// corpus (which asks "is THIS email's score right?"), these ask "does the scoring MATH obey the rules
// it claims to?" — properties that must hold for EVERY input, so they need no ground-truth labels and
// run exhaustively over the small deterministic input space in seconds.
//
// Four checks:
//   1. MONOTONICITY   — adding a red flag must never RAISE the final combined safety score.
//   2. WORST-OF FLOOR — any leg < 35 (dangerous) must dominate: final <= that leg.
//   3. PARSING        — extractOriginalSender/Parts/HtmlLinks/parseAuthResults across the real client
//                       forward formats (Gmail/Outlook/Apple/quoted/user-note-above/plain-text).
//   4. IMPERSONATION  — detectSenderMismatch coverage over brand/display-name pairs; REPORTS which
//                       brands slip through (the list-bound false-negative gap, per scoring-calibration).
//
// This is a MEASUREMENT tool. It reports violations; it does NOT change any threshold/weight.
// Run:  node scripts/email-scoring-properties.mjs
// Exit: non-zero if any HARD invariant (monotonicity / worst-of / parsing) fails. Coverage gaps are
//       reported but do NOT fail the run (they're known, list-bound, and tracked as follow-ups).

const B = new URL("../server/src/", import.meta.url).pathname;
const { scoreEmailBodySignals, SIGNAL_CATALOG } = await import(`${B}features/vision/phishingSignals.js`);
const { combineEmailReports, reconcileLegScores, detectSenderMismatch } = await import(`${B}features/webhooks/emailAnalysis.js`);
const { extractOriginalSender, extractOriginalSenderParts, extractHtmlLinks, parseAuthResults } = await import(`${B}features/webhooks/inboundEmail.js`);

const KEYS = Object.keys(SIGNAL_CATALOG);
const bucket = (s) => (s == null ? "n/a" : s >= 70 ? "SAFE" : s >= 35 ? "REVIEW" : "DANGER");

// A VerdictCard-shaped leg from a bare score (null = leg absent).
const leg = (s) => (s == null ? null : { ai_score: s, ai_verdict: "v", ai_confidence: "medium", title: "t", tags: [], evidence: [] });
// A body leg built from the REAL scorer, carrying the signalMeta combineEmailReports needs.
const bodyLeg = (signals) => {
  const s = scoreEmailBodySignals(signals);
  return { ai_score: s.rawScore, ai_verdict: "v", ai_confidence: "medium", title: "t", tags: [], evidence: s.evidence,
           signalMeta: { crownCount: s.crownCount, hardOtherCount: s.hardOtherCount, count: s.count } };
};
const finalScore = (send, signals, link) => combineEmailReports({ sender: leg(send), body: bodyLeg(signals), link: leg(link) }).ai_score;

// All 2^9 signal subsets (the full body-signal input space).
let SUBSETS = [[]];
for (const k of KEYS) SUBSETS = [...SUBSETS, ...SUBSETS.map((s) => [...s, k])];
const SENDERS = [15, 34, 55, 60, 65, 68, 70, 85, 100, null];
const LINKS = [12, 34, 52, 60, 68, 88, null];

let hardFailures = 0;
const line = (n) => console.log("".padEnd(n, "─"));

// ── 1. MONOTONICITY ────────────────────────────────────────────────────────────────────────────
// Adding a catalog red flag to the body must never INCREASE the combined safety score. If it does,
// the report is telling the user "more evidence of a scam = safer", which is incoherent.
console.log("\n① MONOTONICITY — adding a red flag must never raise the final score");
line(96);
{
  let checked = 0;
  const viol = [];   // GENUINE: numeric base rose when a flag was added
  const nullUp = [];  // INFORMATIONAL: unscorable (null) base became a number — not a safety increase
  for (const send of SENDERS) for (const link of LINKS) for (const sub of SUBSETS) {
    const base = finalScore(send, sub, link);
    for (const k of KEYS) {
      if (sub.includes(k)) continue;
      const withK = finalScore(send, [...sub, k], link);
      checked++;
      // A monotonicity violation is only meaningful between two NUMBERS on the safety scale. A null
      // base means "nothing was scorable" — turning that into a number isn't "danger raised safety",
      // so we bucket those separately as informational rather than inflating the violation count.
      if (typeof base === "number" && typeof withK === "number" && withK > base) {
        viol.push({ send, link, sub: sub.join("+") || "(clean)", added: k, base, withK });
      } else if (base == null && typeof withK === "number") {
        nullUp.push({ send, link, added: k, withK });
      }
    }
  }
  console.log(`   comparisons: ${checked}   GENUINE VIOLATIONS (number→higher number): ${viol.length}   (null→number transitions, informational: ${nullUp.length})`);
  if (viol.length) {
    hardFailures += viol.length;
    // Collapse to the distinct MECHANISM (per scoring-calibration: root-cause, don't list every case).
    const byShape = new Map();
    for (const v of viol) {
      const key = `sender=${v.send} link=${v.link} base[${v.sub}]=${v.base} → +flag=${v.withK}`;
      if (!byShape.has(key)) byShape.set(key, []);
      byShape.get(key).push(v.added);
    }
    console.log("   distinct shapes (each = one mechanism instance):");
    for (const [shape, added] of byShape) console.log(`     • ${shape}   (any of: ${[...new Set(added)].join(", ")})`);
    console.log("   ROOT CAUSE: reconcileLegScores([65])=" + reconcileLegScores([65]) +
      " but reconcileLegScores([65,94])=" + reconcileLegScores([65, 94]) +
      " — a clean body is neutralized (null), so a lone marginal (65-69) sender is REVIEW; but the moment the");
    console.log("     body gains ANY flag it becomes a 2nd present leg, tripping the 'one marginal + one clean ⇒ round up to 70' branch.");
  }
}

// ── 2. WORST-OF FLOOR ──────────────────────────────────────────────────────────────────────────
// The skill's load-bearing guarantee: any DANGEROUS leg (< 35) must dominate absolutely — a real scam
// can never read safer than its worst leg. (A clean body is neutralized to null, so exclude the
// body-signal axis here and drive danger through the sender/link legs, which are never neutralized.)
console.log("\n② WORST-OF FLOOR — any leg < 35 must dominate (final <= that leg)");
line(96);
{
  let checked = 0;
  const viol = [];
  for (const send of SENDERS) for (const link of LINKS) for (const sub of SUBSETS) {
    const legvals = [send, link].filter((s) => typeof s === "number");
    if (!legvals.length) continue;
    const worst = Math.min(...legvals);
    if (worst >= 35) continue; // property only claims something when a dangerous leg is present
    const final = finalScore(send, sub, link);
    checked++;
    if (final > worst) viol.push({ send, link, sub: sub.join("+") || "(clean)", worst, final });
  }
  console.log(`   dangerous-leg cases: ${checked}   VIOLATIONS: ${viol.length}`);
  if (viol.length) {
    hardFailures += viol.length;
    for (const v of viol.slice(0, 15)) console.log(`     • sender=${v.send} link=${v.link} [${v.sub}] worst=${v.worst} → final=${v.final} (${bucket(v.final)})`);
  }
}

// ── 3. PARSING FIDELITY ──────────────────────────────────────────────────────────────────────────
// The harness (Tier 1) and prod both parse the ORIGINAL sender out of the forwarded body. If parsing
// picks the wrong "From:" (or misses a client format), the whole sender leg judges the wrong address.
console.log("\n③ FORWARD PARSING — original sender across real client formats");
line(96);
{
  const SUSPECT = "service@paypa1-secure.com";
  const cases = [
    ["gmail-plain", `---------- Forwarded message ---------\nFrom: PayPal Security <${SUSPECT}>\nDate: Mon\nSubject: X\nTo: sofia@example.com\n\nbody`, SUSPECT],
    ["outlook", `From: PayPal Security <${SUSPECT}>\nSent: Monday\nTo: Sofia\nSubject: X\n\nbody`, SUSPECT],
    ["apple-mail", `Begin forwarded message:\n\nFrom: "PayPal Security" <${SUSPECT}>\nSubject: X\nDate: July 27\nTo: sofia@example.com`, SUSPECT],
    ["quoted-reply", `> From: PayPal Security <${SUSPECT}>\n> Subject: X`, SUSPECT],
    ["user-note-above", `Hi Orbis, got this from: my bank? looks off\n\n---------- Forwarded message ---------\nFrom: PayPal Security <${SUSPECT}>\nSubject: X`, SUSPECT],
    ["plain-text-no-header", `Dear customer, your account is locked. Click https://evil.com`, null], // KNOWN GAP: no From line
  ];
  let fails = 0;
  for (const [name, body, expect] of cases) {
    const got = extractOriginalSender(body);
    const ok = got === expect;
    if (!ok) fails++;
    const gap = name === "plain-text-no-header" ? "  ⟵ KNOWN GAP (sender leg falls back to the forwarder)" : "";
    console.log(`   ${ok ? "PASS" : "FAIL"}  ${name.padEnd(22)} → ${String(got)}${gap}`);
  }
  // These SHOULD all match (the plain-text one expects null, which is the documented fallback behavior).
  if (fails) { hardFailures += fails; console.log(`   ${fails} parsing FAILURE(S)`); }

  // Spot-check the richer extractors so a regression surfaces here, not in a live run.
  const parts = extractOriginalSenderParts(`From: PayPal Security <${SUSPECT}>\nSubject: X`);
  console.log(`   parts:  displayName="${parts?.displayName}" address="${parts?.address}"  ${parts?.displayName === "PayPal Security" && parts?.address === SUSPECT ? "PASS" : "FAIL"}`);
  const links = extractHtmlLinks(`<a href="https://evil.ru/x">www.paypal.com</a><a href="https://ok.com">Click here</a>`);
  console.log(`   htmlLinks: ${JSON.stringify(links)}  ${links.length === 2 && links[0].text === "www.paypal.com" ? "PASS" : "FAIL"}`);
  const auth = parseAuthResults("Authentication-Results: mx.google.com; dkim=fail header.i=@paypal.com; spf=pass; dmarc=fail");
  console.log(`   auth:   ${JSON.stringify(auth)}  ${auth.dkim === "fail" && auth.dmarc === "fail" ? "PASS" : "FAIL"}`);
}

// ── 4. IMPERSONATION COVERAGE ────────────────────────────────────────────────────────────────────
// detectSenderMismatch is deterministic (no LLM). It only fires for brands in the typosquat list, so
// off-list brands slip through. This does NOT fail the run — it QUANTIFIES the known list-bound gap so
// the final report can name exactly which common brands a scammer could impersonate undetected.
console.log("\n④ IMPERSONATION COVERAGE — detectSenderMismatch (report gaps, do not fail)");
line(96);
{
  const probes = [
    ["PayPal Security", "service@paypa1-secure.com"], ["Microsoft 365", "admin@micros0ft-verify.com"],
    ["Chase Bank", "alerts@chase-secure-login.com"], ["IRS", "refunds@irs-gov-refund.com"],
    ["Wells Fargo", "security@wellsfargo-alert.net"], ["Bank of America", "alert@bofa-secure.com"],
    ["USPS", "tracking@usps-delivery-fee.com"], ["FedEx", "parcel@fedex-redelivery.net"],
    ["UPS", "delivery@ups-parcel-fee.com"], ["Netflix", "billing@netflix-billing-update.com"],
    ["Coinbase", "support@coinbase-wallet-verify.com"], ["DocuSign", "dse@docusign-secure-doc.com"],
    ["Zelle", "payments@zelle-transfer.net"], ["Amazon", "orders@amazon-refund-center.com"],
    ["Apple", "appleid@apple-id-locked.com"], ["Google", "no-reply@google-account-alert.com"],
    ["Geico", "claims@geico-policy.net"], ["Robinhood", "alerts@robinhood-secure.com"],
    ["Venmo", "no-reply@venmo-payments.net"], ["Citibank", "alert@citi-online-secure.com"],
    ["Capital One", "fraud@capitalone-verify.com"], ["American Express", "member@amex-secure.net"],
    ["Instagram", "help@instagram-verify-badge.com"], ["LinkedIn", "jobs@linkedln-careers.com"],
  ];
  const missed = [];
  for (const [dn, addr] of probes) {
    const r = detectSenderMismatch({ displayName: dn, address: addr });
    if (!r) missed.push(dn);
  }
  console.log(`   detected: ${probes.length - missed.length}/${probes.length}`);
  console.log(`   MISSED (off-list — a scammer could impersonate these undetected by the deterministic check):`);
  console.log(`     ${missed.length ? missed.join(", ") : "(none)"}`);
  console.log(`   NOTE: the LLM body leg may still flag these via brand_impersonation, but that's a guess, not proof.`);
}

console.log("\n" + "═".repeat(96));
console.log(hardFailures === 0
  ? "Tier-0: all HARD invariants passed. (See coverage gaps above — reported, not failed.)"
  : `Tier-0: ${hardFailures} HARD invariant violation(s) — see ① / ② / ③ above. These are FINDINGS to root-cause, not to patch here.`);
console.log("═".repeat(96) + "\n");
process.exit(hardFailures === 0 ? 0 : 1);
