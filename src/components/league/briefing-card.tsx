"use client";

/**
 * Briefing card. Renders one analyst briefing.
 *
 * Dispatches on briefing.kind. Stage 1 supports narrative + tier
 * fully. Other kinds (quadrant, graph, comparison, timeline) render
 * a "renderer coming soon" stub so unsupported kinds don't crash.
 *
 * Pin/Unpin button in footer. Pinned cards visually distinct via
 * border treatment (caller passes isPinned).
 */

import { useState } from "react";
import type {
  Briefing,
  BriefingSeverity,
  TierData,
  NarrativeData,
  BriefingPrecondition,
  Position,
  QuadrantData,
  GraphData,
  ComparisonData,
  TimelineData,
} from "@/lib/strategy/briefings/types";

// Per-owner position counts at the moment of render. Passed down from
// the league hub server snapshot so the card can re-check preconditions
// emitted by the analyst at briefing-generation time.
export type CurrentRosterCounts = Record<
  string, // owner_name
  Record<Position, number>
>;

// Result of re-evaluating a briefing's preconditions against the
// current snapshot.
type Staleness =
  | { kind: "fresh" }
  // Preconditions held but the briefing is from many picks ago. Show a
  // pick-age chip so the user knows the take is historical context,
  // not a live finding.
  | { kind: "outdated"; picks_ago: number }
  // At least one precondition no longer holds. Show as resolved with
  // the specific condition that flipped.
  | { kind: "invalidated"; resolved_by: string };

// Threshold: briefings older than this many picks are visibly aged
// even when preconditions still hold. Tuned so a fresh draft session
// (3-5 picks) doesn't constantly mark cards as outdated, but a return
// the next day (10+ picks) does.
const PICK_AGE_OUTDATED = 6;

function evaluateStaleness(
  briefing: Briefing,
  currentRosters: CurrentRosterCounts | null,
  currentPickNo: number | null,
): Staleness {
  // Check preconditions first. Any failed predicate invalidates the
  // briefing regardless of pick-age.
  if (briefing.preconditions && currentRosters) {
    for (const p of briefing.preconditions) {
      const flipped = checkPrecondition(p, currentRosters);
      if (flipped) return { kind: "invalidated", resolved_by: flipped };
    }
  }
  // Outdated check: only when we have both anchors.
  if (
    briefing.generated_at_pick_no != null &&
    currentPickNo != null &&
    currentPickNo - briefing.generated_at_pick_no >= PICK_AGE_OUTDATED
  ) {
    return {
      kind: "outdated",
      picks_ago: currentPickNo - briefing.generated_at_pick_no,
    };
  }
  return { kind: "fresh" };
}

// Returns null if the precondition still holds, or a one-line
// "resolved by" message if it has flipped.
function checkPrecondition(
  p: BriefingPrecondition,
  currentRosters: CurrentRosterCounts,
): string | null {
  switch (p.kind) {
    case "position_count_eq": {
      const counts = currentRosters[p.owner_name];
      if (!counts) return null; // owner not found; can't verify, leave alone
      const current = counts[p.position] ?? 0;
      if (current === p.value) return null; // still true
      const prefix = p.owner_name === "you" ? "you now have" : `${p.owner_name} now has`;
      return `${prefix} ${current} ${p.position} (was ${p.value})`;
    }
  }
}

const SEVERITY_TONE: Record<
  BriefingSeverity,
  { border: string; bg: string; chip: string }
> = {
  info: {
    border: "border-border-soft",
    bg: "bg-surface",
    chip: "text-muted-2",
  },
  notable: {
    border: "border-accent/50",
    bg: "bg-accent/5",
    chip: "text-accent",
  },
  critical: {
    border: "border-danger/60",
    bg: "bg-danger/5",
    chip: "text-danger",
  },
};

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString();
}

