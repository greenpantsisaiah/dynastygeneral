/**
 * Taxi advisability (CANONICAL).
 *
 * `taxi_eligible` answers a LEAGUE-RULES question: is this player allowed
 * on the taxi squad (within the taxi_years experience cutoff, not already
 * parked, league has taxi). It is purely mechanical.
 *
 * `taxi_advisable` answers a FOOTBALL question: SHOULD this player be on
 * the taxi squad, or does he project to contribute to your active roster
 * this year? The taxi squad makes a player unstartable. Stashing a player
 * who is ascending into a real role wastes the exact season his value
 * shows up. The squad is for developmental players you can afford to wait
 * on, not players climbing into a Week-1 job.
 *
 * Founder report 2026-05-28 (izzydabomb): Coach recommended taxiing Jayden
 * Higgins, who ran 56% snaps / 4 tgt/g as a rookie and is on path to
 * compete for WR2 at Houston this year. Coach used his RISING role as the
 * REASON to taxi him. That logic is inverted: a rising or established role
 * is a reason to keep a player ACTIVE. This signal encodes that.
 *
 * Three triggers steer an eligible player OFF taxi (advisable = false):
 *   1. Established role last year (snap share / targets above a real-role
 *      bar). He already contributes.
 *   2. Rising role year over year (canonical readOpportunity trend). He is
 *      ascending into a bigger role.
 *   3. Projected startable this year (redraft ADP within a contributor
 *      band). The market expects year-1 production.
 *
 * When none trigger, the player is a genuine dev stash and taxi_advisable
 * mirrors taxi_eligible. Pure function; no fetch. Locked by
 * evals/taxi-advisable.test.ts.
 *
 * ── INTERIM: TRACKED FORKED BUILD (converge in Phase D) ──────────────
 * This is a KNOWN architectural exception, logged as C4a in
 * MODEL_LIVE_PLAN.md. It deliberately reaches into raw opportunity +
 * redraft ADP and applies ABSOLUTE thresholds, which violates two
 * invariants: (1) the evaluation-engine contract "NO consumer reaches
 * into raw signals; read EvaluationOutput" (src/lib/engine/evaluation),
 * and (2) the roster-fit "rank-based, not absolute thresholds /
 * no-hardcoded-number" rule (src/lib/engine/roster-fit.ts).
 *
 * Why it exists anyway: evaluate() cannot make the "near-term contributor"
 * call yet (the player_signals opportunity columns it would read are 0%
 * populated, per the Phase A4 truth audit), and the canonical startable
 * tier is dynasty-VALUE ranked, so it misses low-value-but-ascending
 * players like the Higgins case this signal exists to catch.
 *
 * CONVERGENCE CONTRACT: when Phase D adds a near-term contributor / year-1
 * role signal to EvaluationOutput (working name `near_term_role`), delete
 * the three thresholds below and have assessTaxiAdvisable consume that
 * field (via EnrichedPlayer), so board + Coach + taxi share ONE
 * "contributor this year" projection. Fail-loud tracked by
 * evals/taxi-advisable-convergence.test.ts, which breaks CI the moment
 * that field lands. The INTERIM-MARKER string below is asserted by that
 * test; do not remove it without converging the consumer.
 *
 * INTERIM-MARKER: taxi-advisable-forked-build-C4a
 */

import type { OpportunityProfile } from "@/lib/players/season-stats";
import { readOpportunity } from "@/lib/players/opportunity-read";

// INTERIM ABSOLUTE THRESHOLDS (see C4a above). These three constants are
// the forked-build's hardcoded numbers. They are slated for deletion when
// the near-term-contributor signal moves into evaluate(); until then they
// are the deliberate, tracked exception to the no-hardcoded-number rule.

// A 50%+ snap share last season is a real, startable role: the player was
// on the field for most of his team's offensive snaps. Below that is a
// rotational / developmental footprint that a taxi stash can wait on.
const ESTABLISHED_SNAP_SHARE = 0.5;

