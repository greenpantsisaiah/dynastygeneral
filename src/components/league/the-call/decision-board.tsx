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
import { computeEv } from "./candidate-bits";
import {
  abandonPlay,
  archetypeLabel,
  commitPlay,
  dismissSuggestion,
  getDismissedSuggestions,
  getPlayCommitments,
  lapseStaleCommitments,
  markPlayExecuted,
  restoreSuggestion,
  type DismissedSuggestion,
} from "@/lib/plays-storage";

const NO_RUSH_SURVIVAL = 75;
const DROPOFF_POSITIONS = ["RB", "WR", "TE", "QB"] as const;
const DROPOFF_WINDOW = 12;
const CLIFF_RATIO = 1.6;
const COL = "grid grid-cols-[minmax(0,1fr)_3.5rem_7rem_minmax(0,1.4fr)] items-baseline gap-3";
const EMPTY = "-";

type SortKey = "value" | "ev" | "survival";

export type DecisionBoardProps = {
  decision: Decision;
  disclaimer?: string | null;
  leagueId: string;
  currentPickNo: number | null;
  suggestedPlays?: Play[];
  picksMadeForUser?: { player_id: string; pick_no: number }[];
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

function Chip({ text, tone }: { text: string; tone?: "muted" | "warn" }) {
  const cls =
    tone === "warn"
      ? "border-warning/50 text-warning"
      : "border-border-soft text-muted-2";
  return (
    <span
      className={`font-mono text-[8px] uppercase tracking-[0.12em] border rounded-full px-1 py-0.5 ${cls}`}
    >
      {text}
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
}: DecisionBoardProps) {
  const pickNo = decision.pick_no;
  const standingCallId = decision.recommendation.player_id;
  const cands = decision.quadrant_candidates;

  const [commitments, setCommitments] = useState<PlayCommitment[]>([]);
  const [dismissed, setDismissed] = useState<DismissedSuggestion[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("value");

  useEffect(() => {
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
          markPlayExecuted({
            leagueId,
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
  }, [leagueId, currentPickNo, picksMadeForUser]);

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

  function tagsFor(c: DecisionQuadrantCandidate): { text: string; warn: boolean }[] {
    const out: { text: string; warn: boolean }[] = [];
    if (c.survival_pct != null && c.survival_pct < NO_RUSH_SURVIVAL) {
      out.push({ text: "soon", warn: true });
    }
    const cliff = cliffByPlayer.get(c.player_id);
    if (cliff) out.push({ text: cliff, warn: true });
    if (c.timeline_lane === "win-now") out.push({ text: "win-now", warn: false });
    else if (c.timeline_lane === "future") out.push({ text: "future", warn: false });
    for (const p of advancesByPlayer.get(c.player_id) ?? [])
      out.push({ text: p, warn: false });
    for (const play of decision.plays_this_enables) {
      if (
        play.followthrough.target_candidates.some(
          (t) => t.player_id === c.player_id,
        )
      ) {
        out.push({ text: play.name, warn: false });
      }
    }
    const seen = new Set<string>();
    return out.filter((t) => (seen.has(t.text) ? false : (seen.add(t.text), true)));
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
    <div className="px-5 py-4 space-y-4">
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
              <Chip key={t.text} text={t.text} tone={t.warn ? "warn" : "muted"} />
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
              {sortBtn("ev", "EV")}
              <span className="text-muted-2">·</span>
              {sortBtn("survival", "Survival")}
            </span>
          </div>
          <div className="rounded-md border border-border-soft overflow-hidden">
            <div
              className={`${COL} bg-surface/50 px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-2`}
            >
              <span>Player</span>
              <span className="text-right">EV</span>
              <span className="text-right">Survival</span>
              <span>Tags</span>
            </div>
            {rows.map((c) => {
              const ev = computeEv(c, pickNo);
              const survLabel = c.availability_next_pick
                ? c.availability_next_pick.replace("_", " ")
                : null;
              return (
                <div
                  key={c.player_id}
                  className={`${COL} px-3 py-1.5 border-t border-border-soft/50`}
                >
                  <span className="truncate">
                    <span className="text-[13px] font-semibold text-foreground">
                      {c.name}
                    </span>{" "}
                    <span className="font-mono text-[9px] uppercase text-muted-2">
                      {c.position}
                      {c.team ? `-${c.team}` : ""}
                    </span>
                  </span>
                  <span
                    className={`text-right font-mono text-[12px] font-semibold ${evTone(ev)}`}
                  >
                    {ev != null ? `${ev >= 0 ? "+" : ""}${ev.toFixed(1)}` : EMPTY}
                  </span>
                  <span
                    className={`text-right font-mono text-[11px] ${survivalTone(c.survival_pct)}`}
                  >
                    {c.survival_pct != null
                      ? `${survLabel ? survLabel + " " : ""}${c.survival_pct}%`
                      : EMPTY}
                  </span>
                  <span className="flex flex-wrap items-baseline gap-1">
                    {tagsFor(c)
                      .slice(0, 3)
                      .map((t) => (
                        <Chip
                          key={t.text}
                          text={t.text}
                          tone={t.warn ? "warn" : "muted"}
                        />
                      ))}
                  </span>
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
            {activePlays.map((c) => (
              <div
                key={c.commitment_id}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-md border border-border-soft bg-surface/30 px-3 py-1.5"
              >
                <span className="flex flex-wrap items-baseline gap-2">
                  <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-accent">
                    {archetypeLabel(c.archetype)}
                  </span>
                  <span className="text-[12px] font-semibold text-foreground">
                    {c.play_name}
                  </span>
                  {c.followthrough_targets.length > 0 && (
                    <span className="text-[11px] text-muted">
                      {c.followthrough_targets.map((t) => t.name).join(", ")}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    abandonPlay({ leagueId, commitmentId: c.commitment_id });
                    refresh();
                  }}
                  className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-2 hover:text-danger transition-colors"
                >
                  Abandon
                </button>
              </div>
            ))}
            {openSuggestions.map((p) => (
              <div
                key={`${p.archetype}-${p.primary_player.player_id}`}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-md border border-border-soft bg-surface/30 px-3 py-1.5"
              >
                <span className="flex flex-wrap items-baseline gap-2">
                  <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-2">
                    {archetypeLabel(p.archetype)}
                  </span>
                  <span className="text-[12px] font-semibold text-foreground">
                    {p.name}
                  </span>
                </span>
                <span className="flex items-baseline gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      commitPlay({
                        leagueId,
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
                      dismissSuggestion({ leagueId, play: p });
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
                  for (const d of dismissed) restoreSuggestion({ leagueId, key: d.key });
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
