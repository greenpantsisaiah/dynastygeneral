/**
 * Beat classification. The canonical that turns grounded signals into
 * companion beats (CANONICAL_SOURCES.md "Companion beat classification").
 *
 * Every classifier here is a thin adapter over an EXISTING canonical
 * readout (computeWhatIfReadout, detectPlanDisruption, survivalPctFor,
 * analyzeLeagueEvBank) or over a reconciled expectation. It re-derives
 * nothing. A beat with no grounded delta does not fire, and every beat
 * it emits carries a `source`.
 *
 * Honest-first reconciliation (the bad-beat-vs-critique crux): the user
 * was either ahead in expectation (a loss is variance, a bad_beat) or
 * took the lower-EV side (a loss is a process_error, a critique). The
 * record's expected_value plus alternative_value make the call
 * computable, never guessed.
 */

import type { WhatIfReadout } from "../decision-synthesis/whatif";
import type { PlanDisruption } from "@/lib/last-visit/plan-disruption";
import type { LeagueEvBankReadout } from "../ev-bank/league";
import { urgencyFromSurvival } from "../plays/urgency";
import { finalizeBeat } from "./voice";
import type {
  AnticipationInput,
  Beat,
  BeatSource,
  BeatStage,
  DraftProgressInput,
  ExpectationOutcome,
  ExpectationRecord,
  ExpectationResolution,
} from "./types";

/** Minimum EV divergence (pts) for a pick deviation to be worth a debate. */
const DEBATE_MIN_DELTA = 1.0;
/** Win probability at or above which the user counts as favored. */
const FAVORED_WIN_PROB = 0.6;
/** Above this survival pct there is no live time pressure; no anticipation beat. */
const ANTICIPATION_MAX_SURVIVAL = 75;

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export function classifyBeats(args: {
  stage: BeatStage;
  /** computeWhatIfReadout for the live pick, used for the debate beat. */
  whatIf?: WhatIfReadout | null;
  /** The player the user actually took (if they deviated from the call). */
  chosenId?: string | null;
  /** detectPlanDisruption result, used for snipe commiseration. */
  planDisruption?: PlanDisruption | null;
  /** survivalPctFor of a high-EV target before the next contested pick. */
  anticipation?: AnticipationInput | null;
  /** analyzeLeagueEvBank, used for the milestone beat. */
  evBank?: LeagueEvBankReadout | null;
  draftProgress?: DraftProgressInput | null;
  /** Beats already produced by reconcileExpectations (vindication etc.). */
  resolvedBeats?: Beat[];
}): Beat[] {
  const beats: Beat[] = [];

  const debate = classifyDebateBeat(
    args.whatIf ?? null,
    args.chosenId ?? null,
    args.stage,
  );
  if (debate) beats.push(debate);

  beats.push(...classifySnipeBeats(args.planDisruption ?? null, args.stage));

  const ant = classifyAnticipationBeat(args.anticipation ?? null, args.stage);
  if (ant) beats.push(ant);

  const ms = classifyMilestoneBeat(
    args.evBank ?? null,
    args.draftProgress ?? null,
    args.stage,
  );
  if (ms) beats.push(ms);

  if (args.resolvedBeats) beats.push(...args.resolvedBeats);

  return beats;
}

// ---------------------------------------------------------------------------
// Live classifiers (grounded in existing readouts)
// ---------------------------------------------------------------------------

/** Debate: the user took a candidate that diverges from the standing call. */
export function classifyDebateBeat(
  whatIf: WhatIfReadout | null,
  chosenId: string | null,
  stage: BeatStage,
): Beat | null {
  if (!whatIf || !chosenId) return null;
  if (chosenId === whatIf.standing_call_id) return null; // took the call
  const chosen = whatIf.entries.find((e) => e.player_id === chosenId);
  if (!chosen) return null;
  const call = whatIf.entries.find((e) => e.is_standing_call);
  const delta = chosen.delta_vs_standing_call;
  if (delta == null || Math.abs(delta) < DEBATE_MIN_DELTA) return null;

  return finalizeBeat({
    kind: "debate",
    tone: "challenge",
    stage,
    prompts_handoff: true,
    source: {
      signal: "computeWhatIfReadout",
      detail: `${chosen.player_name} EV ${chosen.ev_if_chosen ?? "n/a"} vs standing call ${call?.player_name ?? "n/a"} (delta ${delta})`,
      values: {
        chosen: chosen.player_name,
        alternative: call?.player_name ?? "the call",
        ev_delta: delta,
        survival_pct: chosen.survival_pct,
        magnitude: Math.abs(delta),
      },
    },
  });
}

