import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the LLM (chatJSON) + env; use the REAL scorer (buildImageReport/SIGNAL_CATALOG) so the
// tests lock in the deterministic scoring end to end.
const env = { llmApiKey: "test-key" };
const chatJSON = vi.fn();

vi.mock("../../config/env.js", () => ({ env }));
vi.mock("../../services/llm.js", () => ({ chatJSON: (...a) => chatJSON(...a) }));

const {
  combineEmailScore,
  combineEmailReports,
  combineLinkReports,
  analyzeEmailBody,
  detectSenderMismatch,
  detectLinkMismatch,
  assessAuthResults,
} = await import("./emailAnalysis.js");

beforeEach(() => {
  chatJSON.mockReset();
  env.llmApiKey = "test-key";
});

describe("combineEmailScore (worst-of)", () => {
  it("returns the minimum of the present scores", () => {
    expect(combineEmailScore([80, 40, 95])).toBe(40);
  });
  it("ignores nulls/undefined (a leg we couldn't score)", () => {
    expect(combineEmailScore([null, 70, undefined])).toBe(70);
  });
  it("returns null when nothing was scorable", () => {
    expect(combineEmailScore([null, undefined])).toBeNull();
  });
});

describe("combineEmailReports (merge sender + body + link)", () => {
  it("takes the worst-of score and leads with the most dangerous leg's words", () => {
    const sender = { ai_score: 60, ai_verdict: "Free webmail sender.", ai_confidence: "medium", title: "Webmail sender", tags: ["Free webmail"], evidence: [{ text: "free webmail", severity: "review" }] };
    const body = { ai_score: 15, ai_verdict: "Asks for your password.", ai_confidence: "high", title: "Credential phishing", tags: ["Phishing"], evidence: [{ text: "asks for password", severity: "dangerous" }] };
    const link = { ai_score: 40, ai_verdict: "Suspicious link.", ai_confidence: "medium", title: "Suspicious link", tags: ["Suspicious"], evidence: [{ text: "new domain", severity: "review" }] };
    const r = combineEmailReports({ sender, body, link });
    expect(r.ai_score).toBe(15);                       // worst-of
    expect(r.ai_verdict).toBe("Asks for your password."); // most dangerous leg leads
    expect(r.ai_confidence).toBe("high");              // any high leg → high
    expect(r.evidence).toHaveLength(3);                // rows concatenated
    expect(r.tags).toEqual(expect.arrayContaining(["Free webmail", "Phishing", "Suspicious"]));
  });

  it("handles a link-less email (only sender + body legs present)", () => {
    const sender = { ai_score: 55, ai_verdict: "Unknown sender.", evidence: [] };
    const body = { ai_score: 20, ai_verdict: "Urgent password request.", evidence: [{ text: "urgency", severity: "review" }] };
    const r = combineEmailReports({ sender, body, link: null });
    expect(r.ai_score).toBe(20);
    expect(r.ai_verdict).toBe("Urgent password request.");
  });

  it("never returns empty evidence (card is never blank)", () => {
    const r = combineEmailReports({ sender: { ai_score: 90, evidence: [] }, body: null, link: null });
    expect(r.evidence.length).toBeGreaterThan(0);
  });
});

