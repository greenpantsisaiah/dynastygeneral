/**
 * Player signals + team signals reader (CANONICAL).
 *
 * Server-only loader for production `player_signals` and `team_signals`,
 * the tables the rubric (`src/lib/engine/evaluation/`) reads. Populated
 * by `scripts/ingest-unlock-signals.ts` (Tier 1 + 2 ingested 2026-05-26)
 * plus pre-existing manual-coded rows (rb_role_tier etc.).
 *
 * Tables are small (low thousands of rows) and slow-moving, so the whole
 * map is fetched once per process and cached 24h. In-flight requests
 * dedupe. Reads via the admin client (service role); the data is public
 * NFL info, and this loader is server-only.
 *
 * Use `getPlayerSignalsMap()` and `getTeamSignalsMap()` everywhere the
 * rubric needs to run; never read `from("player_signals")` inline in
 * another surface. Registered in CANONICAL_SOURCES.md.
 */

import { getAdminClient } from "@/lib/supabase/admin";
import type {
  PlayerSignalsRow,
  TeamSignalsRow,
} from "@/lib/signals/schema";

// The rubric reads more columns than the `PlayerSignalsRow` TS type
// surfaces (which is the admin-UI subset). Selecting `*` and casting at
// the boundary keeps the rubric's reads honest without churning the
// shared type; extra columns are accessed through this widened shape.
// Future: regenerate `PlayerSignalsRow` from the DB schema and drop the
// widening.
type PlayerSignalsRowWide = PlayerSignalsRow & {
  snap_share_prior_year?: number | null;
  target_share_prior_year?: number | null;
  rush_share_prior_year?: number | null;
  draft_round?: number | null;
  draft_pick_no?: number | null;
  ras?: number | null;
  weighted_opportunity_prior_year?: number | null;
  high_value_touches_prior_year?: number | null;
  yprr_prior_year?: number | null;
  adot_prior_year?: number | null;
  epa_per_play_prior_year?: number | null;
  cpoe_prior_year?: number | null;
  college_dominator?: number | null;
  breakout_age?: number | null;
};

const TTL_MS = 24 * 60 * 60 * 1000;
const PAGE = 1000;

type PlayerCache = {
  map: Map<string, PlayerSignalsRowWide>;
  fetchedAt: number;
};
type TeamCache = {
  map: Map<string, TeamSignalsRow>;
  fetchedAt: number;
};

let playerCache: PlayerCache | null = null;
let playerInflight: Promise<Map<string, PlayerSignalsRowWide>> | null = null;
let teamCache: TeamCache | null = null;
let teamInflight: Promise<Map<string, TeamSignalsRow>> | null = null;

async function fetchPlayers(): Promise<Map<string, PlayerSignalsRowWide>> {
  const sb = getAdminClient();
  const out = new Map<string, PlayerSignalsRowWide>();
  let from = 0;
  for (;;) {
    const { data, error } = await sb
      .from("player_signals")
      .select("*")
      .range(from, from + PAGE - 1);
    if (error) {
      console.error(`[player-signals] read failed: ${error.message}`);
      return new Map();
    }
    if (!data || data.length === 0) break;
    for (const r of data as PlayerSignalsRowWide[]) {
      if (r.player_id) out.set(r.player_id, r);
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

async function fetchTeams(): Promise<Map<string, TeamSignalsRow>> {
  const sb = getAdminClient();
  const out = new Map<string, TeamSignalsRow>();
  const { data, error } = await sb.from("team_signals").select("*");
  if (error) {
    console.error(`[team-signals] read failed: ${error.message}`);
    return new Map();
  }
  for (const r of (data as TeamSignalsRow[]) ?? []) {
    if (r.team) out.set(r.team, r);
  }
  return out;
}

export async function getPlayerSignalsMap(): Promise<
  Map<string, PlayerSignalsRowWide>
> {
  if (playerCache && Date.now() - playerCache.fetchedAt < TTL_MS)
    return playerCache.map;
  if (playerInflight) return playerInflight;
  playerInflight = fetchPlayers();
  try {
    const map = await playerInflight;
    playerCache = { map, fetchedAt: Date.now() };
    return map;
  } finally {
    playerInflight = null;
  }
}

export async function getTeamSignalsMap(): Promise<Map<string, TeamSignalsRow>> {
  if (teamCache && Date.now() - teamCache.fetchedAt < TTL_MS) return teamCache.map;
  if (teamInflight) return teamInflight;
  teamInflight = fetchTeams();
  try {
    const map = await teamInflight;
    teamCache = { map, fetchedAt: Date.now() };
    return map;
  } finally {
    teamInflight = null;
  }
}

export type { PlayerSignalsRowWide };
