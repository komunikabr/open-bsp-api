import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Hono } from "@hono/hono";
import { cors } from "jsr:@hono/hono/cors";
import { HTTPException } from "jsr:@hono/hono/http-exception";
import { createClient as createClientBase } from "@supabase/supabase-js";

// Service-role client — bypasses RLS entirely
function adminClient() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClientBase(url, key, { auth: { persistSession: false } });
}

const app = new Hono();

app.use("*", cors());

// ── Auth middleware: JWT must belong to a platform_admin ──────────────────────
app.use("*", async (c, next) => {
  const token = c.req.header("Authorization")?.replace("Bearer ", "");
  if (!token) throw new HTTPException(401, { message: "Missing authorization" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Verify JWT and get user
  const userSupa = createClientBase(url, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user } } = await userSupa.auth.getUser();
  if (!user) throw new HTTPException(401, { message: "Invalid token" });

  // Check platform_admins table
  const supa = adminClient();
  const { data: admin } = await supa
    .from("platform_admins")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!admin) throw new HTTPException(403, { message: "Not a platform admin" });

  c.set("supa", supa);
  await next();
});

// ── GET /billing-admin/stats ─────────────────────────────────────────────────
app.get("/billing-admin/stats", async (c) => {
  const supa = c.get("supa") as ReturnType<typeof adminClient>;
  const { data, error } = await supa.rpc("billing_admin_stats");
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json(data);
});

// ── GET /billing-admin/orgs ──────────────────────────────────────────────────
app.get("/billing-admin/orgs", async (c) => {
  const supa = c.get("supa") as ReturnType<typeof adminClient>;
  const search = c.req.query("q") ?? "";
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50"), 200);

  let q = supa
    .from("organizations")
    .select(`
      id, name, created_at,
      subscription:billing_subscriptions_view!inner (
        tier_id, plan_id,
        tier:billing.tiers(id, name, level),
        plan:billing.plans(id, price, billing_cycle)
      )
    `)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (search) q = q.ilike("name", `%${search}%`);

  // Simpler query without view
  const { data: orgs, error: orgErr } = await supa
    .from("organizations")
    .select("id, name, created_at")
    .ilike("name", search ? `%${search}%` : "%")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (orgErr) throw new HTTPException(500, { message: orgErr.message });

  // Get subscriptions for these orgs
  const orgIds = (orgs ?? []).map(o => o.id);
  const { data: subs } = await supa
    .schema("billing")
    .from("subscriptions")
    .select(`
      organization_id, current_period_end,
      tier:tiers(id, name, level),
      plan:plans(id, price, billing_cycle)
    `)
    .in("organization_id", orgIds);

  const subMap = Object.fromEntries((subs ?? []).map(s => [s.organization_id, s]));

  return c.json((orgs ?? []).map(o => ({ ...o, subscription: subMap[o.id] ?? null })));
});

