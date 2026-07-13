// ============================================================
// AI Feature A — plain-English danger verdict (Claude).
// Takes distilled evidence → { score, verdict_text, confidence, evidence_summary }.
// STUB for now (returns a canned verdict) so the end-to-end flow is demoable
// before the Anthropic key exists. TODO(David): real Claude structured-output call.
// Always applies a deterministic HIGH-SCORE FLOOR on hard signals — a confirmed
// known-bad URL can never be reported "safe".
// ============================================================
import { env } from "../config/env.js";

export async function generateVerdict({ evidence, blacklist_hit, domain_age_days, contextText }) {
  // Deterministic floor: known-bad or credential form on a very new domain → force high.
  const hardSignal = blacklist_hit || (domain_age_days != null && domain_age_days < 7);

  if (!env.anthropicApiKey) {
    // Stub verdict.
    const score = hardSignal ? 88 : 20;
    return {
      ai_score: score,
      ai_verdict: hardSignal
        ? "This link looks dangerous — it shows signs of a scam (new domain and/or a known-bad listing). I'd recommend not clicking it."
        : "This link looks okay — I found no strong signs of a scam.",
      ai_confidence: "medium",
      evidence_summary: evidence ?? [],
    };
  }

  // TODO(David): call Claude with structured outputs; then clamp with the floor:
  //   if (hardSignal) score = Math.max(score, 80);
  throw new Error("Claude verdict integration not implemented yet");
}
