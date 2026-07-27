// ── indicators · community "Mark safe" vote · tests · owner: David ──
// Covers trustIndicator() + POST /api/indicators/:id/trust. The important properties:
//   • one vote per user (the unique constraint is the enforcement, not client trust)
//   • a duplicate is a no-op, not an error (a double-click must not double-count)
//   • the counter and the vote rows share a transaction, so they can't drift
//   • it NEVER touches aiScore/aiVerdict — a vote brigade can't turn a phishing page green
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const indicatorFindUnique = vi.fn();
const indicatorUpdate = vi.fn();
const trustCreate = vi.fn();
// $transaction receives already-invoked prisma promises; await them all so the mocks still record
// their calls (mirrors reportIndicator.test.js).
const transaction = vi.fn((ops) => Promise.all(ops));
vi.mock("../../db.js", () => ({ prisma: {
  indicator: { findUnique: (...a) => indicatorFindUnique(...a), update: (...a) => indicatorUpdate(...a) },
  userTrust: { create: (...a) => trustCreate(...a) },
  $transaction: (...a) => transaction(...a),
} }));
// The service module pulls these in at import time; stub so importing it touches no network.
vi.mock("../../services/urlscan.js", () => ({ scanUrl: vi.fn() }));
vi.mock("../../services/safeBrowsing.js", () => ({ checkBlacklist: vi.fn() }));
vi.mock("../../services/verdict.js", () => ({ generateVerdict: vi.fn(), scoreBucket: () => "review" }));

const { trustIndicator } = await import("./indicators.service.js");

// A Prisma unique-constraint violation, as the client throws it.
const uniqueViolation = () => Object.assign(new Error("Unique constraint failed"), { code: "P2002" });

describe("trustIndicator (community Mark safe)", () => {
  beforeEach(() => {
    indicatorFindUnique.mockReset();
    indicatorUpdate.mockReset();
    trustCreate.mockReset();
    transaction.mockClear();
  });

  it("refuses an anonymous vote (it couldn't be deduped, so it'd be stuffable)", async () => {
    const res = await trustIndicator(1, { userId: null });
    expect(res).toEqual({ unauthenticated: true });
    expect(indicatorFindUnique).not.toHaveBeenCalled();
    expect(trustCreate).not.toHaveBeenCalled();
  });

  it("returns null when the indicator doesn't exist", async () => {
    indicatorFindUnique.mockResolvedValue(null);
    expect(await trustIndicator(999, { userId: 5 })).toBeNull();
    expect(trustCreate).not.toHaveBeenCalled();
  });

  it("records the vote and bumps the counter", async () => {
    indicatorFindUnique.mockResolvedValue({ id: 1 });
    trustCreate.mockResolvedValue({ id: 100 });
    indicatorUpdate.mockResolvedValue({ trustVotes: 1 });

    const res = await trustIndicator(1, { userId: 5 });

    expect(trustCreate).toHaveBeenCalledWith({ data: { indicatorId: 1, userId: 5 } });
    expect(indicatorUpdate).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { trustVotes: { increment: 1 } },
    });
    expect(res).toEqual({ trust_votes: 1, already_voted: false });
  });

  it("writes the vote row and the counter in ONE transaction (they can't drift)", async () => {
    indicatorFindUnique.mockResolvedValue({ id: 1 });
    trustCreate.mockResolvedValue({ id: 100 });
    indicatorUpdate.mockResolvedValue({ trustVotes: 1 });
    await trustIndicator(1, { userId: 5 });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transaction.mock.calls[0][0]).toHaveLength(2); // create + increment, together
  });

  it("a second vote from the same user is a no-op that reports the CURRENT count", async () => {
    indicatorFindUnique
      .mockResolvedValueOnce({ id: 1 })          // existence check
      .mockResolvedValueOnce({ trustVotes: 3 }); // re-read after the constraint rejects
    trustCreate.mockRejectedValue(uniqueViolation());

    const res = await trustIndicator(1, { userId: 5 });

    expect(res).toEqual({ trust_votes: 3, already_voted: true });
  });

  it("NEVER writes aiScore or aiVerdict — a vote can't change the verdict", async () => {
    indicatorFindUnique.mockResolvedValue({ id: 1 });
    trustCreate.mockResolvedValue({ id: 100 });
    indicatorUpdate.mockResolvedValue({ trustVotes: 1 });
    await trustIndicator(1, { userId: 5 });
    const data = indicatorUpdate.mock.calls[0][0].data;
    expect(Object.keys(data)).toEqual(["trustVotes"]);
  });

  it("rethrows a non-P2002 database error rather than swallowing it", async () => {
    indicatorFindUnique.mockResolvedValue({ id: 1 });
    trustCreate.mockRejectedValue(Object.assign(new Error("connection lost"), { code: "P1001" }));
    await expect(trustIndicator(1, { userId: 5 })).rejects.toThrow(/connection lost/);
  });
});

// ---------------------------------------------------------------------------
// Route: POST /api/indicators/:id/trust
// ---------------------------------------------------------------------------
const { indicatorsRouter } = await import("./indicators.routes.js");

const appAs = (user) => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = user; next(); });
  app.use("/api/indicators", indicatorsRouter);
  return app;
}

describe("POST /api/indicators/:id/trust (route)", () => {
  beforeEach(() => {
    indicatorFindUnique.mockReset();
    indicatorUpdate.mockReset();
    trustCreate.mockReset();
    transaction.mockClear();
  });

  it("400 on a non-numeric id", async () => {
    const res = await request(appAs({ id: 5, role: "individual" })).post("/api/indicators/abc/trust");
    expect(res.status).toBe(400);
    expect(trustCreate).not.toHaveBeenCalled();
  });

  it("404 when the indicator doesn't exist", async () => {
    indicatorFindUnique.mockResolvedValue(null);
    const res = await request(appAs({ id: 5, role: "individual" })).post("/api/indicators/999/trust");
    expect(res.status).toBe(404);
  });

  it("200 and records the vote for any signed-in user (not analyst-only)", async () => {
    indicatorFindUnique.mockResolvedValue({ id: 1 });
    trustCreate.mockResolvedValue({ id: 100 });
    indicatorUpdate.mockResolvedValue({ trustVotes: 1 });

    const res = await request(appAs({ id: 5, role: "individual", orgId: null })).post("/api/indicators/1/trust");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ trust_votes: 1, already_voted: false });
  });

  it("200 with already_voted on a duplicate — a double-click isn't an error", async () => {
    indicatorFindUnique
      .mockResolvedValueOnce({ id: 1 })
      .mockResolvedValueOnce({ trustVotes: 2 });
    trustCreate.mockRejectedValue(uniqueViolation());

    const res = await request(appAs({ id: 5, role: "member", orgId: 99 })).post("/api/indicators/1/trust");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ trust_votes: 2, already_voted: true });
  });

  it("500 with a safe message (no Prisma internals) when the DB fails", async () => {
    indicatorFindUnique.mockResolvedValue({ id: 1 });
    trustCreate.mockRejectedValue(Object.assign(new Error("relation \"UserTrust\" does not exist"), { code: "P2021" }));

    const res = await request(appAs({ id: 5, role: "individual" })).post("/api/indicators/1/trust");

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Couldn't record your vote just now.");
    expect(JSON.stringify(res.body)).not.toMatch(/UserTrust|P2021/); // no internals leaked
  });
});
