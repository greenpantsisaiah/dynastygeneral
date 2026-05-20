"use client";

/**
 * Draft Path Projector. The side-by-side comparator that pays off
 * Phases A-C of the pre-draft work.
 *
 * Renders 3-5 candidate positional sequences over the user's next N
 * owned picks. Each path shows a position signature
 * (e.g. "RB-WR-RB-WR-TE"), a total expected value score, and an
 * expandable per-slot breakdown with 1-3 candidates and their
 * survival probabilities.
 *
 * Per founder direction 2026-05-16: "I really think helping the user
 * decide if their first picks are like QB, RB, QB, WR, WR, or
 * something else is part of the most valuable / most exciting part
 * of the first several picks, which determine everything else."
 */

import { useState } from "react";
import type {
  DraftPath,
  DraftPathProjection,
  LockedPick,
  PathCandidate,
  PathPick,
  PathPosition,
  RosterContext,
} from "@/lib/strategy/draft-paths/types";

const POSITION_TONE: Record<PathPosition, string> = {
  QB: "text-success",
  RB: "text-accent",
  WR: "text-foreground",
  TE: "text-warning",
};

export function DraftPathProjector({
  projection,
}: {
  projection: DraftPathProjection;
}) {
  const [expandedPathId, setExpandedPathId] = useState<string | null>(
    projection.paths[0]?.id ?? null,
  );

  if (projection.paths.length === 0) return null;

  return (
    <section
      className="mt-6 rounded-lg border border-border-soft bg-surface px-5 py-5"
      aria-label="Draft path projector"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <div className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
            Draft path projector
          </div>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Your next {projection.my_slots.length} picks projected
            across {projection.paths.length} candidate positional
            sequences. Each path ranked by total expected value (value
            × survival × class strength × roster fit + dial bias).
            Click any path for per-slot detail.
          </p>
        </div>
        <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-2">
          {projection.my_slots
            .map((s) => s.pick_label)
            .join(" · ")}
        </span>
      </div>

      {projection.roster_context.picks_made > 0 && (
        <RosterSynthesisStrip
          rosterContext={projection.roster_context}
          lockedPicks={projection.locked_picks}
        />
      )}

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {projection.paths.map((path) => (
          <PathCard
            key={path.id}
            path={path}
            expanded={expandedPathId === path.id}
            onToggle={() =>
              setExpandedPathId((curr) => (curr === path.id ? null : path.id))
            }
          />
        ))}
      </div>

      <p className="mt-4 text-[11px] leading-snug text-muted-2">
        Paths are sorted by total expected value. The lead path is the
        engine's recommendation; the alternatives are real options
        worth weighing if you disagree with the lead's positional
        sequence. Survival probabilities at later slots widen with
        ADP variance.
      </p>
    </section>
  );
}

function PathCard({
  path,
  expanded,
  onToggle,
}: {
  path: DraftPath;
  expanded: boolean;
  onToggle: () => void;
}) {
  const positions = path.position_signature.split("-") as PathPosition[];
  return (
    <article
      className={`rounded-lg border ${
        path.is_recommended
          ? "border-accent/60 bg-accent/5"
          : "border-border-soft bg-surface-2"
      } px-4 py-3`}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-2">
          {path.is_recommended && (
            <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-accent">
              ◂ recommended
            </span>
          )}
          <span className="text-sm font-semibold text-foreground">
            {path.archetype}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
            rank {path.rank}
          </span>
        </div>
        <span
          className={`font-mono text-base font-semibold ${
            path.total_value > 0 ? "text-success" : "text-muted-2"
          }`}
          title={`Total expected value across ${path.picks.length} picks.`}
        >
          {path.total_value >= 0 ? "+" : ""}
          {path.total_value.toFixed(1)}
        </span>
      </header>

      <div className="mt-2 flex flex-wrap items-baseline gap-1">
        {positions.map((pos, i) => (
          <span
            key={i}
            className={`font-mono text-[12px] font-semibold ${POSITION_TONE[pos] ?? "text-foreground"}`}
          >
            {pos}
            {i < positions.length - 1 && (
              <span className="mx-1 text-muted-2">·</span>
            )}
          </span>
        ))}
      </div>

      <p className="mt-2 text-[11px] leading-snug text-muted">{path.why}</p>

      <button
        type="button"
        onClick={onToggle}
        className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2 hover:text-accent"
        aria-expanded={expanded}
      >
        {expanded ? "Hide" : "Show"} per-slot detail
      </button>

      {expanded && (
        <ol className="mt-3 space-y-3 border-t border-border-soft pt-3">
          {path.picks.map((pick) => (
            <PickDetail key={pick.pick_no} pick={pick} />
          ))}
        </ol>
      )}
    </article>
  );
}

