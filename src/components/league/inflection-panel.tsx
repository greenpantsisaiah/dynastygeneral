/**
 * Inflection Bifurcation Panel. Surfaces the bimodal-outcome
 * framework on the league hub: roster players in aging cliff,
 * rookie debut, or post-major-injury return windows get a Story A
 * vs Story B presentation with signal scorecard and named historical
 * comparators.
 *
 * The mass-market thesis: most fantasy users don't watch enough
 * football to read these inflection signals themselves; the engine
 * does it for them. Per founder direction: this is the calibration
 * intelligence the product is built around. Visible everywhere it
 * fires.
 *
 * Per founder direction (2026-05-07): UI redesign is its own focused
 * phase. v1 is restrained, clearly labeled prototype.
 */

import type { InflectionContext } from "@/lib/engine/inflection";

export function InflectionPanel({ items }: { items: InflectionContext[] }) {
  if (items.length === 0) return null;

  // Flatten: each player can be in multiple windows. One row per
  // (player, window) so each gets its own bifurcation card.
  const rows = items.flatMap((ctx) =>
    ctx.resolutions.map((r) => ({
      player_id: ctx.player_id,
      player_name: ctx.player_name,
      position: ctx.position,
      resolution: r,
    })),
  );

  return (
    <section
      className="mt-6 overflow-hidden rounded-lg border border-border-soft bg-surface"
      aria-label="Inflection bifurcation panel"
    >
      <div className="flex items-baseline justify-between border-b border-border-soft px-5 py-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
          Inflection windows on your roster
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-2">
          {rows.length} {rows.length === 1 ? "alert" : "alerts"} · v1 prototype
        </span>
      </div>

      <div className="px-5 py-3 text-xs text-muted">
        Players below are in high-variance moments where the outcome distribution
        is bimodal. Single-point predictions are misleading here. Read the scorecard
        and decide which story matches THIS player.
      </div>

      <ul>
        {rows.map((row, idx) => {
          const r = row.resolution;
          const lean = r.p_story_a >= r.p_story_b ? "a" : "b";
          const leanLabel = lean === "a" ? r.story_a_label : r.story_b_label;
          const leanPct = Math.round(Math.max(r.p_story_a, r.p_story_b) * 100);
          const offPct = Math.round(Math.min(r.p_story_a, r.p_story_b) * 100);
          const offLabel = lean === "a" ? r.story_b_label : r.story_a_label;
          const aComps = r.comparators.filter((c) => c.story === "a").slice(0, 2);
          const bComps = r.comparators.filter((c) => c.story === "b").slice(0, 2);
          return (
            <li
              key={`${row.player_id}-${r.window}-${idx}`}
              className="border-t border-border-soft px-5 py-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-semibold text-foreground">
                    {row.player_name}
                  </span>
                  <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-2">
                    {row.position} · {r.window.replace(/_/g, " ")}
                  </span>
                </div>
                <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-2">
                  {r.confidence_summary.text}
                </span>
              </div>

              {/* Bifurcation bar */}
              <div className="mt-3 flex gap-1 text-[10px]">
                <div
                  className="flex h-7 items-center justify-center rounded-sm bg-success/20 font-mono uppercase tracking-[0.14em] text-success"
                  style={{ flex: r.p_story_a }}
                >
                  {Math.round(r.p_story_a * 100)}% {r.story_a_label}
                </div>
                <div
                  className="flex h-7 items-center justify-center rounded-sm bg-danger/20 font-mono uppercase tracking-[0.14em] text-danger"
                  style={{ flex: r.p_story_b }}
                >
                  {Math.round(r.p_story_b * 100)}% {r.story_b_label}
                </div>
              </div>

              <div className="mt-3 text-xs leading-snug text-foreground">
                Model leans <strong>{leanLabel}</strong> ({leanPct}%). Story
                you'd be betting against: {offLabel} ({offPct}%).
              </div>

              {/* Honest framing: when the split rests on the prior more
                  than on live signals, say so plainly so the percentages
                  don't read as evidence-backed. */}
              {r.confidence_summary.calibration_note ? (
                <div
                  className={`mt-2 rounded-sm border px-2 py-1 text-[11px] leading-snug ${
                    r.confidence_summary.evidence_basis === "prior_driven"
                      ? "border-warning/40 bg-warning/10 text-warning"
                      : "border-border-soft bg-surface-2 text-muted"
                  }`}
                >
                  {r.confidence_summary.calibration_note}
                </div>
              ) : null}

              {/* Scorecard */}
              <div className="mt-3">
                <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-2">
                  Signal scorecard
                </div>
                <ul className="mt-1 space-y-1">
                  {r.signals.map((s, i) => {
                    // A missing-data row has no verdict for THIS player, so
                    // the badge IS the status. Showing the intrinsic trust
                    // tier ([VALIDATED] / [PARTIAL]) next to "data missing"
                    // reads as a self-contradiction; collapse to one
                    // [data missing] badge and drop the redundant arrow.
                    // Live rows keep their tier badge + direction arrow.
                    const isMissing = s.direction === "data_missing";
                    let arrow: string | null;
                    let arrowColor = "";
                    if (s.direction === "story_a") {
                      arrow = "→ A";
                      arrowColor = "text-success";
                    } else if (s.direction === "story_b") {
                      arrow = "→ B";
                      arrowColor = "text-danger";
                    } else if (s.direction === "neutral") {
                      arrow = "neutral";
                      arrowColor = "text-muted-2";
                    } else {
                      arrow = null;
                    }
                    const confidenceColor =
                      s.confidence === "validated"
                        ? "text-foreground"
                        : s.confidence === "partial"
                          ? "text-muted"
                          : "text-muted-2";
                    return (
                      <li
                        key={i}
                        className={`text-xs leading-snug ${isMissing ? "opacity-70" : ""}`}
                      >
                        <span
                          className={`font-mono text-[9px] uppercase tracking-[0.16em] ${
                            isMissing ? "text-muted-2" : confidenceColor
                          }`}
                        >
                          [{isMissing ? "data missing" : s.confidence}]
                        </span>{" "}
                        <span className="font-medium text-foreground">{s.name}</span>
                        {arrow ? (
                          <>
                            {" "}
                            <span
                              className={`font-mono text-[9px] uppercase tracking-[0.16em] ${arrowColor}`}
                            >
                              {arrow}
                            </span>
                          </>
                        ) : null}
                        {s.observation ? (
                          <span className="text-muted">: {s.observation}</span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>

              {/* Comparators */}
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-success">
                    {r.story_a_label}
                  </div>
                  <ul className="mt-1 space-y-0.5 text-muted">
                    {aComps.map((c, i) => (
                      <li key={i}>
                        <span className="text-foreground">
                          {c.player}
                          {c.year != null ? ` ${c.year}` : ""}
                        </span>
                        : {c.outcome_summary}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-danger">
                    {r.story_b_label}
                  </div>
                  <ul className="mt-1 space-y-0.5 text-muted">
                    {bComps.map((c, i) => (
                      <li key={i}>
                        <span className="text-foreground">
                          {c.player}
                          {c.year != null ? ` ${c.year}` : ""}
                        </span>
                        : {c.outcome_summary}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
