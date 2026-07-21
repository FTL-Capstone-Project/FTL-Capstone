import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// Mock everything the router reaches so no network / DB / real analysis is needed.
//   env               — flip inboundEmail.token to "" to test the 503 (unconfigured) path.
//   findUserByEmail/Token — resolve the sender; return a full row or null.
//   applyClerkEvent   — unused here, but the /clerk import chain needs the binding present.
//   submitEmail       — the reused pipeline; assert we call it with the right args (don't run it).
//   createNotification — the on-receipt alert; assert type "email_received".
const env = { inboundEmail: { token: "devsecret", tokens: {} } };
const findUserByEmail = vi.fn();
const findUserByToken = vi.fn();
const submitEmail = vi.fn();
const createNotification = vi.fn();

vi.mock("../../config/env.js", () => ({ env }));
vi.mock("../../db.js", () => ({ prisma: {} }));
vi.mock("../users/users.service.js", () => ({
  applyClerkEvent: vi.fn(),
  findUserByEmail: (...a) => findUserByEmail(...a),
  findUserByToken: (...a) => findUserByToken(...a),
}));
vi.mock("../indicators/indicators.service.js", () => ({ submitEmail: (...a) => submitEmail(...a) }));
vi.mock("../notifications/notifications.service.js", () => ({ createNotification: (...a) => createNotification(...a) }));

const { webhooksRouter } = await import("./webhooks.routes.js");

// Tiny app that mounts the real router + an error handler so a thrown error becomes 500
// (not a hung request) — this is what proves the async try/catch → next(err) works.
const app = () => {
  const a = express();
  a.use(express.json());
  a.use("/api/webhooks", webhooksRouter);
  a.use((err, _req, res, _next) => res.status(500).json({ error: err.message }));
  return a;
};

const post = (payload, token = "devsecret") =>
  request(app()).post("/api/webhooks/inbound-email").set("x-orbis-token", token).send(payload);

const orgMember = { id: 10, orgId: 3, email: "david@acme.com" };
const individual = { id: 20, orgId: null, email: "sofia@example.com" };

describe("POST /api/webhooks/inbound-email", () => {
  beforeEach(() => {
    findUserByEmail.mockReset();
    findUserByToken.mockReset();
    submitEmail.mockReset();
    createNotification.mockReset();
    env.inboundEmail.token = "devsecret";
    env.inboundEmail.tokens = {};
    submitEmail.mockResolvedValue({ submissionId: 1, indicatorId: 2, escalated: false });
    createNotification.mockResolvedValue({});
    findUserByToken.mockResolvedValue(null);
    findUserByEmail.mockResolvedValue(null);
  });

  it("503 when the shared secret isn't configured", async () => {
    env.inboundEmail.token = "";
    const res = await post({ from: "david@acme.com", body: "https://x.com" });
    expect(res.status).toBe(503);
    expect(submitEmail).not.toHaveBeenCalled();
  });

  it("401 when the x-orbis-token header is missing or wrong", async () => {
    const res = await post({ from: "david@acme.com", body: "https://x.com" }, "wrong");
    expect(res.status).toBe(401);
    expect(submitEmail).not.toHaveBeenCalled();
  });

  it("400 when neither from nor to is present", async () => {
    const res = await post({ subject: "hi", body: "https://x.com" });
    expect(res.status).toBe(400);
  });

  it("202 ignored for an unknown sender (submitEmail NOT called — no open scanner)", async () => {
    const res = await post({ from: "stranger@nowhere.com", body: "https://x.com" });
    expect(res.status).toBe(202);
    expect(res.body.status).toBe("ignored");
    expect(submitEmail).not.toHaveBeenCalled();
  });

  it("201 + submitEmail(hasLink) + notification for a matching org member (escalated)", async () => {
    findUserByEmail.mockResolvedValue(orgMember);
    submitEmail.mockResolvedValue({ submissionId: 1, indicatorId: 2, escalated: true });
    const res = await post({
      from: "David M. <david@acme.com>",
      subject: "Fwd: account locked",
      body: "verify https://paypa1-secure.com/verify",
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ submissionId: 1, indicatorId: 2, matched: true, escalated: true });
    // Reused pipeline gets the FULL user row + the extracted link + hasLink true.
    expect(submitEmail).toHaveBeenCalledWith(
      expect.objectContaining({ user: orgMember, hasLink: true, rawUrl: "https://paypa1-secure.com/verify" })
    );
    // On-receipt notification with the email_received type.
    expect(createNotification).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ userId: 10, type: "email_received", indicatorId: 2 })
    );
  });

  it("link-less email (no URL) → 201, submitEmail(hasLink:false) — still analyzed + reviewable", async () => {
    findUserByEmail.mockResolvedValue(individual);
    const res = await post({ from: "sofia@example.com", subject: "Account locked", body: "confirm your password now" });
    expect(res.status).toBe(201);
    // No link → hasLink false + rawUrl null, but submitEmail STILL runs (sender+body analysis).
    expect(submitEmail).toHaveBeenCalledWith(
      expect.objectContaining({ hasLink: false, rawUrl: null, user: individual, body: "confirm your password now" })
    );
  });

  it("plus-token beats a spoofed From address", async () => {
    // From claims to be sofia, but the +david token resolves to the org member first.
    findUserByToken.mockResolvedValue(orgMember);
    const res = await post({
      from: "sofia@example.com",
      to: "orbischecks+david@gmail.com",
      body: "look at https://evil.example/login",
    });
    expect(res.status).toBe(201);
    expect(findUserByToken).toHaveBeenCalledWith({}, "david");
    // From lookup is never reached because the token matched.
    expect(findUserByEmail).not.toHaveBeenCalled();
    expect(submitEmail).toHaveBeenCalledWith(expect.objectContaining({ user: orgMember }));
  });
});
