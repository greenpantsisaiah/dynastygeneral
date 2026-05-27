/**
 * Plays storage (server side). Account-level persistence for play
 * commitments + dismissed suggestions, RLS-scoped by auth.uid().
 *
 * Mirrors the expectations-ledger pattern (src/lib/companion/ledger.ts):
 * pure storage, the caller orchestrates upload-on-signin and read merges.
 * The domain shapes live in src/lib/strategy/plays/types.ts; the table
 * is migration 0017.
 *
 * The client-side localStorage layer in src/lib/plays-storage.ts stays
 * as the anonymous-user fallback and as a device-side cache; this module
 * is the canonical source for an authed user.
 */

import { createClient } from "@/lib/supabase/server";
import type {
  PlayArchetype,
  PlayCommitment,
  PlayPlayerRef,
} from "@/lib/strategy/plays/types";
import type { DismissedSuggestion } from "@/lib/plays-storage";

const PER_LEAGUE_FETCH_LIMIT = 200;

const COMMITMENT_STATUSES: ReadonlyArray<PlayCommitment["status"]> = [
  "active",
  "executed",
  "lapsed",
  "abandoned",
];

const ARCHETYPES: ReadonlyArray<PlayArchetype> = [
  "qb_wr_stack",
  "anchor_handcuff",
  "bridge_qb",
  "qb_hoard",
  "lane_path",
];

export async function readCommitments(args: {
  userId: string;
  leagueId: string;
}): Promise<PlayCommitment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("play_commitments")
    .select("*")
    .eq("user_id", args.userId)
    .eq("league_id", args.leagueId)
    .order("committed_at", { ascending: false })
    .limit(PER_LEAGUE_FETCH_LIMIT);
  if (error) {
    console.error("[plays:server:read-commitments]", error.message);
    return [];
  }
  return (data ?? []).map(toCommitment);
}

export async function readDismissals(args: {
  userId: string;
  leagueId: string;
}): Promise<DismissedSuggestion[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("play_dismissals")
    .select("*")
    .eq("user_id", args.userId)
    .eq("league_id", args.leagueId)
    .order("dismissed_at", { ascending: false })
    .limit(PER_LEAGUE_FETCH_LIMIT);
  if (error) {
    console.error("[plays:server:read-dismissals]", error.message);
    return [];
  }
  return (data ?? []).map(toDismissal);
}

export async function upsertCommitment(args: {
  userId: string;
  commitment: PlayCommitment;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("play_commitments")
    .upsert(commitmentToRow(args.userId, args.commitment), {
      onConflict: "user_id,league_id,commitment_id",
    });
  if (error) {
    console.error("[plays:server:upsert-commitment]", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function upsertDismissal(args: {
  userId: string;
  leagueId: string;
  dismissal: DismissedSuggestion;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("play_dismissals")
    .upsert(
      {
        user_id: args.userId,
        league_id: args.leagueId,
        dismissal_key: args.dismissal.key,
        archetype: args.dismissal.archetype,
        play_name: args.dismissal.play_name,
        dismissed_at: args.dismissal.dismissed_at,
      },
      { onConflict: "user_id,league_id,dismissal_key" },
    );
  if (error) {
    console.error("[plays:server:upsert-dismissal]", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function deleteDismissal(args: {
  userId: string;
  leagueId: string;
  key: string;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("play_dismissals")
    .delete()
    .eq("user_id", args.userId)
    .eq("league_id", args.leagueId)
    .eq("dismissal_key", args.key);
  if (error) {
    console.error("[plays:server:delete-dismissal]", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

function commitmentToRow(
  userId: string,
  c: PlayCommitment,
): Record<string, unknown> {
  return {
    user_id: userId,
    league_id: c.league_id,
    commitment_id: c.commitment_id,
    archetype: c.archetype,
    play_name: c.play_name,
    primary_player: c.primary_player,
    followthrough_targets: c.followthrough_targets,
    followthrough_description: c.followthrough_description ?? "",
    committed_at_pick_no: c.committed_at_pick_no,
    lapses_after_pick_no: c.lapses_after_pick_no,
    committed_at: c.committed_at,
    status: c.status,
    executed_with: c.executed_with ?? null,
    executed_at_pick_no: c.executed_at_pick_no ?? null,
  };
}

function toCommitment(row: Record<string, unknown>): PlayCommitment {
  const archetype = oneOf(row.archetype, ARCHETYPES, "lane_path");
  const status = oneOf(row.status, COMMITMENT_STATUSES, "active");
  return {
    commitment_id: String(row.commitment_id),
    archetype,
    play_name: String(row.play_name ?? ""),
    league_id: String(row.league_id),
    primary_player: (row.primary_player ?? {}) as PlayPlayerRef,
    followthrough_targets: Array.isArray(row.followthrough_targets)
      ? (row.followthrough_targets as PlayPlayerRef[])
      : [],
    followthrough_description: String(row.followthrough_description ?? ""),
    committed_at_pick_no: Number(row.committed_at_pick_no ?? 0),
    lapses_after_pick_no: Number(row.lapses_after_pick_no ?? 0),
    committed_at: String(row.committed_at ?? new Date().toISOString()),
    status,
    executed_with: row.executed_with
      ? (row.executed_with as PlayPlayerRef)
      : undefined,
    executed_at_pick_no:
      row.executed_at_pick_no != null
        ? Number(row.executed_at_pick_no)
        : undefined,
  };
}

function toDismissal(row: Record<string, unknown>): DismissedSuggestion {
  return {
    key: String(row.dismissal_key ?? ""),
    archetype: oneOf(row.archetype, ARCHETYPES, "lane_path"),
    play_name: String(row.play_name ?? ""),
    dismissed_at: String(row.dismissed_at ?? new Date().toISOString()),
  };
}

function oneOf<T extends string>(
  x: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  const s = String(x);
  return (allowed as readonly string[]).includes(s) ? (s as T) : fallback;
}
