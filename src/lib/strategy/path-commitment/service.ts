/**
 * Server-side helpers for path commitments + chronicle.
 *
 * Two responsibilities:
 *   1. Read/write commitments and chronicle entries via Supabase.
 *   2. Auto-detect meaningful state transitions on hub render and
 *      append chronicle entries server-side. The chronicle catches
 *      up even when the user hasn't visited recently. They come
 *      back to "Path tightened: Bijan went, then Achane went, now
 *      you're at 32 viability" already populated.
 *
 * Server-only. Never import from a "use client" file.
 */

import { createClient } from "@/lib/supabase/server";
import type { StrategyLabPath, StrategyLabPathState } from "@/lib/strategy/strategy-lab/types";
import type {
  ActivePathCommitment,
  ChronicleEntry,
  ChronicleEventKind,
  PathCommitment,
} from "./types";

const CHRONICLE_PAGE_SIZE = 20;
// Viability deltas smaller than this don't justify a chronicle
// entry. Without a threshold the chronicle fills with noise from
// per-render rounding wobbles.
const MIN_DELTA_FOR_EVENT = 5;

export type CommitArgs = {
  league_id: string;
  season: string;
  archetype_id: string;
  archetype_name: string;
  committed_at_pick_no: number | null;
  viability: number;
  state: StrategyLabPathState;
};

export async function getActiveCommitment(
  user_id: string,
  league_id: string,
  season: string,
): Promise<ActivePathCommitment | null> {
  const supabase = await createClient();
  const commit = await supabase
    .from("path_commitments")
    .select("*")
    .eq("user_id", user_id)
    .eq("league_id", league_id)
    .eq("season", season)
    .is("abandoned_at", null)
    .maybeSingle();
  if (commit.error || !commit.data) return null;
  const commitment = commit.data as PathCommitment;

  const chron = await supabase
    .from("path_chronicle")
    .select("*")
    .eq("commitment_id", commitment.id)
    .order("event_at", { ascending: false })
    .limit(CHRONICLE_PAGE_SIZE);
  const chronicle = (chron.data ?? []) as ChronicleEntry[];

  return { commitment, chronicle };
}

/**
 * Create a new commitment + initial chronicle entry. Refuses if an
 * active commitment already exists for this user-league-season; the
 * caller should abandon it first.
 */
export async function createCommitment(
  user_id: string,
  args: CommitArgs,
): Promise<{ ok: true; commitment: PathCommitment } | { ok: false; error: string }> {
  const supabase = await createClient();

  const existing = await supabase
    .from("path_commitments")
    .select("id")
    .eq("user_id", user_id)
    .eq("league_id", args.league_id)
    .eq("season", args.season)
    .is("abandoned_at", null)
    .maybeSingle();
  if (existing.data) {
    return { ok: false, error: "active_commitment_exists" };
  }

  const insert = await supabase
    .from("path_commitments")
    .insert({
      user_id,
      league_id: args.league_id,
      season: args.season,
      archetype_id: args.archetype_id,
      archetype_name: args.archetype_name,
      committed_at_pick_no: args.committed_at_pick_no,
      viability_at_commit: args.viability,
      state_at_commit: args.state,
      current_viability: args.viability,
      current_state: args.state,
      last_seen_at: new Date().toISOString(),
    })
    .select("*")
    .maybeSingle();

  if (insert.error || !insert.data) {
    console.error("[path:create]", insert.error?.message);
    return { ok: false, error: "insert_failed" };
  }
  const commitment = insert.data as PathCommitment;

  await appendChronicleEntry(commitment.id, {
    event_kind: "committed",
    pick_no: args.committed_at_pick_no,
    viability: args.viability,
    state: args.state,
    narrative: `Committed at viability ${args.viability}/100, state ${args.state}.`,
    metadata: null,
  });

  return { ok: true, commitment };
}

export async function abandonCommitment(
  user_id: string,
  commitment_id: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const update = await supabase
    .from("path_commitments")
    .update({ abandoned_at: new Date().toISOString() })
    .eq("id", commitment_id)
    .eq("user_id", user_id)
    .select("id, current_viability, current_state")
    .maybeSingle();
  if (update.error || !update.data) {
    return { ok: false, error: "update_failed" };
  }
  await appendChronicleEntry(commitment_id, {
    event_kind: "abandoned",
    pick_no: null,
    viability: update.data.current_viability,
    state: update.data.current_state,
    narrative: "Path abandoned by user.",
    metadata: null,
  });
  return { ok: true };
}

