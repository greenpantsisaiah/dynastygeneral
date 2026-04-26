/**
 * Scout scoring. Given a roster's player ids and the league context,
 * produce a composite team-strength score plus structured highlights
 * the verdict LLM can cite specifically.
 *
 * Server-only. Pulls from the player cache (cached 24h) so we can
 * score 6+ leagues for the same user without hammering Sleeper.
 *
 * Scoring approach (v1):
 *   - dynasty_value per player: max(0, 250 - dynasty_rank), where
 *     dynasty_rank uses the same heuristic as available.ts
 *     (search_rank × age_factor × position_factor).
 *   - team_value = sum of dynasty values across rostered players.
 *   - starter_completeness: 0..1 share of hard starter slots filled.
 *   - composite score = team_value × (0.7 + 0.3 × starter_completeness).
 *   - Verdict highlights: best 3 players, worst gap (slot with no
 *     starter-grade option), age skew (avg age vs target band),
 *     record (if mid-season).
 *
 * Not perfect. Sleeper's search_rank skews toward NFL relevance, not
 * dynasty value. KTC integration is a future fix. But this gives us
 * a defensible relative ranking across someone's leagues, which is
 * what the scout page needs.
 */

import { resolvePlayers } from "@/lib/players/cache";
import { ageFactor, positionFactor } from "@/lib/players/age-curve";
import {
  FUTURE_PICK_VALUE_BY_ROUND,
  SUPERFLEX_PICK_MULTIPLIER,
  computeOwnedFuturePicks,
  resolveRookieRounds,
  totalFuturePickValue,
  valueForFuturePick,
} from "@/lib/players/future-picks";
import type {
  SleeperLeague,
  SleeperRoster,
  SleeperLeagueUser,
} from "@/lib/sleeper/schemas";
import { buildLeagueSnapshot, getMyRoster } from "@/lib/strategy/league-state/snapshot";
import { rankArchetypes } from "@/lib/strategy/ranking/rank";
import { computeWindows } from "@/lib/strategy/windows/compute";
import { computeContenderForecast } from "@/lib/strategy/contender-outlook/forecast";
import {
  buildFormatRulesFromRosterPositions,
  type FormatRules,
} from "@/lib/engine/llm-contract";
import type { DraftState } from "@/lib/sleeper/draft-state";
import {
  walkLeagueHistory,
  type PriorSeasonSummary,
} from "@/lib/sleeper/history";

export type ScoutPlayerSummary = {
  id: string;
  name: string;
  position: string | null;
  team: string | null;
  age: number | null;
  search_rank: number;
  dynasty_value: number;
};

// Strategy intelligence derived from the same engine that powers the
// active league hub. Lets the scout cards say "Productive Tank, 78%
// drift" instead of just "score 1490."
export type ScoutStrategy = {
  // Top archetype the team is drifting toward, with drift % and phase.
  // Null when no archetype passes the visibility threshold (vanilla).
  top_path: {
    id: string;
    name: string;
    category: string;
    drift_pct: number; // 0..100
    horizon: number; // -100..+100
    phase: "acquisition" | "executing";
  } | null;
  // Coherence: how decisive the strategic posture is. "high" = clear
  // path commitment. "low" = vanilla, no lane.
  coherence: "high" | "medium" | "low" | "none";
  // Window scores 0..100 + horizon lean (which window is winning).
  win_now: number;
  future_value: number;
  horizon_lean: "win_now" | "future" | "balanced";
};

// Cross-portfolio superlative. Set in a post-pass after all teams are
// scored. At most one badge per team. "Best in class at X" is the
// brand voice the user asked for.
export type ScoutSuperlative = {
  label: string; // e.g. "MOST WIN-NOW"
  metric: string; // e.g. "win-now 82/100"
};