export function BriefingCard({
  briefing,
  isPinned,
  onTogglePin,
  currentRosters,
  currentPickNo,
}: {
  briefing: Briefing;
  isPinned: boolean;
  onTogglePin: () => void;
  currentRosters?: CurrentRosterCounts | null;
  currentPickNo?: number | null;
}) {
  const tone = SEVERITY_TONE[briefing.severity];
  const pinnedRing = isPinned ? "ring-1 ring-success" : "";
  const staleness = evaluateStaleness(
    briefing,
    currentRosters ?? null,
    currentPickNo ?? null,
  );
  // Invalidated cards visually de-emphasize: dimmed, no danger color
  // even if originally critical, no severity tone.
  const invalidatedDim = staleness.kind === "invalidated" ? "opacity-60" : "";

  return (
    <article
      className={`rounded-lg border ${tone.border} ${tone.bg} ${pinnedRing} ${invalidatedDim} px-5 py-4`}
    >
      <header className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span
            className={`font-mono text-xs uppercase tracking-[0.16em] ${tone.chip}`}
          >
            {briefing.kind}
          </span>
          <span className="font-mono text-xs text-muted-2">·</span>
          <span className="font-mono text-xs text-muted-2">
            {briefing.severity}
          </span>
        </div>
        <span className="font-mono text-xs text-muted-2">
          {relativeTime(briefing.generated_at)}
        </span>
      </header>

      {staleness.kind === "invalidated" && (
        <div className="mt-2 rounded-md border border-success/50 bg-success/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-success">
          Resolved · {staleness.resolved_by}
        </div>
      )}
      {staleness.kind === "outdated" && (
        <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
          {briefing.generated_at_pick_no != null
            ? `As of pick ${briefing.generated_at_pick_no} · ${staleness.picks_ago} picks ago`
            : `${staleness.picks_ago} picks ago`}
        </div>
      )}

      <h3
        className={`mt-2 text-lg font-semibold text-foreground ${
          staleness.kind === "invalidated" ? "line-through decoration-muted-2/50" : ""
        }`}
      >
        {briefing.headline}
      </h3>
      <p className="mt-2 text-sm leading-snug text-foreground">
        {briefing.body}
      </p>

      {/* Per-kind body */}
      {briefing.kind === "narrative" && (
        <NarrativeBody data={briefing.data} />
      )}
      {briefing.kind === "tier" && <TierBody data={briefing.data} />}
      {briefing.kind === "quadrant" && <QuadrantBody data={briefing.data} />}
      {briefing.kind === "graph" && <GraphBody data={briefing.data} />}
      {briefing.kind === "comparison" && (
        <ComparisonBody data={briefing.data} />
      )}
      {briefing.kind === "timeline" && <TimelineBody data={briefing.data} />}

      {briefing.evidence.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-border-soft pt-2.5 text-xs text-muted">
          {briefing.evidence.map((e, i) => (
            <li key={i}>· {e}</li>
          ))}
        </ul>
      )}

      <footer className="mt-3 flex items-center justify-between gap-3 border-t border-border-soft pt-2.5">
        <span className="font-mono text-xs text-muted-2">
          {briefing.triggered_by}
        </span>
        <div className="flex items-center gap-3">
          <CopyTakeButton briefing={briefing} />
          <button
            type="button"
            onClick={onTogglePin}
            className={`font-mono text-xs uppercase tracking-[0.14em] ${
              isPinned
                ? "text-success hover:text-danger"
                : "text-muted-2 hover:text-accent"
            }`}
          >
            {isPinned ? "Unpin" : "Pin to War Room"}
          </button>
        </div>
      </footer>
    </article>
  );
}

/**
 * Copy a briefing as readable plain text (headline + body + bulleted
 * evidence). Lets a user paste an analyst take into Sleeper league
 * chat or Slack with one tap. The take is the value Dynasty Copilot
 * delivers; surfacing it for sharing is a respect signal and a
 * growth lever.
 */
function CopyTakeButton({ briefing }: { briefing: Briefing }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.stopPropagation();
        const lines: string[] = [briefing.headline, "", briefing.body];
        if (briefing.evidence.length > 0) {
          lines.push("");
          for (const evt of briefing.evidence) {
            lines.push(`· ${evt}`);
          }
        }
        try {
          await navigator.clipboard.writeText(lines.join("\n"));
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard unavailable; silently no-op rather than confuse.
        }
      }}
      className="font-mono text-xs uppercase tracking-[0.14em] text-muted-2 hover:text-accent"
      title="Copy this take to clipboard"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function NarrativeBody({ data }: { data: NarrativeData }) {
  if (!data.related_archetype_ids || data.related_archetype_ids.length === 0) {
    return null;
  }
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {data.related_archetype_ids.map((id) => (
        <span
          key={id}
          className="rounded-full border border-border-soft bg-surface-2 px-2 py-0.5 font-mono text-xs text-muted"
        >
          {id}
        </span>
      ))}
    </div>
  );
}

