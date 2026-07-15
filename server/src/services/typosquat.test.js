import { describe, it, expect } from "vitest";
import { registeredDomain, detectLookalike, assessTyposquat } from "./typosquat.js";

describe("registeredDomain", () => {
  it("extracts eTLD+1 and strips www.", () => {
    expect(registeredDomain("www.amazon.com")).toBe("amazon.com");
    expect(registeredDomain("amazon.com")).toBe("amazon.com");
    expect(registeredDomain("shop.eu.amazon.com")).toBe("amazon.com");
  });
  it("handles multi-part public suffixes", () => {
    expect(registeredDomain("www.amazon.co.uk")).toBe("amazon.co.uk");
    expect(registeredDomain("amazon.co.jp")).toBe("amazon.co.jp");
  });
  it("does NOT let a brand-prefixed host escape its real registered domain", () => {
    // The classic trick: "amazon.com.evil.ru" is really evil.ru.
    expect(registeredDomain("amazon.com.evil.ru")).toBe("evil.ru");
  });
});

describe("detectLookalike", () => {
  it("catches misspellings, leetspeak, and homoglyphs", () => {
    expect(detectLookalike("amzon.com")?.brand).toBe("amazon");     // dropped letter
    expect(detectLookalike("arnazon.com")?.brand).toBe("amazon");   // rn → m
    expect(detectLookalike("paypa1.com")?.brand).toBe("paypal");    // 1 → l
    expect(detectLookalike("g00gle.com")?.brand).toBe("google");    // 0 → o
    expect(detectLookalike("secure-paypal.net")?.brand).toBe("paypal"); // delimited token
  });
  it("does NOT flag the real brand domains", () => {
    expect(detectLookalike("amazon.com")).toBeNull();
    expect(detectLookalike("www.paypal.com")).toBeNull();
    expect(detectLookalike("amzn.to")).toBeNull(); // legit Amazon short link
  });
  it("does NOT flag unrelated domains", () => {
    expect(detectLookalike("wikipedia.org")).toBeNull();
    expect(detectLookalike("my-cool-startup.io")).toBeNull();
  });
});

describe("assessTyposquat — the safe/dangerous decision", () => {
  it("lookalike that LANDS on the real brand → safe (brand owns the typo)", () => {
    const r = assessTyposquat({ submittedHost: "amzon.com", finalHost: "www.amazon.com" });
    expect(r.isLookalike).toBe(true);
    expect(r.landsOnBrand).toBe(true);
    expect(r.impersonation).toBe(false);
    expect(r.evidence[0].severity).toBe("safe");
  });

  it("lookalike that stays on its OWN domain → dangerous impersonation", () => {
    // zon.com-style: a lookalike serving its own page, no redirect to the real brand.
    const r = assessTyposquat({ submittedHost: "arnazon.com", finalHost: "arnazon.com" });
    expect(r.impersonation).toBe(true);
    expect(r.evidence[0].severity).toBe("dangerous");
  });

  it("lookalike that redirects to a DIFFERENT non-brand domain → dangerous", () => {
    // The trap: it redirected *somewhere*, but not to real Amazon. Must NOT be called safe.
    const r = assessTyposquat({ submittedHost: "amzon.com", finalHost: "amzon-verify.ru" });
    expect(r.landsOnBrand).toBe(false);
    expect(r.impersonation).toBe(true);
  });

  it("brand-prefixed host that really lands on evil.ru → dangerous, not safe", () => {
    const r = assessTyposquat({ submittedHost: "amazon.com.evil.ru", finalHost: "amazon.com.evil.ru" });
    expect(r.impersonation).toBe(true);
  });

  it("lookalike with unknown destination → review, not a confident verdict", () => {
    const r = assessTyposquat({ submittedHost: "paypa1.com", finalHost: null });
    expect(r.isLookalike).toBe(true);
    expect(r.impersonation).toBe(false);
    expect(r.evidence[0].severity).toBe("review");
  });

  it("real brand domain → not a lookalike at all", () => {
    const r = assessTyposquat({ submittedHost: "amazon.com", finalHost: "amazon.com" });
    expect(r.isLookalike).toBe(false);
    expect(r.evidence).toEqual([]);
  });

  it("accepts a matched brand's alternate legit domain as landing (amazon.co.uk)", () => {
    const r = assessTyposquat({ submittedHost: "amzon.com", finalHost: "www.amazon.co.uk" });
    expect(r.landsOnBrand).toBe(true);
    expect(r.impersonation).toBe(false);
  });
});
