-- Notifications table. Tracks per-user, per-league, per-event email
-- sends so the cron job doesn't double-send. Idempotent insert via
-- the unique constraint.
--
-- v1 kinds: 'aar_ready'. Future: 'camp_alert', 'mid_season_check_in',
-- 'year_end_retrospective'.

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  league_id text not null,
  kind text not null,
  status text not null default 'sent',
  error_message text,
  sent_at timestamptz not null default now(),
  unique (user_id, league_id, kind)
);

create index if not exists notifications_user_kind_idx
  on notifications (user_id, kind);

create index if not exists notifications_sent_at_idx
  on notifications (sent_at desc);

-- RLS: only the user themselves can read their notifications.
-- Service role (cron) bypasses RLS for inserts.
alter table notifications enable row level security;

create policy "users can view own notifications"
  on notifications for select
  using (auth.uid() = user_id);
