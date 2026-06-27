-- Migration: billing schema
-- Generated from supabase/schemas/06_billing/
-- Apply with: supabase db push --db-url <your-db-url>

-- ── Schema & permissions ──────────────────────────────────────────────────────
create schema if not exists billing;

grant usage on schema billing to anon, authenticated, service_role;
grant select on all tables in schema billing to anon, authenticated, service_role;
grant insert, update on all tables in schema billing to service_role;
alter default privileges in schema billing grant select on tables to anon, authenticated, service_role;
alter default privileges in schema billing grant insert, update on tables to service_role;

alter default privileges in schema billing revoke execute on functions from public;
grant execute on all functions in schema billing to service_role;

-- ── Tables ────────────────────────────────────────────────────────────────────

create table billing.products (
  id text not null,
  name text not null,
  unit text not null,
  kind text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint products_pkey primary key (id),
  constraint products_unit_check check (unit in ('count', 'gb', 'usd')),
  constraint products_kind_check check (kind in ('counter', 'gauge', 'balance'))
);

create table billing.tiers (
  id text not null,
  name text not null,
  level int not null default 0,
  active boolean not null default true,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint tiers_pkey primary key (id)
);

create table billing.tiers_products (
  tier_id text not null,
  product_id text not null,
  interval text not null,
  cap numeric,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint tiers_products_pkey primary key (tier_id, product_id),
  constraint tiers_products_tier_id_fkey foreign key (tier_id) references billing.tiers(id) on delete cascade,
  constraint tiers_products_product_id_fkey foreign key (product_id) references billing.products(id) on delete cascade,
  constraint tiers_products_interval_check check (interval in ('month', 'lifetime'))
);

create table billing.plans (
  id text not null,
  min_tier int not null,
  price numeric not null,
  billing_cycle text,
  is_default boolean not null default false,
  active boolean not null default true,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint plans_pkey primary key (id),
  constraint plans_billing_cycle_check check (billing_cycle in ('month', 'year'))
);

create table billing.plans_products (
  plan_id text not null,
  product_id text not null,
  interval text not null,
  included numeric,
  unit_price numeric,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint plans_products_pkey primary key (plan_id, product_id),
  constraint plans_products_plan_id_fkey foreign key (plan_id) references billing.plans(id) on delete cascade,
  constraint plans_products_product_id_fkey foreign key (product_id) references billing.products(id) on delete cascade,
  constraint plans_products_interval_check check (interval in ('month', 'lifetime'))
);

create table billing.accounts (
  id uuid default gen_random_uuid() not null,
  name text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint accounts_pkey primary key (id)
);

create table billing.subscriptions (
  organization_id uuid not null,
  tier_id text not null,
  plan_id text,
  account_id uuid,
  current_period_start timestamp with time zone,
  current_period_end timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint subscriptions_pkey primary key (organization_id),
  constraint subscriptions_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade,
  constraint subscriptions_tier_id_fkey foreign key (tier_id) references billing.tiers(id),
  constraint subscriptions_plan_id_fkey foreign key (plan_id) references billing.plans(id),
  constraint subscriptions_account_id_fkey foreign key (account_id) references billing.accounts(id)
);

create table billing.usage (
  organization_id uuid not null,
  product_id text not null,
  interval text not null default 'lifetime',
  period date not null default '1970-01-01',
  quantity numeric not null default 0,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint usage_pkey primary key (organization_id, product_id, interval, period),
  constraint usage_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade,
  constraint usage_product_id_fkey foreign key (product_id) references billing.products(id) on delete cascade,
  constraint usage_interval_check check (interval in ('day', 'month', 'lifetime'))
);

create table billing.ledger (
  id uuid default gen_random_uuid() not null,
  organization_id uuid not null,
  product_id text not null,
  type text not null,
  quantity numeric not null,
  agent_id uuid,
  message_id uuid,
  provider text,
  model text,
  metadata jsonb,
  billable boolean,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint ledger_pkey primary key (id),
  constraint ledger_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade,
  constraint ledger_product_id_fkey foreign key (product_id) references billing.products(id),
  constraint ledger_agent_id_fkey foreign key (agent_id) references public.agents(id) on delete set null,
  constraint ledger_message_id_fkey foreign key (message_id) references public.messages(id) on delete set null,
  constraint ledger_type_check check (type in ('grant', 'consumption', 'topup'))
);

create index ledger_organization_id_idx on billing.ledger using btree (organization_id);
create index ledger_created_at_idx on billing.ledger using btree (created_at);

create table billing.invoices (
  id uuid default gen_random_uuid() not null,
  organization_id uuid not null,
  period_start timestamp with time zone,
  period_end timestamp with time zone,
  status text not null default 'draft',
  subtotal numeric not null default 0,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint invoices_pkey primary key (id),
  constraint invoices_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade,
  constraint invoices_status_check check (status in ('draft', 'issued', 'paid', 'void'))
);