export type ScoutTeamScore = {
  // Inputs
  league_id: string;
  league_name: string;
  league_format: "1qb" | "2qb" | "superflex";
  // Operational format rules derived from roster_positions + scoring.
  // Single source of truth for "does QB2 start?", "is TE-premium?",
  // "what's the WR starter ceiling?" so the verdict LLM never has to
  // infer format from raw counts. Per cross-endpoint LLM-contract
  // pillar in INVARIANTS.md.
  format_rules: FormatRules;
  season: string;
  status: string | null;
  total_rosters: number;
  // Team identity
  owner_name: string;
  team_name: string;
  // Composite
  composite_score: number; // 0..1000ish, higher = stronger
  team_value: number; // raw sum of dynasty values
  starter_completeness: number; // 0..1
  avg_age: number | null;
  record: { wins: number; losses: number; ties: number } | null;
  // Highlights for the verdict LLM
  top_players: ScoutPlayerSummary[]; // best 3 by dynasty_value
  worst_gap: { position: string; have: number; need: number } | null;
  // Bench depth signal
  roster_size: number;
  // Per-position counts at hard starters (display only)
  position_counts: Record<string, number>;
  // Required starters per position from league.roster_positions. Lets
  // the verdict LLM judge depth against the league requirement
  // instead of guessing from raw counts.
  starter_needs: Record<string, number>;
  // Per-position adequacy label, computed against starter_needs and
  // (when present) the team's strategy archetype's primary lever +
  // exemplar threshold. The verdict prompt MUST trust this rather
  // than freelance positional depth from raw counts. Stops the
  // "5 RBs in an RB Committee = razor thin" misread.
  //   thin:     count below starter_needs (real deficit)
  //   adequate: starter_needs to starter_needs+2 (covered, not deep)
  //   deep:     starter_needs+3 or more (real depth past starters)
  //   core:     this is the strategy's PRIMARY position AND the count
  //             meets the archetype's exemplar threshold (e.g. 5+ RBs
  //             in RB Committee). NOT a depth concern, the lever.
  position_adequacy: Record<string, "thin" | "adequate" | "deep" | "core">;
  // Build phase, derived from roster size. Affects how we frame the
  // card and what the verdict LLM is told. Strategy still runs at every
  // phase since the same engine that powers the hub handles thin rosters.
  //   empty:    0 players. No signal beyond format.
  //   drafting: mid-build, signal is partial but strategy lean is real.
  //   active:   full enough to evaluate normally.
  build_phase: "empty" | "drafting" | "active";
  // Strategy intelligence. Null only when the snapshot/rank pipeline
  // genuinely produced no signal (empty roster or pipeline error).
  strategy: ScoutStrategy | null;
  // Cross-portfolio "best in class" badge. Filled in by computeSuperlatives
  // after all teams are scored. Null when this team isn't top of any
  // category by a meaningful margin.
  superlative: ScoutSuperlative | null;
  // Future draft picks owned by this roster, aggregated per (season,
  // round). Default 1 per round per future season for own slot, plus
  // acquired picks, minus traded-away picks. Empty when traded_picks
  // data is unavailable. The verdict prompt MUST reference these when
  // describing a team that's "punted current value for futures." Stops
  // the LLM from hallucinating "no picks yet" for future-loaded teams.
  future_picks: { season: string; round: number; count: number }[];
  // Total dynasty-equivalent value of owned future picks. Folds into
  // composite_score so a future-stash team isn't scored last just
  // because their roster is light.
  future_pick_value: number;
  // Prior-season summaries from walking previous_league_id. Most
  // recent first, up to 3 seasons back. Empty when this league has no
  // prior chain (new startup) or fetch failed. Lets the verdict cite
  // history: "you won 2024, finished 6-7 in 2025."
  prior_seasons: PriorSeasonSummary[];
  // Compact 5-year contender outlook summary. Lets the verdict tie its
  // take to forward trajectory ("you're a bubble team this year but
  // project to peak Contender in 2028-2029, so don't sell the picks").
  // Null when snapshot/outlook compute failed for this team.
  outlook_summary: {
    peak_year: string;
    peak_score: number;
    peak_tier: "rebuild" | "bubble" | "contender";
    contender_window: { first: string; last: string } | null;
  } | null;
};

const DYNASTY_VALUE_CEILING = 250;

