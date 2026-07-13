// ============================================================
// The ONE place we read + validate environment variables.
// Import `env` anywhere instead of touching process.env directly.
// ============================================================

export const env = {
  port: process.env.PORT || 3001,
  databaseUrl: process.env.DATABASE_URL,
  clerk: {
    secretKey: process.env.CLERK_SECRET_KEY,
    webhookSecret: process.env.CLERK_WEBHOOK_SECRET,
  },
  urlscanApiKey: process.env.URLSCAN_API_KEY,
  safeBrowsingKey: process.env.GOOGLE_SAFE_BROWSING_KEY,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
};

// Warn (don't crash) if a key is missing — lets us build/stub before all keys exist.
export function warnMissingEnv() {
  const required = ["databaseUrl"];
  for (const k of required) {
    if (!env[k]) console.warn(`⚠ env: ${k} is not set (see .env.example)`);
  }
}
