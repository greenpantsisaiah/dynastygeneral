/**
 * Tactical glyph set for the dial tiles. SVG-only so they scale and
 * recolor cleanly. One symbol per DialIcon. Strokes use currentColor
 * so the parent can theme them via text color.
 *
 * Trimmed 2026-05-13 alongside the 16-to-8 dial cut. The retired icons
 * (position, anchor, variance, voice, underdog, stack, schedule, pulse,
 * depth, doctrine) lived only in dropped dials; pruning keeps the
 * bundle lean.
 */

import type { DialIcon } from "@/lib/lab/dial-types";

export function DialGlyph({
  kind,
  className = "h-4 w-4",
}: {
  kind: DialIcon;
  className?: string;
}) {
  switch (kind) {
    case "horizon":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path d="M2 18 H22" />
          <circle cx="12" cy="14" r="4" />
          <path d="M12 2 V6 M5 6 L7 8 M19 6 L17 8" />
        </svg>
      );
    case "rookie":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path d="M12 4 C9 8 9 11 12 14 C15 11 15 8 12 4 Z" />
          <path d="M12 14 V22" />
          <path d="M8 19 H16" />
        </svg>
      );
    case "age":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.5}>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="5" />
          <circle cx="12" cy="12" r="1" />
        </svg>
      );
    case "bellcow":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.5}>
          <circle cx="12" cy="12" r="6" />
          <path d="M12 6 V3 M12 21 V18 M6 12 H3 M21 12 H18" />
          <circle cx="12" cy="12" r="2" fill="currentColor" />
        </svg>
      );
    case "continuity":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path d="M4 12 H20" />
          <circle cx="6" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="18" cy="12" r="2" />
        </svg>
      );
    case "risk":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.5}>
          <rect x="4" y="4" width="16" height="16" rx="3" />
          <circle cx="9" cy="9" r="1.2" fill="currentColor" />
          <circle cx="15" cy="15" r="1.2" fill="currentColor" />
          <circle cx="15" cy="9" r="1.2" fill="currentColor" />
          <circle cx="9" cy="15" r="1.2" fill="currentColor" />
        </svg>
      );
    case "trade":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path d="M4 8 H17 L14 5" />
          <path d="M20 16 H7 L10 19" />
        </svg>
      );
    case "consensus":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.5}>
          <circle cx="8" cy="9" r="3" />
          <circle cx="16" cy="9" r="3" />
          <path d="M3 20 C3 16 6 14 8 14 C10 14 11 15 12 16 C13 15 14 14 16 14 C18 14 21 16 21 20" />
        </svg>
      );
  }
}
