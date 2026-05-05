/**
 * League state snapshot. the single object the ranker consumes.
 *
 * Built once per request from Sleeper data + the existing draft-state
 * + player cache. Includes everything fit_signals, opening_signals,
 * and likelihood_modifiers need to evaluate.
 *
 * Keep this server-only. the player metadata map behind it is large.
 */

import type { DraftState, TradedPick } from "@/lib/sleeper/draft-state";
import type {
  SleeperLeague,
  SleeperRoster,
  SleeperLeagueUser,
} from "@/lib/sleeper/schemas";
import { resolvePlayers } from "@/lib/players/cache";
import {
  productionScore,
  type PlayerSeasonStats,
} from "@/lib/players/season-stats";
import {
  pickRedraftAdpFromVariants,
  type PlayerAdp,
} from "@/lib/players/projections";
import { pickNoForSlot } from "@/lib/sleeper/snake";
import type {
  LeagueFormat,
  LeagueScoring,
  Position,
} from "../archetypes/schema";

const FANTASY_POSITIONS: Position[] = ["QB", "RB", "WR", "TE", "K", "DST"];

export type RosterSnapshot = {
  roster_id: number;
  owner_id: string | null;
  owner_name: string | null;
  is_me: boolean;
  position_counts: Record<Position, number>;
  // Per-position list of Sleeper search_rank values for this roster's
  // players, sorted ascending (best ranks first). Used by the
  // archetype evaluator's `rank_threshold` signal so "I own 2+ TOP-12
  // QBs" is a tighter signal than "I own 2+ QBs at all." Players with
  // missing search_rank are excluded from these lists. search_rank is
  // a proxy for dynasty value; refining to a true dynasty rank is a
  // future quality lift.
  position_ranks: Record<Position, number[]>;
  player_ids: string[];
  // Whole-roster mean age across all players with known age. Use for
  // longevity / future signals. NOT for win-now signals; see
  // starter_avg_age below.
  avg_age: number | null;
  // Mean age across the players who would START in this league's
  // format (top N by Sleeper search_rank, where N is the total
  // starter slot count). Bug 2026-04-29: prior win-now math used
  // avg_age (whole roster), which dragged win-now low for users who
  // built proven-veteran starters early then stashed rookies on the
  // bench. The starter average reflects what's actually deployed in
  // a Sunday lineup; the bench-stash youth belongs in the future
  // signal, not the win-now signal.
  starter_avg_age: number | null;
  // Talent score for the deployed starting lineup. Average normalized
  // search_rank across the top-N players (N = total starter slots).
  // 0-1 scale, higher = more talent. Bug 2026-04-29: prior win-now
  // math had ZERO talent weighting; an elite-loaded contender
  // (Jefferson + Lamb + McCaffrey starters) read as "average" because
  // age + completeness + depth couldn't differentiate them from a
  // roster of late-round bodies. starter_talent_score gives the
  // win-now meter a real talent dimension.
  starter_talent_score: number | null;
  wins: number;
  losses: number;
  ties: number;
};

export type DraftPickRecord = {
  pick_no: number;
  round: number;
  roster_id: number;
  player_id: string;
  position: Position | null;
  // Age + years_exp at time of pick. Used downstream to detect
  // win-now vs. rebuild posture from THIS draft's picks (different
  // signal than roster.avg_age, which averages whole-team).
  age: number | null;
  years_exp: number | null;
};

// Density classification of a single pick in the user's schedule. Used
// as a CONTEXT MODIFIER on recommendations, not its own panel:
//   wraparound: back-to-back snake-turn picks (gap_to_prev or _next ≤ 1).
//               Take the SCARCER asset first; the next pick refills.
//   cluster:    multiple picks within ~half a round. Catch-up window;
//               OK to swing or punt this pick because more picks follow.
//   isolated:   long wait (more than a full round) on both sides.
//               Defensive: grab fragile tier now, no refill window.
//   normal:     middle ground. Standard scarcity math applies.
export type PickDensityKind =
  | "wraparound"
  | "cluster"
  | "isolated"
  | "normal";

