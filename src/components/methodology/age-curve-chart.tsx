/**
 * Per-position age-curve charts. Renders the engine's empirical peak
 * bands as line + shaded peak region per position. Highlights the
 * 2026-05-12 refits (QB peak widened 23-33; TE peak narrowed 26-30)
 * with annotated band edges.
 *
 * Source: positionAgeMult in src/lib/strategy/lane-identity/lanes.ts.
 * Values baked here for the chart; regenerate when the bands move.
 */

type AgePoint = { age: number; mult: number };

type PositionCurve = {
  position: string;
  peak: [number, number];
  refit_note: string | null;
  points: AgePoint[];
};

function curve(
  position: string,
  peak: [number, number],
  fn: (age: number) => number,
  refit_note: string | null = null,
): PositionCurve {
  const points: AgePoint[] = [];
  for (let age = 20; age <= 36; age++) {
    points.push({ age, mult: fn(age) });
  }
  return { position, peak, refit_note, points };
}

// Mirrors positionAgeMult from lanes.ts; kept literal so this chart
// can compile without importing the lane-identity module.
const CURVES: PositionCurve[] = [
  curve(
    "RB",
    [23, 26],
    (age) => {
      if (age >= 23 && age <= 26) return 1;
      if (age === 27 || age === 28) return 0.8;
      if (age === 29 || age === 30) return 0.5;
      return 0;
    },
  ),
  curve(
    "WR",
    [24, 29],
    (age) => {
      if (age >= 24 && age <= 29) return 1;
      if (age === 23 || age === 30 || age === 31) return 0.85;
      if (age === 32 || age === 33) return 0.55;
      return 0;
    },
  ),
  curve(
    "TE",
    [26, 30],
    (age) => {
      if (age >= 26 && age <= 30) return 1;
      if (age === 24 || age === 25 || age === 31 || age === 32) return 0.85;
      if (age === 23 || age === 33 || age === 34) return 0.55;
      return 0;
    },
    "Narrowed 2026-05-12. Age 25 produced 0.78 of peak in starter cohort, not 1.0.",
  ),
  curve(
    "QB",
    [23, 33],
    (age) => {
      if (age >= 23 && age <= 33) return 1;
      if (age >= 34 && age <= 36) return 0.85;
      if (age === 37 || age === 38) return 0.6;
      return 0;
    },
    "Widened lower bound to 23 on 2026-05-12. Year-1-3 starters (Daniels, Stroud, Caleb shape) post peak-band production.",
  ),
];

const CHART_W = 220;
const CHART_H = 110;
const PAD_X = 14;
const PAD_Y_TOP = 10;
const PAD_Y_BOTTOM = 18;
const AGE_MIN = 20;
const AGE_MAX = 36;

function ageToX(age: number): number {
  return PAD_X + ((age - AGE_MIN) / (AGE_MAX - AGE_MIN)) * (CHART_W - PAD_X * 2);
}

function multToY(mult: number): number {
  const h = CHART_H - PAD_Y_TOP - PAD_Y_BOTTOM;
  return PAD_Y_TOP + (1 - mult) * h;
}

export function AgeCurveChart() {
  return (
    <div className="rounded-lg border border-border-soft bg-surface px-5 py-6">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
        Age curves, per position
      </div>
      <p className="mt-1 text-sm text-muted">
        Peak bands derived from 2022 to 2025 NFL starter production
        cohorts. The shaded region is the calibrated peak; the line is
        the engine's age multiplier from 20 to 36.
      </p>
      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        {CURVES.map((c) => (
          <PositionPanel key={c.position} curve={c} />
        ))}
      </div>
      <p className="mt-5 text-xs leading-relaxed text-muted">
        Curves are refit when validation surfaces show the band edges
        no longer match data. Two refits on 2026-05-12: QB peak
        widened lower to 23 because year-1-3 starters now post
        peak-band production; TE narrowed to 26-30 because age 25
        produces 0.78 of peak rather than 1.0.
      </p>
    </div>
  );
}

function PositionPanel({ curve }: { curve: PositionCurve }) {
  const peakX1 = ageToX(curve.peak[0]);
  const peakX2 = ageToX(curve.peak[1]);
  const pathD = curve.points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${ageToX(p.age).toFixed(1)} ${multToY(p.mult).toFixed(1)}`)
    .join(" ");

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-sm font-semibold text-foreground">
          {curve.position}
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
          peak {curve.peak[0]} to {curve.peak[1]}
        </div>
      </div>
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="mt-2 w-full"
        role="img"
        aria-label={`${curve.position} age curve. Peak ${curve.peak[0]} to ${curve.peak[1]}.`}
      >
        <rect
          x={peakX1}
          y={multToY(1)}
          width={peakX2 - peakX1}
          height={CHART_H - PAD_Y_BOTTOM - multToY(1)}
          fill="var(--accent)"
          fillOpacity={0.1}
        />
        <line
          x1={PAD_X}
          x2={CHART_W - PAD_X}
          y1={CHART_H - PAD_Y_BOTTOM}
          y2={CHART_H - PAD_Y_BOTTOM}
          stroke="var(--border-soft)"
          strokeWidth={0.5}
        />
        <path
          d={pathD}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={1.5}
        />
        {curve.points
          .filter((p) => p.age % 4 === 0 || p.age === AGE_MIN || p.age === AGE_MAX)
          .map((p) => (
            <text
              key={p.age}
              x={ageToX(p.age)}
              y={CHART_H - 4}
              fontSize={8}
              textAnchor="middle"
              fill="var(--muted-2)"
              fontFamily="ui-monospace, monospace"
            >
              {p.age}
            </text>
          ))}
        <text
          x={PAD_X}
          y={multToY(1) - 2}
          fontSize={8}
          fill="var(--muted-2)"
          fontFamily="ui-monospace, monospace"
        >
          1.0
        </text>
        <text
          x={PAD_X}
          y={multToY(0) + 8}
          fontSize={8}
          fill="var(--muted-2)"
          fontFamily="ui-monospace, monospace"
        >
          0
        </text>
      </svg>
      {curve.refit_note && (
        <p className="mt-1 text-[11px] leading-snug text-warning">
          {curve.refit_note}
        </p>
      )}
    </div>
  );
}
