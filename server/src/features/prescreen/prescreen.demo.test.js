// ── prescreen public demo endpoint · owner: David ──
// The landing page's "try it" widget calls POST /api/prescreen/demo with NO auth. These tests lock
// in the safety contract: it works logged-out, takes a url only (no sender → no DNS), validates
// input, and returns the deterministic verdict shape the widget renders.
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// Mock the deterministic service so these tests are fast and don't touch DNS/detectors internals.
const prescreenFn = vi.fn();
vi.mock("../../services/prescreen.js", () => ({ prescreen: (...a) => prescreenFn(...a) }));

const { prescreenRouter } = await import("./prescreen.routes.js");

// Mount the real router with NO auth injected — exactly how a logged-out visitor hits it.
const app = express();
app.use(express.json());
app.use("/api/prescreen", prescreenRouter);

beforeEach(() => {
  prescreenFn.mockReset();
  prescreenFn.mockResolvedValue({ level: "dangerous", score: 15, reasons: [{ text: "lookalike", severity: "dangerous" }] });
});

describe("POST /api/prescreen/demo (public landing widget)", () => {
  it("works with no auth and returns the verdict for a url", async () => {
    const res = await request(app).post("/api/prescreen/demo").send({ url: "https://paypa1-secure.com/verify" });
    expect(res.status).toBe(200);
    expect(res.body.level).toBe("dangerous");
    expect(res.body.score).toBe(15);
  });

  it("passes ONLY the url to the service — never a sender (no DNS lookup)", async () => {
    await request(app).post("/api/prescreen/demo").send({ url: "https://example.com", sender: "evil@x.com" });
    const arg = prescreenFn.mock.calls[0][0];
    expect(arg.urls).toEqual(["https://example.com"]);
    expect(arg.sender).toBeUndefined(); // sender is ignored on the public endpoint
  });

  it("rejects a missing/blank url with 400", async () => {
    const res = await request(app).post("/api/prescreen/demo").send({});
    expect(res.status).toBe(400);
    expect(prescreenFn).not.toHaveBeenCalled();
  });

  it("rejects a non-string url with 400", async () => {
    const res = await request(app).post("/api/prescreen/demo").send({ url: 42 });
    expect(res.status).toBe(400);
    expect(prescreenFn).not.toHaveBeenCalled();
  });
});