// 3.5+ targets per game is a real pass-game role (a flex-startable WR/TE
// floor). Used as the fallback level check when snap share is absent.
const ESTABLISHED_TARGETS_PG = 3.5;

// Redraft ADP at or earlier than this is the market projecting a this-year
// contributor (roughly the startable depth of a 12-team league across
// QB/RB/WR/TE). Coarse single cutoff rather than a per-format table; the
// established-role + rising triggers carry the precise cases, and this is
// the safety net for the "rookie drafted into an immediate job" shape that
// has no prior-year usage to read. Refine when we have per-format
// startable-depth ground truth.
const REDRAFT_STARTABLE_ADP = 150;

export type TaxiAdvisability = {
  /**
   * True when the player is a sensible taxi stash: eligible AND without a
   * near-term (established / rising / projected) active-roster role. False
   * when he should stay on the active roster, or when he is not eligible.
   */
  advisable: boolean;
  /**
   * One-line rationale. For advisable === false on an eligible player, this
   * is the "keep him active because..." reason Coach cites. For a genuine
   * stash, it states why the stash is safe. For an ineligible player it
   * says so.
   */
  reason: string;
};

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Assess whether a taxi-eligible player SHOULD be taxied. Pure over the
 * already-resolved prior-season profiles + format-matched redraft ADP.
 *
 * `prevOpportunity` / `prevPrevOpportunity` are the canonical
 * OpportunityProfiles for the two most recent seasons (null when the
 * player has no role data that year: a rookie, an injury year). The trend
 * call is delegated to the canonical `readOpportunity` so chat, the
 * inflection scorecard, and this signal cite one trend.
 */
export function assessTaxiAdvisable(args: {
  taxiEligible: boolean;
  prevOpportunity: OpportunityProfile | null;
  prevPrevOpportunity: OpportunityProfile | null;
  /** Format-matched redraft ADP (lower = earlier). Null when unprojected. */
  redraftAdp: number | null;
}): TaxiAdvisability {
  const { taxiEligible, prevOpportunity, prevPrevOpportunity, redraftAdp } =
    args;

  // Not eligible: advisability is moot. Say so plainly.
  if (!taxiEligible) {
    return { advisable: false, reason: "not taxi-eligible" };
  }

  // Trigger 1: established role last year (startable-caliber usage).
  if (
    prevOpportunity?.snap_share != null &&
    prevOpportunity.snap_share >= ESTABLISHED_SNAP_SHARE
  ) {
    return {
      advisable: false,
      reason: `established a real role last year (${pct(
        prevOpportunity.snap_share,
      )} snaps); starting-caliber usage belongs on your active roster, not stashed where it cannot be started`,
    };
  }
  if (
    prevOpportunity?.targets_per_game != null &&
    prevOpportunity.targets_per_game >= ESTABLISHED_TARGETS_PG
  ) {
    return {
      advisable: false,
      reason: `ran a real pass-game role last year (${round1(
        prevOpportunity.targets_per_game,
      )} tgt/g); keep him active rather than stashing a contributor where he cannot be started`,
    };
  }

  // Trigger 2: rising role year over year (ascending into a bigger job).
  const read = readOpportunity({
    prev: prevOpportunity,
    prevPrev: prevPrevOpportunity,
  });
  if (read?.trend === "rising") {
    return {
      advisable: false,
      reason: `role is rising year over year (${read.detail}); he is ascending into a bigger role, so keep him active rather than taxiing him`,
    };
  }

  // Trigger 3: projected startable this year (market win-now read).
  if (redraftAdp != null && redraftAdp <= REDRAFT_STARTABLE_ADP) {
    return {
      advisable: false,
      reason: `redraft ADP ${Math.round(
        redraftAdp,
      )} projects him as a this-year contributor; taxiing him makes him unstartable during the season his production shows up`,
    };
  }

  // No near-term role: a genuine developmental stash.
  return {
    advisable: true,
    reason:
      "no established, rising, or projected near-term role; safe to stash on taxi without losing active-roster production",
  };
}
