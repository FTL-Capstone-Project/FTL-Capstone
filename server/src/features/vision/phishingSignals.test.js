import { describe, it, expect } from "vitest";
import { scorePhishingSignals, scoreEmailBodySignals, buildImageReport, SIGNAL_CATALOG } from "./phishingSignals.js";

describe("scorePhishingSignals — deterministic image scoring", () => {
  it("a clean image (no signals) can't be called safe — capped at review", () => {
    const r = scorePhishingSignals([]);
    expect(r.score).toBeLessThan(70);   // never the safe band from a picture alone
    expect(r.score).toBeGreaterThanOrEqual(35);
    expect(r.confidence).toBe("low");
    expect(r.evidence).toEqual([]);
  });

  it("a crown-jewel ask (password) forces the hard danger ceiling", () => {
    const r = scorePhishingSignals(["credentials"]);
    expect(r.hardSignal).toBe(true);
    expect(r.score).toBeLessThanOrEqual(20);
    expect(r.confidence).toBe("high");
  });

  it("payment and sensitive-info asks also hit the ceiling", () => {
    expect(scorePhishingSignals(["payment"]).score).toBeLessThanOrEqual(20);
    expect(scorePhishingSignals(["sensitive_info"]).score).toBeLessThanOrEqual(20);
  });

  it("a couple of soft signals lands in review, not dangerous", () => {
    const r = scorePhishingSignals(["urgency", "generic_greeting"]);
    expect(r.score).toBe(100 - 18 - 8); // 74? no — urgency 18 + greeting 8 = 26 danger → 74
    expect(r.score).toBeGreaterThanOrEqual(35);
  });

  it("unknown / hallucinated signal types are ignored (can't invent danger)", () => {
    const r = scorePhishingSignals(["definitely_a_scam", "trust_me", "urgency"]);
    expect(r.signalCount).toBe(1);       // only 'urgency' counted
    expect(r.score).toBe(100 - SIGNAL_CATALOG.urgency.weight);
  });

  it("duplicate signals are counted once", () => {
    const a = scorePhishingSignals(["urgency", "urgency", "urgency"]);
    const b = scorePhishingSignals(["urgency"]);
    expect(a.score).toBe(b.score);
    expect(a.signalCount).toBe(1);
  });

  it("is case-insensitive and trims signal names", () => {
    const r = scorePhishingSignals([" Credentials ", "URGENCY"]);
    expect(r.signalCount).toBe(2);
    expect(r.hardSignal).toBe(true);
  });

  it("same input always yields the same score (reproducible)", () => {
    const sig = ["urgency", "link_mismatch", "generic_greeting"];
    expect(scorePhishingSignals(sig).score).toBe(scorePhishingSignals(sig).score);
  });

  it("confidence is high when two strong signals agree", () => {
    const r = scorePhishingSignals(["link_mismatch", "sender_mismatch"]); // both weight >= 25
    expect(r.confidence).toBe("high");
  });
});

