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
  RosterTalentInput,
  SeasonStandingInput,
  ValueLookup,
} from "./types";

/** Minimum EV divergence (pts) for a pick deviation to be worth a debate. */
const DEBATE_MIN_DELTA = 1.0;
/** Win probability at or above which the user counts as favored. */
const FAVORED_WIN_PROB = 0.6;
/** Above this survival pct there is no live time pressure; no anticipation beat. */
const ANTICIPATION_MAX_SURVIVAL = 75;
/**
 * Current-value separation (FantasyCalc 0-100) at which a season-long pick
 * bet counts as settled, so the terminal vindication / critique beat fires
 * and the row is stamped resolved. Below it, the bet stays open and the
 * non-destructive callback keeps the running story alive. A dynasty value
 * race is not "over" mid-season, so the bar is a clear separation, not a
 * hair.
 */
const DECISIVE_VALUE_GAP = 12;

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
  /** analyzeLeagueEvBank, used for the (draft) milestone beat. */
  evBank?: LeagueEvBankReadout | null;
  draftProgress?: DraftProgressInput | null;
  /**
   * Record-based league standing, the in-season twin of the draft EV-bank
   * milestone (the EV bank is structurally blind in-season). Guarantees
   * the check-in has something grounded waiting after the draft.
   */
  seasonStanding?: SeasonStandingInput | null;
  /**
   * Roster-talent standing, the OFFSEASON safety net. Used only when no
   * record milestone and no draft EV-bank milestone fire, so a post-draft
   * dynasty hub is never empty (the dominant state in the offseason).
   */
  rosterTalent?: RosterTalentInput | null;
  /**
   * Open expectation rows from the ledger, for the running-story callback.
   * Non-destructive: a callback never marks a bet resolved.
   */
  openExpectations?: ExpectationRecord[] | null;
  /** Current value lookup for the callback head-to-head. */
  valueOf?: ValueLookup | null;
  /** Grounded checkpoint label for the callback ("week 9", "value check"). */
  checkpointLabel?: string | null;
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

  // Exactly one post-draft "where you stand" milestone, by precedence:
  // the draft EV-bank checkpoint (during / right after the draft), then
  // the record standing (once games are played), then the roster-talent
  // read (the offseason safety net). The fallback chain guarantees the
  // check-in is never silently empty after the draft.
  const ms = classifyMilestoneBeat(
    args.evBank ?? null,
    args.draftProgress ?? null,
    args.stage,
  );
  if (ms) beats.push(ms);

  const standingBeat = classifySeasonStandingBeat(
    args.seasonStanding ?? null,
    args.stage,
  );
  if (standingBeat) beats.push(standingBeat);

  if (!ms && !standingBeat) {
    const talentBeat = classifyRosterTalentBeat(
      args.rosterTalent ?? null,
      args.stage,
    );
    if (talentBeat) beats.push(talentBeat);
  }

  if (args.openExpectations && args.valueOf) {
    beats.push(
      ...classifyCallbackBeats({
        openBets: args.openExpectations,
        valueOf: args.valueOf,
        checkpointLabel: args.checkpointLabel ?? "value check",
        stage: args.stage,
      }),
    );
  }

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
  // Never ship a beat whose players are unresolved raw ids: no name, no
  // provenance, and the "13320" leak (2026-05-23) reaches copy + the
  // Coach seed. The pool-aware reconstruction guards this upstream; this
  // is the canonical backstop for every caller.
  if (!call || call.player_name === call.player_id) return null;
  if (chosen.player_name === chosen.player_id) return null;
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

/**
 * In-season milestone: a record-based standing checkpoint. The draft
 * EV-bank milestone above is built from `picks_made` and is structurally
 * blind in-season; this is its twin, the "something waiting" beat that
 * keeps the companion alive after the draft for ANY league, with no ledger
 * history required. Fires only in-season and only once games are played
 * (a 0-0 preseason rank is noise, not a milestone).
 */
export function classifySeasonStandingBeat(
  standing: SeasonStandingInput | null,
  stage: BeatStage,
): Beat | null {
  if (!standing) return null;
  if (stage !== "in_season") return null;
  const gamesPlayed = standing.wins + standing.losses + standing.ties;
  if (gamesPlayed <= 0) return null;
  if (standing.of < 2 || standing.rank < 1) return null;
  // Top third reads as a win; the rest is a neutral checkpoint.
  const tone = standing.rank <= Math.ceil(standing.of / 3) ? "win" : "neutral";
  return finalizeBeat({
    kind: "milestone",
    tone,
    stage,
    source: {
      signal: "calcStanding",
      detail: `Record standing ${standing.rank} of ${standing.of} (${standing.wins}-${standing.losses}${standing.ties ? `-${standing.ties}` : ""})`,
      values: {
        context: "season_standing",
        rank: standing.rank,
        of: standing.of,
        wins: standing.wins,
        losses: standing.losses,
        ties: standing.ties,
        magnitude: 1,
      },
    },
  });
}

