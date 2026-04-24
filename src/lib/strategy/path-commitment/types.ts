/**
 * Shared types for path commitments + chronicle.
 *
 * The shape mirrors the DB but is the canonical TypeScript contract
 * across server and client. Don't import the Supabase row type
 * directly in components; use these.
 */

import type { StrategyLabPathState } from "@/lib/strategy/strategy-lab/types";

export type PathCommitment = {
  id: string;
  user_id: string;
  league_id: string;
  season: string;

  archetype_id: string;
  archetype_name: string;

  committed_at: string; // ISO
  committed_at_pick_no: number | null;
  viability_at_commit: number;
  state_at_commit: StrategyLabPathState;

  current_viability: number | null;
  current_state: StrategyLabPathState | null;
  last_seen_at: string | null;

  user_note: string | null;
  abandoned_at: string | null;
};

export type ChronicleEventKind =
  | "committed"
  | "tightened"
  | "loosened"
  | "closed"
  | "just_opened"
  | "abandoned"
  | "pivoted"
  | "note";

export type ChronicleEntry = {
  id: string;
  commitment_id: string;
  event_at: string; // ISO

  event_kind: ChronicleEventKind;
  pick_no: number | null;
  viability: number | null;
  state: StrategyLabPathState | null;

  narrative: string;
  metadata: Record<string, unknown> | null;
};

/**
 * Bundle returned by the GET endpoint and consumed by the Strategy
 * Lab UI. Either a live commitment with its recent chronicle, or
 * null when no active commitment exists for this user-league-season.
 */
export type ActivePathCommitment = {
  commitment: PathCommitment;
  chronicle: ChronicleEntry[]; // newest first, capped to ~20
};
