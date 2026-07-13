// ============================================================
// LLM client — talks to Claude via the Salesforce LLM Gateway Express, which is an
// OpenAI-compatible proxy (Authorization: Bearer, /chat/completions, `messages` array).
// This is the ONE place that knows the wire format; verdict.js (Feature A) and the future
// NLP feature (Feature B) both call chatJSON() and get a parsed object back.
// Owner: David.
// ============================================================
import { env } from "../config/env.js";

/**
 * Send a system+user prompt, expect a JSON object back, and parse it defensively.
 * The gateway doesn't guarantee native structured-outputs, so we PROMPT for JSON,
 * strip any accidental markdown fence, and JSON.parse. Throws on transport/parse failure
 * so the caller can fall back (never fake a "safe").
 *
 * @returns {Promise<object>} the parsed JSON the model returned
 */
export async function chatJSON({ system, user, model = env.llmModel, maxTokens = 512, temperature = 0 }) {
  if (!env.anthropicApiKey) throw new Error("LLM key not set");

  const res = await fetch(`${env.llmBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.anthropicApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`LLM gateway ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("LLM returned no content");

  return parseJsonLoose(content);
}

// Models sometimes wrap JSON in ```json fences or add stray text. Extract the object.
function parseJsonLoose(text) {
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // last resort: grab the first {...} block
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error("LLM did not return valid JSON");
  }
}
