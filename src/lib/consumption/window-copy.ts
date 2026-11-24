/**
 * Voice A copy for a usage-cap window. Client-safe (no Redis import), so
 * the API routes and the usage meter render the same words.
 */

export type CapWindowName = "day" | "week";

export function capWindowCopy(window: CapWindowName): {
  /** "Daily" | "Weekly" */
  adjective: string;
  /** "today" | "this week" */
  period: string;
  /** Full reset sentence. */
  reset: string;
} {
  return window === "week"
    ? { adjective: "Weekly", period: "this week", reset: "Resets Monday at midnight UTC." }
    : { adjective: "Daily", period: "today", reset: "Resets at midnight UTC." };
}