describe("analyzeEmailBody", () => {
  it("returns null (no throw) when the LLM key isn't configured", async () => {
    env.llmApiKey = "";
    const report = await analyzeEmailBody({ body: "confirm your password" });
    expect(report).toBeNull();
    expect(chatJSON).not.toHaveBeenCalled();
  });

  it("scores observed red flags deterministically (crown-jewel → dangerous ceiling)", async () => {
    chatJSON.mockResolvedValue({ signals: ["credentials", "urgency"], verdict: "Looks like phishing.", title: "Fake login" });
    const report = await analyzeEmailBody({ from: "x@y.com", subject: "locked", body: "confirm your password now" });
    expect(report.ai_score).toBeLessThanOrEqual(20); // crown-jewel ceiling
    expect(report.ai_verdict).toBe("Looks like phishing.");
    expect(report.evidence.length).toBeGreaterThan(0);
  });

  it("returns null (non-fatal) when the LLM call throws", async () => {
    chatJSON.mockRejectedValue(new Error("gateway 500"));
    expect(await analyzeEmailBody({ body: "hello" })).toBeNull();
  });

  it("only sends signal keys from the closed catalog in the prompt", async () => {
    chatJSON.mockResolvedValue({ signals: [], verdict: "Clean.", title: "Clean" });
    await analyzeEmailBody({ body: "hi" });
    const prompt = chatJSON.mock.calls[0][0].user;
    expect(prompt).toContain("credentials");
    expect(prompt).toContain("urgency");
  });

  it("does NOT offer the text-unverifiable flags (link_mismatch / sender_mismatch) in the prompt", async () => {
    chatJSON.mockResolvedValue({ signals: [], verdict: "Clean.", title: "Clean" });
    await analyzeEmailBody({ body: "hi" });
    const prompt = chatJSON.mock.calls[0][0].user;
    expect(prompt).not.toContain("link_mismatch");
    expect(prompt).not.toContain("sender_mismatch");
  });

  it("drops link_mismatch / sender_mismatch even if the model returns them anyway (no phantom danger)", async () => {
    // A SAFE marketing email — the model hallucinates the two unverifiable flags + a real one.
    chatJSON.mockResolvedValue({ signals: ["link_mismatch", "sender_mismatch", "urgency"], verdict: "Marketing reminder.", title: "Reminder" });
    const report = await analyzeEmailBody({ from: "x@y.com", subject: "reminder", body: "don't forget your appointment" });
    // Only 'urgency' (weight 18) should score → 100 - 18 = 82, NOT tanked to ~20 by the phantom flags.
    expect(report.ai_score).toBe(82);
    // The dropped flags must not appear in the evidence rows either.
    const texts = report.evidence.map((e) => e.text).join(" | ");
    expect(texts).not.toMatch(/hides its real destination|display name/i);
  });

  it("RE-ADDS sender_mismatch when CODE proves it (display name vs address) — even as the LLM's is dropped", async () => {
    // Model still hallucinates sender_mismatch (dropped), but code proves a REAL one from the header.
    chatJSON.mockResolvedValue({ signals: ["sender_mismatch"], verdict: "Impersonation.", title: "Fake PayPal" });
    const report = await analyzeEmailBody({
      body: "text",
      senderIdentity: { displayName: "PayPal Security", address: "no-reply@paypa1-secure.com" },
    });
    // sender_mismatch (weight 25) scores → 100 - 25 = 75, and its catalog evidence row is present.
    expect(report.ai_score).toBe(75);
    expect(report.evidence.some((e) => /display name/i.test(e.text))).toBe(true);
  });

  it("fires deterministic signals with NO LLM key (code owns the number)", async () => {
    env.llmApiKey = ""; // no model at all
    const report = await analyzeEmailBody({
      body: "text",
      senderIdentity: { displayName: "Apple", address: "support@gmail.com" },
    });
    expect(report).not.toBeNull();       // still scored, purely from code
    expect(report.ai_score).toBe(75);    // sender_mismatch weight 25
    expect(chatJSON).not.toHaveBeenCalled();
  });

  it("still returns null with no LLM key AND no deterministic signal", async () => {
    env.llmApiKey = "";
    expect(await analyzeEmailBody({ body: "hi", senderIdentity: { displayName: "Bob", address: "bob@bob-personal.com" } })).toBeNull();
  });
});

describe("detectSenderMismatch (deterministic, no LLM)", () => {
  it("flags a brand display name on a non-brand address", () => {
    expect(detectSenderMismatch({ displayName: "PayPal Security", address: "no-reply@paypa1-secure.com" })).toMatchObject({ claimedBrand: "paypal" });
  });

  it("flags a brand name on a free-webmail address (Apple <...@gmail.com>)", () => {
    expect(detectSenderMismatch({ displayName: "Apple Support", address: "support@gmail.com" })).toMatchObject({ claimedBrand: "apple" });
  });

  it("does NOT flag when the name matches the address's real brand", () => {
    expect(detectSenderMismatch({ displayName: "PayPal", address: "service@paypal.com" })).toBe(false);
  });

  it("does NOT flag a display name that claims no brand", () => {
    expect(detectSenderMismatch({ displayName: "Jane Doe", address: "jane@somewhere.com" })).toBe(false);
  });

  it("returns false for missing input", () => {
    expect(detectSenderMismatch(null)).toBe(false);
    expect(detectSenderMismatch({ displayName: "PayPal", address: "" })).toBe(false);
  });
});

