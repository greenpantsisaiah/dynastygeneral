"use client";

/**
 * 2D league spectrum:
 *   X axis = strategic lean (punted ← rebuild ← balanced → win-now)
 *   Y axis = expected value (low roster value at bottom, loaded at top)
 *
 * Each team is one labeled dot. Within an X-bucket, dots stack
 * vertically by EV; if multiple teams share similar EV we slightly
 * jitter X within the column so they don't overlap.
 *
 * Client component so we can hover-to-foreground when dots cluster.
 * On hover: dot grows + halo, name label becomes prominent, dot
 * re-renders LAST so it paints on top of overlapping neighbors. Plus a
 * floating info card with lean / EV% / picks-made / confidence.
 */

import { useState } from "react";
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

type Col = { lean: TeamLean; label: string };
const COLUMNS: Col[] = [
  { lean: "punted_season", label: "Punted" },
  { lean: "win_future", label: "Win future" },
  { lean: "lean_win_future", label: "Lean future" },
  { lean: "balanced", label: "Balanced" },
  { lean: "lean_win_now", label: "Lean win-now" },
  { lean: "win_now", label: "Win now" },
];

const ACCENT = "#f5a524";
const SUCCESS = "#22c55e";
const MUTED = "#9ca3af";
const ME_PURPLE = "#a78bfa";

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
const padL = 64;
const padR = 16;
const padT = 36;
const padB = 28;
const plotW = W - padL - padR;
const plotH = H - padT - padB;
const colW = plotW / COLUMNS.length;
const colCenterX = (i: number) => padL + i * colW + colW / 2;

const colIndex = new Map<TeamLean, number>(
  COLUMNS.map((c, i) => [c.lean, i]),
);

type Placed = {
  item: OpponentCharacterization;
  x: number;
  y: number;
  r: number;
  fill: string;
};

