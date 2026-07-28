// ── feature: notifications · service · owner: Ozias ──
// Pure data helpers (NO Express here) so they're easy to unit-test and reuse.
// Mirrors the users.service.js style: every function takes the Prisma client as
// its first argument. Keeping the DB logic here (not in the route) means the
// analyst review route can reuse createNotification() without importing anything
// Express-y — that's how the "closure loop" (story #7) fires the bell badge.

// How many alerts the bell will ever show. The dropdown is a short recent-activity list, not an
// archive — nobody scrolls 300 notifications in a popover. This used to be UNBOUNDED, so the bell's
// poll re-fetched a user's ENTIRE history on every tick and the payload grew forever (one real
// account was already at 65 rows). Bounding it makes the poll cost flat instead of linear in account age.
export const NOTIFICATION_LIMIT = 50;

/**
 * List one user's notifications, newest first (capped at NOTIFICATION_LIMIT).
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {number} userId
 * @returns {Promise<object[]>} raw notification rows (camelCase, straight from Prisma)
 */
export const listNotifications = async (prisma, userId) => {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: NOTIFICATION_LIMIT,
  });
}

/**
 * Count one user's UNREAD notifications. Separate from the list because the list is capped: deriving
 * the badge number from a truncated page would under-report it (51 unread would render as "50").
 * This is a cheap indexed COUNT, not a second scan.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {number} userId
 * @returns {Promise<number>}
 */
export const countUnreadNotifications = async (prisma, userId) => {
  return prisma.notification.count({ where: { userId, isRead: false } });
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
export const markNotificationRead = async (prisma, { id, userId }) => {
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
 * Mark ALL of a user's unread notifications read, in ONE query. This exists because the bell's
 * "mark all read" used to PATCH each visible id one-by-one — which, now that the list is capped at
 * NOTIFICATION_LIMIT, could only ever clear the newest 50. A user who accumulated more unread than
 * the cap had older rows that fell outside the window and could NEVER be cleared from the UI. A
 * single scoped updateMany clears every unread row regardless of what the display page showed.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {number} userId
 * @returns {Promise<number>} how many rows were flipped to read
 */
export const markAllNotificationsRead = async (prisma, userId) => {
  const { count } = await prisma.notification.updateMany({
    where: { userId, isRead: false },   // scoped to the caller; only touches still-unread rows
    data: { isRead: true },
  });
  return count;
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
export const createNotification = async (
  prisma,
  { userId, message, type = "verdict_confirmed", indicatorId = null }
) => {
  if (!userId) throw new Error("createNotification: userId is required");
  if (!message) throw new Error("createNotification: message is required");

  return prisma.notification.create({
    data: { userId, message, type, indicatorId },
  });
}