/**
 * Offseason milestone: a roster-talent standing checkpoint. The safety net
 * for the dominant post-draft state, the offseason, where there is no
 * record yet (0-0 is noise, not a milestone) and the draft EV-bank
 * milestone may not resolve. Reuses `teamIdentity.forward` (lineup talent
 * ranked across all rosters by FantasyCalc value); it never re-derives the
 * rank. Fires only post-draft (in-season stage).
 */
export function classifyRosterTalentBeat(
  talent: RosterTalentInput | null,
  stage: BeatStage,
): Beat | null {
  if (!talent) return null;
  if (stage !== "in_season") return null;
  if (talent.of < 2 || talent.rank < 1) return null;
  const tone = talent.rank <= Math.ceil(talent.of / 3) ? "win" : "neutral";
  return finalizeBeat({
    kind: "milestone",
    tone,
    stage,
    source: {
      signal: "teamIdentity.forward.lineup_talent_rank",
      detail: `Roster talent ${talent.rank} of ${talent.of} (lineup value ${Math.round(talent.value)})`,
      values: {
        context: "roster_talent",
        rank: talent.rank,
        of: talent.of,
        value: Math.round(talent.value),
        magnitude: 1,
      },
    },
  });
}

/**
 * Callback: the running story. For each OPEN pick bet, a non-destructive
 * checkpoint comparing the player the user took against the call they
 * passed on, at CURRENT value. It never marks the bet resolved (a
 * season-long dynasty value race is not settled mid-season); the terminal
 * vindication / critique beat does that, once `buildPickResolutions` sees
 * a decisive separation. Grounded entirely in the live value map; a bet
 * whose two sides cannot both be priced is skipped (no provenance, no
 * beat).
 */
export function classifyCallbackBeats(args: {
  openBets: ExpectationRecord[];
  valueOf: ValueLookup;
  checkpointLabel: string;
  stage: BeatStage;
}): Beat[] {
  const beats: Beat[] = [];
  for (const bet of args.openBets) {
    if (bet.resolved || bet.kind !== "pick") continue;
    const subjVal = args.valueOf(bet.subject_player_id);
    const altVal = args.valueOf(bet.alternative_player_id ?? null);
    if (subjVal == null || altVal == null) continue;
    const gap = subjVal - altVal;
    // A decisive separation belongs to the terminal reconcile, not a
    // perpetual callback; let it graduate to vindication / critique.
    if (Math.abs(gap) >= DECISIVE_VALUE_GAP) continue;
    const positive = gap >= 0;
    const alt = bet.alternative_label ?? "the call";
    beats.push(
      finalizeBeat({
        kind: "callback",
        tone: positive ? "win" : "neutral",
        stage: args.stage,
        bet_id: bet.bet_id,
        source: {
          signal: "expectation-ledger-callback",
          detail: `${bet.subject_label} value ${Math.round(subjVal)} vs ${alt} ${Math.round(altVal)}`,
          values: {
            subject: bet.subject_label,
            checkpoint_label: args.checkpointLabel,
            positive: positive ? 1 : 0,
            current_value: `${bet.subject_label} ${Math.round(subjVal)} vs ${alt} ${Math.round(altVal)} (FantasyCalc value).`,
            magnitude: Math.min(2, Math.abs(gap) / 6),
          },
        },
      }),
    );
  }
  return beats;
}

/**
 * Build resolutions for open pick bets whose value race has separated
 * decisively (>= DECISIVE_VALUE_GAP). `good` = the user's pick is ahead.
 * These feed `reconcileExpectations`, which stamps the outcome and (for a
 * contrarian pick) produces a vindication (won) or critique (lost) beat.
 * Bets still inside the gap are left open for the callback to carry.
 */
export function buildPickResolutions(args: {
  openBets: ExpectationRecord[];
  valueOf: ValueLookup;
}): ExpectationResolution[] {
  const out: ExpectationResolution[] = [];
  for (const bet of args.openBets) {
    if (bet.resolved || bet.kind !== "pick") continue;
    const subjVal = args.valueOf(bet.subject_player_id);
    const altVal = args.valueOf(bet.alternative_player_id ?? null);
    if (subjVal == null || altVal == null) continue;
    const gap = subjVal - altVal;
    if (Math.abs(gap) < DECISIVE_VALUE_GAP) continue;
    out.push({ bet_id: bet.bet_id, resolved_value: subjVal, good: gap >= 0 });
  }
  return out;
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
    alternative_player_id: call?.player_id ?? args.whatIf.standing_call_id ?? null,
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
