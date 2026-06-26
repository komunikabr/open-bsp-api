import { Router } from "express";
import { db } from "../db";
import { organizationsAddresses, agents } from "../../shared/schema";
import { eq } from "drizzle-orm";
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

// GET /api/accounts — count of org addresses
router.get("/", isAuthenticated, async (req: any, res) => {
  try {
    const orgId = await getUserOrgId(req.user.claims.sub);
    if (!orgId) return res.json([]);

    const rows = await db
      .select()
      .from(organizationsAddresses)
      .where(eq(organizationsAddresses.organizationId, orgId));

    res.json(rows);
  } catch (err) {
    console.error("GET /api/accounts error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
