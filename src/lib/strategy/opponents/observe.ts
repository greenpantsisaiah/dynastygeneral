/**
 * Opponent observations. For each opposing team, characterize their
 * draft behavior with named patterns and concrete evidence.
 *
 * Stage A signals (no ADP / rookie data yet):
 *   - position concentration (multi-pick at same position)
 *   - early-round position lean (RB-first, WR-first)
 *   - aging-vet picks vs youth picks (uses player.age)
 *   - team-stack patterns (multi picks from same NFL team)
 *
 * Each observation cites the picks that drove it. The user can read
 * the evidence and judge for themselves. same "show your work"
 * principle as Pick Approach predictions.
 *
 * Aggregate league-wide observations are emitted separately so the
 * panel can show "the room is RB-heavy" alongside per-team reads.
 */

import type {
  DraftPickRecord,
  LeagueSnapshot,
} from "../league-state/snapshot";
import type { Position } from "../archetypes/schema";

const POSITION_LABEL: Record<Position, string> = {
  QB: "QB",
  RB: "RB",
  WR: "WR",
  TE: "TE",
  K: "K",
  DST: "DST",
};

export type ObservationSeverity = "info" | "notable";

export type Observation = {
  id: string; // stable per-team
  pattern_name: string; // short label e.g. "QB Cartel forming"
  severity: ObservationSeverity;
  evidence: string[]; // bullet list of concrete picks that drove this
};

export type TradeAngleStance = "approach" | "extract" | "avoid";

export type TradeAngle = {
  id: string;
  stance: TradeAngleStance; // approach: trade WITH them; extract: take advantage; avoid: don't deal here
  headline: string; // one-line take, e.g. "Don't trade picks for their veterans"
  rationale: string; // one-line why
};

export type TeamObservation = {
  roster_id: number;
  owner_name: string;
  picks_count: number;
  observations: Observation[];
  trade_angles: TradeAngle[];
};

export type LeagueAggregate = {
  total_picks: number;
  position_breakdown: Partial<Record<Position, number>>;
  notes: string[];
};

export type OpponentReadout = {
  teams: TeamObservation[];
  league: LeagueAggregate;
};

function picksFor(snap: LeagueSnapshot, rosterId: number): DraftPickRecord[] {
  return snap.draft.picks_made
    .filter((p) => p.roster_id === rosterId)
    .sort((a, b) => a.pick_no - b.pick_no);
}

function observePositionConcentration(
  picks: DraftPickRecord[],
): Observation | null {
  if (picks.length < 3) return null;
  const counts: Partial<Record<Position, number>> = {};
  for (const p of picks) {
    if (!p.position) continue;
    counts[p.position] = (counts[p.position] ?? 0) + 1;
  }
  for (const [pos, c] of Object.entries(counts)) {
    if (c == null) continue;
    if (c >= 3 && c / picks.length >= 0.5) {
      const positionPicks = picks.filter((p) => p.position === pos);
      return {
        id: `concentration-${pos}`,
        pattern_name: `${pos} stockpile forming`,
        severity: "notable",
        evidence: [
          `${c} of ${picks.length} picks at ${pos} (${Math.round((c / picks.length) * 100)}% concentration)`,
          ...positionPicks
            .slice(0, 3)
            .map((p) => `Pick ${p.round}.${((p.pick_no - 1) % 12) + 1} ${pos}`),
        ],
      };
    }
  }
  return null;
}

function observeEarlyRoundLean(
  picks: DraftPickRecord[],
): Observation | null {
  const earlyPicks = picks.filter((p) => p.round <= 2);
  if (earlyPicks.length < 2) return null;
  const counts: Partial<Record<Position, number>> = {};
  for (const p of earlyPicks) {
    if (!p.position) continue;
    counts[p.position] = (counts[p.position] ?? 0) + 1;
  }
  // If 2+ early-round picks at one position, flag it
  for (const [pos, c] of Object.entries(counts)) {
    if (c == null) continue;
    if (c >= 2) {
      return {
        id: `early-${pos}`,
        pattern_name: `${pos}-first build`,
        severity: "notable",
        evidence: [
          `${c} of first ${earlyPicks.length} picks at ${pos}`,
          `Suggests a ${pos === "RB" ? "win-now contender" : pos === "QB" ? "QB Cartel or anchor build" : "position-anchored"} build`,
        ],
      };
    }
  }
  return null;
}

