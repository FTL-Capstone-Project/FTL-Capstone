import { describe, it, expect, vi } from "vitest";
import {
  listNotifications,
  countUnreadNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  createNotification,
  NOTIFICATION_LIMIT,
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
      updateMany: vi.fn(async () => ({ count: 4 })),
      create: vi.fn(async ({ data }) => ({ id: 99, ...data })),
      count: vi.fn(async () => 3),
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
      take: NOTIFICATION_LIMIT,
    });
  });

  it("is BOUNDED — the bell's poll must not re-fetch a whole account history every tick", async () => {
    const p = mockPrisma();
    await listNotifications(p, 7);
    const { take } = p.notification.findMany.mock.calls[0][0];
    expect(take).toBe(NOTIFICATION_LIMIT);
    expect(take).toBeGreaterThan(0);
  });
});

describe("countUnreadNotifications", () => {
  it("counts only this user's unread rows (badge stays right past the list cap)", async () => {
    const p = mockPrisma();
    // Deriving the badge from the capped list would understate it once a user passes the limit,
    // so the count is its own indexed query.
    expect(await countUnreadNotifications(p, 7)).toBe(3);
    expect(p.notification.count).toHaveBeenCalledWith({ where: { userId: 7, isRead: false } });
  });
});

describe("markAllNotificationsRead", () => {
  it("flips ALL of the user's unread rows in one query — scoped to that user", async () => {
    const p = mockPrisma();
    const count = await markAllNotificationsRead(p, 7);
    // One updateMany, scoped to the caller and to unread rows only — this is what clears alerts that
    // fall outside the capped display window (a per-visible-id loop never could).
    expect(p.notification.updateMany).toHaveBeenCalledWith({
      where: { userId: 7, isRead: false },
      data: { isRead: true },
    });
    expect(count).toBe(4); // returns how many were flipped
    // Must NOT touch any other user's rows: the only where-clause key beyond isRead is userId.
    expect(Object.keys(p.notification.updateMany.mock.calls[0][0].where).sort()).toEqual(["isRead", "userId"]);
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
