-- ============================================================
-- 0004_schema_sync.sql
-- Sync the database schema with application code expectations.
-- Run this in Supabase SQL Editor as a single transaction.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. subscriptions: add missing columns + unique constraint
-- ────────────────────────────────────────────────────────────

-- Code writes "tier" (free/pro) but table only has "plan"
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'free';

-- Copy existing plan data into tier where applicable
UPDATE public.subscriptions
  SET tier = CASE
    WHEN plan IN ('pro_monthly', 'pro_annual', 'pro') THEN 'pro'
    ELSE 'free'
  END
  WHERE tier = 'free' AND plan IS NOT NULL;

-- Code writes stripe_price_id (the Stripe price ID, e.g. price_xxx)
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS stripe_price_id text;

-- The upsert uses user_id as the conflict key; needs a unique constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscriptions_user_id_key'
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_user_id_key UNIQUE (user_id);
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 2. webhook_events: idempotency table for Stripe webhooks
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.webhook_events (
  event_id     text PRIMARY KEY,
  event_type   text NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

-- ────────────────────────────────────────────────────────────
-- 3. pinned_briefings: rebuild to match code expectations
--    Code writes: briefing_id, kind, severity, headline, body, data
--    DB has: briefing_type, content (different structure)
-- ────────────────────────────────────────────────────────────

-- Drop old columns that don't match code (if they exist)
ALTER TABLE public.pinned_briefings
  DROP COLUMN IF EXISTS briefing_type,
  DROP COLUMN IF EXISTS content;

-- Add columns the code actually uses
ALTER TABLE public.pinned_briefings
  ADD COLUMN IF NOT EXISTS briefing_id text,
  ADD COLUMN IF NOT EXISTS kind text,
  ADD COLUMN IF NOT EXISTS severity text,
  ADD COLUMN IF NOT EXISTS headline text,
  ADD COLUMN IF NOT EXISTS body text,
  ADD COLUMN IF NOT EXISTS data jsonb;

-- Upsert uses (user_id, briefing_id) as conflict key
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pinned_briefings_user_id_briefing_id_key'
  ) THEN
    ALTER TABLE public.pinned_briefings
      ADD CONSTRAINT pinned_briefings_user_id_briefing_id_key
      UNIQUE (user_id, briefing_id);
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 4. feedback: table for user feedback widget
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.feedback (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  rating        text,
  message       text NOT NULL,
  page_url      text,
  contact_email text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────────────────────
-- 5. RLS policies (secure all new/modified tables)
-- ────────────────────────────────────────────────────────────

-- webhook_events: only service role (admin client) writes; no user access
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- feedback: users can insert their own; only service role reads
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Allow signed-in users to insert feedback
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'feedback' AND policyname = 'Users can insert own feedback'
  ) THEN
    CREATE POLICY "Users can insert own feedback"
      ON public.feedback FOR INSERT
      WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
  END IF;

  -- Pinned briefings: users manage their own pins
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'pinned_briefings' AND policyname = 'Users can read own pins'
  ) THEN
    CREATE POLICY "Users can read own pins"
      ON public.pinned_briefings FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'pinned_briefings' AND policyname = 'Users can insert own pins'
  ) THEN
    CREATE POLICY "Users can insert own pins"
      ON public.pinned_briefings FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'pinned_briefings' AND policyname = 'Users can update own pins'
  ) THEN
    CREATE POLICY "Users can update own pins"
      ON public.pinned_briefings FOR UPDATE
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'pinned_briefings' AND policyname = 'Users can delete own pins'
  ) THEN
    CREATE POLICY "Users can delete own pins"
      ON public.pinned_briefings FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- Done. Verify with:
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'subscriptions' ORDER BY ordinal_position;
-- ────────────────────────────────────────────────────────────
