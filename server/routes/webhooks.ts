import { Router } from "express";
import { db } from "../db";
import { webhooks, agents } from "../../shared/schema";
import { eq, and } from "drizzle-orm";
import { isAuthenticated } from "../replit_integrations/auth/replitAuth";

const router = Router();

async function getUserOrgId(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ orgId: agents.organizationId })
    .from(agents)
    .where(eq(agents.userId, userId))
    .limit(1);
  return row?.orgId ?? null;
}

// GET /api/webhooks
router.get("/", isAuthenticated, async (req: any, res) => {
  try {
    const orgId = await getUserOrgId(req.user.claims.sub);
    if (!orgId) return res.json([]);

    const rows = await db
      .select()
      .from(webhooks)
      .where(eq(webhooks.organizationId, orgId))
      .orderBy(webhooks.createdAt);

    res.json(rows);
  } catch (err) {
    console.error("GET /api/webhooks error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/webhooks
router.post("/", isAuthenticated, async (req: any, res) => {
  try {
    const orgId = await getUserOrgId(req.user.claims.sub);
    if (!orgId) return res.status(403).json({ error: "No organization found" });

    const tableName = req.body.tableName || req.body.table_name;
    const { operations, url, token } = req.body;
    if (!tableName || !operations?.length || !url) {
      return res.status(400).json({ error: "tableName, operations and url are required" });
    }

    const [created] = await db
      .insert(webhooks)
      .values({
        organizationId: orgId,
        tableName,
        operations,
        url,
        token: token || null,
      })
      .returning();

    res.status(201).json(created);
  } catch (err) {
    console.error("POST /api/webhooks error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/webhooks/:id
router.delete("/:id", isAuthenticated, async (req: any, res) => {
  try {
    const orgId = await getUserOrgId(req.user.claims.sub);
    if (!orgId) return res.status(403).json({ error: "No organization found" });

    await db
      .delete(webhooks)
      .where(and(eq(webhooks.id, req.params.id), eq(webhooks.organizationId, orgId)));

    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/webhooks error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
