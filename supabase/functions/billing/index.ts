import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Hono } from "@hono/hono";
import { cors } from "jsr:@hono/hono/cors";
import { HTTPException } from "jsr:@hono/hono/http-exception";
import { createClient, createApiClient } from "../_shared/supabase_client.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

type AppEnv = {
  Variables: {
    supabase: ReturnType<typeof createClient>;
    org_id: string;
  };
};

const app = new Hono<AppEnv>();

app.use("*", cors());

// Auth middleware: accepts JWT (Bearer <jwt>) or API Key (Bearer <api-key>)
app.use("*", async (c, next) => {
  const token = c.req.header("Authorization")?.replace("Bearer ", "");
  if (!token) throw new HTTPException(401, { message: "Missing authorization token" });

  // Try JWT first
  let supa = createClient(c.req.raw);
  let { data: { user } } = await supa.auth.getUser();

  if (user) {
    // Get org from agents table
    const orgId = c.req.header("x-organization-id");
    if (!orgId) throw new HTTPException(400, { message: "Missing x-organization-id header" });
    c.set("supabase", supa);
    c.set("org_id", orgId);
    await next();
    return;
  }

  // Fallback: API Key
  supa = createApiClient(c.req.raw);
  const { data: keyRow } = await supa
    .from("api_keys")
    .select("organization_id")
    .eq("key", token)
    .maybeSingle();

  if (!keyRow) throw new HTTPException(401, { message: "Invalid token" });

  c.set("supabase", supa);
  c.set("org_id", keyRow.organization_id);
  await next();
});

// ── GET /billing/subscription ─────────────────────────────────────────────────
// Returns the org's current subscription with tier and plan details
app.get("/billing/subscription", async (c) => {
  const supa = c.get("supabase");
  const org_id = c.get("org_id");

  const { data, error } = await supa
    .schema("billing")
    .from("subscriptions")
    .select(`
      organization_id,
      current_period_start,
      current_period_end,
      tier:tiers ( id, name, level ),
      plan:plans ( id, min_tier, price, billing_cycle )
    `)
    .eq("organization_id", org_id)
    .maybeSingle();

  if (error) throw new HTTPException(500, { message: error.message });
  return c.json(data);
});

// ── GET /billing/usage ────────────────────────────────────────────────────────
// Returns current usage for the org, grouped by product
app.get("/billing/usage", async (c) => {
  const supa = c.get("supabase");
  const org_id = c.get("org_id");
  const interval = c.req.query("interval") ?? "month";

  const { data: usage, error: uErr } = await supa
    .schema("billing")
    .from("usage")
    .select("product_id, interval, period, quantity")
    .eq("organization_id", org_id)
    .eq("interval", interval)
    .order("period", { ascending: false });

  if (uErr) throw new HTTPException(500, { message: uErr.message });

  // Also fetch plan limits for this org
  const { data: sub } = await supa
    .schema("billing")
    .from("subscriptions")
    .select("tier_id, plan_id")
    .eq("organization_id", org_id)
    .maybeSingle();

  let limits: Record<string, { cap: number | null; interval: string }> = {};
  if (sub?.tier_id) {
    const { data: caps } = await supa
      .schema("billing")
      .from("tiers_products")
      .select("product_id, cap, interval")
      .eq("tier_id", sub.tier_id);
    if (caps) {
      for (const r of caps) limits[r.product_id] = { cap: r.cap, interval: r.interval };
    }
  }

  let included: Record<string, { quantity: number | null; unit_price: number | null }> = {};
  if (sub?.plan_id) {
    const { data: pp } = await supa
      .schema("billing")
      .from("plans_products")
      .select("product_id, included, unit_price")
      .eq("plan_id", sub.plan_id);
    if (pp) {
      for (const r of pp) included[r.product_id] = { quantity: r.included, unit_price: r.unit_price };
    }
  }

  return c.json({ usage, limits, included });
});

// ── GET /billing/plans ────────────────────────────────────────────────────────
// Returns all available plans with their products
app.get("/billing/plans", async (c) => {
  const supa = c.get("supabase");

  const { data: plans, error } = await supa
    .schema("billing")
    .from("plans")
    .select(`
      id, min_tier, price, billing_cycle, is_default, active,
      plans_products ( product_id, interval, included, unit_price )
    `)
    .eq("active", true)
    .order("min_tier");

  if (error) throw new HTTPException(500, { message: error.message });

  const { data: tiers } = await supa
    .schema("billing")
    .from("tiers")
    .select("id, name, level")
    .eq("active", true)
    .order("level");

  const { data: products } = await supa
    .schema("billing")
    .from("products")
    .select("id, name, unit, kind");

  return c.json({ plans, tiers, products });
});

// ── GET /billing/invoices ─────────────────────────────────────────────────────
// Returns invoices for the org (owners only via RLS)
app.get("/billing/invoices", async (c) => {
  const supa = c.get("supabase");
  const org_id = c.get("org_id");

  const { data, error } = await supa
    .schema("billing")
    .from("invoices")
    .select(`
      id, period_start, period_end, status, subtotal, created_at,
      invoices_items ( id, type, plan_id, product_id, quantity, unit_price, amount )
    `)
    .eq("organization_id", org_id)
    .order("created_at", { ascending: false });

  if (error) throw new HTTPException(500, { message: error.message });
  return c.json(data);
});

// ── GET /billing/ledger ───────────────────────────────────────────────────────
// Returns AI credit ledger entries for the org
app.get("/billing/ledger", async (c) => {
  const supa = c.get("supabase");
  const org_id = c.get("org_id");
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50"), 200);

  const { data, error } = await supa
    .schema("billing")
    .from("ledger")
    .select("id, product_id, type, quantity, agent_id, provider, model, metadata, billable, created_at")
    .eq("organization_id", org_id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new HTTPException(500, { message: error.message });
  return c.json(data);
});

// ── POST /billing/change-plan ─────────────────────────────────────────────────
// Changes the org's plan (calls billing.change_plan RPC via service_role)
app.post("/billing/change-plan", async (c) => {
  const supa = c.get("supabase");
  const org_id = c.get("org_id");

  const body = await c.req.json().catch(() => null);
  const plan_id = body?.plan_id;
  if (!plan_id) throw new HTTPException(400, { message: "Missing plan_id" });

  // Verify plan exists and is active
  const { data: plan } = await supa
    .schema("billing")
    .from("plans")
    .select("id, min_tier, price")
    .eq("id", plan_id)
    .eq("active", true)
    .maybeSingle();

  if (!plan) throw new HTTPException(404, { message: "Plan not found or inactive" });

  // Call the billing.change_plan function via service_role
  // We use the Supabase REST RPC endpoint with service_role from env
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/billing_change_plan`, {
    method: "POST",
    headers: {
      "apikey": serviceKey,
      "Authorization": `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ _organization_id: org_id, _plan_id: plan_id }),
  });

  if (!rpcRes.ok) {
    const err = await rpcRes.text();
    throw new HTTPException(500, { message: `Failed to change plan: ${err}` });
  }

  return c.json({ ok: true, plan_id });
});

export default app;
