"use client";

/**
 * Active Plays Panel. The REMEMBER + STAY DISCIPLINED surface.
 *
 * Three sections:
 *   1. Active commitments (with abandon control + auto-execute on
 *      follow-through detection)
 *   2. Suggestions the engine sees from current roster shape (with
 *      commit buttons; this is the "identify what they could/should
 *      be" verb per founder direction 2026-05-20)
 *   3. History (executed / lapsed / abandoned, collapsed)
 *
 * Auto-execute: on mount + when picksMadeForUser changes, scan active
 * commitments to see if any picks_made entries match the play's
 * follow-through targets. If so, mark executed.
 */

import { useEffect, useMemo, useState } from "react";
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
  suggestionKey,
  type DismissedSuggestion,
} from "@/lib/plays-storage";
import type {
  Play,
  PlayCommitment,
} from "@/lib/strategy/plays/types";
import { PlayUrgencyChip, PartnerSurvivalList } from "./plays-shared";

type PickRef = { player_id: string; pick_no: number };

export function ActivePlaysPanel({
  leagueId,
  currentPickNo,
  suggestedPlays = [],
  picksMadeForUser = [],
}: {
  leagueId: string;
  currentPickNo: number | null;
  suggestedPlays?: Play[];
  picksMadeForUser?: PickRef[];
}) {
  const [commitments, setCommitments] = useState<PlayCommitment[]>([]);
  const [dismissed, setDismissed] = useState<DismissedSuggestion[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showDismissed, setShowDismissed] = useState(false);

  // Mount + dependency-driven sync. Order:
  //   1. Lapse stale commitments
  //   2. Auto-execute commitments whose targets the user already drafted
  //   3. Re-read into state
  useEffect(() => {
    if (currentPickNo != null) {
      lapseStaleCommitments({ leagueId, currentPickNo });
    }

    // Auto-execute: for each active commitment, check if the user has
    // already drafted a follow-through target. If yes, mark executed
    // with the pick number it landed.
    const userPicksById = new Map<string, number>();
    for (const p of picksMadeForUser) userPicksById.set(p.player_id, p.pick_no);

    const current = getPlayCommitments(leagueId);
    for (const c of current) {
      if (c.status !== "active") continue;
      for (const target of c.followthrough_targets) {
        const pickNo = userPicksById.get(target.player_id);
        if (pickNo != null) {
          markPlayExecuted({
            leagueId,
            commitmentId: c.commitment_id,
            executedWith: target,
            executedAtPickNo: pickNo,
          });
          break;
        }
      }
    }

    setCommitments(getPlayCommitments(leagueId));
    setDismissed(getDismissedSuggestions(leagueId));
  }, [leagueId, currentPickNo, picksMadeForUser]);

  const active = commitments.filter((c) => c.status === "active");
  const historic = commitments.filter((c) => c.status !== "active");
  const dismissedKeys = useMemo(
    () => new Set(dismissed.map((d) => d.key)),
    [dismissed],
  );

  // Suggestions: filter out anything already actively committed so
  // the same play doesn't show twice.
  const committedKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const c of commitments) {
      if (c.status === "active") {
        keys.add(`${c.archetype}:${c.primary_player.player_id}`);
      }
    }
    return keys;
  }, [commitments]);
  const openSuggestions = suggestedPlays.filter((p) => {
    const key = `${p.archetype}:${p.primary_player.player_id}`;
    return !committedKeys.has(key) && !dismissedKeys.has(key);
  });

  function handleDismiss(play: Play) {
    dismissSuggestion({ leagueId, play });
    setDismissed(getDismissedSuggestions(leagueId));
  }

  function handleRestore(key: string) {
    restoreSuggestion({ leagueId, key });
    setDismissed(getDismissedSuggestions(leagueId));
  }

  if (
    commitments.length === 0 &&
    openSuggestions.length === 0 &&
    dismissed.length === 0
  ) {
    return null;
  }

  return (
    <section className="mt-6 rounded-lg border border-accent/40 bg-surface px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
            Your active plays
          </div>
          <p className="mt-1 text-[12px] leading-snug text-muted">
            Multi-pick plays the engine sees in your roster. Commit
            to one and we will remember it on every pick + trade
            decision.
          </p>
        </div>
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-2">
          {active.length} active · {openSuggestions.length} suggested
          {historic.length > 0 ? ` · ${historic.length} closed` : ""}
        </span>
      </div>

      {active.length > 0 && (
        <div className="mt-3">
          <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-2">
            Committed
          </div>
          <ul className="mt-1 space-y-2">
            {active.map((c) => (
              <ActivePlayRow
                key={c.commitment_id}
                commitment={c}
                leagueId={leagueId}
                onAbandon={(id) =>
                  setCommitments((cs) =>
                    cs.map((x) =>
                      x.commitment_id === id
                        ? { ...x, status: "abandoned" }
                        : x,
                    ),
                  )
                }
              />
            ))}
          </ul>
        </div>
      )}

      {openSuggestions.length > 0 && (
        <div className="mt-4">
          <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-2">
            Plays the engine sees you could commit to
          </div>
          <ul className="mt-1 space-y-2">
            {openSuggestions.map((p) => (
              <SuggestionRow
                key={`${p.archetype}-${p.primary_player.player_id}`}
                play={p}
                leagueId={leagueId}
                currentPickNo={currentPickNo}
                onCommit={() => setCommitments(getPlayCommitments(leagueId))}
                onDismiss={() => handleDismiss(p)}
              />
            ))}
          </ul>
        </div>
      )}

      {active.length === 0 && openSuggestions.length === 0 && (
        <p className="mt-3 text-[12px] leading-snug text-muted-2">
          No active plays yet. Commit one on The Call or from a
          suggestion to see discipline reminders here.
        </p>
      )}

      {historic.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="mt-3 font-mono text-[9px] uppercase tracking-[0.16em] text-muted-2 hover:text-accent transition-colors"
            aria-expanded={showHistory}
          >
            {showHistory ? "Hide" : "Show"} history ({historic.length})
          </button>
          {showHistory && (
            <ul className="mt-2 space-y-1 border-t border-border-soft pt-2">
              {historic.map((c) => (
                <HistoricPlayRow key={c.commitment_id} commitment={c} />
              ))}
            </ul>
          )}
        </>
      )}

      {dismissed.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowDismissed((v) => !v)}
            className="mt-3 font-mono text-[9px] uppercase tracking-[0.16em] text-muted-2 hover:text-accent transition-colors"
            aria-expanded={showDismissed}
          >
            {showDismissed ? "Hide" : "Show"} dismissed ({dismissed.length})
          </button>
          {showDismissed && (
            <ul className="mt-2 space-y-1 border-t border-border-soft pt-2">
              {dismissed.map((d) => (
                <li
                  key={d.key}
                  className="flex items-center justify-between gap-2 text-[11px] leading-snug"
                >
                  <span>
                    <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-2">
                      {archetypeLabel(d.archetype)}
                    </span>{" "}
                    <span className="text-foreground">{d.play_name}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRestore(d.key)}
                    className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-2 hover:text-accent transition-colors"
                    title="Restore this play"
                  >
                    Restore
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function ActivePlayRow({
  commitment,
  leagueId,
  onAbandon,
}: {
  commitment: PlayCommitment;
  leagueId: string;
  onAbandon: (commitmentId: string) => void;
}) {
  function handleAbandon() {
    abandonPlay({ leagueId, commitmentId: commitment.commitment_id });
    onAbandon(commitment.commitment_id);
  }

  return (
    <li className="rounded-sm border border-border-soft bg-surface-2 px-3 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-accent">
            {archetypeLabel(commitment.archetype)}
          </span>
          <span className="text-sm font-semibold text-foreground">
            {commitment.play_name}
          </span>
        </div>
        <button
          type="button"
          onClick={handleAbandon}
          className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-2 hover:text-danger transition-colors"
          title="Abandon this play"
        >
          Abandon
        </button>
      </div>
      <p className="mt-1 text-[11px] leading-snug text-muted">
        {commitment.followthrough_description}
      </p>
      <p className="mt-1 font-mono text-[10px] text-muted-2">
        Lapses after pick {commitment.lapses_after_pick_no}
      </p>
      {commitment.followthrough_targets.length > 0 && (
        <p className="mt-1 text-[11px] leading-snug text-foreground">
          <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-2">
            Targets:
          </span>{" "}
          {commitment.followthrough_targets
            .map((t) => `${t.name} (${t.position})`)
            .join(", ")}
        </p>
      )}
    </li>
  );
}

function SuggestionRow({
  play,
  leagueId,
  currentPickNo,
  onCommit,
  onDismiss,
}: {
  play: Play;
  leagueId: string;
  currentPickNo: number | null;
  onCommit: () => void;
  onDismiss: () => void;
}) {
  function handleCommit() {
    commitPlay({
      leagueId,
      play,
      committedAtPickNo: currentPickNo ?? 0,
    });
    onCommit();
  }
  return (
    <li className="rounded-sm border border-border-soft bg-surface-2 px-3 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-accent">
            {archetypeLabel(play.archetype)}
          </span>
          <span className="text-sm font-semibold text-foreground">
            {play.name}
          </span>
          <PlayUrgencyChip urgency={play.play_urgency} />
        </div>
        <div className="flex items-baseline gap-3">
          <button
            type="button"
            onClick={handleCommit}
            className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent hover:text-foreground transition-colors"
          >
            Commit to play
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-2 hover:text-danger transition-colors"
            title="Dismiss this suggestion (restore anytime)"
          >
            Dismiss
          </button>
        </div>
      </div>
      <p className="mt-1 text-[12px] leading-snug text-foreground">
        {play.genius_vs_average_line}
      </p>
      <p className="mt-1 text-[11px] leading-snug text-muted-2">
        <span className="font-mono uppercase tracking-[0.14em]">
          Follow-through:
        </span>{" "}
        {play.followthrough.description}
      </p>
      <PartnerSurvivalList partners={play.followthrough.target_candidates} />
    </li>
  );
}

function HistoricPlayRow({ commitment }: { commitment: PlayCommitment }) {
  const statusLabel =
    commitment.status === "executed"
      ? "Executed"
      : commitment.status === "lapsed"
        ? "Lapsed"
        : "Abandoned";
  const statusTone =
    commitment.status === "executed"
      ? "text-success"
      : commitment.status === "lapsed"
        ? "text-warning"
        : "text-muted-2";
  return (
    <li className="text-[11px] leading-snug">
      <span className={`font-mono text-[9px] uppercase tracking-[0.14em] ${statusTone}`}>
        {statusLabel}
      </span>{" "}
      <span className="text-foreground">{commitment.play_name}</span>
      {commitment.executed_with && (
        <span className="text-muted-2">
          {" "}
          · executed with {commitment.executed_with.name}
        </span>
      )}
    </li>
  );
}