// Archetype id → primary position + the count at which that position
// is "core" (the strategy's whole point, not a depth concern). Used
// to label position_adequacy correctly so verdict prose doesn't call
// the strategy's exemplar count "razor thin." Mirrors the catalog's
// exemplar_profiles thresholds, kept here to avoid pulling the full
// catalog into the scout layer.
const ARCHETYPE_PRIMARY: Record<
  string,
  { position: "QB" | "RB" | "WR" | "TE"; core_min: number }
> = {
  "qb-cartel-anchor": { position: "QB", core_min: 3 },
  "qb-late-streamer": { position: "QB", core_min: 1 },
  "qb-volume-replacement": { position: "QB", core_min: 2 },
  "rb-bellcow-anchor": { position: "RB", core_min: 4 },
  "rb-committee": { position: "RB", core_min: 5 },
  "rb-robust": { position: "RB", core_min: 3 }, // 3+ top-12 RBs = core
  "rb-zero-recovery": { position: "WR", core_min: 6 }, // depth pivot to WR
  "wr-anchor-and-volume": { position: "WR", core_min: 5 },
  "wr-stockpiler": { position: "WR", core_min: 6 },
  "te-premium-anchor": { position: "TE", core_min: 1 },
  "te-tandem": { position: "TE", core_min: 2 },
  "te-streamer": { position: "TE", core_min: 1 },
};

function adequacyForPosition(
  position: "QB" | "RB" | "WR" | "TE",
  count: number,
  starterNeed: number,
  primaryArchetypeId: string | null,
): "thin" | "adequate" | "deep" | "core" {
  // Position not rostered as a starter slot: defer to depth labels.
  if (starterNeed <= 0) {
    if (count >= 3) return "deep";
    if (count >= 1) return "adequate";
    return "thin";
  }
  // Strategy primary position: "core" once the archetype's exemplar
  // count is met. This is the "5 RBs in RB Committee" case the verdict
  // was previously calling razor thin.
  if (primaryArchetypeId) {
    const primary = ARCHETYPE_PRIMARY[primaryArchetypeId];
    if (primary && primary.position === position && count >= primary.core_min) {
      return "core";
    }
  }
  if (count < starterNeed) return "thin";
  if (count <= starterNeed + 2) return "adequate";
  return "deep";
}

function computeDynastyRank(
  searchRank: number,
  age: number | null,
  position: string | null,
  isSuperflex: boolean,
): number {
  // Position-specific age curve + tier-aware SF QB premium live in
  // `@/lib/players/age-curve` (single source of truth across surfaces).
  return (
    searchRank *
    ageFactor(position, age) *
    positionFactor(position, isSuperflex, searchRank)
  );
}

function detectFormat(league: SleeperLeague): "1qb" | "2qb" | "superflex" {
  const positions = league.roster_positions ?? [];
  if (positions.includes("SUPER_FLEX")) return "superflex";
  const qbCount = positions.filter((p) => p === "QB").length;
  if (qbCount >= 2) return "2qb";
  return "1qb";
}

