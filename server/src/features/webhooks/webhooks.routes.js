// ── feature: webhooks · owner: Michael (clerk) / Ozias (inbound-email) ──
// POST /api/webhooks/clerk         — sync user/org mirror rows (svix-verified). §6
// POST /api/webhooks/inbound-email — Orbo-inbox → create a submission. §6 (Ozias)
//
// NOTE: the Clerk route needs the RAW request body for svix signature verification,
// so index.js mounts express.raw() for this path BEFORE the global express.json().
import { Router } from "express";
import { Webhook } from "svix";
import { prisma } from "../../db.js";
import { env } from "../../config/env.js";
import { mapClerkEvent } from "./clerkEvents.js";
import { applyClerkEvent } from "../users/users.service.js";

export const webhooksRouter = Router();

webhooksRouter.post("/clerk", async (req, res, next) => {
  try {
    if (!env.clerk.webhookSecret) {
      // Not configured yet — refuse rather than trusting unverified events.
      return res.status(503).json({ error: "Webhook secret not configured" });
    }

    // req.body is a Buffer here (express.raw). Verify the svix signature.
    const payload = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : JSON.stringify(req.body);
    const wh = new Webhook(env.clerk.webhookSecret);
    let event;
    try {
      event = wh.verify(payload, {
        "svix-id": req.header("svix-id"),
        "svix-timestamp": req.header("svix-timestamp"),
        "svix-signature": req.header("svix-signature"),
      });
    } catch {
      return res.status(400).json({ error: "Invalid signature" });
    }

    const mapped = mapClerkEvent(event);
    const result = await applyClerkEvent(prisma, mapped);
    return res.status(200).json({ ok: true, result });
  } catch (err) {
    return next(err);
  }
});

webhooksRouter.post("/inbound-email", async (req, res) => {
  // TODO(Ozias): match `from` → user by email; extract links; create submission (source=email).
  return res.status(202).json({ status: "accepted" });
});
