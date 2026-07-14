// ── feature: notifications · service · owner: Ozias ──
// Pure data helpers (NO Express here) so they're easy to unit-test and reuse.
// Mirrors the users.service.js style: every function takes the Prisma client as
// its first argument. Keeping the DB logic here (not in the route) means the
// analyst review route can reuse createNotification() without importing anything
// Express-y — that's how the "closure loop" (story #7) fires the bell badge.

/**
 * List one user's notifications, newest first.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {number} userId
 * @returns {Promise<object[]>} raw notification rows (camelCase, straight from Prisma)
 */
export async function listNotifications(prisma, userId) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Mark ONE notification read — but only if it belongs to this user (story #12
 * data isolation: you can never touch someone else's row). Returns a tagged
 * result so the route can pick the right HTTP status without the service
 * knowing anything about HTTP:
 *   { status: "not_found" }              → route sends 404
 *   { status: "forbidden" }              → route sends 403
 *   { status: "ok", notification }       → route sends 200 + the row
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ id: number, userId: number }} args
 */
export async function markNotificationRead(prisma, { id, userId }) {
  const existing = await prisma.notification.findUnique({ where: { id } });
  if (!existing) return { status: "not_found" };
  if (existing.userId !== userId) return { status: "forbidden" };

  const notification = await prisma.notification.update({
    where: { id },
    data: { isRead: true },
  });
  return { status: "ok", notification };
}

/**
 * Create ONE notification for a user — the "closure loop" primitive (story #7).
 * When an analyst confirms a verdict, the review route calls this so the person
 * who reported the link sees their bell badge light up. Written as a standalone
 * helper (O10) so that route can drop it in later without duplicating query code.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} args
 * @param {number} args.userId               who receives the alert (required)
 * @param {string} args.message              text shown in the bell dropdown (required)
 * @param {string} [args.type]               machine tag, e.g. "verdict_confirmed"
 * @param {number|null} [args.indicatorId]   the indicator this alert is about (optional)
 * @returns {Promise<object>} the created notification row
 */
export async function createNotification(
  prisma,
  { userId, message, type = "verdict_confirmed", indicatorId = null }
) {
  if (!userId) throw new Error("createNotification: userId is required");
  if (!message) throw new Error("createNotification: message is required");

  return prisma.notification.create({
    data: { userId, message, type, indicatorId },
  });
}
