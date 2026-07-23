// ── CORS allowed-methods · owner: David ──
// Regression guard for a real bug: the client's "delete my report" uses DELETE /api/history/:id,
// but DELETE was missing from the CORS `methods` allowlist. The browser's preflight (OPTIONS) then
// reported DELETE as not-allowed, so the real request was never sent — delete silently failed and
// the card reappeared. This test asserts the preflight advertises every verb our routes actually
// use, so adding a route with a new verb without updating CORS fails here instead of in prod.
import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";

// createApp reads env at import; dev-stub mode keeps it from needing real Clerk/DB.
process.env.ORBIS_DEV_STUB = process.env.ORBIS_DEV_STUB || "1";
process.env.CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

let app;
beforeAll(async () => {
  ({ app } = await import("./index.js").then((m) => ({ app: m.createApp() })));
});

const ORIGIN = "http://localhost:5173"; // must match CLIENT_URL so CORS echoes it back

describe("CORS preflight allowed methods", () => {
  it("advertises DELETE (so 'delete my report' isn't blocked by the browser preflight)", async () => {
    const res = await request(app)
      .options("/api/history/1")
      .set("Origin", ORIGIN)
      .set("Access-Control-Request-Method", "DELETE");

    // A successful preflight (204/200) whose allow-methods header includes DELETE.
    expect([200, 204]).toContain(res.status);
    expect(res.headers["access-control-allow-methods"]).toMatch(/DELETE/);
  });

  it("still advertises the verbs the rest of the app uses (GET/POST/PATCH)", async () => {
    const res = await request(app)
      .options("/api/history/1")
      .set("Origin", ORIGIN)
      .set("Access-Control-Request-Method", "PATCH");

    const allow = res.headers["access-control-allow-methods"] || "";
    for (const verb of ["GET", "POST", "PATCH", "DELETE"]) {
      expect(allow).toMatch(new RegExp(verb));
    }
  });

  it("allows the Gmail origin (the extension's content-script pre-check runs there)", async () => {
    // The Gmail inline badge fetches /api/prescreen from the mail.google.com page origin, not the
    // chrome-extension:// origin — so CORS must echo it back or the browser blocks the call.
    const res = await request(app)
      .options("/api/prescreen")
      .set("Origin", "https://mail.google.com")
      .set("Access-Control-Request-Method", "POST");

    expect([200, 204]).toContain(res.status);
    expect(res.headers["access-control-allow-origin"]).toBe("https://mail.google.com");
  });
});
