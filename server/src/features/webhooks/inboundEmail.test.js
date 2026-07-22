import { describe, it, expect } from "vitest";
import {
  extractEmailAddress,
  extractPlusToken,
  extractFirstUrl,
  extractAllUrls,
  extractOriginalSender,
  extractOriginalSenderParts,
  parseAuthResults,
  extractHtmlLinks,
} from "./inboundEmail.js";

describe("extractEmailAddress", () => {
  it("pulls the address out of a display-name header", () => {
    expect(extractEmailAddress("David M. <david@acme.com>")).toBe("david@acme.com");
  });

  it("accepts a bare address and lowercases it", () => {
    expect(extractEmailAddress("Sofia@Example.COM")).toBe("sofia@example.com");
  });

  it("returns null for a non-email string or non-string input", () => {
    expect(extractEmailAddress("not an email")).toBeNull();
    expect(extractEmailAddress(null)).toBeNull();
    expect(extractEmailAddress(undefined)).toBeNull();
  });
});

describe("extractPlusToken", () => {
  it("pulls the token from a plus-addressed recipient", () => {
    expect(extractPlusToken("orbischecks+david@gmail.com")).toBe("david");
  });

  it("returns null when there's no +token", () => {
    expect(extractPlusToken("orbischecks@gmail.com")).toBeNull();
  });

  it("returns null for a non-email recipient", () => {
    expect(extractPlusToken("garbage")).toBeNull();
  });
});

describe("extractOriginalSender", () => {
  it("pulls the original sender from a Gmail forwarded block", () => {
    const body = [
      "---------- Forwarded message ---------",
      "From: SimpleBills <no-reply@simplebills.com>",
      "Date: Mon, Jul 21, 2026 at 3:00 PM",
      "Subject: Don't forget about your application!",
      "To: Ozias <oziastumimana@gmail.com>",
      "",
      "Hi Ozias, just a reminder...",
    ].join("\n");
    expect(extractOriginalSender(body)).toBe("no-reply@simplebills.com");
  });

  it("handles an Outlook-style 'From:' block", () => {
    const body = "-----Original Message-----\nFrom: Billing <billing@acme.com>\nSent: Monday\nTo: me\nSubject: Invoice";
    expect(extractOriginalSender(body)).toBe("billing@acme.com");
  });

  it("takes the FIRST (topmost = original) From when there are nested forwards", () => {
    const body = "From: First <first@a.com>\nsome text\nFrom: Second <second@b.com>";
    expect(extractOriginalSender(body)).toBe("first@a.com");
  });

  it("tolerates quote markers some clients prepend ('> From:')", () => {
    expect(extractOriginalSender("> From: Scam <evil@bad.co>\n> body")).toBe("evil@bad.co");
  });

  it("returns null when there's no forward header / no address", () => {
    expect(extractOriginalSender("just a plain body with no headers")).toBeNull();
    expect(extractOriginalSender("From: Nobody (no address here)")).toBeNull();
    expect(extractOriginalSender("")).toBeNull();
    expect(extractOriginalSender(null)).toBeNull();
  });
});

describe("extractFirstUrl", () => {
  it("finds the first http(s) URL in a blob of text", () => {
    expect(extractFirstUrl("please verify https://paypa1-secure.com/verify now")).toBe(
      "https://paypa1-secure.com/verify"
    );
  });

  it("trims trailing sentence punctuation", () => {
    expect(extractFirstUrl("go to https://x.com.")).toBe("https://x.com");
  });

  it("returns null when there's no URL", () => {
    expect(extractFirstUrl("no links here")).toBeNull();
    expect(extractFirstUrl(null)).toBeNull();
  });
});

describe("extractAllUrls", () => {
  it("finds EVERY http(s) link in order (not just the first)", () => {
    const text = "safe https://paypal.com then bad https://paypa1-secure.com/verify";
    expect(extractAllUrls(text)).toEqual(["https://paypal.com", "https://paypa1-secure.com/verify"]);
  });

  it("catches bare www. links and prepends https://", () => {
    expect(extractAllUrls("visit www.example.com today")).toEqual(["https://www.example.com"]);
  });

  it("trims trailing sentence punctuation on each match", () => {
    expect(extractAllUrls("go to https://x.com. then www.y.com!")).toEqual(["https://x.com", "https://www.y.com"]);
  });

  it("does NOT grab bare domains without a scheme or www (false-positive guard)", () => {
    expect(extractAllUrls("email me at acme.com or read file.txt")).toEqual([]);
  });

  it("returns [] for no links / non-string input", () => {
    expect(extractAllUrls("nothing here")).toEqual([]);
    expect(extractAllUrls(null)).toEqual([]);
  });
});

describe("extractOriginalSenderParts", () => {
  it("returns the display name AND address from the forwarded From line", () => {
    const body = "---------- Forwarded message ---------\nFrom: PayPal Security <no-reply@paypa1.com>\nTo: me";
    expect(extractOriginalSenderParts(body)).toEqual({ displayName: "PayPal Security", address: "no-reply@paypa1.com" });
  });

  it("returns an empty display name for a bare address", () => {
    expect(extractOriginalSenderParts("From: billing@acme.com\nbody")).toEqual({ displayName: "", address: "billing@acme.com" });
  });

  it("strips surrounding quotes from the display name", () => {
    expect(extractOriginalSenderParts('From: "Apple Support" <help@apple.com>')).toEqual({ displayName: "Apple Support", address: "help@apple.com" });
  });

  it("returns null when there's no parseable From line / address", () => {
    expect(extractOriginalSenderParts("just a body")).toBeNull();
    expect(extractOriginalSenderParts("From: Nobody (no address)")).toBeNull();
    expect(extractOriginalSenderParts(null)).toBeNull();
  });
});

describe("parseAuthResults", () => {
  it("pulls spf/dkim/dmarc verdicts out of an Authentication-Results header", () => {
    const headers = "Authentication-Results: mx.google.com; dkim=pass header.i=@paypal.com; spf=pass; dmarc=pass";
    expect(parseAuthResults(headers)).toEqual({ spf: "pass", dkim: "pass", dmarc: "pass" });
  });

  it("captures a fail verdict", () => {
    expect(parseAuthResults("dmarc=fail; dkim=fail; spf=softfail")).toEqual({ spf: "softfail", dkim: "fail", dmarc: "fail" });
  });

  it("returns all-null when headers are absent / not a string", () => {
    expect(parseAuthResults(null)).toEqual({ spf: null, dkim: null, dmarc: null });
    expect(parseAuthResults("")).toEqual({ spf: null, dkim: null, dmarc: null });
  });
});

describe("extractHtmlLinks", () => {
  it("returns { text, href } pairs for each anchor", () => {
    const html = '<p>Click <a href="https://evil.ru/login">www.paypal.com</a> now</p>';
    expect(extractHtmlLinks(html)).toEqual([{ text: "www.paypal.com", href: "https://evil.ru/login" }]);
  });

  it("strips nested tags out of the visible text", () => {
    const html = '<a href="https://x.com"><b>Secure</b> link</a>';
    expect(extractHtmlLinks(html)).toEqual([{ text: "Secure link", href: "https://x.com" }]);
  });

  it("returns [] for plain text / no anchors", () => {
    expect(extractHtmlLinks("no html here")).toEqual([]);
    expect(extractHtmlLinks(null)).toEqual([]);
  });
});
