// ⚠️ THROWAWAY dev-only in-memory store — DELETE in Step 2 when Postgres/Prisma lands.
// Lets the client flow (Home → CheckResult → VerdictCard) work end-to-end with NO database,
// simulating the pending → scanning → done lifecycle so the poll loop + checking UI are real.

let nextId = 1;
const indicators = new Map(); // id → { id, status, startedAt, verdict }

// Pick a demo verdict from the URL so all three states are showable without real scans.
function fakeVerdict(rawUrl) {
  const u = rawUrl.toLowerCase();
  if (/(paypal|verify|login|secure|bank|password)/.test(u)) {
    return {
      ai_score: 88,
      ai_verdict:
        "This link looks dangerous — the domain is brand new and it asks for your password. I'd recommend not clicking it.",
      ai_confidence: "high",
      report_count: 3,
      evidence: [
        { text: "Domain registered 3 days ago", severity: "dangerous" },
        { text: "Page asks for your password", severity: "dangerous" },
        { text: "Link text doesn't match its real destination", severity: "review" },
      ],
    };
  }
  if (/safe|paypal\.com|google\.com|microsoft\.com/.test(u)) {
    return {
      ai_score: 8,
      ai_verdict: "Good news — this link looks safe. I found no signs of a scam.",
      ai_confidence: "high",
      report_count: 1,
      evidence: [
        { text: "Verified, well-established domain", severity: "safe" },
        { text: "Valid security certificate", severity: "safe" },
        { text: "No login/password form", severity: "safe" },
      ],
    };
  }
  return {
    ai_score: 52,
    ai_verdict:
      "This one's worth a closer look — I couldn't fully confirm it's safe. Be careful before entering any details.",
    ai_confidence: "medium",
    report_count: 1,
    evidence: [
      { text: "Domain is fairly new", severity: "review" },
      { text: "Some trackers on the page", severity: "review" },
    ],
  };
}

// Create a pending indicator; returns its id. (Real version = find-or-create by canonical_key.)
export function createPending(rawUrl) {
  const id = nextId++;
  indicators.set(id, { id, status: "pending", startedAt: Date.now(), verdict: fakeVerdict(rawUrl) });
  return id;
}

// Read one indicator, advancing its fake lifecycle: pending → scanning (after 0.3s) → done (after 2s).
export function readIndicator(id) {
  const row = indicators.get(id);
  if (!row) return null;
  const elapsed = Date.now() - row.startedAt;
  if (elapsed < 300) row.status = "pending";
  else if (elapsed < 2000) row.status = "scanning";
  else row.status = "done";

  const base = { status: row.status, screenshot_url: null, review: null };
  return row.status === "done" ? { ...base, ...row.verdict } : base;
}
