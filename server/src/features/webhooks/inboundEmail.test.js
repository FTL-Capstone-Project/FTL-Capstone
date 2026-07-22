import { describe, it, expect } from "vitest";
import { extractEmailAddress, extractPlusToken, extractFirstUrl, extractOriginalSender } from "./inboundEmail.js";

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
