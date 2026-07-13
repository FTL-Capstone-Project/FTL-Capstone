// ── feature: vision · owner: David ──
// Claude-vision helpers for the check-link flow.
//   POST /api/vision/read-screenshot  — read/translate a urlscan screenshot into plain English
//   POST /api/vision/extract          — (Feature 2) pull url/email/content from an uploaded image
// Vision goes through the Salesforce LLM gateway (services/llm.js).
import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { env } from "../../config/env.js";
import { visionText, visionJSON } from "../../services/llm.js";

export const visionRouter = Router();

// Only allow fetching images from urlscan's screenshot host (don't become an open proxy).
const ALLOWED_IMAGE_HOSTS = new Set(["urlscan.io"]);

// Feature 1: "What does this screenshot say?" (+ translate if it's another language).
// Body: { screenshotUrl }  →  { readout }
visionRouter.post("/read-screenshot", requireAuth, async (req, res) => {
  const { screenshotUrl } = req.body ?? {};
  if (!screenshotUrl || typeof screenshotUrl !== "string") {
    return res.status(400).json({ error: "screenshotUrl is required" });
  }
  let host;
  try { host = new URL(screenshotUrl).hostname; } catch { return res.status(400).json({ error: "bad url" }); }
  if (!ALLOWED_IMAGE_HOSTS.has(host)) return res.status(400).json({ error: "url not allowed" });

  if (!env.anthropicApiKey) return res.status(503).json({ error: "Vision not configured" });

  try {
    // Server fetches the screenshot (urlscan wants the API-Key) → base64 → Claude.
    const imgRes = await fetch(screenshotUrl, { headers: { "API-Key": env.urlscanApiKey ?? "" } });
    if (!imgRes.ok) return res.status(502).json({ error: "Couldn't load the screenshot" });
    const buf = Buffer.from(await imgRes.arrayBuffer());
    const dataUrl = `data:image/png;base64,${buf.toString("base64")}`;

    const prompt =
      "This is a screenshot of a web page or email that a user is unsure about. Respond ENTIRELY IN ENGLISH. " +
      "If the page/text is in another language, do NOT keep the original — give the fully translated English version only. " +
      "In plain, friendly language: (1) one line on what this page/message is and what it wants the user to do; " +
      "(2) then under a heading 'What it says (in English):', give a clear English rendering of the main visible text " +
      "(translated if needed — the user wants to READ it in English, not see the foreign original). " +
      "Keep it concise. If the image is blank or unreadable, say so.";

    const readout = await visionText({ prompt, imageDataUrl: dataUrl, maxTokens: 700 });
    return res.json({ readout });
  } catch (e) {
    console.warn("⚠ read-screenshot failed:", e.message);
    return res.status(502).json({ error: "Orbo couldn't read this screenshot right now." });
  }
});

// Feature 2 (wired next): extract url/email/summary from an uploaded image.
// Body: { imageDataUrl }  →  { urls, emails, summary }
visionRouter.post("/extract", requireAuth, async (req, res) => {
  const { imageDataUrl } = req.body ?? {};
  if (!imageDataUrl || !/^data:image\//.test(imageDataUrl)) {
    return res.status(400).json({ error: "imageDataUrl (data:image/...) is required" });
  }
  if (!env.anthropicApiKey) return res.status(503).json({ error: "Vision not configured" });

  try {
    const prompt =
      "You are analyzing an image a user uploaded to check for scams (a screenshot of an email, message, or web page). " +
      "Extract any URLs and email addresses you can see. Reply ONLY as minified JSON: " +
      '{"urls":["..."],"emails":["..."],"summary":"one sentence describing what the image shows"}. ' +
      "If you see none, use empty arrays.";
    const out = await visionJSON({ prompt, imageDataUrl, maxTokens: 500 });
    return res.json({
      urls: Array.isArray(out.urls) ? out.urls : [],
      emails: Array.isArray(out.emails) ? out.emails : [],
      summary: typeof out.summary === "string" ? out.summary : "",
    });
  } catch (e) {
    console.warn("⚠ vision extract failed:", e.message);
    return res.status(502).json({ error: "Orbo couldn't read that image." });
  }
});
