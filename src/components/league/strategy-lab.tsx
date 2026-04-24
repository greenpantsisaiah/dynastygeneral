"use client";

/**
 * Strategy Lab card. Shows the user which strategic paths are still
 * open at the current draft moment, with named anchors and counter-
 * position notes when the room is heavy in one direction.
 *
 * Two modes via the `prominent` flag:
 *   - prominent: large hero card, sits above WindowsBar. Used early
 *     in the draft (user has < ~3 picks) when the Decision card
 *     doesn't have enough roster context to be the dominant frame.
 *   - context: compact strip, sits below the Decision card. Used
 *     mid-to-late draft as a "what am I cutting off?" awareness
 *     surface.
 *
 * The "you're at pick 5 and everyone went win-now; thread the future
 * needle" insight from the founder lives in the counter-position note
 * on each path, plus the league-pulse headline at the top.
 *
 * Live transition badges (client-side): on each visit we capture a
 * snapshot of (archetype_id → state, viability) into localStorage. On
 * the next visit we diff the current state against the snapshot and
 * surface "JUST CLOSED · QB Cartel" badges so the user feels paths
 * slamming shut between page loads. Snapshots older than 6h are
 * suppressed (a refresh after a day shouldn't fire drama badges).
 */

import { useEffect, useState } from "react";
import type {
  StrategyLabPath,
  StrategyLabState,
} from "@/lib/strategy/strategy-lab/types";
import {
  computeTransition,
  readPreviousSnapshot,
  writeSnapshot,
  type Transition,
} from "@/lib/strategy/strategy-lab/transitions";

const STATE_TONE: Record<
  StrategyLabPath["state"],
  { border: string; chip: string; bar: string; label: string }
> = {
  open: {
    border: "border-success/60",
    chip: "text-success",
    bar: "bg-success/70",
    label: "OPEN",
  },
  narrowing: {
    border: "border-accent/60",
    chip: "text-accent",
    bar: "bg-accent/70",
    label: "NARROWING",
  },
  closing: {
    border: "border-warning/60",
    chip: "text-warning",
    bar: "bg-warning/60",
    label: "CLOSING",
  },
  closed: {
    border: "border-border-soft",
    chip: "text-muted-2",
    bar: "bg-muted-2/40",
    label: "CLOSED",
  },
};

const TRANSITION_TONE: Record<
  Transition["kind"],
  { bg: string; text: string; label: string }
> = {
  just_closed: {
    bg: "bg-danger/15 border-danger/60",
    text: "text-danger",
    label: "JUST CLOSED",
  },
  tightened: {
    bg: "bg-warning/15 border-warning/60",
    text: "text-warning",
    label: "TIGHTENED",
  },
  just_opened: {
    bg: "bg-success/15 border-success/60",
    text: "text-success",
    label: "JUST OPENED",
  },
  loosened: {
    bg: "bg-success/10 border-success/40",
    text: "text-success",
    label: "LOOSENED",
  },
};

export function StrategyLab({
  lab,
  leagueId,
}: {
  lab: StrategyLabState;
  leagueId: string;
}) {
  // Per-path transition badges, keyed by archetype_id. Populated
  // post-mount from the localStorage snapshot of the previous visit.
  // Empty on first ever visit; saving the snapshot now means the
  // NEXT visit will see badges if anything moved.
  const [transitions, setTransitions] = useState<
    Record<string, Transition>
  >({});

  useEffect(() => {
    const prev = readPreviousSnapshot(leagueId);
    if (prev) {
      const next: Record<string, Transition> = {};
      for (const p of lab.paths) {
        const t = computeTransition(p, prev.paths[p.archetype_id], prev.ts);
        if (t) next[p.archetype_id] = t;
      }
      setTransitions(next);
    }
    writeSnapshot(leagueId, lab.paths);
  }, [leagueId, lab.paths]);

  if (lab.paths.length === 0) return null;

  // In context mode we hide closed paths UNLESS they just closed
  // (the user should see the drama before it's tucked away). In
  // prominent mode we show closed too, with strikethrough.
  const visiblePaths = lab.prominent
    ? lab.paths
    : lab.paths
        .filter(
          (p) =>
            p.state !== "closed" ||
            transitions[p.archetype_id]?.kind === "just_closed",
        )
        .slice(0, 5);

  if (visiblePaths.length === 0) return null;

  return (
    <section
      className={`mt-8 rounded-lg border-2 ${
        lab.prominent ? "border-accent/60" : "border-border-strong"
      } bg-surface px-5 py-5`}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <div className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
            Strategy Lab · {visiblePaths.length} paths
          </div>
          <h2 className="mt-1 text-xl font-semibold text-foreground">
            {lab.prominent ? "What's still open for you" : "Path watch"}
          </h2>
          {lab.prominence_reason && (
            <p className="mt-1 text-xs text-muted">{lab.prominence_reason}</p>
          )}
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
          Open ≥65 · Narrowing 45-64 · Closing 25-44
        </div>
      </header>

      {lab.league_pulse.headline && (
        <div className="mt-4 rounded-md border border-accent/30 bg-accent/5 px-4 py-3 text-sm leading-relaxed text-foreground">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent">
            League pulse ·
          </span>{" "}
          {lab.league_pulse.headline}
        </div>
      )}

      <div className="mt-4 space-y-3">
        {visiblePaths.map((p) => (
          <PathRow
            key={p.archetype_id}
            path={p}
            prominent={lab.prominent}
            transition={transitions[p.archetype_id] ?? null}
          />
        ))}
      </div>
    </section>
  );
}

