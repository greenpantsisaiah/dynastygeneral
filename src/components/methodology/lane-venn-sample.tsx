/**
 * Sample lane-membership Venn. Three overlapping circles representing
 * three of the eleven lane-identity classes. Demonstrates that a
 * roster can be IN multiple lanes simultaneously (the lane vector is
 * multi-attribute, not a single archetype assignment).
 *
 * Per founder feedback 2026-05-14: "The Venn I want to see but may
 * discard after." Built; ready to drop if it doesn't earn its place.
 *
 * The classic Venn shape is necessarily reductive (only 3 lanes
 * visible at a time of the 11 we score). The radar / spider chart is
 * the eventual better treatment for showing all 11 axes; this Venn is
 * the immediate "show how overlap works" surface.
 */

const CIRCLES = [
  {
    label: "Win-Now Floor",
    cx: 180,
    cy: 130,
    r: 90,
    fill: "var(--success)",
    fillOpacity: 0.18,
    stroke: "var(--success)",
    labelX: 100,
    labelY: 70,
  },
  {
    label: "RB Bellcow",
    cx: 280,
    cy: 130,
    r: 90,
    fill: "var(--accent)",
    fillOpacity: 0.18,
    stroke: "var(--accent)",
    labelX: 360,
    labelY: 70,
  },
  {
    label: "WR Anchor",
    cx: 230,
    cy: 215,
    r: 90,
    fill: "#a78bfa",
    fillOpacity: 0.2,
    stroke: "#a78bfa",
    labelX: 230,
    labelY: 320,
  },
];

const INTERSECTION_LABEL = {
  x: 230,
  y: 175,
  primary: "Sustained Contender",
  secondary: "composite fits when all three fit",
};

export function LaneVennSample() {
  return (
    <div className="rounded-lg border border-border-soft bg-surface px-5 py-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
            Build fit · sample
          </div>
          <p className="mt-1 text-sm text-muted">
            One roster scored across three of the eleven builds.
            Builds overlap by design: a roster that fits Win-Now
            Floor AND RB Bellcow AND WR Anchor also fits the
            composite Sustained Contender build.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1fr]">
        <div>
          <svg
            viewBox="0 0 460 360"
            className="w-full"
            role="img"
            aria-label="Venn diagram showing three lane memberships overlapping at the center"
          >
            {CIRCLES.map((c) => (
              <circle
                key={c.label}
                cx={c.cx}
                cy={c.cy}
                r={c.r}
                fill={c.fill}
                fillOpacity={c.fillOpacity}
                stroke={c.stroke}
                strokeWidth={1.2}
              />
            ))}
            {CIRCLES.map((c) => (
              <g key={`label-${c.label}`}>
                <text
                  x={c.labelX}
                  y={c.labelY}
                  fontSize={11}
                  fill={c.stroke}
                  fontFamily="ui-monospace, monospace"
                  textAnchor="middle"
                  style={{
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                  }}
                >
                  {c.label}
                </text>
              </g>
            ))}
            <circle
              cx={INTERSECTION_LABEL.x}
              cy={INTERSECTION_LABEL.y}
              r={3}
              fill="var(--foreground)"
            />
            <text
              x={INTERSECTION_LABEL.x}
              y={INTERSECTION_LABEL.y - 8}
              fontSize={10}
              fill="var(--foreground)"
              fontFamily="ui-monospace, monospace"
              textAnchor="middle"
              style={{ letterSpacing: "0.14em", textTransform: "uppercase" }}
            >
              {INTERSECTION_LABEL.primary}
            </text>
          </svg>
        </div>

        <div className="space-y-3 text-sm leading-snug text-foreground">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-success">
              Win-Now Floor
            </div>
            <p className="mt-1 text-muted">
              Fits when the top-K contributors' value sum exceeds the
              cohort threshold for proven win-now production. Calibrated
              from the 82-roster cohort.
            </p>
          </div>
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
              RB Bellcow
            </div>
            <p className="mt-1 text-muted">
              Fits when the roster's RB room scores above the workhorse
              threshold. Specific to RB and weighted by role tier when
              the signal table fills out.
            </p>
          </div>
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:#a78bfa]">
              WR Anchor
            </div>
            <p className="mt-1 text-muted">
              Fits when the roster's top WR clears the anchor threshold
              (high-value-70+ WR with surrounding production).
            </p>
          </div>
          <div className="border-t border-border-soft pt-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground">
              Composite · Sustained Contender
            </div>
            <p className="mt-1 text-muted">
              Derived from constituent builds. A roster that fits all
              three base builds above mathematically fits Sustained
              Contender. Architecturally distinct from a single-axis
              archetype assignment.
            </p>
          </div>
        </div>
      </div>

      <p className="mt-5 text-xs leading-relaxed text-muted">
        The Venn shows three builds for legibility; the full model
        scores all eleven (Win-Now Floor, Balanced, Future Stock, RB
        Bellcow, WR Anchor, WR Stable, QB Stable, TE-Premium Lock,
        Trade Capital, Sustained Contender, Zero-RB). A roster's full
        identity is a vector across all eleven builds, not a single
        archetype label.
      </p>
    </div>
  );
}
