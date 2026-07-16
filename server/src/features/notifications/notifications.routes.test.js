import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// Mock the DB module the router imports, so no live Postgres is needed.
// Each test sets what these Prisma fns return.
const notificationFindMany = vi.fn();
const notificationFindUnique = vi.fn();
const notificationUpdate = vi.fn();
vi.mock("../../db.js", () => ({
  prisma: {
    notification: {
      findMany: (...a) => notificationFindMany(...a),
      findUnique: (...a) => notificationFindUnique(...a),
      update: (...a) => notificationUpdate(...a),
    },
  },
}));

// Import AFTER the mock is registered.
const { notificationsRouter } = await import("./notifications.routes.js");

// A tiny app that injects a chosen user, then mounts the real router.
const appAs = (user) => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = user; next(); });
  app.use("/api/notifications", notificationsRouter);
  return app;
}

// One fake notification row in Prisma's camelCase shape.
const row = ({ id, userId, isRead = false, message = "Verdict confirmed" }) => ({
  id, userId, isRead, message, type: "verdict_confirmed", indicatorId: 5, createdAt: new Date("2026-07-10"),
});

beforeEach(() => {
  notificationFindMany.mockReset();
  notificationFindUnique.mockReset();
  notificationUpdate.mockReset();
});

describe("GET /api/notifications", () => {
  it("returns the caller's notifications as snake_case JSON + unreadCount", async () => {
    notificationFindMany.mockResolvedValue([
      row({ id: 1, userId: 7, isRead: false }),
      row({ id: 2, userId: 7, isRead: true }),
    ]);

    const res = await request(appAs({ id: 7 })).get("/api/notifications");

    expect(res.status).toBe(200);
    // Scoped to the verified caller's id.
    expect(notificationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 7 } })
    );
    expect(res.body.notifications).toHaveLength(2);
    // camelCase → snake_case translation happens on the way out.
    expect(res.body.notifications[0]).toMatchObject({ id: 1, is_read: false, indicator_id: 5 });
    expect(res.body.unreadCount).toBe(1);
  });
});

describe("PATCH /api/notifications/:id/read", () => {
  it("400 for a non-integer id (never touches the DB)", async () => {
    const res = await request(appAs({ id: 7 })).patch("/api/notifications/abc/read");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid notification id");
    expect(notificationFindUnique).not.toHaveBeenCalled();
  });

  it("404 when the notification does not exist", async () => {
    notificationFindUnique.mockResolvedValue(null);
    const res = await request(appAs({ id: 7 })).patch("/api/notifications/99/read");
    expect(res.status).toBe(404);
    expect(notificationUpdate).not.toHaveBeenCalled();
  });

  it("403 when the notification belongs to another user (never marks it read)", async () => {
    notificationFindUnique.mockResolvedValue(row({ id: 1, userId: 999 })); // someone else's
    const res = await request(appAs({ id: 7 })).patch("/api/notifications/1/read");
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Forbidden");
    expect(notificationUpdate).not.toHaveBeenCalled();
  });

  it("200 and marks the caller's own notification read", async () => {
    notificationFindUnique.mockResolvedValue(row({ id: 1, userId: 7, isRead: false }));
    notificationUpdate.mockResolvedValue(row({ id: 1, userId: 7, isRead: true }));

    const res = await request(appAs({ id: 7 })).patch("/api/notifications/1/read");

    expect(res.status).toBe(200);
    expect(notificationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 }, data: { isRead: true } })
    );
    expect(res.body.is_read).toBe(true);
  });
});
