/**
 * Decision Quadrant. SVG scatter plot of the synthesized candidate
 * pool. Each dot is a candidate at (horizon_pct, confidence_pct):
 *
 *   X axis: -100 (left, pure win-now) to +100 (right, pure future).
 *           Computed RELATIVE to the candidate pool's median age and
 *           spread so the chart re-calibrates as the draft progresses.
 *   Y axis: 0 (bottom, low confidence) to 100 (top, high confidence).
 *           The lean is the highest-confidence dot.
 *
 * Reading: "I want to lean future" picks the dot in the top-right
 * quadrant; "win-now strong" picks the top-left.
 *
 * Server component. To keep the chart scannable with 10+ dots in tight
 * clusters, names are NOT printed on each dot (they'd overlap). The
 * lean's name + halo are on the chart; everyone else gets a small
 * "POS, age" tag in their position color. A numbered legend below
 * the chart lists every dot with its full info, ordered by confidence.
 */

import type { DecisionQuadrantCandidate } from "@/lib/strategy/decision-synthesis/types";

const W = 480;
const H = 360;
const PAD_LEFT = 56;
const PAD_RIGHT = 16;
const PAD_TOP = 24;
const PAD_BOTTOM = 36;
const PLOT_W = W - PAD_LEFT - PAD_RIGHT;
const PLOT_H = H - PAD_TOP - PAD_BOTTOM;

// Position color palette. Picked for legibility on the dark surface.
const POSITION_COLOR: Record<string, string> = {
  QB: "#f5a524", // accent (matches lean halo when QB)
  RB: "#7dd3fc", // sky blue
  WR: "#86efac", // mint green
  TE: "#c4b5fd", // soft purple
  K: "#94a3b8",
  DST: "#94a3b8",
};
const FALLBACK_COLOR = "#94a3b8";

function colorForPosition(pos: string | null): string {
  if (!pos) return FALLBACK_COLOR;
  return POSITION_COLOR[pos.toUpperCase()] ?? FALLBACK_COLOR;
}

// Map a -100..+100 horizon to an SVG x coord.
function xFor(h: number): number {
  const clamped = Math.max(-100, Math.min(100, h));
  return PAD_LEFT + ((clamped + 100) / 200) * PLOT_W;
}
// Map a 0..100 confidence to an SVG y coord (inverted since SVG y goes down).
function yFor(c: number): number {
  const clamped = Math.max(0, Math.min(100, c));
  return PAD_TOP + (1 - clamped / 100) * PLOT_H;
}

// Dot radius scales gently with confidence so the lean visually pops.
// Larger range than v1 (was 4-9) so the legend number inside the dot
// is comfortably readable without forcing the user back to the legend.
function rFor(c: number): number {
  return 8 + (c / 100) * 5;
}

// Pull a compact surname for on-chart labeling. Just the last token:
//   "J.J. McCarthy" → "McCarthy"
//   "Patrick Mahomes" → "Mahomes"
//   "Amon-Ra St. Brown" → "Brown"
//   single-name fallback: the whole name
function surnameOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1];
}

// Approximate width of the rendered label in SVG units. Used by the
// collision-resolution pass below to detect overlaps without measuring
// real text. ~5.4 px per char at fontSize 10 is close enough.
function approxLabelWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.55;
}

// Layout constants for label placement.
const LABEL_FONT = 10;
const LABEL_FONT_LEAN = 12;
const LABEL_GAP = 6; // px between dot edge and label
const LABEL_HEIGHT = 14; // approximate vertical footprint per label

type PlacedLabel = {
  candidateId: string;
  // Final on-screen position of the FIRST char of the label (or the
  // last char if anchor=end). y is the baseline.
  x: number;
  y: number;
  text: string;
  anchor: "start" | "end";
  fontSize: number;
  fill: string;
  fontWeight: number;
  // Bounding box used by the collision pass.
  bbox: { x0: number; x1: number; y0: number; y1: number };
};

