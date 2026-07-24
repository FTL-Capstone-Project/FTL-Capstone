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
  detectReplyToMismatch,
  crownCeilingApplies,
  reconcileLegScores,
} = await import("./emailAnalysis.js");

// Helper: a body leg the way analyzeEmailBody produces it — raw score + signalMeta (drives the
// corroboration-gated crown-jewel ceiling in combineEmailReports).
const bodyLeg = (aiScore, meta, extra = {}) => ({ ai_score: aiScore, ai_verdict: "b", ai_confidence: "medium", title: "b", tags: [], evidence: [], signalMeta: meta, ...extra });
const leg = (aiScore, extra = {}) => ({ ai_score: aiScore, ai_verdict: "x", ai_confidence: "medium", title: "x", tags: [], evidence: [], ...extra });

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

  it("scores observed red flags as a RAW weighted body score + carries signalMeta (no unilateral ceiling)", async () => {
    // NEW contract: the body leg no longer hard-ceilings itself to <=20 on a crown-jewel. It returns the
    // raw weighted score (100 - 35[credentials] - 18[urgency] = 47) and hands the escalation decision to
    // combineEmailReports, which applies the crown-jewel danger ceiling ONLY when corroborated by a
    // suspicious sender/link or a second hard signal. This is the fix for the credential-phishing
    // false-positive on legit "log into your account" mail.
    chatJSON.mockResolvedValue({ signals: ["credentials", "urgency"], verdict: "Looks like phishing.", title: "Fake login" });
    const report = await analyzeEmailBody({ from: "x@y.com", subject: "locked", body: "confirm your password now" });
    expect(report.ai_score).toBe(47);                       // raw weighted, not the old hard-20
    expect(report.signalMeta).toMatchObject({ crownCount: 1, count: 2 }); // metadata for the gated combine
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

describe("detectReplyToMismatch (deterministic, no LLM)", () => {
  it("flags when Reply-To domain differs from the From domain", () => {
    expect(detectReplyToMismatch("PayPal <service@paypal.com>", "attacker@evil.ru"))
      .toMatchObject({ severity: "dangerous" });
  });

  it("does NOT flag when Reply-To and From share a registered domain (incl. subdomains)", () => {
    expect(detectReplyToMismatch("service@paypal.com", "noreply@mail.paypal.com")).toBeNull();
    expect(detectReplyToMismatch("service@paypal.com", "help@paypal.com")).toBeNull();
  });

  it("returns null when either address is missing / unparseable", () => {
    expect(detectReplyToMismatch("service@paypal.com", "")).toBeNull();
    expect(detectReplyToMismatch("service@paypal.com", null)).toBeNull();
    expect(detectReplyToMismatch("not-an-email", "a@b.com")).toBeNull();
  });
});

describe("analyzeEmailBody — replyTo mismatch enters the score", () => {
  it("injects sender_mismatch (weight 25) when Reply-To domain differs, no LLM needed", async () => {
    env.llmApiKey = ""; // prove it's code-derived, not the model
    const report = await analyzeEmailBody({
      from: "PayPal <service@paypal.com>",
      body: "hello",
      replyTo: "attacker@evil.ru",
    });
    expect(report).not.toBeNull();
    expect(report.ai_score).toBe(75); // 100 - 25 (sender_mismatch)
    expect(report.evidence.some((e) => /Replies would go to a different domain/i.test(e.text))).toBe(true);
  });

  it("compares Reply-To against the ORIGINAL sender parsed from the body, not the forwarder", async () => {
    env.llmApiKey = "";
    // Envelope from is the forwarder's Gmail; the real sender sits in the forwarded body.
    const report = await analyzeEmailBody({
      from: "Me <me@gmail.com>",
      body: "From: PayPal <service@paypal.com>\nPlease confirm",
      senderIdentity: { displayName: "PayPal", address: "service@paypal.com" },
      replyTo: "attacker@evil.ru", // differs from paypal.com → mismatch
    });
    expect(report.evidence.some((e) => /Replies would go to a different domain/i.test(e.text))).toBe(true);
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

// ── FALSE-POSITIVE FIX regression suite ──
// Locks the recalibration that killed the "safe email flagged dangerous" skew (44 verified FPs,
// 0 FNs in the scoring audit). These guard against a future change re-introducing the old behavior
// (crown-jewel unconditional hard-ceiling, NO_SIGNAL_CEILING dragging clean bodies down, a single
// review-band leg vetoing two clean legs) — while keeping every real-phishing shape at DANGER.

describe("crownCeilingApplies (corroboration gate on the body crown-jewel ceiling)", () => {
  it("does NOT escalate a LONE crown-jewel with a clean sender + safe link (legit 'log in')", () => {
    expect(crownCeilingApplies({ crownCount: 1, hardOtherCount: 0 }, { senderScore: 85, worstLink: 90 })).toBe(false);
  });
  it("escalates when a SECOND crown-jewel is present", () => {
    expect(crownCeilingApplies({ crownCount: 2, hardOtherCount: 0 }, { senderScore: 85, worstLink: 90 })).toBe(true);
  });
  it("escalates when a HARD non-soft signal corroborates (impersonation/attachment/grammar)", () => {
    expect(crownCeilingApplies({ crownCount: 1, hardOtherCount: 1 }, { senderScore: 85, worstLink: 90 })).toBe(true);
  });
  it("escalates when the SENDER leg is suspicious (< 55)", () => {
    expect(crownCeilingApplies({ crownCount: 1, hardOtherCount: 0 }, { senderScore: 40, worstLink: 90 })).toBe(true);
  });
  it("escalates when a LINK leg is dangerous (< 50)", () => {
    expect(crownCeilingApplies({ crownCount: 1, hardOtherCount: 0 }, { senderScore: 85, worstLink: 12 })).toBe(true);
  });
  it("never escalates when there is no crown-jewel at all", () => {
    expect(crownCeilingApplies({ crownCount: 0, hardOtherCount: 3 }, { senderScore: 10, worstLink: 10 })).toBe(false);
  });
});

describe("reconcileLegScores (worst-of, but a lone marginal leg can't veto clean ones)", () => {
  it("a DANGEROUS leg (< 35) still dominates (strict worst-of preserved)", () => {
    expect(reconcileLegScores([90, 10, 88])).toBe(10);
  });
  it("two clean legs round a single marginal (65-69) leg up to safe", () => {
    expect(reconcileLegScores([74, 68, 92])).toBe(70); // benign ESP tracking link @68 no longer vetoes
  });
  it("a DEEP review leg (< 65) is NOT rounded up — stays worst-of", () => {
    expect(reconcileLegScores([80, 50, 90])).toBe(50);
  });
  it("more than one non-safe leg keeps strict worst-of", () => {
    expect(reconcileLegScores([66, 68, 90])).toBe(66);
  });
  it("ignores nulls; returns null when nothing scorable", () => {
    expect(reconcileLegScores([null, 80, undefined])).toBe(80);
    expect(reconcileLegScores([null])).toBeNull();
  });
});

describe("combineEmailReports — FP fix end-to-end (SAFE mail no longer flagged)", () => {
  it("SAFE: brand sender + lone 'credentials' body ('log in to view') + safe link → SAFE band", () => {
    // Bank statement: credentials-only body raw = 65, brand sender 85, safe link 90. No corroboration
    // → no ceiling. Old code hard-ceiled body to 20 → DANGER; now it stays SAFE.
    const r = combineEmailReports({
      sender: leg(85), body: bodyLeg(65, { crownCount: 1, hardOtherCount: 0, count: 1 }), link: leg(90),
    });
    expect(r.ai_score).toBeGreaterThanOrEqual(70);
  });
  it("SAFE: a CLEAN body (0 signals) is neutral, not a 65 cap — brand sender + safe link decide", () => {
    const r = combineEmailReports({
      sender: leg(90), body: bodyLeg(65, { crownCount: 0, hardOtherCount: 0, count: 0 }), link: leg(92),
    });
    expect(r.ai_score).toBeGreaterThanOrEqual(70); // clean body excluded → min(90,92) = 90
  });
  it("SAFE: a single benign tracking link @68 with two clean legs rounds up", () => {
    const r = combineEmailReports({
      sender: leg(74), body: bodyLeg(100, { crownCount: 0, hardOtherCount: 0, count: 0 }), link: leg(68),
    });
    expect(r.ai_score).toBeGreaterThanOrEqual(70);
  });
  it("DANGER preserved: lone 'credentials' body but SUSPICIOUS sender → ceiling fires → DANGER", () => {
    const r = combineEmailReports({
      sender: leg(40), body: bodyLeg(65, { crownCount: 1, hardOtherCount: 0, count: 1 }), link: leg(45),
    });
    expect(r.ai_score).toBeLessThan(35);
  });
  it("DANGER preserved: credentials + a dangerous link → ceiling fires → DANGER", () => {
    const r = combineEmailReports({
      sender: leg(80), body: bodyLeg(65, { crownCount: 1, hardOtherCount: 0, count: 1 }), link: leg(8),
    });
    expect(r.ai_score).toBeLessThan(35);
  });
  it("DANGER preserved: two crown-jewels (SSN + payment) self-corroborate → DANGER even with clean-ish legs", () => {
    const r = combineEmailReports({
      sender: leg(60), body: bodyLeg(32, { crownCount: 2, hardOtherCount: 0, count: 2 }), link: null,
    });
    expect(r.ai_score).toBeLessThanOrEqual(20);
  });
  it("DANGER preserved: a lookalike sender (< 35) dominates regardless of a clean body", () => {
    const r = combineEmailReports({
      sender: leg(15), body: bodyLeg(100, { crownCount: 0, hardOtherCount: 0, count: 0 }), link: leg(12),
    });
    expect(r.ai_score).toBeLessThan(35);
  });
  it("does NOT leak image-path wording into the headline (no 'image'/'closer look')", () => {
    const r = combineEmailReports({
      sender: leg(90, { ai_verdict: "Genuine brand domain.", title: "Legit sender" }),
      body: bodyLeg(100, { crownCount: 0, hardOtherCount: 0, count: 0 }, { ai_verdict: "No red flags in the wording.", title: "Content looks clean" }),
      link: leg(92, { ai_verdict: "Safe link.", title: "Safe link" }),
    });
    expect(JSON.stringify(r)).not.toMatch(/image|closer look/i);
  });
});