/** Snipe: a planned target was drafted away. Reuses the grounded ack. */
export function classifySnipeBeats(
  planDisruption: PlanDisruption | null,
  stage: BeatStage,
): Beat[] {
  if (
    !planDisruption ||
    planDisruption.snipes.length === 0 ||
    !planDisruption.acknowledgment
  ) {
    return [];
  }
  const top = planDisruption.snipes[0];
  return [
    finalizeBeat({
      kind: "bad_beat",
      tone: "commiserate",
      stage,
      source: {
        signal: "detectPlanDisruption",
        detail: `Plan target ${top.player_name} drafted at pick ${top.pick_no}`,
        values: {
          acknowledgment: planDisruption.acknowledgment,
          subject: top.player_name,
          magnitude: 2,
        },
      },
    }),
  ];
}

/** Anticipation: a high-EV target with a live, uncertain survival window. */
export function classifyAnticipationBeat(
  anticipation: AnticipationInput | null,
  stage: BeatStage,
): Beat | null {
  if (!anticipation) return null;
  if (anticipation.survival_pct >= ANTICIPATION_MAX_SURVIVAL) return null;
  const urgency = urgencyFromSurvival(anticipation.survival_pct);
  const magnitude =
    anticipation.ev_if_chosen != null ? Math.abs(anticipation.ev_if_chosen) : 1;
  return finalizeBeat({
    kind: "anticipation",
    tone: "neutral",
    stage,
    urgency,
    source: {
      signal: "survivalPctFor",
      detail: `${anticipation.subject_label} survival ${anticipation.survival_pct}% to pick ${anticipation.to_pick_no}`,
      values: {
        subject: anticipation.subject_label,
        survival_pct: anticipation.survival_pct,
        to_pick_label: anticipation.to_pick_label ?? `pick ${anticipation.to_pick_no}`,
        act_now: urgency === "act_now" ? 1 : 0,
        magnitude,
      },
    },
  });
}

