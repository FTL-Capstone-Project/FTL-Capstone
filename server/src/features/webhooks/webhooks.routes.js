// ── feature: webhooks · owner: Michael (clerk) / Ozias (inbound-email) ──
// POST /api/webhooks/clerk — sync user/org mirror rows.
// POST /api/webhooks/inbound-email — Azure Orbo-inbox → create a submission. §6.
import { Router } from "express";
// import { prisma } from "../../db.js";

export const webhooksRouter = Router();

webhooksRouter.post("/clerk", async (req, res) => {
  // TODO(Michael): verify Clerk signature (CLERK_WEBHOOK_SECRET); upsert/delete mirror rows.
  return res.status(200).end();
});

webhooksRouter.post("/inbound-email", async (req, res) => {
  // TODO(Ozias): match `from` → user by email; extract links; create submission (source=email).
  return res.status(202).json({ status: "accepted" });
});
