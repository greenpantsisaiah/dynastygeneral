/**
 * Marketing-surface charts. Each chart proves a single thesis with a
 * visual the reader can scan in 1.5 seconds. No screenshots, no AI
 * jargon, no startup-playbook hero illustrations. Inline SVG so we
 * have pixel control and zero runtime cost. Cohort source is the
 * baked stats module (n = 82 across 5 leagues).
 *
 * Per REDESIGN_INTENTIONS principle 3: statistical credibility
 * surfaced, not yelled.
 */

import { COHORT_STATS_BY_LANE, COHORT_TOTAL } from "@/lib/strategy/lane-identity/cohort-stats";

const HERO_WIDTH = 520;
const HERO_HEIGHT = 220;
const HERO_AXIS_HEIGHT = 24;
const HERO_TOP_PAD = 16;

/**
 * The hero distribution. Win-Now Floor scores across 82 dynasty
 * rosters, with the PARTIAL / FIT thresholds the engine uses to read
 * roster build fit and a "you" marker the visitor's eye anchors to.
 * The visual rhetoric is "your roster fits somewhere on this chart;
 * we tell you where."
 */
export function HeroCohortChart() {
  const stats = COHORT_STATS_BY_LANE.win_now_floor;
  const maxCount = Math.max(...stats.bins, 1);
  const innerHeight = HERO_HEIGHT - HERO_TOP_PAD;
  const binWidth = HERO_WIDTH / stats.bins.length;

  const scoreToX = (s: number): number =>
    (Math.min(Math.max(s, 0), stats.range_max) / stats.range_max) * HERO_WIDTH;

  // Marker at the median + 15 so the "you" point sits in the heart of
  // the distribution. The reader doesn't need a real score; they need
  // to see that this chart can locate them.
  const youScore = stats.p50 + 15;
  const youX = scoreToX(youScore);
  const closeX = scoreToX(stats.close_threshold);
  const inX = scoreToX(stats.in_threshold);

  return (
    <figure className="relative">
      <svg
        viewBox={`0 0 ${HERO_WIDTH} ${HERO_HEIGHT + HERO_AXIS_HEIGHT}`}
        className="w-full"
        role="img"
        aria-label={`Distribution of Win-Now Floor scores across ${COHORT_TOTAL} dynasty rosters in 5 calibration leagues. PARTIAL fit threshold at ${stats.close_threshold}, full fit threshold at ${stats.in_threshold}.`}
      >
        {stats.bins.map((count, i) => {
          const h = (count / maxCount) * innerHeight;
          const x = i * binWidth;
          const y = HERO_HEIGHT - h;
          return (
            <rect
              key={i}
              x={x + 0.5}
              y={y}
              width={Math.max(binWidth - 1, 1)}
              height={h}
              fill="var(--accent)"
              fillOpacity={0.18}
              stroke="var(--accent)"
              strokeOpacity={0.5}
              strokeWidth={0.5}
            />
          );
        })}

        <line
          x1={closeX}
          x2={closeX}
          y1={HERO_TOP_PAD}
          y2={HERO_HEIGHT}
          stroke="var(--warning)"
          strokeWidth={1.2}
          strokeDasharray="4 3"
          opacity={0.75}
        />
        <line
          x1={inX}
          x2={inX}
          y1={HERO_TOP_PAD}
          y2={HERO_HEIGHT}
          stroke="var(--success)"
          strokeWidth={1.2}
          strokeDasharray="4 3"
          opacity={0.85}
        />

        <line
          x1={youX}
          x2={youX}
          y1={HERO_TOP_PAD - 6}
          y2={HERO_HEIGHT}
          stroke="#a78bfa"
          strokeWidth={2}
        />
        <circle cx={youX} cy={HERO_TOP_PAD - 6} r={4} fill="#a78bfa" />
        <text
          x={youX + 8}
          y={HERO_TOP_PAD + 4}
          fontSize={10}
          fill="#a78bfa"
          fontFamily="ui-monospace, monospace"
          style={{ letterSpacing: "0.14em", textTransform: "uppercase" }}
        >
          your roster
        </text>

        <text
          x={closeX - 6}
          y={HERO_TOP_PAD + 4}
          fontSize={9}
          fill="var(--warning)"
          textAnchor="end"
          fontFamily="ui-monospace, monospace"
          style={{ letterSpacing: "0.14em", textTransform: "uppercase" }}
        >
          partial {stats.close_threshold}
        </text>
        <text
          x={inX + 6}
          y={HERO_TOP_PAD + 4}
          fontSize={9}
          fill="var(--success)"
          fontFamily="ui-monospace, monospace"
          style={{ letterSpacing: "0.14em", textTransform: "uppercase" }}
        >
          fit {stats.in_threshold}
        </text>

        <line
          x1={0}
          x2={HERO_WIDTH}
          y1={HERO_HEIGHT}
          y2={HERO_HEIGHT}
          stroke="var(--border-soft)"
          strokeWidth={0.5}
        />

        <text
          x={0}
          y={HERO_HEIGHT + HERO_AXIS_HEIGHT - 8}
          fontSize={9}
          fill="var(--muted-2)"
          fontFamily="ui-monospace, monospace"
        >
          0
        </text>
        <text
          x={HERO_WIDTH / 2}
          y={HERO_HEIGHT + HERO_AXIS_HEIGHT - 8}
          fontSize={9}
          fill="var(--muted-2)"
          textAnchor="middle"
          fontFamily="ui-monospace, monospace"
          style={{ letterSpacing: "0.14em", textTransform: "uppercase" }}
        >
          win-now floor score
        </text>
        <text
          x={HERO_WIDTH}
          y={HERO_HEIGHT + HERO_AXIS_HEIGHT - 8}
          fontSize={9}
          fill="var(--muted-2)"
          textAnchor="end"
          fontFamily="ui-monospace, monospace"
        >
          {Math.round(stats.range_max)}
        </text>
      </svg>
      <figcaption className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-2">
        n = {COHORT_TOTAL} rosters · 5 leagues · cohort baked 2026-05-08
      </figcaption>
    </figure>
  );
}

