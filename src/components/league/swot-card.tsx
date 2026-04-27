/**
 * SWOT card. 2x2 grid: Strengths / Weaknesses (top row) + Opportunities
 * / Threats (bottom row). Each item has a headline, evidence, and a
 * "play it" follow-on.
 *
 * Reads like an intelligence briefing rather than a chart. The
 * follow-on line per item is the part that turns observation into
 * a plan: "trade your TE2 to MacCheese13" instead of just "you have
 * a TE surplus."
 */

import type {
  SwotItem,
  SwotReport,
} from "@/lib/strategy/swot/compute";

export function SwotCard({ swot }: { swot: SwotReport }) {
  if (
    swot.strengths.length === 0 &&
    swot.weaknesses.length === 0 &&
    swot.opportunities.length === 0 &&
    swot.threats.length === 0
  ) {
    return null;
  }
  return (
    <section className="rounded-lg border border-accent/40 bg-surface px-5 py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
            SWOT briefing · {swot.me_owner ?? "your roster"}
          </div>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground">
            Where you stand. How to play it.
          </h2>
        </div>
        <div className="max-w-md text-xs text-muted">{swot.posture}</div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Quadrant
          title="Strengths"
          subtitle="What you outclass the field on"
          tone="success"
          items={swot.strengths}
          emptyMessage="No clear strengths above the league field yet."
        />
        <Quadrant
          title="Weaknesses"
          subtitle="Where you lag the field"
          tone="danger"
          items={swot.weaknesses}
          emptyMessage="No structural weaknesses detected."
        />
        <Quadrant
          title="Opportunities"
          subtitle="Market conditions you can act on"
          tone="accent"
          items={swot.opportunities}
          emptyMessage="No standout opportunities right now."
        />
        <Quadrant
          title="Threats"
          subtitle="Convergence + dominance risks"
          tone="warning"
          items={swot.threats}
          emptyMessage="No immediate convergence threats."
        />
      </div>
    </section>
  );
}

const TONE: Record<
  "success" | "danger" | "accent" | "warning",
  { border: string; label: string }
> = {
  success: {
    border: "border-success/40",
    label: "text-success",
  },
  danger: {
    border: "border-danger/40",
    label: "text-danger",
  },
  accent: {
    border: "border-accent/40",
    label: "text-accent",
  },
  warning: {
    border: "border-warning/40",
    label: "text-warning",
  },
};

function Quadrant({
  title,
  subtitle,
  tone,
  items,
  emptyMessage,
}: {
  title: string;
  subtitle: string;
  tone: "success" | "danger" | "accent" | "warning";
  items: SwotItem[];
  emptyMessage: string;
}) {
  const t = TONE[tone];
  return (
    <div className={`rounded-md border ${t.border} bg-surface-2 px-4 py-3`}>
      <div className="flex items-baseline justify-between">
        <div className={`font-mono text-[10px] uppercase tracking-[0.18em] ${t.label}`}>
          {title}
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
          {items.length}
        </div>
      </div>
      <div className="mt-1 text-[11px] text-muted-2">{subtitle}</div>
      {items.length === 0 ? (
        <p className="mt-3 text-xs text-muted">{emptyMessage}</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {items.map((item, i) => (
            <li key={i} className="border-t border-border-soft pt-3 first:border-t-0 first:pt-0">
              <div className="text-sm font-semibold text-foreground">
                {item.headline}
              </div>
              <p className="mt-1 text-xs text-muted">{item.evidence}</p>
              <p className={`mt-1.5 text-xs ${t.label}`}>
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] opacity-70">
                  Play it ·{" "}
                </span>
                {item.play}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
