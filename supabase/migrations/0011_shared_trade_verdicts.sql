-- Shared trade verdicts: persistent shareable URLs for incoming and
-- outbound trade verdicts. The user clicks "Share verdict" on a result
-- card; we save the input + output payloads to this table, mint a
-- short_code, and return a public URL at /t/{short_code}.
--
-- Why this exists: KTC owns trade analysis because people screenshot
-- their pricer. We make the URL itself the asset (with an OG image
-- card for rich unfurls) so every share is also marketing for the
-- engine, AND a calibration receipt anchored in the published
-- backtest accuracy.
--
-- Privacy posture (per founder decision 2026-05-07):
--   - Logged-in users only can create shares
--   - Anyone with the URL can view (anonymous viewing)
--   - Public render strips user-identifying info (no email, no
--     sleeper username)
--   - 365-day expiration with lazy cleanup on access
--   - Methodology link baked into OG image
--
-- The input/output payloads are stored as jsonb so the schema stays
-- forward-compatible: if the engine output shape evolves, we render
-- the saved version as it was at share time.

create table if not exists public.shared_trade_verdicts (
  id              bigserial primary key,
  -- Short code used in the public URL: /t/{short_code}. URL-safe
  -- characters only; case-sensitive; 8 chars gives ~218 trillion
  -- combinations even from a 64-char alphabet, plenty of headroom.
  short_code      text unique not null,
  -- The user who created the share. Logged-in only; cascade-deletes
  -- if the user deletes their account (right-to-erasure).
  user_id         uuid not null references auth.users(id) on delete cascade,
  -- Sleeper league_id from which the verdict was generated. Used for
  -- light context display (league name shown publicly only if user
  -- explicitly opts in later; default OFF).
  league_id       text,
  -- Engine mode: 'incoming' (evaluate inbound offer) or 'outbound'
  -- (build attack on a target).
  mode            text not null check (mode in ('incoming', 'outbound')),
  -- The structured output from the engine (TradeIncomingOutput or
  -- TradeOutboundOutput). Frozen at share time; we render this exact
  -- payload no matter how the engine evolves.
  output          jsonb not null,
  -- Optional input payload (you_send / you_receive / target_kind /
  -- target_name / notes). Helps with retrospective viewing and any
  -- future "remix this verdict" feature.
  input           jsonb,
  -- The team display name at share time. Shown on the public page
  -- as low-PII identity ("attacked by TeamFireFury"). Sleeper team
  -- names are already public on Sleeper, so this is fair-share. We
  -- specifically do NOT save sleeper username or email.
  team_display    text,
  -- Engine confidence at share time. Snapshotted so the public page
  -- can show "78% confidence" without re-querying.
  confidence      int check (confidence >= 0 and confidence <= 100),
  -- Engine version stamp (currently 'v0', will be 'v1' once full
  -- signal coverage lands). Lets us show "engine v0 backtest 0.399"
  -- accurately even after we ship v1.
  engine_version  text not null default 'v0',
  -- Created and expires (default 365 days from creation; lazy
  -- cleanup on access).
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default (now() + interval '365 days'),
  -- View counter for engagement signal. Incremented on every
  -- successful public-page render (rate-limited at the route).
  view_count      int not null default 0
);

create index if not exists idx_shared_trade_verdicts_short_code
  on public.shared_trade_verdicts(short_code);
create index if not exists idx_shared_trade_verdicts_user
  on public.shared_trade_verdicts(user_id, created_at desc);
create index if not exists idx_shared_trade_verdicts_expires
  on public.shared_trade_verdicts(expires_at)
  where expires_at is not null;

-- Row Level Security. Public read by short_code (anyone with the
-- URL can view). Insert restricted to authenticated users for their
-- own row. Delete restricted to the row's creator.
alter table public.shared_trade_verdicts enable row level security;

drop policy if exists "shared_trade_verdicts public read" on public.shared_trade_verdicts;
create policy "shared_trade_verdicts public read"
  on public.shared_trade_verdicts for select
  using (true);

drop policy if exists "shared_trade_verdicts owner insert" on public.shared_trade_verdicts;
create policy "shared_trade_verdicts owner insert"
  on public.shared_trade_verdicts for insert
  with check (auth.uid() = user_id);

drop policy if exists "shared_trade_verdicts owner delete" on public.shared_trade_verdicts;
create policy "shared_trade_verdicts owner delete"
  on public.shared_trade_verdicts for delete
  using (auth.uid() = user_id);

-- View counter is updated by the route via service-role client
-- (bypasses RLS); not exposed to authenticated client writes to
-- prevent users from inflating each other's counts.
