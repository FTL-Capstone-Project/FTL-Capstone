// ── tool: resilient corpus generator · owner: Ozias ──
//
// Generates the ~240-case stratified email corpus by calling the LLM directly, in SMALL retry-friendly
// batches (one persona × archetype × label-mix per call, ~8 items). The first attempt (a Workflow with
// one huge ~40-item call per persona) stalled under transient API instability — small batches with
// explicit retries are far more robust, and we control the retry logic here.
//
// Writes scripts/email-scoring-corpus.json. Idempotent-ish: re-run appends nothing; it regenerates.
// Run from server/:  cd server && node ../scripts/generate-corpus.mjs [--per=8]
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { writeFileSync, readFileSync, existsSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, "../server/.env") });
const { env } = await import("../server/src/config/env.js");
const { chatJSON } = await import("../server/src/services/llm.js");

const perArg = process.argv.find((a) => a.startsWith("--per="));
const PER = perArg ? parseInt(perArg.slice(6), 10) : 8;

const REAL_DOMAINS = "chase.com, github.com, google.com, public.govdelivery.com, legionathletics.com, otter.ai, paypal.com, amazon.com, microsoft.com, docusign.net, calendly.com, mailchimp.com, stripe.com, fidelity.com, adp.com, workday.com, zoom.us, dropbox.com, linkedin.com, ups.com, fedex.com, usps.com, irs.gov, ny.gov, coursera.org, handshake.com, indeed.com, glassdoor.com, gusto.com, bamboohr.com";

// Each BATCH = one persona + one archetype + a target label. Small, focused, retry-friendly.
// legit archetypes → SAFE (a couple REVIEW allowed); scam archetypes → DANGER.
const PERSONAS = {
  sofia: "20yo college student, Phoenix. Scholarships, internships, financial-aid, tuition/refund, course mail (coursera.org, handshake.com, indeed.com, ny.gov, public.govdelivery.com).",
  robert: "63yo retiree, Tampa, online thrifter. Package-delivery (usps/ups/fedex), bank-lock (chase/fidelity), deal links, prize scams.",
  maria: "52yo HR coordinator, Cleveland. Resumes from strangers (gmail is NORMAL/fine here), invoices, benefits (adp/gusto/workday/bamboohr), docusign. Invoice/wire fraud, vendor-bank-change BEC.",
  deshawn: "29yo sales rep, Austin startup, no IT. Calendar invites (google), shared docs (dropbox/docusign), zoom, stripe receipts. CEO gift-card BEC from webmail, fake DocuSign.",
  priya: "34yo sole security analyst, Toronto. Phishing waves (paypal/microsoft/google lookalikes, payroll-redirect), plus legit vendor mail (github/stripe/linkedin/mailchimp).",
  tom: "41yo accidental IT/security lead, Denver nonprofit. Benefits (adp/gusto), one-time codes (github/microsoft), donor/grant (ny.gov/irs.gov). Account-suspension traps, payroll BEC.",
};

// archetype → { label, note }. The note names the exact signal-cell to exercise.
const ARCHETYPES = {
  "legit-transactional": { label: "SAFE", note: "receipts, shipping, statements, a one-time-code DELIVERY ('your code is 481920' — delivering, NOT soliciting). Real brand domain + safe link." },
  "legit-marketing": { label: "SAFE", note: "newsletters/reminders, some with a deadline + 'Dear customer' (soft signals alone = normal legit texture). Real/niche domain." },
  "legit-personal": { label: "SAFE", note: "a real 1:1 email (a resume, a colleague). gmail sender is fine here — a personal address is not a scam." },
  "lookalike-impersonation": { label: "DANGER", note: "brand credential-harvest on a LOOKALIKE domain (paypa1-secure.com, micros0ft-verify.com). Dangerous link." },
  "credential-harvest": { label: "DANGER", note: "'confirm your password / log in to verify' at a link, from a throwaway domain. Dangerous link." },
  "payment-bec": { label: "DANGER", note: "gift-card/wire BEC from FREE WEBMAIL (gmail/outlook) claiming to be a boss/CEO; payment ask + secrecy. Usually NO link." },
  "invoice-wire-fraud": { label: "DANGER", note: "vendor invoice with changed bank details, wire urgency, sometimes an attachment. Set headers dkim=fail;dmarc=fail for ~half (forged)." },
  "delivery-fee": { label: "DANGER", note: "'package held, pay a redelivery fee' from a lookalike (usps-delivery-fee.com). Dangerous link." },
};

// Which archetypes each persona plausibly receives (keeps the corpus realistic per-persona).
const PLAN = {
  sofia: ["legit-transactional", "legit-marketing", "credential-harvest", "lookalike-impersonation"],
  robert: ["legit-transactional", "delivery-fee", "lookalike-impersonation", "credential-harvest"],
  maria: ["legit-personal", "legit-transactional", "invoice-wire-fraud", "credential-harvest"],
  deshawn: ["legit-transactional", "legit-marketing", "payment-bec", "lookalike-impersonation"],
  priya: ["legit-transactional", "lookalike-impersonation", "credential-harvest", "payment-bec"],
  tom: ["legit-transactional", "legit-marketing", "invoice-wire-fraud", "credential-harvest"],
};

