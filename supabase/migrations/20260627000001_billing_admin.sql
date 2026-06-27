-- Migration: platform_admins table + admin helpers
-- Apply with: supabase db push --db-url <your-db-url>

-- ── Platform admins ───────────────────────────────────────────────────────────
create table public.platform_admins (
  id uuid default gen_random_uuid() not null,
  user_id uuid references auth.users(id) on delete set null,
  email text not null,
  created_at timestamp with time zone default now() not null,
  constraint platform_admins_pkey primary key (id),
  constraint platform_admins_email_key unique (email)
);

alter table public.platform_admins enable row level security;

-- Only service_role can read/write (admin Edge Function uses service_role)
create policy "service_role full access" on public.platform_admins
  for all to service_role using (true) with check (true);

-- When a new user signs up, link them to existing platform_admin record
create function public.link_platform_admin() returns trigger
language plpgsql security definer set search_path to ''
as $$
begin
  update public.platform_admins
  set user_id = new.id
  where lower(email) = lower(new.email) and user_id is null;
  return new;
end;
$$;

create trigger link_platform_admin_on_signup
  after insert on auth.users for each row
  execute function public.link_platform_admin();

-- ── Helper: is current JWT user a platform admin ──────────────────────────────
create function public.is_platform_admin() returns boolean
language sql security definer set search_path to ''
stable
as $$
  select exists (
    select 1 from public.platform_admins pa
    where pa.user_id = auth.uid()
  );
$$;

-- ── Billing admin stats function (service_role only) ─────────────────────────
create function public.billing_admin_stats()
returns jsonb
language plpgsql security definer set search_path to ''
as $$
declare
  _result jsonb;
begin
  select jsonb_build_object(
    'total_orgs', (select count(*) from public.organizations),
    'active_subscriptions', (select count(*) from billing.subscriptions where plan_id is not null),
    'mrr', (
      select coalesce(sum(p.price), 0)
      from billing.subscriptions s
      join billing.plans p on p.id = s.plan_id
      where p.billing_cycle = 'month' and p.price > 0
    ),
    'arr', (
      select coalesce(sum(case when p.billing_cycle = 'year' then p.price / 12 else p.price end), 0)
      from billing.subscriptions s
      join billing.plans p on p.id = s.plan_id
      where p.price > 0
    ),
    'total_messages_month', (
      select coalesce(sum(u.quantity), 0) from billing.usage u
      where u.product_id = 'messages'
        and u.interval = 'month'
        and u.period = date_trunc('month', current_date)::date
    ),
    'total_ai_credits_month', (
      select coalesce(sum(u.quantity), 0) from billing.usage u
      where u.product_id = 'ai_credits'
        and u.interval = 'month'
        and u.period = date_trunc('month', current_date)::date
    )
  ) into _result;
  return _result;
end;
$$;
