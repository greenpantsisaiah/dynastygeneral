"use client";

/**
 * Decision Quadrant scatter chart. Parked component, exported but not
 * yet rendered on any active surface.
 *
 * Founder feedback 2026-05-08 v1 review: "the decision quadrant tells
 * me nothing actually." Removed from The Call's hub-rendered hero
 * because it didn't communicate. Will live on a /pick deep-dive route
 * with a real interpretation headline ("Standing call is high-
 * confidence future. Two real alternatives lean win-now.") and the
 * scatter as supporting evidence rather than the main idea.
 *
 * Reads canonical Decision data only. No parallel computation.
 */

import { useState } from "react";
import type { Decision } from "@/lib/strategy/decision-synthesis/types";

export type DecisionQuadrantProps = {
  candidates: Decision["quadrant_candidates"];
  leanId: string;
  sloanOn: boolean;
};

export function DecisionQuadrant({
  candidates,
  leanId,
  sloanOn,
}: DecisionQuadrantProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const hovered = candidates.find((c) => c.player_id === hoveredId) ?? null;
  if (candidates.length === 0) return null;

  // SVG layout: 100x100 viewBox with margins. Center axis at (50, 50).
  // Horizon: -100..+100 mapped to 5..95 (5% margin). Confidence:
  // 0..100 mapped to 95..5 (inverted; high confidence at top).
  const xOf = (h: number) => 5 + ((h + 100) / 200) * 90;
  const yOf = (c: number) => 95 - (c / 100) * 90;

  return (
    <div className="px-5 py-5 border-b border-border-soft">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
          Decision Quadrant
        </div>
        <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-2">
          {candidates.length} candidates
        </div>
      </div>
      <div className="relative w-full" style={{ aspectRatio: "1 / 1", maxWidth: "320px" }}>
        <svg
          viewBox="0 0 100 100"
          className="w-full h-full"
          role="img"
          aria-label="Decision Quadrant scatter"
        >
          <line x1="50" y1="5" x2="50" y2="95" stroke="currentColor" strokeOpacity="0.15" strokeWidth="0.3" />
          <line x1="5" y1="50" x2="95" y2="50" stroke="currentColor" strokeOpacity="0.15" strokeWidth="0.3" />
          <rect x="5" y="5" width="90" height="90" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="0.3" />
          {candidates.map((c) => {
            const cx = xOf(c.horizon_pct);
            const cy = yOf(c.confidence_pct);
            const isLean = c.player_id === leanId;
            const isHovered = c.player_id === hoveredId;
            const fillColor = laneFillFor(c.timeline_lane);
            return (
              <g key={c.player_id}>
                {isLean && (
                  <circle
                    cx={cx}
                    cy={cy}
                    r="4"
                    fill="none"
                    stroke="currentColor"
                    strokeOpacity="0.7"
                    strokeWidth="0.5"
                  />
                )}
                <circle
                  cx={cx}
                  cy={cy}
                  r={isHovered ? "2.8" : "2.2"}
                  fill={fillColor}
                  stroke={isHovered ? "currentColor" : "none"}
                  strokeWidth={isHovered ? "0.4" : "0"}
                  className="cursor-pointer transition-all"
                  onMouseEnter={() => setHoveredId(c.player_id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => setHoveredId(c.player_id)}
                />
              </g>
            );
          })}
        </svg>
        <div className="absolute left-1 top-1 font-mono text-[8px] uppercase tracking-[0.14em] text-muted-2">
          High conf
        </div>
        <div className="absolute left-1 bottom-1 font-mono text-[8px] uppercase tracking-[0.14em] text-muted-2">
          Low conf
        </div>
        <div className="absolute right-1 bottom-1 font-mono text-[8px] uppercase tracking-[0.14em] text-success/80">
          Future →
        </div>
        <div className="absolute left-1 bottom-3 font-mono text-[8px] uppercase tracking-[0.14em] text-warning/80">
          ← Win-now
        </div>
      </div>
      {hovered && (
        <div className="mt-3 rounded-md border border-border-strong bg-surface px-3 py-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[13px] font-medium text-foreground">
              {hovered.name}
            </span>
            <span className="font-mono text-[10px] text-muted-2">
              {laneShortLabelFor(hovered.timeline_lane)}
            </span>
          </div>
          <div className="mt-1 font-mono text-[10px] text-muted">
            horizon {Math.round(hovered.horizon_pct)}, conf{" "}
            {Math.round(hovered.confidence_pct)}
            {sloanOn && hovered.constraint_note && (
              <span className="block mt-1 text-warning">
                {hovered.constraint_note}
              </span>
            )}
          </div>
          <p className="mt-1 text-[11px] leading-snug text-foreground">
            {hovered.primary_reason}
          </p>
        </div>
      )}
      {!hovered && (
        <p className="mt-3 text-[11px] leading-snug text-muted-2">
          Tap a dot for the candidate&apos;s rationale. Outer ring marks the
          standing call. Color marks the timeline lane.
        </p>
      )}
    </div>
  );
}

function laneFillFor(lane: "win-now" | "balanced" | "future"): string {
  switch (lane) {
    case "win-now":
      return "rgb(var(--color-warning))";
    case "balanced":
      return "rgb(var(--color-foreground))";
    case "future":
      return "rgb(var(--color-success))";
  }
}

function laneShortLabelFor(lane: "win-now" | "balanced" | "future"): string {
  switch (lane) {
    case "win-now":
      return "Win-Now";
    case "balanced":
      return "Balanced";
    case "future":
      return "Future";
  }
}
