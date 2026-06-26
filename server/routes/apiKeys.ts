import { Router } from "express";
import { webcrypto } from "crypto";
import { db } from "../db";
import { apiKeys, agents } from "../../shared/schema";
import { eq, and } from "drizzle-orm";
import { isAuthenticated } from "../replit_integrations/auth/replitAuth";

const { getRandomValues } = webcrypto;

const router = Router();

// Helper: get user's org (they must be a member)
async function getUserOrgId(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ orgId: agents.organizationId })
    .from(agents)
    .where(eq(agents.userId, userId))
    .limit(1);
  return row?.orgId ?? null;
}

// GET /api/api-keys
router.get("/", isAuthenticated, async (req: any, res) => {
  try {
    const orgId = await getUserOrgId(req.user.claims.sub);
    if (!orgId) return res.json([]);

    const keys = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.organizationId, orgId))
      .orderBy(apiKeys.createdAt);

    res.json(keys);
  } catch (err) {
    console.error("GET /api/api-keys error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/api-keys
router.post("/", isAuthenticated, async (req: any, res) => {
  try {
    const orgId = await getUserOrgId(req.user.claims.sub);
    if (!orgId) return res.status(403).json({ error: "No organization found" });

    const { name, role } = req.body;
    if (!name) return res.status(400).json({ error: "name is required" });

    const key = "mh_" + Buffer.from(getRandomValues(new Uint8Array(24))).toString("hex");

    const [created] = await db
      .insert(apiKeys)
      .values({ organizationId: orgId, name, role: role || "member", key })
      .returning();

    res.status(201).json(created);
  } catch (err: any) {
    console.error("POST /api/api-keys error:", err);
    if (err.code === "23505") return res.status(409).json({ error: "Key already exists" });
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/api-keys/:id
router.delete("/:id", isAuthenticated, async (req: any, res) => {
  try {
    const orgId = await getUserOrgId(req.user.claims.sub);
    if (!orgId) return res.status(403).json({ error: "No organization found" });

    await db
      .delete(apiKeys)
      .where(and(eq(apiKeys.id, req.params.id), eq(apiKeys.organizationId, orgId)));

    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/api-keys error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
