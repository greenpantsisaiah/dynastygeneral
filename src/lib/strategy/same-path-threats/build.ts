/**
 * Same-Path Threats. Given the user's committed path (or their top
 * lean), find the top 3 opponents whose roster + posture suggests
 * they're competing for the same archetype.
 *
 * The killer dynasty insight (founder note 2026-04-24): "which 3
 * players am I most at risk of competing for the same strategy
 * right now?" Free tier sees the names + structural reason; the
 * future Pro hook is "Get deeper intel on this opponent" (LLM-
 * powered per-opponent read of their roster + likely next picks).
 *
 * Server-side, no LLM. Cheap to render every page load.
 */

import type { LeagueSnapshot, RosterSnapshot } from "@/lib/strategy/league-state/snapshot";
import type {
  Archetype,
  ArchetypeCategory,
  RankedArchetype,
} from "@/lib/strategy/archetypes/schema";
import type { OpponentCharacterization, TeamLean } from "@/lib/strategy/opponents/characterize";
import type { ActivePathCommitment } from "@/lib/strategy/path-commitment/types";

export type SamePathThreat = {
  roster_id: number;
  owner_name: string;
  // 0-100 threat score. Higher = more likely competing for the
  // same path. Composed of position-overlap + horizon-alignment
  // signals.
  score: number;
  // Tier label so UI can color-code.
  tier: "primary" | "watch" | "potential";
  // 1-2 short reasons, e.g. ["Same posture (win-now)", "Already 2 RBs"]
  reasons: string[];
};

export type SamePathThreats = {
  // Echo of which archetype these threats are computed against, so
  // the UI can render "Threats to your QB Cartel path" correctly.
  archetype_id: string;
  archetype_name: string;
  archetype_category: ArchetypeCategory;
  threats: SamePathThreat[];
};

const CATEGORY_TO_POSITION: Partial<Record<ArchetypeCategory, "QB" | "RB" | "WR" | "TE">> = {
  "QB Strategy": "QB",
  "RB Strategy": "RB",
  "WR Strategy": "WR",
  "TE Strategy": "TE",
  "Positional Leverage": "QB", // QB Cartel lives here
};

// Win-now-leaning vs win-future-leaning. Used to align horizons
// between user's archetype and opponent's posture.
const NOW_LEANS: TeamLean[] = ["win_now", "lean_win_now"];
const FUTURE_LEANS: TeamLean[] = ["win_future", "lean_win_future"];

const SCORE_POSITION_OVERLAP = 50; // opponent owns 1+ at the path's primary position
const SCORE_POSITION_HEAVY = 25; // opponent owns 2+ at the path's primary position
const SCORE_HORIZON_MATCH = 25; // opponent's lean aligns with archetype's horizon

const TIER_PRIMARY = 70;
const TIER_WATCH = 40;

export function buildSamePathThreats(args: {
  snap: LeagueSnapshot;
  archetype: Archetype;
  opponentCharacterizations: OpponentCharacterization[];
}): SamePathThreats {
  const { snap, archetype, opponentCharacterizations } = args;
  const primaryPosition = CATEGORY_TO_POSITION[archetype.category];

  const archetypeIsNow = archetype.horizon >= 25;
  const archetypeIsFuture = archetype.horizon <= -25;

  const opps = opponentCharacterizations.filter((c) => !c.is_me);
  const meRoster = snap.rosters.find((r) => r.is_me);

  const scored: SamePathThreat[] = opps
    .map((opp): SamePathThreat | null => {
      const oppRoster = snap.rosters.find((r) => r.roster_id === opp.roster_id);
      if (!oppRoster) return null;
      let score = 0;
      const reasons: string[] = [];

      // Position-overlap signal. If the path is RB Strategy and the
      // opponent already has 2+ RBs, they're chasing the same
      // position bucket regardless of their stated lean.
      if (primaryPosition) {
        const oppCount = oppRoster.position_counts[primaryPosition] ?? 0;
        if (oppCount >= 2) {
          score += SCORE_POSITION_OVERLAP + SCORE_POSITION_HEAVY;
          reasons.push(
            `Already ${oppCount} ${primaryPosition}s on roster`,
          );
        } else if (oppCount >= 1 && countsRelativeToYou(oppRoster, meRoster, primaryPosition)) {
          score += SCORE_POSITION_OVERLAP;
          reasons.push(`Has ${oppCount} ${primaryPosition} (matches your lean)`);
        }
      }

      // Horizon-alignment signal. Same-direction posture (both
      // win-now, or both win-future) means they're chasing the same
      // window. Hybrid opponents are skipped here.
      if (
        opp.confidence >= 0.35 &&
        ((archetypeIsNow && NOW_LEANS.includes(opp.lean)) ||
          (archetypeIsFuture && FUTURE_LEANS.includes(opp.lean)))
      ) {
        score += SCORE_HORIZON_MATCH;
        reasons.push(
          `Same posture (${opp.lean.replace("_", "-").replace("lean-", "")})`,
        );
      }

      if (score === 0) return null;

      const tier =
        score >= TIER_PRIMARY
          ? "primary"
          : score >= TIER_WATCH
            ? "watch"
            : "potential";

      return {
        roster_id: opp.roster_id,
        owner_name: opp.owner_name,
        score: Math.min(100, score),
        tier,
        reasons,
      };
    })
    .filter((t): t is SamePathThreat => t !== null);

  scored.sort((a, b) => b.score - a.score);
  return {
    archetype_id: archetype.id,
    archetype_name: archetype.name,
    archetype_category: archetype.category,
    threats: scored.slice(0, 3),
  };
}

