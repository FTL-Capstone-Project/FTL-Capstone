import { describe, it, expect, vi } from "vitest";

// Mock the DNS dep so the pure logic is tested offline. Default: a healthy domain that resolves.
vi.mock("./senderDns.js", () => ({
  checkSenderDns: vi.fn(async () => ({ checked: true, resolves: true, hasMx: true, hasSpf: true, hasDmarc: true, evidence: [], penalty: 0 })),
  DNS_PENALTY_CAP: 30,
}));

const { prescreen } = await import("./prescreen.js");

describe("prescreen — instant deterministic verdict", () => {
  it("a homoglyph link is DANGEROUS with no destination needed", async () => {
    const r = await prescreen({ urls: ["https://аpple.com/login"] }); // Cyrillic а
    expect(r.level).toBe("dangerous");
    expect(r.score).toBeLessThanOrEqual(20);
    expect(r.reasons.length).toBeGreaterThanOrEqual(1);
  });

  it("a lookalike SENDER domain is DANGEROUS (impersonation)", async () => {
    const r = await prescreen({ sender: "security@paypa1-verify.net" });
    expect(r.level).toBe("dangerous");
    expect(r.reasons[0].text).toMatch(/lookalike of paypal/i);
  });

  it("a known-brand sender is SAFE with a spoofing caveat", async () => {
    const r = await prescreen({ sender: "noreply@uber.com" });
    expect(r.level).toBe("safe");
    expect(r.reasons[0].text).toMatch(/genuine uber domain/i);
  });

  it("free webmail sender is a WARNING, not safe", async () => {
    const r = await prescreen({ sender: "official-legal@gmail.com" });
    expect(r.level).toBe("warning");
    expect(r.reasons[0].text).toMatch(/free\/consumer webmail/i);
  });

  it("a raw-IP link is a WARNING (shape flag)", async () => {
    const r = await prescreen({ urls: ["http://45.33.32.9/login"] });
    expect(r.level).toBe("warning");
    expect(r.reasons.some((x) => /raw IP address/i.test(x.text))).toBe(true);
  });

  it("a clean sender + clean link is SAFE", async () => {
    const r = await prescreen({ sender: "team@my-real-company.com", urls: ["https://my-real-company.com/welcome"] });
    expect(r.level).toBe("safe");
    expect(r.score).toBeGreaterThanOrEqual(70);
  });

  it("takes the WORST signal across sender + multiple urls", async () => {
    // clean sender, one clean url, one homoglyph url → overall dangerous
    const r = await prescreen({ sender: "team@my-real-company.com", urls: ["https://example.com", "https://раураl.com"] });
    expect(r.level).toBe("dangerous");
  });

  it("dedupes and caps reasons at 6", async () => {
    const r = await prescreen({ urls: Array(10).fill("http://45.33.32.9:8080/x") });
    expect(r.reasons.length).toBeLessThanOrEqual(6);
  });

  it("an unknown sender whose domain doesn't resolve is a WARNING", async () => {
    const { checkSenderDns } = await import("./senderDns.js");
    checkSenderDns.mockResolvedValueOnce({ checked: true, resolves: false, hasMx: false, hasSpf: false, hasDmarc: false, evidence: [], penalty: 30 });
    const r = await prescreen({ sender: "billing@ghostmail-xyz.co" });
    expect(r.level).toBe("warning");
    expect(r.reasons[0].text).toMatch(/doesn't resolve/i);
  });
});
