// ── feature: reports · owner: Ozias ──
// buildNextSteps is the "What to do" list under every report. The whole reason it's code and not
// the LLM is that advice must never contradict the badge — so that's what these tests lock.
import { describe, it, expect } from "vitest";
import { buildNextSteps } from "./nextSteps.js";

describe("buildNextSteps — one list per verdict band", () => {
  it("tells a dangerous report not to click, and never softens it", () => {
    const steps = buildNextSteps({ bucket: "dangerous", source: "web" });
    expect(steps.length).toBeGreaterThan(0);
    expect(steps[0]).toMatch(/don't click/i);
  });

  it("tells a suspicious report to verify through a trusted channel", () => {
    const steps = buildNextSteps({ bucket: "review", source: "web" });
    expect(steps.some((s) => /verify with the sender/i.test(s))).toBe(true);
  });

  it("still gives a SAFE report something to say instead of an empty panel", () => {
    const steps = buildNextSteps({ bucket: "safe", source: "web" });
    expect(steps.length).toBeGreaterThan(0);
    // But it must not alarm: nothing on a safe report may read as "this is a scam".
    expect(steps.some((s) => /don't click|phishing|scam/i.test(s))).toBe(false);
  });

  it("defaults an unknown/missing bucket to the cautious middle band, never to safe", () => {
    expect(buildNextSteps({})).toEqual(buildNextSteps({ bucket: "review" }));
    expect(buildNextSteps({ bucket: "nonsense" })).toEqual(buildNextSteps({ bucket: "review" }));
  });
});

describe("buildNextSteps — advice keyed to the signals that actually fired", () => {
  it("names the real problem when a signal identifies it", () => {
    const steps = buildNextSteps({ bucket: "dangerous", signals: ["credentials"], source: "email" });
    expect(steps[0]).toMatch(/password/i);
  });

  it("gives sender-mismatch advice about the ADDRESS, not generic caution", () => {
    const steps = buildNextSteps({ bucket: "review", signals: ["sender_mismatch"] });
    expect(steps[0]).toMatch(/actual email address/i);
  });

  it("ignores signals we have no advice for, and unknown ones, without crashing", () => {
    const steps = buildNextSteps({ bucket: "review", signals: ["urgency", "generic_greeting", "made_up_signal"] });
    // urgency/generic_greeting are the SOFT signals — a deadline isn't an action item, so the list
    // falls back to the band advice rather than inventing a step about it.
    expect(steps).toEqual(buildNextSteps({ bucket: "review" }));
  });

  it("does NOT bolt signal warnings onto a safe verdict", () => {
    // After the Group 1 recalibration a safe email can still carry a soft row or two. Telling that
    // user "don't enter your password" under a green badge is the contradiction we're avoiding.
    const steps = buildNextSteps({ bucket: "safe", signals: ["credentials", "urgency"] });
    expect(steps).toEqual(buildNextSteps({ bucket: "safe" }));
  });

  it("falls back to bucket-only advice for URL rows, which carry no signal keys", () => {
    const steps = buildNextSteps({ bucket: "dangerous", signals: [], source: "web" });
    expect(steps.some((s) => /changed? your password|change it now/i.test(s))).toBe(true);
  });
});

describe("buildNextSteps — channel-specific and scannable", () => {
  it("only tells a forwarded EMAIL to mark it as phishing in the mail app", () => {
    const email = buildNextSteps({ bucket: "dangerous", source: "email" });
    const web = buildNextSteps({ bucket: "dangerous", source: "web" });
    expect(email.some((s) => /mark it as phishing/i.test(s))).toBe(true);
    expect(web.some((s) => /mark it as phishing/i.test(s))).toBe(false);
  });

  it("never repeats a step and never runs longer than 4", () => {
    const steps = buildNextSteps({
      bucket: "dangerous",
      signals: ["credentials", "sensitive_info", "payment", "link_mismatch", "sender_mismatch", "attachment"],
      source: "email",
    });
    expect(steps).toHaveLength(4);
    expect(new Set(steps).size).toBe(steps.length);
  });

  it("is pure — same inputs, same advice", () => {
    const args = { bucket: "review", signals: ["link_mismatch"], source: "email" };
    expect(buildNextSteps(args)).toEqual(buildNextSteps(args));
  });
});
