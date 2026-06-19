"use client";

/**
 * Decision Board, Cockpit Table layout (founder pick 2026-05-22).
 *
 * THE CALL on top (the single best pick, reasoning + the counterintuitive
 * note when it applies), then ONE dense, sortable table of every other
 * candidate. Columns are labeled so a number is never guess-the-metric:
 * Player (name + position-team = identity), EV, Survival, Tags. Default
 * sort is inherent value; sort by EV or Survival on tap. Perspectives
 * (win-now / future / last-before-cliff / going-soon / a committed play /
 * a handcuff this pick enables) ride as tags, non-exclusive. Plays fold
 * in as a compact strip below. Display-aware only.
 */

import { useEffect, useMemo, useState } from "react";
import type {
  Decision,
  DecisionQuadrantCandidate,
} from "@/lib/strategy/decision-synthesis/types";
import type { Play, PlayCommitment } from "@/lib/strategy/plays/types";
import type { OpportunityRead } from "@/lib/players/opportunity-read";
import type { OwnedRosterPlayer } from "@/lib/strategy/plays/detect";
import type { LaneMembership } from "@/lib/strategy/lane-identity";
import type { FormatRules } from "@/lib/engine/llm-contract";
import { readMarketDivergence } from "@/lib/players/market-divergence";
import { computeEv } from "./candidate-bits";
import {
  archetypeLabel,
  getDismissedSuggestions,
  getPlayCommitments,
  lapseStaleCommitments,
  type DismissedSuggestion,
} from "@/lib/plays-storage";
import {
  abandonPlayWithSync,
  commitPlayWithSync,
  dismissSuggestionWithSync,
  markPlayExecutedWithSync,
  mergeServerInitialState,
  restoreSuggestionWithSync,
} from "@/lib/plays/sync";
import {
  derivePlayCoverage,
  type OppHolder,
  type PlayCoverage,
} from "@/lib/strategy/plays/coverage";

const NO_RUSH_SURVIVAL = 75;
const DROPOFF_POSITIONS = ["RB", "WR", "TE", "QB"] as const;
const DROPOFF_WINDOW = 12;
const CLIFF_RATIO = 1.6;
// Desktop (>=sm): dense "cockpit" 4-col table. Player is capped (not 1fr)
// so EV sits right after the name instead of across a wide gap; the tags
// column absorbs the slack. Mobile (<sm): the same four fields stack via
// grid-template-areas so nothing clips off-screen. Name + EV pair on the
// first line; survival and tags each get their own full-width row. The
// fixed 13rem of EV+Survival tracks never fit a phone, which is what
// squeezed the name to single letters and clipped the tag pills.
const HEADER_COLS = "grid-cols-[minmax(0,15rem)_4rem_9rem_minmax(0,1fr)]";
const ROW =
  "grid items-baseline gap-x-3 gap-y-1 grid-cols-[minmax(0,1fr)_auto] [grid-template-areas:'name_ev'_'sub_sub'_'tags_tags'] sm:gap-3 sm:grid-cols-[minmax(0,15rem)_4rem_9rem_minmax(0,1fr)] sm:[grid-template-areas:'name_ev_sub_tags']";
const EMPTY = "-";

type SortKey = "value" | "ev" | "survival";

export type DecisionBoardProps = {
  decision: Decision;
  disclaimer?: string | null;
  leagueId: string;
  currentPickNo: number | null;
  suggestedPlays?: Play[];
  picksMadeForUser?: { player_id: string; pick_no: number }[];
  /** Earned-role read per candidate player_id (snap share + targets trend). */
  opportunityById?: Record<string, OpportunityRead>;
  /**
   * Auth user id when signed in. Triggers the server sync (POST to
   * /api/plays) on every commit / abandon / dismiss / restore and runs
   * the upload-on-mount merge with `initialServerCommitments` and
   * `initialServerDismissals`. Null = anonymous, localStorage only.
   */
  authedUserId?: string | null;
  /** Server-side play_commitments rows for this user/league. */
  initialServerCommitments?: PlayCommitment[];
  /** Server-side play_dismissals rows for this user/league. */
  initialServerDismissals?: DismissedSuggestion[];
  /** The user's rostered players (drives play coverage). */
  ownedPlayers?: OwnedRosterPlayer[];
  /** FantasyCalc value lookup, normalized 0-100. */
  valueMap?: Record<string, number>;
  /** Roster lane memberships (drives lane_path play coverage). */
  laneMemberships?: LaneMembership[];
  /** Format rules (drives qb_hoard coverage starter math). */
  formatRules?: FormatRules | null;
  /**
   * Opponent roster lookup keyed by player_id. Drives the "sniped"
   * coverage verdict (named partner on someone else's roster) + the
   * trade-angle line. Empty / absent = no sniped detection.
   */
  oppHolders?: Record<string, OppHolder>;
};

