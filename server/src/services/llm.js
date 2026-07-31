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

// Hard ceiling on a single LLM call. A `fetch` with no timeout can hang until the platform's
// default socket timeout, which stalls the whole verdict pipeline and pushes checks past the
// client's poll window ("taking longer than expected"). Abort at 60s → a clean, catchable error
// so the pipeline finishes as "error" instead of hanging. Well under the 180s pipeline budget.
const LLM_TIMEOUT_MS = 60_000;

// Low-level call. `messages` is the OpenAI messages array (content may be a string
// or an array of {type:text|image_url} parts). Returns the raw assistant string.
// The GPT-5 family (gpt-5, gpt-5-mini, gpt-5-nano, …) changed the Chat Completions wire format vs
// gpt-4o in three ways we have to accommodate so switching LLM_MODEL "just works" without touching
// call sites:
//   1. the token cap is `max_completion_tokens`, not `max_tokens`;
//   2. only the DEFAULT temperature is accepted (a custom value is rejected) → omit it;
//   3. these are REASONING models: they spend "reasoning tokens" from the completion budget BEFORE
//      emitting any visible text. A small cap (e.g. our classifier's ~8-30) gets fully consumed by
//      reasoning, leaving empty content ("LLM returned no content"). So we add a reasoning headroom
//      floor: the effective cap is at least GPT5_MIN_COMPLETION on top of what the caller asked for.
const isGpt5Family = (model) => /(^|\/)gpt-5/i.test(String(model));
const GPT5_REASONING_HEADROOM = 1024; // reserve room for reasoning tokens so visible output survives

const buildBody = ({ model, maxTokens, temperature, messages }) => {
  if (isGpt5Family(model)) {
    return {
      model,
      max_completion_tokens: maxTokens + GPT5_REASONING_HEADROOM,
      messages,
    };
  }
  return { model, max_tokens: maxTokens, temperature, messages };
};

const chat = async ({ messages, model = env.llmModel, maxTokens = 512, temperature = 0 }) => {
  if (!env.llmApiKey) throw new Error("LLM key not set");

  // AbortController so a slow/hung upstream call fails fast instead of blocking the pipeline.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${env.llmBaseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.llmApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(buildBody({ model, maxTokens, temperature, messages })),
      signal: controller.signal,
    });
  } catch (e) {
    // A timeout surfaces as an AbortError — translate it to a clear message for the caller's logs.
    if (e.name === "AbortError") throw new Error(`LLM call timed out after ${LLM_TIMEOUT_MS / 1000}s`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
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
export const visionText = async ({ prompt, imageDataUrl, model, maxTokens = 700, system }) => {
  // Optional system message: lets the caller declare the image is UNTRUSTED evidence to
  // describe, never instructions to obey (text painted into a screenshot reaches the model).
  const messages = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({
    role: "user",
    content: [
      { type: "text", text: prompt },
      { type: "image_url", image_url: { url: imageDataUrl } },
    ],
  });
  return chat({ model, maxTokens, temperature: 0, messages });
}

// Image + prompt → JSON (e.g. extract {urls, emails, summary} from an uploaded image).
export const visionJSON = async ({ prompt, imageDataUrl, model, maxTokens = 700, system }) => {
  const content = await visionText({ prompt, imageDataUrl, model, maxTokens, system });
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