/**
 * Auto-event-on-render. Compare the active commitment's last-seen
 * state to the path's CURRENT state from the live Strategy Lab.
 * If a meaningful transition happened, append a chronicle entry +
 * update the commitment. Returns the (possibly-updated) commitment.
 *
 * Idempotent within a single render: safe to call on every page
 * load. Only writes when state genuinely changed.
 */
export async function syncCommitmentAgainstLab(
  active: ActivePathCommitment,
  livePath: StrategyLabPath | null,
  current_pick_no: number | null,
): Promise<ActivePathCommitment> {
  const c = active.commitment;
  if (!livePath) return active;

  const prevViability = c.current_viability ?? c.viability_at_commit;
  const prevState = c.current_state ?? c.state_at_commit;
  const newViability = livePath.viability;
  const newState = livePath.state;
  const delta = newViability - prevViability;
  const stateChanged = newState !== prevState;
  const meaningfulDelta = Math.abs(delta) >= MIN_DELTA_FOR_EVENT;

  if (!stateChanged && !meaningfulDelta) {
    // Touch last_seen_at silently so we know the user looked.
    await touchLastSeen(c.id);
    return active;
  }

  const eventKind = inferEventKind(prevState, newState, delta);
  const narrative = buildNarrative({
    prevState,
    newState,
    prevViability,
    newViability,
    delta,
    archetype_name: c.archetype_name,
  });

  const supabase = await createClient();
  await supabase
    .from("path_commitments")
    .update({
      current_viability: newViability,
      current_state: newState,
      last_seen_at: new Date().toISOString(),
    })
    .eq("id", c.id);

  await appendChronicleEntry(c.id, {
    event_kind: eventKind,
    pick_no: current_pick_no,
    viability: newViability,
    state: newState,
    narrative,
    metadata: { delta, prev_state: prevState, prev_viability: prevViability },
  });

  // Re-fetch the chronicle so the UI gets the new entry on this render.
  return (await getActiveCommitment(c.user_id, c.league_id, c.season)) ?? active;
}

async function touchLastSeen(commitment_id: string): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("path_commitments")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", commitment_id);
}

async function appendChronicleEntry(
  commitment_id: string,
  entry: Omit<ChronicleEntry, "id" | "commitment_id" | "event_at">,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("path_chronicle").insert({
    commitment_id,
    event_kind: entry.event_kind,
    pick_no: entry.pick_no,
    viability: entry.viability,
    state: entry.state,
    narrative: entry.narrative,
    metadata: entry.metadata,
  });
  if (error) {
    console.error("[path:chronicle]", error.message);
  }
}

function inferEventKind(
  prevState: StrategyLabPathState,
  newState: StrategyLabPathState,
  delta: number,
): ChronicleEventKind {
  const STATE_RANK: Record<StrategyLabPathState, number> = {
    open: 3,
    narrowing: 2,
    closing: 1,
    closed: 0,
  };
  const prevR = STATE_RANK[prevState];
  const newR = STATE_RANK[newState];
  if (newR === 0 && prevR > 0) return "closed";
  if (newR === 3 && prevR < 3) return "just_opened";
  if (newR < prevR) return "tightened";
  if (newR > prevR) return "loosened";
  return delta < 0 ? "tightened" : "loosened";
}

function buildNarrative(args: {
  prevState: StrategyLabPathState;
  newState: StrategyLabPathState;
  prevViability: number;
  newViability: number;
  delta: number;
  archetype_name: string;
}): string {
  const { prevState, newState, prevViability, newViability, delta, archetype_name } = args;
  const sign = delta >= 0 ? "+" : "";
  if (newState !== prevState) {
    return `${archetype_name}: ${prevState} to ${newState} (${sign}${delta} viability, now ${newViability}/100).`;
  }
  return `${archetype_name}: viability ${sign}${delta} (${prevViability} to ${newViability}/100), still ${newState}.`;
}
