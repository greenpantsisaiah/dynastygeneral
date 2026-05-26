/**
 * Draft-capital reader (CANONICAL).
 *
 * Returns a `Sleeper player_id -> NFL overall draft pick` map, sourced
 * from production `player_signals.draft_pick_no` (populated by
 * `scripts/ingest-unlock-signals.ts`, founder-authorized 2026-05-26). The
 * inflection rookie-debut card's "Draft capital" signal reads this; the
 * signal renders `data_missing` when the map has no entry for a player.
 *
 * Cached per process for 24 hours: draft picks change once a year, so a
 * day-long stale read is fine. In-flight requests dedupe so a burst of
 * concurrent hub renders triggers only one fetch.
 *
 * Read pathway: server-only, via `getAdminClient()` (service-role,
 * bypasses RLS). This is a public-data signal (NFL draft picks), no
 * privacy concern; the admin client is the simplest server-side read
 * surface. Never imported in client components.
 *
 * Registered in `CANONICAL_SOURCES.md`. No surface re-reads
 * `player_signals.draft_pick_no` directly; consume this map.
 */

import { getAdminClient } from "@/lib/supabase/admin";

const TTL_MS = 24 * 60 * 60 * 1000;
const PAGE = 1000;

type Cached = {
  map: Map<string, number>;
  fetchedAt: number;
};

let cache: Cached | null = null;
let inflight: Promise<Map<string, number>> | null = null;

async function fetchAll(): Promise<Map<string, number>> {
  const sb = getAdminClient();
  const out = new Map<string, number>();
  let from = 0;
  for (;;) {
    const { data, error } = await sb
      .from("player_signals")
      .select("player_id,draft_pick_no")
      .not("draft_pick_no", "is", null)
      .range(from, from + PAGE - 1);
    if (error) {
      console.error(
        `[draft-capital] supabase read failed: ${error.message}`,
      );
      return new Map();
    }
    if (!data || data.length === 0) break;
    for (const r of data as Array<{ player_id: string; draft_pick_no: number | null }>) {
      if (r.draft_pick_no != null) out.set(r.player_id, r.draft_pick_no);
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

export async function getDraftPickMap(): Promise<Map<string, number>> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache.map;
  if (inflight) return inflight;
  inflight = fetchAll();
  try {
    const map = await inflight;
    cache = { map, fetchedAt: Date.now() };
    return map;
  } finally {
    inflight = null;
  }
}
