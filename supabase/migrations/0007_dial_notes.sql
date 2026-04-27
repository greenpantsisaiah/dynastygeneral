-- Per-dial notes: capture the user's WHY when they move a dial off
-- default. Surfaces alongside the dial value as judgment provenance,
-- not as adversarial feedback. Argue (mixer_feedback) is parked until
-- engine wiring lands; notes are coherent today because the dial
-- movement IS the user's position and the note is just their stated
-- reasoning for it.

alter table public.judgment_profiles
  add column if not exists notes jsonb not null default '{}'::jsonb;