create index invoices_organization_id_idx on billing.invoices using btree (organization_id);

create table billing.invoices_items (
  id uuid default gen_random_uuid() not null,
  invoice_id uuid not null,
  type text not null,
  plan_id text,
  product_id text,
  ledger_id uuid,
  quantity numeric not null,
  unit_price numeric not null,
  amount numeric not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint invoices_items_pkey primary key (id),
  constraint invoices_items_invoice_id_fkey foreign key (invoice_id) references billing.invoices(id) on delete cascade,
  constraint invoices_items_plan_id_fkey foreign key (plan_id) references billing.plans(id),
  constraint invoices_items_ledger_id_fkey foreign key (ledger_id) references billing.ledger(id),
  constraint invoices_items_product_id_fkey foreign key (product_id) references billing.products(id),
  constraint invoices_items_type_check check (type in ('plan', 'credit', 'overage'))
);

create index invoices_items_invoice_id_idx on billing.invoices_items using btree (invoice_id);

create table billing.payments (
  id uuid default gen_random_uuid() not null,
  invoice_id uuid not null,
  organization_id uuid not null,
  account_id uuid,
  amount numeric not null,
  method text,
  status text not null default 'pending',
  external_id text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint payments_pkey primary key (id),
  constraint payments_invoice_id_fkey foreign key (invoice_id) references billing.invoices(id) on delete cascade,
  constraint payments_organization_id_fkey foreign key (organization_id) references public.organizations(id) on delete cascade,
  constraint payments_account_id_fkey foreign key (account_id) references billing.accounts(id),
  constraint payments_status_check check (status in ('pending', 'succeeded', 'failed', 'refunded'))
);

create index payments_invoice_id_idx on billing.payments using btree (invoice_id);
create index payments_organization_id_idx on billing.payments using btree (organization_id);

create table billing.costs (
  provider text not null,
  product text not null,
  effective_at timestamp with time zone default now() not null,
  quantity numeric not null,
  unit text not null,
  pricing jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint costs_pkey primary key (provider, product, effective_at)
);

-- ── set_updated_at triggers ───────────────────────────────────────────────────

create trigger set_updated_at before update on billing.products for each row execute function public.moddatetime('updated_at');
create trigger set_updated_at before update on billing.tiers for each row execute function public.moddatetime('updated_at');
create trigger set_updated_at before update on billing.tiers_products for each row execute function public.moddatetime('updated_at');
create trigger set_updated_at before update on billing.plans for each row execute function public.moddatetime('updated_at');
create trigger set_updated_at before update on billing.plans_products for each row execute function public.moddatetime('updated_at');
create trigger set_updated_at before update on billing.accounts for each row execute function public.moddatetime('updated_at');
create trigger set_updated_at before update on billing.subscriptions for each row execute function public.moddatetime('updated_at');
create trigger set_updated_at before update on billing.usage for each row execute function public.moddatetime('updated_at');
create trigger set_updated_at before update on billing.ledger for each row execute function public.moddatetime('updated_at');
create trigger set_updated_at before update on billing.invoices for each row execute function public.moddatetime('updated_at');
create trigger set_updated_at before update on billing.invoices_items for each row execute function public.moddatetime('updated_at');
create trigger set_updated_at before update on billing.payments for each row execute function public.moddatetime('updated_at');
create trigger set_updated_at before update on billing.costs for each row execute function public.moddatetime('updated_at');

-- ── RLS ───────────────────────────────────────────────────────────────────────

alter table billing.products enable row level security;
create policy "anyone can read products" on billing.products for select to authenticated, anon using (true);

alter table billing.tiers enable row level security;
create policy "anyone can read tiers" on billing.tiers for select to authenticated, anon using (true);

alter table billing.tiers_products enable row level security;
create policy "anyone can read tiers_products" on billing.tiers_products for select to authenticated, anon using (true);

alter table billing.plans enable row level security;
create policy "anyone can read plans" on billing.plans for select to authenticated, anon using (true);

alter table billing.plans_products enable row level security;
create policy "anyone can read plans_products" on billing.plans_products for select to authenticated, anon using (true);

alter table billing.costs enable row level security;
create policy "anyone can read costs" on billing.costs for select to authenticated, anon using (true);

alter table billing.subscriptions enable row level security;
create policy "members can read their org subscription" on billing.subscriptions for select to authenticated, anon
  using (organization_id in (select public.get_authorized_orgs('member')));

alter table billing.usage enable row level security;
create policy "members can read their org usage" on billing.usage for select to authenticated, anon
  using (organization_id in (select public.get_authorized_orgs('member')));