export type PickScheduleEntry = {
  pick_no: number; // overall pick number across the draft
  round: number;
  pick_label: string; // e.g. "9.10"
  // Picks BETWEEN this user pick and the previous/next user pick (not
  // counting the user picks themselves). 0 = back-to-back wraparound.
  // Infinity if no previous (this is your first remaining pick) or no
  // next (this is your last pick).
  gap_to_prev: number;
  gap_to_next: number;
  density_kind: PickDensityKind;
};

// Parsed starter slots from league.roster_positions. Single source of
// truth for "does this league even roster position X?" and "how many
// starters at X are required?" Consumers should use `hard` for the
// fill-starter-hole badge math; flex counts are separate roster needs.
export type StarterSlots = {
  // Hard position slots. A player in this slot must match the position
  // exactly. Includes K/DST only if the league actually rosters them.
  hard: Record<Position, number>;
  // Generic FLEX slots (RB/WR/TE eligible).
  flex: number;
  // Superflex slots (QB/RB/WR/TE eligible).
  superflex: number;
  // WR/TE-only flex (rare, e.g. TE-premium reward formats).
  rec_flex: number;
  // Total bench slots.
  bench: number;
};

export type LeagueSnapshot = {
  league_id: string;
  season: string;
  total_teams: number;
  format: LeagueFormat;
  /**
   * League-type classification from Sleeper's league.settings.type:
   * 0 = redraft, 1 = keeper, 2 = dynasty. Drives keeper-aware
   * cornerstone-count logic in trade analysis.
   */
  league_type: "redraft" | "keeper" | "dynasty";
  /** Maximum keepers in a keeper league; null for redraft and dynasty. */
  max_keepers: number | null;
  scoring: LeagueScoring[];
  starter_slots: StarterSlots;
  rosters: RosterSnapshot[];
  my_roster_id: number | null;
  // Draft state at moment of snapshot. May be no_draft.
  draft: {
    status: DraftState["status"];
    type: DraftState["type"];
    rounds: number;
    reversal_round: number | null;
    slot_to_roster_id: Record<number, number>;
    my_slot: number | null;
    next_pick_no: number | null;
    picks_made: DraftPickRecord[];
    // All league traded picks (current + future seasons). Used for
    // characterization signals like "punted this season for futures."
    traded_picks: TradedPick[];
    // The user's remaining pick schedule with density classifications.
    // First entry is the user's NEXT pick (or current pick if on the
    // clock). Empty when no draft is active or the user is unowned.
    my_pick_schedule: PickScheduleEntry[];
  };
  // Pre-computed convenience aggregates for likelihood modifiers + openings
  agg: {
    teams_without_position_after_round: (
      position: Position,
      round: number,
    ) => number;
    avg_position_count: (position: Position) => number;
  };
};

// Superflex slot variants. Sleeper sometimes returns "SUPERFLEX",
// "SF", or "Q_FLEX" instead of the canonical "SUPER_FLEX". Keep
// this list in sync with the parser in `parseStarterSlots`. A drift
// here silently mis-formats the league (the SF QB starter bug class).
const SUPERFLEX_SLOT_VARIANTS = new Set([
  "SUPER_FLEX",
  "SUPERFLEX",
  "SF",
  "Q_FLEX",
]);

function detectFormat(league: SleeperLeague): LeagueFormat {
  const positions = league.roster_positions ?? [];
  if (positions.some((p) => SUPERFLEX_SLOT_VARIANTS.has(p.toUpperCase()))) {
    return "superflex";
  }
  const qbCount = positions.filter((p) => p === "QB").length;
  if (qbCount >= 2) return "2qb";
  return "1qb";
}

function classifyDensity(
  gapToPrev: number,
  gapToNext: number,
  totalTeams: number,
): PickDensityKind {
  // Wraparound: 0 or 1 picks between yours. Snake-turn back-to-back.
  if (gapToPrev <= 1 || gapToNext <= 1) return "wraparound";
  // Cluster: tight grouping (within ~half a round). Catch-up window
  // means you don't need to grab everything at this pick.
  const clusterThreshold = Math.max(6, Math.floor(totalTeams / 2));
  if (gapToPrev <= clusterThreshold || gapToNext <= clusterThreshold) {
    return "cluster";
  }
  // Isolated: long wait both directions. No refill window. Defensive
  // play: grab whatever's fragile now before the long wait.
  if (gapToPrev > totalTeams && gapToNext > totalTeams) return "isolated";
  return "normal";
}

