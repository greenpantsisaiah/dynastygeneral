"use client";

/**
 * DashboardSection. The chrome that gives the hub clear info
 * architecture per founder feedback 2026-05-08:
 *
 *   "Let's info-architect the page more like one info-architects
 *    a dashboard: clear sections (like the coach panel is a clear
 *    section), with a little separation. We can dig deeper into
 *    different areas with expandy / collapsy things on the tiles
 *    instead of navigation to different pages."
 *
 * Mirrors the visual identity of the Coach panel: a labeled header
 * band on top of a body that contains rich visual content. Body is
 * collapsible. Each section answers one question; rich visualizations
 * (per-pick EV bars, leaderboard, position diagnostic) live inside
 * the body unchanged.
 */

import { useState, type ReactNode } from "react";

export type DashboardSectionProps = {
  // Small mono uppercase label, accent color (e.g., "How you're doing").
  label: string;
  // Larger title, foreground (e.g., "EV bank, position fits, sharp positioning").
  title: string;
  // Optional one-line tagline below the title (e.g., "Where the model thinks you stand vs the league.").
  tagline?: string;
  defaultOpen?: boolean;
  collapsible?: boolean;
  // When true, the header carries an accent border on the left to
  // signal "this is the most actionable section right now" (e.g.,
  // The Call during an active draft).
  emphasize?: boolean;
  // When true, a small accent dot appears next to the label to
  // indicate the section's underlying data has moved since the
  // user's last visit. Per REDESIGN_INTENTIONS principle 11
  // (stable shape, variable content, visible delta). Renders only
  // when there is actual movement to flag.
  hasChanges?: boolean;
  // Short hover/tap tooltip describing what changed
  // (e.g., "3 new picks, standing call shifted"). Optional.
  changeHint?: string;
  children: ReactNode;
};

export function DashboardSection({
  label,
  title,
  tagline,
  defaultOpen = true,
  collapsible = true,
  emphasize = false,
  hasChanges = false,
  changeHint,
  children,
}: DashboardSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section
      className={`mb-8 ${emphasize ? "border-l-2 border-accent pl-4" : ""}`}
      aria-label={title}
    >
      <header className="flex items-baseline justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div
            className={`flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] ${
              emphasize ? "text-accent" : "text-muted-2"
            }`}
          >
            <span>{label}</span>
            {hasChanges && (
              <span
                className="inline-block h-1.5 w-1.5 rounded-full bg-accent"
                title={changeHint ?? "Updated since your last visit"}
                aria-label={changeHint ?? "Updated since your last visit"}
              />
            )}
          </div>
          <h2 className="mt-1 text-xl font-semibold leading-tight text-foreground">
            {title}
          </h2>
          {tagline && (
            <p className="mt-1 text-[12px] leading-snug text-muted">{tagline}</p>
          )}
        </div>
        {collapsible && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="shrink-0 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2 hover:text-accent transition-colors"
            aria-expanded={open}
          >
            {open ? "Hide" : "Show"}
          </button>
        )}
      </header>
      {open && <div className="space-y-4">{children}</div>}
    </section>
  );
}