alter table billing.ledger enable row level security;
create policy "members can read their org ledger" on billing.ledger for select to authenticated, anon
  using (organization_id in (select public.get_authorized_orgs('member')));

alter table billing.accounts enable row level security;
create policy "owners can read their accounts" on billing.accounts for select to authenticated, anon
  using (id in (
    select s.account_id from billing.subscriptions s
    where s.organization_id in (select public.get_authorized_orgs('owner'))
    and s.account_id is not null
  ));

alter table billing.invoices enable row level security;
create policy "owners can read their org invoices" on billing.invoices for select to authenticated, anon
  using (organization_id in (select public.get_authorized_orgs('owner')));

alter table billing.invoices_items enable row level security;
create policy "owners can read their org invoice items" on billing.invoices_items for select to authenticated, anon
  using (invoice_id in (
    select i.id from billing.invoices i
    where i.organization_id in (select public.get_authorized_orgs('owner'))
  ));

alter table billing.payments enable row level security;
create policy "owners can read their org payments" on billing.payments for select to authenticated, anon
  using (organization_id in (select public.get_authorized_orgs('owner')));

-- ── Functions ─────────────────────────────────────────────────────────────────

create function billing.check_limit(
  _organization_id uuid,
  _product_id text,
  _amount numeric default 1
) returns boolean
language plpgsql security definer set search_path to ''
as $$
declare
  _tier_id text; _kind text; _cap numeric; _interval text; _current numeric; _period date;
begin
  select s.tier_id into _tier_id from billing.subscriptions s where s.organization_id = _organization_id;
  if not found then return true; end if;

  select p.kind into _kind from billing.products p where p.id = _product_id;
  if not found then return true; end if;

  select tp.cap, tp.interval into _cap, _interval
  from billing.tiers_products tp where tp.tier_id = _tier_id and tp.product_id = _product_id;
  if not found then return true; end if;
  if _cap is null then return true; end if;

  _period := case _interval
    when 'month' then date_trunc('month', current_date)::date
    when 'day' then current_date
    else '1970-01-01'::date
  end;

  select u.quantity into _current from billing.usage u
  where u.organization_id = _organization_id and u.product_id = _product_id
    and u.interval = _interval and u.period = _period;
  _current := coalesce(_current, 0);

  if _kind = 'balance' then
    if _current - _amount < _cap then
      raise exception 'Insufficient balance for %', _product_id;
    end if;
  else
    if _current + _amount > _cap then
      raise exception 'Usage limit reached for %', _product_id;
    end if;
  end if;

  return true;
end;
$$;

create function billing.update_usage(
  _organization_id uuid,
  _product_id text,
  _quantity numeric default 1
) returns void
language plpgsql security definer set search_path to ''
as $$
declare _today date := current_date; _month date := date_trunc('month', current_date)::date;
begin
  if not exists (select 1 from billing.products where id = _product_id) then return; end if;

  insert into billing.usage (organization_id, product_id, interval, period, quantity)
  values (_organization_id, _product_id, 'day', _today, _quantity)
  on conflict (organization_id, product_id, interval, period)
  do update set quantity = billing.usage.quantity + _quantity;

  insert into billing.usage (organization_id, product_id, interval, period, quantity)
  values (_organization_id, _product_id, 'month', _month, _quantity)
  on conflict (organization_id, product_id, interval, period)
  do update set quantity = billing.usage.quantity + _quantity;

  insert into billing.usage (organization_id, product_id, interval, period, quantity)
  values (_organization_id, _product_id, 'lifetime', '1970-01-01', _quantity)
  on conflict (organization_id, product_id, interval, period)
  do update set quantity = billing.usage.quantity + _quantity;
end;
$$;

create function billing.check_product_limit() returns trigger
language plpgsql security definer set search_path to ''
as $$
begin
  perform billing.check_limit(new.organization_id, tg_table_name);
  return new;
end;
$$;

create function billing.update_product_usage() returns trigger
language plpgsql security definer set search_path to ''
as $$
declare _kind text;
begin
  if tg_op = 'DELETE' then
    select p.kind into _kind from billing.products p where p.id = tg_table_name;
    if _kind = 'counter' then return old; end if;
    perform billing.update_usage(old.organization_id, tg_table_name, -1);
    return old;
  end if;
  perform billing.update_usage(new.organization_id, tg_table_name);
  return new;
end;
$$;

create function billing.check_storage_limit() returns trigger
language plpgsql security definer set search_path to ''
as $$
declare _org_id uuid; _size_gb numeric;
begin
  _org_id := (string_to_array(new.name, '/'))[2]::uuid;
  _size_gb := coalesce((new.metadata->>'size')::numeric, 0) / 1000000000.0;
  perform billing.check_limit(_org_id, 'storage', _size_gb);
  return new;
