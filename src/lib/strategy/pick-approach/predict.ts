/**
 * Picker prediction. For each upcoming picker (current → user pick - 1),
 * infer the position(s) they're most likely to take, with confidence
 * and observable reasons.
 *
 * Stage A reasoning sources (no external data needed):
 *   - roster gaps: positions they have 0 or 1 of
 *   - position concentration: positions they've drafted heavily
 *   - draft pattern: their last 1-2 picks
 *   - format-specific priors: superflex amplifies QB demand, etc.
 *
 * When player rankings + ADP land, we can add reasons like
 * "X player at this slot is below ADP. they may chase value" or
 * "they've followed ADP within ±3 picks all draft."
 */

import type {
  DraftPickRecord,
  LeagueSnapshot,
  RosterSnapshot,
} from "../league-state/snapshot";
import type { Position } from "../archetypes/schema";
import type {
  Forecast,
  PickApproach,
  PickerPosture,
  PickerPrediction,
  PredictionConfidence,
  SurvivingTarget,
} from "./types";
import type { RankedArchetype } from "../archetypes/schema";
import { slotForPickNo } from "@/lib/sleeper/snake";
import type { AvailablePlayer } from "@/lib/players/available";

const SCORING_POSITIONS: Position[] = ["QB", "RB", "WR", "TE"];

const POSITION_LABEL: Record<Position, string> = {
  QB: "QB",
  RB: "RB",
  WR: "WR",
  TE: "TE",
  K: "K",
  DST: "DST",
};

// Format priors. baseline weight a position carries before any
// roster/pattern adjustments. Reflects positional value in startup drafts.
function formatPriors(
  format: LeagueSnapshot["format"],
): Record<Position, number> {
  if (format === "superflex" || format === "2qb") {
    return { QB: 0.35, RB: 0.18, WR: 0.32, TE: 0.1, K: 0, DST: 0 };
  }
  // 1QB
  return { QB: 0.08, RB: 0.3, WR: 0.42, TE: 0.15, K: 0, DST: 0 };
}

function rosterAtSlot(snap: LeagueSnapshot, pickNo: number): number | null {
  const { slot } = slotForPickNo(pickNo, snap.total_teams, {
    type: snap.draft.type ?? "snake",
    reversalRound: snap.draft.reversal_round,
  });
  // Authoritative slot → roster mapping from Sleeper draft metadata.
  // Falls back to sampling picks_made only if the mapping is empty
  // (e.g. pre-draft state where Sleeper hasn't populated it yet).
  const direct = snap.draft.slot_to_roster_id[slot];
  let originalRoster: number | null = direct ?? null;
  if (originalRoster == null) {
    const sample = snap.draft.picks_made.find((p) => {
      const s = slotForPickNo(p.pick_no, snap.total_teams, {
        type: snap.draft.type ?? "snake",
        reversalRound: snap.draft.reversal_round,
      });
      return s.slot === slot;
    });
    originalRoster = sample?.roster_id ?? null;
  }
  if (originalRoster == null) return null;
  // Trade-aware override. Mirrors effectiveRosterIdForPickNo in
  // sleeper/draft-state.ts. Without this, a pick that has been traded
  // away or traded in would still resolve to the original slot owner,
  // which broke "your next pick X (N ahead)" framing in the Decision
  // card when a user sold a future-round pick.
  const round = Math.ceil(pickNo / snap.total_teams);
  for (const t of snap.draft.traded_picks) {
    if (t.season !== snap.season) continue;
    if (t.round !== round) continue;
    if (t.original_owner !== originalRoster) continue;
    return t.current_owner;
  }
  return originalRoster;
}

function pickLabel(pickNo: number, totalTeams: number): string {
  const round = Math.ceil(pickNo / totalTeams);
  const within = ((pickNo - 1) % totalTeams) + 1;
  return `${round}.${within}`;
}

