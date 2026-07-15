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
    // No key → we genuinely cannot scan. Do NOT fabricate danger signals (that falsely
    // accused apple.com of being "3 days old"). Throw so the pipeline marks it "error"
    // ("couldn't check — review manually") instead of storing a fake verdict.
    throw Object.assign(new Error("urlscan not configured (no API key)"), { reason: "not_configured" });
  }

  // 1) Submit. `unlisted` keeps scans off the public feed but stays on the free tier.
  // country: "us" → scan from a US vantage point so sites serve their English/US version
  // (urlscan's default nodes are in the EU, which is why pages came back in German).
  const submitRes = await fetch(SUBMIT_URL, {
    method: "POST",
    headers: { "API-Key": env.urlscanApiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ url: rawUrl, visibility: "unlisted", country: "us" }),
  });
  if (!submitRes.ok) {
    const err = await submitRes.json().catch(() => ({}));
    const detail = err.description || err.message || "failed";
    const both = `${err.message || ""} ${err.description || ""}`; // check both fields
    // Classify WHY so the UI can explain it (not just "review manually").
    let reason = "submit_failed";
    if (/could not be resolved|resolve|DNS/i.test(both)) reason = "unreachable"; // internal/typo/dead domain
    // Domain owner opted out of urlscan (big trusted sites: youtube, openai, google…). urlscan
    // phrases this as "Scan prevented" / "blocked from scanning" / "owner requested…prevent scanning".
    else if (/scan prevented|prevent scanning|blocked from scanning|owner of this infrastructure|opted out/i.test(both)) reason = "opted_out";
    else if (/blocked|not allowed|private|blacklist/i.test(both)) reason = "blocked"; // urlscan won't scan it
    throw Object.assign(new Error(`urlscan submit ${submitRes.status}: ${detail}`), { reason });
  }
  const { uuid, api: resultApi } = await submitRes.json();

  // 2) Poll the result: 404 = still running, 200 = done, 410 = deleted.
  await sleep(FIRST_POLL_DELAY_MS);
  const deadline = Date.now() + MAX_WAIT_MS;
  while (Date.now() < deadline) {
    const r = await fetch(resultApi, { headers: { "API-Key": env.urlscanApiKey } });
    if (r.status === 200) return distill(await r.json(), uuid, rawUrl);
    if (r.status === 404) { await sleep(POLL_EVERY_MS); continue; } // not ready yet
    throw new Error(`urlscan result ${r.status} for ${uuid}`); // 410/429/etc.
  }
  throw new Error(`urlscan scan ${uuid} did not finish within ${MAX_WAIT_MS / 1000}s`);
}

// Bare hostname (lowercased, no "www.") from a URL string, or null if unparseable.
function hostOf(u) {
  if (!u) return null;
  try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ""); }
  catch { return null; }
}

// Turn urlscan's huge result JSON into a small evidence list our verdict + UI can use.
// `submittedUrl` is the URL we asked urlscan to scan — comparing its host to the final
// landing host tells us whether the link redirected somewhere ELSE (the key fact for a
// typosquat: does "amzon.com" actually land on "amazon.com", or on a lookalike phishing page?).
export function distill(result, uuid, submittedUrl) {
  const page = result.page ?? {};
  const verdicts = result.verdicts?.overall ?? {};
  const lists = result.lists ?? {};

  // urlscan's "first seen" age is our best free proxy for "new/suspicious domain".
  const domain_age_days = page.domainAgeDays ?? page.apexDomainAgeDays ?? null;

  // ── The redirect destination (first-class fact, not just a hop count) ──
  const final_url = page.url ?? null;
  // Prefer urlscan's record of what we submitted; fall back to the arg we passed in.
  const submitted_host = hostOf(result.task?.url) ?? hostOf(submittedUrl);
  const final_host = hostOf(final_url);
  // Did the link end up on a DIFFERENT registered domain than where it started?
  const redirected_to_different_host =
    submitted_host != null && final_host != null && submitted_host !== final_host;
  const redirect_count = Array.isArray(result.data?.redirects) ? result.data.redirects.length : 0;

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
  // Name the actual landing domain, not just "N hops". This is what lets the verdict
  // distinguish a brand-owned redirect (amzon.com → amazon.com, safe) from a lookalike
  // that stays on its own domain (zon.com → zon.com, no redirect at all).
  if (redirected_to_different_host) {
    evidence.push({ text: `Redirects to a different domain: ${final_host}`, severity: "review" });
  } else if (redirect_count > 0) {
    evidence.push({ text: `Stays on ${final_host ?? "the same domain"} after ${redirect_count} redirect hop(s)`, severity: "review" });
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
    final_url,
    // Redirect facts surfaced at top level so the pipeline can persist them (step 2).
    final_host,
    submitted_host,
    redirected_to_different_host,
    redirect_count,
    domain_age_days,
    // pass a compact raw summary through for the AI verdict step (Claude) later
    _raw: {
      malicious: !!verdicts.malicious,
      score: verdicts.score ?? null,
      categories: verdicts.categories ?? [],
      brands: (verdicts.brands ?? []).map((b) => (typeof b === "string" ? b : b?.name)).filter(Boolean),
      final_url,
      final_host,
      submitted_host,
      redirected_to_different_host,
      redirect_count,
      server_country: page.country ?? null,
      domain_age_days,
    },
    evidence,
  };
}
