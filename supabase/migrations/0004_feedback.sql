-- Dynasty Copilot: in-app feedback collection
-- Migration 0004. Captures qualitative + quantitative feedback from
-- testers while they're in the product. RLS lets authed users insert
-- their own rows; anonymous inserts go through the API route which
-- uses the service-role client.

set search_path = public;

create table if not exists public.feedback (
  id            uuid primary key default gen_random_uuid(),
  -- Nullable: anonymous feedback (free user pre-signup) is allowed.
  user_id       uuid references auth.users(id) on delete set null,
  -- 1-5 emoji-style rating. Not required (allows pure-text submissions).
  rating        int check (rating is null or rating between 1 and 5),
  message       text not null check (char_length(message) between 1 and 4000),
  -- Page the user was on when they submitted. Helps cluster feedback.
  page_url      text,
  -- Optional contact path so the founder can follow up.
  contact_email text,
  created_at    timestamptz not null default now()
);

create index if not exists feedback_created_idx
  on public.feedback (created_at desc);
create index if not exists feedback_rating_idx
  on public.feedback (rating);

-- RLS: anyone authed can insert their own row. Service role (used by
-- the API route for anonymous inserts) bypasses RLS. No SELECT policy
-- means only the founder can read via the Supabase dashboard / SQL.
alter table public.feedback enable row level security;
drop policy if exists "feedback_self_insert" on public.feedback;
create policy "feedback_self_insert" on public.feedback
  for insert with check (auth.uid() = user_id);