function findMyNextPick(
  snap: LeagueSnapshot,
  _myRosterId: number,
): { pick_no: number; picks_until_me: number } | null {
  // Read from snap.draft.my_pick_schedule, which is the trade-aware
  // source of truth built in buildMyPickSchedule (snapshot.ts). Earlier
  // versions looped with rosterAtSlot which DID NOT respect
  // traded_picks, so a user who sold a future-round pick would see the
  // sold pick as still theirs in the Decision card title (e.g., "2
  // ahead" instead of correct "11 ahead"). The schedule already filters
  // out traded-away picks and includes traded-in picks.
  if (snap.draft.next_pick_no == null) return null;
  const next = snap.draft.my_pick_schedule[0];
  if (!next) return null;
  return {
    pick_no: next.pick_no,
    picks_until_me: next.pick_no - snap.draft.next_pick_no,
  };
}

// Score each position 0..1 for likelihood that this picker takes it.
//
// Mental model: a savvy analyst doesn't reason "they drafted 2 QBs so
// they'll draft another." They reason "they drafted 2 QBs in superflex
// (starters set), so QB only if a clear-value falls (McCarthy-tier
// dart throw). Otherwise they fill the next biggest hole or take BPA."
//
// Rules:
//   1. Below starter need → strong positive (still building the spine)
//   2. At starter need → mild positive (starter-quality depth pick OK)
//   3. One above need → near zero (only with positional value)
//   4. Two+ above need → strong negative (saturated; takes a specific
//      lottery-ticket reason to add more)
//   5. Round depth matters: late rounds (R12+) skew toward depth/dart
//      throws. saturation penalty softens slightly because everyone is
//      taking lottery tickets at that point, but starter-needs still
//      dominate within positions that are below need.
//
// Removed signals (they were inverting good football logic):
//   - "Drafted N already, pattern suggests continued focus" → false
//     above mid-round. drafting more usually means starter-need was
//     the driver, and once met, the picker pivots.
//   - "Just took a position, may double up" → spurious. one pick is
//     not a pattern.
// Recent-pick cascade detection. Counts position picks in the last
// `lookback` picks. Used to surface "TE run forming" pressure that the
// next picker is going to feel.
function detectRecentRun(
  snap: LeagueSnapshot,
  lookback = 5,
): Partial<Record<Position, number>> {
  const counts: Partial<Record<Position, number>> = {};
  if (snap.draft.next_pick_no == null) return counts;
  const cutoff = snap.draft.next_pick_no - lookback;
  for (const p of snap.draft.picks_made) {
    if (p.pick_no < cutoff || p.pick_no >= snap.draft.next_pick_no) continue;
    if (!p.position) continue;
    counts[p.position] = (counts[p.position] ?? 0) + 1;
  }
  return counts;
}

// Pool-depth signal. How many starter-grade players remain at each
// position? Used to predict tier-crunch panic. dynasty_rank ≤ 100 is
// our heuristic for "starter-grade in dynasty terms."
function poolDepthByPosition(
  available: AvailablePlayer[] | undefined,
): Partial<Record<Position, { total: number; starterGrade: number }>> {
  const out: Partial<Record<Position, { total: number; starterGrade: number }>> =
    {};
  if (!available) return out;
  for (const p of available) {
    const pos = (p.position ?? "").toUpperCase() as Position;
    if (!pos) continue;
    const entry = out[pos] ?? { total: 0, starterGrade: 0 };
    entry.total += 1;
    if (p.dynasty_rank <= 100) entry.starterGrade += 1;
    out[pos] = entry;
  }
  return out;
}

// Best-available ADP per position. A late-round pick is far less about
// roster shape than about value-on-board: when a tier-leader (low ADP)
// is sitting past their consensus draft slot, someone grabs them.
// Returns the best (lowest) ADP per position from the available pool.
function bestAdpByPosition(
  available: AvailablePlayer[] | undefined,
): Partial<Record<Position, number>> {
  const out: Partial<Record<Position, number>> = {};
  if (!available) return out;
  for (const p of available) {
    const pos = (p.position ?? "").toUpperCase() as Position;
    if (!pos) continue;
    if (p.adp == null) continue;
    const cur = out[pos];
    if (cur == null || p.adp < cur) out[pos] = p.adp;
  }
  return out;
}