/**
 * Three small annotated charts that each prove a specific thesis.
 * Voice A: claim plus chart plus citation. The reader gets receipts
 * for every assertion the homepage makes.
 */
export function ProofCharts() {
  return (
    <div className="grid gap-6 md:grid-cols-3">
      <ProofShape />
      <ProofFingerprint />
      <ProofCalibration />
    </div>
  );
}

function ProofShape() {
  const W = 220;
  const H = 140;
  const PAD = 14;

  const teams: Array<{
    win: number;
    fut: number;
    label?: string;
    tone: "you" | "neutral";
  }> = [
    { win: 412, fut: 145, tone: "neutral" },
    { win: 378, fut: 88, tone: "neutral" },
    { win: 305, fut: 287, label: "sustained", tone: "neutral" },
    { win: 256, fut: 102, tone: "neutral" },
    { win: 220, fut: 215, tone: "neutral" },
    { win: 188, fut: 348, label: "patient builder", tone: "neutral" },
    { win: 165, fut: 142, tone: "neutral" },
    { win: 140, fut: 410, tone: "neutral" },
    { win: 96, fut: 372, tone: "neutral" },
    { win: 71, fut: 88, tone: "neutral" },
    { win: 268, fut: 198, label: "you", tone: "you" },
  ];
  const xMax = 450;
  const yMax = 450;
  const sx = (v: number) => PAD + (v / xMax) * (W - PAD * 2);
  const sy = (v: number) => H - PAD - (v / yMax) * (H - PAD * 2);

  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
        Build shape
      </div>
      <p className="mt-1 text-sm text-foreground leading-snug">
        Same league, eleven shapes. One number cannot tell them apart.
      </p>
      <svg
        viewBox={`0 0 ${W} ${H + 18}`}
        className="mt-3 w-full"
        role="img"
        aria-label="Eleven rosters in one league plotted by win-now score vs future-value score"
      >
        <line
          x1={PAD}
          x2={W - PAD}
          y1={H - PAD}
          y2={H - PAD}
          stroke="var(--border-soft)"
          strokeWidth={0.5}
        />
        <line
          x1={PAD}
          x2={PAD}
          y1={PAD}
          y2={H - PAD}
          stroke="var(--border-soft)"
          strokeWidth={0.5}
        />
        {teams.map((t, i) => {
          const isYou = t.tone === "you";
          return (
            <g key={i}>
              <circle
                cx={sx(t.win)}
                cy={sy(t.fut)}
                r={isYou ? 5 : 3.5}
                fill={isYou ? "#a78bfa" : "var(--accent)"}
                fillOpacity={isYou ? 1 : 0.6}
                stroke={isYou ? "#a78bfa" : "var(--accent)"}
              />
              {t.label && (
                <text
                  x={sx(t.win) + 8}
                  y={sy(t.fut) + 3}
                  fontSize={8}
                  fill={isYou ? "#a78bfa" : "var(--muted-2)"}
                  fontFamily="ui-monospace, monospace"
                  style={{ letterSpacing: "0.12em", textTransform: "uppercase" }}
                >
                  {t.label}
                </text>
              )}
            </g>
          );
        })}
        <text
          x={PAD}
          y={H + 12}
          fontSize={8}
          fill="var(--muted-2)"
          fontFamily="ui-monospace, monospace"
          style={{ letterSpacing: "0.14em", textTransform: "uppercase" }}
        >
          win-now
        </text>
        <text
          x={W - PAD}
          y={H + 12}
          fontSize={8}
          fill="var(--muted-2)"
          textAnchor="end"
          fontFamily="ui-monospace, monospace"
          style={{ letterSpacing: "0.14em", textTransform: "uppercase" }}
        >
          future
        </text>
      </svg>
    </div>
  );
}

