// ⚠️ DEV-ONLY in-memory indicator store — the stand-in for the `indicators` table
// until Prisma/Postgres lands (Step 2). It now runs the REAL pipeline in the background:
//   submit → status "scanning" → urlscan sandbox + Safe Browsing blacklist → verdict → "done".
// The client polls GET /api/indicators/:id and sees the status advance for real.
//
// When the DB arrives, this file is deleted: `createPending` becomes a find-or-create by
// canonical_key + INSERT, and the background pipeline writes the row instead of the Map.
// The services (urlscan/safeBrowsing/verdict) DON'T change — only the persistence does.

import { canonicalize } from "../../services/canonicalize.js";
import { scanUrl } from "../../services/urlscan.js";
import { checkBlacklist } from "../../services/safeBrowsing.js";
import { generateVerdict } from "../../services/verdict.js";

let nextId = 1;
const indicators = new Map();       // id → full indicator record
const keyToId = new Map();          // canonical_key → id  (the "seen before" dedup)

// Create-or-find an indicator for this URL, then (if new) run the pipeline in the background.
// Returns { id, seenBefore } synchronously so the route can respond instantly.
export function createPending(rawUrl) {
  let canonicalKey;
  try { canonicalKey = canonicalize(rawUrl); } catch { canonicalKey = rawUrl.trim().toLowerCase(); }

  // DEDUP: same canonical_key we've seen → reuse that indicator, bump its report_count.
  if (keyToId.has(canonicalKey)) {
    const id = keyToId.get(canonicalKey);
    const row = indicators.get(id);
    if (row) row.report_count = (row.report_count ?? 1) + 1;
    return { id, seenBefore: true };
  }

  const id = nextId++;
  const row = {
    id, canonicalKey, status: "pending", report_count: 1,
    screenshot_url: null, ai_score: null, ai_verdict: null, ai_confidence: null,
    evidence: [], review: null, createdAt: Date.now(),
  };
  indicators.set(id, row);
  keyToId.set(canonicalKey, id);

  runPipeline(id, rawUrl); // fire-and-forget; client polls for the result
  return { id, seenBefore: false };
}

// The real analysis pipeline. Mutates the in-memory row as it progresses.
async function runPipeline(id, rawUrl) {
  const row = indicators.get(id);
  if (!row) return;
  try {
    row.status = "scanning";
    // urlscan (slow, ~15-60s) + Safe Browsing (fast) run together.
    const [scan, bl] = await Promise.all([scanUrl(rawUrl), checkBlacklist(rawUrl)]);
    const verdict = await generateVerdict({
      evidence: scan.evidence,
      blacklist_hit: bl.blacklist_hit,
      blacklist_source: bl.blacklist_source,
      domain_age_days: scan.domain_age_days,
      raw: scan._raw ?? {},
    });

    Object.assign(row, {
      status: "done",
      screenshot_url: scan.screenshot_url,
      urlscan_uuid: scan.urlscan_uuid,
      blacklist_hit: bl.blacklist_hit,
      blacklist_source: bl.blacklist_source,
      domain_age_days: scan.domain_age_days,
      ai_score: verdict.ai_score,
      ai_verdict: verdict.ai_verdict,
      ai_confidence: verdict.ai_confidence,
      evidence: verdict.evidence_summary,
    });
  } catch (e) {
    // Never fake a "safe" — mark error. Give a SPECIFIC reason when we know it.
    console.warn(`⚠ pipeline failed for indicator ${id}:`, e.message);
    Object.assign(row, { status: "error", error_reason: e.reason ?? "failed", ai_verdict: errorMessage(e.reason) });
  }
}

// Friendly, specific explanation for why a scan couldn't complete.
function errorMessage(reason) {
  switch (reason) {
    case "unreachable":
      return "I couldn't reach that link to check it. It looks like an internal, private, or non-existent address — I can only scan links that are reachable on the public internet. If it's an internal company link, check with your IT/security team.";
    case "blocked":
      return "I wasn't able to scan that link — the sandbox declined to open it (it may be private, restricted, or on a block list). Please treat it with caution and review it manually.";
    default:
      return "I couldn't finish this check right now. Please try again in a moment, or review the link manually.";
  }
}

// Read one indicator for the poll endpoint. Shapes the response to match §6.
export function readIndicator(id) {
  const row = indicators.get(id);
  if (!row) return null;

  const base = { status: row.status, screenshot_url: row.screenshot_url, review: row.review };
  // On error, pass Orbo's specific explanation through so the chat can show it.
  if (row.status === "error") return { ...base, error_reason: row.error_reason, ai_verdict: row.ai_verdict };
  if (row.status !== "done") return base; // pending / scanning → no verdict yet

  return {
    ...base,
    ai_score: row.ai_score,
    ai_verdict: row.ai_verdict,
    ai_confidence: row.ai_confidence,
    report_count: row.report_count,
    evidence: row.evidence,
  };
}