function scorePositions(
  picker: RosterSnapshot,
  snap: LeagueSnapshot,
  startersRequired: Record<Position, number>,
  available?: AvailablePlayer[],
): Record<Position, { score: number; reasons: string[] }> {
  const totalTeams = snap.total_teams;
  const round =
    snap.draft.next_pick_no != null
      ? Math.ceil(snap.draft.next_pick_no / totalTeams)
      : 1;
  const isMidDraft = round >= 4 && round <= 11;
  const isLateDraft = round >= 12;
  const isSuperflex =
    snap.format === "superflex" || snap.format === "2qb";

  // Format priors are useful early ("superflex teams take QBs early").
  // By round 12+ everyone has filled their starter spine; what drives
  // picks is value-on-board, run cascades, and tier crunches. Suppress
  // priors heavily so format bias doesn't drown out those signals.
  // Misses on the TE run came directly from QB:0.35 + WR:0.32 priors
  // dominating when every team was already saturated.
  const priorScale = isLateDraft ? 0.35 : isMidDraft ? 0.7 : 1.0;
  const priors = formatPriors(snap.format);
  const result: Record<Position, { score: number; reasons: string[] }> = {
    QB: { score: priors.QB * priorScale, reasons: [] },
    RB: { score: priors.RB * priorScale, reasons: [] },
    WR: { score: priors.WR * priorScale, reasons: [] },
    TE: { score: priors.TE * priorScale, reasons: [] },
    K: { score: priors.K * priorScale, reasons: [] },
    DST: { score: priors.DST * priorScale, reasons: [] },
  };

  const recentRun = detectRecentRun(snap, 5);
  const poolDepth = poolDepthByPosition(available);
  const bestAdp = bestAdpByPosition(available);
  const currentPickNo = snap.draft.next_pick_no ?? 0;

  for (const pos of SCORING_POSITIONS) {
    const have = picker.position_counts[pos];
    const need = startersRequired[pos] ?? 1;
    const surplus = have - need;
    const posLabel = POSITION_LABEL[pos];
    const qbNote = pos === "QB" && isSuperflex ? " (superflex)" : "";

    // Need-state scoring. one branch fires per position.
    if (have < need) {
      // Below starter need. high motivation to take.
      const gap = need - have;
      result[pos].score += 0.30 + 0.10 * gap;
      result[pos].reasons.push(
        `${have} ${posLabel}${qbNote}, below starter need (${need}). still building the spine`,
      );
    } else if (surplus === 0) {
      // Exactly at need. Starters set; depth piece OK if value's there.
      result[pos].score += 0.05;
      result[pos].reasons.push(
        `${have} ${posLabel}${qbNote}, starters set. takes one only on clear value`,
      );
    } else if (surplus === 1) {
      // One depth piece above starters. mild negative.
      result[pos].score -= 0.05;
      result[pos].reasons.push(
        `${have} ${posLabel}${qbNote}, 1 starter-grade depth. another only if a tier-jumper falls`,
      );
    } else if (surplus >= 2) {
      // Saturated. strong negative. only justified by lottery-ticket
      // reasoning that this scorer doesn't model (would need ADP,
      // age, NFL trade rumors). late-round softens slightly.
      const penalty = isLateDraft ? -0.22 : -0.32;
      result[pos].score += penalty;
      result[pos].reasons.push(
        `${have} ${posLabel}${qbNote}, saturated. only adds for a specific lottery-ticket reason`,
      );
    }

    // Round-context tweaks. these are small adjustments, not the
    // primary driver. Keep them subordinate to need-state above.
    if (isMidDraft && pos === "RB" && have < need) {
      // RB cliffs typically happen R5-R8. RB-needy teams hunt hard.
      result[pos].score += 0.05;
      result[pos].reasons.push(
        `Mid-round RB demand window. RB-needy teams act before the cliff`,
      );
    }
    if (isMidDraft && pos === "TE" && have === 0) {
      // TE tier cliff is brutal. The first ~5-6 TEs go fast in TE-prem
      // formats; once they're gone, everyone else punts to streamer.
      const isTePrem = snap.scoring.includes("TE-premium");
      result[pos].score += isTePrem ? 0.10 : 0.05;
      result[pos].reasons.push(
        isTePrem
          ? `TE-premium format and 0 TE. tier cliff makes TE more urgent`
          : `Mid-round TE window. tier-1 TEs disappear quickly`,
      );
    }
    if (isLateDraft && pos === "TE" && have <= 1) {
      // Late TE = streamer or upside rookie. mild bump if they only
      // have 1 TE (their starter); they may grab a backup or sleeper.
      result[pos].score += 0.04;
      result[pos].reasons.push(
        `Late draft TE depth/streamer round. backup or rookie upside likely`,
      );
    }
    if (isLateDraft && (pos === "QB" || pos === "TE") && have < need) {
      // Late-round panic at QB/TE is real if you forgot to fill them.
      result[pos].score += 0.08;
      result[pos].reasons.push(
        `Late draft and ${posLabel} starter spot still open. forced fill incoming`,
      );
    }

    // Position-run cascade. When 2+ of last 5 picks were at this
    // position, the next picker feels pressure (don't get left at
    // the back of the run). Captures the panic dynamic that drove the
    // R14 TE cascade my old model completely missed.
    const runCount = recentRun[pos] ?? 0;
    if (runCount >= 2) {
      const boost = 0.10 + (runCount - 2) * 0.05;
      result[pos].score += boost;
      result[pos].reasons.push(
        `${runCount} ${posLabel}s in last 5 picks · run forming, cascade pressure on next pickers`,
      );
    }

    // Pool-depth tier crunch. When fewer than ~3 starter-grade names
    // remain at a position, demand spikes (last-tier panic). Only
    // surface in mid/late draft when starters are mostly drafted.
    const depth = poolDepth[pos];
    if (depth && (isMidDraft || isLateDraft)) {
      if (depth.starterGrade > 0 && depth.starterGrade <= 3) {
        const boost = depth.starterGrade === 1 ? 0.15 : 0.08;
        result[pos].score += boost;
        result[pos].reasons.push(
          `Only ${depth.starterGrade} starter-grade ${posLabel}${depth.starterGrade === 1 ? "" : "s"} left in the pool · tier-crunch panic`,
        );
      }
    }

    // Value-on-board signal. A player with ADP much lower than the
    // current pick number is a tier-leader still on the board. Pickers
    // chase those drops. Stronger in mid/late rounds where need-state
    // is mostly satisfied and BPA dominates. Boost scales with the gap.
    //
    // Captured the misses we just analyzed (Travis Kelce ADP 175 at pick
    // 171; Rachaad White ADP ~165 at pick 175). Without this signal the
    // model defaults to position-need framing and ignores the actual
    // pull of value sitting on the board.
    const posBestAdp = bestAdp[pos];
    if (posBestAdp != null && currentPickNo > 0 && (isMidDraft || isLateDraft)) {
      const valueGap = currentPickNo - posBestAdp; // positive = value sitting
      if (valueGap >= 5) {
        const boost = Math.min(0.20, valueGap / 50);
        result[pos].score += boost;
        result[pos].reasons.push(
          `Best available ${posLabel} ADP ${Math.round(posBestAdp)} vs current pick ${currentPickNo} · ${Math.round(valueGap)} picks of value sitting`,
        );
      }
    }
  }

  // Roster-shape detection. a picker who's stockpiled a position has
  // already shown an archetype. a "QB Cartel" build with 3 QBs in 1QB
  // formats is genuinely chasing a 4th. a "RB-zero" build at R10 with
  // 0 RBs is genuinely staying RB-zero. these are weak signals (they
  // can flip on a single value pick), so the boost is mild.
  const qbHave = picker.position_counts.QB;
  const qbNeed = startersRequired.QB;
  if (!isSuperflex && qbHave >= qbNeed + 2 && isLateDraft) {
    result.QB.score += 0.06;
    result.QB.reasons.push(
      `QB-stockpile build (${qbHave} QBs in 1QB). hunting late-round QB lottery tickets`,
    );
  }
  const rbHave = picker.position_counts.RB;
  if (rbHave === 0 && round >= 7) {
    // RB-zero is a real archetype. they're more likely to STAY RB-zero
    // than abandon it. dampen RB even if "below need."
    result.RB.score -= 0.10;
    result.RB.reasons.push(
      `RB-zero through ${round - 1} rounds. archetype suggests they stay RB-light`,
    );
  }

  // Normalize so the top scorer has a bounded display value. Min and
  // max bands are conservative: keep "low" as the most common outcome
  // (avoid claiming "high" confidence when reality is uncertain).
  let max = 0;
  for (const pos of SCORING_POSITIONS) max = Math.max(max, result[pos].score);
  if (max > 0) {
    for (const pos of SCORING_POSITIONS) {
      // Divide by max*1.4 (was *1.2). Slightly more conservative cap;
      // pulls runaway "HIGH 83%" predictions back into MEDIUM range
      // unless the signal is genuinely dominant.
      result[pos].score = Math.max(
        0,
        Math.min(1, result[pos].score / Math.max(max * 1.4, 0.5)),
      );
    }
  }
  return result;
}

