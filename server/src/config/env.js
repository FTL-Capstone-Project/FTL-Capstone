// ============================================================
// The ONE place we read + validate environment variables.
// Import `env` anywhere instead of touching process.env directly.
// Loads server/.env via dotenv (real .env is gitignored; see .env.example).
// ============================================================
import "dotenv/config";

export const env = {
  port: Number(process.env.PORT) || 3001,
  clientUrl: process.env.CLIENT_URL || "http://localhost:5173",
  databaseUrl: process.env.DATABASE_URL,
  clerk: {
    secretKey: process.env.CLERK_SECRET_KEY,
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
    webhookSecret: process.env.CLERK_WEBHOOK_SECRET,
  },
  urlscanApiKey: process.env.URLSCAN_API_KEY,
  safeBrowsingKey: process.env.GOOGLE_SAFE_BROWSING_KEY,

  // Claude access. David's key is a Salesforce "LLM Gateway Express" key — an
  // OpenAI-compatible proxy in front of Claude, NOT a direct Anthropic key.
  // So we call the OpenAI /chat/completions format at a configurable base URL.
  // (Key var kept as ANTHROPIC_API_KEY so existing .env files don't break.)
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  // Claude via the Salesforce "LLM Gateway Express" — an OpenAI-compatible proxy (NOT direct
  // Anthropic). Configurable base URL + model; the key lives in ANTHROPIC_API_KEY above.
  llmBaseUrl:
    process.env.LLM_BASE_URL ||
    "https://eng-ai-model-gateway.sfproxy.devx-preprod.aws-esvc1-useast2.aws.sfdc.cl",
  llmModel: process.env.LLM_MODEL || "claude-sonnet-4-6",
  // True when Clerk backend creds are present; lets middleware fall back to a
  // dev stub locally (so David/Ozias can build without live Clerk) while using
  // real verification as soon as keys exist.
  get clerkEnabled() {
    return Boolean(this.clerk.secretKey && this.clerk.publishableKey);
  },
  get isProd() {
    return process.env.NODE_ENV === "production";
  },
};

// Warn (don't crash) if a key is missing — lets us build/stub before all keys exist.
export function warnMissingEnv() {
  if (!env.databaseUrl) console.warn("⚠ env: DATABASE_URL is not set (see .env.example) — DB calls will fail.");
  if (!env.clerkEnabled) {
    console.warn("⚠ env: Clerk keys missing — auth runs in DEV STUB mode (fake user). Set CLERK_SECRET_KEY + CLERK_PUBLISHABLE_KEY for real auth.");
  }
  if (!env.clerk.webhookSecret) {
    console.warn("⚠ env: CLERK_WEBHOOK_SECRET missing — /api/webhooks/clerk will reject events until set.");
  }
}
