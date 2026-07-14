import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "./index.js";

const app = createApp();

describe("GET /api/health", () => {
  it("returns ok + dev-stub auth mode (no Clerk keys in tests)", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, clerk: "dev-stub" });
  });
});

describe("POST /api/webhooks/clerk", () => {
  it("400 on an invalid/forged svix signature", async () => {
    const res = await request(app)
      .post("/api/webhooks/clerk")
      .set("svix-id", "msg_1")
      .set("svix-timestamp", String(1))
      .set("svix-signature", "v1,not-a-real-signature")
      .set("Content-Type", "application/json")
      .send({ type: "user.created", data: { id: "user_1" } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/signature/i);
  });
});

describe("protected route in dev-stub mode", () => {
  it("POST /api/submissions rejects an empty body with 400 (route runs behind stub auth)", async () => {
    const res = await request(app).post("/api/submissions").send({});
    // requireAuth injects the dev-stub user, so we reach the handler's validation.
    expect(res.status).toBe(400);
  });
});