function startersRequired(snap: LeagueSnapshot): Record<Position, number> {
  // Read parsed hard slots from snapshot. Matches Sleeper's roster UI
  // convention (FLEX is a separate need, not rolled into WR).
  const hard = snap.starter_slots.hard;
  const total = hard.QB + hard.RB + hard.WR + hard.TE + hard.K + hard.DST;
  if (total === 0) {
    const qb = snap.format === "superflex" || snap.format === "2qb" ? 2 : 1;
    return { QB: qb, RB: 2, WR: 3, TE: 1, K: 0, DST: 0 };
  }
  return { ...hard };
}

function confidenceFromScore(score: number): {
  level: PredictionConfidence;
  pct: number;
} {
  if (score >= 0.8) return { level: "high", pct: score };
  if (score >= 0.55) return { level: "medium", pct: score };
  return { level: "low", pct: score };
}

// Roster posture inferred from the picker's recent draft picks. NOT
// from their full roster (which conflates draft + carryover players).
// Looks at the last ~3 picks: avg age + rookie rate.
//
// "Trending young" cases include:
//   - the manager who traded R1-R4 for futures and is now spending
//     their late picks on rookie dart throws
//   - rebuild teams hunting youth across the board
// "Trending vet" cases:
//   - win-now teams adding aging-but-productive depth
//   - "Aging-vet bet" archetype managers
function detectPosture(picks: DraftPickRecord[]): PickerPosture {
  const recent = picks.slice(-3); // last 3 picks
  if (recent.length < 2) return { lean: "balanced", note: null };
  const ages = recent
    .map((p) => p.age)
    .filter((a): a is number => typeof a === "number");
  if (ages.length < 2) return { lean: "balanced", note: null };
  const avg = ages.reduce((a, b) => a + b, 0) / ages.length;
  const rookies = recent.filter((p) => p.years_exp === 0).length;

  // Bands tuned for fantasy-skill-position ages. Most starters are
  // 24-28, so anything materially outside that is a meaningful lean.
  // Rookies (yrs_exp == 0) are an even cleaner signal than raw age.
  if (avg <= 24 || rookies >= 2) {
    const rookieClause =
      rookies > 0
        ? `, ${rookies} rookie${rookies > 1 ? "s" : ""} in last ${recent.length}`
        : "";
    return {
      lean: "young",
      note: `Trending young (avg age ${avg.toFixed(1)}${rookieClause}). future-window posture; expect a youth/rookie pick`,
    };
  }
  if (avg >= 27) {
    return {
      lean: "veteran",
      note: `Trending veteran (avg age ${avg.toFixed(1)} in last ${recent.length}). win-now buyer; expect an aging-vet pick`,
    };
  }
  return { lean: "balanced", note: null };
}