function TierBody({ data }: { data: TierData }) {
  return (
    <div className="mt-3">
      <div className="font-mono text-xs uppercase tracking-[0.14em] text-muted-2">
        {data.axis_label}
      </div>
      <ol className="mt-2 space-y-1.5">
        {data.items.map((item, i) => (
          <li key={i} className="flex items-baseline gap-3 text-sm">
            <span className="font-mono text-xs font-semibold text-accent w-8 shrink-0">
              {i + 1}.
            </span>
            <span className="font-mono text-xs text-muted-2 w-12 shrink-0">
              {item.score}
            </span>
            <span className="text-foreground">
              <span className="font-medium">{item.label}</span>
              <span className="text-muted-2"> · {item.reason}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ─── Quadrant ───────────────────────────────────────────────────────
// 2x2 grid. Each cell shows its members + a one-line note. Edges (if
// any) render as a small list below the grid since SVG arrow paths
// across CSS-grid cells are fiddly without a proper layout engine.
const QUADRANT_POSITIONS: Record<
  "tl" | "tr" | "bl" | "br",
  { row: 1 | 2; col: 1 | 2 }
> = {
  tl: { row: 1, col: 1 },
  tr: { row: 1, col: 2 },
  bl: { row: 2, col: 1 },
  br: { row: 2, col: 2 },
};

function QuadrantBody({ data }: { data: QuadrantData }) {
  const cellByPosition = new Map(data.cells.map((c) => [c.quadrant, c]));
  const order: Array<"tl" | "tr" | "bl" | "br"> = ["tl", "tr", "bl", "br"];
  return (
    <div className="mt-3">
      <div className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
        <span>{data.y_axis.top}</span>
        <span>{data.y_axis.label}</span>
        <span>{data.y_axis.bottom}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {order.map((pos) => {
          const cell = cellByPosition.get(pos);
          const placement = QUADRANT_POSITIONS[pos];
          return (
            <div
              key={pos}
              className="rounded-md border border-border-soft bg-surface-2 px-3 py-2"
              style={{
                gridRow: placement.row,
                gridColumn: placement.col,
              }}
            >
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
                {cell?.label ?? pos.toUpperCase()}
              </div>
              {cell?.members && cell.members.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-xs text-foreground">
                  {cell.members.map((m, i) => (
                    <li key={i}>· {m}</li>
                  ))}
                </ul>
              )}
              {cell?.notes && (
                <div className="mt-1 text-[11px] text-muted">{cell.notes}</div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
        <span>{data.x_axis.left}</span>
        <span>{data.x_axis.label}</span>
        <span>{data.x_axis.right}</span>
      </div>
      {data.edges && data.edges.length > 0 && (
        <ul className="mt-3 space-y-0.5 border-t border-border-soft pt-2 text-xs text-muted">
          {data.edges.map((e, i) => (
            <li key={i}>
              <span className="font-mono text-[10px] text-accent">
                {e.from} → {e.to}
              </span>
              <span className="text-foreground"> · {e.label}</span>
              {e.note && <span className="text-muted-2"> ({e.note})</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Graph ──────────────────────────────────────────────────────────
// Adjacency-list rendering. v1 trades the visual fidelity of a force-
// directed layout for legibility: nodes grouped by `group`, edges
// listed below with weights. Production-grade graph viz adds
// installation cost (d3, viz.js) we don't want until usage proves the
// pattern.
function GraphBody({ data }: { data: GraphData }) {
  const groups = new Map<string, GraphData["nodes"]>();
  for (const n of data.nodes) {
    const g = n.group ?? "default";
    const list = groups.get(g) ?? [];
    list.push(n);
    groups.set(g, list);
  }
  return (
    <div className="mt-3 space-y-3">
      <div className="space-y-2">
        {Array.from(groups.entries()).map(([group, nodes]) => (
          <div
            key={group}
            className="rounded-md border border-border-soft bg-surface-2 px-3 py-2"
          >
            {group !== "default" && (
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
                {group}
              </div>
            )}
            <ul className="mt-1 flex flex-wrap gap-1.5 text-xs">
              {nodes.map((n) => (
                <li
                  key={n.id}
                  className="rounded-full border border-border-soft bg-surface px-2 py-0.5 text-foreground"
                  title={
                    n.attrs
                      ? Object.entries(n.attrs)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(" · ")
                      : undefined
                  }
                >
                  {n.label}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {data.edges.length > 0 && (
        <ul className="space-y-0.5 border-t border-border-soft pt-2 text-xs text-muted">
          {data.edges.map((e, i) => (
            <li key={i} className="flex items-baseline gap-2">
              <span className="font-mono text-[10px] text-accent">
                {e.from} → {e.to}
              </span>
              {e.weight != null && (
                <span className="font-mono text-[10px] text-muted-2">
                  ({e.weight})
                </span>
              )}
              {e.label && <span className="text-foreground">· {e.label}</span>}
              {e.note && <span className="text-muted-2">{e.note}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Comparison ─────────────────────────────────────────────────────
// Two-column metric table with advantage indicators. Subject column
// (the user's side) gets the left position and a slight emphasis when
// it wins; vs column gets emphasis when it wins; ties are neutral.
function ComparisonBody({ data }: { data: ComparisonData }) {
  return (
    <div className="mt-3 overflow-hidden rounded-md border border-border-soft bg-surface-2">
      <div className="grid grid-cols-[1fr_auto_auto_auto] items-baseline gap-3 border-b border-border-soft px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
        <span>Metric</span>
        <span className="text-right">{data.subject}</span>
        <span className="text-center">vs</span>
        <span className="text-right">{data.vs}</span>
      </div>
      <ul>
        {data.rows.map((r, i) => {
          const subjectWins = r.advantage === "subject";
          const vsWins = r.advantage === "vs";
          return (
            <li
              key={i}
              className="grid grid-cols-[1fr_auto_auto_auto] items-baseline gap-3 px-3 py-1 text-xs"
            >
              <span className="text-foreground">{r.metric}</span>
              <span
                className={`text-right font-mono ${
                  subjectWins ? "text-success" : "text-foreground"
                }`}
              >
                {r.subject_value}
              </span>
              <span className="text-center font-mono text-muted-2">
                {subjectWins ? "←" : vsWins ? "→" : "·"}
              </span>
              <span
                className={`text-right font-mono ${
                  vsWins ? "text-success" : "text-foreground"
                }`}
              >
                {r.vs_value}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── Timeline ───────────────────────────────────────────────────────
// Vertical timeline of weeks → events with confidence bars. Closes
// with the dream-payoff line if all breaks right.
function TimelineBody({ data }: { data: TimelineData }) {
  return (
    <div className="mt-3 space-y-2">
      <ul className="space-y-1.5">
        {data.weeks.map((w, i) => {
          const pct = Math.max(0, Math.min(1, w.confidence)) * 100;
          return (
            <li
              key={i}
              className="grid grid-cols-[3rem_1fr_4rem] items-center gap-3 text-xs"
            >
              <span className="font-mono text-[11px] text-accent">
                {w.week}
              </span>
              <div>
                <div className="text-foreground">{w.event}</div>
                <div className="text-[11px] text-muted">{w.if_it_happens}</div>
              </div>
              <div className="flex items-center gap-1">
                <div className="h-1.5 w-12 overflow-hidden rounded-sm bg-surface-2">
                  <div
                    className="h-full bg-accent/60"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="font-mono text-[10px] text-muted-2">
                  {Math.round(pct)}%
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      {data.if_all_breaks_right && (
        <div className="rounded-md border border-success/40 bg-success/5 px-3 py-2 text-xs">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-success">
            If all breaks right ·{" "}
          </span>
          <span className="text-foreground">{data.if_all_breaks_right}</span>
        </div>
      )}
    </div>
  );
}