function observeAgeSkew(
  picks: DraftPickRecord[],
  ages: number[],
): Observation | null {
  if (ages.length < 2) return null;
  const avg = ages.reduce((a, b) => a + b, 0) / ages.length;
  const young = ages.filter((a) => a <= 23).length;
  const aging = ages.filter((a) => a >= 28).length;

  if (avg <= 23.5 && young >= Math.ceil(ages.length * 0.6)) {
    return {
      id: "age-young",
      pattern_name: "Youth bet. rebuild posture",
      severity: "notable",
      evidence: [
        `${young} of ${ages.length} drafted players ≤23 (avg age ${avg.toFixed(1)})`,
        `Rebuild or future-window posture`,
      ],
    };
  }
  if (avg >= 27 && aging >= Math.ceil(ages.length * 0.5)) {
    return {
      id: "age-aging",
      pattern_name: "Aging-vet bet. all-in posture",
      severity: "notable",
      evidence: [
        `${aging} of ${ages.length} drafted players ≥28 (avg age ${avg.toFixed(1)})`,
        `Win-now posture; little future capital after this season`,
      ],
    };
  }
  return null;
}

function observeNoSignal(
  picks: DraftPickRecord[],
): Observation | null {
  // If the team has 3+ picks but no concentration/lean/age skew, flag as
  // potential "Vanilla" themselves. they're your peer in purgatory.
  if (picks.length < 3) return null;
  const positions = new Set(picks.map((p) => p.position).filter(Boolean));
  if (positions.size === picks.length) {
    return {
      id: "no-signal",
      pattern_name: "Vanilla / no clear lane",
      severity: "info",
      evidence: [
        `${picks.length} picks at ${positions.size} different positions. no concentration`,
        `Balanced but undirected. easy trade target if you commit to a lane`,
      ],
    };
  }
  return null;
}

// Per-opponent trade angles. Reads observed roster shape + draft posture
// and produces 0+ actionable takes ("trade with X for Y", "don't deal
// picks here", "their RB1 is fragile, target the handcuff"). All takes
// must cite a concrete signal so the user can sanity-check.
//
// Stage A operates on what's in picks_made + roster.avg_age. When per-
// player NFL teams + injury history thread through, we can add real
// handcuff identification ("their RB1 has missed 8+ games over 2 yrs").
function buildTradeAngles(
  picks: DraftPickRecord[],
  ages: number[],
  myShortages: Position[],
  format: LeagueSnapshot["format"],
): TradeAngle[] {
  const out: TradeAngle[] = [];
  if (picks.length < 2) return out;

  const counts: Partial<Record<Position, number>> = {};
  for (const p of picks) {
    if (!p.position) continue;
    counts[p.position] = (counts[p.position] ?? 0) + 1;
  }
  const total = picks.length;
  const isSuperflex = format === "superflex" || format === "2qb";

  // Saturated position → likely sells excess, especially if I need it.
  for (const pos of ["QB", "RB", "WR", "TE"] as Position[]) {
    const c = counts[pos] ?? 0;
    if (c >= 3 && c / total >= 0.5) {
      const iNeed = myShortages.includes(pos);
      out.push({
        id: `extract-${pos}`,
        stance: iNeed ? "approach" : "extract",
        headline: iNeed
          ? `Approach for ${POSITION_LABEL[pos]}: they're saturated and you need it`
          : `${POSITION_LABEL[pos]}-saturated · likely sells depth at a discount`,
        rationale: `${c} of ${total} picks at ${POSITION_LABEL[pos]}. surplus is real`,
      });
      break; // only one saturation angle per team
    }
  }

  // Position deficit. "Below starter need" = the team is fragile and
  // would likely overpay to fill the gap. Threshold is starter-need
  // per position: QB=2 in superflex (else 1), RB=2, WR=3, TE=1.
  if (total >= 3) {
    const starterNeeds: Record<Position, number> = {
      QB: isSuperflex ? 2 : 1,
      RB: 2,
      WR: 3,
      TE: 1,
      K: 0,
      DST: 0,
    };
    for (const pos of ["QB", "RB", "WR", "TE"] as Position[]) {
      const have = counts[pos] ?? 0;
      const need = starterNeeds[pos];
      // Severity tiers: 0 of need = "starter spot empty"; below need = "depth-thin."
      if (need > 0 && have === 0) {
        out.push({
          id: `target-${pos}-fragile`,
          stance: "extract",
          headline: `0 ${POSITION_LABEL[pos]} after ${total} picks · starter spot empty, may overpay`,
          rationale: `Could ship them a mid-tier ${POSITION_LABEL[pos]} for an inflated price`,
        });
        break;
      }
      if (need >= 2 && have === need - 1) {
        out.push({
          id: `target-${pos}-thin`,
          stance: "extract",
          headline: `${have}/${need} starter ${POSITION_LABEL[pos]}s · thin, vulnerable to a sale`,
          rationale: `Below starter need at ${POSITION_LABEL[pos]}. price-sensitive trade open`,
        });
        break;
      }
    }
  }

  // Aging build → no future capital. Don't trade picks for their vets.
  if (ages.length > 0) {
    const avg = ages.reduce((a, b) => a + b, 0) / ages.length;
    if (avg >= 27) {
      out.push({
        id: "avoid-aging",
        stance: "avoid",
        headline: `All-in build · don't trade future picks for their veterans`,
        rationale: `Roster avg age ${avg.toFixed(1)}. the equity expires fast`,
      });
    } else if (avg <= 23.5) {
      out.push({
        id: "approach-youth",
        stance: "approach",
        headline: `Youth build · they want WIN-NOW pieces, you can sell aging vets here`,
        rationale: `Roster avg age ${avg.toFixed(1)}. their build wants production now`,
      });
    }
  }

  // Vanilla/no-lane build → easy mark on trades the user initiates.
  const distinctPositions = new Set(
    picks.map((p) => p.position).filter(Boolean),
  );
  if (total >= 4 && distinctPositions.size === total) {
    out.push({
      id: "extract-vanilla",
      stance: "extract",
      headline: `Vanilla · no lane to defend, you set the trade price`,
      rationale: `${total} picks at ${distinctPositions.size} positions. undirected`,
    });
  }

  return out;
}