function predictPicker(
  snap: LeagueSnapshot,
  pickNo: number,
  available?: AvailablePlayer[],
): PickerPrediction | null {
  const rosterId = rosterAtSlot(snap, pickNo);
  if (rosterId == null) return null;
  const picker = snap.rosters.find((r) => r.roster_id === rosterId);
  if (!picker) return null;

  const theirPicks = snap.draft.picks_made
    .filter((p) => p.roster_id === rosterId)
    .sort((a, b) => a.pick_no - b.pick_no);

  const reqs = startersRequired(snap);
  const scores = scorePositions(picker, snap, reqs, available);
  // Show top 3 positions regardless of absolute score. A "Low 12% TE"
  // is still useful information ("they're unlikely to take TE here")
  // and was getting silently dropped by the old 0.15 threshold,
  // hiding TE from rosters where it's the saturated/done position.
  const ranked = SCORING_POSITIONS.map((p) => ({
    position: p,
    ...scores[p],
  }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  return {
    pick_no: pickNo,
    pick_label: pickLabel(pickNo, snap.total_teams),
    roster_id: rosterId,
    owner_name: picker.owner_name ?? `Roster ${rosterId}`,
    posture: detectPosture(theirPicks),
    candidates: ranked.map((c) => {
      const conf = confidenceFromScore(c.score);
      return {
        position: c.position,
        confidence: conf.level,
        confidence_pct: conf.pct,
        reasons: c.reasons.length > 0 ? c.reasons : ["Format priors only"],
      };
    }),
  };
}

// Surviving targets. for each ranked archetype that's WR/RB/QB/TE-anchored,
// compute how likely the position is to survive the upcoming picks.
function computeSurvivingTargets(
  snap: LeagueSnapshot,
  ranked: RankedArchetype[],
  pickerPredictions: PickerPrediction[],
): SurvivingTarget[] {
  if (ranked.length === 0 || pickerPredictions.length === 0) return [];
  // For each archetype, derive a "primary target position" from its
  // exemplar profiles or category. Simple keyword heuristic.
  const out: SurvivingTarget[] = [];
  for (const r of ranked.slice(0, 4)) {
    const cat = r.archetype.category;
    const targetPos = inferPrimaryPosition(r.archetype.id, cat);
    if (!targetPos) continue;
    // Survival = product of (1 - confidence) across upcoming picks where this position was top candidate
    let survival = 1;
    for (const pp of pickerPredictions) {
      const top = pp.candidates[0];
      if (top && top.position === targetPos) {
        survival *= 1 - top.confidence_pct;
      } else if (
        pp.candidates.find((c) => c.position === targetPos && c.confidence_pct > 0.3)
      ) {
        survival *= 1 - 0.15;
      }
    }
    out.push({
      position: targetPos,
      archetype_id: r.archetype.id,
      archetype_name: r.archetype.name,
      survival_likelihood: survival,
      reasoning:
        survival >= 0.7
          ? `${POSITION_LABEL[targetPos]} unlikely to be targeted before your pick`
          : survival >= 0.4
            ? `${POSITION_LABEL[targetPos]} contested in upcoming picks. your tier-1 target may survive`
            : `${POSITION_LABEL[targetPos]} heavily targeted before your pick. top tier likely gone`,
    });
  }
  return out;
}

function inferPrimaryPosition(
  archetypeId: string,
  category: string,
): Position | null {
  if (archetypeId.startsWith("qb-") || category === "Positional Leverage")
    return "QB";
  if (archetypeId.startsWith("wr-") || category === "WR Strategy") return "WR";
  if (archetypeId.startsWith("rb-") || category === "RB Strategy") return "RB";
  if (archetypeId.startsWith("te-") || category === "TE Strategy") return "TE";
  return null;
}

function watchForFromPredictions(
  predictions: PickerPrediction[],
): Array<{ signal: string; if_it_fires: string }> {
  const out: Array<{ signal: string; if_it_fires: string }> = [];
  // Position-run anticipation
  const topPositions = predictions
    .map((p) => p.candidates[0]?.position)
    .filter((p): p is Position => !!p);
  const counts: Partial<Record<Position, number>> = {};
  for (const p of topPositions) counts[p] = (counts[p] ?? 0) + 1;
  for (const pos of SCORING_POSITIONS) {
    const c = counts[pos] ?? 0;
    if (c >= 2) {
      out.push({
        signal: `${c} of next ${predictions.length} pickers favored to take ${POSITION_LABEL[pos]}`,
        if_it_fires: `If ${pos === "QB" ? "the QB run" : `${POSITION_LABEL[pos]} demand`} materializes, the next-tier ${POSITION_LABEL[pos]} could be gone. have your pivot ready`,
      });
    }
  }
  return out;
}

// Forecasts. short scenario sentences derived from the pickers we
// predicted. Each cites concrete signals so it doesn't read like
// vibes ("if RB run holds 2 more picks..." beats "RB might run").
function buildForecasts(args: {
  predictions: PickerPrediction[];
  surviving: SurvivingTarget[];
  picksUntilMe: number;
}): Forecast[] {
  const out: Forecast[] = [];
  if (args.predictions.length === 0) return out;

  // Position-run forecast. If 2+ of next predictions favor the same
  // position, the next-tier player at that position is at risk.
  const counts: Partial<Record<Position, number>> = {};
  for (const p of args.predictions) {
    const top = p.candidates[0];
    if (top) counts[top.position] = (counts[top.position] ?? 0) + 1;
  }
  for (const pos of SCORING_POSITIONS) {
    const c = counts[pos] ?? 0;
    if (c >= 2) {
      out.push({
        text: `If ${c} of the next ${args.predictions.length} pickers take ${POSITION_LABEL[pos]} (favored), the next-tier ${POSITION_LABEL[pos]} likely won't make it back.`,
      });
    }
  }

  // Survival-pivot forecast. Lowest-survival archetype gets a heads-up.
  const atRisk = args.surviving
    .filter((s) => s.survival_likelihood < 0.4)
    .sort((a, b) => a.survival_likelihood - b.survival_likelihood)[0];
  if (atRisk) {
    out.push({
      text: `${atRisk.archetype_name}: top tier likely gone before your pick (${Math.round(atRisk.survival_likelihood * 100)}% survives). prep a pivot.`,
    });
  }

  // Scarcity/tipping-point forecast. A position with NO predicted picks
  // in the upcoming window is a quiet opening.
  const quiet = SCORING_POSITIONS.filter((pos) => (counts[pos] ?? 0) === 0);
  if (quiet.length > 0 && args.predictions.length >= 3) {
    out.push({
      text: `Nobody in the next ${args.predictions.length} is predicted to take ${quiet.map((p) => POSITION_LABEL[p]).join(" / ")}. opening if you want it.`,
    });
  }

  return out.slice(0, 3);
}

// =====================================================================
// Public entry
// =====================================================================

export const PICK_APPROACH_THRESHOLD = 5;
export const DRAFT_WATCH_WINDOW = 5; // pickers shown in watch mode

export function buildPickApproach(
  snap: LeagueSnapshot,
  ranked: RankedArchetype[],
  available?: AvailablePlayer[],
): PickApproach | null {
  const me = snap.rosters.find((r) => r.is_me);
  if (!me || snap.draft.next_pick_no == null) return null;
  // Only render while the draft is live. complete/pre_draft hide.
  if (snap.draft.status !== "drafting" && snap.draft.status !== "paused") {
    return null;
  }
  const myNext = findMyNextPick(snap, me.roster_id);
  if (!myNext) return null;
  if (myNext.picks_until_me === 0) {
    // We're on the clock. different UX (the on-clock tools handle this)
    return null;
  }

  const mode: PickApproach["mode"] =
    myNext.picks_until_me <= PICK_APPROACH_THRESHOLD ? "approach" : "watch";

  // In approach mode, show ALL pickers between now and your pick.
  // In watch mode, show only the next DRAFT_WATCH_WINDOW pickers
  // (forecasting the whole gap is noisy and stale by the time it matters).
  const lastPickNo =
    mode === "approach"
      ? myNext.pick_no
      : Math.min(myNext.pick_no, snap.draft.next_pick_no + DRAFT_WATCH_WINDOW);

  const upcoming: PickerPrediction[] = [];
  for (let n = snap.draft.next_pick_no; n < lastPickNo; n++) {
    const pred = predictPicker(snap, n, available);
    if (pred) upcoming.push(pred);
  }

  const surviving = computeSurvivingTargets(snap, ranked, upcoming);
  const watch = watchForFromPredictions(upcoming);
  const forecasts = buildForecasts({
    predictions: upcoming,
    surviving,
    picksUntilMe: myNext.picks_until_me,
  });

  return {
    mode,
    picks_until_me: myNext.picks_until_me,
    my_pick_no: myNext.pick_no,
    my_pick_label: pickLabel(myNext.pick_no, snap.total_teams),
    upcoming_pickers: upcoming,
    surviving_targets: surviving,
    watch_for: watch,
    forecasts,
  };
}