/** Milestone: a banked-EV checkpoint with a real league rank. */
export function classifyMilestoneBeat(
  evBank: LeagueEvBankReadout | null,
  progress: DraftProgressInput | null,
  stage: BeatStage,
): Beat | null {
  if (!evBank || evBank.my_rank == null || evBank.ranked_count < 2) return null;
  const me = evBank.rosters.find((r) => r.is_me);
  const evTotal = me?.total_ev ?? null;
  const progressPct =
    progress && progress.total_picks > 0
      ? (progress.picks_made / progress.total_picks) * 100
      : null;
  const tone =
    evBank.my_percentile != null && evBank.my_percentile >= 50
      ? "win"
      : "neutral";
  return finalizeBeat({
    kind: "milestone",
    tone,
    stage,
    source: {
      signal: "analyzeLeagueEvBank",
      detail: `EV bank rank ${evBank.my_rank} of ${evBank.ranked_count}`,
      values: {
        ev_total: evTotal,
        rank: evBank.my_rank,
        of: evBank.ranked_count,
        percentile: evBank.my_percentile,
        progress_pct: progressPct,
        magnitude: 1,
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Expectation ledger: load + reconcile
// ---------------------------------------------------------------------------

/**
 * Load an expectation when the user takes a pick that diverges from the
 * standing call (the investment phase that makes the later vindication /
 * bad-beat / critique beat personal). Returns null when the user took
 * the call (no bet to remember).
 */
export function expectationFromPickDeviation(args: {
  leagueId: string;
  whatIf: WhatIfReadout;
  chosenId: string;
  pickNo: number;
  thesis?: string | null;
  betId?: string;
}): ExpectationRecord | null {
  const chosen = args.whatIf.entries.find((e) => e.player_id === args.chosenId);
  if (!chosen || chosen.is_standing_call) return null;
  const call = args.whatIf.entries.find((e) => e.is_standing_call);
  return {
    bet_id: args.betId ?? `pick-${args.pickNo}-${args.chosenId}`,
    league_id: args.leagueId,
    kind: "pick",
    created_at_pick_no: args.pickNo,
    created_at_week: null,
    subject_player_id: chosen.player_id,
    subject_label: chosen.player_name,
    expected_metric: "ev",
    expected_value: chosen.ev_if_chosen ?? 0,
    alternative_label: call?.player_name ?? null,
    alternative_value: call?.ev_if_chosen ?? args.whatIf.standing_call_ev ?? null,
    thesis: args.thesis ?? null,
    resolution_condition: `${chosen.player_name} season value vs ${call?.player_name ?? "the call"}`,
    horizon: "this_season",
    resolved: false,
  };
}

/** Reconcile a batch of records against their resolutions. */
export function reconcileExpectations(
  records: ExpectationRecord[],
  resolutions: ExpectationResolution[],
): { records: ExpectationRecord[]; beats: Beat[] } {
  const byId = new Map(resolutions.map((r) => [r.bet_id, r]));
  const outRecords: ExpectationRecord[] = [];
  const beats: Beat[] = [];
  for (const rec of records) {
    const res = byId.get(rec.bet_id);
    if (!res || rec.resolved) {
      outRecords.push(rec);
      continue;
    }
    const { record, beat } = reconcileExpectation(rec, res);
    outRecords.push(record);
    if (beat) beats.push(beat);
  }
  return { records: outRecords, beats };
}

/**
 * Reconcile one record. The honest-first classifier:
 *   good                                   -> confirmed (vindication)
 *   favored loss (variance or non-contrarian) -> variance_loss (bad_beat)
 *   contrarian loss                         -> process_error (critique)
 *   otherwise (an expected loss)            -> neutral (no beat)
 */
export function reconcileExpectation(
  record: ExpectationRecord,
  resolution: ExpectationResolution,
): { record: ExpectationRecord; beat: Beat | null } {
  let outcome: ExpectationOutcome;
  if (resolution.good) {
    outcome = "confirmed";
  } else if (
    wasFavored(record) &&
    (resolution.variance_flag || !tookContrarian(record))
  ) {
    outcome = "variance_loss";
  } else if (tookContrarian(record)) {
    outcome = "process_error";
  } else {
    outcome = "neutral";
  }

  const updated: ExpectationRecord = {
    ...record,
    resolved: true,
    resolved_value: resolution.resolved_value,
    resolved_at: new Date().toISOString(),
    outcome,
  };
  return { record: updated, beat: beatForOutcome(updated, resolution) };
}

function wasFavored(r: ExpectationRecord): boolean {
  if (r.expected_metric === "win_prob") {
    const p = r.expected_value <= 1 ? r.expected_value : r.expected_value / 100;
    return p >= FAVORED_WIN_PROB;
  }
  const alt = r.alternative_value ?? Number.NEGATIVE_INFINITY;
  return r.expected_value >= 0 && r.expected_value >= alt;
}

function tookContrarian(r: ExpectationRecord): boolean {
  return r.alternative_value != null && r.expected_value < r.alternative_value;
}

function stageForRecord(r: ExpectationRecord): BeatStage {
  if (r.created_at_week != null || r.horizon !== "next_pick") return "in_season";
  return "dynasty_draft";
}

function beatForOutcome(
  r: ExpectationRecord,
  resolution: ExpectationResolution,
): Beat | null {
  const stage = stageForRecord(r);
  const src = (
    detail: string,
    values: BeatSource["values"],
  ): BeatSource => ({ signal: "reconcileExpectation", detail, values });

  switch (r.outcome) {
    case "confirmed":
      return finalizeBeat({
        kind: "vindication",
        tone: "win",
        stage,
        bet_id: r.bet_id,
        source: src(
          `${r.subject_label} resolved ${resolution.resolved_value} vs expected ${r.expected_value}`,
          {
            subject: r.subject_label,
            contrarian: tookContrarian(r) ? 1 : 0,
            magnitude: 2,
          },
        ),
      });
    case "variance_loss": {
      const pct =
        r.expected_metric === "win_prob"
          ? r.expected_value <= 1
            ? r.expected_value
            : r.expected_value / 100
          : null;
      return finalizeBeat({
        kind: "bad_beat",
        tone: "commiserate",
        stage,
        bet_id: r.bet_id,
        source: src(
          `Favored ${r.subject_label} (${r.expected_value}) lost to variance`,
          {
            subject: r.subject_label,
            expected_pct: pct,
            flipped_by: resolution.flipped_by ?? null,
            magnitude: 3,
          },
        ),
      });
    }
    case "process_error":
      return finalizeBeat({
        kind: "critique",
        tone: "challenge",
        stage,
        bet_id: r.bet_id,
        prompts_handoff: true,
        source: src(
          `Chose ${r.subject_label} (${r.expected_value}) over ${r.alternative_label} (${r.alternative_value})`,
          {
            subject: r.subject_label,
            alternative: r.alternative_label ?? null,
            gap:
              r.alternative_value != null
                ? r.alternative_value - r.expected_value
                : null,
            magnitude: 2,
          },
        ),
      });
    case "neutral":
    default:
      return null;
  }
}