function PickDetail({ pick }: { pick: PathPick }) {
  if (!pick.recommendation) {
    return (
      <li className="text-[11px] leading-snug text-muted-2">
        <span className="font-mono">{pick.pick_label}</span> · no viable
        candidate at this slot
      </li>
    );
  }
  const rec = pick.recommendation;
  return (
    <li>
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
          {pick.pick_label}
        </span>
        <span
          className={`font-mono text-[10px] uppercase tracking-[0.14em] ${POSITION_TONE[pick.position]}`}
        >
          {pick.position}
        </span>
        <span className="text-sm font-semibold text-foreground">
          {rec.name}
        </span>
        <span className="font-mono text-[10px] text-muted-2">
          {rec.team ?? "FA"} · age {rec.age ?? "?"}
          {rec.is_rookie && (
            <span className="ml-1 text-accent">· rookie</span>
          )}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-baseline gap-3 font-mono text-[10px] text-muted-2">
        {rec.adp != null && (
          <span title={`ADP variant: ${rec.adp_variant ?? "default"}`}>
            ADP {Math.round(rec.adp)}
          </span>
        )}
        <span>value {Math.round(rec.value)}</span>
        <span
          className={
            rec.survival >= 0.7
              ? "text-success"
              : rec.survival >= 0.4
                ? "text-warning"
                : "text-danger"
          }
        >
          survival {Math.round(rec.survival * 100)}%
        </span>
        <span>EV {rec.expected_value.toFixed(1)}</span>
      </div>
      {pick.candidates.length > 1 && (
        <details className="mt-1">
          <summary className="cursor-pointer font-mono text-[9px] uppercase tracking-[0.16em] text-muted-2 hover:text-accent">
            Backup candidates if recommended is gone
          </summary>
          <ul className="mt-1 space-y-0.5">
            {pick.candidates.slice(1).map((c) => (
              <CandidateLine key={c.player_id} c={c} />
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}

function CandidateLine({ c }: { c: PathCandidate }) {
  return (
    <li className="text-[11px] leading-snug">
      <span className="text-foreground">{c.name}</span>{" "}
      <span className="font-mono text-[9px] text-muted-2">
        · {c.position} · ADP {c.adp != null ? Math.round(c.adp) : "?"} ·
        survival {Math.round(c.survival * 100)}% · EV{" "}
        {c.expected_value.toFixed(1)}
      </span>
    </li>
  );
}

/**
 * Roster synthesis: the founder critique that the literal "Already
 * picked" list provided no interpretation. This component leads with
 * the engine's read of the user's build so far (summary line +
 * position-by-position anchor view), then folds the raw pick order
 * behind a toggle for users who want to re-read the chronology.
 *
 * Founder direction 2026-05-19: "The last 5 picks showing doesn't
 * seem to help me without any interpretation/judgment to it." The
 * synthesis answers the WHY of every pick already on the roster
 * before projecting the next 5.
 */
function RosterSynthesisStrip({
  rosterContext,
  lockedPicks,
}: {
  rosterContext: RosterContext;
  lockedPicks: LockedPick[];
}) {
  const [showOrder, setShowOrder] = useState(false);
  const positions: PathPosition[] = ["QB", "RB", "WR", "TE"];
  return (
    <section className="mt-4 rounded-md border border-success/40 bg-success/5 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-success">
          Your build so far · {rosterContext.picks_made} pick
          {rosterContext.picks_made === 1 ? "" : "s"}
        </div>
        <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-2">
          Roster going into the next {lockedPicks.length > 0 ? 5 : "5"} slots
        </div>
      </div>

      <p className="mt-2 text-[12px] leading-snug text-foreground">
        {rosterContext.summary}
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {positions.map((pos) => (
          <PositionAnchorCell
            key={pos}
            position={pos}
            count={rosterContext.position_counts[pos]}
            need={rosterContext.starter_needs[pos]}
            anchors={rosterContext.anchors[pos]}
          />
        ))}
      </div>

      {lockedPicks.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowOrder((v) => !v)}
            className="mt-3 font-mono text-[9px] uppercase tracking-[0.16em] text-muted-2 hover:text-accent"
            aria-expanded={showOrder}
          >
            {showOrder ? "Hide" : "Show"} pick order
          </button>

          {showOrder && (
            <ul className="mt-2 space-y-1 border-t border-success/30 pt-2">
              {lockedPicks.map((lp) => (
                <LockedPickLine key={`${lp.pick_no}-${lp.player_id}`} lp={lp} />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function PositionAnchorCell({
  position,
  count,
  need,
  anchors,
}: {
  position: PathPosition;
  count: number;
  need: number;
  anchors: Array<{ name: string; value: number }>;
}) {
  const tone = POSITION_TONE[position];
  const status: { label: string; toneClass: string } =
    count === 0
      ? { label: "empty", toneClass: "text-danger" }
      : count < need
        ? { label: `${count} of ${need}`, toneClass: "text-warning" }
        : count === need
          ? { label: "starter met", toneClass: "text-success" }
          : { label: `+${count - need} depth`, toneClass: "text-muted-2" };
  return (
    <div className="rounded-sm border border-border-soft bg-surface-2 px-3 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <span
          className={`font-mono text-[11px] font-semibold uppercase tracking-[0.16em] ${tone}`}
        >
          {position}
        </span>
        <span
          className={`font-mono text-[9px] uppercase tracking-[0.14em] ${status.toneClass}`}
        >
          {status.label}
        </span>
      </div>
      {anchors.length === 0 ? (
        <p className="mt-1 text-[11px] leading-snug text-muted-2">
          No {position} on roster yet.
        </p>
      ) : (
        <ul className="mt-1 space-y-0.5">
          {anchors.map((a) => (
            <li
              key={a.name}
              className="flex items-baseline justify-between gap-2 text-[11px] leading-snug"
            >
              <span className="text-foreground">{a.name}</span>
              <span className="font-mono text-[9px] text-muted-2">
                {Math.round(a.value)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LockedPickLine({ lp }: { lp: LockedPick }) {
  const positionTone =
    lp.position === "QB"
      ? "text-success"
      : lp.position === "RB"
        ? "text-accent"
        : lp.position === "TE"
          ? "text-warning"
          : "text-foreground";
  return (
    <li className="flex flex-wrap items-baseline gap-2 text-[12px] leading-snug">
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
        {lp.pick_label}
      </span>
      <span
        className={`font-mono text-[10px] uppercase tracking-[0.14em] ${positionTone}`}
      >
        {lp.position}
      </span>
      <span className="font-semibold text-foreground">{lp.player_name}</span>
      <span className="font-mono text-[10px] text-muted-2">
        {lp.team ?? "FA"}
        {lp.age != null && ` · age ${lp.age}`}
        {lp.is_rookie && <span className="ml-1 text-accent">· rookie</span>}
        {lp.value != null && ` · value ${Math.round(lp.value)}`}
      </span>
    </li>
  );
}
