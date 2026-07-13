// ── feature: notifications · owner: Ozias ──
// GET /api/notifications — my closure alerts. PATCH /:id/read — clear the bell badge. §6.
import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
// import { prisma } from "../../db.js";

export const notificationsRouter = Router();

notificationsRouter.get("/", requireAuth, async (req, res) => {
  // TODO(Ozias): fetch notifications for req.user.id.
  return res.json({ notifications: [], unreadCount: 0 }); // stub
});

notificationsRouter.patch("/:id/read", requireAuth, async (req, res) => {
  // TODO(Ozias): mark notification read (verify it belongs to req.user.id → else 403).
  return res.json({ id: Number(req.params.id), is_read: true }); // stub
});
