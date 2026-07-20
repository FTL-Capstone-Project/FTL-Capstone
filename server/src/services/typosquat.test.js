import { describe, it, expect } from "vitest";
import { registeredDomain, detectLookalike, detectConfusableScript, assessTyposquat, knownBrandDomain } from "./typosquat.js";

describe("knownBrandDomain", () => {
  it("recognizes a real brand domain (and its subdomains)", () => {
    expect(knownBrandDomain("linkedin.com")).toBe("linkedin");
    expect(knownBrandDomain("mail.amazon.com")).toBe("amazon"); // subdomain of a listed brand
    expect(knownBrandDomain("www.paypal.com")).toBe("paypal");
  });
  it("returns null for lookalikes and unknown domains", () => {
    expect(knownBrandDomain("paypa1.com")).toBeNull();     // lookalike, not the real domain
    expect(knownBrandDomain("linkedln.com")).toBeNull();
    expect(knownBrandDomain("some-random-startup.io")).toBeNull();
  });
});

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

  it("decodes punycode so an IDN lookalike is matched by the character a victim sees", () => {
    // "xn--pple-43d.com" renders as "аpple.com" (Cyrillic а). On the wire we only get the
    // xn-- form, so without decoding this brand match is invisible.
    expect(detectLookalike("xn--pple-43d.com")?.brand).toBe("apple");
  });

  it("very short brands don't fuzzy-match innocent short domains (no false-positive blowup)", () => {
    // 3-4 letter brands get zero edit budget — "vista"/"ips" must NOT read as visa/ups.
    expect(detectLookalike("vista.com")).toBeNull();
    expect(detectLookalike("ips.io")).toBeNull();
    // but exact-fold + leetspeak on a short brand still fires (vi5a → visa).
    expect(detectLookalike("vi5a.com")?.brand).toBe("visa");
  });

  it("catches lookalikes of the expanded brand set", () => {
    expect(detectLookalike("coinbaze.com")?.brand).toBe("coinbase");
    expect(detectLookalike("dropbex.com")?.brand).toBe("dropbox");
  });
});

// LIST-FREE homoglyph detection: a domain whose readable name is forged out of confusable
// Cyrillic/Greek characters is impersonation with NO brand list involved — the "bypass the list" win.
describe("detectConfusableScript — list-free homoglyph signal", () => {
  it("flags a label that MIXES Latin with Cyrillic look-alike letters", () => {
    const r = detectConfusableScript("аpple.com"); // Cyrillic а + Latin pple
    expect(r?.mixed).toBe(true);
    expect(r?.script).toBe("Cyrillic");
  });

  it("flags an all-Cyrillic word that spells a Latin-looking name", () => {
    expect(detectConfusableScript("раур.com")).not.toBeNull(); // all-Cyrillic 'payp'
  });

  it("flags a confusable domain even when it matches NO known brand", () => {
    expect(detectConfusableScript("bаnk-of-somewhere.com")).not.toBeNull();
  });

  it("does NOT flag pure-Latin/ASCII domains", () => {
    expect(detectConfusableScript("apple.com")).toBeNull();
    expect(detectConfusableScript("wikipedia.org")).toBeNull();
    expect(detectConfusableScript("my-cool-startup.io")).toBeNull();
  });

  it("does NOT flag a genuine foreign-language IDN (real word, not a Latin disguise)", () => {
    // münchen.de is a real German domain — its label is Latin+umlaut, not a Latin lookalike.
    expect(detectConfusableScript("xn--mnchen-3ya.de")).toBeNull();
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

  it("a confusable-script domain is impersonation even with no brand match or destination", () => {
    const r = assessTyposquat({ submittedHost: "bаnk-of-somewhere.com", finalHost: null });
    expect(r.isLookalike).toBe(true);
    expect(r.impersonation).toBe(true);
    expect(r.evidence[0].severity).toBe("dangerous");
  });

  it("an IDN lookalike of a known brand is impersonation (punycode decoded)", () => {
    const r = assessTyposquat({ submittedHost: "xn--pple-43d.com", finalHost: "xn--pple-43d.com" });
    expect(r.impersonation).toBe(true);
  });
});
