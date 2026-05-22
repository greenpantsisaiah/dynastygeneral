"use client";

/**
 * Decision Board. One timing-organized feed (founder direction
 * 2026-05-21): there is no "lanes vs plays vs suggestions", they are
 * the same surface sliced. Plays are non-exclusive TAGS on picks
 * (win-now / future / last-before-cliff / handcuff / a committed
 * play), and the surface is organized by URGENCY:
 *
 *   THE CALL    the one pick most worth making now (at-risk + valuable)
 *   ALSO SOON   other picks you'd lose by waiting
 *   WAIT        will-last value + tracked plays; auto-surfaces as
 *               survival drops
 *
 * The engine's survival-weighting already computes "what will I lose
 * if I wait", so THE CALL is the engine recommendation reframed. When
 * nothing is at risk, the call becomes "take best value or trade."
 * Display-aware only: ranking is value x scarcity; tags don't bias the
 * engine. Replaces the old four-angle board + the standalone Active
 * Plays panel + the Draft Path Projector (retired to pre-draft).
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

// Survival at or above this means the player will reach your next pick:
// no rush, he goes to WAIT. Below it, he's at risk and worth acting on.
const NO_RUSH_SURVIVAL = 75;
const DROPOFF_POSITIONS = ["RB", "WR", "TE", "QB"] as const;
const DROPOFF_WINDOW = 12;
const CLIFF_RATIO = 1.6;

export type DecisionBoardProps = {
  decision: Decision;
  leagueId: string;
  currentPickNo: number | null;
  suggestedPlays?: Play[];
  picksMadeForUser?: { player_id: string; pick_no: number }[];
};

/* ---- cliff detection (the "last before a drop" tag) ---- */
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

function TagChips({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {tags.map((t) => (
        <span
          key={t}
          className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-2 border border-border-soft rounded-full px-1.5 py-0.5"
        >
          {t}
        </span>
      ))}
    </div>
  );
}

