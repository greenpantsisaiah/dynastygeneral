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

import type {
  Briefing,
  BriefingSeverity,
  TierData,
  NarrativeData,
} from "@/lib/strategy/briefings/types";

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
}: {
  briefing: Briefing;
  isPinned: boolean;
  onTogglePin: () => void;
}) {
  const tone = SEVERITY_TONE[briefing.severity];
  const pinnedRing = isPinned ? "ring-1 ring-success" : "";

  return (
    <article
      className={`rounded-lg border ${tone.border} ${tone.bg} ${pinnedRing} px-5 py-4`}
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

      <h3 className="mt-2 text-lg font-semibold text-foreground">
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
      {briefing.kind === "quadrant" && <UnsupportedKind kind="quadrant" />}
      {briefing.kind === "graph" && <UnsupportedKind kind="graph" />}
      {briefing.kind === "comparison" && (
        <UnsupportedKind kind="comparison" />
      )}
      {briefing.kind === "timeline" && <UnsupportedKind kind="timeline" />}

      {briefing.evidence.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-border-soft pt-2.5 text-xs text-muted">
          {briefing.evidence.map((e, i) => (
            <li key={i}>· {e}</li>
          ))}
        </ul>
      )}

      <footer className="mt-3 flex items-center justify-between border-t border-border-soft pt-2.5">
        <span className="font-mono text-xs text-muted-2">
          {briefing.triggered_by}
        </span>
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
      </footer>
    </article>
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

function UnsupportedKind({ kind }: { kind: string }) {
  return (
    <div className="mt-3 rounded-md border border-dashed border-border-soft px-3 py-2 text-xs text-muted-2">
      {kind} renderer ships in next slice. The data is in the briefing already;
      only the visualization is pending.
    </div>
  );
}
