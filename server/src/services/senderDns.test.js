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

  it("big-sender pattern: MX + DMARC but no APEX SPF → no penalty (the uber.com false-alarm fix)", async () => {
    // Large senders publish SPF on sending subdomains and rely on DMARC at the apex. Missing apex
    // SPF is only a red flag when DMARC is ALSO missing — so this well-configured domain is clean.
    resolveMx.mockResolvedValue([{ exchange: "mx.uber.com", priority: 10 }]);
    resolveTxt.mockImplementation(async (name) =>
      name.startsWith("_dmarc.") ? [["v=DMARC1; p=reject"]] : [["some-verification-token=abc"]]); // no v=spf1 at apex
    resolve.mockResolvedValue(["1.2.3.4"]);
    const r = await checkSenderDns("uber.com");
    expect(r.hasSpf).toBe(false);
    expect(r.hasDmarc).toBe(true);
    expect(r.penalty).toBe(0);                          // no SPF penalty when DMARC is present
    expect(r.evidence.every((e) => e.severity === "safe")).toBe(true); // no "review" warnings
  });

  it("genuinely no auth (no SPF AND no DMARC) still flags", async () => {
    resolveMx.mockResolvedValue([{ exchange: "mx.sketchy.com", priority: 10 }]);
    resolveTxt.mockResolvedValue([]); // no SPF, no DMARC
    resolve.mockResolvedValue(["1.2.3.4"]);
    const r = await checkSenderDns("sketchy.com");
    expect(r.penalty).toBeGreaterThan(0);
    expect(r.evidence.some((e) => /no email authentication at all/i.test(e.text))).toBe(true);
  });

  it("a slow lookup times out into a soft failure, never a hang or a thrown error", async () => {
    // resolveMx never settles; the guard's timeout must win.
    resolveMx.mockImplementation(() => new Promise(() => {}));
    resolveTxt.mockResolvedValue([["v=spf1 ~all"]]);
    resolve.mockResolvedValue(["1.2.3.4"]);
    const r = await checkSenderDns("slow.com", { timeoutMs: 20 });
    expect(r.checked).toBe(true);
    expect(r.hasMx).toBe(false);       // we never learned of an MX record...
    // ...but "didn't answer" is NOT the same as "isn't there", so it must not be charged as a
    // missing MX. (The DMARC lookup DID answer with no DMARC record here, so that penalty stands.)
    expect(r.evidence.some((e) => /no mail \(MX\) records/i.test(e.text))).toBe(false);
    expect(r.resolves).toBe(true);     // TXT/A still succeeded
  });

  it("a resolver blip (nothing answers) reports NOT CHECKED and accuses the sender of nothing", async () => {
    // THE BUG THIS GUARDS: a timeout used to be scored exactly like a definitive "no such record", so
    // every lookup failing meant resolves=false → the full 30-point no_resolve penalty, plus evidence
    // telling the user a real domain "may not exist". One slow resolver was enough to turn ordinary
    // legitimate senders into "Be careful" warnings. Our own ignorance must never cost the sender points.
    resolveMx.mockRejectedValue(err("ETIMEOUT"));
    resolveTxt.mockRejectedValue(err("ESERVFAIL"));
    resolve.mockRejectedValue(err("EAI_AGAIN"));
    const r = await checkSenderDns("perfectly-real-business.com");
    expect(r.checked).toBe(false);     // → callers skip the DNS adjustment entirely
    expect(r.penalty).toBe(0);
    expect(r.evidence).toHaveLength(0); // no "doesn't resolve" accusation
  });

  it("an inconclusive DMARC lookup isn't charged as a missing DMARC policy", async () => {
    // Partial failure: the domain clearly exists and has MX + SPF, but the _dmarc lookup never
    // answered. Charging no_dmarc here would penalize a well-configured sender for our bad luck.
    resolveMx.mockResolvedValue([{ exchange: "mx.real.com", priority: 10 }]);
    resolveTxt.mockImplementation(async (name) => {
      if (name.startsWith("_dmarc.")) throw err("ETIMEOUT");
      return [["v=spf1 include:_spf.real.com ~all"]];
    });
    resolve.mockResolvedValue(["1.2.3.4"]);
    const r = await checkSenderDns("real.com");
    expect(r.resolves).toBe(true);
    expect(r.hasDmarc).toBe(false);
    expect(r.penalty).toBe(0);
    expect(r.evidence.some((e) => /no DMARC policy/i.test(e.text))).toBe(false);
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