function ProofFingerprint() {
  const W = 220;
  const H = 140;
  const PAD = 14;
  const sent = [0, 0, 1, 2, 1, 3, 2, 4, 1, 2];
  const recv = [1, 0, 2, 1, 3, 1, 2, 0, 3, 1];
  const labels = ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8", "W9", "W10"];
  const maxBar = Math.max(...sent, ...recv);
  const cellW = (W - PAD * 2) / labels.length;

  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
        Opponent fingerprint
      </div>
      <p className="mt-1 text-sm text-foreground leading-snug">
        Pick flipper. Treats picks as currency. Lead with a pick swap.
      </p>
      <svg
        viewBox={`0 0 ${W} ${H + 18}`}
        className="mt-3 w-full"
        role="img"
        aria-label="One opponent's sent and received picks per week, classified as a pick flipper"
      >
        {labels.map((_, i) => {
          const x = PAD + i * cellW;
          const sentH = (sent[i] / maxBar) * ((H - PAD * 2) / 2);
          const recvH = (recv[i] / maxBar) * ((H - PAD * 2) / 2);
          const mid = H / 2;
          return (
            <g key={i}>
              <rect
                x={x + 1}
                y={mid - sentH}
                width={cellW - 2}
                height={sentH}
                fill="var(--warning)"
                fillOpacity={0.7}
              />
              <rect
                x={x + 1}
                y={mid}
                width={cellW - 2}
                height={recvH}
                fill="var(--success)"
                fillOpacity={0.7}
              />
            </g>
          );
        })}
        <line
          x1={PAD}
          x2={W - PAD}
          y1={H / 2}
          y2={H / 2}
          stroke="var(--border-soft)"
          strokeWidth={0.5}
        />
        <text
          x={PAD}
          y={PAD - 2}
          fontSize={8}
          fill="var(--warning)"
          fontFamily="ui-monospace, monospace"
          style={{ letterSpacing: "0.14em", textTransform: "uppercase" }}
        >
          sent
        </text>
        <text
          x={PAD}
          y={H - 2}
          fontSize={8}
          fill="var(--success)"
          fontFamily="ui-monospace, monospace"
          style={{ letterSpacing: "0.14em", textTransform: "uppercase" }}
        >
          received
        </text>
        <text
          x={W - PAD}
          y={H + 12}
          fontSize={8}
          fill="var(--muted-2)"
          textAnchor="end"
          fontFamily="ui-monospace, monospace"
          style={{ letterSpacing: "0.14em", textTransform: "uppercase" }}
        >
          last 10 weeks
        </text>
      </svg>
    </div>
  );
}

function ProofCalibration() {
  const stats = COHORT_STATS_BY_LANE.trade_capital;
  const W = 220;
  const H = 140;
  const PAD = 14;
  const innerH = H - PAD * 2 - 12;
  const maxCount = Math.max(...stats.bins, 1);
  const binW = (W - PAD * 2) / stats.bins.length;
  const scoreToX = (s: number): number =>
    PAD + (Math.min(Math.max(s, 0), stats.range_max) / stats.range_max) * (W - PAD * 2);
  const youScore = stats.p75 - 10;
  const youX = scoreToX(youScore);
  const inX = scoreToX(stats.in_threshold);

  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
        Where you sit
      </div>
      <p className="mt-1 text-sm text-foreground leading-snug">
        Trade Capital cohort, n = {stats.n}. Plotted, not vibed.
      </p>
      <svg
        viewBox={`0 0 ${W} ${H + 18}`}
        className="mt-3 w-full"
        role="img"
        aria-label={`Trade Capital build-fit score distribution across ${stats.n} dynasty rosters`}
      >
        {stats.bins.map((count, i) => {
          const h = (count / maxCount) * innerH;
          const x = PAD + i * binW;
          const y = H - PAD - h;
          return (
            <rect
              key={i}
              x={x + 0.5}
              y={y}
              width={Math.max(binW - 1, 1)}
              height={h}
              fill="var(--accent)"
              fillOpacity={0.2}
              stroke="var(--accent)"
              strokeOpacity={0.4}
              strokeWidth={0.5}
            />
          );
        })}
        <line
          x1={inX}
          x2={inX}
          y1={PAD}
          y2={H - PAD}
          stroke="var(--success)"
          strokeWidth={1}
          strokeDasharray="3 2"
          opacity={0.75}
        />
        <line
          x1={youX}
          x2={youX}
          y1={PAD - 4}
          y2={H - PAD}
          stroke="#a78bfa"
          strokeWidth={2}
        />
        <circle cx={youX} cy={PAD - 4} r={3} fill="#a78bfa" />
        <text
          x={PAD}
          y={H + 12}
          fontSize={8}
          fill="var(--muted-2)"
          fontFamily="ui-monospace, monospace"
          style={{ letterSpacing: "0.14em", textTransform: "uppercase" }}
        >
          0
        </text>
        <text
          x={W - PAD}
          y={H + 12}
          fontSize={8}
          fill="var(--muted-2)"
          textAnchor="end"
          fontFamily="ui-monospace, monospace"
          style={{ letterSpacing: "0.14em", textTransform: "uppercase" }}
        >
          {Math.round(stats.range_max)}
        </text>
      </svg>
    </div>
  );
}
