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
    // Reused pipeline gets the FULL user row + the extracted link + hasLink true (rawUrl = first link).
    expect(submitEmail).toHaveBeenCalledWith(
      expect.objectContaining({ user: orgMember, hasLink: true, rawUrl: "https://paypa1-secure.com/verify" })
    );
    // On-receipt notification with the email_received type.
    expect(createNotification).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ userId: 10, type: "email_received", indicatorId: 2 })
    );
  });

  it("scans EVERY link: passes all as rawUrls (first also in rawUrl for back-compat), deduped", async () => {
    findUserByEmail.mockResolvedValue(orgMember);
    const res = await post({
      from: "david@acme.com",
      subject: "Fwd",
      // three distinct links (one repeated) + a bare www link
      body: "safe https://paypal.com bad https://paypa1-secure.com/verify again https://paypal.com and www.example.com",
    });
    expect(res.status).toBe(201);
    const arg = submitEmail.mock.calls[0][0];
    expect(arg.rawUrl).toBe("https://paypal.com");           // first link, back-compat
    expect(arg.rawUrls).toContain("https://paypa1-secure.com/verify");
    expect(arg.rawUrls).toContain("https://www.example.com"); // bare www → https prepended
    // deduped: paypal.com appears once even though it was in the body twice
    expect(arg.rawUrls.filter((u) => u === "https://paypal.com")).toHaveLength(1);
  });

  it("passes optional richer fields (html/headers/replyTo/threadId) through to submitEmail", async () => {
    findUserByEmail.mockResolvedValue(orgMember);
    // The headers value here is just a PASS-THROUGH fixture — this test asks "do the four optional
    // fields reach submitEmail?", nothing about auth. It says dmarc=pass because a *failing* value
    // would now make the route refuse the sender as forged (see the forged-sender describe below),
    // so the email would never reach submitEmail and this test would be checking the wrong thing.
    await post({
      from: "david@acme.com",
      body: "text",
      html: "<a href='https://evil.ru'>www.paypal.com</a>",
      headers: "Authentication-Results: dkim=pass; dmarc=pass",
      replyTo: "attacker@evil.ru",
      threadId: "gmail-thread-abc",
    });
    expect(submitEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        html: "<a href='https://evil.ru'>www.paypal.com</a>",
        headers: "Authentication-Results: dkim=pass; dmarc=pass",
        replyTo: "attacker@evil.ru",
        threadId: "gmail-thread-abc",
      })
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

// ── the From header is a CLAIM, not identity ──
// The x-orbis-token proves the RELAY is ours; it says nothing about who wrote the email. Anyone can
// mail our inbox with a forged "From: victim@acme.com" and the relay forwards it with a valid token —
// so if we trusted `from` alone, anyone could create submissions as an arbitrary victim. When the mail
// provider's OWN auth results prove the sender was forged, we refuse to attribute it.
// The balance being tested: block on PROOF of forgery, never on a mere absence of proof.
describe("POST /api/webhooks/inbound-email — a forged sender is not identity", () => {
  beforeEach(() => {
    // Full reset, not just findUserByEmail: mock state does NOT leak out of a sibling describe on its
    // own, and findUserByToken is mocked past its real `if (!token) return null` guard — so a stale
    // mockResolvedValue would resolve a user for a token-less email and mask the check under test.
    findUserByEmail.mockReset();
    findUserByToken.mockReset();
    submitEmail.mockReset();
    createNotification.mockReset();
    env.inboundEmail.token = "devsecret";
    env.inboundEmail.tokens = {};
    submitEmail.mockResolvedValue({ submissionId: 1, indicatorId: 2, escalated: false });
    createNotification.mockResolvedValue({});
    findUserByToken.mockResolvedValue(null);
    // This sender WOULD match a real user — the auth results are the only reason we refuse.
    findUserByEmail.mockResolvedValue(orgMember);
  });

  it("DMARC fail → 202 ignored, and NOTHING is written (no submission, no notification)", async () => {
    const res = await post({
      from: "David M. <david@acme.com>",
      subject: "Fwd: account locked",
      body: "verify https://paypa1-secure.com/verify",
      headers: "Authentication-Results: mx.google.com; dkim=pass; spf=pass; dmarc=fail",
    });
    expect(res.status).toBe(202);
    expect(res.body.status).toBe("ignored");
    // The whole point: refused BEFORE any DB write, so nothing lands on the victim's account.
    expect(submitEmail).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("DKIM fail → 202 ignored (a broken signature means the sender may be forged)", async () => {
    const res = await post({
      from: "david@acme.com",
      body: "https://x.com",
      headers: "Authentication-Results: mx.google.com; dkim=fail; dmarc=pass",
    });
    expect(res.status).toBe(202);
    expect(submitEmail).not.toHaveBeenCalled();
  });

  it("SPF fail ALONE is still accepted — SPF breaks on every legitimate forward", async () => {
    // The false-positive we must not create: forwarding through Gmail routinely fails SPF because the
    // forwarder isn't in the original domain's SPF record. Blocking on it would reject honest forwards.
    const res = await post({
      from: "david@acme.com",
      body: "https://x.com",
      headers: "Authentication-Results: mx.google.com; dkim=pass; spf=fail; dmarc=pass",
    });
    expect(res.status).toBe(201);
    expect(submitEmail).toHaveBeenCalledWith(expect.objectContaining({ user: orgMember }));
  });

  it("a matched plus-token still wins over a forged From (token is identity, From is a claim)", async () => {
    findUserByToken.mockResolvedValue(orgMember);
    const res = await post({
      from: "spoofed@acme.com",
      to: "orbischecks+david@gmail.com",
      body: "https://x.com",
      headers: "Authentication-Results: dmarc=fail; dkim=fail",
    });
    expect(res.status).toBe(201);
    // We never fall back to the (forged) From, because the token already resolved a real user.
    expect(findUserByEmail).not.toHaveBeenCalled();
    expect(submitEmail).toHaveBeenCalledWith(expect.objectContaining({ user: orgMember }));
  });

  it("NO headers at all → unchanged 201 (a thin relay sends none; absence of proof isn't forgery)", async () => {
    const res = await post({ from: "david@acme.com", body: "https://x.com" });
    expect(res.status).toBe(201);
    expect(submitEmail).toHaveBeenCalledWith(expect.objectContaining({ user: orgMember }));
  });
});

// ── the SCALE path: POST /api/webhooks/inbound-email/batch ──
// Many forwarded emails in one request, analyzed with bounded concurrency, per-email results in order.
const postBatch = (body, token = "devsecret") =>
  request(app()).post("/api/webhooks/inbound-email/batch").set("x-orbis-token", token).send(body);

describe("POST /api/webhooks/inbound-email/batch", () => {
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

  it("503 / 401 gate the batch route just like the single one", async () => {
    env.inboundEmail.token = "";
    expect((await postBatch({ emails: [] })).status).toBe(503);
    env.inboundEmail.token = "devsecret";
    expect((await postBatch({ emails: [] }, "wrong")).status).toBe(401);
  });

  it("400 when the payload isn't { emails: [...] }", async () => {
    const res = await postBatch({ notEmails: 1 });
    expect(res.status).toBe(400);
    expect(submitEmail).not.toHaveBeenCalled();
  });

  it("empty batch → 200 with zero counts (no work, not an error)", async () => {
    const res = await postBatch({ emails: [] });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ accepted: 0, ignored: 0, errored: 0, results: [] });
  });

  it("processes many emails in ONE request, results IN ORDER (accepted / ignored / errored)", async () => {
    // 1st: known user → accepted. 2nd: unknown → ignored. 3rd: submitEmail throws → errored (isolated).
    findUserByEmail
      .mockResolvedValueOnce(orgMember)   // email 0 → known
      .mockResolvedValueOnce(null)        // email 1 → unknown
      .mockResolvedValueOnce(individual); // email 2 → known (but submitEmail rejects)
    submitEmail
      .mockResolvedValueOnce({ submissionId: 5, indicatorId: 6, escalated: true })
      .mockRejectedValueOnce(new Error("pipeline boom"));

    const res = await postBatch({ emails: [
      { from: "david@acme.com", body: "https://a.com" },
      { from: "nobody@nowhere.com", body: "hi" },
      { from: "sofia@example.com", body: "https://b.com" },
    ] });

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(3);
    expect(res.body.processed).toBe(3);
    expect(res.body).toMatchObject({ accepted: 1, ignored: 1, errored: 1 });
    expect(res.body.results[0]).toMatchObject({ status: "ok", indicatorId: 6, escalated: true });
    expect(res.body.results[1]).toMatchObject({ status: "ignored" });
    expect(res.body.results[2]).toMatchObject({ status: "error" });
    // One bad email did NOT prevent the others from being processed.
    expect(submitEmail).toHaveBeenCalledTimes(2);
  });

  it("caps at MAX_BATCH_EMAILS and reports the overflow (no silent truncation)", async () => {
    findUserByEmail.mockResolvedValue(orgMember);
    const emails = Array.from({ length: 55 }, (_, i) => ({ from: "david@acme.com", body: `https://x${i}.com` }));
    const res = await postBatch({ emails });
    expect(res.status).toBe(200);
    expect(res.body.received).toBe(55);
    expect(res.body.processed).toBe(50);      // capped at MAX_BATCH_EMAILS
    expect(res.body.results).toHaveLength(50);
  });

  it("a bad-request email in the batch is counted (ignored), never crashes the batch", async () => {
    findUserByEmail.mockResolvedValue(orgMember);
    const res = await postBatch({ emails: [
      { subject: "no from or to" }, // → bad_request
      { from: "david@acme.com", body: "https://a.com" }, // → ok
    ] });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ accepted: 1, ignored: 1 });
    expect(res.body.results[0].status).toBe("bad_request");
  });
});
