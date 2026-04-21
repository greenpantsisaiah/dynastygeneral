/**
 * Live likelihood engine. For each archetype, compute the live gamble
 * likelihood and per-risk likelihood by applying base + active
 * modifiers against the league snapshot.
 *
 * Modifier rationale strings can include {{n}} and {{total}} tokens -
 * those get substituted with real numbers from the snapshot so the UI
 * shows e.g. "7/12 teams still QB-less after Rd 2" instead of a
 * generic blurb.
 *
 * Stage A status:
 *   ✓ league_position_scarcity_after_round (deterministic)
 *   ✓ league_format_match
 *   ✓ user_owns_top_n_at_position
 *   ✓ opposing_position_depth_avg
 *   ⏸ opposing_archetype_overlap → Stage B (counter-intel layer)
 *   ⏸ weeks_into_season → in-season; returns inactive in Stage A
 */

import type {
  ActiveModifier,
  Archetype,
  Gamble,
  LikelihoodModifier,
  LiveLikelihood,
  Risk,
} from "../archetypes/schema";
import {
  getMyRoster,
  type LeagueSnapshot,
} from "../league-state/snapshot";

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function tpl(str: string, vars: Record<string, string | number>): string {
  return str.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    key in vars ? String(vars[key]) : `{{${key}}}`,
  );
}

type ModifierResult = {
  active: boolean;
  rationale?: string;
  delta: number;
};

function evalModifier(
  mod: LikelihoodModifier,
  snap: LeagueSnapshot,
): ModifierResult {
  switch (mod.kind) {
    case "league_position_scarcity_after_round": {
      // Two-state evaluation:
      //   historical: teams that had 0 of `position` at end of `round`.
      //              this is the qualifying signal that ever fired.
      //   current:   teams currently below "starter need" at `position`.
      //              a team that filled the gap no longer creates leverage.
      //
      // Decay the boost by current/historical. If all originally-short
      // teams covered themselves, the boost dies. If half still are
      // short, half the boost. This kills the "6/12 QB-less after R2"
      // ghost-leverage that persisted into round 14 even though all 12
      // teams had 3+ QBs.
      const nextPick = snap.draft.next_pick_no ?? Infinity;
      const passedRound = nextPick > mod.round * snap.total_teams;
      if (!passedRound) return { active: false, delta: 0 };
      const historical = snap.agg.teams_without_position_after_round(
        mod.position,
        mod.round,
      );
      if (historical < mod.threshold_teams_without)
        return { active: false, delta: 0 };

      // Current "starter need" threshold: 2 QB in superflex, else 1.
      // For RB/WR/TE we use 1 (any count below would-be starter slot).
      const isSuperflexQB =
        mod.position === "QB" &&
        (snap.format === "superflex" || snap.format === "2qb");
      const currentThreshold = isSuperflexQB ? 2 : 1;
      const currentShort = snap.rosters.filter(
        (r) => r.position_counts[mod.position] < currentThreshold,
      ).length;

      // Decay factor: 1.0 when current matches historical, 0 when none.
      const decay = historical > 0 ? Math.min(1, currentShort / historical) : 0;
      const effectiveDelta = mod.delta * decay;
      // Below 0.01 is rounding noise; treat as inactive so the UI
      // doesn't show a "+0%" line that confuses the reader.
      if (effectiveDelta < 0.01) return { active: false, delta: 0 };

      // Rationale shifts as the window closes:
      //   wide open (current >= historical): use original template
      //   narrowing  (current < historical): "X were short; Y still are"
      const rationale =
        currentShort >= historical
          ? tpl(mod.rationale, {
              n: historical,
              total: snap.total_teams,
            })
          : `${historical} were short at R${mod.round}; ${currentShort} still are. window closing (boost decayed ${Math.round(decay * 100)}%)`;

      return {
        active: true,
        delta: effectiveDelta,
        rationale,
      };
    }
    case "league_format_match": {
      if (snap.format !== mod.format) return { active: false, delta: 0 };
      return { active: true, delta: mod.delta, rationale: mod.rationale };
    }
    case "user_owns_top_n_at_position": {
      const me = getMyRoster(snap);
      if (!me) return { active: false, delta: 0 };
      const have = me.position_counts[mod.position];
      if (have < mod.n) return { active: false, delta: 0 };
      return {
        active: true,
        delta: mod.delta,
        rationale: tpl(mod.rationale, { n: have }),
      };
    }
    case "opposing_position_depth_avg": {
      const me = getMyRoster(snap);
      // Average over OTHER rosters
      const others = snap.rosters.filter(
        (r) => !me || r.roster_id !== me.roster_id,
      );
      if (others.length === 0) return { active: false, delta: 0 };
      const avg =
        others.reduce((sum, r) => sum + r.position_counts[mod.position], 0) /
        others.length;
      let triggers = false;
      if (mod.below_threshold != null && avg < mod.below_threshold)
        triggers = true;
      if (mod.above_threshold != null && avg > mod.above_threshold)
        triggers = true;
      if (!triggers) return { active: false, delta: 0 };
      return {
        active: true,
        delta: mod.delta,
        rationale: tpl(mod.rationale, { avg: avg.toFixed(2) }),
      };
    }
    case "opposing_archetype_overlap":
      // Stage B. counter-intel layer not wired yet.
      return { active: false, delta: 0 };
    case "weeks_into_season":
      // In-season; ignored during draft. When season starts, we'll resolve
      // current week from NFL state and evaluate.
      return { active: false, delta: 0 };
  }
}

export function computeLiveLikelihood(
  base: number,
  modifiers: LikelihoodModifier[],
  snap: LeagueSnapshot,
): LiveLikelihood {
  const active: ActiveModifier[] = [];
  let net = base;
  for (const mod of modifiers) {
    const r = evalModifier(mod, snap);
    if (!r.active) continue;
    net += r.delta;
    if (r.rationale)
      active.push({ rationale: r.rationale, delta: r.delta });
  }
  return {
    pct: clamp01(net),
    base,
    active_modifiers: active,
  };
}

export function liveGamble(
  gamble: Gamble,
  snap: LeagueSnapshot,
): LiveLikelihood {
  return computeLiveLikelihood(
    gamble.base_likelihood,
    gamble.likelihood_modifiers,
    snap,
  );
}

export function liveRisks(
  risks: Risk[],
  snap: LeagueSnapshot,
): Array<{ statement: string; live: LiveLikelihood }> {
  return risks.map((r) => ({
    statement: r.statement,
    live: computeLiveLikelihood(r.base_likelihood, r.likelihood_modifiers, snap),
  }));
}

export function enrichArchetypeLikelihoods(
  a: Archetype,
  snap: LeagueSnapshot,
): {
  live_gamble: LiveLikelihood;
  live_risks: Array<{ statement: string; live: LiveLikelihood }>;
} {
  return {
    live_gamble: liveGamble(a.the_gamble, snap),
    live_risks: liveRisks(a.the_risks, snap),
  };
}
