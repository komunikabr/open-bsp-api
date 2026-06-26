import { Router } from "express";
import { db } from "../db";
import { organizations, agents } from "../../shared/schema";
import { eq } from "drizzle-orm";
import { isAuthenticated } from "../replit_integrations/auth/replitAuth";

const router = Router();

// Get the user's organization (first one they belong to as owner)
router.get("/", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    const result = await db
      .select({ org: organizations })
      .from(organizations)
      .innerJoin(agents, eq(agents.organizationId, organizations.id))
      .where(eq(agents.userId, userId))
      .limit(1);

    if (!result.length) {
      return res.json([]);
    }
    res.json([result[0].org]);
  } catch (err) {
    console.error("GET /api/organizations error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create a new organization
router.post("/", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    const { name, extra } = req.body;
    if (!name) return res.status(400).json({ error: "name is required" });

    const [org] = await db
      .insert(organizations)
      .values({ name, extra: extra ?? { response_delay_seconds: 0 } })
      .returning();

    // Create the owner agent record
    await db.insert(agents).values({
      organizationId: org.id,
      userId,
      name: req.user.claims.first_name || req.user.claims.email?.split("@")[0] || "Owner",
      ai: false,
      extra: { role: "owner" },
    });

    // Initialize billing subscription for the new org
    await initializeSubscription(org.id);

    res.status(201).json(org);
  } catch (err) {
    console.error("POST /api/organizations error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

async function initializeSubscription(orgId: string) {
  try {
    const { billingTiers, billingSubscriptions, billingPlans, billingPlansProducts, billingProducts, billingLedger } = await import("../../shared/schema");

    // Find lowest tier
    const [tier] = await db
      .select()
      .from(billingTiers)
      .where(eq(billingTiers.active, true))
      .orderBy(billingTiers.level)
      .limit(1);

    if (!tier) return;

    await db.insert(billingSubscriptions).values({
      organizationId: orgId,
      tierId: tier.id,
    }).onConflictDoNothing();

    // Find default plan
    const [plan] = await db
      .select()
      .from(billingPlans)
      .where(eq(billingPlans.isDefault, true))
      .limit(1);

    if (!plan) return;

    // Update subscription with plan
    await db.update(billingSubscriptions)
      .set({ planId: plan.id, currentPeriodStart: new Date() })
      .where(eq(billingSubscriptions.organizationId, orgId));

    // Grant balance products
    const pp = await db
      .select({ productId: billingPlansProducts.productId, included: billingPlansProducts.included })
      .from(billingPlansProducts)
      .innerJoin(billingProducts, eq(billingProducts.id, billingPlansProducts.productId))
      .where(eq(billingPlansProducts.planId, plan.id));

    for (const row of pp) {
      if (row.included && parseFloat(String(row.included)) > 0) {
        await db.insert(billingLedger).values({
          organizationId: orgId,
          productId: row.productId,
          type: "grant",
          quantity: row.included,
        });
      }
    }
  } catch (err) {
    console.error("initializeSubscription error:", err);
  }
}

export default router;
