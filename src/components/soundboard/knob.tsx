"use client";

/**
 * Tactical knob: SVG visualizer for a linear -100..+100 dial. Looks
 * like serious equipment. The control underneath is a thin native
 * range so we keep keyboard + mobile accessibility; the knob is the
 * art layer.
 *
 * - 32-segment arc, ~270deg sweep with a gap at the bottom.
 * - Segments fill in from center as the value moves; only segments
 *   between center and current value light up.
 * - Inner illuminated tick rotates with value (-135deg at -100,
 *   +135deg at +100, 0deg at 0).
 * - Color band shifts from cool (left) to warm (right).
 * - Glow ring on the whole component when value !== 0.
 *
 * Pointerdown anywhere on the arc snaps the value to that position.
 * The thin slider beneath is the canonical control for keyboard / a11y.
 */

import { useId, useRef } from "react";

const SEGMENTS = 32;
// The arc covers 270deg total, 135deg either side of straight-up.
// Gap at the bottom (90deg gap centered on south = 270deg of north).
const MAX_ANGLE_DEG = 135;

export function Knob({
  value,
  onChange,
  size = 96,
  ariaLabel,
}: {
  value: number;
  onChange: (v: number) => void;
  size?: number;
  ariaLabel?: string;
}) {
  const sliderId = useId();
  const ref = useRef<SVGSVGElement | null>(null);
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 6;
  const innerR = radius - 12;

  const clamped = Math.max(-100, Math.min(100, value));
  const tickAngle = (clamped / 100) * MAX_ANGLE_DEG;
  const isMoved = clamped !== 0;

  const segments: { startDeg: number; endDeg: number; lit: boolean; warm: boolean }[] = [];
  const fullSweep = MAX_ANGLE_DEG * 2;
  const segArc = fullSweep / SEGMENTS;
  for (let i = 0; i < SEGMENTS; i++) {
    const startDeg = -MAX_ANGLE_DEG + i * segArc;
    const endDeg = startDeg + segArc * 0.7;
    const segCenter = (startDeg + endDeg) / 2;
    const segValue = (segCenter / MAX_ANGLE_DEG) * 100;
    let lit = false;
    if (clamped > 0) lit = segValue > 0 && segValue <= clamped + segArc * 0.3;
    else if (clamped < 0) lit = segValue < 0 && segValue >= clamped - segArc * 0.3;
    segments.push({
      startDeg,
      endDeg,
      lit,
      warm: segCenter > 0,
    });
  }

  function pointToValue(clientX: number, clientY: number) {
    const svg = ref.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const dx = clientX - (rect.left + rect.width / 2);
    const dy = clientY - (rect.top + rect.height / 2);
    // atan2 returns radians from +X axis CCW; convert so 0 = up,
    // positive = right. atan2(dx, -dy) does that.
    const rad = Math.atan2(dx, -dy);
    const deg = (rad * 180) / Math.PI;
    const clampedDeg = Math.max(-MAX_ANGLE_DEG, Math.min(MAX_ANGLE_DEG, deg));
    const v = Math.round((clampedDeg / MAX_ANGLE_DEG) * 100);
    onChange(v);
  }

  return (
    <div className="relative flex flex-col items-center">
      <svg
        ref={ref}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={ariaLabel}
        className={`select-none touch-none transition-[filter] duration-200 ${
          isMoved ? "drop-shadow-[0_0_10px_rgba(255,180,80,0.35)]" : ""
        }`}
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture?.(e.pointerId);
          pointToValue(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (e.buttons !== 1) return;
          pointToValue(e.clientX, e.clientY);
        }}
      >
        {/* Outer dim ring */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="rgb(40 38 34)"
          strokeWidth={1}
        />

        {/* Segmented arc */}
        {segments.map((s, i) => {
          const startRad = ((s.startDeg - 90) * Math.PI) / 180;
          const endRad = ((s.endDeg - 90) * Math.PI) / 180;
          const x1 = cx + radius * Math.cos(startRad);
          const y1 = cy + radius * Math.sin(startRad);
          const x2 = cx + (radius - 6) * Math.cos(startRad);
          const y2 = cy + (radius - 6) * Math.sin(startRad);
          const x3 = cx + (radius - 6) * Math.cos(endRad);
          const y3 = cy + (radius - 6) * Math.sin(endRad);
          const x4 = cx + radius * Math.cos(endRad);
          const y4 = cy + radius * Math.sin(endRad);
          const lit = s.lit;
          let color = "rgb(50 47 42)";
          if (lit && s.warm) color = "rgb(255 175 70)";
          else if (lit && !s.warm) color = "rgb(80 170 220)";
          return (
            <path
              key={i}
              d={`M ${x1} ${y1} L ${x2} ${y2} L ${x3} ${y3} L ${x4} ${y4} Z`}
              fill={color}
            />
          );
        })}

        {/* Inner disc */}
        <circle
          cx={cx}
          cy={cy}
          r={innerR}
          fill="rgb(20 18 14)"
          stroke="rgb(60 55 48)"
          strokeWidth={1}
        />

        {/* Tick mark */}
        <g transform={`rotate(${tickAngle} ${cx} ${cy})`}>
          <line
            x1={cx}
            y1={cy - innerR + 4}
            x2={cx}
            y2={cy - innerR + 14}
            stroke={
              isMoved
                ? clamped > 0
                  ? "rgb(255 175 70)"
                  : "rgb(80 170 220)"
                : "rgb(180 170 150)"
            }
            strokeWidth={2.5}
            strokeLinecap="round"
          />
        </g>

        {/* Center dot */}
        <circle
          cx={cx}
          cy={cy}
          r={2.5}
          fill="rgb(120 110 95)"
        />
      </svg>

      <input
        id={sliderId}
        type="range"
        min={-100}
        max={100}
        step={5}
        value={clamped}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={ariaLabel}
        className="mt-2 h-1 w-full appearance-none bg-[rgb(40,38,34)] accent-accent rounded-full cursor-pointer"
      />
    </div>
  );
}