function pickLabel(pickNo: number, totalTeams: number): string {
  const round = Math.ceil(pickNo / totalTeams);
  const within = ((pickNo - 1) % totalTeams) + 1;
  return `${round}.${within}`;
}

// Enumerate the user's REMAINING picks across the full draft, accounting
// for traded picks (in or out). Returns sorted by pick_no with gap +
// density classification baked in. Empty when no draft, no slot, or
// nothing left to pick.
function buildMyPickSchedule(
  draftState: DraftState,
  season: string,
): PickScheduleEntry[] {
  if (
    draftState.status === "no_draft" ||
    draftState.my_roster_id == null ||
    draftState.next_pick_no == null ||
    draftState.rounds <= 0 ||
    draftState.total_teams <= 0
  ) {
    return [];
  }
  const myRosterId = draftState.my_roster_id;
  const totalTeams = draftState.total_teams;
  const rounds = draftState.rounds;
  const reversalRound = draftState.reversal_round;
  const draftType = draftState.type;
  const nextPickNo = draftState.next_pick_no;

  // roster_id → original draft slot
  const rosterToSlot = new Map<number, number>();
  for (const [slotStr, rid] of Object.entries(
    draftState.slot_to_roster_id,
  )) {
    rosterToSlot.set(rid, Number(slotStr));
  }

  // Trade overrides keyed by (round, original_owner_roster_id) for
  // THIS season only. Future-season traded picks are handled elsewhere.
  const ownerOverride = new Map<string, number>();
  for (const tp of draftState.traded_picks) {
    if (tp.season !== season) continue;
    ownerOverride.set(`${tp.round}:${tp.original_owner}`, tp.current_owner);
  }

  const picks: PickScheduleEntry[] = [];
  for (let round = 1; round <= rounds; round++) {
    for (let rosterId = 1; rosterId <= totalTeams; rosterId++) {
      const originalSlot = rosterToSlot.get(rosterId);
      if (originalSlot == null) continue;
      const overrideKey = `${round}:${rosterId}`;
      const currentOwner = ownerOverride.get(overrideKey) ?? rosterId;
      if (currentOwner !== myRosterId) continue;
      const pickNo = pickNoForSlot(originalSlot, round, totalTeams, {
        type: draftType,
        reversalRound,
      });
      if (pickNo < nextPickNo) continue;
      picks.push({
        pick_no: pickNo,
        round,
        pick_label: pickLabel(pickNo, totalTeams),
        gap_to_prev: Infinity,
        gap_to_next: Infinity,
        density_kind: "normal",
      });
    }
  }

  picks.sort((a, b) => a.pick_no - b.pick_no);

  for (let i = 0; i < picks.length; i++) {
    const prev = i > 0 ? picks[i - 1] : null;
    const next = i < picks.length - 1 ? picks[i + 1] : null;
    const gapPrev = prev
      ? picks[i].pick_no - prev.pick_no - 1
      : Infinity;
    const gapNext = next
      ? next.pick_no - picks[i].pick_no - 1
      : Infinity;
    picks[i].gap_to_prev = gapPrev;
    picks[i].gap_to_next = gapNext;
    picks[i].density_kind = classifyDensity(gapPrev, gapNext, totalTeams);
  }

  return picks;
}

// Parse league.roster_positions into structured starter-slot counts.
// Every downstream "how many starters at X does this league need?"
// consumer should read this rather than hardcode a default.
function parseStarterSlots(league: SleeperLeague): StarterSlots {
  const positions = league.roster_positions ?? [];
  const hard: Record<Position, number> = {
    QB: 0,
    RB: 0,
    WR: 0,
    TE: 0,
    K: 0,
    DST: 0,
  };
  let flex = 0;
  let superflex = 0;
  let rec_flex = 0;
  let bench = 0;
  for (const raw of positions) {
    const p = raw.toUpperCase();
    if (p === "QB") hard.QB++;
    else if (p === "RB") hard.RB++;
    else if (p === "WR") hard.WR++;
    else if (p === "TE") hard.TE++;
    else if (p === "K") hard.K++;
    else if (p === "DEF" || p === "DST") hard.DST++;
    else if (p === "FLEX" || p === "WRRB_FLEX" || p === "RB_WR") flex++;
    else if (p === "SUPER_FLEX" || p === "SUPERFLEX" || p === "SF") superflex++;
    else if (p === "REC_FLEX" || p === "WRTE_FLEX") rec_flex++;
    else if (p === "BN") bench++;
    // Skip IR, TAXI, and IDP slots (DL/LB/DB/IDP_FLEX etc). Not modeled.
  }
  return { hard, flex, superflex, rec_flex, bench };
}