function PathRow({
  path,
  prominent,
  transition,
}: {
  path: StrategyLabPath;
  prominent: boolean;
  transition: Transition | null;
}) {
  const tone = STATE_TONE[path.state];
  const isClosed = path.state === "closed";
  const tBadge = transition ? TRANSITION_TONE[transition.kind] : null;
  return (
    <div
      className={`rounded-md border ${tone.border} ${
        isClosed ? "bg-surface-2/40 opacity-60" : "bg-surface-2"
      } px-4 py-3`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <span
            className={`font-mono text-[10px] uppercase tracking-[0.14em] ${tone.chip}`}
          >
            {tone.label}
          </span>
          <span
            className={`text-base font-semibold ${
              isClosed ? "text-muted line-through decoration-muted-2/50" : "text-foreground"
            }`}
          >
            {path.archetype_name}
          </span>
          {tBadge && transition && (
            <span
              className={`inline-flex items-center gap-1 rounded-sm border ${tBadge.bg} px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] ${tBadge.text}`}
              title={`Was ${transition.prev_state} (${
                transition.viability_delta > 0 ? "+" : ""
              }${transition.viability_delta} viability since last visit)`}
            >
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${tBadge.text} bg-current`}
              />
              {tBadge.label}
            </span>
          )}
        </div>
        <span className="font-mono text-[11px] text-muted-2">
          {path.viability}/100
        </span>
      </div>

      <p className="mt-1 text-xs leading-snug text-muted">
        {path.archetype_tagline}
      </p>

      {/* Viability bar */}
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-sm bg-surface">
        <div
          className={`h-full ${tone.bar}`}
          style={{ width: `${Math.max(0, Math.min(100, path.viability))}%` }}
        />
      </div>

      {/* Anchors row: only when prominent or path is open/narrowing */}
      {(prominent || path.state === "open" || path.state === "narrowing") &&
        path.anchors.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {path.anchors.map((a) => (
              <span
                key={a.player_id}
                className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] ${
                  a.available
                    ? "border-success/40 text-foreground"
                    : "border-border-soft text-muted-2 line-through decoration-muted-2/50"
                }`}
                title={
                  a.available
                    ? a.expected_gone_by
                      ? `Available · projected gone by pick ${a.expected_gone_by}`
                      : "Available"
                    : "Already drafted"
                }
              >
                <span
                  className={`inline-block h-1 w-1 rounded-full ${
                    a.available ? "bg-success" : "bg-muted-2"
                  }`}
                />
                {a.name} · {a.position ?? "?"}
              </span>
            ))}
          </div>
        )}

      {path.closes_if && !isClosed && (
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
          {path.closes_if}
        </p>
      )}

      {path.counter_position_note && (
        <p className="mt-2 rounded-sm border border-accent/30 bg-accent/5 px-2.5 py-1.5 text-xs leading-snug text-foreground">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
            Counter-position ·
          </span>{" "}
          {path.counter_position_note.replace(/^Counter-position: /, "")}
        </p>
      )}
    </div>
  );
}
