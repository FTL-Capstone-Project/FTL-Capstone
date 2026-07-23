// ── extension: api · owner: David ──
// The ONE place the extension talks to the Orbis backend — mirrors client/src/lib/api.js.
// Reads the API base URL + (optional) auth token from chrome.storage, so the same code works
// against dev-stub (no token needed — server fakes the user) and real Clerk (paste-in token).
//
// Exposed via a global `OrbisApi` because MV3 background service workers use importScripts()
// (classic workers, no ES modules), and the popup imports this as a plain <script>.

const DEFAULT_API_URL = "http://localhost:3001";

// Read { apiUrl, token } from storage, falling back to the dev-stub default.
const getConfig = async () => {
  const { apiUrl, token } = await chrome.storage.sync.get(["apiUrl", "token"]);
  return { apiUrl: (apiUrl || DEFAULT_API_URL).replace(/\/$/, ""), token: token || "" };
};

// Low-level request: adds base URL + bearer token, throws {status, body} on non-2xx.
const request = async (method, path, body) => {
  const { apiUrl, token } = await getConfig();
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${apiUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw Object.assign(new Error(err.error || `HTTP ${res.status}`), { status: res.status, body: err });
  }
  return res.status === 204 ? null : res.json();
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Is the target an email ADDRESS (not a URL)? Right-clicking a sender like "team@m.ngrok.com"
// should get a sender report, not go to the URL scanner (which rejects bare emails). A mailto:
// link's href is "mailto:x@y.com", so strip that too. Kept loose but URL-aware: a value with a
// scheme or a slash is treated as a URL, not an email.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const asEmail = (raw) => {
  const t = String(raw || "").trim().replace(/^mailto:/i, "").split("?")[0].trim();
  return EMAIL_RE.test(t) && !/\s|\//.test(t) ? t.toLowerCase() : null;
};

// Check a SENDER email address → synchronous sender report (no polling; the server computes it in
// one shot). Returns the same {indicator} shape checkUrl does so the popup renders it identically.
// The response is a verdict object ({ ai_score, ai_verdict, title, tags, evidence, indicator_id }).
const checkSender = async (email) => {
  const report = await request("POST", "/api/ask-orbo/sender-report", { email });
  return {
    indicatorId: report.indicator_id ?? null,
    indicator: {
      status: "done",
      ai_score: report.ai_score,
      ai_verdict: report.ai_verdict,
      description: report.description ?? null,
      evidence: report.evidence ?? [],
      tags: report.tags ?? [],
    },
  };
};

// Submit a URL and poll the indicator until the scan finishes. Same flow the web app uses:
// POST /api/submissions → { indicatorId } → poll GET /api/indicators/:id until status "done"/"error".
// onProgress(attempt) lets the caller show a "still scanning…" hint. Times out ~90s (scans are 20-40s).
const checkUrl = async (url, onProgress) => {
  const { indicatorId } = await request("POST", "/api/submissions", { url });

  const deadlineMs = 90_000;
  const start = Date.now();
  let attempt = 0;
  while (Date.now() - start < deadlineMs) {
    const indicator = await request("GET", `/api/indicators/${indicatorId}`);
    if (indicator.status === "done" || indicator.status === "error") {
      return { indicatorId, indicator };
    }
    attempt += 1;
    onProgress?.(attempt);
    await sleep(3000); // first useful result lands ~10s+ in; poll every 3s after
  }
  throw Object.assign(new Error("timeout"), { status: 0, body: { error: "The scan is taking too long — try again in a moment." } });
};

// Route a right-clicked target to the right check: an email address → sender report (instant),
// anything else → the URL scanner (polls). This is what lets "Check with Orbis" work on a sender.
const checkTarget = async (target, onProgress) => {
  const email = asEmail(target);
  return email ? checkSender(email) : checkUrl(target, onProgress);
};

// Attach to the worker/page global (no ES module in MV3 classic service workers).
self.OrbisApi = { getConfig, checkUrl, checkSender, checkTarget, asEmail };