function detectScoring(league: SleeperLeague): LeagueScoring[] {
  const out: LeagueScoring[] = [];
  const s = league.scoring_settings ?? {};
  const rec = typeof s.rec === "number" ? s.rec : 0;
  if (rec >= 1) out.push("PPR");
  else if (rec >= 0.4) out.push("half-PPR");
  else out.push("standard");
  const teRec = typeof s.bonus_rec_te === "number" ? s.bonus_rec_te : 0;
  if (teRec >= 0.4) out.push("TE-premium");
  return out;
}

function emptyPositionCounts(): Record<Position, number> {
  return { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 };
}

function emptyPositionRanks(): Record<Position, number[]> {
  return { QB: [], RB: [], WR: [], TE: [], K: [], DST: [] };
}

function asNumber(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function normalizePosition(raw: string | null | undefined): Position | null {
  if (!raw) return null;
  const u = raw.toUpperCase();
  if (u === "DEF") return "DST";
  return FANTASY_POSITIONS.includes(u as Position) ? (u as Position) : null;
}

export async function buildLeagueSnapshot(args: {
  league: SleeperLeague;
  rosters: SleeperRoster[];
  users: SleeperLeagueUser[];
  draftState: DraftState;
  mySleeperUserId: string | null;
  // Optional: per-player last-season stats (Sleeper /stats endpoint).
  // When provided, the starter_talent_score blends production with
  // rank for a more honest expected-2026 signal. Falls back to
  // rank-only when absent.
  lastSeasonStats?: Map<string, PlayerSeasonStats>;
  // Optional: per-player ADP across all variants (Sleeper /projections
  // endpoint). When provided, the starter_talent_score uses redraft
  // ADP as the primary "expected this season" signal. Redraft ADP is
  // purpose-built for single-season production and captures trades,
  // injury comebacks, role promotions, and rookies' year-1 outlook
  // automatically. Falls back to search_rank when absent.
  projections?: Map<string, PlayerAdp>;
}): Promise<LeagueSnapshot> {
  const {
    league,
    rosters,
    users,
    draftState,
    mySleeperUserId,
    lastSeasonStats,
    projections,
  } = args;

  // Gather every player ID we need to resolve (rostered + drafted)
  const allPlayerIds = new Set<string>();
  for (const r of rosters) {
    for (const id of r.players ?? []) allPlayerIds.add(id);
  }
  for (const p of draftState.picks_so_far) {
    if (p.player_id) allPlayerIds.add(p.player_id);
  }

  const playerMap = await resolvePlayers([...allPlayerIds]);

  // Owner name lookup
  const userById = new Map<string, string>();
  for (const u of users) {
    const meta = (u.metadata ?? {}) as Record<string, unknown>;
    const name =
      (typeof meta.team_name === "string" && meta.team_name) ||
      u.display_name ||
      `User ${u.user_id}`;
    userById.set(u.user_id, name);
  }

  // Build a roster-id → drafted-player-ids map. During a live draft,
  // Sleeper's roster.players field doesn't reflect picks until the
  // draft completes, so we merge drafted picks in by roster_id to get
  // accurate mid-draft position counts.
  const draftedByRoster = new Map<number, string[]>();
  for (const p of draftState.picks_so_far) {
    if (!p.player_id || typeof p.roster_id !== "number") continue;
    const list = draftedByRoster.get(p.roster_id) ?? [];
    list.push(p.player_id);
    draftedByRoster.set(p.roster_id, list);
  }

  // Total starter slot count for this league's format. Used to size
  // the starter window when computing starter_avg_age per roster
  // (top-N by Sleeper search_rank approximates the deployed lineup).
  const starterSlotsParsed = parseStarterSlots(league);
  const totalStarters =
    Object.values(starterSlotsParsed.hard).reduce((a, b) => a + b, 0) +
    starterSlotsParsed.flex +
    starterSlotsParsed.superflex +
    starterSlotsParsed.rec_flex;

  // Pick the scoring variant matching this league for last-season
  // production lookup. Defaults to PPR which is the most common
  // dynasty scoring; std/half-PPR variants used when explicitly set.
  const scoringStr = (league.scoring_settings ?? {}) as Record<
    string,
    unknown
  >;
  const recPoints =
    typeof scoringStr.rec === "number" ? scoringStr.rec : 1;
  const scoringVariant: "ppr" | "half_ppr" | "std" =
    recPoints >= 0.9
      ? "ppr"
      : recPoints >= 0.4
        ? "half_ppr"
        : "std";

  // Format key for redraft ADP picker. Mirrors the AdpFormatKey shape
  // used by available.ts; we only need the redraft-relevant subset
  // (isSuperflex + scoring) since redraft ADP variants are scoring-
  // specific, not dynasty-specific.
  const positions = league.roster_positions ?? [];
  const isSuperflex = positions.includes("SUPER_FLEX");
  const adpFormatKey = {
    isSuperflex,
    isPpr: scoringVariant === "ppr",
    isHalfPpr: scoringVariant === "half_ppr",
    isTePremium: false,
  };

  // Per-roster snapshots
  const rosterSnapshots: RosterSnapshot[] = rosters.map((r) => {
    const counts = emptyPositionCounts();
    const ranks = emptyPositionRanks();
    const ages: number[] = [];
    // Per-player (rank, age, position, prodScore, redraftAdp) tuples
    // for starter selection. Players without rank+age are excluded
    // (cannot contribute a defensible starter average); prodScore and
    // redraftAdp are null when their respective data is missing.
    const rankedPlayers: Array<{
      rank: number;
      age: number;
      position: Position;
      prodScore: number | null;
      redraftAdp: number | null;
    }> = [];
    const merged = new Set<string>([
      ...(r.players ?? []),
      ...(draftedByRoster.get(r.roster_id) ?? []),
    ]);
    for (const id of merged) {
      const p = playerMap.get(id);
      const pos = normalizePosition(p?.position ?? null);
      if (pos) counts[pos] += 1;
      // search_rank is Sleeper's positional/global ranking. Treat
      // missing or non-positive as "no rank known" and skip; only real
      // ranks contribute to rank_threshold signals.
      if (
        pos &&
        p &&
        typeof p.search_rank === "number" &&
        p.search_rank > 0
      ) {
        ranks[pos].push(p.search_rank);
        if (typeof p.age === "number") {
          const stats = lastSeasonStats?.get(id);
          const adpEntry = projections?.get(id);
          const { value: redraftAdp } = pickRedraftAdpFromVariants(
            adpEntry,
            adpFormatKey,
          );
          rankedPlayers.push({
            rank: p.search_rank,
            age: p.age,
            position: pos,
            prodScore: productionScore(stats, pos, scoringVariant),
            redraftAdp,
          });
        }
      }
      if (p && typeof p.age === "number") ages.push(p.age);
    }
    // Sort each position's rank list ascending so the cheapest "top-N
    // count" check is `arr.filter(r => r <= N).length`.
    for (const pos of FANTASY_POSITIONS) {
      ranks[pos].sort((a, b) => a - b);
    }
    const avg_age =
      ages.length > 0 ? ages.reduce((a, b) => a + b, 0) / ages.length : null;
    // Starter average age: top-N by Sleeper search_rank where N is
    // the league's total starter slot count. Bug 2026-04-29: win-now
    // signal was using whole-roster avg_age, which understated the
    // win-now strength of users who built proven-veteran starters
    // early then stashed rookies on the bench. Top-N-by-rank
    // approximates the deployed lineup; bench rookies don't drag the
    // win-now math down. Falls back to avg_age when a roster has
    // fewer ranked-and-aged players than the starter slot count.
    rankedPlayers.sort((a, b) => a.rank - b.rank);
    const starterPool = rankedPlayers.slice(
      0,
      Math.max(1, totalStarters),
    );
    const starter_avg_age =
      starterPool.length > 0
        ? starterPool.reduce((a, b) => a + b.age, 0) / starterPool.length
        : avg_age;
    // Starter talent score: composite of last-season production +
    // redraft ADP, SLOT-WEIGHTED across top-N starters.
    //
    // Founder feedback 2026-04-29: simple-mean averaging treated
    // "5 elite + 4 mid" the same as "9 balanced mid" which doesn't
    // match how fantasy seasons actually play out. Top-of-lineup
    // ceiling drives weekly delta more than depth does. Slot weights
    // amplify the top starters' contribution:
    //   slot 0 (top rank): 1.5x
    //   slots 1-2:         1.3x
    //   slots 3-5:         1.0x
    //   slots 6+:          0.7x
    //
    // Net effect: a team with Jefferson + McCaffrey + Lamb at top-3
    // gets meaningful credit for that ceiling vs a team whose
    // top-3 are all mid-tier starters, even when their bottom-of-
    // lineup pulls the simple mean toward each other.
    //
    // Per starter, three possible signals:
    //   - prodScore: 0-1 from last-season PPG (position-aware
    //     normalization). Null for rookies / no-history.
    //   - redraftScore: 0-1 from redraft ADP (1 - adp/200, clamped).
    //     Redraft ADP is purpose-built for THIS season's expected
    //     production. It captures trades (Mike Evans-to-SF gets
    //     repriced), injury comebacks (market post-injury outlook),
    //     role promotions (WR2 to WR1 lifts ADP), and rookies'
    //     year-1 outlook in a single signal.
    //   - rankScore: 0-1 from dynasty search_rank. Last-resort
    //     fallback when neither prod nor redraft is available.
    //
    // When prod + redraft both exist: 0.5 * prod + 0.5 * redraft.
    //   Production confirms what they did; redraft confirms what the
    //   market expects this season. Both pointing at "expected 2026
    //   points" from different angles. They double-confirm when
    //   aligned and surface situation changes when divergent.
    //
    // When only redraft exists (rookies, players who missed last
    //   season): use redraft directly. A rookie with redraft ADP 30
    //   reads as 0.85, properly capturing year-1 starter expectation.
    //
    // When only prod exists (rare; redraft missing for an active
    //   producer): use prod directly.
    //
    // When neither exists: fall back to dynasty rank score.
    //
    // Per founder direction 2026-04-29: redraft ADP is purpose-built
    // for win-now ("they're already based on win-now, straight
    // down"). Using it as the primary market signal aligns the
    // talent score with what the chart is actually claiming to
    // measure.
    // Aggressive peak-heavy weighting: top starters dominate the
    // talent score because fantasy weeks are won by ceiling, not
    // depth. 2.5 + 1.8 + 1.8 = 6.1 weight on top-3 vs 0.6*3 + 0.4*3
    // = 3.0 on slots 4-9, so top-3 carry 67 percent of the talent
    // average. Founder feedback 2026-04-29: prior 1.5/1.3 weighting
    // was too gentle; loaded contenders still read as middle of pack
    // because aged mid-tier slot fillers dragged the average down.
    const slotWeight = (slot: number): number => {
      if (slot === 0) return 2.5;
      if (slot < 3) return 1.8;
      if (slot < 6) return 0.6;
      return 0.4;
    };
    const perSlotScores = starterPool.map((x) => {
      const redraftScore =
        x.redraftAdp != null
          ? Math.max(0, 1 - x.redraftAdp / 200)
          : null;
      if (x.prodScore != null && redraftScore != null) {
        return 0.5 * x.prodScore + 0.5 * redraftScore;
      }
      if (redraftScore != null) return redraftScore;
      if (x.prodScore != null) return x.prodScore;
      return Math.max(0, 1 - x.rank / 200);
    });
    const starter_talent_score =
      perSlotScores.length > 0
        ? perSlotScores.reduce(
            (acc, score, idx) => acc + score * slotWeight(idx),
            0,
          ) /
          perSlotScores.reduce(
            (acc, _, idx) => acc + slotWeight(idx),
            0,
          )
        : null;
    const settings = (r.settings ?? {}) as Record<string, unknown>;
    return {
      roster_id: r.roster_id,
      owner_id: r.owner_id,
      owner_name: r.owner_id ? userById.get(r.owner_id) ?? null : null,
      is_me: !!mySleeperUserId && r.owner_id === mySleeperUserId,
      position_counts: counts,
      position_ranks: ranks,
      player_ids: [...merged],
      avg_age,
      starter_avg_age,
      starter_talent_score,
      wins: asNumber(settings.wins),
      losses: asNumber(settings.losses),
      ties: asNumber(settings.ties),
    };
  });

  // Draft picks made, with positions resolved
  const totalTeams = league.total_rosters ?? rosters.length ?? 12;
  const picksMade: DraftPickRecord[] = draftState.picks_so_far
    .filter((p) => p.player_id)
    .map((p) => {
      const player = p.player_id ? playerMap.get(p.player_id) : undefined;
      const round =
        typeof p.round === "number"
          ? p.round
          : Math.ceil((p.pick_no ?? 0) / totalTeams);
      const pickNo = typeof p.pick_no === "number" ? p.pick_no : 0;
      const rosterId =
        typeof p.roster_id === "number" ? p.roster_id : 0;
      return {
        pick_no: pickNo,
        round,
        roster_id: rosterId,
        player_id: p.player_id ?? "",
        position: normalizePosition(player?.position ?? null),
        age: typeof player?.age === "number" ? player.age : null,
        years_exp:
          typeof player?.years_exp === "number" ? player.years_exp : null,
      };
    });

  const myRoster = rosterSnapshots.find((r) => r.is_me) ?? null;
  const myRosterId = myRoster?.roster_id ?? null;

  // Aggregates
  function teams_without_position_after_round(
    position: Position,
    round: number,
  ): number {
    // Rosters that have NOT drafted ≥1 player at `position` in rounds 1..round.
    const rostersWithPosition = new Set<number>();
    for (const p of picksMade) {
      if (p.round <= round && p.position === position) {
        rostersWithPosition.add(p.roster_id);
      }
    }
    return totalTeams - rostersWithPosition.size;
  }

  function avg_position_count(position: Position): number {
    if (rosterSnapshots.length === 0) return 0;
    const total = rosterSnapshots.reduce(
      (sum, r) => sum + r.position_counts[position],
      0,
    );
    return total / rosterSnapshots.length;
  }

  // League-type per Sleeper convention: settings.type 0=redraft,
  // 1=keeper, 2=dynasty. Default to dynasty if unset (most common
  // case for the user's existing leagues).
  const settingsRaw = (league.settings ?? {}) as Record<string, unknown>;
  const settingsType =
    typeof settingsRaw["type"] === "number"
      ? (settingsRaw["type"] as number)
      : 2;
  const leagueType: "redraft" | "keeper" | "dynasty" =
    settingsType === 0
      ? "redraft"
      : settingsType === 1
        ? "keeper"
        : "dynasty";
  const maxKeepers =
    leagueType === "keeper" && typeof settingsRaw["max_keepers"] === "number"
      ? (settingsRaw["max_keepers"] as number)
      : null;

  return {
    league_id: league.league_id,
    season: league.season,
    total_teams: totalTeams,
    format: detectFormat(league),
    league_type: leagueType,
    max_keepers: maxKeepers,
    scoring: detectScoring(league),
    starter_slots: parseStarterSlots(league),
    rosters: rosterSnapshots,
    my_roster_id: myRosterId,
    draft: {
      status: draftState.status,
      type: draftState.type,
      rounds: draftState.rounds,
      reversal_round: draftState.reversal_round,
      slot_to_roster_id: draftState.slot_to_roster_id,
      my_slot: draftState.my_slot,
      next_pick_no: draftState.next_pick_no,
      picks_made: picksMade,
      traded_picks: draftState.traded_picks,
      my_pick_schedule: buildMyPickSchedule(draftState, league.season),
    },
    agg: {
      teams_without_position_after_round,
      avg_position_count,
    },
  };
}

export function getMyRoster(
  snapshot: LeagueSnapshot,
): RosterSnapshot | null {
  if (snapshot.my_roster_id == null) return null;
  return (
    snapshot.rosters.find((r) => r.roster_id === snapshot.my_roster_id) ?? null
  );
}
