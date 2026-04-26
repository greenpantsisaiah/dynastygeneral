/**
 * Dynasty General — Logomark
 * "The Lean" · branching paths converging on one chosen route.
 *
 * Single self-contained React component. No dependencies beyond React.
 * Tailwind-friendly: pass `className` for sizing/positioning.
 *
 * USAGE
 *   import { DynastyGeneralLogo } from "@/components/DynastyGeneralLogo";
 *
 *   // header lockup
 *   <DynastyGeneralLogo className="h-9 w-9 text-amber-500" />
 *
 *   // explicit color (overrides currentColor)
 *   <DynastyGeneralLogo size={32} color="#D4A24C" />
 *
 *   // tweak stroke weight or hide the ghost branch entirely
 *   <DynastyGeneralLogo size={64} stroke={14} ghostOpacity={0.22} />
 *   <DynastyGeneralLogo size={16} ghostOpacity={0} />  // simplified favicon
 *
 * COLOR
 *   Primary: #D4A24C (warm gold from brand brief).
 *   The mark uses `currentColor` by default, so Tailwind text-* classes work:
 *     text-amber-500  ≈  #f59e0b
 *     custom token    text-[#D4A24C]
 *
 * SIZING
 *   - Renders cleanly down to 24px. At 16px favicon, set `ghostOpacity={0}`
 *     and use the simplified variant exported below (DynastyGeneralFavicon).
 *   - Stroke weight scales with size by default. Override via `stroke` prop
 *     (in viewBox units; default 14, range 8–18).
 */

import * as React from "react";

export interface DynastyGeneralLogoProps
  extends Omit<React.SVGProps<SVGSVGElement>, "color" | "stroke"> {
  /** Pixel size (sets both width and height). Default 200. */
  size?: number;
  /** Override fill/stroke color. Defaults to currentColor for Tailwind text-*. */
  color?: string;
  /** Stroke weight in viewBox units. Default 14. Range 8–18. */
  stroke?: number;
  /** Opacity of the ghost (unchosen) branch and option network. Default 0.22. Set 0 to hide. */
  ghostOpacity?: number;
}

export const DynastyGeneralLogo: React.FC<DynastyGeneralLogoProps> = ({
  size = 200,
  color = "currentColor",
  stroke = 14,
  ghostOpacity = 0.22,
  className,
  ...rest
}) => {
  const w = stroke;
  const ghostW = stroke * 0.45;
  const dotR = stroke * 0.42;
  const nodeR = stroke * 0.7;
  const junctionR = stroke * 0.55;

  // Geometry — viewBox 0..200, square.
  const options = [
    { x: 18, y: 36 },
    { x: 18, y: 72 },
    { x: 18, y: 100 },
    { x: 18, y: 128 },
    { x: 18, y: 164 },
  ];
  const jUpper = { x: 52, y: 72 };
  const jLower = { x: 52, y: 128 };
  const fork = { x: 96, y: 100 };
  const ghostEnd = { x: 162, y: 56 };
  const chosenElbow = { x: 144, y: 132 };
  const chosenTip = { x: 188, y: 132 };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Dynasty General"
      className={className}
      {...rest}
    >
      {/* Faint network: option dots → intermediate junctions → fork */}
      {ghostOpacity > 0 && (
        <>
          <g
            fill="none"
            stroke={color}
            strokeWidth={ghostW}
            strokeLinecap="square"
            strokeLinejoin="miter"
            opacity={ghostOpacity}
          >
            <path d={`M ${options[0].x} ${options[0].y} L ${jUpper.x} ${jUpper.y}`} />
            <path d={`M ${options[1].x} ${options[1].y} L ${jUpper.x} ${jUpper.y}`} />
            <path d={`M ${options[3].x} ${options[3].y} L ${jLower.x} ${jLower.y}`} />
            <path d={`M ${options[4].x} ${options[4].y} L ${jLower.x} ${jLower.y}`} />
            <path d={`M ${options[2].x} ${options[2].y} L ${fork.x} ${fork.y}`} />
            <path d={`M ${jUpper.x} ${jUpper.y} L ${fork.x} ${fork.y}`} />
            <path d={`M ${jLower.x} ${jLower.y} L ${fork.x} ${fork.y}`} />
            {/* Ghost branch — the road not taken, with hairline X terminal */}
            <path d={`M ${fork.x} ${fork.y} L ${ghostEnd.x} ${ghostEnd.y}`} />
            <path d={`M ${ghostEnd.x - 6} ${ghostEnd.y - 6} L ${ghostEnd.x + 6} ${ghostEnd.y + 6}`} />
            <path d={`M ${ghostEnd.x - 6} ${ghostEnd.y + 6} L ${ghostEnd.x + 6} ${ghostEnd.y - 6}`} />
          </g>
          <g fill={color} opacity={ghostOpacity * 1.6}>
            {options.map((o, i) => (
              <circle key={i} cx={o.x} cy={o.y} r={dotR} />
            ))}
            <circle cx={jUpper.x} cy={jUpper.y} r={junctionR * 0.7} />
            <circle cx={jLower.x} cy={jLower.y} r={junctionR * 0.7} />
          </g>
        </>
      )}

      {/* The Lean — chosen branch, full weight */}
      <g
        fill="none"
        stroke={color}
        strokeWidth={w}
        strokeLinecap="square"
        strokeLinejoin="miter"
      >
        <path
          d={`M ${fork.x} ${fork.y} L ${chosenElbow.x} ${chosenElbow.y} L ${chosenTip.x - w} ${chosenTip.y}`}
        />
      </g>

      {/* Arrow head */}
      <path
        d={`M ${chosenTip.x - w} ${chosenTip.y - w * 1.1} L ${chosenTip.x + w * 0.6} ${chosenTip.y} L ${chosenTip.x - w} ${chosenTip.y + w * 1.1} Z`}
        fill={color}
      />

      {/* Decision node */}
      <circle cx={fork.x} cy={fork.y} r={nodeR} fill={color} />
    </svg>
  );
};

/**
 * Simplified mark for very small surfaces (16px favicon, dense UI).
 * Drops the network entirely — just the fork node + chosen arrow.
 */
export const DynastyGeneralFavicon: React.FC<DynastyGeneralLogoProps> = (props) => (
  <DynastyGeneralLogo {...props} ghostOpacity={0} />
);

/**
 * Optional: horizontal lockup with the wordmark.
 * Uses your existing font stack — no font import needed.
 */
export const DynastyGeneralLockup: React.FC<{
  className?: string;
  color?: string;
  size?: number;
}> = ({ className, color = "currentColor", size = 36 }) => (
  <div className={`flex items-center gap-2.5 ${className ?? ""}`} style={{ color }}>
    <DynastyGeneralLogo size={size} color={color} />
    <span
      className="font-bold tracking-tight"
      style={{ fontSize: size * 0.5, lineHeight: 1 }}
    >
      Dynasty General
    </span>
  </div>
);

export default DynastyGeneralLogo;