export function buildOpponentReadout(
  snap: LeagueSnapshot,
): OpponentReadout {
  const me = snap.rosters.find((r) => r.is_me);

  // What positions am I short on? Used to upgrade "they're saturated"
  // takes into "approach them, your needs match their surplus."
  const myShortages: Position[] = [];
  if (me) {
    const reqs: Record<Position, number> = {
      QB: snap.format === "superflex" || snap.format === "2qb" ? 2 : 1,
      RB: 2,
      WR: 3,
      TE: 1,
      K: 0,
      DST: 0,
    };
    for (const pos of ["QB", "RB", "WR", "TE"] as Position[]) {
      if (me.position_counts[pos] < reqs[pos]) myShortages.push(pos);
    }
  }

  const teams: TeamObservation[] = [];
  // Player ID → age lookup for opposing teams. Built from snapshot's
  // per-roster player_ids + the original rosters (which include player
  // metadata via the snapshot builder's age extraction). We approximate
  // by scanning picks_made and pulling roster avg_age as proxy.
  for (const roster of snap.rosters) {
    if (me && roster.roster_id === me.roster_id) continue;
    const picks = picksFor(snap, roster.roster_id);
    if (picks.length === 0) continue;

    const ages: number[] = roster.avg_age != null ? [roster.avg_age] : [];
    // Extend ages with per-pick if available (avg is a coarse proxy;
    // in Stage B we'll thread per-player ages through the snapshot).

    const obs: Observation[] = [];
    const c = observePositionConcentration(picks);
    if (c) obs.push(c);
    const e = observeEarlyRoundLean(picks);
    if (e) obs.push(e);
    const a = observeAgeSkew(picks, ages);
    if (a) obs.push(a);
    if (obs.length === 0) {
      const n = observeNoSignal(picks);
      if (n) obs.push(n);
    }

    // Priority: avoid (warnings) first so user doesn't walk into bad
    // deals; then approach (angles aligned with my needs); then extract
    // (opportunistic). Cap at 3 to keep the panel readable.
    const STANCE_PRIORITY: Record<TradeAngleStance, number> = {
      avoid: 0,
      approach: 1,
      extract: 2,
    };
    const tradeAngles = buildTradeAngles(picks, ages, myShortages, snap.format)
      .sort((a, b) => STANCE_PRIORITY[a.stance] - STANCE_PRIORITY[b.stance])
      .slice(0, 3);

    if (obs.length > 0 || tradeAngles.length > 0) {
      teams.push({
        roster_id: roster.roster_id,
        owner_name: roster.owner_name ?? `Roster ${roster.roster_id}`,
        picks_count: picks.length,
        observations: obs,
        trade_angles: tradeAngles,
      });
    }
  }

  // League aggregate
  const positionBreakdown: Partial<Record<Position, number>> = {};
  for (const p of snap.draft.picks_made) {
    if (!p.position) continue;
    positionBreakdown[p.position] = (positionBreakdown[p.position] ?? 0) + 1;
  }
  const total = snap.draft.picks_made.length;
  const notes: string[] = [];
  for (const [pos, c] of Object.entries(positionBreakdown)) {
    if (c == null || total === 0) continue;
    const share = c / total;
    if (share >= 0.4) {
      notes.push(
        `${POSITION_LABEL[pos as Position]} dominating draft. ${c}/${total} picks (${Math.round(share * 100)}%)`,
      );
    }
  }
  // If no single position dominates, comment if the spread is even
  if (notes.length === 0 && total >= 8) {
    notes.push(
      `Balanced position split across ${Object.keys(positionBreakdown).length} positions. no clear league-wide lean`,
    );
  }

  return {
    teams: teams.sort((a, b) => b.observations.length - a.observations.length),
    league: {
      total_picks: total,
      position_breakdown: positionBreakdown,
      notes,
    },
  };
}
