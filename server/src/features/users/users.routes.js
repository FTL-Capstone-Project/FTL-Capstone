// ── feature: users · owner: David ──
// Account-scoped endpoints for the signed-in user. Currently: browser-extension API key mgmt.
//   POST   /api/users/api-key  — generate/rotate the key (returns the raw key ONCE)
//   DELETE /api/users/api-key  — revoke the key
//   GET    /api/users/api-key  — whether a key currently exists (never returns the key itself)
//
// These require a real Clerk session (requireAuth) — you mint your extension key from the
// logged-in web app, not from the extension. An API-key-authed request could technically hit
// these too, but that's fine: rotating from the extension still just overwrites your own key.
import { Router } from "express";
import { prisma } from "../../db.js";
import { requireAuth } from "../../middleware/auth.js";
import { issueApiKey, revokeApiKey } from "../../services/apiKey.js";

export const usersRouter = Router();

// Generate or rotate. The raw key is returned EXACTLY here and never again — the client shows it
// once for the user to copy into the extension. Rotating invalidates any previous key immediately.
usersRouter.post("/api-key", requireAuth, async (req, res) => {
  try {
    const apiKey = await issueApiKey(prisma, req.user.id);
    return res.status(201).json({ apiKey });
  } catch (e) {
    console.error("[users] issue api key failed:", e.message);
    return res.status(500).json({ error: "Couldn't generate a key just now." });
  }
});

// Revoke — the extension can no longer authenticate until a new key is issued.
usersRouter.delete("/api-key", requireAuth, async (req, res) => {
  try {
    await revokeApiKey(prisma, req.user.id);
    return res.status(204).end();
  } catch (e) {
    console.error("[users] revoke api key failed:", e.message);
    return res.status(500).json({ error: "Couldn't revoke the key just now." });
  }
});

// Status only — does the user have a key? Never leaks the key or its hash.
usersRouter.get("/api-key", requireAuth, async (req, res) => {
  try {
    const u = await prisma.user.findUnique({ where: { id: req.user.id }, select: { apiKeyHash: true } });
    return res.json({ hasKey: Boolean(u?.apiKeyHash) });
  } catch (e) {
    console.error("[users] api key status failed:", e.message);
    return res.status(500).json({ error: "Couldn't check key status." });
  }
});
