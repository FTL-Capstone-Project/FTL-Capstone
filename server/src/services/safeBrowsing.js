// ============================================================
// Google Safe Browsing (v4 Lookup API) — fast yes/no "is this a known-bad URL?".
// Answers "has the wider community already confirmed this is bad?" — complementary
// to our own canonical_key dedup. Result feeds the verdict + a deterministic score floor.
//
// Free + non-commercial only (fine for this student capstone; a real product would
// switch to Google Web Risk — see project_plan.md Decisions Log).
//
// Returns: { blacklist_hit: boolean, blacklist_source: string | null }
// On ANY error we FAIL OPEN (hit=false) — a lookup outage must never fake a "safe".
// Owner: David.
// ============================================================
import { env } from "../config/env.js";

const ENDPOINT = "https://safebrowsing.googleapis.com/v4/threatMatches:find";
const THREAT_TYPES = ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"];

export async function checkBlacklist(rawUrl) {
  if (!env.safeBrowsingKey) {
    return { blacklist_hit: false, blacklist_source: null }; // stub: no key → unknown → not flagged
  }

  const body = {
    client: { clientId: "orbis", clientVersion: "0.1.0" },
    threatInfo: {
      threatTypes: THREAT_TYPES,
      platformTypes: ["ANY_PLATFORM"],
      threatEntryTypes: ["URL"],
      threatEntries: [{ url: rawUrl }],
    },
  };

  try {
    const res = await fetch(`${ENDPOINT}?key=${env.safeBrowsingKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      // 400 INVALID_ARGUMENT, 403 bad/restricted key, 429 quota. Log + fail open.
      const err = await res.json().catch(() => ({}));
      console.warn(`⚠ SafeBrowsing ${res.status}:`, err?.error?.status ?? err?.error?.message ?? "unknown");
      return { blacklist_hit: false, blacklist_source: null };
    }

    // Clean → HTTP 200 with empty object {}. Flagged → { matches: [ { threatType, ... } ] }.
    const data = await res.json();
    const match = data?.matches?.[0];
    if (!match) return { blacklist_hit: false, blacklist_source: null };

    return {
      blacklist_hit: true,
      blacklist_source: `google_safe_browsing:${match.threatType}`, // e.g. google_safe_browsing:SOCIAL_ENGINEERING
    };
  } catch (e) {
    console.warn("⚠ SafeBrowsing request failed:", e.message);
    return { blacklist_hit: false, blacklist_source: null }; // network error → fail open
  }
}
