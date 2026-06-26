import {
  pgTable, pgSchema, uuid, text, jsonb, boolean, numeric, date,
  timestamp, index, unique, varchar, char, primaryKey,
  customType
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ── Custom enum helper ─────────────────────────────────────────────────────
const pgEnum = (name: string, values: [string, ...string[]]) =>
  customType<{ data: string }>({
    dataType() { return name; },
  });

// ── Schemas ────────────────────────────────────────────────────────────────
export const billingSchema = pgSchema("billing");

// ── Public tables ──────────────────────────────────────────────────────────

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  extra: jsonb("extra"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const organizationsAddresses = pgTable("organizations_addresses", {
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  service: text("service").notNull(),
  address: text("address").notNull(),
  extra: jsonb("extra"),
  status: text("status").default("connected").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  primaryKey({ columns: [t.organizationId, t.address] }),
]);

export const contacts = pgTable("contacts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name"),
  extra: jsonb("extra"),
  status: text("status").default("active").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("contacts_organization_id_idx").on(t.organizationId),
]);

export const contactsAddresses = pgTable("contacts_addresses", {
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  service: text("service").notNull(),
  address: text("address").notNull(),
  extra: jsonb("extra"),
  status: text("status").default("active").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  primaryKey({ columns: [t.organizationId, t.address] }),
  index("contacts_addresses_contact_id_idx").on(t.contactId),
]);

export const agents = pgTable("agents", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: text("user_id"),
  name: text("name").notNull(),
  picture: text("picture"),
  ai: boolean("ai").notNull(),
  extra: jsonb("extra"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("agents_user_id_idx").on(t.userId),
  unique("agents_organization_id_user_id_key").on(t.organizationId, t.userId),
]);

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  service: text("service").notNull(),
  organizationAddress: text("organization_address").notNull(),
  contactAddress: text("contact_address"),
  groupAddress: text("group_address"),
  name: text("name"),
  extra: jsonb("extra"),
  status: text("status").default("active").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("conversations_organization_id_idx").on(t.organizationId),
  index("conversations_updated_at_idx").on(t.updatedAt),
  index("conversations_organization_address_idx").on(t.organizationAddress),
  index("conversations_contact_address_idx").on(t.contactAddress),
]);

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  externalId: text("external_id").unique(),
  direction: text("direction").notNull(),
  agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
  contactAddress: text("contact_address"),
  service: text("service").notNull(),
  organizationAddress: text("organization_address").notNull(),
  groupAddress: text("group_address"),
  content: jsonb("content").notNull(),
  status: jsonb("status").default(sql`jsonb_build_object('pending', now())`).notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("messages_organization_id_idx").on(t.organizationId),
  index("messages_conversation_id_idx").on(t.conversationId),
  index("messages_timestamp_idx").on(t.timestamp),
]);

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  role: text("role").default("member").notNull(),
  name: text("name").notNull(),
  key: text("key").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("api_keys_organization_idx").on(t.organizationId),
]);

export const webhooks = pgTable("webhooks", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  tableName: text("table_name").notNull(),
  operations: text("operations").array().notNull(),
  url: varchar("url").notNull(),
  token: varchar("token"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("webhooks_organization_idx").on(t.organizationId),
]);

export const quickReplies = pgTable("quick_replies", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("quick_replies_organization_idx").on(t.organizationId),
]);

export const logs = pgTable("logs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  organizationAddress: text("organization_address"),
  level: text("level").notNull(),
  category: text("category").notNull(),
  message: text("message").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_logs_organization_id_address").on(t.organizationId, t.organizationAddress),
  index("idx_logs_created_at").on(t.createdAt),
]);

export const onboardingTokens = pgTable("onboarding_tokens", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  status: text("status").default("active").notNull(),
});

// ── Billing schema tables ──────────────────────────────────────────────────

