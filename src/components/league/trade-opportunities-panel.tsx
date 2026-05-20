"use client";

/**
 * Trade Opportunities Panel. Surfaces 1-3 proactive trade ideas
 * during early-mid rounds of an active draft. Per founder direction
 * 2026-05-19: pick trades are the dynasty meta, not an exception.
 *
 * v2 surface (matches detect.ts v2 redesign): every opportunity
 * carries a three-tier band (starting / realistic / floor) and a
 * 4-move message (observation, problem named, solution, ask + their
 * win). The card shows the realistic tier as the headline number,
 * with starting + floor reachable on tap. Voice A throughout.
 */

import { useState } from "react";
import type {
  AskTier,
  TradeAsset,
  TradeOpportunity,
} from "@/lib/strategy/trade-opportunities/detect";

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
    label: "Charge the tax",
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
            What the room is doing right now that's exploitable. Each
            opportunity ships a band: starting ask, realistic close,
            walk-away floor. Read the realistic tier first; the
            starting tier is your opener, the floor is your line.
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
  const [tierExpanded, setTierExpanded] = useState(false);
  const tone = KIND_TONE[opportunity.kind];
  const realistic =
    opportunity.tiers.find((t) => t.label === "realistic") ??
    opportunity.tiers[0];
  const starting = opportunity.tiers.find((t) => t.label === "starting");
  const floor = opportunity.tiers.find((t) => t.label === "floor");

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

      {realistic && (
        <div className="mt-3 rounded-sm border border-border-soft bg-surface-2 px-3 py-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-foreground">
              Realistic close
            </span>
            <span
              className={`font-mono text-[10px] ${
                realistic.ratio_perceived >= 0.85 &&
                realistic.ratio_perceived <= 1.15
                  ? "text-success"
                  : "text-warning"
              }`}
              title="Receive-side perceived value ÷ send-side perceived value"
            >
              ratio {(realistic.ratio_perceived * 100).toFixed(0)}%
            </span>
          </div>
          <BundleLine label="You send" assets={realistic.user_sends.assets} />
          <BundleLine
            label="You get"
            assets={realistic.user_receives.assets}
          />
          <p className="mt-1 text-[11px] leading-snug text-muted-2">
            {realistic.note}
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={() => setTierExpanded((v) => !v)}
        className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2 hover:text-accent"
        aria-expanded={tierExpanded}
      >
        {tierExpanded ? "Hide" : "Show"} band (starting + floor)
      </button>

      {tierExpanded && (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {starting && <TierBlock tier={starting} variant="starting" />}
          {floor && <TierBlock tier={floor} variant="floor" />}
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
        <div className="mt-2 rounded-sm border border-border-soft bg-surface-2 px-3 py-2 text-[12px] leading-relaxed text-foreground space-y-2">
          <p>
            <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-2">
              Observation ·{" "}
            </span>
            {opportunity.message.observation}
          </p>
          <p>
            <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-2">
              Problem ·{" "}
            </span>
            {opportunity.message.problem_named}
          </p>
          <p>
            <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-2">
              Solution ·{" "}
            </span>
            {opportunity.message.solution}
          </p>
          <p>
            <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-2">
              Ask + their win ·{" "}
            </span>
            {opportunity.message.ask_and_their_win}
          </p>
          <div className="mt-2 border-t border-border-soft pt-2 text-[11px] text-muted-2">
            Tap-to-copy ready below.
          </div>
          <div className="whitespace-pre-wrap rounded-sm border border-border-soft bg-surface px-2 py-2 text-[11px] leading-relaxed">
            {opportunity.draft_message}
          </div>
        </div>
      )}
    </article>
  );
}

function TierBlock({
  tier,
  variant,
}: {
  tier: AskTier;
  variant: "starting" | "floor";
}) {
  const tone =
    variant === "starting"
      ? { label: "Starting", labelTone: "text-warning" }
      : { label: "Floor", labelTone: "text-muted-2" };
  return (
    <div className="rounded-sm border border-border-soft bg-surface-2 px-3 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <span
          className={`font-mono text-[9px] uppercase tracking-[0.16em] ${tone.labelTone}`}
        >
          {tone.label}
        </span>
        <span
          className="font-mono text-[10px] text-muted-2"
          title="Receive-side perceived value ÷ send-side perceived value"
        >
          {(tier.ratio_perceived * 100).toFixed(0)}%
        </span>
      </div>
      <BundleLine label="Send" assets={tier.user_sends.assets} />
      <BundleLine label="Get" assets={tier.user_receives.assets} />
      <p className="mt-1 text-[10px] leading-snug text-muted-2">{tier.note}</p>
    </div>
  );
}

function BundleLine({
  label,
  assets,
}: {
  label: string;
  assets: TradeAsset[];
}) {
  return (
    <div className="mt-1 flex flex-wrap items-baseline gap-1 text-[11px] leading-snug">
      <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-2">
        {label}:
      </span>
      {assets.map((a, i) => (
        <span key={i} className="text-foreground">
          {renderAsset(a)}
          {i < assets.length - 1 && (
            <span className="mx-1 text-muted-2">+</span>
          )}
        </span>
      ))}
    </div>
  );
}

function renderAsset(asset: TradeAsset): string {
  switch (asset.kind) {
    case "current_pick":
      return `${asset.pick_label} (${asset.value.toFixed(0)})`;
    case "future_pick":
      return `${asset.label} (${asset.value.toFixed(0)})`;
    case "player":
      return `${asset.name} (${asset.value.toFixed(0)}${
        Math.abs(asset.perceived_value - asset.value) > 1
          ? `, perceived ${asset.perceived_value.toFixed(0)}`
          : ""
      })`;
    case "depth_player_placeholder":
      return `${asset.description} (≤${asset.tier_max_value})`;
  }
}
