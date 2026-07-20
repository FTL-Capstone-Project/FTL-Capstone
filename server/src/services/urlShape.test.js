import { describe, it, expect } from "vitest";
import { assessUrlShape } from "./urlShape.js";

describe("assessUrlShape — deterministic URL-shape red flags", () => {
  it("flags a raw public IP host", () => {
    const r = assessUrlShape("http://45.33.32.9/login.html");
    expect(r.rawIpHost).toBe(true);
    expect(r.evidence[0].text).toMatch(/raw IP address/i);
    expect(r.evidence[0].severity).toBe("review");
  });

  it("flags an unusual (non-80/443) port", () => {
    const r = assessUrlShape("https://legit-looking-site.com:8443/pay");
    expect(r.unusualPort).toBe(8443);
    expect(r.evidence[0].text).toMatch(/unusual network port/i);
  });

  it("flags both when an IP host also uses an odd port", () => {
    const r = assessUrlShape("http://45.33.32.9:8080/x");
    expect(r.rawIpHost).toBe(true);
    expect(r.unusualPort).toBe(8080);
    expect(r.evidence).toHaveLength(2);
  });

  it("does NOT flag a normal domain on a default port", () => {
    expect(assessUrlShape("https://apple.com/login").evidence).toEqual([]);
    expect(assessUrlShape("https://example.com:443/x").evidence).toEqual([]);
    expect(assessUrlShape("http://example.com:80/x").evidence).toEqual([]);
  });

  it("returns clean for a private IP (blocked upstream) or unparseable input", () => {
    // canonicalize throws BLOCKED_URL for private ranges before scanning, so shape sees nothing.
    expect(assessUrlShape("http://192.168.1.1/x").evidence).toEqual([]);
    expect(assessUrlShape("not a url").evidence).toEqual([]);
  });
});