// Greedy collision resolution. Iterates labels (highest confidence
// first, lean already pinned), and when one's bbox overlaps a
// previously-placed label, nudges it vertically (down then up) by
// LABEL_HEIGHT until clear or until 4 attempts exhausted (then
// accepts the overlap).
function resolveCollisions(labels: PlacedLabel[]): PlacedLabel[] {
  const placed: PlacedLabel[] = [];
  for (const lab of labels) {
    let attempt = lab;
    let nudges = 0;
    while (
      placed.some(
        (p) =>
          p.bbox.x0 < attempt.bbox.x1 &&
          p.bbox.x1 > attempt.bbox.x0 &&
          p.bbox.y0 < attempt.bbox.y1 &&
          p.bbox.y1 > attempt.bbox.y0,
      ) &&
      nudges < 4
    ) {
      // Alternate down then up; widen each cycle.
      const direction = nudges % 2 === 0 ? 1 : -1;
      const distance = LABEL_HEIGHT * (Math.floor(nudges / 2) + 1);
      attempt = {
        ...attempt,
        y: attempt.y + direction * distance,
        bbox: {
          ...attempt.bbox,
          y0: attempt.bbox.y0 + direction * distance,
          y1: attempt.bbox.y1 + direction * distance,
        },
      };
      nudges += 1;
    }
    placed.push(attempt);
  }
  return placed;
}

