import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the collaborators so no DB / real indicator read / real mail happens.
const readIndicatorForClient = vi.fn();
const sendMail = vi.fn();
const userFindUnique = vi.fn();
const env = { clientUrl: "https://orbis.app" };

vi.mock("../../db.js", () => ({ prisma: { user: { findUnique: (...a) => userFindUnique(...a) } } }));
vi.mock("../indicators/indicators.service.js", () => ({ readIndicatorForClient: (...a) => readIndicatorForClient(...a) }));
vi.mock("../../services/mailer.js", () => ({ sendMail: (...a) => sendMail(...a) }));
vi.mock("../../config/env.js", () => ({ env }));

const { sendReportEmail } = await import("./reportEmail.service.js");

const doneReport = { status: "done", ai_score: 12, ai_verdict: "Fake.", title: "Fake PayPal", evidence: [], screenshot_url: null };

describe("sendReportEmail", () => {
  beforeEach(() => {
    readIndicatorForClient.mockReset();
    sendMail.mockReset();
    userFindUnique.mockReset();
    sendMail.mockResolvedValue(true);
    readIndicatorForClient.mockResolvedValue(doneReport);
  });

  it("skips (false) when the user has no email", async () => {
    expect(await sendReportEmail({ user: { id: 1, email: null }, indicatorId: 2 })).toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("skips a Clerk placeholder address", async () => {
    expect(await sendReportEmail({ user: { id: 1, email: "user_x@placeholder.orbis" }, indicatorId: 2 })).toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("skips when the user opted out (emailReports false)", async () => {
    expect(await sendReportEmail({ user: { id: 1, email: "a@b.com", emailReports: false }, indicatorId: 2 })).toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("looks up the opt-out flag when the caller didn't carry it", async () => {
    userFindUnique.mockResolvedValue({ emailReports: false });
    expect(await sendReportEmail({ user: { id: 1, email: "a@b.com" }, indicatorId: 2 })).toBe(false);
    expect(userFindUnique).toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("skips when the report isn't done yet", async () => {
    readIndicatorForClient.mockResolvedValue({ status: "scanning" });
    expect(await sendReportEmail({ user: { id: 1, email: "a@b.com", emailReports: true }, indicatorId: 2 })).toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("sends the built report to the user's email on success", async () => {
    const ok = await sendReportEmail({ user: { id: 1, email: "a@b.com", emailReports: true }, indicatorId: 2 });
    expect(ok).toBe(true);
    const arg = sendMail.mock.calls[0][0];
    expect(arg.to).toBe("a@b.com");
    expect(arg.html).toContain("Fake PayPal"); // real template output
  });

  it("passes the user to readIndicatorForClient (so the IDOR/screenshot guard applies)", async () => {
    const user = { id: 7, email: "a@b.com", orgId: 3, emailReports: true };
    await sendReportEmail({ user, indicatorId: 2 });
    expect(readIndicatorForClient).toHaveBeenCalledWith(2, user);
  });

  it("swallows errors (returns false, never throws)", async () => {
    readIndicatorForClient.mockRejectedValue(new Error("db down"));
    expect(await sendReportEmail({ user: { id: 1, email: "a@b.com", emailReports: true }, indicatorId: 2 })).toBe(false);
  });
});