describe("buildImageReport — VerdictCard-shaped output", () => {
  it("shapes a dangerous verdict with code-owned score even if the model narrates 'safe'", () => {
    const r = buildImageReport({
      signals: ["credentials", "urgency"],
      // model tries to say it's fine — code must still score it dangerous
      modelVerdict: "This looks like a totally safe and normal login page.",
      modelTitle: "All good",
      summary: "a login page asking for your password",
    });
    expect(r.ai_score).toBeLessThanOrEqual(20);
    expect(r.ai_confidence).toBe("high");
    expect(r.isImageReport).toBe(true);
    expect(r.evidence.length).toBeGreaterThanOrEqual(1);
    expect(r.evidence[0].severity).toBe("dangerous");
    // the model's sentence is kept (it's just narration), but the NUMBER is ours
    expect(r.ai_verdict).toContain("safe");
  });

  it("falls back to a rule-written verdict when the model gives no words", () => {
    const r = buildImageReport({ signals: ["payment"], modelVerdict: "", modelTitle: "" });
    expect(r.ai_verdict).toMatch(/scam|phishing/i);
    expect(r.title).toBeTruthy();
    expect(r.tags.length).toBeGreaterThanOrEqual(1);
  });

  it("a clean image gets an honest 'couldn't verify from an image' evidence row", () => {
    const r = buildImageReport({ signals: [], summary: "a short hello message" });
    expect(r.ai_score).toBeLessThan(70);
    expect(r.evidence).toHaveLength(1);
    expect(r.evidence[0].text).toMatch(/couldn't be verified|no obvious/i);
  });

  it("rejects an over-long model title in favor of the fallback", () => {
    const long = "x".repeat(80);
    const r = buildImageReport({ signals: ["urgency"], modelTitle: long });
    expect(r.title).not.toBe(long);
    expect(r.title.length).toBeLessThanOrEqual(60);
  });
});

// The fix for the real report that scored 74/100 and still showed a green "Looks safe" badge over the
// words "may not be trustworthy". The whole 26-point deduction came from urgency + generic_greeting on
// an email whose sender and links were clean. A deadline and a "Dear customer" are the normal texture
// of legitimate mail, so UNCORROBORATED they now cost soloWeight instead of full weight.
//
// The safety constraint these tests exist to protect: the last false-positive audit found 44 FPs and
// ZERO false-negatives, so this recalibration must not create one. It can't, by construction — the
// discount only applies when NO hard signal fired, and every phishing shape carries at least one.
describe("scoreEmailBodySignals — soft signals only discount when nothing corroborates them", () => {
  it("the reported email (deadline + generic greeting, nothing else) now reads clearly safe", () => {
    // Was 100 - 18 - 8 = 74: technically "safe" but only just, and the rows read as a warning.
    expect(scoreEmailBodySignals(["urgency", "generic_greeting"]).rawScore).toBe(91);
  });

  it("a lone soft signal barely moves the score", () => {
    expect(scoreEmailBodySignals(["urgency"]).rawScore).toBe(94);          // was 82
    expect(scoreEmailBodySignals(["generic_greeting"]).rawScore).toBe(97); // was 92
  });

  it("NO FALSE NEGATIVES: every phishing shape scores exactly as before the recalibration", () => {
    // Each of these carries a hard signal, so the soft ones snap back to full weight. These numbers
    // are the pre-change values — if any of them moves, the discount has leaked into phishing.
    const unchanged = [
      [["credentials", "urgency"], 47],
      [["credentials", "urgency", "generic_greeting"], 39],
      [["sender_mismatch", "urgency"], 57],
      [["link_mismatch", "urgency", "generic_greeting"], 44],
      [["credentials", "link_mismatch", "urgency"], 17],
      [["payment", "urgency"], 49],
      [["attachment", "urgency"], 67],
      [["grammar", "urgency", "generic_greeting"], 64],
    ];
    for (const [signals, expected] of unchanged) {
      expect(scoreEmailBodySignals(signals).rawScore, signals.join("+")).toBe(expected);
    }
  });

  it("a crown-jewel ask alone is enough to restore the full soft weight", () => {
    // "urgent + confirm your password" SHOULD compound — that's the actual phishing pattern.
    const withCrown = scoreEmailBodySignals(["credentials", "urgency"]);
    const soloUrgencyCost = 100 - scoreEmailBodySignals(["urgency"]).rawScore;
    expect(100 - withCrown.rawScore).toBe(SIGNAL_CATALOG.credentials.weight + SIGNAL_CATALOG.urgency.weight);
    expect(soloUrgencyCost).toBeLessThan(SIGNAL_CATALOG.urgency.weight);
  });

  it("carries each row's real cost so the report can show WHY the score is what it is", () => {
    const solo = scoreEmailBodySignals(["urgency", "generic_greeting"]);
    expect(solo.evidence.map((row) => row.weight)).toEqual([6, 3]);
    // Same signals, now corroborated → the rows report their full cost.
    const corroborated = scoreEmailBodySignals(["credentials", "urgency", "generic_greeting"]);
    expect(corroborated.evidence.find((row) => row.text.match(/urgency/i)).weight).toBe(18);
  });

  it("leaves the IMAGE path on full weights (a screenshot has no sender or link to fall back on)", () => {
    expect(scorePhishingSignals(["urgency", "generic_greeting"]).score).toBe(74);
  });
});
