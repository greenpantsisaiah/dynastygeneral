/**
 * Opponent characterizations panel. For each opposing team, surface a
 * single-bucket call (win-now / win-future / no clear direction) plus
 * 1-2 supporting observations and a trade implication.
 *
 * The point: don't predict their next pick. Don't infer their intended
 * archetype (which assumes opponent intent + competence). Just describe
 * the team they're actually building, and tell the user how to play it.
 *
 * Confidence grows with picks made. Early in a draft most teams render
 * as "still forming" with low confidence. By R10+ most should bucket.
 */

import type {
  OpponentCharacterization,
  TeamLean,
} from "@/lib/strategy/opponents/characterize";

const LEAN_LABEL: Record<TeamLean, string> = {
  punted_season: "Punted this season",
  win_now: "Win now",
  lean_win_now: "Lean win-now",
  balanced: "Balanced",
  lean_win_future: "Lean win-future",
  win_future: "Win future",
};

const LEAN_TONE: Record<
  TeamLean,
  { border: string; bg: string; chip: string }
> = {
  punted_season: {
    border: "border-2 border-accent/70",
    bg: "bg-accent/10",
    chip: "text-accent",
  },
  win_now: {
    border: "border-success/60",
    bg: "bg-success/5",
    chip: "text-success",
  },
  lean_win_now: {
    border: "border-success/40",
    bg: "bg-success/5",
    chip: "text-success",
  },
  balanced: {
    border: "border-border-soft",
    bg: "bg-surface",
    chip: "text-muted-2",
  },
  lean_win_future: {
    border: "border-accent/40",
    bg: "bg-accent/5",
    chip: "text-accent",
  },
  win_future: {
    border: "border-accent/60",
    bg: "bg-accent/5",
    chip: "text-accent",
  },
};

function confidenceLabel(c: number): string {
  if (c >= 0.75) return "Clear";
  if (c >= 0.5) return "Forming";
  return "Early";
}

export function OpponentCharacterizations({
  items,
}: {
  items: OpponentCharacterization[];
}) {
  if (items.length === 0) return null;

  // Bucket counts for the header summary.
  const counts = items.reduce(
    (acc, it) => {
      acc[it.lean] = (acc[it.lean] ?? 0) + 1;
      return acc;
    },
    {} as Record<TeamLean, number>,
  );

  return (
    <section className="mt-8">
      <div className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
        Opponent characterizations
      </div>
      <p className="mt-1 text-sm text-muted">
        What each team actually IS right now, not what they think they are.
        Drives how you trade with them.
      </p>
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-2">
        {(counts.punted_season ?? 0) > 0 && (
          <span>
            <span className="text-accent">{counts.punted_season}</span> punted
          </span>
        )}
        <span>
          <span className="text-success">
            {(counts.win_now ?? 0) + (counts.lean_win_now ?? 0)}
          </span>{" "}
          win-now lean
        </span>
        <span>{counts.balanced ?? 0} balanced</span>
        <span>
          <span className="text-accent">
            {(counts.win_future ?? 0) + (counts.lean_win_future ?? 0)}
          </span>{" "}
          win-future lean
        </span>
      </div>

      <LeagueSpectrum items={items} />

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {items.map((it) => (
          <CharacterizationCard key={it.roster_id} item={it} />
        ))}
      </div>
    </section>
  );
}

