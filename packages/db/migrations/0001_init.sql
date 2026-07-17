-- ===== ENUMS =====
create type key_environment as enum ('live','test');
create type api_key_status  as enum ('active','exhausted','revoked','expired');
create type billing_status  as enum ('pending','paid','void');
create type sync_event_type as enum ('key_created','key_updated','key_revoked');

-- ===== profiles (user = tenant) =====
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name varchar,
  is_active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ===== api_keys =====
create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  label varchar,
  environment key_environment not null default 'live',
  key_prefix varchar not null unique,          -- gw_live_a1b2c3 (shown/looked up)
  key_hash varchar not null,                   -- HMAC-SHA256(full_key, PEPPER). Plaintext NEVER stored.
  monthly_limit int not null,
  current_usage int not null default 0,        -- mirror of Redis for current period
  current_period_start date not null default date_trunc('month', now())::date,
  rate_limit_per_min int,
  status api_key_status not null default 'active',
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index on public.api_keys (user_id);
create index on public.api_keys (status);

-- ===== usage_events (append-only, metadata only) =====
create table public.usage_events (
  id bigserial primary key,
  api_key_id uuid not null references public.api_keys(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  request_id varchar,
  method varchar not null,
  source_path varchar not null,
  target_path varchar,
  status_code int,          -- nullable: forward-auth is pre-flight
  latency_ms int,           -- nullable: same reason
  billable boolean not null default true,
  occurred_at timestamptz not null,
  created_at timestamptz default now()
);
create index on public.usage_events (api_key_id, occurred_at);
create index on public.usage_events (user_id, occurred_at);

-- ===== billing_records (MOCK) =====
create table public.billing_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  api_key_id uuid references public.api_keys(id) on delete set null,
  amount decimal(14,2) not null,
  currency varchar not null default 'UZS',
  description varchar,
  status billing_status not null default 'pending',
  period_start date,
  period_end date,
  created_at timestamptz default now()
);
create index on public.billing_records (user_id);

-- ===== gateway_sync_events (outbox fallback; primary sync = Realtime) =====
create table public.gateway_sync_events (
  id bigserial primary key,
  event_type sync_event_type not null,
  api_key_id uuid,
  payload jsonb,
  consumed_at timestamptz,
  created_at timestamptz default now()
);

-- ===== new-user trigger: auto-create profile =====
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end; $$;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ===== RLS =====
alter table public.profiles        enable row level security;
alter table public.api_keys        enable row level security;
alter table public.usage_events    enable row level security;
alter table public.billing_records enable row level security;

create policy "own profile read"   on public.profiles        for select using (id = auth.uid());
create policy "own profile update" on public.profiles        for update using (id = auth.uid());
create policy "own keys read"      on public.api_keys        for select using (user_id = auth.uid());
create policy "own usage read"     on public.usage_events    for select using (user_id = auth.uid());
create policy "own billing read"   on public.billing_records for select using (user_id = auth.uid());
-- inserts/updates are server-side (service_role) only. No client insert/update policies.

-- ===== HARD GUARD: key_hash never selectable by the client =====
revoke select (key_hash) on public.api_keys from anon, authenticated;

-- ===== Gateway startup bootstrap view (read via service_role) =====
create view public.active_keys_bootstrap as
select id, user_id, key_prefix, key_hash, monthly_limit, current_usage,
       current_period_start, rate_limit_per_min, status, environment, expires_at
from public.api_keys
where status in ('active','exhausted');

-- ===== Realtime: publish api_keys changes so the Gateway can hot-sync =====
alter publication supabase_realtime add table public.api_keys;
