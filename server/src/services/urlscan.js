// ============================================================
// urlscan.io — the secure sandbox. Submit a URL, poll until the scan finishes,
// then distill the raw result into the evidence our verdict needs.
//
// Async model (the important part): a scan takes ~10-60s. We submit, get a `uuid`,
// then GET the result URL which returns 404 WHILE RUNNING and 200 WHEN DONE.
// So this whole function is meant to run in the BACKGROUND (not inside the request).
//
// Returns: { screenshot_url, urlscan_uuid, final_url, domain_age_days, evidence: [{text, severity}] }
// Throws on real failure (bad key, scan never completes, submit rejected) so the
// caller can mark the indicator status = "error" (never a false "safe").
// Owner: David.
// ============================================================
import { env } from "../config/env.js";

const SUBMIT_URL = "https://urlscan.io/api/v1/scan/";
const FIRST_POLL_DELAY_MS = 10_000; // scans aren't ready for ~10s+; don't hammer early
const POLL_EVERY_MS = 3_000;
const MAX_WAIT_MS = 75_000; // give up after ~75s → status "error", "review manually"

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function scanUrl(rawUrl) {
  if (!env.urlscanApiKey) {
    // Stub result so the pipeline is demoable before a key exists.
    return {
      screenshot_url: null,
      urlscan_uuid: "stub-uuid",
      final_url: rawUrl,
      domain_age_days: 3,
      evidence: [{ text: "Domain registered 3 days ago", severity: "dangerous" }],
    };
  }

  // 1) Submit. `unlisted` keeps scans off the public feed but stays on the free tier.
  const submitRes = await fetch(SUBMIT_URL, {
    method: "POST",
    headers: { "API-Key": env.urlscanApiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ url: rawUrl, visibility: "unlisted" }),
  });
  if (!submitRes.ok) {
    const err = await submitRes.json().catch(() => ({}));
    throw new Error(`urlscan submit ${submitRes.status}: ${err.description || err.message || "failed"}`);
  }
  const { uuid, api: resultApi } = await submitRes.json();

  // 2) Poll the result: 404 = still running, 200 = done, 410 = deleted.
  await sleep(FIRST_POLL_DELAY_MS);
  const deadline = Date.now() + MAX_WAIT_MS;
  while (Date.now() < deadline) {
    const r = await fetch(resultApi, { headers: { "API-Key": env.urlscanApiKey } });
    if (r.status === 200) return distill(await r.json(), uuid);
    if (r.status === 404) { await sleep(POLL_EVERY_MS); continue; } // not ready yet
    throw new Error(`urlscan result ${r.status} for ${uuid}`); // 410/429/etc.
  }
  throw new Error(`urlscan scan ${uuid} did not finish within ${MAX_WAIT_MS / 1000}s`);
}

// Turn urlscan's huge result JSON into a small evidence list our verdict + UI can use.
function distill(result, uuid) {
  const page = result.page ?? {};
  const verdicts = result.verdicts?.overall ?? {};
  const lists = result.lists ?? {};

  // urlscan's "first seen" age is our best free proxy for "new/suspicious domain".
  const domain_age_days = page.domainAgeDays ?? page.apexDomainAgeDays ?? null;

  const evidence = [];
  const sev = (s) => (s === "dangerous" || s === "review" || s === "safe" ? s : "review");

  if (verdicts.malicious) {
    evidence.push({ text: "urlscan flagged this page as malicious", severity: "dangerous" });
  }
  for (const cat of verdicts.categories ?? []) {
    evidence.push({ text: `Category: ${cat}`, severity: "review" });
  }
  if (domain_age_days != null && domain_age_days < 30) {
    evidence.push({
      text: `Domain first seen ${domain_age_days} day${domain_age_days === 1 ? "" : "s"} ago`,
      severity: domain_age_days < 7 ? "dangerous" : "review",
    });
  }
  if (page.tlsValidDays == null && (page.url || "").startsWith("http://")) {
    evidence.push({ text: "Page served over insecure HTTP (no encryption)", severity: "review" });
  }
  if (Array.isArray(result.data?.redirects) && result.data.redirects.length > 0) {
    evidence.push({ text: `Redirects through ${result.data.redirects.length} hop(s) before landing`, severity: "review" });
  }
  const domainCount = (lists.domains ?? []).length;
  if (domainCount > 15) {
    evidence.push({ text: `Contacts ${domainCount} different domains`, severity: "review" });
  }
  if (evidence.length === 0) {
    evidence.push({ text: "No obvious red flags found in the sandbox", severity: "safe" });
  }

  return {
    screenshot_url: `https://urlscan.io/screenshots/${uuid}.png`,
    urlscan_uuid: uuid,
    final_url: page.url ?? null,
    domain_age_days,
    // pass a compact raw summary through for the AI verdict step (Claude) later
    _raw: {
      malicious: !!verdicts.malicious,
      score: verdicts.score ?? null,
      categories: verdicts.categories ?? [],
      brands: (verdicts.brands ?? []).map((b) => (typeof b === "string" ? b : b?.name)).filter(Boolean),
      final_url: page.url ?? null,
      server_country: page.country ?? null,
      domain_age_days,
    },
    evidence,
  };
}
