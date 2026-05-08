/**
 * Stage adaptation: which surface dominates the hub render.
 *
 * Per design principle 2 (never feels generic) and the redesign IA:
 * the seven hub surfaces (Bridge, The Call, The Track Record, The
 * Team You're Building, The Field, The Coach, The Library) rotate
 * primacy based on FORMAT and STAGE. Pre-draft hub looks different
 * from a 7th-round-mid-pick hub. Late-round emphasizes "what's still
 * interesting" over "starter need urgent." Post-draft pivots to in-
 * season trade leverage.
 *
 * This module is a pure function. Hub server component calls it,
 * then renders surfaces in the returned order. Visual design layers
 * on top.
 */

import type { LeagueSnapshot } from "@/lib/strategy/league-state/snapshot";

export type SurfaceId =
  | "bridge"
  | "the_call"
  | "track_record"
  | "team_identity"
  | "the_field"
  | "the_coach"
  | "the_library";

export type StageId =
  | "pre_draft"
  | "early_draft"
  | "mid_draft"
  | "late_draft"
  | "post_draft"
  | "in_season"
  | "playoffs";

export type SurfaceLayout = {
  // Visible surfaces in render order. Bridge always first; others
  // ordered by primacy for the current stage.
  order: SurfaceId[];
  // The single "hero" surface for the current stage. Renders larger
  // / first / with full decoration. Other visible surfaces render
  // compact.
  hero: SurfaceId;
  // Stage classification, surfaced for telemetry and per-stage copy.
  stage: StageId;
  // Format hints that downstream surfaces can read for register
  // adaptation (e.g., keeper math chips, SF QB framing).
  format: {
    is_dynasty: boolean;
    is_keeper: boolean;
    is_redraft: boolean;
    is_superflex: boolean;
    is_te_premium: boolean;
    max_keepers: number | null;
  };
};

const EARLY_DRAFT_ROUND_CAP = 4;
const MID_DRAFT_ROUND_CAP = 9;

export function selectSurfaceLayout(args: {
  snap: LeagueSnapshot;
  // Optional override (e.g., the user navigated directly to the
  // library; pin it as hero for that view). The hub default flow
  // omits this.
  forced_hero?: SurfaceId;
}): SurfaceLayout {
  const { snap, forced_hero } = args;
  const stage = classifyStage(snap);
  const format = readFormat(snap);
  const order = orderForStage(stage);
  const hero = forced_hero ?? order[1] ?? order[0];
  return {
    order,
    hero,
    stage,
    format,
  };
}

function classifyStage(snap: LeagueSnapshot): StageId {
  const status = snap.draft.status;
  // Pre-draft: draft not yet started. Use Team Identity preview +
  // Library + The Field.
  if (status === "pre_draft" || status === "no_draft") return "pre_draft";
  // Active draft: classify by the user's progress through the
  // total rounds. Round-based rather than overall-pick-based so
  // odd league sizes work.
  if (status === "drafting" || status === "paused") {
    const myRoster = snap.rosters.find((r) => r.is_me);
    const myPicksMade = myRoster
      ? snap.draft.picks_made.filter(
          (p) => p.roster_id === myRoster.roster_id,
        ).length
      : 0;
    const totalRounds = snap.draft.rounds || 1;
    const roundFraction = myPicksMade / totalRounds;
    if (roundFraction <= EARLY_DRAFT_ROUND_CAP / totalRounds) {
      return "early_draft";
    }
    if (roundFraction <= MID_DRAFT_ROUND_CAP / totalRounds) {
      return "mid_draft";
    }
    return "late_draft";
  }
  // Draft complete. Pivot to in-season vs post-draft by NFL state
  // when available; otherwise default to post_draft (off-season).
  if (status === "complete") {
    return "post_draft";
  }
  return "post_draft";
}

function readFormat(snap: LeagueSnapshot): SurfaceLayout["format"] {
  return {
    is_dynasty: snap.league_type === "dynasty",
    is_keeper: snap.league_type === "keeper",
    is_redraft: snap.league_type === "redraft",
    is_superflex: snap.format === "superflex" || snap.format === "2qb",
    is_te_premium: snap.scoring.includes("TE-premium"),
    max_keepers: snap.max_keepers ?? null,
  };
}

function orderForStage(stage: StageId): SurfaceId[] {
  // Bridge is always first (header). Other surfaces order by primacy.
  // Per the redesign spec:
  //   pre-draft: Team Identity preview + Library + The Field
  //   early draft (1-4): The Call dominates
  //   mid draft (5-9): The Call + Track Record split
  //   late draft (10+): Track Record + The Field promote
  //   post-draft: Track Record locked + Team Identity featured
  //   in-season: The Field dominates
  //   playoffs: Team Identity (ContenderOutlook) + The Field
  switch (stage) {
    case "pre_draft":
      return [
        "bridge",
        "team_identity",
        "the_library",
        "the_field",
        "track_record",
        "the_call",
        "the_coach",
      ];
    case "early_draft":
      return [
        "bridge",
        "the_call",
        "track_record",
        "team_identity",
        "the_field",
        "the_coach",
        "the_library",
      ];
    case "mid_draft":
      return [
        "bridge",
        "the_call",
        "track_record",
        "the_field",
        "team_identity",
        "the_coach",
        "the_library",
      ];
    case "late_draft":
      return [
        "bridge",
        "track_record",
        "the_field",
        "the_call",
        "team_identity",
        "the_coach",
        "the_library",
      ];
    case "post_draft":
      return [
        "bridge",
        "track_record",
        "team_identity",
        "the_field",
        "the_library",
        "the_coach",
        "the_call",
      ];
    case "in_season":
      return [
        "bridge",
        "the_field",
        "team_identity",
        "track_record",
        "the_library",
        "the_coach",
        "the_call",
      ];
    case "playoffs":
      return [
        "bridge",
        "team_identity",
        "the_field",
        "track_record",
        "the_library",
        "the_coach",
        "the_call",
      ];
  }
}
