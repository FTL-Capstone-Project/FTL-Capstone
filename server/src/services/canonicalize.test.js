import { describe, it, expect } from "vitest";
import { canonicalize, normalizeUrl } from "./canonicalize.js";

describe("normalizeUrl", () => {
  it("prepends https:// to a bare domain so the parser accepts it", () => {
    expect(normalizeUrl("amzon.com")).toBe("https://amzon.com");
    expect(normalizeUrl("www.amazon.com/foo?a=1")).toBe("https://www.amazon.com/foo?a=1");
  });

  it("leaves an input that already has a scheme untouched", () => {
    expect(normalizeUrl("https://amazon.com/")).toBe("https://amazon.com/");
    expect(normalizeUrl("HTTP://Amzon.com")).toBe("HTTP://Amzon.com");
  });

  it("rejects a bare email (it belongs to the sender-report path, not the scanner)", () => {
    // Without this guard, https://foo@bar.com would parse as host=bar.com, user=foo → wrong.
    expect(() => normalizeUrl("foo@bar.com")).toThrow("INVALID_URL");
  });

  it("rejects input that isn't a URL at all", () => {
    expect(() => normalizeUrl("not a url")).toThrow("INVALID_URL");
    expect(() => normalizeUrl("   ")).toThrow("INVALID_URL");
  });

  it("blocks non-web schemes (file/data/ftp/javascript)", () => {
    expect(() => normalizeUrl("file:///etc/passwd")).toThrow("BLOCKED_URL");
    expect(() => normalizeUrl("ftp://example.com")).toThrow("BLOCKED_URL");
    expect(() => normalizeUrl("data:text/html,<script>")).toThrow("BLOCKED_URL");
  });

  it("blocks internal / loopback / private / cloud-metadata hosts", () => {
    expect(() => normalizeUrl("http://localhost/admin")).toThrow("BLOCKED_URL");
    expect(() => normalizeUrl("http://127.0.0.1")).toThrow("BLOCKED_URL");
    expect(() => normalizeUrl("http://169.254.169.254/latest/meta-data")).toThrow("BLOCKED_URL"); // cloud metadata
    expect(() => normalizeUrl("http://10.0.0.5")).toThrow("BLOCKED_URL");
    expect(() => normalizeUrl("http://192.168.1.1")).toThrow("BLOCKED_URL");
    expect(() => normalizeUrl("http://172.16.0.1")).toThrow("BLOCKED_URL");
    expect(() => normalizeUrl("intranet.acme.local")).toThrow("BLOCKED_URL");
  });

  it("still allows normal public web URLs", () => {
    expect(normalizeUrl("https://github.com")).toBe("https://github.com");
    expect(normalizeUrl("example.com")).toBe("https://example.com");
    expect(normalizeUrl("http://172.15.0.1")).toBe("http://172.15.0.1"); // just OUTSIDE 172.16/12
  });
});

describe("canonicalize", () => {
  it("accepts a bare domain (the reported bug: typing amzon.com used to 400)", () => {
    expect(canonicalize("amzon.com")).toBe("amzon.com/");
  });

  it("keeps a typosquat separate from the real domain (not a dedup collision)", () => {
    expect(canonicalize("amzon.com")).not.toBe(canonicalize("amazon.com"));
  });

  it("normalizes scheme, www., and trailing slash to one stable key", () => {
    const key = canonicalize("https://www.amazon.com/");
    expect(canonicalize("http://amazon.com")).toBe(key);
    expect(canonicalize("amazon.com/")).toBe(key);
  });

  it("strips tracking params but keeps meaningful ones, sorted", () => {
    expect(canonicalize("shop.com/p?utm_source=x&ref=y&q=2&color=red"))
      .toBe("shop.com/p?color=red&q=2");
  });

  it("throws on unparseable input", () => {
    expect(() => canonicalize("not a url")).toThrow("INVALID_URL");
  });
});
