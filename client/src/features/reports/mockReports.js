// ============================================================
// TEMPORARY mock data for the Reports page (task O1).
// Lets us build the UI before Michael's database + David's real
// GET /api/history?mine=1 exist. Each object matches the SHAPE the
// real API will return, so swapping to real data later changes almost
// nothing in the components. DELETE this file once the API is live.
//
// FIELD NAMES follow David's check-link branch (snake_case) so our two
// halves speak the same language. Fields marked "NEW" don't exist in
// David's data yet — they come from the wireframe and David needs to add
// them (see the note in the chat / project_plan). We build the card to
// the wireframe now and catch any gaps as they arrive.
//
// Shape of one report:
//   indicator_id   — id of the judged URL (unique key for the list)
//   url            — the link that was checked
//   title          — NEW: short human name for the threat (wireframe)
//   description    — NEW: 1–2 sentence summary (wireframe); can reuse ai_verdict
//   tags           — NEW: category chips, e.g. ["Credential phishing"] (wireframe)
//   reported_by    — NEW: who submitted it (name) (wireframe)
//   created_at     — when it was checked (display string for now)
//   kind           — verdict color/word: "safe" | "review" | "dangerous"
//   ai_score       — 0–100 SAFETY SCORE: HIGH = SAFE (91 = Safe, 22 = Dangerous).
//                    ⚠ David's code currently treats ai_score as a DANGER score
//                    (high = bad) — the OPPOSITE. We use a SAFETY score everywhere
//                    (closer to 100 = safer); David must align his verdict to match.
//   screenshot_url — thumbnail of the detonated page (null until urlscan provides it)
//   review         — ORG MEMBERS ONLY: analyst closure, or null for individuals.
//                    Shape: { review_status, human_score, reviewed_by }
// ============================================================

export const mockReports = [
  {
    indicator_id: 1,
    url: "https://paypa1-secure.com/verify",
    title: "Fake PayPal 'account locked' email",
    description:
      "Credential phishing email impersonating PayPal, containing a fake login link to a newly registered domain.",
    tags: ["Credential phishing", "Campaign: Bank impersonation"],
    reported_by: "David M.",
    created_at: "Jul 8, 2026",
    kind: "dangerous",
    ai_score: 22, // low safety score = dangerous
    screenshot_url: null,
    review: { review_status: "confirmed malicious", human_score: 18, reviewed_by: "Priya S." },
  },
  {
    indicator_id: 2,
    url: "https://microsoft-365-signin.com/auth",
    title: "Microsoft 365 sign-in page (spoofed)",
    description:
      "A convincing replica of the Microsoft sign-in page hosted on a suspicious subdomain attempting to harvest credentials.",
    tags: ["Credential phishing", "Campaign: Microsoft impersonation"],
    reported_by: "Anya K.",
    created_at: "Jul 7, 2026",
    kind: "dangerous",
    ai_score: 31,
    screenshot_url: null,
    review: { review_status: "pending review", human_score: null, reviewed_by: null },
  },
  {
    indicator_id: 3,
    url: "https://fedex-tracking-update.net/confirm",
    title: "Unusual shipping notification from FedEx",
    description:
      "Email requesting tracking confirmation with a shortened redirect link. Domain reputation is low but content is partially legitimate.",
    tags: ["Social engineering"],
    reported_by: "Marcus T.",
    created_at: "Jul 6, 2026",
    kind: "review",
    ai_score: 54,
    screenshot_url: null,
    review: { review_status: "pending review", human_score: null, reviewed_by: null },
  },
  {
    indicator_id: 4,
    url: "https://intranet.acme.com/hr/benefits",
    title: "HR benefits enrollment reminder",
    description:
      "Legitimate internal communication from the HR team regarding annual benefits enrollment. Sender verified, links point to internal portal.",
    tags: ["Internal comms"],
    reported_by: "Sarah L.",
    created_at: "Jul 5, 2026",
    kind: "safe",
    ai_score: 91, // high safety score = safe
    screenshot_url: null,
    review: { review_status: "confirmed safe", human_score: 94, reviewed_by: "Priya S." },
  },
];