const ITEM_SHAPE = `Each item: {
  "id":"<persona>-<short>-NN", "persona":"<persona>", "archetype":"<archetype>",
  "expect":"SAFE|REVIEW|DANGER", "desc":"<one line>",
  "from":"<persona's own envelope address, e.g. name@example.com or a company address>",
  "to":"orbischecks+<persona>@gmail.com",
  "subject":"Fwd: <subject>",
  "body":"---------- Forwarded message ---------\\nFrom: <Display Name> <addr@domain>\\nDate: <date>\\nSubject: <subj>\\nTo: <persona addr>\\n\\n<the original message text>",
  "html": null, "headers": null, "replyTo": null,
  "linkScores":[<simulated per-link 0-100 safety: legit []or[85-95], scam-bad-link [8-20], marginal ESP [55-68], text-only []>],
  "expectNotes":"<why this label is correct — the signal-cell>"
}`;

const genBatch = async (persona, archetype) => {
  const a = ARCHETYPES[archetype];
  const system = "You author realistic phishing-triage TEST emails as strict JSON. Realism and correct labels are everything. Reply ONLY minified JSON.";
  const user =
    `Persona: ${persona} — ${PERSONAS[persona]}\n` +
    `Archetype: ${archetype} → target label ${a.label}. ${a.note}\n\n` +
    `DOMAIN RULE (critical): LEGIT senders (SAFE) MUST use a REAL resolving domain from ONLY this list: ${REAL_DOMAINS}. ` +
    `SCAM senders (DANGER) use realistic lookalike/throwaway domains (paypa1-secure.com, chase-verify.net, acme-billing-updates.com). Never invent a legit domain.\n\n` +
    `Author ${PER} DISTINCT ${archetype} emails for ${persona}, all labeled ${a.label} (you MAY make at most 1 a REVIEW if genuinely ambiguous). Vary senders/subjects/wording — no two alike. ` +
    `Every body MUST start with the forward header block so a parser finds the original sender.\n\n` +
    `${ITEM_SHAPE}\n\nReply ONLY: {"items":[ ... ${PER} items ... ]}`;

  // Retry with backoff — the whole point of this rewrite. temperature nudges variety across retries.
  let lastErr;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const out = await chatJSON({ system, user, maxTokens: 3500, temperature: 0.7 });
      const items = Array.isArray(out?.items) ? out.items : [];
      if (items.length) return items.map((it, i) => ({ ...it, persona, archetype, id: it.id || `${persona}-${archetype}-${i + 1}` }));
      lastErr = new Error("no items in response");
    } catch (e) { lastErr = e; }
    await new Promise((r) => setTimeout(r, 1500 * attempt)); // linear backoff
  }
  console.error(`  ✗ ${persona}/${archetype} failed after 4 attempts: ${lastErr?.message?.slice(0, 100)}`);
  return [];
};

// Smoke-test first.
try { await chatJSON({ system: "JSON only.", user: 'Return {"ok":true}', maxTokens: 20 }); }
catch (e) { console.error(`✗ LLM smoke-test failed: ${e.message.slice(0, 120)}`); process.exit(2); }

const outPath = resolve(here, "email-scoring-corpus.json");
// Resume-friendly: keep any items already written, only regenerate missing (persona,archetype) cells.
const existing = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : [];
const have = new Set(existing.map((it) => `${it.persona}/${it.archetype}`));
let corpus = [...existing];

const cells = [];
for (const [persona, archs] of Object.entries(PLAN)) for (const arch of archs) cells.push([persona, arch]);
console.log(`\nGenerating corpus: ${cells.length} cells × ${PER} items ≈ ${cells.length * PER} (model: ${env.llmModel})`);
console.log(`Already have: ${existing.length} items across ${have.size} cells\n`);

for (const [persona, arch] of cells) {
  if (have.has(`${persona}/${arch}`)) { console.log(`  ↺ skip ${persona}/${arch} (already have)`); continue; }
  const items = await genBatch(persona, arch);
  corpus = corpus.concat(items);
  console.log(`  ✓ ${persona}/${arch}: +${items.length}  (total ${corpus.length})`);
  writeFileSync(outPath, JSON.stringify(corpus, null, 2)); // write after EACH cell → crash-safe partial progress
}

// Summary.
const byLabel = {}, byPersona = {}, byArch = {};
for (const it of corpus) { byLabel[it.expect] = (byLabel[it.expect] || 0) + 1; byPersona[it.persona] = (byPersona[it.persona] || 0) + 1; byArch[it.archetype] = (byArch[it.archetype] || 0) + 1; }
console.log(`\nDONE: ${corpus.length} items → ${outPath}`);
console.log("  by label:", JSON.stringify(byLabel));
console.log("  by persona:", JSON.stringify(byPersona));
console.log("  by archetype:", JSON.stringify(byArch));
