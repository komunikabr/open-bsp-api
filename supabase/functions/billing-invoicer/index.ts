import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Hono } from "@hono/hono";
import { cors } from "jsr:@hono/hono/cors";
import { HTTPException } from "jsr:@hono/hono/http-exception";
import { createClient as createClientBase } from "@supabase/supabase-js";

function adminClient() {
  return createClientBase(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

const app = new Hono();
app.use("*", cors());

// ── Auth: only service_role or platform_admin ─────────────────────────────────
app.use("*", async (c, next) => {
  const token = c.req.header("Authorization")?.replace("Bearer ", "");
  if (!token) throw new HTTPException(401, { message: "Missing authorization" });

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (token === serviceKey) { await next(); return; }

  // Accept platform admin JWT too
  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userSupa = createClientBase(url, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user } } = await userSupa.auth.getUser();
  if (!user) throw new HTTPException(401, { message: "Invalid token" });

  const supa = adminClient();
  const { data: admin } = await supa.from("platform_admins")
    .select("id").eq("user_id", user.id).maybeSingle();
  if (!admin) throw new HTTPException(403, { message: "Not a platform admin" });

  await next();
});

// ── POST / — generate invoices for a given month ──────────────────────────────
app.post("/billing-invoicer", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const now = new Date();
  const monthStr: string = body.month ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const [year, month] = monthStr.split("-").map(Number);
  const periodStart = new Date(year, month - 1, 1);
  const periodEnd = new Date(year, month, 0, 23, 59, 59);

  const supa = adminClient();

  // Load all active subscriptions
  const { data: subs, error: subErr } = await supa
    .schema("billing").from("subscriptions")
    .select(`
      organization_id, plan_id, tier_id,
      plan:plans(id, price, billing_cycle),
      tier:tiers(id, name)
    `);

  if (subErr) throw new HTTPException(500, { message: subErr.message });

  const { data: products } = await supa.schema("billing").from("products").select("id, unit, kind");
  const productMap = Object.fromEntries((products ?? []).map(p => [p.id, p]));

  const results: { org_id: string; invoice_id: string; subtotal: number }[] = [];
  const errors: { org_id: string; error: string }[] = [];

  for (const sub of subs ?? []) {
    try {
      // Skip orgs with no plan
      if (!sub.plan_id || !sub.plan) continue;

      const plan = sub.plan as { id: string; price: number; billing_cycle: string };

      // Check if invoice already exists for this period
      const { data: existing } = await supa.schema("billing").from("invoices")
        .select("id")
        .eq("organization_id", sub.organization_id)
        .gte("period_start", periodStart.toISOString())
        .lt("period_start", periodEnd.toISOString())
        .maybeSingle();

      if (existing) continue; // Already invoiced

      // Get usage for this org/month
      const { data: usage } = await supa.schema("billing").from("usage")
        .select("product_id, quantity")
        .eq("organization_id", sub.organization_id)
        .eq("interval", "month")
        .eq("period", `${year}-${String(month).padStart(2, "0")}-01`);

      const usageMap = Object.fromEntries((usage ?? []).map(u => [u.product_id, u.quantity]));

      // Get plan inclusions
      const { data: planProds } = await supa.schema("billing").from("plans_products")
        .select("product_id, included, unit_price")
        .eq("plan_id", sub.plan_id);

      // Calculate line items
      const items: {
        type: string;
        plan_id?: string;
        product_id?: string;
        quantity: number;
        unit_price: number;
        amount: number;
      }[] = [];

      // Base plan fee
      if (plan.price > 0) {
        items.push({
          type: "plan",
          plan_id: plan.id,
          quantity: 1,
          unit_price: plan.price,
          amount: plan.price,
        });
      }

      // Overage per product
      for (const pp of planProds ?? []) {
        const used = usageMap[pp.product_id] ?? 0;
        const included = pp.included ?? 0;
        const unitPrice = pp.unit_price ?? 0;

        if (unitPrice > 0 && used > included) {
          const overage = used - included;
          const amount = overage * unitPrice;
          items.push({
            type: "overage",
            product_id: pp.product_id,
            quantity: overage,
            unit_price: unitPrice,
            amount,
          });
        }
      }

      const subtotal = items.reduce((sum, i) => sum + i.amount, 0);

      // Create invoice
      const { data: invoice, error: invErr } = await supa.schema("billing").from("invoices")
        .insert({
          organization_id: sub.organization_id,
          period_start: periodStart.toISOString(),
          period_end: periodEnd.toISOString(),
          status: "issued",
          subtotal,
        })
        .select().single();

      if (invErr) throw new Error(invErr.message);

      // Insert items
      if (items.length > 0) {
        await supa.schema("billing").from("invoices_items")
          .insert(items.map(i => ({ ...i, invoice_id: invoice.id })));
      }

      results.push({ org_id: sub.organization_id, invoice_id: invoice.id, subtotal });
    } catch (e) {
      errors.push({ org_id: sub.organization_id, error: String(e) });
    }
  }

  return c.json({
    month: monthStr,
    generated: results.length,
    skipped: (subs?.length ?? 0) - results.length - errors.length,
    errors: errors.length,
    results,
    ...(errors.length ? { error_detail: errors } : {}),
  });
});

export default app;
