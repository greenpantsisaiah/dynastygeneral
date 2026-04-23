-- Dynasty Copilot: Stripe webhook idempotency
-- Migration 0003. Records each Stripe event id we've processed so
-- retries (Stripe retries 5xx for up to 3 days) don't double-apply
-- subscription state changes.
--
-- Apply via: supabase db push (or paste into SQL editor)

set search_path = public;

create table if not exists public.webhook_events (
  -- Stripe event id (evt_xxx). Primary key gives us free dedup via
  -- on conflict do nothing.
  event_id            text primary key,
  event_type          text not null,
  received_at         timestamptz not null default now(),
  -- Set when the handler completes successfully so we can detect
  -- "received but never finished" in incident review.
  processed_at        timestamptz
);

create index if not exists webhook_events_received_idx
  on public.webhook_events (received_at desc);

-- Only the service-role client (webhook handler) writes here. RLS on,
-- no policies = no public access.
alter table public.webhook_events enable row level security;
