-- Companion expectation ledger: store the alternative's player id
-- (Principle 13, the in-season loop wiring).
--
-- Migration 0015 stored the road-not-taken as a LABEL + a draft-time
-- VALUE only. The in-season running-story callback and the terminal
-- vindication / critique reconcile both need the call's CURRENT value, so
-- they need its player id to look it up in the live value map. This adds
-- that id. Nullable: non-pick bets and pre-0016 rows leave it null, and
-- the callback simply skips a bet it cannot ground head-to-head.

alter table public.expectations
  add column if not exists alternative_player_id text;