function parseStarterSlots(league: SleeperLeague): Record<string, number> {
  const positions = league.roster_positions ?? [];
  const hard: Record<string, number> = {
    QB: 0,
    RB: 0,
    WR: 0,
    TE: 0,
    K: 0,
    DST: 0,
  };
  for (const raw of positions) {
    const p = raw.toUpperCase();
    if (p === "QB") hard.QB++;
    else if (p === "RB") hard.RB++;
    else if (p === "WR") hard.WR++;
    else if (p === "TE") hard.TE++;
    else if (p === "K") hard.K++;
    else if (p === "DEF" || p === "DST") hard.DST++;
  }
  return hard;
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

// Threshold below which a roster is considered "drafting" (mid-build).
// Strategy + windows still run; the flag just lets the UI/LLM frame the
// team as a partial build whose lean is signal but whose depth is not
// yet judgeable. Below MIN_FOR_DEPTH we don't compete for depth-style
// superlatives (deepest roster, etc.).
const MIN_FOR_FULL_EVAL = 12;
const MIN_FOR_DEPTH = 8;

function deriveStrategy(args: {
  league: SleeperLeague;
  rosters: SleeperRoster[];
  users: SleeperLeagueUser[];
  mySleeperUserId: string;
  draftState: DraftState | null;
}): Promise<ScoutStrategy | null> {
  const { league, rosters, users, mySleeperUserId, draftState } = args;
  return (async () => {
    try {
      if (!draftState) return null;
      const snap = await buildLeagueSnapshot({
        league,
        rosters,
        users,
        draftState,
        mySleeperUserId,
      });
      const ranked = rankArchetypes(snap);
      const windows = computeWindows(snap);
      const top = ranked[0] ?? null;
      const winNow = windows.win_now.score;
      const futureValue = windows.future_value.score;
      const lean: ScoutStrategy["horizon_lean"] =
        winNow - futureValue > 12
          ? "win_now"
          : futureValue - winNow > 12
            ? "future"
            : "balanced";
      // Coherence is the leading archetype's drift score. A team with
      // 0.85+ drift on one path is committed; 0.5-0.85 is leaning;
      // below that is vanilla.
      const coherence: ScoutStrategy["coherence"] = !top
        ? "none"
        : top.drift_score >= 0.85
          ? "high"
          : top.drift_score >= 0.5
            ? "medium"
            : top.drift_score >= 0.25
              ? "low"
              : "none";
      return {
        top_path: top
          ? {
              id: top.archetype.id,
              name: top.archetype.name,
              category: top.archetype.category,
              drift_pct: Math.round(top.drift_score * 100),
              horizon: top.archetype.horizon,
              phase: top.phase ?? "acquisition",
            }
          : null,
        coherence,
        win_now: winNow,
        future_value: futureValue,
        horizon_lean: lean,
      };
    } catch (err) {
      console.error("[scout:strategy]", league.league_id, err);
      return null;
    }
  })();
}

export async function scoreTeamForLeague(args: {
  league: SleeperLeague;
  roster: SleeperRoster;
  rosters: SleeperRoster[];
  users: SleeperLeagueUser[];
  mySleeperUserId: string;
  ownerName: string;
  teamName: string;
  // Pre-resolved draft state for this league. During an active draft,
  // Sleeper returns roster.players === null even though picks have been
  // made; the picks live on draftState.picks_so_far. We merge them in
  // so build_phase + strategy reflect the real roster. Pass null when
  // the league has no active draft (in-season, complete, etc).
  draftState: DraftState | null;
}): Promise<ScoutTeamScore> {
  const {
    league,
    roster,
    rosters,
    users,
    mySleeperUserId,
    ownerName,
    teamName,
    draftState,
  } = args;
  const format = detectFormat(league);
  const isSuperflex = format === "superflex" || format === "2qb";
  // Format rules from roster_positions + scoring (TE-premium detected
  // via bonus_rec_te). Computed here so every per-team summary sent
  // to the verdict LLM ships the canonical FormatRules shape.
  const scoringHighlights: string[] = [];
  const teRecBonus =
    typeof league.scoring_settings?.bonus_rec_te === "number"
      ? league.scoring_settings.bonus_rec_te
      : 0;
  if (teRecBonus >= 0.4) scoringHighlights.push("TE-premium");
  const format_rules = buildFormatRulesFromRosterPositions({
    rosterPositions: league.roster_positions ?? [],
    scoringHighlights,
    isSuperflex,
  });
  // Mirror snapshot.ts: union roster.players (server-of-record after the
  // draft completes) with the live draft picks (only source of truth
  // mid-draft). Either side may be empty; the union is what the team
  // actually owns right now.
  const draftedForRoster: string[] = (draftState?.picks_so_far ?? [])
    .filter(
      (p): p is typeof p & { player_id: string } =>
        p.roster_id === roster.roster_id && typeof p.player_id === "string",
    )
    .map((p) => p.player_id);
  const playerIds = [
    ...new Set<string>([...(roster.players ?? []), ...draftedForRoster]),
  ];
  const playerMap = await resolvePlayers(playerIds);

  // Build per-player summaries with dynasty value
  const summaries: ScoutPlayerSummary[] = [];
  const positionCounts: Record<string, number> = {
    QB: 0,
    RB: 0,
    WR: 0,
    TE: 0,
    K: 0,
    DST: 0,
  };
  const ages: number[] = [];

  for (const id of playerIds) {
    const p = playerMap.get(id);
    if (!p) continue;
    const pos = p.position
      ? p.position.toUpperCase() === "DEF"
        ? "DST"
        : p.position.toUpperCase()
      : null;
    if (pos && positionCounts[pos] != null) positionCounts[pos]++;
    if (typeof p.age === "number") ages.push(p.age);
    const searchRank =
      typeof p.search_rank === "number" && p.search_rank > 0
        ? p.search_rank
        : 9999;
    const dynastyRank = computeDynastyRank(
      searchRank,
      typeof p.age === "number" ? p.age : null,
      pos,
      isSuperflex,
    );
    const dynastyValue = Math.max(0, DYNASTY_VALUE_CEILING - dynastyRank);
    const fullName =
      p.full_name ??
      [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ??
      p.player_id;
    summaries.push({
      id: p.player_id,
      name: fullName || p.player_id,
      position: pos,
      team: p.team ?? null,
      age: typeof p.age === "number" ? p.age : null,
      search_rank: searchRank,
      dynasty_value: dynastyValue,
    });
  }

  // Sort by dynasty value descending; top 3 are the headliners
  summaries.sort((a, b) => b.dynasty_value - a.dynasty_value);
  const team_value = summaries.reduce((sum, p) => sum + p.dynasty_value, 0);
  const top_players = summaries.slice(0, 3);

  // Starter completeness: share of hard starter slots filled by ANY
  // player at that position (not whether they're starter-grade).
  const hardSlots = parseStarterSlots(league);
  let totalNeed = 0;
  let totalFilled = 0;
  let worstGap: ScoutTeamScore["worst_gap"] = null;
  for (const pos of ["QB", "RB", "WR", "TE", "K", "DST"]) {
    const need = hardSlots[pos] ?? 0;
    if (need <= 0) continue;
    totalNeed += need;
    const have = Math.min(positionCounts[pos] ?? 0, need);
    totalFilled += have;
    if (have < need) {
      const gap = need - have;
      if (!worstGap || gap > worstGap.need - worstGap.have) {
        worstGap = { position: pos, have, need };
      }
    }
  }
  const starter_completeness = totalNeed > 0 ? totalFilled / totalNeed : 1;

  const avg_age = ages.length > 0 ? ages.reduce((a, b) => a + b, 0) / ages.length : null;

  const settings = (roster.settings ?? {}) as Record<string, unknown>;
  const wins = num(settings.wins);
  const losses = num(settings.losses);
  const ties = num(settings.ties);
  const record =
    wins + losses + ties > 0 ? { wins, losses, ties } : null;

  // Future-pick capital. Picks owned by this roster across the next
  // three seasons, with each pick discounted by year offset and round.
  // Rounds are drawn from the active rookie draft when available, else
  // a sensible default. Empty when traded_picks data is unavailable.
  const future_picks = draftState
    ? computeOwnedFuturePicks({
        rosterId: roster.roster_id,
        rosterIds: rosters.map((r) => r.roster_id),
        tradedPicks: draftState.traded_picks,
        leagueSeason: league.season,
        rounds: resolveRookieRounds(draftState.rounds),
      })
    : [];
  const formatMultiplier = isSuperflex ? SUPERFLEX_PICK_MULTIPLIER : 1.0;
  const future_pick_value = totalFuturePickValue(
    future_picks,
    league.season,
    formatMultiplier,
  );

  // Prior-season walk. Best-effort; an error here shouldn't fail the
  // whole scout for the team. Cached aggressively per league via the
  // Sleeper client's revalidate setting.
  let prior_seasons: PriorSeasonSummary[] = [];
  try {
    prior_seasons = await walkLeagueHistory({
      currentLeagueId: league.league_id,
      mySleeperUserId,
    });
  } catch (err) {
    console.error("[scout:history]", league.league_id, err);
  }

  // Contender outlook summary. Reuses the snapshot the strategy build
  // already produced (when present). Best-effort; failure leaves the
  // verdict unable to cite trajectory but doesn't break the team.
  // Skip for empty rosters (nothing to project from).
  let outlook_summary: ScoutTeamScore["outlook_summary"] = null;
  if (draftState && playerIds.length > 0) {
    try {
      const snap = await buildLeagueSnapshot({
        league,
        rosters,
        users,
        draftState,
        mySleeperUserId,
      });
      const meSnap = getMyRoster(snap);
      const years = await computeContenderForecast(snap, meSnap);
      if (years.length > 0) {
        const peak = years.reduce(
          (best, y) => (y.score > best.score ? y : best),
          years[0],
        );
        const contenders = years.filter((y) => y.tier === "contender");
        outlook_summary = {
          peak_year: peak.season,
          peak_score: peak.score,
          peak_tier: peak.tier,
          contender_window:
            contenders.length > 0
              ? {
                  first: contenders[0].season,
                  last: contenders[contenders.length - 1].season,
                }
              : null,
        };
      }
    } catch (err) {
      console.error("[scout:outlook]", league.league_id, err);
    }
  }

  // Composite: rostered value scaled by starter completeness PLUS the
  // raw value of owned future picks. Future picks don't fill starting
  // slots so they bypass the completeness multiplier; they're capital,
  // not lineup. Without this term, a team that traded current value
  // for a 2027 pick stash gets rated worst in the portfolio.
  const composite_score =
    team_value * (0.7 + 0.3 * starter_completeness) + future_pick_value;

  const build_phase: ScoutTeamScore["build_phase"] =
    playerIds.length === 0
      ? "empty"
      : playerIds.length < MIN_FOR_FULL_EVAL
        ? "drafting"
        : "active";

  // Strategy intelligence. Always runs. The same snapshot/rank/window
  // pipeline that powers the active hub handles thin rosters gracefully
  // (empty archetype list when no signal, vanilla when low coherence).
  // Skip only for the truly empty case where there's nothing to read.
  const strategy =
    build_phase === "empty"
      ? null
      : await deriveStrategy({
          league,
          rosters,
          users,
          mySleeperUserId,
          draftState,
        });

  // Compute per-position adequacy. This is what the verdict prompt
  // reads to decide whether a position count is "thin" or "core" or
  // "deep" so the LLM doesn't freelance from raw counts.
  const primaryArchetypeId = strategy?.top_path?.id ?? null;
  const position_adequacy: ScoutTeamScore["position_adequacy"] = {};
  for (const pos of ["QB", "RB", "WR", "TE"] as const) {
    position_adequacy[pos] = adequacyForPosition(
      pos,
      positionCounts[pos] ?? 0,
      hardSlots[pos] ?? 0,
      primaryArchetypeId,
    );
  }

  return {
    league_id: league.league_id,
    league_name: league.name,
    league_format: format,
    format_rules,
    season: league.season,
    status: league.status ?? null,
    total_rosters: league.total_rosters ?? 12,
    owner_name: ownerName,
    team_name: teamName,
    composite_score,
    team_value,
    starter_completeness,
    avg_age,
    record,
    top_players,
    worst_gap: worstGap,
    roster_size: playerIds.length,
    position_counts: positionCounts,
    starter_needs: hardSlots,
    position_adequacy,
    build_phase,
    strategy,
    superlative: null, // filled in by computeSuperlatives() post-pass
    future_picks,
    future_pick_value,
    prior_seasons,
    outlook_summary,
  };
}

// ──────────────────────────────────────────────────────────────────
// Cross-portfolio superlatives. Run AFTER all teams are scored. Each
// non-pending team can earn at most one badge: the most distinctive
// thing it tops. Margin checks prevent ties from getting badges (a
// "best at X" badge with no clear leader is noise).
// ──────────────────────────────────────────────────────────────────

type SuperlativeRule = {
  label: string;
  metric: (t: ScoutTeamScore) => string;
  // Selector: returns the score we're maximizing. Higher = wins.
  // Returns null when the team is ineligible for this category.
  select: (t: ScoutTeamScore) => number | null;
  // Min margin over second place to award. Prevents ties.
  min_margin?: number;
};

const SUPERLATIVE_RULES: SuperlativeRule[] = [
  {
    label: "Most win-now",
    metric: (t) => `win-now ${Math.round(t.strategy?.win_now ?? 0)}/100`,
    // Strategy-based; works on drafting teams (the lean is real even
    // when the depth isn't there yet).
    select: (t) =>
      t.build_phase !== "empty" ? (t.strategy?.win_now ?? null) : null,
    min_margin: 8,
  },
  {
    label: "Most future-loaded",
    metric: (t) =>
      `future ${Math.round(t.strategy?.future_value ?? 0)}/100`,
    select: (t) =>
      t.build_phase !== "empty" ? (t.strategy?.future_value ?? null) : null,
    min_margin: 8,
  },
  {
    label: "Most coherent strategy",
    metric: (t) =>
      t.strategy?.top_path
        ? `${t.strategy.top_path.name} · ${t.strategy.top_path.drift_pct}% drift`
        : "no path",
    select: (t) =>
      t.strategy?.coherence === "high" || t.strategy?.coherence === "medium"
        ? (t.strategy.top_path?.drift_pct ?? null)
        : null,
    min_margin: 10,
  },
  {
    label: "Youngest core",
    metric: (t) =>
      t.avg_age != null ? `avg age ${t.avg_age.toFixed(1)}` : "?",
    // Depth-style: only fires once a team has enough players for the
    // average to mean something.
    select: (t) =>
      t.avg_age != null && t.roster_size >= MIN_FOR_DEPTH ? -t.avg_age : null,
    min_margin: 0.5,
  },
  {
    label: "Deepest roster",
    metric: (t) => `team value ${Math.round(t.team_value)}`,
    select: (t) => (t.roster_size >= MIN_FOR_DEPTH ? t.team_value : null),
    min_margin: 200,
  },
  {
    label: "Most pick capital",
    metric: (t) => {
      // Compact pick summary: "4× 2027 R1 + 2× 2028 R1" capped to top 3.
      const top = [...t.future_picks]
        .sort(
          (a, b) =>
            valueForFuturePick(b.round, parseInt(b.season, 10) - parseInt(t.season, 10)) -
            valueForFuturePick(a.round, parseInt(a.season, 10) - parseInt(t.season, 10)),
        )
        .slice(0, 3)
        .map((p) => `${p.count}× ${p.season} R${p.round}`)
        .join(" + ");
      return top || `pick value ${Math.round(t.future_pick_value)}`;
    },
    select: (t) => (t.future_pick_value > 0 ? t.future_pick_value : null),
    // Require ~1.5 R1s of separation. Derived from R1 base so it scales
    // when the calibration moves (instead of silently changing meaning).
    min_margin: 1.5 * (FUTURE_PICK_VALUE_BY_ROUND[1] ?? 100),
  },
];

export function computeSuperlatives(teams: ScoutTeamScore[]): void {
  // Only true-empty teams are excluded from competing. Drafting teams
  // can still earn strategy-based badges (Most win-now, etc.) even if
  // they can't win Deepest Roster.
  const eligible = teams.filter((t) => t.build_phase !== "empty");
  if (eligible.length < 2) return; // need at least 2 to declare a leader

  // Each team can only win ONE category. Walk rules in priority order
  // and award; if a team already has one, skip it for later rules.
  const claimed = new Set<string>();
  for (const rule of SUPERLATIVE_RULES) {
    const ranked = eligible
      .filter((t) => !claimed.has(t.league_id))
      .map((t) => ({ team: t, score: rule.select(t) }))
      .filter(
        (x): x is { team: ScoutTeamScore; score: number } => x.score !== null,
      )
      .sort((a, b) => b.score - a.score);
    if (ranked.length === 0) continue;
    const winner = ranked[0];
    const runner = ranked[1];
    if (runner != null) {
      const margin = winner.score - runner.score;
      if (margin < (rule.min_margin ?? 0)) continue;
    }
    winner.team.superlative = {
      label: rule.label,
      metric: rule.metric(winner.team),
    };
    claimed.add(winner.team.league_id);
  }
}