function lastInTierByPlayer(
  cands: DecisionQuadrantCandidate[],
): Map<string, string> {
  const out = new Map<string, string>();
  for (const pos of DROPOFF_POSITIONS) {
    const players = cands
      .filter((c) => c.position === pos && typeof c.value === "number")
      .sort((a, b) => (b.value as number) - (a.value as number));
    if (players.length < 3) continue;
    const window = players.slice(0, DROPOFF_WINDOW);
    const gaps: number[] = [];
    for (let i = 1; i < window.length; i++) {
      gaps.push((window[i - 1].value as number) - (window[i].value as number));
    }
    const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    for (let i = 0; i < gaps.length; i++) {
      if (avgGap > 0 && gaps[i] >= CLIFF_RATIO * avgGap) {
        out.set(window[i].player_id, `last ${pos} before -${Math.round(gaps[i])}`);
        break;
      }
    }
  }
  return out;
}

function survivalTone(pct: number | null | undefined): string {
  if (pct == null) return "text-muted-2";
  if (pct >= NO_RUSH_SURVIVAL) return "text-success";
  if (pct >= 30) return "text-warning";
  return "text-danger";
}

function evTone(ev: number | null): string {
  return ev == null ? "text-muted-2" : ev >= 0 ? "text-success" : "text-danger";
}

type Tone = "muted" | "warn" | "accent";

function Chip({ text, tone = "muted" }: { text: string; tone?: Tone }) {
  const cls =
    tone === "warn"
      ? "border-warning/50 text-warning"
      : tone === "accent"
        ? "border-accent/60 text-accent"
        : "border-border-soft text-muted-2";
  return (
    <span
      className={`max-w-full break-words text-center font-mono text-[9px] uppercase tracking-[0.12em] border rounded-full px-1.5 py-0.5 ${cls}`}
    >
      {text}
    </span>
  );
}

// Earned-role detail (Tufte Layer 2): last season's snap share + targets
// with a trend arrow. Display-only; the read comes from the canonical
// readOpportunity. A rising role on a young name is buy-the-trajectory; an
// eroding one on a veteran is the early warning. The trend detail rides on
// the title attribute as provenance-on-hover. Renders nothing for players
// with no prior-season role data (rookies), which is itself the honest
// signal: a proven sophomore's earned role shows; incoming rookies don't.
function RoleLine({ read }: { read: OpportunityRead | undefined }) {
  if (!read) return null;
  const arrow =
    read.trend === "rising" ? "↑" : read.trend === "falling" ? "↓" : null;
  const tone =
    read.trend === "rising"
      ? "text-success"
      : read.trend === "falling"
        ? "text-danger"
        : "text-muted-2";
  const label =
    read.trend === "rising"
      ? "rising"
      : read.trend === "falling"
        ? "eroding"
        : read.trend === "flat"
          ? "steady"
          : null;
  return (
    <p
      className="mt-1 text-[11px] leading-snug text-muted-2"
      title={read.detail}
    >
      <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-2">
        Role
      </span>{" "}
      {read.line}
      {label ? (
        <span className={`font-mono ${tone}`}>
          {" · "}
          {arrow ? `${arrow} ` : ""}
          {label}
        </span>
      ) : null}
    </p>
  );
}

