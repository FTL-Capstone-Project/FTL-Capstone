// ============================================================
// LLM client — talks to Claude via the Salesforce LLM Gateway Express, an
// OpenAI-compatible proxy (Authorization: Bearer, /chat/completions, `messages`).
// The ONE place that knows the wire format. Supports text AND image (vision) inputs.
//   chatJSON()    — prompt → parsed JSON (verdict, NLP)
//   visionText()  — prompt + image → free text (read/translate a screenshot)
//   visionJSON()  — prompt + image → parsed JSON (extract url/email from an upload)
// Vision confirmed working through the gateway (Claude sees data:image base64).
// Owner: David.
// ============================================================
import { env } from "../config/env.js";

// Low-level call. `messages` is the OpenAI messages array (content may be a string
// or an array of {type:text|image_url} parts). Returns the raw assistant string.
const chat = async ({ messages, model = env.llmModel, maxTokens = 512, temperature = 0 }) => {
  if (!env.anthropicApiKey) throw new Error("LLM key not set");

  const res = await fetch(`${env.llmBaseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.anthropicApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, max_tokens: maxTokens, temperature, messages }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`LLM gateway ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("LLM returned no content");
  return content;
}

// Prompt → free text (e.g. interactive Q&A).
export const chatText = async ({ system, user, model, maxTokens = 500, temperature = 0.3 }) => {
  return chat({
    model, maxTokens, temperature,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
}

// Prompt → JSON object (defensive parse: strip ``` fences, else grab first {...}).
export const chatJSON = async ({ system, user, model, maxTokens = 512, temperature = 0 }) => {
  const content = await chat({
    model, maxTokens, temperature,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  return parseJsonLoose(content);
}

// Image + prompt → free text (e.g. "read this screenshot and translate it").
// imageDataUrl = "data:image/png;base64,...."
export const visionText = async ({ prompt, imageDataUrl, model, maxTokens = 700 }) => {
  return chat({
    model, maxTokens, temperature: 0,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: imageDataUrl } },
      ],
    }],
  });
}

// Image + prompt → JSON (e.g. extract {urls, emails, summary} from an uploaded image).
export const visionJSON = async ({ prompt, imageDataUrl, model, maxTokens = 700 }) => {
  const content = await visionText({ prompt, imageDataUrl, model, maxTokens });
  return parseJsonLoose(content);
}

const parseJsonLoose = (text) => {
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error("LLM did not return valid JSON");
  }
}