export function LeagueSpectrum({
  items,
}: {
  items: OpponentCharacterization[];
}) {
  const [hoveredRosterId, setHoveredRosterId] = useState<number | null>(null);

  const yForEv = (ev: number | null | undefined) => {
    const e = typeof ev === "number" ? Math.max(0, Math.min(1, ev)) : 0;
    return padT + (1 - e) * plotH;
  };

  // Group by column, then within each column sort by EV desc and apply
  // small horizontal jitter so identical-EV teams don't overlap.
  const placed: Placed[] = [];
  for (const col of COLUMNS) {
    const colItems = items
      .filter((it) => it.lean === col.lean)
      .sort((a, b) => (b.ev ?? 0) - (a.ev ?? 0));
    const n = colItems.length;
    colItems.forEach((it, i) => {
      const offset =
        n > 1 ? ((i - (n - 1) / 2) / Math.max(1, n - 1)) * (colW * 0.35) : 0;
      const cx = colCenterX(colIndex.get(col.lean)!) + offset;
      const cy = yForEv(it.ev);
      const r = 5 + Math.round(it.confidence * 4);
      placed.push({
        item: it,
        x: cx,
        y: cy,
        r,
        fill: fillByLean[it.lean],
      });
    });
  }

  // Render order: hovered dot last so it paints on top of any overlap.
  // The user dot (is_me) goes second-last so it stays prominent.
  const renderOrder = [...placed].sort((a, b) => {
    const aHover = a.item.roster_id === hoveredRosterId ? 2 : 0;
    const bHover = b.item.roster_id === hoveredRosterId ? 2 : 0;
    const aMe = a.item.is_me ? 1 : 0;
    const bMe = b.item.is_me ? 1 : 0;
    return aHover + aMe - (bHover + bMe);
  });

  const hovered = placed.find((p) => p.item.roster_id === hoveredRosterId);

  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-border-strong bg-surface px-3 py-3">
      <div className="flex items-baseline justify-between">
        <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-2">
          League spectrum · strategy × value
        </div>
        <div className="font-mono text-[10px] text-muted-2 opacity-70">
          dot size = confidence · hover for detail
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

        {/* Plotted teams. Hover-aware: hovered dot grows + paints last. */}
        {renderOrder.map(({ item, x, y, r, fill }) => {
          const isHovered = item.roster_id === hoveredRosterId;
          const isMe = !!item.is_me;
          const dotFill = isMe ? ME_PURPLE : fill;
          const baseR = isMe ? r + 2 : r;
          const dotR = isHovered ? baseR + 4 : baseR;
          const labelOffsetY = -(dotR + 4);
          // Dim non-hovered labels when something is hovered, so the
          // hovered one reads cleanly.
          const labelOpacity = hoveredRosterId == null
            ? 1
            : isHovered
              ? 1
              : 0.25;
          return (
            <g
              key={item.roster_id}
              onMouseEnter={() => setHoveredRosterId(item.roster_id)}
              onMouseLeave={() =>
                setHoveredRosterId((curr) =>
                  curr === item.roster_id ? null : curr,
                )
              }
              style={{ cursor: "pointer" }}
            >
              {(isMe || isHovered) && (
                <circle
                  cx={x}
                  cy={y}
                  r={dotR + 4}
                  fill="none"
                  stroke={dotFill}
                  strokeOpacity={isHovered ? 0.7 : 0.55}
                  strokeWidth={isHovered ? 2 : 1.5}
                />
              )}
              <circle
                cx={x}
                cy={y}
                r={dotR}
                fill={dotFill}
                fillOpacity={
                  isHovered ? 0.95 : isMe ? 0.85 : 0.2 + item.confidence * 0.5
                }
                stroke={dotFill}
                strokeWidth={isHovered ? 2 : isMe ? 2 : 1.5}
              />
              <text
                x={x}
                y={y + labelOffsetY}
                textAnchor="middle"
                className={isMe ? "fill-current" : "fill-current text-foreground"}
                style={isMe ? { fill: ME_PURPLE } : undefined}
                opacity={labelOpacity}
                fontSize={isHovered ? 12 : isMe ? 11 : 10}
                fontWeight={isHovered || isMe ? 700 : 400}
                fontFamily="var(--font-sans, sans-serif)"
              >
                {isMe ? `${item.owner_name} (you)` : item.owner_name}
              </text>
              <title>
                {`${item.owner_name}${isMe ? " (you)" : ""} · ${LEAN_LABEL[item.lean]} · ${Math.round(item.confidence * 100)}% confidence · ${item.picks_made} picks · ${item.ev != null ? `EV ${Math.round(item.ev * 100)}/100` : "EV unknown"}`}
              </title>
            </g>
          );
        })}

        {/* Floating info card for the hovered team. Anchored to the
            top-right of the dot when there's room; flips left when
            near the right edge. Painted in SVG so it sits inside the
            chart frame without absolute-position math. */}
        {hovered &&
          (() => {
            const { x, y, item } = hovered;
            const cardW = 220;
            const cardH = 78;
            const flipX = x + cardW + 14 > padL + plotW;
            const cardX = flipX ? x - cardW - 12 : x + 12;
            const cardY = Math.max(padT + 4, y - cardH / 2);
            const fillStyle =
              item.is_me ? ME_PURPLE : fillByLean[item.lean];
            return (
              <g pointerEvents="none">
                <rect
                  x={cardX}
                  y={cardY}
                  width={cardW}
                  height={cardH}
                  rx={6}
                  ry={6}
                  fill="#0a0a0a"
                  fillOpacity={0.92}
                  stroke={fillStyle}
                  strokeOpacity={0.7}
                  strokeWidth={1.5}
                />
                <text
                  x={cardX + 10}
                  y={cardY + 18}
                  fontSize={12}
                  fontWeight={700}
                  fontFamily="var(--font-sans, sans-serif)"
                  fill={item.is_me ? ME_PURPLE : "#ffffff"}
                >
                  {item.owner_name}
                  {item.is_me ? " (you)" : ""}
                </text>
                <text
                  x={cardX + 10}
                  y={cardY + 34}
                  fontSize={10}
                  fontFamily="var(--font-mono, monospace)"
                  fill={fillStyle}
                >
                  {LEAN_LABEL[item.lean].toUpperCase()}
                </text>
                <text
                  x={cardX + 10}
                  y={cardY + 50}
                  fontSize={10}
                  fontFamily="var(--font-mono, monospace)"
                  fill="#cbd5e1"
                >
                  {`${item.picks_made} picks · ${Math.round(item.confidence * 100)}% conf`}
                </text>
                <text
                  x={cardX + 10}
                  y={cardY + 66}
                  fontSize={10}
                  fontFamily="var(--font-mono, monospace)"
                  fill="#cbd5e1"
                >
                  {item.ev != null
                    ? `EV ${Math.round(item.ev * 100)}/100${item.ev_raw != null ? ` (${Math.round(item.ev_raw)} raw)` : ""}`
                    : "EV unknown"}
                </text>
              </g>
            );
          })()}
      </svg>
    </div>
  );
}
