/**
 * Player-health reader (CANONICAL).
 *
 * Returns a `Sleeper player_id -> PlayerHealthRow` map sourced from
 * production `player_health` (defined in migration 0009_signals.sql).
 * The table is EMPTY in production today; this loader exists so the
 * EnrichedPlayer resolver can FLAG the absence (the no-silent-null
 * contract) instead of pretending the column is just missing per-call.
 *
 * Cached per-process for 24h; in-flight requests dedupe. Server-only
 * via the admin client (service role bypasses RLS). Never imported
 * from a client component.
 *
 * Registered in `CANONICAL_SOURCES.md` under "Enriched player
 * resolver". No surface re-reads `player_health` inline; consume this
 * map.
 */

import { getAdminClient } from "@/lib/supabase/admin";

const TTL_MS = 24 * 60 * 60 * 1000;
const PAGE = 1000;

export type PlayerHealthRow = {
  player_id: string;
  games_missed_3yr: number | null;
  injury_history: unknown[];
  chronic_flag: boolean | null;
  current_status: string | null;
  off_field_flag: boolean | null;
  holdout_flag: boolean | null;
  last_updated: string;
};

type Cached = {
  map: Map<string, PlayerHealthRow>;
  fetchedAt: number;
  tableEmpty: boolean;
};

let cache: Cached | null = null;
let inflight: Promise<Cached> | null = null;

async function fetchAll(): Promise<Cached> {
  const sb = getAdminClient();
  const out = new Map<string, PlayerHealthRow>();
  let from = 0;
  let any = false;
  for (;;) {
    const { data, error } = await sb
      .from("player_health")
      .select("*")
      .range(from, from + PAGE - 1);
    if (error) {
      console.error(`[player-health] read failed: ${error.message}`);
      return { map: new Map(), fetchedAt: Date.now(), tableEmpty: true };
    }
    if (!data || data.length === 0) break;
    any = true;
    for (const r of data as PlayerHealthRow[]) {
      if (r.player_id) out.set(r.player_id, r);
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return { map: out, fetchedAt: Date.now(), tableEmpty: !any };
}

export async function getPlayerHealthMap(): Promise<Map<string, PlayerHealthRow>> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache.map;
  if (inflight) return (await inflight).map;
  inflight = fetchAll();
  try {
    cache = await inflight;
    return cache.map;
  } finally {
    inflight = null;
  }
}

/**
 * True when the most-recent fetch returned zero rows. The EnrichedPlayer
 * resolver uses this to distinguish `row_missing` (the table has rows
 * but not for this player) from `table_empty` (no rows at all, which is
 * a not-acquired signal rather than a per-player gap). Resolves the
 * cache if needed.
 */
export async function isPlayerHealthTableEmpty(): Promise<boolean> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache.tableEmpty;
  if (inflight) return (await inflight).tableEmpty;
  inflight = fetchAll();
  try {
    cache = await inflight;
    return cache.tableEmpty;
  } finally {
    inflight = null;
  }
}
