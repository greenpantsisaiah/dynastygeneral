-- Dynasty Copilot: accounts + billing + persistence
-- Migration 0002. Adds subscription state, server-side chat history mirror,
-- pinned briefings, and the indexes/RLS to make them safe.
--
-- Apply via: supabase db push (or paste into SQL editor)

set search_path = public;

-- ============================================================
-- subscriptions: one row per user, mirrors Stripe
-- ============================================================
create type public.subscription_tier as enum ('free', 'pro');
create type public.subscription_status as enum (
  'trialing',
  'active',
  'past_due',
  'canceled',
  'incomplete',
  'incomplete_expired',
  'unpaid',
  'paused'
);

create table if not exists public.subscriptions (
  user_id              uuid primary key references auth.users(id) on delete cascade,
  tier                 public.subscription_tier not null default 'free',
  status               public.subscription_status,
  stripe_customer_id   text unique,
  stripe_subscription_id text unique,
  stripe_price_id      text,
  trial_end            timestamptz,
  current_period_end   timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists subscriptions_stripe_customer_idx
  on public.subscriptions (stripe_customer_id);
create index if not exists subscriptions_tier_status_idx
  on public.subscriptions (tier, status);

-- ============================================================
-- chat_history: server-side mirror of localStorage chat
-- ============================================================
-- Pro users get cross-device chat continuity. Free users get
-- localStorage-only (the existing UX). Server-side mirror is
-- best-effort: client writes to both, server is the durable copy.
create table if not exists public.chat_history (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  league_id           text not null, -- Sleeper league id; not FK since league rows are optional
  role                text not null check (role in ('user', 'assistant')),
  content             text not null,
  created_at          timestamptz not null default now()
);

create index if not exists chat_history_user_league_created_idx
  on public.chat_history (user_id, league_id, created_at);

-- ============================================================
-- pinned_briefings: user's "war room" pins
-- ============================================================
-- Briefings are normally per-session. Pinning persists the take so
-- users can return to it. Free users can pin up to 3; Pro unlimited
-- (enforced in app, not DB, so the limit can change without migration).
create table if not exists public.pinned_briefings (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  league_id           text not null,
  briefing_id         text not null, -- client-generated id
  kind                text not null,
  severity            text not null,
  headline            text not null,
  body                text,
  data                jsonb, -- the per-kind payload
  pinned_at           timestamptz not null default now(),
  unique (user_id, briefing_id)
);

create index if not exists pinned_briefings_user_league_idx
  on public.pinned_briefings (user_id, league_id);

-- ============================================================
-- updated_at triggers (reuse function from 0001)
-- ============================================================
drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.tg_set_updated_at();

-- ============================================================
-- Auto-create profile + free subscription on signup
-- ============================================================
-- When a user signs up via Supabase Auth, create their profile and
-- a free-tier subscription row in one trigger so the rest of the app
-- can assume both rows exist for any auth.users row.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  insert into public.subscriptions (user_id, tier) values (new.id, 'free') on conflict (user_id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- Row-level security
-- ============================================================
-- subscriptions: users can read their own row only. Stripe webhook
-- writes via service role (bypasses RLS).
alter table public.subscriptions enable row level security;
drop policy if exists "subscriptions_self_read" on public.subscriptions;
create policy "subscriptions_self_read" on public.subscriptions
  for select using (auth.uid() = user_id);

-- chat_history: users own their rows.
alter table public.chat_history enable row level security;
drop policy if exists "chat_history_self_all" on public.chat_history;
create policy "chat_history_self_all" on public.chat_history
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- pinned_briefings: users own their rows.
alter table public.pinned_briefings enable row level security;
drop policy if exists "pinned_briefings_self_all" on public.pinned_briefings;
create policy "pinned_briefings_self_all" on public.pinned_briefings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