// ── GET /billing-admin/orgs/:id ──────────────────────────────────────────────
app.get("/billing-admin/orgs/:id", async (c) => {
  const supa = c.get("supa") as ReturnType<typeof adminClient>;
  const id = c.req.param("id");

  const [{ data: org }, { data: sub }, { data: usage }, { data: invoices }] = await Promise.all([
    supa.from("organizations").select("id, name, created_at").eq("id", id).maybeSingle(),
    supa.schema("billing").from("subscriptions")
      .select("organization_id, current_period_start, current_period_end, tier:tiers(id,name,level), plan:plans(id,price,billing_cycle)")
      .eq("organization_id", id).maybeSingle(),
    supa.schema("billing").from("usage")
      .select("product_id, interval, period, quantity")
      .eq("organization_id", id)
      .eq("interval", "month")
      .order("period", { ascending: false })
      .limit(12),
    supa.schema("billing").from("invoices")
      .select("id, period_start, period_end, status, subtotal, created_at")
      .eq("organization_id", id)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  if (!org) throw new HTTPException(404, { message: "Org not found" });
  return c.json({ org, subscription: sub, usage, invoices });
});

// ── POST /billing-admin/orgs/:id/change-plan ─────────────────────────────────
app.post("/billing-admin/orgs/:id/change-plan", async (c) => {
  const supa = c.get("supa") as ReturnType<typeof adminClient>;
  const id = c.req.param("id");
  const { plan_id } = await c.req.json();
  if (!plan_id) throw new HTTPException(400, { message: "Missing plan_id" });

  const { error } = await supa.rpc("billing_change_plan", {
    _organization_id: id,
    _plan_id: plan_id,
  });
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json({ ok: true });
});

// ── PRODUCTS ──────────────────────────────────────────────────────────────────
app.get("/billing-admin/products", async (c) => {
  const supa = c.get("supa") as ReturnType<typeof adminClient>;
  const { data, error } = await supa.schema("billing").from("products")
    .select("*").order("id");
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json(data);
});

app.post("/billing-admin/products", async (c) => {
  const supa = c.get("supa") as ReturnType<typeof adminClient>;
  const body = await c.req.json();
  const { data, error } = await supa.schema("billing").from("products")
    .insert(body).select().single();
  if (error) throw new HTTPException(400, { message: error.message });
  return c.json(data, 201);
});

app.put("/billing-admin/products/:id", async (c) => {
  const supa = c.get("supa") as ReturnType<typeof adminClient>;
  const id = c.req.param("id");
  const body = await c.req.json();
  const { data, error } = await supa.schema("billing").from("products")
    .update(body).eq("id", id).select().single();
  if (error) throw new HTTPException(400, { message: error.message });
  return c.json(data);
});

app.delete("/billing-admin/products/:id", async (c) => {
  const supa = c.get("supa") as ReturnType<typeof adminClient>;
  const { error } = await supa.schema("billing").from("products")
    .delete().eq("id", c.req.param("id"));
  if (error) throw new HTTPException(400, { message: error.message });
  return c.json({ ok: true });
});

// ── TIERS ─────────────────────────────────────────────────────────────────────
app.get("/billing-admin/tiers", async (c) => {
  const supa = c.get("supa") as ReturnType<typeof adminClient>;
  const { data, error } = await supa.schema("billing").from("tiers")
    .select("*, tiers_products(*)").order("level");
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json(data);
});

app.post("/billing-admin/tiers", async (c) => {
  const supa = c.get("supa") as ReturnType<typeof adminClient>;
  const { products: prods, ...body } = await c.req.json();
  const { data: tier, error } = await supa.schema("billing").from("tiers")
    .insert(body).select().single();
  if (error) throw new HTTPException(400, { message: error.message });
  if (prods?.length) {
    await supa.schema("billing").from("tiers_products")
      .insert(prods.map((p: Record<string, unknown>) => ({ ...p, tier_id: tier.id })));
  }
  return c.json(tier, 201);
});

app.put("/billing-admin/tiers/:id", async (c) => {
  const supa = c.get("supa") as ReturnType<typeof adminClient>;
  const id = c.req.param("id");
  const { products: prods, ...body } = await c.req.json();
  const { data, error } = await supa.schema("billing").from("tiers")
    .update(body).eq("id", id).select().single();
  if (error) throw new HTTPException(400, { message: error.message });
  if (prods !== undefined) {
    await supa.schema("billing").from("tiers_products").delete().eq("tier_id", id);
    if (prods.length) {
      await supa.schema("billing").from("tiers_products")
        .insert(prods.map((p: Record<string, unknown>) => ({ ...p, tier_id: id })));
    }
  }
  return c.json(data);
});

app.delete("/billing-admin/tiers/:id", async (c) => {
  const supa = c.get("supa") as ReturnType<typeof adminClient>;
  const { error } = await supa.schema("billing").from("tiers")
    .delete().eq("id", c.req.param("id"));
  if (error) throw new HTTPException(400, { message: error.message });
  return c.json({ ok: true });
});

// ── PLANS ─────────────────────────────────────────────────────────────────────
app.get("/billing-admin/plans", async (c) => {
  const supa = c.get("supa") as ReturnType<typeof adminClient>;
  const { data, error } = await supa.schema("billing").from("plans")
    .select("*, plans_products(*)").order("min_tier");
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json(data);
});

app.post("/billing-admin/plans", async (c) => {
  const supa = c.get("supa") as ReturnType<typeof adminClient>;
  const { products: prods, ...body } = await c.req.json();
  const { data: plan, error } = await supa.schema("billing").from("plans")
    .insert(body).select().single();
  if (error) throw new HTTPException(400, { message: error.message });
  if (prods?.length) {
    await supa.schema("billing").from("plans_products")
      .insert(prods.map((p: Record<string, unknown>) => ({ ...p, plan_id: plan.id })));
  }
  return c.json(plan, 201);
});

app.put("/billing-admin/plans/:id", async (c) => {
  const supa = c.get("supa") as ReturnType<typeof adminClient>;
  const id = c.req.param("id");
  const { products: prods, ...body } = await c.req.json();
  const { data, error } = await supa.schema("billing").from("plans")
    .update(body).eq("id", id).select().single();
  if (error) throw new HTTPException(400, { message: error.message });
  if (prods !== undefined) {
    await supa.schema("billing").from("plans_products").delete().eq("plan_id", id);
    if (prods.length) {
      await supa.schema("billing").from("plans_products")
        .insert(prods.map((p: Record<string, unknown>) => ({ ...p, plan_id: id })));
    }
  }
  return c.json(data);
});

app.delete("/billing-admin/plans/:id", async (c) => {
  const supa = c.get("supa") as ReturnType<typeof adminClient>;
  const { error } = await supa.schema("billing").from("plans")
    .delete().eq("id", c.req.param("id"));
  if (error) throw new HTTPException(400, { message: error.message });
  return c.json({ ok: true });
});

// ── PLATFORM ADMINS ──────────────────────────────────────────────────────────
app.get("/billing-admin/admins", async (c) => {
  const supa = c.get("supa") as ReturnType<typeof adminClient>;
  const { data, error } = await supa.from("platform_admins")
    .select("id, email, user_id, created_at").order("created_at");
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json(data);
});

app.post("/billing-admin/admins", async (c) => {
  const supa = c.get("supa") as ReturnType<typeof adminClient>;
  const { email } = await c.req.json();
  if (!email) throw new HTTPException(400, { message: "Missing email" });

  // Try to find existing user
  const { data: users } = await supa.auth.admin.listUsers();
  const user = users?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());

  const { data, error } = await supa.from("platform_admins")
    .insert({ email: email.toLowerCase(), user_id: user?.id ?? null })
    .select().single();
  if (error) throw new HTTPException(400, { message: error.message });
  return c.json(data, 201);
});

app.delete("/billing-admin/admins/:id", async (c) => {
  const supa = c.get("supa") as ReturnType<typeof adminClient>;
  const { error } = await supa.from("platform_admins")
    .delete().eq("id", c.req.param("id"));
  if (error) throw new HTTPException(400, { message: error.message });
  return c.json({ ok: true });
});

// ── INVOICES (list all) ───────────────────────────────────────────────────────
app.get("/billing-admin/invoices", async (c) => {
  const supa = c.get("supa") as ReturnType<typeof adminClient>;
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50"), 200);
  const { data, error } = await supa.schema("billing").from("invoices")
    .select("id, organization_id, period_start, period_end, status, subtotal, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json(data);
});

// ── POST /billing-admin/invoices/generate ─────────────────────────────────────
// Triggers billing-invoicer for all orgs
app.post("/billing-admin/invoices/generate", async (c) => {
  const supa = c.get("supa") as ReturnType<typeof adminClient>;
  const body = await c.req.json().catch(() => ({}));
  const month = body.month ?? new Date().toISOString().slice(0, 7); // YYYY-MM

  const supaUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const res = await fetch(`${supaUrl}/functions/v1/billing-invoicer`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ month }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new HTTPException(500, { message: `Invoicer error: ${err}` });
  }

  const result = await res.json();
  return c.json(result);
});

export default app;