// Compact pick card sized for a multi-column grid: name + EV on the
// first line, position + survival on the second, up to two tags. The
// color of EV (green/red) and survival (green/amber/red) carry the
// at-a-glance read so the words ("coin flip", "likely here") are
// dropped here and kept only on THE CALL hero.
function PickRow({
  c,
  pickNo,
  tags,
}: {
  c: DecisionQuadrantCandidate;
  pickNo: number;
  tags: string[];
}) {
  const ev = computeEv(c, pickNo);
  const evColor =
    ev == null ? "text-muted-2" : ev >= 0 ? "text-success" : "text-danger";
  return (
    <div className="rounded-md border border-border-soft bg-surface/30 px-2.5 py-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-semibold text-foreground truncate">
          {c.name}
        </span>
        {ev != null && (
          <span
            className={`shrink-0 font-mono text-[12px] font-semibold ${evColor}`}
          >
            {ev >= 0 ? "+" : ""}
            {ev.toFixed(1)}
          </span>
        )}
      </div>
      <div className="mt-0.5 flex items-baseline justify-between gap-2 font-mono text-[10px]">
        <span className="text-muted-2 truncate">
          {c.position}
          {c.team ? `-${c.team}` : ""}
        </span>
        {c.survival_pct != null && (
          <span className={survivalTone(c.survival_pct)}>{c.survival_pct}%</span>
        )}
      </div>
      {tags.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {tags.slice(0, 2).map((t) => (
            <span
              key={t}
              className="font-mono text-[8px] uppercase tracking-[0.12em] text-muted-2 border border-border-soft rounded-full px-1 py-0.5"
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function DecisionBoard({
  decision,
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

  function tagsFor(c: DecisionQuadrantCandidate): string[] {
    const out: string[] = [];
    if (c.timeline_lane === "win-now") out.push("win-now");
    else if (c.timeline_lane === "future") out.push("future");
    const cliff = cliffByPlayer.get(c.player_id);
    if (cliff) out.push(cliff);
    for (const p of advancesByPlayer.get(c.player_id) ?? []) out.push(p);
    for (const play of decision.plays_this_enables) {
      if (
        play.followthrough.target_candidates.some(
          (t) => t.player_id === c.player_id,
        )
      ) {
        out.push(play.name);
      }
    }
    return Array.from(new Set(out));
  }

  // Partition by timing. THE CALL is the engine recommendation; the
  // rest split into act-soon (at risk) and wait (will last).
  const callCand =
    cands.find((c) => c.player_id === standingCallId) ?? null;
  const callSurvival = callCand?.survival_pct ?? null;
  const callAtRisk =
    callSurvival != null && callSurvival < NO_RUSH_SURVIVAL;
  const callEv = callCand ? computeEv(callCand, pickNo) : null;
  const callEvColor =
    callEv == null ? "text-muted-2" : callEv >= 0 ? "text-success" : "text-danger";

  const others = cands.filter((c) => c.player_id !== standingCallId);
  const atRisk = others
    .filter((c) => c.survival_pct != null && c.survival_pct < NO_RUSH_SURVIVAL)
    .sort((a, b) => (computeEv(b, pickNo) ?? -999) - (computeEv(a, pickNo) ?? -999))
    .slice(0, 3);
  const willLast = others
    .filter((c) => c.survival_pct == null || c.survival_pct >= NO_RUSH_SURVIVAL)
    .sort((a, b) => (b.value ?? -999) - (a.value ?? -999))
    .slice(0, 5);

  // For the calm-call framing, name the best value that will keep.
  const topWait = willLast[0] ?? null;

  // Suggestions you could track (exclude already committed + dismissed).
  const committedKeys = new Set(
    activePlays.map((c) => `${c.archetype}:${c.primary_player.player_id}`),
  );
  const dismissedKeys = new Set(dismissed.map((d) => d.key));
  const openSuggestions = suggestedPlays.filter((p) => {
    const key = `${p.archetype}:${p.primary_player.player_id}`;
    return !committedKeys.has(key) && !dismissedKeys.has(key);
  });

  function refresh() {
    setCommitments(getPlayCommitments(leagueId));
    setDismissed(getDismissedSuggestions(leagueId));
  }

  return (
    <div className="px-5 py-4 space-y-5">
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
            <span
              className={`shrink-0 font-mono text-[20px] font-semibold ${callEvColor} leading-none`}
            >
              {callEv >= 0 ? "+" : ""}
              {callEv.toFixed(1)}
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
        {callCand && <TagChips tags={tagsFor(callCand)} />}
        <p className="mt-2 text-[12px] leading-snug text-muted">
          {decision.recommendation.primary_reason}
        </p>
        {callAtRisk && topWait ? (
          <p className="mt-1 text-[11px] leading-snug text-warning">
            {topWait.name} (higher value) will likely keep ({topWait.survival_pct}%);
            grab {decision.recommendation.name} now.
          </p>
        ) : !callAtRisk ? (
          <p className="mt-1 text-[11px] leading-snug text-warning">
            Nothing's about to be gone. Take {decision.recommendation.name} for
            value, or trade down; you won't lose your targets by waiting.
          </p>
        ) : null}
      </div>

      {/* ALSO SOON */}
      {atRisk.length > 0 && (
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
            Also soon
          </div>
          <p className="mt-0.5 text-[10px] leading-snug text-muted-2">
            Other picks you'd lose by waiting.
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {atRisk.map((c) => (
              <PickRow key={c.player_id} c={c} pickNo={pickNo} tags={tagsFor(c)} />
            ))}
          </div>
        </div>
      )}

      {/* WAIT */}
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-2">
          Wait
        </div>
        <p className="mt-0.5 text-[10px] leading-snug text-muted-2">
          No rush; these reach your next pick. They surface above as their
          survival drops.
        </p>

        {willLast.length > 0 && (
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {willLast.map((c) => (
              <PickRow key={c.player_id} c={c} pickNo={pickNo} tags={tagsFor(c)} />
            ))}
          </div>
        )}

        {/* Tracked plays (committed) */}
        {activePlays.length > 0 && (
          <div className="mt-3">
            <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-2">
              Plays you're running
            </div>
            <ul className="mt-1 grid gap-2 sm:grid-cols-2">
              {activePlays.map((c) => (
                <li
                  key={c.commitment_id}
                  className="rounded-md border border-border-soft bg-surface/30 px-2.5 py-1.5"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="flex flex-wrap items-baseline gap-2">
                      <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-accent">
                        {archetypeLabel(c.archetype)}
                      </span>
                      <span className="text-[13px] font-semibold text-foreground">
                        {c.play_name}
                      </span>
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
                  {c.followthrough_targets.length > 0 && (
                    <p className="mt-1 text-[11px] leading-snug text-muted">
                      {c.followthrough_targets.map((t) => t.name).join(", ")} ·
                      no rush, surfaces above when at risk
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Plays you could run (suggestions) */}
        {openSuggestions.length > 0 && (
          <div className="mt-3">
            <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-2">
              Plays you could run
            </div>
            <ul className="mt-1 grid gap-2 sm:grid-cols-2">
              {openSuggestions.map((p) => (
                <li
                  key={`${p.archetype}-${p.primary_player.player_id}`}
                  className="rounded-md border border-border-soft bg-surface/30 px-2.5 py-1.5"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="flex flex-wrap items-baseline gap-2">
                      <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-accent">
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
                  <p className="mt-1 text-[11px] leading-snug text-muted line-clamp-2">
                    {p.genius_vs_average_line}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {dismissed.length > 0 && (
          <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-2">
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
    </div>
  );
}