/**
 * Per-path competition: threats grouped by EACH viable archetype the
 * user is leaning toward, not just one stale commit. Per cross-panel
 * decision framework (dynasty pro voice, 2026-04-24): real managers
 * track threats per-path pre-commitment (they're shopping); single-
 * path view only matches the post-commit defending state. Pinning to
 * first-clicked archetype made the panel stale on paths the user has
 * since explored.
 *
 * Shape decision (per framework):
 *   - >=2 viable paths (viability >= MIN_VIABLE): render multi-path
 *   - one dominant path (>=DOMINANT_VIABILITY) + others <FALLBACK_VIABILITY:
 *     collapse to single-path view (auto-detected by render layer)
 *   - committed path moves to top of sort order; only suppresses
 *     other paths when its viability gap exceeds DOMINANCE_GAP
 */

const MIN_VIABLE_PATH = 60;
const DOMINANT_PATH = 75;
const DOMINANCE_GAP = 20;
const MAX_PATHS_RENDERED = 3;

export type PathCompetition = {
  // Each viable path with its threats. Ordered by sort priority:
  // committed path first (if any), then by viability descending.
  paths: SamePathThreats[];
  // True when one path dominates and the others are weak enough that
  // the renderer should collapse to a single-path view. Lets the UI
  // choose richer per-path layout vs. flatter single-path layout
  // without re-deriving the rule.
  dominant_path_id: string | null;
};

export function buildPathCompetition(args: {
  snap: LeagueSnapshot;
  ranked: RankedArchetype[];
  opponentCharacterizations: OpponentCharacterization[];
  commitment: ActivePathCommitment | null;
}): PathCompetition | null {
  const { snap, ranked, opponentCharacterizations, commitment } = args;
  if (ranked.length === 0) return null;

  const committedId = commitment?.commitment.archetype_id ?? null;
  const committedRanked = committedId
    ? ranked.find((r) => r.archetype.id === committedId) ?? null
    : null;

  // Pull viable candidates. Always include the committed path even if
  // it has slipped below the viability bar (the user has explicitly
  // signaled interest; respect that).
  const viable = ranked
    .filter((r) => r.total_score * 100 >= MIN_VIABLE_PATH)
    .filter((r) => r.archetype.id !== committedId);
  const ordered: RankedArchetype[] = committedRanked
    ? [committedRanked, ...viable]
    : viable;

  // Single-path collapse heuristic: top path is dominant AND no
  // runner-up is itself viable. The render layer respects this by
  // only showing the top path with richer treatment.
  const top = ordered[0];
  const second = ordered[1];
  const topPct = top ? top.total_score * 100 : 0;
  const secondPct = second ? second.total_score * 100 : 0;
  const dominantPath =
    top && topPct >= DOMINANT_PATH && (!second || secondPct < MIN_VIABLE_PATH)
      ? top.archetype.id
      : null;

  // Hard cap rendered paths. After committed-or-top, fill with viable
  // until cap. Suppress non-committed paths beyond MAX_PATHS_RENDERED.
  // If committed path's viability dominates the viable set by more
  // than DOMINANCE_GAP, also suppress the others.
  let pathsToRender = ordered.slice(0, MAX_PATHS_RENDERED);
  if (committedRanked) {
    const committedPct = committedRanked.total_score * 100;
    const otherTopPct = ordered[1]
      ? ordered[1].total_score * 100
      : 0;
    if (committedPct - otherTopPct >= DOMINANCE_GAP) {
      pathsToRender = [committedRanked];
    }
  }

  const built = pathsToRender
    .map((r) =>
      buildSamePathThreats({
        snap,
        archetype: r.archetype,
        opponentCharacterizations,
      }),
    )
    .filter((spt) => spt.threats.length > 0);

  if (built.length === 0) return null;

  return {
    paths: built,
    dominant_path_id: dominantPath,
  };
}

/**
 * "Counts relative to you" check. An opponent with the same number
 * of position X as the user (e.g. both have 1 RB) isn't really a
 * threat at THIS pick; both are still building. We only mark them
 * as threat when their count exceeds yours OR ties when both have 2+.
 */
function countsRelativeToYou(
  opp: RosterSnapshot,
  me: RosterSnapshot | undefined,
  position: "QB" | "RB" | "WR" | "TE",
): boolean {
  const oppCount = opp.position_counts[position] ?? 0;
  const meCount = me ? (me.position_counts[position] ?? 0) : 0;
  return oppCount > meCount || (oppCount >= 2 && oppCount === meCount);
}
