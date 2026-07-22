// ============================================================
// The ONE place we read + validate environment variables.
// Import `env` anywhere instead of touching process.env directly.
// Loads server/.env via dotenv (real .env is gitignored; see .env.example).
// ============================================================
import "dotenv/config";

// Parse the token→email map for inbound email plus-addressing.
// Format: "david:david@acme.com,sofia:sofia@example.com" → { david: "david@acme.com", ... }.
// A plus-token in the recipient (orbischecks+david@gmail.com) beats a spoofable From header.
const parseTokenMap = (raw) =>
  (raw || "")
    .split(",")
    .map((pair) => pair.split(":").map((s) => s.trim()))
    .filter(([token, email]) => token && email)
    .reduce((map, [token, email]) => ({ ...map, [token.toLowerCase()]: email.toLowerCase() }), {});

export const env = {
  port: Number(process.env.PORT) || 3001,
  clientUrl: process.env.CLIENT_URL || "http://localhost:5173",
  // The browser extension calls the API from a "chrome-extension://<id>" origin, which is NOT
  // the Vite client origin — so CORS must allow it explicitly. Comma-separated list (the id
  // changes between "load unpacked" and a published build). Empty by default = extension off.
  extensionOrigins: (process.env.EXTENSION_ORIGINS || "")
    .split(",").map((s) => s.trim()).filter(Boolean),
  databaseUrl: process.env.DATABASE_URL,
  clerk: {
    secretKey: process.env.CLERK_SECRET_KEY,
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
    webhookSecret: process.env.CLERK_WEBHOOK_SECRET,
  },
  urlscanApiKey: process.env.URLSCAN_API_KEY,
  safeBrowsingKey: process.env.GOOGLE_SAFE_BROWSING_KEY,

  // Inbound email forwarding — a Gmail inbox + Apps Script relay POST forwarded emails here.
  //   token   — shared secret sent as the x-orbis-token header (endpoint 503s until set).
  //   address — the Orbis inbox users forward to (informational; shown in the UI/docs).
  //   tokens  — optional plus-addressing map so orbischecks+<token>@gmail.com beats a spoofed From.
  inboundEmail: {
    token: process.env.INBOUND_EMAIL_TOKEN,
    address: process.env.INBOUND_EMAIL_ADDRESS || "orbischecks@gmail.com",
    tokens: parseTokenMap(process.env.INBOUND_EMAIL_TOKENS),
  },

  // Outbound email — the SAME Gmail + Apps Script relay pattern in REVERSE. The server POSTs report
  // JSON (over HTTPS, not SMTP — so Render's free-tier SMTP block can't stop it) to OUR OWN Apps
  // Script Web App on script.google.com, which sends the report from orbischecks@gmail.com. Both
  // must be set or outbound is a no-op (fail-safe: a missing config never breaks the pipeline).
  //   url   — our Apps Script Web App URL (script.google.com/…). SECURITY: it's OUR configured URL,
  //           never a user-supplied one — no SSRF surface (see code-style.md).
  //   token — shared secret sent in the POST body so only we can trigger a send.
  outboundEmail: {
    url: process.env.OUTBOUND_EMAIL_URL || null,
    token: process.env.OUTBOUND_EMAIL_TOKEN || null,
  },

  // LLM access — OpenAI (Chat Completions API). The client (services/llm.js) speaks the
  // OpenAI wire format: Bearer auth, POST {base}/chat/completions, `messages`. Base URL and
  // model are env-overridable so we can point at OpenAI-compatible proxies without code changes.
  // Key precedence: OPENAI_API_KEY, falling back to the legacy ANTHROPIC_API_KEY var so older
  // .env files / Render configs keep working during the switch.
  llmApiKey: process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY,
  llmBaseUrl: process.env.LLM_BASE_URL || "https://api.openai.com/v1",
  llmModel: process.env.LLM_MODEL || "gpt-4o-mini",
  // True when Clerk backend creds are present; lets middleware fall back to a
  // dev stub locally (so David/Ozias can build without live Clerk) while using
  // real verification as soon as keys exist.
  get clerkEnabled() {
    return Boolean(this.clerk.secretKey && this.clerk.publishableKey);
  },
  get isProd() {
    return process.env.NODE_ENV === "production";
  },
  // The dev-stub (fake user when Clerk keys are absent) is a SECURITY-SENSITIVE
  // fallback: it logs everyone in as one identity. It must be EXPLICITLY opted into
  // and NEVER activate by accident. We do NOT infer this from NODE_ENV (which nothing
  // in the app sets) — a deploy that simply forgot the Clerk keys must fail closed,
  // not silently expose the whole API. Set ORBIS_DEV_STUB=1 locally to allow it.
  get devStubAllowed() {
    return process.env.ORBIS_DEV_STUB === "1";
  },
};

// Warn (don't crash) if a key is missing — lets us build/stub before all keys exist.
export const warnMissingEnv = () => {
  if (!env.databaseUrl) console.warn("⚠ env: DATABASE_URL is not set (see .env.example) — DB calls will fail.");
  if (!env.clerkEnabled) {
    console.warn("⚠ env: Clerk keys missing — auth runs in DEV STUB mode (fake user). Set CLERK_SECRET_KEY + CLERK_PUBLISHABLE_KEY for real auth.");
  }
  if (!env.clerk.webhookSecret) {
    console.warn("⚠ env: CLERK_WEBHOOK_SECRET missing — /api/webhooks/clerk will reject events until set.");
  }
  if (!env.inboundEmail.token) {
    console.warn("⚠ env: INBOUND_EMAIL_TOKEN missing — /api/webhooks/inbound-email will 503 until set.");
  }
  if (!env.outboundEmail.url || !env.outboundEmail.token) {
    console.warn("⚠ env: OUTBOUND_EMAIL_URL/OUTBOUND_EMAIL_TOKEN missing — report emails are off (in-app notifications still fire).");
  }
}
