import { describe, it, expect } from "vitest";
import { extractEmailAddress, extractPlusToken, extractFirstUrl } from "./inboundEmail.js";

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
