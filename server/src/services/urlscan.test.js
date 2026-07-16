import { describe, it, expect } from "vitest";
import { distill } from "./urlscan.js";

// distill() is pure over urlscan's result JSON — no network — so we can test the redirect
// logic directly. These cover the three cases that separate a safe brand-owned typo domain
// from a dangerous lookalike (the whole point of step 1).

const UUID = "test-uuid";

describe("distill — redirect destination", () => {
  it("flags a redirect to a DIFFERENT host and names it (amzon.com → amazon.com)", () => {
    const result = {
      task: { url: "https://amzon.com/" },
      page: { url: "https://www.amazon.com/" },
      data: { redirects: [{}, {}] },
      verdicts: { overall: {} },
    };
    const out = distill(result, UUID, "https://amzon.com/");
    expect(out.submitted_host).toBe("amzon.com");
    expect(out.final_host).toBe("amazon.com");
    expect(out.redirected_to_different_host).toBe(true);
    expect(out.evidence).toContainEqual({ text: "Redirects to a different domain: amazon.com", severity: "review" });
  });

  it("does NOT report a redirect when a lookalike stays on its own domain (zon.com → zon.com)", () => {
    const result = {
      task: { url: "https://zon.com/" },
      page: { url: "https://zon.com/" },
      data: { redirects: [] },
      verdicts: { overall: {} },
    };
    const out = distill(result, UUID, "https://zon.com/");
    expect(out.final_host).toBe("zon.com");
    expect(out.redirected_to_different_host).toBe(false);
    expect(out.redirect_count).toBe(0);
    // No "redirects to a different domain" claim — this is what stopped the hallucination.
    expect(out.evidence.some((e) => /redirects to a different domain/i.test(e.text))).toBe(false);
  });

  it("treats www-only and same-host hops as NOT a cross-domain redirect", () => {
    const result = {
      task: { url: "https://amazon.com/deals" },
      page: { url: "https://www.amazon.com/deals?ref=x" },
      data: { redirects: [{}] },
      verdicts: { overall: {} },
    };
    const out = distill(result, UUID, "https://amazon.com/deals");
    expect(out.redirected_to_different_host).toBe(false);
    expect(out.evidence).toContainEqual({ text: "Stays on amazon.com after 1 redirect hop(s)", severity: "review" });
  });

  it("carries the redirect facts through _raw for the verdict step", () => {
    const result = {
      task: { url: "https://amzon.com/" },
      page: { url: "https://www.amazon.com/" },
      data: { redirects: [{}] },
      verdicts: { overall: { brands: ["Amazon"] } },
    };
    const out = distill(result, UUID, "https://amzon.com/");
    expect(out._raw.final_host).toBe("amazon.com");
    expect(out._raw.redirected_to_different_host).toBe(true);
    expect(out._raw.redirect_count).toBe(1);
  });
});