export function DecisionQuadrant({
  candidates,
  pickLabel,
}: {
  candidates: DecisionQuadrantCandidate[];
  pickLabel: string;
}) {
  if (candidates.length === 0) return null;

  // Render order: non-lean dots first, lean last (paints on top).
  const renderOrder = [...candidates].sort(
    (a, b) => Number(a.is_lean) - Number(b.is_lean),
  );
  // Legend order: highest confidence first; lean always at #1.
  const legendOrder = [...candidates].sort((a, b) => {
    if (a.is_lean) return -1;
    if (b.is_lean) return 1;
    return b.confidence_pct - a.confidence_pct;
  });
  const lean = candidates.find((c) => c.is_lean);

  return (
    <section className="mt-8 rounded-lg border border-border-soft bg-surface px-5 py-5">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
            Decision Quadrant · {pickLabel}
          </div>
          <p className="mt-1 text-sm text-muted">
            Each candidate plotted by horizon (left = win-now relative
            to who&apos;s left, right = future) and our confidence (top =
            strong call). The lean is the brightest dot.
          </p>
        </div>
        {lean && (
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent">
            Lean: {lean.name}
          </span>
        )}
      </div>

      <div className="mt-4 overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full max-w-[560px] text-foreground"
          role="img"
          aria-label={`Decision quadrant at pick ${pickLabel}`}
        >
          {/* Quadrant background */}
          <rect
            x={PAD_LEFT}
            y={PAD_TOP}
            width={PLOT_W}
            height={PLOT_H}
            fill="var(--color-surface-2, #0f1115)"
            stroke="currentColor"
            strokeOpacity={0.08}
          />

          {/* Confidence gridlines at 25/50/75 */}
          {[25, 50, 75].map((c) => (
            <line
              key={c}
              x1={PAD_LEFT}
              x2={PAD_LEFT + PLOT_W}
              y1={yFor(c)}
              y2={yFor(c)}
              stroke="currentColor"
              strokeOpacity={0.06}
              strokeDasharray="2 4"
            />
          ))}
          {/* Center horizon line (balanced) */}
          <line
            x1={xFor(0)}
            x2={xFor(0)}
            y1={PAD_TOP}
            y2={PAD_TOP + PLOT_H}
            stroke="currentColor"
            strokeOpacity={0.18}
            strokeDasharray="3 3"
          />

          {/* Axis labels */}
          <text
            x={PAD_LEFT - 8}
            y={yFor(50)}
            textAnchor="end"
            fontSize="10"
            fontFamily="var(--font-mono, monospace)"
            fill="currentColor"
            opacity="0.5"
            transform={`rotate(-90 ${PAD_LEFT - 8} ${yFor(50)})`}
          >
            CONFIDENCE
          </text>
          <text
            x={PAD_LEFT}
            y={H - 6}
            fontSize="10"
            fontFamily="var(--font-mono, monospace)"
            fill="currentColor"
            opacity="0.5"
          >
            ← WIN-NOW
          </text>
          <text
            x={PAD_LEFT + PLOT_W}
            y={H - 6}
            textAnchor="end"
            fontSize="10"
            fontFamily="var(--font-mono, monospace)"
            fill="currentColor"
            opacity="0.5"
          >
            FUTURE →
          </text>
          <text
            x={xFor(0)}
            y={PAD_TOP - 8}
            textAnchor="middle"
            fontSize="9"
            fontFamily="var(--font-mono, monospace)"
            fill="currentColor"
            opacity="0.4"
          >
            BALANCED
          </text>

          {/* Candidate dots + on-chart short labels. Each label is
              placed to the right of its dot by default; flipped left
              when the dot is in the right 30% of the plot; vertically
              nudged when it would collide with a higher-confidence
              label. Lean keeps the full name in accent color. */}
          {(() => {
            // Pre-compute label specs in legend order (lean first,
            // then by confidence desc) so the collision pass nudges
            // lower-confidence labels around higher-confidence ones.
            const FLIP_X_THRESHOLD = PAD_LEFT + PLOT_W * 0.7;
            const labelSpecs: PlacedLabel[] = legendOrder.map((c) => {
              const cx = xFor(c.horizon_pct);
              const cy = yFor(c.confidence_pct);
              const r = rFor(c.confidence_pct);
              const text = c.is_lean
                ? c.name
                : `${c.position ?? "?"} · ${surnameOf(c.name)}`;
              const fontSize = c.is_lean ? LABEL_FONT_LEAN : LABEL_FONT;
              const anchor: "start" | "end" =
                cx >= FLIP_X_THRESHOLD ? "end" : "start";
              const labelX = anchor === "start" ? cx + r + LABEL_GAP : cx - r - LABEL_GAP;
              const labelY = cy + 3;
              const w = approxLabelWidth(text, fontSize);
              const bbox =
                anchor === "start"
                  ? {
                      x0: labelX,
                      x1: labelX + w,
                      y0: labelY - LABEL_HEIGHT * 0.7,
                      y1: labelY + LABEL_HEIGHT * 0.3,
                    }
                  : {
                      x0: labelX - w,
                      x1: labelX,
                      y0: labelY - LABEL_HEIGHT * 0.7,
                      y1: labelY + LABEL_HEIGHT * 0.3,
                    };
              return {
                candidateId: c.player_id,
                x: labelX,
                y: labelY,
                text,
                anchor,
                fontSize,
                fill: c.is_lean
                  ? "var(--color-accent, #f5a524)"
                  : colorForPosition(c.position),
                fontWeight: c.is_lean ? 600 : 500,
                bbox,
              };
            });
            const positionedLabels = resolveCollisions(labelSpecs);
            const labelById = new Map(
              positionedLabels.map((p) => [p.candidateId, p]),
            );
            // Now render dots in renderOrder so lean paints on top.
            return renderOrder.map((c) => {
              const cx = xFor(c.horizon_pct);
              const cy = yFor(c.confidence_pct);
              const r = rFor(c.confidence_pct);
              const dotColor = c.is_lean
                ? "var(--color-accent, #f5a524)"
                : colorForPosition(c.position);
              const opacity = c.is_lean ? 1 : 0.9;
              const legendIdx = legendOrder.findIndex(
                (l) => l.player_id === c.player_id,
              );
              const lab = labelById.get(c.player_id);
              const tooltip = `${c.name} · ${c.position ?? "?"}${c.team ? `-${c.team}` : ""}${c.age != null ? `, age ${c.age}` : ""}${c.adp != null ? ` · ADP ${Math.round(c.adp)}` : ""} · ${c.primary_reason}`;
              return (
                <g key={c.player_id}>
                  <title>{tooltip}</title>
                  {c.is_lean && (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={r + 5}
                      fill="none"
                      stroke="var(--color-accent, #f5a524)"
                      strokeOpacity={0.5}
                      strokeWidth={1.5}
                    />
                  )}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill={dotColor}
                    fillOpacity={opacity}
                    stroke={
                      c.is_lean ? "var(--color-accent, #f5a524)" : dotColor
                    }
                    strokeOpacity={c.is_lean ? 1 : 0.6}
                    strokeWidth={c.is_lean ? 1.5 : 1}
                  />
                  {/* Number inside the dot ties to the legend. */}
                  <text
                    x={cx}
                    y={cy + 3}
                    textAnchor="middle"
                    fontSize={10}
                    fontFamily="var(--font-mono, monospace)"
                    fill="#0a0a0a"
                    fontWeight={700}
                    pointerEvents="none"
                  >
                    {legendIdx + 1}
                  </text>
                  {/* Short on-chart label. Lean shows full name; others
                      show "POS · Surname" in the position color. */}
                  {lab && (
                    <text
                      x={lab.x}
                      y={lab.y}
                      textAnchor={lab.anchor}
                      fontSize={lab.fontSize}
                      fill={lab.fill}
                      fontWeight={lab.fontWeight}
                      pointerEvents="none"
                    >
                      {lab.text}
                    </text>
                  )}
                </g>
              );
            });
          })()}
        </svg>
      </div>

      {/* Legend: numbered list ordered by confidence. Each row has a
          colored swatch matching the dot, the player's number, name,
          position+age, and the synthesizer's reason. */}
      <div className="mt-4 border-t border-border-soft pt-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
          Legend · ranked by confidence
        </div>
        <ol className="mt-2 space-y-1.5">
          {legendOrder.map((c, i) => {
            const dotColor = c.is_lean
              ? "var(--color-accent, #f5a524)"
              : colorForPosition(c.position);
            return (
              <li
                key={c.player_id}
                className="flex items-baseline gap-2 text-sm"
              >
                <span
                  className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full font-mono text-[9px] font-semibold"
                  style={{
                    backgroundColor: dotColor,
                    color: "#0a0a0a",
                  }}
                  aria-hidden
                >
                  {i + 1}
                </span>
                <span className="flex-1">
                  <span
                    className={`font-medium ${
                      c.is_lean ? "text-accent" : "text-foreground"
                    }`}
                  >
                    {c.name}
                    {c.is_lean && (
                      <span className="ml-1.5 font-mono text-[9px] uppercase tracking-[0.14em]">
                        my lean
                      </span>
                    )}
                  </span>
                  <span className="text-muted-2">
                    {" "}
                    · {c.position}
                    {c.team ? `-${c.team}` : ""}
                    {c.age != null ? `, age ${c.age}` : ""}
                    {c.adp != null ? ` · ADP ${Math.round(c.adp)}` : ""}
                  </span>
                  <div className="text-xs text-muted leading-snug">
                    {c.primary_reason}
                  </div>
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-muted sm:grid-cols-4">
        <ReadingHint
          quadrant="Top-left"
          desc="Win-now, high confidence. Take if you're chasing this year."
        />
        <ReadingHint
          quadrant="Top-right"
          desc="Future, high confidence. Take if you're building."
        />
        <ReadingHint
          quadrant="Bottom-left"
          desc="Win-now, lower confidence. Real risk."
        />
        <ReadingHint
          quadrant="Bottom-right"
          desc="Future, lower confidence. Speculation."
        />
      </div>
    </section>
  );
}

function ReadingHint({ quadrant, desc }: { quadrant: string; desc: string }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
        {quadrant}
      </div>
      <div className="mt-0.5 text-foreground">{desc}</div>
    </div>
  );
}
