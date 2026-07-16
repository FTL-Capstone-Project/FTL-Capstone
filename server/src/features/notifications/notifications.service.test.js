import { describe, it, expect, vi } from "vitest";
import {
  listNotifications,
  markNotificationRead,
  createNotification,
} from "./notifications.service.js";

// Minimal mock Prisma (same style as users.service.test.js): records calls,
// returns plausible rows. No live DB.
const mockPrisma = (existing = undefined) => {
  return {
    notification: {
      findMany: vi.fn(async () => [
        { id: 1, userId: 7, type: "verdict_confirmed", message: "m1", indicatorId: 1, isRead: false, createdAt: new Date() },
      ]),
      findUnique: vi.fn(async () => existing),
      update: vi.fn(async ({ where, data }) => ({ id: where.id, userId: 7, isRead: data.isRead })),
      create: vi.fn(async ({ data }) => ({ id: 99, ...data })),
    },
  };
}

describe("listNotifications", () => {
  it("queries only the given user's rows, newest first", async () => {
    const p = mockPrisma();
    await listNotifications(p, 7);
    expect(p.notification.findMany).toHaveBeenCalledWith({
      where: { userId: 7 },
      orderBy: { createdAt: "desc" },
    });
  });
});

describe("markNotificationRead (story #12 ownership)", () => {
  it("missing row → not_found (route sends 404)", async () => {
    const p = mockPrisma(undefined); // findUnique returns nothing
    const result = await markNotificationRead(p, { id: 1, userId: 7 });
    expect(result.status).toBe("not_found");
    expect(p.notification.update).not.toHaveBeenCalled();
  });

  it("someone else's row → forbidden (route sends 403), never updated", async () => {
    const p = mockPrisma({ id: 1, userId: 999 }); // belongs to another user
    const result = await markNotificationRead(p, { id: 1, userId: 7 });
    expect(result.status).toBe("forbidden");
    expect(p.notification.update).not.toHaveBeenCalled(); // the key isolation check
  });

  it("my own row → ok + marks it read", async () => {
    const p = mockPrisma({ id: 1, userId: 7 });
    const result = await markNotificationRead(p, { id: 1, userId: 7 });
    expect(result.status).toBe("ok");
    expect(p.notification.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { isRead: true },
    });
  });
});

describe("createNotification (O10 closure-loop primitive)", () => {
  it("creates a row with sensible defaults (type, indicatorId)", async () => {
    const p = mockPrisma();
    await createNotification(p, { userId: 7, message: "An analyst confirmed your report." });
    expect(p.notification.create).toHaveBeenCalledWith({
      data: { userId: 7, message: "An analyst confirmed your report.", type: "verdict_confirmed", indicatorId: null },
    });
  });

  it("throws if userId or message is missing (guards the caller)", async () => {
    const p = mockPrisma();
    await expect(createNotification(p, { message: "x" })).rejects.toThrow(/userId/);
    await expect(createNotification(p, { userId: 7 })).rejects.toThrow(/message/);
  });
});