// 2D league spectrum:
//   X axis = strategic lean (punted ← rebuild ← balanced → win-now)
//   Y axis = expected value (low roster value at bottom, loaded at top)
//
// 4 implicit quadrants:
//   top-right    Loaded contender (high EV + win-now lean)
//   bottom-right Overreaching (win-now lean but thin roster)
//   top-left     Stockpiled future (high EV + young roster)
//   bottom-left  Pure rebuild (low EV + young/punted)
//
// Each team is one labeled dot. Within an X-bucket, dots stack
// vertically by EV; if multiple teams share similar EV we slightly
// jitter X within the column so they don't overlap.
function LeagueSpectrum({
  items,
}: {
  items: OpponentCharacterization[];
}) {
  type Col = { lean: TeamLean; label: string };
  const COLUMNS: Col[] = [
    { lean: "punted_season", label: "Punted" },
    { lean: "win_future", label: "Win future" },
    { lean: "lean_win_future", label: "Lean future" },
    { lean: "balanced", label: "Balanced" },
    { lean: "lean_win_now", label: "Lean win-now" },
    { lean: "win_now", label: "Win now" },
  ];
  const colIndex = new Map<TeamLean, number>(
    COLUMNS.map((c, i) => [c.lean, i]),
  );

  const ACCENT = "#f5a524";
  const SUCCESS = "#22c55e";
  const MUTED = "#9ca3af";
  const fillByLean: Record<TeamLean, string> = {
    punted_season: ACCENT,
    win_future: ACCENT,
    lean_win_future: ACCENT,
    balanced: MUTED,
    lean_win_now: SUCCESS,
    win_now: SUCCESS,
  };

  // Layout
  const W = 880;
  const H = 360;
  const padL = 64; // room for Y axis label
  const padR = 16;
  const padT = 36; // room for X column headers
  const padB = 28; // room for X axis label
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const colW = plotW / COLUMNS.length;
  const colCenterX = (i: number) => padL + i * colW + colW / 2;

  // Y mapping: ev=1 → top, ev=0 → bottom. Items without ev render at
  // the bottom (treated as 0).
  const yForEv = (ev: number | null | undefined) => {
    const e = typeof ev === "number" ? Math.max(0, Math.min(1, ev)) : 0;
    return padT + (1 - e) * plotH;
  };

  // Group by column, then within each column sort by EV desc and apply
  // small horizontal jitter so identical-EV teams don't overlap.
  type Placed = {
    item: OpponentCharacterization;
    x: number;
    y: number;
    r: number;
    fill: string;
  };
  const placed: Placed[] = [];
  for (const col of COLUMNS) {
    const colItems = items
      .filter((it) => it.lean === col.lean)
      .sort((a, b) => (b.ev ?? 0) - (a.ev ?? 0));
    const n = colItems.length;
    colItems.forEach((it, i) => {
      // Spread within ±35% of col width when more than 1 team shares
      // the column. Single-team columns stay centered.
      const offset =
        n > 1 ? ((i - (n - 1) / 2) / Math.max(1, n - 1)) * (colW * 0.35) : 0;
      const cx = colCenterX(colIndex.get(col.lean)!) + offset;
      const cy = yForEv(it.ev);
      const r = 5 + Math.round(it.confidence * 4); // 5..9
      placed.push({
        item: it,
        x: cx,
        y: cy,
        r,
        fill: fillByLean[it.lean],
      });
    });
  }

  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-border-strong bg-surface px-3 py-3">
      <div className="flex items-baseline justify-between">
        <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-2">
          League spectrum · strategy × value
        </div>
        <div className="font-mono text-[10px] text-muted-2 opacity-70">
          dot size = confidence
        </div>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-1 w-full"
        role="img"
        aria-label="League spectrum: X axis is strategic lean from rebuild to win-now, Y axis is expected value from low to high"
      >
        {/* Quadrant background tints (subtle) */}
        <rect
          x={padL}
          y={padT}
          width={plotW / 2}
          height={plotH / 2}
          fill={ACCENT}
          fillOpacity={0.04}
        />
        <rect
          x={padL + plotW / 2}
          y={padT}
          width={plotW / 2}
          height={plotH / 2}
          fill={SUCCESS}
          fillOpacity={0.05}
        />

        {/* Quadrant labels (corner whispers) */}
        <text
          x={padL + 6}
          y={padT + 12}
          className="fill-current text-muted-2"
          fontSize={9}
          fontFamily="var(--font-mono, monospace)"
          opacity={0.6}
        >
          STOCKPILED FUTURE
        </text>
        <text
          x={padL + plotW - 6}
          y={padT + 12}
          textAnchor="end"
          className="fill-current text-muted-2"
          fontSize={9}
          fontFamily="var(--font-mono, monospace)"
          opacity={0.6}
        >
          LOADED CONTENDER
        </text>
        <text
          x={padL + 6}
          y={padT + plotH - 4}
          className="fill-current text-muted-2"
          fontSize={9}
          fontFamily="var(--font-mono, monospace)"
          opacity={0.6}
        >
          PURE REBUILD
        </text>
        <text
          x={padL + plotW - 6}
          y={padT + plotH - 4}
          textAnchor="end"
          className="fill-current text-muted-2"
          fontSize={9}
          fontFamily="var(--font-mono, monospace)"
          opacity={0.6}
        >
          OVERREACHING (THIN)
        </text>

        {/* Plot border */}
        <rect
          x={padL}
          y={padT}
          width={plotW}
          height={plotH}
          fill="none"
          stroke="currentColor"
          className="text-border-soft"
          strokeWidth={1}
        />
        {/* Mid-line on Y to separate high/low EV halves */}
        <line
          x1={padL}
          y1={padT + plotH / 2}
          x2={padL + plotW}
          y2={padT + plotH / 2}
          stroke="currentColor"
          className="text-border-soft"
          strokeWidth={0.5}
          strokeDasharray="3 3"
        />

        {/* Y axis label */}
        <text
          x={padL - 12}
          y={padT + plotH / 2}
          textAnchor="middle"
          className="fill-current text-muted-2"
          fontSize={10}
          fontFamily="var(--font-mono, monospace)"
          transform={`rotate(-90 ${padL - 12} ${padT + plotH / 2})`}
        >
          EXPECTED VALUE (LOW → HIGH)
        </text>

        {/* X axis column headers + dividers */}
        {COLUMNS.map((col, ci) => {
          const cx = colCenterX(ci);
          return (
            <g key={col.lean}>
              <text
                x={cx}
                y={padT - 16}
                textAnchor="middle"
                className="fill-current text-muted-2"
                fontSize={10}
                fontFamily="var(--font-mono, monospace)"
              >
                {col.label.toUpperCase()}
              </text>
              {ci > 0 && (
                <line
                  x1={padL + ci * colW}
                  y1={padT}
                  x2={padL + ci * colW}
                  y2={padT + plotH}
                  stroke="currentColor"
                  className="text-border-soft"
                  strokeWidth={0.5}
                  strokeDasharray="2 4"
                />
              )}
            </g>
          );
        })}

        {/* X axis label */}
        <text
          x={padL + plotW / 2}
          y={H - 8}
          textAnchor="middle"
          className="fill-current text-muted-2"
          fontSize={10}
          fontFamily="var(--font-mono, monospace)"
        >
          STRATEGIC LEAN (REBUILD → WIN-NOW)
        </text>

        {/* Plotted teams */}
        {placed.map(({ item, x, y, r, fill }) => {
          const labelOffsetY = -(r + 4);
          return (
            <g key={item.roster_id}>
              <circle
                cx={x}
                cy={y}
                r={r}
                fill={fill}
                fillOpacity={0.2 + item.confidence * 0.5}
                stroke={fill}
                strokeWidth={1.5}
              />
              <text
                x={x}
                y={y + labelOffsetY}
                textAnchor="middle"
                className="fill-current text-foreground"
                fontSize={10}
                fontFamily="var(--font-sans, sans-serif)"
              >
                {item.owner_name}
              </text>
              <title>
                {item.owner_name} · {LEAN_LABEL[item.lean]} ·{" "}
                {Math.round(item.confidence * 100)}% confidence ·{" "}
                {item.picks_made} picks ·{" "}
                {item.ev != null
                  ? `EV ${Math.round(item.ev * 100)}/100`
                  : "EV unknown"}
              </title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function CharacterizationCard({
  item,
}: {
  item: OpponentCharacterization;
}) {
  const tone = LEAN_TONE[item.lean];
  const conf = confidenceLabel(item.confidence);

  return (
    <article className={`rounded-lg border ${tone.border} ${tone.bg} px-4 py-3`}>
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <div className="font-semibold text-foreground">{item.owner_name}</div>
          <div className="font-mono text-[11px] text-muted-2">
            {item.picks_made} picks made
          </div>
        </div>
        <div className="text-right">
          <div
            className={`font-mono text-xs uppercase tracking-[0.16em] ${tone.chip}`}
          >
            {LEAN_LABEL[item.lean]}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
            {conf} · {Math.round(item.confidence * 100)}%
          </div>
        </div>
      </div>

      {item.reasons.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-muted">
          {item.reasons.map((r, i) => (
            <li key={i}>· {r}</li>
          ))}
        </ul>
      )}

      {item.trade_implication && (
        <div className="mt-3 rounded-md border border-border-soft bg-surface-2 px-3 py-2 text-xs text-foreground">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
            How to play them ·{" "}
          </span>
          {item.trade_implication}
        </div>
      )}
    </article>
  );
}
