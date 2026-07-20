import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock node:dns/promises so these tests are deterministic and never hit the network. Each test
// sets what MX/TXT/A lookups return (or throw) for the domain under test.
const resolveMx = vi.fn();
const resolveTxt = vi.fn();
const resolve = vi.fn();

vi.mock("node:dns/promises", () => ({
  default: {
    resolveMx: (...a) => resolveMx(...a),
    resolveTxt: (...a) => resolveTxt(...a),
    resolve: (...a) => resolve(...a),
  },
}));

const { checkSenderDns, DNS_PENALTY_CAP } = await import("./senderDns.js");

// Helper: a domain that fully resolves with real mail auth.
const configureHealthy = () => {
  resolveMx.mockResolvedValue([{ exchange: "mx.example.com", priority: 10 }]);
  resolveTxt.mockImplementation(async (name) =>
    name.startsWith("_dmarc.") ? [["v=DMARC1; p=reject"]] : [["v=spf1 include:_spf.example.com ~all"]]);
  resolve.mockResolvedValue(["93.184.216.34"]);
};

const err = (code) => Object.assign(new Error(code), { code });

describe("checkSenderDns — free native MX/SPF/DMARC signals", () => {
  beforeEach(() => { resolveMx.mockReset(); resolveTxt.mockReset(); resolve.mockReset(); });

  it("ignores a malformed hostname without touching the resolver", async () => {
    const r = await checkSenderDns("not a domain");
    expect(r.checked).toBe(false);
    expect(resolveMx).not.toHaveBeenCalled();
  });

  it("a fully-configured domain: no penalty, only an informational (caveated) note", async () => {
    configureHealthy();
    const r = await checkSenderDns("example.com");
    expect(r.resolves).toBe(true);
    expect(r.hasMx && r.hasSpf && r.hasDmarc).toBe(true);
    expect(r.penalty).toBe(0);                       // presence is NOT rewarded
    expect(r.evidence).toHaveLength(1);
    expect(r.evidence[0].severity).toBe("safe");
    expect(r.evidence[0].text).toMatch(/scammers can set these up too/i);
  });

  it("a domain that doesn't resolve at all is the strongest single signal (no double-counting)", async () => {
    resolveMx.mockRejectedValue(err("ENOTFOUND"));
    resolveTxt.mockRejectedValue(err("ENOTFOUND"));
    resolve.mockRejectedValue(err("ENOTFOUND"));
    const r = await checkSenderDns("this-domain-does-not-exist.com");
    expect(r.resolves).toBe(false);
    expect(r.evidence).toHaveLength(1);              // ONE signal, not four
    expect(r.evidence[0].text).toMatch(/doesn't resolve/i);
  });

  it("resolves but missing MX/SPF/DMARC → each is flagged, penalty capped", async () => {
    resolveMx.mockRejectedValue(err("ENODATA"));      // no mail records
    resolveTxt.mockResolvedValue([]);                 // no SPF, no DMARC
    resolve.mockResolvedValue(["1.2.3.4"]);           // but the domain exists (A record)
    const r = await checkSenderDns("bare-website.com");
    expect(r.resolves).toBe(true);
    expect(r.hasMx).toBe(false);
    expect(r.hasSpf).toBe(false);
    expect(r.hasDmarc).toBe(false);
    expect(r.evidence.length).toBe(3);                // MX, SPF, DMARC each flagged
    expect(r.penalty).toBeLessThanOrEqual(DNS_PENALTY_CAP);
    expect(r.penalty).toBeGreaterThan(0);
  });

  it("a slow lookup times out into a soft failure, never a hang or a thrown error", async () => {
    // resolveMx never settles; the guard's timeout must win.
    resolveMx.mockImplementation(() => new Promise(() => {}));
    resolveTxt.mockResolvedValue([["v=spf1 ~all"]]);
    resolve.mockResolvedValue(["1.2.3.4"]);
    const r = await checkSenderDns("slow.com", { timeoutMs: 20 });
    expect(r.checked).toBe(true);
    expect(r.hasMx).toBe(false);       // the hanging MX lookup resolved to "not present"
    expect(r.resolves).toBe(true);     // TXT/A still succeeded
  });

  it("handles multi-chunk TXT records (SPF split across strings)", async () => {
    resolveMx.mockResolvedValue([{ exchange: "mx.example.com", priority: 10 }]);
    resolveTxt.mockImplementation(async (name) =>
      name.startsWith("_dmarc.") ? [] : [["v=spf1 ", "include:_spf.example.com ~all"]]);
    resolve.mockResolvedValue(["1.2.3.4"]);
    const r = await checkSenderDns("example.com");
    expect(r.hasSpf).toBe(true);       // chunks joined before matching
  });
});