describe("detectLinkMismatch (deterministic, HTML anchors only)", () => {
  it("flags an anchor whose visible host differs from its href host", () => {
    expect(detectLinkMismatch([{ text: "www.paypal.com", href: "https://evil.ru/login" }])).toMatchObject({ shownAs: "paypal.com", goesTo: "evil.ru" });
  });

  it("ignores a normal 'Click here' anchor (visible text isn't a hostname)", () => {
    expect(detectLinkMismatch([{ text: "Click here", href: "https://evil.ru" }])).toBe(false);
  });

  it("does NOT flag when the visible host matches the destination", () => {
    expect(detectLinkMismatch([{ text: "paypal.com", href: "https://paypal.com/account" }])).toBe(false);
  });

  it("returns false for plain-text emails (no anchors)", () => {
    expect(detectLinkMismatch([])).toBe(false);
  });
});

describe("assessAuthResults (SPF/DKIM/DMARC — forwarding-aware)", () => {
  it("treats a DMARC fail as dangerous (forged sender)", () => {
    expect(assessAuthResults({ dmarc: "fail" })).toMatchObject({ severity: "dangerous" });
  });

  it("treats a DKIM fail as dangerous", () => {
    expect(assessAuthResults({ dkim: "fail" })).toMatchObject({ severity: "dangerous" });
  });

  it("IGNORES a bare SPF fail (SPF routinely breaks on forwarding — not a scam signal)", () => {
    expect(assessAuthResults({ spf: "fail", dkim: "pass", dmarc: "pass" })).toBeNull();
  });

  it("returns null when nothing failed / no headers", () => {
    expect(assessAuthResults({ spf: "pass", dkim: "pass", dmarc: "pass" })).toBeNull();
    expect(assessAuthResults(null)).toBeNull();
  });
});

describe("combineLinkReports (multi-link nuance)", () => {
  const card = (score, verdict) => ({ ai_score: score, ai_verdict: verdict, ai_confidence: "medium", title: "t", tags: ["Tag"], evidence: [], screenshot_url: `shot-${score}` });

  it("takes worst-of and adds a summary + per-link rows when >1 link", () => {
    const scans = [
      { url: "https://paypal.com", report: card(95, "Legit PayPal.") },
      { url: "https://paypa1-secure.com/verify", report: card(10, "Fake PayPal login.") },
    ];
    const r = combineLinkReports(scans);
    expect(r.ai_score).toBe(10);                                  // worst-of
    expect(r.screenshot_url).toBe("shot-10");                     // worst link's screenshot
    expect(r.evidence[0].text).toMatch(/2 links checked: 1 safe, 1 dangerous/);
    // one row per link, most-dangerous first
    expect(r.evidence[1].text).toMatch(/paypa1-secure\.com/);
    expect(r.evidence[2].text).toMatch(/paypal\.com/);
  });

  it("keeps the single link's own evidence when there's just one (no redundant summary)", () => {
    const one = { ai_score: 40, ai_verdict: "Suspicious.", evidence: [{ text: "new domain", severity: "review" }], screenshot_url: null };
    const r = combineLinkReports([{ url: "https://x.com", report: one }]);
    expect(r.ai_score).toBe(40);
    expect(r.evidence).toEqual([{ text: "new domain", severity: "review" }]);
  });

  it("returns null when nothing was scannable", () => {
    expect(combineLinkReports([])).toBeNull();
    expect(combineLinkReports([{ url: "https://x.com", report: null }])).toBeNull();
  });
});

describe("combineEmailReports — confidence bump from corroboration", () => {
  it("marks HIGH confidence when >=2 legs corroborate danger, but keeps worst-of score", () => {
    const sender = { ai_score: 20, ai_verdict: "Impersonation.", ai_confidence: "medium", evidence: [] };
    const body = { ai_score: 30, ai_verdict: "Asks for password.", ai_confidence: "medium", evidence: [] };
    const link = { ai_score: 80, ai_verdict: "Link fine.", ai_confidence: "low", evidence: [] };
    const r = combineEmailReports({ sender, body, link });
    expect(r.ai_score).toBe(20);        // worst-of preserved (corroboration never raises safety)
    expect(r.ai_confidence).toBe("high"); // two dangerous-band legs corroborate → high
  });

  it("does NOT force high when only one leg is dangerous", () => {
    const sender = { ai_score: 20, ai_verdict: "Impersonation.", ai_confidence: "low", evidence: [] };
    const body = { ai_score: 90, ai_verdict: "Body fine.", ai_confidence: "low", evidence: [] };
    const r = combineEmailReports({ sender, body, link: null });
    expect(r.ai_confidence).toBe("low");
  });
});