// Market-divergence detail (Tufte Layer 2): the gap between where the
// DRAFT market consensus picks a player (ADP) and where the TRADE market
// ranks him (FantasyCalc / KTC overall_rank). Two markets, one player; a
// big gap is a real disagreement. Display-only, neutral framing: shows
// both numbers and which side is earlier, no verdict. Renders nothing
// when the markets agree (within noise) or either input is missing.
// Adjacent to RoleLine so each candidate gets one role read + one market
// read, both grounded in canonicals.
function DivergenceLine({
  adp,
  valueRank,
}: {
  adp: number | null | undefined;
  valueRank: number | null | undefined;
}) {
  const div = readMarketDivergence({ adp, valueRank });
  if (!div) return null;
  const tone =
    div.lean === "adp_earlier" ? "text-warning" : "text-success";
  return (
    <p
      className="mt-1 text-[11px] leading-snug text-muted-2"
      title={`${div.line} (${div.detail})`}
    >
      <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-2">
        Market gap
      </span>{" "}
      {div.line}
      {" · "}
      <span className={`font-mono ${tone}`}>{div.detail}</span>
    </p>
  );
}

// Coverage chip + line: the "Built / Missing" read on an active play.
// The chip carries the verdict color; the line names the built pieces
// (with values) and what is still missing. Replaces the prior "No
// target on the board yet" empty state when the user has anchor +
// partner pieces already in hand. Source: derivePlayCoverage canonical.
function CoverageChip({
  verdict,
}: {
  verdict: PlayCoverage["verdict"];
}) {
  const cls =
    verdict === "covered"
      ? "border-success/60 text-success"
      : verdict === "partial"
        ? "border-warning/60 text-warning"
        : verdict === "sniped"
          ? "border-danger/60 text-danger"
          : "border-border-soft text-muted-2";
  const label =
    verdict === "covered"
      ? "covered"
      : verdict === "partial"
        ? "partial"
        : verdict === "sniped"
          ? "sniped"
          : "thin";
  return (
    <span
      className={`max-w-full break-words text-center font-mono text-[9px] uppercase tracking-[0.12em] border rounded-full px-1.5 py-0.5 ${cls}`}
    >
      {label}
    </span>
  );
}

function CoverageLine({ coverage }: { coverage: PlayCoverage }) {
  const tone =
    coverage.verdict === "covered"
      ? "text-success"
      : coverage.verdict === "partial"
        ? "text-warning"
        : coverage.verdict === "sniped"
          ? "text-danger"
          : "text-muted-2";
  if (coverage.built.length === 0) {
    return (
      <p className="mt-0.5 text-[11px] text-muted-2">
        Nothing built yet on this play.
        {coverage.missing ? ` Missing ${coverage.missing}` : null}
      </p>
    );
  }
  const builtText = coverage.built
    .map((p) => (p.value != null ? `${p.name} (val ${p.value})` : p.name))
    .join(", ");
  return (
    <>
      <p className="mt-0.5 text-[11px] leading-snug">
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-2">
          Built
        </span>{" "}
        <span className="text-foreground">{builtText}</span>
        {coverage.missing ? (
          <>
            <span className="text-muted-2"> · </span>
            <span className={tone}>
              {coverage.verdict === "sniped" ? "sniped: " : "missing "}
              {coverage.missing}
            </span>
          </>
        ) : (
          <>
            <span className="text-muted-2"> · </span>
            <span className={tone}>covered</span>
          </>
        )}
      </p>
      {coverage.verdict === "sniped" && coverage.trade_angle ? (
        <p className="mt-0.5 text-[11px] leading-snug">
          <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-accent">
            Trade angle
          </span>{" "}
          <span className="text-foreground">{coverage.trade_angle}</span>
        </p>
      ) : null}
    </>
  );
}

// 538-style inline magnitude bar for survival.
function SurvBar({ pct }: { pct: number }) {
  const tone =
    pct >= NO_RUSH_SURVIVAL ? "bg-success" : pct >= 30 ? "bg-warning" : "bg-danger";
  return (
    <span className="relative inline-block h-1.5 w-8 shrink-0 rounded-full bg-border-soft/60 align-middle">
      <span
        className={`absolute left-0 top-0 h-full rounded-full ${tone}`}
        style={{ width: `${Math.max(4, Math.min(100, pct))}%` }}
      />
    </span>
  );
}

