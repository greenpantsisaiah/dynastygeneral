"use client";

/**
 * Active Plays Panel. Renders the user's currently committed plays
 * on the hub. The REMEMBER verb: persistent surface showing which
 * plays the user is on the hook for plus the next required move.
 *
 * The panel also shows lapsed and executed plays (collapsed) so the
 * user can see their play discipline over the draft. Founder
 * direction 2026-05-20: "remember it / stay disciplined."
 */

import { useEffect, useState } from "react";
import {
  abandonPlay,
  archetypeLabel,
  getPlayCommitments,
  lapseStaleCommitments,
} from "@/lib/plays-storage";
import type { PlayCommitment } from "@/lib/strategy/plays/types";

export function ActivePlaysPanel({
  leagueId,
  currentPickNo,
}: {
  leagueId: string;
  currentPickNo: number | null;
}) {
  const [commitments, setCommitments] = useState<PlayCommitment[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (currentPickNo != null) {
      lapseStaleCommitments({ leagueId, currentPickNo });
    }
    setCommitments(getPlayCommitments(leagueId));
  }, [leagueId, currentPickNo]);

  const active = commitments.filter((c) => c.status === "active");
  const historic = commitments.filter((c) => c.status !== "active");

  if (commitments.length === 0) return null;

  return (
    <section className="mt-6 rounded-lg border border-accent/40 bg-surface px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
            Your active plays
          </div>
          <p className="mt-1 text-[12px] leading-snug text-muted">
            Multi-pick plays you committed to. Stay disciplined.
          </p>
        </div>
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-2">
          {active.length} active · {historic.length} closed
        </span>
      </div>

      {active.length > 0 && (
        <ul className="mt-3 space-y-2">
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
      )}

      {active.length === 0 && (
        <p className="mt-3 text-[12px] leading-snug text-muted-2">
          No active plays. Commit one on The Call to see discipline
          reminders here.
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
