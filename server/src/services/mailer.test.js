import { describe, it, expect, vi, beforeEach } from "vitest";

// Flip env.outboundEmail to test the configured / unconfigured paths; stub global fetch.
const env = { outboundEmail: { url: null, token: null } };
vi.mock("../config/env.js", () => ({ env }));

const { sendMail } = await import("./mailer.js");

describe("sendMail (outbound relay)", () => {
  beforeEach(() => {
    env.outboundEmail = { url: "https://script.google.com/x/exec", token: "secret" };
    vi.restoreAllMocks();
  });

  it("no-ops (returns false) when the relay isn't configured", async () => {
    env.outboundEmail = { url: null, token: null };
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(await sendMail({ to: "a@b.com", subject: "s", html: "<p>x</p>" })).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns false when a required field is missing (no send)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(await sendMail({ to: "", subject: "s", html: "<p>x</p>" })).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("POSTs the token in the BODY (never the URL) and returns true on ok", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true });
    const ok = await sendMail({ to: "a@b.com", subject: "Report", html: "<p>hi</p>" });
    expect(ok).toBe(true);
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://script.google.com/x/exec"); // our configured URL, no secret in it
    const body = JSON.parse(opts.body);
    expect(body).toMatchObject({ token: "secret", to: "a@b.com", subject: "Report", html: "<p>hi</p>" });
  });

  it("includes threadId in the POST body when passed (relay replies into the thread)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true });
    await sendMail({ to: "a@b.com", subject: "s", html: "<p>x</p>", threadId: "thread-123" });
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.threadId).toBe("thread-123");
  });

  it("sends threadId:null when not passed (standalone email, back-compat)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true });
    await sendMail({ to: "a@b.com", subject: "s", html: "<p>x</p>" });
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.threadId).toBeNull();
  });

  it("returns false (no throw) on a non-ok response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false, status: 500 });
    expect(await sendMail({ to: "a@b.com", subject: "s", html: "<p>x</p>" })).toBe(false);
  });

  it("returns false (no throw) when fetch rejects", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    expect(await sendMail({ to: "a@b.com", subject: "s", html: "<p>x</p>" })).toBe(false);
  });
});