end;
$$;

create function billing.update_storage_usage() returns trigger
language plpgsql security definer set search_path to ''
as $$
declare _org_id uuid; _size_gb numeric;
begin
  if tg_op = 'INSERT' then
    _org_id := (string_to_array(new.name, '/'))[2]::uuid;
    _size_gb := coalesce((new.metadata->>'size')::numeric, 0) / 1000000000.0;
    perform billing.update_usage(_org_id, 'storage', _size_gb);
    return new;
  elsif tg_op = 'DELETE' then
    _org_id := (string_to_array(old.name, '/'))[2]::uuid;
    _size_gb := coalesce((old.metadata->>'size')::numeric, 0) / 1000000000.0;
    perform billing.update_usage(_org_id, 'storage', -_size_gb);
    return old;
  end if;
  return coalesce(new, old);
end;
$$;

create function billing.guard_ledger_insert() returns trigger
language plpgsql security definer set search_path to ''
as $$
begin
  if not exists (select 1 from billing.products where id = new.product_id) then
    return null;
  end if;
  return new;
end;
$$;

create function billing.process_ledger_entry() returns trigger
language plpgsql security definer set search_path to ''
as $$
begin
  if new.billable is distinct from false then
    perform billing.update_usage(new.organization_id, new.product_id, new.quantity);
  end if;
  return new;
end;
$$;

create function billing.initialize_subscription() returns trigger
language plpgsql security definer set search_path to ''
as $$
declare _tier_id text; _plan_id text;
begin
  select t.id into _tier_id from billing.tiers t where t.active = true order by t.level asc limit 1;
  if not found then return new; end if;

  insert into billing.subscriptions (organization_id, tier_id) values (new.id, _tier_id);

  select p.id into _plan_id from billing.plans p where p.is_default = true and p.active = true limit 1;
  if _plan_id is not null then perform billing.change_plan(new.id, _plan_id); end if;

  return new;
end;
$$;

create function billing.change_plan(
  _organization_id uuid,
  _plan_id text
) returns void
language plpgsql security definer set search_path to ''
as $$
declare _plan billing.plans%rowtype; _tier_id text; _pp record;
begin
  select * into strict _plan from billing.plans p where p.id = _plan_id and p.active = true;

  select t.id into _tier_id from billing.tiers t
  where t.level >= _plan.min_tier and t.active = true order by t.level asc limit 1;
  if _tier_id is null then raise exception 'No active tier found for plan %', _plan_id; end if;

  update billing.subscriptions set tier_id = _tier_id, plan_id = _plan_id, current_period_start = now()
  where organization_id = _organization_id;

  for _pp in
    select pp.product_id, pp.included
    from billing.plans_products pp join billing.products p on p.id = pp.product_id
    where pp.plan_id = _plan_id and p.kind = 'balance' and pp.included is not null and pp.included > 0
  loop
    insert into billing.ledger (organization_id, product_id, type, quantity)
    values (_organization_id, _pp.product_id, 'grant', _pp.included);
  end loop;
end;
$$;

-- Expose billing.change_plan as a public RPC callable by service_role
create function public.billing_change_plan(
  _organization_id uuid,
  _plan_id text
) returns void
language plpgsql security definer set search_path to ''
as $$
begin
  perform billing.change_plan(_organization_id, _plan_id);
end;
$$;

-- ── Triggers ──────────────────────────────────────────────────────────────────

create trigger initialize_billing_subscription
  after insert on public.organizations for each row
  execute function billing.initialize_subscription();

create trigger check_billing_message_limit
  before insert on public.messages for each row
  when (new.timestamp >= now() - interval '10 seconds')
  execute function billing.check_product_limit();

create trigger update_billing_message_usage
  after insert on public.messages for each row
  when (new.timestamp >= now() - interval '10 seconds')
  execute function billing.update_product_usage();

create trigger update_billing_message_usage_on_delete
  after delete on public.messages for each row
  execute function billing.update_product_usage();

create trigger check_billing_conversation_limit
  before insert on public.conversations for each row
  execute function billing.check_product_limit();

create trigger update_billing_conversation_usage
  after insert or delete on public.conversations for each row
  execute function billing.update_product_usage();

create trigger check_billing_storage_limit
  before insert on storage.objects for each row
  execute function billing.check_storage_limit();

create trigger update_billing_storage_usage
  after insert or delete on storage.objects for each row
  execute function billing.update_storage_usage();

create trigger a_guard_billing_ledger_product
  before insert on billing.ledger for each row
  execute function billing.guard_ledger_insert();

create trigger update_billing_ledger_usage
  after insert on billing.ledger for each row
  execute function billing.process_ledger_entry();
