import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { rateLimit } from "./rateLimit.js";

// Mount the limiter behind a stub that injects a chosen user id, then a trivial handler.
const appFor = (opts, userId = 1) => {
  const app = express();
  app.use((req, _res, next) => { req.user = { id: userId }; next(); });
  app.get("/x", rateLimit(opts), (_req, res) => res.json({ ok: true }));
  return app;
};

describe("rateLimit (no-dependency per-user limiter)", () => {
  it("allows up to `max` requests, then returns 429", async () => {
    const app = appFor({ windowMs: 60_000, max: 20 });
    for (let i = 0; i < 20; i++) {
      const res = await request(app).get("/x");
      expect(res.status).toBe(200);
    }
    const blocked = await request(app).get("/x"); // the 21st
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBeDefined();
    expect(blocked.headers["retry-after"]).toBeDefined();
  });

  it("counts each user separately (one noisy user can't block others)", async () => {
    const limiter = rateLimit({ windowMs: 60_000, max: 2 });
    const app = express();
    // user id comes from a header so we can switch users on the same limiter instance
    app.use((req, _res, next) => { req.user = { id: req.headers["x-uid"] }; next(); });
    app.get("/x", limiter, (_req, res) => res.json({ ok: true }));

    // user A exhausts their 2
    await request(app).get("/x").set("x-uid", "A");
    await request(app).get("/x").set("x-uid", "A");
    expect((await request(app).get("/x").set("x-uid", "A")).status).toBe(429);
    // user B is unaffected
    expect((await request(app).get("/x").set("x-uid", "B")).status).toBe(200);
  });

  it("lets requests through again once the window passes", async () => {
    const app = appFor({ windowMs: 30, max: 1 }); // tiny window for the test
    expect((await request(app).get("/x")).status).toBe(200);
    expect((await request(app).get("/x")).status).toBe(429); // immediately blocked
    await new Promise((r) => setTimeout(r, 45));              // wait out the window
    expect((await request(app).get("/x")).status).toBe(200); // allowed again
  });
});
