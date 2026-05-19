"use client";

/**
 * Trade Opportunities Panel. Surfaces 1-3 proactive trade ideas
 * during early-mid rounds of an active draft. Per founder direction
 * 2026-05-19: the platform shouldn't treat pick trades as an
 * exception. Every render should be scanning for sharp moves, hole
 * fills, and flat-tier trade-downs.
 */

import { useState } from "react";
import type { TradeOpportunity } from "@/lib/strategy/trade-opportunities/detect";

const KIND_TONE: Record<
  TradeOpportunity["kind"],
  { border: string; bg: string; label: string; labelTone: string }
> = {
  run_sharp_move: {
    border: "border-warning/60",
    bg: "bg-warning/5",
    label: "Sharp move",
    labelTone: "text-warning",
  },
  fill_structural_hole: {
    border: "border-accent/60",
    bg: "bg-accent/5",
    label: "Fill the hole",
    labelTone: "text-accent",
  },
  flat_tier_trade_down: {
    border: "border-[color:#a78bfa]/60",
    bg: "bg-[color:#a78bfa]/5",
    label: "Free uplift",
    labelTone: "text-[color:#a78bfa]",
  },
};

export function TradeOpportunitiesPanel({
  opportunities,
}: {
  opportunities: TradeOpportunity[];
}) {
  if (opportunities.length === 0) return null;
  return (
    <section className="mt-6 rounded-lg border border-border-soft bg-surface px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <div className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
            Trade opportunities
          </div>
          <p className="mt-1 text-sm text-muted">
            What the room is doing right now that's exploitable. Named
            partner + value math + ready-to-send message per
            opportunity. Pick trading is the dynasty meta; this panel
            is your active scout.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {opportunities.map((opp) => (
          <OpportunityCard key={opp.id} opportunity={opp} />
        ))}
      </div>
    </section>
  );
}

function OpportunityCard({
  opportunity,
}: {
  opportunity: TradeOpportunity;
}) {
  const [expanded, setExpanded] = useState(false);
  const tone = KIND_TONE[opportunity.kind];
  const ratioLabel =
    opportunity.math.ratio === 1
      ? "open shape"
      : `${(opportunity.math.ratio * 100).toFixed(0)}%`;

  return (
    <article
      className={`rounded-md border ${tone.border} ${tone.bg} px-4 py-3`}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <span
            className={`font-mono text-[9px] uppercase tracking-[0.18em] ${tone.labelTone}`}
          >
            {tone.label}
          </span>
          <span className="text-sm font-semibold text-foreground">
            {opportunity.headline}
          </span>
        </div>
      </header>

      <p className="mt-2 text-[12px] leading-snug text-muted">
        {opportunity.thesis}
      </p>

      <div className="mt-3 space-y-1">
        {opportunity.partners.map((p) => (
          <div
            key={p.roster_id}
            className="flex flex-wrap items-baseline gap-2 text-[12px] leading-snug text-foreground"
          >
            <span className="font-semibold">{p.owner_name}</span>
            <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-2">
              {p.trade_signature.replace("_", " ")}
            </span>
            <span className="text-muted">{p.why_them}</span>
          </div>
        ))}
      </div>

      {opportunity.math.send_value > 0 && (
        <div className="mt-2 font-mono text-[10px] text-muted-2">
          Send {opportunity.math.you_send} ·{" "}
          <span className="text-foreground">receive</span>{" "}
          {opportunity.math.you_receive} ·{" "}
          <span
            className={
              opportunity.math.ratio >= 0.85 &&
              opportunity.math.ratio <= 1.15
                ? "text-success"
                : "text-warning"
            }
          >
            ratio {ratioLabel}
          </span>
        </div>
      )}

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2 hover:text-accent"
        aria-expanded={expanded}
      >
        {expanded ? "Hide" : "Show"} draft message
      </button>

      {expanded && (
        <div className="mt-2 rounded-sm border border-border-soft bg-surface-2 px-3 py-2 text-[12px] leading-relaxed text-foreground whitespace-pre-wrap">
          {opportunity.draft_message}
        </div>
      )}
    </article>
  );
}
