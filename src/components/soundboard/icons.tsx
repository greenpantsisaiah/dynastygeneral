/**
 * Tactical glyph set for the dial tiles. SVG-only so they scale and
 * recolor cleanly. One symbol per DialIcon. Strokes use currentColor
 * so the parent can theme them via text color.
 */

import type { DialIcon } from "@/lib/soundboard/types";

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
    case "position":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.5}>
          <rect x="3" y="6" width="18" height="12" rx="1" />
          <path d="M12 6 V18" />
          <circle cx="12" cy="12" r="2" />
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
    case "consensus":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.5}>
          <circle cx="8" cy="9" r="3" />
          <circle cx="16" cy="9" r="3" />
          <path d="M3 20 C3 16 6 14 8 14 C10 14 11 15 12 16 C13 15 14 14 16 14 C18 14 21 16 21 20" />
        </svg>
      );
    case "anchor":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.5}>
          <circle cx="12" cy="6" r="2" />
          <path d="M12 8 V20" />
          <path d="M5 14 C5 18 8 21 12 21 C16 21 19 18 19 14" />
          <path d="M9 12 H15" />
        </svg>
      );
    case "variance":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path d="M3 18 L8 8 L12 14 L16 6 L21 18" />
        </svg>
      );
    case "voice":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.5}>
          <rect x="9" y="3" width="6" height="12" rx="3" />
          <path d="M5 11 C5 15 8 18 12 18 C16 18 19 15 19 11" />
          <path d="M12 18 V22" />
        </svg>
      );
    case "underdog":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path d="M12 3 L14 9 H20 L15 13 L17 19 L12 15 L7 19 L9 13 L4 9 H10 Z" />
        </svg>
      );
    case "stack":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.5}>
          <rect x="4" y="4" width="16" height="4" rx="1" />
          <rect x="4" y="10" width="16" height="4" rx="1" />
          <rect x="4" y="16" width="16" height="4" rx="1" />
        </svg>
      );
    case "schedule":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.5}>
          <rect x="4" y="5" width="16" height="16" rx="1" />
          <path d="M4 9 H20" />
          <path d="M9 3 V7 M15 3 V7" />
        </svg>
      );
    case "pulse":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path d="M3 12 H7 L9 6 L12 18 L15 9 L17 12 H21" />
        </svg>
      );
    case "depth":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.5}>
          <circle cx="6" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="18" cy="12" r="2" />
          <path d="M8 12 H10 M14 12 H16" />
        </svg>
      );
    case "doctrine":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path d="M12 3 L20 7 V12 C20 17 16 20 12 21 C8 20 4 17 4 12 V7 Z" />
          <path d="M9 12 L11 14 L15 10" />
        </svg>
      );
  }
}
