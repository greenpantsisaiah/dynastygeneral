"use client";

/**
 * Decision Board. THE CALL on top, then supportive PERSPECTIVES.
 *
 * Founder model (2026-05-22): a pick is seen through many non-exclusive
 * perspectives, not three horizon lanes. Win-now / future are just two
 * perspectives among several (best value, going-soon/scarcity, tier
 * cliffs, win-now, future, plays). Each perspective surfaces its top
 * 2-3 picks as the same consistent cards; the loud ones (relevant /
 * urgent now) sit expanded, the quiet ones collapse to a header you can
 * open, so nothing is lost. Loudness is stage-aware: value + scarcity
 * yell early (everyone fights for the best players), combos / plays /
 * cliffs yell later. Display-aware only.
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
const TOP_AT_A_GLANCE = 3;
const LOUD_THRESHOLD = 40;
const EARLY_ROUND_MAX = 6;
const ASSUMED_TEAMS = 12;
const DROPOFF_POSITIONS = ["RB", "WR", "TE", "QB"] as const;
const DROPOFF_WINDOW = 12;
const CLIFF_RATIO = 1.6;

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
  const survLabel = c.availability_next_pick
    ? c.availability_next_pick.replace("_", " ")
    : null;
  return (
    <div className="rounded-md border border-border-soft bg-surface/30 px-2.5 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[14px] font-semibold leading-tight text-foreground truncate">
          {c.name}
        </span>
        <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-2">
          {c.position}
          {c.team ? `-${c.team}` : ""}
        </span>
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-2 font-mono text-[10px]">
        {ev != null ? (
          <span className={evColor}>
            <span className="text-muted-2">EV </span>
            {ev >= 0 ? "+" : ""}
            {ev.toFixed(1)}
          </span>
        ) : (
          <span />
        )}
        {c.survival_pct != null && (
          <span className={survivalTone(c.survival_pct)}>
            {survLabel ? `${survLabel} ` : ""}
            {c.survival_pct}%
          </span>
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
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState<Set<string>>(new Set());

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

  const callCand = cands.find((c) => c.player_id === standingCallId) ?? null;
  const callSurvival = callCand?.survival_pct ?? null;
  const callAtRisk = callSurvival != null && callSurvival < NO_RUSH_SURVIVAL;
  const callEv = callCand ? computeEv(callCand, pickNo) : null;
  const callEvColor =
    callEv == null ? "text-muted-2" : callEv >= 0 ? "text-success" : "text-danger";

  const round = Math.max(1, Math.ceil(pickNo / ASSUMED_TEAMS));
  const early = round <= EARLY_ROUND_MAX;
  const ev = (c: DecisionQuadrantCandidate) => computeEv(c, pickNo) ?? -999;
  const notCall = (c: DecisionQuadrantCandidate) => c.player_id !== standingCallId;

  // Perspectives, each a lens with its own relevant picks. Loudness is
  // stage-aware (value/scarcity early, plays/cliffs late). A pick can
  // appear under several.
  const byValue = [...cands]
    .filter((c) => typeof c.value === "number" && notCall(c))
    .sort((a, b) => (b.value as number) - (a.value as number));
  const goingSoon = cands
    .filter(
      (c) =>
        notCall(c) && c.survival_pct != null && c.survival_pct < NO_RUSH_SURVIVAL,
    )
    .sort((a, b) => ev(b) - ev(a));
  const cliffPicks = byValue.filter((c) => cliffByPlayer.has(c.player_id));
  const winNow = cands
    .filter((c) => notCall(c) && c.timeline_lane === "win-now")
    .sort((a, b) => (b.value ?? -999) - (a.value ?? -999));
  const future = cands
    .filter((c) => notCall(c) && c.timeline_lane === "future")
    .sort((a, b) => (b.value ?? -999) - (a.value ?? -999));

  const playerPerspectives = [
    {
      id: "value",
      label: "Best value",
      hint: "value vs cost",
      loudness: early ? 100 : 62,
      picks: byValue,
    },
    {
      id: "soon",
      label: "Going soon",
      hint: "you'd lose by waiting",
      loudness: goingSoon.length > 0 ? 55 + goingSoon.length * 8 : 0,
      picks: goingSoon,
    },
    {
      id: "cliffs",
      label: "Tier cliffs",
      hint: "last before a drop",
      loudness: cliffPicks.length > 0 ? 45 + cliffPicks.length * 10 : 0,
      picks: cliffPicks,
    },
    {
      id: "winnow",
      label: "Win-now",
      hint: "contend now",
      loudness: 32,
      picks: winNow,
    },
    {
      id: "future",
      label: "Future",
      hint: "build forward",
      loudness: 32,
      picks: future,
    },
  ]
    .filter((p) => p.picks.length > 0)
    .sort((a, b) => b.loudness - a.loudness);

  // Plays perspective (committed + suggestions). Louder later, when the
  // combos and handcuffs that earlier picks opened start to matter.
  const committedKeys = new Set(
    activePlays.map((c) => `${c.archetype}:${c.primary_player.player_id}`),
  );
  const dismissedKeys = new Set(dismissed.map((d) => d.key));
  const openSuggestions = suggestedPlays.filter((p) => {
    const key = `${p.archetype}:${p.primary_player.player_id}`;
    return !committedKeys.has(key) && !dismissedKeys.has(key);
  });
  const playsLoudness =
    activePlays.length * 22 + openSuggestions.length * 6 + (early ? 0 : 28);
  const playsHasContent = activePlays.length > 0 || openSuggestions.length > 0;

  function refresh() {
    setCommitments(getPlayCommitments(leagueId));
    setDismissed(getDismissedSuggestions(leagueId));
  }
  function toggleOpen(id: string) {
    setOpened((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll(id: string) {
    setShowAll((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
            <span className="shrink-0 text-right leading-none">
              <span className="block font-mono text-[8px] uppercase tracking-[0.16em] text-muted-2">
                EV
              </span>
              <span className={`font-mono text-[20px] font-semibold ${callEvColor}`}>
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
        {callCand && <TagChips tags={tagsFor(callCand)} />}
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

      {/* Supportive perspectives */}
      {playerPerspectives.map((p) => {
        const isLoud = p.loudness >= LOUD_THRESHOLD;
        const isOpen = isLoud || opened.has(p.id);
        const isFull = showAll.has(p.id);
        const shown = isFull ? p.picks : p.picks.slice(0, TOP_AT_A_GLANCE);
        return (
          <PerspectiveSection
            key={p.id}
            label={p.label}
            hint={p.hint}
            count={p.picks.length}
            isOpen={isOpen}
            quiet={!isLoud}
            onToggle={() => toggleOpen(p.id)}
          >
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {shown.map((c) => (
                <PickRow key={c.player_id} c={c} pickNo={pickNo} tags={tagsFor(c)} />
              ))}
            </div>
            {p.picks.length > TOP_AT_A_GLANCE && (
              <button
                type="button"
                onClick={() => toggleAll(p.id)}
                className="mt-2 font-mono text-[9px] uppercase tracking-[0.16em] text-muted-2 hover:text-accent transition-colors"
              >
                {isFull
                  ? "Show fewer"
                  : `Show all ${p.picks.length}`}
              </button>
            )}
          </PerspectiveSection>
        );
      })}

      {/* Plays perspective */}
      {playsHasContent && (
        <PerspectiveSection
          label="Plays"
          hint="combos earlier picks opened"
          count={activePlays.length + openSuggestions.length}
          isOpen={playsLoudness >= LOUD_THRESHOLD || opened.has("plays")}
          quiet={playsLoudness < LOUD_THRESHOLD}
          onToggle={() => toggleOpen("plays")}
        >
          {activePlays.length > 0 && (
            <div className="mt-2">
              <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-2">
                Running
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
                        surfaces above when at risk
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {openSuggestions.length > 0 && (
            <div className="mt-2">
              <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-2">
                Could run
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
        </PerspectiveSection>
      )}
    </div>
  );
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

// A perspective: a header (label + count) and its picks. Loud ones
// render open; quiet ones collapse to a clickable header so the
// perspective is never lost, just recessed.
function PerspectiveSection({
  label,
  hint,
  count,
  isOpen,
  quiet,
  onToggle,
  children,
}: {
  label: string;
  hint: string;
  count: number;
  isOpen: boolean;
  quiet: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={quiet ? onToggle : undefined}
        className={`flex items-baseline gap-2 ${quiet ? "cursor-pointer" : "cursor-default"}`}
        aria-expanded={isOpen}
      >
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
          {label}
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-2">
          {hint} · {count}
        </span>
        {quiet && (
          <span className="font-mono text-[9px] text-muted-2">
            {isOpen ? "−" : "+"}
          </span>
        )}
      </button>
      {isOpen && children}
    </div>
  );
}
