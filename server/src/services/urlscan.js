// Wrapper for urlscan.io (the secure sandbox: submit → poll → screenshot + evidence).
// STUB for now so the flow runs without an API key; TODO(David): real integration.
import { env } from "../config/env.js";

export async function scanUrl(rawUrl) {
  if (!env.urlscanApiKey) {
    // Stub result so the pipeline is demoable before keys exist.
    return {
      screenshot_url: null,
      urlscan_uuid: "stub-uuid",
      domain_age_days: 3,
      evidence: [{ text: "Domain registered 3 days ago", severity: "dangerous" }],
    };
  }
  // TODO(David): POST https://urlscan.io/api/v1/scan/, poll the result, pull screenshot + evidence.
  throw new Error("urlscan integration not implemented yet");
}