export function DecisionBoard({
  decision,
  disclaimer,
  leagueId,
  currentPickNo,
  suggestedPlays = [],
  picksMadeForUser = [],
  opportunityById = {},
  authedUserId = null,
  initialServerCommitments = [],
  initialServerDismissals = [],
  ownedPlayers = [],
  valueMap = {},
  laneMemberships = [],
  formatRules = null,
  oppHolders = {},
}: DecisionBoardProps) {
  const syncCtx = useMemo(
    () => ({ leagueId, authedUserId }),
    [leagueId, authedUserId],
  );
  const pickNo = decision.pick_no;
  const standingCallId = decision.recommendation.player_id;
  const cands = decision.quadrant_candidates;

  const [commitments, setCommitments] = useState<PlayCommitment[]>([]);
  const [dismissed, setDismissed] = useState<DismissedSuggestion[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("value");

  useEffect(() => {
    // Merge server-side rows into localStorage on mount, then run any
    // local-only rows up via the upload-on-signin pass (no-op when
    // anonymous). Idempotent: safe to run on every effect tick.
    mergeServerInitialState({
      ctx: syncCtx,
      serverCommitments: initialServerCommitments,
      serverDismissals: initialServerDismissals,
    });
    if (currentPickNo != null) {
      lapseStaleCommitments({ leagueId, currentPickNo });
    }
    const userPicksById = new Map<string, number>();
    for (const p of picksMadeForUser) userPicksById.set(p.player_id, p.pick_no);
    for (const c of getPlayCommitments(leagueId)) {
      if (c.status !== "active") continue;
      for (const target of c.followthrough_targets) {
        const at = userPicksById.get(target.player_id);
        if (at != null) {
          markPlayExecutedWithSync({
            ctx: syncCtx,
            commitmentId: c.commitment_id,
            executedWith: target,
            executedAtPickNo: at,
          });
          break;
        }
      }
    }
    setCommitments(getPlayCommitments(leagueId));
    setDismissed(getDismissedSuggestions(leagueId));
  }, [
    leagueId,
    currentPickNo,
    picksMadeForUser,
    syncCtx,
    initialServerCommitments,
    initialServerDismissals,
  ]);

  const activePlays = commitments.filter((c) => c.status === "active");

  const advancesByPlayer = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const c of activePlays) {
      for (const t of c.followthrough_targets) {
        const arr = m.get(t.player_id);
        if (arr) arr.push(c.play_name);
        else m.set(t.player_id, [c.play_name]);
      }
    }
    return m;
  }, [activePlays]);

  const cliffByPlayer = useMemo(() => lastInTierByPlayer(cands), [cands]);

  function tagsFor(c: DecisionQuadrantCandidate): { text: string; tone: Tone }[] {
    const out: { text: string; tone: Tone }[] = [];
    // Committed-play tags lead in accent so tracking a play visibly
    // marks the players it advances.
    for (const p of advancesByPlayer.get(c.player_id) ?? [])
      out.push({ text: p, tone: "accent" });
    if (c.survival_pct != null && c.survival_pct < NO_RUSH_SURVIVAL) {
      out.push({ text: "soon", tone: "warn" });
    }
    const cliff = cliffByPlayer.get(c.player_id);
    if (cliff) out.push({ text: cliff, tone: "warn" });
    if (c.timeline_lane === "win-now") out.push({ text: "win-now", tone: "muted" });
    else if (c.timeline_lane === "future")
      out.push({ text: "future", tone: "muted" });
    for (const play of decision.plays_this_enables) {
      if (
        play.followthrough.target_candidates.some(
          (t) => t.player_id === c.player_id,
        )
      ) {
        out.push({ text: play.name, tone: "muted" });
      }
    }
    const seen = new Set<string>();
    return out.filter((t) => (seen.has(t.text) ? false : (seen.add(t.text), true)));
  }
  const isTracked = (id: string) => advancesByPlayer.has(id);

  // Grounded per-row micro-commentary. Picks the most salient true note
  // for a player from runtime signals (league scarcity, EV gap,
  // survival, age). No fabricated claims (founder 2026-05-22: bring back
  // the analyst one-liner, but only if it is data-true).
  const leagueCtx = decision.league_position_context;
  const topValueByPos = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of [...cands].sort((a, b) => (b.value ?? -999) - (a.value ?? -999))) {
      if (c.position && !m.has(c.position)) m.set(c.position, c.player_id);
    }
    return m;
  }, [cands]);

  function microNote(c: DecisionQuadrantCandidate): string | null {
    const pos = c.position;
    const ev = computeEv(c, pickNo);
    const ctx = pos ? leagueCtx?.[pos] : null;
    const gap = c.adp != null ? Math.round(pickNo - c.adp) : null;
    // Trade leverage: the best asset at a position many teams are short
    // on (the founder's "QB leverage because the league loaded WRs").
    if (
      ctx &&
      pos &&
      topValueByPos.get(pos) === c.player_id &&
      ctx.teams_light >= Math.ceil(ctx.total_teams / 2) &&
      (c.value ?? 0) >= 10
    ) {
      return `${pos} runs thin league-wide (${ctx.teams_light}/${ctx.total_teams} teams under starter need); a surplus ${pos} is trade leverage.`;
    }
    if (ev != null && ev >= 3 && gap != null && gap >= 8) {
      return `Steal: fell ${gap} picks past ADP for +${ev.toFixed(1)} EV.`;
    }
    if (ev != null && ev <= -3 && c.survival_pct != null && c.survival_pct >= 80) {
      return `No need to reach; keeps at ${c.survival_pct}% to your next pick.`;
    }
    if (c.timeline_lane === "future" && c.age != null && c.age <= 23) {
      return `Young stash, age ${c.age}; upside off your bench, not a starter yet.`;
    }
    return null;
  }

  const callCand = cands.find((c) => c.player_id === standingCallId) ?? null;
  const callSurvival = callCand?.survival_pct ?? null;
  const callAtRisk = callSurvival != null && callSurvival < NO_RUSH_SURVIVAL;
  const callEv = callCand ? computeEv(callCand, pickNo) : null;

  const rows = cands.filter((c) => c.player_id !== standingCallId);
  rows.sort((a, b) => {
    if (sortKey === "ev")
      return (computeEv(b, pickNo) ?? -999) - (computeEv(a, pickNo) ?? -999);
    if (sortKey === "survival")
      return (a.survival_pct ?? 999) - (b.survival_pct ?? 999);
    return (b.value ?? -999) - (a.value ?? -999);
  });

  const committedKeys = new Set(
    activePlays.map((c) => `${c.archetype}:${c.primary_player.player_id}`),
  );
  const dismissedKeys = new Set(dismissed.map((d) => d.key));
  const openSuggestions = suggestedPlays.filter((p) => {
    const key = `${p.archetype}:${p.primary_player.player_id}`;
    return !committedKeys.has(key) && !dismissedKeys.has(key);
  });
  const playsHasContent = activePlays.length > 0 || openSuggestions.length > 0;

  function refresh() {
    setCommitments(getPlayCommitments(leagueId));
    setDismissed(getDismissedSuggestions(leagueId));
  }

  const sortBtn = (k: SortKey, label: string) => (
    <button
      type="button"
      onClick={() => setSortKey(k)}
      className={`font-mono text-[9px] uppercase tracking-[0.14em] transition-colors ${
        sortKey === k ? "text-accent" : "text-muted-2 hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="px-4 py-4 space-y-4 sm:px-5">
      {/* Build vs the league: are you with or against the grain, and is
          it working? Answers the "everyone went WR crazy, am I wrong?"
          doubt by reading league scarcity against your starter coverage. */}
      {decision.build_vs_league && (
        <div
          className={`rounded-md border px-4 py-2.5 ${
            decision.build_vs_league.verdict === "edge_at_risk"
              ? "border-warning/50 bg-warning/5"
              : decision.build_vs_league.verdict === "edge_hold"
                ? "border-success/40 bg-success/5"
                : "border-border-soft bg-surface/30"
          }`}
        >
          <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-2">
            Your build vs the league
          </div>
          <p className="mt-1 text-[13px] font-semibold text-foreground">
            {decision.build_vs_league.headline}
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-muted">
            {decision.build_vs_league.detail}
          </p>
        </div>
      )}

      {/* THE CALL */}
      <div className="rounded-md border border-accent/60 bg-accent/5 px-4 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
              The Call
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-2">
              {callAtRisk ? "act before they're gone" : "nothing's at risk"}
            </span>
          </div>
          {callEv != null && (
            <span className="shrink-0 text-right leading-none">
              <span className="block font-mono text-[8px] uppercase tracking-[0.16em] text-muted-2">
                EV
              </span>
              <span className={`font-mono text-[20px] font-semibold ${evTone(callEv)}`}>
                {callEv >= 0 ? "+" : ""}
                {callEv.toFixed(1)}
              </span>
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-baseline gap-2">
          <span className="text-[16px] font-semibold text-foreground">
            {decision.recommendation.name}
          </span>
          <span className="font-mono text-[10px] text-muted-2">
            {decision.recommendation.position}
            {decision.recommendation.team
              ? `-${decision.recommendation.team}`
              : ""}
          </span>
          {callCand?.survival_pct != null && (
            <span className={`font-mono text-[11px] ${survivalTone(callSurvival)}`}>
              {callCand.availability_next_pick
                ? `${callCand.availability_next_pick.replace("_", " ")} `
                : ""}
              {callCand.survival_pct}%
            </span>
          )}
        </div>
        {callCand && tagsFor(callCand).length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {tagsFor(callCand).map((t) => (
              <Chip key={t.text} text={t.text} tone={t.tone} />
            ))}
          </div>
        )}
        {disclaimer ? (
          <p className="mt-2 text-[12px] leading-snug text-warning">{disclaimer}</p>
        ) : (
          <p className="mt-2 text-[12px] leading-snug text-muted">
            {decision.recommendation.primary_reason}
          </p>
        )}
        {/* Honesty caveat: the standing call's rubric read leans on the
            market prior, not live evidence (isRubricPriorDriven). Same
            framing the inflection panel + candidate cards render. The
            value is unchanged (value seam in shadow). */}
        {decision.recommendation.prior_driven && (
          <div
            className="mt-2 rounded-sm border border-warning/40 bg-warning/10 px-2 py-1 text-[11px] leading-snug text-warning"
            title="The model read for this player leans on the market value, not yet on live signals. The value shown is the market prior."
          >
            Leaning on the market, not yet evidence-backed.
          </div>
        )}
        <RoleLine read={opportunityById[standingCallId]} />
        <DivergenceLine
          adp={callCand?.adp}
          valueRank={callCand?.ktc_overall_rank}
        />
        {!callAtRisk && (
          <p className="mt-1 text-[11px] leading-snug text-warning">
            Nothing's about to be gone. Take {decision.recommendation.name} for
            value, or trade down; you won't lose your targets by waiting.
          </p>
        )}
      </div>

      {/* Candidate table */}
      {rows.length > 0 && (
        <div>
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
              On the board
            </span>
            <span className="flex items-baseline gap-2">
              <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-2">
                sort
              </span>
              {sortBtn("value", "Value")}
              <span className="text-muted-2">·</span>
              {sortBtn("ev", "vsADP")}
              <span className="text-muted-2">·</span>
              {sortBtn("survival", "Survival")}
            </span>
          </div>
          <div className="rounded-md border border-border-soft overflow-hidden">
            <div
              className={`hidden sm:grid ${HEADER_COLS} items-baseline gap-3 bg-surface/50 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2`}
            >
              <span>Player</span>
              <span className="text-right">vsADP</span>
              <span className="text-right">Survival</span>
              <span>Tags</span>
            </div>
            {rows.map((c) => {
              const ev = computeEv(c, pickNo);
              const note = microNote(c);
              return (
                <div
                  key={c.player_id}
                  className={`px-3 py-2 border-t border-border-soft/50 ${
                    isTracked(c.player_id) ? "bg-accent/5" : ""
                  }`}
                >
                  <div className={ROW}>
                    <span className="[grid-area:name] min-w-0 truncate">
                      <span className="text-[15px] font-semibold text-foreground">
                        {c.name}
                      </span>{" "}
                      <span className="font-mono text-[10px] uppercase text-muted-2">
                        {c.position}
                        {c.team ? `-${c.team}` : ""}
                      </span>
                    </span>
                    <span
                      className={`[grid-area:ev] text-right font-mono text-[14px] font-semibold ${evTone(ev)}`}
                    >
                      {ev != null ? `${ev >= 0 ? "+" : ""}${ev.toFixed(1)}` : EMPTY}
                    </span>
                    {c.survival_pct != null ? (
                      <span className="[grid-area:sub] flex items-center justify-start gap-1.5 sm:justify-end">
                        <SurvBar pct={c.survival_pct} />
                        <span
                          className={`font-mono text-[13px] ${survivalTone(c.survival_pct)}`}
                        >
                          {c.survival_pct}%
                        </span>
                      </span>
                    ) : (
                      <span className="[grid-area:sub] text-left font-mono text-[13px] text-muted-2 sm:text-right">
                        {EMPTY}
                      </span>
                    )}
                    <span className="[grid-area:tags] flex min-w-0 flex-wrap items-baseline gap-1">
                      {tagsFor(c)
                        .slice(0, 3)
                        .map((t) => (
                          <Chip key={t.text} text={t.text} tone={t.tone} />
                        ))}
                    </span>
                  </div>
                  {note && (
                    <p className="mt-1 text-[11px] leading-snug text-muted-2">
                      {note}
                    </p>
                  )}
                  <RoleLine read={opportunityById[c.player_id]} />
                  <DivergenceLine adp={c.adp} valueRank={c.ktc_overall_rank} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Plays strip */}
      {playsHasContent && (
        <div>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
            Plays
          </span>
          <div className="mt-1 space-y-1.5">
            {activePlays.map((c) => {
              const onBoard = c.followthrough_targets.filter((t) =>
                cands.some((cc) => cc.player_id === t.player_id),
              );
              const coverage = derivePlayCoverage({
                play: c,
                ownedPlayers,
                valueMap,
                laneMemberships,
                formatRules,
                oppHolders,
              });
              return (
                <div
                  key={c.commitment_id}
                  className="rounded-md border border-border-soft bg-surface/30 px-3 py-2"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="flex flex-wrap items-baseline gap-2">
                      <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-accent">
                        {archetypeLabel(c.archetype)}
                      </span>
                      <span className="text-[13px] font-semibold text-foreground">
                        {c.play_name}
                      </span>
                      {coverage ? <CoverageChip verdict={coverage.verdict} /> : null}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        abandonPlayWithSync({
                          ctx: syncCtx,
                          commitmentId: c.commitment_id,
                        });
                        refresh();
                      }}
                      className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-2 hover:text-danger transition-colors"
                    >
                      Abandon
                    </button>
                  </div>
                  {coverage ? (
                    <CoverageLine coverage={coverage} />
                  ) : (
                    <p className="mt-0.5 text-[11px] text-muted-2">
                      No target on the board yet; it surfaces in the table when one
                      is available.
                    </p>
                  )}
                  {onBoard.length > 0 ? (
                    <p className="mt-0.5 text-[11px] text-accent">
                      Tagged on the board: {onBoard.map((t) => t.name).join(", ")}
                    </p>
                  ) : null}
                </div>
              );
            })}
            {openSuggestions.map((p) => (
              <div
                key={`${p.archetype}-${p.primary_player.player_id}`}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-md border border-border-soft bg-surface/30 px-3 py-1.5"
              >
                <span className="flex flex-wrap items-baseline gap-2">
                  <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-2">
                    {archetypeLabel(p.archetype)}
                  </span>
                  <span className="text-[13px] font-semibold text-foreground">
                    {p.name}
                  </span>
                </span>
                <span className="flex items-baseline gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      commitPlayWithSync({
                        ctx: syncCtx,
                        play: p,
                        committedAtPickNo: currentPickNo ?? 0,
                      });
                      refresh();
                    }}
                    className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent hover:text-foreground transition-colors"
                  >
                    Track
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      dismissSuggestionWithSync({ ctx: syncCtx, play: p });
                      refresh();
                    }}
                    className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-2 hover:text-danger transition-colors"
                  >
                    Dismiss
                  </button>
                </span>
              </div>
            ))}
          </div>
          {dismissed.length > 0 && (
            <p className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-2">
              {dismissed.length} dismissed ·{" "}
              <button
                type="button"
                onClick={() => {
                  for (const d of dismissed)
                    restoreSuggestionWithSync({ ctx: syncCtx, key: d.key });
                  refresh();
                }}
                className="underline decoration-dotted hover:text-accent"
              >
                restore all
              </button>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
