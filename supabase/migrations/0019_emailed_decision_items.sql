-- The trade items a weekly brief actually emailed, saved at send time.
--
-- The app rebuilds decisions live, so hours after a send it could name a
-- different buyer than the email did (2026-11-26: email said ladovina11,
-- the app said Revolver420 after Thanksgiving injury news moved the asks).
-- Isaiah's rule: every email item links to the same item in the app. The
-- app now shows the emailed trade, as emailed, until its trade-by time
-- (src/lib/decisions/emailed.ts).
--
-- Written by the weekly-brief cron with the service role; read by the
-- signed-in user (RLS select-own).

create table if not exists public.emailed_decision_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null,
  kind text not null,
  league_id text,
  -- The item's trade-by time; the app stops showing it after this.
  deadline timestamptz,
  -- The DecisionItem exactly as rendered in the email.
  item jsonb not null,
  template_version text not null,
  -- "broadcast" or "preview".
  send_mode text not null,
  sent_at timestamptz not null default now(),
  unique (user_id, item_id)
);

create index if not exists emailed_decision_items_live
  on public.emailed_decision_items (user_id, deadline desc);

alter table public.emailed_decision_items enable row level security;

drop policy if exists "emailed_decision_items_select_own" on public.emailed_decision_items;
create policy "emailed_decision_items_select_own"
  on public.emailed_decision_items for select
  using (auth.uid() = user_id);