export const billingProducts = billingSchema.table("products", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  unit: text("unit").notNull(),
  kind: text("kind").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const billingTiers = billingSchema.table("tiers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  level: numeric("level").default("0").notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const billingTiersProducts = billingSchema.table("tiers_products", {
  tierId: text("tier_id").notNull().references(() => billingTiers.id, { onDelete: "cascade" }),
  productId: text("product_id").notNull().references(() => billingProducts.id, { onDelete: "cascade" }),
  interval: text("interval").notNull(),
  cap: numeric("cap"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  primaryKey({ columns: [t.tierId, t.productId] }),
]);

export const billingPlans = billingSchema.table("plans", {
  id: text("id").primaryKey(),
  minTier: numeric("min_tier").notNull(),
  price: numeric("price").notNull(),
  billingCycle: text("billing_cycle"),
  isDefault: boolean("is_default").default(false).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const billingPlansProducts = billingSchema.table("plans_products", {
  planId: text("plan_id").notNull().references(() => billingPlans.id, { onDelete: "cascade" }),
  productId: text("product_id").notNull().references(() => billingProducts.id, { onDelete: "cascade" }),
  interval: text("interval").notNull(),
  included: numeric("included"),
  unitPrice: numeric("unit_price"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  primaryKey({ columns: [t.planId, t.productId] }),
]);

export const billingAccounts = billingSchema.table("accounts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const billingSubscriptions = billingSchema.table("subscriptions", {
  organizationId: uuid("organization_id").primaryKey().references(() => organizations.id, { onDelete: "cascade" }),
  tierId: text("tier_id").notNull().references(() => billingTiers.id),
  planId: text("plan_id").references(() => billingPlans.id),
  accountId: uuid("account_id").references(() => billingAccounts.id),
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const billingUsage = billingSchema.table("usage", {
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  productId: text("product_id").notNull().references(() => billingProducts.id, { onDelete: "cascade" }),
  interval: text("interval").default("lifetime").notNull(),
  period: date("period").default("1970-01-01").notNull(),
  quantity: numeric("quantity").default("0").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  primaryKey({ columns: [t.organizationId, t.productId, t.interval, t.period] }),
]);

export const billingLedger = billingSchema.table("ledger", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  productId: text("product_id").notNull().references(() => billingProducts.id),
  type: text("type").notNull(),
  quantity: numeric("quantity").notNull(),
  agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
  messageId: uuid("message_id").references(() => messages.id, { onDelete: "set null" }),
  provider: text("provider"),
  model: text("model"),
  metadata: jsonb("metadata"),
  billable: boolean("billable"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("ledger_organization_id_idx").on(t.organizationId),
  index("ledger_created_at_idx").on(t.createdAt),
]);

export const billingInvoices = billingSchema.table("invoices", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  periodStart: timestamp("period_start", { withTimezone: true }),
  periodEnd: timestamp("period_end", { withTimezone: true }),
  status: text("status").default("draft").notNull(),
  subtotal: numeric("subtotal").default("0").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("invoices_organization_id_idx").on(t.organizationId),
]);

export const billingInvoicesItems = billingSchema.table("invoices_items", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: uuid("invoice_id").notNull().references(() => billingInvoices.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  planId: text("plan_id").references(() => billingPlans.id),
  productId: text("product_id").references(() => billingProducts.id),
  ledgerId: uuid("ledger_id").references(() => billingLedger.id),
  quantity: numeric("quantity").notNull(),
  unitPrice: numeric("unit_price").notNull(),
  amount: numeric("amount").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("invoices_items_invoice_id_idx").on(t.invoiceId),
]);

export const billingPayments = billingSchema.table("payments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: uuid("invoice_id").notNull().references(() => billingInvoices.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  accountId: uuid("account_id").references(() => billingAccounts.id),
  amount: numeric("amount").notNull(),
  method: text("method"),
  status: text("status").default("pending").notNull(),
  externalId: text("external_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("payments_invoice_id_idx").on(t.invoiceId),
  index("payments_organization_id_idx").on(t.organizationId),
]);

export const billingCosts = billingSchema.table("costs", {
  provider: text("provider").notNull(),
  product: text("product").notNull(),
  effectiveAt: timestamp("effective_at", { withTimezone: true }).defaultNow().notNull(),
  quantity: numeric("quantity").notNull(),
  unit: text("unit").notNull(),
  pricing: jsonb("pricing").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  primaryKey({ columns: [t.provider, t.product, t.effectiveAt] }),
]);

// ── Type exports ───────────────────────────────────────────────────────────
export type Organization = typeof organizations.$inferSelect;
export type InsertOrganization = typeof organizations.$inferInsert;
export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = typeof apiKeys.$inferInsert;
export type Webhook = typeof webhooks.$inferSelect;
export type InsertWebhook = typeof webhooks.$inferInsert;
export type Agent = typeof agents.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
